import { listProfileTemplates } from "./profiles.js";
import type {
  AgenticContextRequest,
  AgenticBrowserControlRouting,
  AgenticBrowserControlPrecondition,
  BrowserControlSurface,
  AgenticImageEditRouting,
  AgenticIntentAction,
  AgenticIntentPlan,
  AgenticIntentTarget,
  AgenticRouteContextSource,
  AgenticRouteInput,
  AgenticRoutePlan,
  BrowserAutomationMode,
  PromptRoutingContextMode,
  PromptRoutingPlan,
  PromptRoutingTask,
  ReadStrategy,
} from "./types.js";

const ROUTE_CONTEXT_SOURCES = new Set<AgenticRouteContextSource>([
  "current-page",
  "open-tabs",
  "history",
  "selection",
  "image",
]);
const READ_STRATEGIES = new Set<ReadStrategy | "auto">(["dom", "vision", "hybrid", "adapter", "auto"]);
const ROUTE_TASKS = new Set<PromptRoutingTask>([
  "general",
  "document-analysis",
  "visual-analysis",
  "image-generate",
  "image-edit",
  "comparison",
]);
const IMAGE_EDIT_TARGETS = new Set<AgenticImageEditRouting["target"]>([
  "none",
  "page-image",
  "uploaded-image",
  "ambiguous",
]);
const BROWSER_AUTOMATION_MODES = new Set<BrowserAutomationMode>([
  "dom",
  "playwright",
  "computer-use",
]);
const BROWSER_CONTROL_SURFACES = new Set<BrowserControlSurface>([
  "active-tab",
  "new-tab",
]);
const BROWSER_CONTROL_PRECONDITIONS = new Set<AgenticBrowserControlPrecondition>([
  "external-research",
  "content-generation",
  "context-collection",
  "user-confirmation",
]);
const INTENT_ACTIONS = new Set<AgenticIntentAction>([
  "answer",
  "summarize",
  "compare",
  "generate-image",
  "edit-image",
  "extract",
  "navigate",
  "clarify",
]);
const INTENT_TARGETS = new Set<AgenticIntentTarget>([
  "conversation",
  "current-page",
  "visible-image",
  "uploaded-file",
  "selected-tabs",
  "browser-history",
  "none",
]);

