export interface BridgeEventConversationResolver {
  findConversationIdForThread(threadId: string): string | null;
}

export function resolveBridgeEventConversationId(
  event: unknown,
  resolver: BridgeEventConversationResolver,
): string | null {
  const record = asRecord(event);
  if (!record) {
    return null;
  }

  const explicitConversationId = getString(record.conversationId);
  if (explicitConversationId) {
    return explicitConversationId;
  }

  const threadId =
    getString(record.threadId) ||
    getNestedString(record.activeTurn, "threadId") ||
    getNestedString(record.plan, "threadId") ||
    getNestedString(record.diff, "threadId") ||
    getNestedString(record.reroute, "threadId");

  return threadId ? resolver.findConversationIdForThread(threadId) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getNestedString(value: unknown, field: string): string {
  const record = asRecord(value);
  return record ? getString(record[field]) : "";
}
