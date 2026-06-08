export interface ConferenceTranscriptEntry {
  id: string;
  sourceText: string;
  translationText: string;
  createdAt: number;
}

export interface ConferenceTranscriptDraft {
  sourceText: string;
  translationText: string;
  createdAt: number;
}

export interface ParsedConferenceAssistantText {
  sourceText: string;
  translationText: string;
}

export interface ConferenceModeTranslationRequestEvent {
  type: "response.create";
  response: {
    instructions: string;
  };
}

const SOURCE_LABEL_PATTERN = /^(?:original|source|transcript|원문)\s*[:：]\s*(.*)$/iu;
const TRANSLATION_LABEL_PATTERN = /^(?:korean|translation|translated|번역|한국어)\s*[:：]\s*(.*)$/iu;
const MAX_CONFERENCE_CONTEXT_ENTRIES = 24;
const MAX_CONFERENCE_CONTEXT_CHARS = 6000;
const SOURCE_FRAGMENT_MERGE_WINDOW_MS = 8_000;

export function parseConferenceModeAssistantText(text: string): ParsedConferenceAssistantText {
  const sourceLines: string[] = [];
  const translationLines: string[] = [];
  let active: "source" | "translation" | null = null;

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const sourceMatch = SOURCE_LABEL_PATTERN.exec(line);
    if (sourceMatch) {
      active = "source";
      const value = sourceMatch[1]?.trim();
      if (value) {
        sourceLines.push(value);
      }
      continue;
    }

    const translationMatch = TRANSLATION_LABEL_PATTERN.exec(line);
    if (translationMatch) {
      active = "translation";
      const value = translationMatch[1]?.trim();
      if (value) {
        translationLines.push(value);
      }
      continue;
    }

    if (active === "source") {
      sourceLines.push(line);
    } else if (active === "translation") {
      translationLines.push(line);
    }
  }

  if (sourceLines.length || translationLines.length) {
    return {
      sourceText: sourceLines.join(" ").trim(),
      translationText: translationLines.join(" ").trim(),
    };
  }

  return {
    sourceText: "",
    translationText: text.trim(),
  };
}

export function mergeConferenceModeTranscriptEntry(
  entries: ConferenceTranscriptEntry[],
  draft: ConferenceTranscriptDraft,
  createId: () => string = () => `conference-transcript-${Date.now()}`,
): ConferenceTranscriptEntry[] {
  const sourceText = draft.sourceText.trim();
  const translationText = draft.translationText.trim();
  if (!sourceText && !translationText) {
    return entries;
  }

  if (translationText && !sourceText) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry?.translationText && areConferenceTranslationsEquivalent(entry.translationText, translationText)) {
        return entries;
      }
      if (entry && entry.sourceText && !entry.translationText.trim()) {
        return entries.map((candidate, candidateIndex) =>
          candidateIndex === index ? { ...candidate, translationText } : candidate,
        );
      }
    }
  }

  if (sourceText && !translationText) {
    const latest = entries.at(-1);
    if (
      latest &&
      !latest.translationText.trim() &&
      draft.createdAt - latest.createdAt <= SOURCE_FRAGMENT_MERGE_WINDOW_MS
    ) {
      return entries.map((candidate, candidateIndex) =>
        candidateIndex === entries.length - 1
          ? {
              ...candidate,
              sourceText: [candidate.sourceText.trim(), sourceText].filter(Boolean).join(" "),
            }
          : candidate,
      );
    }
  }

  if (translationText && sourceText) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!entry || entry.translationText.trim()) {
        if (
          entry?.translationText &&
          areConferenceTranslationsEquivalent(entry.translationText, translationText) &&
          areConferenceSourcesRelated(entry.sourceText, sourceText)
        ) {
          return entries;
        }
        continue;
      }
      const normalizedEntrySource = normalizeConferenceTranscriptText(entry.sourceText);
      const normalizedSource = normalizeConferenceTranscriptText(sourceText);
      if (areConferenceSourcesRelated(normalizedEntrySource, normalizedSource)) {
        return entries.map((candidate, candidateIndex) =>
          candidateIndex === index ? { ...candidate, sourceText: candidate.sourceText || sourceText, translationText } : candidate,
        );
      }
    }
  }

  return [
    ...entries,
    {
      id: createId(),
      sourceText,
      translationText,
      createdAt: draft.createdAt,
    },
  ];
}

function normalizeConferenceTranscriptText(text: string): string {
  return text.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function areConferenceSourcesRelated(left: string, right: string): boolean {
  const normalizedLeft = normalizeConferenceTranscriptText(left);
  const normalizedRight = normalizeConferenceTranscriptText(right);
  return (
    Boolean(normalizedLeft && normalizedRight) &&
    (normalizedLeft === normalizedRight ||
      normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft))
  );
}

function areConferenceTranslationsEquivalent(left: string, right: string): boolean {
  return normalizeConferenceTranscriptText(left) === normalizeConferenceTranscriptText(right);
}

export function buildConferenceModeContextHint(entries: ConferenceTranscriptEntry[]): string {
  const lines = entries
    .filter((entry) => entry.sourceText.trim())
    .slice(-MAX_CONFERENCE_CONTEXT_ENTRIES)
    .map((entry, index) => `${index + 1}. Original: ${entry.sourceText.trim()}`);

  if (!lines.length) {
    return "";
  }

  return `Live conference transcript context:\n${lines.join("\n")}`.slice(-MAX_CONFERENCE_CONTEXT_CHARS);
}

export function buildConferenceModeTranslatedContextHint(entries: ConferenceTranscriptEntry[]): string {
  const lines = entries
    .filter((entry) => entry.translationText.trim())
    .slice(-MAX_CONFERENCE_CONTEXT_ENTRIES)
    .map((entry, index) => `${index + 1}. ${entry.translationText.trim()}`);

  if (!lines.length) {
    return "";
  }

  return `Translated conference transcript context:\n${lines.join("\n")}`.slice(-MAX_CONFERENCE_CONTEXT_CHARS);
}

export function createConferenceModeTranslationRequestEvent(sourceText: string): ConferenceModeTranslationRequestEvent {
  const trimmedSourceText = sourceText.trim();
  return {
    type: "response.create",
    response: {
      instructions: [
        "Translate the following transcript segment into Korean.",
        "Output only the Korean translation.",
        "Do not repeat the original text, labels, markdown, or commentary.",
        "",
        trimmedSourceText,
      ].join("\n"),
    },
  };
}
