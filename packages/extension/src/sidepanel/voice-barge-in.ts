const FILLER_TRANSCRIPTS = new Set([
  "um",
  "uh",
  "mhm",
  "mm",
  "hmm",
]);

export function shouldInterruptVoiceOutputForTranscript(input: {
  transcript: string;
  isFinal: boolean;
  hasQueuedOutput: boolean;
}): boolean {
  if (!input.hasQueuedOutput || !input.isFinal) {
    return false;
  }

  const normalized = normalizeTranscript(input.transcript);
  if (!normalized || FILLER_TRANSCRIPTS.has(normalized.toLowerCase())) {
    return false;
  }

  const compact = normalized.replace(/\s+/g, "");
  if (compact.length < 2) {
    return false;
  }

  if (isShortRepeatedUtterance(compact)) {
    return false;
  }

  return true;
}

function isShortRepeatedUtterance(value: string): boolean {
  const chars = Array.from(value);
  return chars.length <= 3 && new Set(chars).size === 1;
}

function normalizeTranscript(value: string): string {
  return value
    .replace(/[.,!?;:()[\]{}"“”‘’…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
