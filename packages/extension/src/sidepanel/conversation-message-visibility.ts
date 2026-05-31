import type { ConversationMessage } from "../types.js";

export function shouldRenderConversationMessage(message: ConversationMessage): boolean {
  if (message.notice) {
    return true;
  }
  if (message.text.trim()) {
    return true;
  }
  if (message.attachments?.length) {
    return true;
  }
  if (message.trace?.length) {
    return true;
  }
  return (message.images ?? []).some(
    (image) => image.src || image.assetRef || image.status === "loading" || image.status === "error" || image.status === "deleted",
  );
}

export function isPendingImageMessage(message: ConversationMessage): boolean {
  return message.role === "assistant" && (message.images ?? []).some((image) => image.status === "loading");
}
