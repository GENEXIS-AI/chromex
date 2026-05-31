import type { SavedConversation } from "../types.js";

export function deleteConversationHistoryEntry(input: {
  conversations: SavedConversation[];
  conversationId: string;
  currentConversationId: string | null;
}): {
  conversations: SavedConversation[];
  currentConversationId: string | null;
} {
  const conversations = input.conversations.filter((conversation) => conversation.id !== input.conversationId);
  return {
    conversations,
    currentConversationId: input.currentConversationId === input.conversationId ? null : input.currentConversationId,
  };
}

export function clearConversationHistoryState(): {
  conversations: SavedConversation[];
  currentConversationId: string | null;
} {
  return {
    conversations: [],
    currentConversationId: null,
  };
}

export function resolveVisibleCurrentConversation(input: {
  conversations: SavedConversation[];
  currentConversationId: string | null | undefined;
  draftConversation?: SavedConversation | null;
}): SavedConversation | null {
  const currentConversationId = input.currentConversationId?.trim();
  if (!currentConversationId) {
    return null;
  }
  return (
    input.conversations.find((conversation) => conversation.id === currentConversationId) ??
    (input.draftConversation?.id === currentConversationId ? input.draftConversation : null)
  );
}
