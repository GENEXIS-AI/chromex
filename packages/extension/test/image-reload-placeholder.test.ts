import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const i18nSource = readFileSync(resolve(process.cwd(), "src/sidepanel/i18n.ts"), "utf8");
const sidepanelStateSource = readFileSync(resolve(process.cwd(), "src/sidepanel/sidepanel-state.ts"), "utf8");
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8");

describe("image reload placeholders", () => {
  test("marks stale blob-only generated images as deleted instead of dropping the chat history", () => {
    expect(sidepanelStateSource).toContain('src.startsWith("blob:")');
    expect(sidepanelStateSource).toContain('status: "deleted"');
    expect(sidepanelStateSource).toContain('image.status === "deleted"');
    expect(sidepanelSource).toContain('image.status === "deleted"');
    expect(sidepanelSource).toContain("strings.images.deleted");
    expect(i18nSource).toContain("삭제된 이미지");
  });

  test("shows a compact skeleton without duplicate generated-image copy", () => {
    expect(sidepanelSource).not.toContain("더 자세한 이미지를 생성하는 중입니다");
    expect(sidepanelSource).not.toContain("Thinking carefully");
    expect(styles).toContain(".message-image-frame.pending.loading");
    expect(styles).toContain(".message-image-skeleton");
    expect(styles).toContain("radial-gradient(circle");
  });

  test("keeps active image workflow supplements under the process row", () => {
    expect(sidepanelSource).toContain("partitionPromptActivityMessages");
    expect(sidepanelSource).toContain("isPromptActivitySupplementMessage");
    expect(sidepanelSource).toContain("isCurrentPromptActivityPendingImageMessage");
    expect(sidepanelSource).toContain("isCurrentStreamingAssistantMessage");
    expect(sidepanelSource).toContain("pendingImageWorkflowMessageIdsByRequest.get(clientRequestId)");
    expect(sidepanelSource).toContain("isPendingImageMessage");
    expect(sidepanelSource).not.toContain("return isTraceOnlyAssistantMessage(message) || isPendingImageMessage(message);");
  });

  test("waits for the confirmed image workflow before showing image placeholders", () => {
    expect(backgroundSource).not.toContain("const imageWorkflowKind = getPromptImageWorkflowKind(agenticRoutePlan);");
    expect(backgroundSource).toContain('emitStatus("preparing-image", "image-edit")');
    expect(backgroundSource).toContain('emitStatus("preparing-image", "generated-image")');
  });

  test("creates a pending image message as soon as an image workflow starts", () => {
    expect(sidepanelSource).toContain("ensurePendingImageWorkflowMessage");
    expect(sidepanelSource).toContain("isImageWorkflowPromptActivityPhase");
    expect(sidepanelSource).toContain("resolvePromptStatusClientRequestId");
    expect(sidepanelSource).toContain("isPromptStatusForActiveRequest");
    expect(sidepanelSource).toContain("a previous image turn cannot leak into a text answer");
    expect(sidepanelSource).toContain("replacePendingImageWorkflowMessage");
    expect(sidepanelSource).toContain("createLoadingConversationImage");
    expect(sidepanelSource).toContain('phase: "preparing-image"');
    expect(sidepanelSource).toContain('pushPendingImageWorkflowMessage(clientRequestId, "infographic")');
    expect(sidepanelSource).toContain('pushPendingImageWorkflowMessage(clientRequestId, "slide-images")');
  });

  test("appends streamed slide images into the existing workflow message as each image arrives", () => {
    expect(sidepanelSource).toContain("streamedImagePreviewRefsByRequest");
    expect(sidepanelSource).toContain("appendStreamedImageToWorkflowMessage");
    expect(sidepanelSource).toContain("consumeStreamedImagePreviewRefs(clientRequestId)");
    expect(sidepanelSource).toContain("clientRequestId,");
    expect(sidepanelSource).toContain("normalizeImageGenerateWorkflow");
  });
});
