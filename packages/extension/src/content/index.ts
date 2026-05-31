import { collectArxivAdapterPayload, isArxivUrl } from "../adapters/arxiv.js";
import { collectGoogleWorkspaceAdapterPayload, isGoogleWorkspaceUrl } from "../adapters/google-workspace.js";
import { collectPdfAdapterPayload, isLikelyPdfUrl } from "../adapters/pdf.js";
import { collectYouTubeAdapterPayload, collectYouTubePlaybackState, isYouTubeUrl } from "../adapters/youtube.js";
import { collectBodyText } from "./dom-text.js";
import { extractCssImageUrls, sortEditablePageImageCandidates, type EditablePageImageCandidate } from "../page-image-target.js";
import { createSelectedTextContextExcerpt } from "../page-selection-context.js";
import { resolveImagePreviewRefForUi } from "../sidepanel/image-preview-assets.js";
import { createSitePayload } from "../site-payload.js";
import type { VoiceNavigationCommand } from "../sidepanel/voice-commands.js";
import type {
  BrowserAutomationMode,
  BrowserDomActionResult,
  BrowserDomActionStep,
  BrowserDomElementSnapshot,
  BrowserDomSnapshot,
} from "@codex-sidepanel/shared";

type ImagePromptHoverTarget = {
  element: Element;
  url: string;
  candidate: EditablePageImageCandidate;
  anchorRect: DOMRect;
  image?: HTMLImageElement;
};

type PageSelectionContextSnapshot = {
  text: string;
  contextText?: string;
};

let overlayNode: HTMLDivElement | null = null;
let aiControlOverlayNode: HTMLDivElement | null = null;
let aiControlOverlayTimer: number | null = null;
let aiControlOverlayWatchdogTimer: number | null = null;
let aiControlCancelled = false;
let imagePromptHoverInstalled = false;
let imagePromptHoverEnabled = true;
let imagePromptHoverAbortController: AbortController | null = null;
let imagePromptHoverStorageListenerRegistered = false;
let imagePromptHoverButton: HTMLButtonElement | null = null;
let imagePromptHoverTarget: ImagePromptHoverTarget | null = null;
let imagePromptHoverTargetRect: DOMRect | null = null;
let imagePromptHoverButtonRect: DOMRect | null = null;
let imagePromptHoverButtonRemoveTimer: number | null = null;
let imagePromptHoverScrollFrame: number | null = null;
let imagePromptHoverLastPointer: { clientX: number; clientY: number } | null = null;
let pageSelectionContextTimer: number | null = null;
let lastPageSelectionContextSignature = "";
let lastDictationEditableTarget: HTMLElement | HTMLInputElement | HTMLTextAreaElement | null = null;
let chromexRuntimeWatchdogTimer: number | null = null;
let chromexRuntimeMessageListenerRegistered = false;
const CHROMEX_CONTENT_INSTANCE_KEY = "__chromexContentScriptInstanceId";
const CHROMEX_CONTENT_CLEANUP_KEY = "__chromexContentScriptCleanup";
const chromexContentScriptInstanceId = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
const chromexContentGlobal = globalThis as typeof globalThis & Record<string, unknown>;
const chromexContentScriptAbortController = new AbortController();
const SETTINGS_STORAGE_KEY = "codex.sidepanel.settings";
const IMAGE_PROMPT_HOVER_BUTTON_CLASS = "chromex-image-prompt-button";
const IMAGE_PROMPT_HOVER_BUTTON_SELECTOR = `.${IMAGE_PROMPT_HOVER_BUTTON_CLASS}`;
const IMAGE_PROMPT_HOVER_SURFACE_PADDING_PX = 8;
const IMAGE_PROMPT_HOVER_BUTTON_SIZE_PX = 34;
const IMAGE_PROMPT_HOVER_BUTTON_INSET_PX = 8;
const IMAGE_PROMPT_HOVER_FADE_MS = 140;
const PAGE_SELECTION_CONTEXT_MAX_CHARS = 12_000;
const PAGE_SELECTION_CONTEXT_MIN_CHARS = 2;
const PAGE_SELECTION_CONTEXT_DEBOUNCE_MS = 140;
const IMAGE_PROMPT_HOVER_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAGUklEQVR4nO1XW2wdVxVde8/Mvfb1O8RpEqcuVVpKXpDY1IlNnYYWtfkoUj9IoPlADRKoH6ggBEREguubtIUqUhFBSFR8IVqldUE8hAKigI3IRxUckTZxozq4jeNH7Ov7HN87rzPnbD4cRBzHN6EUJKQuaTTas+fMWmefffY+A7yP/xcMDoolIvaQiC1Xr6EhsQGh/zq5yK2RyKBYMrQo7FbH3PQlESEiktffina3rnYeCCqGOTawDVPkytQ93fbz6bRwJkPmVgivh13LOTgoFhHpP19SD7hJ648hgEQjQxSjjoGGVuC109GuXT10UNLCkw/GDyXBfX41vvzO7MwLnzh4Z/DPCbwrAe37FiN0WZl9q1ps+HOhX++QrbUgmWSwIUqtdR7/3dlw46lINd1mOduNAhqTCazl9Z85eXLskYEBKEAA3FgE1xIwfPVeUICyIU6r7Uij7VjNjuMRO6WY7ClXmbAu0e86zvaLBWX+nlXxhcsqakgmPrmGN3w6kyEzNATrXUUAw0BahMPzissRKPYFRAAZQGtAR4BEzHCVtnxQKiSuD8F1gcRuHsbzZItAaLgGRY0ICKEdnCEygUZDIQTmQ6AYihRCIB8AhRDIhdDFgNgNiN1ApOwLXB+oVsAqABNImsZWTvYau0AIIDl2JtpdrrN+ERppgzYSicVJEBxt4AeQRGCRHWpoj+BUBG1KS8qHdHCCWhviv7560O7NEJmVknF5BEQonRYWgf30GfW9GbKGsh6vylWMTFYdbs76iHNeVFJkPGVRl509ymE0DC26QVxkKwlaiIAZN5bIs3se/Zk6OTJSaBkYAN2oNiwTsO+VVziTIfPMiHp+rs7+yqW8QX4h1jnP4btcf/pI59xH2uqdv8TMDDfM7bt//qmsn1iTYDn7jYOFbR9oLk9nvQQXlWA8q2JdcR62ZlLHr9aJZQKWPEiLcIbIHDsrW8+XcG48p+OUAxJY1k7bnz3aPf/xIxMd+wOmp2fKzC1l78SmhJUerSbHODRGSvLt40+Onzj+43WnZt5uWtfOkWkjknvuZmrZGHRt6298XUSY6F9Fa0kEhocX7dPTest4FhIWBV6JeJWn/aN7JrofHV6/pZS0vjNXNCoOgfWsfnOuYPcrAfJ5rZS2ntr/xB1dT37hQpeVUF7esyhXEcnnLM5d5k0AMDywlHOJsWYeAgD1thQrcyAzD5KCSOiR/bmX797z0o78qH4niKeKdlIXYv1IZ3i6UMWnykXgyoyVqI98OX547sKhb3XvDiLLXghFih7RlRwQgIoAML8FsqKAzaOLzp88FL25sSHy5+aYopxBLiu2sqwXv/rGbX3f757pW2/isgn0xBqhql+V+2engY1tuvzcF2f3/OjXndtMyno5VzZOxTOYz1skLX517wF5EwBGR2sIyGTIpNPCNjdMfXmXf2JvL/NMiUypIBif1mYywE+/dvGO+0CYWF1nfvvsmdYNkbHbdGhMTDJ25JedPVN5nLh4KTalskGhIGZbH3PP3uBXbKUm0+n0sqa1rBIODEAyGaB/U8vh25vcjh3tqYd/8CpkwRMKZ2Lxjf1c6AFrbfiWQm+5bMSEGhPZRE+5gp7yrBLyhJLKYP9jYt+7s3Tu9g0Nz8oKvbJmOxaR1orrfv3AC6lDp8eJW5sFxsBwDK5P2MQRoEoxLAVwJMIRdNKIrUsi925mOvRN7+ct9fWZxsbE+ZU64oq9IL24XUoi8kwxjg5oJD5Y9WJDhixSgJ9XBiHgaGJHCzgCObGxKdJiRw5JEOc62ukwUXKs1uFkxV6QocV8SFpUbV3NkyHBBL5I6Ak816BYAHxPo7qgTPZKbLxigLAcIl6IhKokzSnMA5OXbnYyqtmOsWeYIwN8fkf4h50fAxdjaDcSHRhj+rYKf/dxzcee0NzbJVwqK1PNKh3NI978IZt2PxiNsLU1GhhAzQPJzXKAiEhE3PY/XaTfj5Qat0/PAh9uNuhdtzC5rk1eZKbqlbx+7NS51Oa3xwgdrQl8dKubva9f9iap7W/XV75/S8ASEZ7XOV+RL4Va7qp35K1kMnGiqSn5BgD44t8ZLqjP5spml8VwV7XSD1saWl67+v0VZ3/LuHYdReTaZaPrfNaNxrwnEJFryOR64mttSqeldm79p0Jq+/4HPyrv473EPwCDrLro15fZ9wAAAABJRU5ErkJggg==";
const highlightedElements = new Set<HTMLElement>();
const domActionElementRefs = new Map<string, HTMLElement>();
const AI_CONTROL_OVERLAY_MAX_MS = 45_000;
type ImagePromptAttachmentPayload = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  base64: string;
  kind: "image";
  sourceUrl?: string;
};
const EDITOR_LIKE_SELECTOR = [
  'input:not([type="hidden"])',
  "textarea",
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
  '[aria-multiline="true"]',
  '[data-lexical-editor="true"]',
  '[data-slate-editor="true"]',
  ".ProseMirror",
  ".ql-editor",
].join(",");
const EDITOR_DISCOVERY_TIMEOUT_MS = 900;

cleanupPreviousContentScriptInstance();
removeStaleAiControlOverlays();
chromexContentGlobal[CHROMEX_CONTENT_INSTANCE_KEY] = chromexContentScriptInstanceId;
chromexContentGlobal[CHROMEX_CONTENT_CLEANUP_KEY] = cleanupContentScriptInstance;

