import { describe, expect, test } from "vitest";

import { ConversationRuntimeRegistry } from "../src/background/conversation-runtime.js";

describe("conversation runtime registry", () => {
  test("keeps thread and turn state isolated per conversation", () => {
    const registry = new ConversationRuntimeRegistry();

    registry.setThreadId("chat-a", "thread-a");
    registry.setThreadId("chat-b", "thread-b");
    registry.setActiveTurn("chat-a", { threadId: "thread-a", turnId: "turn-a" });

    expect(registry.get("chat-a")).toMatchObject({
      conversationId: "chat-a",
      threadId: "thread-a",
      activeTurn: { threadId: "thread-a", turnId: "turn-a" },
    });
    expect(registry.get("chat-b")).toMatchObject({
      conversationId: "chat-b",
      threadId: "thread-b",
      activeTurn: null,
    });
  });

  test("resolves bridge events back to the owning conversation", () => {
    const registry = new ConversationRuntimeRegistry();

    registry.setThreadId("chat-a", "thread-a");
    registry.setThreadId("chat-b", "thread-b");

    expect(registry.findConversationIdForThread("thread-a")).toBe("chat-a");
    expect(registry.findConversationIdForThread("thread-b")).toBe("chat-b");
    expect(registry.findConversationIdForThread("missing-thread")).toBeNull();
  });

  test("clears only the completed conversation turn", () => {
    const registry = new ConversationRuntimeRegistry();

    registry.setActiveTurn("chat-a", { threadId: "thread-a", turnId: "turn-a" });
    registry.setActiveTurn("chat-b", { threadId: "thread-b", turnId: "turn-b" });

    expect(registry.completeTurn("thread-a", "turn-a")).toBe("chat-a");
    expect(registry.get("chat-a").activeTurn).toBeNull();
    expect(registry.get("chat-b").activeTurn).toEqual({ threadId: "thread-b", turnId: "turn-b" });
  });

  test("resetting one conversation does not clear another in-flight session", () => {
    const registry = new ConversationRuntimeRegistry();

    registry.setThreadId("chat-a", "thread-a");
    registry.setActiveTurn("chat-a", { threadId: "thread-a", turnId: "turn-a" });
    registry.setThreadId("chat-b", "thread-b");
    registry.setActiveTurn("chat-b", { threadId: "thread-b", turnId: "turn-b" });

    registry.resetConversation("chat-a");

    expect(registry.get("chat-a")).toMatchObject({
      conversationId: "chat-a",
      activeTurn: null,
    });
    expect(registry.get("chat-a").threadId).toBeUndefined();
    expect(registry.get("chat-b")).toMatchObject({
      conversationId: "chat-b",
      threadId: "thread-b",
      activeTurn: { threadId: "thread-b", turnId: "turn-b" },
    });
  });
});
