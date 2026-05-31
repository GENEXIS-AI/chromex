import { describe, expect, test, vi } from "vitest";

import { createCodexTurnInput, createCodexTurnInputItems } from "../src/index.js";
import type { PageContextEnvelope, ProfileTemplate } from "@codex-sidepanel/shared";

const profile: ProfileTemplate = {
  id: "research-assistant",
  name: "Research Assistant",
  systemPrompt: "Answer precisely.",
  defaultContextPolicy: {
    attachCurrentPageByDefault: true,
    allowedReadStrategies: ["dom", "hybrid"],
  },
  allowedSources: ["current-page", "open-tabs"],
  preferredActions: ["summarize-page"],
  adapterHints: [],
};

const defaultProfile: ProfileTemplate = {
  ...profile,
  id: "default",
  name: "Default",
  systemPrompt: "",
};

const baseContext: PageContextEnvelope = {
  metadata: {
    url: "https://example.com/article",
    title: "Example Article",
    domain: "example.com",
  },
  selectionText: "Selected paragraph",
  domSummary: "A compact article summary.",
  visionAssets: [],
  adapterPayload: null,
  privacyFlags: {
    containsSensitiveFormData: false,
    userConsentedToHistory: false,
  },
};

describe("createCodexTurnInput", () => {
  test("formats profile prompt and normalized page context for app-server", () => {
    const result = createCodexTurnInput({
      profile,
      message: "Summarize this for me.",
      contexts: [baseContext],
    });

    expect(result).toContain("PRIVATE INSTRUCTION PROFILE");
    expect(result).toContain("PRIVATE ASSISTANT BEHAVIOR");
    expect(result).toContain("Do not narrate internal setup");
    expect(result).toContain("When the user asks to convert attached images into a PDF");
    expect(result).toContain("renderable preview");
    expect(result).toContain("parallel");
    expect(result).toContain("Do not parallelize image edits");
    expect(result).toContain("When the user asks to fact-check");
    expect(result).toContain("use available web/search/read-only tools");
    expect(result).toContain("PRIVATE PROFILE QUESTION TOOL - DO NOT MENTION");
    expect(result).toContain("<chromex_ask_user_question>");
    expect(result).toContain("Answer precisely.");
    expect(result).toContain("PRIVATE PAGE CONTEXT 1");
    expect(result).toContain("Example Article");
    expect(result).toContain("Selected paragraph");
    expect(result).toContain("Summarize this for me.");
  });

  test("passes hidden conversation transcript context into the Codex turn", () => {
    const result = createCodexTurnInput({
      profile: defaultProfile,
      message: "지금까지 내용 요약해줘.",
      contexts: [],
      conversationContext: "Live transcript source context:\n1. Original: The model can translate live audio.",
    } as never);

    expect(result).toContain("PRIVATE CONVERSATION CONTEXT - DO NOT DISPLAY VERBATIM");
    expect(result).toContain("Live transcript source context:");
    expect(result).toContain("Original: The model can translate live audio.");
  });

  test("does not enable profile question tool for the default profile", () => {
    const result = createCodexTurnInput({
      profile: defaultProfile,
      message: "Summarize this for me.",
      contexts: [baseContext],
    });

    expect(result).not.toContain("PRIVATE PROFILE QUESTION TOOL");
    expect(result).not.toContain("chromex_ask_user_question");
  });

  test("summarizes vision assets without inlining raw data urls", () => {
    const result = createCodexTurnInput({
      profile,
      message: "Explain the screenshot.",
      contexts: [
        {
          ...baseContext,
          visionAssets: [
            { ref: "data:image/png;base64,ZmFrZQ==", kind: "screenshot" },
            { ref: "https://example.com/image.png", kind: "page-image" },
          ],
        },
      ],
    });

    expect(result).toContain("Attached Visual Evidence: 2 attached");
    expect(result).not.toContain("data:image/png;base64");
  });

  test("includes routing plans and parsed file sections in the text prompt", () => {
    const result = createCodexTurnInput(
      {
        profile,
        message: "Compare the current page to the attached PDF.",
        contexts: [baseContext],
        routePlan: {
          task: "comparison",
          contextMode: "page-plus-files",
          requiresVision: true,
          pageReadStrategy: "hybrid",
          intent: {
            summary: "Compare the current page against the attached PDF.",
            action: "compare",
            target: "current-page",
            constraints: ["Prefer attachment facts when conflicting."],
            needsClarification: false,
          },
          selectedProfileId: "research-assistant",
          selectedModel: "vision-model",
          notes: ["Prefer uploaded files when the user refers to an attachment."],
          reroutedProfile: false,
          reroutedModel: true,
        },
      },
      {
        fileSections: ["ATTACHED FILE 1\nName: brief.pdf\nExtracted Content:\nLine 1"],
      },
    );

    expect(result).toContain("PRIVATE ROUTING CONTEXT");
    expect(result).toContain("Task: comparison");
    expect(result).toContain("User Intent: Compare the current page against the attached PDF.");
    expect(result).toContain("Intent Action: compare");
    expect(result).toContain("Intent Target: current-page");
    expect(result).toContain("Intent Constraints: Prefer attachment facts when conflicting.");
    expect(result).toContain("ATTACHED FILE 1");
    expect(result).toContain("Prefer uploaded files");
  });

  test("uses private context labels that discourage leaking DOM or routing internals", () => {
    const result = createCodexTurnInput({
      profile,
      message: "현재 화면 설명해줘.",
      contexts: [baseContext],
      routePlan: {
        task: "visual-analysis",
        contextMode: "current-page",
        requiresVision: true,
        pageReadStrategy: "hybrid",
        selectedProfileId: "research-assistant",
        selectedModel: "gpt-5.4",
        notes: [],
        reroutedProfile: false,
        reroutedModel: false,
      },
    });

    expect(result).toContain("Never mention internal implementation details");
    expect(result).toContain("PRIVATE PAGE CONTEXT 1");
    expect(result).toContain("Page Text Summary:");
    expect(result).toContain("Attached Visual Evidence:");
    expect(result).not.toContain("DOM Summary:");
    expect(result).not.toContain("Vision Assets:");
    expect(result).not.toContain("vision mode");
    expect(result).not.toContain("\nROUTING PLAN\n");
  });

  test("instructs current scene requests to use YouTube playback time from adapter data", () => {
    const result = createCodexTurnInput({
      profile,
      message: "현재 장면 설명해줘.",
      contexts: [
        {
          ...baseContext,
          metadata: {
            url: "https://www.youtube.com/watch?v=abc",
            title: "Demo - YouTube",
            domain: "www.youtube.com",
          },
          adapterPayload: {
            platform: "youtube",
            title: "Demo",
            currentTimeSeconds: 184,
          },
        },
      ],
    });

    expect(result).toContain("currentTimeSeconds");
    expect(result).toContain("exact playback position");
    expect(result).toContain('"currentTimeSeconds":184');
  });
});

