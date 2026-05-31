import type {
  BrowserDomActionKind,
  BrowserDomActionPlan,
  BrowserDomActionStep,
  BrowserDomElementSnapshot,
  BrowserDomSnapshot,
} from "@codex-sidepanel/shared";

import type { CodexAppServerClient } from "./codex-app-server.js";
import type { BridgeHarnessRuntime } from "./harness.js";
import type { BridgeBrowserActionPlane, BridgeEvent } from "./types.js";
import { extractJsonObject } from "./agentic-router.js";
import { requestTurnStartWithReasoningSummaryFallback } from "./turn-start.js";

type NotificationPayload = {
  method: string;
  params?: Record<string, unknown>;
};

const BROWSER_ACTION_PLAN_TIMEOUT_MS = 25_000;
const ACTIONS = new Set<BrowserDomActionKind>(["click", "fill", "select", "scroll", "focus", "submit", "navigate"]);
const DIRECTIONS = new Set(["up", "down", "left", "right", "top", "bottom"]);

export class CodexBrowserActionPlane implements BridgeBrowserActionPlane {
  readonly #client: CodexAppServerClient;
  readonly #harness: BridgeHarnessRuntime;

  constructor(options: { client: CodexAppServerClient; harness: BridgeHarnessRuntime }) {
    this.#client = options.client;
    this.#harness = options.harness;
  }

  async plan(
    params: { message: string; snapshot: BrowserDomSnapshot; locale?: string; generatedText?: string },
    emit: (event: BridgeEvent) => void,
  ): Promise<BrowserDomActionPlan> {
    emit({ type: "browser.action.plan.started", clientRequestId: null });
    try {
      const rawPlan = await this.#requestModelPlan(params);
      const plan = normalizeBrowserDomActionPlan(rawPlan, params.snapshot);
      emit({ type: "browser.action.plan.created", plan });
      return plan;
    } catch (error) {
      const plan: BrowserDomActionPlan = {
        shouldAct: false,
        summary: error instanceof Error ? error.message : String(error),
        steps: [],
        requiresConfirmation: true,
        confidence: 0,
      };
      emit({ type: "browser.action.plan.created", plan });
      return plan;
    }
  }

  async #requestModelPlan(params: {
    message: string;
    snapshot: BrowserDomSnapshot;
    locale?: string;
    generatedText?: string;
  }): Promise<unknown> {
    const cwd = await this.#harness.getWorkspaceRoot();
    const thread = (await this.#client.request("thread/start", {
      ...(cwd ? { cwd } : {}),
      approvalPolicy: "never",
      personality: "pragmatic",
      serviceName: "codex-chrome-sidepanel-browser-action-planner",
      sessionStartSource: "startup",
      ephemeral: true,
      persistExtendedHistory: false,
      experimentalRawEvents: false,
    })) as { thread?: { id?: string } };
    const threadId = thread.thread?.id;
    if (!threadId) {
      throw new Error("Codex app-server did not return a thread id for browser action planning.");
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
              text: createBrowserDomActionPlanPrompt(params),
              text_elements: [],
            },
          ],
          ...(cwd ? { cwd } : {}),
          effort: "low",
          approvalPolicy: "never",
          personality: "pragmatic",
        },
      );
      turnId = String(turn.turn?.id ?? "");
      await withTimeout(completed, BROWSER_ACTION_PLAN_TIMEOUT_MS);
      return extractJsonObject(assistantText);
    } finally {
      unsubscribe();
    }
  }
}

