import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NATIVE_HOST_NAME = "com.codex.sidepanel.bridge";
const SUPPORTED_BROWSERS = ["chrome", "chrome-beta", "chrome-dev", "chrome-canary", "chrome-for-testing", "chromium"];
const LEGACY_EXTENSION_IDS = [
  "fmeijhhjkfehnmbenppijhplbchnidpf",
  "jmghgkadlfpclhehodncahidegjdegpk",
  "mfolnhbpfojdlkajoenkhlhibpkdkfjd",
];
const extensionIdArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const profileDirArg = process.argv.find((arg) => arg.startsWith("--profile-dir="));
const browserArg = process.argv.find((arg) => arg.startsWith("--browser="));
const includeLegacyExtensionIds = process.argv.includes("--include-legacy-extension-ids");

const currentPlatform = platform();
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const extensionManifestPath = resolve(repoRoot, "packages/extension/public/manifest.json");
const derivedExtensionId = await deriveExtensionIdFromManifest(extensionManifestPath);
const extensionId = extensionIdArg ?? derivedExtensionId;

if (!extensionId || !isValidExtensionId(extensionId)) {
  console.error(
    [
      "Usage: node scripts/install-native-host.mjs [extension-id] [--browser=chrome,chrome-beta,chrome-dev,chrome-canary,chrome-for-testing,chromium] [--profile-dir=/path/to/profile] [--include-legacy-extension-ids]",
      "",
      derivedExtensionId
        ? `Derived extension ID from manifest key: ${derivedExtensionId}`
        : "No manifest key was available to derive the extension ID automatically.",
      "The extension ID must be a 32-character Chrome extension ID using letters a-p.",
    ].join("\n"),
  );
  process.exit(1);
}

const selectedBrowsers = parseSelectedBrowsers(browserArg?.slice("--browser=".length));
assertSelectedBrowsersSupportedOnPlatform(selectedBrowsers, currentPlatform);
const appSupportDir = resolveAppSupportDir(currentPlatform);
const hostInstallDir = resolve(appSupportDir, "native-host");
const hostSourceDir = resolve(repoRoot, "packages/native-host/dist");
const bridgeEntryPath = resolve(repoRoot, "packages/bridge/dist/cli.js");
const hostPath = resolve(hostInstallDir, "bin.js");
const launcherPath = resolve(hostInstallDir, currentPlatform === "win32" ? "run-bridge.cmd" : "run-bridge");
const homeDir = homedir();
const targets = resolveInstallTargets({
  platformFamily: currentPlatform,
  homeDir,
  appSupportDir,
  selectedBrowsers,
  profileDir: profileDirArg ? profileDirArg.slice("--profile-dir=".length) : null,
});
const discoveredExtensionIds = await discoverCompatibleExtensionIds({
  platformFamily: currentPlatform,
  homeDir,
  profileDir: profileDirArg ? profileDirArg.slice("--profile-dir=".length) : null,
  candidatePaths: collectExtensionPathCandidates({ repoRoot, homeDir }),
});
const allowedExtensionIds = [
  ...new Set([extensionId, ...(includeLegacyExtensionIds ? LEGACY_EXTENSION_IDS : []), ...discoveredExtensionIds]),
];
const allowedOrigins = allowedExtensionIds.map((id) => `chrome-extension://${id}/`);

await assertBuiltAsset(hostSourceDir, "packages/native-host/dist");
await assertBuiltAsset(bridgeEntryPath, "packages/bridge/dist/cli.js");

await rm(hostInstallDir, { recursive: true, force: true });
await mkdir(hostInstallDir, { recursive: true });
await cp(hostSourceDir, hostInstallDir, { recursive: true });
await writeFile(
  resolve(hostInstallDir, "package.json"),
  JSON.stringify(
    {
      type: "module",
    },
    null,
    2,
  ),
);
await writeLauncher({
  platformFamily: currentPlatform,
  launcherPath,
  hostPath,
  bridgeEntryPath,
});