describe("createCodexTurnInputItems", () => {
  test("emits text plus remote and inline image inputs", async () => {
    const materializeInlineImage = vi.fn(async () => "/tmp/codex-sidepanel-image.png");

    const result = await createCodexTurnInputItems(
      {
        profile,
        message: "Explain the visuals.",
        contexts: [
          {
            ...baseContext,
            visionAssets: [
              { ref: "data:image/png;base64,ZmFrZQ==", kind: "screenshot" },
              { ref: "https://example.com/image.png", kind: "page-image" },
            ],
          },
        ],
      },
      materializeInlineImage,
    );

    expect(materializeInlineImage).toHaveBeenCalledOnce();
    expect(result).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "localImage", path: "/tmp/codex-sidepanel-image.png" },
      { type: "image", url: "https://example.com/image.png" },
    ]);
  });

  test("prefixes missing structured skill tokens into the text input", async () => {
    const result = await createCodexTurnInputItems(
      {
        profile,
        message: "Edit the attached image.",
        contexts: [baseContext],
        structuredInputs: [
          {
            id: "skill:imagegen",
            type: "skill",
            name: "imagegen",
            path: "/Users/example/.codex/skills/imagegen/SKILL.md",
            description: "Generate or edit images.",
            token: "$imagegen",
          },
        ],
      },
      vi.fn(),
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("USER REQUEST\n$imagegen Edit the attached image."),
      }),
    );
    expect(result[1]).toEqual({
      type: "skill",
      name: "imagegen",
      path: "/Users/example/.codex/skills/imagegen/SKILL.md",
    });
  });

  test("appends uploaded images before page-context captures", async () => {
    const materializeInlineImage = vi.fn(async (_ref: string, contextIndex: number, assetIndex: number) =>
      `/tmp/${contextIndex}-${assetIndex}.png`,
    );

    const result = await createCodexTurnInputItems(
      {
        profile,
        message: "Review these visuals.",
        contexts: [
          {
            ...baseContext,
            visionAssets: [{ ref: "data:image/png;base64,ZmFrZQ==", kind: "screenshot" }],
          },
        ],
      },
      materializeInlineImage,
      {
        uploadedImages: [{ name: "upload.png", ref: "data:image/png;base64,ZmFrZQ==" }],
      },
    );

    expect(result.slice(1)).toEqual([
      { type: "localImage", path: "/tmp/-1-0.png" },
      { type: "localImage", path: "/tmp/0-0.png" },
    ]);
  });
});
