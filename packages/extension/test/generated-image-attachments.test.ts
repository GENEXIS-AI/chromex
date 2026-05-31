import { describe, expect, test } from "vitest";

import {
  createGeneratedImageAttachmentName,
  shouldAttachGeneratedImagesForRoutePlan,
  toGeneratedImageFileAttachment,
} from "../src/sidepanel/generated-image-attachments.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgenticRoutePlan } from "@codex-sidepanel/shared";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const generatedImageAttachmentSource = readFileSync(resolve(process.cwd(), "src/sidepanel/generated-image-attachments.ts"), "utf8");

describe("generated image attachments", () => {
  const basePlan: AgenticRoutePlan = {
    version: 1,
    source: "llm",
    task: "general",
    contextMode: "none",
    contextRequests: [],
    historyQuery: "",
    requiresVision: false,
    pageReadStrategy: "auto",
    intent: {
      summary: "Answer the user.",
      action: "answer",
      target: "conversation",
      constraints: [],
      needsClarification: false,
    },
    selectedProfileId: "research-assistant",
    selectedModel: "fast-text",
    imageEdit: {
      shouldEdit: false,
      target: "none",
      reason: "No image edit route.",
    },
    browserControl: {
      shouldControl: false,
      mode: "dom",
      surface: "active-tab",
      reason: "No browser control.",
    },
    notes: [],
    confidence: 0.7,
  };

  test("attaches prior generated images from the agentic route plan, not prompt keywords", () => {
    expect(
      shouldAttachGeneratedImagesForRoutePlan({
        ...basePlan,
        task: "visual-analysis",
        contextMode: "files-only",
        requiresVision: true,
        intent: {
          ...basePlan.intent,
          target: "uploaded-file",
        },
      }),
    ).toBe(true);
  });

  test("does not attach generated images for unrelated text-only route plans", () => {
    expect(
      shouldAttachGeneratedImagesForRoutePlan(basePlan),
    ).toBe(false);
  });

  test("turns a generated data URL image into a bridge-readable image attachment", () => {
    expect(
      toGeneratedImageFileAttachment({
        id: "generated-image-1",
        name: "slide-1.png",
        dataUrl: "data:image/png;base64,YWJj",
        index: 0,
      }),
    ).toMatchObject({
      id: "generated-image-1",
      name: "slide-1.png",
      mimeType: "image/png",
      base64: "YWJj",
      sizeBytes: 3,
      kind: "image",
    });
  });

  test("creates stable slide image attachment names from image alt text", () => {
    expect(createGeneratedImageAttachmentName("Presentation slide image 2", 1)).toBe("presentation-slide-image-2.png");
    expect(createGeneratedImageAttachmentName("", 0)).toBe("generated-slide-image-1.png");
  });

  test("wires generated image attachments into normal prompt submission", () => {
    expect(sidepanelSource).toContain("createGeneratedImageFileAttachmentsForPrompt");
    expect(sidepanelSource).toContain("shouldAttachGeneratedImagesForRoutePlan");
    expect(sidepanelSource).toContain("prompt.route.preview");
    expect(sidepanelSource).toContain("resolvePreviewRefForUi(image.assetRef)");
  });

  test("does not keep multilingual prompt keyword matching in generated image attachment selection", () => {
    expect(generatedImageAttachmentSource).not.toContain("normalizeForPromptMatch");
    expect(generatedImageAttachmentSource).not.toContain("wantsPdf");
    expect(generatedImageAttachmentSource).not.toContain("mentionsImages");
    expect(generatedImageAttachmentSource).not.toContain("followupFromImages");
  });
});
