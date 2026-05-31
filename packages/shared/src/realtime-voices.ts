export const CODEX_REALTIME_VOICES = [
  "alloy",
  "arbor",
  "ash",
  "ballad",
  "breeze",
  "cedar",
  "coral",
  "cove",
  "echo",
  "ember",
  "juniper",
  "maple",
  "marin",
  "sage",
  "shimmer",
  "sol",
  "spruce",
  "vale",
  "verse",
] as const;

export type CodexRealtimeVoice = (typeof CODEX_REALTIME_VOICES)[number];

const CODEX_REALTIME_VOICE_SET = new Set<string>(CODEX_REALTIME_VOICES);

export function isCodexRealtimeVoice(value: unknown): value is CodexRealtimeVoice {
  return typeof value === "string" && CODEX_REALTIME_VOICE_SET.has(value);
}

export function normalizeCodexRealtimeVoice(value: unknown): CodexRealtimeVoice | "" {
  return isCodexRealtimeVoice(value) ? value : "";
}
