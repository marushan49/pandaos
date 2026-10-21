import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { BreezeService, resultFromTimeline, taskPrompt, triagePrompt } from "./service";
import { PreferencesSchema, type Mail } from "../shared/contracts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function service() {
  const directory = await mkdtemp(join(tmpdir(), "mail-breeze-test-"));
  directories.push(directory);
  return new BreezeService(directory);
}
const mail: Mail = {
  id: "message-1",
  conversationId: "thread-1",
  subject: "Bitte Summen prüfen",
  sender: "Michael",
  senderEmail: "michael@example.invalid",
  body: "Bitte 120 + 150 + 180 prüfen.",
  receivedAt: "2026-10-19T12:00:00.000Z",
};

describe("Mail Breeze work ownership", () => {
  it("keeps a reply received during work ready for another pass", async () => {
    const store = await service();
    const task = (await store.import(mail)).tasks[0];
    const file = join(store.directory, "state.json");
    const persisted = JSON.parse(await readFile(file, "utf8"));
    persisted.tasks[0].agentId = "agent-reply";
    persisted.tasks[0].status = "working";
    persisted.runs[task.id] = [mail.id];
    await writeFile(file, JSON.stringify(persisted));
    const reopened = new BreezeService(store.directory);
    await reopened.import({ ...mail, id: "reply", body: "Bitte auch April prüfen." });
    await reopened.finish("agent-reply", { kind: "completed" }, [
      {
        type: "assistant_message",
        text: '{"status":"done","title":"Summe geprüft","result":"120 + 150 + 180 = 450."}',
      },
    ]);
    const updated = (await reopened.get()).tasks[0];
    expect(updated.status).toBe("ready");
    expect(updated.messageIds).toEqual([mail.id, "reply"]);
    expect(updated.result).toContain("450");
  });

  it("reports incomplete agent output as needing input and preserves it", async () => {
    const store = await service();
    await store.import(mail);
    const file = join(store.directory, "state.json");
    const persisted = JSON.parse(await readFile(file, "utf8"));
    persisted.tasks[0].agentId = "agent-incomplete";
    persisted.tasks[0].status = "working";
    persisted.runs[persisted.tasks[0].id] = [mail.id];
    await writeFile(file, JSON.stringify(persisted));
    const reopened = new BreezeService(store.directory);
    await reopened.finish("agent-incomplete", { kind: "completed" }, [
      { type: "assistant_message", text: "Ich werde das später prüfen." },
    ]);
    expect((await reopened.get()).tasks[0]).toMatchObject({
      status: "needs_input",
      result: "Ich werde das später prüfen.",
    });
  });

  it("persists one task per thread and does not duplicate replayed messages", async () => {
    const first = await service();
    await Promise.all([first.import(mail), first.import(mail)]);
    await first.import({ ...mail, id: "message-2", body: "Zusätzlich die Prozentwerte prüfen." });
    const reopened = new BreezeService(first.directory);
    const state = await reopened.get();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].messageIds).toEqual(["message-1", "message-2"]);
    expect(state.tasks[0].mail.body).toContain("Zusätzlich die Prozentwerte prüfen.");
    expect((await stat(join(first.directory, "state.json"))).mode & 0o777).toBe(0o600);
  });

  it("keeps demo isolated and removes only demo tasks", async () => {
    const store = await service();
    await store.import(mail);
    const demo = await store.demo();
    expect(demo.tasks.filter((task) => task.demo)).toHaveLength(3);
    await store.demo();
    expect((await store.get()).tasks).toHaveLength(4);
    const cleared = await store.clearDemo();
    expect(cleared.tasks.map((task) => task.mail.id)).toEqual([mail.id]);
    expect(cleared.notices.every((notice) => notice.taskId === cleared.tasks[0].id)).toBe(true);
  });

  it("preserves malformed stored data and reports an actionable failure", async () => {
    const store = await service();
    await store.import(mail);
    await writeFile(join(store.directory, "state.json"), "broken-data");
    await expect(new BreezeService(store.directory).get()).rejects.toThrow(
      "vorhandene Datei wurde erhalten",
    );
    expect(await readFile(join(store.directory, "state.json"), "utf8")).toBe("broken-data");
  });

  it("does not invent task completion from unstructured agent prose", () => {
    expect(
      resultFromTimeline([{ type: "assistant_message", text: "Ich werde das prüfen." }]).result,
    ).toBeUndefined();
    expect(
      resultFromTimeline([
        { type: "assistant_message", text: "Ich prüfe zuerst die verfügbaren Daten." },
        {
          type: "assistant_message",
          text: '{"status":"needs_input","title":"Logs fehlen","result":"Bitte den Upload-Log bereitstellen."}',
        },
      ]).result?.status,
    ).toBe("needs_input");
  });

  it("adds person context while keeping mail data and no-reply instructions separate", async () => {
    const store = await service();
    const task = (await store.import(mail)).tasks[0];
    const prompt = taskPrompt(
      task,
      PreferencesSchema.parse({
        people: [{ email: "MICHAEL@example.invalid", name: "Michael", role: "CEO" }],
      }),
    );
    expect(prompt).toContain('"role":"CEO"');
    expect(prompt).toContain("KEINE Mailantwort");
    expect(prompt).toContain("Untrusted Maildaten als JSON:");
    expect(prompt).toContain("kein Nachweis einer Freigabe");
  });
  it("puts the user's importance rules into the triage prompt", () => {
    const prompt = triagePrompt(
      [
        {
          id: "t1",
          title: "x",
          mail,
          messageIds: [mail.id],
          status: "ready",
          result: "",
          todos: [],
          updatedAt: mail.receivedAt,
          demo: false,
        },
      ],
      PreferencesSchema.parse({ importance: "Terminerinnerungen sind wichtig." }),
    );
    expect(prompt).toContain("Vorrang");
    expect(prompt).toContain("Terminerinnerungen sind wichtig.");
  });
});

