import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import readline from "node:readline";

import { resolveCodexCommand, type CodexCommandResolution } from "./codex-discovery.js";

type JsonRpcMessage = {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

type NotificationHandler = (message: Required<Pick<JsonRpcMessage, "method">> & JsonRpcMessage) => void;
type ServerRequestMessage = Required<Pick<JsonRpcMessage, "id" | "method">> & JsonRpcMessage;
type ServerRequestHandler = (message: ServerRequestMessage) => Promise<unknown> | unknown;
type ServerRequestConcurrency = "serial" | "parallel";
type ServerRequestHandlerRegistration = {
  handler: ServerRequestHandler;
  concurrency: ServerRequestConcurrency;
  queue: Promise<unknown>;
};
type RetryDelayImpl = (delayMs: number) => Promise<void>;
type PendingRequest = {
  method: string;
  params: Record<string, unknown>;
  attempt: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const APP_SERVER_OVERLOADED_CODE = -32001;
const APP_SERVER_OVERLOADED_MESSAGE = "Server overloaded; retry later.";
const MAX_OVERLOAD_RETRIES = 4;
const BASE_OVERLOAD_RETRY_DELAY_MS = 100;
const MAX_OVERLOAD_RETRY_DELAY_MS = 2000;

export class CodexAppServerClient {
  #process: ChildProcessByStdio<Writable, Readable, null> | null = null;
  #lineReader: readline.Interface | null = null;
  #started = false;
  #startPromise: Promise<void> | null = null;
  #commandOverride: string | null = null;
  #spawnImpl: typeof spawn;
  #resolveCommandImpl: typeof resolveCodexCommand;
  #experimentalApi: boolean;
  #enabledFeatures: string[];
  #retryDelayImpl: RetryDelayImpl;
  #randomImpl: () => number;
  #lastCommandResolution: CodexCommandResolution | null = null;
  #requestId = 1;
  #pending = new Map<number, PendingRequest>();
  #handlers = new Set<NotificationHandler>();
  #requestHandlers = new Set<ServerRequestHandlerRegistration>();

  constructor(
    options: {
      spawnImpl?: typeof spawn;
      resolveCommandImpl?: typeof resolveCodexCommand;
      experimentalApi?: boolean;
      enabledFeatures?: string[];
      retryDelayImpl?: RetryDelayImpl;
      randomImpl?: () => number;
    } = {},
  ) {
    this.#spawnImpl = options.spawnImpl ?? spawn;
    this.#resolveCommandImpl = options.resolveCommandImpl ?? resolveCodexCommand;
    this.#experimentalApi = options.experimentalApi ?? false;
    this.#enabledFeatures = Array.from(new Set(options.enabledFeatures ?? [])).filter(Boolean);
    this.#retryDelayImpl = options.retryDelayImpl ?? delay;
    this.#randomImpl = options.randomImpl ?? Math.random;
  }

  async request<TResult = unknown>(method: string, params: Record<string, unknown> = {}): Promise<TResult> {
    await this.#ensureStarted();
    return this.#requestInternal(method, params);
  }

  onNotification(handler: NotificationHandler): () => void {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }

  onRequest(
    handler: ServerRequestHandler,
    options: { concurrency?: ServerRequestConcurrency } = {},
  ): () => void {
    const registration: ServerRequestHandlerRegistration = {
      handler,
      concurrency: options.concurrency ?? "serial",
      queue: Promise.resolve(),
    };
    this.#requestHandlers.add(registration);
    return () => this.#requestHandlers.delete(registration);
  }

  getConfiguredCommand(): string {
    return this.#commandOverride ?? "";
  }

  async inspectRuntime() {
    const resolution = await this.#resolveCommandImpl({
      configuredCommand: this.#commandOverride,
    });
    this.#lastCommandResolution = resolution;
    return resolution;
  }

  async configure(options: { command?: string | null }): Promise<void> {
    const nextCommand = options.command?.trim() ? options.command.trim() : null;
    if (nextCommand === this.#commandOverride) {
      return;
    }

    this.#commandOverride = nextCommand;
    if (this.#process || this.#startPromise) {
      await this.shutdown();
    }
  }

  async shutdown(): Promise<void> {
    const process = this.#process;
    this.#resetProcessState();
    process?.kill();
  }

  async #ensureStarted(): Promise<void> {
    if (this.#started) {
      return;
    }

    if (!this.#startPromise) {
      this.#startPromise = this.#start();
    }

    await this.#startPromise;
  }

  async #start(): Promise<void> {
    const resolution = await this.inspectRuntime();
    if (!resolution.resolvedCommand) {
      throw new Error(
        resolution.configuredCommandInvalid
          ? `Configured Codex binary could not be used and no fallback Codex binary was detected automatically.`
          : "No Codex binary was detected automatically. Install Codex or add it to PATH.",
      );
    }
    const command = resolution.resolvedCommand;
    this.#process = this.#spawnImpl(command, this.#buildAppServerArgs(), {
      stdio: ["pipe", "pipe", "inherit"],
      ...createCodexSpawnOptions(command),
    });
    this.#process.on("error", (error) => {
      this.#handleProcessFailure(toStartupError(command, error));
    });
    this.#process.on("exit", (code) => {
      this.#handleProcessFailure(new Error(`codex app-server exited with code ${code ?? "unknown"}`));
    });

    if (!this.#process.stdout) {
      const error = new Error("codex app-server stdout is not available");
      this.#handleProcessFailure(error);
      throw error;
    }

    this.#lineReader = readline.createInterface({
      input: this.#process.stdout,
    });
    this.#lineReader.on("line", (line) => this.#handleLine(line));

    try {
      await this.#requestInternal("initialize", {
        clientInfo: {
          name: "codex-chrome-sidepanel-bridge",
          version: "0.1.0",
        },
        capabilities: this.#experimentalApi ? { experimentalApi: true } : {},
      });
      this.#write({ method: "initialized", params: {} });
      this.#started = true;
    } catch (error) {
      this.#handleProcessFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  #buildAppServerArgs(): string[] {
    return [
      "app-server",
      ...this.#enabledFeatures.flatMap((feature) => ["--enable", feature]),
      "--listen",
      "stdio://",
    ];
  }

  #write(message: JsonRpcMessage): void {
    if (!this.#process?.stdin.writable) {
      throw new Error("codex app-server stdin is not writable");
    }

    this.#process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #requestInternal<TResult = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      this.#sendRequest({
        method,
        params,
        attempt: 0,
        resolve: (value) => resolve(value as TResult),
        reject,
    });
    });
  }

  #sendRequest(request: PendingRequest): void {
    const id = this.#requestId++;
    const payload = { id, method: request.method, params: request.params };
    this.#pending.set(id, request);
    this.#write(payload);
  }

  #handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    const message = JSON.parse(line) as JsonRpcMessage;
    const messageId = message.id;
    if (typeof messageId === "number" || typeof messageId === "string") {
      const numericId = typeof messageId === "number" ? messageId : Number(messageId);
      const pending = Number.isFinite(numericId) ? this.#pending.get(numericId) : undefined;
      if (pending) {
        this.#pending.delete(numericId);
        if (message.error) {
          if (this.#shouldRetryOverload(message.error, pending.attempt)) {
            void this.#retryPendingRequest(pending);
            return;
          }
          pending.reject(new Error(message.error.message ?? "Unknown JSON-RPC error"));
          return;
        }

        pending.resolve(message.result);
        return;
      }

      if (message.method) {
        void this.#handleServerRequest({
          ...message,
          id: messageId,
          method: message.method,
        });
      }
      return;
    }

    if (message.method) {
      for (const handler of this.#handlers) {
        handler({ ...message, method: message.method });
      }
    }
  }

  async #handleServerRequest(message: ServerRequestMessage): Promise<void> {
    try {
      for (const registration of this.#requestHandlers) {
        const result = await this.#runServerRequestHandler(registration, message);
        if (result !== undefined) {
          this.#write({ id: message.id, result });
          return;
        }
      }

      this.#write({
        id: message.id,
        error: {
          code: -32601,
          message: `Unsupported app-server request: ${message.method}`,
        },
      });
    } catch (error) {
      this.#write({
        id: message.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  #runServerRequestHandler(
    registration: ServerRequestHandlerRegistration,
    message: ServerRequestMessage,
  ): Promise<unknown> {
    if (registration.concurrency === "parallel") {
      return Promise.resolve(registration.handler(message));
    }

    const task = registration.queue.catch(() => undefined).then(() => registration.handler(message));
    registration.queue = task.catch(() => undefined);
    return task;
  }

  #handleProcessFailure(error: Error): void {
    if (!this.#process && !this.#lineReader && !this.#pending.size && !this.#started && !this.#startPromise) {
      return;
    }

    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
    this.#resetProcessState();
  }

  #resetProcessState(): void {
    this.#lineReader?.close();
    this.#lineReader = null;
    this.#process = null;
    this.#started = false;
    this.#startPromise = null;
  }

  #shouldRetryOverload(error: NonNullable<JsonRpcMessage["error"]>, attempt: number): boolean {
    if (attempt >= MAX_OVERLOAD_RETRIES) {
      return false;
    }
    return error.code === APP_SERVER_OVERLOADED_CODE || error.message === APP_SERVER_OVERLOADED_MESSAGE;
  }

  async #retryPendingRequest(pending: PendingRequest): Promise<void> {
    const delayMs = this.#computeOverloadRetryDelay(pending.attempt);
    await this.#retryDelayImpl(delayMs);
    this.#sendRequest({
      method: pending.method,
      params: pending.params,
      attempt: pending.attempt + 1,
      resolve: pending.resolve,
      reject: pending.reject,
    });
  }

  #computeOverloadRetryDelay(attempt: number): number {
    const exponential = Math.min(MAX_OVERLOAD_RETRY_DELAY_MS, BASE_OVERLOAD_RETRY_DELAY_MS * 2 ** attempt);
    const jitter = Math.floor(exponential * 0.25 * this.#randomImpl());
    return exponential + jitter;
  }
}

function toStartupError(command: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to start codex app-server with "${command}": ${message}`);
}

export function createCodexSpawnOptions(
  command: string,
  platformName: NodeJS.Platform = process.platform,
): { shell?: boolean } {
  return platformName === "win32" && /\.(?:cmd|bat)$/iu.test(command) ? { shell: true } : {};
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
