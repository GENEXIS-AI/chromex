import { describe, expect, test } from "vitest";

import { shouldRouteRealtimeVoiceTranscriptThroughPrompt } from "../src/sidepanel/voice-agentic-routing.js";
import type { AgenticRoutePlan } from "@codex-sidepanel/shared";

const basePlan: AgenticRoutePlan = {
  version: 1,
  source: "llm",
  task: "general",
  contextMode: "page-only",
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
  selectedProfileId: "default",
  selectedModel: "gpt-5.5",
  imageEdit: {
    shouldEdit: false,
    target: "none",
    reason: "No image operation.",
  },
  browserControl: {
    shouldControl: false,
    mode: "dom",
    surface: "active-tab",
    reason: "No browser control.",
  },
  notes: [],
  confidence: 0.8,
};

describe("live voice agentic routing", () => {
  test("routes only planner-confirmed image edits through the prompt workflow", () => {
    expect(
      shouldRouteRealtimeVoiceTranscriptThroughPrompt({
        ...basePlan,
        task: "image-edit",
        intent: {
          ...basePlan.intent,
          action: "edit-image",
          target: "visible-image",
        },
        imageEdit: {
          shouldEdit: true,
          target: "page-image",
          prompt: "Edit the visible image.",
          reason: "The planner selected the current page image.",
        },
      }),
    ).toBe(true);
  });

  test("routes planner-confirmed image generation through the prompt workflow", () => {
    expect(
      shouldRouteRealtimeVoiceTranscriptThroughPrompt({
        ...basePlan,
        task: "image-generate",
        intent: {
          ...basePlan.intent,
          action: "generate-image",
        },
      }),
    ).toBe(true);
  });

  test("does not route visual analysis or stale image plans as image work", () => {
    expect(
      shouldRouteRealtimeVoiceTranscriptThroughPrompt({
        ...basePlan,
        task: "visual-analysis",
        intent: {
          ...basePlan.intent,
          action: "answer",
          target: "visible-image",
        },
      }),
    ).toBe(false);

    expect(
      shouldRouteRealtimeVoiceTranscriptThroughPrompt({
        ...basePlan,
        task: "image-edit",
        intent: {
          ...basePlan.intent,
          action: "summarize",
          target: "current-page",
        },
        imageEdit: {
          shouldEdit: true,
          target: "page-image",
          reason: "Stale image edit plan leaked from an older turn.",
        },
      }),
    ).toBe(false);
  });
});
