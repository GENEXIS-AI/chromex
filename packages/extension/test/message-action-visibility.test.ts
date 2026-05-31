import { describe, expect, test } from "vitest";

import { shouldRenderAssistantMessageActions } from "../src/sidepanel/message-action-visibility.js";

describe("message action visibility", () => {
  test("hides assistant actions while the current message is streaming", () => {
    expect(
      shouldRenderAssistantMessageActions({
        messageId: "assistant-1",
        promptActivityActive: false,
        turnActive: false,
        streamingMessageIds: new Set(["assistant-1"]),
      }),
    ).toBe(false);
  });

  test("keeps completed assistant actions visible after streaming is done", () => {
    expect(
      shouldRenderAssistantMessageActions({
        messageId: "assistant-1",
        promptActivityActive: false,
        turnActive: false,
        streamingMessageIds: new Set(),
      }),
    ).toBe(true);
  });

  test("hides assistant actions while a turn-level status is still active", () => {
    expect(
      shouldRenderAssistantMessageActions({
        messageId: "assistant-1",
        promptActivityActive: true,
        turnActive: false,
        streamingMessageIds: new Set(),
      }),
    ).toBe(false);
    expect(
      shouldRenderAssistantMessageActions({
        messageId: "assistant-1",
        promptActivityActive: false,
        turnActive: true,
        streamingMessageIds: new Set(),
      }),
    ).toBe(false);
  });
});
