import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

describe("voice composer mode", () => {
  test("renders microphone as dictation and the primary button as live/send/end", () => {
    expect(sidepanelSource).toContain('id="voice-input-toggle"');
    expect(sidepanelSource).toContain("startComposerVoiceInput");
    expect(sidepanelSource).toContain("stopComposerVoiceInput");
    expect(sidepanelSource).toContain("resolveComposerPrimaryAction");
    expect(sidepanelSource).toContain('"live-toggle"');
    expect(sidepanelSource).toContain('"stop-live"');
  });

  test("does not route dictation transcripts through prompt sending", () => {
    expect(sidepanelSource).toContain("appendVoiceInputTranscriptToComposer");
    expect(sidepanelSource).not.toContain("void handleVoiceTranscript(transcript);\n      } else {\n        interim = transcript;");
  });
});
