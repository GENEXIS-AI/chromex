import { describe, expect, test } from "vitest";

import { listChangedSpeechRecognitionResults } from "../src/sidepanel/voice-recognition-results.js";

describe("speech recognition result normalization", () => {
  test("only returns changed results from resultIndex to avoid duplicate final dictation", () => {
    const results = listChangedSpeechRecognitionResults({
      resultIndex: 1,
      results: [
        { isFinal: true, 0: { transcript: "hello" } },
        { isFinal: true, 0: { transcript: "world" } },
      ],
    });

    expect(results).toEqual([{ isFinal: true, transcript: "world" }]);
  });

  test("falls back to all results when resultIndex is unavailable", () => {
    const results = listChangedSpeechRecognitionResults({
      results: [
        { isFinal: true, 0: { transcript: "hello" } },
        { isFinal: false, 0: { transcript: "world" } },
      ],
    });

    expect(results).toEqual([
      { isFinal: true, transcript: "hello" },
      { isFinal: false, transcript: "world" },
    ]);
  });
});
