export interface DomContextBudgetInput {
  modelId?: string;
  userMessage: string;
  contextCount: number;
  fileAttachmentCount?: number;
  outputReserveTokens?: number;
}

export interface DomContextBudget {
  modelContextTokens: number;
  reservedPromptTokens: number;
  userMessageTokens: number;
  outputReserveTokens: number;
  availableDomTokens: number;
  perContextDomTokens: number;
}

export interface TextTokenFit {
  text: string;
  originalTokens: number;
  includedTokens: number;
  originalChars: number;
  includedChars: number;
  truncated: boolean;
}

const DEFAULT_MODEL_CONTEXT_TOKENS = 64_000;
const MIN_DOM_TOKENS_PER_CONTEXT = 2_000;
const MAX_DOM_TOKENS_PER_CONTEXT = 96_000;
const DEFAULT_OUTPUT_RESERVE_TOKENS = 8_000;
const BASE_PROMPT_RESERVE_TOKENS = 7_000;
const FILE_ATTACHMENT_RESERVE_TOKENS = 1_500;

export function resolveDomContextBudget(input: DomContextBudgetInput): DomContextBudget {
  const contextCount = Math.max(1, Math.floor(input.contextCount || 1));
  const modelContextTokens = inferModelContextTokens(input.modelId);
  const outputReserveTokens = clampInteger(
    input.outputReserveTokens ?? DEFAULT_OUTPUT_RESERVE_TOKENS,
    2_000,
    Math.floor(modelContextTokens * 0.25),
  );
  const userMessageTokens = estimateTextTokens(input.userMessage);
  const reservedPromptTokens =
    BASE_PROMPT_RESERVE_TOKENS + Math.max(0, input.fileAttachmentCount ?? 0) * FILE_ATTACHMENT_RESERVE_TOKENS;
  const availableDomTokens = clampInteger(
    Math.floor((modelContextTokens - outputReserveTokens - userMessageTokens - reservedPromptTokens) * 0.82),
    MIN_DOM_TOKENS_PER_CONTEXT,
    MAX_DOM_TOKENS_PER_CONTEXT,
  );
  const perContextDomTokens = clampInteger(
    Math.floor(availableDomTokens / contextCount),
    MIN_DOM_TOKENS_PER_CONTEXT,
    MAX_DOM_TOKENS_PER_CONTEXT,
  );

  return {
    modelContextTokens,
    reservedPromptTokens,
    userMessageTokens,
    outputReserveTokens,
    availableDomTokens,
    perContextDomTokens,
  };
}

export function fitTextToTokenBudget(text: string, maxTokens: number): TextTokenFit {
  const normalized = normalizeBudgetText(text);
  const originalTokens = estimateTextTokens(normalized);
  const budget = Math.max(0, Math.floor(maxTokens));

  if (originalTokens <= budget) {
    return {
      text: normalized,
      originalTokens,
      includedTokens: originalTokens,
      originalChars: normalized.length,
      includedChars: normalized.length,
      truncated: false,
    };
  }

  if (budget <= 0 || normalized.length === 0) {
    return {
      text: "",
      originalTokens,
      includedTokens: 0,
      originalChars: normalized.length,
      includedChars: 0,
      truncated: normalized.length > 0,
    };
  }

  let low = 0;
  let high = normalized.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimateTextTokens(normalized.slice(0, mid)) <= budget) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const clipped = trimToNaturalBoundary(normalized.slice(0, low));
  const includedTokens = estimateTextTokens(clipped);
  return {
    text: clipped ? `${clipped}…` : "",
    originalTokens,
    includedTokens,
    originalChars: normalized.length,
    includedChars: clipped.length,
    truncated: true,
  };
}

export function estimateTextTokens(text: string): number {
  let compactAsciiChars = 0;
  let denseScriptChars = 0;
  let whitespaceChars = 0;

  for (const char of text) {
    if (/\s/u.test(char)) {
      whitespaceChars += 1;
    } else if (isDenseTokenScript(char)) {
      denseScriptChars += 1;
    } else {
      compactAsciiChars += 1;
    }
  }

  return Math.ceil(compactAsciiChars / 3.2 + denseScriptChars / 1.15 + whitespaceChars / 8);
}

function inferModelContextTokens(modelId?: string): number {
  const model = (modelId ?? "").trim().toLowerCase();
  if (!model) {
    return DEFAULT_MODEL_CONTEXT_TOKENS;
  }

  if (/\b(?:spark|fast|mini)\b/u.test(model)) {
    return 64_000;
  }

  if (/\b(?:5\.5|5\.4|5\.2|gpt-5|crest|xhigh|pro)\b/u.test(model)) {
    return 128_000;
  }

  return DEFAULT_MODEL_CONTEXT_TOKENS;
}

function normalizeBudgetText(text: string): string {
  return text.replace(/\u0000/gu, "").replace(/\r\n/gu, "\n").replace(/\n{4,}/gu, "\n\n\n").trim();
}

function isDenseTokenScript(char: string): boolean {
  return /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Sinhala}]/u.test(
    char,
  );
}

function trimToNaturalBoundary(text: string): string {
  const hardTrimmed = text.trimEnd();
  const boundary = Math.max(hardTrimmed.lastIndexOf("\n\n"), findLastSentenceBoundary(hardTrimmed));
  if (boundary > Math.floor(hardTrimmed.length * 0.72)) {
    return hardTrimmed.slice(0, boundary + 1).trimEnd();
  }
  return hardTrimmed;
}

function findLastSentenceBoundary(text: string): number {
  let lastBoundary = -1;
  const sentenceBoundaryPattern = /[.!?。！？](?=\s|$)/gu;
  for (const match of text.matchAll(sentenceBoundaryPattern)) {
    lastBoundary = match.index ?? lastBoundary;
  }
  return lastBoundary;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
