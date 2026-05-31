import { describe, expect, test } from "vitest";

import type { AgenticRoutePlan } from "@codex-sidepanel/shared";
import {
  buildDeferredBrowserActionMessage,
  extractDeferredBrowserActionText,
  shouldResumeDeferredBrowserDomAction,
} from "../src/background/deferred-browser-action.js";

const basePlan: AgenticRoutePlan = {
  version: 1,
  source: "llm",
  task: "general",
  contextMode: "none",
  contextRequests: [],
  historyQuery: "",
  requiresVision: false,
  pageReadStrategy: "auto",
  intent: {
    summary: "Answer the user.",
    action: "answer",
    target: "conversation",
    constraints: [],
    needsClarification: false,
  },
  selectedProfileId: "research-assistant",
  selectedModel: "fast-text",
  imageEdit: {
    shouldEdit: false,
    target: "none",
    reason: "No image edit route.",
  },
  browserControl: {
    shouldControl: false,
    mode: "dom",
    surface: "active-tab",
    reason: "No browser control.",
  },
  notes: [],
  confidence: 0.7,
};

describe("deferred browser actions", () => {
  test("resumes deferred current-page DOM actions after upstream agent work", () => {
    expect(
      shouldResumeDeferredBrowserDomAction({
        ...basePlan,
        intent: {
          ...basePlan.intent,
          action: "navigate",
          target: "current-page",
        },
        browserControl: {
          shouldControl: false,
          mode: "dom",
          surface: "active-tab",
          preconditions: ["external-research", "content-generation"],
          reason: "Defer until the draft is ready.",
        },
      }),
    ).toBe(true);
  });

  test("does not resume direct or non-DOM browser actions through the deferred path", () => {
    expect(
      shouldResumeDeferredBrowserDomAction({
        ...basePlan,
        intent: {
          ...basePlan.intent,
          action: "navigate",
          target: "current-page",
        },
        browserControl: {
          shouldControl: true,
          mode: "dom",
          surface: "active-tab",
          reason: "Run immediately.",
        },
      }),
    ).toBe(false);

    expect(
      shouldResumeDeferredBrowserDomAction({
        ...basePlan,
        intent: {
          ...basePlan.intent,
          action: "navigate",
          target: "current-page",
        },
        browserControl: {
          shouldControl: false,
          mode: "playwright",
          surface: "new-tab",
          preconditions: ["external-research"],
          reason: "Do not run through DOM.",
        },
      }),
    ).toBe(false);
  });

  test("extracts the draft body from formatted assistant output instead of filling instructions around it", () => {
    const assistantText = [
      "아래 초안으로 X 작성창에 그대로 넣으면 됩니다.",
      "",
      "`AI 뉴스 요약: 2026-04-28 기준",
      "",
      "OpenAI와 Anthropic 경쟁이 다시 빨라지고 있습니다.`",
    ].join("\n");

    expect(extractDeferredBrowserActionText(assistantText)).toBe(
      "AI 뉴스 요약: 2026-04-28 기준\n\nOpenAI와 Anthropic 경쟁이 다시 빨라지고 있습니다.",
    );
  });

  test("passes the original request and extracted generated content to the DOM planner", () => {
    expect(
      buildDeferredBrowserActionMessage({
        originalMessage: "Use Playwright to research recent AI news and enter a draft post about it on X, but do not publish it.",
        generatedText: "AI news draft",
      }),
    ).toContain("Use the generated content as the text to enter into the current page");
  });
});
