type ScheduleRender = (callback: () => void) => number;
type CancelRender = (handle: number) => void;

export function createRenderBatcher(
  callback: () => void,
  schedule: ScheduleRender,
  cancel?: CancelRender,
): {
  request: () => void;
  flush: () => void;
} {
  let scheduled = false;
  let handle: number | null = null;
  let generation = 0;

  const run = (expectedGeneration?: number) => {
    if (expectedGeneration !== undefined && expectedGeneration !== generation) {
      return;
    }
    scheduled = false;
    handle = null;
    callback();
  };

  return {
    request() {
      if (scheduled) {
        return;
      }
      scheduled = true;
      generation += 1;
      const expectedGeneration = generation;
      handle = schedule(() => run(expectedGeneration));
    },
    flush() {
      if (!scheduled) {
        callback();
        return;
      }
      if (handle !== null && cancel) {
        cancel(handle);
      }
      generation += 1;
      run();
    },
  };
}
