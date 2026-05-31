import { describe, expect, test } from "vitest";

import { composeBodyText, removeNonContentNodes } from "../src/content/dom-text.js";

describe("composeBodyText", () => {
  test("prioritizes app content over leading navigation chrome", () => {
    const result = composeBodyText(
      [
        {
          key: "body",
          priority: 1,
          text: `${"Inbox Starred Snoozed Sent Drafts ".repeat(220)} Important footer text`,
        },
        {
          key: "gmail-message",
          priority: 140,
          text: "Project launch update: please review the contract by Friday and send approval notes.",
          visibleArea: 90_000,
          viewportArea: 80_000,
        },
      ],
      500,
    );

    expect(result.startsWith("Project launch update")).toBe(true);
    expect(result).toContain("contract by Friday");
  });

  test("prioritizes editable work app content over sidebar chrome", () => {
    const result = composeBodyText(
      [
        {
          key: "sidebar",
          priority: 1,
          text: `${"Home Inbox Projects Templates Settings ".repeat(200)} Footer shortcuts`,
        },
        {
          key: "work-app-editor",
          priority: 130,
          text: "Decision: move launch to Wednesday. Owner: Mina. Blocker: legal review is still pending.",
          visibleArea: 120_000,
          viewportArea: 90_000,
        },
      ],
      600,
    );

    expect(result.startsWith("Decision: move launch")).toBe(true);
    expect(result).toContain("legal review");
  });

  test("dedupes nested content candidates before truncating", () => {
    const message = "Quarterly planning email body with roadmap, budget, staffing, and approval questions.";
    const result = composeBodyText(
      [
        { key: "role-listitem", priority: 80, text: message },
        { key: "message-body", priority: 120, text: message },
      ],
      1000,
    );

    expect(result.match(/Quarterly planning/g)).toHaveLength(1);
  });

  test("keeps long DOM context up to the transport capture limit", () => {
    const longArticle = Array.from({ length: 4200 }, (_, index) => `Paragraph ${index} explains a different detail.`).join(" ");
    const result = composeBodyText(
      [
        {
          key: "article",
          priority: 120,
          text: longArticle,
        },
      ],
    );

    expect(result.length).toBeGreaterThan(90_000);
    expect(result.length).toBeLessThanOrEqual(240_000);
  });

  test("removes non-content nodes before text extraction", () => {
    const removedSelectors: string[] = [];
    const root = {
      querySelectorAll(selector: string) {
        if (["script", "style", "nav", "aside", "footer", "button", '[aria-hidden="true"]'].includes(selector)) {
          return [
            {
              remove: () => removedSelectors.push(selector),
            },
          ];
        }
        return [];
      },
    } as unknown as HTMLElement;

    removeNonContentNodes(root);

    expect(removedSelectors).toEqual([
      "script",
      "style",
      "nav",
      "footer",
      "aside",
      "button",
      '[aria-hidden="true"]',
    ]);
  });
});
