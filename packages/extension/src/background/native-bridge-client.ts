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
const SAFARI_NATIVE_APPLICATION_ID = "application.id";
const SAFARI_EXTENSION_BUNDLE_ID = "ai.openclaw.chromex.ChromexSafari.Extension";
const SAFARI_APP_BUNDLE_ID = "ai.openclaw.chromex.ChromexSafari";
const SAFARI_EVENT_POLL_METHOD = "__chromex.events.poll";
const SAFARI_EVENT_POLL_INTERVAL_MS = 250;

type RuntimeCandidate = {
  connectNative?: unknown;
  sendNativeMessage?: unknown;
  getURL?: unknown;
  lastError?: { message?: string } | null;
};

type NativeMessagingRuntime = {
  connectNative: (application: string) => chrome.runtime.Port;
  lastError?: { message?: string } | null;
};

type ConnectionlessNativeMessagingRuntime = {
  sendNativeMessage: (
    application: string,
    message: unknown,
    responseCallback?: (response?: BridgeMessage) => void,
  ) => Promise<BridgeMessage> | BridgeMessage | undefined;
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
  const runtime = getRuntimeCandidateWithFunction("connectNative", [chromeRuntime, browserRuntime]);
  if (runtime) {
    return runtime as NativeMessagingRuntime;
  }

  throw new Error(toFriendlyNativeHostErrorMessage("Native messaging API is unavailable"));
}

function getConnectionlessNativeMessagingRuntime(): ConnectionlessNativeMessagingRuntime | null {
  const { browserRuntime, chromeRuntime } = getRuntimeCandidates();
  const runtime = getRuntimeCandidateWithFunction("sendNativeMessage", [browserRuntime, chromeRuntime]);
  if (runtime) {
    return runtime as ConnectionlessNativeMessagingRuntime;
  }
  return null;
}

function hasPortNativeMessagingRuntime(): boolean {
  const { chromeRuntime, browserRuntime } = getRuntimeCandidates();
  return Boolean(getRuntimeCandidateWithFunction("connectNative", [chromeRuntime, browserRuntime]));
}

function getRuntimeCandidateWithFunction(
  functionName: "connectNative" | "sendNativeMessage",
  runtimes: Array<RuntimeCandidate | undefined>,
): RuntimeCandidate | undefined {
  return runtimes.find((runtime) => typeof runtime?.[functionName] === "function");
}

function isSafariWebExtensionRuntime(): boolean {
  const userAgent = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "";
  if (/\bSafari\//.test(userAgent) && !/\b(?:Chrome|Chromium|Edg|OPR|CriOS|FxiOS)\//.test(userAgent)) {
    return true;
  }

  const { browserRuntime, chromeRuntime } = getRuntimeCandidates();
  for (const runtime of [browserRuntime, chromeRuntime]) {
    if (typeof runtime?.getURL !== "function") {
      continue;
    }
    try {
      const extensionUrl = (runtime.getURL as (path: string) => string)("");
      if (extensionUrl.startsWith("safari-web-extension://") || extensionUrl.startsWith("safari-extension://")) {
        return true;
      }
    } catch {
      // Ignore runtime URL detection failures and fall back to user-agent checks.
    }
  }

  return false;
}

function shouldUseConnectionlessNativeMessaging(): boolean {
  if (!getConnectionlessNativeMessagingRuntime()) {
    return false;
  }

  return !hasPortNativeMessagingRuntime() || isSafariWebExtensionRuntime();
}

function getNativeApplicationName(): string {
  // Safari Web Extensions route native messages to their containing app extension.
  // Apple examples use the placeholder "application.id" and Safari resolves it to
  // the bundled SafariWebExtensionHandler; the Chrome native-host name is for the
  // desktop browser manifest path and can fail to route in Safari.
  return isSafariWebExtensionRuntime() ? SAFARI_NATIVE_APPLICATION_ID : NATIVE_HOST_NAME;
}

function getConnectionlessNativeApplicationNames(): string[] {
  if (!isSafariWebExtensionRuntime()) {
    return [NATIVE_HOST_NAME];
  }
  return [SAFARI_NATIVE_APPLICATION_ID, SAFARI_EXTENSION_BUNDLE_ID, SAFARI_APP_BUNDLE_ID];
}

function isEmptyBridgeResponse(message: BridgeMessage): boolean {
  return (
    !message.id &&
    !Object.prototype.hasOwnProperty.call(message, "result") &&
    !message.error &&
    !message.event
  );
}

function sendNativeMessageCompat(
  runtime: ConnectionlessNativeMessagingRuntime,
  application: string,
  message: unknown,
): Promise<BridgeMessage> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (response: BridgeMessage | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      const lastErrorMessage = runtime.lastError?.message;
      if (lastErrorMessage) {
        reject(new Error(toFriendlyNativeHostErrorMessage(lastErrorMessage)));
        return;
      }
      resolve(response ?? {});
    };
    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error instanceof Error ? error : new Error(toFriendlyNativeHostErrorMessage(String(error))));
    };

    try {
      const maybePromise = runtime.sendNativeMessage(application, message, settle);
      if (maybePromise && typeof (maybePromise as Promise<BridgeMessage>).then === "function") {
        (maybePromise as Promise<BridgeMessage>).then(settle, fail);
        return;
      }
      if (maybePromise !== undefined) {
        settle(maybePromise as BridgeMessage);
      }
    } catch (error) {
      fail(error);
    }
  });
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

    try {
      return this.#requestWithPort<TResult>(method, params, options);
    } catch (error) {
      if (getConnectionlessNativeMessagingRuntime()) {
        return this.#requestConnectionless<TResult>(method, params, options);
      }
      throw error;
    }
  }

  #requestWithPort<TResult>(
    method: string,
    params: Record<string, unknown>,
    options: BridgeRequestOptions,
  ): Promise<TResult> {
    const port = this.#ensurePort();
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
    let lastError: Error | null = null;
    for (const applicationName of getConnectionlessNativeApplicationNames()) {
      try {
        const message = await withOptionalTimeout(
          sendNativeMessageCompat(runtime, applicationName, { id, method, params }),
          options.timeoutMs,
          options.timeoutMessage ?? `${method} did not respond in time.`,
        );
        this.#handleEventMessagesFromConnectionlessResponse(message);

        if (isEmptyBridgeResponse(message) && isSafariWebExtensionRuntime()) {
          lastError = new Error(`Safari native bridge returned an empty response for ${applicationName}.`);
          continue;
        }

        if (message.error) {
          throw new Error(message.error.message);
        }

        return message.result as TResult;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (isSafariWebExtensionRuntime() && hasPortNativeMessagingRuntime()) {
      return this.#requestWithPort<TResult>(method, params, options);
    }

    throw lastError ?? new Error("Safari native bridge did not respond.");
  }

  #ensurePort(): chrome.runtime.Port {
    if (this.#port) {
      return this.#port;
    }

    let nativeRuntime: NativeMessagingRuntime;
    try {
      nativeRuntime = getNativeMessagingRuntime();
      this.#port = nativeRuntime.connectNative(getNativeApplicationName());
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
      const message = await sendNativeMessageCompat(runtime, getNativeApplicationName(), {
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
