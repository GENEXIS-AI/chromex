import { describe, expect, test } from "vitest";

import {
  CodexAgenticRouterPlane,
  createAgenticRoutePrompt,
  extractJsonObject,
  selectRoutePlanningModel,
} from "../src/index.js";
import type { AgenticRouteInput } from "@codex-sidepanel/shared";
import type { BridgeEvent } from "../src/types.js";

type NotificationPayload = {
  method: string;
  params?: Record<string, unknown>;
};

class FakeRouteClient {
  readonly calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  readonly handlers = new Set<(notification: NotificationPayload) => void>();

  onNotification(handler: (notification: NotificationPayload) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === "thread/start") {
      return { thread: { id: "thread-route" } };
    }
    if (method === "turn/start") {
      setTimeout(() => {
        this.emit({
          method: "item/completed",
          params: {
            threadId: "thread-route",
            turnId: "turn-route",
            item: {
              type: "agentMessage",
              text: JSON.stringify({
                task: "image-edit",
                contextRequests: [
                  {
                    source: "current-page",
                    readStrategy: "hybrid",
                    required: true,
                    reason: "The active page contains the image to localize.",
                  },
                  {
                    source: "image",
                    readStrategy: "vision",
                    required: true,
                    reason: "The visible page image must be edited.",
                  },
                ],
                requiresVision: true,
                intent: {
                  summary: "Create a Korean-localized version of the current page image.",
                  action: "edit-image",
                  target: "visible-image",
                  constraints: ["Translate visible text into Korean.", "Preserve the original layout."],
                  needsClarification: false,
                },
                selectedProfileId: "research-assistant",
                imageEdit: {
                  shouldEdit: true,
                  target: "page-image",
                  prompt: "Translate the visible text in the current page image into Korean and preserve the layout.",
                  reason: "The requested output is an edited page image.",
                },
                confidence: 0.92,
              }),
            },
          },
        });
        this.emit({
          method: "turn/completed",
          params: {
            threadId: "thread-route",
            turn: { id: "turn-route" },
          },
        });
      }, 0);
      return { turn: { id: "turn-route" } };
    }
    return {};
  }

  emit(notification: NotificationPayload): void {
    for (const handler of this.handlers) {
      handler(notification);
    }
  }
}

const input: AgenticRouteInput = {
  message: "첨부 이미지랑 지금 화면을 비교해서 편집해줘",
  contextHint: "user: 지금 보고 있는 이미지를 편집해줘",
  selectedProfileId: "research-assistant",
  selectedModel: "fast-model",
  models: [
    {
      id: "fast-model",
      label: "Fast",
      description: "Text model",
      isDefault: true,
      supportsImages: false,
      reasoningEfforts: ["low"],
    },
  ],
  readStrategyOverride: "auto",
  explicitAttachments: [],
  fileAttachments: [
    {
      id: "file-1",
      name: "private.png",
      mimeType: "image/png",
      sizeBytes: 42,
      lastModified: 1,
      base64: "SECRET_BASE64_IMAGE_DATA",
      kind: "image",
    },
  ],
};

