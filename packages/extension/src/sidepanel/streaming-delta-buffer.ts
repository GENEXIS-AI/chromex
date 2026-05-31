export type StreamingDeltaFlush = Array<{ itemId: string; delta: string }>;

type ScheduleFlush = (callback: () => void) => number;
type CancelFlush = (handle: number) => void;

export function createStreamingDeltaBuffer(
  flush: (batch: StreamingDeltaFlush) => void,
  schedule: ScheduleFlush,
  cancel?: CancelFlush,
): {
  push: (itemId: string, delta: string) => void;
  flush: () => void;
  clear: () => void;
} {
  const pending = new Map<string, string>();
  let scheduled = false;
  let handle: number | null = null;
  let generation = 0;

  const flushPending = () => {
    if (!pending.size) {
      return;
    }
    const batch = Array.from(pending.entries()).map(([itemId, delta]) => ({ itemId, delta }));
    pending.clear();
    flush(batch);
  };

  const run = (expectedGeneration?: number) => {
    if (expectedGeneration !== undefined && expectedGeneration !== generation) {
      return;
    }
    scheduled = false;
    handle = null;
    flushPending();
  };

  return {
    push(itemId, delta) {
      if (!delta) {
        return;
      }
      pending.set(itemId, `${pending.get(itemId) ?? ""}${delta}`);
      if (scheduled) {
        return;
      }
      scheduled = true;
      generation += 1;
      const expectedGeneration = generation;
      handle = schedule(() => run(expectedGeneration));
    },
    flush() {
      if (scheduled && handle !== null && cancel) {
        cancel(handle);
      }
      generation += 1;
      scheduled = false;
      handle = null;
      flushPending();
    },
    clear() {
      if (scheduled && handle !== null && cancel) {
        cancel(handle);
      }
      generation += 1;
      scheduled = false;
      handle = null;
      pending.clear();
    },
  };
}