export function createBrowserDomActionPlanPrompt(params: {
  message: string;
  snapshot: BrowserDomSnapshot;
  locale?: string;
  generatedText?: string;
}): string {
  const generatedText = params.generatedText?.trim();
  return [
    "You are the DOM action planner for a Chrome side-panel assistant.",
    "Plan only. Do not answer the user. Do not write JavaScript. Do not invent elements.",
    "Return exactly one JSON object. No Markdown. No prose.",
    "",
    "Allowed actions:",
    "- click: click a visible page element.",
    "- fill: set text in a visible native field, contenteditable/editor surface, or proxy composer control that reveals an editor.",
    "- select: set a visible select/listbox value.",
    "- scroll: scroll the page or an element.",
    "- focus: focus a visible element.",
    "- submit: submit the nearest form for a visible form element.",
    "- navigate: move the current tab to a user-requested http(s) URL or same-site relative URL.",
    "",
    "Modern editor policy:",
    "- Many sites expose post, reply, comment, search, and message composers as proxy composer controls before an actual input appears.",
    "- If a visible button/div/role control semantically opens the needed editor, plan a click/focus on that opener before fill.",
    "- If the future editor selector is unknown, a fill step may target the same opener; the runtime will resolve the newly visible editor after activation.",
    "- Do not fail solely because no input/textarea/contenteditable field is currently visible when an opener for the requested editor is visible.",
    "- Prefer elements marked isTextEntryCandidate for direct text entry; prefer opensEditableSurface when the editor must be opened first.",
    "",
    "Safety policy:",
    "- Use only targetRef values from domElements unless targetRef is not available and selector is copied exactly from domElements.",
    "- A navigate step does not need targetRef or selector, but it must include url.",
    "- For navigate, only use a URL explicitly requested by the user or copied from a visible href/page URL. Do not invent destination URLs.",
    "- Do not plan purchases, payments, checkout, paid subscriptions, order placement, or money transfers. For those, return shouldAct=false and explain that Codex cannot complete payment actions.",
    "- You may plan non-payment site mutations such as sending messages, emails, posting, form submission, navigation, editing, or deleting only when the user's wording clearly requests that action and the target is visible.",
    "- Prefer the smallest set of steps that completes the user's explicit intent. If the user's intent is ambiguous, return shouldAct=false.",
    "- Never output arbitrary JavaScript, XPath, or hidden-element selectors.",
    ...(generatedText
      ? [
          "",
          "Generated content policy:",
          "- generatedText is content already produced by the upstream agent for the user's page action.",
          "- Use generatedText as the exact fill value for fill steps unless the user explicitly asked for a shorter transformation in userMessage.",
          "- Do not fill surrounding assistant instructions, explanations, Markdown fences, or status text.",
          "- If the user asked to draft without publishing, fill the composer but do not submit or post.",
        ]
      : []),
    "",
    "Schema:",
    JSON.stringify(
      {
        shouldAct: true,
        summary: "short user-facing summary of the planned browser action",
        steps: [
          {
            action: "click | fill | select | scroll | focus | submit | navigate",
            targetRef: "dom-1",
            selector: "optional exact selector from domElements",
            label: "optional human label",
            value: "text/value for fill/select",
            url: "https://example.com/path for navigate",
            direction: "up | down | left | right | top | bottom",
            amountPx: 600,
            reason: "short reason",
          },
        ],
        requiresConfirmation: true,
        confidence: 0.8,
      },
      null,
      2,
    ),
    "",
    "Runtime input:",
    JSON.stringify(
      {
        userMessage: params.message,
        ...(generatedText ? { generatedText } : {}),
        locale: params.locale ?? "",
        page: params.snapshot.metadata,
        domElements: params.snapshot.elements.map((element) => ({
          ref: element.ref,
          role: element.role,
          tagName: element.tagName,
          label: element.label,
          text: element.text,
          selector: element.selector,
          value: element.value ?? "",
          href: element.href ?? "",
          inputType: element.inputType ?? "",
          disabled: element.disabled,
          placeholder: element.placeholder ?? "",
          contentEditable: element.contentEditable ?? "",
          ariaExpanded: element.ariaExpanded ?? "",
          ariaHasPopup: element.ariaHasPopup ?? "",
          ariaControls: element.ariaControls ?? "",
          tabIndex: element.tabIndex,
          isTextEntryCandidate: Boolean(element.isTextEntryCandidate),
          opensEditableSurface: Boolean(element.opensEditableSurface),
          viewportRect: element.viewportRect,
        })),
      },
      null,
      2,
    ),
  ].join("\n");
}

export function normalizeBrowserDomActionPlan(rawPlan: unknown, snapshot: BrowserDomSnapshot): BrowserDomActionPlan {
  const raw = asRecord(rawPlan);
  const validRefs = new Set(snapshot.elements.map((element) => element.ref));
  const validSelectors = new Set(snapshot.elements.map((element) => element.selector).filter(Boolean));
  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .map((step) => normalizeBrowserDomActionStep(step, validRefs, validSelectors, snapshot.metadata.url))
        .filter((step): step is BrowserDomActionStep => step !== null)
        .slice(0, 4)
    : [];
  const shouldAct = raw.shouldAct === true && steps.length > 0;

  return {
    shouldAct,
    summary:
      typeof raw.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : shouldAct
          ? "Perform the requested browser action."
          : "No safe browser action was planned.",
    steps: shouldAct ? steps : [],
    requiresConfirmation: raw.requiresConfirmation !== false,
    confidence: clampConfidence(raw.confidence),
  };
}

function normalizeBrowserDomActionStep(
  rawStep: unknown,
  validRefs: Set<string>,
  validSelectors: Set<string>,
  baseUrl: string,
): BrowserDomActionStep | null {
  const raw = asRecord(rawStep);
  if (!ACTIONS.has(raw.action as BrowserDomActionKind)) {
    return null;
  }
  const targetRef = typeof raw.targetRef === "string" && validRefs.has(raw.targetRef) ? raw.targetRef : undefined;
  const selector = typeof raw.selector === "string" && validSelectors.has(raw.selector) ? raw.selector : undefined;
  const url = normalizeNavigationUrl(raw.url ?? raw.value, baseUrl);
  if (raw.action === "navigate" && !url) {
    return null;
  }
  if (raw.action !== "scroll" && raw.action !== "navigate" && !targetRef && !selector) {
    return null;
  }
  const direction = typeof raw.direction === "string" && DIRECTIONS.has(raw.direction) ? raw.direction : undefined;
  const amountPx = typeof raw.amountPx === "number" && Number.isFinite(raw.amountPx)
    ? Math.max(0, Math.min(2_000, Math.round(raw.amountPx)))
    : undefined;
  const step: BrowserDomActionStep = {
    action: raw.action as BrowserDomActionKind,
    reason:
      typeof raw.reason === "string" && raw.reason.trim()
        ? raw.reason.trim().slice(0, 240)
        : "Requested browser action.",
  };
  if (targetRef) {
    step.targetRef = targetRef;
  }
  if (selector) {
    step.selector = selector;
  }
  if (typeof raw.label === "string" && raw.label.trim()) {
    step.label = raw.label.trim().slice(0, 120);
  }
  if (typeof raw.value === "string") {
    step.value = raw.value.slice(0, 4_000);
  }
  if (url) {
    step.url = url;
  }
  if (direction) {
    step.direction = direction as Exclude<BrowserDomActionStep["direction"], undefined>;
  }
  if (typeof amountPx === "number") {
    step.amountPx = amountPx;
  }
  return step;
}

function normalizeNavigationUrl(value: unknown, baseUrl: string): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(trimmed)
    ? trimmed
    : /^([a-z\d-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/iu.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;
  try {
    const url = new URL(candidate, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function clampConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Browser action planning timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
