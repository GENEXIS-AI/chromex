import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type CodexAppOption,
  type CodexStructuredInput,
  fitTextToTokenBudget,
  type CodexMcpServerOption,
  normalizeCodexRealtimeVoice,
  type PageContextEnvelope,
  type ProfileTemplate,
  resolveDomContextBudget,
  type VoiceSessionState,
} from "@codex-sidepanel/shared";

import {
  mapApps,
  mapMcpServerStatusResponse,
  mapModels,
  mapPlugins,
  mapRateLimits,
  mapSkills,
  mapThreadSummaries,
  mapThreadTranscript,
  mapTurnSummaries,
} from "./app-server-mappers.js";
import { CodexAppServerClient } from "./codex-app-server.js";
import type { BridgeDiagnostics } from "./diagnostics.js";
import { prepareUserFileAttachments } from "./file-attachments.js";
import { BridgeHarnessRuntime } from "./harness.js";
import { BridgeImageAssetStore, isBridgeImageAssetRef } from "./image-assets.js";
import { createCodexTurnInputItems } from "./prompt.js";
import { InMemoryBridgeSecrets } from "./secrets.js";
import { requestTurnStartWithReasoningSummaryFallback } from "./turn-start.js";
import type {
  AccountStatus,
  BridgeCodexPlane,
  BridgeEvent,
  BridgeImagePlane,
  BridgeVoicePlane,
  ImageEditParams,
  ImageGenerateParams,
  ImagePreviewParams,
  LoginParams,
  PromptSendParams,
  SessionParams,
  ThreadCompactParams,
  ThreadCompactResult,
  VoiceStartParams,
  VoiceStopParams,
} from "./types.js";

type NotificationPayload = {
  method: string;
  params?: Record<string, unknown>;
};

type ImageGenerationItem = {
  id?: string;
  type?: string;
  result?: string;
  savedPath?: string | null;
  saved_path?: string | null;
};

type AgentMessageItem = {
  id?: string;
  type?: string;
  text?: unknown;
  content?: unknown;
  message?: unknown;
  body?: unknown;
  markdown?: unknown;
  output?: unknown;
  final?: unknown;
  value?: unknown;
};

type ThreadScopedEventContext = {
  threadId: string;
  turnId: string;
};

type ContextCompactionItem = {
  id?: string;
  type?: string;
};

type AccountReadResult = {
  account?: { type?: string; email?: string | null; planType?: string | null } | null;
  requiresOpenaiAuth?: boolean;
};

type RetryDelayImpl = (delayMs: number) => Promise<void>;

const INTERNAL_IMAGE_EDIT_PROFILE: ProfileTemplate = {
  id: "image-edit-workflow",
  name: "Image Edit Workflow",
  systemPrompt:
    "You execute non-destructive image editing workflows. Preserve the user's target subject, follow the requested visual transformation, use uploaded/page images as references when provided, and return the edited image preview without exposing internal routing details.",
  defaultContextPolicy: {
    attachCurrentPageByDefault: true,
    allowedReadStrategies: ["vision", "hybrid", "adapter"],
  },
  allowedSources: ["current-page", "image", "selection", "file"],
  preferredActions: ["edit-image"],
  adapterHints: [],
};

const INTERNAL_IMAGE_GENERATE_PROFILE: ProfileTemplate = {
  id: "image-generate-workflow",
  name: "Image Generate Workflow",
  systemPrompt:
    "You execute non-destructive image generation workflows. Use the provided private context as source material, create the requested image asset, and return the generated preview without exposing internal routing details.",
  defaultContextPolicy: {
    attachCurrentPageByDefault: true,
    allowedReadStrategies: ["dom", "adapter", "hybrid"],
  },
  allowedSources: ["current-page", "selection", "file"],
  preferredActions: [],
  adapterHints: [],
};

const COMPACTION_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_PROMPT_RECONNECT_ATTEMPTS = 5;
const BASE_PROMPT_RECONNECT_DELAY_MS = 600;
const MAX_PROMPT_RECONNECT_DELAY_MS = 8_000;

function hasAuthenticatedCodexAccount(result: AccountReadResult): boolean {
  return Boolean(result.account) || result.requiresOpenaiAuth === false;
}

function getCodexAccountPlanType(result: AccountReadResult): string | null {
  if (result.account?.type !== "chatgpt") {
    return null;
  }
  const planType = result.account.planType ?? null;
  return typeof planType === "string" && planType.trim() ? planType.trim().toLowerCase() : null;
}

function getCodexAccountEmail(result: AccountReadResult): string | null {
  const email = result.account?.email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

function isFreeCodexAccount(result: AccountReadResult): boolean {
  return getCodexAccountPlanType(result) === "free";
}

function isApiKeyCodexAccount(result: AccountReadResult): boolean {
  return result.account?.type === "apiKey";
}

function normalizeImageEditParamsForAccount(params: ImageEditParams, account: AccountReadResult): ImageEditParams {
  if (isApiKeyCodexAccount(account)) {
    return params;
  }
  const { size: _size, ...rest } = params;
  return rest;
}

function normalizeImageGenerateParamsForAccount(params: ImageGenerateParams, account: AccountReadResult): ImageGenerateParams {
  if (isApiKeyCodexAccount(account)) {
    return params;
  }
  const { quality: _quality, size: _size, ...rest } = params;
  return rest;
}

function createImageGenerationUnavailableForPlanMessage(planType: string | null): string {
  const planLabel = planType === "free" ? "free ChatGPT accounts" : "this Codex account plan";
  return `Image generation is not available on ${planLabel}. The Codex app-server image_gen tool may require a paid ChatGPT plan or API-key mode with image generation access.`;
}

function toImageGenerationError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isImageGenerationItem(value: unknown): value is ImageGenerationItem {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "imageGeneration";
}

function isAgentMessageItem(value: unknown): value is AgentMessageItem {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "agentMessage";
}

function isContextCompactionItem(value: unknown): value is ContextCompactionItem {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "contextCompaction";
}

function extractAgentMessageText(item: AgentMessageItem): string {
  for (const candidate of [
    item.text,
    item.message,
    item.body,
    item.markdown,
    item.output,
    item.final,
    item.value,
    item.content,
  ]) {
    const text = extractTextContent(candidate);
    if (text) {
      return text;
    }
  }

  return "";
}

function extractTextContent(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => extractTextContent(part, depth + 1))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  const record = asRecord(value);
  if (!record) {
    return "";
  }

  for (const key of ["text", "content", "message", "body", "markdown", "output_text", "output", "final", "value"]) {
    const text = extractTextContent(record[key], depth + 1);
    if (text) {
      return text;
    }
  }

  return "";
}

function getNotificationThreadId(notification: NotificationPayload): string {
  return String(notification.params?.threadId ?? "").trim();
}

function getNotificationTurnId(notification: NotificationPayload): string {
  const turn = notification.params?.turn as { id?: string } | undefined;
  return String(notification.params?.turnId ?? turn?.id ?? "").trim();
}

function notificationBelongsToPrompt(
  notification: NotificationPayload,
  prompt: {
    threadId: string;
    turnId: string;
  },
): boolean {
  const notificationThreadId = getNotificationThreadId(notification);
  if (notificationThreadId && prompt.threadId && notificationThreadId !== prompt.threadId) {
    return false;
  }

  const notificationTurnId = getNotificationTurnId(notification);
  if (prompt.turnId && notificationTurnId && notificationTurnId !== prompt.turnId) {
    return false;
  }

  if (!prompt.turnId && notificationTurnId) {
    return Boolean(notificationThreadId && prompt.threadId && notificationThreadId === prompt.threadId);
  }

  if (!prompt.turnId && prompt.threadId) {
    return notificationThreadId === prompt.threadId;
  }

  return true;
}

function createThreadScopedEventContext(threadId: string, turnId: string): ThreadScopedEventContext {
  return {
    threadId,
    turnId,
  };
}

