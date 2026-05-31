import { describe, expect, test } from "vitest";

import { getSpecificRuntimeErrorMessage } from "../src/sidepanel/runtime-error-copy.js";

describe("sidepanel runtime error copy", () => {
  test("redacts invalid API key failures", () => {
    const message = getSpecificRuntimeErrorMessage(
      new Error(
        "unexpected status 401 Unauthorized: Incorrect API key provided: sk-proj-secret, auth error code: invalid_api_key",
      ),
      "ko",
    );

    expect(message).toContain("OpenAI API 키");
    expect(message).not.toContain("sk-proj");
  });

  test("explains usage limit, invalid image, missing config, and extension reload failures", () => {
    expect(getSpecificRuntimeErrorMessage(new Error("You've hit your usage limit. Try again later."), "ko")).toContain(
      "사용 한도",
    );
    expect(
      getSpecificRuntimeErrorMessage(
        new Error("Invalid image in your last message. Please remove it and try again."),
        "ko",
      ),
    ).toContain("이미지");
    expect(
      getSpecificRuntimeErrorMessage(
        new Error("failed to load configuration: No such file or directory (os error 2)"),
        "ko",
      ),
    ).toContain("Codex 설정");
    expect(getSpecificRuntimeErrorMessage(new Error("Could not load file: 'content.js'."), "ko")).toContain(
      "확장 프로그램",
    );
  });
});
