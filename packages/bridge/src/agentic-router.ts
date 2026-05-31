import type { AgenticRouteInput, AgenticRoutePlan } from "@codex-sidepanel/shared";
import { createFallbackAgenticRoutePlan, normalizeAgenticRoutePlan } from "@codex-sidepanel/shared";

import type { CodexAppServerClient } from "./codex-app-server.js";
import type { BridgeHarnessRuntime } from "./harness.js";
import { requestTurnStartWithReasoningSummaryFallback } from "./turn-start.js";
import type { BridgeEvent, BridgeRoutePlane } from "./types.js";

type NotificationPayload = {
  method: string;
  params?: Record<string, unknown>;
};

const ROUTE_PLAN_TIMEOUT_MS = 12_000;

type RoutePlanningModelChoice = {
  model?: string;
  serviceTier?: string;
};

export class CodexAgenticRouterPlane implements BridgeRoutePlane {
  readonly #client: CodexAppServerClient;
  readonly #harness: BridgeHarnessRuntime;

  constructor(options: { client: CodexAppServerClient; harness: BridgeHarnessRuntime }) {
    this.#client = options.client;
    this.#harness = options.harness;
  }

  async plan(params: AgenticRouteInput, emit: (event: BridgeEvent) => void): Promise<AgenticRoutePlan> {
    emit({ type: "route.started", clientRequestId: null });
    try {
      const rawPlan = await this.#requestModelPlan(params);
      const rawObject = rawPlan && typeof rawPlan === "object" ? (rawPlan as Record<string, unknown>) : {};
      const plan = normalizeAgenticRoutePlan({ ...rawObject, source: "llm" }, params);
      emit({ type: "route.plan.created", plan });
      return plan;
    } catch (error) {
      const plan = createFallbackAgenticRoutePlan(params, toFallbackReason(error));
      emit({ type: "route.plan.created", plan });
      return plan;
    }
  }

  async #requestModelPlan(params: AgenticRouteInput): Promise<unknown> {
    const primaryChoice = selectRoutePlanningModel(params.models, params.selectedModel);
    const fallbackChoice: RoutePlanningModelChoice | null = primaryChoice.model ? {} : null;
    const choices: RoutePlanningModelChoice[] = fallbackChoice ? [primaryChoice, fallbackChoice] : [primaryChoice];
    let lastError: unknown = null;