function createTurnActivityEvent(input: {
  item: unknown;
  status: "running" | "completed";
  threadId: string;
  turnId: string;
}): BridgeEvent | null {
  const item = asRecord(input.item);
  if (!item) {
    return null;
  }
  const rawType = getStringField(item, "type") || "item";
  const type = rawType.toLowerCase();
  const itemId = getStringField(item, "id") || `${rawType}-${input.status}`;
  const base = {
    type: "turn.activity" as const,
    threadId: input.threadId,
    turnId: input.turnId,
    itemId,
    status: input.status,
    timestampMs: Date.now(),
  };

  if (type.includes("reason")) {
    return null;
  }

  if (type.includes("web") || type.includes("search")) {
    return {
      ...base,
      kind: "web",
      title: input.status === "running" ? "Searching the web" : "Web search complete",
      detail: getWebSearchActivityDetail(item, rawType),
    };
  }

  if (type.includes("imagegeneration") || type.includes("image_generation")) {
    return {
      ...base,
      kind: "image",
      title: input.status === "running" ? "Generating image" : "Image generated",
      detail: summarizeString(getNestedString(item, ["prompt"]) || getNestedString(item, ["savedPath"]) || rawType),
    };
  }

  if (type.includes("agentmessage") || type === "message") {
    return null;
  }

  const command = getCommandString(item);
  if (command) {
    const fileCommand = isFileExplorationCommand(command);
    return {
      ...base,
      kind: fileCommand ? "file" : "command",
      title: fileCommand
        ? input.status === "running"
          ? "Exploring files"
          : "File exploration complete"
        : input.status === "running"
          ? "Running command"
          : "Command complete",
      detail: summarizeString(command),
    };
  }

  if (type.includes("file") || type.includes("patch") || type.includes("diff")) {
    return {
      ...base,
      kind: "file",
      title: input.status === "running" ? "Working with files" : "File work complete",
      detail: summarizeString(getNestedString(item, ["path"]) || getNestedString(item, ["filePath"]) || rawType),
    };
  }

  if (type.includes("browser") || type.includes("dom")) {
    return {
      ...base,
      kind: "browser",
      title: input.status === "running" ? "Inspecting browser context" : "Browser context ready",
      detail: summarizeString(getNestedString(item, ["action"]) || getNestedString(item, ["url"]) || rawType),
    };
  }

  if (type.includes("tool") || type.includes("mcp") || type.includes("function")) {
    return {
      ...base,
      kind: "tool",
      title: input.status === "running" ? "Using tool" : "Tool result ready",
      detail: summarizeString(
        getNestedString(item, ["name"]) ||
          getNestedString(item, ["toolName"]) ||
          getNestedString(item, ["server"]) ||
          rawType,
      ),
    };
  }

  return {
    ...base,
    kind: "tool",
    title: input.status === "running" ? "Processing step" : "Step complete",
    detail: summarizeString(rawType),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getStringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
}

function getNestedString(record: Record<string, unknown>, path: string[]): string {
  let cursor: unknown = record;
  for (const segment of path) {
    const next = asRecord(cursor)?.[segment];
    if (next === undefined || next === null) {
      return "";
    }
    cursor = next;
  }
  if (typeof cursor === "string") {
    return cursor.trim();
  }
  if (Array.isArray(cursor) && cursor.every((part) => typeof part === "string")) {
    return cursor.join(" ").trim();
  }
  return "";
}

function getWebSearchActivityDetail(item: Record<string, unknown>, rawType: string): string {
  const query =
    getNestedString(item, ["query"]) ||
    getNestedString(item, ["searchQuery"]) ||
    getNestedString(item, ["input", "query"]) ||
    getNestedString(item, ["arguments", "query"]) ||
    getNestedString(item, ["params", "query"]);
  const url =
    getNestedString(item, ["url"]) ||
    getNestedString(item, ["href"]) ||
    getNestedString(item, ["sourceUrl"]) ||
    getNestedString(item, ["source_url"]) ||
    getNestedString(item, ["result", "url"]) ||
    getNestedString(item, ["output", "url"]) ||
    getNestedString(item, ["page", "url"]);
  if (query && url && !query.includes(url)) {
    return summarizeString(`${query} · ${url}`);
  }
  return summarizeString(query || url || rawType);
}

function getCommandString(item: Record<string, unknown>): string {
  const command = item.command ?? item.cmd ?? asRecord(item.input)?.command ?? asRecord(item.arguments)?.command;
  if (typeof command === "string") {
    return command.trim();
  }
  if (Array.isArray(command)) {
    return command.map((part) => String(part)).join(" ").trim();
  }
  return "";
}

function isFileExplorationCommand(command: string): boolean {
  return /^(?:rg|grep|find|ls|cat|sed|awk|nl|wc|head|tail|stat|tree|fd|git\s+(?:show|diff|status|grep|ls-files))/iu.test(
    command.trim(),
  );
}

function summarizeString(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function shouldRetryPromptFailure(error: unknown, failedAttempts: number): boolean {
  if (failedAttempts >= MAX_PROMPT_RECONNECT_ATTEMPTS) {
    return false;
  }

  const message = getErrorMessage(error).toLowerCase();
  if (!message) {
    return false;
  }

  if (/auth|login|unauthorized|forbidden|permission denied|approval|policy|safety|cancelled|canceled|interrupted|api key/iu.test(message)) {
    return false;
  }

  return /app-server exited|stdin is not writable|stdout is not available|native host disconnected|disconnected|connection|connect|socket|econnreset|epipe|stream|timeout|timed out|temporarily unavailable|server overloaded|retry later|http error:?\s*(?:408|409|425|429|500|502|503|504)|\b(?:408|409|425|429|500|502|503|504)\b|thread not found|no turns for conversation|unknown conversation|not initialized/iu.test(
    message,
  );
}

function isMissingThreadFailure(error: unknown): boolean {
  return /\bthread not found\b|no turns for conversation|unknown conversation/iu.test(getErrorMessage(error));
}

function computePromptRetryDelay(retryAttempt: number): number {
  return Math.min(MAX_PROMPT_RECONNECT_DELAY_MS, BASE_PROMPT_RECONNECT_DELAY_MS * 2 ** Math.max(0, retryAttempt - 1));
}

async function preparePageContextsForPrompt(input: {
  params: PromptSendParams;
  tempDir: string;
}): Promise<{
  contexts: PageContextEnvelope[];
  appendices: string[];
  tempPaths: string[];
}> {
  if (input.params.contexts.length === 0) {
    return {
      contexts: [],
      appendices: [],
      tempPaths: [],
    };
  }

  const budget = resolveDomContextBudget({
    userMessage: input.params.message,
    contextCount: input.params.contexts.length,
    fileAttachmentCount: input.params.fileAttachments?.length ?? 0,
    ...(input.params.model ? { modelId: input.params.model } : {}),
  });
  const contexts: PageContextEnvelope[] = [];
  const appendices: string[] = [];
  const tempPaths: string[] = [];

  for (const [index, context] of input.params.contexts.entries()) {
    const fit = fitTextToTokenBudget(context.domSummary, budget.perContextDomTokens);
    if (!fit.truncated) {
      contexts.push(context);
      continue;
    }

    const filePath = join(input.tempDir, `page-context-${index + 1}.txt`);
    await writeFile(filePath, formatPageContextArtifact(context), "utf8");
    tempPaths.push(filePath);
    contexts.push({
      ...context,
      domSummary: [
        fit.text,
        "",
        "[DOM context note]",
        `The page text exceeded the inline token budget for this model, so only the highest-priority prefix is inlined.`,
        `Full captured page text is available during this turn at: ${filePath}`,
        `Original characters: ${fit.originalChars}; inline characters: ${fit.includedChars}; estimated original tokens: ${fit.originalTokens}; inline token budget: ${budget.perContextDomTokens}.`,
        "If the answer depends on omitted sections, inspect that local file before answering instead of guessing.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    appendices.push(
      [
        "OVERSIZED PAGE CONTEXT FILE",
        `Context: ${index + 1}`,
        `Title: ${context.metadata.title}`,
        `URL: ${context.metadata.url}`,
        `Local path: ${filePath}`,
        "Use this file only when the visible inline DOM context is insufficient for the user's request.",
      ].join("\n"),
    );
  }

  return {
    contexts,
    appendices,
    tempPaths,
  };
}

function formatPageContextArtifact(context: PageContextEnvelope): string {
  return [
    "Chromex captured page context",
    `Title: ${context.metadata.title}`,
    `URL: ${context.metadata.url}`,
    `Domain: ${context.metadata.domain}`,
    context.selectionText ? `Selection:\n${context.selectionText}` : "",
    context.adapterPayload ? `Adapter payload:\n${JSON.stringify(context.adapterPayload, null, 2)}` : "",
    "DOM text:",
    context.domSummary,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "");
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function expandPluginStructuredInputsWithConnectedApps(
  inputs: CodexStructuredInput[] | undefined,
  apps: CodexAppOption[],
): CodexStructuredInput[] | undefined {
  const sourceInputs = inputs ?? [];
  const usableApps = apps.filter((app) => app.isAccessible && app.isEnabled);
  if (sourceInputs.length === 0 || usableApps.length === 0 || !sourceInputs.some(isPluginStructuredInput)) {
    return inputs;
  }

  const expanded: CodexStructuredInput[] = [];
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const append = (input: CodexStructuredInput): void => {
    if (!input.id.trim() || seenIds.has(input.id) || seenPaths.has(input.path)) {
      return;
    }
    expanded.push(input);
    seenIds.add(input.id);
    seenPaths.add(input.path);
  };

  for (const input of sourceInputs) {
    const app = isPluginStructuredInput(input) ? findConnectedAppForPluginMention(input, usableApps) : null;
    if (app) {
      append({
        id: app.id,
        type: "mention",
        name: app.name,
        path: app.path,
        description: app.description,
        token: app.token,
      });
    }
    append(input);
  }

  return expanded;
}

function createTurnApprovalParamsForStructuredInputs(
  inputs: PromptSendParams["structuredInputs"],
): { approvalPolicy: "never" | "on-request"; approvalsReviewer?: "auto_review" } {
  if (!hasExplicitExternalToolMention(inputs)) {
    return { approvalPolicy: "never" };
  }

  return {
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
  };
}

function hasExplicitExternalToolMention(inputs: PromptSendParams["structuredInputs"]): boolean {
  return (
    inputs?.some(
      (input) => input.type === "mention" && /^(?:app|plugin|mcp):\/\//iu.test(input.path.trim()),
    ) ?? false
  );
}

function isPluginStructuredInput(input: CodexStructuredInput): input is CodexStructuredInput & { type: "mention" } {
  return input.type === "mention" && /^plugin:\/\//iu.test(input.path.trim());
}

function findConnectedAppForPluginMention(
  input: CodexStructuredInput & { type: "mention" },
  apps: CodexAppOption[],
): CodexAppOption | null {
  const pluginSlug = pluginSlugFromPath(input.path);
  const pluginTokens = new Set(
    [input.id, input.name, input.token, pluginSlug]
      .map(normalizeStructuredInputMatchValue)
      .filter(Boolean),
  );
  return (
    apps.find((app) =>
      [app.id, app.name, app.token, app.path]
        .map(normalizeStructuredInputMatchValue)
        .some((value) => value && pluginTokens.has(value)),
    ) ?? null
  );
}

function pluginSlugFromPath(path: string): string {
  return /^plugin:\/\/([^@/?#\s]+)/iu.exec(path.trim())?.[1] ?? "";
}

function normalizeStructuredInputMatchValue(value: string): string {
  return (
    value
      .trim()
      .replace(/^\$/u, "")
      .replace(/^app:\/\//iu, "")
      .replace(/^plugin:\/\//iu, "")
      .split("@")[0]
      ?.trim()
      .replace(/[\s_-]+/gu, "")
      .toLowerCase() ?? ""
  );
}

export class AppServerCodexPlane implements BridgeCodexPlane {
  readonly #client: CodexAppServerClient;
  readonly #harness: BridgeHarnessRuntime;
  readonly #secrets: InMemoryBridgeSecrets;
  readonly #emitEvent: ((event: BridgeEvent) => void) | null;
  readonly #tempDirPromise: Promise<string>;
  readonly #imageAssets: BridgeImageAssetStore;
  readonly #diagnostics: BridgeDiagnostics | undefined;
  readonly #retryDelayImpl: RetryDelayImpl;
  #threadId: string | undefined = undefined;
  #activeTurnId: string | null = null;
  #runtimeFeatureEnablementPromise: Promise<void> | null = null;

  constructor(options: {
    client: CodexAppServerClient;
    harness: BridgeHarnessRuntime;
    secrets: InMemoryBridgeSecrets;
    emitEvent?: (event: BridgeEvent) => void;
    imageAssets?: BridgeImageAssetStore;
    diagnostics?: BridgeDiagnostics;
    retryDelayImpl?: RetryDelayImpl;
  }) {
    this.#client = options.client;
    this.#harness = options.harness;
    this.#secrets = options.secrets;
    this.#emitEvent = options.emitEvent ?? null;
    this.#tempDirPromise = mkdtemp(join(tmpdir(), "codex-sidepanel-"));
    this.#imageAssets = options.imageAssets ?? new BridgeImageAssetStore();
    this.#diagnostics = options.diagnostics;
    this.#retryDelayImpl = options.retryDelayImpl ?? delay;
    this.#client.onNotification((notification) => this.#handleNotification(notification));
  }

  async accountStatus(): Promise<AccountStatus> {
    const result = (await this.#client.request("account/read", {
      refreshToken: false,
    })) as AccountReadResult;

    const authMode =
      result.account?.type === "chatgpt"
        ? "chatgpt"
        : result.account?.type === "apiKey"
          ? "apikey"
          : null;

    return {
      authMode,
      codexAuthenticated: hasAuthenticatedCodexAccount(result),
      multimodalAvailable: hasAuthenticatedCodexAccount(result),
      openAiApiKeyConfigured: this.#secrets.hasOpenAiApiKey(),
      email: getCodexAccountEmail(result),
      planType: getCodexAccountPlanType(result),
    };
  }

  async login(params: LoginParams): Promise<unknown> {
    if (params.type === "apiKey") {
      const apiKey = params.apiKey ?? this.#secrets.getOpenAiApiKey();
      if (!apiKey) {
        throw new Error("API key login requires params.apiKey or a configured bridge API key");
      }
      this.#secrets.setOpenAiApiKey(apiKey);
      return this.#client.request("account/login/start", {
        type: "apiKey",
        apiKey,
      });
    }

    return this.#client.request("account/login/start", {
      type: params.type,
    });
  }

  async cancelLogin(params: { loginId: string }): Promise<void> {
    if (!params.loginId.trim()) {
      throw new Error("Login cancellation requires params.loginId");
    }
    await this.#client.request("account/login/cancel", {
      loginId: params.loginId,
    });
  }

  async logout(): Promise<void> {
    await this.#client.request("account/logout");
    this.#secrets.clearOpenAiApiKey();
  }

  async listModels() {
    const result = (await this.#client.request("model/list", {
      limit: 50,
      includeHidden: false,
    })) as { data?: Array<Record<string, unknown>> };
    return mapModels((result.data ?? []) as never);
  }

  async listThreads(params: { cwd?: string; limit?: number; searchTerm?: string }) {
    const cwd = await this.#resolveCwd(params.cwd);
    const result = (await this.#client.request("thread/list", {
      limit: params.limit ?? 12,
      ...(cwd ? { cwd } : {}),
      ...(params.searchTerm ? { searchTerm: params.searchTerm } : {}),
    })) as { data?: Array<Record<string, unknown>> };
    return mapThreadSummaries((result.data ?? []) as never);
  }

  async readThread(params: { threadId: string }) {
    const result = (await this.#client.request("thread/read", {
      threadId: params.threadId,
      includeTurns: true,
    })) as { thread: Record<string, unknown> };
    return mapThreadTranscript(result.thread as never);
  }

  async listTurns(params: { threadId: string; limit?: number }) {
    const result = (await this.#client.request("thread/turns/list", {
      threadId: params.threadId,
      limit: params.limit ?? 50,
    })) as { data?: Array<Record<string, unknown>> };
    return mapTurnSummaries((result.data ?? []) as never);
  }

  async listSkills(params: { cwd?: string; forceReload?: boolean; extraUserRoots?: string[] }) {
    const cwd = await this.#resolveCwd(params.cwd);
    const result = (await this.#client.request("skills/list", {
      ...(cwd ? { cwds: [cwd] } : {}),
      ...(params.forceReload ? { forceReload: true } : {}),
      ...(cwd && params.extraUserRoots?.length
        ? {
            perCwdExtraUserRoots: [
              {
                cwd,
                extraUserRoots: params.extraUserRoots,
              },
            ],
          }
        : {}),
    })) as { data?: Array<Record<string, unknown>> };
    return mapSkills((result.data ?? []) as never);
  }

  async listApps(params: { threadId?: string; forceRefetch?: boolean }) {
    await this.#ensureAppAndPluginRuntimeFeatures();
    const apps: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;
    do {
      const result = (await this.#client.request("app/list", {
        limit: 100,
        ...(cursor ? { cursor } : {}),
        ...(params.forceRefetch ? { forceRefetch: true } : {}),
      })) as { data?: Array<Record<string, unknown>>; nextCursor?: string | null; next_cursor?: string | null };
      apps.push(...(result.data ?? []));
      cursor = result.nextCursor ?? result.next_cursor ?? undefined;
    } while (cursor);
    return mapApps(apps as never);
  }

  async listPlugins(params: { cwd?: string }) {
    await this.#ensureAppAndPluginRuntimeFeatures();
    const cwd = await this.#resolveCwd(params.cwd);
    const result = (await this.#client.request("plugin/list", {
      ...(cwd ? { cwds: [cwd] } : {}),
    })) as Record<string, unknown>;
    return mapPlugins(result as never);
  }

  async listMcpServers(params: { cursor?: string; limit?: number; detail?: "full" | "toolsAndAuthOnly" } = {}) {
    const servers: CodexMcpServerOption[] = [];
    let cursor = params.cursor ?? null;

    do {
      const result = (await this.#client.request("mcpServerStatus/list", {
        limit: params.limit ?? 100,
        detail: params.detail ?? "toolsAndAuthOnly",
        ...(cursor ? { cursor } : {}),
      })) as Record<string, unknown>;
      const page = mapMcpServerStatusResponse(result as never);
      servers.push(...page.servers);
      cursor = page.nextCursor;
    } while (cursor);

    return servers;
  }

  async startMcpOauthLogin(params: { name: string; scopes?: string[]; timeoutSecs?: number }) {
    const result = (await this.#client.request("mcpServer/oauth/login", {
      name: params.name,
      ...(params.scopes?.length ? { scopes: params.scopes } : {}),
      ...(params.timeoutSecs ? { timeoutSecs: params.timeoutSecs } : {}),
    })) as { authorizationUrl?: string; authorization_url?: string };
    return {
      authorizationUrl: result.authorizationUrl ?? result.authorization_url ?? "",
    };
  }

  async callMcpTool(params: {
    threadId: string;
    server: string;
    tool: string;
    arguments?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
  }) {
    const result = (await this.#client.request("mcpServer/tool/call", {
      threadId: params.threadId,
      server: params.server,
      tool: params.tool,
      ...(params.arguments ? { arguments: params.arguments } : {}),
      ...(params._meta ? { _meta: params._meta } : {}),
    })) as {
      content?: unknown[];
      structuredContent?: unknown;
      structured_content?: unknown;
      isError?: boolean;
      is_error?: boolean;
      _meta?: unknown;
    };
    return {
      content: Array.isArray(result.content) ? result.content : [],
      structuredContent: result.structuredContent ?? result.structured_content,
      isError: Boolean(result.isError ?? result.is_error),
      meta: result._meta,
    };
  }

  async reloadMcpServers(): Promise<{ ok: true }> {
    await this.#client.request("config/mcpServer/reload");
    return { ok: true };
  }

  async readRateLimits() {
    const result = (await this.#client.request("account/rateLimits/read")) as {
      rateLimits?: Record<string, unknown> | null;
      rateLimitsByLimitId?: Record<string, Record<string, unknown> | undefined> | null;
    };
    return mapRateLimits(result);
  }

  async openSession(params: SessionParams): Promise<{ threadId: string }> {
    await this.#ensureAppAndPluginRuntimeFeatures();
    const cwd = await this.#resolveCwd(params.cwd);
    const result = (await this.#client.request("thread/start", {
      ...(cwd ? { cwd } : {}),
      ...(params.model ? { model: params.model } : {}),
      approvalPolicy: "never",
      personality: "pragmatic",
      serviceName: "codex-chrome-sidepanel",
      sessionStartSource: "startup",
    })) as { thread: { id: string } };
    this.#threadId = result.thread.id;
    await this.#harness.runHooks("SessionStart", "session", {
      threadId: result.thread.id,
      cwd: cwd ?? "",
      resumed: false,
    });
    return { threadId: result.thread.id };
  }

  async resumeSession(params: { threadId: string }): Promise<{ threadId: string }> {
    await this.#ensureAppAndPluginRuntimeFeatures();
    const cwd = await this.#resolveCwd();
    const result = (await this.#client.request("thread/resume", {
      threadId: params.threadId,
      excludeTurns: true,
      personality: "pragmatic",
    })) as { thread: { id: string } };
    this.#threadId = result.thread.id;
    await this.#harness.runHooks("SessionStart", "session", {
      threadId: result.thread.id,
      cwd: cwd ?? "",
      resumed: true,
    });
    return { threadId: result.thread.id };
  }

  async sendPrompt(
    params: PromptSendParams,
    emit: (event: BridgeEvent) => void,
  ): Promise<{ threadId: string; turnId: string }> {
    await this.#ensureAppAndPluginRuntimeFeatures();
    const cwd = await this.#resolveCwd(params.cwd);
    const tempPaths: string[] = [];
    let threadId = params.threadId ?? this.#threadId ?? "";
    try {
      for (let failedAttempts = 0; ; failedAttempts += 1) {
        let unsubscribe: () => void = () => undefined;
        let turnId = "";
        const outputTasks: Promise<void>[] = [];
        const emittedImageItemIds = new Set<string>();
        const emittedAgentMessageItemIds = new Set<string>();

        try {
          if (!threadId) {
            threadId = (await this.openSession({ ...params, ...(cwd ? { cwd } : {}) })).threadId;
          }

          const completed = new Promise<void>((resolve, reject) => {
            unsubscribe = this.#client.onNotification((notification) => {
              try {
                if (!notificationBelongsToPrompt(notification, { threadId, turnId })) {
                  return;
                }
                const notificationTurnId = getNotificationTurnId(notification);
                const eventContext = createThreadScopedEventContext(threadId, notificationTurnId || turnId);

                if (notification.method === "item/agentMessage/delta") {
                  emit({
                    type: "message.delta",
                    itemId: String(notification.params?.itemId ?? "agent-message"),
                    delta: String(notification.params?.delta ?? ""),
                    ...eventContext,
                  });
                  return;
                }

                if (notification.method === "item/completed") {
                  const item = notification.params?.item as (ImageGenerationItem & AgentMessageItem) | undefined;
                  if (item?.type === "agentMessage") {
                    const itemId = String(item.id ?? "agent-message");
                    const text = extractAgentMessageText(item);
                    if (!text) {
                      void this.#record("message.completed.empty", { itemId, source: "item/completed" });
                      return;
                    }
                    emittedAgentMessageItemIds.add(itemId);
                    emit({
                      type: "message.completed",
                      itemId,
                      text,
                      ...eventContext,
                    });
                    this.#queueGeneratedImagePreviewsFromText(
                      itemId,
                      text,
                      emit,
                      outputTasks,
                      emittedImageItemIds,
                      eventContext,
                    );
                    return;
                  }
                  if (item?.type === "imageGeneration") {
                    this.#queueGeneratedImagePreview(item, emit, outputTasks, emittedImageItemIds, eventContext);
                  }
                  return;
                }

                if (notification.method === "turn/completed") {
                  const completedTurnId = notificationTurnId;
                  const turn = notification.params?.turn as { error?: { message?: string }; items?: unknown[] } | undefined;
                  unsubscribe();
                  if (turn?.error?.message) {
                    reject(new Error(turn.error.message));
                    return;
                  }
                  this.#emitAgentMessagesFromItems(
                    turn?.items ?? [],
                    emit,
                    emittedAgentMessageItemIds,
                    createThreadScopedEventContext(threadId, completedTurnId || turnId),
                  );
                  void Promise.allSettled(outputTasks)
                    .then(() =>
                      this.#emitMissingAgentMessagesFromThread(
                        threadId,
                        completedTurnId || turnId,
                        emit,
                        emittedAgentMessageItemIds,
                      ),
                    )
                    .then(() => this.#emitGeneratedImagesFromThread(threadId, completedTurnId || turnId, emit, emittedImageItemIds))
                    .then(() => resolve())
                    .catch((error) => reject(error instanceof Error ? error : new Error(String(error))));
                }
              } catch (error) {
                unsubscribe();
                reject(error instanceof Error ? error : new Error(String(error)));
              }
            });
          });

          const input = await this.#buildInput({ ...params, threadId }, tempPaths);
          const turn = await requestTurnStartWithReasoningSummaryFallback(
            this.#client,
            (event, details) => this.#record(event, details),
            {
              threadId,
              input,
              ...(cwd ? { cwd } : {}),
              ...(params.model ? { model: params.model } : {}),
              ...(params.serviceTier ? { serviceTier: params.serviceTier } : {}),
              ...(params.reasoningEffort ? { effort: params.reasoningEffort } : {}),
              ...createTurnApprovalParamsForStructuredInputs(params.structuredInputs),
              personality: "pragmatic",
            },
          );
          turnId = turn.turn.id;
          this.#threadId = threadId;
          this.#activeTurnId = turnId;

          await completed;
          await this.#harness
            .runHooks("PromptComplete", `profile:${params.profile.id}`, {
              profileId: params.profile.id,
              threadId,
              turnId,
              cwd: cwd ?? "",
            })
            .catch((error) =>
              this.#record("prompt.complete.hook_failed", {
                profileId: params.profile.id,
                threadId,
                turnId,
                error: getErrorMessage(error),
              }),
            );
          return { threadId, turnId };
        } catch (error) {
          unsubscribe();
          if (emittedAgentMessageItemIds.size > 0 && threadId && turnId) {
            await this.#record("prompt.post_completion_error", {
              threadId,
              turnId,
              emittedAgentMessageCount: emittedAgentMessageItemIds.size,
              error: getErrorMessage(error),
            });
            return { threadId, turnId };
          }
          if (!shouldRetryPromptFailure(error, failedAttempts)) {
            throw error;
          }

          if (isMissingThreadFailure(error)) {
            threadId = "";
            this.#threadId = undefined;
            this.#activeTurnId = null;
          }

          const retryAttempt = failedAttempts + 1;
          const reason = getErrorMessage(error);
          emit({
            type: "prompt.retrying",
            clientRequestId: params.clientRequestId ?? null,
            attempt: retryAttempt,
            maxAttempts: MAX_PROMPT_RECONNECT_ATTEMPTS,
            reason,
          });
          await this.#record("prompt.retrying", {
            clientRequestId: params.clientRequestId ?? null,
            threadId,
            attempt: retryAttempt,
            maxAttempts: MAX_PROMPT_RECONNECT_ATTEMPTS,
            reason,
          });
          await this.#retryDelayImpl(computePromptRetryDelay(retryAttempt));
        }
      }
    } finally {
      await Promise.all(tempPaths.map(async (path) => rm(path, { force: true }).catch(() => undefined)));
    }
  }

  async compactThread(params: ThreadCompactParams = {}): Promise<ThreadCompactResult> {
    const threadId = params.threadId ?? this.#threadId;
    if (!threadId) {
      throw new Error("Cannot compact without an active Codex thread.");
    }
    if (this.#activeTurnId) {
      throw new Error("Cannot compact while another Codex turn is active.");
    }

    const completion = params.waitForCompletion ? this.#waitForCompactionCompletion(threadId) : null;
    try {
      await this.#client.request("thread/compact/start", { threadId });
      this.#threadId = threadId;
      if (!completion) {
        return { threadId, status: "started" };
      }
      const completed = await completion.promise;
      return {
        threadId,
        status: "completed",
        ...(completed.turnId ? { turnId: completed.turnId } : {}),
      };
    } catch (error) {
      completion?.cancel();
      throw error;
    }
  }

  #waitForCompactionCompletion(threadId: string): {
    promise: Promise<{ turnId?: string }>;
    cancel: () => void;
  } {
    let compactTurnId = "";
    let sawCompactionItem = false;
    let unsubscribe: () => void = () => undefined;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const promise = new Promise<{ turnId?: string }>((resolve, reject) => {
      const finish = (result: { turnId?: string }) => {
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }
        unsubscribe();
        resolve(result);
      };
      const fail = (error: Error) => {
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }
        unsubscribe();
        reject(error);
      };

      timeout = setTimeout(() => {
        fail(new Error("Timed out waiting for Codex conversation compaction to finish."));
      }, COMPACTION_WAIT_TIMEOUT_MS);

      unsubscribe = this.#client.onNotification((notification) => {
        const notificationThreadId = String(notification.params?.threadId ?? "");
        if (notificationThreadId && notificationThreadId !== threadId) {
          return;
        }

        if (notification.method === "item/started" && isContextCompactionItem(notification.params?.item)) {
          sawCompactionItem = true;
          compactTurnId = String(notification.params?.turnId ?? compactTurnId);
          return;
        }

        if (notification.method === "item/completed" && isContextCompactionItem(notification.params?.item)) {
          sawCompactionItem = true;
          compactTurnId = String(notification.params?.turnId ?? compactTurnId);
          return;
        }

        if (notification.method === "thread/compacted") {
          const legacyTurnId = String(notification.params?.turnId ?? compactTurnId);
          finish(legacyTurnId ? { turnId: legacyTurnId } : {});
          return;
        }

        if (notification.method !== "turn/completed") {
          return;
        }

        const turn = notification.params?.turn as { id?: string; error?: { message?: string } } | undefined;
        const turnId = String(turn?.id ?? notification.params?.turnId ?? "");
        if (compactTurnId && turnId && turnId !== compactTurnId) {
          return;
        }
        if (!sawCompactionItem && !compactTurnId) {
          return;
        }
        if (turn?.error?.message) {
          fail(new Error(turn.error.message));
          return;
        }
        const completedTurnId = turnId || compactTurnId;
        finish(completedTurnId ? { turnId: completedTurnId } : {});
      });
    });

    return {
      promise,
      cancel: () => {
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }
        unsubscribe();
      },
    };
  }

  #queueGeneratedImagePreview(
    item: ImageGenerationItem,
    emit: (event: BridgeEvent) => void,
    outputTasks: Promise<void>[],
    emittedImageItemIds: Set<string>,
    context: ThreadScopedEventContext,
  ): void {
    const itemId = String(item.id ?? "generated-image");
    if (emittedImageItemIds.has(itemId)) {
      return;
    }

    const task = resolveGeneratedImagePreview(item, this.#imageAssets)
      .then((previewRef) => {
        if (!previewRef || emittedImageItemIds.has(itemId)) {
          void this.#record("message.image.preview.missing", { itemId, source: "item/completed" });
          return;
        }
        emittedImageItemIds.add(itemId);
        void this.#record("message.image.preview.ready", { itemId, previewRef, source: "item/completed" });
        emit({
          type: "message.image",
          itemId,
          previewRef,
          alt: "Generated image",
          ...context,
        });
      })
      .catch((error) => {
        void this.#record("message.image.preview.failed", {
          itemId,
          source: "item/completed",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    outputTasks.push(task);
  }

  #queueGeneratedImagePreviewsFromText(
    itemId: string,
    text: string,
    emit: (event: BridgeEvent) => void,
    outputTasks: Promise<void>[],
    emittedImageItemIds: Set<string>,
    context: ThreadScopedEventContext,
  ): void {
    const task = resolveGeneratedImagePreviewsFromText(text, this.#imageAssets)
      .then((previewRefs) => {
        if (!previewRefs.length) {
          void this.#record("message.image.preview.missing", { itemId, source: "assistant-text" });
        }
        for (const [index, previewRef] of previewRefs.entries()) {
          const imageKey = `${itemId}:text:${index}:${previewRef}`;
          if (emittedImageItemIds.has(imageKey)) {
            continue;
          }
          emittedImageItemIds.add(imageKey);
          void this.#record("message.image.preview.ready", { itemId, previewRef, source: "assistant-text" });
          emit({
            type: "message.image",
            itemId,
            previewRef,
            alt: "Generated image",
            ...context,
          });
        }
      })
      .catch((error) => {
        void this.#record("message.image.preview.failed", {
          itemId,
          source: "assistant-text",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    outputTasks.push(task);
  }

  async #emitGeneratedImagesFromThread(
    threadId: string,
    turnId: string,
    emit: (event: BridgeEvent) => void,
    emittedImageItemIds: Set<string>,
  ): Promise<void> {
    const items = await this.#readGeneratedImageItemsFromThread(threadId, turnId).catch(() => []);
    for (const item of items) {
      const itemId = String(item.id ?? "generated-image");
      if (emittedImageItemIds.has(itemId)) {
        continue;
      }
      const previewRef = await resolveGeneratedImagePreview(item, this.#imageAssets).catch(() => null);
      if (!previewRef) {
        void this.#record("message.image.preview.missing", { itemId, source: "thread/read" });
        continue;
      }
      emittedImageItemIds.add(itemId);
      void this.#record("message.image.preview.ready", { itemId, previewRef, source: "thread/read" });
      emit({
        type: "message.image",
        itemId,
        previewRef,
        alt: "Generated image",
        threadId,
        turnId,
      });
    }
  }

  async #emitMissingAgentMessagesFromThread(
    threadId: string,
    turnId: string,
    emit: (event: BridgeEvent) => void,
    emittedAgentMessageItemIds: Set<string>,
  ): Promise<void> {
    const items = await this.#readAgentMessageItemsFromThread(threadId, turnId).catch(() => []);
    this.#emitAgentMessagesFromItems(
      items,
      emit,
      emittedAgentMessageItemIds,
      createThreadScopedEventContext(threadId, turnId),
    );
  }

  #emitAgentMessagesFromItems(
    items: unknown[],
    emit: (event: BridgeEvent) => void,
    emittedAgentMessageItemIds: Set<string>,
    context: ThreadScopedEventContext,
  ): void {
    for (const item of items) {
      if (!isAgentMessageItem(item)) {
        continue;
      }
      const itemId = String(item.id ?? "agent-message");
      if (emittedAgentMessageItemIds.has(itemId)) {
        continue;
      }
      const text = extractAgentMessageText(item);
      if (!text) {
        continue;
      }
      emittedAgentMessageItemIds.add(itemId);
      void this.#record("message.completed.recovered", { itemId, source: "thread/read" });
      emit({
        type: "message.completed",
        itemId,
        text,
        ...context,
      });
    }
  }

  async #resolveGeneratedImagePreviewFromThread(threadId: string, turnId: string): Promise<string | null> {
    const items = await this.#readGeneratedImageItemsFromThread(threadId, turnId).catch(() => []);
    for (const item of items) {
      const previewRef = await resolveGeneratedImagePreview(item, this.#imageAssets).catch(() => null);
      if (previewRef) {
        return previewRef;
      }
    }
    return null;
  }

  async #readGeneratedImageItemsFromThread(threadId: string, turnId: string): Promise<ImageGenerationItem[]> {
    return (await this.#readTurnItemsFromThread(threadId, turnId)).filter(isImageGenerationItem);
  }

  async #readAgentMessageItemsFromThread(threadId: string, turnId: string): Promise<AgentMessageItem[]> {
    return (await this.#readTurnItemsFromThread(threadId, turnId)).filter(isAgentMessageItem);
  }

  async #readTurnItemsFromThread(threadId: string, turnId: string): Promise<unknown[]> {
    const result = (await this.#client.request("thread/read", {
      threadId,
      includeTurns: true,
    })) as {
      thread?: {
        turns?: Array<{
          id?: string;
          items?: unknown[];
        }>;
      };
    };
    const turns = result.thread?.turns ?? [];
    const turn = (turnId ? turns.find((candidate) => String(candidate.id ?? "") === turnId) : null) ?? turns.at(-1);
    return turn?.items ?? [];
  }

  async steerTurn(params: PromptSendParams & { expectedTurnId: string }): Promise<{ threadId: string; turnId: string }> {
    await this.#ensureAppAndPluginRuntimeFeatures();
    const cwd = await this.#resolveCwd(params.cwd);
    const threadId = params.threadId ?? this.#threadId;
    if (!threadId) {
      throw new Error("Cannot steer a turn without an active thread.");
    }

    const tempPaths: string[] = [];
    try {
      const input = await this.#buildInput(params, tempPaths);
      const result = (await this.#client.request("turn/steer", {
        threadId,
        expectedTurnId: params.expectedTurnId,
        input,
        ...(cwd ? { cwd } : {}),
      })) as { turnId?: string };
      const turnId = result.turnId ?? params.expectedTurnId;
      this.#threadId = threadId;
      this.#activeTurnId = turnId;
      return { threadId, turnId };
    } finally {
      await Promise.all(tempPaths.map(async (path) => rm(path, { force: true }).catch(() => undefined)));
    }
  }

  async interruptTurn(params: { threadId: string; turnId: string }): Promise<{ threadId: string; turnId: string }> {
    await this.#client.request("turn/interrupt", {
      threadId: params.threadId,
      turnId: params.turnId,
    });
    return params;
  }

  #handleNotification(notification: NotificationPayload): void {
    if (notification.method === "account/login/completed") {
      this.#emitEvent?.({
        type: "account.login.completed",
        loginId: String(notification.params?.loginId ?? ""),
        success: Boolean(notification.params?.success),
        error: notification.params?.error ? String(notification.params.error) : null,
      });
      return;
    }

    if (notification.method === "account/updated") {
      this.#emitEvent?.({
        type: "account.updated",
        authMode: (notification.params?.authMode as "chatgpt" | "apikey" | null | undefined) ?? null,
        planType: notification.params?.planType ? String(notification.params.planType) : null,
      });
      return;
    }

    if (notification.method === "turn/started") {
      const turn = notification.params?.turn as { id?: string } | undefined;
      const threadId = String(notification.params?.threadId ?? this.#threadId ?? "");
      const turnId = String(turn?.id ?? "");
      if (!threadId || !turnId) {
        return;
      }

      this.#threadId = threadId;
      this.#activeTurnId = turnId;
      this.#emitEvent?.({
        type: "turn.started",
        activeTurn: {
          threadId,
          turnId,
        },
      });
      return;
    }

    if (notification.method === "turn/completed") {
      const turn = notification.params?.turn as { id?: string } | undefined;
      const threadId = String(notification.params?.threadId ?? this.#threadId ?? "");
      const turnId = String(turn?.id ?? this.#activeTurnId ?? "");
      if (!threadId || !turnId) {
        return;
      }

      if (turnId === this.#activeTurnId) {
        this.#activeTurnId = null;
      }
      this.#emitEvent?.({
        type: "turn.completed",
        threadId,
        turnId,
      });
      return;
    }

    if (notification.method === "item/started" || notification.method === "item/completed") {
      const item = notification.params?.item;
      const threadId = String(notification.params?.threadId ?? this.#threadId ?? "");
      const turnId = String(notification.params?.turnId ?? this.#activeTurnId ?? "");
      if (!threadId || !turnId) {
        return;
      }
      if (isContextCompactionItem(item)) {
        const itemId = String(item.id ?? "context-compaction");
        this.#emitEvent?.({
          type: notification.method === "item/started" ? "context.compaction.started" : "context.compaction.completed",
          threadId,
          turnId,
          itemId,
        });
        return;
      }
      const activity = createTurnActivityEvent({
        item,
        status: notification.method === "item/started" ? "running" : "completed",
        threadId,
        turnId,
      });
      if (activity) {
        this.#emitEvent?.(activity);
      }
      return;
    }

    if (notification.method === "item/mcpToolCall/progress") {
      const threadId = String(notification.params?.threadId ?? this.#threadId ?? "");
      const turnId = String(notification.params?.turnId ?? this.#activeTurnId ?? "");
      const itemId = String(notification.params?.itemId ?? "mcp-tool");
      if (!threadId || !turnId) {
        return;
      }
      this.#emitEvent?.({
        type: "turn.activity",
        threadId,
        turnId,
        itemId,
        kind: "tool",
        title: "Using MCP tool",
        detail: summarizeString(String(notification.params?.message ?? "MCP tool progress")),
        status: "running",
        timestampMs: Date.now(),
      });
      return;
    }

    if (notification.method === "thread/compacted") {
      const threadId = String(notification.params?.threadId ?? this.#threadId ?? "");
      const turnId = String(notification.params?.turnId ?? this.#activeTurnId ?? "");
      if (!threadId || !turnId) {
        return;
      }
      this.#emitEvent?.({
        type: "context.compaction.completed",
        threadId,
        turnId,
        itemId: "context-compaction",
      });
      return;
    }

    if (notification.method === "turn/plan/updated") {
      this.#emitEvent?.({
        type: "turn.plan.updated",
        plan: {
          threadId: String(notification.params?.threadId ?? this.#threadId ?? ""),
          turnId: String(notification.params?.turnId ?? this.#activeTurnId ?? ""),
          explanation: notification.params?.explanation ? String(notification.params.explanation) : null,
          steps: Array.isArray(notification.params?.plan)
            ? notification.params.plan.map((step) => ({
                step: String((step as { step?: string }).step ?? ""),
                status: String((step as { status?: string }).status ?? "pending"),
              }))
            : [],
        },
      });
      return;
    }

    if (notification.method === "turn/diff/updated") {
      this.#emitEvent?.({
        type: "turn.diff.updated",
        diff: {
          threadId: String(notification.params?.threadId ?? this.#threadId ?? ""),
          turnId: String(notification.params?.turnId ?? this.#activeTurnId ?? ""),
          diff: String(notification.params?.diff ?? ""),
        },
      });
      return;
    }

    if (notification.method === "account/rateLimits/updated") {
      this.#emitEvent?.({
        type: "account.rate_limits.updated",
        rateLimits: mapRateLimits({
          rateLimits: (notification.params?.rateLimits as Record<string, unknown> | null | undefined) ?? null,
          rateLimitsByLimitId: null,
        }),
      });
      return;
    }

    if (notification.method === "model/rerouted") {
      this.#emitEvent?.({
        type: "model.rerouted",
        reroute: {
          threadId: String(notification.params?.threadId ?? this.#threadId ?? ""),
          turnId: String(notification.params?.turnId ?? this.#activeTurnId ?? ""),
          fromModel: String(notification.params?.fromModel ?? ""),
          toModel: String(notification.params?.toModel ?? ""),
          reason: String(notification.params?.reason ?? "unknown"),
        },
      });
      return;
    }

    if (notification.method === "skills/changed") {
      this.#emitEvent?.({
        type: "catalog.updated",
        kind: "skills",
      });
      return;
    }

    if (notification.method === "app/list/updated") {
      this.#emitEvent?.({
        type: "catalog.updated",
        kind: "apps",
      });
      return;
    }

    if (notification.method === "mcpServer/oauthLogin/completed") {
      this.#emitEvent?.({
        type: "mcp.oauth.login.completed",
        serverName: String(notification.params?.name ?? ""),
        success: Boolean(notification.params?.success),
        error: notification.params?.error ? String(notification.params.error) : null,
      });
      this.#emitEvent?.({
        type: "catalog.updated",
        kind: "mcp",
      });
      return;
    }

    if (notification.method === "mcpServer/startupStatus/updated") {
      this.#emitEvent?.({
        type: "catalog.updated",
        kind: "mcp",
      });
    }
  }

  async #buildInput(params: PromptSendParams, tempPaths: string[]) {
    const cwd = await this.#resolveCwd(params.cwd);
    const threadId = params.threadId ?? this.#threadId ?? null;
    const promptHooks = await this.#harness.runHooks("PromptSubmit", `profile:${params.profile.id}`, {
      profileId: params.profile.id,
      threadId,
      cwd: cwd ?? "",
      message: params.message,
      contexts: params.contexts.map((context) => ({
        url: context.metadata.url,
        title: context.metadata.title,
        domain: context.metadata.domain,
      })),
    });
    const workspaceInstructions = await this.#harness.resolvePromptInstructions({
      profileId: params.profile.id,
      domains: Array.from(
        new Set(params.contexts.map((context) => context.metadata.domain.trim().toLowerCase()).filter(Boolean)),
      ),
    });
    const preparedFiles = await prepareUserFileAttachments(params.fileAttachments ?? []);
    const contextPreparation = await preparePageContextsForPrompt({
      params,
      tempDir: await this.#tempDirPromise,
    });
    tempPaths.push(...contextPreparation.tempPaths);
    const structuredInputs = await this.#expandStructuredInputsWithConnectedApps(params.structuredInputs);

    return createCodexTurnInputItems(
      {
        ...params,
        ...(structuredInputs ? { structuredInputs } : {}),
        contexts: contextPreparation.contexts,
      },
      async (ref, contextIndex, assetIndex) => {
        const path = await this.#materializeInlineImage(ref, contextIndex, assetIndex);
        tempPaths.push(path);
        return path;
      },
      {
        workspaceInstructions: workspaceInstructions.text,
        promptAppendices: [...promptHooks.appendPrompt, ...contextPreparation.appendices],
        fileSections: preparedFiles.sections,
        uploadedImages: preparedFiles.uploadedImages,
      },
    );
  }

  async #expandStructuredInputsWithConnectedApps(
    structuredInputs: PromptSendParams["structuredInputs"],
  ): Promise<PromptSendParams["structuredInputs"]> {
    if (!structuredInputs?.some((input) => input.type === "mention" && /^plugin:\/\//iu.test(input.path.trim()))) {
      return structuredInputs;
    }

    const apps = await this.listApps({ forceRefetch: true }).catch((error) => {
      void this.#record("structured_inputs.app_expansion_failed", { error: getErrorMessage(error) });
      return [];
    });
    return expandPluginStructuredInputsWithConnectedApps(structuredInputs, apps);
  }

  async #materializeInlineImage(dataUrl: string, contextIndex: number, assetIndex: number): Promise<string> {
    const match = /^data:(.+?);base64,(.+)$/u.exec(dataUrl);
    if (!match) {
      throw new Error("Unsupported inline vision asset. Expected a base64 data URL.");
    }

    const mimeType = match[1] ?? "image/png";
    const base64 = match[2] ?? "";
    const extension = mimeTypeToExtension(mimeType);
    const tempDir = await this.#tempDirPromise;
    const filePath = join(tempDir, `context-${contextIndex + 1}-asset-${assetIndex + 1}.${extension}`);
    await writeFile(filePath, Buffer.from(base64, "base64"));
    return filePath;
  }

  async #resolveCwd(explicitCwd?: string): Promise<string | undefined> {
    const value = explicitCwd?.trim() ? explicitCwd.trim() : await this.#harness.getWorkspaceRoot();
    return value?.trim() ? value.trim() : undefined;
  }

  async #ensureAppAndPluginRuntimeFeatures(): Promise<void> {
    if (!this.#runtimeFeatureEnablementPromise) {
      this.#runtimeFeatureEnablementPromise = this.#client
        .request("experimentalFeature/enablement/set", {
          enablement: {
            apps: true,
            plugins: true,
          },
        })
        .then(() => undefined)
        .catch((error) => {
          this.#runtimeFeatureEnablementPromise = null;
          void this.#record("runtime_features.enablement_failed", {
            features: ["apps", "plugins"],
            error: getErrorMessage(error),
          });
        });
    }
    await this.#runtimeFeatureEnablementPromise;
  }

  async #record(event: string, details: Record<string, unknown>): Promise<void> {
    await this.#diagnostics?.record(event, details).catch(() => undefined);
  }
}

