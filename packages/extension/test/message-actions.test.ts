import { describe, expect, test } from "vitest";

import { prepareMessageReplay } from "../src/sidepanel/message-actions.js";
import { DEFAULT_PROFILE_ID } from "../src/sidepanel/profile-selection.js";
import type { ConversationMessage } from "../src/types.js";

const messages: ConversationMessage[] = [
  { id: "user-1", role: "user", text: "첫 질문" },
  { id: "assistant-1", role: "assistant", text: "첫 답변" },
  {
    id: "user-2",
    role: "user",
    text: "두 번째 질문",
    profile: {
      id: "research-assistant",
      name: "Research Assistant",
      color: "#3366ff",
      icon: "search",
    },
  },
  { id: "assistant-2", role: "assistant", text: "두 번째 답변" },
];

describe("message actions", () => {
  test("regenerates an assistant answer from the previous user message and drops later messages", () => {
    expect(prepareMessageReplay(messages, "assistant-2")).toEqual({
      prompt: "두 번째 질문",
      messagesBeforePrompt: messages.slice(0, 2),
      userMessageId: "user-2",
      profileId: "research-assistant",
    });
  });

  test("resends an edited user message from that point and drops the old branch", () => {
    expect(prepareMessageReplay(messages, "user-1", "수정한 첫 질문")).toEqual({
      prompt: "수정한 첫 질문",
      messagesBeforePrompt: [],
      userMessageId: "user-1",
      profileId: DEFAULT_PROFILE_ID,
    });
  });

  test("rejects empty edited messages", () => {
    expect(prepareMessageReplay(messages, "user-2", "   ")).toBeNull();
  });

  test("keeps the original user message profile when regenerating an assistant answer", () => {
    const profiledMessages: ConversationMessage[] = [
      {
        id: "user-research",
        role: "user",
        text: "이 논문 요약해줘",
        profile: {
          id: "research",
          name: "Research Assistant",
          color: "#2563eb",
          icon: "book-open",
        },
      },
      { id: "assistant-research", role: "assistant", text: "요약입니다." },
    ];

    expect(prepareMessageReplay(profiledMessages, "assistant-research")).toEqual({
      prompt: "이 논문 요약해줘",
      messagesBeforePrompt: [],
      userMessageId: "user-research",
      profileId: "research",
    });
  });
});
