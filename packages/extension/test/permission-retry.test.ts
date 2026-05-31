import { describe, expect, test } from "vitest";

import { resolvePermissionRetryPrompt } from "../src/sidepanel/permission-retry.js";

describe("permission retry prompt", () => {
  test("retries the exact permission-blocked request before using the current composer draft", () => {
    expect(
      resolvePermissionRetryPrompt({
        pendingRetryMessage: "이 이미지 한국어로 변경해줘.",
        composerDraft: "다른 초안",
        composerValue: "다른 입력",
      }),
    ).toBe("이 이미지 한국어로 변경해줘.");
  });

  test("falls back to the visible composer value when no saved retry request exists", () => {
    expect(
      resolvePermissionRetryPrompt({
        composerValue: " 현재 화면 설명해줘. ",
      }),
    ).toBe("현재 화면 설명해줘.");
  });
});