export class CodexVoicePlane implements BridgeVoicePlane {
  readonly #client: CodexAppServerClient;
  readonly #harness: BridgeHarnessRuntime;
  readonly #emitEvent: ((event: BridgeEvent) => void) | null;
  readonly #diagnostics: BridgeDiagnostics | undefined;
  #state: VoiceSessionState = { status: "idle" };
  #threadId: string | null = null;

  constructor(options: {
    client: CodexAppServerClient;
    harness: BridgeHarnessRuntime;
    emitEvent?: (event: BridgeEvent) => void;
    diagnostics?: BridgeDiagnostics;
  }) {
    this.#client = options.client;
    this.#harness = options.harness;
    this.#emitEvent = options.emitEvent ?? null;
    this.#diagnostics = options.diagnostics;
    this.#client.onNotification((notification) => this.#handleNotification(notification));
  }

  async start(params: VoiceStartParams = {}, _emit?: (event: BridgeEvent) => void): Promise<VoiceSessionState> {
    await this.#record("voice.session.start.requested", {
      hasThreadId: Boolean(params.threadId?.trim()),
      hasSdp: Boolean(params.sdp?.trim()),
      outputModality: params.outputModality ?? "audio",
      voice: normalizeCodexRealtimeVoice(params.voice) ?? null,
    });
    const account = (await this.#client.request("account/read", {
      refreshToken: false,
    })) as AccountReadResult;
    if (!hasAuthenticatedCodexAccount(account)) {
      this.#state = {
        status: "error",
        error: "Live voice requires signing in to Codex with ChatGPT or an API key.",
      };
      return this.#state;
    }

    const threadId = params.threadId?.trim() || (await this.#startVoiceThread(params));
    const outputModality = params.outputModality ?? "audio";
    const voice = normalizeCodexRealtimeVoice(params.voice);
    const transport = params.sdp ? "webrtc" : "websocket";
    const sessionId = params.sessionId?.trim() || `sidepanel-voice-${Date.now()}`;
    this.#threadId = threadId;
    this.#state = {
      status: "connecting",
      threadId,
      sessionId,
      transport,
      outputModality,
      realtimeAvailable: true,
    };

    await this.#harness.runHooks("VoiceSessionStart", "voice.session.start", {
      status: "connecting",
      threadId,
      sessionId,
      transport,
      outputModality,
    });

    try {
      await this.#client.request("thread/realtime/start", {
        threadId,
        outputModality,
        sessionId,
        ...(params.prompt ? { prompt: params.prompt } : {}),
        ...(voice ? { voice } : {}),
        ...(params.sdp ? { transport: { type: "webrtc", sdp: params.sdp } } : { transport: { type: "websocket" } }),
      });
      await this.#record("voice.realtime.start.accepted", {
        threadId,
        sessionId,
        transport,
        outputModality,
      });
    } catch (error) {
      await this.#record("voice.realtime.start.failed", {
        threadId,
        sessionId,
        transport,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.#state;
  }

  async stop(params: VoiceStopParams = {}): Promise<void> {
    const threadId = params.threadId?.trim() || this.#threadId;
    await this.#harness.runHooks("VoiceSessionStop", "voice.session.stop", {
      status: "stopping",
      sessionId: this.#state.sessionId,
      threadId,
    });
    if (threadId) {
      await this.#client.request("thread/realtime/stop", { threadId });
      this.#emitEvent?.({
        type: "voice.session.stopped",
        threadId,
        reason: null,
      });
    }
    this.#threadId = null;
    this.#state = { status: "idle", realtimeAvailable: true };
  }

  async appendText(params: { threadId?: string; text: string }): Promise<void> {
    const threadId = params.threadId?.trim() || this.#threadId;
    const text = params.text.trim();
    if (!threadId) {
      throw new Error("No active Codex realtime voice thread.");
    }
    if (!text) {
      return;
    }
    await this.#client.request("thread/realtime/appendText", {
      threadId,
      text,
    });
    await this.#record("voice.realtime.text.appended", {
      threadId,
      length: text.length,
    });
  }

  async appendAudio(params: {
    threadId?: string;
    audio: {
      data: string;
      sampleRate: number;
      numChannels: number;
      samplesPerChannel?: number;
      itemId?: string;
    };
  }): Promise<void> {
    const threadId = params.threadId?.trim() || this.#threadId;
    if (!threadId) {
      throw new Error("No active Codex realtime voice thread.");
    }
    const data = params.audio.data.trim();
    if (!data) {
      return;
    }
    const sampleRate = Math.max(1, Math.floor(params.audio.sampleRate));
    const numChannels = Math.max(1, Math.floor(params.audio.numChannels));
    const samplesPerChannel =
      typeof params.audio.samplesPerChannel === "number"
        ? Math.max(1, Math.floor(params.audio.samplesPerChannel))
        : undefined;
    await this.#client.request("thread/realtime/appendAudio", {
      threadId,
      audio: {
        data,
        sampleRate,
        numChannels,
        ...(samplesPerChannel ? { samplesPerChannel } : {}),
        ...(params.audio.itemId ? { itemId: params.audio.itemId } : {}),
      },
    });
  }

  async #startVoiceThread(params: VoiceStartParams): Promise<string> {
    const cwd = params.cwd?.trim() || (await this.#harness.getWorkspaceRoot());
    const result = (await this.#client.request("thread/start", {
      ...(cwd ? { cwd } : {}),
      ephemeral: true,
      approvalPolicy: "never",
      personality: "pragmatic",
      serviceName: "codex-chrome-sidepanel-voice",
      sessionStartSource: "startup",
    })) as { thread?: { id?: string } };
    const threadId = result.thread?.id;
    if (!threadId) {
      throw new Error("Codex app-server did not return a thread id for realtime voice.");
    }
    await this.#record("voice.thread.started", { threadId, cwd: cwd ?? null, ephemeral: true });
    return threadId;
  }

  #handleNotification(notification: NotificationPayload): void {
    const threadId = String(notification.params?.threadId ?? "");
    if (!threadId || (this.#threadId && threadId !== this.#threadId)) {
      return;
    }

    switch (notification.method) {
      case "thread/realtime/started": {
        const sessionId = notification.params?.sessionId ? String(notification.params.sessionId) : null;
        this.#state = {
          ...this.#state,
          status: "active",
          threadId,
          ...(sessionId ? { sessionId } : {}),
        };
        this.#emitEvent?.({
          type: "voice.session.started",
          threadId,
          sessionId,
          transport: this.#state.transport === "websocket" ? "websocket" : "webrtc",
        });
        void this.#harness.runHooks("VoiceSessionStart", "voice.session.active", {
          status: "active",
          threadId,
          sessionId,
          transport: this.#state.transport,
        });
        return;
      }
      case "thread/realtime/sdp":
        this.#emitEvent?.({
          type: "voice.sdp",
          threadId,
          sdp: String(notification.params?.sdp ?? ""),
        });
        return;
      case "thread/realtime/transcript/delta":
        this.#emitEvent?.({
          type: "voice.transcript.delta",
          threadId,
          role: String(notification.params?.role ?? "assistant"),
          delta: String(notification.params?.delta ?? ""),
        });
        return;
      case "thread/realtime/transcript/done":
        this.#emitEvent?.({
          type: "voice.transcript.done",
          threadId,
          role: String(notification.params?.role ?? "assistant"),
          text: String(notification.params?.text ?? ""),
        });
        return;
      case "thread/realtime/itemAdded":
        this.#emitEvent?.({
          type: "voice.item_added",
          threadId,
          item: asRecord(notification.params?.item) ?? {},
        });
        return;
      case "thread/realtime/outputAudio/delta":
        this.#emitEvent?.({
          type: "voice.output_audio.delta",
          threadId,
          audio: (notification.params?.audio as Record<string, unknown> | undefined) ?? {},
        });
        return;
      case "thread/realtime/error": {
        const message = String(notification.params?.message ?? "Realtime voice failed.");
        void this.#record("voice.realtime.error", { threadId, message });
        this.#state = {
          status: "error",
          threadId,
          error: message,
          realtimeAvailable: true,
        };
        this.#emitEvent?.({
          type: "voice.error",
          threadId,
          message,
        });
        return;
      }
      case "thread/realtime/closed":
        this.#state = { status: "idle", realtimeAvailable: true };
        this.#emitEvent?.({
          type: "voice.session.stopped",
          threadId,
          reason: notification.params?.reason ? String(notification.params.reason) : null,
        });
        return;
      default:
        return;
    }
  }

  async #record(event: string, details: Record<string, unknown>): Promise<void> {
    await this.#diagnostics?.record(event, details).catch(() => undefined);
  }

}

