import { describe, expect, test } from "vitest";

import {
  resolveUploadedImageReferenceInputs,
  resolveUploadedImageEditInput,
  shouldHandleAgenticImageEditWorkflow,
  shouldHandleAgenticImageGenerationWorkflow,
  shouldShowPendingImageWorkflowPlaceholder,
  shouldSuppressDefaultCurrentPageContextForImageGeneration,
  shouldDeferPageContextCollectionForImageWorkflow,
  shouldSuppressDefaultCurrentPageContextForImageWorkflow,
  getPromptImageWorkflowKind,
} from "../src/background/image-workflow-routing.js";
import type { AgenticRoutePlan } from "@codex-sidepanel/shared";

const basePlan: AgenticRoutePlan = {
  version: 1,
  source: "llm",
  task: "image-edit",
  contextMode: "page-only",
  contextRequests: [
    { source: "current-page", readStrategy: "hybrid", required: true, reason: "Current page image target." },
    { source: "image", readStrategy: "vision", required: true, reason: "Visible image target." },
  ],
  requiresVision: true,
  pageReadStrategy: "vision",
  intent: {
    summary: "Translate the current page image.",
    action: "edit-image",
    target: "visible-image",
    constraints: [],
    needsClarification: false,
  },
  selectedProfileId: "research-assistant",
  selectedModel: "vision-model",
  imageEdit: {
    shouldEdit: true,
    target: "page-image",
    prompt: "Translate visible text into Korean.",
    reason: "Visible page image is the target.",
  },
  notes: [],
  confidence: 0.9,
};

