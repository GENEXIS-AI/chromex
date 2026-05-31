import { describe, expect, test } from "vitest";

import { formatTabMentionUrl, listTabMentionOptions, toggleSelectedTabId } from "../src/sidepanel/tab-mentions.js";

const tabs = [
  {
    tabId: 1,
    title: "ChatGPT - Google Workspace",
    url: "https://chatgpt.com/g/g-123",
    pinned: false,
    audible: false,
  },
  {
    tabId: 2,
    title: "활동 • Threads",
    url: "https://www.threads.net/activity",
    pinned: false,
    audible: false,
  },
  {
    tabId: 3,
    title: "AI 접근성과 개발자 진입장벽",
    url: "https://example.org/posts/accessibility",
    pinned: false,
    audible: false,
  },
];

describe("tab mention helpers", () => {
  test("lists recent tabs when the @ query is empty", () => {
    expect(listTabMentionOptions(tabs, "").map((tab) => tab.tabId)).toEqual([1, 2, 3]);
  });

  test("filters recent tabs by title or URL", () => {
    expect(listTabMentionOptions(tabs, "thread").map((tab) => tab.tabId)).toEqual([2]);
    expect(listTabMentionOptions(tabs, "chatgpt").map((tab) => tab.tabId)).toEqual([1]);
    expect(listTabMentionOptions(tabs, "접근성").map((tab) => tab.tabId)).toEqual([3]);
  });

  test("formats tab URLs as compact origins", () => {
    expect(formatTabMentionUrl("https://chatgpt.com/g/g-123")).toBe("chatgpt.com");
    expect(formatTabMentionUrl("chrome://extensions")).toBe("chrome://extensions");
  });

  test("toggles selected tab ids without duplicates and keeps the newest ten", () => {
    expect(toggleSelectedTabId([1, 2], 2)).toEqual([1]);
    expect(toggleSelectedTabId([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleSelectedTabId([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 11)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
