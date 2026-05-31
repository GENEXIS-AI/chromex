export const AUTO_COMPACT_MESSAGE_THRESHOLD = 48;
export const AUTO_COMPACT_MESSAGE_INTERVAL = 24;

export interface AutoCompactDecisionInput {
  enabled: boolean;
  threadId?: string;
  messageCount: number;
  lastCompactedThreadId?: string;
  lastCompactedBucket?: number;
  turnActive?: boolean;
}

export interface AutoCompactDecision {
  shouldCompact: boolean;
  bucket: number | null;
}

export function getAutoCompactBucket(messageCount: number): number | null {
  if (messageCount < AUTO_COMPACT_MESSAGE_THRESHOLD) {
    return null;
  }

  return Math.floor((messageCount - AUTO_COMPACT_MESSAGE_THRESHOLD) / AUTO_COMPACT_MESSAGE_INTERVAL);
}

export function shouldAutoCompactConversation(input: AutoCompactDecisionInput): AutoCompactDecision {
  const bucket = getAutoCompactBucket(input.messageCount);
  if (!input.enabled || !input.threadId || input.turnActive || bucket === null) {
    return { shouldCompact: false, bucket };
  }

  if (input.lastCompactedThreadId === input.threadId && input.lastCompactedBucket === bucket) {
    return { shouldCompact: false, bucket };
  }

  return { shouldCompact: true, bucket };
}

export function isRecoverableMissingCodexThreadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\bthread not found\b|no turns for conversation|unknown conversation/iu.test(message);
}
