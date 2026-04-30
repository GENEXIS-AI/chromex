import {
  DEFAULT_HARNESS_PERMISSIONS,
  type CodexActiveTurn,
  type CodexAppOption,
  type CodexMcpServerOption,
  type CodexModelOption,
  type CodexModelReroute,
  type CodexPluginOption,
  type CodexRateLimits,
  type CodexSkillOption,
  type CodexStructuredInput,
  type CodexThreadSummary,
  type CodexThreadTranscript,
  type CodexTurnDiff,
  type CodexTurnPlan,
  createFallbackAgenticRoutePlan,
  determineReadStrategy,
  inferActionCards,
  listProfileTemplates,
  normalizePageContext,
  normalizeAgenticRoutePlan,
  routePlanToPromptRoutingPlan,
  resolveHarnessPermission,
  type ActionCard,
  type AgenticRouteContextSource,
  type AgenticRouteInput,
  type AgenticRoutePlan,
  type BrowserAutomationMode,
  type BrowserDomActionPlan,
  type BrowserDomActionResult,
  type BrowserDomSnapshot,
  type HarnessPermissionOperation,
  type OpenTabContext,
  type PageContextEnvelope,
  type ProfileTemplate,
  type PromptRoutingPlan,
  type ReadStrategy,
  type SkillArchiveInstallResult,
  type UserFileAttachment,
  type WorkspaceHarnessSnapshot,
} from "@codex-sidepanel/shared";

import { createYouTubeCurrentMomentPromptResult } from "../youtube-current-moment.js";
import { getCurrentPageSupport, isRestrictedBrowserUrl } from "../permission-plans.js";
import {
  buildTabOriginPermission,
  isSitePermissionRequiredError,
  shouldAttemptTabOriginRecovery,
  SitePermissionRequiredError,
} from "../page-access.js";
import {
  BrowserPermissionRequiredError,
  isBrowserPermissionRequiredError,
} from "../browser-permission-errors.js";
import { classifyRuntimeMessageError, isRetryableRuntimeMessageError, toErrorMessage } from "../runtime-errors.js";
import {
  createConversation,
  clearConversations,
  deleteConversation,
  getCurrentConversation,
  getSelectedModel,
  getSelectedProfileId,
  getSelectedReasoningEffort,
  getSelectedServiceTier,
  getStoredSettings,
  listDeletedProfileIds,
  listConversations,
  listCustomProfiles,
  listSkills,
  normalizeConversationRetention,
  saveConversation,
  saveCustomProfile,
  deleteCustomProfile,
  saveSkill,
  resetStoredSettings,
  setCurrentConversationId,
  setSelectedModel,
  setSelectedProfileId,
  setSelectedReasoningEffort,
  setSelectedServiceTier,
  toConversationSummary,
  updateStoredSettings,
  deleteSkill,
} from "./storage.js";
import { resolveVisibleCurrentConversation } from "./conversation-history.js";
import { NativeBridgeClient } from "./native-bridge-client.js";
import { assertApiKeyLoginExplicitlyConfirmed } from "./api-key-login-guard.js";
import { createUserProfileTemplate, updateUserProfileTemplate } from "../profile-templates.js";
import { inferActionCardsForOpenTab } from "./site-suggestions.js";
import {
  normalizeCatalogWorkspaceRoot,
  resolveCatalogModelState,
  resolveSelectedCatalogModel,
  shouldTriggerCatalogRefresh,
} from "./catalog-refresh.js";
import {
  resolveUploadedImageReferenceInputs,
  resolveUploadedImageEditInput,
  type PromptImageWorkflowKind,
  shouldHandleAgenticImageEditWorkflow,
  shouldHandleAgenticImageGenerationWorkflow,
  shouldDeferPageContextCollectionForImageWorkflow,
  shouldSuppressDefaultCurrentPageContextForImageGeneration,
  shouldSuppressDefaultCurrentPageContextForImageWorkflow,
} from "./image-workflow-routing.js";
import { buildImageEditTimeoutMessage, IMAGE_EDIT_TIMEOUT_MS } from "./image-edit-timeout.js";
import { isRecoverableTurnSteerError } from "./turn-steer-recovery.js";
import {
  createVisibleTabCaptureThrottle,
  DEFAULT_VISIBLE_TAB_CAPTURE_MIN_INTERVAL_MS,
  isCaptureVisibleTabQuotaError,
} from "./visible-tab-capture-throttle.js";
import { buildVoiceSessionStartParams, buildVoiceSessionStopParams } from "./voice-session-routing.js";
import { createVoiceSessionContextPrompt } from "./voice-context.js";
import { buildInfographicPrompt } from "../infographic-prompt.js";
import { buildSlideDeckImagePrompt } from "../slide-deck-image-prompt.js";
import {
  shouldLogBackgroundMessageError,
  toExpectedPermissionErrorResponse,
} from "./background-error-response.js";
import { createPopoutUrlPath, selectBrowserWindowIdForPopout } from "./popup-window-target.js";
import {
  createHistorySearchOptions,
  createHistoryContextSummary,
  extractSearchQueryFromHistoryUrl,
  limitHistoryContextItems,
  resolveHistoryContextQuery,
  type HistoryContextItem,
} from "./history-context.js";
import { resolveUiLocale } from "../ui-language.js";
import { getUiStrings } from "../sidepanel/i18n.js";
import { selectEditablePageImageCandidate, type EditablePageImageCandidate } from "../page-image-target.js";
import {
  createEffectivePromptRoutePlan,
  createRawCaptureForReadStrategy,
  ensureDefaultCurrentPageContextRequests,
  filterSuppressedPageContextRequests,
  shouldSuppressDefaultCurrentPageContextForHistory,
  shouldAttachVisualAssetsForReadStrategy,
} from "../page-context.js";
import type {
  ContentProbeResult,
  ExtensionSettings,
  PromptRequestPayload,
  RuntimeConfigSnapshot,
  SavedConversation,
  UiInitPayload,
} from "../types.js";
import type { SkillOption } from "../sidepanel/skills.js";
import type { PromptActivityPhase } from "../sidepanel/prompt-activity.js";
import { mergeStructuredInputsWithEnabledCodexSkills } from "../codex-skill-settings.js";
import { requiresPluginCompanionAppConnection } from "../plugin-connection-availability.js";
import {
  createAvailableRouteStructuredInputs,
  expandPluginStructuredInputsWithConnectedApps,
  mergeExplicitAndRouteStructuredInputs,
  resolveRouteStructuredInputs,
} from "./route-structured-inputs.js";
import { isRecoverableMissingCodexThreadError, shouldAutoCompactConversation } from "./auto-compact.js";
import { resolveBridgeEventConversationId } from "./bridge-event-routing.js";
import { ConversationRuntimeRegistry } from "./conversation-runtime.js";
import {
  buildDeferredBrowserActionMessage,
  extractDeferredBrowserActionText,
  shouldResumeDeferredBrowserDomAction,
} from "./deferred-browser-action.js";
import {
  createPaperPdfFallbackContext,
  createGenericSiteFallbackContext,
  fetchPaperPdfAttachment,
  isSameDocumentAttachment,
  resolvePaperPdfSourceUrl,
} from "./pdf-page-context.js";

const bridge = new NativeBridgeClient();
const UI_BRIDGE_TIMEOUT_MS = 4000;
const UI_CONTEXT_TIMEOUT_MS = 2500;
const PLAYWRIGHT_RUNTIME_INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const throttleVisibleTabCapture = createVisibleTabCaptureThrottle();
const cancelledPromptClientRequestIds = new Set<string>();
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const OFFSCREEN_IMAGE_CROP_MESSAGE_TYPE = "offscreen.image.crop";
let offscreenDocumentPromise: Promise<void> | null = null;
const conversationRuntime = new ConversationRuntimeRegistry();
type ReadableBrowserTab = chrome.tabs.Tab & { id: number; url: string; windowId: number };
type PromptStatusEmitter = (phase: PromptActivityPhase, workflow?: PromptImageWorkflowKind) => void;
type PromptTurnResult = { threadId: string; turnId: string };
type CompletedAssistantMessageEvent = {
  type: "message.completed";
  text?: string;
  threadId?: string;
  turnId?: string;
};
type HarnessPermissionBlockedResponse = {
  error: string;
  requiresConfirmation?: boolean;
  confirmationOperation?: HarnessPermissionOperation;
};
type BrowserDomActionWorkflowResult =
  | { kind: "not-handled" }
  | { kind: "blocked"; response: HarnessPermissionBlockedResponse }
  | { kind: "handled"; response: { workflow: "browser-action"; assistantText: string; actionResult?: BrowserDomActionResult } };
type PendingImagePromptExtraction = {
  imageUrl: string;
  alt?: string;
  pageTitle?: string;
  pageUrl?: string;
  imageCandidate?: EditablePageImageCandidate;
  attachment?: UserFileAttachment;
  createdAt: number;
};
type PendingImageAttachment = {
  imageUrl: string;
  pageUrl?: string;
  createdAt: number;
};
type PendingContextMenuAction = "summarize-page" | "summarize-video";
let activeAiControlTab: ReadableBrowserTab | null = null;
const state = {
  selectedProfileId: "default",
  selectedModel: "",
  selectedReasoningEffort: "",
  selectedServiceTier: "",
  threadId: undefined as string | undefined,
  currentConversationId: undefined as string | undefined,
  currentDraftConversation: null as SavedConversation | null,
  browserWindowId: undefined as number | undefined,
  models: [] as CodexModelOption[],
  customProfiles: [] as ProfileTemplate[],
  deletedProfileIds: [] as string[],
  modelCatalogState: "loading" as UiInitPayload["modelCatalogState"],
  modelCatalogErrorMessage: "",
  appServerSkills: [] as CodexSkillOption[],
  connectedApps: [] as CodexAppOption[],
  appServerPlugins: [] as CodexPluginOption[],
  mcpServers: [] as CodexMcpServerOption[],
  serverThreads: [] as CodexThreadSummary[],
  rateLimits: null as CodexRateLimits | null,
  activeTurn: null as CodexActiveTurn | null,
  latestPlan: null as CodexTurnPlan | null,
  latestDiff: null as CodexTurnDiff | null,
  latestReroute: null as CodexModelReroute | null,
  accountStatus: null as UiInitPayload["accountStatus"] | null,
  workspaceHarness: null as WorkspaceHarnessSnapshot | null,
  playwrightRuntime: createFallbackPlaywrightRuntime(),
  imageAssetFolder: null as UiInitPayload["imageAssetFolder"] | null,
  diagnosticLogFolder: null as UiInitPayload["diagnosticLogFolder"] | null,
  catalogRefreshPromise: null as Promise<void> | null,
  lastRequestedCatalogWorkspaceRoot: null as string | null,
  initializationPromise: null as Promise<void> | null,
  initialized: false,
  lastAutoCompactThreadId: "" as string,
  lastAutoCompactBucket: null as number | null,
};

bridge.subscribe((event) => {
  const bridgeEvent = event as { type?: string };
  let eventConversationId: string | null = resolveBridgeEventConversationId(event, conversationRuntime);
  if (bridgeEvent.type === "turn.started") {
    const activeTurn = (event as { activeTurn: CodexActiveTurn }).activeTurn;
    if (eventConversationId) {
      conversationRuntime.setActiveTurn(eventConversationId, activeTurn);
      syncCurrentRuntimeState(eventConversationId);
    } else {
      state.activeTurn = activeTurn;
    }
  } else if (bridgeEvent.type === "turn.completed") {
    const completed = event as { threadId: string; turnId: string };
    eventConversationId = conversationRuntime.completeTurn(completed.threadId, completed.turnId) ?? eventConversationId;
    if (eventConversationId) {
      syncCurrentRuntimeState(eventConversationId);
    } else if (state.activeTurn?.turnId === completed.turnId) {
      state.activeTurn = null;
    }
  } else if (bridgeEvent.type === "turn.plan.updated") {
    const plan = (event as { plan: CodexTurnPlan }).plan;
    state.latestPlan = plan;
  } else if (bridgeEvent.type === "turn.diff.updated") {
    const diff = (event as { diff: CodexTurnDiff }).diff;
    state.latestDiff = diff;
  } else if (bridgeEvent.type === "account.rate_limits.updated") {
    state.rateLimits = (event as { rateLimits: CodexRateLimits | null }).rateLimits;
  } else if (bridgeEvent.type === "model.rerouted") {
    state.latestReroute = (event as { reroute: CodexModelReroute }).reroute;
  } else if (bridgeEvent.type === "catalog.updated") {
    void triggerCatalogRefresh();
  }
  broadcastBridgeEvent(annotateBridgeEventConversation(event, eventConversationId));
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ask-codex-page",
    title: chrome.i18n.getMessage("contextAskPage"),
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "edit-codex-image",
    title: chrome.i18n.getMessage("contextEditImage"),
    contexts: ["image"],
  });
  chrome.contextMenus.create({
    id: "summarize-codex-youtube",
    title: chrome.i18n.getMessage("contextSummarizeYoutube"),
    contexts: ["page"],
    documentUrlPatterns: ["*://*.youtube.com/*", "*://youtu.be/*"],
  });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

chrome.commands.onCommand.addListener((command) => {
  void handleCommand(command);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.windowId) {
    return;
  }
  state.browserWindowId = tab.windowId;
  await chrome.sidePanel.open({ windowId: tab.windowId });
  void broadcastActiveTabSnapshot();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  state.browserWindowId = activeInfo.windowId;
  void broadcastActiveTabSnapshot();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!tab.active) {
    return;
  }
  if (typeof state.browserWindowId === "number" && tab.windowId !== state.browserWindowId) {
    return;
  }
  if (!changeInfo.title && !changeInfo.url && !changeInfo.favIconUrl && changeInfo.status !== "complete") {
    return;
  }

  state.browserWindowId = tab.windowId;
  void broadcastActiveTabSnapshot();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (typeof tab?.windowId === "number") {
    state.browserWindowId = tab.windowId;
  }

  const sidePanelOpenPromise = openSidePanelForContextMenu(tab).catch((error) => {
    console.warn("Failed to open the Chromex side panel from a context menu action.", error);
  });

  if (info.menuItemId === "edit-codex-image" && info.srcUrl) {
    await chrome.storage.session.set({
      pendingImageAttachment: {
        imageUrl: info.srcUrl,
        ...(info.pageUrl || tab?.url ? { pageUrl: info.pageUrl ?? tab?.url } : {}),
        createdAt: Date.now(),
      },
    });
    await chrome.storage.session.remove("pendingAction");
    await sidePanelOpenPromise;
    void broadcastActiveTabSnapshot();
    void chrome.runtime.sendMessage({ type: "ui.image-attachment.pending" }).catch(() => undefined);
    return;
  }

  const pendingAction = resolvePendingContextMenuAction(info.menuItemId);
  if (!pendingAction) {
    await sidePanelOpenPromise;
    void broadcastActiveTabSnapshot();
    return;
  }

  await chrome.storage.session.set({
    pendingAction: pendingAction,
  });
  await chrome.storage.session.remove("pendingImageAttachment");
  await sidePanelOpenPromise;
  void broadcastActiveTabSnapshot();
  void chrome.runtime.sendMessage({ type: "ui.context-menu-action.pending" }).catch(() => undefined);
});

async function openSidePanelForContextMenu(tab?: chrome.tabs.Tab): Promise<void> {
  const windowId = typeof tab?.windowId === "number" ? tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
  try {
    await chrome.sidePanel.open({ windowId });
    return;
  } catch (error) {
    if (typeof tab?.id === "number") {
      await chrome.sidePanel.open({ tabId: tab.id });
      return;
    }
    throw error;
  }
}

