import { afterEach, describe, expect, test, vi } from "vitest";

import { NativeBridgeClient } from "../src/background/native-bridge-client.js";

type PortMessage = {
  id?: string;
  result?: unknown;
  error?: { message: string };
  event?: unknown;
};

function createFakeNativePort() {
  const messageListeners = new Set<(message: PortMessage) => void>();
  const disconnectListeners = new Set<() => void>();
  return {
    postMessage: vi.fn(),
    onMessage: {
      addListener(listener: (message: PortMessage) => void) {
        messageListeners.add(listener);
      },
    },
    onDisconnect: {
      addListener(listener: () => void) {
        disconnectListeners.add(listener);
      },
    },
    emit(message: PortMessage) {
      for (const listener of messageListeners) {
        listener(message);
      }
    },
    disconnect() {
      for (const listener of disconnectListeners) {
        listener();
      }
    },
  };
}

describe("NativeBridgeClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("rejects a stalled bridge request after the configured timeout", async () => {
    vi.useFakeTimers();
    const port = createFakeNativePort();
    vi.stubGlobal("chrome", {
      runtime: {
        connectNative: vi.fn(() => port),
        lastError: null,
      },
    });

    const client = new NativeBridgeClient();
    const request = client.request("image.edit.start", {}, {
      timeoutMs: 25,
      timeoutMessage: "Image edit timed out.",
    });
    const assertion = expect(request).rejects.toThrow("Image edit timed out.");

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  test("resolves before timeout when the native host responds", async () => {
    vi.useFakeTimers();
    const port = createFakeNativePort();
    vi.stubGlobal("chrome", {
      runtime: {
        connectNative: vi.fn(() => port),
        lastError: null,
      },
    });

    const client = new NativeBridgeClient();
    const request = client.request<{ ok: true }>("model.list", {}, { timeoutMs: 25 });
    const posted = port.postMessage.mock.calls[0]?.[0] as { id: string };
    port.emit({ id: posted.id, result: { ok: true } });

    await expect(request).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(25);
  });

  test("falls back to browser.runtime.connectNative for Safari-style WebExtensions", async () => {
    vi.useFakeTimers();
    const port = createFakeNativePort();
    const connectNative = vi.fn(() => port);
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", {
      runtime: {
        connectNative,
        lastError: null,
      },
    });

    const client = new NativeBridgeClient();
    const request = client.request<{ ok: true }>("model.list", {}, { timeoutMs: 25 });
    const posted = port.postMessage.mock.calls[0]?.[0] as { id: string };
    port.emit({ id: posted.id, result: { ok: true } });

    expect(connectNative).toHaveBeenCalledWith("com.codex.sidepanel.bridge");
    await expect(request).resolves.toEqual({ ok: true });
  });

  test("uses connectionless native messaging and polls queued Safari events when ports are unavailable", async () => {
    vi.useFakeTimers();
    const sendNativeMessage = vi.fn(async (_application: string, message: { id: string; method: string }) => {
      if (message.method === "__chromex.events.poll") {
        return { id: message.id, result: { events: [{ type: "turn.completed" }] } };
      }
      return { id: message.id, result: { ok: true } };
    });
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", {
      runtime: {
        sendNativeMessage,
        lastError: null,
      },
    });

    const client = new NativeBridgeClient();
    const events: unknown[] = [];
    client.subscribe((event) => events.push(event));

    await expect(client.request<{ ok: true }>("model.list", {}, { timeoutMs: 25 })).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(250);

    expect(sendNativeMessage).toHaveBeenCalledWith(
      "com.codex.sidepanel.bridge",
      expect.objectContaining({ method: "model.list" }),
    );
    expect(sendNativeMessage).toHaveBeenCalledWith(
      "com.codex.sidepanel.bridge",
      expect.objectContaining({ method: "__chromex.events.poll" }),
    );
    expect(events).toEqual([{ type: "turn.completed" }]);
  });
});
