import type { UserFileAttachment } from "@codex-sidepanel/shared";

import type { ConversationMessageAttachment } from "../types.js";

const GENERATED_FOLLOWUP_PREFIX = "generated-followup-";

export function createConversationMessageAttachments(
  attachments: UserFileAttachment[],
): ConversationMessageAttachment[] {
  const hasGeneratedFollowupTarget = attachments.some(isGeneratedFollowupImageAttachment);

  return attachments
    .map((attachment) => createConversationMessageAttachment(attachment, hasGeneratedFollowupTarget))
    .filter((attachment): attachment is ConversationMessageAttachment => Boolean(attachment));
}

function createConversationMessageAttachment(
  attachment: UserFileAttachment,
  hasGeneratedFollowupTarget: boolean,
): ConversationMessageAttachment | null {
  const name = attachment.name.trim();
  if (!attachment.id || !name) {
    return null;
  }

  const previewSrc = createAttachmentPreviewSrc(attachment);
  const role = createAttachmentRole(attachment, hasGeneratedFollowupTarget);

  return {
    id: attachment.id,
    name,
    mimeType: attachment.mimeType || "application/octet-stream",
    kind: attachment.kind,
    sizeBytes: Math.max(0, attachment.sizeBytes),
    ...(previewSrc ? { previewSrc } : {}),
    ...(attachment.sourceUrl ? { sourceUrl: attachment.sourceUrl } : {}),
    ...(role ? { role } : {}),
  };
}

function createAttachmentPreviewSrc(attachment: UserFileAttachment): string {
  if (attachment.kind !== "image") {
    return "";
  }

  if (attachment.base64.trim()) {
    return `data:${attachment.mimeType || "image/png"};base64,${attachment.base64}`;
  }

  return attachment.sourceUrl?.trim() ?? "";
}

function createAttachmentRole(
  attachment: UserFileAttachment,
  hasGeneratedFollowupTarget: boolean,
): ConversationMessageAttachment["role"] | undefined {
  if (attachment.kind !== "image") {
    return undefined;
  }
  if (isGeneratedFollowupImageAttachment(attachment)) {
    return "target";
  }
  return hasGeneratedFollowupTarget ? "reference" : undefined;
}

function isGeneratedFollowupImageAttachment(attachment: UserFileAttachment): boolean {
  return attachment.kind === "image" && attachment.id.startsWith(GENERATED_FOLLOWUP_PREFIX);
}