function resolvePendingContextMenuAction(menuItemId: unknown): PendingContextMenuAction | null {
  if (menuItemId === "summarize-codex-youtube") {
    return "summarize-video";
  }
  if (menuItemId === "ask-codex-page") {
    return "summarize-page";
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") {
    return false;
  }

  if (message.type === "page.image-prompt.extract") {
    void handlePageImagePromptExtraction(message, sender.tab)
      .then(sendResponse)
      .catch((error) => {
        const expectedPermissionResponse = toExpectedPermissionErrorResponse(error);
        if (expectedPermissionResponse) {
          sendResponse(expectedPermissionResponse);
          return;
        }
        if (shouldLogBackgroundMessageError(error)) {
          console.error("background message handling failed", message?.type, error);
        }
        sendResponse({
          error: error instanceof Error ? error.message : "Unknown background failure",
        });
      });
    return true;
  }

  void (async () => {
    try {
      await ensureStateLoaded();

      switch (message.type) {
        case "ui.init":
          sendResponse(await buildUiInitPayload(message.windowId, { forceCatalog: Boolean(message.forceCatalog) }));
          return;
        case "ui.popout":
          sendResponse(await popOutChat());
          return;
        case "ui.dock":
          sendResponse(await dockChat(message.targetWindowId, message.popupWindowId));
          return;
        case "profile.list":
          sendResponse({ profiles: listAvailableProfiles(), selectedProfileId: state.selectedProfileId });
          return;
        case "profile.select":
          state.selectedProfileId = getAvailableProfileTemplate(String(message.profileId ?? "")).id;
          await setSelectedProfileId(state.selectedProfileId);
          sendResponse({ ok: true, selectedProfileId: state.selectedProfileId });
          return;
        case "profile.create": {
          const profile = createUserProfileTemplate({
            name: String(message.name ?? ""),
            systemPrompt: typeof message.systemPrompt === "string" ? message.systemPrompt : "",
            visual: typeof message.visual === "object" && message.visual ? message.visual as ProfileTemplate["visual"] : undefined,
            suggestedPrompts: Array.isArray(message.suggestedPrompts) ? message.suggestedPrompts.map(String) : [],
            existingIds: listAvailableProfiles().map((item) => item.id),
          });
          state.customProfiles = await saveCustomProfile(profile);
          state.selectedProfileId = profile.id;
          await setSelectedProfileId(profile.id);
          sendResponse({
            ok: true,
            profile,
            profiles: listAvailableProfiles(),
            selectedProfileId: state.selectedProfileId,
          });
          return;
        }
        case "profile.update": {
          const profileId = String(message.profileId ?? "");
          const current = getAvailableProfileTemplate(profileId);
          const profile = updateUserProfileTemplate(current, {
            name: String(message.name ?? current.name),
            systemPrompt: typeof message.systemPrompt === "string" ? message.systemPrompt : current.systemPrompt,
            visual: typeof message.visual === "object" && message.visual ? message.visual as ProfileTemplate["visual"] : current.visual,
            suggestedPrompts: Array.isArray(message.suggestedPrompts)
              ? message.suggestedPrompts.map(String)
              : (current.suggestedPrompts ?? []),
          });
          state.customProfiles = await saveCustomProfile(profile);
          state.selectedProfileId = profile.id;
          await setSelectedProfileId(profile.id);
          sendResponse({
            ok: true,
            profile,
            profiles: listAvailableProfiles(),
            selectedProfileId: state.selectedProfileId,
          });
          return;
        }
        case "profile.delete": {
          const profileId = String(message.profileId ?? "");
          if (profileId === "default") {
            sendResponse({ error: "The default profile cannot be deleted." });
            return;
          }
          const builtinIds = new Set(listProfileTemplates().map((profile) => profile.id));
          state.customProfiles = await deleteCustomProfile(profileId, { hideBuiltin: builtinIds.has(profileId) });
          state.deletedProfileIds = await listDeletedProfileIds();
          if (state.selectedProfileId === profileId) {
            state.selectedProfileId = normalizeSelectedProfileId("default");
            await setSelectedProfileId(state.selectedProfileId);
          }
          sendResponse({
            ok: true,
            profiles: listAvailableProfiles(),
            selectedProfileId: state.selectedProfileId,
          });
          return;
        }
        case "model.select":
          await persistSelectedModelControls({
            model: typeof message.model === "string" ? message.model : state.selectedModel,
            reasoningEffort: typeof message.reasoningEffort === "string" ? message.reasoningEffort : undefined,
            serviceTier: typeof message.serviceTier === "string" ? message.serviceTier : undefined,
          });
          sendResponse({
            ok: true,
            selectedModel: state.selectedModel,
            selectedReasoningEffort: state.selectedReasoningEffort,
            selectedServiceTier: state.selectedServiceTier,
          });
          return;
        case "settings.update":
          sendResponse(await handleSettingsUpdate(message.settings ?? {}));
          return;
        case "settings.reset": {
          const settings = await resetStoredSettings();
          state.selectedProfileId = normalizeSelectedProfileId("default");
          state.selectedModel = "";
          state.selectedReasoningEffort = "";
          state.selectedServiceTier = "";
          state.deletedProfileIds = await listDeletedProfileIds();
          await setSelectedProfileId(state.selectedProfileId);
          await setSelectedModel("");
          await setSelectedReasoningEffort("");
          await setSelectedServiceTier("");
          sendResponse({
            ok: true,
            settings,
            profiles: listAvailableProfiles(),
            selectedProfileId: state.selectedProfileId,
            selectedModel: state.selectedModel,
            selectedReasoningEffort: state.selectedReasoningEffort,
            selectedServiceTier: state.selectedServiceTier,
          });
          return;
        }
        case "conversation.new":
          sendResponse(await startNewConversation(message.profileId, message.model));
          return;
        case "conversation.resume":
          sendResponse(await resumeConversation(message.conversationId));
          return;
        case "conversation.resume.server":
          sendResponse(await resumeServerConversation(message.threadId));
          return;
        case "conversation.save":
          sendResponse(await persistConversation(message.conversation));
          return;
        case "conversation.delete":
          sendResponse(await handleConversationDelete(String(message.conversationId ?? "")));
          return;
        case "conversation.clear":
          sendResponse(await handleConversationClear());
          return;
        case "conversation.compact":
          sendResponse(await handleConversationCompact(Boolean(message.waitForCompletion)));
          return;
        case "skills.list":
          sendResponse({ skills: await listMergedSkills() });
          return;
        case "skills.archive.install":
          sendResponse(await handleSkillArchiveInstall(message.filename, message.base64));
          return;
        case "runtime.playwright.status":
          sendResponse({ playwrightRuntime: await refreshPlaywrightRuntime() });
          return;
        case "runtime.playwright.install":
          sendResponse({ playwrightRuntime: await installPlaywrightRuntime() });
          return;
        case "skill.save":
          sendResponse({
            skills: mergeSkillOptions(
              await saveSkill({
                id: message.skill.id || `custom-skill-${Date.now()}`,
                name: message.skill.name,
                prompt: message.skill.prompt,
                description: message.skill.description ?? "Saved prompt",
              }),
              await getWorkspaceHarness(),
            ),
          });
          return;
        case "skill.delete":
          sendResponse({
            skills: mergeSkillOptions(await deleteSkill(message.skillId), await getWorkspaceHarness()),
          });
          return;
        case "mcp.servers.list": {
          const mcpServers = await bridge.request<CodexMcpServerOption[]>("mcp.servers.list", {
            detail: message.detail === "full" ? "full" : "toolsAndAuthOnly",
            limit: Number.isFinite(message.limit) ? Number(message.limit) : 100,
          });
          state.mcpServers = mcpServers;
          sendResponse({ mcpServers });
          return;
        }
        case "mcp.oauth.login.start":
          sendResponse(
            await bridge.request("mcp.oauth.login.start", {
              name: String(message.name ?? ""),
              scopes: Array.isArray(message.scopes) ? message.scopes.map(String) : undefined,
              timeoutSecs: Number.isFinite(message.timeoutSecs) ? Number(message.timeoutSecs) : undefined,
            }),
          );
          return;
        case "mcp.servers.reload":
          sendResponse(await bridge.request("mcp.servers.reload"));
          void triggerCatalogRefresh(undefined, { force: true });
          return;
        case "app.install.open":
          sendResponse(await openAppInstallUrl(String(message.url ?? "")));
          return;
        case "account.login.start":
          sendResponse(await handleAccountLogin(message.loginType, message.apiKey, Boolean(message.confirmed)));
          return;
        case "account.logout":
          sendResponse(await bridge.request("account.logout"));
          return;
        case "context.tabs.list":
          sendResponse(await guardAndRun("context.tabs.read", Boolean(message.confirmed), () => listOpenTabsResult()));
          return;
        case "context.history.search":
          sendResponse(
            await guardAndRun("context.history.read", Boolean(message.confirmed), () => searchHistory(message.query)),
          );
          return;
        case "image.prompt.pending.take":
          sendResponse(await takePendingImagePromptExtraction());
          return;
        case "image.prompt.error.pending.take":
          sendResponse(await takePendingImagePromptError());
          return;
        case "image.attachment.pending.take":
          sendResponse(await takePendingImageAttachment());
          return;
        case "context.menu.pending.take":
          sendResponse(await takePendingContextMenuAction());
          return;
        case "prompt.send":
          sendResponse(await handlePromptSend(message.payload));
          return;
        case "prompt.route.preview":
          sendResponse(await handlePromptRoutePreview(message.payload));
          return;
        case "prompt.cancel":
          sendResponse(await handlePromptCancel(message.clientRequestId, message.threadId, message.turnId));
          return;
        case "turn.steer":
          sendResponse(await handleTurnSteer(message.payload));
          return;
        case "turn.interrupt":
          sendResponse(await handleTurnInterrupt(message.threadId, message.turnId));
          return;
        case "image.edit.start":
          sendResponse(await handleImageEdit(message.prompt, Boolean(message.confirmed)));
          return;
        case "image.infographic.start":
          sendResponse(
            await handleInfographicGenerate(
              Boolean(message.confirmed),
              message.conversationContext,
              message.clientRequestId,
              message.conversationId,
            ),
          );
          return;
        case "image.slides.start":
          sendResponse(
            await handleSlideDeckImageGenerate(
              typeof message.prompt === "string" ? message.prompt : "",
              Boolean(message.confirmed),
              message.conversationContext,
              message.clientRequestId,
              message.conversationId,
            ),
          );
          return;
        case "image.edit.preview":
          sendResponse(await bridge.request("image.edit.preview", { jobId: message.jobId }));
          return;
        case "image.asset.read":
          sendResponse(
            await bridge.request("image.asset.read", {
              previewRef: message.previewRef,
              offset: message.offset,
              length: message.length,
            }),
          );
          return;
        case "image.asset.delete":
          sendResponse(await bridge.request("image.asset.delete", { previewRef: message.previewRef }));
          return;
        case "image.asset.folder":
          sendResponse(await bridge.request("image.asset.folder"));
          return;
        case "image.asset.folder.open":
          sendResponse(await bridge.request("image.asset.folder.open", { folder: message.folder }));
          return;
        case "diagnostics.log.folder":
          sendResponse(await bridge.request("diagnostics.log.folder"));
          return;
        case "diagnostics.log.folder.open":
          sendResponse(await bridge.request("diagnostics.log.folder.open", { folder: message.folder }));
          return;
        case "diagnostics.log.write":
          sendResponse(await bridge.request("diagnostics.log.write", { event: message.event, details: message.details ?? {} }));
          return;
        case "voice.session.start":
          sendResponse(
            await guardAndRun("voice.session.start", Boolean(message.confirmed), async () => {
              return bridge.request<{ threadId?: string }>(
                "voice.session.start",
                await buildVoiceSessionStartParamsWithContext(message),
              );
            }),
          );
          return;
        case "voice.session.stop":
          sendResponse(
            await bridge.request("voice.session.stop", buildVoiceSessionStopParams(message, state.threadId)),
          );
          return;
        case "voice.context.snapshot":
          sendResponse({ prompt: await collectVoiceSessionContextPrompt() });
          return;
        case "voice.session.append_text":
          sendResponse(
            await bridge.request("voice.session.append_text", {
              threadId: typeof message.threadId === "string" ? message.threadId : undefined,
              text: typeof message.text === "string" ? message.text : "",
            }),
          );
          return;
        case "voice.session.append_audio":
          sendResponse(
            await bridge.request("voice.session.append_audio", {
              threadId: typeof message.threadId === "string" ? message.threadId : undefined,
              audio: message.audio,
            }),
          );
          return;
        case "voice.microphone.permission.result":
          sendResponse({ ok: true });
          return;
        case "youtube.current-moment.prompt":
          sendResponse(await handleYouTubeCurrentMomentPrompt());
          return;
        case "youtube.seek":
          sendResponse(
            await guardAndRun("page.navigate", Boolean(message.confirmed), async () => {
              await sendMessageToActiveTab({ type: "youtube.seek", seconds: message.seconds });
              return { ok: true };
            }),
          );
          return;
        case "page.apply-image-overlay":
          sendResponse(
            await guardAndRun("page.image.overlay", Boolean(message.confirmed), async () => {
              await sendMessageToActiveTab({ type: "page.apply-image-overlay", previewRef: message.previewRef });
              return { ok: true };
            }),
          );
          return;
        case "page.clear-image-overlay":
          await sendMessageToActiveTab({ type: "page.clear-image-overlay" });
          sendResponse({ ok: true });
          return;
        case "page.image-prompt-hover.install":
          sendResponse(await installImagePromptHoverForTab(await getActiveTab().catch(() => null)));
          return;
        case "page.image-prompt.extract":
          sendResponse(await handlePageImagePromptExtraction(message, sender.tab));
          return;
        case "page.navigate":
          sendResponse(
            await guardAndRun("page.navigate", Boolean(message.confirmed), () =>
              sendMessageToActiveTab({ type: "page.navigate", command: message.command }),
            ),
          );
          return;
        case "page.dom.perform":
          sendResponse(
            await guardAndRun("page.dom.perform", Boolean(message.confirmed), () =>
              sendPageDomPerformWithIndicator(message.steps),
            ),
          );
          return;
        default:
          sendResponse({ error: `Unknown message type: ${message.type as string}` });
      }
    } catch (error) {
      const expectedPermissionResponse = toExpectedPermissionErrorResponse(error);
      if (expectedPermissionResponse) {
        sendResponse(expectedPermissionResponse);
        return;
      }
      if (shouldLogBackgroundMessageError(error)) {
        console.error("background message handling failed", message?.type, error);
      }
      sendResponse({
        error: error instanceof Error ? error.message : "Unknown background failure",
      });
    }
  })();

  return true;
});

async function handleCommand(command: string): Promise<void> {
  const activeTab = await getActiveTab().catch(() => null);
  if (activeTab?.windowId) {
    state.browserWindowId = activeTab.windowId;
  }

  if (command === "open-side-panel" && activeTab?.windowId) {
    await chrome.sidePanel.open({ windowId: activeTab.windowId });
    return;
  }

  if (command === "open-popup-chat") {
    await popOutChat();
  }
}

function listAvailableProfiles(): ProfileTemplate[] {
  const deleted = new Set(state.deletedProfileIds);
  const overrides = new Map(state.customProfiles.map((profile) => [profile.id, profile]));
  const builtinIds = new Set(listProfileTemplates().map((profile) => profile.id));
  const builtins = listProfileTemplates()
    .filter((profile) => !deleted.has(profile.id))
    .map((profile) => overrides.get(profile.id) ?? profile);
  const customOnly = state.customProfiles
    .filter((profile) => !builtinIds.has(profile.id) && !deleted.has(profile.id))
    .sort((left, right) => left.name.localeCompare(right.name));
  return [...builtins, ...customOnly];
}