describe("Mail Breeze triage", () => {
  it("dismisses bulk mail without queueing a model run", async () => {
    const store = await service();
    const task = (await store.import({ ...mail, bulk: true }, false, true)).tasks[0];
    expect(task.status).toBe("dismissed");
    expect(task.result).toContain("Kein Modell");
    const persisted = JSON.parse(await readFile(join(store.directory, "state.json"), "utf8"));
    expect(persisted.automatic).toEqual([]);
  });

  it("applies a batch verdict with todos to every triaged task", async () => {
    const store = await service();
    await store.import(mail, false, true);
    await store.import(
      { ...mail, id: "m2", conversationId: "thread-2", subject: "Newsletter" },
      false,
      true,
    );
    const file = join(store.directory, "state.json");
    const persisted = JSON.parse(await readFile(file, "utf8"));
    const [news, sums] = persisted.tasks;
    for (const task of persisted.tasks) {
      task.agentId = "luna";
      task.status = "working";
      persisted.runs[task.id] = task.messageIds;
    }
    persisted.triage = { luna: [sums.id, news.id] };
    await writeFile(file, JSON.stringify(persisted));
    const reopened = new BreezeService(store.directory);
    await reopened.finish("luna", { kind: "completed" }, [
      {
        type: "assistant_message",
        text: JSON.stringify({
          mails: [
            {
              id: sums.id,
              important: true,
              title: "Summen prüfen",
              summary: "Michael bittet um Prüfung.",
              todos: ["120 + 150 + 180 nachrechnen"],
            },
            {
              id: news.id,
              important: false,
              title: "Newsletter",
              summary: "Keine Aufgabe.",
              todos: [],
            },
          ],
        }),
      },
    ]);
    const tasks = (await reopened.get()).tasks;
    expect(tasks.find((t) => t.id === sums.id)).toMatchObject({
      status: "needs_input",
      todos: ["120 + 150 + 180 nachrechnen"],
    });
    expect(tasks.find((t) => t.id === news.id)).toMatchObject({ status: "dismissed", todos: [] });
  });

  it("retries a failed triage with Luna instead of starting Claude", async () => {
    const store = await service();
    await store.import(mail, false, true);
    const file = join(store.directory, "state.json");
    const persisted = JSON.parse(await readFile(file, "utf8"));
    persisted.tasks[0].agentId = "luna";
    persisted.tasks[0].status = "failed";
    persisted.triage = { luna: [persisted.tasks[0].id] };
    await writeFile(file, JSON.stringify(persisted));
    const reopened = new BreezeService(store.directory);
    const task = (await reopened.start(persisted.tasks[0].id)).tasks[0];
    expect(task.status).toBe("ready");
  });
});