for (const target of targets) {
  const manifestPath = resolve(target.manifestDir, `${NATIVE_HOST_NAME}.json`);
  await mkdir(target.manifestDir, { recursive: true });
  await writeManifestFile(manifestPath, {
    name: NATIVE_HOST_NAME,
    description: "Chromex native host",
    path: launcherPath,
    type: "stdio",
    allowed_origins: allowedOrigins,
  });

  if (target.kind === "windows-registry") {
    const result = spawnSync(
      "reg",
      ["add", target.registryKey, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `Failed to register ${target.registryKey}`);
    }
  }
}

console.log(`Installed ${NATIVE_HOST_NAME} for:`);
for (const target of targets) {
  console.log(`- ${target.label}: ${resolve(target.manifestDir, `${NATIVE_HOST_NAME}.json`)}`);
}
console.log(`Using extension ID: ${extensionId}`);
console.log(`Allowed extension IDs: ${allowedExtensionIds.join(", ")}`);
if (includeLegacyExtensionIds) {
  console.log("Legacy extension IDs were included because --include-legacy-extension-ids was set.");
}
if (currentPlatform === "win32") {
  console.log("");
  console.log("Windows checks:");
  console.log("- Run: codex --version");
  console.log("- Run: where codex");
  console.log(`- Run: reg query HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`);
  if (profileDirArg) {
    console.log(
      "- Note: --profile-dir is ignored on Windows because Chrome native messaging uses the current-user registry. If setup is still waiting, rerun with the extension ID and --browser=chrome.",
    );
  }
}
console.log("No API key was copied during installation. ChatGPT login remains the default auth path.");

function isValidExtensionId(value) {
  return /^[a-p]{32}$/u.test(value);
}

function parseSelectedBrowsers(rawValue) {
  if (!rawValue) {
    return null;
  }

  const browsers = rawValue
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const unsupported = browsers.filter((value) => !SUPPORTED_BROWSERS.includes(value));
  if (unsupported.length) {
    throw new Error(`Unsupported browser target(s): ${unsupported.join(", ")}`);
  }
  return browsers.length ? new Set(browsers) : null;
}

function assertSelectedBrowsersSupportedOnPlatform(selectedBrowsers, platformFamily) {
  if (platformFamily !== "win32" || !selectedBrowsers) {
    return;
  }

  const unsupported = [...selectedBrowsers].filter((browser) => browser === "chrome-for-testing" || browser === "chromium");
  if (!unsupported.length) {
    return;
  }

  throw new Error(
    [
      `Windows native messaging registration is only installed for Chrome stable/beta/dev/canary. Unsupported target(s): ${unsupported.join(", ")}`,
      "Use --browser=chrome for normal Chrome, or load the extension in Chrome stable before installing the local bridge.",
      "Chrome on Windows discovers native messaging hosts through HKCU registry keys, not profile-folder NativeMessagingHosts directories.",
    ].join("\n"),
  );
}

async function deriveExtensionIdFromManifest(manifestPath) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!manifest?.key || typeof manifest.key !== "string") {
      return null;
    }

    const digest = createHash("sha256")
      .update(Buffer.from(manifest.key, "base64"))
      .digest("hex")
      .slice(0, 32);
    return digest.replace(/[0-9a-f]/g, (character) =>
      String.fromCharCode("a".charCodeAt(0) + Number.parseInt(character, 16)),
    );
  } catch {
    return null;
  }
}

function resolveAppSupportDir(platformFamily) {
  if (platformFamily === "darwin") {
    return resolve(homedir(), "Library", "Application Support", "CodexSidepanel");
  }

  if (platformFamily === "win32") {
    return resolve(readEnvValue(process.env, "LOCALAPPDATA") || resolve(homedir(), "AppData", "Local"), "CodexSidepanel");
  }

  return resolve(readEnvValue(process.env, "XDG_CONFIG_HOME") || resolve(homedir(), ".config"), "codex-sidepanel");
}

