import { describe, expect, test } from "vitest";

import { isTextFirstActionCard } from "../src/sidepanel/action-card-routing.js";
import {
  IMAGE_ATTACHMENT_DESCRIBE_ACTION_ID,
  IMAGE_ATTACHMENT_PROMPT_EXTRACT_ACTION_ID,
  isImageAttachmentSuggestionActionId,
} from "../src/sidepanel/image-attachment-suggestions.js";

describe("action card routing", () => {
  test("keeps image attachment suggestions attached to the outgoing chat message", () => {
    expect(isImageAttachmentSuggestionActionId(IMAGE_ATTACHMENT_PROMPT_EXTRACT_ACTION_ID)).toBe(true);
    expect(isImageAttachmentSuggestionActionId(IMAGE_ATTACHMENT_DESCRIBE_ACTION_ID)).toBe(true);
    expect(
      isTextFirstActionCard({
        id: IMAGE_ATTACHMENT_PROMPT_EXTRACT_ACTION_ID,
        title: "Extract image prompt",
        description: "",
        kind: "prompt",
        prompt: "Describe the attached image as a reusable image prompt.",
      }),
    ).toBe(false);
    expect(
      isTextFirstActionCard({
        id: IMAGE_ATTACHMENT_DESCRIBE_ACTION_ID,
        title: "Describe image",
        description: "",
        kind: "prompt",
        prompt: "Describe the attached image.",
      }),
    ).toBe(false);
  });

  test("still clears visual context for ordinary text-first prompt cards", () => {
    expect(
      isTextFirstActionCard({
        id: "summarize-page",
        title: "Summarize",
        description: "",
        kind: "prompt",
        prompt: "Summarize the current page.",
      }),
    ).toBe(true);
  });

  test("keeps selected-text fact-check suggestions attached to the outgoing chat message", () => {
    expect(
      isTextFirstActionCard({
        id: "selection-fact-check",
        title: "Fact-check",
        description: "",
        kind: "prompt",
        prompt: "Fact-check the selected text.",
      }),
    ).toBe(false);
  });
});