registerChromexRuntimeMessageListener();
startContentScriptRuntimeWatchdog();
initializeImagePromptHoverSetting();
installPageSelectionContextBridge();
installDictationFocusBridge();

function getSafeChromeRuntime(): typeof chrome.runtime | null {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      return null;
    }
    return chrome.runtime;
  } catch {
    return null;
  }
}

function getSafeChromeStorage(): typeof chrome.storage | null {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.id || !chrome.storage?.local) {
      return null;
    }
    return chrome.storage;
  } catch {
    return null;
  }
}

function registerChromexRuntimeMessageListener(): void {
  const runtime = getSafeChromeRuntime();
  if (!runtime) {
    return;
  }
  runtime.onMessage.addListener(chromexRuntimeMessageListener);
  chromexRuntimeMessageListenerRegistered = true;
}

function startContentScriptRuntimeWatchdog(): void {
  if (chromexRuntimeWatchdogTimer !== null) {
    return;
  }
  chromexRuntimeWatchdogTimer = window.setInterval(() => {
    if (!getSafeChromeRuntime()) {
      try {
        cleanupContentScriptInstance();
      } catch {
        // If Chrome is tearing down this isolated world, avoid surfacing another uncaught page error.
      }
    }
  }, 1000);
}

function stopContentScriptRuntimeWatchdog(): void {
  if (chromexRuntimeWatchdogTimer === null) {
    return;
  }
  window.clearInterval(chromexRuntimeWatchdogTimer);
  chromexRuntimeWatchdogTimer = null;
}

function safeRemoveElement(element: Element | null | undefined): void {
  if (!element) {
    return;
  }
  try {
    element.remove();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return;
    }
    throw error;
  }
}

function chromexRuntimeMessageListener(
  message: Record<string, any>,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean {
  if (message.type === "page.ping") {
    if (!isActiveContentScriptInstance()) {
      return false;
    }
    sendResponse({ ok: true });
    return false;
  }

  if (!isActiveContentScriptInstance()) {
    return false;
  }

  if (message.type === "page.collect") {
    void collectPageProbe()
      .then((probe) => sendResponse(probe))
      .catch((error) => {
        sendResponse({
          error: error instanceof Error ? error.message : String(error),
          rawCapture: {
            metadata: {
              url: window.location.href,
              title: document.title,
              domain: window.location.hostname,
            },
          },
        });
      });
    return true;
  }

  if (message.type === "page.apply-image-overlay") {
    void applyImageOverlay(message.previewRef)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message.type === "page.clear-image-overlay") {
    clearImageOverlay();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "page.image-prompt-hover.install") {
    installImagePromptHover();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "page.navigate") {
    sendResponse(handlePageNavigation(message.command));
    return true;
  }

  if (message.type === "page.ai-control.start") {
    aiControlCancelled = false;
    showAiControlOverlay(normalizeBrowserAutomationMode(message.mode), typeof message.label === "string" ? message.label : undefined);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "page.ai-control.stop") {
    aiControlCancelled = true;
    scheduleHideAiControlOverlay(Number(message.delayMs) || 0);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "page.dom.snapshot") {
    sendResponse(collectBrowserDomSnapshot());
    return true;
  }

  if (message.type === "page.dom.perform") {
    const steps = Array.isArray(message.steps) ? message.steps : [];
    performBrowserDomActions(steps).then(sendResponse).catch((error) => {
      scheduleHideAiControlOverlay(0);
      sendResponse({
        ok: false,
        summary: error instanceof Error ? error.message : String(error),
        results: [],
        controlMode: "dom",
      });
    });
    return true;
  }

  if (message.type === "page.dictation.insert") {
    sendResponse(insertDictationTextIntoFocusedEditable(String(message.text ?? "")));
    return true;
  }

  if (message.type === "page.selection.snapshot") {
    sendResponse(getSelectedPageContextSnapshot());
    return true;
  }

  if (message.type === "youtube.seek") {
    const video = document.querySelector("video");
    if (video) {
      video.currentTime = Number(message.seconds) || 0;
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "youtube.current-state") {
    sendResponse(collectYouTubePlaybackState());
    return true;
  }

  return false;
}

function isActiveContentScriptInstance(): boolean {
  return chromexContentGlobal[CHROMEX_CONTENT_INSTANCE_KEY] === chromexContentScriptInstanceId;
}

function cleanupPreviousContentScriptInstance(): void {
  const cleanup = chromexContentGlobal[CHROMEX_CONTENT_CLEANUP_KEY];
  if (typeof cleanup !== "function") {
    return;
  }
  try {
    cleanup();
  } catch {
    // A previous content script can already be invalidated; the new instance still owns future listeners.
  }
}

function cleanupContentScriptInstance(): void {
  removeImagePromptHoverStorageListener();
  uninstallImagePromptHover();
  chromexContentScriptAbortController.abort();
  stopContentScriptRuntimeWatchdog();
  if (chromexRuntimeMessageListenerRegistered) {
    try {
      const runtime = getSafeChromeRuntime();
      runtime?.onMessage.removeListener(chromexRuntimeMessageListener);
    } catch {
      // The runtime can already be gone while Chrome is tearing down an unpacked extension reload.
    }
    chromexRuntimeMessageListenerRegistered = false;
  }
  clearPageSelectionContextTimer();
}

function installPageSelectionContextBridge(): void {
  document.addEventListener("selectionchange", schedulePageSelectionContextUpdate, {
    signal: chromexContentScriptAbortController.signal,
  });
  document.addEventListener("pointerup", schedulePageSelectionContextUpdate, {
    signal: chromexContentScriptAbortController.signal,
  });
  document.addEventListener(
    "keyup",
    (event) => {
      const key = typeof event.key === "string" ? event.key : "";
      if (key.startsWith("Arrow") || key === "Shift" || key === "Home" || key === "End") {
        schedulePageSelectionContextUpdate();
      }
    },
    { signal: chromexContentScriptAbortController.signal },
  );
}

function installDictationFocusBridge(): void {
  const rememberEditableTarget = (event: Event) => {
    const target = resolveDictationEditableTarget(event.target);
    if (target) {
      lastDictationEditableTarget = target;
    }
  };

  document.addEventListener("focusin", rememberEditableTarget, {
    capture: true,
    signal: chromexContentScriptAbortController.signal,
  });
  document.addEventListener("pointerdown", rememberEditableTarget, {
    capture: true,
    signal: chromexContentScriptAbortController.signal,
  });
}

function schedulePageSelectionContextUpdate(): void {
  clearPageSelectionContextTimer();
  pageSelectionContextTimer = window.setTimeout(() => {
    pageSelectionContextTimer = null;
    sendPageSelectionContextUpdate();
  }, PAGE_SELECTION_CONTEXT_DEBOUNCE_MS);
}

function clearPageSelectionContextTimer(): void {
  if (pageSelectionContextTimer === null) {
    return;
  }
  window.clearTimeout(pageSelectionContextTimer);
  pageSelectionContextTimer = null;
}

function sendPageSelectionContextUpdate(): void {
  if (!isActiveContentScriptInstance()) {
    return;
  }
  const snapshot = getSelectedPageContextSnapshot();
  const text = snapshot.text;
  if (text.length < PAGE_SELECTION_CONTEXT_MIN_CHARS) {
    sendPageSelectionContextClear();
    return;
  }
  const signature = `${window.location.href}\n${text}\n${snapshot.contextText ?? ""}`;
  if (signature === lastPageSelectionContextSignature) {
    return;
  }
  lastPageSelectionContextSignature = signature;
  const runtime = getSafeChromeRuntime();
  if (!runtime) {
    cleanupContentScriptInstance();
    return;
  }
  void runtime
    .sendMessage({
      type: "ui.page-selection.changed",
      selection: {
        text,
        ...(snapshot.contextText ? { contextText: snapshot.contextText } : {}),
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
      },
    })
    .catch(() => {
      // The side panel may be closed, or Chrome may be reloading the unpacked extension.
    });
}

function sendPageSelectionContextClear(): void {
  if (!lastPageSelectionContextSignature) {
    return;
  }
  lastPageSelectionContextSignature = "";
  const runtime = getSafeChromeRuntime();
  if (!runtime) {
    cleanupContentScriptInstance();
    return;
  }
  void runtime
    .sendMessage({
      type: "ui.page-selection.changed",
      cleared: true,
      selection: null,
      url: window.location.href,
    })
    .catch(() => {
      // The side panel may be closed, or Chrome may be reloading the unpacked extension.
    });
}

function getSelectedPageContextSnapshot(): PageSelectionContextSnapshot {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { text: "" };
  }
  const range = selection.getRangeAt(0);
  if (isSelectionInsideEditableSurface(range)) {
    return { text: "" };
  }
  const text = normalizePageSelectionContextText(selection.toString());
  const contextText = createPageSelectionContextText(range, text);
  return {
    text,
    ...(contextText ? { contextText } : {}),
  };
}

function isSelectionInsideEditableSurface(range: Range): boolean {
  const container = range.commonAncestorContainer;
  const element =
    container.nodeType === Node.ELEMENT_NODE
      ? (container as Element)
      : container.parentElement;
  return Boolean(element?.closest(EDITOR_LIKE_SELECTOR));
}

function normalizePageSelectionContextText(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, PAGE_SELECTION_CONTEXT_MAX_CHARS);
}

function createPageSelectionContextText(range: Range, selectedText: string): string {
  const root = document.body ?? document.documentElement;
  if (!root || !selectedText || !root.contains(range.commonAncestorContainer)) {
    return "";
  }
  const beforeRange = document.createRange();
  const afterRange = document.createRange();
  try {
    beforeRange.selectNodeContents(root);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    afterRange.selectNodeContents(root);
    afterRange.setStart(range.endContainer, range.endOffset);
    return createSelectedTextContextExcerpt({
      beforeText: beforeRange.toString(),
      selectedText,
      afterText: afterRange.toString(),
      maxChars: PAGE_SELECTION_CONTEXT_MAX_CHARS,
    });
  } catch {
    return "";
  } finally {
    beforeRange.detach();
    afterRange.detach();
  }
}

