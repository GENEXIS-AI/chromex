import { describe, expect, test, vi } from "vitest";

import { createDebouncedTask } from "../src/sidepanel/debounced-task.js";

describe("createDebouncedTask", () => {
  test("coalesces repeated schedules into one execution", async () => {
    vi.useFakeTimers();
    const callback = vi.fn(async () => undefined);
    const task = createDebouncedTask(callback, 120);

    void task.schedule();
    void task.schedule();
    void task.schedule();

    expect(callback).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120);

    expect(callback).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test("flush runs pending work immediately", async () => {
    vi.useFakeTimers();
    const callback = vi.fn(async () => undefined);
    const task = createDebouncedTask(callback, 120);

    void task.schedule();
    await task.flush();

    expect(callback).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
