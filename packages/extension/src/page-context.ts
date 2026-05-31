import type { ContentProbeResult, PromptRequestPayload, UiInitPayload } from "./types.js";
import type { AgenticContextRequest, PromptRoutingContextMode, PromptRoutingPlan, RawPageCapture, ReadStrategy } from "@codex-sidepanel/shared";

export type CurrentPageSupport = UiInitPayload["currentPageSupport"];

const CURRENT_PAGE_ATTACHMENTS = new Set<PromptRequestPayload["attachments"][number]>([
  "current-page",
  "selection",
  "image",
]);

export function isCurrentPageAttachment(
  attachment: PromptRequestPayload["attachments"][number],
): boolean {
  return CURRENT_PAGE_ATTACHMENTS.has(attachment);
}

export function sanitizeUnavailableCurrentPageAttachments(
  attachments: PromptRequestPayload["attachments"],
  support: CurrentPageSupport,
): PromptRequestPayload["attachments"] {
  if (support.available) {
    return [...attachments];
  }

  return attachments.filter((attachment) => !isCurrentPageAttachment(attachment));
}

export function ensureDefaultCurrentPageContextRequests(
  requests: AgenticContextRequest[],
  support: CurrentPageSupport,
  options: { suppressDefault?: boolean } = {},
): AgenticContextRequest[] {
  if (options.suppressDefault || !support.available || requests.some((request) => request.source === "current-page")) {
    return [...requests];
  }

  return [
    {
      source: "current-page",
      readStrategy: "auto",
      required: true,
      reason: "Default browser assistant context: the currently viewed page.",
    },
    ...requests,
  ];
}

export function filterSuppressedPageContextRequests(
  requests: AgenticContextRequest[],
  explicitAttachments: PromptRequestPayload["attachments"] = [],
): AgenticContextRequest[] {
  const explicitPageAttachments = new Set(
    explicitAttachments.filter(isCurrentPageAttachment),
  );

  return requests.filter((request) => {
    if (request.source !== "current-page" && request.source !== "selection" && request.source !== "image") {
      return true;
    }
    return explicitPageAttachments.has(request.source);
  });
}

export function shouldSuppressDefaultCurrentPageContextForHistory(
  routePlan: PromptRoutingPlan,
  requests: AgenticContextRequest[],
): boolean {
  if (routePlan.intent?.target !== "browser-history") {
    return false;
  }
  if (!requests.some((request) => request.source === "history")) {
    return false;
  }
  return !requests.some((request) => request.source === "current-page" || request.source === "selection" || request.source === "image");
}

export function createEffectivePromptRoutePlan(
  routePlan: PromptRoutingPlan,
  contextRequests: AgenticContextRequest[],
  hasFiles: boolean,
): PromptRoutingPlan {
  return {
    ...routePlan,
    contextMode: resolvePromptContextMode(contextRequests.length > 0, hasFiles),
    notes: contextRequests.some((request) => request.source === "current-page")
      ? appendUniqueNote(routePlan.notes, "Current page DOM context is attached by default.")
      : routePlan.notes,
  };
}

export function shouldAttachVisualAssetsForReadStrategy(readStrategy: ReadStrategy | "auto"): boolean {
  return readStrategy === "vision" || readStrategy === "hybrid";
}

export function createRawCaptureForReadStrategy(
  rawCapture: ContentProbeResult["rawCapture"],
  readStrategy: ReadStrategy | "auto",
  screenshotRef?: string,
): RawPageCapture {
  if (!shouldAttachVisualAssetsForReadStrategy(readStrategy)) {
    const { screenshotRef: _ignoredScreenshotRef, ...rest } = rawCapture as RawPageCapture;
    void _ignoredScreenshotRef;
    return {
      ...rest,
      images: [],
    };
  }

  return screenshotRef
    ? {
        ...rawCapture,
        screenshotRef,
      }
    : rawCapture;
}

function resolvePromptContextMode(hasPageContext: boolean, hasFiles: boolean): PromptRoutingContextMode {
  if (hasPageContext && hasFiles) {
    return "page-plus-files";
  }
  if (hasPageContext) {
    return "page-only";
  }
  return hasFiles ? "files-only" : "none";
}

function appendUniqueNote(notes: string[], note: string): string[] {
  return notes.includes(note) ? notes : [...notes, note];
}