export function normalizeAgenticRoutePlan(rawPlan: unknown, input: AgenticRouteInput): AgenticRoutePlan {
  const raw = asRecord(rawPlan);
  const rawRequests = Array.isArray(raw.contextRequests) ? raw.contextRequests : [];
  const contextRequests: AgenticContextRequest[] = [];
  const seenSources = new Set<AgenticRouteContextSource>();

  const pushRequest = (request: AgenticContextRequest) => {
    if (seenSources.has(request.source)) {
      return;
    }
    seenSources.add(request.source);
    contextRequests.push(request);
  };

  for (const item of rawRequests) {
    const request = normalizeContextRequest(item, input.readStrategyOverride);
    if (request) {
      pushRequest(request);
    }
  }

  for (const source of input.explicitAttachments) {
    if (!ROUTE_CONTEXT_SOURCES.has(source)) {
      continue;
    }
    pushRequest({
      source,
      readStrategy: input.readStrategyOverride,
      required: true,
      reason: "Explicitly attached by the user.",
    });
  }

  const rawIntent = asRecord(raw.intent);
  const textPageSummaryRequest = isModelPlannedTextPageSummary(raw, rawIntent);
  const normalizedImageEdit = textPageSummaryRequest
    ? createSuppressedTextPageSummaryEditPlan()
    : normalizeImageEdit(raw.imageEdit, input);
  const shouldKeepImageEdit = shouldKeepImageEditOverImageGeneration(raw, normalizedImageEdit);
  const isImageGenerationExecution = isModelPlannedImageGeneration(raw, rawIntent) && !shouldKeepImageEdit;
  const imageEdit = textPageSummaryRequest
    ? createSuppressedTextPageSummaryEditPlan()
    : isImageGenerationExecution
      ? createSuppressedImageGenerationEditPlan()
      : repairIncompleteImageEditPlan(raw, normalizedImageEdit, input);
  if (imageEdit.shouldEdit && imageEdit.target === "page-image") {
    pushRequest({
      source: "current-page",
      readStrategy: "hybrid",
      required: true,
      reason: "The image edit target is the visible page or screen.",
    });
    pushRequest({
      source: "image",
      readStrategy: "vision",
      required: true,
      reason: "The visible image must be captured for editing.",
    });
  }
  if (textPageSummaryRequest) {
    pushRequest({
      source: "current-page",
      readStrategy: "dom",
      required: true,
      reason: "The current user message asks to summarize the active text/article/post.",
    });
  }
  const rawTaskCandidate = ROUTE_TASKS.has(raw.task as PromptRoutingTask)
    ? (raw.task as PromptRoutingTask)
    : isImageGenerationExecution
      ? "image-generate"
      : imageEdit.shouldEdit
      ? "image-edit"
      : "general";
  const rawTask =
    textPageSummaryRequest
      ? "document-analysis"
      : isImageGenerationExecution
        ? "image-generate"
        : rawTaskCandidate;
  const structuredInputIds = normalizeStructuredInputIds(raw.structuredInputIds, input);
  const normalizedIntent = normalizeIntent(raw.intent, input, imageEdit);
  const intent = textPageSummaryRequest
    ? normalizeTextPageSummaryIntent(normalizedIntent, input)
    : rawTask === "image-generate"
        ? normalizeImageGenerationIntent(normalizedIntent, input)
        : normalizedIntent;
  const browserControl = normalizeBrowserControlForStructuredInputs(
    normalizeBrowserControl(raw.browserControl, intent, input),
    structuredInputIds,
  );
  if (intent.target === "browser-history" && !intent.needsClarification) {
    pushRequest({
      source: "history",
      readStrategy: input.readStrategyOverride,
      required: true,
      reason: "The route planner resolved the user's target to browser history.",
    });
  }
  const isolatedContextRequests = shouldUseHistoryOnlyContext(intent, input)
    ? contextRequests.filter((request) => request.source === "history")
    : contextRequests;
  const task = shouldForceDomFirstCurrentPageContext(rawTask, intent, imageEdit, isolatedContextRequests)
    ? forceDomFirstCurrentPageContext(isolatedContextRequests)
    : {
        task: rawTask,
        contextRequests: isolatedContextRequests,
        requiresVisionOverride: null,
      };
  const normalizedContextRequests = task.contextRequests;
  const historyQuery = normalizeHistoryQuery(raw, input);
  const rawRequiresVision = typeof raw.requiresVision === "boolean" ? raw.requiresVision : false;
  const requiresVision =
    task.requiresVisionOverride ??
    (rawRequiresVision ||
      imageEdit.shouldEdit ||
      normalizedContextRequests.some(
        (request) => request.source === "image" || request.readStrategy === "vision" || request.readStrategy === "hybrid",
      ));
  const selectedProfileId = selectProfileId(
    raw.selectedProfileId,
    input.selectedProfileId,
    input.availableProfileIds,
  );
  const selectedModel = selectModel({
    requestedModel:
      task.requiresVisionOverride === false
        ? input.selectedModel
        : typeof raw.selectedModel === "string"
          ? raw.selectedModel
          : input.selectedModel,
    fallbackModel: input.selectedModel,
    requiresVision,
    models: input.models,
  });
  const pageReadStrategy = derivePageReadStrategy(normalizedContextRequests, input.readStrategyOverride, requiresVision);

  return {
    version: 1,
    source: raw.source === "llm" ? "llm" : "fallback",
    task: task.task,
    contextMode: deriveContextMode(normalizedContextRequests, input.fileAttachments.length > 0),
    contextRequests: normalizedContextRequests,
    structuredInputIds,
    historyQuery,
    requiresVision,
    pageReadStrategy,
    intent,
    selectedProfileId,
    selectedModel,
    imageEdit,
    browserControl,
    notes: normalizeNotes(raw.notes),
    confidence: clampConfidence(raw.confidence),
  };
}

