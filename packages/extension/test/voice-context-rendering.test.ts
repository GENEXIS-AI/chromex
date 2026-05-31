import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8").replaceAll(
  "\r\n",
  "\n",
);
const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8").replaceAll(
  "\r\n",
  "\n",
);

describe("voice context and barge-in wiring", () => {
  test("collects hybrid page context before starting realtime voice", () => {
    expect(backgroundSource).toContain("createVoiceSessionContextPrompt");
    expect(backgroundSource).toContain("buildVoiceSessionStartParamsWithContext");
    expect(backgroundSource).toContain('collectCurrentPageContext("hybrid")');
    expect(backgroundSource).toContain('collectCurrentPageContext("dom")');
    expect(backgroundSource).toContain("prompt: contextPrompt");
  });

  test("can refresh current screen context during a realtime voice turn", () => {
    expect(backgroundSource).toContain('case "voice.context.snapshot"');
    expect(backgroundSource).toContain("collectVoiceSessionContextPrompt()");
    expect(sidepanelSource).toContain("collectRealtimeVoiceContextSnapshot");
    expect(sidepanelSource).toContain("createRealtimeVoiceContextAppendText");
    expect(sidepanelSource).toContain('type: "voice.context.snapshot"');
  });

  test("interrupts assistant audio playback when the user starts speaking", () => {
    expect(sidepanelSource).toContain("interruptRealtimeVoiceOutput");
    expect(sidepanelSource).toContain("maybeInterruptRealtimeOutputForInput");
    expect(sidepanelSource).toContain("realtimeOutputAudioSources.add(source)");
    expect(sidepanelSource).toContain("source.onended = () => realtimeOutputAudioSources.delete(source)");
    expect(sidepanelSource).toContain("interruptRealtimeVoiceOutput();");
    expect(sidepanelSource).toContain("if (realtimeOutputAudioSources.size) {\n    suppressRealtimeOutputForBargeIn();");
  });

  test("mirrors app-server realtime transcripts into chat only when live captions are enabled", () => {
    expect(sidepanelSource).toContain("applyVoiceTranscriptDelta");
    expect(sidepanelSource).toContain("applyVoiceTranscriptDone");
    expect(sidepanelSource).toContain("state.settings.liveCaptions");
    expect(sidepanelSource).toContain("resetVoiceTranscriptMirrorState(voiceTranscriptMirror)");
  });

  test("mirrors local live user speech before appending context and ignores duplicate server user captions", () => {
    expect(sidepanelSource).toContain("mirrorLocalLiveUserTranscript");
    expect(sidepanelSource).toContain("shouldMirrorRealtimeTranscriptEvent");
    expect(sidepanelSource).toContain('if (!shouldMirrorRealtimeTranscriptEvent(event.role))');
    expect(sidepanelSource.indexOf("mirrorLocalLiveUserTranscript(transcript)")).toBeLessThan(
      sidepanelSource.indexOf("await appendRealtimeVoiceTextWithCurrentContext(transcript"),
    );
  });

  test("keeps voice timers updating and makes barge-in less sensitive to output echo", () => {
    expect(sidepanelSource).toContain("startVoiceDurationTicker");
    expect(sidepanelSource).toContain("stopVoiceDurationTicker");
    expect(sidepanelSource).toContain("getVoiceMessageDurationMs");
    expect(sidepanelSource).toContain("const REALTIME_BARGE_IN_RMS_THRESHOLD = 0.075");
    expect(sidepanelSource).toContain("const REALTIME_BARGE_IN_REQUIRED_AUDIO_FRAMES = 6");
  });
});
