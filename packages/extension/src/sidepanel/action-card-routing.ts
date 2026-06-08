import type { ActionCard } from "@codex-sidepanel/shared";

import { isImageAttachmentSuggestionActionId } from "./image-attachment-suggestions.js";

export function isTextFirstActionCard(card: ActionCard): boolean {
  if (isImageAttachmentSuggestionActionId(card.id)) {
    return false;
  }
  if (card.id === "selection-fact-check") {
    return false;
  }

  return (
    card.kind === "prompt" ||
    card.id === "summarize-video" ||
    card.id === "summarize-current-timestamp" ||
    card.id === "draft-blog-post" ||
    card.id === "summarize-page"
  );
}
