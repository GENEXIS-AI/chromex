import type { CodexActiveTurn } from "@codex-sidepanel/shared";

import type { PromptActivityState } from "./prompt-activity.js";

export function collectBusyConversationIds(input: {
  currentConversationId: string | null | undefined;
  currentPromptActivity: PromptActivityState | null;
  currentActiveTurn: CodexActiveTurn | null;
  currentStreamingMessageIds: ReadonlySet<string>;
  promptActivitiesByConversationId: ReadonlyMap<string, PromptActivityState>;
  activeTurnsByConversationId: ReadonlyMap<string, CodexActiveTurn>;
  streamingAssistantMessageIdsByConversationId: ReadonlyMap<string, ReadonlySet<string>>;
  completedTurnIds: ReadonlySet<string>;
}): Set<string> {
  const busyConversationIds = new Set<string>();
  const currentConversationId = input.currentConversationId?.trim();
  if (
    currentConversationId &&
    (Boolean(input.currentPromptActivity) ||
      isRunningActiveTurn(input.currentActiveTurn, input.completedTurnIds) ||
      input.currentStreamingMessageIds.size > 0)
  ) {
    busyConversationIds.add(currentConversationId);
  }

  for (const conversationId of input.promptActivitiesByConversationId.keys()) {
    busyConversationIds.add(conversationId);
  }

  for (const [conversationId, activeTurn] of input.activeTurnsByConversationId) {
    if (isRunningActiveTurn(activeTurn, input.completedTurnIds)) {
      busyConversationIds.add(conversationId);
    }
  }

  for (const [conversationId, messageIds] of input.streamingAssistantMessageIdsByConversationId) {
    if (messageIds.size) {
      busyConversationIds.add(conversationId);
    }
  }

  return busyConversationIds;
}

function isRunningActiveTurn(activeTurn: CodexActiveTurn | null, completedTurnIds: ReadonlySet<string>): boolean {
  return Boolean(activeTurn?.turnId && !completedTurnIds.has(activeTurn.turnId));
}
