const { getDefaultConfig } = require("expo/metro-config");
const { resolve } = require("metro-resolver");
const path = require("path");

const projectRoot = __dirname;
const appNodeModulesRoot = path.resolve(projectRoot, "node_modules");
const appSrcRoot = path.resolve(projectRoot, "src");
const isFdroidBuild = process.env.PASEO_FDROID_BUILD === "1";
const fdroidModuleOverrides = {
  "expo-camera": path.resolve(appSrcRoot, "fdroid/expo-camera.tsx"),
  "expo-notifications": path.resolve(appSrcRoot, "fdroid/expo-notifications.ts"),
};
const customWebPlatform = (process.env.PASEO_WEB_PLATFORM ?? "")
  .trim()
  .replace(/^\./, "")
  .toLowerCase();

const config = getDefaultConfig(projectRoot);
const defaultResolveRequest = config.resolver.resolveRequest ?? resolve;

config.resolver.useWatchman = false;

function escapeRoot(root) {
  return root
    .split(path.sep)
    .map((segment) => segment.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&"))
    .join("[\\\\/]");
}

const escapedAppSrcRoot = escapeRoot(appSrcRoot);
const escapedProjectRoot = escapeRoot(projectRoot);
const escapedRepositoryRoot = escapeRoot(path.resolve(projectRoot, "../.."));
const pathSeparatorPattern = "[\\\\/]";

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.join(appNodeModulesRoot, "react"),
  "react-dom": path.join(appNodeModulesRoot, "react-dom"),
  "react/jsx-runtime": path.join(appNodeModulesRoot, "react/jsx-runtime"),
  "react/jsx-dev-runtime": path.join(appNodeModulesRoot, "react/jsx-dev-runtime"),
};
config.resolver.blockList = [
  ...[config.resolver.blockList ?? []].flat(),
  new RegExp(
    `(^${escapedAppSrcRoot}${pathSeparatorPattern}.*\\.(test|spec)\\.(ts|tsx)$|${pathSeparatorPattern}__tests__${pathSeparatorPattern}.*)$`,
  ),
  new RegExp(
    `^${escapedProjectRoot}${pathSeparatorPattern}(?:android|ios|\\.expo${pathSeparatorPattern}web${pathSeparatorPattern}cache)(?:${pathSeparatorPattern}|$)`,
  ),
  new RegExp(
    `^${escapedRepositoryRoot}${pathSeparatorPattern}(?:.*${pathSeparatorPattern})?(?:\\.gradle|\\.cxx|android${pathSeparatorPattern}build)(?:${pathSeparatorPattern}|$)`,
  ),
];

function isLocalModuleImport(moduleName) {
  return (
    moduleName.startsWith("./") ||
    moduleName.startsWith("../") ||
    moduleName.startsWith("@/") ||
    path.isAbsolute(moduleName)
  );
}

function resolveWithCustomWebOverlay(context, moduleName, platform) {
  const shouldResolveCustomWebVariant =
    platform === "web" &&
    customWebPlatform.length > 0 &&
    customWebPlatform !== "web" &&
    isLocalModuleImport(moduleName);

  if (shouldResolveCustomWebVariant) {
    const overlayContext = {
      ...context,
      sourceExts: context.sourceExts.map((ext) => `${customWebPlatform}.${ext}`),
      preferNativePlatform: false,
    };

    try {
      return defaultResolveRequest(overlayContext, moduleName, null);
    } catch {}
  }

  return defaultResolveRequest(context, moduleName, platform);
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (isFdroidBuild && platform === "android" && fdroidModuleOverrides[moduleName]) {
    return resolveWithCustomWebOverlay(context, fdroidModuleOverrides[moduleName], platform);
  }

  return resolveWithCustomWebOverlay(context, moduleName, platform);
};

if (process.env.PASEO_SERVE_SIM_PREVIEW === "1") {
  const { simMiddleware } = require("serve-sim/middleware");
  const originalEnhanceMiddleware = config.server?.enhanceMiddleware;
  config.server = config.server ?? {};
  config.server.enhanceMiddleware = (metroMiddleware, server) => {
    const middleware = originalEnhanceMiddleware
      ? originalEnhanceMiddleware(metroMiddleware, server)
      : metroMiddleware;
    const serveSimulator = simMiddleware({
      basePath: "/.sim",
      device: process.env.PASEO_SERVE_SIM_DEVICE_UDID,
    });
    return (req, res, next) => {
      serveSimulator(req, res, (error) => {
        if (error) {
          if (next) {
            next(error);
            return;
          }
          throw error;
        }
        middleware(req, res, next);
      });
    };
  };
}

module.exports = config;
