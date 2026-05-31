import type { ChatScrollMetrics } from "./chat-scroll-controls.js";

export const DEFAULT_CHAT_MESSAGE_WINDOW_SIZE = 80;
export const CHAT_MESSAGE_WINDOW_INCREMENT = 40;

const DEFAULT_LOAD_OLDER_THRESHOLD_PX = 64;

export function getChatMessageWindow<T>(
  messages: T[],
  requestedCount = DEFAULT_CHAT_MESSAGE_WINDOW_SIZE,
): { visibleMessages: T[]; hiddenCount: number } {
  const count = Math.max(0, Math.floor(requestedCount));
  if (count <= 0 || messages.length <= count) {
    return {
      visibleMessages: messages,
      hiddenCount: 0,
    };
  }

  return {
    visibleMessages: messages.slice(-count),
    hiddenCount: messages.length - count,
  };
}

export function shouldExpandChatMessageWindowOnScroll(
  metrics: ChatScrollMetrics,
  hiddenCount: number,
  thresholdPx = DEFAULT_LOAD_OLDER_THRESHOLD_PX,
): boolean {
  return hiddenCount > 0 && metrics.scrollTop <= thresholdPx;
}

export function calculateNextChatMessageWindowSize(
  currentCount: number,
  totalCount: number,
  increment = CHAT_MESSAGE_WINDOW_INCREMENT,
): number {
  return Math.min(Math.max(0, Math.floor(totalCount)), Math.max(0, Math.floor(currentCount)) + Math.max(1, Math.floor(increment)));
}
