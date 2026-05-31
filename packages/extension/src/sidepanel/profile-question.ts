export interface ProfileAskUserQuestion {
  question: string;
  options: string[];
  allowFreeform: boolean;
  cleanedText: string;
}

export interface PendingProfileQuestionState {
  id: string;
  messageId: string;
  profileId: string;
  profileName: string;
  question: string;
  options: string[];
  allowFreeform: boolean;
  answer: string;
  createdAt: number;
}

const ASK_USER_QUESTION_TAG = "chromex_ask_user_question";
const ASK_USER_QUESTION_PATTERN = /<chromex_ask_user_question>([\s\S]*?)<\/chromex_ask_user_question>/u;
const ASK_USER_QUESTION_START_PATTERN = /<chromex_ask_user_question>/u;
const MAX_QUESTION_LENGTH = 420;
const MAX_OPTION_LENGTH = 120;
const MAX_OPTION_COUNT = 3;

export function hasProfileAskUserQuestionStart(text: string): boolean {
  return ASK_USER_QUESTION_START_PATTERN.test(text);
}

export function parseProfileAskUserQuestion(text: string): ProfileAskUserQuestion | null {
  const match = ASK_USER_QUESTION_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  const rawPayload = match[1];
  if (typeof rawPayload !== "string") {
    return null;
  }

  const payload = parsePayload(rawPayload);
  if (!payload) {
    return null;
  }

  const question = normalizeSingleLine(payload.question).slice(0, MAX_QUESTION_LENGTH).trim();
  if (!question) {
    return null;
  }

  const options = normalizeOptions(payload.options);
  const allowFreeform = payload.allowFreeform !== false;
  const cleanedText = text.replace(match[0], "").trim();
  return {
    question,
    options,
    allowFreeform,
    cleanedText,
  };
}

export function stripIncompleteProfileAskUserQuestion(text: string): string {
  const startIndex = text.search(ASK_USER_QUESTION_START_PATTERN);
  if (startIndex < 0 || ASK_USER_QUESTION_PATTERN.test(text)) {
    return text;
  }
  return text.slice(0, startIndex).trimEnd();
}

function parsePayload(raw: string): { question?: unknown; options?: unknown; allowFreeform?: unknown } | null {
  try {
    const parsed = JSON.parse(raw.trim());
    return parsed && typeof parsed === "object" ? (parsed as { question?: unknown; options?: unknown; allowFreeform?: unknown }) : null;
  } catch {
    return null;
  }
}

function normalizeOptions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .map((option) => normalizeSingleLine(option).slice(0, MAX_OPTION_LENGTH).trim())
    .filter(Boolean)
    .filter((option) => {
      const key = option.toLocaleLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_OPTION_COUNT);
}

function normalizeSingleLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

export { ASK_USER_QUESTION_TAG };