export function createFallbackAgenticRoutePlan(input: AgenticRouteInput, reason?: string): AgenticRoutePlan {
  return normalizeAgenticRoutePlan(
    {
      source: "fallback",
      task: "general",
      contextRequests: input.explicitAttachments.map((source) => ({
        source,
        readStrategy: input.readStrategyOverride,
        required: true,
        reason: "Explicitly attached by the user.",
      })),
      structuredInputIds: [],
      requiresVision: input.readStrategyOverride === "vision" || input.readStrategyOverride === "hybrid",
      selectedProfileId: input.selectedProfileId,
      selectedModel: input.selectedModel,
      imageEdit: {
        shouldEdit: false,
        target: "none",
        reason: "No model route was available, so only explicitly attached context is used.",
      },
      browserControl: {
        shouldControl: false,
        mode: "dom",
        surface: "active-tab",
        reason: "Fallback route does not automatically control the browser.",
      },
      intent: {
        summary: input.message.trim(),
        action: "answer",
        target: "conversation",
        constraints: [],
        needsClarification: false,
      },
      notes: [
        reason?.trim() ||
          "Agentic router unavailable; using only explicitly attached context and avoiding semantic keyword routing.",
      ],
      confidence: 0,
    },
    input,
  );
}

function normalizeStructuredInputIds(value: unknown, input: AgenticRouteInput): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const available = new Set((input.availableStructuredInputs ?? []).map((structuredInput) => structuredInput.id));
  if (!available.size) {
    return [];
  }

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!id || !available.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
    if (ids.length >= 8) {
      break;
    }
  }
  return ids;
}

export function routePlanToPromptRoutingPlan(plan: AgenticRoutePlan, input: AgenticRouteInput): PromptRoutingPlan {
  return {
    task: plan.task,
    contextMode: plan.contextMode,
    requiresVision: plan.requiresVision,
    pageReadStrategy: plan.pageReadStrategy,
    intent: plan.intent,
    browserControl: plan.browserControl,
    selectedProfileId: plan.selectedProfileId,
    selectedModel: plan.selectedModel,
    notes: plan.notes,
    reroutedProfile: plan.selectedProfileId !== input.selectedProfileId,
    reroutedModel: plan.selectedModel !== input.selectedModel,
  };
}

function normalizeIntent(
  rawIntent: unknown,
  input: AgenticRouteInput,
  imageEdit: AgenticImageEditRouting,
): AgenticIntentPlan {
  const raw = asRecord(rawIntent);
  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : input.message.trim();
  const action = INTENT_ACTIONS.has(raw.action as AgenticIntentAction)
    ? (raw.action as AgenticIntentAction)
    : imageEdit.shouldEdit
      ? "edit-image"
      : "answer";
  const target =
    imageEdit.target === "uploaded-image"
      ? "uploaded-file"
      : imageEdit.target === "page-image"
        ? "visible-image"
        : INTENT_TARGETS.has(raw.target as AgenticIntentTarget)
          ? (raw.target as AgenticIntentTarget)
          : inferFallbackIntentTarget(input, imageEdit);
  const constraints = Array.isArray(raw.constraints)
    ? raw.constraints
        .map((constraint) => (typeof constraint === "string" ? constraint.trim() : ""))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const needsClarification = typeof raw.needsClarification === "boolean" ? raw.needsClarification : false;
  const clarificationQuestion =
    typeof raw.clarificationQuestion === "string" && raw.clarificationQuestion.trim()
      ? raw.clarificationQuestion.trim()
      : undefined;

  return {
    summary,
    action,
    target,
    constraints,
    needsClarification,
    ...(clarificationQuestion ? { clarificationQuestion } : {}),
  };
}

