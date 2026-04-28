type BridgeMessage = {
  id?: string;
  result?: unknown;
  error?: { message: string };
  event?: unknown;
};

type BridgeRequestOptions = {
  timeoutMs?: number;
  timeoutMessage?: string;
};

type PendingBridgeRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

import { toFriendlyNativeHostErrorMessage } from "./native-host-errors.js";

const NATIVE_HOST_NAME = "com.codex.sidepanel.bridge";
const SAFARI_EVENT_POLL_METHOD = "__chromex.events.poll";
const SAFARI_EVENT_POLL_INTERVAL_MS = 250;

type RuntimeCandidate = {
  connectNative?: unknown;
  sendNativeMessage?: unknown;
  lastError?: { message?: string } | null;
};

type NativeMessagingRuntime = {
  connectNative: (application: string) => chrome.runtime.Port;
  lastError?: { message?: string } | null;
};

type ConnectionlessNativeMessagingRuntime = {
  sendNativeMessage: (application: string, message: unknown) => Promise<BridgeMessage>;
  lastError?: { message?: string } | null;
};

function getRuntimeCandidates(): { chromeRuntime: RuntimeCandidate | undefined; browserRuntime: RuntimeCandidate | undefined } {
  const globalScope = globalThis as {
    chrome?: { runtime?: RuntimeCandidate };
    browser?: { runtime?: RuntimeCandidate };
  };
  return {
    chromeRuntime: globalScope.chrome?.runtime,
    browserRuntime: globalScope.browser?.runtime,
  };
}

function getNativeMessagingRuntime(): NativeMessagingRuntime {
  const { chromeRuntime, browserRuntime } = getRuntimeCandidates();
  const runtime = chromeRuntime ?? browserRuntime;
  if (typeof runtime?.connectNative === "function") {
    return runtime as NativeMessagingRuntime;
  }

  throw new Error(toFriendlyNativeHostErrorMessage("Native messaging API is unavailable"));
}

function getConnectionlessNativeMessagingRuntime(): ConnectionlessNativeMessagingRuntime | null {
  const { browserRuntime, chromeRuntime } = getRuntimeCandidates();
  const runtime = browserRuntime ?? chromeRuntime;
  if (typeof runtime?.sendNativeMessage === "function") {
    return runtime as ConnectionlessNativeMessagingRuntime;
  }
  return null;
}

function hasPortNativeMessagingRuntime(): boolean {
  const { chromeRuntime, browserRuntime } = getRuntimeCandidates();
  return typeof (chromeRuntime ?? browserRuntime)?.connectNative === "function";
}

function isSafariWebExtensionRuntime(): boolean {
  const userAgent = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "";
  return /\bSafari\//.test(userAgent) && !/\b(?:Chrome|Chromium|Edg|OPR|CriOS|FxiOS)\//.test(userAgent);
}

function shouldUseConnectionlessNativeMessaging(): boolean {
  if (!getConnectionlessNativeMessagingRuntime()) {
    return false;
  }

  return !hasPortNativeMessagingRuntime() || isSafariWebExtensionRuntime();
}

export class NativeBridgeClient {
  #port: chrome.runtime.Port | null = null;
  #lastDisconnectError: string | null = null;
  #pending = new Map<string, PendingBridgeRequest>();
  #listeners = new Set<(event: unknown) => void>();
  #safariEventPollTimer: ReturnType<typeof setInterval> | null = null;
  #safariEventPollInFlight = false;

