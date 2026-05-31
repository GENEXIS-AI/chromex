import { describe, expect, test } from "vitest";

import {
  clearConversationHistoryState,
  deleteConversationHistoryEntry,
  resolveVisibleCurrentConversation,
} from "../src/background/conversation-history.js";
import {
  prepareConversationsForStorage,
  sanitizeConversationForStorage,
  shouldPersistConversationInHistory,
} from "../src/background/storage.js";
import type { SavedConversation } from "../src/types.js";

function makeConversation(id: string): SavedConversation {
  return {
    id,
    title: id,
    profileId: "default",
    messages: [],
    attachments: [],
    structuredInputs: [],
    selectedTabIds: [],
    historyQuery: "",
    readStrategyOverride: "auto",
    updatedAt: Date.now(),
  };
}

describe("conversation history helpers", () => {
  test("does not persist empty draft conversations in recent chat history", () => {
    expect(shouldPersistConversationInHistory(makeConversation("empty-draft"))).toBe(false);

    const conversation = makeConversation("started-chat");
    conversation.messages = [{ id: "user-1", role: "user", text: "Hello" }];

    expect(shouldPersistConversationInHistory(conversation)).toBe(true);
    expect(prepareConversationsForStorage([makeConversation("empty-draft"), conversation]).map((item) => item.id)).toEqual([
      "started-chat",
    ]);
  });

  test("persists conference transcript history even without chat messages", () => {
    const conversation = makeConversation("conference-history");
    conversation.conversationMode = "conference";
    conversation.conferenceMode = {
      sourceLabel: "Chrome tab audio",
      entries: [
        {
          id: "conference-transcript-1",
          sourceText: "We can preserve this transcript.",
          translationText: "이 전사 내용을 보존할 수 있습니다.",
          createdAt: 123,
        },
      ],
      targetLanguage: "ko",
      livePlaybackEnabled: false,
      updatedAt: 124,
    };

    expect(shouldPersistConversationInHistory(conversation)).toBe(true);
    expect(prepareConversationsForStorage([makeConversation("empty-draft"), conversation]).map((item) => item.id)).toEqual([
      "conference-history",
    ]);
    expect(sanitizeConversationForStorage(conversation).conversationMode).toBe("conference");
    expect(sanitizeConversationForStorage(conversation).conferenceMode?.entries[0]?.translationText).toBe(
      "이 전사 내용을 보존할 수 있습니다.",
    );
  });

  test("deletes one conversation without changing another active conversation", () => {
    const result = deleteConversationHistoryEntry({
      conversations: [makeConversation("a"), makeConversation("b")],
      conversationId: "a",
      currentConversationId: "b",
    });

    expect(result.conversations.map((conversation) => conversation.id)).toEqual(["b"]);
    expect(result.currentConversationId).toBe("b");
  });

  test("clears the active conversation pointer when deleting the active conversation", () => {
    const result = deleteConversationHistoryEntry({
      conversations: [makeConversation("a"), makeConversation("b")],
      conversationId: "a",
      currentConversationId: "a",
    });

    expect(result.conversations.map((conversation) => conversation.id)).toEqual(["b"]);
    expect(result.currentConversationId).toBeNull();
  });

  test("clears all local conversation history", () => {
    expect(clearConversationHistoryState()).toEqual({
      conversations: [],
      currentConversationId: null,
    });
  });

  test("uses the active unsaved draft instead of falling back to an older stored chat", () => {
    const stored = makeConversation("old-chat");
    const draft = makeConversation("new-chat");

    expect(
      resolveVisibleCurrentConversation({
        conversations: [stored],
        currentConversationId: "new-chat",
        draftConversation: draft,
      })?.id,
    ).toBe("new-chat");
  });

  test("does not return a stored chat that is no longer active", () => {
    expect(
      resolveVisibleCurrentConversation({
        conversations: [makeConversation("old-chat")],
        currentConversationId: "new-chat",
      }),
    ).toBeNull();
  });

  test("strips bridge-backed generated image data before writing history", () => {
    const conversation = makeConversation("image-chat");
    conversation.messages = [
      {
        id: "assistant-1",
        role: "assistant",
        text: "image",
        images: [
          {
            src: "data:image/png;base64,abc123",
            alt: "Generated image",
            assetRef: "codex-asset:00000000-0000-4000-8000-000000000000",
            status: "ready",
          },
        ],
      },
    ];

    expect(sanitizeConversationForStorage(conversation).messages[0]?.images).toEqual([
      {
        src: "",
        alt: "Generated image",
        assetRef: "codex-asset:00000000-0000-4000-8000-000000000000",
        status: "loading",
      },
    ]);
  });

  test("strips inline base64 image data from stored message text", () => {
    const conversation = makeConversation("inline-image-chat");
    conversation.messages = [
      {
        id: "assistant-1",
        role: "assistant",
        text: "![image](data:image/png;base64,abc123)",
      },
    ];

    expect(sanitizeConversationForStorage(conversation).messages[0]?.text).toBe("![image]([stored image asset])");
  });

  test("keeps conversation history under the storage byte budget", () => {
    const conversations = Array.from({ length: 20 }, (_, index) => {
      const conversation = makeConversation(`chat-${index}`);
      conversation.messages = [
        {
          id: `message-${index}`,
          role: "user",
          text: "x".repeat(350_000),
        },
      ];
      return conversation;
    });

    const prepared = prepareConversationsForStorage(conversations);
    const encodedBytes = new TextEncoder().encode(JSON.stringify(prepared)).byteLength;

    expect(encodedBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(prepared.length).toBeLessThan(conversations.length);
  });
});