function getAvailableProfileTemplate(profileId: string): ProfileTemplate {
  const profile = listAvailableProfiles().find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Unknown profile template: ${profileId}`);
  }
  return profile;
}

function normalizeSelectedProfileId(profileId: string | null | undefined): string {
  const availableProfiles = listAvailableProfiles();
  const requested = profileId?.trim();
  if (requested && availableProfiles.some((profile) => profile.id === requested)) {
    return requested;
  }
  return availableProfiles.some((profile) => profile.id === "default")
    ? "default"
    : (availableProfiles[0]?.id ?? "default");
}

async function ensurePromptConversationRuntime(payload: PromptRequestPayload) {
  const requestedConversationId = payload.conversationId?.trim();
  let conversationId = requestedConversationId || state.currentConversationId || "";
  if (!conversationId) {
    const conversation = await createConversation(payload.profileId, payload.model ?? state.selectedModel);
    conversationId = conversation.id;
    state.currentConversationId = conversation.id;
    state.currentDraftConversation = conversation;
    await setCurrentConversationId(conversation.id);
  }

  await seedConversationRuntime(conversationId);
  return conversationRuntime.get(conversationId);
}

async function seedConversationRuntime(conversationId: string): Promise<void> {
  const runtime = conversationRuntime.get(conversationId);
  if (runtime.threadId) {
    return;
  }
  const conversation = (await listConversations()).find((item) => item.id === conversationId);
  if (conversation?.threadId) {
    conversationRuntime.setThreadId(conversationId, conversation.threadId);
  }
}

function syncCurrentRuntimeState(conversationId: string): void {
  if (state.currentConversationId !== conversationId) {
    return;
  }
  const runtime = conversationRuntime.get(conversationId);
  state.threadId = runtime.threadId;
  state.activeTurn = runtime.activeTurn;
  state.lastAutoCompactThreadId = runtime.lastAutoCompactThreadId;
  state.lastAutoCompactBucket = runtime.lastAutoCompactBucket;
}

function annotateBridgeEventConversation(event: unknown, conversationId: string | null): unknown {
  if (!conversationId || typeof event !== "object" || event === null) {
    return event;
  }
  return {
    ...event,
    conversationId,
  };
}

async function ensureStateLoaded(): Promise<void> {
  if (state.initialized) {
    return;
  }

  if (!state.initializationPromise) {
    state.initializationPromise = (async () => {
      await normalizeConversationRetention();
      const { settings } = await syncRuntimeConfigAndNormalizeSettings();
      const [customProfiles, deletedProfileIds] = await Promise.all([listCustomProfiles(), listDeletedProfileIds()]);
      state.customProfiles = customProfiles;
      state.deletedProfileIds = deletedProfileIds;
      state.selectedProfileId = normalizeSelectedProfileId(await getSelectedProfileId());
      state.selectedModel = await getSelectedModel();
      state.selectedReasoningEffort = await getSelectedReasoningEffort();
      state.selectedServiceTier = await getSelectedServiceTier();
      const workspaceHarness = await softTimeout(
        getWorkspaceHarness(),
        UI_BRIDGE_TIMEOUT_MS,
        state.workspaceHarness ?? createFallbackWorkspaceHarness(settings.workspaceRoot),
        "workspace.harness.read(startup)",
      );
      state.workspaceHarness = workspaceHarness;
      const currentConversation = await getCurrentConversation();
      if (currentConversation) {
        state.currentConversationId = currentConversation.id;
        conversationRuntime.setThreadId(currentConversation.id, currentConversation.threadId);
        syncCurrentRuntimeState(currentConversation.id);
      }

      state.initialized = true;
      void triggerCatalogRefresh(workspaceHarness.workspaceRoot || undefined);
    })().finally(() => {
      state.initializationPromise = null;
    });
  }

  await state.initializationPromise;
}

async function buildUiInitPayload(
  windowId?: number,
  options: { forceCatalog?: boolean } = {},
): Promise<UiInitPayload> {
  if (typeof windowId === "number") {
    state.browserWindowId = windowId;
  }

  const { settings, runtimeConfig } = await syncRuntimeConfigAndNormalizeSettings();

  const [accountStatus, conversations, workspaceHarness, playwrightRuntime, imageAssetFolder, diagnosticLogFolder] = await Promise.all([
    softTimeout(
      bridge.request<UiInitPayload["accountStatus"]>("account.status"),
      UI_BRIDGE_TIMEOUT_MS,
      state.accountStatus ?? createFallbackAccountStatus(),
      "account.status",
    ),
    listConversations(),
    softTimeout(
      getWorkspaceHarness(),
      UI_BRIDGE_TIMEOUT_MS,
      state.workspaceHarness ?? createFallbackWorkspaceHarness(settings.workspaceRoot),
      "workspace.harness.read",
    ),
    softTimeout(
      bridge.request<UiInitPayload["playwrightRuntime"]>("runtime.playwright.status"),
      UI_BRIDGE_TIMEOUT_MS,
      state.playwrightRuntime,
      "runtime.playwright.status",
    ),
    softTimeout(
      bridge.request<UiInitPayload["imageAssetFolder"]>("image.asset.folder"),
      UI_BRIDGE_TIMEOUT_MS,
      state.imageAssetFolder ?? createFallbackImageAssetFolder(),
      "image.asset.folder",
    ),
    softTimeout(
      bridge.request<UiInitPayload["diagnosticLogFolder"]>("diagnostics.log.folder"),
      UI_BRIDGE_TIMEOUT_MS,
      state.diagnosticLogFolder ?? createFallbackDiagnosticLogFolder(),
      "diagnostics.log.folder",
    ),
  ]);
  state.accountStatus = accountStatus;
  state.workspaceHarness = workspaceHarness;
  state.playwrightRuntime = playwrightRuntime;
  state.imageAssetFolder = imageAssetFolder;
  state.diagnosticLogFolder = diagnosticLogFolder;

  await softTimeout(
    triggerCatalogRefresh(workspaceHarness.workspaceRoot || undefined, {
      force: options.forceCatalog || state.modelCatalogState !== "ready" || state.models.length === 0,
    }),
    UI_BRIDGE_TIMEOUT_MS,
    undefined,
    "catalog.refresh(ui.init)",
  );

  const activeTab = await getActiveTab().catch(() => null);
  const currentPageSupport = getCurrentPageSupport(activeTab?.url);

  const [customProfiles, deletedProfileIds, currentContext] = await Promise.all([
    listCustomProfiles(),
    listDeletedProfileIds(),
    currentPageSupport.available
      ? softTimeout(collectCurrentPageContext("auto"), UI_CONTEXT_TIMEOUT_MS, null, "context.collect")
      : Promise.resolve(null),
  ]);
  const currentConversation = resolveVisibleCurrentConversation({
    conversations,
    currentConversationId: state.currentConversationId,
    draftConversation: state.currentDraftConversation,
  });

  state.customProfiles = customProfiles;
  state.deletedProfileIds = deletedProfileIds;
  state.selectedProfileId = normalizeSelectedProfileId(state.selectedProfileId);
  if (currentConversation) {
    state.currentConversationId = currentConversation.id;
    conversationRuntime.setThreadId(currentConversation.id, currentConversation.threadId);
    syncCurrentRuntimeState(currentConversation.id);
  }

  const uiLocale = resolveSettingsUiLocale(settings);
  const activeTabActionCards = activeTab ? inferActionCardsForOpenTab(tabToOpenTabContext(activeTab), uiLocale) : [];

  return {
    accountStatus,
    currentPageSupport,
    currentTab: activeTab ? tabToOpenTabContext(activeTab) : null,
    models: state.models,
    profiles: listAvailableProfiles(),
    selectedProfileId: state.selectedProfileId,
    selectedModel: state.selectedModel,
    selectedReasoningEffort: state.selectedReasoningEffort,
    selectedServiceTier: state.selectedServiceTier,
    modelCatalogState: state.modelCatalogState,
    modelCatalogErrorMessage: state.modelCatalogErrorMessage,
    currentContext: currentContext
      ? {
          envelope: currentContext.envelope,
          readStrategy: currentContext.readStrategy,
        }
      : null,
    actionCards: currentContext?.actionCards?.length ? currentContext.actionCards : activeTabActionCards,
    settings,
    runtimeConfig,
    playwrightRuntime,
    skills: [],
    appServerSkills: state.appServerSkills,
    connectedApps: state.connectedApps,
    appServerPlugins: state.appServerPlugins,
    mcpServers: state.mcpServers,
    recentChats: conversations.map(toConversationSummary),
    serverThreads: state.serverThreads,
    currentConversation,
    rateLimits: state.rateLimits,
    activeTurn: state.activeTurn,
    latestPlan: state.latestPlan,
    latestDiff: state.latestDiff,
    latestReroute: state.latestReroute,
    workspaceHarness,
    imageAssetFolder,
    diagnosticLogFolder,
  };
}

async function handleAccountLogin(
  loginType: "chatgpt" | "apiKey",
  apiKey?: string,
  confirmed = false,
): Promise<unknown> {
  if (loginType === "apiKey") {
    assertApiKeyLoginExplicitlyConfirmed({ loginType, apiKey, confirmed });
    return bridge.request("account.login.start", {
      type: "apiKey",
      ...(apiKey ? { apiKey } : {}),
    });
  }

  const result = await bridge.request<{ authUrl?: string }>("account.login.start", {
    type: "chatgpt",
  });
  if (result.authUrl) {
    await chrome.tabs.create({ url: result.authUrl });
  }
  return result;
}

async function openAppInstallUrl(url: string): Promise<{ ok: true }> {
  const parsed = parseExternalInstallUrl(url);
  if (!parsed) {
    throw new Error(getUiStrings(await getActiveUiLocale()).errors.invalidAppConnectionUrl);
  }
  await chrome.tabs.create({ url: parsed.toString() });
  return { ok: true };
}

function parseExternalInstallUrl(value: string): URL | null {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}

async function handlePromptRoutePreview(payload: PromptRequestPayload): Promise<{ plan: AgenticRoutePlan }> {
  const settings = await getStoredSettings();
  const activeTab = await getActiveTab().catch(() => null);
  const routeInput = createAgenticRouteInput(payload, activeTab, settings);
  return {
    plan: await planAgenticRouteForPayload(payload, routeInput),
  };
}

async function handlePromptSend(payload: PromptRequestPayload) {
  const runtime = await ensurePromptConversationRuntime(payload);
  const conversationId = runtime.conversationId;
  payload.conversationId = conversationId;
  void recordDiagnostic("extension.prompt.send", {
    clientRequestId: payload.clientRequestId ?? null,
    conversationId,
    messageLength: payload.message.length,
    attachments: payload.attachments,
    fileAttachmentCount: payload.fileAttachments?.length ?? 0,
  });
  emitPromptStatus(payload, "routing");
  const promptGate = await ensureOperationAllowed(
    "prompt.send",
    payload.confirmedOperations?.includes("prompt.send") ?? false,
  );
  if (!promptGate.ok) {
    return promptGate.response;
  }
  const cancellationAfterGate = await getPromptCancellationResponse(payload);
  if (cancellationAfterGate) {
    return cancellationAfterGate;
  }

  const settings = await getStoredSettings();
  const prepared = await buildPromptRequest(payload, settings, (phase, workflow) => emitPromptStatus(payload, phase, workflow));
  if (!prepared.ok) {
    return prepared.response;
  }
  const cancellationAfterBuild = await getPromptCancellationResponse(payload);
  if (cancellationAfterBuild) {
    return cancellationAfterBuild;
  }

  if (payload.resetThread) {
    conversationRuntime.resetConversation(conversationId);
    syncCurrentRuntimeState(conversationId);
  }

  const imageWorkflow = await maybeHandleAgenticImageWorkflow(
    payload,
    prepared.agenticRoutePlan,
    (phase, workflow) => emitPromptStatus(payload, phase, workflow),
  );
  if (imageWorkflow.kind === "blocked") {
    return imageWorkflow.response;
  }
  if (imageWorkflow.kind === "handled") {
    return {
      ...imageWorkflow.response,
      actionCards: prepared.actionCards,
      settings,
      currentConversationId: conversationId,
    };
  }
  const imageGenerationWorkflow = await maybeHandleAgenticImageGenerationWorkflow(
    payload,
    prepared.agenticRoutePlan,
    prepared.contexts,
    prepared.fileAttachments,
    (phase, workflow) => emitPromptStatus(payload, phase, workflow),
  );
  if (imageGenerationWorkflow.kind === "blocked") {
    return imageGenerationWorkflow.response;
  }
  if (imageGenerationWorkflow.kind === "handled") {
    return {
      ...imageGenerationWorkflow.response,
      actionCards: prepared.actionCards,
      settings,
      currentConversationId: conversationId,
    };
  }
  const cancellationAfterImageWorkflow = await getPromptCancellationResponse(payload);
  if (cancellationAfterImageWorkflow) {
    return cancellationAfterImageWorkflow;
  }
  const browserActionWorkflow = await maybeHandleBrowserDomActionWorkflow(
    payload,
    prepared.agenticRoutePlan,
    (phase, workflow) => emitPromptStatus(payload, phase, workflow),
  );
  if (browserActionWorkflow.kind === "blocked") {
    return browserActionWorkflow.response;
  }
  if (browserActionWorkflow.kind === "handled") {
    return {
      ...browserActionWorkflow.response,
      actionCards: prepared.actionCards,
      settings,
      currentConversationId: conversationId,
    };
  }
  const deferredBrowserActionGate = await maybeEnsureDeferredBrowserDomActionAllowed(payload, prepared.agenticRoutePlan);
  if (deferredBrowserActionGate.kind === "blocked") {
    return deferredBrowserActionGate.response;
  }
  const cancellationAfterBrowserWorkflow = await getPromptCancellationResponse(payload);
  if (cancellationAfterBrowserWorkflow) {
    return cancellationAfterBrowserWorkflow;
  }

  await maybeAutoCompactBeforePrompt(payload, settings, conversationId);
  const cancellationAfterCompact = await getPromptCancellationResponse(payload);
  if (cancellationAfterCompact) {
    return cancellationAfterCompact;
  }

  emitPromptStatus(payload, "waiting-for-codex");
  const cwd = normalizeConfiguredPath(settings.workspaceRoot);
  let threadId = conversationRuntime.get(conversationId).threadId;
  if (!threadId) {
    const opened = await bridge.request<{ threadId: string }>("session.open", {
      ...(cwd ? { cwd } : {}),
      ...(prepared.selectedModel ? { model: prepared.selectedModel } : {}),
    });
    threadId = opened.threadId;
    conversationRuntime.setThreadId(conversationId, threadId);
    syncCurrentRuntimeState(conversationId);
  }
  const structuredInputs = mergeStructuredInputsWithEnabledCodexSkills(
    prepared.structuredInputs,
    state.appServerSkills,
    settings.enabledCodexSkillIds,
    createCodexSkillRuntimeAvailability(settings),
    state.connectedApps,
  );
  const promptTurn = await requestPromptSendWithAssistantCapture({
    clientRequestId: payload.clientRequestId,
    profile: prepared.profile,
    message: payload.message,
    contexts: prepared.contexts,
    fileAttachments: prepared.fileAttachments,
    routePlan: prepared.routePlan,
    structuredInputs,
    threadId,
    ...(cwd ? { cwd } : {}),
    ...(prepared.selectedModel ? { model: prepared.selectedModel } : {}),
    ...(payload.reasoningEffort ? { reasoningEffort: payload.reasoningEffort } : {}),
    ...(payload.serviceTier ? { serviceTier: payload.serviceTier } : {}),
  });
  const result = promptTurn.result;
  const cancellationAfterPrompt = await getPromptCancellationResponse(payload);
  if (cancellationAfterPrompt) {
    return cancellationAfterPrompt;
  }
  conversationRuntime.setThreadId(conversationId, result.threadId);
  conversationRuntime.setActiveTurn(conversationId, null);
  syncCurrentRuntimeState(conversationId);

  const deferredBrowserActionWorkflow = await maybeHandleDeferredBrowserDomActionWorkflow(
    payload,
    prepared.agenticRoutePlan,
    promptTurn.assistantText,
    (phase, workflow) => emitPromptStatus(payload, phase, workflow),
  );
  if (deferredBrowserActionWorkflow.kind === "handled") {
    return {
      ...result,
      ...deferredBrowserActionWorkflow.response,
      actionCards: prepared.actionCards,
      settings,
      currentConversationId: conversationId,
    };
  }

  return {
    ...result,
    actionCards: prepared.actionCards,
    settings,
    currentConversationId: conversationId,
  };
}

async function maybeAutoCompactBeforePrompt(
  payload: PromptRequestPayload,
  settings: ExtensionSettings,
  conversationId: string,
): Promise<void> {
  const runtime = conversationRuntime.get(conversationId);
  const decision = shouldAutoCompactConversation({
    enabled: settings.autoCompactConversations,
    messageCount: payload.conversationMessageCount ?? 0,
    lastCompactedThreadId: runtime.lastAutoCompactThreadId,
    turnActive: Boolean(runtime.activeTurn),
    ...(runtime.threadId ? { threadId: runtime.threadId } : {}),
    ...(runtime.lastAutoCompactBucket !== null ? { lastCompactedBucket: runtime.lastAutoCompactBucket } : {}),
  });
  if (!decision.shouldCompact || decision.bucket === null || !runtime.threadId) {
    return;
  }

  emitPromptStatus(payload, "compacting");
  try {
    await bridge.request("thread.compact.start", {
      threadId: runtime.threadId,
      waitForCompletion: true,
    });
  } catch (error) {
    if (!isRecoverableMissingCodexThreadError(error)) {
      throw error;
    }
    void recordDiagnostic("extension.auto_compact.stale_thread", {
      threadId: runtime.threadId,
      error: toErrorMessage(error),
    });
    conversationRuntime.resetConversation(conversationId);
    syncCurrentRuntimeState(conversationId);
    return;
  }
  runtime.lastAutoCompactThreadId = runtime.threadId;
  runtime.lastAutoCompactBucket = decision.bucket;
}

async function handleTurnSteer(payload: PromptRequestPayload) {
  const runtime = await ensurePromptConversationRuntime(payload);
  const conversationId = runtime.conversationId;
  payload.conversationId = conversationId;
  if (!runtime.threadId || !runtime.activeTurn?.turnId) {
    return {
      error: "No active turn to steer.",
      currentConversationId: conversationId,
    };
  }

  emitPromptStatus(payload, "routing");
  const promptGate = await ensureOperationAllowed(
    "prompt.send",
    payload.confirmedOperations?.includes("prompt.send") ?? false,
  );
  if (!promptGate.ok) {
    return promptGate.response;
  }
  const cancellationAfterGate = await getPromptCancellationResponse(payload);
  if (cancellationAfterGate) {
    return cancellationAfterGate;
  }

  const settings = await getStoredSettings();
  const prepared = await buildPromptRequest(payload, settings, (phase, workflow) => emitPromptStatus(payload, phase, workflow));
  if (!prepared.ok) {
    return prepared.response;
  }
  const cancellationAfterBuild = await getPromptCancellationResponse(payload);
  if (cancellationAfterBuild) {
    return cancellationAfterBuild;
  }
  let result: { threadId: string; turnId: string };
  try {
    emitPromptStatus(payload, "waiting-for-codex");
    const structuredInputs = mergeStructuredInputsWithEnabledCodexSkills(
      prepared.structuredInputs,
      state.appServerSkills,
      settings.enabledCodexSkillIds,
      createCodexSkillRuntimeAvailability(settings),
      state.connectedApps,
    );
    const cancellationBeforeSteer = await getPromptCancellationResponse(payload);
    if (cancellationBeforeSteer) {
      return cancellationBeforeSteer;
    }
    result = await bridge.request<{ threadId: string; turnId: string }>("turn.steer", {
      clientRequestId: payload.clientRequestId,
      profile: prepared.profile,
      message: payload.message,
      contexts: prepared.contexts,
      fileAttachments: prepared.fileAttachments,
      routePlan: prepared.routePlan,
      structuredInputs,
      threadId: runtime.threadId,
      expectedTurnId: runtime.activeTurn.turnId,
      ...(normalizeConfiguredPath(settings.workspaceRoot) ? { cwd: normalizeConfiguredPath(settings.workspaceRoot) } : {}),
      ...(prepared.selectedModel ? { model: prepared.selectedModel } : {}),
      ...(payload.reasoningEffort ? { reasoningEffort: payload.reasoningEffort } : {}),
      ...(payload.serviceTier ? { serviceTier: payload.serviceTier } : {}),
    });
    const cancellationAfterSteer = await getPromptCancellationResponse(payload);
    if (cancellationAfterSteer) {
      return cancellationAfterSteer;
    }
  } catch (error) {
    if (!isRecoverableTurnSteerError(error)) {
      throw error;
    }
    conversationRuntime.setActiveTurn(conversationId, null);
    syncCurrentRuntimeState(conversationId);
    return {
      error: toErrorMessage(error) || "No active turn to steer.",
      currentConversationId: conversationId,
    };
  }
  conversationRuntime.setActiveTurn(conversationId, {
    threadId: result.threadId,
    turnId: result.turnId,
  });
  syncCurrentRuntimeState(conversationId);
  return {
    ...result,
    actionCards: prepared.actionCards,
    currentConversationId: conversationId,
  };
}

async function handlePromptCancel(clientRequestId?: unknown, threadId?: unknown, turnId?: unknown) {
  if (typeof clientRequestId === "string" && clientRequestId) {
    cancelledPromptClientRequestIds.add(clientRequestId);
  }

  await stopCurrentAiControlIndicator(0);

  if (typeof threadId === "string" && typeof turnId === "string") {
    await handleTurnInterrupt(threadId, turnId).catch(() => undefined);
  }

  return { cancelled: true };
}

async function handleTurnInterrupt(threadId?: string, turnId?: string) {
  await stopCurrentAiControlIndicator(0);
  if (!threadId || !turnId) {
    return { cancelled: true };
  }

  const result = await bridge.request<{ threadId: string; turnId: string }>("turn.interrupt", {
    threadId,
    turnId,
  });
  const conversationId = conversationRuntime.completeTurn(threadId, turnId);
  if (conversationId) {
    syncCurrentRuntimeState(conversationId);
  } else if (state.activeTurn?.turnId === turnId) {
    state.activeTurn = null;
  }
  return result;
}

function isPromptClientRequestCancelled(clientRequestId?: string): boolean {
  return Boolean(clientRequestId && cancelledPromptClientRequestIds.has(clientRequestId));
}

function consumePromptClientRequestCancellation(clientRequestId?: string): boolean {
  if (!isPromptClientRequestCancelled(clientRequestId)) {
    return false;
  }
  cancelledPromptClientRequestIds.delete(clientRequestId as string);
  return true;
}

async function getPromptCancellationResponse(payload: PromptRequestPayload): Promise<{ cancelled: true } | null> {
  if (!consumePromptClientRequestCancellation(payload.clientRequestId)) {
    return null;
  }
  await stopCurrentAiControlIndicator(0);
  return { cancelled: true };
}

async function buildPromptRequest(
  payload: PromptRequestPayload,
  settings: ExtensionSettings,
  emitStatus: PromptStatusEmitter = () => undefined,
): Promise<{
  ok: true;
  profile: ProfileTemplate;
  contexts: PageContextEnvelope[];
  actionCards: ActionCard[];
  selectedModel: string;
  fileAttachments: UserFileAttachment[];
  structuredInputs: CodexStructuredInput[];
  routePlan: PromptRoutingPlan;
  agenticRoutePlan: AgenticRoutePlan;
} | {
  ok: false;
  response: {
    error: string;
    requiresConfirmation?: boolean;
    confirmationOperation?: HarnessPermissionOperation;
    appConnection?: {
      kind: "plugin";
      id: string;
    };
  };
}> {
  const activeTab = await getActiveTab().catch(() => null);
  const routeInput = createAgenticRouteInput(payload, activeTab, settings);
  const agenticRoutePlan = await planAgenticRouteForPayload(payload, routeInput);
  let structuredInputs = expandPluginStructuredInputsWithConnectedApps(
    mergeExplicitAndRouteStructuredInputs(
      payload.structuredInputs ?? [],
      resolveRouteStructuredInputs(agenticRoutePlan, routeInput),
    ),
    state.connectedApps,
  );
  let blockedPluginInput = structuredInputs.find((input) =>
    requiresPluginCompanionAppConnection(input, state.connectedApps),
  );
  if (blockedPluginInput) {
    await triggerCatalogRefresh(undefined, { force: true }).catch((error) => {
      console.warn("catalog refresh before plugin connection check failed", error);
    });
    structuredInputs = expandPluginStructuredInputsWithConnectedApps(structuredInputs, state.connectedApps);
    blockedPluginInput = structuredInputs.find((input) =>
      requiresPluginCompanionAppConnection(input, state.connectedApps),
    );
  }
  if (blockedPluginInput) {
    const strings = getUiStrings(resolveSettingsUiLocale(settings));
    return {
      ok: false,
      response: {
        error: strings.errors.appConnectionRequired(blockedPluginInput.name),
        appConnection: {
          kind: "plugin",
          id: blockedPluginInput.id,
        },
      },
    };
  }
  const routePlan = routePlanToPromptRoutingPlan(agenticRoutePlan, routeInput);
  const currentPageSupport = getCurrentPageSupport(activeTab?.url);
  const requestedContextRequests = payload.suppressPageContext
    ? filterSuppressedPageContextRequests(agenticRoutePlan.contextRequests)
    : agenticRoutePlan.contextRequests;
  const effectiveContextRequests = ensureDefaultCurrentPageContextRequests(
    requestedContextRequests,
    currentPageSupport,
    {
      suppressDefault:
        payload.suppressPageContext ||
        shouldSuppressDefaultCurrentPageContextForImageWorkflow(agenticRoutePlan) ||
        shouldSuppressDefaultCurrentPageContextForImageGeneration(agenticRoutePlan) ||
        shouldSuppressDefaultCurrentPageContextForHistory(routePlan, requestedContextRequests),
    },
  );
  const effectiveRoutePlan = createEffectivePromptRoutePlan(
    routePlan,
    effectiveContextRequests,
    Boolean(payload.fileAttachments?.length),
  );
  const effectiveAttachments = effectiveContextRequests.map((request) => request.source);
  const requestedPageAttachments = effectiveAttachments.filter(
    (attachment): attachment is "current-page" | "selection" | "image" =>
      attachment === "current-page" || attachment === "selection" || attachment === "image",
  );
  const pageAttachments = currentPageSupport.available
    ? requestedPageAttachments
    : [];
  const profile = getAvailableProfileTemplate(routePlan.selectedProfileId);
  const contexts: PageContextEnvelope[] = [];
  const actionCards: ActionCard[] = [];
  const needsCurrentContext = pageAttachments.length > 0;
  const deferPageContextForImageWorkflow = shouldDeferPageContextCollectionForImageWorkflow(agenticRoutePlan);
  if (needsCurrentContext && !deferPageContextForImageWorkflow) {
    emitStatus("collecting-context");
  }
  const currentContext =
    needsCurrentContext && !deferPageContextForImageWorkflow
      ? await collectCurrentPageContext(routePlan.pageReadStrategy)
      : null;
  const fileAttachments = await collectAutomaticDocumentAttachments(
    activeTab,
    effectiveAttachments,
    payload.fileAttachments ?? [],
  );

  if (effectiveAttachments.includes("current-page") && currentContext) {
    contexts.push(currentContext.envelope);
    actionCards.push(...currentContext.actionCards);
  }

  if (effectiveAttachments.includes("selection") && currentContext?.envelope.selectionText) {
    contexts.push({
      ...currentContext.envelope,
      domSummary: `Selected text focus: ${currentContext.envelope.selectionText}`,
      visionAssets: [],
    });
  }

  if (effectiveAttachments.includes("image") && currentContext?.envelope.visionAssets.length) {
    contexts.push({
      ...currentContext.envelope,
      domSummary: "Focus on the attached visual context and preserve the main subject unless the user asks otherwise.",
    });
  }

  if (effectiveAttachments.includes("open-tabs")) {
    const tabGate = await ensureOperationAllowed(
      "context.tabs.read",
      payload.confirmedOperations?.includes("context.tabs.read") ?? false,
    );
    if (!tabGate.ok) {
      return { ok: false, response: tabGate.response };
    }
    const allTabs = await listOpenTabs();
    const limitedTabIds = payload.selectedTabIds?.length
      ? payload.selectedTabIds.slice(0, 10)
      : allTabs.slice(0, 5).map((tab) => tab.tabId);
    const selectedTabs = allTabs.filter((tab) => limitedTabIds.includes(tab.tabId));
    contexts.push(...selectedTabs.map(tabToEnvelope));
  }

  if (effectiveAttachments.includes("history")) {
    const historyGate = await ensureOperationAllowed(
      "context.history.read",
      payload.confirmedOperations?.includes("context.history.read") ?? false,
    );
    if (!historyGate.ok) {
      return { ok: false, response: historyGate.response };
    }
    const requestedHistoryQuery = resolveHistoryContextQuery(payload.historyQuery, agenticRoutePlan.historyQuery);
    let history = await searchHistory(requestedHistoryQuery);
    if (requestedHistoryQuery && history.items.length === 0) {
      history = await searchHistory("");
    }
    contexts.push({
      metadata: {
        url: "chrome://history-search",
        title: requestedHistoryQuery ? `History search: ${requestedHistoryQuery}` : "Recent history",
        domain: "history",
      },
      selectionText: "",
      domSummary: createHistoryContextSummary(history.items),
      visionAssets: [],
      adapterPayload: null,
      privacyFlags: {
        containsSensitiveFormData: false,
        userConsentedToHistory: true,
      },
    });
  }

  return {
    ok: true,
    profile,
    contexts,
    actionCards,
    selectedModel: routePlan.selectedModel,
    fileAttachments,
    structuredInputs,
    routePlan: effectiveRoutePlan,
    agenticRoutePlan,
  };
}

async function planAgenticRouteForPayload(
  payload: PromptRequestPayload,
  routeInput: AgenticRouteInput,
): Promise<AgenticRoutePlan> {
  const input = routeInput;
  try {
    const plan = await bridge.request<unknown>("route.plan", { ...input });
    const normalized = normalizeAgenticRoutePlan(plan, input);
    void recordDiagnostic("extension.route.plan.ready", {
      clientRequestId: payload.clientRequestId ?? null,
      task: normalized.task,
      selectedProfileId: normalized.selectedProfileId,
      selectedModel: normalized.selectedModel,
      contextSources: normalized.contextRequests.map((request) => request.source),
      structuredInputIds: normalized.structuredInputIds,
      historyQuery: normalized.historyQuery,
      imageEdit: normalized.imageEdit,
    });
    return normalized;
  } catch (error) {
    void recordDiagnostic("extension.route.plan.failed", {
      clientRequestId: payload.clientRequestId ?? null,
      error: toErrorMessage(error),
    });
    return createFallbackAgenticRoutePlan(input, toErrorMessage(error));
  }
}

function createAgenticRouteInput(
  payload: PromptRequestPayload,
  activeTab: chrome.tabs.Tab | null,
  settings: ExtensionSettings,
): AgenticRouteInput {
  const explicitAttachments = payload.attachments.filter(isAgenticRouteContextSource);
  const activeTabSupport = getCurrentPageSupport(activeTab?.url);
  return {
    message: payload.message,
    ...(payload.contextHint ? { contextHint: payload.contextHint } : {}),
    selectedProfileId: payload.profileId,
    availableProfileIds: listAvailableProfiles().map((profile) => profile.id),
    selectedModel: payload.model ?? state.selectedModel,
    models: state.models,
    readStrategyOverride: payload.readStrategyOverride ?? "auto",
    explicitAttachments,
    fileAttachments: payload.fileAttachments ?? [],
    ...(payload.selectedTabIds?.length ? { selectedTabIds: payload.selectedTabIds } : {}),
    ...(payload.historyQuery ? { historyQuery: payload.historyQuery } : {}),
    locale: resolveSettingsUiLocale(settings),
    availableStructuredInputs: createAvailableRouteStructuredInputs({
      apps: state.connectedApps,
      plugins: state.appServerPlugins,
      mcpServers: state.mcpServers,
    }),
    browserAutomationCapabilities: {
      dom: true,
      playwright: state.playwrightRuntime.available && settings.playwrightBrowserControlEnabled,
      "computer-use": false,
    },
    activeTab: activeTab
      ? {
          ...(activeTab.title ? { title: activeTab.title } : {}),
          ...(activeTab.url ? { url: activeTab.url } : {}),
          restricted: !activeTabSupport.available,
        }
      : {
          restricted: true,
        },
  };
}

function isAgenticRouteContextSource(value: string): value is AgenticRouteContextSource {
  return (
    value === "current-page" ||
    value === "open-tabs" ||
    value === "history" ||
    value === "selection" ||
    value === "image"
  );
}

async function maybeHandleAgenticImageWorkflow(
  payload: PromptRequestPayload,
  agenticRoutePlan: AgenticRoutePlan,
  emitStatus: PromptStatusEmitter = () => undefined,
): Promise<
  | { kind: "skip" }
  | {
      kind: "blocked";
      response: {
        error: string;
        requiresConfirmation?: boolean;
        confirmationOperation?: HarnessPermissionOperation;
      };
    }
  | {
      kind: "handled";
      response: {
        workflow: "image-edit";
        assistantText: string;
        previewRef: string;
      };
    }
> {
  if (!shouldHandleAgenticImageEditWorkflow(agenticRoutePlan)) {
    void recordDiagnostic("extension.image.workflow.skip", {
      reason: "route-not-actionable-image-edit",
      task: agenticRoutePlan.task,
      intent: agenticRoutePlan.intent,
      imageEdit: agenticRoutePlan.imageEdit,
    });
    return { kind: "skip" };
  }

  const workflowPlan = agenticRoutePlan.imageEdit;
  if (workflowPlan.target === "none" || workflowPlan.target === "ambiguous") {
    void recordDiagnostic("extension.image.workflow.skip", {
      reason: "target-not-actionable",
      imageEdit: workflowPlan,
    });
    return { kind: "skip" };
  }

  const imageGate = await ensureOperationAllowed(
    "image.edit",
    payload.confirmedOperations?.includes("image.edit") ?? false,
  );
  if (!imageGate.ok) {
    void recordDiagnostic("extension.image.workflow.blocked", {
      target: workflowPlan.target,
      error: imageGate.response.error,
    });
    return { kind: "blocked", response: imageGate.response };
  }

  emitStatus("preparing-image", "image-edit");
  void recordDiagnostic("extension.image.workflow.prepare", {
    target: workflowPlan.target,
    targetFileId: workflowPlan.targetFileId ?? null,
  });
  const image = await resolveWorkflowImageInput(payload, workflowPlan.target, workflowPlan.targetFileId);
  const references = await resolveWorkflowReferenceImages(
    { ...payload, attachments: agenticRoutePlan.contextRequests.map((request) => request.source) },
    workflowPlan.target,
    workflowPlan.targetFileId,
  );
  emitStatus("editing-image", "image-edit");
  void recordDiagnostic("extension.image.workflow.bridge.start", {
    target: workflowPlan.target,
    mimeType: image.mimeType,
    filename: image.filename ?? null,
    referenceCount: references.length,
  });
  const result = await bridge.request<{ jobId: string; previewRef: string }>(
    "image.edit.start",
    {
      prompt: workflowPlan.prompt ?? payload.message,
      image,
      referenceImages: references,
    },
    {
      timeoutMs: IMAGE_EDIT_TIMEOUT_MS,
      timeoutMessage: await buildLocalizedImageEditTimeoutMessage(),
    },
  );
  void recordDiagnostic("extension.image.workflow.bridge.completed", {
    target: workflowPlan.target,
    jobId: result.jobId,
    previewRef: result.previewRef,
  });
  emitStatus("rendering-image-preview", "image-edit");

  return {
    kind: "handled",
    response: {
      workflow: "image-edit",
      previewRef: result.previewRef,
      assistantText: buildImageWorkflowAssistantText(await getActiveUiLocale(), workflowPlan.target, image.filename),
    },
  };
}

async function maybeHandleAgenticImageGenerationWorkflow(
  payload: PromptRequestPayload,
  agenticRoutePlan: AgenticRoutePlan,
  contexts: PageContextEnvelope[],
  fileAttachments: UserFileAttachment[],
  emitStatus: PromptStatusEmitter = () => undefined,
): Promise<
  | { kind: "skip" }
  | {
      kind: "blocked";
      response: {
        error: string;
        requiresConfirmation?: boolean;
        confirmationOperation?: HarnessPermissionOperation;
      };
    }
  | {
      kind: "handled";
      response: {
        workflow: "generated-image";
        previewRef: string;
        previewRefs: string[];
      };
    }
> {
  if (!shouldHandleAgenticImageGenerationWorkflow(agenticRoutePlan)) {
    return { kind: "skip" };
  }

  const imageGate = await ensureOperationAllowed(
    "image.edit",
    payload.confirmedOperations?.includes("image.edit") ?? false,
  );
  if (!imageGate.ok) {
    return { kind: "blocked", response: imageGate.response };
  }

  emitStatus("preparing-image", "generated-image");
  void recordDiagnostic("extension.image.generate.workflow.prepare", {
    clientRequestId: payload.clientRequestId ?? null,
    contextCount: contexts.length,
    fileAttachmentCount: fileAttachments.length,
  });
  emitStatus("editing-image", "generated-image");
  const result = await bridge.request<{ jobId: string; previewRef: string; previewRefs?: string[] }>(
    "image.generate.start",
    {
      prompt: payload.message,
      contexts,
      fileAttachments,
      conversationContext: payload.contextHint ?? "",
      clientRequestId: payload.clientRequestId,
      conversationId: payload.conversationId,
      workflow: "generated-image",
      model: "gpt-image-2",
    },
    {
      timeoutMs: IMAGE_EDIT_TIMEOUT_MS,
      timeoutMessage: await buildLocalizedImageEditTimeoutMessage(),
    },
  );
  emitStatus("rendering-image-preview", "generated-image");
  const previewRefs = normalizeImageGeneratePreviewRefs(result.previewRefs, result.previewRef);
  if (!previewRefs.length) {
    throw new Error("Codex completed image generation without returning a generated image preview.");
  }
  return {
    kind: "handled",
    response: {
      workflow: "generated-image",
      previewRef: previewRefs[0] ?? result.previewRef,
      previewRefs,
    },
  };
}

async function resolveWorkflowImageInput(
  payload: PromptRequestPayload,
  target: "page-image" | "uploaded-image",
  targetFileId?: string,
) {
  if (target === "uploaded-image") {
    const uploadedInput = await resolveUploadedImageEditInput(payload.fileAttachments ?? [], targetFileId);
    if (!uploadedInput) {
      throw new Error("No uploaded image is available for this edit request.");
    }
    return uploadedInput;
  }

  return getEditableImageInput();
}

async function resolveWorkflowReferenceImages(
  payload: PromptRequestPayload,
  target: "page-image" | "uploaded-image",
  targetFileId?: string,
): Promise<Array<{ base64: string; mimeType: string; filename?: string }>> {
  const references: Array<{ base64: string; mimeType: string; filename?: string }> = [];

  if (target === "page-image") {
    return resolveUploadedImageReferenceInputs(payload.fileAttachments ?? [], targetFileId);
  }

  const wantsPageReference = payload.attachments.includes("image") || payload.attachments.includes("current-page");
  if (!wantsPageReference) {
    return references;
  }

  try {
    references.push(await getEditableImageInput());
  } catch {
    return references;
  }

  return references;
}

function buildImageWorkflowAssistantText(locale: string, target: "page-image" | "uploaded-image", filename: string | undefined): string {
  const strings = getUiStrings(locale);
  if (target === "page-image") {
    return strings.images.editPreview;
  }

  return filename ? `${strings.images.editPreview} (${filename})` : strings.images.editPreview;
}

async function buildLocalizedImageEditTimeoutMessage(): Promise<string> {
  return buildImageEditTimeoutMessage(getUiStrings(await getActiveUiLocale()).errors.imageEditTimeout);
}

async function requestPromptSendWithAssistantCapture(
  params: Record<string, unknown>,
): Promise<{ result: PromptTurnResult; assistantText: string }> {
  const completedMessages: CompletedAssistantMessageEvent[] = [];
  const unsubscribe = bridge.subscribe((event) => {
    if (isCompletedAssistantMessageEvent(event)) {
      completedMessages.push(event);
    }
  });

  try {
    const result = await bridge.request<PromptTurnResult>("prompt.send", params);
    return {
      result,
      assistantText: collectCompletedAssistantText(completedMessages, result),
    };
  } finally {
    unsubscribe();
  }
}

function isCompletedAssistantMessageEvent(event: unknown): event is CompletedAssistantMessageEvent {
  return typeof event === "object" && event !== null && (event as { type?: unknown }).type === "message.completed";
}

function collectCompletedAssistantText(
  events: CompletedAssistantMessageEvent[],
  result: PromptTurnResult,
): string {
  return events
    .filter((event) => event.threadId === result.threadId && event.turnId === result.turnId)
    .map((event) => event.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

async function maybeEnsureDeferredBrowserDomActionAllowed(
  payload: PromptRequestPayload,
  agenticRoutePlan: AgenticRoutePlan,
): Promise<{ kind: "not-handled" | "allowed" } | { kind: "blocked"; response: HarnessPermissionBlockedResponse }> {
  if (!shouldResumeDeferredBrowserDomAction(agenticRoutePlan)) {
    return { kind: "not-handled" };
  }

  const gate = await ensureOperationAllowed(
    "page.dom.perform",
    payload.confirmedOperations?.includes("page.dom.perform") ?? false,
  );
  if (!gate.ok) {
    return { kind: "blocked", response: gate.response };
  }
  return { kind: "allowed" };
}

async function maybeHandleBrowserDomActionWorkflow(
  payload: PromptRequestPayload,
  agenticRoutePlan: AgenticRoutePlan,
  emitStatus: PromptStatusEmitter,
): Promise<BrowserDomActionWorkflowResult> {
  if (!shouldHandleBrowserDomAction(agenticRoutePlan)) {
    return { kind: "not-handled" };
  }

  const gate = await ensureOperationAllowed(
    "page.dom.perform",
    payload.confirmedOperations?.includes("page.dom.perform") ?? false,
  );
  if (!gate.ok) {
    return { kind: "blocked", response: gate.response };
  }

  const controlTab = await getActiveTab();
  assertPageReadable(controlTab.url);
  const locale = await getActiveUiLocale();
  const strings = getUiStrings(locale);
  await startTabAiControlIndicator(controlTab, "dom", "Codex is controlling this page");
  try {
    if (consumePromptClientRequestCancellation(payload.clientRequestId)) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: strings.status.browserActionStopped,
        },
      };
    }
    emitStatus("collecting-context");
    const snapshot = (await sendMessageToTab(controlTab, { type: "page.dom.snapshot" })) as BrowserDomSnapshot;
    if (consumePromptClientRequestCancellation(payload.clientRequestId)) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: strings.status.browserActionStopped,
        },
      };
    }
    if (!snapshot.elements.length) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: strings.status.browserActionNoElements,
        },
      };
    }

    emitStatus("waiting-for-codex");
    const plan = await bridge.request<BrowserDomActionPlan>("browser.action.plan", {
      message: payload.message,
      snapshot,
      locale,
    });
    if (consumePromptClientRequestCancellation(payload.clientRequestId)) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: strings.status.browserActionStopped,
        },
      };
    }

    if (!plan.shouldAct || plan.steps.length === 0) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: plan.summary || strings.status.browserActionSkipped,
        },
      };
    }

    const actionResult = (await sendMessageToTab(controlTab, {
      type: "page.dom.perform",
      steps: plan.steps,
    })) as BrowserDomActionResult;

    return {
      kind: "handled",
      response: {
        workflow: "browser-action",
        assistantText: buildBrowserDomActionAssistantText(locale, plan, actionResult),
        actionResult,
      },
    };
  } finally {
    await stopTabAiControlIndicator(controlTab, 0);
  }
}

async function maybeHandleDeferredBrowserDomActionWorkflow(
  payload: PromptRequestPayload,
  agenticRoutePlan: AgenticRoutePlan,
  assistantText: string,
  emitStatus: PromptStatusEmitter,
): Promise<BrowserDomActionWorkflowResult> {
  if (!shouldResumeDeferredBrowserDomAction(agenticRoutePlan)) {
    return { kind: "not-handled" };
  }

  const locale = await getActiveUiLocale();
  const strings = getUiStrings(locale);
  const generatedText = extractDeferredBrowserActionText(assistantText);
  if (!generatedText) {
    return {
      kind: "handled",
      response: {
        workflow: "browser-action",
        assistantText: strings.status.browserActionSkipped,
      },
    };
  }

  const controlTab = await getActiveTab();
  assertPageReadable(controlTab.url);
  await startTabAiControlIndicator(controlTab, "dom", "Codex is controlling this page");
  try {
    if (consumePromptClientRequestCancellation(payload.clientRequestId)) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: strings.status.browserActionStopped,
        },
      };
    }

    emitStatus("collecting-context");
    const snapshot = (await sendMessageToTab(controlTab, { type: "page.dom.snapshot" })) as BrowserDomSnapshot;
    if (consumePromptClientRequestCancellation(payload.clientRequestId)) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: strings.status.browserActionStopped,
        },
      };
    }
    if (!snapshot.elements.length) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: strings.status.browserActionNoElements,
        },
      };
    }

    emitStatus("waiting-for-codex");
    const plan = await bridge.request<BrowserDomActionPlan>("browser.action.plan", {
      message: buildDeferredBrowserActionMessage({
        originalMessage: payload.message,
        generatedText,
      }),
      generatedText,
      snapshot,
      locale,
    });
    if (consumePromptClientRequestCancellation(payload.clientRequestId)) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: strings.status.browserActionStopped,
        },
      };
    }

    if (!plan.shouldAct || plan.steps.length === 0) {
      return {
        kind: "handled",
        response: {
          workflow: "browser-action",
          assistantText: plan.summary || strings.status.browserActionSkipped,
        },
      };
    }

    const actionResult = (await sendMessageToTab(controlTab, {
      type: "page.dom.perform",
      steps: plan.steps,
    })) as BrowserDomActionResult;

    return {
      kind: "handled",
      response: {
        workflow: "browser-action",
        assistantText: buildBrowserDomActionAssistantText(locale, plan, actionResult),
        actionResult,
      },
    };
  } finally {
    await stopTabAiControlIndicator(controlTab, 0);
  }
}

function shouldHandleBrowserDomAction(agenticRoutePlan: AgenticRoutePlan): boolean {
  if (agenticRoutePlan.intent.needsClarification || !agenticRoutePlan.browserControl.shouldControl) {
    return false;
  }
  if (agenticRoutePlan.browserControl.preconditions?.length) {
    return false;
  }
  if (agenticRoutePlan.browserControl.mode !== "dom") {
    return false;
  }
  if (agenticRoutePlan.browserControl.surface !== "active-tab") {
    return false;
  }
  return agenticRoutePlan.intent.action === "navigate" && agenticRoutePlan.intent.target === "current-page";
}

function buildBrowserDomActionAssistantText(locale: string, plan: BrowserDomActionPlan, result: BrowserDomActionResult): string {
  const strings = getUiStrings(locale);
  if (result.cancelled) {
    return strings.status.browserActionStopped;
  }
  if (result.ok) {
    return plan.summary || strings.status.browserActionCompleted;
  }
  const failed = result.results.find((item) => !item.ok);
  return failed?.message
    ? strings.status.browserActionFailedWithReason(failed.message)
    : strings.status.browserActionFailed;
}

async function handleImageEdit(prompt: string, confirmed: boolean) {
  const gate = await ensureOperationAllowed("image.edit", confirmed);
  if (!gate.ok) {
    return gate.response;
  }
  const image = await getEditableImageInput();
  return bridge.request(
    "image.edit.start",
    {
      prompt,
      image,
    },
    {
      timeoutMs: IMAGE_EDIT_TIMEOUT_MS,
      timeoutMessage: await buildLocalizedImageEditTimeoutMessage(),
    },
  );
}

async function handleInfographicGenerate(
  confirmed: boolean,
  conversationContextInput?: unknown,
  clientRequestIdInput?: unknown,
  conversationIdInput?: unknown,
) {
  const gate = await ensureOperationAllowed("image.edit", confirmed);
  if (!gate.ok) {
    return gate.response;
  }

  const context = await collectInfographicPageContext();
  const activeTab = await getActiveTab().catch(() => null);
  const fileAttachments = await collectAutomaticDocumentAttachments(activeTab, ["current-page"], []);
  const prompt = buildInfographicPrompt({
    locale: await getActiveUiLocale(),
    pageTitle: context.envelope.metadata.title,
    pageUrl: context.envelope.metadata.url,
    adapterPayload: context.envelope.adapterPayload,
  });

  const result = await bridge.request<{ jobId: string; previewRef: string; previewRefs?: string[] }>(
    "image.generate.start",
    {
      prompt,
      contexts: [context.envelope],
      fileAttachments,
      conversationContext: normalizeInfographicConversationContext(conversationContextInput),
      clientRequestId: normalizeOptionalClientRequestId(clientRequestIdInput),
      conversationId: normalizeOptionalConversationId(conversationIdInput),
      workflow: "infographic",
      model: "gpt-image-2",
    },
    {
      timeoutMs: IMAGE_EDIT_TIMEOUT_MS,
      timeoutMessage: await buildLocalizedImageEditTimeoutMessage(),
    },
  );

  return {
    workflow: "infographic",
    ...result,
    currentConversationId: normalizeOptionalConversationId(conversationIdInput),
    previewRefs: normalizeImageGeneratePreviewRefs(result.previewRefs, result.previewRef),
    actionCards: context.actionCards,
  };
}

async function handleSlideDeckImageGenerate(
  userPrompt: string,
  confirmed: boolean,
  conversationContextInput?: unknown,
  clientRequestIdInput?: unknown,
  conversationIdInput?: unknown,
) {
  const gate = await ensureOperationAllowed("image.edit", confirmed);
  if (!gate.ok) {
    return gate.response;
  }

  const context = await collectInfographicPageContext();
  const activeTab = await getActiveTab().catch(() => null);
  const fileAttachments = await collectAutomaticDocumentAttachments(activeTab, ["current-page"], []);
  const prompt = buildSlideDeckImagePrompt({
    locale: await getActiveUiLocale(),
    pageTitle: context.envelope.metadata.title,
    pageUrl: context.envelope.metadata.url,
    userPrompt,
  });

  const result = await bridge.request<{ jobId: string; previewRef: string; previewRefs?: string[] }>(
    "image.generate.start",
    {
      prompt,
      contexts: [context.envelope],
      fileAttachments,
      conversationContext: normalizeInfographicConversationContext(conversationContextInput),
      clientRequestId: normalizeOptionalClientRequestId(clientRequestIdInput),
      conversationId: normalizeOptionalConversationId(conversationIdInput),
      workflow: "slide-images",
      model: "gpt-image-2",
    },
    {
      timeoutMs: IMAGE_EDIT_TIMEOUT_MS,
      timeoutMessage: await buildLocalizedImageEditTimeoutMessage(),
    },
  );

  return {
    workflow: "slide-images",
    ...result,
    currentConversationId: normalizeOptionalConversationId(conversationIdInput),
    previewRefs: normalizeImageGeneratePreviewRefs(result.previewRefs, result.previewRef),
    actionCards: context.actionCards,
  };
}

function normalizeImageGeneratePreviewRefs(previewRefs: string[] | undefined, previewRef: string | undefined): string[] {
  const refs = [...(previewRefs ?? []), ...(previewRef ? [previewRef] : [])]
    .map((ref) => ref.trim())
    .filter(Boolean);
  return Array.from(new Set(refs));
}

async function collectInfographicPageContext() {
  let domContext: Awaited<ReturnType<typeof collectCurrentPageContext>>;
  try {
    domContext = await collectCurrentPageContext("dom");
  } catch (error) {
    void recordDiagnostic("extension.infographic_context.dom_failed", {
      error: toErrorMessage(error),
    });
    return collectVisibleScreenOnlyInfographicContext(null);
  }

  if (!shouldFallbackToVisionForInfographic(domContext.envelope)) {
    return domContext;
  }

  try {
    const hybridContext = await collectCurrentPageContext("hybrid");
    const mergedContext = mergeInfographicContextFallback(domContext, hybridContext);
    if (mergedContext.envelope.visionAssets.length > 0) {
      return mergedContext;
    }
    return await collectVisibleScreenOnlyInfographicContext(mergedContext);
  } catch (error) {
    void recordDiagnostic("extension.infographic_context.hybrid_fallback_failed", {
      url: domContext.envelope.metadata.url,
      error: toErrorMessage(error),
    });
    return collectVisibleScreenOnlyInfographicContext(domContext).catch(() => domContext);
  }
}

function shouldFallbackToVisionForInfographic(envelope: PageContextEnvelope): boolean {
  if (envelope.visionAssets.length > 0) {
    return false;
  }

  const textLength = `${envelope.selectionText}\n${envelope.domSummary}`.replace(/\s+/gu, "").length;
  return textLength < 280;
}

function mergeInfographicContextFallback(
  domContext: Awaited<ReturnType<typeof collectCurrentPageContext>>,
  hybridContext: Awaited<ReturnType<typeof collectCurrentPageContext>>,
) {
  return {
    envelope: {
      ...hybridContext.envelope,
      selectionText: domContext.envelope.selectionText || hybridContext.envelope.selectionText,
      domSummary: domContext.envelope.domSummary || hybridContext.envelope.domSummary,
      adapterPayload: domContext.envelope.adapterPayload ?? hybridContext.envelope.adapterPayload,
      privacyFlags: {
        containsSensitiveFormData:
          domContext.envelope.privacyFlags.containsSensitiveFormData ||
          hybridContext.envelope.privacyFlags.containsSensitiveFormData,
        userConsentedToHistory:
          domContext.envelope.privacyFlags.userConsentedToHistory ||
          hybridContext.envelope.privacyFlags.userConsentedToHistory,
      },
    },
    readStrategy: hybridContext.readStrategy,
    actionCards: hybridContext.actionCards.length ? hybridContext.actionCards : domContext.actionCards,
  };
}

async function collectVisibleScreenOnlyInfographicContext(
  baseContext: Awaited<ReturnType<typeof collectCurrentPageContext>> | null,
) {
  const activeTab = await getActiveTab();
  assertPageReadable(activeTab.url);
  const locale = await getActiveUiLocale();
  const screenshotRef = await captureVisibleTab(activeTab);
  const fallbackContext =
    baseContext ??
    createPaperPdfFallbackContext(activeTab, locale) ??
    createGenericSiteFallbackContext(activeTab, locale) ??
    createMinimalVisibleScreenContext(activeTab, locale);
  const adapterPayload = fallbackContext.envelope.adapterPayload;

  return {
    envelope: {
      ...fallbackContext.envelope,
      domSummary:
        fallbackContext.envelope.domSummary ||
        "DOM text was not available. Use the attached visible-screen screenshot as the primary source context.",
      visionAssets: [
        {
          ref: screenshotRef,
          kind: "screenshot" as const,
        },
        ...fallbackContext.envelope.visionAssets,
      ],
    },
    readStrategy: "vision" as const,
    actionCards: fallbackContext.actionCards.length
      ? fallbackContext.actionCards
      : inferActionCards({
          readStrategy: "vision",
          adapterActions: [],
          availableSources: ["current-page"],
          adapterPayload,
          locale,
        }),
  };
}

function createMinimalVisibleScreenContext(
  activeTab: chrome.tabs.Tab & { url: string },
  locale = "",
): Awaited<ReturnType<typeof collectCurrentPageContext>> {
  return {
    envelope: {
      metadata: {
        url: activeTab.url,
        title: activeTab.title?.trim() || "Current page",
        domain: parseTabDomain(activeTab.url),
      },
      selectionText: "",
      domSummary: "DOM text was not available. Use the attached visible-screen screenshot as the primary source context.",
      visionAssets: [],
      adapterPayload: null,
      privacyFlags: {
        containsSensitiveFormData: false,
        userConsentedToHistory: false,
      },
    },
    readStrategy: "vision",
    actionCards: inferActionCards({
      readStrategy: "vision",
      adapterActions: [],
      availableSources: ["current-page"],
      adapterPayload: null,
      locale,
    }),
  };
}

function parseTabDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function normalizeInfographicConversationContext(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 8_000) : "";
}

function normalizeOptionalClientRequestId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 160) : undefined;
}

function normalizeOptionalConversationId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 160) : undefined;
}

async function buildVoiceSessionStartParamsWithContext(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const params = buildVoiceSessionStartParams(message, state.threadId);
  if (typeof params.prompt === "string" && params.prompt.trim()) {
    return params;
  }

  const contextPrompt = await collectVoiceSessionContextPrompt();
  return contextPrompt ? { ...params, prompt: contextPrompt } : params;
}

async function collectVoiceSessionContextPrompt(): Promise<string> {
  try {
    const context = await collectCurrentPageContext("hybrid");
    return createVoiceSessionContextPrompt({
      envelope: context.envelope,
      readStrategy: context.readStrategy,
    });
  } catch (error) {
    if (isSitePermissionRequiredError(error) || isBrowserPermissionRequiredError(error)) {
      throw error;
    }

    try {
      const context = await collectCurrentPageContext("dom");
      return createVoiceSessionContextPrompt({
        envelope: context.envelope,
        readStrategy: context.readStrategy,
      });
    } catch (fallbackError) {
      if (isSitePermissionRequiredError(fallbackError) || isBrowserPermissionRequiredError(fallbackError)) {
        throw fallbackError;
      }
      void recordDiagnostic("voice.context.collect.failed", {
        message: toErrorMessage(fallbackError),
      });
      return "";
    }
  }
}

async function handleYouTubeCurrentMomentPrompt() {
  const playbackState = (await sendMessageToActiveTab({
    type: "youtube.current-state",
  })) as Record<string, unknown> | null;
  return createYouTubeCurrentMomentPromptResult({
    adapterPayload: playbackState,
    locale: await getActiveUiLocale(),
  });
}

async function collectCurrentPageContext(readOverride: ReadStrategy | "auto") {
  const activeTab = await getActiveTab();
  const locale = await getActiveUiLocale();

  assertPageReadable(activeTab.url);
  let probe: ContentProbeResult;
  try {
    probe = (await sendMessageToTab(activeTab, {
      type: "page.collect",
    })) as ContentProbeResult;
  } catch (error) {
    const fallback =
      createPaperPdfFallbackContext(activeTab, locale) ??
      createGenericSiteFallbackContext(activeTab, locale);
    if (!fallback) {
      throw error;
    }
    void recordDiagnostic("extension.pdf_page_context.fallback", {
      url: activeTab.url,
      error: toErrorMessage(error),
    });
    return fallback;
  }

  const adapterMatched = Boolean(probe.rawCapture.adapterPayload);
  let readStrategy =
    readOverride === "auto"
      ? determineReadStrategy({
          url: activeTab.url,
          textLength: probe.features.textLength,
          imageCount: probe.features.imageCount,
          hasCanvas: probe.features.hasCanvas,
          hasVideo: probe.features.hasVideo,
          hasDenseInteractiveUi: probe.features.hasDenseInteractiveUi,
          adapterMatched,
        })
      : readOverride;
  let screenshotRef: string | undefined;
  if (shouldAttachVisualAssetsForReadStrategy(readStrategy)) {
    try {
      screenshotRef = await captureVisibleTab(activeTab);
    } catch (error) {
      if (readOverride === "auto") {
        console.warn("Falling back to DOM-only page context because screen capture is unavailable.", error);
        readStrategy = "dom";
      } else {
        throw error;
      }
    }
  }
  const envelope = normalizePageContext(createRawCaptureForReadStrategy(probe.rawCapture, readStrategy, screenshotRef));
  const actionCards = inferActionCards({
    readStrategy,
    adapterActions: probe.adapterActions,
    availableSources: ["current-page", ...(probe.rawCapture.images.length ? ["image" as const] : [])],
    adapterPayload: probe.rawCapture.adapterPayload,
    locale,
  });

  return { envelope, readStrategy, actionCards };
}

async function collectAutomaticDocumentAttachments(
  activeTab: chrome.tabs.Tab | null,
  effectiveAttachments: Array<PromptRequestPayload["attachments"][number]>,
  existingAttachments: UserFileAttachment[],
): Promise<UserFileAttachment[]> {
  const baseAttachments = [...existingAttachments];
  if (!activeTab?.url || !effectiveAttachments.includes("current-page")) {
    return baseAttachments;
  }

  const sourceUrl = resolvePaperPdfSourceUrl(activeTab);
  if (!sourceUrl || baseAttachments.some((attachment) => isSameDocumentAttachment(attachment, sourceUrl))) {
    return baseAttachments;
  }

  try {
    const attachment = await fetchPaperPdfAttachment(activeTab);
    return attachment ? [...baseAttachments, attachment] : baseAttachments;
  } catch (error) {
    void recordDiagnostic("extension.pdf_page_context.attachment.failed", {
      url: sourceUrl,
      error: toErrorMessage(error),
    });
    return baseAttachments;
  }
}

async function ensureContentScript(tabId: number, url?: string): Promise<void> {
  if (await hasActiveContentScript(tabId)) {
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (error) {
    if (shouldAttemptTabOriginRecovery(url, error) && (await hasTabOriginPermission(url))) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        return;
      } catch (retryError) {
        throw toFriendlyPageAccessError(url, retryError);
      }
    }
    throw toFriendlyPageAccessError(url, error);
  }
}

async function hasActiveContentScript(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "page.ping" });
    return typeof response === "object" && response !== null && (response as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

async function getActiveTab() {
  const query =
    typeof state.browserWindowId === "number"
      ? { active: true, windowId: state.browserWindowId }
      : { active: true, currentWindow: true };
  const [tab] = await chrome.tabs.query(query);
  if (!tab?.id || !tab.url || !tab.windowId) {
    throw new Error("No active browser tab is available.");
  }
  return tab as chrome.tabs.Tab & { id: number; url: string; windowId: number };
}

function tabToOpenTabContext(tab: chrome.tabs.Tab & { id: number; url: string }): OpenTabContext {
  const context: OpenTabContext = {
    tabId: tab.id,
    title: tab.title ?? "",
    url: tab.url,
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible),
  };
  if (tab.favIconUrl) {
    context.favIconUrl = tab.favIconUrl;
  }
  return context;
}

async function broadcastActiveTabSnapshot(): Promise<void> {
  const activeTab = await getActiveTab().catch(() => null);
  if (!activeTab) {
    return;
  }
  void installImagePromptHoverForTab(activeTab).catch(() => undefined);
  const currentTab = tabToOpenTabContext(activeTab);
  await chrome.runtime
    .sendMessage({
      type: "ui.active-tab.updated",
      currentPageSupport: getCurrentPageSupport(activeTab.url),
      currentTab,
      actionCards: inferActionCardsForOpenTab(currentTab, await getActiveUiLocale()),
    })
    .catch(() => undefined);
}

async function installImagePromptHoverForTab(
  tab: chrome.tabs.Tab | undefined | null,
): Promise<{ ok: true; installed: boolean }> {
  if (!tab?.id || !tab.url || !getCurrentPageSupport(tab.url).available) {
    return { ok: true, installed: false };
  }
  await sendMessageToTab(tab as chrome.tabs.Tab & { id: number; url: string }, {
    type: "page.image-prompt-hover.install",
  });
  return { ok: true, installed: true };
}

function normalizePendingImagePromptExtraction(message: Record<string, unknown>): PendingImagePromptExtraction | null {
  const imageUrl = typeof message.imageUrl === "string" ? message.imageUrl.trim() : "";
  const imageCandidate = normalizePromptImageCandidate(message.imageCandidate, imageUrl);
  const attachment = normalizePromptImageAttachment(message.attachment);
  if (!isSupportedImagePromptSource(imageUrl) || !(attachment || imageCandidate || isFetchableImagePromptSource(imageUrl))) {
    return null;
  }
  return {
    imageUrl,
    createdAt: Date.now(),
    ...(imageCandidate ? { imageCandidate } : {}),
    ...(attachment ? { attachment } : {}),
    ...(typeof message.alt === "string" && message.alt.trim() ? { alt: message.alt.trim().slice(0, 240) } : {}),
    ...(typeof message.pageTitle === "string" && message.pageTitle.trim()
      ? { pageTitle: message.pageTitle.trim().slice(0, 240) }
      : {}),
    ...(typeof message.pageUrl === "string" && message.pageUrl.trim() ? { pageUrl: message.pageUrl.trim() } : {}),
  };
}

function normalizePromptImageCandidate(value: unknown, fallbackUrl: string): EditablePageImageCandidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Record<string, unknown>;
  const sourceUrl = typeof input.url === "string" && isHttpUrl(input.url.trim()) ? input.url.trim() : fallbackUrl;
  const viewportRect = normalizePromptImageViewportRect(input.viewportRect);
  const viewportWidth = normalizePositiveNumber(input.viewportWidth);
  const viewportHeight = normalizePositiveNumber(input.viewportHeight);
  if (!viewportRect || !viewportWidth || !viewportHeight) {
    return null;
  }

  const candidate: EditablePageImageCandidate = {
    url: sourceUrl,
    viewportRect,
    viewportWidth,
    viewportHeight,
  };
  assignPositiveImageCandidateNumber(candidate, "width", input.width);
  assignPositiveImageCandidateNumber(candidate, "height", input.height);
  assignPositiveImageCandidateNumber(candidate, "naturalWidth", input.naturalWidth);
  assignPositiveImageCandidateNumber(candidate, "naturalHeight", input.naturalHeight);
  assignPositiveImageCandidateNumber(candidate, "renderedWidth", input.renderedWidth);
  assignPositiveImageCandidateNumber(candidate, "renderedHeight", input.renderedHeight);
  assignPositiveImageCandidateNumber(candidate, "visibleArea", input.visibleArea);
  assignPositiveImageCandidateNumber(candidate, "devicePixelRatio", input.devicePixelRatio);
  const distanceFromViewportCenter = normalizeFiniteNumber(input.distanceFromViewportCenter);
  if (distanceFromViewportCenter !== null) {
    candidate.distanceFromViewportCenter = distanceFromViewportCenter;
  }
  return candidate;
}

function assignPositiveImageCandidateNumber(
  candidate: EditablePageImageCandidate,
  key: keyof Pick<
    EditablePageImageCandidate,
    "width" | "height" | "naturalWidth" | "naturalHeight" | "renderedWidth" | "renderedHeight" | "visibleArea" | "devicePixelRatio"
  >,
  value: unknown,
): void {
  const number = normalizePositiveNumber(value);
  if (number !== null) {
    candidate[key] = number;
  }
}

function normalizePromptImageViewportRect(value: unknown): EditablePageImageCandidate["viewportRect"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Record<string, unknown>;
  const left = normalizeFiniteNumber(input.left);
  const top = normalizeFiniteNumber(input.top);
  const width = normalizePositiveNumber(input.width);
  const height = normalizePositiveNumber(input.height);
  if (left === null || top === null || !width || !height) {
    return null;
  }
  return { left, top, width, height };
}

function normalizePromptImageAttachment(value: unknown): UserFileAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id.trim().slice(0, 160) : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 180) : "";
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.trim().slice(0, 120) : "image/png";
  const base64 = typeof input.base64 === "string" ? input.base64.trim() : "";
  if (!id || !name || !base64 || input.kind !== "image") {
    return null;
  }
  return {
    id,
    name,
    mimeType: mimeType.startsWith("image/") ? mimeType : "image/png",
    sizeBytes: Math.max(0, Number(input.sizeBytes) || estimateBase64ByteLength(base64)),
    lastModified: Math.max(0, Number(input.lastModified) || Date.now()),
    base64,
    kind: "image",
    ...(typeof input.sourceUrl === "string" && isHttpUrl(input.sourceUrl.trim()) ? { sourceUrl: input.sourceUrl.trim() } : {}),
  };
}

function normalizePositiveNumber(value: unknown): number | null {
  const number = normalizeFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function normalizeFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSupportedImagePromptSource(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return isHttpUrl(value) || normalized.startsWith("blob:") || normalized.startsWith("data:image/");
}

function isFetchableImagePromptSource(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return isHttpUrl(value) || normalized.startsWith("data:image/");
}

async function handlePageImagePromptExtraction(
  message: Record<string, unknown>,
  tab: chrome.tabs.Tab | undefined,
): Promise<{ ok: true } | { error: string }> {
  const extraction = normalizePendingImagePromptExtraction(message);
  if (!extraction) {
    return { error: "No online image URL was provided." };
  }

  let sidePanelOpenPromise: Promise<void> | null = null;
  if (tab?.windowId) {
    state.browserWindowId = tab.windowId;
    sidePanelOpenPromise = chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  }
  const attachmentPromise = createOnlineImagePromptAttachment(extraction, tab);
  const attachment = await attachmentPromise;
  if (!attachment && !isHttpUrl(extraction.imageUrl)) {
    const error = buildOnlineImagePromptAttachmentError(extraction);
    await chrome.storage.session.set({ pendingImagePromptError: error });
    await sidePanelOpenPromise;
    await chrome.runtime
      .sendMessage({
        type: "ui.image-prompt.error",
        error,
      })
      .catch(() => undefined);
    return { error: "Chromex could not read this page image for prompt extraction." };
  }
  const pendingExtraction = attachment ? { ...extraction, attachment } : extraction;
  await chrome.storage.session.set({ pendingImagePromptExtraction: pendingExtraction });
  await sidePanelOpenPromise;
  await chrome.runtime
    .sendMessage({
      type: "ui.image-prompt.extract",
      extraction: pendingExtraction,
    })
    .catch(() => undefined);
  return { ok: true };
}

function buildOnlineImagePromptAttachmentError(
  extraction: PendingImagePromptExtraction,
): { code: "attachment-unavailable"; imageUrl: string } {
  return {
    code: "attachment-unavailable",
    imageUrl: extraction.imageUrl,
  };
}

async function createOnlineImagePromptAttachment(
  extraction: PendingImagePromptExtraction,
  tab: chrome.tabs.Tab | undefined,
): Promise<UserFileAttachment | null> {
  if (extraction.attachment) {
    return extraction.attachment;
  }

  const visibleCapture = capturePromptVisibleImage(tab, extraction.imageCandidate);
  const visibleInput = visibleCapture && extraction.imageCandidate
    ? await visibleCapture
        .then((dataUrl) => (dataUrl ? cropVisibleTabDataUrlToImageCandidate(dataUrl, extraction.imageCandidate!) : null))
        .catch((error) => {
          void recordDiagnostic("extension.image_prompt.visible_capture.failed", {
            error: toErrorMessage(error),
          });
          return null;
        })
    : null;
  const input = visibleInput ?? (isFetchableImagePromptSource(extraction.imageUrl)
    ? await fetchImageUrlAsEditableInput(extraction.imageUrl, filenameFromImageUrl(extraction.imageUrl))
        .catch((error) => {
          void recordDiagnostic("extension.image_prompt.remote_fetch.failed", {
            url: extraction.imageUrl,
            error: toErrorMessage(error),
          });
          return null;
        })
    : null);

  if (!input?.base64) {
    return null;
  }

  return {
    id: `online-image-prompt-${Date.now()}`,
    name: input.filename ?? filenameFromImageUrl(extraction.imageUrl),
    mimeType: input.mimeType || "image/png",
    sizeBytes: estimateBase64ByteLength(input.base64),
    lastModified: Date.now(),
    base64: input.base64,
    kind: "image",
    ...(isHttpUrl(extraction.imageUrl) ? { sourceUrl: extraction.imageUrl } : {}),
  };
}

function capturePromptVisibleImage(
  tab: chrome.tabs.Tab | undefined,
  candidate: EditablePageImageCandidate | undefined,
): Promise<string | null> | null {
  if (!tab?.windowId || !candidate?.viewportRect || !candidate.viewportWidth || !candidate.viewportHeight) {
    return null;
  }
  return chrome.tabs.captureVisibleTab(tab.windowId).catch(async (error) => {
    if (!isCaptureVisibleTabQuotaError(error)) {
      throw error;
    }
    await sleepMs(DEFAULT_VISIBLE_TAB_CAPTURE_MIN_INTERVAL_MS);
    return chrome.tabs.captureVisibleTab(tab.windowId);
  });
}

async function takePendingImagePromptExtraction(): Promise<{ extraction?: PendingImagePromptExtraction }> {
  const stored = await chrome.storage.session.get("pendingImagePromptExtraction");
  await chrome.storage.session.remove("pendingImagePromptExtraction");
  const value = stored.pendingImagePromptExtraction;
  if (!value || typeof value !== "object") {
    return {};
  }
  const extraction = normalizePendingImagePromptExtraction(value as Record<string, unknown>);
  return extraction ? { extraction } : {};
}

async function takePendingImagePromptError(): Promise<{ error?: { code: "attachment-unavailable"; imageUrl: string } }> {
  const stored = await chrome.storage.session.get("pendingImagePromptError");
  await chrome.storage.session.remove("pendingImagePromptError");
  const error = normalizePendingImagePromptError(stored.pendingImagePromptError);
  return error ? { error } : {};
}

function normalizePendingImagePromptError(
  value: unknown,
): { code: "attachment-unavailable"; imageUrl: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Record<string, unknown>;
  if (input.code !== "attachment-unavailable") {
    return null;
  }
  const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  if (!imageUrl) {
    return null;
  }
  return {
    code: "attachment-unavailable",
    imageUrl,
  };
}

async function takePendingImageAttachment(): Promise<{ attachment?: PendingImageAttachment }> {
  const stored = await chrome.storage.session.get("pendingImageAttachment");
  await chrome.storage.session.remove("pendingImageAttachment");
  const attachment = normalizePendingImageAttachment(stored.pendingImageAttachment);
  return attachment ? { attachment } : {};
}

async function takePendingContextMenuAction(): Promise<{ action?: PendingContextMenuAction }> {
  const stored = await chrome.storage.session.get("pendingAction");
  await chrome.storage.session.remove("pendingAction");
  const action = normalizePendingContextMenuAction(stored.pendingAction);
  return action ? { action } : {};
}

function normalizePendingContextMenuAction(value: unknown): PendingContextMenuAction | null {
  return value === "summarize-page" || value === "summarize-video" ? value : null;
}

function normalizePendingImageAttachment(value: unknown): PendingImageAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Record<string, unknown>;
  const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  if (!isFetchableImagePromptSource(imageUrl)) {
    return null;
  }
  return {
    imageUrl,
    createdAt: Math.max(0, Number(input.createdAt) || Date.now()),
    ...(typeof input.pageUrl === "string" && input.pageUrl.trim() ? { pageUrl: input.pageUrl.trim() } : {}),
  };
}

async function sendMessageToActiveTab(message: Record<string, unknown>) {
  const activeTab = await getActiveTab();
  assertPageReadable(activeTab.url);
  return sendMessageToTab(activeTab, message);
}

async function sendPageDomPerformWithIndicator(steps: unknown): Promise<unknown> {
  const controlTab = await getActiveTab();
  assertPageReadable(controlTab.url);
  await startTabAiControlIndicator(controlTab, "dom", "Codex is controlling this page");
  try {
    return await sendMessageToTab(controlTab, { type: "page.dom.perform", steps });
  } finally {
    await stopTabAiControlIndicator(controlTab, 0);
  }
}

async function startActiveTabAiControlIndicator(mode: BrowserAutomationMode, label: string): Promise<void> {
  const controlTab = await getActiveTab();
  assertPageReadable(controlTab.url);
  await startTabAiControlIndicator(controlTab, mode, label);
}

async function startTabAiControlIndicator(controlTab: ReadableBrowserTab, mode: BrowserAutomationMode, label: string): Promise<void> {
  activeAiControlTab = controlTab;
  await sendMessageToTab(controlTab, {
    type: "page.ai-control.start",
    mode,
    label,
  }).catch(() => undefined);
}

async function stopActiveTabAiControlIndicator(delayMs: number): Promise<void> {
  const controlTab = await getActiveTab();
  assertPageReadable(controlTab.url);
  await stopTabAiControlIndicator(controlTab, delayMs);
}

async function stopCurrentAiControlIndicator(delayMs: number): Promise<void> {
  if (activeAiControlTab) {
    await stopTabAiControlIndicator(activeAiControlTab, delayMs);
    return;
  }
  await stopActiveTabAiControlIndicator(delayMs).catch(() => undefined);
}

async function stopTabAiControlIndicator(controlTab: ReadableBrowserTab, delayMs: number): Promise<void> {
  try {
    await sendMessageToTab(controlTab, {
      type: "page.ai-control.stop",
      delayMs,
    }).catch(() => undefined);
  } finally {
    if (activeAiControlTab?.id === controlTab.id) {
      activeAiControlTab = null;
    }
  }
}

async function listOpenTabs(): Promise<OpenTabContext[]> {
  const granted = await ensureTabsPermission();
  if (!granted) {
    throw new Error("Open-tab access permission is required to list your tabs.");
  }

  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; url: string; title: string } => Boolean(tab.id && tab.url && tab.title))
    .map((tab) => {
      const context: OpenTabContext = {
        tabId: tab.id,
        title: tab.title,
        url: tab.url,
        pinned: tab.pinned,
        audible: Boolean(tab.audible),
      };
      if (tab.favIconUrl) {
        context.favIconUrl = tab.favIconUrl;
      }
      return context;
    });
}

function listOpenTabsResult(): Promise<{ tabs: OpenTabContext[] }> {
  return listOpenTabs().then((tabs) => ({ tabs }));
}

async function searchHistory(query: string) {
  const granted = await ensureHistoryPermission();
  if (!granted) {
    return { items: [] };
  }

  const items = await chrome.history.search(createHistorySearchOptions(query));
  return {
    items: limitHistoryContextItems(
      items
        .map((item): HistoryContextItem => ({
          title: item.title ?? item.url ?? "Untitled",
          url: item.url ?? "",
          ...(typeof item.lastVisitTime === "number" ? { lastVisitTime: item.lastVisitTime } : {}),
          ...(typeof item.visitCount === "number" ? { visitCount: item.visitCount } : {}),
        }))
        .filter((item) => item.url)
        .sort((left, right) => {
          const leftSearch = extractSearchQueryFromHistoryUrl(left.url);
          const rightSearch = extractSearchQueryFromHistoryUrl(right.url);
          if (leftSearch && !rightSearch) {
            return -1;
          }
          if (!leftSearch && rightSearch) {
            return 1;
          }
          return (right.lastVisitTime ?? 0) - (left.lastVisitTime ?? 0);
        }),
    ),
  };
}

function tabToEnvelope(tab: OpenTabContext): PageContextEnvelope {
  return {
    metadata: {
      url: tab.url,
      title: tab.title,
      domain: new URL(tab.url).hostname,
    },
    selectionText: "",
    domSummary: `Open tab: ${tab.title}\n${tab.url}`,
    visionAssets: [],
    adapterPayload: null,
    privacyFlags: {
      containsSensitiveFormData: false,
      userConsentedToHistory: false,
    },
  };
}

async function getEditableImageInput() {
  const activeTab = await getActiveTab();
  void recordDiagnostic("extension.image.input.resolve.start", {
    tabId: activeTab.id,
    url: activeTab.url,
  });
  const visiblePageImage = await getVisiblePageImageInput(activeTab).catch(() => null);
  if (visiblePageImage) {
    void recordDiagnostic("extension.image.input.visible-page.ready", {
      mimeType: visiblePageImage.mimeType,
      filename: visiblePageImage.filename ?? null,
    });
    return visiblePageImage;
  }

  const dataUrl = await captureVisibleTab(activeTab);
  const input = await dataUrlToEditableJpegInput(dataUrl, "visible-tab.jpg");
  void recordDiagnostic("extension.image.input.visible-tab.ready", {
    mimeType: input.mimeType,
    filename: input.filename ?? null,
  });
  return input;
}

async function getVisiblePageImageInput(activeTab: chrome.tabs.Tab & { id: number; url: string; windowId: number }) {
  assertPageReadable(activeTab.url);
  const probe = (await sendMessageToTab(activeTab, {
    type: "page.collect",
  })) as ContentProbeResult;
  const candidate = selectEditablePageImageCandidate(probe.rawCapture.images);
  if (!candidate) {
    void recordDiagnostic("extension.image.input.visible-page.missing", {
      candidateCount: probe.rawCapture.images.length,
    });
    return null;
  }
  void recordDiagnostic("extension.image.input.visible-page.candidate", {
    url: candidate.url,
    renderedWidth: candidate.renderedWidth ?? candidate.viewportRect?.width ?? null,
    renderedHeight: candidate.renderedHeight ?? candidate.viewportRect?.height ?? null,
    visibleArea: candidate.visibleArea ?? null,
  });

  try {
    return await fetchImageUrlAsEditableInput(candidate.url, filenameFromImageUrl(candidate.url));
  } catch (error) {
    void recordDiagnostic("extension.image.input.visible-page.fetch.failed", {
      url: candidate.url,
      error: toErrorMessage(error),
    });
    return cropVisibleTabToImageCandidate(activeTab, candidate);
  }
}

async function fetchImageUrlAsEditableInput(url: string | undefined, fallbackFilename: string) {
  if (!url) {
    throw new Error("No page image URL is available.");
  }

  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Image request failed with HTTP ${response.status}.`);
  }

  const blob = await response.blob();
  if (blob.type && !blob.type.startsWith("image/")) {
    throw new Error(`Expected an image response, received ${blob.type}.`);
  }

  return imageBlobToEditableJpegInput(blob, fallbackFilename, blob.type || mimeTypeFromImageUrl(url));
}

