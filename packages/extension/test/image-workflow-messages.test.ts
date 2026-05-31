import { describe, expect, test } from "vitest";

import {
  buildImageDownloadName,
  createFailedConversationImage,
  createGeneratedImageAlt,
  createLoadingConversationImage,
  createPendingConversationImage,
  isSameConversationImage,
  normalizeImageGenerateWorkflow,
  normalizeImagePreviewRefs,
  normalizePromptStatusImageWorkflow,
} from "../src/sidepanel/image-workflow-messages.js";

describe("image workflow message helpers", () => {
  test("creates loading, pending, and failed image snapshots without materializing bridge assets", () => {
    expect(createLoadingConversationImage("Preparing image")).toEqual({
      src: "",
      alt: "Preparing image",
      status: "loading",
    });
    expect(createPendingConversationImage("codex-asset:abc", "Generated")).toEqual({
      src: "",
      alt: "Generated",
      status: "loading",
      assetRef: "codex-asset:abc",
    });
    expect(createPendingConversationImage("data:image/png;base64,abc", "Generated")).toEqual({
      src: "data:image/png;base64,abc",
      alt: "Generated",
      status: "ready",
    });
    expect(createFailedConversationImage("codex-asset:missing", "Generated")).toEqual({
      src: "",
      alt: "Generated",
      status: "error",
      assetRef: "codex-asset:missing",
    });
  });

  test("deduplicates preview refs while preserving first-seen order", () => {
    expect(normalizeImagePreviewRefs([" codex-asset:1 ", "", "codex-asset:2"], "codex-asset:1")).toEqual([
      "codex-asset:1",
      "codex-asset:2",
    ]);
  });

  test("normalizes image workflow event payloads explicitly", () => {
    expect(normalizeImageGenerateWorkflow("infographic")).toBe("infographic");
    expect(normalizeImageGenerateWorkflow("slide-images")).toBe("slide-images");
    expect(normalizeImageGenerateWorkflow("generated-image")).toBe("generated-image");
    expect(normalizeImageGenerateWorkflow("image-edit")).toBeUndefined();
    expect(normalizePromptStatusImageWorkflow("image-edit")).toBe("image-edit");
    expect(normalizePromptStatusImageWorkflow("not-image")).toBeUndefined();
  });

  test("compares images by durable asset refs before transient src values", () => {
    expect(
      isSameConversationImage(
        { src: "", alt: "a", status: "ready", assetRef: "codex-asset:1" },
        { src: "data:image/png;base64,abc", alt: "b", status: "ready", assetRef: "codex-asset:1" },
      ),
    ).toBe(true);
    expect(
      isSameConversationImage(
        { src: "data:image/png;base64,abc", alt: "a", status: "ready" },
        { src: "data:image/png;base64,abc", alt: "b", status: "loading" },
      ),
    ).toBe(true);
  });

  test("formats generated image labels and stable download names", () => {
    expect(createGeneratedImageAlt("Slide", 1, 3)).toBe("Slide 2/3");
    expect(createGeneratedImageAlt("Slide", 0, 1)).toBe("Slide");
    expect(buildImageDownloadName("임원 보고: RQ1/RQ3", new Date("2026-04-28T12:34:56.789Z"))).toBe(
      "임원-보고-rq1-rq3-2026-04-28T12-34-56-789Z.png",
    );
    expect(buildImageDownloadName("   ", new Date("2026-04-28T12:34:56.789Z"))).toBe(
      "codex-image-2026-04-28T12-34-56-789Z.png",
    );
  });
});
