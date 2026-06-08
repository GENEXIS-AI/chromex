const DEFAULT_SELECTED_TEXT_CONTEXT_MAX_CHARS = 12_000;
const DEFAULT_SELECTED_TEXT_CONTEXT_EDGE_CHARS = 3_200;

export interface SelectedTextContextExcerptInput {
  beforeText?: string;
  selectedText: string;
  afterText?: string;
  maxChars?: number;
  edgeChars?: number;
}

export function normalizeSelectedTextContext(value: unknown, maxChars = DEFAULT_SELECTED_TEXT_CONTEXT_MAX_CHARS): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/[ \t\f\v]+/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, Math.max(0, maxChars));
}

export function createSelectedTextContextExcerpt(input: SelectedTextContextExcerptInput): string {
  const edgeChars = Math.max(400, input.edgeChars ?? DEFAULT_SELECTED_TEXT_CONTEXT_EDGE_CHARS);
  const maxChars = Math.max(edgeChars, input.maxChars ?? DEFAULT_SELECTED_TEXT_CONTEXT_MAX_CHARS);
  const beforeText = cropBeforeSelection(normalizeSelectedTextContext(input.beforeText, maxChars), edgeChars);
  const selectedText = normalizeSelectedTextContext(input.selectedText, maxChars);
  const afterText = cropAfterSelection(normalizeSelectedTextContext(input.afterText, maxChars), edgeChars);

  if (!selectedText) {
    return "";
  }

  return normalizeSelectedTextContext(
    [
      "Selected text in page context:",
      `Before selection:\n${beforeText || "(start of page or unavailable)"}`,
      [
        "Selected text:",
        "<<<CHROMEX_SELECTION_START>>>",
        selectedText,
        "<<<CHROMEX_SELECTION_END>>>",
      ].join("\n"),
      `After selection:\n${afterText || "(end of page or unavailable)"}`,
    ].join("\n\n"),
    maxChars,
  );
}

function cropBeforeSelection(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `...${value.slice(-maxChars).trimStart()}`;
}

function cropAfterSelection(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars).trimEnd()}...`;
}
