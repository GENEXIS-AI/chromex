import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

import { inferActionCardsForOpenTab } from "../src/background/site-suggestions.js";
import { getUiStrings } from "../src/sidepanel/i18n.js";

describe("site suggestions", () => {
  test("suggests practical Gmail actions", () => {
    const cards = inferActionCardsForOpenTab(
      {
        title: "Quarterly planning - Gmail",
        url: "https://mail.google.com/mail/u/0/#inbox/FMfcgzQ",
      },
      "ko-KR",
    );

    expect(cards.map((card) => card.id)).toContain("gmail-reply-draft");
    expect(cards[0]?.title).toBe("답장 초안 작성");
    expect(cards[0]?.prompt).toContain("Quarterly planning");
  });

  test("suggests workspace document actions", () => {
    const docs = inferActionCardsForOpenTab(
      {
        title: "Launch plan - Google Docs",
        url: "https://docs.google.com/document/d/abc/edit",
      },
      "en-US",
    );
    const sheets = inferActionCardsForOpenTab(
      {
        title: "Q4 metrics - Google Sheets",
        url: "https://docs.google.com/spreadsheets/d/abc/edit",
      },
      "en-US",
    );
    const slides = inferActionCardsForOpenTab(
      {
        title: "Board update - Google Slides",
        url: "https://docs.google.com/presentation/d/abc/edit",
      },
      "en-US",
    );

    expect(docs.map((card) => card.id)).toContain("docs-summary");
    expect(sheets.map((card) => card.id)).toContain("sheets-insights");
    expect(slides.map((card) => card.id)).toContain("slides-critique");
  });

  test("uses the requested UI locale instead of the browser page language for all site suggestion prompts", () => {
    const cases = [
      { title: "Quarterly planning - Gmail", url: "https://mail.google.com/mail/u/0/#inbox/FMfcgzQ" },
      { title: "AI 산업 새 국면 - 네이버뉴스", url: "https://n.news.naver.com/article/001/0012345678" },
      { title: "Attention Is All You Need", url: "https://arxiv.org/abs/1706.03762" },
      { title: "Release checklist | Trello", url: "https://trello.com/c/abc/123-card" },
    ];

    for (const item of cases) {
      const cards = inferActionCardsForOpenTab(item, "ja");
      expect(cards.length, item.url).toBeGreaterThan(0);
      expect(cards.map((card) => card.prompt ?? "").join("\n"), item.url).toContain(
        "Answer in the user's selected UI language (ja).",
      );
      expect(cards.map((card) => card.title).join(" "), item.url).not.toMatch(/[가-힣]/u);
    }
  });

  test("localizes site suggestion titles from the UI string catalog for non-English locales", () => {
    const japaneseCards = inferActionCardsForOpenTab(
      {
        title: "A useful video - YouTube",
        url: "https://www.youtube.com/watch?v=abc",
      },
      "ja",
    );

    expect(japaneseCards[0]?.id).toBe("youtube-summary-question");
    expect(japaneseCards[0]?.title).toBe(getUiStrings("ja").actionCards["youtube-summary-question"]);
    expect(japaneseCards[0]?.title).not.toBe("Summarize video");
  });

  test("keeps shared site suggestion generation free of hardcoded UI locale branches", () => {
    const actionCardsSource = readFileSync(new URL("../../shared/src/action-cards.ts", import.meta.url), "utf8");
    const backgroundSource = readFileSync(new URL("../src/background/index.ts", import.meta.url), "utf8");
    const disallowedLocaleSet = ["LOCALIZED", "ACTION_CARD", "COPY_LOCALES"].join("_");
    const disallowedLocaleHelper = ["has", "Localized", "Action", "Card", "Copy"].join("");
    const disallowedBackgroundHelper = ["get", "Background", "Localized", "Text"].join("");

    expect(actionCardsSource).not.toContain(disallowedLocaleSet);
    expect(actionCardsSource).not.toContain(disallowedLocaleHelper);
    expect(actionCardsSource).not.toMatch(/[가-힣]/u);
    expect(backgroundSource).not.toContain(disallowedBackgroundHelper);
  });

  test("suggests developer, design, shopping, and research actions", () => {
    expect(
      inferActionCardsForOpenTab({ title: "Pull request · repo", url: "https://github.com/org/repo/pull/1" }, "ko")
        .map((card) => card.id),
    ).toContain("github-review-risks");
    expect(
      inferActionCardsForOpenTab({ title: "Checkout flow", url: "https://www.figma.com/design/abc" }, "ko").map(
        (card) => card.id,
      ),
    ).toContain("figma-ui-review");
    expect(
      inferActionCardsForOpenTab({ title: "Product", url: "https://www.amazon.com/dp/example" }, "ko").map(
        (card) => card.id,
      ),
    ).toContain("shopping-compare");
    expect(
      inferActionCardsForOpenTab({ title: "AI browser", url: "https://en.wikipedia.org/wiki/Web_browser" }, "ko").map(
        (card) => card.id,
      ),
    ).toContain("research-summary");
  });

  test("suggests Korean work and writing actions", () => {
    expect(
      inferActionCardsForOpenTab({ title: "거래처 문의 - NAVER Mail", url: "https://mail.naver.com/v2/folders/0" }, "ko")
        .map((card) => card.id),
    ).toContain("korean-mail-reply-draft");
    expect(
      inferActionCardsForOpenTab({ title: "신제품 후기 쓰기", url: "https://blog.naver.com/example/123" }, "ko").map(
        (card) => card.id,
      ),
    ).toContain("korean-writing-draft");
    expect(
      inferActionCardsForOpenTab({ title: "프로젝트 이슈", url: "https://example.dooray.com/project/tasks/1" }, "ko").map(
        (card) => card.id,
      ),
    ).toContain("korean-work-task-summary");
    expect(
      inferActionCardsForOpenTab({ title: "프론트엔드 개발자", url: "https://www.wanted.co.kr/wd/123" }, "ko").map(
        (card) => card.id,
      ),
    ).toContain("korean-hiring-fit");
  });

  test("suggests dedicated actions for major work apps", () => {
    const cases = [
      {
        url: "https://drive.google.com/drive/u/0/folders/abc",
        title: "Team Folder - Google Drive",
        expected: "google-drive-organize",
      },
      {
        url: "https://meet.google.com/abc-defg-hij",
        title: "Weekly sync - Google Meet",
        expected: "google-meet-brief",
      },
      {
        url: "https://chat.google.com/room/AAA",
        title: "Growth Room - Google Chat",
        expected: "team-chat-summary",
      },
      {
        url: "https://app.slack.com/client/T123/C456",
        title: "launch-plan | Slack",
        expected: "team-chat-summary",
      },
      {
        url: "https://teams.microsoft.com/l/channel/19%3Aabc/general",
        title: "General | Microsoft Teams",
        expected: "teams-meeting-brief",
      },
      {
        url: "https://example.kakaowork.com/app/chat/123",
        title: "개발팀 - 카카오워크",
        expected: "korean-team-chat-reply",
      },
      {
        url: "https://app.flow.team/task/123",
        title: "홈페이지 개편 - flow",
        expected: "project-task-summary",
      },
      {
        url: "https://app.evernote.com/client/web#/notes/123",
        title: "Interview notes - Evernote",
        expected: "notes-summarize",
      },
      {
        url: "https://www.onenote.com/notebooks/abc",
        title: "Research Notebook - OneNote",
        expected: "notes-summarize",
      },
      {
        url: "https://keep.google.com/u/0/#NOTE/abc",
        title: "Ideas - Google Keep",
        expected: "quick-note-organize",
      },
      {
        url: "https://notes.samsung.com/#/note/abc",
        title: "회의 메모 - Samsung Notes",
        expected: "quick-note-organize",
      },
      {
        url: "https://trello.com/c/abc/123-card",
        title: "Release checklist | Trello",
        expected: "kanban-card-summary",
      },
      {
        url: "https://app.asana.com/0/123/456",
        title: "Launch task - Asana",
        expected: "project-task-summary",
      },
      {
        url: "https://company.atlassian.net/browse/WEB-123",
        title: "WEB-123 - Jira",
        expected: "jira-issue-summary",
      },
      {
        url: "https://app.clickup.com/t/abc",
        title: "Homepage refresh - ClickUp",
        expected: "project-task-summary",
      },
    ];

    for (const item of cases) {
      const ids = inferActionCardsForOpenTab({ title: item.title, url: item.url }, "ko-KR").map((card) => card.id);
      expect(ids, item.url).toContain(item.expected);
    }
  });

  test("suggests article workflows for Naver News and global news sites", () => {
    const naverCards = inferActionCardsForOpenTab(
      {
        title: "AI 산업 새 국면 - 네이버뉴스",
        url: "https://n.news.naver.com/article/001/0012345678",
      },
      "ko-KR",
    );
    const reutersCards = inferActionCardsForOpenTab(
      {
        title: "Markets rally after central bank decision | Reuters",
        url: "https://www.reuters.com/markets/us/markets-rally-2026-04-26/",
      },
      "en-US",
    );

    expect(naverCards.map((card) => card.id)).toEqual(
      expect.arrayContaining(["news-article-summary", "news-infographic"]),
    );
    expect(naverCards[0]?.title).toBe("기사 핵심 요약");
    expect(naverCards.find((card) => card.id === "news-infographic")?.title).toBe("인포그래픽 만들기");
    expect(naverCards.find((card) => card.id === "news-infographic")).toMatchObject({
      kind: "workflow",
    });
    expect(naverCards.find((card) => card.id === "news-infographic")).not.toHaveProperty("prompt");
    expect(reutersCards.map((card) => card.id)).toEqual(
      expect.arrayContaining(["news-article-summary", "news-infographic"]),
    );
    expect(reutersCards[0]?.title).toBe("Summarize article");
  });

  test("suggests paper and PDF workflows for arXiv and PDF pages", () => {
    const arxivCards = inferActionCardsForOpenTab(
      {
        title: "Attention Is All You Need",
        url: "https://arxiv.org/abs/1706.03762",
      },
      "ko-KR",
    );
    const pdfCards = inferActionCardsForOpenTab(
      {
        title: "research-brief.pdf",
        url: "https://example.org/research/research-brief.pdf",
      },
      "en-US",
    );

    expect(arxivCards.map((card) => card.id)).toEqual(
      expect.arrayContaining(["arxiv-paper-summary", "arxiv-method-review", "arxiv-related-work"]),
    );
    expect(arxivCards[0]?.title).toBe("논문 요약");
    expect(pdfCards.map((card) => card.id)).toEqual(
      expect.arrayContaining(["pdf-document-summary", "pdf-key-points", "pdf-questions"]),
    );
    expect(pdfCards[0]?.title).toBe("Summarize PDF");
  });
});