async function cropVisibleTabToImageCandidate(
  activeTab: chrome.tabs.Tab & { url: string; windowId: number },
  candidate: EditablePageImageCandidate,
) {
  if (!candidate.viewportRect || !candidate.viewportWidth || !candidate.viewportHeight) {
    return null;
  }
  const dataUrl = await captureVisibleTab(activeTab);
  return cropVisibleTabDataUrlToImageCandidate(dataUrl, candidate);
}

async function cropVisibleTabDataUrlToImageCandidate(
  dataUrl: string,
  candidate: EditablePageImageCandidate,
) {
  if (!candidate.viewportRect || !candidate.viewportWidth || !candidate.viewportHeight) {
    return null;
  }
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return cropVisibleTabDataUrlToImageCandidateViaOffscreenDocument(dataUrl, candidate);
  }

  const sourceBlob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const crop = getVisibleImageCropRect(candidate, bitmap.width, bitmap.height);
  if (!crop) {
    return null;
  }

  const canvas = new OffscreenCanvas(crop.width, crop.height);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(bitmap, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const outputBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  void recordDiagnostic("extension.image.input.visible-page.crop.ready", {
    width: crop.width,
    height: crop.height,
  });
  return {
    base64: await blobToBase64(outputBlob),
    mimeType: "image/jpeg",
    filename: "visible-page-image.jpg",
  };
}

