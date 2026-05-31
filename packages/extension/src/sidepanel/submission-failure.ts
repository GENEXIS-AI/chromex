import type { ConversationMessage } from "../types.js";
import { getUiStrings, type UiLocale } from "./i18n.js";

export function createAssistantFailureMessage(
  errorMessage: string,
  locale: UiLocale,
  id = `assistant-error-${Date.now()}`,
): ConversationMessage {
  const trimmed = errorMessage.trim();
  const strings = getUiStrings(locale);
  return {
    id,
    role: "assistant",
    text: `${strings.errors.requestFailed}${trimmed ? ` ${trimmed}` : ""}`,
  };
}