    for (const choice of choices) {
      try {
        return await this.#requestModelPlanWithChoice(params, choice);
      } catch (error) {
        lastError = error;
        if (!choice.model || !isRoutePlanningModelUnavailableError(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Route planning failed."));
  }

  async #requestModelPlanWithChoice(params: AgenticRouteInput, choice: RoutePlanningModelChoice): Promise<unknown> {
    const cwd = await this.#harness.getWorkspaceRoot();
    const thread = (await this.#client.request("thread/start", {
      ...(cwd ? { cwd } : {}),
      approvalPolicy: "never",
      personality: "pragmatic",
      serviceName: "codex-chrome-sidepanel-router",
      sessionStartSource: "startup",
      ephemeral: true,
      persistExtendedHistory: false,
      experimentalRawEvents: false,
    })) as { thread?: { id?: string } };
    const threadId = thread.thread?.id;
    if (!threadId) {
      throw new Error("Codex app-server did not return a thread id for route planning.");
    }

    let turnId = "";
    let assistantText = "";
    let unsubscribe: () => void = () => undefined;
    const completed = new Promise<void>((resolve, reject) => {
      unsubscribe = this.#client.onNotification((notification: NotificationPayload) => {
        try {
          const notificationThreadId = String(notification.params?.threadId ?? "");
          if (notificationThreadId && notificationThreadId !== threadId) {
            return;
          }
          const notificationTurn = notification.params?.turn as { id?: string; error?: { message?: string } } | undefined;
          const notificationTurnId = String(notification.params?.turnId ?? notificationTurn?.id ?? "");
          if (turnId && notificationTurnId && notificationTurnId !== turnId) {
            return;
          }

          if (notification.method === "item/completed") {
            const item = notification.params?.item as { type?: string; text?: string } | undefined;
            if (item?.type === "agentMessage" && item.text?.trim()) {
              assistantText = item.text.trim();
            }
            return;
          }

          if (notification.method === "turn/completed") {
            unsubscribe();
            if (notificationTurn?.error?.message) {
              reject(new Error(notificationTurn.error.message));
              return;
            }
            resolve();
          }
        } catch (error) {
          unsubscribe();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    try {
      const turn = await requestTurnStartWithReasoningSummaryFallback(
        this.#client,
        async () => undefined,
        {
          threadId,
          input: [
            {
              type: "text",
              text: createAgenticRoutePrompt(params),
              text_elements: [],
            },
          ],
          ...(cwd ? { cwd } : {}),
          ...(choice.model ? { model: choice.model } : {}),
          ...(choice.serviceTier ? { serviceTier: choice.serviceTier } : {}),
          effort: "low",
          approvalPolicy: "never",
          personality: "pragmatic",
        },
      );
      turnId = String(turn.turn?.id ?? "");
      await withTimeout(completed, ROUTE_PLAN_TIMEOUT_MS);
      return extractJsonObject(assistantText);
    } finally {
      unsubscribe();
    }
  }
}

export function selectRoutePlanningModel(
  models: AgenticRouteInput["models"],
  selectedModel: string,
): RoutePlanningModelChoice {
  if (!models.length) {
    return {};
  }

  const best = [...models].sort((left, right) => {
    const scoreDiff =
      scoreRoutePlanningModel(right, selectedModel) - scoreRoutePlanningModel(left, selectedModel);
    return scoreDiff || left.label.localeCompare(right.label);
  })[0];

  if (!best) {
    return {};
  }

  return {
    model: best.id,
    ...(best.additionalSpeedTiers?.includes("fast") ? { serviceTier: "fast" } : {}),
  };
}

function scoreRoutePlanningModel(
  model: AgenticRouteInput["models"][number],
  selectedModel: string,
): number {
  const id = model.id.toLowerCase();
  const label = model.label.toLowerCase();
  const name = `${id} ${label}`;
  let score = 0;

  if (model.reasoningEfforts.includes("low")) {
    score += 20;
  }
  if (model.additionalSpeedTiers?.includes("fast")) {
    score += 30;
  }
  if (model.isDefault) {
    score += 4;
  }
  if (model.id === selectedModel) {
    score += 2;
  }
  if (/\b(spark|mini|nano|fast|flash|small|haiku)\b/iu.test(name)) {
    score += 35;
  }
  if (/\b(codex|reasoning|thinking)\b/iu.test(name)) {
    score += 3;
  }
  if (model.supportsImages) {
    score -= 6;
  }
  if (/\b(image|vision|realtime|audio)\b/iu.test(name)) {
    score -= 12;
  }
  if (/\b(5\.5|5\.4|opus|xhigh|pro|max)\b/iu.test(name)) {
    score -= 8;
  }

  return score;
}

function isRoutePlanningModelUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\bmodel\b[\s\S]{0,80}(not found|not available|unsupported|does not exist|unavailable|denied|not enabled)/iu.test(
    message,
  );
}

export function createAgenticRoutePrompt(input: AgenticRouteInput): string {
  const fileMetadata = input.fileAttachments.map((file) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    kind: file.kind,
  }));