async function cropVisibleTabDataUrlToImageCandidateViaOffscreenDocument(
  dataUrl: string,
  candidate: EditablePageImageCandidate,
): Promise<{ base64: string; mimeType: string; filename: string } | null> {
  const ensured = await ensureOffscreenDocumentForImageProcessing();
  if (!ensured) {
    return null;
  }
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: OFFSCREEN_IMAGE_CROP_MESSAGE_TYPE,
    dataUrl,
    candidate,
  });
  if (!response || typeof response !== "object") {
    return null;
  }
  const output = response as Record<string, unknown>;
  const base64 = typeof output.base64 === "string" ? output.base64.trim() : "";
  const mimeType = typeof output.mimeType === "string" ? output.mimeType.trim() : "";
  const filename = typeof output.filename === "string" ? output.filename.trim() : "";
  if (!base64 || !mimeType || !filename) {
    return null;
  }
  return {
    base64,
    mimeType,
    filename,
  };
}

async function ensureOffscreenDocumentForImageProcessing(): Promise<boolean> {
  if (!chrome.offscreen?.createDocument) {
    return false;
  }
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const runtimeWithContexts = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (filter: {
      contextTypes?: string[];
      documentUrls?: string[];
    }) => Promise<Array<Record<string, unknown>>>;
  };
  if (typeof runtimeWithContexts.getContexts === "function") {
    const contexts = await runtimeWithContexts
      .getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl],
      })
      .catch(() => []);
    if (contexts.length) {
      return true;
    }
  }
  if (offscreenDocumentPromise) {
    await offscreenDocumentPromise;
    return true;
  }
  offscreenDocumentPromise = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: "Crop captured tab images for prompt extraction compatibility.",
    })
    .catch((error) => {
      if (!isOffscreenDocumentAlreadyExistsError(error)) {
        throw error;
      }
    })
    .finally(() => {
      offscreenDocumentPromise = null;
    });
  await offscreenDocumentPromise;
  return true;
}