function normalizeBrowserControl(
  rawBrowserControl: unknown,
  intent: AgenticIntentPlan,
  input: AgenticRouteInput,
): AgenticBrowserControlRouting {
  const raw = asRecord(rawBrowserControl);
  const defaultShouldControl =
    intent.action === "navigate" &&
    intent.target === "current-page" &&
    !intent.needsClarification;
  const preconditions = normalizeBrowserControlPreconditions(raw.preconditions);
  const shouldDeferBrowserAction = defaultShouldControl && preconditions.length > 0;
  const shouldControl = shouldDeferBrowserAction
    ? false
    : typeof raw.shouldControl === "boolean"
      ? raw.shouldControl
      : defaultShouldControl;
  const requestedMode = BROWSER_AUTOMATION_MODES.has(raw.mode as BrowserAutomationMode)
    ? (raw.mode as BrowserAutomationMode)
    : "dom";
  const requestedFallbackMode = BROWSER_AUTOMATION_MODES.has(raw.fallbackMode as BrowserAutomationMode)
    ? (raw.fallbackMode as BrowserAutomationMode)
    : undefined;
  const surface = BROWSER_CONTROL_SURFACES.has(raw.surface as BrowserControlSurface)
    ? (raw.surface as BrowserControlSurface)
    : defaultShouldControl
      ? "active-tab"
      : requestedMode === "playwright" || requestedFallbackMode === "playwright"
        ? "new-tab"
        : "active-tab";
  const forceCurrentPageDom =
    defaultShouldControl &&
    (shouldControl || shouldDeferBrowserAction) &&
    surface === "active-tab" &&
    raw.surface !== "new-tab" &&
    isBrowserAutomationModeAvailable("dom", input);
  const mode = forceCurrentPageDom
    ? "dom"
    : isBrowserAutomationModeAvailable(requestedMode, input)
    ? requestedMode
    : requestedFallbackMode && isBrowserAutomationModeAvailable(requestedFallbackMode, input)
      ? requestedFallbackMode
      : "dom";
  const fallbackMode =
    !forceCurrentPageDom && requestedFallbackMode && isBrowserAutomationModeAvailable(requestedFallbackMode, input)
      ? requestedFallbackMode
      : undefined;
  const reason =
    shouldDeferBrowserAction
      ? "Browser control is deferred until the agentic workflow completes upstream preconditions."
      : forceCurrentPageDom && requestedMode !== "dom"
      ? "Current-page browser actions run on the active tab through DOM control."
      : typeof raw.reason === "string" && raw.reason.trim()
      ? raw.reason.trim()
      : shouldControl
        ? "Resolved as a browser control request for the current page."
        : "No browser control required.";

  return {
    shouldControl,
    mode,
    surface,
    ...(fallbackMode && fallbackMode !== mode ? { fallbackMode } : {}),
    ...(preconditions.length ? { preconditions } : {}),
    reason,
  };
}

function normalizeBrowserControlForStructuredInputs(
  browserControl: AgenticBrowserControlRouting,
  structuredInputIds: string[],
): AgenticBrowserControlRouting {
  if (!structuredInputIds.length || !browserControl.shouldControl) {
    return browserControl;
  }

  return {
    shouldControl: false,
    mode: "dom",
    surface: "active-tab",
    ...(browserControl.preconditions?.length ? { preconditions: browserControl.preconditions } : {}),
    reason: "Connected app, plugin, or MCP input was selected, so the request is routed through Codex tools instead of browser automation.",
  };
}

function normalizeBrowserControlPreconditions(value: unknown): AgenticBrowserControlPrecondition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<AgenticBrowserControlPrecondition>();
  const preconditions: AgenticBrowserControlPrecondition[] = [];
  for (const item of value) {
    if (!BROWSER_CONTROL_PRECONDITIONS.has(item as AgenticBrowserControlPrecondition)) {
      continue;
    }
    const precondition = item as AgenticBrowserControlPrecondition;
    if (seen.has(precondition)) {
      continue;
    }
    seen.add(precondition);
    preconditions.push(precondition);
  }
  return preconditions;
}

function isBrowserAutomationModeAvailable(mode: BrowserAutomationMode, input: AgenticRouteInput): boolean {
  const capabilities = input.browserAutomationCapabilities;
  if (!capabilities) {
    return true;
  }
  if (mode === "dom") {
    return capabilities.dom !== false;
  }
  return capabilities[mode] === true;
}

function normalizeHistoryQuery(raw: Record<string, unknown>, input: AgenticRouteInput): string {
  if (typeof raw.historyQuery === "string") {
    return raw.historyQuery.trim();
  }
  return input.historyQuery?.trim() ?? "";
}

function shouldUseHistoryOnlyContext(intent: AgenticIntentPlan, input: AgenticRouteInput): boolean {
  if (intent.target !== "browser-history" || intent.needsClarification) {
    return false;
  }
  return input.explicitAttachments.every((source) => source === "history");
}

function inferFallbackIntentTarget(
  input: AgenticRouteInput,
  imageEdit: AgenticImageEditRouting,
): AgenticIntentTarget {
  if (imageEdit.target === "page-image") {
    return "visible-image";
  }
  if (imageEdit.target === "uploaded-image") {
    return "uploaded-file";
  }
  const uniqueAttachments = Array.from(new Set(input.explicitAttachments));
  if (uniqueAttachments.length !== 1) {
    return "conversation";
  }
  if (uniqueAttachments[0] === "open-tabs") {
    return "selected-tabs";
  }
  if (uniqueAttachments[0] === "history") {
    return "browser-history";
  }
  if (uniqueAttachments[0] === "current-page" || uniqueAttachments[0] === "selection") {
    return "current-page";
  }
  if (uniqueAttachments[0] === "image") {
    return "visible-image";
  }
  return "conversation";
}

