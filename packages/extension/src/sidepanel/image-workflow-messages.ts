import type { ConversationMessageImage } from "../types.js";
import { isBridgeImageAssetRef } from "./image-preview-assets.js";

export type ImageWorkflowPlaceholderKind = "image-edit" | "infographic" | "slide-images" | "generated-image";

export function buildImageDownloadName(alt: string, now = new Date()): string {
  const baseName = alt
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  return `${baseName || "codex-image"}-${now.toISOString().replace(/[:.]/gu, "-")}.png`;
}

export function createLoadingConversationImage(alt: string): ConversationMessageImage {
  return {
    src: "",
    alt,
    status: "loading",
  };
}

export function createPendingConversationImage(previewRef: string, alt: string): ConversationMessageImage {
  const trimmed = previewRef.trim();
  return {
    src: isBridgeImageAssetRef(trimmed) ? "" : trimmed,
    alt,
    status: isBridgeImageAssetRef(trimmed) ? "loading" : "ready",
    ...(isBridgeImageAssetRef(trimmed) ? { assetRef: trimmed } : {}),
  };
}

export function createFailedConversationImage(previewRef: string, alt: string): ConversationMessageImage {
  const trimmed = previewRef.trim();
  return {
    src: isBridgeImageAssetRef(trimmed) ? "" : trimmed,
    alt,
    status: "error",
    ...(isBridgeImageAssetRef(trimmed) ? { assetRef: trimmed } : {}),
  };
}

export function isSameConversationImage(left: ConversationMessageImage, right: ConversationMessageImage): boolean {
  if (left.assetRef && right.assetRef) {
    return left.assetRef === right.assetRef;
  }
  if (left.src && right.src) {
    return left.src === right.src;
  }
  return false;
}

export function normalizeImagePreviewRefs(previewRefs: string[] | undefined, previewRef: string | undefined): string[] {
  return Array.from(
    new Set(
      [...(previewRefs ?? []), ...(previewRef ? [previewRef] : [])]
        .map((ref) => ref.trim())
        .filter(Boolean),
    ),
  );
}

export function normalizeImageGenerateWorkflow(value: unknown): Exclude<ImageWorkflowPlaceholderKind, "image-edit"> | undefined {
  return value === "infographic" || value === "slide-images" || value === "generated-image" ? value : undefined;
}

export function normalizePromptStatusImageWorkflow(value: unknown): ImageWorkflowPlaceholderKind | undefined {
  if (value === "image-edit") {
    return "image-edit";
  }
  return normalizeImageGenerateWorkflow(value);
}

export function createGeneratedImageAlt(baseAlt: string, index: number, total: number): string {
  return total > 1 ? `${baseAlt} ${index + 1}/${total}` : baseAlt;
}
