import { chromium, type BrowserContext } from "playwright-core";
import { findExecutable } from "../../executable-resolution/executable-resolution.js";

interface InteractiveBrowser {
  context: BrowserContext;
  close: () => Promise<void>;
}

async function resolveLaunchCommand(executablePath: string, args: string[]) {
  if (process.platform !== "linux") return { executablePath, args };
  const xvfbRun = await findExecutable("xvfb-run");
  if (!xvfbRun) {
    throw new Error(
      "The remote browser needs a display. Install xvfb and xauth on this Linux host.",
    );
  }
  return {
    executablePath: xvfbRun,
    args: ["-a", "-s", "-screen 0 1920x1080x24 -nolisten tcp", executablePath, ...args],
  };
}

export async function launchInteractiveBrowser(input: {
  executablePath: string;
  userDataDir: string;
}): Promise<InteractiveBrowser> {
  const launch = await resolveLaunchCommand(input.executablePath, [
    `--user-data-dir=${input.userDataDir}`,
    "--remote-debugging-pipe",
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "about:blank",
  ]);
  const context = await chromium.launchPersistentContext(input.userDataDir, {
    executablePath: launch.executablePath,
    args: launch.args,
    ignoreDefaultArgs: true,
    headless: false,
    viewport: null,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    timeout: 20_000,
  });
  return { context, close: () => context.close() };
}
