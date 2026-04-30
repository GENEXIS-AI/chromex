import { spawn } from "node:child_process";
import { constants as fsConstants, readFileSync } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { dirname, resolve } from "node:path";

import type { PlaywrightRuntimeCapability } from "@codex-sidepanel/shared";

const PLAYWRIGHT_INSTALL_ARGS = ["install", "chromium"];
const PLAYWRIGHT_INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

type PlaywrightPackage = {
  name: "playwright" | "playwright-core";
  version: string;
  packageJsonPath: string;
  cliPath: string;
};

export class PlaywrightRuntimeManager {
  readonly #require = createRequire(import.meta.url);

  async readStatus(): Promise<PlaywrightRuntimeCapability> {
    const packageInfo = await this.#resolvePackage();
    const browserExecutablePath = await findChromiumExecutable(packageInfo);
    const browserInstalled = Boolean(browserExecutablePath);
    const installCommand = packageInfo ? `node ${packageInfo.cliPath} ${PLAYWRIGHT_INSTALL_ARGS.join(" ")}` : "npm install";

    return {
      available: Boolean(packageInfo && browserInstalled),
      packageName: packageInfo?.name ?? null,
      packageVersion: packageInfo?.version ?? "",
      browserInstalled,
      browserExecutablePath,
      installable: Boolean(packageInfo),
      installCommand,
      message: createPlaywrightStatusMessage(packageInfo, browserInstalled),
    };
  }

  async installChromium(): Promise<PlaywrightRuntimeCapability> {
    const packageInfo = await this.#resolvePackage();
    if (!packageInfo) {
      throw new Error(
        "Playwright is not bundled with this Chromex install. Run npm install in the Chromex source folder, then try again.",
      );
    }

    await runPlaywrightInstall(packageInfo.cliPath);
    return this.readStatus();
  }

  async #resolvePackage(): Promise<PlaywrightPackage | null> {
    return resolvePlaywrightPackage(this.#require, "playwright") ?? resolvePlaywrightPackage(this.#require, "playwright-core");
  }
}

function resolvePlaywrightPackage(
  requireRef: NodeJS.Require,
  packageName: "playwright" | "playwright-core",
): PlaywrightPackage | null {
  try {
    const packageJsonPath = requireRef.resolve(`${packageName}/package.json`);
    const packageJson = JSON.parse(readFileSyncText(packageJsonPath)) as { version?: string; bin?: Record<string, string> };
    const packageRoot = dirname(packageJsonPath);
    return {
      name: packageName,
      version: packageJson.version ?? "",
      packageJsonPath,
      cliPath: resolve(packageRoot, packageJson.bin?.[packageName] ?? "cli.js"),
    };
  } catch {
    return null;
  }
}

function readFileSyncText(path: string): string {
  return readFileSync(path, "utf8");
}

async function runPlaywrightInstall(cliPath: string): Promise<void> {
  await assertFileExists(cliPath);
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cliPath, ...PLAYWRIGHT_INSTALL_ARGS], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Playwright Chromium install timed out."));
    }, PLAYWRIGHT_INSTALL_TIMEOUT_MS);

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", () => undefined);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(stderr.trim() || `Playwright Chromium install failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function findChromiumExecutable(packageInfo: PlaywrightPackage | null): Promise<string> {
  for (const root of playwrightBrowserRoots(packageInfo)) {
    const path = await findChromiumExecutableInRoot(root);
    if (path) {
      return path;
    }
  }
  return "";
}

async function findChromiumExecutableInRoot(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const chromiumDirs = entries
    .filter((entry) => entry.isDirectory() && /^chromium-\d+/u.test(entry.name))
    .map((entry) => resolve(root, entry.name))
    .sort((left, right) => right.localeCompare(left));

  for (const dir of chromiumDirs) {
    for (const relativePath of chromiumExecutableCandidates()) {
      const candidate = resolve(dir, relativePath);
      if (await fileExists(candidate)) {
        return candidate;
      }
    }
  }
  return "";
}

function playwrightBrowserRoots(packageInfo: PlaywrightPackage | null): string[] {
  const explicit = readEnvValue(process.env, "PLAYWRIGHT_BROWSERS_PATH")?.trim();
  if (explicit && explicit !== "0") {
    return [resolve(explicit)];
  }

  const localBrowserRoot = packageInfo ? [resolve(dirname(packageInfo.packageJsonPath), ".local-browsers")] : [];
  if (explicit === "0") {
    return localBrowserRoot;
  }

  const home = homedir();
  switch (platform()) {
    case "darwin":
      return [...localBrowserRoot, resolve(home, "Library", "Caches", "ms-playwright")];
    case "win32":
      return [
        ...localBrowserRoot,
        resolve(readEnvValue(process.env, "LOCALAPPDATA") || resolve(home, "AppData", "Local"), "ms-playwright"),
      ];
    default:
      return [...localBrowserRoot, resolve(readEnvValue(process.env, "XDG_CACHE_HOME") || resolve(home, ".cache"), "ms-playwright")];
  }
}

function chromiumExecutableCandidates(): string[] {
  switch (platform()) {
    case "darwin":
      return ["chrome-mac/Chromium.app/Contents/MacOS/Chromium"];
    case "win32":
      return ["chrome-win/chrome.exe"];
    default:
      return ["chrome-linux/chrome"];
  }
}

function createPlaywrightStatusMessage(packageInfo: PlaywrightPackage | null, browserInstalled: boolean): string {
  if (!packageInfo) {
    return "Playwright package is not installed with Chromex.";
  }
  if (!browserInstalled) {
    return "Playwright package is installed, but Chromium runtime is missing.";
  }
  return "Playwright Chromium runtime is installed.";
}

async function assertFileExists(path: string): Promise<void> {
  await access(path, fsConstants.F_OK);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await assertFileExists(path);
    return true;
  } catch {
    return false;
  }
}

function readEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const exactValue = env[key];
  if (typeof exactValue === "string") {
    return exactValue;
  }

  const normalizedKey = key.toLowerCase();
  const actualKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === normalizedKey);
  const value = actualKey ? env[actualKey] : undefined;
  return typeof value === "string" ? value : undefined;
}
