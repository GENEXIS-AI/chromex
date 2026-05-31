import type { UserFileAttachment } from "@codex-sidepanel/shared";

const ANNOTATABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isAnnotatableImageAttachment(attachment: UserFileAttachment): boolean {
  return (
    attachment.kind === "image" &&
    Boolean(attachment.base64) &&
    ANNOTATABLE_IMAGE_TYPES.has(attachment.mimeType.toLowerCase())
  );
}

export function getImageAttachmentDataUrl(attachment: Pick<UserFileAttachment, "mimeType" | "base64">): string {
  return `data:${attachment.mimeType || "image/png"};base64,${attachment.base64}`;
}

export function createAnnotatedImageAttachment(
  attachment: UserFileAttachment,
  dataUrl: string,
  lastModified = Date.now(),
): UserFileAttachment {
  const parsed = parseImageDataUrl(dataUrl);
  const { sourceUrl: _sourceUrl, ...rest } = attachment;
  return {
    ...rest,
    name: appendAnnotatedSuffix(attachment.name),
    mimeType: parsed.mimeType,
    sizeBytes: estimateBase64Bytes(parsed.base64),
    lastModified,
    base64: parsed.base64,
    kind: "image",
  };
}

export function createImageAttachmentFromDataUrl(input: {
  id: string;
  name: string;
  dataUrl: string;
  lastModified?: number;
}): UserFileAttachment {
  const parsed = parseImageDataUrl(input.dataUrl);
  return {
    id: input.id,
    name: input.name.trim() || "generated-image.png",
    mimeType: parsed.mimeType,
    sizeBytes: estimateBase64Bytes(parsed.base64),
    lastModified: input.lastModified ?? Date.now(),
    base64: parsed.base64,
    kind: "image",
  };
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl.trim());
  if (!match?.[1] || !match[2]) {
    throw new Error("Annotated image must be a PNG, JPEG, or WebP data URL.");
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function appendAnnotatedSuffix(name: string): string {
  const sanitized = name.trim() || "image.png";
  const withoutSuffix = sanitized.replace(/\.annotated(?=\.[^.]+$)/iu, "");
  const extensionMatch = /\.[^.]+$/u.exec(withoutSuffix);
  if (!extensionMatch) {
    return `${withoutSuffix}.annotated.png`;
  }

  return `${withoutSuffix.slice(0, extensionMatch.index)}.annotated.png`;
}

function estimateBase64Bytes(base64: string): number {
  const normalized = base64.replace(/\s/gu, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}
