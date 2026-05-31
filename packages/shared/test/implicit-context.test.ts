import { describe, expect, test } from "vitest";

import { inferImplicitContextPlan } from "../src/index.js";

describe("inferImplicitContextPlan", () => {
  test("does not infer browser context from user-message keywords", () => {
    const plan = inferImplicitContextPlan({
      message: "현재 페이지와 지금 보이는 화면을 설명해줘.",
      explicitAttachments: [],
    });

    expect(plan.attachments).toEqual([]);
    expect(plan.inferredAttachments).toEqual([]);
    expect(plan.readStrategyOverride).toBe("auto");
  });

  test("preserves explicit context attachments", () => {
    const plan = inferImplicitContextPlan({
      message: "이 화면 설명해줘.",
      explicitAttachments: ["current-page", "image"],
      readStrategyOverride: "vision",
    });

    expect(plan.attachments).toEqual(["current-page", "image"]);
    expect(plan.inferredAttachments).toEqual([]);
    expect(plan.readStrategyOverride).toBe("vision");
  });

  test("uses hybrid reading for explicit image context when no stronger override exists", () => {
    const plan = inferImplicitContextPlan({
      message: "분석해줘.",
      explicitAttachments: ["image"],
      readStrategyOverride: "auto",
    });

    expect(plan.attachments).toEqual(["image"]);
    expect(plan.inferredAttachments).toEqual([]);
    expect(plan.readStrategyOverride).toBe("hybrid");
    expect(plan.notes).toEqual(["Explicit image context requires hybrid page reading."]);
  });
});
