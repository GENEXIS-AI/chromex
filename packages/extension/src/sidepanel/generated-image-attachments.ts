import type { AgenticRoutePlan, UserFileAttachment } from "@codex-sidepanel/shared";

const GENERATED_IMAGE_ATTACHMENT_LIMIT = 6;

export interface GeneratedImageDataUrlInput {
  id: string;
  name: string;
  dataUrl: string;
  index: number;
}

export function shouldAttachGeneratedImagesForRoutePlan(
  plan: Pick<AgenticRoutePlan, "contextMode" | "imageEdit" | "intent" | "requiresVision" | "task">,
): boolean {
  if (plan.intent.needsClarification) {
    return false;
  }
  if (plan.imageEdit.shouldEdit && plan.imageEdit.target === "uploaded-image") {
    return true;
  }
  if (plan.intent.target === "uploaded-file") {
    return true;
  }
  if (!plan.requiresVision || (plan.contextMode !== "files-only" && plan.contextMode !== "page-plus-files")) {
    return false;
  }
  return plan.task === "visual-analysis" || plan.task === "comparison" || plan.task === "image-edit";
}

export function createGeneratedImageAttachmentName(alt: string, index: number): string {
  const baseName = alt
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 56);
  return `${baseName || `generated-slide-image-${index + 1}`}.png`;
}

export function toGeneratedImageFileAttachment(input: GeneratedImageDataUrlInput): UserFileAttachment | null {
  const parsed = parseImageDataUrl(input.dataUrl);
  if (!parsed) {
    return null;
  }

  return {
    id: input.id,
    name: input.name,
    mimeType: parsed.mimeType,
    sizeBytes: base64SizeBytes(parsed.base64),
    lastModified: Date.now() + input.index,
    base64: parsed.base64,
    kind: "image",
  };
}

export function getGeneratedImageAttachmentLimit(): number {
  return GENERATED_IMAGE_ATTACHMENT_LIMIT;
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl.trim());
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    mimeType: match[1],
    base64: match[2].replace(/\s+/gu, ""),
  };
}

function base64SizeBytes(base64: string): number {
  const normalized = base64.replace(/\s+/gu, "");
  if (!normalized) {
    return 0;
  }
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}
