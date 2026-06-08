import { describe, expect, test } from "vitest";

import {
  createRawCaptureForReadStrategy,
  createEffectivePromptRoutePlan,
  filterSuppressedPageContextRequests,
  ensureDefaultCurrentPageContextRequests,
  isCurrentPageAttachment,
  sanitizeUnavailableCurrentPageAttachments,
  shouldSuppressDefaultCurrentPageContextForHistory,
  shouldAttachVisualAssetsForReadStrategy,
} from "../src/page-context.js";

describe("page context helpers", () => {
  test("detects attachments that depend on the current page", () => {
    expect(isCurrentPageAttachment("current-page")).toBe(true);
    expect(isCurrentPageAttachment("selection")).toBe(true);
    expect(isCurrentPageAttachment("image")).toBe(true);
    expect(isCurrentPageAttachment("open-tabs")).toBe(false);
  });

  test("removes current-page-derived attachments when the page is unavailable", () => {
    expect(
      sanitizeUnavailableCurrentPageAttachments(
        ["current-page", "selection", "image", "open-tabs", "history"],
        {
          available: false,
          blockedReason: "restricted",
        },
      ),
    ).toEqual(["open-tabs", "history"]);
  });

  test("preserves attachments when the page is available", () => {
    expect(
      sanitizeUnavailableCurrentPageAttachments(
        ["current-page", "image", "open-tabs"],
        {
          available: true,
          blockedReason: "",
        },
      ),
    ).toEqual(["current-page", "image", "open-tabs"]);
  });

  test("adds current-page as the baseline context for every normal prompt", () => {
    expect(
      ensureDefaultCurrentPageContextRequests([], {
        available: true,
        blockedReason: "",
      }),
    ).toEqual([
      {
        source: "current-page",
        readStrategy: "auto",
        required: true,
        reason: "Default browser assistant context: the currently viewed page.",
      },
    ]);
  });

  test("keeps current-page as baseline while preserving extra tab context", () => {
    expect(
      ensureDefaultCurrentPageContextRequests(
        [
          {
            source: "open-tabs",
            readStrategy: "auto",
            required: true,
            reason: "Compare selected tabs.",
          },
        ],
        {
          available: true,
          blockedReason: "",
        },
      ).map((request) => request.source),
    ).toEqual(["current-page", "open-tabs"]);
  });

  test("does not add current-page baseline when the active page is restricted", () => {
    expect(
      ensureDefaultCurrentPageContextRequests([], {
        available: false,
        blockedReason: "restricted",
      }),
    ).toEqual([]);
  });

  test("can suppress default current-page baseline for uploaded-file-only workflows", () => {
    expect(
      ensureDefaultCurrentPageContextRequests(
        [],
        {
          available: true,
          blockedReason: "",
        },
        { suppressDefault: true },
      ),
    ).toEqual([]);
  });

  test("suppresses default current-page context for browser history analysis", () => {
    const routePlan = {
      task: "general" as const,
      contextMode: "page-only" as const,
      requiresVision: false,
      pageReadStrategy: "auto" as const,
      intent: {
        summary: "Analyze browser history.",
        action: "answer" as const,
        target: "browser-history" as const,
        constraints: [],
        needsClarification: false,
      },
      selectedProfileId: "research-assistant",
      selectedModel: "fast",
      notes: [],
      reroutedProfile: false,
      reroutedModel: false,
    };

    expect(shouldSuppressDefaultCurrentPageContextForHistory(routePlan, [{ source: "history", readStrategy: "auto", required: true, reason: "History" }])).toBe(true);
    expect(
      ensureDefaultCurrentPageContextRequests(
        [{ source: "history", readStrategy: "auto", required: true, reason: "History" }],
        {
          available: true,
          blockedReason: "",
        },
        { suppressDefault: shouldSuppressDefaultCurrentPageContextForHistory(routePlan, [{ source: "history", readStrategy: "auto", required: true, reason: "History" }]) },
      ).map((request) => request.source),
    ).toEqual(["history"]);
  });

  test("can suppress all current page context after the user removes the current tab chip", () => {
    expect(
      filterSuppressedPageContextRequests([
        {
          source: "current-page",
          readStrategy: "dom",
          required: true,
          reason: "Read page",
        },
        {
          source: "image",
          readStrategy: "vision",
          required: true,
          reason: "Read visible image",
        },
        {
          source: "open-tabs",
          readStrategy: "auto",
          required: true,
          reason: "Compare tabs",
        },
      ]),
    ).toEqual([
      {
        source: "open-tabs",
        readStrategy: "auto",
        required: true,
        reason: "Compare tabs",
      },
    ]);
  });

  test("suppresses default page context while preserving explicit page attachments", () => {
    expect(
      filterSuppressedPageContextRequests(
        [
          {
            source: "current-page",
            readStrategy: "dom",
            required: true,
            reason: "User explicitly attached current page.",
          },
          {
            source: "image",
            readStrategy: "vision",
            required: true,
            reason: "User explicitly attached visible image.",
          },
          {
            source: "selection",
            readStrategy: "dom",
            required: true,
            reason: "User explicitly attached a selection.",
          },
          {
            source: "open-tabs",
            readStrategy: "auto",
            required: true,
            reason: "Compare tabs.",
          },
        ],
        ["current-page", "image", "selection"],
      ).map((request) => request.source),
    ).toEqual(["current-page", "image", "selection", "open-tabs"]);
  });

  test("updates the route plan context mode when baseline page context is attached", () => {
    expect(
      createEffectivePromptRoutePlan(
        {
          task: "general",
          contextMode: "none",
          requiresVision: false,
          pageReadStrategy: "auto",
          intent: {
            summary: "현재 페이지 설명",
            action: "answer",
            target: "conversation",
            constraints: [],
            needsClarification: false,
          },
          selectedProfileId: "research-assistant",
          selectedModel: "fast",
          notes: [],
          reroutedProfile: false,
          reroutedModel: false,
        },
        [
          {
            source: "current-page",
            readStrategy: "auto",
            required: true,
            reason: "Default browser assistant context: the currently viewed page.",
          },
        ],
        false,
      ).contextMode,
    ).toBe("page-only");
  });

  test("attaches visual assets only for vision-capable read strategies", () => {
    expect(shouldAttachVisualAssetsForReadStrategy("adapter")).toBe(false);
    expect(shouldAttachVisualAssetsForReadStrategy("dom")).toBe(false);
    expect(shouldAttachVisualAssetsForReadStrategy("hybrid")).toBe(true);
    expect(shouldAttachVisualAssetsForReadStrategy("vision")).toBe(true);
  });

  test("removes screenshot and page images from adapter contexts before prompt submission", () => {
    const rawCapture = {
      metadata: {
        url: "https://www.youtube.com/watch?v=abc",
        title: "Video",
        domain: "www.youtube.com",
      },
      selectedText: "",
      bodyText: "video text",
      images: [
        {
          url: "blob:https://www.youtube.com/invalid-image",
        },
      ],
      screenshotRef: "data:image/png;base64,abc",
      adapterPayload: {
        platform: "youtube",
        title: "Video",
      },
      privacyFlags: {
        containsSensitiveFormData: false,
        userConsentedToHistory: false,
      },
    };

    expect(createRawCaptureForReadStrategy(rawCapture, "adapter", "data:image/png;base64,abc")).toEqual({
      metadata: rawCapture.metadata,
      selectedText: "",
      bodyText: "video text",
      images: [],
      adapterPayload: rawCapture.adapterPayload,
      privacyFlags: rawCapture.privacyFlags,
    });
  });
});
