import { describe, expect, test } from "vitest";

import {
  createVisibleTabCaptureThrottle,
  isCaptureVisibleTabQuotaError,
} from "../src/background/visible-tab-capture-throttle.js";

describe("visible tab capture throttle", () => {
  test("serializes captures below Chrome's per-second quota", async () => {
    let now = 0;
    const captureTimes: number[] = [];
    const throttle = createVisibleTabCaptureThrottle({
      minIntervalMs: 550,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });

    await Promise.all([
      throttle(async () => {
        captureTimes.push(now);
        return "first";
      }),
      throttle(async () => {
        captureTimes.push(now);
        return "second";
      }),
      throttle(async () => {
        captureTimes.push(now);
        return "third";
      }),
    ]);

    expect(captureTimes).toEqual([0, 550, 1100]);
  });

  test("detects Chrome visible-tab quota errors", () => {
    expect(isCaptureVisibleTabQuotaError(new Error("This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota."))).toBe(
      true,
    );
    expect(isCaptureVisibleTabQuotaError(new Error("Cannot access this tab."))).toBe(false);
  });
});
