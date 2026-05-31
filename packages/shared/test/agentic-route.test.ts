import { describe, expect, test } from "vitest";

import {
  createFallbackAgenticRoutePlan,
  normalizeAgenticRoutePlan,
  routePlanToPromptRoutingPlan,
} from "../src/index.js";
import type { AgenticRouteInput, CodexModelOption } from "../src/index.js";

const models: CodexModelOption[] = [
  {
    id: "fast-text",
    label: "Fast Text",
    description: "Text only",
    isDefault: true,
    supportsImages: false,
    reasoningEfforts: ["low"],
  },
  {
    id: "vision-model",
    label: "Vision Model",
    description: "Vision capable",
    isDefault: false,
    supportsImages: true,
    reasoningEfforts: ["medium"],
  },
];

const input: AgenticRouteInput = {
  message: "이걸 더 자연스럽게 바꿔줘",
  contextHint: "user: 현재 보고 있는 이미지 배경을 바꿔줘",
  selectedProfileId: "research-assistant",
  selectedModel: "fast-text",
  models,
  readStrategyOverride: "auto",
  explicitAttachments: [],
  fileAttachments: [],
};

describe("agentic route plan normalization", () => {
  test("preserves an explicitly selected non-default profile when the router returns default", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [],
        selectedProfileId: "default",
        intent: {
          summary: "Plan the profile-specific response.",
          action: "answer",
          target: "conversation",
          constraints: [],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "No image workflow.",
        },
      },
      input,
    );

    expect(plan.selectedProfileId).toBe("research-assistant");
  });

  test("keeps model-requested visual context without relying on keyword inference", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "image-edit",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "hybrid",
            required: true,
            reason: "The conversation indicates this is a follow-up edit to the visible page image.",
          },
          {
            source: "image",
            readStrategy: "vision",
            required: true,
            reason: "The visible image is the edit target.",
          },
        ],
        requiresVision: true,
        intent: {
          summary: "Make the currently visible page image look more natural.",
          action: "edit-image",
          target: "visible-image",
          constraints: ["Preserve the main subject."],
          needsClarification: false,
        },
        selectedProfileId: "research-assistant",
        imageEdit: {
          shouldEdit: true,
          target: "page-image",
          prompt: "Make the current page image look more natural.",
          reason: "Follow-up image-edit request.",
        },
        notes: ["Use prior conversation context."],
        confidence: 0.82,
      },
      input,
    );

    expect(plan.source).toBe("llm");
    expect(plan.task).toBe("image-edit");
    expect(plan.contextRequests.map((request) => request.source)).toEqual(["current-page", "image"]);
    expect(plan.requiresVision).toBe(true);
    expect(plan.selectedProfileId).toBe("research-assistant");
    expect(plan.selectedModel).toBe("vision-model");
    expect(plan.intent).toEqual({
      summary: "Make the currently visible page image look more natural.",
      action: "edit-image",
      target: "visible-image",
      constraints: ["Preserve the main subject."],
      needsClarification: false,
    });
    expect(plan.imageEdit).toMatchObject({
      shouldEdit: true,
      target: "page-image",
      prompt: "Make the current page image look more natural.",
    });
  });

  test("repairs incomplete model image-edit plans into a visible page image workflow", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "image-edit",
        contextRequests: [],
        requiresVision: false,
        intent: {
          summary: "Translate the text in the visible image to English.",
          action: "edit-image",
          target: "visible-image",
          constraints: ["Change text to English."],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "No explicit image attachment was provided.",
        },
        confidence: 0.64,
      },
      {
        ...input,
        message: "텍스트를 영어로 변경해줘.",
        activeTab: {
          title: "Design review",
          url: "https://example.org/design",
          restricted: false,
        },
      },
    );

    expect(plan.task).toBe("image-edit");
    expect(plan.imageEdit).toMatchObject({
      shouldEdit: true,
      target: "page-image",
      prompt: "텍스트를 영어로 변경해줘.",
    });
    expect(plan.contextRequests.map((request) => request.source)).toEqual(["current-page", "image"]);
    expect(plan.contextRequests.every((request) => request.readStrategy === "hybrid" || request.readStrategy === "vision")).toBe(true);
    expect(plan.requiresVision).toBe(true);
    expect(plan.selectedProfileId).toBe("research-assistant");
    expect(plan.selectedModel).toBe("vision-model");
  });

  test("keeps planner-authored image prompt requests out of image edit workflows", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "visual-analysis",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "hybrid",
            required: true,
            reason: "The prompt should describe the visible image.",
          },
          {
            source: "image",
            readStrategy: "vision",
            required: true,
            reason: "Need to inspect the visible image before writing a prompt.",
          },
        ],
        requiresVision: true,
        intent: {
          summary: "Write an image-generation prompt for the visible image.",
          action: "answer",
          target: "visible-image",
          constraints: ["Return prompt text only."],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "Prompt authoring does not edit the image.",
        },
        confidence: 0.7,
      },
      {
        ...input,
        message: "해당 이미지를 만들 수 있는 이미지 프롬프트를 알려줘.",
        activeTab: {
          title: "Image viewer",
          url: "https://example.org/image",
          restricted: false,
        },
      },
    );

    expect(plan.task).toBe("visual-analysis");
    expect(plan.intent.action).toBe("answer");
    expect(plan.intent.target).toBe("visible-image");
    expect(plan.imageEdit).toEqual({
      shouldEdit: false,
      target: "none",
      reason: "Prompt authoring does not edit the image.",
    });
    expect(plan.contextRequests.map((request) => request.source)).toEqual(["current-page", "image"]);
    expect(plan.requiresVision).toBe(true);
  });

  test("routes planner-selected provided-prompt image creation to image generation", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "image-generate",
        contextRequests: [],
        requiresVision: false,
        intent: {
          summary: "Generate an image from the user-provided prompt.",
          action: "generate-image",
          target: "conversation",
          constraints: [],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "No edit target.",
        },
        confidence: 0.4,
      },
      {
        ...input,
        message: "프롬프트 줄게. 파란 구름 모양의 코딩 앱 아이콘 이미지를 생성해줘.",
      },
    );

    expect(plan.task).toBe("image-generate");
    expect(plan.intent.action).toBe("generate-image");
    expect(plan.intent.target).toBe("conversation");
    expect(plan.imageEdit).toEqual({
      shouldEdit: false,
      target: "none",
      reason: "The user asked to generate a new image, not edit an existing image.",
    });
    expect(plan.requiresVision).toBe(false);
  });

  test("keeps current-page browser actions on the DOM executor even when the planner asks for playwright", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "dom",
            required: true,
            reason: "The active page contains the target control.",
          },
        ],
        intent: {
          summary: "Click the visible follow button on the current page.",
          action: "navigate",
          target: "current-page",
          constraints: [],
          needsClarification: false,
        },
        browserControl: {
          shouldControl: true,
          mode: "playwright",
          fallbackMode: "dom",
          reason: "The planner requested browser automation.",
        },
        confidence: 0.8,
      },
      {
        ...input,
        message: "현재 페이지에서 팔로우 버튼 눌러줘",
        browserAutomationCapabilities: {
          dom: true,
          playwright: true,
          "computer-use": false,
        },
        activeTab: {
          title: "Profile",
          url: "https://example.org/profile",
          restricted: false,
        },
      },
    );

    expect(plan.browserControl).toMatchObject({
      shouldControl: true,
      mode: "dom",
    });
  });

  test("does not inspect user text to defer browser control without planner preconditions", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "dom",
            required: true,
            reason: "The user wants the active X page used after drafting.",
          },
        ],
        intent: {
          summary: "Research recent AI news and enter an X draft without publishing.",
          action: "navigate",
          target: "current-page",
          constraints: ["Do not publish."],
          needsClarification: false,
        },
        browserControl: {
          shouldControl: true,
          mode: "dom",
          reason: "The current page contains the draft composer.",
        },
        confidence: 0.78,
      },
      {
        ...input,
        message: "Use Playwright to research recent AI news and enter a draft post about it on X, but do not publish it.",
        browserAutomationCapabilities: {
          dom: true,
          playwright: true,
          "computer-use": false,
        },
        activeTab: {
          title: "X",
          url: "https://x.com/home",
          restricted: false,
        },
      },
    );

    expect(plan.browserControl).toMatchObject({
      shouldControl: true,
      mode: "dom",
    });
  });

  test("defers browser control from planner-authored workflow preconditions", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "dom",
            required: true,
            reason: "The user wants the active X page used after drafting.",
          },
        ],
        intent: {
          summary: "Research recent AI news and enter an X draft without publishing.",
          action: "navigate",
          target: "current-page",
          constraints: ["Do not publish."],
          needsClarification: false,
        },
        browserControl: {
          shouldControl: true,
          mode: "dom",
          preconditions: ["external-research", "content-generation"],
          reason: "The current page contains the draft composer after upstream work completes.",
        },
        confidence: 0.78,
      },
      {
        ...input,
        message: "Use Playwright to research recent AI news and enter a draft post about it on X, but do not publish it.",
        browserAutomationCapabilities: {
          dom: true,
          playwright: true,
          "computer-use": false,
        },
        activeTab: {
          title: "X",
          url: "https://x.com/home",
          restricted: false,
        },
      },
    );

    expect(plan.browserControl.shouldControl).toBe(false);
    expect(plan.browserControl).toMatchObject({
      preconditions: ["external-research", "content-generation"],
      reason: "Browser control is deferred until the agentic workflow completes upstream preconditions.",
    });
  });

  test("keeps deferred current-page browser actions on the DOM executor even when the planner mentions Playwright", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "dom",
            required: true,
            reason: "The user wants the active X page used after drafting.",
          },
        ],
        intent: {
          summary: "Research recent AI news and enter an X draft without publishing.",
          action: "navigate",
          target: "current-page",
          constraints: ["Do not publish."],
          needsClarification: false,
        },
        browserControl: {
          shouldControl: true,
          mode: "playwright",
          fallbackMode: "dom",
          preconditions: ["external-research", "content-generation"],
          reason: "The planner requested Playwright for research before editing the current page.",
        },
        confidence: 0.78,
      },
      {
        ...input,
        message: "Use Playwright to research recent AI news and enter a draft post about it on X, but do not publish it.",
        browserAutomationCapabilities: {
          dom: true,
          playwright: true,
          "computer-use": false,
        },
        activeTab: {
          title: "X",
          url: "https://x.com/home",
          restricted: false,
        },
      },
    );

    expect(plan.browserControl).toMatchObject({
      shouldControl: false,
      mode: "dom",
      surface: "active-tab",
      preconditions: ["external-research", "content-generation"],
      reason: "Browser control is deferred until the agentic workflow completes upstream preconditions.",
    });
  });

  test("preserves an explicit new-tab Playwright route instead of forcing DOM handoff", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [],
        intent: {
          summary: "Open a separate browser workflow and draft on X there.",
          action: "navigate",
          target: "current-page",
          constraints: ["Do not publish."],
          needsClarification: false,
        },
        browserControl: {
          shouldControl: true,
          mode: "playwright",
          surface: "new-tab",
          preconditions: ["external-research", "content-generation"],
          reason: "The user wants a separate Playwright browser workflow.",
        },
        confidence: 0.78,
      },
      {
        ...input,
        message: "Use Playwright in a new browser tab to research recent AI news and enter a draft post about it on X, but do not publish it.",
        browserAutomationCapabilities: {
          dom: true,
          playwright: true,
          "computer-use": false,
        },
      },
    );

    expect(plan.browserControl).toMatchObject({
      shouldControl: false,
      mode: "playwright",
      surface: "new-tab",
      preconditions: ["external-research", "content-generation"],
      reason: "Browser control is deferred until the agentic workflow completes upstream preconditions.",
    });
  });

  test("does not normalize contradictory page-summary plans into image generation", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "image-generate",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "dom",
            required: true,
            reason: "The current page is the requested summary target.",
          },
        ],
        requiresVision: false,
        intent: {
          summary: "Summarize the current page.",
          action: "summarize",
          target: "current-page",
          constraints: [],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "Current request is text summary.",
        },
        confidence: 0.4,
      },
      {
        ...input,
        message: "Summarize the current page.",
        activeTab: {
          title: "Article",
          url: "https://example.org/article",
          restricted: false,
        },
      },
    );

    expect(plan.task).toBe("document-analysis");
    expect(plan.intent.action).toBe("summarize");
    expect(plan.intent.target).toBe("current-page");
    expect(plan.imageEdit.shouldEdit).toBe(false);
    expect(plan.contextRequests).toEqual([
      expect.objectContaining({
        source: "current-page",
        readStrategy: "dom",
      }),
    ]);
  });

  test("does not keyword-route image generation when the agentic planner is unavailable", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "fallback",
        task: "general",
        contextRequests: [],
        requiresVision: false,
        intent: {
          summary: "프롬프트 줄게. 파란 구름 모양의 코딩 앱 아이콘 이미지를 생성해줘.",
          action: "answer",
          target: "conversation",
          constraints: [],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "No model route was available.",
        },
        confidence: 0,
      },
      {
        ...input,
        message: "프롬프트 줄게. 파란 구름 모양의 코딩 앱 아이콘 이미지를 생성해줘.",
      },
    );

    expect(plan.task).toBe("general");
    expect(plan.intent.action).toBe("answer");
    expect(plan.imageEdit.shouldEdit).toBe(false);
    expect(plan.contextRequests).toEqual([]);
  });

  test("forces current-page summaries to DOM-first even when the router over-requests vision", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "visual-analysis",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "vision",
            required: true,
            reason: "The user asks about the visible page.",
          },
          {
            source: "image",
            readStrategy: "vision",
            required: true,
            reason: "Capture the visible page.",
          },
        ],
        requiresVision: true,
        intent: {
          summary: "Summarize the key points of the current webpage.",
          action: "summarize",
          target: "current-page",
          constraints: ["Focus on essential points."],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
        },
        selectedModel: "vision-model",
        confidence: 0.77,
      },
      {
        ...input,
        message: "현재 웹페이지를 핵심만 요약해줘.",
        activeTab: {
          title: "Breaking News Article",
          url: "https://news.example.com/story",
          restricted: false,
        },
      },
    );

    expect(plan.task).toBe("document-analysis");
    expect(plan.contextRequests).toEqual([
      expect.objectContaining({
        source: "current-page",
        readStrategy: "dom",
      }),
    ]);
    expect(plan.requiresVision).toBe(false);
    expect(plan.pageReadStrategy).toBe("dom");
    expect(plan.selectedModel).toBe("fast-text");
  });

  test("uses the planner's current text summary route instead of stale prior image context", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "document-analysis",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "dom",
            required: true,
            reason: "Current turn asks for the active post text.",
          },
        ],
        requiresVision: false,
        intent: {
          summary: "Summarize the current post.",
          action: "summarize",
          target: "current-page",
          constraints: [],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "Current request is text summary.",
        },
        selectedModel: "fast-text",
        confidence: 0.51,
      },
      {
        ...input,
        message: "이글 요약좀 부탁해줘.",
        contextHint: "assistant: 이미지를 생성했습니다.\nuser: 이 이미지를 더 선명하게 만들어줘.",
        activeTab: {
          title: "Threads post",
          url: "https://threads.net/@example/post/1",
          restricted: false,
        },
      },
    );

    expect(plan.task).toBe("document-analysis");
    expect(plan.intent).toMatchObject({
      action: "summarize",
      target: "current-page",
    });
    expect(plan.contextRequests).toEqual([
      expect.objectContaining({
        source: "current-page",
        readStrategy: "dom",
      }),
    ]);
    expect(plan.imageEdit).toEqual({
      shouldEdit: false,
      target: "none",
      reason: "The current user message asks for a text/page summary, so prior image context must not trigger image editing.",
    });
    expect(plan.requiresVision).toBe(false);
    expect(plan.pageReadStrategy).toBe("dom");
    expect(plan.selectedModel).toBe("fast-text");
  });

  test("repairs browser-history intent into an explicit history context request", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [],
        requiresVision: false,
        intent: {
          summary: "Find when the user saw an OpenAI announcement in browser history.",
          action: "answer",
          target: "browser-history",
          constraints: ["Use browser history only after permission."],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
        },
        selectedModel: "fast-text",
        confidence: 0.81,
      },
      {
        ...input,
        message: "내가 어제 OpenAI 발표 글을 본 것 같은데 언제 봤지?",
      },
    );

    expect(plan.intent.target).toBe("browser-history");
    expect(plan.historyQuery).toBe("");
    expect(plan.contextRequests).toEqual([
      expect.objectContaining({
        source: "history",
        readStrategy: "auto",
        required: true,
      }),
    ]);
    expect(plan.requiresVision).toBe(false);
    expect(plan.selectedModel).toBe("fast-text");
  });

  test("defaults current-page navigation to safe DOM browser control", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "dom",
            required: true,
            reason: "The user wants the current page operated.",
          },
        ],
        intent: {
          summary: "Click the first EDM video on the current YouTube page.",
          action: "navigate",
          target: "current-page",
          constraints: ["Only use safe page DOM controls."],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
        },
      },
      {
        ...input,
        message: "유튜브에서 첫 번째 EDM 영상을 열어줘",
        activeTab: {
          title: "edm - YouTube",
          url: "https://www.youtube.com/results?search_query=edm",
          restricted: false,
        },
      },
    );

    expect(plan.browserControl).toEqual({
      shouldControl: true,
      mode: "dom",
      surface: "active-tab",
      reason: "Resolved as a browser control request for the current page.",
    });
  });

  test("keeps explicit Playwright or Computer Use current-page routing on the active tab DOM executor", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [{ source: "current-page", readStrategy: "dom", required: true, reason: "Need page DOM." }],
        intent: {
          summary: "Run a reliable browser flow against the current page.",
          action: "navigate",
          target: "current-page",
          constraints: [],
          needsClarification: false,
        },
        browserControl: {
          shouldControl: true,
          mode: "playwright",
          fallbackMode: "computer-use",
          reason: "The request needs a multi-step browser automation harness.",
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
        },
      },
      {
        ...input,
        message: "이 페이지에서 가입 플로우를 테스트해줘",
      },
    );

    expect(plan.browserControl).toEqual({
      shouldControl: true,
      mode: "dom",
      surface: "active-tab",
      reason: "Current-page browser actions run on the active tab through DOM control.",
    });
  });

  test("downgrades unavailable Playwright automation to DOM control", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [{ source: "current-page", readStrategy: "dom", required: true, reason: "Need page DOM." }],
        intent: {
          summary: "Run a browser flow against the current page.",
          action: "navigate",
          target: "current-page",
          constraints: [],
          needsClarification: false,
        },
        browserControl: {
          shouldControl: true,
          mode: "playwright",
          fallbackMode: "computer-use",
          reason: "The request needs a multi-step browser automation harness.",
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
        },
      },
      {
        ...input,
        message: "이 페이지에서 가입 플로우를 테스트해줘",
        browserAutomationCapabilities: {
          dom: true,
          playwright: false,
          "computer-use": false,
        },
      },
    );

    expect(plan.browserControl).toEqual({
      shouldControl: true,
      mode: "dom",
      surface: "active-tab",
      reason: "Current-page browser actions run on the active tab through DOM control.",
    });
  });

  test("keeps browser-history routing isolated from page and tab context unless explicitly attached", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [
          { source: "open-tabs", readStrategy: "auto", required: true, reason: "wrongly inferred tabs" },
          { source: "current-page", readStrategy: "dom", required: true, reason: "wrongly inferred page" },
        ],
        historyQuery: "OpenAI announcement",
        intent: {
          summary: "Find the OpenAI announcement in browser history.",
          action: "answer",
          target: "browser-history",
          constraints: [],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
        },
      },
      {
        ...input,
        message: "내가 전에 본 OpenAI 발표 글 검색기록에서 찾아줘.",
      },
    );

    expect(plan.historyQuery).toBe("OpenAI announcement");
    expect(plan.contextRequests.map((request) => request.source)).toEqual(["history"]);
    expect(plan.contextMode).toBe("page-only");
  });

  test("repairs ambiguous image-edit plans to the single uploaded image when no visible target is selected", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "image-edit",
        contextRequests: [],
        requiresVision: true,
        intent: {
          summary: "Edit the attached image into a softer style.",
          action: "edit-image",
          target: "conversation",
          constraints: ["Keep the subject recognizable."],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: true,
          target: "ambiguous",
          prompt: "Make it softer while keeping the subject recognizable.",
          reason: "The model did not pick a concrete image source.",
        },
        confidence: 0.7,
      },
      {
        ...input,
        message: "이 이미지 부드러운 느낌으로 바꿔줘",
        fileAttachments: [
          {
            id: "upload-1",
            name: "portrait.png",
            mimeType: "image/png",
            sizeBytes: 42,
            lastModified: 1,
            base64: "ZmFrZQ==",
            kind: "image",
          },
        ],
        activeTab: {
          title: "Article",
          url: "https://example.org/article",
          restricted: false,
        },
      },
    );

    expect(plan.imageEdit).toMatchObject({
      shouldEdit: true,
      target: "uploaded-image",
      targetFileId: "upload-1",
      prompt: "Make it softer while keeping the subject recognizable.",
    });
    expect(plan.contextRequests.map((request) => request.source)).toEqual([]);
    expect(plan.intent.target).toBe("uploaded-file");
  });

  test("preserves page visual context when an uploaded image edit also needs the visible screen", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "image-edit",
        contextRequests: [
          {
            source: "current-page",
            readStrategy: "hybrid",
            required: true,
            reason: "Use the visible page as visual reference.",
          },
          {
            source: "image",
            readStrategy: "vision",
            required: true,
            reason: "Use the visible page image as visual reference.",
          },
        ],
        requiresVision: true,
        intent: {
          summary: "Edit the uploaded photo using the currently visible page image as reference.",
          action: "edit-image",
          target: "uploaded-file",
          constraints: ["Use the screen as style reference."],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: true,
          target: "uploaded-image",
          prompt: "Apply the style of the visible page image to the uploaded photo.",
          reason: "The uploaded image is the edit target and the visible page is reference context.",
        },
        confidence: 0.86,
      },
      {
        ...input,
        message: "업로드한 사진을 지금 화면 이미지 느낌으로 바꿔줘",
        fileAttachments: [
          {
            id: "upload-1",
            name: "portrait.png",
            mimeType: "image/png",
            sizeBytes: 42,
            lastModified: 1,
            base64: "ZmFrZQ==",
            kind: "image",
          },
        ],
        activeTab: {
          title: "Reference",
          url: "https://example.org/reference",
          restricted: false,
        },
      },
    );

    expect(plan.imageEdit).toMatchObject({
      shouldEdit: true,
      target: "uploaded-image",
      targetFileId: "upload-1",
    });
    expect(plan.contextRequests.map((request) => request.source)).toEqual(["current-page", "image"]);
    expect(plan.contextMode).toBe("page-plus-files");
  });

  test("preserves explicit attachments and drops unsafe or unknown model output", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "unknown-task",
        contextRequests: [
          { source: "history", readStrategy: "dom", required: true, reason: "requested" },
          { source: "gmail", readStrategy: "hybrid", required: true, reason: "not supported" },
          { source: "open-tabs", readStrategy: "invalid", required: false, reason: "" },
        ],
        requiresVision: "yes",
        intent: {
          summary: "",
          action: "unsupported-action",
          target: "unknown-target",
          constraints: ["  keep this  ", "", 42],
          needsClarification: "no",
          clarificationQuestion: 123,
        },
        selectedProfileId: "missing-profile",
        selectedModel: "missing-model",
        notes: ["", "  valid note  "],
        confidence: 4,
      },
      {
        ...input,
        explicitAttachments: ["current-page", "open-tabs"],
        readStrategyOverride: "dom",
      },
    );

    expect(plan.task).toBe("general");
    expect(plan.contextRequests.map((request) => request.source)).toEqual(["history", "open-tabs", "current-page"]);
    expect(plan.contextRequests.find((request) => request.source === "current-page")?.readStrategy).toBe("dom");
    expect(plan.selectedProfileId).toBe("research-assistant");
    expect(plan.selectedModel).toBe("fast-text");
    expect(plan.confidence).toBe(1);
    expect(plan.notes).toEqual(["valid note"]);
    expect(plan.intent).toEqual({
      summary: "이걸 더 자연스럽게 바꿔줘",
      action: "answer",
      target: "conversation",
      constraints: ["keep this"],
      needsClarification: false,
    });
  });

  test("creates an explicit-context fallback without semantic keyword routing", () => {
    const plan = createFallbackAgenticRoutePlan({
      ...input,
      message: "열린 탭들을 비교해줘",
      explicitAttachments: [],
    });

    expect(plan.source).toBe("fallback");
    expect(plan.contextRequests).toEqual([]);
    expect(plan.task).toBe("general");
    expect(plan.intent.summary).toBe("열린 탭들을 비교해줘");
    expect(plan.intent.target).toBe("conversation");
    expect(plan.notes.join(" ")).toContain("explicitly attached");
  });

  test("keeps only planner-selected available structured app, plugin, or MCP inputs", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        contextRequests: [],
        structuredInputIds: ["gmail", "unknown-input", "mcp:google-calendar", "gmail"],
        intent: {
          summary: "Check Gmail and Calendar through connected tools.",
          action: "answer",
          target: "conversation",
          constraints: [],
          needsClarification: false,
        },
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "No image workflow.",
        },
        browserControl: {
          shouldControl: true,
          mode: "playwright",
          surface: "new-tab",
          reason: "The service has a web UI.",
        },
        confidence: 0.9,
      },
      {
        ...input,
        availableStructuredInputs: [
          {
            id: "gmail",
            type: "mention",
            name: "Gmail",
            path: "app://gmail",
            token: "$gmail",
          },
          {
            id: "mcp:google-calendar",
            type: "mention",
            name: "Google Calendar",
            path: "mcp://google-calendar",
            token: "$google-calendar",
          },
        ],
      },
    );

    expect(plan.structuredInputIds).toEqual(["gmail", "mcp:google-calendar"]);
    expect(plan.browserControl).toMatchObject({
      shouldControl: false,
      mode: "dom",
      surface: "active-tab",
    });
  });

  test("maps agentic plans to the legacy prompt routing contract", () => {
    const agenticPlan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "visual-analysis",
        contextRequests: [{ source: "image", readStrategy: "vision", required: true, reason: "Inspect the image." }],
        requiresVision: true,
        intent: {
          summary: "Inspect the visible image.",
          action: "answer",
          target: "visible-image",
          constraints: [],
          needsClarification: false,
        },
        selectedProfileId: "research-assistant",
        selectedModel: "vision-model",
        notes: ["Vision requested by router."],
      },
      input,
    );

    expect(routePlanToPromptRoutingPlan(agenticPlan, input)).toEqual({
      task: "visual-analysis",
      contextMode: "page-only",
      requiresVision: true,
      pageReadStrategy: "vision",
      selectedProfileId: "research-assistant",
      selectedModel: "vision-model",
      intent: {
        summary: "Inspect the visible image.",
        action: "answer",
        target: "visible-image",
        constraints: [],
        needsClarification: false,
      },
      browserControl: {
        shouldControl: false,
        mode: "dom",
        surface: "active-tab",
        reason: "No browser control required.",
      },
      notes: ["Vision requested by router."],
      reroutedProfile: false,
      reroutedModel: true,
    });
  });

  test("accepts a selected custom profile id when the extension declares it available", () => {
    const plan = normalizeAgenticRoutePlan(
      {
        source: "llm",
        task: "general",
        selectedProfileId: "custom-product-manager",
        selectedModel: "fast-text",
      },
      {
        ...input,
        selectedProfileId: "custom-product-manager",
        availableProfileIds: ["custom-product-manager"],
      },
    );

    expect(plan.selectedProfileId).toBe("custom-product-manager");
  });
});
