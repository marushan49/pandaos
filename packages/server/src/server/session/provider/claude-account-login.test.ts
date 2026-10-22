import { afterEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderOverride } from "@getpaseo/protocol/provider-config";
import { ClaudeAccountLogin } from "./claude-account-login.js";

const directories: string[] = [];
const services: ClaudeAccountLogin[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.dispose();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function setup() {
  const home = mkdtempSync(join(tmpdir(), "pandaos-account-test-"));
  directories.push(home);
  const script = join(home, "login.cjs");
  writeFileSync(
    script,
    `
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
if (process.argv.includes("status")) {
  process.stdout.write(JSON.stringify({ loggedIn: fs.existsSync(path.join(process.env.CLAUDE_CONFIG_DIR, ".credentials.json")) }));
  process.exit(0);
}
process.stdout.write("https://claude.com/cai/oauth/authorize?client_id=test");
setTimeout(() => process.stdout.write("&state=fixture\\nPaste code here > "), 30);
readline.createInterface({ input: process.stdin }).once("line", (code) => {
  if (code === "empty-login") process.exit(0);
  if (code !== "valid-code") process.exit(1);
  fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, ".credentials.json"), JSON.stringify({ apiKey: process.env.ANTHROPIC_API_KEY, oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN }));
  process.exit(0);
});
`,
  );
  const saved = new Map<string, ProviderOverride>();
  const service = new ClaudeAccountLogin({
    home,
    command: () => [process.execPath, script],
    save: (id, config) => {
      saved.set(id, config);
    },
  });
  services.push(service);
  return { service, saved, home };
}

async function start(service: ClaudeAccountLogin) {
  const result = await service.handle({
    kind: "start",
    name: "Shared team",
    description: "Local work, remaining quota",
    sharedTeam: true,
  });
  expect(result.loginId).toEqual(expect.any(String));
  if (!result.loginId) throw new Error("Missing login id");
  const loginId = result.loginId;
  await expect
    .poll(async () => (await service.handle({ kind: "status", loginId })).state)
    .toEqual({
      status: "waiting",
      url: "https://claude.com/cai/oauth/authorize?client_id=test&state=fixture",
    });
  return loginId;
}

describe("Claude account setup", () => {
  test("saves an isolated provider with its name and note only after successful login", async () => {
    const { service, saved, home } = setup();
    const original = join(home, "original-credentials.json");
    writeFileSync(original, "existing-login");
    vi.stubEnv("CLAUDE_CONFIG_DIR", home);
    vi.stubEnv("ANTHROPIC_API_KEY", "parent-key");
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "parent-token");
    const loginId = await start(service);
    expect(saved.size).toBe(0);
    await service.handle({ kind: "code", loginId, code: "valid-code" });
    const provider = `claude-${loginId}`;
    await expect
      .poll(async () => (await service.handle({ kind: "status", loginId })).state)
      .toEqual({ status: "complete", provider });
    const config = saved.get(provider);
    expect(config).toMatchObject({
      extends: "claude",
      label: "Shared team",
      description: "Local work, remaining quota",
      enabled: true,
      accountPolicy: "shared-team-9elf26-memory",
    });
    const directory = join(home, "provider-accounts", provider);
    expect(config?.env?.CLAUDE_CONFIG_DIR).toBe(directory);
    expect(JSON.parse(readFileSync(join(directory, ".credentials.json"), "utf8"))).toEqual({
      apiKey: "",
      oauthToken: "",
    });
    expect(readFileSync(original, "utf8")).toBe("existing-login");
    service.dispose();
    expect(existsSync(directory)).toBe(true);
  });

  test("cancel removes the unfinished account without registering a provider", async () => {
    const { service, saved, home } = setup();
    const loginId = await start(service);
    const result = await service.handle({ kind: "cancel", loginId });
    expect(result.state).toEqual({ status: "cancelled" });
    await expect
      .poll(() => existsSync(join(home, "provider-accounts", `claude-${loginId}`)))
      .toBe(false);
    expect(saved.size).toBe(0);
  });

  test("does not register an account when the CLI exits successfully without a login", async () => {
    const { service, saved, home } = setup();
    const loginId = await start(service);
    await service.handle({ kind: "code", loginId, code: "empty-login" });
    await expect
      .poll(async () => (await service.handle({ kind: "status", loginId })).state)
      .toEqual({ status: "error", message: "Claude did not confirm the sign-in. Start again." });
    expect(saved.size).toBe(0);
    expect(existsSync(join(home, "provider-accounts", `claude-${loginId}`))).toBe(false);
  });

  test("failed login is visible, cleans up, and can be retried", async () => {
    const { service, saved, home } = setup();
    const loginId = await start(service);
    await service.handle({ kind: "code", loginId, code: "invalid-code" });
    await expect
      .poll(async () => (await service.handle({ kind: "status", loginId })).state)
      .toEqual({
        status: "error",
        message: "Claude sign-in failed. Check the authorization code and try again.",
      });
    expect(existsSync(join(home, "provider-accounts", `claude-${loginId}`))).toBe(false);
    const retry = await start(service);
    expect(retry).not.toBe(loginId);
    await service.handle({ kind: "cancel", loginId: retry });
    expect(saved.size).toBe(0);
  });
});
