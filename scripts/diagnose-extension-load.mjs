import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const expectedDist = resolve(repoRoot, "packages/extension/dist");
const manifestPath = resolve(repoRoot, "packages/extension/public/manifest.json");
const distBuildInfoPath = resolve(expectedDist, "build-info.json");
const extensionId = await deriveExtensionIdFromManifest(manifestPath);
const syncLoadedPath = process.argv.includes("--sync");

if (!extensionId) {
  throw new Error("Could not derive the extension ID from packages/extension/public/manifest.json.");
}

const buildInfo = await readJsonFile(distBuildInfoPath).catch(() => null);
const matches = await findLoadedExtensionEntries(extensionId);

console.log(`Expected extension ID: ${extensionId}`);
console.log(`Expected unpacked path: ${expectedDist}`);
console.log(`Latest build ID: ${buildInfo?.buildId ?? "missing build-info.json"}`);

if (!matches.length) {
  console.log("");
  console.log("No matching loaded unpacked extension was found in scanned Chrome/Chromium profiles.");
  console.log("Open chrome://extensions, enable Developer Mode, then Load unpacked from the expected path above.");
  console.log(`After loading or reloading, open: chrome://extensions/?id=${extensionId}`);
  process.exit(0);
}

if (syncLoadedPath) {
  for (const match of matches) {
    const loadedPath = typeof match.path === "string" ? resolve(match.path) : "";
    if (!loadedPath || loadedPath === expectedDist) {
      continue;
    }
    await mkdir(loadedPath, { recursive: true });
    await cp(expectedDist, loadedPath, { recursive: true });
    console.log(`Synced current dist to loaded unpacked path: ${loadedPath}`);
  }
}

console.log("");
console.log("Loaded extension entries:");
for (const match of matches) {
  const loadedPath = typeof match.path === "string" ? resolve(match.path) : "";
  const pathMatches = loadedPath === expectedDist;
  console.log(`- ${match.profile}`);
  console.log(`  id: ${match.id}`);
  console.log(`  state: ${match.state ?? "unknown"}`);
  console.log(`  path: ${loadedPath || "unknown"}`);
  console.log(`  path matches current dist: ${pathMatches ? "yes" : "no"}`);
}

if (matches.some((match) => resolve(String(match.path ?? "")) !== expectedDist)) {
  console.log("");
  console.log(
    syncLoadedPath
      ? "At least one matching extension is loaded from a different path. The latest dist was synced there; reload the extension card in chrome://extensions."
      : "At least one matching extension is loaded from a different path. Remove that unpacked copy or reload from packages/extension/dist.",
  );
}

async function findLoadedExtensionEntries(expectedId) {
  const results = [];
  for (const root of resolveProfileRoots(platform(), homedir())) {
    const profileDirs = await listProfileDirs(root);
    for (const profile of profileDirs) {
      for (const filename of ["Preferences", "Secure Preferences"]) {
        const prefPath = resolve(profile, filename);
        const data = await readJsonFile(prefPath).catch(() => null);
        if (!data) {
          continue;
        }
        const settings = data.extensions?.settings;
        if (!settings || typeof settings !== "object") {
          continue;
        }
        const entry = settings[expectedId];
        if (entry && typeof entry === "object") {
          results.push({
            profile,
            id: expectedId,
            path: entry.path,
            state: entry.state,
          });
        }
      }
    }
  }
  return dedupeEntries(results);
}

async function listProfileDirs(root) {
  try {
    await access(root);
  } catch {
    return [];
  }

  const candidates = [root];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === "Default" || /^Profile \d+$/u.test(entry.name)) {
      candidates.push(resolve(root, entry.name));
    }
  }
  return candidates;
}

function resolveProfileRoots(platformFamily, homeDir) {
  if (platformFamily === "darwin") {
    return [
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome"),
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome Beta"),
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome Dev"),
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome Canary"),
      resolve(homeDir, "Library", "Application Support", "Google", "Chrome for Testing"),
      resolve(homeDir, "Library", "Application Support", "Google", "ChromeForTesting"),
      resolve(homeDir, "Library", "Application Support", "Chromium"),
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

function dedupeEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.profile}\0${entry.id}\0${entry.path ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function deriveExtensionIdFromManifest(path) {
  const manifest = await readJsonFile(path);
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
