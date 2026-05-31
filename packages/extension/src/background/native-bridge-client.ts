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

export class NativeBridgeClient {
  #port: chrome.runtime.Port | null = null;
  #lastDisconnectError: string | null = null;
  #pending = new Map<string, PendingBridgeRequest>();
  #listeners = new Set<(event: unknown) => void>();

  subscribe(listener: (event: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async request<TResult = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: BridgeRequestOptions = {},
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

  #ensurePort(): chrome.runtime.Port {
    if (this.#port) {
      return this.#port;
    }

    try {
      this.#port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
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
        chrome.runtime.lastError?.message ?? "Native host disconnected",
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

  #handleMessage(message: BridgeMessage): void {
    if (message.event) {
      for (const listener of this.#listeners) {
        listener(message.event);
      }
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
