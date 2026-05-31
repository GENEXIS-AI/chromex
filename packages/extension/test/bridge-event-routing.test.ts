import { describe, expect, test } from "vitest";

import { resolveBridgeEventConversationId } from "../src/background/bridge-event-routing.js";

describe("resolveBridgeEventConversationId", () => {
  test("uses explicit conversation ids when bridge events already carry them", () => {
    expect(
      resolveBridgeEventConversationId(
        {
          type: "message.completed",
          conversationId: "conversation-explicit",
          threadId: "thread-a",
        },
        {
          findConversationIdForThread: () => "conversation-thread",
        },
      ),
    ).toBe("conversation-explicit");
  });

  test("routes streamed message events by thread id for detached conversations", () => {
    expect(
      resolveBridgeEventConversationId(
        {
          type: "message.delta",
          threadId: "thread-b",
          turnId: "turn-b",
          itemId: "assistant",
          delta: "partial",
        },
        {
          findConversationIdForThread: (threadId) => (threadId === "thread-b" ? "conversation-b" : null),
        },
      ),
    ).toBe("conversation-b");
  });

  test("routes nested turn events with the same resolver", () => {
    expect(
      resolveBridgeEventConversationId(
        {
          type: "turn.started",
          activeTurn: {
            threadId: "thread-c",
            turnId: "turn-c",
          },
        },
        {
          findConversationIdForThread: (threadId) => (threadId === "thread-c" ? "conversation-c" : null),
        },
      ),
    ).toBe("conversation-c");
  });

  test("routes nested plan, diff, and reroute events by thread id", () => {
    const resolver = {
      findConversationIdForThread: (threadId: string) => (threadId === "thread-d" ? "conversation-d" : null),
    };

    expect(
      resolveBridgeEventConversationId(
        {
          type: "turn.plan.updated",
          plan: { threadId: "thread-d", turnId: "turn-d", steps: [] },
        },
        resolver,
      ),
    ).toBe("conversation-d");
    expect(
      resolveBridgeEventConversationId(
        {
          type: "turn.diff.updated",
          diff: { threadId: "thread-d", turnId: "turn-d", diff: "changed" },
        },
        resolver,
      ),
    ).toBe("conversation-d");
    expect(
      resolveBridgeEventConversationId(
        {
          type: "model.rerouted",
          reroute: { threadId: "thread-d", turnId: "turn-d", fromModel: "a", toModel: "b" },
        },
        resolver,
      ),
    ).toBe("conversation-d");
  });

  test("routes plan user input requests by top-level thread id", () => {
    expect(
      resolveBridgeEventConversationId(
        {
          type: "plan.user_input.requested",
          threadId: "thread-plan",
          turnId: "turn-plan",
          requestId: "request-plan",
          questions: [{ id: "stack", question: "What stack should this use?" }],
        },
        {
          findConversationIdForThread: (threadId) => (threadId === "thread-plan" ? "conversation-plan" : null),
        },
      ),
    ).toBe("conversation-plan");
  });
});