describe("image workflow routing", () => {
  test("marks actionable image edits as needing an immediate loading placeholder", () => {
    expect(shouldHandleAgenticImageEditWorkflow(basePlan)).toBe(true);
    expect(shouldShowPendingImageWorkflowPlaceholder(basePlan)).toBe(true);
    expect(getPromptImageWorkflowKind(basePlan)).toBe("image-edit");
  });

  test("rejects inconsistent image-edit plans for current-page summaries", () => {
    const summarizePlan: AgenticRoutePlan = {
      ...basePlan,
      task: "image-edit",
      intent: {
        summary: "Summarize the current page.",
        action: "summarize",
        target: "current-page",
        constraints: [],
        needsClarification: false,
      },
      imageEdit: {
        shouldEdit: true,
        target: "page-image",
        prompt: "Summarize the current page.",
        reason: "Stale image edit route leaked from a previous turn.",
      },
    };

    expect(shouldHandleAgenticImageEditWorkflow(summarizePlan)).toBe(false);
    expect(shouldShowPendingImageWorkflowPlaceholder(summarizePlan)).toBe(false);
    expect(getPromptImageWorkflowKind(summarizePlan)).toBeNull();
    expect(shouldDeferPageContextCollectionForImageWorkflow(summarizePlan)).toBe(false);
  });

  test("does not show image placeholders for ambiguous or skipped image plans", () => {
    expect(
      shouldShowPendingImageWorkflowPlaceholder({
        ...basePlan,
        imageEdit: {
          ...basePlan.imageEdit,
          target: "ambiguous",
        },
      }),
    ).toBe(false);
    expect(
      shouldShowPendingImageWorkflowPlaceholder({
        ...basePlan,
        task: "general",
        imageEdit: {
          ...basePlan.imageEdit,
          shouldEdit: false,
          target: "none",
        },
      }),
    ).toBe(false);
  });

  test("does not show image placeholders when the user asks for prompt text about an image", () => {
    expect(
      shouldShowPendingImageWorkflowPlaceholder({
        ...basePlan,
        task: "visual-analysis",
        intent: {
          summary: "Write an image-generation prompt for the visible image.",
          action: "answer",
          target: "visible-image",
          constraints: ["Return prompt text only."],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "The user asked for image-generation prompt text, not a changed visual output.",
        },
      }),
    ).toBe(false);
  });

  test("marks image generation requests with generated-image placeholders", () => {
    const plan: AgenticRoutePlan = {
      ...basePlan,
      task: "image-generate",
      contextRequests: [],
      requiresVision: false,
      pageReadStrategy: "auto",
      intent: {
        summary: "Generate an image from a provided prompt.",
        action: "generate-image",
        target: "conversation",
        constraints: [],
        needsClarification: false,
      },
      imageEdit: {
        shouldEdit: false,
        target: "none",
        reason: "New image generation does not edit an existing image.",
      },
    };

    expect(shouldShowPendingImageWorkflowPlaceholder(plan)).toBe(true);
    expect(getPromptImageWorkflowKind(plan)).toBe("generated-image");
    expect(shouldHandleAgenticImageGenerationWorkflow(plan)).toBe(true);
    expect(shouldSuppressDefaultCurrentPageContextForImageGeneration(plan)).toBe(true);
  });

  test("rejects inconsistent image-generation plans unless intent executes generation", () => {
    const plan: AgenticRoutePlan = {
      ...basePlan,
      task: "image-generate",
      contextRequests: [{ source: "current-page", readStrategy: "dom", required: true, reason: "Summarize page text." }],
      requiresVision: false,
      pageReadStrategy: "dom",
      intent: {
        summary: "Summarize the current page.",
        action: "summarize",
        target: "current-page",
        constraints: [],
        needsClarification: false,
      },
      imageEdit: {
        shouldEdit: false,
        target: "none",
        reason: "No image edit requested.",
      },
    };

    expect(shouldHandleAgenticImageGenerationWorkflow(plan)).toBe(false);
    expect(shouldShowPendingImageWorkflowPlaceholder(plan)).toBe(false);
    expect(getPromptImageWorkflowKind(plan)).toBeNull();
    expect(shouldSuppressDefaultCurrentPageContextForImageGeneration(plan)).toBe(false);
  });

  test("defers DOM page context collection for visible page image edits", () => {
    expect(shouldDeferPageContextCollectionForImageWorkflow(basePlan)).toBe(true);
  });

  test("does not defer context collection for uploaded image edits", () => {
    expect(
      shouldDeferPageContextCollectionForImageWorkflow({
        ...basePlan,
        imageEdit: {
          ...basePlan.imageEdit,
          target: "uploaded-image",
        },
      }),
    ).toBe(false);
  });

  test("suppresses default page reads for uploaded-image-only edits", () => {
    expect(
      shouldSuppressDefaultCurrentPageContextForImageWorkflow({
        ...basePlan,
        contextRequests: [],
        imageEdit: {
          ...basePlan.imageEdit,
          target: "uploaded-image",
        },
      }),
    ).toBe(true);
  });

  test("keeps page reads for uploaded image edits that also request visible page context", () => {
    expect(
      shouldSuppressDefaultCurrentPageContextForImageWorkflow({
        ...basePlan,
        imageEdit: {
          ...basePlan.imageEdit,
          target: "uploaded-image",
        },
      }),
    ).toBe(false);
  });

  test("uses the selected uploaded image bytes as the edit input", async () => {
    await expect(
      resolveUploadedImageEditInput(
        [
          {
            id: "file-1",
            name: "source.png",
            mimeType: "image/png",
            sizeBytes: 4,
            lastModified: 1,
            base64: "ZmFrZQ==",
            kind: "image",
          },
        ],
        "file-1",
      ),
    ).resolves.toEqual({
      base64: "ZmFrZQ==",
      mimeType: "image/png",
      filename: "source.png",
    });
  });

  test("downloads web image attachments before using them as edit input", async () => {
    const input = await resolveUploadedImageEditInput(
      [
        {
          id: "web-1",
          name: "remote.png",
          mimeType: "image/png",
          sizeBytes: 0,
          lastModified: 0,
          base64: "",
          kind: "image",
          sourceUrl: "https://example.test/remote.png",
        },
      ],
      undefined,
      async (url) => {
        expect(url).toBe("https://example.test/remote.png");
        return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), {
          status: 200,
        });
      },
    );

    expect(input).toEqual({
      base64: "AQID",
      mimeType: "image/png",
      filename: "remote.png",
    });
  });

  test("collects uploaded image references for page-image edits", async () => {
    await expect(
      resolveUploadedImageReferenceInputs([
        {
          id: "file-1",
          name: "reference.png",
          mimeType: "image/png",
          sizeBytes: 4,
          lastModified: 1,
          base64: "cmVm",
          kind: "image",
        },
      ]),
    ).resolves.toEqual([
      {
        base64: "cmVm",
        mimeType: "image/png",
        filename: "reference.png",
      },
    ]);
  });

  test("keeps generated follow-up image as target and treats new uploads as references", async () => {
    await expect(
      resolveUploadedImageReferenceInputs(
        [
          {
            id: "generated-followup-1",
            name: "generated.png",
            mimeType: "image/png",
            sizeBytes: 4,
            lastModified: 1,
            base64: "dGFyZ2V0",
            kind: "image",
          },
          {
            id: "file-reference-1",
            name: "reference.png",
            mimeType: "image/png",
            sizeBytes: 3,
            lastModified: 2,
            base64: "cmVm",
            kind: "image",
          },
        ],
        "generated-followup-1",
      ),
    ).resolves.toEqual([
      {
        base64: "cmVm",
        mimeType: "image/png",
        filename: "reference.png",
      },
    ]);
  });
});
