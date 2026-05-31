import type { ConversationMessage } from "../types.js";

export type VoiceTranscriptMessageRole = "user" | "assistant";

export interface VoiceTranscriptMirrorState {
  activeMessageIds: Partial<Record<VoiceTranscriptMessageRole, string>>;
}

export function createVoiceTranscriptMirrorState(): VoiceTranscriptMirrorState {
  return { activeMessageIds: {} };
}

export function resetVoiceTranscriptMirrorState(state: VoiceTranscriptMirrorState): void {
  state.activeMessageIds = {};
}

export function applyVoiceTranscriptDelta(input: {
  messages: ConversationMessage[];
  mirror: VoiceTranscriptMirrorState;
  role: string | undefined;
  delta: string;
  threadId: string | undefined;
  startedAt?: number;
  now?: number;
  createId: () => string;
}): { messageId: string; liveCaption: string } {
  const role = normalizeVoiceTranscriptRole(input.role);
  const now = resolveVoiceEventTime(input.now);
  const message = ensureVoiceTranscriptMessage(input.messages, input.mirror, role, input.createId, now, input.startedAt);
  message.text += input.delta;
  updateVoiceMessageDuration(message, now);
  return {
    messageId: message.id,
    liveCaption: formatVoiceLiveCaption(role, message.text),
  };
}

export function applyVoiceTranscriptDone(input: {
  messages: ConversationMessage[];
  mirror: VoiceTranscriptMirrorState;
  role: string | undefined;
  text: string;
  threadId: string | undefined;
  startedAt?: number;
  now?: number;
  createId: () => string;
}): { messageId: string; liveCaption: string } {
  const role = normalizeVoiceTranscriptRole(input.role);
  const now = resolveVoiceEventTime(input.now);
  const duplicate = findRecentDuplicateVoiceMessage(input.messages, role, input.text, now);
  if (duplicate) {
    delete input.mirror.activeMessageIds[role];
    updateVoiceMessageDuration(duplicate, now, input.startedAt);
    return {
      messageId: duplicate.id,
      liveCaption: duplicate.text ? formatVoiceLiveCaption(role, duplicate.text) : "",
    };
  }
  const message = ensureVoiceTranscriptMessage(input.messages, input.mirror, role, input.createId, now, input.startedAt);
  message.text = input.text || message.text;
  updateVoiceMessageDuration(message, now);
  delete input.mirror.activeMessageIds[role];
  return {
    messageId: message.id,
    liveCaption: message.text ? formatVoiceLiveCaption(role, message.text) : "",
  };
}

export function normalizeVoiceTranscriptRole(role: string | undefined): VoiceTranscriptMessageRole {
  return role === "user" ? "user" : "assistant";
}

export function formatVoiceDurationLabel(durationMs: number | undefined): string {
  const totalSeconds = Math.max(0, Math.floor((durationMs ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function isActiveVoiceTranscriptMessage(
  mirror: VoiceTranscriptMirrorState,
  message: Pick<ConversationMessage, "id" | "delivery">,
): boolean {
  if (message.delivery !== "voice") {
    return false;
  }
  return Object.values(mirror.activeMessageIds).includes(message.id);
}

function ensureVoiceTranscriptMessage(
  messages: ConversationMessage[],
  mirror: VoiceTranscriptMirrorState,
  role: VoiceTranscriptMessageRole,
  createId: () => string,
  now: number,
  startedAt?: number,
): ConversationMessage {
  const activeId = mirror.activeMessageIds[role];
  const existing = activeId ? messages.find((message) => message.id === activeId) : undefined;
  if (existing) {
    return existing;
  }

  const message: ConversationMessage = {
    id: createId(),
    role,
    text: "",
    delivery: "voice",
    voice: {
      startedAt: normalizeVoiceTimestamp(startedAt, now),
    },
  };
  mirror.activeMessageIds[role] = message.id;
  messages.push(message);
  return message;
}

function updateVoiceMessageDuration(message: ConversationMessage, now: number, startedAt?: number): void {
  if (!message.voice) {
    return;
  }
  if (typeof startedAt === "number" && Number.isFinite(startedAt)) {
    message.voice.startedAt = normalizeVoiceTimestamp(startedAt, now);
  }
  if (now > message.voice.startedAt) {
    message.voice.durationMs = Math.max(0, now - message.voice.startedAt);
  }
}

function findRecentDuplicateVoiceMessage(
  messages: ConversationMessage[],
  role: VoiceTranscriptMessageRole,
  text: string,
  now: number | undefined,
): ConversationMessage | undefined {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return undefined;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== role || message.delivery !== "voice") {
      continue;
    }
    if (message.text.trim() !== normalizedText) {
      continue;
    }
    if (typeof now === "number" && message.voice?.startedAt && now - message.voice.startedAt > 15_000) {
      return undefined;
    }
    return message;
  }

  return undefined;
}

function resolveVoiceEventTime(now: number | undefined): number {
  return typeof now === "number" && Number.isFinite(now) ? now : Date.now();
}

function normalizeVoiceTimestamp(timestamp: number | undefined, fallback: number): number {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return fallback;
  }
  return Math.min(timestamp, fallback);
}

function formatVoiceLiveCaption(role: VoiceTranscriptMessageRole, text: string): string {
  return text ? `${role}: ${text}` : "";
}
