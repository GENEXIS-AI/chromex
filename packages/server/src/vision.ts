import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CodexExecError, runCodexExec } from "./codex-exec.js";

const HEALTH_SNAPSHOT_SCHEMA_VERSION = 1;
const FOOD_PHOTO_SCHEMA_VERSION = 1;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_HEALTH_SCHEMA_PATH = fileURLToPath(
  new URL("../schemas/health_snapshot_extraction.schema.json", import.meta.url),
);
const DEFAULT_FOOD_SCHEMA_PATH = fileURLToPath(
  new URL("../schemas/food_photo_classification.schema.json", import.meta.url),
);
const FORBIDDEN_FOOD_TEXT_PATTERNS = [
  /\bcalor(?:y|ies|ic)\b/iu,
  /\b(?:kcal|cal)\b/iu,
  /\bmacro(?:s|nutrients?)?\b/iu,
  /\b(?:grams?|g)\s+(?:of\s+)?(?:protein|carbs?|carbohydrates?|fat)\b/iu,
  /\b(?:protein|carbs?|carbohydrates?|fat)\s*[:=]?\s*\d+\s*(?:g|grams?)\b/iu,
  /\bweight\s*loss\b/iu,
  /\blose\s+weight\b/iu,
  /\bmedical\s+(?:advice|nutrition)\b/iu,
  /калори/iu,
  /ккал/iu,
  /(?:грамм|г)\s+(?:белк|углевод|жир)/iu,
  /(?:белк|углевод|жир)\S*\s*[:=]?\s*\d+\s*(?:г|грамм)/iu,
  /похуд/iu,
  /медицинск/iu,
];

type VisionTask = "health-snapshot" | "food-photo";

export type VisionRunRequest = {
  task: VisionTask;
  requestId: string;
  filename: string;
  mimeType: string;
  imageBytes: Buffer;
  context: Record<string, unknown>;
};

export type VisionRunResult = {
  schemaVersion: number;
  extraction?: Record<string, unknown>;
  classification?: Record<string, unknown>;
  model: string;
};

export type VisionRunner = {
  describe(): Record<string, unknown>;
  cleanupStaleTempDirs?(): Promise<void>;
  run(request: VisionRunRequest): Promise<VisionRunResult>;
};

export type VisionHttpOptions = {
  token?: string;
  runner?: VisionRunner;
  logger?: Pick<typeof console, "error" | "info" | "warn">;
};

export class VisionRunnerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VisionRunnerError";
    this.code = code;
  }
}

