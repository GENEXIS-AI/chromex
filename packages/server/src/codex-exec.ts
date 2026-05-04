import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";

const DEFAULT_PROMPT_MAX_BYTES = 64 * 1024;
const DEFAULT_OUTPUT_MAX_BYTES = 64 * 1024;
const MAX_STDIO_BYTES = 128 * 1024;

const ALLOWED_ENV_KEYS = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
];

export class CodexExecError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CodexExecError";
    this.code = code;
  }
}

export async function runCodexExec(options: {
  codexCommand: string;
  codexHome: string;
  model: string | undefined;
  tempDir: string;
  schemaPath: string;
  outputPath: string;
  prompt: string;
  timeoutMs: number;
  imagePath?: string;
  promptMaxBytes?: number;
  outputMaxBytes?: number;
}): Promise<void> {
  const promptMaxBytes = options.promptMaxBytes ?? DEFAULT_PROMPT_MAX_BYTES;
  if (Buffer.byteLength(options.prompt, "utf-8") > promptMaxBytes) {
    throw new CodexExecError("CODEX_PROMPT_TOO_LARGE", "Codex prompt exceeds configured limit.");
  }

  const args = [
    "--ask-for-approval",
    "never",
    "exec",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--skip-git-repo-check",
    ...(options.imagePath ? ["--image", options.imagePath] : []),
    "--output-schema",
    options.schemaPath,
    "--output-last-message",
    options.outputPath,
    ...(options.model ? ["--model", options.model] : []),
    "-C",
    options.tempDir,
    "-",
  ];

  const controller = new AbortController();
  let timedOut = false;
  const child = spawn(options.codexCommand, args, {
    cwd: options.tempDir,
    detached: process.platform !== "win32",
    env: buildCodexEnv(options.codexHome),
    signal: controller.signal,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdin = writePromptToStdin(child, options.prompt);
  const stdout = collectLimitedStream(child.stdout, MAX_STDIO_BYTES);
  const stderr = collectLimitedStream(child.stderr, MAX_STDIO_BYTES);
  const timer = setTimeout(() => {
    timedOut = true;
    killProcessTree(child);
    controller.abort();
  }, options.timeoutMs);

  try {
    await waitForChild(child, () => timedOut);
    await Promise.allSettled([stdin, stdout, stderr]);
    await ensureOutputFile(options.outputPath, options.outputMaxBytes ?? DEFAULT_OUTPUT_MAX_BYTES);
  } catch (error) {
    await Promise.allSettled([stdin, stdout, stderr]);
    if (timedOut) {
      throw new CodexExecError("CODEX_TIMEOUT", "Codex run timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildCodexEnv(codexHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.PATH = env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
  env.HOME = env.HOME ?? codexHome;
  env.CODEX_HOME = codexHome;
  return env;
}

function writePromptToStdin(child: ChildProcess, prompt: string): Promise<void> {
  return new Promise((resolve) => {
    if (!child.stdin) {
      resolve();
      return;
    }
    child.stdin.once("error", () => resolve());
    child.stdin.end(prompt, () => resolve());
  });
}

async function ensureOutputFile(outputPath: string, maxBytes: number): Promise<void> {
  let stats;
  try {
    stats = await stat(outputPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CodexExecError("CODEX_NO_OUTPUT", "Codex did not write an output file.");
    }
    throw error;
  }
  if (stats.size > maxBytes) {
    throw new CodexExecError("CODEX_OUTPUT_TOO_LARGE", "Codex output exceeds configured limit.");
  }
}

function waitForChild(child: ChildProcess, isTimedOut: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };
    child.once("error", (error) => {
      settle(() => {
        if (isTimedOut()) {
          reject(new CodexExecError("CODEX_TIMEOUT", "Codex run timed out."));
          return;
        }
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new CodexExecError("CODEX_UNAVAILABLE", "Codex binary is unavailable."));
          return;
        }
        reject(error);
      });
    });
    child.once("close", (code) => {
      settle(() => {
        if (isTimedOut()) {
          reject(new CodexExecError("CODEX_TIMEOUT", "Codex run timed out."));
          return;
        }
        if (code !== 0) {
          reject(new CodexExecError("CODEX_INVALID_OUTPUT", `Codex exited with ${code}.`));
          return;
        }
        resolve();
      });
    });
  });
}

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) {
    return;
  }
  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, "SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }
  setTimeout(() => {
    try {
      if (process.platform !== "win32" && child.pid) {
        process.kill(-child.pid, "SIGKILL");
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      // Best effort after timeout.
    }
  }, 1_000).unref();
}

function collectLimitedStream(stream: NodeJS.ReadableStream, limit: number): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      if (size >= limit) {
        return;
      }
      const remaining = limit - size;
      const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
      chunks.push(slice);
      size += slice.byteLength;
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}