function normalizeContextRequest(rawRequest: unknown, readStrategyOverride: ReadStrategy | "auto"): AgenticContextRequest | null {
  const raw = asRecord(rawRequest);
  if (!ROUTE_CONTEXT_SOURCES.has(raw.source as AgenticRouteContextSource)) {
    return null;
  }
  const source = raw.source as AgenticRouteContextSource;
  const readStrategy = READ_STRATEGIES.has(raw.readStrategy as ReadStrategy | "auto")
    ? (raw.readStrategy as ReadStrategy | "auto")
    : readStrategyOverride;
  const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : "Requested by the route planner.";

  return {
    source,
    readStrategy,
    required: typeof raw.required === "boolean" ? raw.required : true,
    reason,
  };
}

function shouldForceDomFirstCurrentPageContext(
  task: PromptRoutingTask,
  intent: AgenticIntentPlan,
  imageEdit: AgenticImageEditRouting,
  contextRequests: AgenticContextRequest[],
): boolean {
  if (imageEdit.shouldEdit || intent.target !== "current-page") {
    return false;
  }
  if (!["summarize", "extract", "answer"].includes(intent.action)) {
    return false;
  }
  const hasOverRequestedVisualContext = contextRequests.some(
    (request) =>
      request.source === "image" ||
      request.readStrategy === "vision" ||
      (request.readStrategy === "hybrid" && request.source === "current-page"),
  );
  if (!hasOverRequestedVisualContext) {
    return false;
  }
  return task === "visual-analysis" || task === "general" || task === "document-analysis";
}

function forceDomFirstCurrentPageContext(contextRequests: AgenticContextRequest[]): {
  task: PromptRoutingTask;
  contextRequests: AgenticContextRequest[];
  requiresVisionOverride: false;
} {
  const nextRequests = contextRequests
    .filter((request) => request.source !== "image")
    .map((request) =>
      request.source === "current-page" || request.source === "selection"
        ? {
            ...request,
            readStrategy: "dom" as const,
            reason:
              request.reason ||
              "Text-oriented current-page request should use the page DOM rather than a visible-screen capture.",
          }
        : request,
    );

  if (!nextRequests.some((request) => request.source === "current-page")) {
    nextRequests.unshift({
      source: "current-page",
      readStrategy: "dom",
      required: true,
      reason: "Text-oriented current-page request should use the page DOM rather than a visible-screen capture.",
    });
  }

  return {
    task: "document-analysis",
    contextRequests: nextRequests,
    requiresVisionOverride: false,
  };
}

function normalizeImageEdit(rawImageEdit: unknown, input: AgenticRouteInput): AgenticImageEditRouting {
  const raw = asRecord(rawImageEdit);
  const shouldEdit = typeof raw.shouldEdit === "boolean" ? raw.shouldEdit : false;
  const target = IMAGE_EDIT_TARGETS.has(raw.target as AgenticImageEditRouting["target"])
    ? (raw.target as AgenticImageEditRouting["target"])
    : shouldEdit
      ? "ambiguous"
      : "none";
  const targetFileId = typeof raw.targetFileId === "string" && raw.targetFileId.trim() ? raw.targetFileId.trim() : undefined;
  const prompt = typeof raw.prompt === "string" && raw.prompt.trim() ? raw.prompt.trim() : input.message.trim();
  const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : "No image edit route selected.";

  return {
    shouldEdit,
    target,
    ...(targetFileId ? { targetFileId } : {}),
    ...(shouldEdit && prompt ? { prompt } : {}),
    reason,
  };
}

function createSuppressedImagePromptAuthoringEditPlan(): AgenticImageEditRouting {
  return {
    shouldEdit: false,
    target: "none",
    reason: "The user asked for image-generation prompt text, not a changed visual output.",
  };
}

function createSuppressedImageGenerationEditPlan(): AgenticImageEditRouting {
  return {
    shouldEdit: false,
    target: "none",
    reason: "The user asked to generate a new image, not edit an existing image.",
  };
}