export class CodexImagePlane implements BridgeImagePlane {
  readonly #client: CodexAppServerClient;
  readonly #harness: BridgeHarnessRuntime;
  readonly #jobs = new Map<string, { previewRef: string; previewRefs: string[] }>();
  readonly #tempDirPromise: Promise<string>;
  readonly #imageAssets: BridgeImageAssetStore;
  readonly #diagnostics: BridgeDiagnostics | undefined;

  constructor(
    harness: BridgeHarnessRuntime,
    options: { imageAssets?: BridgeImageAssetStore; client?: CodexAppServerClient; diagnostics?: BridgeDiagnostics } = {},
  ) {
    this.#harness = harness;
    this.#client = options.client ?? new CodexAppServerClient({ experimentalApi: true });
    this.#imageAssets = options.imageAssets ?? new BridgeImageAssetStore();
    this.#diagnostics = options.diagnostics;
    this.#tempDirPromise = mkdtemp(join(tmpdir(), "codex-sidepanel-image-"));
  }

  async #resolveGeneratedImagePreviewFromThread(threadId: string, turnId: string): Promise<string | null> {
    return (await this.#resolveGeneratedImagePreviewsFromThread(threadId, turnId))[0] ?? null;
  }

  async #resolveGeneratedImagePreviewsFromThread(threadId: string, turnId: string): Promise<string[]> {
    const items = await this.#readGeneratedImageItemsFromThread(threadId, turnId).catch(() => []);
    const previewRefs: string[] = [];
    for (const item of [...items].reverse()) {
      const previewRef = await resolveGeneratedImagePreview(item, this.#imageAssets).catch(() => null);
      if (previewRef) {
        previewRefs.push(previewRef);
      }
    }
    return uniquePreviewRefs(previewRefs);
  }

