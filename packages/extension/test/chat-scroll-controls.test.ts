import { describe, expect, test } from "vitest";

import {
  shouldShowScrollToBottomButton,
  shouldStickToBottomAfterRender,
} from "../src/sidepanel/chat-scroll-controls.js";

describe("chat scroll controls", () => {
  test("hides the scroll-to-bottom affordance when the chat is already near the bottom", () => {
    expect(
      shouldShowScrollToBottomButton({
        scrollTop: 890,
        scrollHeight: 1200,
        clientHeight: 300,
      }),
    ).toBe(false);
  });

  test("shows the scroll-to-bottom affordance after the user scrolls up", () => {
    expect(
      shouldShowScrollToBottomButton({
        scrollTop: 600,
        scrollHeight: 1200,
        clientHeight: 300,
      }),
    ).toBe(true);
  });

  test("hides the control when the chat is not scrollable", () => {
    expect(
      shouldShowScrollToBottomButton({
        scrollTop: 0,
        scrollHeight: 280,
        clientHeight: 300,
      }),
    ).toBe(false);
  });

  test("does not force bottom stickiness while the user is scrolling away from latest messages", () => {
    expect(
      shouldStickToBottomAfterRender(
        {
          scrollTop: 900,
          scrollHeight: 1200,
          clientHeight: 300,
        },
        { userScrollOverrideActive: true },
      ),
    ).toBe(false);
  });
});
