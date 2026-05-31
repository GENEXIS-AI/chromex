import type { AgenticRoutePlan } from "@codex-sidepanel/shared";
import type { UserFileAttachment } from "@codex-sidepanel/shared";

export type PromptImageWorkflowKind = "image-edit" | "generated-image";

export interface WorkflowImageInput {
  base64: string;
  mimeType: string;
  filename?: string;
}

type FetchImage = (url: string) => Promise<Response>;

export function shouldDeferPageContextCollectionForImageWorkflow(plan: AgenticRoutePlan): boolean {
  return shouldHandleAgenticImageEditWorkflow(plan) && plan.imageEdit.target === "page-image";
}

export function shouldShowPendingImageWorkflowPlaceholder(plan: AgenticRoutePlan): boolean {
  return getPromptImageWorkflowKind(plan) !== null;
}

export function getPromptImageWorkflowKind(plan: AgenticRoutePlan): PromptImageWorkflowKind | null {
  if (shouldHandleAgenticImageEditWorkflow(plan)) {
    return "image-edit";
  }

  if (shouldHandleAgenticImageGenerationWorkflow(plan)) {
    return "generated-image";
  }

  return null;
}

export function shouldHandleAgenticImageEditWorkflow(plan: AgenticRoutePlan): boolean {
  return (
    plan.task === "image-edit" &&
    plan.intent.action === "edit-image" &&
    plan.imageEdit.shouldEdit &&
    (plan.imageEdit.target === "page-image" || plan.imageEdit.target === "uploaded-image")
  );
}

export function shouldHandleAgenticImageGenerationWorkflow(plan: AgenticRoutePlan): boolean {
  return plan.task === "image-generate" && plan.intent.action === "generate-image" && !plan.imageEdit.shouldEdit;
}

export function shouldSuppressDefaultCurrentPageContextForImageWorkflow(plan: AgenticRoutePlan): boolean {
  if (!shouldHandleAgenticImageEditWorkflow(plan) || plan.imageEdit.target !== "uploaded-image") {
    return false;
  }
  return !plan.contextRequests.some(
    (request) => request.source === "current-page" || request.source === "image" || request.source === "selection",
  );
}

export function shouldSuppressDefaultCurrentPageContextForImageGeneration(plan: AgenticRoutePlan): boolean {
  if (!shouldHandleAgenticImageGenerationWorkflow(plan)) {
    return false;
  }
  return !plan.contextRequests.some(
    (request) => request.source === "current-page" || request.source === "image" || request.source === "selection",
  );
}

export async function resolveUploadedImageReferenceInputs(
  attachments: UserFileAttachment[],
  excludedFileId?: string,
  fetchImage?: FetchImage,
): Promise<WorkflowImageInput[]> {
  const references: WorkflowImageInput[] = [];
  for (const attachment of attachments) {
    if (attachment.kind !== "image" || attachment.id === excludedFileId) {
      continue;
    }
    const input = await resolveUploadedImageEditInput([attachment], attachment.id, fetchImage);
    if (input) {
      references.push(input);
    }
    if (references.length >= 2) {
      break;
    }
  }
  return references;
}

export async function resolveUploadedImageEditInput(
  attachments: UserFileAttachment[],
  targetFileId?: string,
  fetchImage: FetchImage = (url) => fetch(url, { credentials: "include" }),
): Promise<WorkflowImageInput | null> {
  const image = targetFileId
    ? attachments.find((attachment) => attachment.id === targetFileId && attachment.kind === "image")
    : attachments.find((attachment) => attachment.kind === "image");
  if (!image) {
    return null;
  }

  if (image.base64.trim()) {
    return {
      base64: image.base64,
      mimeType: image.mimeType || "image/png",
      filename: image.name,
    };
  }

  if (!image.sourceUrl?.trim()) {
    throw new Error(`Uploaded image has no readable bytes: ${image.name}`);
  }

  const response = await fetchImage(image.sourceUrl.trim());
  if (!response.ok) {
    throw new Error(`Uploaded web image request failed with HTTP ${response.status}.`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || image.mimeType || "image/png";
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Expected an uploaded image response, received ${mimeType}.`);
  }

  return {
    base64: arrayBufferToBase64(await blob.arrayBuffer()),
    mimeType,
    filename: image.name,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const maybeBuffer = (globalThis as { Buffer?: { from(data: ArrayBuffer): { toString(encoding: "base64"): string } } }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(buffer).toString("base64");
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
  }
  return btoa(binary);
}
