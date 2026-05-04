import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CodexExecError, runCodexExec } from "./codex-exec.js";

const COACH_CHAT_SCHEMA_VERSION = 1;
const COACH_WEEK_PROPOSAL_SCHEMA_VERSION = 1;
const MAX_BODY_BYTES = 768 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_CHAT_SCHEMA_PATH = fileURLToPath(
  new URL("../schemas/coach_chat_response.schema.json", import.meta.url),
);
const DEFAULT_WEEK_SCHEMA_PATH = fileURLToPath(
  new URL("../schemas/coach_week_proposal.schema.json", import.meta.url),
);
const SECRET_TEXT_PATTERNS = [
  /token/iu,
  /secret/iu,
  /password/iu,
  /initdata/iu,
  /authorization/iu,
  /\/Users\//u,
  /\/tmp\//u,
  /file_path/iu,
  /filename/iu,
];

type CoachTask = "chat" | "week-proposal";

export type CoachRunRequest = {
  task: CoachTask;
  requestId: string;
  message: string;
  context: Record<string, unknown>;
  threadSummary: Array<Record<string, unknown>>;
  selectedUploadIds: number[];
};

export type CoachRunResult = {
  schemaVersion: number;
  response: Record<string, unknown>;
  model: string;
  provider: string;
  reasoningProfile?: string;
};

export type CoachRunner = {
  describe(): Record<string, unknown>;
  run(request: CoachRunRequest): Promise<CoachRunResult>;
};

export type CoachHttpOptions = {
  token?: string;
  runner?: CoachRunner;
  logger?: Pick<typeof console, "error" | "info" | "warn">;
};

export class CoachRunnerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CoachRunnerError";
    this.code = code;
  }
}

export function createCoachRunnerFromEnv(): CodexCoachRunner {
  return new CodexCoachRunner({
    codexCommand: process.env.CHROMEX_CODEX_BIN ?? "codex",
    codexHome: process.env.CODEX_HOME ?? "/data/codex-home",
    ...(process.env.CHROMEX_COACH_MODEL ? { model: process.env.CHROMEX_COACH_MODEL } : {}),
    chatSchemaPath: process.env.CHROMEX_COACH_CHAT_SCHEMA_PATH ?? DEFAULT_CHAT_SCHEMA_PATH,
    weekSchemaPath: process.env.CHROMEX_COACH_WEEK_SCHEMA_PATH ?? DEFAULT_WEEK_SCHEMA_PATH,
    tempRoot: process.env.CHROMEX_COACH_TEMP_DIR ?? join(tmpdir(), "chromex-coach"),
    timeoutMs: Number(process.env.CHROMEX_COACH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  });
}

export function createCoachHttpHandler(options: CoachHttpOptions) {
  const logger = options.logger ?? console;
  const token = options.token?.trim() ?? "";
  const tokenHash = token ? sha256(token) : null;
  const runner = options.runner ?? createCoachRunnerFromEnv();
  let active = false;

  return async function handleCoachHttp(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/api/coach/healthz") {
      writeJson(response, tokenHash ? 200 : 503, {
        ok: Boolean(tokenHash),
        schema_version: COACH_CHAT_SCHEMA_VERSION,
        week_schema_version: COACH_WEEK_PROPOSAL_SCHEMA_VERSION,
        token_configured: Boolean(tokenHash),
        endpoints: ["/api/coach/chat", "/api/coach/week-proposal"],
        runner: runner.describe(),
      });
      return true;
    }
    const task = taskForPath(url.pathname);
    if (task === null) {
      return false;
    }
    if (request.method !== "POST") {
      writeJson(response, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED" } });
      return true;
    }
    if (!tokenHash) {
      writeJson(response, 503, { ok: false, error: { code: "COACH_TOKEN_NOT_CONFIGURED" } });
      return true;
    }
    if (!hasValidBearerToken(request, tokenHash)) {
      writeJson(response, 401, { ok: false, error: { code: "UNAUTHORIZED" } });
      return true;
    }
    if (active) {
      writeJson(response, 429, { ok: false, error: { code: "COACH_BUSY" } });
      return true;
    }

    let runRequest: CoachRunRequest;
    try {
      const body = await readJsonBody(request);
      runRequest = normalizeCoachRequest(body, task);
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: { code: error instanceof CoachRunnerError ? error.code : "INVALID_REQUEST" },
      });
      return true;
    }

    const startedAt = Date.now();
    active = true;
    try {
      const result = await runner.run(runRequest);
      const payload = normalizeCoachResult(result, runRequest.task);
      logger.info("Coach request completed.", {
        request_id: runRequest.requestId,
        task: runRequest.task,
        status: "ok",
        model: result.model,
        provider: result.provider,
        duration_ms: Date.now() - startedAt,
      });
      writeJson(response, 200, {
        ok: true,
        ...payload,
        duration_ms: Date.now() - startedAt,
      });
    } catch (error) {
      const code = error instanceof CoachRunnerError ? error.code : "CODEX_INVALID_OUTPUT";
      logger.warn("Coach request failed.", {
        request_id: runRequest.requestId,
        task: runRequest.task,
        status: "error",
        error_code: code,
        duration_ms: Date.now() - startedAt,
      });
      writeJson(response, code === "CODEX_TIMEOUT" ? 504 : 502, {
        ok: false,
        schema_version:
          runRequest.task === "chat"
            ? COACH_CHAT_SCHEMA_VERSION
            : COACH_WEEK_PROPOSAL_SCHEMA_VERSION,
        error: { code },
        duration_ms: Date.now() - startedAt,
      });
    } finally {
      active = false;
    }
    return true;
  };
}

