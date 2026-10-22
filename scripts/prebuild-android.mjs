import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./is-main-module.mjs";

const inputs = [
  "package-lock.json",
  "packages/app/app.config.js",
  "packages/app/package.json",
  "packages/app/plugins",
  "packages/app/modules/paseo-scroll/app.plugin.js",
  "packages/app/assets",
  "packages/app/native-release-version.js",
];

function normalizeWorkspaceVersions(lock) {
  const workspaces = [
    lock.packages[""],
    ...Object.values(lock.packages)
      .filter((entry) => entry.link)
      .map((entry) => lock.packages[entry.resolved]),
  ];
  for (const workspace of workspaces) {
    for (const section of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      for (const [name, spec] of Object.entries(workspace[section] ?? {})) {
        const linked = lock.packages[`node_modules/${name}`];
        if (linked?.link && spec === lock.packages[linked.resolved].version) {
          workspace[section][name] = "<workspace-version>";
        }
      }
    }
  }
  delete lock.version;
  for (const workspace of workspaces) delete workspace.version;
}

export function getAndroidPrebuildFingerprint({ root, env = process.env }) {
  const hash = createHash("sha256");
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...inputs],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...env, RTK_DISABLED: "1" },
    },
  )
    .split("\0")
    .filter(Boolean);
  for (const file of [...new Set(files)].sort()) {
    hash.update(file).update("\0");
    const path = resolve(root, file);
    hash.update(existsSync(path) ? "file\0" : "missing\0");
    if (existsSync(path)) {
      let content = readFileSync(path);
      if (file === "packages/app/package.json") {
        const manifest = JSON.parse(content.toString());
        delete manifest.scripts;
        content = JSON.stringify(manifest);
      } else if (file === "package-lock.json") {
        const lock = JSON.parse(content.toString());
        normalizeWorkspaceVersions(lock);
        content = JSON.stringify(lock);
      }
      hash.update(content);
    }
    hash.update("\0");
  }
  const app = resolve(root, "packages/app");
  for (const [key, value] of Object.entries({
    APP_VARIANT: env.APP_VARIANT ?? "production",
    PASEO_FDROID_BUILD: env.PASEO_FDROID_BUILD ?? "",
    PASEO_PROFILE_BUILD: env.PASEO_PROFILE_BUILD ?? "",
  })) {
    hash.update(key).update("\0").update(value).update("\0");
  }
  for (const variant of ["PROD", "DEBUG"]) {
    const path = resolve(
      app,
      env[`GOOGLE_SERVICES_FILE_${variant}`]?.trim() ||
        `.secrets/google-services.${variant.toLowerCase()}.json`,
    );
    hash.update(path).update("\0");
    hash.update(existsSync(path) ? "file\0" : "missing\0");
    if (existsSync(path)) hash.update(readFileSync(path));
  }
  return hash.digest("hex");
}

export function prebuildAndroid({ root, env = process.env, run = execFileSync }) {
  const fingerprint = getAndroidPrebuildFingerprint({ root, env });
  const app = resolve(root, "packages/app");
  const marker = resolve(app, "android/.paseo-prebuild-fingerprint");
  const clean = !existsSync(marker) || readFileSync(marker, "utf8").trim() !== fingerprint;
  run(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "expo",
      "prebuild",
      "--platform",
      "android",
      ...(clean ? ["--clean"] : []),
      "--non-interactive",
    ],
    {
      cwd: app,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  writeFileSync(marker, `${fingerprint}\n`);
  return { clean, fingerprint };
}

if (isMainModule(import.meta.url)) {
  prebuildAndroid({ root: resolve(dirname(fileURLToPath(import.meta.url)), "..") });
}
