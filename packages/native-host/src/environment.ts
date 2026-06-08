import { spawnSync } from "node:child_process";

const BASE_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "USERNAME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SHELL",
  "TERM",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "APPDATA",
  "LOCALAPPDATA",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
  "CODEX_BIN",
  "BRIDGE_ENTRY",
  "CODEX_SIDEPANEL_HOME",
] as const;

const SHELL_ENV_KEYS = [
  "CODEX_HOME",
] as const;

const SHELL_ENV_CAPTURE_COMMAND = [
  '[ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1 || true',
  '[ -f "$HOME/.bash_profile" ] && . "$HOME/.bash_profile" >/dev/null 2>&1 || true',
  '[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc" >/dev/null 2>&1 || true',
  '[ -f "$HOME/.zprofile" ] && . "$HOME/.zprofile" >/dev/null 2>&1 || true',
  '[ -f "$HOME/.zshrc" ] && . "$HOME/.zshrc" >/dev/null 2>&1 || true',
  "env -0",
].join("; ");

type ShellEnvCaptureResult = {
  status: number | null;
  stdout?: Buffer | string | null;
  error?: unknown;
};

type ShellEnvSpawn = (
  command: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv;
    encoding: "buffer";
    stdio: ["ignore", "pipe", "ignore"];
    timeout: number;
  },
) => ShellEnvCaptureResult;

export function createBridgeProcessEnv(
  baseEnv: NodeJS.ProcessEnv,
  overrides: {
    codexBinPath?: string;
  } = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const key of BASE_ALLOWLIST) {
    const value = readEnvValue(baseEnv, key);
    if (typeof value === "string" && value) {
      env[key] = value;
    }
  }

  if (overrides.codexBinPath?.trim()) {
    env.CODEX_BIN = overrides.codexBinPath.trim();
  }
  return env;
}

export function mergeShellProviderEnv(
  baseEnv: NodeJS.ProcessEnv,
  options: {
    platformName?: NodeJS.Platform;
    shellPath?: string | null;
    spawnSyncImpl?: ShellEnvSpawn;
  } = {},
): NodeJS.ProcessEnv {
  const platformName = options.platformName ?? process.platform;
  if (platformName === "win32") {
    return { ...baseEnv };
  }

  if (SHELL_ENV_KEYS.every((key) => readEnvValue(baseEnv, key))) {
    return { ...baseEnv };
  }

  const shellPath = options.shellPath ?? readEnvValue(baseEnv, "SHELL") ?? "/bin/sh";
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  let result: ShellEnvCaptureResult;

  try {
    result = spawnSyncImpl(shellPath, ["-lc", SHELL_ENV_CAPTURE_COMMAND], {
      env: { ...baseEnv },
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3_000,
    });
  } catch {
    return { ...baseEnv };
  }

  if (result.status !== 0 || result.error) {
    return { ...baseEnv };
  }

  const shellEnv = parseNullSeparatedEnv(result.stdout);
  if (!Object.keys(shellEnv).length) {
    return { ...baseEnv };
  }

  const mergedEnv = { ...baseEnv };
  for (const key of SHELL_ENV_KEYS) {
    if (readEnvValue(mergedEnv, key)) {
      continue;
    }
    const value = readEnvValue(shellEnv, key);
    if (value) {
      mergedEnv[key] = value;
    }
  }
  return mergedEnv;
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

function parseNullSeparatedEnv(value: Buffer | string | null | undefined): NodeJS.ProcessEnv {
  if (value == null) {
    return {};
  }
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  const env: NodeJS.ProcessEnv = {};
  for (const entry of text.split("\u0000")) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = entry.slice(0, separatorIndex).trim();
    const envValue = entry.slice(separatorIndex + 1);
    if (key) {
      env[key] = envValue;
    }
  }
  return env;
}