export class CodexCoachRunner implements CoachRunner {
  readonly #codexCommand: string;
  readonly #codexHome: string;
  readonly #model: string | undefined;
  readonly #chatSchemaPath: string;
  readonly #weekSchemaPath: string;
  readonly #tempRoot: string;
  readonly #timeoutMs: number;

  constructor(options: {
    codexCommand: string;
    codexHome: string;
    model?: string;
    chatSchemaPath: string;
    weekSchemaPath: string;
    tempRoot: string;
    timeoutMs: number;
  }) {
    this.#codexCommand = options.codexCommand;
    this.#codexHome = options.codexHome;
    this.#model = options.model;
    this.#chatSchemaPath = options.chatSchemaPath;
    this.#weekSchemaPath = options.weekSchemaPath;
    this.#tempRoot = options.tempRoot;
    this.#timeoutMs = options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  }

  describe(): Record<string, unknown> {
    return {
      type: "codex-exec",
      codex_command: basename(this.#codexCommand),
      model: this.#model ?? "codex-default",
      schema_version: COACH_CHAT_SCHEMA_VERSION,
      timeout_ms: this.#timeoutMs,
    };
  }

  async run(request: CoachRunRequest): Promise<CoachRunResult> {
    await mkdir(this.#tempRoot, { recursive: true, mode: 0o700 });
    const tempDir = await mkdtemp(join(this.#tempRoot, `${request.requestId}-`));
    const outputPath = join(tempDir, "codex-output.json");
    const schemaPath = request.task === "chat" ? this.#chatSchemaPath : this.#weekSchemaPath;
    try {
      await ensureSchemaFile(schemaPath);
      await writeFile(join(tempDir, "context.json"), JSON.stringify(redactForTempFile(request.context), null, 2), {
        mode: 0o600,
      });
      await runCodexExec({
        codexCommand: this.#codexCommand,
        codexHome: this.#codexHome,
        model: this.#model,
        tempDir,
        schemaPath,
        outputPath,
        prompt: createCoachPrompt(request),
        timeoutMs: this.#timeoutMs,
      }).catch((error) => {
        throw normalizeCodexExecError(error, "Codex coach run failed.");
      });
      return await readCodexCoachOutput(outputPath, this.#model ?? "codex-default", request.task);
    } finally {
      await rm(tempDir, { recursive: true, force: true, maxRetries: 2 }).catch(() => undefined);
    }
  }
}

function normalizeCoachResult(result: CoachRunResult, task: CoachTask): Record<string, unknown> {
  const expected = task === "chat" ? COACH_CHAT_SCHEMA_VERSION : COACH_WEEK_PROPOSAL_SCHEMA_VERSION;
  if (result.schemaVersion !== expected) {
    throw new CoachRunnerError("SCHEMA_VERSION_MISMATCH", "Coach output schema version mismatch.");
  }
  if (containsSecretText(result.response)) {
    throw new CoachRunnerError("SECRET_LEAK_DETECTED", "Coach output contained forbidden sensitive text.");
  }
  return {
    schema_version: result.schemaVersion,
    ...result.response,
    model: result.model,
    provider: result.provider,
    reasoning_profile: result.reasoningProfile,
  };
}

async function readCodexCoachOutput(
  outputPath: string,
  model: string,
  task: CoachTask,
): Promise<CoachRunResult> {
  let raw: string;
  try {
    raw = await readFile(outputPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CoachRunnerError("CODEX_NO_OUTPUT", "Codex did not write output.");
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CoachRunnerError("CODEX_INVALID_OUTPUT", "Codex output is not JSON.");
  }
  if (!isRecord(parsed)) {
    throw new CoachRunnerError("CODEX_INVALID_OUTPUT", "Codex output is not an object.");
  }
  const expected = task === "chat" ? COACH_CHAT_SCHEMA_VERSION : COACH_WEEK_PROPOSAL_SCHEMA_VERSION;
  if (parsed.schema_version !== expected) {
    throw new CoachRunnerError("SCHEMA_VERSION_MISMATCH", "Codex output schema version mismatch.");
  }
  return {
    schemaVersion: expected,
    response: parsed,
    model,
    provider: "codex_gateway",
    reasoningProfile: "max",
  };
}

function createCoachPrompt(request: CoachRunRequest): string {
  if (request.task === "week-proposal") {
    return [
      "You are a read-only Codex gateway for a marathon coach Mini App.",
      "Create only a draft weekly proposal summary. Do not claim to write the DB.",
      "Never expose raw file paths, secrets, tokens, initData, or filenames.",
      `schema_version must be ${COACH_WEEK_PROPOSAL_SCHEMA_VERSION}.`,
      "Use the bounded context in context.json and the user message below.",
      `User message: ${request.message}`,
    ].join("\n");
  }
  return [
    "You are a read-only AI coach inside the Today screen.",
    "Answer in Russian. Explain and recommend, but never mutate the DB or apply plans.",
    "If the user asks to update the week, set create_week_proposal=true.",
    "Never expose raw provider JSON, raw context snapshots, file paths, secret filenames, tokens, or initData.",
    `schema_version must be ${COACH_CHAT_SCHEMA_VERSION}.`,
    "Use the bounded context in context.json.",
    `User message: ${request.message}`,
  ].join("\n");
}

function normalizeCoachRequest(body: unknown, task: CoachTask): CoachRunRequest {
  if (!isRecord(body)) {
    throw new CoachRunnerError("INVALID_REQUEST", "Body must be an object.");
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message && task === "chat") {
    throw new CoachRunnerError("INVALID_REQUEST", "message is required.");
  }
  const context = isRecord(body.context) ? body.context : {};
  if (containsSecretText(context)) {
    throw new CoachRunnerError("FORBIDDEN_CONTEXT", "Context contains forbidden sensitive text.");
  }
  return {
    task,
    requestId: sanitizeRequestId(body.request_id),
    message: message || "Create a draft weekly proposal.",
    context,
    threadSummary: Array.isArray(body.thread_summary)
      ? body.thread_summary.filter(isRecord).slice(-12)
      : [],
    selectedUploadIds: Array.isArray(body.selected_upload_ids)
      ? body.selected_upload_ids.filter((item): item is number => Number.isInteger(item)).slice(0, 20)
      : [],
  };
}

function taskForPath(pathname: string): CoachTask | null {
  if (pathname === "/api/coach/chat") {
    return "chat";
  }
  if (pathname === "/api/coach/week-proposal") {
    return "week-proposal";
  }
  return null;
}

async function ensureSchemaFile(schemaPath: string): Promise<void> {
  try {
    await stat(schemaPath);
  } catch {
    throw new CoachRunnerError("CODEX_INVALID_OUTPUT", "Coach schema file is missing.");
  }
}

function normalizeCodexExecError(error: unknown, fallbackMessage: string): CoachRunnerError {
  if (error instanceof CoachRunnerError) {
    return error;
  }
  if (error instanceof CodexExecError) {
    return new CoachRunnerError(error.code, error.message);
  }
  return new CoachRunnerError("CODEX_INVALID_OUTPUT", fallbackMessage);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new CoachRunnerError("REQUEST_TOO_LARGE", "Request body is too large.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown;
  } catch {
    throw new CoachRunnerError("INVALID_JSON", "Request body is not JSON.");
  }
}

function redactForTempFile(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function containsSecretText(value: unknown): boolean {
  const text = JSON.stringify(value);
  return SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function hasValidBearerToken(request: IncomingMessage, expectedTokenHash: Buffer): boolean {
  const header = request.headers.authorization ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const actualTokenHash = sha256(token);
  return actualTokenHash.length === expectedTokenHash.length && timingSafeEqual(actualTokenHash, expectedTokenHash);
}

function sanitizeRequestId(value: unknown): string {
  const raw = typeof value === "string" ? value : randomUUID();
  const sanitized = raw.replace(/[^A-Za-z0-9_.-]/gu, "-").slice(0, 80);
  return sanitized || randomUUID();
}

function writeJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
