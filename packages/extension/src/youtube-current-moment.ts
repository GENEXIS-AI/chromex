import { getPromptOutputLanguageName } from "./ui-language.js";

export interface YouTubeCurrentMomentPromptInput {
  adapterPayload: Record<string, unknown> | null | undefined;
  locale?: string;
}

export interface YouTubeCurrentMomentPromptResult {
  prompt: string;
  title: string;
  channel: string;
  currentTimeSeconds: number;
  timestamp: string;
}

const CURRENT_MOMENT_ACTION_IDS = new Set([
  "youtube-current-moment-question",
  "summarize-current-timestamp",
]);

export function isYouTubeCurrentMomentAction(actionId: string): boolean {
  return CURRENT_MOMENT_ACTION_IDS.has(actionId);
}

export function createYouTubeCurrentMomentPromptResult(
  input: YouTubeCurrentMomentPromptInput,
): YouTubeCurrentMomentPromptResult {
  const adapterPayload = input.adapterPayload;
  if (!isYouTubeAdapterPayload(adapterPayload)) {
    throw new Error("Could not read playback information from the active YouTube tab.");
  }

  const title = getString(adapterPayload.title) || "this video";
  const channel = getString(adapterPayload.channel);
  const currentTimeSeconds = getFiniteNumber(adapterPayload.currentTimeSeconds) ?? 0;
  const timestamp = formatYouTubeMomentTimestamp(currentTimeSeconds);

  return {
    prompt: createYouTubeCurrentMomentPrompt(input),
    title,
    channel,
    currentTimeSeconds,
    timestamp,
  };
}

export function createYouTubeCurrentMomentPrompt(
  input: YouTubeCurrentMomentPromptInput,
): string {
  const adapterPayload = input.adapterPayload ?? {};
  const outputLanguage = getPromptOutputLanguageName(input.locale);
  const title = getString(adapterPayload.title) || "this video";
  const channel = getString(adapterPayload.channel);
  const currentTimeSeconds = getFiniteNumber(adapterPayload.currentTimeSeconds) ?? 0;
  const timestamp = formatYouTubeMomentTimestamp(currentTimeSeconds);
  const channelLabel = channel ? ` by ${channel}` : "";

  return `Explain what is happening at the current playback position ${timestamp} (${currentTimeSeconds} seconds) in the YouTube video "${title}"${channelLabel}. Prioritize the exact moment the user is watching and include brief surrounding context. Answer in ${outputLanguage}.`;
}

export function formatYouTubeMomentTimestamp(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function isYouTubeAdapterPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && getString((value as Record<string, unknown>).platform) === "youtube");
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getFiniteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
