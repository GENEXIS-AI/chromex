export function selectBrowserWindowIdForPopout(input: {
  activeTabWindowId?: number | undefined;
  rememberedWindowId?: number | undefined;
  focusedWindowId?: number | undefined;
  normalWindowIds?: number[] | undefined;
}): number | undefined {
  return firstFiniteWindowId(
    input.activeTabWindowId,
    input.rememberedWindowId,
    input.focusedWindowId,
    ...(input.normalWindowIds ?? []),
  );
}

export function createPopoutUrlPath(targetWindowId?: number | undefined): string {
  if (typeof targetWindowId === "number" && Number.isFinite(targetWindowId)) {
    return `sidepanel.html?mode=popup&targetWindowId=${targetWindowId}`;
  }
  return "sidepanel.html?mode=popup";
}

function firstFiniteWindowId(...values: Array<number | undefined>): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
}
