import { describe, expect, test } from "vitest";

import { buildRealtimeVoiceStartMessage, listCodexRealtimeVoiceOptions } from "../src/sidepanel/voice-session.js";

describe("sidepanel realtime voice start", () => {
  test("starts voice as a user-confirmed standalone realtime session", () => {
    const message = buildRealtimeVoiceStartMessage({ sdp: "offer-sdp" });

    expect(message).toEqual({
      type: "voice.session.start",
      confirmed: true,
      sdp: "offer-sdp",
      outputModality: "audio",
    });
    expect(message).not.toHaveProperty("threadId");
  });

  test("only includes Codex app-server supported voices", () => {
    expect(buildRealtimeVoiceStartMessage({ sdp: "offer-sdp", voice: "sage" })).toMatchObject({
      voice: "sage",
    });
    expect(buildRealtimeVoiceStartMessage({ sdp: "offer-sdp", voice: "Samantha" })).not.toHaveProperty("voice");
    expect(listCodexRealtimeVoiceOptions().map((voice) => voice.id)).toContain("verse");
  });
});