function isOffscreenDocumentAlreadyExistsError(error: unknown): boolean {
  return toErrorMessage(error).toLowerCase().includes("single offscreen document");
}

async function recordDiagnostic(event: string, details: Record<string, unknown> = {}): Promise<void> {
  await bridge
    .request("diagnostics.log.write", {
      event,
      details,
    })
    .catch(() => undefined);
}

async function dataUrlToEditableJpegInput(dataUrl: string, fallbackFilename: string) {
  const blob = await (await fetch(dataUrl)).blob();
  return imageBlobToEditableJpegInput(blob, fallbackFilename, blob.type || "image/png");
}

async function imageBlobToEditableJpegInput(blob: Blob, fallbackFilename: string, originalMimeType: string) {
  const jpegBlob = await convertImageBlobToJpeg(blob).catch(() => null);
  const outputBlob = jpegBlob ?? blob;
  const outputMimeType = jpegBlob ? "image/jpeg" : originalMimeType || outputBlob.type || "image/png";
  return {
    base64: await blobToBase64(outputBlob),
    mimeType: outputMimeType,
    filename: filenameWithMimeExtension(fallbackFilename, outputMimeType),
  };
}

async function convertImageBlobToJpeg(blob: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return null;
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, bitmap.width, bitmap.height);
  context.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

