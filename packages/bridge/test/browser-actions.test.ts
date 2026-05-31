import { describe, expect, test } from "vitest";

import { createBrowserDomActionPlanPrompt, normalizeBrowserDomActionPlan } from "../src/browser-actions.js";

const snapshot = {
  metadata: {
    url: "https://example.com",
    title: "Example",
    domain: "example.com",
  },
  elements: [
    {
      ref: "dom-1",
      role: "button",
      tagName: "button",
      label: "Search",
      text: "Search",
      selector: "button:nth-of-type(1)",
      disabled: false,
      viewportRect: {
        left: 10,
        top: 20,
        width: 90,
        height: 32,
      },
    },
  ],
};

describe("browser action planner", () => {
  test("builds a constrained DOM-action prompt without arbitrary script instructions", () => {
    const prompt = createBrowserDomActionPlanPrompt({
      message: "검색 버튼 눌러줘",
      snapshot,
      locale: "ko-KR",
    });

    expect(prompt).toContain("Do not write JavaScript");
    expect(prompt).toContain('"ref": "dom-1"');
    expect(prompt).toContain("click | fill | select | scroll | focus | submit | navigate");
  });

  test("allows explicit same-tab URL navigation without an element target", () => {
    const plan = normalizeBrowserDomActionPlan(
      {
        shouldAct: true,
        summary: "Open the requested URL.",
        steps: [
          {
            action: "navigate",
            url: "openai.com/research",
            reason: "User asked to move the current page to this address.",
          },
        ],
        confidence: 0.9,
      },
      snapshot,
    );

    expect(plan.shouldAct).toBe(true);
    expect(plan.steps).toEqual([
      {
        action: "navigate",
        url: "https://openai.com/research",
        reason: "User asked to move the current page to this address.",
      },
    ]);
  });

  test("only blocks payment and purchase flows instead of all site mutations", () => {
    const prompt = createBrowserDomActionPlanPrompt({
      message: "답장을 보내줘",
      snapshot,
      locale: "ko-KR",
    });

    expect(prompt).toContain("purchases, payments, checkout");
    expect(prompt).toContain("sending messages, emails");
    expect(prompt).not.toContain("sending messages/emails");
    expect(prompt).not.toContain("posting public content, or irreversible actions");
    expect(prompt).not.toContain("confirmation in the site UI is required");
  });

  test("allows proxy composer controls to reveal an editor before filling", () => {
    const prompt = createBrowserDomActionPlanPrompt({
      message: "새 게시물에 오늘 일정 공유해줘",
      snapshot: {
        ...snapshot,
        elements: [
          {
            ...snapshot.elements[0],
            label: "새 게시물",
            text: "새 게시물",
            isTextEntryCandidate: false,
            opensEditableSurface: true,
            ariaHasPopup: "dialog",
          },
        ],
      },
      locale: "ko-KR",
    });

    expect(prompt).toContain("proxy composer");
    expect(prompt).toContain("click/focus on that opener before fill");
    expect(prompt).toContain("runtime will resolve the newly visible editor");
    expect(prompt).toContain("isTextEntryCandidate");
    expect(prompt).toContain("opensEditableSurface");
  });

  test("passes generated content through as the exact fill value for deferred browser actions", () => {
    const prompt = createBrowserDomActionPlanPrompt({
      message: "Research recent AI news and enter a draft post about it on X, but do not publish it.",
      snapshot,
      locale: "en-US",
      generatedText: "AI news draft\nDo not publish.",
    });

    expect(prompt).toContain("Generated content policy:");
    expect(prompt).toContain("Use generatedText as the exact fill value");
    expect(prompt).toContain('"generatedText": "AI news draft\\nDo not publish."');
  });

  test("drops unsafe or invented DOM targets from action plans", () => {
    const plan = normalizeBrowserDomActionPlan(
      {
        shouldAct: true,
        summary: "Click search.",
        steps: [
          {
            action: "click",
            targetRef: "dom-1",
            reason: "User requested it.",
          },
          {
            action: "click",
            targetRef: "invented",
            selector: "script",
            reason: "Unsafe.",
          },
        ],
        confidence: 0.9,
      },
      snapshot,
    );

    expect(plan.shouldAct).toBe(true);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ action: "click", targetRef: "dom-1" });
  });
});
