import { spawn } from "node:child_process";
import { appendFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveDefaultDiagnosticLogDir, resolveOpenFolderCommand } from "./platform.js";

export interface DiagnosticLogFolderSnapshot {
  rootDir: string;
  latestLogPath: string;
  files: string[];
}

export interface BridgeDiagnostics {
  record(event: string, details?: Record<string, unknown>): Promise<void>;
  describeLogFolder(): Promise<DiagnosticLogFolderSnapshot>;
  openLogFolder(params?: { folder?: string | null }): Promise<{ opened: true; folder: string }>;
}

type BridgeDiagnosticLogStoreOptions = {
  rootDir?: string;
};

const DEFAULT_LOG_FILENAME = "bridge.log";
const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERN =
  /(?:api[-_]?key|authorization|cookie|credential|session|token|secret|password|base64|bytes|dataurl|data_url)/iu;
const SENSITIVE_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9._-]{3,}/gu,
  /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=_-]+/giu,
] as const;

export class BridgeDiagnosticLogStore implements BridgeDiagnostics {
  readonly #rootDir: string;
  #queue: Promise<void> = Promise.resolve();

  constructor(options: BridgeDiagnosticLogStoreOptions = {}) {
    this.#rootDir = resolve(options.rootDir?.trim() || resolveDefaultDiagnosticLogDir());
  }

  async record(event: string, details: Record<string, unknown> = {}): Promise<void> {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      details: redact(details),
    };
    const line = `${JSON.stringify(entry)}\n`;
    this.#queue = this.#queue.then(async () => {
      await mkdir(this.#rootDir, { recursive: true });
      await appendFile(this.#logPath(), line, "utf8");
    });
    return this.#queue;
  }

  async describeLogFolder(): Promise<DiagnosticLogFolderSnapshot> {
    await mkdir(this.#rootDir, { recursive: true });
    const files = (await readdir(this.#rootDir))
      .filter((file) => file.endsWith(".log"))
      .sort()
      .map((file) => join(this.#rootDir, file));
    const latestLogPath = this.#logPath();
    return {
      rootDir: this.#rootDir,
      latestLogPath,
      files: files.includes(latestLogPath) ? files : [...files, latestLogPath],
    };
  }

  async openLogFolder(params: { folder?: string | null } = {}): Promise<{ opened: true; folder: string }> {
    const snapshot = await this.describeLogFolder();
    const targetFolder = params.folder?.trim() || snapshot.rootDir;
    if (resolve(targetFolder) !== resolve(snapshot.rootDir)) {
      throw new Error("Refusing to open an unknown diagnostics folder.");
    }
    await openLocalFolder(snapshot.rootDir);
    return { opened: true, folder: snapshot.rootDir };
  }

  #logPath(): string {
    return join(this.#rootDir, DEFAULT_LOG_FILENAME);
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (typeof value === "string") {
    return redactStringValue(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(nestedValue),
    ]),
  );
}

function redactStringValue(value: string): string {
  let redacted = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  return redacted;
}

function openLocalFolder(folder: string): Promise<void> {
  const { command, args } = resolveOpenFolderCommand(folder);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
      shell: false,
    });
    child.on("error", reject);
    child.on("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
}
