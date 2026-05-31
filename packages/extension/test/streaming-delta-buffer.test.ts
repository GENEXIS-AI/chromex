import { describe, expect, test, vi } from "vitest";

import { createStreamingDeltaBuffer } from "../src/sidepanel/streaming-delta-buffer.js";

describe("createStreamingDeltaBuffer", () => {
  test("coalesces repeated deltas by item before flushing", () => {
    const flushed: Array<Array<{ itemId: string; delta: string }>> = [];
    let scheduled: (() => void) | null = null;
    const buffer = createStreamingDeltaBuffer(
      (batch) => flushed.push(batch),
      (run) => {
        scheduled = run;
        return 1;
      },
    );

    buffer.push("assistant-1", "Hel");
    buffer.push("assistant-1", "lo");
    buffer.push("assistant-2", "!");

    expect(flushed).toEqual([]);
    scheduled?.();

    expect(flushed).toEqual([
      [
        { itemId: "assistant-1", delta: "Hello" },
        { itemId: "assistant-2", delta: "!" },
      ],
    ]);
  });

  test("flushes synchronously and ignores stale scheduled callbacks", () => {
    const flushed: Array<Array<{ itemId: string; delta: string }>> = [];
    let scheduled: (() => void) | null = null;
    const cancel = vi.fn();
    const buffer = createStreamingDeltaBuffer(
      (batch) => flushed.push(batch),
      (run) => {
        scheduled = run;
        return 7;
      },
      cancel,
    );

    buffer.push("assistant", "A");
    buffer.flush();
    scheduled?.();

    expect(cancel).toHaveBeenCalledWith(7);
    expect(flushed).toEqual([[{ itemId: "assistant", delta: "A" }]]);
  });

  test("clear drops queued deltas", () => {
    const flushed: Array<Array<{ itemId: string; delta: string }>> = [];
    let scheduled: (() => void) | null = null;
    const cancel = vi.fn();
    const buffer = createStreamingDeltaBuffer(
      (batch) => flushed.push(batch),
      (run) => {
        scheduled = run;
        return 3;
      },
      cancel,
    );

    buffer.push("assistant", "discard me");
    buffer.clear();
    scheduled?.();

    expect(cancel).toHaveBeenCalledWith(3);
    expect(flushed).toEqual([]);
  });
});