function createSuppressedTextPageSummaryEditPlan(): AgenticImageEditRouting {
  return {
    shouldEdit: false,
    target: "none",
    reason: "The current user message asks for a text/page summary, so prior image context must not trigger image editing.",
  };
}

function shouldKeepImageEditOverImageGeneration(
  rawPlan: Record<string, unknown>,
  imageEdit: AgenticImageEditRouting,
): boolean {
  const rawIntent = asRecord(rawPlan.intent);
  const modelResolvedExistingVisual =
    rawPlan.task === "image-edit" ||
    rawIntent.action === "edit-image" ||
    rawIntent.target === "visible-image" ||
    rawIntent.target === "uploaded-file" ||
    imageEdit.target === "page-image" ||
    imageEdit.target === "uploaded-image";

  return modelResolvedExistingVisual && imageEdit.shouldEdit;
}

function normalizeTextPageSummaryIntent(intent: AgenticIntentPlan, input: AgenticRouteInput): AgenticIntentPlan {
  return {
    ...intent,
    summary: intent.summary.trim() || input.message.trim(),
    action: "summarize",
    target: "current-page",
    needsClarification: false,
  };
}

function normalizeImageGenerationIntent(intent: AgenticIntentPlan, input: AgenticRouteInput): AgenticIntentPlan {
  const hasUploadedFile = input.fileAttachments.length > 0 || intent.target === "uploaded-file";
  const hasPageTarget =
    intent.target === "current-page" ||
    intent.target === "visible-image" ||
    input.explicitAttachments.includes("current-page") ||
    input.explicitAttachments.includes("image") ||
    input.explicitAttachments.includes("selection");
  return {
    ...intent,
    action: "generate-image",
    target: hasPageTarget ? "current-page" : hasUploadedFile ? "uploaded-file" : "conversation",
    needsClarification: false,
  };
}

function isModelPlannedImageGeneration(rawPlan: Record<string, unknown>, rawIntent: Record<string, unknown>): boolean {
  if (rawIntent.action === "generate-image") {
    return true;
  }
  if (rawPlan.task !== "image-generate") {
    return false;
  }

  // If the model returned a contradictory recognized action, trust the action
  // over the coarse task label so text summaries do not become image jobs.
  if (typeof rawIntent.action === "string" && INTENT_ACTIONS.has(rawIntent.action as AgenticIntentAction)) {
    return false;
  }
  return true;
}

function isModelPlannedTextPageSummary(rawPlan: Record<string, unknown>, rawIntent: Record<string, unknown>): boolean {
  if (rawIntent.target !== "current-page") {
    return false;
  }
  if (rawIntent.action !== "summarize" && rawIntent.action !== "extract") {
    return false;
  }
  return true;
}

function repairIncompleteImageEditPlan(
  rawPlan: Record<string, unknown>,
  imageEdit: AgenticImageEditRouting,
  input: AgenticRouteInput,
): AgenticImageEditRouting {
  if (imageEdit.shouldEdit) {
    return repairActionableImageEditPlan(imageEdit, input, asRecord(rawPlan.intent));
  }

  const rawIntent = asRecord(rawPlan.intent);
  const modelSignaledImageEdit = rawPlan.task === "image-edit" || rawIntent.action === "edit-image";
  if (!modelSignaledImageEdit) {
    return imageEdit;
  }

  const uploadedImage = input.fileAttachments.find((attachment) => attachment.kind === "image");
  const canUsePageImage = input.activeTab?.restricted === false;
  const intentTarget = rawIntent.target;
  const target =
    intentTarget === "uploaded-file" && uploadedImage
      ? "uploaded-image"
      : (intentTarget === "visible-image" || intentTarget === "current-page") && canUsePageImage
        ? "page-image"
        : canUsePageImage && !uploadedImage
          ? "page-image"
          : uploadedImage
            ? "uploaded-image"
            : canUsePageImage
              ? "page-image"
              : "none";

  if (target === "none") {
    return imageEdit;
  }

  return {
    shouldEdit: true,
    target,
    ...(target === "uploaded-image" && uploadedImage?.id ? { targetFileId: uploadedImage.id } : {}),
    prompt: input.message.trim(),
    reason: "Recovered from a model image-edit task or intent with incomplete imageEdit fields.",
  };
}

