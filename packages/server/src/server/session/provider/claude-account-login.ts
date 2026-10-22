import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { ChildProcess } from "node:child_process";
import { z } from "zod";
import type {
  ClaudeAccountLoginOperation,
  ClaudeAccountLoginState,
} from "@getpaseo/protocol/provider-account-login";
import type { ProviderOverride } from "@getpaseo/protocol/provider-config";
import { createProviderEnv } from "../../agent/provider-launch-config.js";
import { findExecutable } from "../../../executable-resolution/executable-resolution.js";
import { execCommand, spawnProcess } from "../../../utils/spawn.js";

interface Login {
  id: string;
  directory: string;
  name: string;
  description: string;
  sharedTeam: boolean;
  state: ClaudeAccountLoginState;
  process: ChildProcess;
  timeout: ReturnType<typeof setTimeout>;
  abort: AbortController;
}

const ACCOUNT_ENV = {
  ANTHROPIC_API_KEY: "",
  ANTHROPIC_AUTH_TOKEN: "",
  ANTHROPIC_BASE_URL: "",
  CLAUDE_CODE_OAUTH_TOKEN: "",
  CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR: "",
  CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR: "",
  CLAUDE_CODE_USE_BEDROCK: "",
  CLAUDE_CODE_USE_VERTEX: "",
  CLAUDE_CODE_USE_FOUNDRY: "",
};

export class ClaudeAccountLogin {
  private login: Login | null = null;
  private starting = false;
  private disposed = false;

  constructor(
    private readonly options: {
      home: string;
      command: () => string[] | undefined;
      save: (provider: string, config: ProviderOverride) => void;
    },
  ) {}

  async handle(operation: ClaudeAccountLoginOperation) {
    try {
      if (operation.kind === "start") {
        if (this.starting) throw new Error("A Claude sign-in is already starting.");
        this.starting = true;
        try {
          await this.start(operation);
        } finally {
          this.starting = false;
        }
      } else {
        const login = this.login;
        if (!login || login.id !== operation.loginId) {
          throw new Error("This sign-in has ended. Start again.");
        }
        if (operation.kind === "cancel") this.cancel();
        if (operation.kind === "code") {
          if (login.state.status !== "waiting") throw new Error("Sign-in is not ready for a code.");
          login.process.stdin?.write(`${operation.code}\n`);
        }
      }
      return {
        loginId: this.login?.id ?? null,
        state: this.login?.state ?? { status: "cancelled" as const },
      };
    } catch (error) {
      return {
        loginId: this.login?.id ?? null,
        state: {
          status: "error" as const,
          message: error instanceof Error ? error.message : "Claude sign-in failed.",
        },
      };
    }
  }

  private async start(operation: Extract<ClaudeAccountLoginOperation, { kind: "start" }>) {
    this.cancel();
    const configured = this.options.command();
    const binary = await findExecutable(configured?.[0] ?? "claude");
    if (this.disposed) throw new Error("Connection closed.");
    if (!binary) throw new Error("Claude Code is not installed on this host.");
    const id = randomUUID();
    const directory = join(this.options.home, "provider-accounts", `claude-${id}`);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const env = createProviderEnv({
      overlays: [{ ...ACCOUNT_ENV, CLAUDE_CONFIG_DIR: directory, BROWSER: "true" }],
    });
    let child: ChildProcess;
    try {
      child = spawnProcess(
        binary,
        [...(configured?.slice(1) ?? []), "auth", "login", "--claudeai"],
        {
          cwd: directory,
          env,
          stdio: "pipe",
          windowsHide: true,
        },
      );
    } catch (error) {
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    const login: Login = {
      id,
      directory,
      name: operation.name,
      description: operation.description,
      sharedTeam: operation.sharedTeam,
      state: { status: "starting" },
      process: child,
      timeout: setTimeout(() => this.fail(login, "Sign-in expired. Start again."), 10 * 60_000),
      abort: new AbortController(),
    };
    login.timeout.unref();
    this.login = login;
    let output = "";
    const onData = (chunk: Buffer) => {
      if (login.state.status !== "starting") return;
      output = (output + chunk.toString("utf8")).slice(-16_384);
      const candidate = stripVTControlCharacters(output)
        .match(/https:\/\/[^\s]+(?=\s)/g)
        ?.find((value) => {
          try {
            const url = new URL(value);
            return (
              ["claude.com", "claude.ai", "console.anthropic.com"].includes(url.hostname) &&
              url.pathname.endsWith("/oauth/authorize")
            );
          } catch {
            return false;
          }
        });
      if (candidate) login.state = { status: "waiting", url: candidate };
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.stdin?.on("error", () => this.fail(login, "Claude sign-in closed. Start again."));
    child.once("error", () => this.fail(login, "Could not start Claude sign-in on this host."));
    child.once("close", (code) => {
      if (login.state.status !== "starting" && login.state.status !== "waiting") return;
      if (code !== 0) {
        this.fail(login, "Claude sign-in failed. Check the authorization code and try again.");
        return;
      }
      login.state = { status: "starting" };
      void this.complete(login, binary, configured?.slice(1) ?? [], env);
    });
  }

  private async complete(login: Login, binary: string, args: string[], env: NodeJS.ProcessEnv) {
    try {
      const result = await execCommand(binary, [...args, "auth", "status", "--json"], {
        cwd: login.directory,
        env,
        timeout: 10_000,
        signal: login.abort.signal,
      });
      z.object({ loggedIn: z.literal(true) }).parse(JSON.parse(result.stdout));
    } catch {
      this.fail(login, "Claude did not confirm the sign-in. Start again.");
      return;
    }
    if (login.state.status !== "starting") return;
    const provider = `claude-${login.id}`;
    try {
      this.options.save(provider, {
        extends: "claude",
        label: login.name,
        description: login.description,
        enabled: true,
        accountPolicy: login.sharedTeam ? "shared-team-9elf26-memory" : "standard",
        env: { ...ACCOUNT_ENV, CLAUDE_CONFIG_DIR: login.directory },
      });
      clearTimeout(login.timeout);
      login.state = { status: "complete", provider };
    } catch {
      this.fail(login, "Signed in, but the account could not be saved. Try again.");
    }
  }

  private fail(login: Login, message: string) {
    if (login.state.status !== "starting" && login.state.status !== "waiting") return;
    login.state = { status: "error", message };
    this.stop(login);
  }

  private stop(login: Login) {
    clearTimeout(login.timeout);
    login.abort.abort();
    if (login.process.exitCode === null && login.process.signalCode === null) {
      login.process.kill();
      const kill = setTimeout(() => {
        if (login.process.exitCode === null) login.process.kill("SIGKILL");
      }, 2000);
      kill.unref();
      login.process.once("close", () => {
        clearTimeout(kill);
        rmSync(login.directory, { recursive: true, force: true });
      });
    } else {
      rmSync(login.directory, { recursive: true, force: true });
    }
  }

  private cancel() {
    const login = this.login;
    if (
      !login ||
      login.state.status === "complete" ||
      login.state.status === "cancelled" ||
      login.state.status === "error"
    )
      return;
    login.state = { status: "cancelled" };
    this.stop(login);
  }

  dispose() {
    this.disposed = true;
    this.cancel();
  }
}
