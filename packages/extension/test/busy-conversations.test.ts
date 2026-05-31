import { describe, expect, test } from "vitest";

import { collectBusyConversationIds } from "../src/sidepanel/busy-conversations.js";

describe("busy conversation tracking", () => {
  test("ignores completed active turns so recent chats do not keep spinning", () => {
    expect(
      Array.from(
        collectBusyConversationIds({
          currentConversationId: "chat-1",
          currentPromptActivity: null,
          currentActiveTurn: null,
          currentStreamingMessageIds: new Set(),
          promptActivitiesByConversationId: new Map(),
          activeTurnsByConversationId: new Map([["chat-2", { threadId: "thread-2", turnId: "turn-done" }]]),
          streamingAssistantMessageIdsByConversationId: new Map(),
          completedTurnIds: new Set(["turn-done"]),
        }),
      ),
    ).toEqual([]);
  });

  test("keeps conversations busy only while actual prompt, turn, or streaming work remains", () => {
    const busy = collectBusyConversationIds({
      currentConversationId: "chat-1",
      currentPromptActivity: { clientRequestId: "prompt-1", phase: "responding" },
      currentActiveTurn: null,
      currentStreamingMessageIds: new Set(),
      promptActivitiesByConversationId: new Map([["chat-2", { clientRequestId: "prompt-2", phase: "preparing" }]]),
      activeTurnsByConversationId: new Map([["chat-3", { threadId: "thread-3", turnId: "turn-3" }]]),
      streamingAssistantMessageIdsByConversationId: new Map([
        ["chat-4", new Set(["assistant-4"])],
        ["chat-5", new Set()],
      ]),
      completedTurnIds: new Set(),
    });

    expect(Array.from(busy).sort()).toEqual(["chat-1", "chat-2", "chat-3", "chat-4"]);
  });
});