describe("agentic router helpers", () => {
  test("builds route prompts with file metadata but without raw attachment bytes", () => {
    const prompt = createAgenticRoutePrompt(input);

    expect(prompt).toContain("private.png");
    expect(prompt).toContain("\"kind\": \"image\"");
    expect(prompt).toContain("intent");
    expect(prompt).toContain("needsClarification");
    expect(prompt).toContain("For terse follow-ups, infer target from conversationContext");
    expect(prompt).toContain("Route by semantic planning, not keyword matching");
    expect(prompt).toContain("target resolution");
    expect(prompt).toContain("image text translation, localization, or text replacement");
    expect(prompt).toContain("visual object replacement");
    expect(prompt).toContain("active page shows a media/photo viewer or social post image");
    expect(prompt).toContain("For current-page summaries, news, articles, documentation, or text extraction, prefer current-page with readStrategy=dom or adapter");
    expect(prompt).toContain("Treat userMessage as the current turn of record");
    expect(prompt).toContain("must not override a clear current request");
    expect(prompt).toContain("Never choose image-generate or image-edit solely because earlier turns contained uploaded images");
    expect(prompt).toContain("summarize this post/article/page/text");
    expect(prompt).toContain("browserControl");
    expect(prompt).toContain("dom | playwright | computer-use");
    expect(prompt).toContain("preconditions");
    expect(prompt).toContain("external-research");
    expect(prompt).toContain("content-generation");
    expect(prompt).toContain("Current extension executes safe current-page DOM actions directly");
    expect(prompt).toContain("browserControl.surface=active-tab");
    expect(prompt).toContain("Use playwright with surface=new-tab only when");
    expect(prompt).toContain("Use computer-use only when");
    expect(prompt).toContain("browserAutomationCapabilities.playwright is true");
    expect(prompt).toContain("structuredInputIds");
    expect(prompt).toContain("availableStructuredInputs");
    expect(prompt).toContain("prefer the matching app, plugin, or MCP structured input over browser automation");
    expect(prompt).toContain("Use image-generate when the user wants a new generated image");
    expect(prompt).toContain("If the user provides, pastes, references, or says they will give a prompt and asks to generate/create/render an image from it");
    expect(prompt).toContain("When exactly one uploaded image is present");
    expect(prompt).toContain("When the user asks to combine, blend, transfer, compare-and-edit, use as reference, or otherwise use both the visible page image and uploaded images");
    expect(prompt).toContain("Do not use image-edit when the user asks for an image prompt");
    expect(prompt).toContain("Do not require an @history mention");
    expect(prompt).toContain("past visits");
    expect(prompt).toContain("search history");
    expect(prompt).toContain("seen or read before");
    expect(prompt).not.toContain('If the user says "this image"');
    expect(prompt).not.toContain('"이 이미지"');
    expect(prompt).not.toContain("SECRET_BASE64_IMAGE_DATA");
  });

  test("exposes only structured input metadata to the route planner", () => {
    const prompt = createAgenticRoutePrompt({
      ...input,
      availableStructuredInputs: [
        {
          id: "gmail",
          type: "mention",
          name: "Gmail",
          path: "app://gmail",
          description: "Read and manage Gmail",
          token: "$gmail",
        },
        {
          id: "mcp:google-calendar",
          type: "mention",
          name: "Google Calendar",
          path: "mcp://google-calendar",
          description: "Manage calendar events",
          token: "$google-calendar",
        },
      ],
    });

    expect(prompt).toContain('"id": "gmail"');
    expect(prompt).toContain('"name": "Gmail"');
    expect(prompt).toContain('"path": "app://gmail"');
    expect(prompt).toContain('"id": "mcp:google-calendar"');
    expect(prompt).toContain('"path": "mcp://google-calendar"');
    expect(prompt).not.toContain("$gmail");
    expect(prompt).not.toContain("$google-calendar");
  });

  test("extracts JSON route output even when the model wraps it in prose", () => {
    expect(
      extractJsonObject('Here is the plan:\n{"task":"general","contextRequests":[],"confidence":0.5}\nDone.'),
    ).toEqual({
      task: "general",
      contextRequests: [],
      confidence: 0.5,
    });
  });

  test("plans current page image localization through the image workflow with low routing effort", async () => {
    const client = new FakeRouteClient();
    const events: BridgeEvent[] = [];
    const plane = new CodexAgenticRouterPlane({
      client: client as never,
      harness: { getWorkspaceRoot: async () => "" } as never,
    });

    const plan = await plane.plan(
      {
        ...input,
        message: "현재 페이지의 이미지 한국어로 번역한걸로 만들어줘.",
        activeTab: {
          title: "Design reference",
          url: "https://example.org/design",
          restricted: false,
        },
        models: [
          ...input.models,
          {
            id: "vision-model",
            label: "Vision",
            description: "Vision capable",
            isDefault: false,
            supportsImages: true,
            reasoningEfforts: ["low", "medium"],
          },
        ],
      },
      (event) => events.push(event),
    );

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    expect(turnStart?.params.effort).toBe("low");
    expect(turnStart?.params.reasoningEffort).toBeUndefined();
    expect(plan.task).toBe("image-edit");
    expect(plan.imageEdit).toMatchObject({
      shouldEdit: true,
      target: "page-image",
    });
    expect(plan.contextRequests.map((request) => request.source)).toEqual(["current-page", "image"]);
    expect(plan.requiresVision).toBe(true);
    expect(plan.selectedProfileId).toBe("research-assistant");
    expect(plan.selectedModel).toBe("vision-model");
    expect(events.map((event) => event.type)).toEqual(["route.started", "route.plan.created"]);
  });

  test("does not send reasoning summary to spark during route planning", async () => {
    const client = new FakeRouteClient();
    const plane = new CodexAgenticRouterPlane({
      client: client as never,
      harness: { getWorkspaceRoot: async () => "" } as never,
    });

    await plane.plan(
      {
        ...input,
        selectedModel: "gpt-5.3-codex-spark",
        models: [
          {
            id: "gpt-5.3-codex-spark",
            label: "GPT-5.3-Codex-Spark",
            description: "Fast planner",
            isDefault: true,
            supportsImages: false,
            reasoningEfforts: ["low"],
          },
        ],
      },
      () => undefined,
    );

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    expect(turnStart?.params).toMatchObject({
      model: "gpt-5.3-codex-spark",
      effort: "low",
    });
    expect(turnStart?.params).not.toHaveProperty("summary");
  });

  test("selects a fast low-effort planner model independently from the user response model", () => {
    expect(
      selectRoutePlanningModel(
        [
          {
            id: "gpt-5.5",
            label: "GPT-5.5",
            description: "Frontier model",
            isDefault: true,
            supportsImages: true,
            reasoningEfforts: ["low", "medium", "high", "xhigh"],
          },
          {
            id: "gpt-5.3-codex-spark",
            label: "GPT-5.3-Codex-Spark",
            description: "Fast coding model",
            isDefault: false,
            supportsImages: false,
            reasoningEfforts: ["low", "medium"],
            additionalSpeedTiers: ["fast"],
          },
        ],
        "gpt-5.5",
      ),
    ).toEqual({
      model: "gpt-5.3-codex-spark",
      serviceTier: "fast",
    });
  });

  test("falls back to app-server default routing when the fast planner model is unavailable", async () => {
    class UnavailablePlannerModelClient extends FakeRouteClient {
      #failedOnce = false;

      override async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
        if (method === "turn/start" && params.model === "gpt-5.3-codex-spark" && !this.#failedOnce) {
          this.#failedOnce = true;
          this.calls.push({ method, params });
          throw new Error("model not available for this account");
        }
        return super.request(method, params);
      }
    }

    const client = new UnavailablePlannerModelClient();
    const plane = new CodexAgenticRouterPlane({
      client: client as never,
      harness: { getWorkspaceRoot: async () => "" } as never,
    });

    await plane.plan(
      {
        ...input,
        selectedModel: "gpt-5.5",
        models: [
          {
            id: "gpt-5.5",
            label: "GPT-5.5",
            description: "Frontier model",
            isDefault: true,
            supportsImages: true,
            reasoningEfforts: ["low", "medium", "high", "xhigh"],
          },
          {
            id: "gpt-5.3-codex-spark",
            label: "GPT-5.3-Codex-Spark",
            description: "Fast coding model",
            isDefault: false,
            supportsImages: false,
            reasoningEfforts: ["low"],
            additionalSpeedTiers: ["fast"],
          },
        ],
      },
      () => undefined,
    );

    const turnStarts = client.calls.filter((call) => call.method === "turn/start");
    expect(turnStarts[0]?.params.model).toBe("gpt-5.3-codex-spark");
    expect(turnStarts[0]?.params.serviceTier).toBe("fast");
    expect(turnStarts[1]?.params.model).toBeUndefined();
  });
});