  async #readGeneratedImageItemsFromThread(threadId: string, turnId: string): Promise<ImageGenerationItem[]> {
    const result = (await this.#client.request("thread/read", {
      threadId,
      includeTurns: true,
    })) as {
      thread?: {
        turns?: Array<{
          id?: string;
          items?: unknown[];
        }>;
      };
    };
    const turns = result.thread?.turns ?? [];
    const turn = (turnId ? turns.find((candidate) => String(candidate.id ?? "") === turnId) : null) ?? turns.at(-1);
    return (turn?.items ?? []).filter(isImageGenerationItem);
  }

  async startEdit(params: ImageEditParams): Promise<{ jobId: string; previewRef: string }> {
    const jobId = `image-${Date.now()}`;
    await this.#record("image.edit.start", {
      jobId,
      promptPreview: params.prompt.slice(0, 200),
      promptLength: params.prompt.length,
      mimeType: params.image.mimeType,
      filename: params.image.filename ?? null,
      referenceCount: params.referenceImages?.length ?? 0,
    });

    try {
      const account = (await this.#client.request("account/read", {
        refreshToken: false,
      })) as AccountReadResult;
      await this.#record("image.edit.account.checked", {
        jobId,
        authenticated: hasAuthenticatedCodexAccount(account),
        accountType: account.account?.type ?? null,
        requiresOpenaiAuth: account.requiresOpenaiAuth ?? null,
      });
      if (!hasAuthenticatedCodexAccount(account)) {
        throw new Error("Image editing requires signing in to Codex. ChatGPT login is enough; an API key is only a fallback.");
      }
      if (isFreeCodexAccount(account)) {
        throw new Error(createImageGenerationUnavailableForPlanMessage(getCodexAccountPlanType(account)));
      }
      const accountParams = normalizeImageEditParamsForAccount(params, account);

      await this.#harness.runHooks("ImageEditStart", "image.edit", {
        prompt: accountParams.prompt,
        mimeType: accountParams.image.mimeType,
        filename: accountParams.image.filename ?? null,
        size: accountParams.size ?? null,
      });

      const inputImagePath = await this.#writeInputImage(accountParams.image);
      const referenceImagePaths = await Promise.all((accountParams.referenceImages ?? []).map((image) => this.#writeInputImage(image)));
      await this.#record("image.edit.input.ready", {
        jobId,
        inputImagePath,
        referenceImageCount: referenceImagePaths.length,
      });
      const previewRef = await this.#runCodexImageEdit(accountParams, inputImagePath, referenceImagePaths, jobId);
      this.#jobs.set(jobId, { previewRef, previewRefs: [previewRef] });
      await this.#harness.runHooks("ImageEditComplete", "image.edit", {
        jobId,
        previewRef,
      });
      await this.#record("image.edit.completed", { jobId, previewRef });
      return { jobId, previewRef };
    } catch (error) {
      const imageError = toImageGenerationError(error);
      await this.#record("image.edit.failed", {
        jobId,
        error: imageError.message,
      });
      throw imageError;
    }
  }

  async startGenerate(
    params: ImageGenerateParams,
    emit?: (event: BridgeEvent) => void,
  ): Promise<{ jobId: string; previewRef: string; previewRefs: string[] }> {
    const jobId = `image-generate-${Date.now()}`;
    await this.#record("image.generate.start", {
      jobId,
      clientRequestId: params.clientRequestId ?? null,
      workflow: params.workflow ?? null,
      promptPreview: params.prompt.slice(0, 200),
      promptLength: params.prompt.length,
      contextCount: params.contexts?.length ?? 0,
      model: params.model ?? "gpt-image-2",
      quality: params.quality ?? null,
      size: params.size ?? null,
    });

    try {
      const account = (await this.#client.request("account/read", {
        refreshToken: false,
      })) as AccountReadResult;
      await this.#record("image.generate.account.checked", {
        jobId,
        authenticated: hasAuthenticatedCodexAccount(account),
        accountType: account.account?.type ?? null,
        requiresOpenaiAuth: account.requiresOpenaiAuth ?? null,
      });
      if (!hasAuthenticatedCodexAccount(account)) {
        throw new Error("Image generation requires signing in to Codex. ChatGPT login is enough; an API key is only a fallback.");
      }
      if (isFreeCodexAccount(account)) {
        throw new Error(createImageGenerationUnavailableForPlanMessage(getCodexAccountPlanType(account)));
      }
      const accountParams = normalizeImageGenerateParamsForAccount(params, account);

      await this.#harness.runHooks("ImageEditStart", "image.edit", {
        prompt: accountParams.prompt,
        mode: "generate",
        model: accountParams.model ?? "gpt-image-2",
        quality: accountParams.quality ?? null,
        size: accountParams.size ?? null,
      });

      const previewRefs = await this.#runCodexImageGenerate(accountParams, jobId, emit);
      const previewRef = previewRefs[0];
      if (!previewRef) {
        throw new Error("Codex completed image generation without returning a generated image preview.");
      }
      this.#jobs.set(jobId, { previewRef, previewRefs });
      await this.#harness.runHooks("ImageEditComplete", "image.edit", {
        jobId,
        mode: "generate",
        previewRef,
        previewRefs,
      });
      await this.#record("image.generate.completed", { jobId, previewRef, previewCount: previewRefs.length });
      return { jobId, previewRef, previewRefs };
    } catch (error) {
      const imageError = toImageGenerationError(error);
      await this.#record("image.generate.failed", {
        jobId,
        error: imageError.message,
      });
      throw imageError;
    }
  }

  async previewEdit(params: ImagePreviewParams): Promise<{ previewRef: string }> {
    const job = this.#jobs.get(params.jobId);
    if (!job) {
      throw new Error(`Unknown image job: ${params.jobId}`);
    }

    return { previewRef: job.previewRef };
  }

  async readAsset(params: { previewRef: string; offset?: number | null; length?: number | null }) {
    return this.#imageAssets.read(params.previewRef, params);
  }

  async deleteAsset(params: { previewRef: string }) {
    return this.#imageAssets.delete(params.previewRef);
  }

  async describeAssetFolder() {
    return this.#imageAssets.describeFolders();
  }

  async openAssetFolder(params: { folder?: string | null } = {}) {
    return this.#imageAssets.openFolder(params.folder);
  }

  async #runCodexImageEdit(
    params: ImageEditParams,
    inputImagePath: string,
    referenceImagePaths: string[],
    jobId: string,
  ): Promise<string> {
    const cwd = normalizeOptionalCwd(await this.#harness.getWorkspaceRoot());
    const profile = INTERNAL_IMAGE_EDIT_PROFILE;
    const promptHooks = await this.#harness.runHooks("PromptSubmit", `profile:${profile.id}`, {
      profileId: profile.id,
      threadId: null,
      cwd: cwd ?? "",
      message: params.prompt,
      contexts: [],
    });
    const workspaceInstructions = await this.#harness.resolvePromptInstructions({
      profileId: profile.id,
      domains: [],
    });
    const imagegenSkill = await this.#findImagegenSkill(cwd ?? "");
    const input = await createCodexTurnInputItems(
      {
        profile,
        message: [
          "$imagegen Use Codex's built-in image generation capability to edit the attached image.",
          `Editing request: ${params.prompt}`,
          "Requirements:",
          "- Target: edit the first attached image. It may be an uploaded image, a web image dropped into the composer, a clicked page image, or a visible-page crop selected by the extension.",
          "- Preserve the original subject, composition, and key content unless the request explicitly changes them.",
          "- Treat the first attached image as the edit target and any additional attached images as references only.",
          "- If the first attached image is a browser/page capture, do not edit browser chrome, side-panel UI, captions, reactions, or surrounding page controls unless the user explicitly asks to modify them.",
          "- For object replacement requests, replace only the requested object or subject while preserving the scene, lighting, camera angle, and believable scale.",
          "- If the request asks to translate, localize, rewrite, or replace visible text, OCR the target image first, replace the text in-place in the requested language, and preserve the original layout, hierarchy, and visual style as much as possible.",
          "- Produce exactly one final edited image.",
          "- Save the final image and mention the saved path in the response.",
        ].join("\n"),
        contexts: [
          {
            metadata: {
              url: "codex://image-edit",
              title: "Image edit target",
              domain: "codex.local",
            },
            selectionText: "",
            domSummary:
              referenceImagePaths.length > 0
                ? "The first attached local image is the edit target. Additional attached images are references only."
                : "The attached local image is the edit target for this request.",
            visionAssets: [
              { ref: inputImagePath, kind: "page-image" },
              ...referenceImagePaths.map((ref) => ({ ref, kind: "page-image" as const })),
            ],
            adapterPayload: null,
            privacyFlags: {
              containsSensitiveFormData: false,
              userConsentedToHistory: false,
            },
          },
        ],
        ...(imagegenSkill
          ? {
              structuredInputs: [
                {
                  id: `skill:${imagegenSkill.id}`,
                  type: "skill" as const,
                  name: imagegenSkill.name,
                  path: imagegenSkill.path,
                  description: imagegenSkill.description,
                  token: imagegenSkill.token,
                },
              ],
            }
          : {}),
      },
      async () => {
        throw new Error("Unexpected inline image materialization request for local image edit input.");
      },
      {
        workspaceInstructions: workspaceInstructions.text,
        promptAppendices: promptHooks.appendPrompt,
      },
    );
    const thread = (await this.#client.request("thread/start", {
      ...(cwd ? { cwd } : {}),
      approvalPolicy: "never",
      personality: "pragmatic",
      ephemeral: true,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    })) as { thread: { id: string } };
    const threadId = thread.thread.id;
    await this.#record("image.edit.thread.started", { jobId, threadId, cwd: cwd ?? "" });
    let turnId = "";
    let unsubscribe: () => void = () => undefined;
    let previewRef = "";
    let assistantText = "";
    let previewError: Error | null = null;
    const previewTasks: Promise<void>[] = [];

    const completed = new Promise<string>((resolve, reject) => {
      unsubscribe = this.#client.onNotification((notification) => {
        try {
          const notificationTurn = notification.params?.turn as { id?: string; error?: { message?: string } } | undefined;
          const notificationTurnId = String(notification.params?.turnId ?? notificationTurn?.id ?? "");
          if (turnId && notificationTurnId && notificationTurnId !== turnId) {
            return;
          }
          const notificationThreadId = String(notification.params?.threadId ?? "");
          if (notificationThreadId && notificationThreadId !== threadId) {
            return;
          }

          if (notification.method === "item/completed") {
            const item = notification.params?.item as (ImageGenerationItem & { text?: string }) | undefined;
            if (item?.type === "agentMessage" && item.text?.trim()) {
              assistantText = item.text.trim();
              return;
            }
            if (item?.type === "imageGeneration") {
              void this.#record("image.edit.image.item", {
                jobId,
                threadId,
                turnId: notificationTurnId || turnId,
                itemId: item.id ?? null,
                hasResult: Boolean(item.result),
                savedPath: item.savedPath ?? item.saved_path ?? null,
              });
              const task = resolveGeneratedImagePreview(item, this.#imageAssets)
                .then((nextPreviewRef) => {
                  if (nextPreviewRef) {
                    previewRef = nextPreviewRef;
                  }
                })
                .catch((error) => {
                  previewError = error instanceof Error ? error : new Error(String(error));
                });
              previewTasks.push(task);
            }
            return;
          }

          if (notification.method === "turn/completed") {
            unsubscribe();
            void this.#record("image.edit.turn.completed", {
              jobId,
              threadId,
              turnId: String(notificationTurn?.id ?? turnId),
              hasPreviewRef: Boolean(previewRef),
              hasAssistantText: Boolean(assistantText),
              error: notificationTurn?.error?.message ?? null,
            });
            void Promise.allSettled(previewTasks).then(async () => {
              if (notificationTurn?.error?.message) {
                reject(new Error(notificationTurn.error.message));
                return;
              }
              if (previewError) {
                reject(previewError);
                return;
              }
              if (!previewRef) {
                previewRef =
                  (await this.#resolveGeneratedImagePreviewFromThread(
                    threadId,
                    String(notificationTurn?.id ?? turnId),
                  )) ?? "";
              }
              if (!previewRef && assistantText) {
                previewRef = (await resolveGeneratedImagePreviewsFromText(assistantText, this.#imageAssets))[0] ?? "";
              }
              if (previewRef) {
                await this.#record("image.edit.preview.ready", { jobId, threadId, turnId, previewRef });
                resolve(previewRef);
                return;
              }
              reject(
                new Error(
                  assistantText || "Codex completed the image edit without returning a generated image preview.",
                ),
              );
            });
          }
        } catch (error) {
          unsubscribe();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    try {
      const turn = await requestTurnStartWithReasoningSummaryFallback(
        this.#client,
        (event, details) => this.#record(event, details),
        {
          threadId,
          input,
          ...(cwd ? { cwd } : {}),
          approvalPolicy: "never",
          personality: "pragmatic",
        },
      );
      turnId = turn.turn.id;
      await this.#record("image.edit.turn.started", { jobId, threadId, turnId });
      return await completed;
    } catch (error) {
      unsubscribe();
      throw error;
    }
  }

  async #runCodexImageGenerate(
    params: ImageGenerateParams,
    jobId: string,
    emit?: (event: BridgeEvent) => void,
  ): Promise<string[]> {
    const cwd = normalizeOptionalCwd(await this.#harness.getWorkspaceRoot());
    const profile = INTERNAL_IMAGE_GENERATE_PROFILE;
    const contexts = params.contexts?.length ? params.contexts : [createEmptyImageGenerationContext()];
    const promptHooks = await this.#harness.runHooks("PromptSubmit", `profile:${profile.id}`, {
      profileId: profile.id,
      threadId: null,
      cwd: cwd ?? "",
      message: params.prompt,
      contexts,
    });
    const workspaceInstructions = await this.#harness.resolvePromptInstructions({
      profileId: profile.id,
      domains: contexts.map((context) => context.metadata.domain).filter(Boolean),
    });
    const imagegenSkill = await this.#findImagegenSkill(cwd ?? "");
    const model = params.model ?? "gpt-image-2";
    const workflow = params.workflow ?? "generated-image";
    const renderTarget = createImageGenerateRenderTarget(params);
    const preparedFiles = await prepareUserFileAttachments(params.fileAttachments ?? []);
    const conversationContext = params.conversationContext?.trim().slice(0, 8_000) ?? "";
    const tempPaths: string[] = [];
    let input: Awaited<ReturnType<typeof createCodexTurnInputItems>>;
    try {
      input = await createCodexTurnInputItems(
        {
          profile,
          message: [
            createImageGenerateWorkflowInstruction(workflow),
            `Generation request: ${params.prompt}`,
            conversationContext
              ? [
                  "",
                  "PREVIOUS CONVERSATION CONTEXT - DO NOT DISPLAY VERBATIM",
                  conversationContext,
                  "Use this only to preserve the user's preferences, constraints, and terminology from the current chat.",
                ].join("\n")
              : "",
            "Requirements:",
            "- Generate a new image, not an edit of a missing input image.",
            `- Image model target: ${model}.`,
            renderTarget ? `- Render target: ${renderTarget}.` : "",
            `- Use case: ${createImageGenerateUseCase(workflow)}.`,
            "- Treat all attached page data as PRIVATE PAGE CONTEXT and use it only as source material.",
            "- If the generation request contains or references a user-provided prompt, execute that prompt as the visual brief. Do not rewrite it unless the user explicitly asks for prompt text instead of an image.",
            "- Do not invent metrics, quotes, dates, citations, charts, logos, or facts that are not present in the page context.",
            "- If exact numbers are unavailable, use qualitative callouts instead of fake numbers.",
            "- Prioritize readable typography, concise labels, clear hierarchy, high contrast, and generous whitespace.",
            "- Keep in-image text crisp, correctly spelled, and easy to read.",
            "- For a normal single-image request, produce exactly one final image.",
            "- If the user explicitly asks for a slide deck or multiple slide images, generate the slide images sequentially in this same Codex turn, one image-generation tool call per slide, in slide order.",
            "- For slide decks or any ordered multi-image set, use reference chaining: before generating image 2 and every later image, inspect the previous generated image result, keep its saved local path or preview reference, and carry forward the exact previous image prompt summary.",
            "- Every image 2+ generation prompt must include an Input images or Reference images line naming the previous generated image as a visual continuity reference, plus a Previous image prompt summary and the reusable visual system to preserve.",
            "- If the previous generated image cannot be attached as an actual image input, make the fallback explicit in the image prompt. Include: Reference image unavailable; preserve the same visual system as the previous image using the repeated design contract.",
            "- For slide/profile workflows, define a concrete visual system before image 1, then repeat that contract in every later image request: palette, typography, grid, spacing, component shapes, icon style, chart style, illustration style, lighting, depth, and overall presentation identity.",
            "- Use the previous image reference for consistent palette, typography, grid, spacing, components, lighting, and illustration/chart style. Do not duplicate the previous image's content unless the user explicitly asks for repeated content.",
            "- Save the final image and mention the saved path in the response.",
          ].join("\n"),
          contexts,
          ...(imagegenSkill
            ? {
                structuredInputs: [
                  {
                    id: `skill:${imagegenSkill.id}`,
                    type: "skill" as const,
                    name: imagegenSkill.name,
                    path: imagegenSkill.path,
                    description: imagegenSkill.description,
                    token: imagegenSkill.token,
                  },
                ],
              }
            : {}),
        },
        async (ref, contextIndex, assetIndex) => {
          const path = await this.#materializeInlineImage(ref, contextIndex, assetIndex);
          tempPaths.push(path);
          return path;
        },
        {
          workspaceInstructions: workspaceInstructions.text,
          promptAppendices: promptHooks.appendPrompt,
          fileSections: preparedFiles.sections,
          uploadedImages: preparedFiles.uploadedImages,
        },
      );
    } catch (error) {
      await Promise.all(tempPaths.map(async (path) => rm(path, { force: true }).catch(() => undefined)));
      throw error;
    }
    const thread = (await this.#client.request("thread/start", {
      ...(cwd ? { cwd } : {}),
      approvalPolicy: "never",
      personality: "pragmatic",
      ephemeral: true,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    })) as { thread: { id: string } };
    const threadId = thread.thread.id;
    await this.#record("image.generate.thread.started", { jobId, threadId, cwd: cwd ?? "" });
    let turnId = "";
    let unsubscribe: () => void = () => undefined;
    const previewRefsByOrder: string[] = [];
    let assistantText = "";
    let previewError: Error | null = null;
    const previewTasks: Promise<void>[] = [];
    let previewResolutionQueue = Promise.resolve();

    const completed = new Promise<string[]>((resolve, reject) => {
      unsubscribe = this.#client.onNotification((notification) => {
        try {
          const notificationTurn = notification.params?.turn as { id?: string; error?: { message?: string } } | undefined;
          const notificationTurnId = String(notification.params?.turnId ?? notificationTurn?.id ?? "");
          if (turnId && notificationTurnId && notificationTurnId !== turnId) {
            return;
          }
          const notificationThreadId = String(notification.params?.threadId ?? "");
          if (notificationThreadId && notificationThreadId !== threadId) {
            return;
          }

          if (notification.method === "item/completed") {
            const item = notification.params?.item as (ImageGenerationItem & { text?: string }) | undefined;
            if (item?.type === "agentMessage" && item.text?.trim()) {
              assistantText = item.text.trim();
              return;
            }
            if (item?.type === "imageGeneration") {
              void this.#record("image.generate.image.item", {
                jobId,
                threadId,
                turnId: notificationTurnId || turnId,
                itemId: item.id ?? null,
                hasResult: Boolean(item.result),
                savedPath: item.savedPath ?? item.saved_path ?? null,
              });
              const previewOrder = previewTasks.length;
              const task = previewResolutionQueue
                .then(async () => {
                  const nextPreviewRef = await resolveGeneratedImagePreview(item, this.#imageAssets);
                  if (nextPreviewRef) {
                    previewRefsByOrder[previewOrder] = nextPreviewRef;
                    const imageIndex = previewOrder + 1;
                    emit?.(
                      createImageGeneratePreviewEvent({
                        params,
                        jobId,
                        itemId: item.id ?? null,
                        previewRef: nextPreviewRef,
                        imageIndex,
                      }),
                    );
                  }
                })
                .catch((error: unknown) => {
                  previewError = error instanceof Error ? error : new Error(String(error));
                });
              previewResolutionQueue = task.then(
                () => undefined,
                () => undefined,
              );
              previewTasks.push(task);
            }
            return;
          }

          if (notification.method === "turn/completed") {
            unsubscribe();
            void this.#record("image.generate.turn.completed", {
              jobId,
              threadId,
              turnId: String(notificationTurn?.id ?? turnId),
              hasPreviewRef: previewRefsByOrder.some(Boolean),
              previewCount: previewRefsByOrder.filter(Boolean).length,
              hasAssistantText: Boolean(assistantText),
              error: notificationTurn?.error?.message ?? null,
            });
            void Promise.allSettled(previewTasks).then(async () => {
              if (notificationTurn?.error?.message) {
                reject(new Error(notificationTurn.error.message));
                return;
              }
              if (previewError) {
                reject(previewError);
                return;
              }
              let previewRefs = uniquePreviewRefs(previewRefsByOrder.filter(Boolean));
              if (!previewRefs.length) {
                previewRefs = await this.#resolveGeneratedImagePreviewsFromThread(
                  threadId,
                  String(notificationTurn?.id ?? turnId),
                );
              }
              if (!previewRefs.length && assistantText) {
                previewRefs = await resolveGeneratedImagePreviewsFromText(assistantText, this.#imageAssets);
              }
              if (previewRefs.length) {
                await this.#record("image.generate.preview.ready", {
                  jobId,
                  threadId,
                  turnId,
                  previewRef: previewRefs[0],
                  previewCount: previewRefs.length,
                });
                resolve(previewRefs);
                return;
              }
              reject(
                new Error(
                  assistantText || "Codex completed the infographic generation without returning a generated image preview.",
                ),
              );
            });
          }
        } catch (error) {
          unsubscribe();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    try {
      const turn = await requestTurnStartWithReasoningSummaryFallback(
        this.#client,
        (event, details) => this.#record(event, details),
        {
          threadId,
          input,
          ...(cwd ? { cwd } : {}),
          approvalPolicy: "never",
          personality: "pragmatic",
        },
      );
      turnId = turn.turn.id;
      await this.#record("image.generate.turn.started", { jobId, threadId, turnId });
      return await completed;
    } catch (error) {
      unsubscribe();
      throw error;
    } finally {
      await Promise.all(tempPaths.map(async (path) => rm(path, { force: true }).catch(() => undefined)));
    }
  }

  async #findImagegenSkill(cwd: string) {
    const result = (await this.#client.request("skills/list", cwd ? { cwds: [cwd] } : {})) as {
      data?: Array<Record<string, unknown>>;
    };
    const skills = mapSkills((result.data ?? []) as never);
    return (
      skills.find((skill) => skill.name === "imagegen" && skill.scope === "system") ??
      skills.find((skill) => skill.name === "imagegen") ??
      null
    );
  }

  async #writeInputImage(image: ImageEditParams["image"]): Promise<string> {
    return (await this.#imageAssets.persistInputBase64(image.base64, image.mimeType)).path;
  }

  async #materializeInlineImage(dataUrl: string, contextIndex: number, assetIndex: number): Promise<string> {
    const match = /^data:(.+?);base64,(.+)$/u.exec(dataUrl);
    if (!match) {
      throw new Error("Unsupported inline vision asset. Expected a base64 data URL.");
    }

    const mimeType = match[1] ?? "image/png";
    const base64 = match[2] ?? "";
    const extension = mimeTypeToExtension(mimeType);
    const tempDir = await this.#tempDirPromise;
    const filePath = join(tempDir, `context-${contextIndex + 1}-asset-${assetIndex + 1}.${extension}`);
    await writeFile(filePath, Buffer.from(base64, "base64"));
    return filePath;
  }

  async #record(event: string, details: Record<string, unknown>): Promise<void> {
    await this.#diagnostics?.record(event, details).catch(() => undefined);
  }

}