function filenameWithMimeExtension(filename: string, mimeType: string): string {
  const extension =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/gif"
          ? "gif"
          : "png";
  return filename.replace(/\.[a-z0-9]+$/iu, "") + `.${extension}`;
}

function getVisibleImageCropRect(
  candidate: EditablePageImageCandidate,
  bitmapWidth: number,
  bitmapHeight: number,
): { left: number; top: number; width: number; height: number } | null {
  const rect = candidate.viewportRect;
  const viewportWidth = candidate.viewportWidth ?? 0;
  const viewportHeight = candidate.viewportHeight ?? 0;
  if (!rect || viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }

  const cssLeft = clampNumber(rect.left, 0, viewportWidth);
  const cssTop = clampNumber(rect.top, 0, viewportHeight);
  const cssRight = clampNumber(rect.left + rect.width, 0, viewportWidth);
  const cssBottom = clampNumber(rect.top + rect.height, 0, viewportHeight);
  if (cssRight - cssLeft < 24 || cssBottom - cssTop < 24) {
    return null;
  }

  const scaleX = bitmapWidth / viewportWidth;
  const scaleY = bitmapHeight / viewportHeight;
  const left = Math.max(0, Math.floor(cssLeft * scaleX));
  const top = Math.max(0, Math.floor(cssTop * scaleY));
  const right = Math.min(bitmapWidth, Math.ceil(cssRight * scaleX));
  const bottom = Math.min(bitmapHeight, Math.ceil(cssBottom * scaleY));
  const width = right - left;
  const height = bottom - top;
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

function filenameFromImageUrl(url: string): string {
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return "page-image.png";
  }

  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").filter(Boolean).at(-1)?.trim();
    return filename || "page-image.png";
  } catch {
    return "page-image.png";
  }
}

function mimeTypeFromImageUrl(url: string): string {
  const extension = filenameFromImageUrl(url).split(".").at(-1)?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "png":
    default:
      return "image/png";
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(",", 2)[1] ?? "";
}

