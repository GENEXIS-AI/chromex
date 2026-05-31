export const DEFAULT_VISIBLE_TAB_CAPTURE_MIN_INTERVAL_MS = 550;

export interface VisibleTabCaptureThrottleOptions {
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createVisibleTabCaptureThrottle(options: VisibleTabCaptureThrottleOptions = {}) {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_VISIBLE_TAB_CAPTURE_MIN_INTERVAL_MS;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let nextAllowedAt = 0;
  let queue = Promise.resolve();

  return function throttleCapture<T>(capture: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const waitMs = Math.max(0, nextAllowedAt - now());
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      const scheduledAt = Math.max(now(), nextAllowedAt);
      nextAllowedAt = scheduledAt + minIntervalMs;
      return capture();
    });

    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export function isCaptureVisibleTabQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND");
}