function repairActionableImageEditPlan(
  imageEdit: AgenticImageEditRouting,
  input: AgenticRouteInput,
  rawIntent: Record<string, unknown>,
): AgenticImageEditRouting {
  const uploadedImages = input.fileAttachments.filter((attachment) => attachment.kind === "image");
  const uploadedImage = imageEdit.targetFileId
    ? uploadedImages.find((attachment) => attachment.id === imageEdit.targetFileId) ?? uploadedImages[0]
    : uploadedImages[0];
  const canUsePageImage = input.activeTab?.restricted === false;
  const intentTarget = rawIntent.target;

  if (imageEdit.target === "uploaded-image") {
    return {
      ...imageEdit,
      ...(imageEdit.targetFileId || !uploadedImage?.id ? {} : { targetFileId: uploadedImage.id }),
    };
  }

  if (imageEdit.target === "page-image" || imageEdit.target === "none") {
    return imageEdit;
  }

  if ((intentTarget === "visible-image" || intentTarget === "current-page") && canUsePageImage) {
    return {
      ...imageEdit,
      target: "page-image",
      reason: imageEdit.reason || "Resolved ambiguous image edit to the visible page image.",
    };
  }

  if ((intentTarget === "uploaded-file" || uploadedImages.length === 1) && uploadedImage) {
    return {
      ...imageEdit,
      target: "uploaded-image",
      targetFileId: uploadedImage.id,
      reason: imageEdit.reason || "Resolved ambiguous image edit to the uploaded image.",
    };
  }

  return imageEdit;
}

function selectProfileId(candidate: unknown, fallback: string, availableProfileIds: string[] = []): string {
  const profileIds = new Set([
    ...listProfileTemplates().map((profile) => profile.id),
    ...availableProfileIds.map((profileId) => profileId.trim()).filter(Boolean),
  ]);
  const requested = typeof candidate === "string" ? candidate.trim() : "";
  const selected = fallback.trim();
  if (selected && selected !== "default" && profileIds.has(selected)) {
    return selected;
  }
  if (requested && profileIds.has(requested)) {
    return requested;
  }
  if (profileIds.has(selected)) {
    return selected;
  }
  return "default";
}

function selectModel(input: {
  requestedModel: string;
  fallbackModel: string;
  requiresVision: boolean;
  models: AgenticRouteInput["models"];
}): string {
  const requested = input.requestedModel.trim();
  const fallback = input.fallbackModel.trim();
  const requestedModel = input.models.find((model) => model.id === requested);
  const fallbackModel = input.models.find((model) => model.id === fallback);
  const selected = requestedModel?.id ?? fallbackModel?.id ?? fallback;

  if (!input.requiresVision) {
    return selected;
  }

  if (requestedModel?.supportsImages) {
    return requestedModel.id;
  }
  if (fallbackModel?.supportsImages) {
    return fallbackModel.id;
  }
  return input.models.find((model) => model.supportsImages)?.id ?? selected;
}

function deriveContextMode(
  contextRequests: AgenticContextRequest[],
  hasFiles: boolean,
): PromptRoutingContextMode {
  const hasContext = contextRequests.length > 0;
  if (hasContext && hasFiles) {
    return "page-plus-files";
  }
  if (hasContext) {
    return "page-only";
  }
  return hasFiles ? "files-only" : "none";
}

function derivePageReadStrategy(
  contextRequests: AgenticContextRequest[],
  readStrategyOverride: ReadStrategy | "auto",
  requiresVision: boolean,
): ReadStrategy | "auto" {
  if (readStrategyOverride !== "auto") {
    return readStrategyOverride;
  }

  const requested = contextRequests
    .filter((request) => request.source === "current-page" || request.source === "selection" || request.source === "image")
    .map((request) => request.readStrategy)
    .filter((strategy) => strategy !== "auto");
  if (requested.includes("vision")) {
    return "vision";
  }
  if (requested.includes("hybrid")) {
    return "hybrid";
  }
  if (requested.includes("adapter")) {
    return "adapter";
  }
  if (requested.includes("dom")) {
    return "dom";
  }
  return requiresVision ? "hybrid" : "auto";
}

function normalizeNotes(notes: unknown): string[] {
  if (!Array.isArray(notes)) {
    return [];
  }
  return notes.map((note) => (typeof note === "string" ? note.trim() : "")).filter(Boolean).slice(0, 8);
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
