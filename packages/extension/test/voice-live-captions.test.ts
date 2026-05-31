import { describe, expect, test } from "vitest";

import {
  applyVoiceTranscriptDelta,
  applyVoiceTranscriptDone,
  createVoiceTranscriptMirrorState,
  formatVoiceDurationLabel,
  isActiveVoiceTranscriptMessage,
} from "../src/sidepanel/voice-live-captions.js";
import type { ConversationMessage } from "../src/types.js";

describe("voice live captions", () => {
  test("mirrors realtime transcript deltas into panel messages", () => {
    const messages: ConversationMessage[] = [];
    const mirror = createVoiceTranscriptMirrorState();
    let nextId = 0;

    const first = applyVoiceTranscriptDelta({
      messages,
      mirror,
      role: "assistant",
      delta: "안녕",
      threadId: "thread-1",
      now: 1_000,
      createId: () => `voice-${++nextId}`,
    });
    const second = applyVoiceTranscriptDelta({
      messages,
      mirror,
      role: "assistant",
      delta: "하세요",
      threadId: "thread-1",
      now: 1_500,
      createId: () => `voice-${++nextId}`,
    });

    expect(first.liveCaption).toBe("assistant: 안녕");
    expect(second.liveCaption).toBe("assistant: 안녕하세요");
    expect(messages).toEqual([
      {
        id: "voice-1",
        role: "assistant",
        text: "안녕하세요",
        delivery: "voice",
        voice: { startedAt: 1_000, durationMs: 500 },
      },
    ]);
  });

  test("final transcript replaces partial text and closes that role part", () => {
    const messages: ConversationMessage[] = [];
    const mirror = createVoiceTranscriptMirrorState();
    let nextId = 0;

    applyVoiceTranscriptDelta({
      messages,
      mirror,
      role: "user",
      delta: "현재 페",
      threadId: "thread-1",
      now: 2_000,
      createId: () => `voice-${++nextId}`,
    });
    const done = applyVoiceTranscriptDone({
      messages,
      mirror,
      role: "user",
      text: "현재 페이지 설명해줘.",
      threadId: "thread-1",
      now: 3_250,
      createId: () => `voice-${++nextId}`,
    });
    applyVoiceTranscriptDelta({
      messages,
      mirror,
      role: "user",
      delta: "다음 질문",
      threadId: "thread-1",
      now: 4_000,
      createId: () => `voice-${++nextId}`,
    });

    expect(done.liveCaption).toBe("user: 현재 페이지 설명해줘.");
    expect(messages).toEqual([
      {
        id: "voice-1",
        role: "user",
        text: "현재 페이지 설명해줘.",
        delivery: "voice",
        voice: { startedAt: 2_000, durationMs: 1_250 },
      },
      {
        id: "voice-2",
        role: "user",
        text: "다음 질문",
        delivery: "voice",
        voice: { startedAt: 4_000 },
      },
    ]);
  });

  test("does not duplicate a recent locally mirrored user transcript when server final arrives later", () => {
    const messages: ConversationMessage[] = [];
    const mirror = createVoiceTranscriptMirrorState();
    let nextId = 0;

    applyVoiceTranscriptDone({
      messages,
      mirror,
      role: "user",
      text: "지금 페이지 설명해줘.",
      threadId: "thread-1",
      now: 10_000,
      createId: () => `voice-${++nextId}`,
    });
    applyVoiceTranscriptDone({
      messages,
      mirror,
      role: "user",
      text: "지금 페이지 설명해줘.",
      threadId: "thread-1",
      now: 11_000,
      createId: () => `voice-${++nextId}`,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "voice-1",
      role: "user",
      text: "지금 페이지 설명해줘.",
      delivery: "voice",
    });
  });

  test("updates active transcript duration while deltas are still streaming", () => {
    const messages: ConversationMessage[] = [];
    const mirror = createVoiceTranscriptMirrorState();

    applyVoiceTranscriptDelta({
      messages,
      mirror,
      role: "assistant",
      delta: "답변",
      threadId: "thread-1",
      now: 20_000,
      createId: () => "voice-1",
    });
    applyVoiceTranscriptDelta({
      messages,
      mirror,
      role: "assistant",
      delta: " 중",
      threadId: "thread-1",
      now: 22_400,
      createId: () => "voice-2",
    });

    expect(messages[0]?.voice?.durationMs).toBe(2_400);
  });

  test("finalizes each local user utterance with its own spoken duration", () => {
    const messages: ConversationMessage[] = [];
    const mirror = createVoiceTranscriptMirrorState();
    let nextId = 0;

    applyVoiceTranscriptDone({
      messages,
      mirror,
      role: "user",
      text: "첫 번째 질문",
      threadId: "thread-1",
      startedAt: 1_000,
      now: 3_400,
      createId: () => `voice-${++nextId}`,
    });
    applyVoiceTranscriptDone({
      messages,
      mirror,
      role: "user",
      text: "두 번째 질문",
      threadId: "thread-1",
      startedAt: 5_000,
      now: 6_250,
      createId: () => `voice-${++nextId}`,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "voice-1",
      text: "첫 번째 질문",
      voice: { startedAt: 1_000, durationMs: 2_400 },
    });
    expect(messages[1]).toMatchObject({
      id: "voice-2",
      text: "두 번째 질문",
      voice: { startedAt: 5_000, durationMs: 1_250 },
    });
    expect(isActiveVoiceTranscriptMessage(mirror, messages[0]!)).toBe(false);
    expect(isActiveVoiceTranscriptMessage(mirror, messages[1]!)).toBe(false);
  });

  test("tracks only the current active utterance as live after the previous one is finalized", () => {
    const messages: ConversationMessage[] = [];
    const mirror = createVoiceTranscriptMirrorState();
    let nextId = 0;

    applyVoiceTranscriptDone({
      messages,
      mirror,
      role: "user",
      text: "완료된 질문",
      threadId: "thread-1",
      startedAt: 1_000,
      now: 2_000,
      createId: () => `voice-${++nextId}`,
    });
    applyVoiceTranscriptDelta({
      messages,
      mirror,
      role: "user",
      delta: "다음",
      threadId: "thread-1",
      startedAt: 5_000,
      now: 5_500,
      createId: () => `voice-${++nextId}`,
    });

    expect(isActiveVoiceTranscriptMessage(mirror, messages[0]!)).toBe(false);
    expect(isActiveVoiceTranscriptMessage(mirror, messages[1]!)).toBe(true);
    expect(messages[0]?.voice?.durationMs).toBe(1_000);
    expect(messages[1]?.voice?.durationMs).toBe(500);
  });

  test("formats voice durations as compact timer labels", () => {
    expect(formatVoiceDurationLabel(0)).toBe("00:00");
    expect(formatVoiceDurationLabel(1_250)).toBe("00:01");
    expect(formatVoiceDurationLabel(61_200)).toBe("01:01");
  });
});