  subscribe(listener: (event: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async request<TResult = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: BridgeRequestOptions = {},
  ): Promise<TResult> {
    if (shouldUseConnectionlessNativeMessaging()) {
      return this.#requestConnectionless<TResult>(method, params, options);
    }

    let port: chrome.runtime.Port;
    try {
      port = this.#ensurePort();
    } catch (error) {
      if (getConnectionlessNativeMessagingRuntime()) {
        return this.#requestConnectionless<TResult>(method, params, options);
      }
      throw error;
    }
    const id = crypto.randomUUID();
    const response = new Promise<TResult>((resolve, reject) => {
      const pending: PendingBridgeRequest = {
        resolve: (value: unknown) => resolve(value as TResult),
        reject: (error: Error) => reject(error),
      };
      this.#pending.set(id, pending);
      if (options.timeoutMs && options.timeoutMs > 0) {
        pending.timer = setTimeout(() => {
          if (!this.#pending.delete(id)) {
            return;
          }
          reject(new Error(options.timeoutMessage ?? `${method} did not respond in time.`));
        }, options.timeoutMs);
      }
    });

    port.postMessage({ id, method, params });
    return response;
  }

  async #requestConnectionless<TResult>(
    method: string,
    params: Record<string, unknown>,
    options: BridgeRequestOptions,
  ): Promise<TResult> {
    const runtime = getConnectionlessNativeMessagingRuntime();
    if (!runtime) {
      throw new Error(toFriendlyNativeHostErrorMessage("Native messaging API is unavailable"));
    }

    this.#startSafariEventPolling();
    const id = crypto.randomUUID();
    const response = Promise.resolve(runtime.sendNativeMessage(NATIVE_HOST_NAME, { id, method, params }));
    const message = await withOptionalTimeout(
      response,
      options.timeoutMs,
      options.timeoutMessage ?? `${method} did not respond in time.`,
    );
    this.#handleEventMessagesFromConnectionlessResponse(message);

    if (message.error) {
      throw new Error(message.error.message);
    }

    return message.result as TResult;
  }

  #ensurePort(): chrome.runtime.Port {
    if (this.#port) {
      return this.#port;
    }

    let nativeRuntime: NativeMessagingRuntime;
    try {
      nativeRuntime = getNativeMessagingRuntime();
      this.#port = nativeRuntime.connectNative(NATIVE_HOST_NAME);
    } catch (error) {
      throw new Error(
        toFriendlyNativeHostErrorMessage(
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
    this.#lastDisconnectError = null;
    this.#port.onMessage.addListener((message: BridgeMessage) => this.#handleMessage(message));
    this.#port.onDisconnect.addListener(() => {
      this.#lastDisconnectError = toFriendlyNativeHostErrorMessage(
        nativeRuntime.lastError?.message ?? "Native host disconnected",
      );
      const error = new Error(this.#lastDisconnectError);
      for (const pending of this.#pending.values()) {
        if (pending.timer) {
          clearTimeout(pending.timer);
        }
        pending.reject(error);
      }
      this.#pending.clear();
      this.#port = null;
    });
    return this.#port;
  }

  #startSafariEventPolling(): void {
    if (this.#safariEventPollTimer) {
      return;
    }

    this.#safariEventPollTimer = setInterval(() => {
      void this.#pollSafariEvents();
    }, SAFARI_EVENT_POLL_INTERVAL_MS);
  }

  async #pollSafariEvents(): Promise<void> {
    if (this.#safariEventPollInFlight) {
      return;
    }

    const runtime = getConnectionlessNativeMessagingRuntime();
    if (!runtime) {
      return;
    }

    this.#safariEventPollInFlight = true;
    try {
      const message = await runtime.sendNativeMessage(NATIVE_HOST_NAME, {
        id: crypto.randomUUID(),
        method: SAFARI_EVENT_POLL_METHOD,
        params: {},
      });
      this.#handleEventMessagesFromConnectionlessResponse(message);
    } catch {
      // Keep polling best-effort; normal foreground requests surface bridge errors to the UI.
    } finally {
      this.#safariEventPollInFlight = false;
    }
  }

  #handleEventMessagesFromConnectionlessResponse(message: BridgeMessage): void {
    if (message.event) {
      this.#emitEvent(message.event);
    }

    const events = (message.result as { events?: unknown[] } | undefined)?.events;
    if (Array.isArray(events)) {
      for (const event of events) {
        this.#emitEvent(event);
      }
    }
  }

  #emitEvent(event: unknown): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #handleMessage(message: BridgeMessage): void {
    if (message.event) {
      this.#emitEvent(message.event);
      return;
    }

    if (!message.id) {
      return;
    }

    const pending = this.#pending.get(message.id);
    if (!pending) {
      return;
    }
    this.#pending.delete(message.id);
    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }
}

async function withOptionalTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined, timeoutMessage: string): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
