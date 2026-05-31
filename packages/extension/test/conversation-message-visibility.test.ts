import { describe, expect, test } from "vitest";

import {
  isPendingImageMessage,
  shouldRenderConversationMessage,
} from "../src/sidepanel/conversation-message-visibility.js";
import type { ConversationMessage } from "../src/types.js";

describe("conversation message visibility", () => {
  test("hides empty legacy messages but keeps all visible content carriers", () => {
    expect(shouldRenderConversationMessage(message({ text: "" }))).toBe(false);
    expect(shouldRenderConversationMessage(message({ text: "hello" }))).toBe(true);
    expect(shouldRenderConversationMessage(message({ attachments: [{ id: "file", name: "a.pdf", kind: "pdf", sizeBytes: 1 }] }))).toBe(true);
    expect(shouldRenderConversationMessage(message({ trace: [{ kind: "tool", status: "running", title: "tool", detail: "" }] }))).toBe(true);
    expect(shouldRenderConversationMessage(message({ notice: { type: "context-compaction", state: "running", automatic: true } }))).toBe(true);
  });

  test("keeps generated image placeholders and missing asset states visible", () => {
    expect(shouldRenderConversationMessage(message({ images: [{ src: "", alt: "Loading", status: "loading" }] }))).toBe(true);
    expect(shouldRenderConversationMessage(message({ images: [{ src: "", alt: "Missing", status: "error" }] }))).toBe(true);
    expect(shouldRenderConversationMessage(message({ images: [{ src: "", alt: "Deleted", status: "deleted" }] }))).toBe(true);
    expect(shouldRenderConversationMessage(message({ images: [{ src: "", alt: "Asset", status: "ready", assetRef: "codex-asset:1" }] }))).toBe(true);
  });

  test("detects pending assistant image workflow messages only", () => {
    expect(isPendingImageMessage(message({ role: "assistant", images: [{ src: "", alt: "Loading", status: "loading" }] }))).toBe(true);
    expect(isPendingImageMessage(message({ role: "user", images: [{ src: "", alt: "Loading", status: "loading" }] }))).toBe(false);
    expect(isPendingImageMessage(message({ role: "assistant", images: [{ src: "data:image/png;base64,abc", alt: "Ready", status: "ready" }] }))).toBe(false);
  });
});

function message(overrides: Partial<ConversationMessage>): ConversationMessage {
  return {
    id: "message-1",
    role: "assistant",
    text: "",
    ...overrides,
  };
}
