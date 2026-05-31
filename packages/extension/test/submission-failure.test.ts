import { describe, expect, test } from "vitest";

import { createAssistantFailureMessage } from "../src/sidepanel/submission-failure.js";

describe("submission failure messages", () => {
  test("keeps the submitted user message in chat and adds a visible assistant error", () => {
    expect(createAssistantFailureMessage("Image editing timed out.", "ko", "assistant-error-1")).toEqual({
      id: "assistant-error-1",
      role: "assistant",
      text: "요청을 완료하지 못했습니다. Image editing timed out.",
    });
  });
});
