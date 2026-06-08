import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { createSelectedTextContextExcerpt } from "../src/page-selection-context.js";

const sidepanelSource = readFileSync(resolve(__dirname, "../src/sidepanel/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(__dirname, "../src/background/index.ts"), "utf8");
const contentSource = readFileSync(resolve(__dirname, "../src/content/index.ts"), "utf8");
const typesSource = readFileSync(resolve(__dirname, "../src/types.ts"), "utf8");

describe("selected page text context", () => {
  test("captures browser text selection into a sidepanel-only context card", () => {
    expect(contentSource).toContain("installPageSelectionContextBridge()");
    expect(contentSource).toContain('type: "ui.page-selection.changed"');
    expect(contentSource).toContain("isSelectionInsideEditableSurface");
    expect(sidepanelSource).toContain("applyPageSelectionContextUpdate");
    expect(sidepanelSource).toContain("renderSelectedPageTextComposerCard");
    expect(sidepanelSource).toContain("renderConversationMessageContextCard");
  });

  test("sends selected text as explicit context without defaulting to full page context", () => {
    expect(typesSource).toContain("selectedTextContext?: SelectedPageTextContext");
    expect(sidepanelSource).toContain("selectedTextContext: createPromptSelectedTextContextPayload()");
    expect(backgroundSource).toContain("selectionOnlyContextRequested");
    expect(backgroundSource).toContain("createSelectionContextEnvelope(selectedTextContext)");
    expect(backgroundSource).toContain("needsCurrentContext = pageAttachments.some");
  });

  test("preserves the selected text inside surrounding page context", () => {
    const excerpt = createSelectedTextContextExcerpt({
      beforeText: "The article first explains the market problem and the old paid recorder.",
      selectedText: "OpenScreen replaces Screen Studio for browser recording.",
      afterText: "It then lists Windows, macOS, watermark, blur, and commercial-use details.",
    });

    expect(excerpt).toContain("Before selection:");
    expect(excerpt).toContain("Selected text:");
    expect(excerpt).toContain("<<<CHROMEX_SELECTION_START>>>");
    expect(excerpt).toContain("OpenScreen replaces Screen Studio");
    expect(excerpt).toContain("<<<CHROMEX_SELECTION_END>>>");
    expect(excerpt).toContain("After selection:");
    expect(contentSource).toContain("contextText");
    expect(typesSource).toContain("contextText?: string");
    expect(backgroundSource).toContain("context.contextText");
  });

  test("clears the sidepanel selection context when the browser selection is released", () => {
    expect(contentSource).toContain("sendPageSelectionContextClear");
    expect(contentSource).toContain("lastPageSelectionContextSignature = \"\"");
    expect(sidepanelSource).toContain("isClearedPageSelectionContextUpdate");
    expect(sidepanelSource).toContain("clearSelectedPageTextContext({ persist: true, render: true })");
  });

  test("pins a fact-check suggestion while selected text context is active", () => {
    expect(sidepanelSource).toContain("SELECTION_FACT_CHECK_ACTION_ID");
    expect(sidepanelSource).toContain("createSelectionFactCheckActionCard");
    expect(sidepanelSource).toContain("createSelectionFactCheckPrompt");
    expect(sidepanelSource).toContain("selectionFactCheckCards");
    expect(sidepanelSource).toContain("사실 / 주장 / 추정 / 검증 필요 / 확인할 소스");
  });

  test("consumes pending right-click selection context without auto-sending a prompt", () => {
    expect(backgroundSource).toContain('id: "ask-codex-selection"');
    expect(backgroundSource).toContain('contexts: ["selection"]');
    expect(backgroundSource).toContain("pendingSelectionContext");
    expect(backgroundSource).toContain('type: "ui.context-menu-action.pending"');
    expect(sidepanelSource).toContain("takePendingContextMenuSelection");
    expect(sidepanelSource).toContain('type: "context.menu.selection.pending.take"');
    expect(sidepanelSource).toContain("applyPendingSelectedPageTextContext");
    expect(sidepanelSource).toContain("doesSelectedPageTextContextMatchTab");
    expect(sidepanelSource).toContain("focusComposerAtEnd");
  });
});
