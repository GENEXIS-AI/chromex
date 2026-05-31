import {
  CODEX_REALTIME_VOICES,
  normalizeCodexRealtimeVoice,
  type CodexRealtimeVoice,
} from "@codex-sidepanel/shared";

export interface RealtimeVoiceStartMessageInput {
  sdp: string;
  outputModality?: "audio" | "text";
  voice?: string;
}

export interface RealtimeVoiceStartMessage extends Record<string, unknown> {
  type: "voice.session.start";
  confirmed: true;
  sdp: string;
  outputModality: "audio" | "text";
  voice?: CodexRealtimeVoice;
}

export function buildRealtimeVoiceStartMessage(input: RealtimeVoiceStartMessageInput): RealtimeVoiceStartMessage {
  const voice = normalizeCodexRealtimeVoice(input.voice);
  return {
    type: "voice.session.start",
    confirmed: true,
    sdp: input.sdp,
    outputModality: input.outputModality ?? "audio",
    ...(voice ? { voice } : {}),
  };
}

export function listCodexRealtimeVoiceOptions(): Array<{ id: CodexRealtimeVoice; label: string }> {
  return CODEX_REALTIME_VOICES.map((voice) => ({
    id: voice,
    label: formatRealtimeVoiceLabel(voice),
  }));
}

function formatRealtimeVoiceLabel(voice: CodexRealtimeVoice): string {
  return `${voice.charAt(0).toUpperCase()}${voice.slice(1)}`;
}