async function collectPageProbe() {
  const bodyText = collectBodyText();
  const images = sortEditablePageImageCandidates(
    [
      ...Array.from(document.images).map(describePageImage),
      ...collectCssBackgroundImageCandidates(),
    ]
      .filter((image): image is EditablePageImageCandidate => image !== null),
  ).slice(0, 8);
  const adapterPayload = await collectAdapterPayload();

  return {
    rawCapture: {
      metadata: {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
      },
      selectedText: window.getSelection?.()?.toString().trim() ?? "",
      bodyText,
      images,
      adapterPayload,
      privacyFlags: {
        containsSensitiveFormData: Boolean(
          document.querySelector('input[type="password"], input[autocomplete="cc-number"], textarea'),
        ),
        userConsentedToHistory: false,
      },
    },
    features: {
      textLength: bodyText.length,
      imageCount: images.length,
      hasCanvas: document.querySelectorAll("canvas").length > 0,
      hasVideo: document.querySelectorAll("video").length > 0,
      hasDenseInteractiveUi: document.querySelectorAll("button, input, [role='button']").length > 15,
    },
    adapterActions: adapterPayload?.platform === "youtube"
      ? ["summarize-video", "summarize-current-timestamp", "draft-blog-post"]
      : [],
  };
}

function normalizeBrowserAutomationMode(value: unknown): BrowserAutomationMode {
  return value === "playwright" || value === "computer-use" ? value : "dom";
}

function showAiControlOverlay(mode: BrowserAutomationMode, label = "Codex is controlling this page"): void {
  clearAiControlOverlayTimers();
  ensureAiControlStyle();
  if (!aiControlOverlayNode) {
    removeStaleAiControlOverlays();
    aiControlOverlayNode = document.createElement("div");
    aiControlOverlayNode.className = "codex-ai-control-border";
    aiControlOverlayNode.setAttribute("aria-hidden", "true");
    const pill = document.createElement("div");
    pill.className = "codex-ai-control-pill";
    const modeLabel = document.createElement("span");
    modeLabel.className = "codex-ai-control-mode";
    const text = document.createElement("span");
    text.className = "codex-ai-control-label";
    pill.append(modeLabel, text);
    aiControlOverlayNode.append(pill);
    document.documentElement.append(aiControlOverlayNode);
  }

  aiControlOverlayNode.dataset.mode = mode;
  const modeLabel = aiControlOverlayNode.querySelector<HTMLElement>(".codex-ai-control-mode");
  const text = aiControlOverlayNode.querySelector<HTMLElement>(".codex-ai-control-label");
  if (modeLabel) {
    modeLabel.textContent = mode === "dom" ? "DOM" : mode === "playwright" ? "Playwright" : "Computer Use";
  }
  if (text) {
    text.textContent = label;
  }
  scheduleAiControlOverlayWatchdog();
}

function removeStaleAiControlOverlays(): void {
  for (const node of Array.from(document.querySelectorAll(".codex-ai-control-border"))) {
    if (node !== aiControlOverlayNode) {
      safeRemoveElement(node);
    }
  }
}

function hideAiControlOverlay(): void {
  clearAiControlOverlayTimers();
  safeRemoveElement(aiControlOverlayNode);
  aiControlOverlayNode = null;
}

function scheduleHideAiControlOverlay(delayMs: number): void {
  clearAiControlOverlayTimers();
  if (delayMs <= 0) {
    hideAiControlOverlay();
    return;
  }
  aiControlOverlayTimer = window.setTimeout(() => {
    hideAiControlOverlay();
    aiControlOverlayTimer = null;
  }, Math.max(0, delayMs));
}

function scheduleAiControlOverlayWatchdog(): void {
  if (aiControlOverlayWatchdogTimer !== null) {
    window.clearTimeout(aiControlOverlayWatchdogTimer);
  }
  aiControlOverlayWatchdogTimer = window.setTimeout(() => {
    aiControlOverlayWatchdogTimer = null;
    scheduleHideAiControlOverlay(0);
  }, AI_CONTROL_OVERLAY_MAX_MS);
}

function clearAiControlOverlayTimers(): void {
  if (aiControlOverlayTimer !== null) {
    window.clearTimeout(aiControlOverlayTimer);
    aiControlOverlayTimer = null;
  }
  if (aiControlOverlayWatchdogTimer !== null) {
    window.clearTimeout(aiControlOverlayWatchdogTimer);
    aiControlOverlayWatchdogTimer = null;
  }
}

