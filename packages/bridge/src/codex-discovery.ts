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
  const configuredCommand = options.configuredCommand?.trim() ?? "";
  const envCommand = (options.envCommand ?? readEnvValue(env, "CODEX_BIN") ?? "").trim();
  const pathValue = options.pathValue ?? readEnvValue(env, "PATH") ?? "";
  const homeDirectory = options.homeDirectory ?? homedir();
  const platformName = options.platformName ?? platform();
  const isExecutable = options.isExecutable ?? isExecutableFile;
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

  const resolvedPathCommand = await findExecutable("codex", {
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
  const trimmed = expandPathCandidate(candidate.trim(), options);
  const pathApi = getPathApi(options.platformName);
  const pathDelimiter = options.platformName === "win32" ? ";" : ":";
  if (!trimmed) {
    return null;
  }

  if (looksLikePath(trimmed, options.platformName)) {
    const absoluteCandidate = pathApi.isAbsolute(trimmed) ? trimmed : pathApi.resolve(trimmed);
    if (await options.isExecutable(absoluteCandidate)) {
      return absoluteCandidate;
    }
    if (await options.isDirectory(absoluteCandidate)) {
      for (const variant of commandVariants("codex", options.platformName)) {
        const nestedCandidate = pathApi.join(absoluteCandidate, variant);
        if (await options.isExecutable(nestedCandidate)) {
          return nestedCandidate;
        }
      }
    }
    return null;
  }

  for (const pathEntry of options.pathValue.split(pathDelimiter).filter(Boolean)) {
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
  if (lower.endsWith(".exe") || lower.endsWith(".cmd") || lower.endsWith(".bat")) {
    return [command];
  }

  return [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`];
}

function commonCodexCandidates(
  homeDirectory: string,
  platformName: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  if (platformName === "win32") {
    const localAppData = readEnvValue(env, "LOCALAPPDATA") || win32.resolve(homeDirectory, "AppData", "Local");
    const appData = readEnvValue(env, "APPDATA") || win32.resolve(homeDirectory, "AppData", "Roaming");
    const fallbackLocalAppData = win32.resolve(homeDirectory, "AppData", "Local");
    const fallbackAppData = win32.resolve(homeDirectory, "AppData", "Roaming");
    const programFiles = readEnvValue(env, "ProgramFiles");
    const programFilesX86 = readEnvValue(env, "ProgramFiles(x86)");
    return dedupeCandidates([
      win32.resolve(localAppData, "Programs", "Codex", "codex.exe"),
      win32.resolve(appData, "npm", "codex.cmd"),
      win32.resolve(appData, "npm", "codex.exe"),
      win32.resolve(fallbackLocalAppData, "Programs", "Codex", "codex.exe"),
      win32.resolve(fallbackAppData, "npm", "codex.cmd"),
      win32.resolve(fallbackAppData, "npm", "codex.exe"),
      win32.resolve(homeDirectory, "scoop", "shims", "codex.cmd"),
      ...(programFiles ? [win32.resolve(programFiles, "Codex", "codex.exe")] : []),
      ...(programFilesX86 ? [win32.resolve(programFilesX86, "Codex", "codex.exe")] : []),
    ]);
  }

  return [
    "/Applications/Codex.app/Contents/Resources/codex",
    "/Applications/Codex.app/Contents/MacOS/codex",
    posix.resolve(homeDirectory, "Applications/Codex.app/Contents/Resources/codex"),
    posix.resolve(homeDirectory, "Applications/Codex.app/Contents/MacOS/codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "/usr/bin/codex",
    posix.resolve(homeDirectory, ".local/bin/codex"),
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
  let expanded = value;

  if (expanded === "~" || expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    expanded = `${options.homeDirectory}${expanded.slice(1)}`;
  }

  if (options.platformName === "win32") {
    expanded = expanded.replace(/%([^%]+)%/gu, (match, key: string) => readEnvValue(options.env, key) ?? match);
    expanded = expanded.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/giu, (match, key: string) =>
      readEnvValue(options.env, key) ?? match,
    );
  }

  return expanded;
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

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDirectoryPath(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
