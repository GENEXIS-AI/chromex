import { normalizeCodexRealtimeVoice } from "@codex-sidepanel/shared";

interface VoiceSessionMessage {
  threadId?: unknown;
  sdp?: unknown;
  outputModality?: unknown;
  prompt?: unknown;
  sessionId?: unknown;
  realtimeSessionId?: unknown;
  voice?: unknown;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonEmptyPreservedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function buildVoiceSessionStartParams(
  message: VoiceSessionMessage,
  _activeChatThreadId?: string,
): Record<string, unknown> {
  const threadId = nonEmptyString(message.threadId);
  const sdp = nonEmptyPreservedString(message.sdp);
  const prompt = nonEmptyString(message.prompt);
  const sessionId = nonEmptyString(message.sessionId);
  const realtimeSessionId = nonEmptyString(message.realtimeSessionId);
  const voice = normalizeCodexRealtimeVoice(nonEmptyString(message.voice));
  const outputModality =
    message.outputModality === "text" || message.outputModality === "audio" ? message.outputModality : "audio";

  return {
    ...(threadId ? { threadId } : {}),
    ...(sdp ? { sdp } : {}),
    outputModality,
    ...(prompt ? { prompt } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(realtimeSessionId ? { realtimeSessionId } : {}),
    ...(voice ? { voice } : {}),
  };
}

export function buildVoiceSessionStopParams(
  message: Pick<VoiceSessionMessage, "threadId">,
  _activeChatThreadId?: string,
): Record<string, unknown> {
  const threadId = nonEmptyString(message.threadId);
  return threadId ? { threadId } : {};
}
