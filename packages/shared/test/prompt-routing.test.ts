import { describe, expect, test } from "vitest";

import { inferUserFileAttachmentKind, planPromptRouting } from "../src/index.js";

describe("inferUserFileAttachmentKind", () => {
  test("detects common upload categories from name and mime type", () => {
    expect(inferUserFileAttachmentKind("mockup.png", "image/png")).toBe("image");
    expect(inferUserFileAttachmentKind("brief.md", "text/markdown")).toBe("text");
    expect(inferUserFileAttachmentKind("report.pdf", "application/pdf")).toBe("pdf");
    expect(inferUserFileAttachmentKind("voice-note.mp3", "application/octet-stream")).toBe("audio");
    expect(inferUserFileAttachmentKind("recording.wav", "")).toBe("audio");
    expect(
      inferUserFileAttachmentKind(
        "report.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("docx");
    expect(
      inferUserFileAttachmentKind(
        "finance.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("spreadsheet");
  });
});

describe("planPromptRouting", () => {
  const models = [
    {
      id: "text-only",
      label: "Text Only",
      description: "",
      isDefault: true,
      supportsImages: false,
      reasoningEfforts: [],
    },
    {
      id: "vision-capable",
      label: "Vision",
      description: "",
      isDefault: false,
      supportsImages: true,
      reasoningEfforts: [],
    },
  ];

  test("does not keyword-infer image editing in the legacy deterministic planner", () => {
    const plan = planPromptRouting({
      message: "Please edit this image and remove the background.",
      selectedProfileId: "research-assistant",
      selectedModel: "text-only",
      models,
      readStrategyOverride: "auto",
      pageAttachments: [],
      fileAttachments: [
        {
          id: "upload-1",
          name: "product.png",
          mimeType: "image/png",
          sizeBytes: 1200,
          lastModified: 1,
          base64: "ZmFrZQ==",
          kind: "image",
        },
      ],
    });

    expect(plan.task).toBe("visual-analysis");
    expect(plan.requiresVision).toBe(true);
    expect(plan.pageReadStrategy).toBe("auto");
    expect(plan.selectedProfileId).toBe("research-assistant");
    expect(plan.selectedModel).toBe("vision-capable");
    expect(plan.reroutedProfile).toBe(false);
    expect(plan.reroutedModel).toBe(true);
  });

  test("keeps image editing out of the legacy profile selector", () => {
    const plan = planPromptRouting({
      message: "현재 화면을 보정해줘.",
      selectedProfileId: "research-assistant",
      selectedModel: "text-only",
      models,
      readStrategyOverride: "auto",
      pageAttachments: ["current-page"],
      fileAttachments: [],
    });

    expect(plan.task).toBe("general");
    expect(plan.selectedProfileId).toBe("research-assistant");
    expect(plan.selectedModel).toBe("text-only");
  });

  test("does not keyword-infer terse follow-up edits from recent conversation context", () => {
    const plan = planPromptRouting({
      message: "조금 더 밝게 해줘.",
      contextHint: "user: 지금 보고 있는 이미지 배경을 바꿔줘\nassistant: 현재 페이지 이미지를 요청에 맞게 편집했습니다.",
      selectedProfileId: "research-assistant",
      selectedModel: "text-only",
      models,
      readStrategyOverride: "auto",
      pageAttachments: ["image"],
      fileAttachments: [],
    });

    expect(plan.task).toBe("visual-analysis");
    expect(plan.selectedProfileId).toBe("research-assistant");
    expect(plan.selectedModel).toBe("vision-capable");
  });

  test("keeps mixed page and file context explicit for comparison flows", () => {
    const plan = planPromptRouting({
      message: "Compare the current page to the attached PDF and image.",
      selectedProfileId: "research-assistant",
      selectedModel: "vision-capable",
      models,
      readStrategyOverride: "auto",
      pageAttachments: ["current-page"],
      fileAttachments: [
        {
          id: "upload-1",
          name: "mockup.png",
          mimeType: "image/png",
          sizeBytes: 1200,
          lastModified: 1,
          base64: "ZmFrZQ==",
          kind: "image",
        },
        {
          id: "upload-2",
          name: "spec.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1200,
          lastModified: 1,
          base64: "ZmFrZQ==",
          kind: "pdf",
        },
      ],
    });

    expect(plan.task).toBe("comparison");
    expect(plan.contextMode).toBe("page-plus-files");
    expect(plan.pageReadStrategy).toBe("hybrid");
    expect(plan.notes.some((note) => note.includes("live browser state"))).toBe(true);
  });

  test("keeps context mode explicit when there is no page or file input", () => {
    const plan = planPromptRouting({
      message: "Help me think through this copy.",
      selectedProfileId: "marketing-strategist",
      selectedModel: "text-only",
      models,
      readStrategyOverride: "auto",
      pageAttachments: [],
      fileAttachments: [],
    });

    expect(plan.task).toBe("general");
    expect(plan.contextMode).toBe("none");
    expect(plan.pageReadStrategy).toBe("auto");
  });
});