  return [
    "You are the routing planner for a Chrome side-panel AI assistant.",
    "Plan only. Do not answer the user. Do not request raw DOM, screenshots, tabs, history, or files unless they are needed for the user's current request.",
    "",
    "Return exactly one JSON object. No Markdown. No prose.",
    "Schema:",
    JSON.stringify(
      {
        task: "general | document-analysis | visual-analysis | image-generate | image-edit | comparison",
        contextRequests: [
          {
            source: "current-page | selection | image | open-tabs | history",
            readStrategy: "auto | dom | vision | hybrid | adapter",
            required: true,
            reason: "short reason",
          },
        ],
        structuredInputIds: ["available app, plugin, or MCP structured input id to attach, or empty"],
        historyQuery: "concise browser-history search query, or empty string for recent/all relevant history",
        requiresVision: false,
        intent: {
          summary: "one sentence preserving the user's concrete goal",
          action: "answer | summarize | compare | generate-image | edit-image | extract | navigate | clarify",
          target: "conversation | current-page | visible-image | uploaded-file | selected-tabs | browser-history | none",
          constraints: ["explicit user constraints or important inferred constraints"],
          needsClarification: false,
          clarificationQuestion: "only when the task cannot safely proceed",
        },
        browserControl: {
          shouldControl: false,
          mode: "dom | playwright | computer-use",
          surface: "active-tab | new-tab",
          fallbackMode: "dom | playwright | computer-use",
          preconditions: [
            "external-research | content-generation | context-collection | user-confirmation",
          ],
          reason: "short reason",
        },
        selectedProfileId: "profile id",
        selectedModel: "model id",
        imageEdit: {
          shouldEdit: false,
          target: "none | page-image | uploaded-image | ambiguous",
          targetFileId: "optional uploaded file id",
          prompt: "image editing prompt when shouldEdit is true",
          reason: "short reason",
        },
        notes: ["short runtime instruction"],
        confidence: 0.8,
      },
      null,
      2,
    ),
    "",
    "Routing policy:",
    "- Route by semantic planning, not keyword matching. First infer the user's intended action, intended target, constraints, and safety requirements from the full request, conversationContext, selected profile, uploadedFiles, activeTab, and explicitAttachments.",
    "- Treat userMessage as the current turn of record. conversationContext can disambiguate terse follow-ups, but it must not override a clear current request.",
    "- Never choose image-generate or image-edit solely because earlier turns contained uploaded images, generated images, image placeholders, or image results. The current userMessage must ask for a new/changed visual output.",
    "- Perform target resolution before choosing context. Decide whether the target is conversation, current-page, visible-image, uploaded-file, selected-tabs, browser-history, or none. Do not rely on literal trigger phrases or a fixed multilingual keyword list.",
    "- Use current-page when the resolved target depends on the active browser page, visible browser surface, or page state.",
    "- Use image with vision/hybrid when the resolved task needs visual evidence, visible UI, screenshots, page images, diagrams, layout, or image editing.",
    "- For current-page summaries, news, articles, documentation, or text extraction, prefer current-page with readStrategy=dom or adapter. Do not request image/vision for text-heavy page summaries unless the user asks about layout, images, screenshots, or visible UI.",
    "- If the current userMessage asks to summarize this post/article/page/text, route to current-page DOM or adapter summary even if conversationContext contains prior image generation or image editing.",
    "- For browser page operation requests, decide the execution surface before deciding the automation mode. Use browserControl.surface=active-tab when the user wants the already visible/current browser page or tab changed. Use browserControl.surface=new-tab when the task is an independent browser harness workflow, test run, or explicitly separate Playwright browser/tab.",
    "- For active-tab operations such as clicking, focusing, filling a field, selecting an option, submitting a form, scrolling the current page, or moving the current tab to a user-requested URL/address, set intent.action=navigate, intent.target=current-page, browserControl.shouldControl=true, browserControl.surface=active-tab, browserControl.mode=dom, and request current-page with readStrategy=dom. Current extension executes safe current-page DOM actions directly through a constrained DOM action plan; do not describe the steps as a normal answer.",
    "- If semantic planning finds unresolved upstream work before a page action can be executed, set browserControl.shouldControl=false and encode that workflow state in browserControl.preconditions. Use external-research for information that must be gathered outside the active page, content-generation for text or artifacts that Codex must create before filling the page, context-collection for required source context not yet attached, and user-confirmation for approval gates.",
    "- availableStructuredInputs are installed/enabled Codex app, plugin, or MCP mention inputs exposed by the local app-server. Use only their ids in structuredInputIds; never invent ids.",
    "- When the task depends on a connected external service or tool such as mail, calendar, GitHub, documents, workspace data, or an authenticated MCP server, prefer the matching app, plugin, or MCP structured input over browser automation. Do not choose Playwright for connected-service data when a suitable structured input is available.",
    "- If no suitable structured input is available, leave structuredInputIds empty and choose browser automation only when the user's target is a browser UI workflow rather than app-server tool data.",
    "- Do not treat the word Playwright by itself as a decision to ignore the visible tab. If the resolved target is the current visible page, choose active-tab. If the resolved target is a separate automation run, choose new-tab.",
    "- Simple same-tab URL/address changes do not require playwright. Use playwright with surface=new-tab only when browserAutomationCapabilities.playwright is true and the user intends a reliable multi-step web-browser workflow, testing flow, navigation sequence, or DOM-level automation that should be handled by a browser harness rather than a single current-page DOM action.",
    "- Use computer-use only when browserAutomationCapabilities.computer-use is true and the user intends visual-only, canvas-heavy, browser-chrome, native app, OS-level, or otherwise non-DOM control where a web DOM harness is not sufficient. Prefer dom for safe current-page web controls when available.",
    "- If a non-DOM automation mode is unavailable, do not select it. Use dom when the requested action can be completed on the current page; otherwise answer that the required runtime is not installed or enabled.",
    "- Non-DOM browserControl modes are routing metadata for runtimes that support those harnesses. Do not silently downgrade irreversible or ambiguous operations into direct DOM control.",
    "- Do not route irreversible browser mutations such as purchases, payments, account changes, public posts, sending emails/messages, or deletes as automatic page actions. Set intent.action=clarify or answer with safety guidance unless the user only asks to draft text.",
    "- Use image-generate when the user wants a new generated image, poster, thumbnail, infographic, slide image, card-news visual, or any visual asset from a textual prompt, attached file, current page data, or previous conversation. Set intent.action=generate-image and keep imageEdit.shouldEdit=false.",
    "- If the user provides, pastes, references, or says they will give a prompt and asks to generate/create/render an image from it, use image-generate. Treat the prompt as the visual brief, not as text to rewrite.",
    "- For image-edit workflows, return a complete imageEdit plan. If the intended edit target is the visible browser surface or a page-embedded image and no uploaded file is the intended target, set task=image-edit, contextRequests=current-page+image, requiresVision=true, intent.action=edit-image, intent.target=visible-image, and imageEdit.target=page-image.",
    "- Treat visual object replacement, subject transformation, background changes, style transfer, cleanup, restoration, and composition edits as image-edit workflows when the user wants a changed visual output.",
    "- Do not use image-edit when the user asks for an image prompt, prompt text, prompt recipe, generation prompt, or instructions that could recreate the image. If they ask to write or explain prompt text, use text-answer or visual-analysis. If they ask to execute a provided prompt into an image, use image-generate.",
    "- If the active page shows a media/photo viewer or social post image, resolve terse visual edit requests to that displayed image instead of summarizing the page or asking for an upload.",
    "- Treat image text translation, localization, or text replacement as an image-edit workflow when the user wants a new/changed visual output. Preserve layout, typography intent, and composition while replacing visible text in the target language.",
    "- Use open-tabs only for multi-tab, cross-tab, compare-tabs, or explicitly selected tab requests.",
    "- Use history only when the resolved target is browser-history; it is privacy-sensitive and must be requested only after semantic target resolution.",
    "- Do not require an @history mention. If the user's concrete goal depends on past visits, search history, pages they remember seeing, content they believe they saw, or something they have seen or read before, set intent.target=browser-history and include a history contextRequest.",
    "- For browser-history targets, do not attach current-page just because a tab is open. The history search should answer from visited URLs/titles unless the user also asks about the current page.",
    "- For browser-history targets, set historyQuery to a short topical query only when the user gives concrete terms, people, sites, products, or titles to find. If the user asks to analyze recent/search/browsing history generally, set historyQuery to an empty string so the runtime fetches recent history instead of searching the instruction text.",
    "- If uploaded files exist, treat them as explicit user artifacts. For image edits, choose the uploaded image only when target resolution identifies an uploaded artifact as the edit target; choose page-image when target resolution identifies the visible browser state as the edit target; mark ambiguous only when both remain equally plausible.",
    "- If uploadedFiles includes an image id starting with generated-followup-, treat that image as the selected previous generated image edit target. Additional uploaded images in the same request are reference images unless the user explicitly chooses a different target.",
    "- When exactly one uploaded image is present and the user asks to edit, transform, translate, restyle, clean up, or otherwise produce a changed image without clearly targeting the visible browser page, set task=image-edit, intent.target=uploaded-file, imageEdit.target=uploaded-image, and imageEdit.targetFileId to that file id.",
    "- When the user asks to combine, blend, transfer, compare-and-edit, use as reference, or otherwise use both the visible page image and uploaded images, choose the primary edit target from the user's wording and include the other visual source as reference context. For uploaded-image primary targets, keep imageEdit.target=uploaded-image and add current-page plus image contextRequests. For visible-page primary targets, keep imageEdit.target=page-image and uploaded images will be treated as references.",
    "- For terse follow-ups, infer target from conversationContext and previous assistant actions, not from keywords alone.",
    "- Preserve user intent separately from routing: summarize the concrete goal, target object, constraints, and whether clarification is truly required.",
    "- Set needsClarification only when multiple plausible destructive targets exist or required context is unavailable. Do not ask for clarification when the active page, visible image, or uploaded file gives a reasonable target.",
    "- Do not switch profiles for image-edit tasks. Image editing is a default workflow selected by task planning, not by a visible profile.",
    "- If vision is required and the selected model cannot handle images, choose a vision-capable model from availableModels.",
    "",
    "Runtime input:",
    JSON.stringify(
      {
        userMessage: input.message,
        conversationContext: input.contextHint ?? "",
        selectedProfileId: input.selectedProfileId,
        selectedModel: input.selectedModel,
        availableModels: input.models.map((model) => ({
          id: model.id,
          supportsImages: model.supportsImages,
          isDefault: model.isDefault,
        })),
        readStrategyOverride: input.readStrategyOverride,
        explicitAttachments: input.explicitAttachments,
        selectedTabIds: input.selectedTabIds ?? [],
        historyQuery: input.historyQuery ?? "",
        locale: input.locale ?? "",
        activeTab: input.activeTab ?? null,
        uploadedFiles: fileMetadata,
        availableStructuredInputs: (input.availableStructuredInputs ?? []).map((structuredInput) => ({
          id: structuredInput.id,
          type: structuredInput.type,
          name: structuredInput.name,
          path: structuredInput.path,
          description: structuredInput.description ?? "",
        })),
        browserAutomationCapabilities: input.browserAutomationCapabilities ?? {
          dom: true,
          playwright: true,
          "computer-use": true,
        },
      },
      null,
      2,
    ),
  ].join("\n");
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Route planner returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("Route planner response did not contain a JSON object.");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Route planning timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function toFallbackReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Agentic router unavailable; using only explicitly attached context. ${message}`;
}
