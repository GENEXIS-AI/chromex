type TimerHandle = ReturnType<typeof setTimeout>;

export function createDebouncedTask(
  callback: () => Promise<void>,
  delayMs: number,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout,
): {
  schedule: () => Promise<void>;
  flush: () => Promise<void>;
} {
  let handle: TimerHandle | null = null;
  let pendingPromise: Promise<void> | null = null;
  let resolvePending: (() => void) | null = null;

  const run = async () => {
    handle = null;
    const currentResolve = resolvePending;
    resolvePending = null;
    try {
      await callback();
    } finally {
      currentResolve?.();
      pendingPromise = null;
    }
  };

  return {
    schedule() {
      if (handle) {
        cancel(handle);
      }
      if (!pendingPromise) {
        pendingPromise = new Promise<void>((resolve) => {
          resolvePending = resolve;
        });
      }
      handle = schedule(() => {
        void run();
      }, delayMs);
      return pendingPromise;
    },
    async flush() {
      if (handle) {
        cancel(handle);
        await run();
        return;
      }
      if (pendingPromise) {
        await pendingPromise;
      }
    },
  };
}
