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
});
