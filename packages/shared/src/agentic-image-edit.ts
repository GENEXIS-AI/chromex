import type { UserFileAttachment } from "./types.js";

export type AgenticImageEditTarget = "none" | "page-image" | "uploaded-image" | "ambiguous";

export interface AgenticImageEditPlan {
  target: AgenticImageEditTarget;
  targetFileId?: string;
  prompt: string;
  reason: string;
}

export function planAgenticImageEdit(input: {
  message: string;
  pageAttachments: Array<"current-page" | "selection" | "image">;
  fileAttachments: UserFileAttachment[];
}): AgenticImageEditPlan {
  const uploadedImages = input.fileAttachments.filter((attachment) => attachment.kind === "image");
  const hasPageImage = input.pageAttachments.includes("image") || input.pageAttachments.includes("current-page");

  if (!hasPageImage && uploadedImages.length === 0) {
    return {
      target: "none",
      prompt: input.message,
      reason: "No editable image source is attached.",
    };
  }

  if (hasPageImage && uploadedImages.length > 0) {
    return {
      target: "ambiguous",
      prompt: input.message,
      reason: "Page and uploaded images are both available; a planner-selected target is required.",
    };
  }

  if (hasPageImage && uploadedImages.length === 0) {
    return {
      target: "page-image",
      prompt: enrichPrompt(input.message, [
        "Target image: the current page image or visible screen capture.",
      ]),
      reason: "Only page-derived visual context is available.",
    };
  }

  if (uploadedImages.length === 1) {
    return {
      target: "uploaded-image",
      ...(uploadedImages[0]?.id ? { targetFileId: uploadedImages[0].id } : {}),
      prompt: enrichPrompt(input.message, [
        `Target image: the uploaded file "${uploadedImages[0]?.name ?? "image"}".`,
      ]),
      reason: "Only one uploaded image is available.",
    };
  }

  return {
    target: "ambiguous",
    prompt: input.message,
    reason: "Multiple uploaded images are attached but no planner-selected target was provided.",
  };
}

function enrichPrompt(message: string, instructions: string[]): string {
  const trimmed = message.trim();
  const filtered = instructions.map((line) => line.trim()).filter(Boolean);
  if (filtered.length === 0) {
    return trimmed;
  }
  return [trimmed, "", "Image edit workflow:", ...filtered].join("\n");
}
