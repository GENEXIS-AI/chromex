import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createCustomSiteSuggestion,
  inferCustomSiteSuggestionCards,
  normalizeCustomSiteSuggestions,
  resolveCustomSiteSuggestionKey,
} from "../src/custom-site-suggestions.js";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

function getFunctionSource(source: string, name: string): string {
  const startMatch = new RegExp(`(?:async\\s+)?function\\s+${name}\\b`, "u").exec(source);
  const start = startMatch?.index ?? -1;
  if (start < 0) {
    return "";
  }
  const rest = source.slice(start + 1);
  const nextMatch = /\n(?:async\s+)?function\s+/u.exec(rest);
  return nextMatch ? source.slice(start, start + 1 + nextMatch.index) : source.slice(start);
}

describe("custom site suggestions", () => {
  test("creates a safe current-site suggestion and matches future visits on the same host", () => {
    const suggestion = createCustomSiteSuggestion(
      {
        title: "Quarterly planning - Gmail",
        url: "https://mail.google.com/mail/u/0/#inbox",
      },
      "이 메일에 대한 답장 초안을 작성해줘.",
      1_000,
    );

    expect(suggestion).toMatchObject({
      siteKey: "mail.google.com",
      siteLabel: "mail.google.com",
      command: "이 메일에 대한 답장 초안을 작성해줘.",
      prompt: "이 메일에 대한 답장 초안을 작성해줘.",
      createdAt: 1_000,
    });

    const cards = inferCustomSiteSuggestionCards(
      {
        title: "Different message - Gmail",
        url: "https://mail.google.com/mail/u/1/#sent",
      },
      [suggestion],
    );

    expect(cards).toEqual([
      expect.objectContaining({
        id: `custom-site-${suggestion.id}`,
        title: "이 메일에 대한 답장 초안을 작성해줘.",
        kind: "prompt",
        prompt: "이 메일에 대한 답장 초안을 작성해줘.",
      }),
    ]);
  });

  test("separates visible command labels from the prompt sent to Codex", () => {
    const suggestion = createCustomSiteSuggestion(
      {
        title: "GitHub",
        url: "https://github.com/GENEXIS-AI/chromex/pulls",
      },
      "PR 리뷰 포인트",
      "현재 PR의 변경사항을 보안, 회귀 위험, 테스트 누락 관점에서 검토해줘.",
      2_000,
    );

    expect(suggestion).toMatchObject({
      command: "PR 리뷰 포인트",
      prompt: "현재 PR의 변경사항을 보안, 회귀 위험, 테스트 누락 관점에서 검토해줘.",
    });

    expect(
      inferCustomSiteSuggestionCards(
        {
          title: "Issues",
          url: "https://github.com/GENEXIS-AI/chromex/issues",
        },
        [suggestion],
      ),
    ).toEqual([
      expect.objectContaining({
        title: "PR 리뷰 포인트",
        description: "github.com",
        kind: "prompt",
        prompt: "현재 PR의 변경사항을 보안, 회귀 위험, 테스트 누락 관점에서 검토해줘.",
      }),
    ]);
  });

  test("does not match unrelated hosts and rejects restricted browser pages", () => {
    const suggestion = createCustomSiteSuggestion(
      { title: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
      "읽지 않은 메일을 업무 우선순위로 정리해줘.",
    );

    expect(resolveCustomSiteSuggestionKey("chrome://extensions")).toBeNull();
    expect(
      inferCustomSiteSuggestionCards(
        { title: "Calendar", url: "https://calendar.google.com/calendar/u/0/r" },
        [suggestion],
      ),
    ).toEqual([]);
  });

  test("normalizes stored suggestions before settings render or prompt routing", () => {
    const normalized = normalizeCustomSiteSuggestions([
      {
        id: "bad id !",
        siteKey: "https://www.Example.com/path",
        siteLabel: " Example ",
        prompt: "  요약해줘  ",
        createdAt: Number.NaN,
      },
      {
        id: "empty",
        siteKey: "https://example.com",
        siteLabel: "Example",
        prompt: "",
        createdAt: 1,
      },
    ]);

    expect(normalized).toEqual([
      {
        id: "bad-id",
        siteKey: "example.com",
        siteLabel: "Example",
        command: "요약해줘",
        prompt: "요약해줘",
        createdAt: expect.any(Number),
      },
    ]);
  });

  test("migrates legacy stored prompts into command and prompt fields", () => {
    expect(
      normalizeCustomSiteSuggestions([
        {
          id: "legacy",
          siteKey: "https://youtube.com/watch?v=1",
          siteLabel: "YouTube",
          prompt: "영상 핵심 요약",
          createdAt: 1_000,
        },
      ]),
    ).toEqual([
      {
        id: "legacy",
        siteKey: "youtube.com",
        siteLabel: "YouTube",
        command: "영상 핵심 요약",
        prompt: "영상 핵심 요약",
        createdAt: 1_000,
      },
    ]);
  });

  test("preserves composer draft when sending a site suggestion card", () => {
    const handleActionCardBody = getFunctionSource(sidepanelSource, "handleActionCard");
    const sendPromptBody = getFunctionSource(sidepanelSource, "sendPrompt");

    expect(handleActionCardBody).toContain("shouldPreserveComposerDraftForActionCard(selectedCard, actionId)");
    expect(handleActionCardBody).toContain("createSendPromptDisplayOptions(displayMessage, { preserveComposerDraft })");
    expect(sidepanelSource).toContain("function shouldPreserveComposerDraftForActionCard");
    expect(sidepanelSource).toContain("isYouTubeCurrentMomentAction(actionId)");
    expect(handleActionCardBody).toContain("preserveComposerDraft");
    expect(sendPromptBody).toContain("options.preserveComposerDraft");
    expect(sendPromptBody).toContain("preservedComposerDraft");
    expect(sendPromptBody).toContain("restoreComposerDraftAfterProgrammaticSend");
    expect(sendPromptBody).toContain("createRestoredComposerDraftState(getPromptRestoreDraft(message, preservedComposerDraft, options))");
  });
});
