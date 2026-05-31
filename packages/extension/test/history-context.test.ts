import { describe, expect, test } from "vitest";

import {
  createHistorySearchOptions,
  createHistoryContextSummary,
  extractSearchQueryFromHistoryUrl,
  HISTORY_CONTEXT_MAX_ITEMS,
  limitHistoryContextItems,
  resolveHistoryContextQuery,
} from "../src/background/history-context.js";

describe("history context helpers", () => {
  test("uses the route planner query when present and otherwise fetches recent history", () => {
    expect(resolveHistoryContextQuery("", "OpenAI announcement")).toBe("OpenAI announcement");
    expect(resolveHistoryContextQuery("codex app server", "OpenAI announcement")).toBe("codex app server");
    expect(resolveHistoryContextQuery("", "")).toBe("");
    expect(resolveHistoryContextQuery("", "   ")).toBe("");
  });

  test("requests a broad all-time history window with a high result cap", () => {
    expect(createHistorySearchOptions("")).toEqual({
      text: "",
      maxResults: 5000,
      startTime: 0,
    });
    expect(createHistorySearchOptions("OpenAI announcement")).toEqual({
      text: "OpenAI announcement",
      maxResults: 5000,
      startTime: 0,
    });
  });

  test("keeps substantially more history entries for month-scale questions", () => {
    const items = Array.from({ length: HISTORY_CONTEXT_MAX_ITEMS + 5 }, (_, index) => ({
      title: `Entry ${index}`,
      url: `https://example.com/${index}`,
    }));

    expect(HISTORY_CONTEXT_MAX_ITEMS).toBe(1000);
    expect(limitHistoryContextItems(items)).toHaveLength(1000);
  });

  test("extracts real search terms from common search-engine history URLs", () => {
    expect(extractSearchQueryFromHistoryUrl("https://www.google.com/search?q=codex+app+server")).toEqual({
      engine: "Google",
      query: "codex app server",
    });
    expect(extractSearchQueryFromHistoryUrl("https://search.naver.com/search.naver?query=%EC%BD%94%EB%8D%B1%EC%8A%A4")).toEqual({
      engine: "Naver",
      query: "코덱스",
    });
    expect(extractSearchQueryFromHistoryUrl("https://example.com/article")).toBeNull();
  });

  test("formats history context with decoded search queries before regular pages", () => {
    const summary = createHistoryContextSummary([
      {
        title: "Regular article",
        url: "https://example.com/article",
        lastVisitTime: Date.UTC(2026, 3, 25, 1, 2, 3),
        visitCount: 2,
      },
      {
        title: "codex app server - Google Search",
        url: "https://www.google.com/search?q=codex+app+server",
        lastVisitTime: Date.UTC(2026, 3, 25, 2, 3, 4),
        visitCount: 1,
      },
    ]);

    expect(summary.split("\n")[0]).toContain('Search (Google): "codex app server"');
    expect(summary).toContain("Page: Regular article");
    expect(summary).toContain("2026-04-25T02:03:04.000Z");
  });
});
