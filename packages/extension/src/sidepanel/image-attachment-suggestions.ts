import type { ActionCard, UserFileAttachment } from "@codex-sidepanel/shared";

import { getTranslatedUiLocale, SUPPORTED_UI_LANGUAGE_OPTIONS } from "../ui-language.js";
import { createAdaptiveImagePromptExtractionPrompt } from "./image-prompt-extraction-prompt.js";
import { getUiStrings, type UiLocale } from "./i18n.js";

export const IMAGE_ATTACHMENT_PROMPT_EXTRACT_ACTION_ID = "image-attachment-prompt-extract";
export const IMAGE_ATTACHMENT_DESCRIBE_ACTION_ID = "image-attachment-describe";

export interface ImageAttachmentSuggestionInput {
  attachments: UserFileAttachment[];
  locale: UiLocale | string;
}

export function createImageAttachmentSuggestionCards(input: ImageAttachmentSuggestionInput): ActionCard[] {
  const imageAttachments = input.attachments.filter((attachment) => attachment.kind === "image");
  if (!imageAttachments.length) {
    return [];
  }

  const strings = getUiStrings(input.locale);
  const imageList = formatImageAttachmentList(imageAttachments, strings.labels.image);
  const outputLanguage = getNativePromptOutputLanguageName(input.locale);

  return [
    {
      id: IMAGE_ATTACHMENT_PROMPT_EXTRACT_ACTION_ID,
      title: strings.actionCards[IMAGE_ATTACHMENT_PROMPT_EXTRACT_ACTION_ID],
      description: "",
      kind: "prompt",
      prompt: createAdaptiveImagePromptExtractionPrompt({
        source: "attachment",
        imageList,
        imageCount: imageAttachments.length,
        outputLanguage,
        locale: input.locale,
      }),
    },
    {
      id: IMAGE_ATTACHMENT_DESCRIBE_ACTION_ID,
      title: strings.actionCards[IMAGE_ATTACHMENT_DESCRIBE_ACTION_ID],
      description: "",
      kind: "prompt",
      prompt: strings.prompts.imageAttachmentDescribe(imageList, imageAttachments.length, outputLanguage),
    },
  ];
}

export function isImageAttachmentSuggestionActionId(actionId: string): boolean {
  return actionId === IMAGE_ATTACHMENT_PROMPT_EXTRACT_ACTION_ID || actionId === IMAGE_ATTACHMENT_DESCRIBE_ACTION_ID;
}

function getNativePromptOutputLanguageName(locale: UiLocale | string): string {
  const translatedLocale = getTranslatedUiLocale(locale);
  return SUPPORTED_UI_LANGUAGE_OPTIONS.find((option) => option.locale === translatedLocale)?.nativeName ?? "English";
}

function formatImageAttachmentList(attachments: UserFileAttachment[], fallbackLabel: string): string {
  return attachments
    .slice(0, 3)
    .map((attachment) => attachment.name.trim())
    .filter(Boolean)
    .join(", ") || fallbackLabel;
}
