import { describe, expect, test } from "vitest";

import {
  AUTO_COMPACT_MESSAGE_THRESHOLD,
  isRecoverableMissingCodexThreadError,
  shouldAutoCompactConversation,
} from "../src/background/auto-compact.js";

describe("shouldAutoCompactConversation", () => {
  test("does not compact short conversations", () => {
    expect(
      shouldAutoCompactConversation({
        enabled: true,
        threadId: "thread-1",
        messageCount: AUTO_COMPACT_MESSAGE_THRESHOLD - 1,
      }),
    ).toEqual({ shouldCompact: false, bucket: null });
  });

  test("compacts once per message bucket for an active thread", () => {
    expect(
      shouldAutoCompactConversation({
        enabled: true,
        threadId: "thread-1",
        messageCount: AUTO_COMPACT_MESSAGE_THRESHOLD,
      }),
    ).toEqual({ shouldCompact: true, bucket: 0 });

    expect(
      shouldAutoCompactConversation({
        enabled: true,
        threadId: "thread-1",
        messageCount: AUTO_COMPACT_MESSAGE_THRESHOLD,
        lastCompactedThreadId: "thread-1",
        lastCompactedBucket: 0,
      }),
    ).toEqual({ shouldCompact: false, bucket: 0 });
  });

  test("skips compacting without a thread or while another turn is active", () => {
    expect(
      shouldAutoCompactConversation({
        enabled: true,
        messageCount: AUTO_COMPACT_MESSAGE_THRESHOLD,
      }),
    ).toEqual({ shouldCompact: false, bucket: 0 });

    expect(
      shouldAutoCompactConversation({
        enabled: true,
        threadId: "thread-1",
        messageCount: AUTO_COMPACT_MESSAGE_THRESHOLD,
        turnActive: true,
      }),
    ).toEqual({ shouldCompact: false, bucket: 0 });
  });

  test("classifies stale Codex thread errors as recoverable", () => {
    expect(isRecoverableMissingCodexThreadError(new Error("thread not found: 019dc610-b810-73a1-ae21-7c9efa2d88ca"))).toBe(true);
    expect(isRecoverableMissingCodexThreadError(new Error("unknown conversation"))).toBe(true);
    expect(isRecoverableMissingCodexThreadError(new Error("unauthorized"))).toBe(false);
  });
});