function ensureAiControlStyle(): void {
  if (document.getElementById("codex-ai-control-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "codex-ai-control-style";
  style.textContent = `
    @keyframes codexAiControlPulse {
      0%, 100% {
        box-shadow: 0 0 0 1px rgba(84, 155, 255, 0.46), 0 0 30px rgba(84, 155, 255, 0.22), inset 0 0 22px rgba(84, 155, 255, 0.1);
      }
      50% {
        box-shadow: 0 0 0 2px rgba(84, 155, 255, 0.62), 0 0 58px rgba(84, 155, 255, 0.36), inset 0 0 34px rgba(84, 155, 255, 0.16);
      }
    }
    @keyframes codexAiControlAura {
      0%, 100% {
        opacity: 0.46;
        transform: scale(1);
      }
      50% {
        opacity: 0.82;
        transform: scale(1.012);
      }
    }
    .codex-ai-control-border {
      position: fixed;
      inset: 6px;
      z-index: 2147483647;
      pointer-events: none;
      border: 1px solid rgba(84, 155, 255, 0.78);
      border-radius: 16px;
      animation: codexAiControlPulse 2.8s ease-in-out infinite;
      box-sizing: border-box;
    }
    .codex-ai-control-border::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      border-radius: 20px;
      background:
        radial-gradient(circle at 12% 8%, rgba(84, 155, 255, 0.32), transparent 28%),
        radial-gradient(circle at 88% 12%, rgba(90, 200, 255, 0.22), transparent 30%),
        radial-gradient(circle at 50% 100%, rgba(84, 155, 255, 0.24), transparent 36%);
      filter: blur(18px);
      animation: codexAiControlAura 3.6s ease-in-out infinite;
    }
    .codex-ai-control-pill {
      position: absolute;
      z-index: 1;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 10px;
      max-width: min(720px, calc(100vw - 48px));
      padding: 10px 14px;
      border-radius: 16px;
      background: rgba(15, 23, 42, 0.94);
      color: #f8fafc;
      font: 600 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 16px 44px rgba(15, 23, 42, 0.34);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .codex-ai-control-mode {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      padding: 5px 8px;
      border-radius: 10px;
      background: rgba(59, 130, 246, 0.95);
      color: #ffffff;
      font-size: 12px;
      letter-spacing: 0.01em;
    }
    .codex-ai-control-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;
  document.documentElement.append(style);
}

async function collectAdapterPayload(): Promise<Record<string, unknown> | null> {
  if (isYouTubeUrl(window.location.href)) {
    return collectYouTubeAdapterPayload();
  }
  if (isArxivUrl(window.location.href)) {
    return collectArxivAdapterPayload(document, window.location.href);
  }
  if (isLikelyPdfUrl(window.location.href, document.title)) {
    return collectPdfAdapterPayload(document, window.location.href, document.title);
  }
  if (isGoogleWorkspaceUrl(window.location.href)) {
    const workspacePayload = await collectGoogleWorkspaceAdapterPayload({
      url: window.location.href,
      title: document.title,
      documentText: collectBodyText(),
    });
    if (workspacePayload) {
      return workspacePayload;
    }
  }
  const payload = createSitePayload({
    title: document.title,
    url: window.location.href,
  });
  if (!payload) {
    return null;
  }
  return {
    ...payload,
    selectedText: window.getSelection?.()?.toString().trim() ?? "",
  };
}

function collectCssBackgroundImageCandidates(): Array<EditablePageImageCandidate | null> {
  const elements = [
    ...(document.body ? [document.body] : []),
    ...Array.from(document.querySelectorAll<HTMLElement>("body *")),
  ];

  return elements
    .slice(0, 800)
    .flatMap((element) => {
      if (!isElementVisible(element)) {
        return [];
      }
      const rect = element.getBoundingClientRect();
      if (rect.width < 48 || rect.height < 48) {
        return [];
      }
      const urls = extractCssImageUrls(window.getComputedStyle(element).backgroundImage || "");
      if (!urls.length) {
        return [];
      }
      return urls.map((url) => describeElementImage(resolvePageImageUrl(url), element));
    });
}

function describePageImage(image: HTMLImageElement): EditablePageImageCandidate | null {
  const url = image.currentSrc || image.src;
  if (!url) {
    return null;
  }

  const rect = image.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const visibleLeft = clamp(rect.left, 0, viewportWidth);
  const visibleTop = clamp(rect.top, 0, viewportHeight);
  const visibleRight = clamp(rect.right, 0, viewportWidth);
  const visibleBottom = clamp(rect.bottom, 0, viewportHeight);
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const viewportCenterX = viewportWidth / 2;
  const viewportCenterY = viewportHeight / 2;
  const alt = image.alt.trim();

  return {
    url,
    ...(alt ? { alt } : {}),
    ...(image.naturalWidth ? { width: image.naturalWidth, naturalWidth: image.naturalWidth } : {}),
    ...(image.naturalHeight ? { height: image.naturalHeight, naturalHeight: image.naturalHeight } : {}),
    renderedWidth: rect.width,
    renderedHeight: rect.height,
    visibleArea: visibleWidth * visibleHeight,
    distanceFromViewportCenter: Math.hypot(centerX - viewportCenterX, centerY - viewportCenterY),
    viewportRect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
    viewportWidth,
    viewportHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

function describeElementImage(url: string, element: HTMLElement): EditablePageImageCandidate | null {
  if (!url || url.startsWith("data:image/svg")) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const visibleLeft = clamp(rect.left, 0, viewportWidth);
  const visibleTop = clamp(rect.top, 0, viewportHeight);
  const visibleRight = clamp(rect.right, 0, viewportWidth);
  const visibleBottom = clamp(rect.bottom, 0, viewportHeight);
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const viewportCenterX = viewportWidth / 2;
  const viewportCenterY = viewportHeight / 2;

  return {
    url,
    renderedWidth: rect.width,
    renderedHeight: rect.height,
    visibleArea: visibleWidth * visibleHeight,
    distanceFromViewportCenter: Math.hypot(centerX - viewportCenterX, centerY - viewportCenterY),
    viewportRect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
    viewportWidth,
    viewportHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

function resolvePageImageUrl(url: string): string {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function initializeImagePromptHoverSetting(): void {
  registerImagePromptHoverStorageListener();
  void readImagePromptHoverButtonEnabled()
    .then((enabled) => setImagePromptHoverButtonEnabled(enabled))
    .catch((error) => {
      if (!handleImagePromptRuntimeError(error)) {
        installImagePromptHover();
      }
    });
}

function registerImagePromptHoverStorageListener(): void {
  const storage = getSafeChromeStorage();
  if (!storage || imagePromptHoverStorageListenerRegistered) {
    return;
  }
  storage.onChanged.addListener(handleImagePromptHoverStorageChanged);
  imagePromptHoverStorageListenerRegistered = true;
}

function removeImagePromptHoverStorageListener(): void {
  if (!imagePromptHoverStorageListenerRegistered) {
    return;
  }
  try {
    getSafeChromeStorage()?.onChanged.removeListener(handleImagePromptHoverStorageChanged);
  } catch {
    // The runtime can already be unavailable during extension reload cleanup.
  }
  imagePromptHoverStorageListenerRegistered = false;
}

function handleImagePromptHoverStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): void {
  if (areaName !== "local" || !Object.hasOwn(changes, SETTINGS_STORAGE_KEY)) {
    return;
  }
  const settings = changes[SETTINGS_STORAGE_KEY]?.newValue;
  setImagePromptHoverButtonEnabled(readImagePromptHoverButtonEnabledFromSettings(settings));
}

async function readImagePromptHoverButtonEnabled(): Promise<boolean> {
  const storage = getSafeChromeStorage();
  if (!storage) {
    return true;
  }
  const result = await storage.local.get(SETTINGS_STORAGE_KEY);
  return readImagePromptHoverButtonEnabledFromSettings(result[SETTINGS_STORAGE_KEY]);
}

function readImagePromptHoverButtonEnabledFromSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") {
    return true;
  }
  return (settings as { imagePromptHoverButtonEnabled?: unknown }).imagePromptHoverButtonEnabled !== false;
}

function setImagePromptHoverButtonEnabled(enabled: boolean): void {
  if (enabled === imagePromptHoverEnabled) {
    if (enabled && !imagePromptHoverInstalled) {
      installImagePromptHover();
    } else if (!enabled && imagePromptHoverInstalled) {
      uninstallImagePromptHover();
    }
    return;
  }
  imagePromptHoverEnabled = enabled;
  if (enabled) {
    installImagePromptHover();
    return;
  }
  uninstallImagePromptHover();
}

function installImagePromptHover(): void {
  if (!imagePromptHoverEnabled) {
    hideImagePromptHoverButton({ immediate: true });
    return;
  }
  if (imagePromptHoverInstalled) {
    removeImagePromptHoverButtons(imagePromptHoverButton);
    if (imagePromptHoverButton?.isConnected && imagePromptHoverTargetRect) {
      positionImagePromptHoverButton(imagePromptHoverTargetRect, imagePromptHoverButton);
    }
    return;
  }
  imagePromptHoverInstalled = true;
  imagePromptHoverAbortController = new AbortController();
  removeImagePromptHoverButtons();
  const listenerOptions: AddEventListenerOptions = {
    capture: true,
    signal: imagePromptHoverAbortController.signal,
  };
  document.addEventListener("pointerover", handleImagePromptPointerOver, listenerOptions);
  document.addEventListener("click", handleImagePromptButtonClick, listenerOptions);
  document.addEventListener("scroll", handleImagePromptScroll, listenerOptions);
  document.addEventListener("visibilitychange", handleImagePromptVisibilityChange, listenerOptions);
  window.addEventListener("blur", handleImagePromptForceHide, listenerOptions);
}

function uninstallImagePromptHover(): void {
  imagePromptHoverAbortController?.abort();
  imagePromptHoverAbortController = null;
  imagePromptHoverInstalled = false;
  hideImagePromptHoverButton({ immediate: true });
}

function handleImagePromptForceHide(): void {
  try {
    if (!isActiveContentScriptInstance()) {
      return;
    }
    hideImagePromptHoverButton();
  } catch (error) {
    handleImagePromptEventError(error);
  }
}

function handleImagePromptPointerOver(event: MouseEvent): void {
  try {
    if (!isActiveContentScriptInstance()) {
      return;
    }
    rememberImagePromptPointer(event);
    if (isImagePromptHoverButtonEventTarget(event.target)) {
      return;
    }
    if (isPointerInsideImagePromptHoverSurface(event.clientX, event.clientY)) {
      return;
    }
    const target = findPromptExtractableImageFromPointerEvent(event);
    if (target) {
      showImagePromptHoverButton(target);
      return;
    }
    hideImagePromptHoverButton();
  } catch (error) {
    handleImagePromptEventError(error);
  }
}

function rememberImagePromptPointer(event: MouseEvent): void {
  imagePromptHoverLastPointer = {
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

function handleImagePromptScroll(): void {
  try {
    if (!isActiveContentScriptInstance() || !imagePromptHoverTarget || !imagePromptHoverLastPointer) {
      return;
    }
    if (imagePromptHoverScrollFrame !== null) {
      return;
    }
    imagePromptHoverScrollFrame = window.requestAnimationFrame(() => {
      imagePromptHoverScrollFrame = null;
      try {
        if (!isActiveContentScriptInstance()) {
          return;
        }
        refreshImagePromptHoverTargetAtPointer();
      } catch (error) {
        handleImagePromptEventError(error);
      }
    });
  } catch (error) {
    handleImagePromptEventError(error);
  }
}

function handleImagePromptEventError(error: unknown): void {
  if (handleImagePromptRuntimeError(error)) {
    return;
  }
  throw error;
}

function findPromptExtractableImageFromPointerEvent(event: MouseEvent): ImagePromptHoverTarget | null {
  for (const candidate of collectImagePromptPointerCandidates(event)) {
    const target = findPromptExtractableImageInsideElement(candidate, event.clientX, event.clientY);
    if (target) {
      return target;
    }
  }
  return null;
}

function refreshImagePromptHoverTargetAtPointer(): void {
  const pointer = imagePromptHoverLastPointer;
  const button = imagePromptHoverButton;
  if (!pointer || !button) {
    hideImagePromptHoverButton();
    return;
  }

  const refreshedTarget = refreshImagePromptHoverTarget(imagePromptHoverTarget);
  if (
    refreshedTarget &&
    (isPointInsideRect(refreshedTarget.anchorRect, pointer.clientX, pointer.clientY) ||
      isPointInsideRect(imagePromptHoverButtonRect, pointer.clientX, pointer.clientY, IMAGE_PROMPT_HOVER_SURFACE_PADDING_PX))
  ) {
    showImagePromptHoverButton(refreshedTarget);
    return;
  }

  const targetAtPointer = findPromptExtractableImageAtPoint(pointer.clientX, pointer.clientY);
  if (targetAtPointer) {
    showImagePromptHoverButton(targetAtPointer);
    return;
  }

  hideImagePromptHoverButton();
}

function refreshImagePromptHoverTarget(target: ImagePromptHoverTarget | null): ImagePromptHoverTarget | null {
  if (!target?.element.isConnected) {
    return null;
  }
  if (target.image) {
    return refreshImagePromptHoverImageTarget(target.image);
  }
  if (target.element instanceof HTMLElement) {
    return refreshImagePromptHoverBackgroundTarget(target.element);
  }
  return null;
}

function refreshImagePromptHoverImageTarget(image: HTMLImageElement): ImagePromptHoverTarget | null {
  if (!isPromptExtractableImage(image) || isImagePromptVideoContextElement(image)) {
    return null;
  }
  const anchorRect = resolveImagePromptHoverAnchorRect(image);
  if (!isPromptExtractableRect(anchorRect)) {
    return null;
  }
  const imageUrl = resolvePageImageUrl(image.currentSrc || image.src || "");
  const imageCandidate = describePageImage(image);
  if (!imageCandidate) {
    return null;
  }
  return {
    element: image,
    image,
    url: imageUrl,
    candidate: { ...imageCandidate, url: imageUrl },
    anchorRect,
  };
}

function refreshImagePromptHoverBackgroundTarget(element: HTMLElement): ImagePromptHoverTarget | null {
  if (isImagePromptVideoContextElement(element)) {
    return null;
  }
  const anchorRect = resolveImagePromptHoverAnchorRect(element);
  if (!isPromptExtractableRect(anchorRect)) {
    return null;
  }
  const urls = extractCssImageUrls(window.getComputedStyle(element).backgroundImage || "");
  for (const url of urls) {
    const imageUrl = resolvePageImageUrl(url);
    if (!isSupportedImagePromptSource(imageUrl)) {
      continue;
    }
    const candidate = describeElementImage(imageUrl, element);
    if (candidate) {
      return {
        element,
        url: imageUrl,
        candidate,
        anchorRect,
      };
    }
  }
  return null;
}

function findPromptExtractableImageAtPoint(clientX: number, clientY: number): ImagePromptHoverTarget | null {
  for (const candidate of collectImagePromptPointCandidates(clientX, clientY)) {
    const target = findPromptExtractableImageInsideElement(candidate, clientX, clientY);
    if (target) {
      return target;
    }
  }
  return null;
}

function collectImagePromptPointCandidates(clientX: number, clientY: number): Element[] {
  const hitElements = typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(clientX, clientY)
    : [document.elementFromPoint(clientX, clientY)].filter((element): element is Element => element !== null);
  return hitElements
    .filter((element) => !imagePromptHoverButton?.contains(element))
    .slice(0, 8);
}

function collectImagePromptPointerCandidates(event: MouseEvent): Array<EventTarget | Element | null> {
  const candidates: Array<EventTarget | Element | null> = [];
  const seen = new Set<EventTarget | Element>();
  const add = (candidate: EventTarget | Element | null) => {
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    candidates.push(candidate);
  };

  for (const candidate of event.composedPath().slice(0, 12)) {
    add(candidate);
  }
  const hitElements = typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(event.clientX, event.clientY)
    : [document.elementFromPoint(event.clientX, event.clientY)];
  for (const candidate of hitElements.slice(0, 8)) {
    add(candidate);
  }

  return candidates;
}

function findPromptExtractableImageInsideElement(
  candidate: EventTarget | Element | null,
  clientX: number,
  clientY: number,
): ImagePromptHoverTarget | null {
  if (!(candidate instanceof Element)) {
    return null;
  }
  if (candidate === document.documentElement || candidate === document.body) {
    return null;
  }
  let bestTarget: ImagePromptHoverTarget | null = null;
  let bestArea = 0;
  for (const element of collectImagePromptCandidateElements(candidate, clientX, clientY)) {
    const target = createImagePromptTargetFromElement(element, clientX, clientY);
    if (!target) {
      continue;
    }
    const anchorRect = target.anchorRect;
    const area = anchorRect.width * anchorRect.height;
    if (area > bestArea) {
      bestTarget = target;
      bestArea = area;
    }
  }
  return bestTarget;
}

function collectImagePromptCandidateElements(element: Element, clientX: number, clientY: number): Element[] {
  const elements: Element[] = [];
  const seen = new Set<Element>();
  const add = (candidate: Element | null) => {
    if (
      !candidate ||
      candidate === document.documentElement ||
      candidate === document.body ||
      seen.has(candidate)
    ) {
      return;
    }
    seen.add(candidate);
    elements.push(candidate);
  };

  add(element);
  add(element.closest("img, [role='img']"));

  let depth = 0;
  for (let current: Element | null = element; current && current !== document.body && depth < 4; current = current.parentElement) {
    depth += 1;
    add(current);
    const currentRect = current.getBoundingClientRect();
    if (!isPointInsideRect(currentRect, clientX, clientY, 4)) {
      continue;
    }
    for (const nestedImage of Array.from(current.querySelectorAll("img, [role='img']")).slice(0, 8)) {
      add(nestedImage);
    }
    if (elements.length >= 24) {
      break;
    }
  }

  return elements;
}

function createImagePromptTargetFromElement(
  element: Element,
  clientX: number,
  clientY: number,
): ImagePromptHoverTarget | null {
  if (element instanceof HTMLImageElement) {
    return createImagePromptTargetFromImage(element, clientX, clientY);
  }
  if (element instanceof HTMLElement) {
    return createImagePromptTargetFromElementBackground(element, clientX, clientY);
  }
  return null;
}

function createImagePromptTargetFromImage(
  image: HTMLImageElement,
  clientX: number,
  clientY: number,
): ImagePromptHoverTarget | null {
  if (!isPromptExtractableImage(image)) {
    return null;
  }
  if (isImagePromptVideoContextElement(image)) {
    return null;
  }
  const anchorRect = resolveImagePromptHoverAnchorRect(image);
  if (!isPromptExtractableRect(anchorRect) || !isPointInsideRect(anchorRect, clientX, clientY)) {
    return null;
  }
  const imageUrl = resolvePageImageUrl(image.currentSrc || image.src || "");
  const imageCandidate = describePageImage(image);
  if (!imageCandidate) {
    return null;
  }
  return {
    element: image,
    image,
    url: imageUrl,
    candidate: { ...imageCandidate, url: imageUrl },
    anchorRect,
  };
}

function createImagePromptTargetFromElementBackground(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): ImagePromptHoverTarget | null {
  const anchorRect = resolveImagePromptHoverAnchorRect(element);
  if (!isPromptExtractableRect(anchorRect) || !isPointInsideRect(anchorRect, clientX, clientY)) {
    return null;
  }
  const urls = extractCssImageUrls(window.getComputedStyle(element).backgroundImage || "");
  if (!urls.length || isImagePromptVideoContextElement(element)) {
    return null;
  }
  for (const url of urls) {
    const imageUrl = resolvePageImageUrl(url);
    if (!isSupportedImagePromptSource(imageUrl)) {
      continue;
    }
    const candidate = describeElementImage(imageUrl, element);
    if (candidate) {
      return {
        element,
        url: imageUrl,
        candidate,
        anchorRect,
      };
    }
  }
  return null;
}

function isImagePromptVideoContextElement(element: Element): boolean {
  if (element.localName === "video" || element.closest("video")) {
    return true;
  }

  let depth = 0;
  for (let current: Element | null = element; current && current !== document.body && depth < 5; current = current.parentElement) {
    depth += 1;
    if (!(current instanceof HTMLElement)) {
      continue;
    }
    if (hasImagePromptVideoContextMarker(current)) {
      return true;
    }
    if (current.querySelector("video")) {
      return true;
    }
    const markedDescendants = Array.from(current.querySelectorAll<HTMLElement>("[aria-label], [data-testid]")).slice(0, 20);
    if (markedDescendants.some(hasImagePromptVideoContextMarker)) {
      return true;
    }
  }

  return false;
}

function hasImagePromptVideoContextMarker(element: HTMLElement): boolean {
  const marker = [
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("data-testid") ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return (
    marker.includes("video") ||
    marker.includes("player") ||
    /(^|[^a-z])(play|watch|reel|reels)([^a-z]|$)/u.test(marker) ||
    /동영상|비디오|재생/u.test(marker)
  );
}

function resolveImagePromptHoverAnchorRect(element: Element): DOMRect {
  const rect = element.getBoundingClientRect();
  let left = clamp(rect.left, 0, window.innerWidth || document.documentElement.clientWidth || 0);
  let top = clamp(rect.top, 0, window.innerHeight || document.documentElement.clientHeight || 0);
  let right = clamp(rect.right, 0, window.innerWidth || document.documentElement.clientWidth || 0);
  let bottom = clamp(rect.bottom, 0, window.innerHeight || document.documentElement.clientHeight || 0);

  for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent);
    if (!isImagePromptClippingElement(style)) {
      continue;
    }
    const parentRect = parent.getBoundingClientRect();
    left = Math.max(left, parentRect.left);
    top = Math.max(top, parentRect.top);
    right = Math.min(right, parentRect.right);
    bottom = Math.min(bottom, parentRect.bottom);
  }

  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

function isImagePromptClippingElement(style: CSSStyleDeclaration): boolean {
  const overflowX = style.overflowX;
  const overflowY = style.overflowY;
  return [overflowX, overflowY].some((value) => value === "hidden" || value === "clip" || value === "auto" || value === "scroll");
}

function handleImagePromptVisibilityChange(): void {
  try {
    if (!isActiveContentScriptInstance()) {
      return;
    }
    if (document.visibilityState !== "visible") {
      hideImagePromptHoverButton();
    }
  } catch (error) {
    handleImagePromptEventError(error);
  }
}

function isPointerInsideImagePromptHoverSurface(clientX: number, clientY: number): boolean {
  return (
    isPointInsideRect(imagePromptHoverTargetRect, clientX, clientY) ||
    isPointInsideRect(imagePromptHoverButtonRect, clientX, clientY, IMAGE_PROMPT_HOVER_SURFACE_PADDING_PX)
  );
}

function isImagePromptHoverButtonEventTarget(target: EventTarget | null): boolean {
  return target instanceof Node && Boolean(imagePromptHoverButton?.contains(target));
}

function isPointInsideRect(rect: DOMRect | null | undefined, clientX: number, clientY: number, padding = 0): boolean {
  if (!rect) {
    return false;
  }
  return (
    clientX >= rect.left - padding &&
    clientX <= rect.right + padding &&
    clientY >= rect.top - padding &&
    clientY <= rect.bottom + padding
  );
}

function isPromptExtractableRect(rect: DOMRect): boolean {
  return rect.width >= 80 && rect.height >= 80;
}

function isPromptExtractableImage(image: HTMLImageElement): boolean {
  const source = resolvePageImageUrl(image.currentSrc || image.src || "");
  if (!isSupportedImagePromptSource(source)) {
    return false;
  }
  return isPromptExtractableRect(image.getBoundingClientRect());
}

function isSupportedImagePromptSource(source: string): boolean {
  const normalized = source.trim().toLowerCase();
  return /^https?:\/\//iu.test(source) || normalized.startsWith("blob:") || normalized.startsWith("data:image/");
}

function isHttpImagePromptSource(source: string): boolean {
  return /^https?:\/\//iu.test(source);
}

function showImagePromptHoverButton(target: ImagePromptHoverTarget): void {
  imagePromptHoverTarget = target;
  imagePromptHoverTargetRect = target.anchorRect;
  clearImagePromptHoverButtonRemoveTimer();
  const button = getImagePromptHoverButton();
  if (!button) {
    return;
  }
  positionImagePromptHoverButton(imagePromptHoverTargetRect, button);
  removeImagePromptHoverButtons(button);
  window.requestAnimationFrame(() => {
    if (imagePromptHoverButton === button) {
      setImagePromptHoverButtonVisible(button, true);
    }
  });
}

function getImagePromptHoverButton(): HTMLButtonElement | null {
  if (!isActiveContentScriptInstance()) {
    return null;
  }
  if (imagePromptHoverButton?.isConnected) {
    return imagePromptHoverButton;
  }
  imagePromptHoverButton = null;
  removeImagePromptHoverButtons();

  const button = document.createElement("button");
  button.type = "button";
  button.className = IMAGE_PROMPT_HOVER_BUTTON_CLASS;
  button.title = "Extract image prompt";
  button.setAttribute("aria-label", "Extract image prompt");
  const icon = document.createElement("img");
  icon.alt = "";
  icon.src = IMAGE_PROMPT_HOVER_ICON_DATA_URL;
  Object.assign(icon.style, {
    width: "22px",
    height: "22px",
    display: "block",
    pointerEvents: "none",
  });
  button.appendChild(icon);
  Object.assign(button.style, {
    position: "fixed",
    zIndex: "2147483647",
    width: `${IMAGE_PROMPT_HOVER_BUTTON_SIZE_PX}px`,
    height: `${IMAGE_PROMPT_HOVER_BUTTON_SIZE_PX}px`,
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(255,255,255,0.28)",
    borderRadius: "999px",
    background: "rgba(17, 24, 39, 0.92)",
    color: "#ffffff",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    cursor: "pointer",
    padding: "0",
    pointerEvents: "auto",
    opacity: "0",
    transform: "scale(0.94)",
    transformOrigin: "center",
    transition: `opacity ${IMAGE_PROMPT_HOVER_FADE_MS}ms ease, transform ${IMAGE_PROMPT_HOVER_FADE_MS}ms ease`,
    willChange: "opacity, transform",
  });
  button.addEventListener("click", handleImagePromptButtonClick, {
    capture: true,
    signal: chromexContentScriptAbortController.signal,
  });
  document.documentElement.appendChild(button);
  imagePromptHoverButton = button;
  return button;
}

function setImagePromptHoverButtonVisible(button: HTMLButtonElement, visible: boolean): void {
  button.style.opacity = visible ? "1" : "0";
  button.style.transform = visible ? "scale(1)" : "scale(0.94)";
}

function handleImagePromptRuntimeError(error: unknown): boolean {
  if (!(error instanceof Error) || !error.message.includes("Extension context invalidated")) {
    return false;
  }
  cleanupContentScriptInstance();
  return true;
}

function positionImagePromptHoverButton(rect: DOMRect, button: HTMLButtonElement): void {
  const left = clamp(
    rect.left + IMAGE_PROMPT_HOVER_BUTTON_INSET_PX,
    IMAGE_PROMPT_HOVER_BUTTON_INSET_PX,
    window.innerWidth - IMAGE_PROMPT_HOVER_BUTTON_SIZE_PX - IMAGE_PROMPT_HOVER_BUTTON_INSET_PX,
  );
  const top = clamp(
    rect.top + IMAGE_PROMPT_HOVER_BUTTON_INSET_PX,
    IMAGE_PROMPT_HOVER_BUTTON_INSET_PX,
    window.innerHeight - IMAGE_PROMPT_HOVER_BUTTON_SIZE_PX - IMAGE_PROMPT_HOVER_BUTTON_INSET_PX,
  );
  button.style.left = `${left}px`;
  button.style.top = `${top}px`;
  imagePromptHoverButtonRect = button.getBoundingClientRect();
}

function handleImagePromptButtonClick(event: MouseEvent): void {
  try {
    const isButtonTarget = isImagePromptHoverButtonEventTarget(event.target);
    if (
      !isActiveContentScriptInstance() ||
      (!isButtonTarget && !isPointInsideRect(imagePromptHoverButtonRect, event.clientX, event.clientY))
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void attachHoveredImageToComposer().catch((error: unknown) => {
      if (!handleImagePromptRuntimeError(error)) {
        console.warn("[Chromex] Failed to attach the hovered image.", error);
      }
    });
  } catch (error) {
    handleImagePromptEventError(error);
  }
}

function hideImagePromptHoverButton(options: { immediate?: boolean } = {}): void {
  clearImagePromptHoverButtonRemoveTimer();
  cancelImagePromptHoverScrollFrame();
  const button = imagePromptHoverButton;
  imagePromptHoverTarget = null;
  imagePromptHoverTargetRect = null;
  imagePromptHoverButtonRect = null;
  imagePromptHoverLastPointer = null;
  if (!button) {
    removeImagePromptHoverButtons();
    return;
  }
  if (options.immediate) {
    safeRemoveElement(button);
    imagePromptHoverButton = null;
    removeImagePromptHoverButtons();
    return;
  }
  setImagePromptHoverButtonVisible(button, false);
  imagePromptHoverButtonRemoveTimer = window.setTimeout(() => {
    if (imagePromptHoverButton === button) {
      safeRemoveElement(button);
      imagePromptHoverButton = null;
    }
    imagePromptHoverButtonRemoveTimer = null;
    removeImagePromptHoverButtons();
  }, IMAGE_PROMPT_HOVER_FADE_MS);
}

function clearImagePromptHoverButtonRemoveTimer(): void {
  if (imagePromptHoverButtonRemoveTimer === null) {
    return;
  }
  window.clearTimeout(imagePromptHoverButtonRemoveTimer);
  imagePromptHoverButtonRemoveTimer = null;
}

function cancelImagePromptHoverScrollFrame(): void {
  if (imagePromptHoverScrollFrame === null) {
    return;
  }
  window.cancelAnimationFrame(imagePromptHoverScrollFrame);
  imagePromptHoverScrollFrame = null;
}

function removeImagePromptHoverButtons(except: HTMLButtonElement | null = null): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(IMAGE_PROMPT_HOVER_BUTTON_SELECTOR))) {
    if (button === except) {
      continue;
    }
    safeRemoveElement(button);
  }
}

async function extractPromptFromHoveredImage(): Promise<void> {
  if (!isActiveContentScriptInstance()) {
    return;
  }
  const target = imagePromptHoverTarget;
  if (!target) {
    return;
  }
  const imageUrl = target.url;
  if (!isSupportedImagePromptSource(imageUrl)) {
    return;
  }
  const imageCandidate = target.candidate;
  hideImagePromptHoverButton();
  const runtime = getSafeChromeRuntime();
  if (!runtime) {
    cleanupContentScriptInstance();
    return;
  }
  try {
    const attachment = await createImagePromptAttachmentForHoveredTarget(target, imageUrl);
    await runtime.sendMessage({
      type: "page.image-prompt.extract",
      imageUrl,
      imageCandidate,
      ...(attachment ? { attachment } : {}),
    });
  } catch (error) {
    if (handleImagePromptRuntimeError(error)) {
      return;
    }
    throw error;
  }
}

async function attachHoveredImageToComposer(): Promise<void> {
  if (!isActiveContentScriptInstance()) {
    return;
  }
  const target = imagePromptHoverTarget;
  if (!target) {
    return;
  }
  const imageUrl = target.url;
  if (!isSupportedImagePromptSource(imageUrl)) {
    return;
  }
  const imageCandidate = target.candidate;
  hideImagePromptHoverButton();
  const runtime = getSafeChromeRuntime();
  if (!runtime) {
    cleanupContentScriptInstance();
    return;
  }
  try {
    const attachment = await createImagePromptAttachmentForHoveredTarget(target, imageUrl);
    await runtime.sendMessage({
      type: "page.image-attachment.add",
      imageUrl,
      imageCandidate,
      ...(attachment ? { attachment } : {}),
    });
  } catch (error) {
    if (handleImagePromptRuntimeError(error)) {
      return;
    }
    throw error;
  }
}

async function createImagePromptAttachmentForHoveredTarget(
  target: ImagePromptHoverTarget,
  imageUrl: string,
): Promise<ImagePromptAttachmentPayload | null> {
  if (isHttpImagePromptSource(imageUrl)) {
    return null;
  }

  const blob = await readHoveredTargetBlob(target, imageUrl).catch(() => null);
  if (!blob || !blob.type.startsWith("image/")) {
    return null;
  }
  const base64 = await blobToBase64String(blob).catch(() => "");
  if (!base64) {
    return null;
  }

  return {
    id: `hovered-page-image-${Date.now()}`,
    name: filenameFromPromptImageUrl(imageUrl, blob.type),
    mimeType: blob.type || "image/png",
    sizeBytes: blob.size,
    lastModified: Date.now(),
    base64,
    kind: "image",
  };
}

async function readHoveredTargetBlob(target: ImagePromptHoverTarget, imageUrl: string): Promise<Blob | null> {
  const fetched = await fetch(imageUrl)
    .then((response) => (response.ok ? response.blob() : null))
    .catch(() => null);
  if (fetched) {
    return fetched;
  }
  return target.image ? renderImageElementToBlob(target.image) : null;
}

function renderImageElementToBlob(image: HTMLImageElement): Promise<Blob | null> {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
    return Promise.resolve(null);
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.resolve(null);
  }
  try {
    context.drawImage(image, 0, 0);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function blobToBase64String(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image blob."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      resolve(dataUrl.split(",", 2)[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });
}

function filenameFromPromptImageUrl(imageUrl: string, mimeType: string): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : mimeType === "image/gif" ? "gif" : "png";
  if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) {
    return `hovered-page-image.${extension}`;
  }
  try {
    const filename = new URL(imageUrl, document.baseURI).pathname.split("/").filter(Boolean).at(-1)?.trim();
    return filename ? filename.replace(/\.[a-z0-9]+$/iu, `.${extension}`) : `hovered-page-image.${extension}`;
  } catch {
    return `hovered-page-image.${extension}`;
  }
}

async function applyImageOverlay(previewRef: string): Promise<void> {
  const resolvedPreviewRef = await resolveImagePreviewRefForUi(previewRef, (payload) => {
    const runtime = getSafeChromeRuntime();
    if (!runtime) {
      cleanupContentScriptInstance();
      throw new Error("Extension context invalidated.");
    }
    return runtime.sendMessage(payload) as Promise<{
      dataBase64: string;
      mimeType: string;
      sizeBytes: number;
      offset: number;
      nextOffset: number;
      done: boolean;
    }>;
  });
  clearImageOverlay();

  overlayNode = document.createElement("div");
  overlayNode.style.position = "fixed";
  overlayNode.style.inset = "24px";
  overlayNode.style.zIndex = "2147483647";
  overlayNode.style.background = "rgba(10, 14, 18, 0.92)";
  overlayNode.style.border = "1px solid rgba(255,255,255,0.12)";
  overlayNode.style.borderRadius = "20px";
  overlayNode.style.boxShadow = "0 24px 80px rgba(0,0,0,0.35)";
  overlayNode.style.display = "grid";
  overlayNode.style.placeItems = "center";
  overlayNode.style.padding = "24px";
  overlayNode.addEventListener("click", clearImageOverlay);

  const image = document.createElement("img");
  image.src = resolvedPreviewRef;
  image.style.maxWidth = "100%";
  image.style.maxHeight = "100%";
  image.style.objectFit = "contain";
  image.style.borderRadius = "16px";

  overlayNode.appendChild(image);
  document.documentElement.appendChild(overlayNode);
}

function clearImageOverlay(): void {
  safeRemoveElement(overlayNode);
  overlayNode = null;
}

function handlePageNavigation(command: VoiceNavigationCommand): { ok: boolean; matched?: boolean } {
  switch (command.kind) {
    case "scroll":
      if (command.direction === "top") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (command.direction === "bottom") {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      } else {
        window.scrollBy({
          top: (command.direction === "down" ? 1 : -1) * window.innerHeight * 0.85,
          behavior: "smooth",
        });
      }
      return { ok: true };
    case "highlight": {
      const match = findBestMatchingElement(command.query);
      if (!match) {
        return { ok: true, matched: false };
      }

      clearHighlights();
      match.style.outline = "3px solid rgba(212, 95, 51, 0.92)";
      match.style.outlineOffset = "6px";
      match.style.background = "rgba(255, 230, 204, 0.55)";
      match.style.transition = "outline-color 180ms ease, background 180ms ease";
      match.scrollIntoView({ block: "center", behavior: "smooth" });
      highlightedElements.add(match);
      return { ok: true, matched: true };
    }
    case "clear-highlights":
      clearHighlights();
      return { ok: true };
  }
}

function collectBrowserDomSnapshot(): BrowserDomSnapshot {
  domActionElementRefs.clear();
  const elements = collectInteractiveElements()
    .slice(0, 80)
    .map<BrowserDomElementSnapshot>((element, index) => {
      const ref = `dom-${index + 1}`;
      domActionElementRefs.set(ref, element);
      return describeDomActionElement(ref, element);
    });

  return {
    metadata: {
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
    },
    elements,
    capabilities: {
      supportsDomAutomation: true,
      supportsVisualControlIndicator: true,
      preferredAutomationMode: "dom",
    },
  };
}

async function performBrowserDomActions(steps: BrowserDomActionStep[]): Promise<BrowserDomActionResult> {
  aiControlCancelled = false;
  showAiControlOverlay("dom", "Codex is controlling this page");
  const results: BrowserDomActionResult["results"] = [];
  try {
    for (const step of steps.slice(0, 4)) {
      await waitForDomActionTick();
      if (aiControlCancelled) {
        results.push({
          step,
          ok: false,
          message: "Browser control was stopped by the user.",
        });
        return {
          ok: false,
          summary: "Browser control was stopped.",
          results,
          controlMode: "dom",
          cancelled: true,
        };
      }
      results.push(await performBrowserDomAction(step));
    }
    return {
      ok: results.every((result) => result.ok),
      summary: summarizeDomActionResults(results),
      results,
      controlMode: "dom",
    };
  } finally {
    scheduleHideAiControlOverlay(0);
  }
}

function waitForDomActionTick(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function collectInteractiveElements(): HTMLElement[] {
  const selectors = [
    "button",
    "a[href]",
    'input:not([type="hidden"])',
    "textarea",
    "select",
    "summary",
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="textbox"]',
    '[aria-haspopup]',
    '[aria-controls]',
    '[aria-expanded]',
    '[aria-multiline="true"]',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[data-lexical-editor="true"]',
    '[data-slate-editor="true"]',
    "[data-placeholder]",
    ".ProseMirror",
    ".ql-editor",
    "[tabindex]",
  ];

  return Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")))
    .filter((element) => isDomActionElementVisible(element) && !isDomActionElementDisabled(element))
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
    });
}

function describeDomActionElement(ref: string, element: HTMLElement): BrowserDomElementSnapshot {
  const rect = element.getBoundingClientRect();
  const input = element instanceof HTMLInputElement ? element : null;
  const anchor = element instanceof HTMLAnchorElement ? element : null;
  const value = getElementValue(element);
  const placeholder = getElementPlaceholder(element);
  const ariaExpanded = element.getAttribute("aria-expanded") || "";
  const ariaHasPopup = element.getAttribute("aria-haspopup") || "";
  const ariaControls = element.getAttribute("aria-controls") || "";
  return {
    ref,
    role: element.getAttribute("role") || inferDomActionRole(element),
    tagName: element.tagName.toLowerCase(),
    label: getElementLabel(element),
    text: normalizeDomActionText(element.innerText || element.textContent || "").slice(0, 180),
    selector: buildElementSelector(element),
    ...(value ? { value } : {}),
    ...(anchor?.href ? { href: anchor.href } : {}),
    ...(input?.type ? { inputType: input.type } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(element.getAttribute("contenteditable") ? { contentEditable: element.getAttribute("contenteditable") ?? "" } : {}),
    ...(ariaExpanded ? { ariaExpanded } : {}),
    ...(ariaHasPopup ? { ariaHasPopup } : {}),
    ...(ariaControls ? { ariaControls } : {}),
    ...(element.tabIndex >= 0 ? { tabIndex: element.tabIndex } : {}),
    isTextEntryCandidate: isTextEntryCandidate(element),
    opensEditableSurface: opensEditableSurface(element),
    disabled: isDomActionElementDisabled(element),
    viewportRect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

async function performBrowserDomAction(step: BrowserDomActionStep): Promise<BrowserDomActionResult["results"][number]> {
  try {
    if (step.action === "navigate") {
      performNavigateAction(step);
      return { step, ok: true, message: "Navigated the current page." };
    }

    const element = resolveDomActionTarget(step);
    if (!element && step.action !== "scroll") {
      return { step, ok: false, message: "Target element was not found." };
    }

    if (step.action === "scroll") {
      performScrollAction(element, step);
      return { step, ok: true, message: "Scrolled the page." };
    }

    if (!element || isDomActionElementDisabled(element)) {
      return { step, ok: false, message: "Target element is unavailable." };
    }

    element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });

    switch (step.action) {
      case "click":
        element.click();
        await waitForDomActionTick();
        return { step, ok: true, message: `Clicked ${getElementLabel(element) || "the target element"}.` };
      case "focus":
        element.focus();
        return { step, ok: true, message: `Focused ${getElementLabel(element) || "the target element"}.` };
      case "fill":
        await fillDomActionElement(element, step.value ?? "");
        return { step, ok: true, message: `Filled ${getElementLabel(element) || "the target field"}.` };
      case "select":
        selectDomActionElement(element, step.value ?? "");
        return { step, ok: true, message: `Selected a value for ${getElementLabel(element) || "the target field"}.` };
      case "submit":
        submitDomActionElement(element);
        return { step, ok: true, message: "Submitted the nearest form." };
      default:
        return { step, ok: false, message: "Unsupported action." };
    }
  } catch (error) {
    return { step, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function performNavigateAction(step: BrowserDomActionStep): void {
  const url = step.url || step.value || "";
  if (!url) {
    throw new Error("No navigation URL was provided.");
  }
  const destination = new URL(url, window.location.href);
  if (destination.protocol !== "http:" && destination.protocol !== "https:") {
    throw new Error("Only http and https page navigation is supported.");
  }
  window.location.assign(destination.href);
}

function resolveDomActionTarget(step: BrowserDomActionStep): HTMLElement | null {
  if (step.targetRef && domActionElementRefs.has(step.targetRef)) {
    return domActionElementRefs.get(step.targetRef) ?? null;
  }
  if (step.selector) {
    const element = document.querySelector(step.selector);
    return element instanceof HTMLElement ? element : null;
  }
  if (step.label) {
    const normalizedLabel = normalizeDomActionText(step.label).toLowerCase();
    return collectInteractiveElements().find((element) => getElementLabel(element).toLowerCase() === normalizedLabel) ?? null;
  }
  return null;
}

async function fillDomActionElement(element: HTMLElement, value: string): Promise<void> {
  const directTarget = resolveDirectEditableTarget(element);
  if (directTarget) {
    setEditableTargetValue(directTarget, value);
    return;
  }

  const activatedTarget = await resolveEditableTargetAfterActivation(element);
  if (activatedTarget) {
    setEditableTargetValue(activatedTarget, value);
    return;
  }

  throw new Error("Target element cannot be filled.");
}

function resolveDirectEditableTarget(element: HTMLElement): HTMLElement | HTMLInputElement | HTMLTextAreaElement | null {
  if (isTextEntryCandidate(element)) {
    return element;
  }
  const descendant = Array.from(element.querySelectorAll<HTMLElement | HTMLInputElement | HTMLTextAreaElement>(EDITOR_LIKE_SELECTOR))
    .find((candidate) => isTextEntryCandidate(candidate) && isDomActionElementVisible(candidate));
  return descendant ?? null;
}

async function resolveEditableTargetAfterActivation(element: HTMLElement): Promise<HTMLElement | HTMLInputElement | HTMLTextAreaElement | null> {
  const before = new Set(collectVisibleEditableTargets());
  element.focus();
  element.click();
  await waitForDomActionTick();

  const deadline = Date.now() + EDITOR_DISCOVERY_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const target = findNewEditableTarget(element, before);
    if (target) {
      return target;
    }
    await sleepDomActionTick(80);
  }
  return null;
}

function findNewEditableTarget(
  activatedElement: HTMLElement,
  before: Set<HTMLElement | HTMLInputElement | HTMLTextAreaElement>,
): HTMLElement | HTMLInputElement | HTMLTextAreaElement | null {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && isTextEntryCandidate(activeElement) && isDomActionElementVisible(activeElement)) {
    return activeElement;
  }

  const directTarget = resolveDirectEditableTarget(activatedElement);
  if (directTarget) {
    return directTarget;
  }

  const candidates = collectVisibleEditableTargets();
  const newCandidate = candidates.find((candidate) => !before.has(candidate));
  if (newCandidate) {
    return newCandidate;
  }
  return candidates.find((candidate) => isLikelyEditorNearActivatedElement(candidate, activatedElement)) ?? null;
}

function collectVisibleEditableTargets(): Array<HTMLElement | HTMLInputElement | HTMLTextAreaElement> {
  return Array.from(document.querySelectorAll<HTMLElement | HTMLInputElement | HTMLTextAreaElement>(EDITOR_LIKE_SELECTOR))
    .filter((candidate) => isTextEntryCandidate(candidate) && isDomActionElementVisible(candidate));
}

function insertDictationTextIntoFocusedEditable(text: string): { ok: boolean; error?: string; summary?: string } {
  const value = text.trim();
  if (!value) {
    return { ok: false, error: "No dictation text was provided." };
  }

  const target = resolveCurrentDictationEditableTarget();
  if (!target) {
    return { ok: false, error: "No focused editable field was found on this page." };
  }

  insertTextIntoEditableTarget(target, value);
  lastDictationEditableTarget = target;
  return { ok: true, summary: "Inserted dictation text into the focused field." };
}

function resolveCurrentDictationEditableTarget(): HTMLElement | HTMLInputElement | HTMLTextAreaElement | null {
  const activeTarget = resolveDictationEditableTarget(document.activeElement);
  if (activeTarget) {
    return activeTarget;
  }

  if (
    lastDictationEditableTarget &&
    document.contains(lastDictationEditableTarget) &&
    isTextEntryCandidate(lastDictationEditableTarget) &&
    isDomActionElementVisible(lastDictationEditableTarget)
  ) {
    return lastDictationEditableTarget;
  }
  return null;
}

function resolveDictationEditableTarget(
  target: EventTarget | Element | null,
): HTMLElement | HTMLInputElement | HTMLTextAreaElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const element = target instanceof HTMLElement ? target : target.closest<HTMLElement>(EDITOR_LIKE_SELECTOR);
  if (element && isTextEntryCandidate(element) && isDomActionElementVisible(element)) {
    return element;
  }
  const closest = target.closest<HTMLElement>(EDITOR_LIKE_SELECTOR);
  if (closest && isTextEntryCandidate(closest) && isDomActionElementVisible(closest)) {
    return closest;
  }
  return null;
}

function insertTextIntoEditableTarget(element: HTMLElement | HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus();
    const start = typeof element.selectionStart === "number" ? element.selectionStart : element.value.length;
    const end = typeof element.selectionEnd === "number" ? element.selectionEnd : start;
    const nextValue = `${element.value.slice(0, start)}${value}${element.value.slice(end)}`;
    setNativeTextControlValue(element, nextValue);
    const caret = start + value.length;
    element.setSelectionRange(caret, caret);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  element.focus();
  if (element.isContentEditable) {
    const selection = window.getSelection();
    const hasSelectionInTarget = Boolean(
      selection?.rangeCount &&
        selection.anchorNode &&
        selection.focusNode &&
        element.contains(selection.anchorNode) &&
        element.contains(selection.focusNode),
    );
    if (!hasSelectionInTarget) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    if (!document.execCommand("insertText", false, value)) {
      const range = selection?.rangeCount ? selection.getRangeAt(0) : document.createRange();
      range.deleteContents();
      const textNode = document.createTextNode(value);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  } else {
    element.textContent = `${element.textContent ?? ""}${value}`;
  }
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setEditableTargetValue(element: HTMLElement | HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus();
    setNativeTextControlValue(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (isTextEntryCandidate(element)) {
    element.focus();
    if (element.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (!document.execCommand("insertText", false, value)) {
        element.textContent = value;
      }
    } else {
      element.textContent = value;
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  throw new Error("Target element cannot be filled.");
}

function setNativeTextControlValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
    return;
  }
  element.value = value;
}

function sleepDomActionTick(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function selectDomActionElement(element: HTMLElement, value: string): void {
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error("Target element is not a select field.");
  }
  const normalizedValue = normalizeDomActionText(value).toLowerCase();
  const option = Array.from(element.options).find(
    (item) =>
      item.value.toLowerCase() === normalizedValue ||
      normalizeDomActionText(item.label || item.textContent || "").toLowerCase() === normalizedValue,
  );
  if (!option) {
    throw new Error("Requested select option was not found.");
  }
  element.value = option.value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function submitDomActionElement(element: HTMLElement): void {
  const form = element instanceof HTMLFormElement ? element : element.closest("form");
  if (!form) {
    throw new Error("No form was found near the target element.");
  }
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }
  form.submit();
}

function performScrollAction(element: HTMLElement | null, step: BrowserDomActionStep): void {
  const amount = step.amountPx ?? Math.round((window.innerHeight || 800) * 0.75);
  const target = element ?? window;
  const direction = step.direction ?? "down";
  if (target === window) {
    if (direction === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (direction === "bottom") {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      return;
    }
    window.scrollBy({
      left: direction === "left" ? -amount : direction === "right" ? amount : 0,
      top: direction === "up" ? -amount : direction === "down" ? amount : 0,
      behavior: "smooth",
    });
    return;
  }

  target.scrollBy({
    left: direction === "left" ? -amount : direction === "right" ? amount : 0,
    top: direction === "up" ? -amount : direction === "down" ? amount : 0,
    behavior: "smooth",
  });
}

function getElementLabel(element: HTMLElement): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  const labelledByText = labelledBy
    ? labelledBy
        .split(/\s+/u)
        .map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || "")
        .join(" ")
    : "";
  const inputLabels = element.id
    ? Array.from(document.querySelectorAll<HTMLLabelElement>(`label[for="${cssEscapeCompat(element.id)}"]`))
        .map((label) => label.innerText || label.textContent || "")
        .join(" ")
    : "";
  return normalizeDomActionText(
    element.getAttribute("aria-label") ||
      labelledByText ||
      inputLabels ||
      element.getAttribute("placeholder") ||
      element.getAttribute("title") ||
      (element instanceof HTMLInputElement ? element.value : "") ||
      element.innerText ||
      element.textContent ||
      "",
  ).slice(0, 160);
}

function getElementPlaceholder(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return normalizeDomActionText(element.placeholder || "");
  }
  return normalizeDomActionText(
    element.getAttribute("placeholder") ||
      element.getAttribute("aria-placeholder") ||
      element.getAttribute("data-placeholder") ||
      "",
  );
}

function getElementValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value.slice(0, 200);
  }
  return "";
}

function isTextEntryCandidate(element: HTMLElement): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase();
    return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
  }
  return (
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "plaintext-only" ||
    element.getAttribute("role") === "textbox" ||
    element.getAttribute("aria-multiline") === "true" ||
    element.getAttribute("data-lexical-editor") === "true" ||
    element.getAttribute("data-slate-editor") === "true" ||
    element.classList.contains("ProseMirror") ||
    element.classList.contains("ql-editor")
  );
}

function opensEditableSurface(element: HTMLElement): boolean {
  if (isTextEntryCandidate(element)) {
    return false;
  }
  return (
    element instanceof HTMLButtonElement ||
    element.getAttribute("role") === "button" ||
    element.getAttribute("aria-haspopup") === "dialog" ||
    element.getAttribute("aria-haspopup") === "menu" ||
    Boolean(element.getAttribute("aria-controls")) ||
    Boolean(element.getAttribute("aria-expanded")) ||
    element.tabIndex >= 0
  );
}

function isLikelyEditorNearActivatedElement(candidate: HTMLElement, activatedElement: HTMLElement): boolean {
  if (activatedElement.contains(candidate)) {
    return true;
  }
  const candidateRect = candidate.getBoundingClientRect();
  const activatedRect = activatedElement.getBoundingClientRect();
  const candidateCenterX = candidateRect.left + candidateRect.width / 2;
  const candidateCenterY = candidateRect.top + candidateRect.height / 2;
  const activatedCenterX = activatedRect.left + activatedRect.width / 2;
  const activatedCenterY = activatedRect.top + activatedRect.height / 2;
  return Math.hypot(candidateCenterX - activatedCenterX, candidateCenterY - activatedCenterY) < Math.max(window.innerHeight, 720);
}

function inferDomActionRole(element: HTMLElement): string {
  if (element instanceof HTMLButtonElement) {
    return "button";
  }
  if (element instanceof HTMLAnchorElement) {
    return "link";
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return "textbox";
  }
  if (element instanceof HTMLSelectElement) {
    return "combobox";
  }
  return element.isContentEditable ? "textbox" : element.tagName.toLowerCase();
}

function isDomActionElementDisabled(element: HTMLElement): boolean {
  return (
    element.getAttribute("aria-disabled") === "true" ||
    (element instanceof HTMLButtonElement && element.disabled) ||
    (element instanceof HTMLInputElement && element.disabled) ||
    (element instanceof HTMLTextAreaElement && element.disabled) ||
    (element instanceof HTMLSelectElement && element.disabled)
  );
}

function isDomActionElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

function buildElementSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${cssEscapeCompat(element.id)}`;
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current instanceof HTMLElement && current !== document.body && parts.length < 5) {
    const tag = current.tagName.toLowerCase();
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const currentTagName = current.tagName;
    const siblings = (Array.from(parent.children) as Element[]).filter((child) => child.tagName === currentTagName);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }
  return parts.join(" > ");
}

function cssEscapeCompat(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\#.:,[\]>+~*]/gu, "\\$&");
}

function summarizeDomActionResults(results: BrowserDomActionResult["results"]): string {
  const okCount = results.filter((result) => result.ok).length;
  if (okCount === results.length) {
    return "Requested browser action completed.";
  }
  if (okCount > 0) {
    return `Partially completed ${okCount} of ${results.length} browser actions.`;
  }
  return "No browser action was completed.";
}

function normalizeDomActionText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function findBestMatchingElement(query: string): HTMLElement | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "main, article, section, h1, h2, h3, h4, h5, h6, p, li, dt, dd, a, button, label, figcaption, td, th",
    ),
  );
  let best: { element: HTMLElement; score: number } | null = null;

  for (const element of candidates) {
    const text = element.innerText?.replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }
    if (!isElementVisible(element)) {
      continue;
    }

    const lower = text.toLowerCase();
    if (!lower.includes(normalized)) {
      continue;
    }

    const score = Math.abs(text.length - normalized.length);
    if (!best || score < best.score) {
      best = { element, score };
    }
  }

  return best?.element ?? null;
}

function clearHighlights(): void {
  for (const element of highlightedElements) {
    element.style.outline = "";
    element.style.outlineOffset = "";
    element.style.background = "";
    element.style.transition = "";
  }
  highlightedElements.clear();
}

function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
}
