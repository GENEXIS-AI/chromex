import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir, platform } from "node:os";
import { posix, win32 } from "node:path";

export type CodexCommandSource = "configured" | "env" | "path" | "common" | "missing";

export interface CodexCommandResolution {
  configuredCommand: string;
  resolvedCommand: string;
  source: CodexCommandSource;
  configuredCommandInvalid: boolean;
}

const CODEX_COMMAND_NAMES = [
  "codex-app-server",
  "codex-app-server-x86_64-pc-windows-msvc",
  "codex-app-server-aarch64-pc-windows-msvc",
  "codex-app-server-x86_64-apple-darwin",
  "codex-app-server-aarch64-apple-darwin",
  "codex-app-server-x86_64-unknown-linux-musl",
  "codex-app-server-aarch64-unknown-linux-musl",
  "codex",
] as const;

export async function resolveCodexCommand(options: {
  configuredCommand?: string | null;
  envCommand?: string | null;
  env?: NodeJS.ProcessEnv;
  pathValue?: string | undefined;
  homeDirectory?: string;
  platformName?: NodeJS.Platform;
  isExecutable?: (path: string) => Promise<boolean>;
  isDirectory?: (path: string) => Promise<boolean>;
} = {}): Promise<CodexCommandResolution> {
  const env = options.env ?? process.env;
  const configuredCommand = normalizeCommandCandidate(options.configuredCommand ?? "");
  const envCommand = normalizeCommandCandidate(options.envCommand ?? readEnvValue(env, "CODEX_BIN") ?? "");
  const pathValue = options.pathValue ?? readEnvValue(env, "PATH") ?? "";
  const homeDirectory = options.homeDirectory ?? homedir();
  const platformName = options.platformName ?? platform();
  const isExecutable = options.isExecutable ?? ((path: string) => isExecutableFile(path, platformName));
  const isDirectory = options.isDirectory ?? isDirectoryPath;

  if (configuredCommand) {
    const resolvedConfigured = await findExecutable(configuredCommand, {
      env,
      homeDirectory,
      pathValue,
      platformName,
      isExecutable,
      isDirectory,
    });
    if (resolvedConfigured) {
      return {
        configuredCommand,
        resolvedCommand: resolvedConfigured,
        source: "configured",
        configuredCommandInvalid: false,
      };
    }
  }

  if (envCommand) {
    const resolvedEnv = await findExecutable(envCommand, {
      env,
      homeDirectory,
      pathValue,
      platformName,
      isExecutable,
      isDirectory,
    });
    if (resolvedEnv) {
      return {
        configuredCommand,
        resolvedCommand: resolvedEnv,
        source: "env",
        configuredCommandInvalid: Boolean(configuredCommand),
      };
    }
  }

  for (const commandName of CODEX_COMMAND_NAMES) {
    const resolvedPathCommand = await findExecutable(commandName, {
      env,
      homeDirectory,
      pathValue,
      platformName,
      isExecutable,
      isDirectory,
    });
    if (resolvedPathCommand) {
      return {
        configuredCommand,
        resolvedCommand: resolvedPathCommand,
        source: "path",
        configuredCommandInvalid: Boolean(configuredCommand),
      };
    }
  }

  for (const candidate of commonCodexCandidates(homeDirectory, platformName, env)) {
    const resolvedCandidate = await findExecutable(candidate, {
      env,
      homeDirectory,
      pathValue,
      platformName,
      isExecutable,
      isDirectory,
    });
    if (resolvedCandidate) {
      return {
        configuredCommand,
        resolvedCommand: resolvedCandidate,
        source: "common",
        configuredCommandInvalid: Boolean(configuredCommand),
      };
    }
  }

  return {
    configuredCommand,
    resolvedCommand: "",
    source: "missing",
    configuredCommandInvalid: Boolean(configuredCommand),
  };
}

async function findExecutable(
  candidate: string,
  options: {
    env: NodeJS.ProcessEnv;
    homeDirectory: string;
    pathValue: string;
    platformName: NodeJS.Platform;
    isExecutable: (path: string) => Promise<boolean>;
    isDirectory: (path: string) => Promise<boolean>;
  },
): Promise<string | null> {
  const trimmed = expandPathCandidate(candidate, options);
  const pathApi = getPathApi(options.platformName);
  const pathDelimiter = options.platformName === "win32" ? ";" : ":";
  if (!trimmed) {
    return null;
  }

  if (looksLikePath(trimmed, options.platformName)) {
    const absoluteCandidate = pathApi.isAbsolute(trimmed) ? trimmed : pathApi.resolve(trimmed);
    for (const variant of commandVariants(absoluteCandidate, options.platformName)) {
      if (await options.isExecutable(variant)) {
        return variant;
      }
    }
    if (await options.isDirectory(absoluteCandidate)) {
      for (const commandName of CODEX_COMMAND_NAMES) {
        for (const variant of commandVariants(commandName, options.platformName)) {
          const nestedCandidate = pathApi.join(absoluteCandidate, variant);
          if (await options.isExecutable(nestedCandidate)) {
            return nestedCandidate;
          }
        }
      }
    }
    return null;
  }

  for (const rawPathEntry of options.pathValue.split(pathDelimiter).filter(Boolean)) {
    const pathEntry = expandPathCandidate(rawPathEntry, options);
    if (!pathEntry) {
      continue;
    }
    for (const variant of commandVariants(trimmed, options.platformName)) {
      const absoluteCandidate = pathApi.join(pathEntry, variant);
      if (await options.isExecutable(absoluteCandidate)) {
        return absoluteCandidate;
      }
    }
  }

  return null;
}