export function createVisionRunnerFromEnv(): CodexVisionRunner {
  return new CodexVisionRunner({
    codexCommand: process.env.CHROMEX_CODEX_BIN ?? "codex",
    codexHome: process.env.CODEX_HOME ?? "/data/codex-home",
    ...(process.env.CHROMEX_VISION_MODEL ? { model: process.env.CHROMEX_VISION_MODEL } : {}),
    healthSchemaPath: process.env.CHROMEX_VISION_SCHEMA_PATH ?? DEFAULT_HEALTH_SCHEMA_PATH,
    foodSchemaPath: process.env.CHROMEX_FOOD_SCHEMA_PATH ?? DEFAULT_FOOD_SCHEMA_PATH,
    tempRoot: process.env.CHROMEX_VISION_TEMP_DIR ?? join(tmpdir(), "chromex-vision"),
    timeoutMs: Number(process.env.CHROMEX_VISION_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  });
}

export function createVisionHttpHandler(options: VisionHttpOptions) {
  const logger = options.logger ?? console;
  const token = options.token?.trim() ?? "";
  const tokenHash = token ? sha256(token) : null;
  const runner = options.runner ?? createVisionRunnerFromEnv();
  let active = false;

  void runner.cleanupStaleTempDirs?.().catch((error) => {
    logger.warn("Vision temp janitor failed.", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return async function handleVisionHttp(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/api/vision/healthz") {
      writeJson(response, tokenHash ? 200 : 503, {
        ok: Boolean(tokenHash),
        schema_version: HEALTH_SNAPSHOT_SCHEMA_VERSION,
        food_schema_version: FOOD_PHOTO_SCHEMA_VERSION,
        token_configured: Boolean(tokenHash),
        endpoints: ["/api/vision/health-snapshot", "/api/vision/food-photo"],
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
      writeJson(response, 503, { ok: false, error: { code: "VISION_TOKEN_NOT_CONFIGURED" } });
      return true;
    }
    if (!hasValidBearerToken(request, tokenHash)) {
      writeJson(response, 401, { ok: false, error: { code: "UNAUTHORIZED" } });
      return true;
    }
    if (active) {
      writeJson(response, 429, { ok: false, error: { code: "VISION_BUSY" } });
      return true;
    }

    let runRequest: VisionRunRequest;
    try {
      const body = await readJsonBody(request);
      runRequest = normalizeVisionRequest(body, task);
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: {
          code: error instanceof VisionRunnerError ? error.code : "INVALID_REQUEST",
        },
      });
      return true;
    }

    const startedAt = Date.now();
    active = true;
    try {
      const result = await runner.run(runRequest);
      const durationMs = Date.now() - startedAt;
      const payload: Record<string, unknown> = {
        ok: true,
        schema_version: result.schemaVersion,
        model: result.model,
        duration_ms: durationMs,
      };
      if (runRequest.task === "food-photo") {
        if (!isRecord(result.classification)) {
          throw new VisionRunnerError("CODEX_INVALID_OUTPUT", "Codex output is missing classification.");
        }
        assertFoodClassificationIsSafe(result.classification);
        payload.classification = result.classification;
      } else {
        if (!isRecord(result.extraction)) {
          throw new VisionRunnerError("CODEX_INVALID_OUTPUT", "Codex output is missing extraction.");
        }
        payload.extraction = result.extraction;
      }
      logger.info("Vision extraction completed.", {
        request_id: runRequest.requestId,
        task: runRequest.task,
        filename: runRequest.filename,
        mime_type: runRequest.mimeType,
        size_bytes: runRequest.imageBytes.byteLength,
        status: "ok",
        source:
          typeof result.extraction?.source === "string"
            ? result.extraction.source
            : "unknown",
        confidence:
          typeof result.classification?.confidence === "string"
            ? result.classification.confidence
            : undefined,
        duration_ms: durationMs,
      });
      writeJson(response, 200, payload);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const code = error instanceof VisionRunnerError ? error.code : "CODEX_INVALID_OUTPUT";
      logger.warn("Vision extraction failed.", {
        request_id: runRequest.requestId,
        task: runRequest.task,
        filename: runRequest.filename,
        mime_type: runRequest.mimeType,
        size_bytes: runRequest.imageBytes.byteLength,
        status: "error",
        source: "unknown",
        duration_ms: durationMs,
        error_code: code,
      });
      writeJson(response, 502, {
        ok: false,
        schema_version:
          runRequest.task === "food-photo"
            ? FOOD_PHOTO_SCHEMA_VERSION
            : HEALTH_SNAPSHOT_SCHEMA_VERSION,
        error: { code },
        duration_ms: durationMs,
      });
    } finally {
      active = false;
    }
    return true;
  };
}

export class CodexVisionRunner implements VisionRunner {
  readonly #codexCommand: string;
  readonly #codexHome: string;
  readonly #model: string | undefined;
  readonly #healthSchemaPath: string;
  readonly #foodSchemaPath: string;
  readonly #tempRoot: string;
  readonly #timeoutMs: number;

  constructor(options: {
    codexCommand: string;
    codexHome: string;
    model?: string;
    healthSchemaPath: string;
    foodSchemaPath: string;
    tempRoot: string;
    timeoutMs: number;
  }) {
    this.#codexCommand = options.codexCommand;
    this.#codexHome = options.codexHome;
    this.#model = options.model;
    this.#healthSchemaPath = options.healthSchemaPath;
    this.#foodSchemaPath = options.foodSchemaPath;
    this.#tempRoot = options.tempRoot;
    this.#timeoutMs = options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  }

  describe(): Record<string, unknown> {
    return {
      type: "codex-exec",
      codex_command: basename(this.#codexCommand),
      codex_home_configured: Boolean(this.#codexHome),
      model: this.#model ?? "codex-default",
      schema_version: HEALTH_SNAPSHOT_SCHEMA_VERSION,
      food_schema_version: FOOD_PHOTO_SCHEMA_VERSION,
      timeout_ms: this.#timeoutMs,
    };
  }

  async cleanupStaleTempDirs(): Promise<void> {
    await mkdir(this.#tempRoot, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.#tempRoot, { withFileTypes: true });
    const cutoff = Date.now() - DEFAULT_TEMP_MAX_AGE_MS;
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const entryPath = join(this.#tempRoot, entry.name);
          const stats = await stat(entryPath).catch(() => null);
          if (!stats || stats.mtimeMs > cutoff) {
            return;
          }
          await rm(entryPath, { recursive: true, force: true, maxRetries: 1 });
        }),
    );
  }

  async run(request: VisionRunRequest): Promise<VisionRunResult> {
    await mkdir(this.#tempRoot, { recursive: true, mode: 0o700 });
    const tempDir = await mkdtemp(join(this.#tempRoot, `${request.requestId}-`));
    const imagePath = join(tempDir, `input${extensionForMimeType(request.mimeType)}`);
    const outputPath = join(tempDir, "codex-output.json");
    const schemaPath =
      request.task === "food-photo" ? this.#foodSchemaPath : this.#healthSchemaPath;
    const prompt =
      request.task === "food-photo"
        ? createFoodPhotoPrompt(request)
        : createVisionPrompt(request);

    try {
      await writeFile(imagePath, request.imageBytes, { mode: 0o600 });
      await ensureSchemaFile(schemaPath);
      await runCodexExec({
        codexCommand: this.#codexCommand,
        codexHome: this.#codexHome,
        model: this.#model,
        tempDir,
        imagePath,
        schemaPath,
        outputPath,
        prompt,
        timeoutMs: this.#timeoutMs,
      }).catch((error) => {
        throw normalizeCodexExecError(error, "Codex vision run failed.");
      });
      return await readCodexVisionOutput(
        outputPath,
        this.#model ?? "codex-default",
        request.task,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true, maxRetries: 2 }).catch(() => undefined);
    }
  }
}

async function readCodexVisionOutput(
  outputPath: string,
  model: string,
  task: VisionTask,
): Promise<VisionRunResult> {
  let raw: string;
  try {
    raw = await readFile(outputPath, "utf-8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new VisionRunnerError("CODEX_NO_OUTPUT", "Codex did not write an output file.");
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VisionRunnerError("CODEX_INVALID_OUTPUT", "Codex output is not valid JSON.");
  }
  const expectedSchemaVersion =
    task === "food-photo" ? FOOD_PHOTO_SCHEMA_VERSION : HEALTH_SNAPSHOT_SCHEMA_VERSION;
  if (!isRecord(parsed) || parsed.schema_version !== expectedSchemaVersion) {
    throw new VisionRunnerError("SCHEMA_VERSION_MISMATCH", "Codex output schema version mismatch.");
  }
  if (task === "food-photo") {
    if (!isRecord(parsed.classification)) {
      throw new VisionRunnerError("CODEX_INVALID_OUTPUT", "Codex output is missing classification.");
    }
    const classification = normalizeFoodClassificationSemantics(parsed.classification);
    assertFoodClassificationIsSafe(classification);
    return {
      schemaVersion: FOOD_PHOTO_SCHEMA_VERSION,
      classification,
      model,
    };
  }
  if (!isRecord(parsed.extraction)) {
    throw new VisionRunnerError("CODEX_INVALID_OUTPUT", "Codex output is missing extraction.");
  }
  return {
    schemaVersion: HEALTH_SNAPSHOT_SCHEMA_VERSION,
    extraction: normalizeExtractionSemantics(parsed.extraction),
    model,
  };
}

function normalizeCodexExecError(error: unknown, fallbackMessage: string): VisionRunnerError {
  if (error instanceof VisionRunnerError) {
    return error;
  }
  if (error instanceof CodexExecError) {
    return new VisionRunnerError(error.code, error.message);
  }
  return new VisionRunnerError("CODEX_INVALID_OUTPUT", fallbackMessage);
}

function normalizeExtractionSemantics(extraction: Record<string, unknown>): Record<string, unknown> {
  const metrics = Array.isArray(extraction.metrics) ? extraction.metrics : [];
  if (metrics.length > 0) {
    return extraction;
  }
  return {
    ...extraction,
    confidence: extraction.confidence === "high" ? "low" : (extraction.confidence ?? "low"),
    source_confidence:
      extraction.source_confidence === "high" ? "low" : (extraction.source_confidence ?? "low"),
    extraction_status: "no_metrics_visible",
    metrics: [],
  };
}

async function ensureSchemaFile(schemaPath: string): Promise<void> {
  try {
    await stat(schemaPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VisionRunnerError("CODEX_INVALID_OUTPUT", "Vision schema file is missing.");
    }
    throw error;
  }
}

function createVisionPrompt(request: VisionRunRequest): string {
  return [
    "Extract visible daily Garmin/Oura metrics from the attached screenshot.",
    "Return only JSON matching the provided schema.",
    `schema_version must be ${HEALTH_SNAPSHOT_SCHEMA_VERSION}.`,
    "Use extraction.source as garmin, oura, or unknown.",
    "Set source_confidence separately from extraction confidence.",
    "Set extraction_status to extracted, partial, or no_metrics_visible.",
    "Extract only visible values. Do not infer trends, baselines, or hidden values.",
    "trend_interpretation_allowed must be false.",
    "Dynamic context JSON:",
    JSON.stringify(request.context),
  ].join("\n");
}

function createFoodPhotoPrompt(request: VisionRunRequest): string {
  return [
    "Classify the attached food photo for a marathon coach app.",
    "Return only JSON matching the provided schema.",
    `schema_version must be ${FOOD_PHOTO_SCHEMA_VERSION}.`,
    "Use only coarse labels: yes, no, unclear, or not_applicable.",
    "Never estimate calories, macro grams, portion weight, or meal weight.",
    "Never give weight-loss advice, medical advice, diet prescriptions, or nutrition targets.",
    "The note must be a short safe summary without calories, macros, grams, or advice.",
    "Set carbs_before_workout or carbs_after_workout only when context supports it; otherwise not_applicable or unclear.",
    "Dynamic context JSON:",
    JSON.stringify(request.context),
  ].join("\n");
}

function normalizeVisionRequest(body: unknown, task: VisionTask): VisionRunRequest {
  if (!isRecord(body)) {
    throw new VisionRunnerError("INVALID_REQUEST", "Request body must be an object.");
  }
  const image = body.image;
  if (!isRecord(image)) {
    throw new VisionRunnerError("INVALID_REQUEST", "Request image is required.");
  }
  const mimeType = typeof image.mime_type === "string" ? image.mime_type.trim().toLowerCase() : "";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new VisionRunnerError("UNSUPPORTED_MIME_TYPE", "Unsupported image MIME type.");
  }
  const base64 = typeof image.base64 === "string" ? image.base64.replace(/\s+/gu, "") : "";
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(base64)) {
    throw new VisionRunnerError("INVALID_BASE64", "Image base64 is invalid.");
  }
  const imageBytes = Buffer.from(base64, "base64");
  if (imageBytes.byteLength === 0) {
    throw new VisionRunnerError("INVALID_BASE64", "Image base64 is empty.");
  }
  if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
    throw new VisionRunnerError("IMAGE_TOO_LARGE", "Image is too large.");
  }
  return {
    task,
    requestId: sanitizeRequestId(body.request_id),
    filename: sanitizeFilename(image.filename),
    mimeType,
    imageBytes,
    context: isRecord(body.context) ? body.context : {},
  };
}

function taskForPath(pathname: string): VisionTask | null {
  if (pathname === "/api/vision/health-snapshot") {
    return "health-snapshot";
  }
  if (pathname === "/api/vision/food-photo") {
    return "food-photo";
  }
  return null;
}

function normalizeFoodClassificationSemantics(
  classification: Record<string, unknown>,
): Record<string, unknown> {
  const textFields = ["note", "missing_fields", "source_assumptions"];
  const normalized = { ...classification };
  for (const field of textFields) {
    if (!(field in normalized)) {
      normalized[field] = field === "note" ? "" : [];
    }
  }
  return normalized;
}

function assertFoodClassificationIsSafe(classification: Record<string, unknown>): void {
  const values = [
    typeof classification.note === "string" ? classification.note : "",
    ...stringArray(classification.missing_fields),
    ...stringArray(classification.source_assumptions),
  ];
  if (values.some((value) => FORBIDDEN_FOOD_TEXT_PATTERNS.some((pattern) => pattern.test(value)))) {
    throw new VisionRunnerError("FOOD_FORBIDDEN_CONTENT", "Food classification included forbidden content.");
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sanitizeRequestId(value: unknown): string {
  const raw = typeof value === "string" ? value : randomUUID();
  const sanitized = raw.replace(/[^A-Za-z0-9_.-]/gu, "-").slice(0, 80);
  return sanitized || randomUUID();
}

function sanitizeFilename(value: unknown): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : "screenshot";
  const sanitized = basename(raw).replace(/[^A-Za-z0-9_. -]/gu, "_").slice(0, 120);
  return sanitized || "screenshot";
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  return ".jpg";
}

function hasValidBearerToken(request: IncomingMessage, expectedTokenHash: Buffer): boolean {
  const header = request.headers.authorization ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const actualTokenHash = sha256(token);
  return actualTokenHash.length === expectedTokenHash.length && timingSafeEqual(actualTokenHash, expectedTokenHash);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new VisionRunnerError("REQUEST_TOO_LARGE", "Request body is too large.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown;
  } catch {
    throw new VisionRunnerError("INVALID_JSON", "Request body is not valid JSON.");
  }
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
