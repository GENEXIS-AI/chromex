import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

describe("message action rendering", () => {
  test("renders message controls through the shared lucide icon renderer", () => {
    expect(sidepanelSource).toContain('renderMessageActionIcon("copy")');
    expect(sidepanelSource).toContain('renderMessageActionIcon("regenerate")');
    expect(sidepanelSource).toContain('renderMessageActionIcon("edit")');
    expect(sidepanelSource).toContain('renderMessageActionIcon("open")');
    expect(sidepanelSource).not.toContain('renderMessageActionIcon("download")');
    expect(sidepanelSource).not.toContain('renderMessageActionIcon("check")');
    expect(sidepanelSource).not.toContain("function renderMessageCopyIcon");
    expect(sidepanelSource).not.toContain("function renderMessageEditIcon");
  });

  test("renders hover tooltips and in-button copied feedback for message actions", () => {
    expect(sidepanelSource).toContain("data-tooltip=");
    expect(sidepanelSource).toContain("renderMessageCopyButton");
    expect(sidepanelSource).toContain("renderMessageCopiedIndicator");
    expect(sidepanelSource).toContain("message-action-check");
    expect(sidepanelSource).toContain("state.copiedMessageId");
    expect(sidepanelSource).not.toContain("state.actionStatus = stringsForState().status.messageCopied");
  });

  test("does not disable edit and regenerate just because the composer draft is empty", () => {
    expect(sidepanelSource).toContain("canStartMessageReplayInteraction");
    expect(sidepanelSource).toContain("const disabled = canStartMessageReplayInteraction() ? \"\" : \"disabled\"");
    expect(sidepanelSource).toContain("if (!messageId || !canStartMessageReplayInteraction())");
  });

  test("marks edited user messages so the editor can use a wider layout", () => {
    expect(sidepanelSource).toContain('const editingClass = editing ? "editing" : ""');
    expect(sidepanelSource).toContain('class="message-card ${message.role} ${editingClass} ${voiceClass} ${steerClass} ${imageResultClass}"');
    expect(sidepanelSource).toContain('class="message-user-stack ${editingClass} ${steerClass}"');
  });

  test("tracks streaming assistant message ids so copy and regenerate controls do not flicker", () => {
    expect(sidepanelSource).toContain("state.streamingAssistantMessageIds.add");
    expect(sidepanelSource).toContain("state.streamingAssistantMessageIds.delete");
    expect(sidepanelSource).toContain("shouldRenderAssistantMessageActions");
  });

  test("keeps the streaming send lock until stream or turn completion events clear it", () => {
    expect(sidepanelSource).not.toContain(
      [
        "state.promptActivity = null;",
        "    state.activeTurn = null;",
        "    state.streamingAssistantMessageIds.clear();",
        "    state.currentConversationId = result.currentConversationId ?? state.currentConversationId;",
      ].join("\n"),
    );
  });

  test("renders generated image responses as simple image-first cards", () => {
    expect(sidepanelSource).toContain("isImageResultAssistantMessage");
    expect(sidepanelSource).toContain("message-image-overlay-actions");
    expect(sidepanelSource).toContain("image-action-button overlay edit");
    expect(sidepanelSource).toContain("image-action-button overlay icon");
    expect(sidepanelSource).toContain("data-image-open");
    expect(sidepanelSource).not.toContain("data-image-download=");
    expect(sidepanelSource).not.toContain("message-image-actions");
  });

  test("renders selected plugin mentions on user messages and composer context chips", () => {
    expect(sidepanelSource).toContain("renderConversationMessageStructuredInputs");
    expect(sidepanelSource).toContain("createConversationMessageStructuredInputs");
    expect(sidepanelSource).toContain("renderStructuredInputIcon");
    expect(sidepanelSource).toContain("submittedMessageStructuredInputs.length ? { structuredInputs: submittedMessageStructuredInputs }");
    expect(sidepanelSource).toContain("data-remove-structured-input-id=");
    expect(sidepanelSource).toContain("summary-chip-remove");
  });

  test("renders selected plugin mentions inside the user message card metadata row", () => {
    expect(sidepanelSource).toContain("function renderMessageMetaPills");
    expect(sidepanelSource).toContain(
      'const userMetaHtml = message.role === "user" ? renderMessageMetaPills(profileHtml, structuredInputHtml) : "";',
    );
    expect(sidepanelSource).not.toContain("${structuredInputHtml}\n          ${cardHtml}");
  });
});
