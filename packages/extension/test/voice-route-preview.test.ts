import { describe, expect, test } from "vitest";

import { extractRealtimeVoiceHandoffPrompt } from "../src/sidepanel/voice-handoff.js";
import {
  createVoiceRoutePreviewPayload,
  sanitizeVoiceRoutePreviewFileAttachments,
} from "../src/sidepanel/voice-route-preview.js";
import type { PromptRequestPayload } from "../src/types.js";

describe("voice route preview helpers", () => {
  test("extracts handoff prompts only from explicit realtime handoff items", () => {
    expect(extractRealtimeVoiceHandoffPrompt(undefined)).toBe("");
    expect(extractRealtimeVoiceHandoffPrompt({ type: "message", prompt: "edit this image" })).toBe("");
    expect(extractRealtimeVoiceHandoffPrompt({ type: "handoff_request", prompt: " edit this image " })).toBe(
      "edit this image",
    );
    expect(
      extractRealtimeVoiceHandoffPrompt({
        kind: "handoff_request",
        content: [{ text: "use the visible page" }, { input: "and edit the image" }],
      }),
    ).toBe("use the visible page\nand edit the image");
  });

  test("removes file bytes from route previews while preserving attachment metadata", () => {
    expect(
      sanitizeVoiceRoutePreviewFileAttachments([
        {
          id: "file-1",
          name: "reference.png",
          mimeType: "image/png",
          sizeBytes: 24,
          lastModified: 1,
          base64: "raw-bytes",
          kind: "image",
        },
      ]),
    ).toEqual([
      {
        id: "file-1",
        name: "reference.png",
        mimeType: "image/png",
        sizeBytes: 24,
        lastModified: 1,
        base64: "",
        kind: "image",
      },
    ]);
  });

  test("builds prompt route previews without leaking audio or file bytes", () => {
    const payload = createVoiceRoutePreviewPayload({
      message: "make this into an infographic",
      contextHint: "Current page: article",
      profileId: "default",
      model: "gpt-5.5",
      selectedReasoningEffort: "high",
      selectedServiceTier: "flex",
      readStrategyOverride: "hybrid",
      attachments: ["current-page", "image"],
      fileAttachments: [
        {
          id: "image-1",
          name: "screen.png",
          mimeType: "image/png",
          sizeBytes: 128,
          lastModified: 2,
          base64: "image-bytes",
          kind: "image",
        },
      ],
      structuredInputs: [{ id: "tab-1", type: "tab", title: "Example", url: "https://example.com" }],
      selectedTabIds: [123],
      historyQuery: "last week",
      suppressPageContext: true,
      conversationMessageCount: 7,
      conversationId: "conversation-1",
    });

    expect(payload satisfies PromptRequestPayload).toMatchObject({
      conversationId: "conversation-1",
      message: "make this into an infographic",
      contextHint: "Current page: article",
      profileId: "default",
      model: "gpt-5.5",
      reasoningEffort: "high",
      serviceTier: "flex",
      readStrategyOverride: "hybrid",
      attachments: ["current-page", "image"],
      structuredInputs: [{ id: "tab-1", type: "tab", title: "Example", url: "https://example.com" }],
      selectedTabIds: [123],
      historyQuery: "last week",
      suppressPageContext: true,
      conversationMessageCount: 7,
      fileAttachments: [
        {
          id: "image-1",
          name: "screen.png",
          base64: "",
        },
      ],
    });
  });
});
