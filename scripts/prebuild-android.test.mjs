import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getAndroidPrebuildFingerprint, prebuildAndroid } from "./prebuild-android.mjs";

test("retains native outputs until actual inputs or build profile change", () => {
  const root = mkdtempSync(join(tmpdir(), "pandaos-prebuild-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    const app = join(root, "packages/app");
    mkdirSync(join(app, "android"), { recursive: true });
    writeFileSync(join(app, "app.config.js"), "initial");
    const manifestPath = join(app, "package.json");
    const manifest = { version: "1.0.0", scripts: { android: "old script" } };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const lockPath = join(root, "package-lock.json");
    const lock = {
      version: "1.0.0",
      lockfileVersion: 3,
      packages: {
        "": { version: "1.0.0" },
        "packages/app": {
          version: "1.0.0",
          dependencies: { "@x/a": "1.0.0", native: "1.0.0" },
          devDependencies: { "@x/a": "1.0.0" },
          peerDependencies: { "@x/a": "1.0.0" },
          optionalDependencies: { "@x/a": "1.0.0" },
        },
        "packages/a": { version: "1.0.0" },
        "node_modules/@x/a": { resolved: "packages/a", link: true },
        "node_modules/app": { resolved: "packages/app", link: true },
        "node_modules/native": { version: "1.0.0", resolved: "native-1.tgz", integrity: "old" },
      },
    };
    writeFileSync(lockPath, JSON.stringify(lock));
    const calls = [];
    const run = (_command, args) => calls.push(args);
    const options = {
      root,
      env: {
        ...process.env,
        APP_VARIANT: "production",
        PASEO_PROFILE_BUILD: "",
        PASEO_FDROID_BUILD: "",
        GOOGLE_SERVICES_FILE_PROD: "",
        GOOGLE_SERVICES_FILE_DEBUG: "",
      },
      run,
    };
    const fingerprint = getAndroidPrebuildFingerprint(options);
    assert.equal(existsSync(join(app, "android/.paseo-prebuild-fingerprint")), false);
    assert.equal(calls.length, 0);
    assert.equal(prebuildAndroid(options).fingerprint, fingerprint);
    assert.equal(calls[0].includes("--clean"), true);
    assert.equal(prebuildAndroid(options).clean, false);
    manifest.scripts.android = "new build script";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    lock.version = "2.0.0";
    lock.packages[""].version = "2.0.0";
    lock.packages["packages/app"].version = "2.0.0";
    lock.packages["packages/a"].version = "2.0.0";
    for (const section of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      lock.packages["packages/app"][section]["@x/a"] = "2.0.0";
    }
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.equal(getAndroidPrebuildFingerprint(options), fingerprint);
    assert.equal(prebuildAndroid(options).clean, false);
    lock.packages["packages/app"].dependencies["@x/a"] = "^2.0.0";
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.equal(prebuildAndroid(options).clean, true);
    lock.packages["packages/app"].dependencies.native = "2.0.0";
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.equal(prebuildAndroid(options).clean, true);
    lock.packages["node_modules/native"].integrity = "changed";
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.equal(prebuildAndroid(options).clean, true);
    lock.packages["node_modules/native"].version = "2.0.0";
    lock.packages["node_modules/native"].resolved = "native-2.tgz";
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.equal(prebuildAndroid(options).clean, true);
    manifest.version = "2.0.0";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.equal(prebuildAndroid(options).clean, true);
    assert.equal(calls[1].includes("--clean"), false);
    mkdirSync(join(app, "modules/paseo-scroll"), { recursive: true });
    const scrollPlugin = join(app, "modules/paseo-scroll/app.plugin.js");
    writeFileSync(scrollPlugin, "scroll plugin");
    assert.equal(prebuildAndroid(options).clean, true);
    writeFileSync(scrollPlugin, "changed scroll plugin");
    assert.equal(prebuildAndroid(options).clean, true);
    assert.equal(prebuildAndroid(options).clean, false);
    writeFileSync(join(app, "app.config.js"), "changed");
    assert.equal(prebuildAndroid(options).clean, true);
    mkdirSync(join(app, "plugins"));
    const plugin = join(app, "plugins/native.js");
    writeFileSync(plugin, "plugin");
    assert.equal(prebuildAndroid(options).clean, true);
    execFileSync("git", ["add", "packages/app/plugins/native.js"], { cwd: root });
    rmSync(plugin);
    assert.equal(prebuildAndroid(options).clean, true);
    mkdirSync(join(app, ".secrets"));
    writeFileSync(join(app, ".secrets/google-services.prod.json"), "{}");
    assert.equal(prebuildAndroid(options).clean, true);
    assert.equal(prebuildAndroid(options).clean, false);
    assert.equal(
      prebuildAndroid({ ...options, env: { ...options.env, PASEO_PROFILE_BUILD: "1" } }).clean,
      true,
    );
    const marker = join(app, "android/.paseo-prebuild-fingerprint");
    const previous = readFileSync(marker, "utf8");
    writeFileSync(join(app, "app.config.js"), "failed change");
    assert.throws(
      () =>
        prebuildAndroid({
          ...options,
          run: () => {
            throw new Error("prebuild failed");
          },
        }),
      /prebuild failed/,
    );
    assert.equal(readFileSync(marker, "utf8"), previous);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
