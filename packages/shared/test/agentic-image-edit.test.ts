import { describe, expect, test } from "vitest";

import { planAgenticImageEdit } from "../src/index.js";

const sampleImage = {
  id: "image-1",
  name: "reference.png",
  mimeType: "image/png",
  sizeBytes: 1000,
  lastModified: 1,
  base64: "ZmFrZQ==",
  kind: "image" as const,
};

describe("planAgenticImageEdit", () => {
  test("targets the current page image when only page context is available", () => {
    const plan = planAgenticImageEdit({
      message: "이 화면을 더 선명하게 보정해줘.",
      pageAttachments: ["image"],
      fileAttachments: [],
    });

    expect(plan.target).toBe("page-image");
    expect(plan.prompt).toContain("Target image: the current page image");
  });

  test("marks mixed page and upload sources ambiguous without a planner target", () => {
    const plan = planAgenticImageEdit({
      message: "이 이미지 배경을 제거해줘.",
      pageAttachments: ["image"],
      fileAttachments: [sampleImage],
    });

    expect(plan.target).toBe("ambiguous");
    expect(plan.reason).toContain("planner-selected target");
  });

  test("does not parse current-screen keywords without a planner target", () => {
    const plan = planAgenticImageEdit({
      message: "현재 화면을 기준으로 톤을 바꿔줘.",
      pageAttachments: ["image"],
      fileAttachments: [sampleImage],
    });

    expect(plan.target).toBe("ambiguous");
  });

  test("does not parse viewed-image keywords without a planner target", () => {
    const plan = planAgenticImageEdit({
      message: "지금 보고 있는 이미지를 더 밝게 보정해줘.",
      pageAttachments: ["image"],
      fileAttachments: [sampleImage],
    });

    expect(plan.target).toBe("ambiguous");
  });

  test("does not parse current-tab keywords without a planner target", () => {
    const plan = planAgenticImageEdit({
      message: "현재 열려있는 탭의 이미지를 시네마틱하게 바꿔줘.",
      pageAttachments: ["image"],
      fileAttachments: [sampleImage],
    });

    expect(plan.target).toBe("ambiguous");
  });

  test("marks the workflow ambiguous when multiple uploaded images are attached without a target", () => {
    const plan = planAgenticImageEdit({
      message: "이 이미지들 보정해줘.",
      pageAttachments: [],
      fileAttachments: [sampleImage, { ...sampleImage, id: "image-2", name: "other.png" }],
    });

    expect(plan.target).toBe("ambiguous");
  });
});
