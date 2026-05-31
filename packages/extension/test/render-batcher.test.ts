import { describe, expect, test, vi } from "vitest";

import { createRenderBatcher } from "../src/sidepanel/render-batcher.js";

describe("createRenderBatcher", () => {
  test("coalesces repeated requests into one scheduled render", () => {
    const callback = vi.fn();
    let scheduled: (() => void) | null = null;
    const batcher = createRenderBatcher(callback, (run) => {
      scheduled = run;
      return 1;
    });

    batcher.request();
    batcher.request();
    batcher.request();

    expect(callback).not.toHaveBeenCalled();
    expect(scheduled).not.toBeNull();

    scheduled?.();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("flushes immediately when a render is already queued", () => {
    const callback = vi.fn();
    let scheduled: (() => void) | null = null;
    const batcher = createRenderBatcher(callback, (run) => {
      scheduled = run;
      return 1;
    });

    batcher.request();
    batcher.flush();

    expect(callback).toHaveBeenCalledTimes(1);

    scheduled?.();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