function looksLikePath(candidate: string, platformName: NodeJS.Platform): boolean {
  return candidate.includes("/") || candidate.includes("\\") || (platformName === "win32" && /^[a-zA-Z]:/.test(candidate));
}

function commandVariants(command: string, platformName: NodeJS.Platform): string[] {
  if (platformName !== "win32") {
    return [command];
  }

  const lower = command.toLowerCase();
  if (lower.endsWith(".exe") || lower.endsWith(".cmd") || lower.endsWith(".bat") || lower.endsWith(".com")) {
    return [command];
  }

  return [`${command}.exe`, `${command}.cmd`, `${command}.bat`, `${command}.com`];
}

function normalizeCommandCandidate(value: string): string {
  return stripWrappingQuotes(value.trim());
}

function stripWrappingQuotes(value: string): string {
  let normalized = value.trim();
  while (
    normalized.length >= 2 &&
    ((normalized.startsWith("\"") && normalized.endsWith("\"")) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function commonCodexCandidates(
  homeDirectory: string,
  platformName: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  if (platformName === "win32") {
    const localAppData = readEnvValue(env, "LOCALAPPDATA") || win32.resolve(homeDirectory, "AppData", "Local");
    const appData = readEnvValue(env, "APPDATA") || win32.resolve(homeDirectory, "AppData", "Roaming");
    const userProfile = readEnvValue(env, "USERPROFILE") || homeDirectory;
    const fallbackLocalAppData = win32.resolve(homeDirectory, "AppData", "Local");
    const fallbackAppData = win32.resolve(homeDirectory, "AppData", "Roaming");
    const programFiles = readEnvValue(env, "ProgramFiles");
    const programFilesX86 = readEnvValue(env, "ProgramFiles(x86)");
    const pnpmHome = readEnvValue(env, "PNPM_HOME") || win32.resolve(localAppData, "pnpm");
    const voltaHome = readEnvValue(env, "VOLTA_HOME") || win32.resolve(userProfile, ".volta");
    const bunInstall = readEnvValue(env, "BUN_INSTALL") || win32.resolve(userProfile, ".bun");
    return dedupeCandidates([
      win32.resolve(localAppData, "Programs", "Codex", "codex-app-server.exe"),
      win32.resolve(localAppData, "Programs", "Codex", "codex.exe"),
      win32.resolve(appData, "npm", "codex-app-server.cmd"),
      win32.resolve(appData, "npm", "codex-app-server.exe"),
      win32.resolve(appData, "npm", "codex.cmd"),
      win32.resolve(appData, "npm", "codex.exe"),
      win32.resolve(fallbackLocalAppData, "Programs", "Codex", "codex-app-server.exe"),
      win32.resolve(fallbackLocalAppData, "Programs", "Codex", "codex.exe"),
      win32.resolve(fallbackAppData, "npm", "codex-app-server.cmd"),
      win32.resolve(fallbackAppData, "npm", "codex-app-server.exe"),
      win32.resolve(fallbackAppData, "npm", "codex.cmd"),
      win32.resolve(fallbackAppData, "npm", "codex.exe"),
      win32.resolve(pnpmHome, "codex-app-server.cmd"),
      win32.resolve(pnpmHome, "codex-app-server.exe"),
      win32.resolve(pnpmHome, "codex.cmd"),
      win32.resolve(pnpmHome, "codex.exe"),
      win32.resolve(localAppData, "pnpm", "codex-app-server.cmd"),
      win32.resolve(localAppData, "pnpm", "codex-app-server.exe"),
      win32.resolve(localAppData, "pnpm", "codex.cmd"),
      win32.resolve(localAppData, "pnpm", "codex.exe"),
      win32.resolve(voltaHome, "bin", "codex-app-server.cmd"),
      win32.resolve(voltaHome, "bin", "codex-app-server.exe"),
      win32.resolve(voltaHome, "bin", "codex.cmd"),
      win32.resolve(voltaHome, "bin", "codex.exe"),
      win32.resolve(userProfile, ".volta", "bin", "codex-app-server.cmd"),
      win32.resolve(userProfile, ".volta", "bin", "codex-app-server.exe"),
      win32.resolve(userProfile, ".volta", "bin", "codex.cmd"),
      win32.resolve(userProfile, ".volta", "bin", "codex.exe"),
      win32.resolve(bunInstall, "bin", "codex-app-server.cmd"),
      win32.resolve(bunInstall, "bin", "codex-app-server.exe"),
      win32.resolve(bunInstall, "bin", "codex.cmd"),
      win32.resolve(bunInstall, "bin", "codex.exe"),
      win32.resolve(userProfile, ".bun", "bin", "codex-app-server.cmd"),
      win32.resolve(userProfile, ".bun", "bin", "codex-app-server.exe"),
      win32.resolve(userProfile, ".bun", "bin", "codex.cmd"),
      win32.resolve(userProfile, ".bun", "bin", "codex.exe"),
      win32.resolve(userProfile, ".local", "bin", "codex-app-server.cmd"),
      win32.resolve(userProfile, ".local", "bin", "codex-app-server.exe"),
      win32.resolve(userProfile, ".local", "bin", "codex.cmd"),
      win32.resolve(userProfile, ".local", "bin", "codex.exe"),
      win32.resolve(homeDirectory, "scoop", "shims", "codex-app-server.cmd"),
      win32.resolve(homeDirectory, "scoop", "shims", "codex.cmd"),
      win32.resolve(userProfile, "scoop", "shims", "codex-app-server.cmd"),
      win32.resolve(userProfile, "scoop", "shims", "codex.cmd"),
      win32.resolve(localAppData, "Microsoft", "WindowsApps", "codex-app-server.exe"),
      win32.resolve(localAppData, "Microsoft", "WindowsApps", "codex.exe"),
      ...(programFiles ? [win32.resolve(programFiles, "Codex", "codex-app-server.exe")] : []),
      ...(programFiles ? [win32.resolve(programFiles, "Codex", "codex.exe")] : []),
      ...(programFilesX86 ? [win32.resolve(programFilesX86, "Codex", "codex-app-server.exe")] : []),
      ...(programFilesX86 ? [win32.resolve(programFilesX86, "Codex", "codex.exe")] : []),
    ]);
  }

  return [
    "/Applications/Codex.app/Contents/Resources/codex-app-server",
    "/Applications/Codex.app/Contents/Resources/codex",
    "/Applications/Codex.app/Contents/MacOS/codex-app-server",
    "/Applications/Codex.app/Contents/MacOS/codex",
    posix.resolve(homeDirectory, "Applications/Codex.app/Contents/Resources/codex-app-server"),
    posix.resolve(homeDirectory, "Applications/Codex.app/Contents/Resources/codex"),
    posix.resolve(homeDirectory, "Applications/Codex.app/Contents/MacOS/codex-app-server"),
    posix.resolve(homeDirectory, "Applications/Codex.app/Contents/MacOS/codex"),
    "/opt/homebrew/bin/codex-app-server",
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex-app-server",
    "/usr/local/bin/codex",
    "/usr/bin/codex-app-server",
    "/usr/bin/codex",
    posix.resolve(homeDirectory, ".local/bin/codex-app-server"),
    posix.resolve(homeDirectory, ".local/bin/codex"),
    posix.resolve(homeDirectory, "bin/codex-app-server"),
    posix.resolve(homeDirectory, "bin/codex"),
  ];
}

function dedupeCandidates(candidates: string[]): string[] {
  return [...new Set(candidates)];
}

function getPathApi(platformName: NodeJS.Platform): typeof posix | typeof win32 {
  return platformName === "win32" ? win32 : posix;
}

function expandPathCandidate(
  value: string,
  options: {
    env: NodeJS.ProcessEnv;
    homeDirectory: string;
    platformName: NodeJS.Platform;
  },
): string {
  let expanded = normalizeCommandCandidate(value);

  if (expanded === "~" || expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    expanded = `${options.homeDirectory}${expanded.slice(1)}`;
  }

  if (options.platformName === "win32") {
    expanded = expanded.replace(/%([^%]+)%/gu, (match, key: string) => readEnvValue(options.env, key) ?? match);
    expanded = expanded.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/giu, (match, key: string) =>
      readEnvValue(options.env, key) ?? match,
    );
  }

  return normalizeCommandCandidate(expanded);
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

async function isExecutableFile(path: string, platformName: NodeJS.Platform): Promise<boolean> {
  try {
    const accessMode = platformName === "win32" && isWindowsRunnableShim(path) ? fsConstants.F_OK : fsConstants.X_OK;
    await access(path, accessMode);
    return true;
  } catch {
    return false;
  }
}

function isWindowsRunnableShim(path: string): boolean {
  return /\.(?:exe|cmd|bat|com)$/iu.test(path);
}

async function isDirectoryPath(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
