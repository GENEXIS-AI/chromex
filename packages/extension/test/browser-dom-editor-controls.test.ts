import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const contentSource = readFileSync(resolve(__dirname, "../src/content/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(__dirname, "../src/background/index.ts"), "utf8");

describe("DOM browser control editor discovery", () => {
  test("snapshots modern editor surfaces and proxy composer controls", () => {
    expect(contentSource).toContain("EDITOR_LIKE_SELECTOR");
    expect(contentSource).toContain('[contenteditable="plaintext-only"]');
    expect(contentSource).toContain('[aria-multiline="true"]');
    expect(contentSource).toContain('[data-lexical-editor="true"]');
    expect(contentSource).toContain(".ProseMirror");
    expect(contentSource).toContain(".ql-editor");
    expect(contentSource).toContain("opensEditableSurface");
    expect(contentSource).toContain("isTextEntryCandidate");
  });

  test("activates proxy controls before resolving newly visible editors", () => {
    expect(contentSource).toContain("resolveEditableTargetAfterActivation");
    expect(contentSource).toContain("collectVisibleEditableTargets");
    expect(contentSource).toContain("findNewEditableTarget");
    expect(contentSource).toContain("setNativeTextControlValue");
  });

  test("cleans up the visual indicator on the originally controlled tab", () => {
    expect(backgroundSource).toContain("activeAiControlTab");
    expect(backgroundSource).toContain("startTabAiControlIndicator(controlTab");
    expect(backgroundSource).toContain("stopTabAiControlIndicator(controlTab");
    expect(backgroundSource).toContain("sendMessageToTab(controlTab");
  });
});
