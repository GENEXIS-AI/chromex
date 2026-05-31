import { describe, expect, test } from "vitest";

import { buildVoiceSessionStartParams, buildVoiceSessionStopParams } from "../src/background/voice-session-routing.js";

describe("background realtime voice routing", () => {
  test("does not reuse the active chat thread for voice start", () => {
    expect(buildVoiceSessionStartParams({ sdp: "offer-sdp" }, "chat-thread")).toEqual({
      sdp: "offer-sdp",
      outputModality: "audio",
    });
  });

  test("preserves browser SDP byte-for-byte including trailing CRLF", () => {
    const browserSdp = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=setup:actpass\r\n";

    expect(buildVoiceSessionStartParams({ sdp: browserSdp }, "chat-thread")).toEqual({
      sdp: browserSdp,
      outputModality: "audio",
    });
  });

  test("preserves an explicit realtime voice thread id", () => {
    expect(buildVoiceSessionStartParams({ threadId: "voice-thread", sdp: "offer-sdp" }, "chat-thread")).toEqual({
      threadId: "voice-thread",
      sdp: "offer-sdp",
      outputModality: "audio",
    });
  });

  test("passes only Codex app-server supported voices", () => {
    expect(buildVoiceSessionStartParams({ sdp: "offer-sdp", voice: "ballad" }, "chat-thread")).toEqual({
      sdp: "offer-sdp",
      outputModality: "audio",
      voice: "ballad",
    });
    expect(buildVoiceSessionStartParams({ sdp: "offer-sdp", voice: "Google US English" }, "chat-thread")).toEqual({
      sdp: "offer-sdp",
      outputModality: "audio",
    });
  });

  test("preserves explicit realtime session ids for dictation transcription sessions", () => {
    expect(
      buildVoiceSessionStartParams(
        {
          sessionId: "sidepanel-dictation-1",
          outputModality: "text",
          prompt: "Transcribe only.",
        },
        "chat-thread",
      ),
    ).toEqual({
      outputModality: "text",
      prompt: "Transcribe only.",
      sessionId: "sidepanel-dictation-1",
    });
  });

  test("does not reuse the active chat thread for voice stop", () => {
    expect(buildVoiceSessionStopParams({}, "chat-thread")).toEqual({});
    expect(buildVoiceSessionStopParams({ threadId: "voice-thread" }, "chat-thread")).toEqual({ threadId: "voice-thread" });
  });
});
