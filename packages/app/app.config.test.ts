import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const requireFromExpo = createRequire(require.resolve("expo/package.json"));
const requireFromExpoCli = createRequire(requireFromExpo.resolve("@expo/cli/package.json"));
const { getPrebuildConfigAsync } = requireFromExpoCli("@expo/prebuild-config");
const { compileModsAsync } = requireFromExpoCli(
  "@expo/config-plugins/build/plugins/mod-compiler.js",
);

interface ManifestEntry {
  $: Record<string, string>;
}

const originalFdroidFlag = process.env.PASEO_FDROID_BUILD;

async function resolveAndroidManifest() {
  const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
  await compileModsAsync(exp, {
    projectRoot: __dirname,
    introspect: true,
    platforms: ["android"],
    assertMissingModProviders: false,
  });
  return exp._internal.modResults.android.manifest.manifest;
}

describe("Android app config", () => {
  afterEach(() => {
    if (originalFdroidFlag === undefined) {
      delete process.env.PASEO_FDROID_BUILD;
    } else {
      process.env.PASEO_FDROID_BUILD = originalFdroidFlag;
    }
  });

  it.each([
    ["Google Play", "0"],
    ["F-Droid", "1"],
  ])(
    "%s build installs on devices without a camera",
    async (_build, fdroidFlag) => {
      process.env.PASEO_FDROID_BUILD = fdroidFlag;
      const manifest = await resolveAndroidManifest();
      const permissions = (manifest["uses-permission"] ?? []).map(
        (entry: ManifestEntry) => entry.$["android:name"],
      );
      const features = (manifest["uses-feature"] ?? []).map((entry: ManifestEntry) => entry.$);

      expect(permissions).toContain("android.permission.CAMERA");
      expect(features).toEqual(
        expect.arrayContaining([
          { "android:name": "android.hardware.camera", "android:required": "false" },
          { "android:name": "android.hardware.camera.autofocus", "android:required": "false" },
        ]),
      );
    },
    30_000,
  );
});

describe("Metro watch scope", () => {
  const root = path.resolve(__dirname, "../..");
  const blockList: RegExp[] = require("./metro.config.cjs").resolver.blockList;
  const isBlocked = (relativePath: string) =>
    blockList.some((pattern) => pattern.test(path.resolve(root, relativePath)));

  it.each([
    "packages/app/android",
    "packages/app/android/app/build/intermediates/assets/release",
    "packages/app/ios/Pods",
    "packages/app/.expo/web/cache",
    "packages/app/.expo/types/router.d.ts",
    "packages/app/src/components/example.test.tsx",
    "packages/app/src/components/__tests__/example.tsx",
    "packages/app/modules/paseo-scroll/android/build",
    "packages/app/modules/paseo-diff-prototype/android/.cxx/Debug",
    "node_modules/react-native-reanimated/android/build/intermediates",
    "node_modules/react-native/ReactAndroid/.cxx",
    ".gradle/caches",
  ])("excludes generated or test path %s", (relativePath) => {
    expect(isBlocked(relativePath)).toBe(true);
  });

  it.each([
    "packages/app",
    "packages/app/src/app/_layout.tsx",
    "packages/app/.expo/.virtual-metro-entry",
    "packages/app/modules/paseo-scroll/src/index.ts",
    "packages/app/modules/paseo-diff-prototype/assets/grammar.bin",
    "packages/expo-two-way-audio/build/index.js",
    "packages/protocol/dist/generated/validation/ws-outbound.aot.js",
    "packages/client/dist/index.js",
    "node_modules/react-native/Libraries/Core/InitializeCore.js",
    "node_modules/expo-camera/build/index.js",
    "node_modules/metro/build/index.js",
    "packages/app/src/desktop/browser/index.electron.tsx",
  ])("keeps runtime source visible %s", (relativePath) => {
    expect(isBlocked(relativePath)).toBe(false);
  });
});