function resolveInstallTargets({ platformFamily, homeDir, appSupportDir, selectedBrowsers, profileDir }) {
  const targets = [];
  const include = (browser) => !selectedBrowsers || selectedBrowsers.has(browser);

  if (platformFamily === "darwin") {
    if (include("chrome")) {
      targets.push({
        kind: "file",
        label: "Google Chrome (user)",
        manifestDir: resolve(homeDir, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts"),
      });
    }
    if (include("chrome-beta")) {
      targets.push({
        kind: "file",
        label: "Google Chrome Beta (user)",
        manifestDir: resolve(homeDir, "Library", "Application Support", "Google", "Chrome Beta", "NativeMessagingHosts"),
      });
    }
    if (include("chrome-dev")) {
      targets.push({
        kind: "file",
        label: "Google Chrome Dev (user)",
        manifestDir: resolve(homeDir, "Library", "Application Support", "Google", "Chrome Dev", "NativeMessagingHosts"),
      });
    }
    if (include("chrome-canary")) {
      targets.push({
        kind: "file",
        label: "Google Chrome Canary (user)",
        manifestDir: resolve(homeDir, "Library", "Application Support", "Google", "Chrome Canary", "NativeMessagingHosts"),
      });
    }
    if (include("chrome-for-testing")) {
      targets.push({
        kind: "file",
        label: "Google Chrome for Testing (user)",
        manifestDir: resolve(homeDir, "Library", "Application Support", "Google", "ChromeForTesting", "NativeMessagingHosts"),
      });
    }
    if (include("chromium")) {
      targets.push({
        kind: "file",
        label: "Chromium (user)",
        manifestDir: resolve(homeDir, "Library", "Application Support", "Chromium", "NativeMessagingHosts"),
      });
    }
  } else if (platformFamily === "linux") {
    if (include("chrome")) {
      targets.push({
        kind: "file",
        label: "Google Chrome (user)",
        manifestDir: resolve(homeDir, ".config/google-chrome/NativeMessagingHosts"),
      });
    }
    if (include("chrome-beta")) {
      targets.push({
        kind: "file",
        label: "Google Chrome Beta (user)",
        manifestDir: resolve(homeDir, ".config/google-chrome-beta/NativeMessagingHosts"),
      });
    }
    if (include("chrome-dev") || include("chrome-canary")) {
      targets.push({
        kind: "file",
        label: "Google Chrome Dev/Unstable (user)",
        manifestDir: resolve(homeDir, ".config/google-chrome-unstable/NativeMessagingHosts"),
      });
    }
    if (include("chrome-for-testing")) {
      targets.push({
        kind: "file",
        label: "Google Chrome for Testing (user)",
        manifestDir: resolve(homeDir, ".config/google-chrome-for-testing/NativeMessagingHosts"),
      });
    }
    if (include("chromium")) {
      targets.push({
        kind: "file",
        label: "Chromium (user)",
        manifestDir: resolve(homeDir, ".config/chromium/NativeMessagingHosts"),
      });
    }
  } else if (platformFamily === "win32") {
    if (!selectedBrowsers || selectedBrowsers.has("chrome")) {
      targets.push({
        kind: "windows-registry",
        label: "Google Chrome (current user)",
        manifestDir: resolve(appSupportDir, "NativeMessagingHosts", "Chrome"),
        registryKey: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
      });
    }
    if (!selectedBrowsers || selectedBrowsers.has("chrome-beta")) {
      targets.push({
        kind: "windows-registry",
        label: "Google Chrome Beta (current user)",
        manifestDir: resolve(appSupportDir, "NativeMessagingHosts", "ChromeBeta"),
        registryKey: `HKCU\\Software\\Google\\Chrome Beta\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
      });
    }
    if (!selectedBrowsers || selectedBrowsers.has("chrome-dev")) {
      targets.push({
        kind: "windows-registry",
        label: "Google Chrome Dev (current user)",
        manifestDir: resolve(appSupportDir, "NativeMessagingHosts", "ChromeDev"),
        registryKey: `HKCU\\Software\\Google\\Chrome Dev\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
      });
    }
    if (!selectedBrowsers || selectedBrowsers.has("chrome-canary")) {
      targets.push({
        kind: "windows-registry",
        label: "Google Chrome Canary (current user)",
        manifestDir: resolve(appSupportDir, "NativeMessagingHosts", "ChromeCanary"),
        registryKey: `HKCU\\Software\\Google\\Chrome SxS\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
      });
    }
  } else {
    throw new Error(`Unsupported platform: ${platformFamily}`);
  }

  if (profileDir && platformFamily !== "win32") {
    targets.push({
      kind: "file",
      label: "Custom profile",
      manifestDir: resolve(profileDir, "NativeMessagingHosts"),
    });
  }

  if (!targets.length) {
    throw new Error("No install targets were selected.");
  }

  return targets;
}

function collectExtensionPathCandidates({ repoRoot, homeDir }) {
  return new Set(
    [
      resolve(repoRoot, "packages/extension/dist"),
      resolve(repoRoot, "packages/extension"),
      resolve(homeDir, "Desktop", "chromex-extension"),
      resolve(homeDir, "Desktop", "codex-sidepanel-extension"),
      resolve(homeDir, "Downloads", "chromex-extension"),
      resolve(homeDir, "Downloads", "codex-sidepanel-extension"),
    ].map((value) => resolve(value)),
  );
}

async function discoverCompatibleExtensionIds({ platformFamily, homeDir, profileDir, candidatePaths }) {
  const preferenceFiles = await collectPreferenceFiles({ platformFamily, homeDir, profileDir });
  const discoveredIds = new Set();

  for (const preferenceFile of preferenceFiles) {
    try {
      const json = JSON.parse(await readFile(preferenceFile, "utf8"));
      const settings = json?.extensions?.settings;
      if (!settings || typeof settings !== "object") {
        continue;
      }

      for (const [id, entry] of Object.entries(settings)) {
        if (isMatchingSidepanelExtension(id, entry, candidatePaths)) {
          discoveredIds.add(id);
        }
      }
    } catch {
      // Ignore malformed profile files and continue with the next profile.
    }
  }

  return [...discoveredIds];
}

async function collectPreferenceFiles({ platformFamily, homeDir, profileDir }) {
  const files = new Set();

  if (profileDir) {
    addPreferenceFileCandidates(files, profileDir);
  }

  for (const profileRoot of resolveProfileRoots(platformFamily, homeDir)) {
    try {
      const entries = await readdir(profileRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        if (entry.name === "Default" || /^Profile \d+$/u.test(entry.name)) {
          addPreferenceFileCandidates(files, resolve(profileRoot, entry.name));
        }
      }
    } catch {
      // Skip missing browser roots.
    }
  }

  return [...files];
}

function addPreferenceFileCandidates(files, directory) {
  files.add(resolve(directory, "Preferences"));
  files.add(resolve(directory, "Secure Preferences"));
}

function resolveProfileRoots(platformFamily, homeDir) {
  if (platformFamily === "darwin") {
    return [
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome"),
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome Beta"),
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome Dev"),
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome Canary"),
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome for Testing"),
      resolve(homeDir, "Library", "Application Support", "Chromium"),
      resolve(homeDir, "Library", "Application Support", "Google", "ChromeForTesting"),
    ];
  }

  if (platformFamily === "linux") {
    return [
      resolve(homeDir, ".config/google-chrome"),
      resolve(homeDir, ".config/google-chrome-beta"),
      resolve(homeDir, ".config/google-chrome-unstable"),
      resolve(homeDir, ".config/google-chrome-for-testing"),
      resolve(homeDir, ".config/chromium"),
      resolve(homeDir, ".config/chromium-browser"),
    ];
  }

  if (platformFamily === "win32") {
    const localAppData = readEnvValue(process.env, "LOCALAPPDATA") || resolve(homeDir, "AppData", "Local");
    return [
      resolve(localAppData, "Google", "Chrome", "User Data"),
      resolve(localAppData, "Google", "Chrome Beta", "User Data"),
      resolve(localAppData, "Google", "Chrome Dev", "User Data"),
      resolve(localAppData, "Google", "Chrome SxS", "User Data"),
      resolve(localAppData, "Google", "Chrome for Testing", "User Data"),
      resolve(localAppData, "Chromium", "User Data"),
    ];
  }

  return [];
}

function isMatchingSidepanelExtension(id, entry, candidatePaths) {
  if (!isValidExtensionId(id) || !entry || typeof entry !== "object") {
    return false;
  }

  const extensionPath = typeof entry.path === "string" ? resolve(entry.path) : null;
  const permissions = getExtensionPermissions(entry);
  const commands = typeof entry.commands === "object" && entry.commands ? Object.keys(entry.commands) : [];
  const extensionBasename = extensionPath ? basename(extensionPath) : "";

  if (extensionPath && candidatePaths.has(extensionPath)) {
    return true;
  }

  if (extensionBasename === "chromex-extension" || extensionBasename === "codex-sidepanel-extension") {
    return true;
  }

  if (extensionBasename === "dist" && normalizePathForComparison(extensionPath ?? "").includes("/packages/extension/")) {
    return true;
  }

  return (
    permissions.includes("nativeMessaging") &&
    permissions.includes("sidePanel") &&
    permissions.includes("contextMenus") &&
    (commands.includes("open-side-panel") || commands.includes("open-popup-chat"))
  );
}

function normalizePathForComparison(value) {
  return value.replace(/\\/gu, "/");
}

function getExtensionPermissions(entry) {
  const candidates = [entry.active_permissions?.api, entry.granted_permissions?.api];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((value) => typeof value === "string");
    }
  }
  return [];
}

async function writeLauncher({
  platformFamily,
  launcherPath,
  hostPath,
  bridgeEntryPath,
}) {
  const nodeDir = dirname(process.execPath);
  const launcherBody =
    platformFamily === "win32"
      ? [
          "@echo off",
          `set "BRIDGE_ENTRY=${bridgeEntryPath}"`,
          `set "PATH=${nodeDir};%APPDATA%\\npm;%LOCALAPPDATA%\\Programs\\Codex;%USERPROFILE%\\scoop\\shims;%PATH%"`,
          `"${process.execPath}" "${hostPath}" %*`,
          "",
        ].join("\r\n")
      : [
          "#!/bin/sh",
          `export BRIDGE_ENTRY="${bridgeEntryPath}"`,
          `export PATH="${nodeDir}:$PATH"`,
          `exec "${process.execPath}" "${hostPath}" "$@"`,
          "",
        ].join("\n");

  await writeFile(launcherPath, launcherBody, {
    mode: platformFamily === "win32" ? undefined : 0o755,
  });
  if (platformFamily !== "win32") {
    await chmod(launcherPath, 0o755);
  }
}

async function writeManifestFile(path, manifest) {
  await writeFile(path, JSON.stringify(manifest, null, 2));
}

async function assertBuiltAsset(path, label) {
  try {
    await stat(path);
  } catch {
    throw new Error(`Missing ${label}. Run "npm run build" before installing the native host.`);
  }
}

function readEnvValue(env, key) {
  const exactValue = env[key];
  if (typeof exactValue === "string") {
    return exactValue;
  }

  const normalizedKey = key.toLowerCase();
  const actualKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === normalizedKey);
  const value = actualKey ? env[actualKey] : undefined;
  return typeof value === "string" ? value : undefined;
}
