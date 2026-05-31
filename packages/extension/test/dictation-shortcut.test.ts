import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "public/manifest.json"), "utf8")) as {
  commands?: Record<string, { description?: string; suggested_key?: Record<string, string> }>;
};
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");
const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const contentSource = readFileSync(resolve(process.cwd(), "src/content/index.ts"), "utf8");

describe("dictation shortcut routing", () => {
  test("exposes a configurable Chrome command for dictation", () => {
    expect(manifest.commands?.["start-dictation"]?.description).toBe("__MSG_commandStartDictation__");
    expect(manifest.commands?.["start-dictation"]?.suggested_key?.default).toBe("Alt+Shift+D");
    expect(manifest.commands?.["start-dictation"]?.suggested_key?.mac).toBe("Command+Shift+D");
  });

  test("routes the command through the side panel so microphone capture stays in an extension page", () => {
    expect(backgroundSource).toContain('command === "start-dictation"');
    expect(backgroundSource).toContain("startDictationFromCommand");
    expect(backgroundSource).toContain("pendingDictationShortcut");
    expect(backgroundSource).toContain('type: "ui.dictation.shortcut"');
  });

  test("commits dictated text to the composer or focused page target", () => {
    expect(sidepanelSource).toContain("startDictationFromShortcut");
    expect(sidepanelSource).toContain("resolveComposerVoiceInputTarget");
    expect(sidepanelSource).toContain("insertVoiceInputTranscriptIntoPage");
    expect(sidepanelSource).toContain('type: "page.dictation.insert"');
  });

  test("links settings to Chrome's configurable shortcut page", () => {
    expect(sidepanelSource).toContain("openDictationShortcutSettings");
    expect(sidepanelSource).toContain("chrome://extensions/shortcuts");
  });

  test("content script remembers focused editable targets and inserts dictated text at the caret", () => {
    expect(contentSource).toContain("lastDictationEditableTarget");
    expect(contentSource).toContain('message.type === "page.dictation.insert"');
    expect(contentSource).toContain("insertDictationTextIntoFocusedEditable");
    expect(contentSource).toContain("insertTextIntoEditableTarget");
  });
});
