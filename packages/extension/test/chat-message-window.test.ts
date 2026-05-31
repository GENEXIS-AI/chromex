import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  calculateNextChatMessageWindowSize,
  getChatMessageWindow,
  shouldExpandChatMessageWindowOnScroll,
} from "../src/sidepanel/chat-message-window.js";

const sidepanelSource = readFileSync(resolve(__dirname, "../src/sidepanel/index.ts"), "utf8");

describe("chat message windowing", () => {
  test("starts restored long conversations at the latest messages", () => {
    const messages = Array.from({ length: 120 }, (_, index) => `message-${index + 1}`);

    expect(getChatMessageWindow(messages, 50)).toEqual({
      hiddenCount: 70,
      visibleMessages: messages.slice(-50),
    });
  });

  test("renders every message when the conversation is shorter than the requested window", () => {
    const messages = Array.from({ length: 12 }, (_, index) => `message-${index + 1}`);

    expect(getChatMessageWindow(messages, 50)).toEqual({
      hiddenCount: 0,
      visibleMessages: messages,
    });
  });

  test("expands the window only near the top when older messages are hidden", () => {
    expect(
      shouldExpandChatMessageWindowOnScroll(
        {
          scrollTop: 24,
          scrollHeight: 2000,
          clientHeight: 500,
        },
        10,
      ),
    ).toBe(true);

    expect(
      shouldExpandChatMessageWindowOnScroll(
        {
          scrollTop: 240,
          scrollHeight: 2000,
          clientHeight: 500,
        },
        10,
      ),
    ).toBe(false);

    expect(
      shouldExpandChatMessageWindowOnScroll(
        {
          scrollTop: 0,
          scrollHeight: 2000,
          clientHeight: 500,
        },
        0,
      ),
    ).toBe(false);
  });

  test("loads older messages in bounded increments", () => {
    expect(calculateNextChatMessageWindowSize(50, 120, 40)).toBe(90);
    expect(calculateNextChatMessageWindowSize(90, 120, 40)).toBe(120);
    expect(calculateNextChatMessageWindowSize(120, 120, 40)).toBe(120);
  });

  test("forces the latest chat position when returning from settings or another view", () => {
    expect(sidepanelSource).toContain("let lastRenderedActiveView: MainView | null = null;");
    expect(sidepanelSource).toContain('state.activeView === "chat" && lastRenderedActiveView !== null && lastRenderedActiveView !== "chat"');
    expect(sidepanelSource).toContain("pendingChatScrollToBottom = true;");
    expect(sidepanelSource).toContain("lastRenderedActiveView = state.activeView;");
  });
});