function createEmptyImageGenerationContext(): PageContextEnvelope {
  return {
    metadata: {
      url: "codex://image-generate",
      title: "Image generation request",
      domain: "codex.local",
    },
    selectionText: "",
    domSummary: "No page context was provided. Generate from the explicit user request only.",
    visionAssets: [],
    adapterPayload: null,
    privacyFlags: {
      containsSensitiveFormData: false,
      userConsentedToHistory: false,
    },
  };
}

async function resolveGeneratedImagePreview(
  item: { result?: string; savedPath?: string | null; saved_path?: string | null },
  imageAssets: BridgeImageAssetStore,
): Promise<string | null> {
  const savedPath = item.savedPath ?? item.saved_path;
  if (savedPath) {
    return imageAssets.registerFile(savedPath);
  }

  const result = item.result?.trim() ?? "";
  if (!result) {
    return null;
  }
  if (isBridgeImageAssetRef(result)) {
    return result;
  }
  if (result.startsWith("data:image/")) {
    return imageAssets.registerDataUrl(result);
  }
  if (result.startsWith("http://") || result.startsWith("https://")) {
    return imageAssets.registerRemoteImageUrl(result).catch(() => result);
  }

  const fileMatch = result.match(/(\/[^\s)]+?\.(?:png|jpe?g|webp|gif))/iu);
  if (fileMatch?.[1]) {
    return imageAssets.registerFile(fileMatch[1]);
  }

  if (/^[a-z0-9+/=\s]+$/iu.test(result) && result.length > 128) {
    return imageAssets.registerBase64(result, "image/png");
  }
  return null;
}

