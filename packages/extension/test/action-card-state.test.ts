import { describe, expect, test } from "vitest";
import type { ActionCard } from "@codex-sidepanel/shared";

import { mergePromptResultActionCards } from "../src/sidepanel/action-card-state.js";

describe("action card state", () => {
  test("keeps existing site suggestions when a prompt result returns only a partial card set", () => {
    const cards = mergePromptResultActionCards(
      [
        actionCard("youtube-summary-question"),
        actionCard("youtube-current-moment-question"),
        actionCard("youtube-chapter-notes-question"),
      ],
      [actionCard("summarize-video")],
    );

    expect(cards.map((card) => card.id)).toEqual([
      "summarize-video",
      "youtube-summary-question",
      "youtube-current-moment-question",
      "youtube-chapter-notes-question",
    ]);
  });

  test("deduplicates incoming and existing prompt result cards", () => {
    const cards = mergePromptResultActionCards(
      [actionCard("youtube-summary-question"), actionCard("youtube-current-moment-question")],
      [actionCard("youtube-summary-question"), actionCard("draft-blog-post")],
    );

    expect(cards.map((card) => card.id)).toEqual([
      "youtube-summary-question",
      "draft-blog-post",
      "youtube-current-moment-question",
    ]);
  });
});

function actionCard(id: string): ActionCard {
  return {
    id,
    title: id,
    description: "",
    kind: "prompt",
    prompt: `${id} prompt`,
  };
}
