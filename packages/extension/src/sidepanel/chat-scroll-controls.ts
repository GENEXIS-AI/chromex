export interface ChatScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

const DEFAULT_SCROLL_TO_BOTTOM_THRESHOLD_PX = 96;
const DEFAULT_STICK_TO_BOTTOM_THRESHOLD_PX = 24;

export function shouldShowScrollToBottomButton(
  metrics: ChatScrollMetrics,
  thresholdPx = DEFAULT_SCROLL_TO_BOTTOM_THRESHOLD_PX,
): boolean {
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  if (maxScrollTop <= 0) {
    return false;
  }

  return maxScrollTop - metrics.scrollTop > thresholdPx;
}

export function shouldStickToBottomAfterRender(
  metrics: ChatScrollMetrics,
  options: {
    thresholdPx?: number;
    userScrollOverrideActive?: boolean;
  } = {},
): boolean {
  if (options.userScrollOverrideActive) {
    return false;
  }

  const thresholdPx = options.thresholdPx ?? DEFAULT_STICK_TO_BOTTOM_THRESHOLD_PX;
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  return maxScrollTop - metrics.scrollTop <= thresholdPx;
}