function estimateBase64ByteLength(base64: string): number {
  const clean = base64.replace(/\s+/gu, "");
  if (!clean) {
    return 0;
  }
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

async function refreshAppServerCatalog(
  workspaceRoot?: string,
  options: { force?: boolean } = {},
): Promise<void> {
  state.modelCatalogState = "loading";
  state.modelCatalogErrorMessage = "";
  const normalizedWorkspaceRoot = normalizeCatalogWorkspaceRoot(workspaceRoot ?? (await getWorkspaceHarness()).workspaceRoot);
  const cwd = normalizedWorkspaceRoot || undefined;
  let modelRequestFailed = false;
  let modelRequestErrorMessage = "";
  const [models, serverThreads, appServerSkills, connectedApps, appServerPlugins, mcpServers, rateLimits] = await Promise.all([
    bridge.request<CodexModelOption[]>("model.list").catch((error) => {
      modelRequestFailed = true;
      modelRequestErrorMessage = toErrorMessage(error);
      console.warn("model.list failed", error);
      return [];
    }),
    bridge.request<CodexThreadSummary[]>("thread.list", {
      ...(cwd ? { cwd } : {}),
      limit: 12,
    }).catch(() => []),
    bridge.request<CodexSkillOption[]>("skills.list", {
      ...(cwd ? { cwd } : {}),
      forceReload: true,
    }).catch(() => []),
    bridge.request<CodexAppOption[]>("apps.list", {
      ...(options.force ? { forceRefetch: true } : {}),
    }).catch(() => []),
    bridge.request<CodexPluginOption[]>("plugins.list", {
      ...(cwd ? { cwd } : {}),
    }).catch(() => []),
    bridge.request<CodexMcpServerOption[]>("mcp.servers.list", {
      detail: "toolsAndAuthOnly",
      limit: 100,
    }).catch(() => []),
    bridge.request<CodexRateLimits | null>("account.rate_limits.read").catch(() => null),
  ]);

  state.models = models;
  state.serverThreads = serverThreads;
  state.appServerSkills = appServerSkills;
  state.connectedApps = connectedApps;
  state.appServerPlugins = appServerPlugins;
  state.mcpServers = mcpServers;
  state.rateLimits = rateLimits;
  state.modelCatalogState = resolveCatalogModelState({
    modelRequestFailed,
    models,
  });
  state.modelCatalogErrorMessage = modelRequestFailed ? modelRequestErrorMessage : "";
  await reconcileSelectedModelWithCatalog(state.selectedModel);
}

async function reconcileSelectedModelWithCatalog(requestedModel: string | null | undefined): Promise<string> {
  const nextModel = state.models.length
    ? resolveSelectedCatalogModel({
        selectedModel: requestedModel,
        models: state.models,
      })
    : (requestedModel?.trim() ?? "");
  state.selectedModel = nextModel;
  await setSelectedModel(nextModel);
  return nextModel;
}

async function persistSelectedModelControls(input: {
  model: string | null | undefined;
  reasoningEffort?: string;
  serviceTier?: string;
}): Promise<void> {
  await reconcileSelectedModelWithCatalog(input.model ?? state.selectedModel);
  if (typeof input.reasoningEffort === "string") {
    state.selectedReasoningEffort = input.reasoningEffort.trim();
    await setSelectedReasoningEffort(state.selectedReasoningEffort);
  }
  if (typeof input.serviceTier === "string") {
    state.selectedServiceTier = input.serviceTier.trim();
    await setSelectedServiceTier(state.selectedServiceTier);
  }
}

async function handleSkillArchiveInstall(
  filename: string | undefined,
  base64: string | undefined,
): Promise<SkillArchiveInstallResult> {
  const workspaceRoot = normalizeCatalogWorkspaceRoot((await getWorkspaceHarness()).workspaceRoot);
  const result = await bridge.request<SkillArchiveInstallResult>("skills.archive.install", {
    filename: filename ?? "skills.zip",
    base64: base64 ?? "",
    ...(workspaceRoot ? { cwd: workspaceRoot } : {}),
  });
  state.appServerSkills = mergeCodexSkills(state.appServerSkills, result.skills);
  await triggerCatalogRefresh(workspaceRoot || undefined, { force: true });
  state.appServerSkills = mergeCodexSkills(state.appServerSkills, result.skills);
  return result;
}

async function refreshPlaywrightRuntime(): Promise<UiInitPayload["playwrightRuntime"]> {
  const runtime = await bridge.request<UiInitPayload["playwrightRuntime"]>("runtime.playwright.status");
  state.playwrightRuntime = runtime;
  return runtime;
}

async function installPlaywrightRuntime(): Promise<UiInitPayload["playwrightRuntime"]> {
  const runtime = await bridge.request<UiInitPayload["playwrightRuntime"]>(
    "runtime.playwright.install",
    {},
    {
      timeoutMs: PLAYWRIGHT_RUNTIME_INSTALL_TIMEOUT_MS,
      timeoutMessage: "Playwright Chromium install timed out.",
    },
  );
  state.playwrightRuntime = runtime;
  return runtime;
}

function mergeCodexSkills(left: CodexSkillOption[], right: CodexSkillOption[]): CodexSkillOption[] {
  const byId = new Map<string, CodexSkillOption>();
  for (const skill of [...left, ...right]) {
    byId.set(skill.id, skill);
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function triggerCatalogRefresh(
  workspaceRoot?: string,
  options: {
    force?: boolean;
  } = {},
): Promise<void> {
  if (
    !shouldTriggerCatalogRefresh({
      inFlight: Boolean(state.catalogRefreshPromise),
      lastRequestedWorkspaceRoot: state.lastRequestedCatalogWorkspaceRoot,
      workspaceRoot,
      force: options.force,
    })
  ) {
    return state.catalogRefreshPromise ?? Promise.resolve();
  }

  if (state.catalogRefreshPromise) {
    return state.catalogRefreshPromise;
  }

  state.lastRequestedCatalogWorkspaceRoot = normalizeCatalogWorkspaceRoot(workspaceRoot);
  state.catalogRefreshPromise = refreshAppServerCatalog(workspaceRoot, options.force ? { force: true } : {})
    .catch((error) => {
      state.modelCatalogState = "error";
      state.modelCatalogErrorMessage = toErrorMessage(error);
      console.warn("catalog refresh failed", error);
    })
    .finally(() => {
      broadcastBridgeEvent({ type: "catalog.updated" });
      state.catalogRefreshPromise = null;
    });

  return state.catalogRefreshPromise;
}

async function startNewConversation(profileId?: string, model?: string) {
  state.threadId = undefined;
  state.activeTurn = null;
  state.latestPlan = null;
  state.latestDiff = null;
  state.latestReroute = null;
  state.lastAutoCompactThreadId = "";
  state.lastAutoCompactBucket = null;
  const nextProfileId = normalizeSelectedProfileId(profileId ?? state.selectedProfileId);
  const nextModel = state.models.length
    ? resolveSelectedCatalogModel({ selectedModel: model ?? state.selectedModel, models: state.models })
    : (model ?? state.selectedModel);
  const conversation = await createConversation(nextProfileId, nextModel);
  conversationRuntime.resetConversation(conversation.id);
  state.currentConversationId = conversation.id;
  state.currentDraftConversation = conversation;
  state.selectedProfileId = nextProfileId;
  state.selectedModel = nextModel;
  await setCurrentConversationId(conversation.id);
  await setSelectedProfileId(nextProfileId);
  await setSelectedModel(nextModel);
  return { conversation };
}

async function resumeServerConversation(threadId: string) {
  const transcript = await bridge.request<CodexThreadTranscript>("thread.read", { threadId });
  await bridge.request("session.resume", { threadId });
  state.latestPlan = null;
  state.latestDiff = null;
  state.latestReroute = null;
  state.lastAutoCompactThreadId = "";
  state.lastAutoCompactBucket = null;
  const conversation = await saveConversation({
    id: crypto.randomUUID(),
    title: transcript.title,
    profileId: normalizeSelectedProfileId(state.selectedProfileId),
    ...(state.selectedModel ? { model: state.selectedModel } : {}),
    threadId,
    messages: transcript.messages.map((message) => ({ ...message })),
    attachments: [],
    structuredInputs: [],
    selectedTabIds: [],
    historyQuery: "",
    readStrategyOverride: "auto",
    updatedAt: transcript.updatedAt,
  });
  state.currentConversationId = conversation.id;
  state.currentDraftConversation = null;
  conversationRuntime.setThreadId(conversation.id, threadId);
  conversationRuntime.setActiveTurn(conversation.id, null);
  syncCurrentRuntimeState(conversation.id);
  await setCurrentConversationId(conversation.id);
  return { conversation };
}

async function resumeConversation(conversationId: string) {
  const conversations = await listConversations();
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  state.currentConversationId = conversation.id;
  state.currentDraftConversation = null;
  conversationRuntime.setThreadId(conversation.id, conversation.threadId);
  state.latestPlan = null;
  state.latestDiff = null;
  state.latestReroute = null;
  syncCurrentRuntimeState(conversation.id);
  state.selectedProfileId = normalizeSelectedProfileId(conversation.profileId);
  state.selectedModel = await reconcileSelectedModelWithCatalog(conversation.model ?? state.selectedModel);
  await setCurrentConversationId(conversation.id);
  await setSelectedProfileId(state.selectedProfileId);

  if (conversation.threadId) {
    try {
      await bridge.request("session.resume", { threadId: conversation.threadId });
    } catch {
      conversationRuntime.setThreadId(conversation.id, undefined);
      syncCurrentRuntimeState(conversation.id);
    }
  }

  return { conversation };
}

async function persistConversation(conversation: SavedConversation) {
  const saved = await saveConversation(conversation);
  if (state.currentDraftConversation?.id === saved.id) {
    state.currentDraftConversation = null;
  }
  conversationRuntime.setThreadId(saved.id, saved.threadId);
  if (!state.currentConversationId || state.currentConversationId === saved.id) {
    state.currentConversationId = saved.id;
    syncCurrentRuntimeState(saved.id);
    await setCurrentConversationId(saved.id);
  }
  return { conversation: saved };
}

async function handleConversationDelete(conversationId: string) {
  if (!conversationId) {
    throw new Error("Missing conversation id.");
  }

  const wasCurrent = state.currentConversationId === conversationId;
  const conversations = await deleteConversation(conversationId);
  conversationRuntime.deleteConversation(conversationId);
  if (state.currentDraftConversation?.id === conversationId) {
    state.currentDraftConversation = null;
  }
  const currentConversation = resolveVisibleCurrentConversation({
    conversations,
    currentConversationId: state.currentConversationId,
    draftConversation: state.currentDraftConversation,
  });
  state.currentConversationId = currentConversation?.id ?? "";
  if (currentConversation) {
    conversationRuntime.setThreadId(currentConversation.id, currentConversation.threadId);
    syncCurrentRuntimeState(currentConversation.id);
  } else {
    state.threadId = undefined;
  }
  if (wasCurrent && !currentConversation) {
    state.activeTurn = null;
    state.latestPlan = null;
    state.latestDiff = null;
    state.latestReroute = null;
    state.lastAutoCompactThreadId = "";
    state.lastAutoCompactBucket = null;
  }
  return {
    recentChats: conversations.map(toConversationSummary),
    currentConversation,
  };
}

async function handleConversationClear() {
  await clearConversations();
  conversationRuntime.clear();
  state.currentConversationId = "";
  state.currentDraftConversation = null;
  state.threadId = undefined;
  state.activeTurn = null;
  state.latestPlan = null;
  state.latestDiff = null;
  state.latestReroute = null;
  state.lastAutoCompactThreadId = "";
  state.lastAutoCompactBucket = null;
  return {
    recentChats: [],
    currentConversation: null,
  };
}

async function handleConversationCompact(waitForCompletion: boolean) {
  if (!state.threadId) {
    return { skipped: true, reason: "no-thread" };
  }
  if (state.activeTurn) {
    return { error: "Cannot compact while Codex is responding." };
  }

  let result: {
    threadId: string;
    status: "started" | "completed";
    turnId?: string;
  };
  try {
    result = await bridge.request("thread.compact.start", {
      threadId: state.threadId,
      waitForCompletion,
    });
  } catch (error) {
    if (!isRecoverableMissingCodexThreadError(error)) {
      throw error;
    }
    void recordDiagnostic("extension.compact.stale_thread", {
      threadId: state.threadId,
      error: toErrorMessage(error),
    });
    state.threadId = undefined;
    state.activeTurn = null;
    state.lastAutoCompactThreadId = "";
    state.lastAutoCompactBucket = null;
    return { skipped: true, reason: "stale-thread" };
  }
  state.threadId = result.threadId;
  if (result.status === "completed") {
    state.activeTurn = null;
    state.lastAutoCompactThreadId = result.threadId;
    state.lastAutoCompactBucket = null;
  }
  return result;
}

async function popOutChat() {
  const activeTab = await getActiveTab().catch(() => null);
  const focusedWindow = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null);
  const normalWindows = await chrome.windows.getAll({ windowTypes: ["normal"] }).catch(() => []);
  const targetWindowId = selectBrowserWindowIdForPopout({
    activeTabWindowId: activeTab?.windowId,
    rememberedWindowId: state.browserWindowId,
    focusedWindowId: focusedWindow?.id,
    normalWindowIds: normalWindows
      .map((window) => window.id)
      .filter((windowId): windowId is number => typeof windowId === "number"),
  });
  if (typeof targetWindowId === "number") {
    state.browserWindowId = targetWindowId;
  }
  await chrome.windows.create({
    url: chrome.runtime.getURL(createPopoutUrlPath(targetWindowId)),
    type: "popup",
    width: 460,
    height: 860,
  });
  return { ok: true, targetWindowId: targetWindowId ?? null };
}

async function dockChat(targetWindowId?: number, popupWindowId?: number) {
  const activeWindowId = targetWindowId ?? state.browserWindowId;
  if (typeof activeWindowId === "number") {
    state.browserWindowId = activeWindowId;
    await chrome.sidePanel.open({ windowId: activeWindowId });
  }
  if (typeof popupWindowId === "number") {
    await chrome.windows.remove(popupWindowId).catch(() => undefined);
  }
  return { ok: true };
}

async function getWorkspaceHarness(): Promise<WorkspaceHarnessSnapshot> {
  const harness = await bridge.request<WorkspaceHarnessSnapshot>("workspace.harness.read");
  state.workspaceHarness = harness;
  return harness;
}

async function handleSettingsUpdate(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const settings = await updateStoredSettings(patch);
  await softTimeout(syncBridgeRuntimeConfig(settings), UI_BRIDGE_TIMEOUT_MS, undefined, "runtime.config.update(settings)");
  state.workspaceHarness = await softTimeout(
    getWorkspaceHarness(),
    UI_BRIDGE_TIMEOUT_MS,
    createFallbackWorkspaceHarness(settings.workspaceRoot),
    "workspace.harness.read(settings)",
  );
  void triggerCatalogRefresh(normalizeConfiguredPath(settings.workspaceRoot) || undefined, {
    force: true,
  });
  return settings;
}

async function syncBridgeRuntimeConfig(settings: ExtensionSettings): Promise<void> {
  await bridge.request("runtime.config.update", {
    workspaceRoot: normalizeConfiguredPath(settings.workspaceRoot),
    codexBinPath: normalizeConfiguredPath(settings.codexBinPath),
  });
}

async function syncRuntimeConfigAndNormalizeSettings(): Promise<{
  settings: ExtensionSettings;
  runtimeConfig: RuntimeConfigSnapshot;
}> {
  let settings = await getStoredSettings();
  await softTimeout(syncBridgeRuntimeConfig(settings), UI_BRIDGE_TIMEOUT_MS, undefined, "runtime.config.update");

  let runtimeConfig = await softTimeout(
    bridge.request<RuntimeConfigSnapshot>("runtime.config.read"),
    UI_BRIDGE_TIMEOUT_MS,
    createFallbackRuntimeConfig(settings),
    "runtime.config.read",
  );

  if (runtimeConfig.configuredCodexBinPathInvalid && settings.codexBinPath) {
    settings = await updateStoredSettings({ codexBinPath: "" });
    await softTimeout(
      syncBridgeRuntimeConfig(settings),
      UI_BRIDGE_TIMEOUT_MS,
      undefined,
      "runtime.config.update(reset-invalid-codex-bin)",
    );
    runtimeConfig = await softTimeout(
      bridge.request<RuntimeConfigSnapshot>("runtime.config.read"),
      UI_BRIDGE_TIMEOUT_MS,
      createFallbackRuntimeConfig(settings),
      "runtime.config.read(reset-invalid-codex-bin)",
    );
  }

  return { settings, runtimeConfig };
}

async function ensureHistoryPermission(): Promise<boolean> {
  const alreadyGranted = await chrome.permissions.contains({ permissions: ["history"] });
  if (alreadyGranted) {
    return true;
  }

  throw new BrowserPermissionRequiredError(
    { permissions: ["history"] },
    "Allow Codex to search your browser history only when you ask for it.",
  );
}

async function ensureTabsPermission(): Promise<boolean> {
  const alreadyGranted = await chrome.permissions.contains({ permissions: ["tabs"] });
  if (alreadyGranted) {
    return true;
  }

  throw new BrowserPermissionRequiredError(
    { permissions: ["tabs"] },
    "Allow Codex to list your open tabs only when you ask for cross-tab context.",
  );
}

function assertPageReadable(url: string): void {
  if (isRestrictedBrowserUrl(url)) {
    throw new Error("This page is a restricted browser page, so Codex cannot read or modify it.");
  }
}

async function hasTabOriginPermission(url: string | undefined): Promise<boolean> {
  const permission = buildTabOriginPermission(url);
  if (!permission) {
    return false;
  }

  return chrome.permissions.contains(permission).catch(() => false);
}

async function sendMessageToTab(
  activeTab: chrome.tabs.Tab & { id: number; url: string },
  message: Record<string, unknown>,
): Promise<unknown> {
  try {
    await ensureContentScript(activeTab.id, activeTab.url);
    return await chrome.tabs.sendMessage(activeTab.id, message);
  } catch (error) {
    if (shouldAttemptTabOriginRecovery(activeTab.url, error) && (await hasTabOriginPermission(activeTab.url))) {
      await ensureContentScript(activeTab.id, activeTab.url);
      try {
        return await chrome.tabs.sendMessage(activeTab.id, message);
      } catch (retryError) {
        throw toFriendlyPageAccessError(activeTab.url, retryError);
      }
    }
    if (isRetryableRuntimeMessageError(error)) {
      await sleepMs(120);
      await ensureContentScript(activeTab.id, activeTab.url);
      try {
        return await chrome.tabs.sendMessage(activeTab.id, message);
      } catch (retryError) {
        throw toFriendlyPageAccessError(activeTab.url, retryError);
      }
    }
    throw toFriendlyPageAccessError(activeTab.url, error);
  }
}

async function captureVisibleTab(activeTab: chrome.tabs.Tab & { url: string; windowId: number }): Promise<string> {
  try {
    return await captureVisibleTabWithQuotaProtection(activeTab.windowId);
  } catch (error) {
    if (isCaptureVisibleTabQuotaError(error)) {
      throw new Error("Screen capture is busy. Codex is waiting briefly before reading the visible tab again.");
    }
    if (shouldAttemptTabOriginRecovery(activeTab.url, error) && (await hasTabOriginPermission(activeTab.url))) {
      try {
        return await captureVisibleTabWithQuotaProtection(activeTab.windowId);
      } catch (retryError) {
        if (isCaptureVisibleTabQuotaError(retryError)) {
          throw new Error("Screen capture is busy. Codex is waiting briefly before reading the visible tab again.");
        }
        throw toFriendlyPageAccessError(activeTab.url, retryError, { captureOnly: true });
      }
    }
    throw toFriendlyPageAccessError(activeTab.url, error, { captureOnly: true });
  }
}

async function captureVisibleTabWithQuotaProtection(windowId: number): Promise<string> {
  return throttleVisibleTabCapture(async () => {
    try {
      return await chrome.tabs.captureVisibleTab(windowId);
    } catch (error) {
      if (!isCaptureVisibleTabQuotaError(error)) {
        throw error;
      }
      await sleepMs(DEFAULT_VISIBLE_TAB_CAPTURE_MIN_INTERVAL_MS);
      return chrome.tabs.captureVisibleTab(windowId);
    }
  });
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFriendlyPageAccessError(
  url: string | undefined,
  error: unknown,
  options: { captureOnly?: boolean } = {},
): Error {
  if (url && isRestrictedBrowserUrl(url) && !options.captureOnly) {
    return new Error("This page is a restricted browser page, so Codex cannot read or modify it.");
  }

  const kind = classifyRuntimeMessageError(error);
  if (kind === "host-access") {
    if (buildTabOriginPermission(url)) {
      return new SitePermissionRequiredError(url, options);
    }
    return new Error(
      options.captureOnly
        ? "Codex needs screen capture access before it can capture the current screen. Reopen Codex from this tab, then try again."
        : "Codex needs access to this site before it can read this tab. Reopen Codex from this tab, then try again.",
    );
  }

  const message = toErrorMessage(error);
  if (isRetryableRuntimeMessageError(error)) {
    return new Error("Codex temporarily lost its connection to this tab. Try the action once more.");
  }

  return error instanceof Error ? error : new Error(message);
}

async function listMergedSkills(harness?: WorkspaceHarnessSnapshot): Promise<SkillOption[]> {
  return mergeSkillOptions(await listSkills(), harness ?? (await getWorkspaceHarness()));
}

function mergeSkillOptions(skills: SkillOption[], harness: WorkspaceHarnessSnapshot): SkillOption[] {
  const workspaceSkills = harness.shortcuts.map<SkillOption>((shortcut: WorkspaceHarnessSnapshot["shortcuts"][number]) => ({
    id: shortcut.id,
    name: shortcut.name,
    prompt: shortcut.prompt,
    description: shortcut.description,
    source: shortcut.source,
    readonly: true,
    path: shortcut.path,
  }));
  const byId = new Map<string, SkillOption>();

  for (const skill of [...skills, ...workspaceSkills]) {
    byId.set(skill.id, skill);
  }

  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
}

async function ensureOperationAllowed(operation: HarnessPermissionOperation, confirmed: boolean) {
  const [settings, harness] = await Promise.all([
    getStoredSettings(),
    state.workspaceHarness
      ? Promise.resolve(state.workspaceHarness)
      : softTimeout(
          getWorkspaceHarness(),
          UI_BRIDGE_TIMEOUT_MS,
          createFallbackWorkspaceHarness(),
          "workspace.harness.read(permission)",
        ),
  ]);
  const result = resolveHarnessPermission(harness.permissions, operation, {
    browserActionsEnabled: settings.allowBrowserActions,
    browserActionPermissionMode: settings.browserActionPermissionMode,
    confirmedOperations: confirmed ? [operation] : [],
  });

  if (result.decision === "allow") {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    response: {
      error: result.reason,
      requiresConfirmation: result.decision === "ask",
      confirmationOperation: operation,
    },
  };
}

function createFallbackAccountStatus(): UiInitPayload["accountStatus"] {
  return {
    authMode: null,
    codexAuthenticated: false,
    multimodalAvailable: false,
    openAiApiKeyConfigured: false,
    planType: null,
  };
}

function createFallbackWorkspaceHarness(workspaceRoot = ""): WorkspaceHarnessSnapshot {
  return {
    workspaceRoot: normalizeConfiguredPath(workspaceRoot),
    configSources: [],
    instructionSources: [],
    permissions: DEFAULT_HARNESS_PERMISSIONS,
    hooks: {
      enabled: false,
      eventCount: 0,
    },
    shortcuts: [],
  };
}

function createFallbackImageAssetFolder(): UiInitPayload["imageAssetFolder"] {
  return {
    rootDir: "",
    latestFolder: "",
    folders: [],
    assetCount: 0,
  };
}

function createFallbackDiagnosticLogFolder(): UiInitPayload["diagnosticLogFolder"] {
  return {
    rootDir: "",
    latestLogPath: "",
    files: [],
  };
}

function createFallbackPlaywrightRuntime(): UiInitPayload["playwrightRuntime"] {
  return {
    available: false,
    packageName: null,
    packageVersion: "",
    browserInstalled: false,
    browserExecutablePath: "",
    installable: false,
    installCommand: "",
    message: "Playwright runtime is not connected.",
  };
}

function createCodexSkillRuntimeAvailability(settings: ExtensionSettings) {
  return {
    playwrightAvailable: state.playwrightRuntime.available && settings.playwrightBrowserControlEnabled,
  };
}

function createFallbackRuntimeConfig(settings: ExtensionSettings): RuntimeConfigSnapshot {
  const codexBinPath = normalizeConfiguredPath(settings.codexBinPath);
  return {
    workspaceRoot: normalizeConfiguredPath(settings.workspaceRoot),
    codexBinPath,
    resolvedCodexBinPath: codexBinPath,
    codexBinSource: codexBinPath ? "configured" : "missing",
    configuredCodexBinPathInvalid: false,
  };
}

function normalizeConfiguredPath(value: string | undefined): string {
  return value?.trim() ?? "";
}

function resolveSettingsUiLocale(settings: Pick<ExtensionSettings, "uiLanguage">): string {
  return resolveUiLocale(settings.uiLanguage, getBrowserLocale());
}

async function getActiveUiLocale(): Promise<string> {
  return resolveSettingsUiLocale(await getStoredSettings());
}

function getBrowserLocale(): string {
  try {
    return chrome.i18n?.getUILanguage?.() || "en";
  } catch {
    return "en";
  }
}

function broadcastBridgeEvent(event: unknown): void {
  chrome.runtime.sendMessage({ type: "bridge.event", event }).catch(() => undefined);
}

function emitPromptStatus(payload: PromptRequestPayload, phase: PromptActivityPhase, workflow?: PromptImageWorkflowKind): void {
  broadcastBridgeEvent({
    type: "prompt.status",
    clientRequestId: payload.clientRequestId ?? "",
    ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
    phase,
    ...(workflow ? { workflow } : {}),
  });
}

function softTimeout<TResult>(
  task: Promise<TResult>,
  timeoutMs: number,
  fallback: TResult,
  label: string,
): Promise<TResult> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      console.warn(`${label} timed out after ${timeoutMs}ms`);
      resolve(fallback);
    }, timeoutMs);

    task
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        console.warn(`${label} failed`, error);
        resolve(fallback);
      });
  });
}

async function guardAndRun<TResult>(
  operation: HarnessPermissionOperation,
  confirmed: boolean,
  action: () => Promise<TResult>,
) {
  const gate = await ensureOperationAllowed(operation, confirmed);
  if (!gate.ok) {
    return gate.response;
  }

  return action();
}