async function resolveGeneratedImagePreviewsFromText(
  text: string,
  imageAssets: BridgeImageAssetStore,
): Promise<string[]> {
  const previewRefs: string[] = [];
  const candidates = extractImageReferencesFromText(text);

  for (const candidate of candidates) {
    if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
      previewRefs.push(candidate);
      continue;
    }
    const filePath = normalizeLocalImagePath(candidate);
    if (!filePath) {
      continue;
    }
    const previewRef = await imageAssets.registerFile(filePath).catch(() => null);
    if (previewRef) {
      previewRefs.push(previewRef);
    }
  }

  return Array.from(new Set(previewRefs));
}

function uniquePreviewRefs(previewRefs: string[]): string[] {
  return Array.from(new Set(previewRefs.map((previewRef) => previewRef.trim()).filter(Boolean)));
}

function createImageGeneratePreviewEvent(input: {
  params: ImageGenerateParams;
  jobId: string;
  itemId: string | null;
  previewRef: string;
  imageIndex: number;
}): BridgeEvent {
  const clientRequestId = input.params.clientRequestId?.trim();
  const conversationId = input.params.conversationId?.trim();
  const workflow = input.params.workflow;
  return {
    type: "message.image",
    itemId: clientRequestId
      ? `${clientRequestId}-image-${input.imageIndex}`
      : input.itemId?.trim() || `${input.jobId}-image-${input.imageIndex}`,
    previewRef: input.previewRef,
    alt: createImageGeneratePreviewAlt(workflow, input.imageIndex),
    ...(clientRequestId ? { clientRequestId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(workflow ? { workflow } : {}),
    imageIndex: input.imageIndex,
  };
}

function createImageGeneratePreviewAlt(workflow: ImageGenerateParams["workflow"], imageIndex: number): string {
  if (workflow === "infographic") {
    return "Generated infographic";
  }
  if (workflow === "slide-images") {
    return `Presentation slide image ${imageIndex}`;
  }
  return `Generated image ${imageIndex}`;
}

function createImageGenerateWorkflowInstruction(workflow: ImageGenerateParams["workflow"]): string {
  if (workflow === "infographic") {
    return "$imagegen Generate a new visual explainer image from the attached private page context.";
  }
  if (workflow === "slide-images") {
    return "$imagegen Generate ordered presentation slide images from the request and attached private context.";
  }
  return "$imagegen Generate a new image from the user's request, attached files, and any private context.";
}

function createImageGenerateUseCase(workflow: ImageGenerateParams["workflow"]): string {
  if (workflow === "infographic") {
    return "current-page-visual-explainer";
  }
  if (workflow === "slide-images") {
    return "presentation-slide-images";
  }
  return "general-image-generation";
}

function createImageGenerateRenderTarget(params: ImageGenerateParams): string {
  return [
    params.size,
    params.quality ? `${params.quality} quality` : "",
  ].filter(Boolean).join(", ");
}

function extractImageReferencesFromText(text: string): string[] {
  const references: string[] = [];

  for (const match of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/giu)) {
    if (match[1]) {
      references.push(stripImageReferencePunctuation(match[1]));
    }
  }

  for (const match of text.matchAll(/https?:\/\/[^\s"'<>)]*?\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?/giu)) {
    if (match[0]) {
      references.push(stripImageReferencePunctuation(match[0]));
    }
  }

  for (const line of text.split(/\r?\n/u)) {
    for (const match of line.matchAll(/\/[^\n\r"'<>]*?\.(?:png|jpe?g|webp|gif)\b/giu)) {
      if (match[0]) {
        references.push(stripImageReferencePunctuation(match[0]));
      }
    }
    for (const match of line.matchAll(/[a-zA-Z]:\\[^\n\r"'<>]*?\.(?:png|jpe?g|webp|gif)\b/giu)) {
      if (match[0]) {
        references.push(stripImageReferencePunctuation(match[0]));
      }
    }
  }

  return Array.from(new Set(references.filter(Boolean)));
}

export function normalizeLocalImagePath(reference: string): string {
  const trimmed = stripImageReferencePunctuation(reference);
  if (trimmed.startsWith("file://")) {
    try {
      const url = new URL(trimmed);
      const pathname = decodeURIComponent(url.pathname);
      if (/^\/[a-zA-Z]:\//u.test(pathname)) {
        return pathname.slice(1).replace(/\//gu, "\\");
      }
      if (url.hostname) {
        return `\\\\${url.hostname}${pathname.replace(/\//gu, "\\")}`;
      }
      return fileURLToPath(url);
    } catch {
      return "";
    }
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  if (/^[a-zA-Z]:\\/u.test(trimmed)) {
    return trimmed;
  }
  return "";
}

function stripImageReferencePunctuation(value: string): string {
  return value.trim().replace(/^["'`]+/u, "").replace(/[)"'`,.;:]+$/u, "");
}

function normalizeOptionalCwd(value: string | undefined | null): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}
