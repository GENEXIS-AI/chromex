import { describe, expect, test } from "vitest";

import { createRealtimeVoiceContextAppendText } from "../src/sidepanel/voice-turn-context.js";

describe("realtime voice turn context", () => {
  test("wraps the spoken request with current screen context when text append owns the user request", () => {
    const text = createRealtimeVoiceContextAppendText({
      transcript: "지금 화면에 뭐가 보여?",
      contextPrompt: "Title: Example\nVisible Screen: screenshot captured for this session",
      includeTranscript: true,
    });

    expect(text).toContain("<live_voice_screen_context>");
    expect(text).toContain("Use this context for the user's current spoken request.");
    expect(text).toContain("Title: Example");
    expect(text).toContain("<spoken_user_request>");
    expect(text).toContain("지금 화면에 뭐가 보여?");
  });

  test("keeps the spoken request visible when audio also carries the request", () => {
    const text = createRealtimeVoiceContextAppendText({
      transcript: "지금 페이지에 대해서 설명해 줄래?",
      contextPrompt: "Page Text Summary: dashboard metrics",
      includeTranscript: false,
    });

    expect(text).toContain("Answer the latest spoken request now");
    expect(text).toContain("Page Text Summary: dashboard metrics");
    expect(text).toContain("<spoken_user_request>");
    expect(text).toContain("지금 페이지에 대해서 설명해 줄래?");
    expect(text).not.toMatch(/wait|checking|잠시만|기다려|곧 알려/iu);
  });
});
