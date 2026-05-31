import { describe, expect, test } from "vitest";

import { shouldInterruptVoiceOutputForTranscript } from "../src/sidepanel/voice-barge-in.js";

describe("voice barge-in", () => {
  test("does not interrupt assistant output for interim transcripts", () => {
    expect(
      shouldInterruptVoiceOutputForTranscript({
        transcript: "지금 페이지",
        isFinal: false,
        hasQueuedOutput: true,
      }),
    ).toBe(false);
  });

  test("interrupts assistant output for meaningful final user speech", () => {
    expect(
      shouldInterruptVoiceOutputForTranscript({
        transcript: "빨리 설명해줘",
        isFinal: true,
        hasQueuedOutput: true,
      }),
    ).toBe(true);
    expect(
      shouldInterruptVoiceOutputForTranscript({
        transcript: "빨리",
        isFinal: true,
        hasQueuedOutput: true,
      }),
    ).toBe(true);
  });

  test("ignores filler and empty final transcripts", () => {
    expect(
      shouldInterruptVoiceOutputForTranscript({
        transcript: "음",
        isFinal: true,
        hasQueuedOutput: true,
      }),
    ).toBe(false);
    expect(
      shouldInterruptVoiceOutputForTranscript({
        transcript: "",
        isFinal: true,
        hasQueuedOutput: true,
      }),
    ).toBe(false);
  });
});
