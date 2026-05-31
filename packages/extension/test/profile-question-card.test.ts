import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { renderPendingProfileQuestionCard } from "../src/sidepanel/profile-question-card.js";
import { type PendingProfileQuestionState } from "../src/sidepanel/profile-question.js";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

const pendingQuestion: PendingProfileQuestionState = {
  id: "profile-question-test",
  messageId: "assistant-1",
  profileId: "marketing",
  profileName: "Marketing <Copilot>",
  question: "어떤 톤으로 작성할까요?",
  options: ["임원 보고", "실무 상세"],
  allowFreeform: true,
  answer: "짧게",
  createdAt: 1,
};

describe("profile question card renderer", () => {
  test("renders nothing without a pending question", () => {
    expect(
      renderPendingProfileQuestionCard({
        pending: null,
        uiLocale: "ko",
        fallbackProfileLabel: "프로필",
        canSubmit: true,
      }),
    ).toBe("");
  });

  test("renders escaped profile question controls as a pure card", () => {
    const html = renderPendingProfileQuestionCard({
      pending: pendingQuestion,
      uiLocale: "ko",
      fallbackProfileLabel: "프로필",
      canSubmit: true,
    });

    expect(html).toContain("프로필 확인 질문");
    expect(html).toContain("Marketing &lt;Copilot&gt;");
    expect(html).toContain("어떤 톤으로 작성할까요?");
    expect(html).toContain('data-profile-question-option="임원 보고"');
    expect(html).toContain('id="profile-question-answer"');
    expect(html).toContain("짧게");
    expect(html).toContain('data-ui-icon="question"');
  });

  test("disables controls while another turn is running", () => {
    const html = renderPendingProfileQuestionCard({
      pending: { ...pendingQuestion, allowFreeform: false },
      uiLocale: "en",
      fallbackProfileLabel: "Profile",
      canSubmit: false,
    });

    expect(html).toContain("Profile question");
    expect(html).toContain("disabled");
    expect(html).not.toContain('id="profile-question-answer"');
  });

  test("keeps sidepanel entrypoint thin by delegating card rendering", () => {
    expect(sidepanelSource).toContain('from "./profile-question-card.js"');
    expect(sidepanelSource).toContain("renderPendingProfileQuestionCard({");
    expect(sidepanelSource).not.toContain("function renderPendingProfileQuestion(");
  });

  test("forces a full render when a streamed profile question card is created", () => {
    expect(sidepanelSource).toContain("let profileQuestionCardRenderRequested = false;");
    expect(sidepanelSource).toContain("profileQuestionCardRenderRequested = true;");
    expect(sidepanelSource).toMatch(/if \([^)]*profileQuestionCardRenderRequested[^)]*\) \{/u);
  });
});
