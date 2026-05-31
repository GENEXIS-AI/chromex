import { getTranslatedUiLocale, listSupportedUiLanguageOptions } from "../ui-language.js";
import { createAdaptiveImagePromptExtractionPrompt } from "./image-prompt-extraction-prompt.js";
import { getUiStrings } from "./i18n.js";

export interface OnlineImagePromptExtractionInput {
  alt?: string;
  pageTitle?: string;
  pageUrl?: string;
  responseLanguage?: string;
}

export function createOnlineImagePromptExtractionPrompt(input: OnlineImagePromptExtractionInput = {}): string {
  const strings = getUiStrings(input.responseLanguage);
  const responseLanguage = getPromptOutputLanguageName(input.responseLanguage);
  const contextLines = [
    input.alt?.trim() ? `- ${strings.prompts.onlineImageAltLabel}: ${input.alt.trim()}` : "",
    input.pageTitle?.trim() ? `- ${strings.prompts.onlineImagePageTitleLabel}: ${input.pageTitle.trim()}` : "",
    input.pageUrl?.trim() ? `- ${strings.prompts.onlineImagePageUrlLabel}: ${input.pageUrl.trim()}` : "",
  ].filter(Boolean);

  const context = contextLines.length
    ? `\n\n${strings.prompts.onlineImageContextLabel}:\n${contextLines.join("\n")}`
    : "";
  return createAdaptiveImagePromptExtractionPrompt({
    source: "online",
    outputLanguage: responseLanguage,
    locale: input.responseLanguage,
  }) + context;
}

function getPromptOutputLanguageName(locale: string | undefined): string {
  const translatedLocale = getTranslatedUiLocale(locale);
  return listSupportedUiLanguageOptions().find((option) => option.locale === translatedLocale)?.nativeName ?? "English";
}
