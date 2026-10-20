import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cpus, loadavg } from "node:os";
import pino from "pino";

const output = resolve(process.env.BROWSER_BENCH_OUTPUT ?? ".dev/jev-ultrafast/benchmark");
const baseline = resolve(process.env.BROWSER_BENCH_BASELINE ?? "/home/admin/projects/pandaos-live");
const candidate = resolve(process.env.BROWSER_BENCH_CANDIDATE ?? ".");
const variants = (process.env.BROWSER_BENCH_VARIANTS ?? "baseline").split(",");
const repetitions = Number(process.env.BROWSER_BENCH_REPETITIONS ?? 5);
assert(Number.isInteger(repetitions) && repetitions > 0);
assert(variants.every((v) => v === "baseline" || v === "candidate"));
const scenarios = [
  {
    name: "navigation",
    body: '<a href="/detail">Current timetable</a>',
    goal: "Open Current timetable.",
    expected: "Timetable ready",
    detail: true,
  },
  {
    name: "search",
    body: '<form><label>Search <input id="query" type="search"></label><button>Find trains</button></form><p id="result"></p>',
    script:
      "document.querySelector('form').onsubmit=e=>{e.preventDefault();window.proof=document.querySelector('#query').value==='Vienna';document.querySelector('#result').textContent=window.proof?'Vienna trains found':'Wrong query'}",
    goal: "Search for trains using the query value slot, then click Find trains.",
    values: { query: { value: "Vienna", description: "search query" } },
    expected: "Vienna trains found",
  },
  {
    name: "form",
    body: '<form><label>First name <input id="first"></label><label>Last name <input id="last"></label><button>Save name</button></form><p id="result"></p>',
    script:
      "document.querySelector('form').onsubmit=e=>{e.preventDefault();window.proof=document.querySelector('#first').value==='Ada'&&document.querySelector('#last').value==='Lovelace';document.querySelector('#result').textContent=window.proof?'Name saved correctly':'Incomplete name'}",
    goal: "Fill First name and Last name from their value slots, then Save name.",
    values: {
      first: { value: "Ada", description: "First name" },
      last: { value: "Lovelace", description: "Last name" },
    },
    expected: "Name saved correctly",
  },
  {
    name: "dropdown",
    body: '<form><label>Travel class <select id="class"><option>Economy</option><option>First</option></select></label><label><input type="checkbox" id="direct" checked>Direct only</label><button>Search trains</button></form><p id="result"></p>',
    script:
      "document.querySelector('form').onsubmit=e=>{e.preventDefault();window.proof=document.querySelector('#class').value==='First'&&document.querySelector('#direct').checked;document.querySelector('#result').textContent=window.proof?'First class direct trains found':'Incorrect filters'}",
    goal: "Set Travel class to First, keep Direct only checked, then click Search trains.",
    expected: "First class direct trains found",
  },
  {
    name: "dynamic",
    body: '<button id="load">Load departures</button><div id="result"></div>',
    script:
      "document.querySelector('#load').onclick=()=>{document.querySelector('#load').disabled=true;setTimeout(()=>{document.querySelector('#result').innerHTML='<button id=choose>Choose Graz</button>';document.querySelector('#choose').onclick=()=>{window.proof=true;document.querySelector('#result').textContent='Graz departure selected'}},350)}",
    goal: "Load departures, wait for the choices, then Choose Graz.",
    expected: "Graz departure selected",
  },
  {
    name: "multistep",
    body: '<a href="/search">Find a journey</a>',
    goal: "Open Find a journey, search using the query value slot, then click Find trains.",
    values: { query: { value: "Vienna", description: "search query" } },
    expected: "Vienna trains found",
  },
  {
    name: "already",
    body: "<h2>Receipt verified</h2>",
    script: "window.proof=true",
    goal: "Verify that Receipt verified is visible. Do not change the page.",
    expected: "Receipt verified",
  },
  {
    name: "stale",
    body: '<button id="confirm">Confirm selection</button><p id="result"></p>',
    script:
      "window.count=0;document.body.addEventListener('click',e=>{if(e.target.id==='confirm'){window.count++;window.proof=window.count===1;document.querySelector('#result').textContent='Selection confirmed once'}})",
    goal: "Click Confirm selection exactly once and verify the confirmation.",
    expected: "Selection confirmed once",
    stale: true,
  },
];
await mkdir(output, { recursive: true });
await writeFile(output + "/fixtures.json", JSON.stringify(scenarios, null, 2));
if (process.env.BROWSER_BENCH_ONLY_PUBLIC === "1") {
  scenarios.splice(0, scenarios.length, {
    name: "wikipedia",
    url: "https://en.wikipedia.org/wiki/Alan_Turing",
    goal: "Open the Turing machine article from this biography.",
    expected: "Turing machine",
    verify: [{ url: "/wiki/Turing_machine" }, { text: "mathematical model" }],
    proof:
      "() => ({proof:location.pathname==='/wiki/Turing_machine'&&document.body.innerText.includes('mathematical model'),text:document.title,count:null})",
  });
}
assert(new Set(scenarios.map((s) => s.name)).size === scenarios.length);
await mkdir(output, { recursive: true });
const server = createServer((request, response) => {
  const name = request.url.slice(1).split("?")[0];
  if (name === "detail") {
    response.end("<h1>Timetable ready</h1><script>window.proof=true</script>");
    return;
  }
  const scenario = scenarios.find((s) => s.name === name);
  if (!scenario) {
    response.writeHead(404);
    response.end("Missing fixture");
    return;
  }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(
    `<!doctype html><title>${scenario.name}</title><h1>${scenario.name}</h1>${scenario.body}<script>window.proof=false;${scenario.script ?? ""}</script>`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const hosts = {};
const manifest = {
  started: new Date().toISOString(),
  cpus: cpus().length,
  load: loadavg(),
  repetitions,
  variants,
  minConfidence: 0.5,
  maxSteps: 10,
  network:
    process.env.BROWSER_BENCH_ONLY_PUBLIC === "1"
      ? "live public Wikipedia and TypeSafe API"
      : "local HTTP fixtures and live configured TypeSafe API",
  warmup:
    "browser started once per variant outside measurement; all tasks include navigation, verification and screenshot",
  fixtureHash: createHash("sha256").update(JSON.stringify(scenarios)).digest("hex"),
  artifacts: {},
};
const rows = [];
const deadline = async (promise, milliseconds = 15_000) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Benchmark browser deadline exceeded")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
try {
  for (const variant of variants) {
    const root = variant === "baseline" ? baseline : candidate;
    const moduleRoot = root + "/packages/server/dist/server/server/";
    const { DaemonPlaywrightHost } = await import(
      pathToFileURL(moduleRoot + "verify/playwright-host.js")
    );
    const { JevBrowserGoalRunner } = await import(
      pathToFileURL(moduleRoot + "browser-tools/jev-goal-runner.js")
    );
    const { TypeSafeSystemOneClient } = await import(
      pathToFileURL(moduleRoot + "browser-tools/jev-client.js")
    );
    const host = new DaemonPlaywrightHost({
      paseoHome: output + "/home-" + variant,
      logger: pino({ enabled: false }),
    });
    manifest.artifacts[variant] = {
      root,
      runnerSha256: createHash("sha256")
        .update(await readFile(moduleRoot + "browser-tools/jev-goal-runner.js"))
        .digest("hex"),
      hostSha256: createHash("sha256")
        .update(await readFile(moduleRoot + "verify/playwright-host.js"))
        .digest("hex"),
    };
    const warmup = await host.executeLocal({
      workspaceId: "wks_bench_" + variant,
      command: { command: "new_tab", args: { url: origin + "/already" } },
    });
    assert(warmup.ok && warmup.result.command === "new_tab");
    hosts[variant] = {
      host,
      JevBrowserGoalRunner,
      TypeSafeSystemOneClient,
      browserId: warmup.result.browserId,
    };
  }
  await writeFile(output + "/manifest.json", JSON.stringify(manifest, null, 2));
  const cases = Array.from({ length: repetitions }, (_, repetition) =>
    scenarios.flatMap((scenario) =>
      (repetition % 2 ? variants.toReversed() : variants).map((variant) => ({
        repetition,
        scenario,
        variant,
      })),
    ),
  ).flat();
  for (const { repetition, scenario, variant } of cases) {
    const { host, JevBrowserGoalRunner, TypeSafeSystemOneClient, browserId } = hosts[variant];
    const workspaceId = "wks_bench_" + variant;
    const commands = [];
    const decisions = [];
    let decisionMs = 0;
    let injected = false;
    let tab = browserId;
    const broker = {
      execute: async (input) => {
        await writeFile(
          output + "/progress.json",
          JSON.stringify({
            variant,
            scenario: scenario.name,
            repetition,
            command: input.command.command,
          }),
        );
        const started = performance.now();
        const payload = await deadline(host.executeLocal({ workspaceId, command: input.command }));
        commands.push({
          command: input.command.command,
          ok: payload.ok,
          ms: performance.now() - started,
          error: payload.ok ? undefined : payload.error.code,
        });
        if (payload.ok && payload.result.browserId) tab = payload.result.browserId;
        return payload;
      },
    };
    const client = new TypeSafeSystemOneClient();
    const runner = new JevBrowserGoalRunner({
      broker,
      decisionSource: {
        decide: async (request) => {
          const started = performance.now();
          const decision = await client.decide(request);
          decisions.push({
            model: decision.model,
            usage: decision.usage,
            ms: performance.now() - started,
          });
          decisionMs += performance.now() - started;
          if (scenario.stale && !injected) {
            injected = true;
            await host.executeLocal({
              workspaceId,
              command: {
                command: "evaluate",
                args: {
                  browserId: tab,
                  function:
                    "() => { const e=document.querySelector('#confirm'); e.replaceWith(e.cloneNode(true)); return true; }",
                },
              },
            });
          }
          return decision;
        },
      },
    });
    const started = performance.now();
    let result;
    let error;
    try {
      result = await runner.run(
        {
          goal: scenario.goal,
          browserId,
          url: scenario.url ?? origin + "/" + scenario.name,
          values: scenario.values,
          verify: scenario.verify ?? [{ text: scenario.expected }],
          maxSteps: 10,
        },
        { workspaceId },
      );
    } catch (caught) {
      error = caught.message;
    }
    let actual;
    try {
      const checked =
        tab &&
        (await deadline(
          host.executeLocal({
            workspaceId,
            command: {
              command: "evaluate",
              args: {
                browserId: tab,
                function:
                  scenario.proof ??
                  "() => ({proof:window.proof===true,count:window.count??null,text:document.body.innerText})",
              },
            },
          }),
        ));
      actual = checked?.ok ? JSON.parse(checked.result.resultJson) : null;
    } catch (caught) {
      error = [error, caught.message].filter(Boolean).join("; ");
    }
    const elapsedMs = performance.now() - started;
    const correct =
      actual?.proof === true &&
      actual.text.includes(scenario.expected) &&
      (!scenario.stale || actual.count === 1);
    const usage = decisions.reduce(
      (total, d) => ({
        decisions: total.decisions + 1,
        inputTokens: total.inputTokens + (d.usage?.inputTokens ?? 0),
        outputTokens: total.outputTokens + (d.usage?.outputTokens ?? 0),
      }),
      { decisions: 0, inputTokens: 0, outputTokens: 0 },
    );
    const row = {
      variant,
      scenario: scenario.name,
      repetition,
      passed: result?.status === "passed" && correct,
      correct,
      elapsedMs,
      browserCalls: commands.length,
      decisionMs,
      usage,
      decisions,
      model: result?.model,
      status: result?.status,
      error,
      retries: result?.steps.filter((s) => s.outcome === "stale").length ?? 0,
      handoff: result?.status !== "passed",
      commands,
      result,
      actual,
    };
    rows.push(row);
    await writeFile(output + "/rows.json", JSON.stringify(rows, null, 2));
    process.stdout.write(
      JSON.stringify({
        variant,
        scenario: scenario.name,
        repetition,
        passed: row.passed,
        status: row.status,
        ms: Math.round(elapsedMs),
        calls: row.browserCalls,
        decisions: row.usage?.decisions,
        error,
      }) + "\n",
    );
  }
} finally {
  await deadline(Promise.all(Object.values(hosts).map(({ host }) => host.close())), 10_000).catch(
    (error) => process.stderr.write(error.message + " during cleanup\n"),
  );
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
