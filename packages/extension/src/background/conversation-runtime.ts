import type { CodexActiveTurn } from "@codex-sidepanel/shared";

export interface ConversationRuntimeState {
  conversationId: string;
  threadId?: string;
  activeTurn: CodexActiveTurn | null;
  lastAutoCompactThreadId: string;
  lastAutoCompactBucket: number | null;
}

function createRuntimeState(conversationId: string): ConversationRuntimeState {
  return {
    conversationId,
    activeTurn: null,
    lastAutoCompactThreadId: "",
    lastAutoCompactBucket: null,
  };
}

export class ConversationRuntimeRegistry {
  readonly #states = new Map<string, ConversationRuntimeState>();
  readonly #threadConversationIds = new Map<string, string>();

  get(conversationId: string): ConversationRuntimeState {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) {
      throw new Error("Missing conversation id.");
    }

    const existing = this.#states.get(normalizedConversationId);
    if (existing) {
      return existing;
    }

    const next = createRuntimeState(normalizedConversationId);
    this.#states.set(normalizedConversationId, next);
    return next;
  }

  setThreadId(conversationId: string, threadId: string | undefined): ConversationRuntimeState {
    const state = this.get(conversationId);
    if (state.threadId) {
      this.#threadConversationIds.delete(state.threadId);
    }
    const normalizedThreadId = threadId?.trim() || "";
    if (normalizedThreadId) {
      state.threadId = normalizedThreadId;
    } else {
      delete state.threadId;
    }
    if (state.threadId) {
      this.#threadConversationIds.set(state.threadId, state.conversationId);
    }
    return state;
  }

  setActiveTurn(conversationId: string, activeTurn: CodexActiveTurn | null): ConversationRuntimeState {
    const state = this.get(conversationId);
    state.activeTurn = activeTurn;
    if (activeTurn?.threadId) {
      this.setThreadId(conversationId, activeTurn.threadId);
    }
    return state;
  }

  findConversationIdForThread(threadId: string | undefined): string | null {
    const normalizedThreadId = threadId?.trim();
    if (!normalizedThreadId) {
      return null;
    }
    return this.#threadConversationIds.get(normalizedThreadId) ?? null;
  }

  completeTurn(threadId: string | undefined, turnId: string | undefined): string | null {
    const conversationId = this.findConversationIdForThread(threadId);
    if (!conversationId) {
      return null;
    }
    const state = this.get(conversationId);
    if (!turnId || state.activeTurn?.turnId === turnId) {
      state.activeTurn = null;
    }
    return conversationId;
  }

  resetConversation(conversationId: string): ConversationRuntimeState {
    const state = this.get(conversationId);
    if (state.threadId) {
      this.#threadConversationIds.delete(state.threadId);
    }
    delete state.threadId;
    state.activeTurn = null;
    state.lastAutoCompactThreadId = "";
    state.lastAutoCompactBucket = null;
    return state;
  }

  deleteConversation(conversationId: string): void {
    const state = this.#states.get(conversationId);
    if (state?.threadId) {
      this.#threadConversationIds.delete(state.threadId);
    }
    this.#states.delete(conversationId);
  }

  clear(): void {
    this.#states.clear();
    this.#threadConversationIds.clear();
  }
}
