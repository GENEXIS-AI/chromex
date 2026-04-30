import {
  normalizeCodexRealtimeVoice,
  type ActionCard,
  type AgenticRoutePlan,
  type BrowserActionPermissionMode,
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
  type CodexTurnDiff,
  type CodexTurnPlan,
  type ProfileTemplate,
  type ReadStrategy,
  type SkillArchiveInstallResult,
  type OpenTabContext,
  type UserFileAttachment,
} from "@codex-sidepanel/shared";

import { shouldInterceptComposerDropdownOnEnter, shouldSubmitComposerOnKeydown } from "./composer-submit.js";
import { createSubmittedComposerFileAttachmentState } from "./composer-attachment-submit.js";
import { createPendingComposerDraftState, createRestoredComposerDraftState } from "./composer-draft.js";
import { getDroppedFiles, hasComposerDropPayload } from "./composer-drop.js";
import { isTextFirstActionCard } from "./action-card-routing.js";
import { calculateComposerTextareaAutosize } from "./composer-textarea-autosize.js";
import { canSendComposerMessage } from "./composer-send-guard.js";
import {
  didComposerPrimaryActionChangeForDraftInput,
  resolveComposerPrimaryAction,
} from "./composer-primary-action.js";
import { shouldSendComposerAsTurnSteer } from "./turn-steer-routing.js";
import { resolveAcceptedPromptActiveTurn } from "./active-turn-after-send.js";
import {
  clearTransientComposerCommandPills,
  removeComposerCommandPill,
  upsertComposerCommandPill,
  type ComposerCommandPill,
} from "./composer-command-pills.js";
import { createDebouncedTask } from "./debounced-task.js";
import { prepareMessageReplay } from "./message-actions.js";
import { createConversationMessageAttachments } from "./message-attachments.js";
import { isSafeMessageImageUrl, renderMessageContentHtml } from "./message-content.js";
import { createExternalImagePreviewUrl } from "./external-image-preview.js";
import {
  clearEmptyAssistantResponseNotice,
  clearResolvedEmptyAssistantResponseNotices,
  createEmptyAssistantResponseNotice,
  getStructuredInputNamesForEmptyResponseNotice,
  shouldShowEmptyAssistantResponseNotice,
} from "./empty-assistant-response.js";
import {
  ASK_USER_QUESTION_TAG,
  hasProfileAskUserQuestionStart,
  parseProfileAskUserQuestion,
  stripIncompleteProfileAskUserQuestion,
  type PendingProfileQuestionState,
  type ProfileAskUserQuestion,
} from "./profile-question.js";
import { renderPendingProfileQuestionCard } from "./profile-question-card.js";
import {
  clampMentionOptionIndex,
  extractMentionQuery,
  getNextMentionOptionIndex,
  isMentionOptionArrowKey,
  isStructuredMentionOption,
  listMentionOptions,
  type MentionOption,
  type StructuredMentionOption,
} from "./mentions.js";
import { createRenderBatcher } from "./render-batcher.js";
import {
  normalizePanelConversation,
  normalizeSidepanelCollections,
  serializeConversationMessagesForStorage,
  shouldApplyConversationSaveResultToActiveChat,
  shouldHydrateInitConversation,
  shouldPersistConversationMessagesForStorage,
} from "./sidepanel-state.js";
import {
  formatPromptActivityLabel,
  getPromptActivityDetail,
  type PromptActivityPhase,
  type PromptActivityState,
} from "./prompt-activity.js";
import {
  getEffectivePromptActivityForActiveWork,
  promotePromptActivityForAssistantProgress,
  promotePromptActivityForTurnActivity,
  shouldClearPromptActivityOnMessageCompleted,
  shouldClearPromptActivityOnTurnCompleted,
} from "./prompt-activity-lifecycle.js";
import {
  getPermissionRequestForMessage,
  getPermissionRequestForRuntimeResponse,
  type PermissionRequestPlan,
} from "../permission-plans.js";
import {
  extractSlashQuery,
  listSlashCommandOptions,
  removeActiveSlashToken,
  type SlashCommandOption,
} from "./skills.js";
import {
  createAttachmentFingerprint,
  createFileChipLabel,
  createImageAttachmentPreviewSrc,
  createRemoteImageAttachment,
  extractWebImageUrlsFromDropData,
  MAX_FILE_ATTACHMENTS,
  planAttachmentSelection,
} from "./file-attachments.js";
import { createOnlineImagePromptExtractionPrompt } from "./online-image-prompt.js";
import {
  getCodexBinaryHealth,
  getNativeHostHealth,
  type CodexBinaryHealth,
  type NativeHostHealth,
} from "./connection-diagnostics.js";
import {
  DEFAULT_REASONING_EFFORTS,
  formatReasoningEffortLabel,
  formatServiceTierLabel,
  getDefaultServiceTier,
  normalizeReasoningEffort,
  normalizeServiceTier,
} from "./composer-controls.js";
import {
  createProfileSuggestionCards,
  getSuggestionCardSource,
  mergeProfileAndSiteSuggestionCards,
} from "./profile-suggestions.js";
import {
  createImageAttachmentSuggestionCards,
  IMAGE_ATTACHMENT_DESCRIBE_ACTION_ID,
  IMAGE_ATTACHMENT_PROMPT_EXTRACT_ACTION_ID,
} from "./image-attachment-suggestions.js";
import { parseVoiceNavigationCommand } from "./voice-commands.js";
import { shouldAutoReconnectVoice } from "./voice-reconnect.js";
import { shouldInterruptVoiceOutputForTranscript } from "./voice-barge-in.js";
import {
  classifyMicrophonePermissionError,
  microphonePermissionResultToError,
  shouldOpenDedicatedMicrophonePermissionWindow,
  type MicrophonePermissionWindowResult,
} from "./voice-permissions.js";
import { listCodexRealtimeVoiceOptions } from "./voice-session.js";
import { createRealtimeVoiceContextAppendText } from "./voice-turn-context.js";
import { shouldRouteRealtimeVoiceTranscriptThroughPrompt } from "./voice-agentic-routing.js";
import { extractRealtimeVoiceHandoffPrompt } from "./voice-handoff.js";
import { createVoiceRoutePreviewPayload as createSanitizedVoiceRoutePreviewPayload } from "./voice-route-preview.js";
import {
  applyVoiceTranscriptDelta,
  applyVoiceTranscriptDone,
  createVoiceTranscriptMirrorState,
  formatVoiceDurationLabel,
  isActiveVoiceTranscriptMessage,
  resetVoiceTranscriptMirrorState,
} from "./voice-live-captions.js";
import { renderVoiceMessageIcon } from "./voice-message-icons.js";
import { shouldShowPermissionStatusBanner } from "./permission-status.js";
import { createConfirmedHistorySearchRequest } from "./history-search.js";
import { requestOptionalPermissionsWithResult } from "./permission-request.js";
import { resolvePermissionRetryPrompt } from "./permission-retry.js";
import { formatCurrentTabReferenceLabel, formatTabReferenceLabel, getTabReferenceInitial } from "./tab-reference.js";
import { formatTabMentionUrl, listTabMentionOptions, toggleSelectedTabId } from "./tab-mentions.js";
import { listSettingsSections } from "./settings-panel.js";
import { DEFAULT_PROFILE_ICON_ID, renderProfileIcon } from "./profile-icons.js";
import { renderMessageActionIcon } from "./message-action-icons.js";
import { shouldRenderAssistantMessageActions } from "./message-action-visibility.js";
import {
  clampSlashCommandIndex,
  getNextSlashCommandIndex,
  isSlashCommandArrowKey,
} from "./slash-navigation.js";
import {
  DEFAULT_PROFILE_ID,
  normalizeSelectedProfileIdForProfiles,
  resolveComposerProfileSelection,
} from "./profile-selection.js";
import { localizeBuiltinProfiles } from "../profile-localization.js";
import { shouldOfferApiKeyFallbackForError } from "./oauth-fallback.js";
import {
  APP_MENU_RECENT_CHAT_LIMIT,
  createRecentChatDisplayItems,
  getAppMenuLabels,
  hasAppMenuMoreRecentChats,
} from "./app-menu.js";
import { createAssistantFailureMessage } from "./submission-failure.js";
import { isBridgeImageAssetRef, resolveImagePreviewRefForUi } from "./image-preview-assets.js";
import {
  buildImageDownloadName,
  createFailedConversationImage,
  createGeneratedImageAlt,
  createLoadingConversationImage,
  createPendingConversationImage,
  isSameConversationImage,
  normalizeImageGenerateWorkflow,
  normalizeImagePreviewRefs,
  normalizePromptStatusImageWorkflow,
  type ImageWorkflowPlaceholderKind,
} from "./image-workflow-messages.js";
import {
  createGeneratedImageAttachmentName,
  getGeneratedImageAttachmentLimit,
  shouldAttachGeneratedImagesForRoutePlan,
  toGeneratedImageFileAttachment,
} from "./generated-image-attachments.js";
import {
  isPendingImageMessage,
  shouldRenderConversationMessage,
} from "./conversation-message-visibility.js";
import {
  formatTraceDetail,
  formatTraceSummary,
  formatTraceTitle,
  getVisibleTraceItems,
  isNoisyTraceText,
  shouldOpenMessageTrace,
} from "./message-trace-formatting.js";
import { isQuickInteractionLocked } from "./interaction-lock.js";
import {
  createAnnotatedImageAttachment,
  createImageAttachmentFromDataUrl,
  getImageAttachmentDataUrl,
  isAnnotatableImageAttachment,
} from "./image-annotation.js";
import { isYouTubeCurrentMomentAction, type YouTubeCurrentMomentPromptResult } from "../youtube-current-moment.js";
import type {
  ConversationMessageAttachment,
  ConversationMessageImage,
  ConversationMessageProfile,
  ConversationMessageStructuredInput,
  ConversationMessageTraceItem,
  ConversationMessage,
  ConversationSummary,
  ExtensionSettings,
  PromptRequestPayload,
  SavedConversation,
  UiInitPayload,
} from "../types.js";
import { listAttachmentMenuItems, type AttachmentMenuAction } from "./attachment-menu.js";
import {
  detectUiLocale,
  formatUiLanguageOptionLabel,
  getBrowserUiLanguage,
  getUiStrings,
  isRtlUiLocale,
  listSupportedUiLanguageOptions,
  normalizeUiLanguageSetting,
  resolveUiLocale,
  UI_STRINGS,
  type UiLocale,
} from "./i18n.js";
import { normalizeUiThemeSetting, resolveUiTheme } from "../ui-theme.js";
import { classifyRuntimeMessageError, isRetryableRuntimeMessageError, toErrorMessage } from "../runtime-errors.js";
import { isCurrentPageAttachment, sanitizeUnavailableCurrentPageAttachments } from "../page-context.js";
import { MAX_PROFILE_SYSTEM_PROMPT_LENGTH } from "../profile-templates.js";
import {
  getCodexSkillRuntimeRequirement,
  mergeStructuredInputsWithEnabledCodexSkills,
  toggleEnabledCodexSkillId,
} from "../codex-skill-settings.js";
import {
  findCompanionAppForPlugin,
  getPluginConnectionState,
  isPluginMentionRouteable,
} from "../plugin-connection-availability.js";
import {
  deleteCustomSiteSuggestion,
  inferCustomSiteSuggestionCards,
  listCustomSiteSuggestionsForTab,
  resolveCustomSiteSuggestionKey,
  upsertCustomSiteSuggestion,
} from "../custom-site-suggestions.js";
import {
  shouldShowScrollToBottomButton,
  shouldStickToBottomAfterRender,
} from "./chat-scroll-controls.js";
import {
  calculateNextChatMessageWindowSize,
  CHAT_MESSAGE_WINDOW_INCREMENT,
  DEFAULT_CHAT_MESSAGE_WINDOW_SIZE,
  getChatMessageWindow,
  shouldExpandChatMessageWindowOnScroll,
} from "./chat-message-window.js";
import {
  resolveAuthOnboardingReadiness,
  shouldShowAuthOnboarding,
  shouldShowUsageNoticeOnboarding,
} from "./onboarding.js";
import { createStreamingDeltaBuffer } from "./streaming-delta-buffer.js";
import { renderUiIcon, type UiIconName } from "./ui-icons.js";

type MainView = "chat" | "context" | "skills" | "plugins" | "workspace";
const MAX_TRACE_ITEMS = 12;

type ProfileEditorState = {
  mode: "create" | "edit";
  profileId?: string;
  name: string;
  systemPrompt: string;
  color: string;
  icon: string;
  imageDataUrl: string;
  suggestedPrompts: string[];
  visualPickerOpen: boolean;
  error?: string;
};

type NativeTextDialogState = {
  kind: "api-key";
  title: string;
  description: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  cancelLabel: string;
  inputType: "text" | "password";
  afterSubmit?: {
    kind: "retry-prompt";
    message: string;
    displayMessage: string;
    resetThread?: boolean;
  };
  error?: string;
  submitting?: boolean;
};

type NativeConfirmationDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "default" | "danger";
};

type PluginConnectionDialogState = {
  kind: "app" | "plugin";
  id: string;
  name: string;
  description: string;
  installUrl?: string;
  iconUrl?: string;
  accountEmail?: string;
};

type ImageAnnotationEditorState =
  | { source: "file"; attachmentId: string }
  | { source: "conversation"; messageId: string; imageIndex: number; name: string; dataUrl: string };

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SmokeAttachmentSeed = {
  name: string;
  mimeType: string;
  base64: string;
  lastModified?: number;
};

type OnlineImagePromptExtraction = {
  imageUrl: string;
  alt?: string;
  pageTitle?: string;
  pageUrl?: string;
  attachment?: UserFileAttachment;
};

type SidepanelBridgeEvent = {
  type: string;
  itemId?: string;
  delta?: string;
  text?: string;
  previewRef?: string;
  alt?: string;
  sdp?: string;
  role?: string;
  item?: Record<string, unknown>;
  sessionId?: string | null;
  transport?: "webrtc" | "websocket";
  audio?: RealtimeOutputAudioChunk;
  message?: string;
  reason?: string | null;
  threadId?: string;
  turnId?: string;
  activeTurn?: CodexActiveTurn;
  phase?: PromptActivityPhase;
  clientRequestId?: string;
  workflow?: unknown;
  imageIndex?: unknown;
  attempt?: number;
  maxAttempts?: number;
  rateLimits?: CodexRateLimits | null;
  plan?: CodexTurnPlan;
  diff?: CodexTurnDiff;
  reroute?: CodexModelReroute;
  kind?: ConversationMessageTraceItem["kind"];
  title?: string;
  detail?: string;
  status?: "running" | "completed";
  timestampMs?: number;
  conversationId?: string;
};

type PendingVoiceAnswer = {
  resolve: (sdp: string) => void;
  reject: (error: Error) => void;
  timeoutId: number;
  threadId?: string;
};

type PendingVoiceStart = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: number;
  threadId?: string;
};

type RealtimeVoiceTransport = "webrtc" | "websocket" | "browser-speech";
type VoiceRecognitionMode = "live" | "composer";

type RealtimeOutputAudioChunk = {
  data?: unknown;
  sampleRate?: unknown;
  sample_rate?: unknown;
  numChannels?: unknown;
  num_channels?: unknown;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
    webkitAudioContext?: typeof AudioContext;
    __CODEX_SIDEPANEL_SMOKE_SEEK_MESSAGES__?: Array<Record<string, unknown>>;
    __CODEX_SIDEPANEL_SMOKE__?: {
      waitForComposer(timeoutMs?: number): Promise<void>;
      injectFiles(files: SmokeAttachmentSeed[]): Promise<string[]>;
      injectImageAnnotationReferenceFiles(files: SmokeAttachmentSeed[]): Promise<string[]>;
      enableDryRunSubmit(): void;
      submitWithEnter(text: string): Promise<{
        submissionCount: number;
        lastSubmission: string | null;
        composerValue: string | null;
      }>;
      typeIntoComposer(text: string): {
        sameNode: boolean;
        activeId: string | null;
        value: string | null;
      };
      inspectCommandPopoverForTest(text: string): {
        mentionQuery: string | null;
        slashQuery: string | null;
        suggestionCount: number;
        tabSuggestionCount: number;
        slashSuggestionCount: number;
        popoverText: string;
        activeId: string | null;
        composerValue: string | null;
        shellOverflow: string;
      };
      simulateActiveTabUpdateForTest(input: {
        title: string;
        url: string;
        actionCards: Pick<ActionCard, "id" | "title" | "description" | "kind" | "prompt">[];
      }): {
        currentTabTitle: string;
        actionCardCount: number;
        suggestionCount: number;
        firstSuggestionTitle: string;
        suggestionTitles: string[];
      };
      selectProfileForTest(profileId: string): {
        selectedProfileId: string;
        suggestionCount: number;
        firstSuggestionTitle: string;
        suggestionTitles: string[];
      };
      preserveComposerFocusOnRender(): {
        activeId: string | null;
        value: string | null;
      };
      setPromptActivityForTest(active: boolean): {
        sendButtonDisabled: boolean;
        stopButtonVisible: boolean;
        promptActivityVisible: boolean;
        promptActivityRailVisible: boolean;
      };
      setActiveTurnForTest(active: boolean): {
        sendButtonVisible: boolean;
        stopButtonVisible: boolean;
        stopButtonInSubmitSlot: boolean;
        stopButtonHasSquareIcon: boolean;
      };
      setPendingPermissionForTest(): {
        hasPrompt: boolean;
        hasButton: boolean;
      };
      setModelCatalogForTest(input: {
        models: CodexModelOption[];
        selectedModel: string;
        selectedReasoningEffort?: string;
        selectedServiceTier?: string;
      }): {
        selectedModel: string;
        selectedReasoningEffort: string;
        selectedServiceTier: string;
      };
      getDryRunSubmissions(): string[];
      setView(view: MainView): string;
      snapshot(): {
        activeView: MainView;
        actionStatus: string;
        modelLabel: string;
        fileChipLabels: string[];
        messageCount: number;
      };
      seedChatFixture(input: {
        messages: ConversationMessage[];
        actionCards?: Pick<ActionCard, "id" | "title" | "description" | "kind" | "prompt">[];
      }): {
        activeView: MainView;
        messageCount: number;
      };
      scrollChatBy(offset: number): {
        hasScrollableArea: boolean;
        before: number;
        after: number;
      };
    };
  }
}

const query = new URLSearchParams(window.location.search);
const panelMode = query.get("mode") === "popup" ? "popup" : "sidepanel";
const targetWindowId = Number(query.get("targetWindowId") || "") || undefined;
const smokeTestMode = query.get("test") === "1";
const MAX_VOICE_RECONNECT_ATTEMPTS = 2;
const STREAMING_DELTA_RENDER_INTERVAL_MS = 80;
const CHAT_SCROLL_USER_OVERRIDE_MS = 800;
const PROFILE_EDITOR_COLORS = [
  "#ffffff",
  "#ff5f67",
  "#ff8848",
  "#ffd44a",
  "#43c878",
  "#3998f5",
  "#9b6bf2",
  "#f176b7",
] as const;
const PROFILE_EDITOR_ICONS = [
  "folder",
  "dollar",
  "book",
  "graduation",
  "pencil",
  "pen",
  "code",
  "terminal",
  "music",
  "popcorn",
  "brush",
  "palette",
  "stethoscope",
  "spark",
  "lotus",
  "briefcase",
  "chart",
  "ring",
  "dumbbell",
  "notebook",
  "scale",
  "mic",
  "plane",
  "globe",
  "wrench",
  "paw",
  "flask",
  "brain",
  "heart",
  "plant",
] as const;
const DEFAULT_PROFILE_VISUAL_COLOR = "#8b5cf6";
const DEFAULT_PROFILE_VISUAL_ICON = DEFAULT_PROFILE_ICON_ID;
const MAX_PROFILE_IMAGE_BYTES = 180_000;
const EXTERNAL_IMAGE_PREVIEW_OBJECT_URL_REVOKE_MS = 60_000;
const EMPTY_ASSISTANT_RESPONSE_NOTICE_DELAY_MS = 900;
const autoSavedImageAssetRefs = new Set<string>();
const pendingImageWorkflowMessageIdsByRequest = new Map<string, string>();
const completedImageWorkflowMessageIdsByRequest = new Map<string, string>();
const streamedImagePreviewRefsByRequest = new Map<string, string[]>();
const promptRequestConversationIds = new Map<string, string>();
const conversationMessagesById = new Map<string, ConversationMessage[]>();
const conversationThreadIdsById = new Map<string, string>();
const conversationProfilesById = new Map<string, string>();
const conversationModelsById = new Map<string, string | undefined>();
const promptActivitiesByConversationId = new Map<string, PromptActivityState>();
const activePromptUserMessageIdsByConversationId = new Map<string, string>();
const activeTurnsByConversationId = new Map<string, CodexActiveTurn>();
const streamingAssistantMessageIdsByConversationId = new Map<string, Set<string>>();
const contextCompactionNoticeIdsByKey = new Map<string, string>();
const messageTraceOpenByMessageId = new Map<string, boolean>();
const assistantResponseMessageIdsByGroupKey = new Map<string, string>();
const assistantResponseGroupKeysByItemId = new Map<string, string>();
const assistantResponseGroupKeysByTurnKey = new Map<string, string>();
const assistantResponseItemOrderByMessageId = new Map<string, string[]>();
const assistantResponseItemTextsByMessageId = new Map<string, Map<string, string>>();
const unresolvedConversationBridgeEventsByThreadId = new Map<string, SidepanelBridgeEvent[]>();
const pendingEmptyAssistantResponseNoticeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const profileQuestionStreamBuffers = new Map<string, string>();
let profileQuestionCardRenderRequested = false;
let contextCompactionNoticeCounter = 0;
const MAX_UNRESOLVED_CONVERSATION_BRIDGE_EVENTS_PER_THREAD = 200;

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) {
  throw new Error("Missing #app root");
}
const root: HTMLDivElement = rootElement;
const initialLocale = detectUiLocale(getBrowserUiLanguage());

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

const state = {
  accountStatus: null as UiInitPayload["accountStatus"] | null,
  currentPageSupport: {
    available: true,
    blockedReason: "",
  } as UiInitPayload["currentPageSupport"],
  currentTabReference: null as OpenTabContext | null,
  models: [] as CodexModelOption[],
  profiles: [] as ProfileTemplate[],
  selectedProfileId: "default",
  selectedModel: "",
  selectedReasoningEffort: "",
  selectedServiceTier: "",
  modelCatalogState: "loading" as UiInitPayload["modelCatalogState"],
  modelCatalogErrorMessage: "",
  runtimeConfig: {
    workspaceRoot: "",
    codexBinPath: "",
    resolvedCodexBinPath: "",
    codexBinSource: "missing",
    configuredCodexBinPathInvalid: false,
  } as UiInitPayload["runtimeConfig"],
  playwrightRuntime: createFallbackPlaywrightRuntime(),
  imageAssetFolder: {
    rootDir: "",
    latestFolder: "",
    folders: [],
    assetCount: 0,
  } as UiInitPayload["imageAssetFolder"],
  diagnosticLogFolder: {
    rootDir: "",
    latestLogPath: "",
    files: [],
  } as UiInitPayload["diagnosticLogFolder"],
  actionCards: [] as ActionCard[],
  currentReadStrategy: "auto" as ReadStrategy | "auto",
  attachments: new Set<PromptRequestPayload["attachments"][number]>(),
  fileAttachments: [] as UserFileAttachment[],
  imageAnnotationReferenceAttachments: [] as UserFileAttachment[],
  imageAnnotationEditor: null as null | ImageAnnotationEditorState,
  profileEditor: null as null | ProfileEditorState,
  nativeTextDialog: null as null | NativeTextDialogState,
  nativeConfirmationDialog: null as null | NativeConfirmationDialogState,
  pluginConnectionDialog: null as null | PluginConnectionDialogState,
  pendingProfileQuestion: null as PendingProfileQuestionState | null,
  selectedTabIds: [] as number[],
  openTabOptions: [] as OpenTabContext[],
  openTabOptionsState: "idle" as "idle" | "loading" | "ready" | "permission" | "error",
  openTabOptionsError: "",
  historyQuery: "",
  historyItems: [] as Array<{ title: string; url: string }>,
  messages: [] as ConversationMessage[],
  chatMessageWindowSize: DEFAULT_CHAT_MESSAGE_WINDOW_SIZE,
  editingMessageId: null as string | null,
  mentionQuery: null as string | null,
  mentionActiveIndex: 0,
  slashQuery: null as string | null,
  slashActiveIndex: 0,
  voiceEnabled: false,
  voiceInputActive: false,
  liveCaption: "",
  composerDraft: "",
  composerCommandPills: [] as ComposerCommandPill[],
  composerDragActive: false,
  attachmentMenuOpen: false,
  browserActionPermissionMenuOpen: false,
  composerModelMenuOpen: false,
  appMenuOpen: false,
  appMenuRecentChatLimit: APP_MENU_RECENT_CHAT_LIMIT,
  settings: {
    uiLanguage: "auto",
    uiTheme: "system",
    usageNoticeAccepted: false,
    shareCurrentTabByDefault: false,
    rememberChats: false,
    liveCaptions: true,
    allowVoiceNavigation: true,
    allowBrowserActions: true,
    browserActionPermissionMode: "ask",
    playwrightBrowserControlEnabled: false,
    preferredVoice: "",
    workspaceRoot: "",
    codexBinPath: "",
    enabledCodexSkillIds: [],
    autoCompactConversations: true,
    customSiteSuggestions: [],
  } as ExtensionSettings,
  composerSelectionStart: 0,
  composerSelectionEnd: 0,
  workspaceHarness: null as UiInitPayload["workspaceHarness"] | null,
  appServerSkills: [] as CodexSkillOption[],
  connectedApps: [] as CodexAppOption[],
  appServerPlugins: [] as CodexPluginOption[],
  mcpServers: [] as CodexMcpServerOption[],
  recentChats: [] as ConversationSummary[],
  serverThreads: [] as CodexThreadSummary[],
  currentConversationId: "",
  threadId: "",
  activePromptUserMessageId: "",
  currentTabContextDismissedKey: "",
  structuredInputs: [] as CodexStructuredInput[],
  activeTurn: null as CodexActiveTurn | null,
  promptActivity: null as PromptActivityState | null,
  streamingAssistantMessageIds: new Set<string>(),
  rateLimits: null as CodexRateLimits | null,
  latestPlan: null as CodexTurnPlan | null,
  latestDiff: null as CodexTurnDiff | null,
  latestReroute: null as CodexModelReroute | null,
  voiceOptions: listCodexRealtimeVoiceOptions(),
  initError: "",
  actionStatus: "",
  copiedMessageId: "",
  pendingPermission: null as {
    plan: PermissionRequestPlan;
    errorMessage: string;
    retryMessage?: string;
  } | null,
  pendingAction: "" as "" | "voice" | "image-edit",
  uiLocale: initialLocale as UiLocale,
  activeView: "chat" as MainView,
};

let recognition: InstanceType<SpeechRecognitionCtor> | null = null;
let voiceRecognitionMode: VoiceRecognitionMode | null = null;
let realtimeVoicePeer: RTCPeerConnection | null = null;
let realtimeVoiceStream: MediaStream | null = null;
let realtimeVoiceAudio: HTMLAudioElement | null = null;
let realtimeVoiceThreadId: string | null = null;
let realtimeVoiceTransport: RealtimeVoiceTransport | null = null;
let realtimeOutputAudioContext: AudioContext | null = null;
let realtimeOutputAudioNextTime = 0;
const realtimeOutputAudioSources = new Set<AudioBufferSourceNode>();
let realtimeOutputSuppressedUntil = 0;
let realtimeInputAudioContext: AudioContext | null = null;
let realtimeInputAudioSource: MediaStreamAudioSourceNode | null = null;
let realtimeInputAudioWorkletNode: AudioWorkletNode | null = null;
let realtimeInputAudioSamples: number[] = [];
let realtimeAudioSendChain: Promise<void> = Promise.resolve();
let notificationAutoDismissTimer: number | null = null;
let notificationAutoDismissSignature = "";
let copiedMessageResetTimer: number | null = null;
let pendingVoiceAnswer: PendingVoiceAnswer | null = null;
let pendingVoiceStart: PendingVoiceStart | null = null;
let realtimeVoiceContextSnapshotPromise: Promise<string> | null = null;
let realtimeVoiceContextSnapshotPrompt = "";
let realtimeVoiceContextSnapshotCapturedAt = 0;
let composerVoiceInputStream: MediaStream | null = null;
let composerVoiceInputAudioContext: AudioContext | null = null;
let composerVoiceInputAudioSource: MediaStreamAudioSourceNode | null = null;
let composerVoiceInputAnalyser: AnalyserNode | null = null;
let composerVoiceInputWaveformTimer: number | null = null;
let composerVoiceInputWaveformLevels = createSilentComposerVoiceWaveform();
let composerVoiceInputAudioData: Uint8Array<ArrayBuffer> | null = null;
let systemThemeMediaQuery: MediaQueryList | null = null;
let systemThemeListenerInstalled = false;
let composerDropHandlersInstalled = false;
let composerVoiceInputFinalTranscript = "";
let composerVoiceInputInterimTranscript = "";
let composerVoiceInputCommitPromise: Promise<void> | null = null;
let microphonePermissionWindowPromise: Promise<{
  result: MicrophonePermissionWindowResult;
  message?: string;
}> | null = null;
let voiceStartPromise: Promise<void> | null = null;
let browserVoiceFallbackActive = false;
let voiceReconnectTimer: number | null = null;
let voiceReconnectAttempts = 0;
let voiceStopRequested = false;
let voiceTranscriptMessageCounter = 0;
let realtimeBargeInHighRmsFrames = 0;
let voiceDurationTicker: number | null = null;
let voiceDurationNow = Date.now();
let liveVoiceRecognitionUtteranceStartedAt: number | null = null;
const voiceTranscriptMirror = createVoiceTranscriptMirrorState();
let nativeConfirmationResolver: ((approved: boolean) => void) | null = null;
let initializePromise: Promise<void> | null = null;
let initializeQueued = false;
let initializeQueuedForceCatalog = false;
let pendingPluginConnectionCatalogRefresh = false;
let composerCompositionInProgress = false;
let composerCompositionStartDraft = "";
let renderDeferredDuringComposerComposition = false;
let smokeDryRunSubmissions: string[] = [];
let promptSubmissionBootstrapInFlight = false;
let chatScrollUserOverrideUntil = 0;
let pendingChatScrollToBottom = false;
let pendingChatScrollAnchor: { previousScrollTop: number; previousScrollHeight: number } | null = null;
let lastRenderedActiveView: MainView | null = null;
const completedTurnIds = new Set<string>();
const cancelledPromptRequestIds = new Set<string>();
const REALTIME_AUDIO_CHUNK_MS = 240;
const REALTIME_BARGE_IN_RMS_THRESHOLD = 0.075;
const REALTIME_BARGE_IN_REQUIRED_AUDIO_FRAMES = 6;
const REALTIME_BARGE_IN_SUPPRESSION_MS = 220;
const REALTIME_VOICE_CONTEXT_SNAPSHOT_TTL_MS = 5000;
const COMPOSER_VOICE_WAVEFORM_BAR_COUNT = 46;
const COMPOSER_VOICE_WAVEFORM_REFRESH_MS = 90;
const COMPOSER_VOICE_STOP_FINALIZATION_TIMEOUT_MS = 1500;
type ComposerTextareaAutosizeMetrics = {
  lineHeight: number;
  paddingTop: number;
  paddingBottom: number;
  minHeight: number;
};
const composerTextareaAutosizeMetricsByElement = new WeakMap<
  HTMLTextAreaElement,
  ComposerTextareaAutosizeMetrics
>();
const renderBatcher = createRenderBatcher(
  () => renderNow(),
  (callback) =>
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(() => callback())
      : window.setTimeout(callback, 16),
  (handle) =>
    typeof window.cancelAnimationFrame === "function"
      ? window.cancelAnimationFrame(handle)
      : window.clearTimeout(handle),
);
const streamingDeltaBuffer = createStreamingDeltaBuffer(
  (batch) => {
    const messageIds: string[] = [];
    for (const item of batch) {
      const messageId = upsertAssistantMessage(item.itemId, item.delta, true);
      if (messageId) {
        messageIds.push(messageId);
      }
    }
    if (state.activeView === "chat") {
      if (profileQuestionCardRenderRequested) {
        profileQuestionCardRenderRequested = false;
        render();
      } else if (!patchStreamingAssistantMessageDoms(messageIds)) {
        render();
      }
    }
  },
  (callback) => window.setTimeout(callback, STREAMING_DELTA_RENDER_INTERVAL_MS),
  window.clearTimeout.bind(window),
);
const persistConversationBatch = createDebouncedTask(
  () => persistConversation(),
  180,
  window.setTimeout.bind(window),
  window.clearTimeout.bind(window),
);
let conversationPersistFlushQueue = Promise.resolve();

installSmokeHarness();
installGlobalFloatingSurfaceDismissal();
renderSync();
void scheduleInitialize();

window.addEventListener("pagehide", () => {
  flushStreamingAssistantDeltas();
  void persistConversationBatch.flush();
  voiceStopRequested = true;
  cancelVoiceReconnect();
  void stopRealtimeVoiceSession({ notifyBridge: true });
});

window.addEventListener("focus", () => {
  void refreshPendingPluginConnectionCatalog();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void refreshPendingPluginConnectionCatalog();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  state.initError = toUserFacingRuntimeError(event.reason);
  render();
  event.preventDefault();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "ui.active-tab.updated") {
    applyActiveTabUpdate(message);
    return;
  }

  if (message.type === "ui.image-prompt.extract") {
    void handleOnlineImagePromptExtraction(message.extraction);
    return;
  }

  if (message.type === "ui.image-prompt.error") {
    void handleOnlineImagePromptError(message.error);
    return;
  }

  if (message.type === "ui.image-attachment.pending") {
    void takePendingContextMenuImageAttachment();
    return;
  }

  if (message.type === "ui.context-menu-action.pending") {
    void takePendingContextMenuAction();
    return;
  }

  if (message.type !== "bridge.event") {
    return;
  }

  const event = message.event as SidepanelBridgeEvent;
  let shouldRender = false;
  const eventConversationId = resolveBridgeEventConversationId(event);
  const unresolvedEventBelongsToCurrentConversation = shouldTreatUnresolvedBridgeEventAsCurrent(event, eventConversationId);
  if (unresolvedEventBelongsToCurrentConversation) {
    rememberCurrentConversationThreadForBridgeEvent(event);
  }
  const isCurrentConversationEvent =
    unresolvedEventBelongsToCurrentConversation || isBridgeEventForCurrentConversation(eventConversationId, event.type);
  if (
    !unresolvedEventBelongsToCurrentConversation &&
    shouldDropUnresolvedConversationScopedBridgeEvent(event.type, eventConversationId)
  ) {
    bufferUnresolvedConversationScopedBridgeEvent(event);
    return;
  }

  if (event.type === "message.delta") {
    cancelEmptyAssistantResponseNotice(event.threadId ?? "", event.turnId ?? "", eventConversationId);
    if (!isCurrentConversationEvent) {
      if (eventConversationId) {
        const itemId = event.itemId ?? "assistant";
        upsertAssistantMessageForConversation(eventConversationId, itemId, event.delta ?? "", true);
        const streamingIds = streamingAssistantMessageIdsByConversationId.get(eventConversationId) ?? new Set<string>();
        streamingIds.add(itemId);
        streamingAssistantMessageIdsByConversationId.set(eventConversationId, streamingIds);
        renderConversationListIfVisible();
      }
      return;
    }
    const itemId = event.itemId ?? "assistant";
    const previousPromptActivity = state.promptActivity;
    state.promptActivity = promotePromptActivityForAssistantProgress({
      current: state.promptActivity,
      activeTurn: state.activeTurn,
    }) ?? {
      clientRequestId: `stream:${itemId}`,
      phase: "responding",
    };
    state.streamingAssistantMessageIds.add(resolveAssistantResponseMessageId(itemId, event));
    if (state.promptActivity !== previousPromptActivity) {
      shouldRender = state.activeView === "chat";
    }
    streamingDeltaBuffer.push(itemId, event.delta ?? "");
  }
  if (event.type === "message.completed") {
    const itemId = event.itemId ?? "assistant";
    cancelEmptyAssistantResponseNotice(event.threadId ?? "", event.turnId ?? "", eventConversationId);
    if (!isCurrentConversationEvent && eventConversationId) {
      upsertAssistantMessageForConversation(eventConversationId, itemId, event.text ?? "", false);
      clearEmptyAssistantResponseNoticeForTurn(event.threadId ?? "", event.turnId ?? "", eventConversationId);
      clearResolvedEmptyAssistantResponseNotices(getDetachedConversationMessages(eventConversationId));
      completeTurnTraceForConversation(eventConversationId, event.threadId ?? "", event.turnId ?? "");
      clearConversationActivity(eventConversationId);
      renderConversationListIfVisible();
      void persistDetachedConversation(eventConversationId);
      return;
    }
    const messageId = resolveAssistantResponseMessageId(itemId, event);
    flushStreamingAssistantDeltas();
    if (
      shouldClearPromptActivityOnMessageCompleted({
        current: state.promptActivity,
        activeTurn: state.activeTurn,
      })
    ) {
      state.promptActivity = null;
    }
    markActiveTurnTraceItemsCompleted();
    if ((event.text ?? "").length > 0 || !state.messages.some((message) => message.id === messageId)) {
      upsertAssistantMessage(itemId, event.text ?? "", false, event);
    }
    clearEmptyAssistantResponseNoticeForTurn(event.threadId ?? "", event.turnId ?? "", eventConversationId);
    clearResolvedEmptyAssistantResponseNotices(state.messages);
    if (!state.promptActivity && !state.activeTurn?.turnId) {
      state.streamingAssistantMessageIds.delete(messageId);
    }
    if (state.voiceEnabled && browserVoiceFallbackActive) {
      speak(event.text ?? "");
    }
    scheduleConversationPersist();
    flushConversationPersist();
    shouldRender = state.activeView === "chat";
  }
  if (event.type === "message.image" && event.previewRef) {
    cancelEmptyAssistantResponseNotice(event.threadId ?? "", event.turnId ?? "", eventConversationId);
    clearEmptyAssistantResponseNoticeForTurn(event.threadId ?? "", event.turnId ?? "", eventConversationId);
    if (!isCurrentConversationEvent && eventConversationId) {
      renderConversationListIfVisible();
      void hydrateImageForDetachedConversation({
        conversationId: eventConversationId,
        itemId: event.itemId ?? `generated-image-${Date.now()}`,
        previewRef: event.previewRef,
        alt: event.alt ?? stringsForState().images.generated,
      });
      return;
    }
    flushStreamingAssistantDeltas();
    const workflow = normalizeImageGenerateWorkflow(event.workflow);
    const imageIndex = Number(event.imageIndex);
    void handleBridgeImageEvent({
      itemId: event.itemId ?? `generated-image-${Date.now()}`,
      previewRef: event.previewRef,
      alt: event.alt ?? stringsForState().images.generated,
      ...(typeof event.clientRequestId === "string" ? { clientRequestId: event.clientRequestId } : {}),
      ...(workflow ? { workflow } : {}),
      ...(Number.isFinite(imageIndex) ? { imageIndex } : {}),
    });
    return;
  }
  if (event.type === "prompt.retrying") {
    if (!isCurrentConversationEvent && eventConversationId) {
      promptActivitiesByConversationId.set(eventConversationId, {
        clientRequestId: event.clientRequestId ?? "",
        phase: "reconnecting",
        retryAttempt: Math.max(1, Math.floor(Number(event.attempt) || 1)),
        retryMax: Math.max(1, Math.floor(Number(event.maxAttempts) || 5)),
        retryReason: event.reason ?? "",
      });
      renderConversationListIfVisible();
      return;
    }
    if (!state.promptActivity || !event.clientRequestId || state.promptActivity.clientRequestId === event.clientRequestId) {
      streamingDeltaBuffer.clear();
      profileQuestionStreamBuffers.clear();
      profileQuestionCardRenderRequested = false;
      state.messages = state.messages.filter((message) => !state.streamingAssistantMessageIds.has(message.id));
      state.streamingAssistantMessageIds.clear();
      state.activeTurn = null;
      state.promptActivity = {
        clientRequestId: event.clientRequestId ?? state.promptActivity?.clientRequestId ?? "",
        phase: "reconnecting",
        retryAttempt: Math.max(1, Math.floor(Number(event.attempt) || 1)),
        retryMax: Math.max(1, Math.floor(Number(event.maxAttempts) || 5)),
        retryReason: event.reason ?? "",
      };
      shouldRender = state.activeView === "chat";
    }
  }
  if (event.type === "voice.sdp" && event.sdp) {
    completeRealtimeVoiceHandshake(event.threadId, event.sdp);
    return;
  }
  if (event.type === "voice.output_audio.delta") {
    void playRealtimeOutputAudio(event.audio as RealtimeOutputAudioChunk);
    return;
  }
  if (event.type === "voice.session.started") {
    activateRealtimeVoiceSession({
      ...(event.threadId ? { threadId: event.threadId } : {}),
      transport: event.transport ?? realtimeVoiceTransport,
    });
    completeRealtimeVoiceStarted(event.threadId);
    shouldRender = true;
  }
  if (event.type === "voice.transcript.delta" && event.delta) {
    if (!shouldMirrorRealtimeTranscriptEvent(event.role)) {
      return;
    }
    if (state.settings.liveCaptions) {
      const mirrored = applyVoiceTranscriptDelta({
        messages: state.messages,
        mirror: voiceTranscriptMirror,
        role: event.role,
        delta: event.delta,
        threadId: event.threadId,
        createId: () => createVoiceTranscriptMessageId(event.role),
      });
      state.liveCaption = mirrored.liveCaption;
    } else {
      state.liveCaption = "";
    }
    shouldRender = state.activeView === "chat";
  }
  if (event.type === "voice.transcript.done") {
    if (!shouldMirrorRealtimeTranscriptEvent(event.role)) {
      return;
    }
    if (state.settings.liveCaptions) {
      const mirrored = applyVoiceTranscriptDone({
        messages: state.messages,
        mirror: voiceTranscriptMirror,
        role: event.role,
        text: event.text ?? "",
        threadId: event.threadId,
        createId: () => createVoiceTranscriptMessageId(event.role),
      });
      state.liveCaption = mirrored.liveCaption;
      scheduleConversationPersist();
    } else {
      state.liveCaption = "";
    }
    shouldRender = state.activeView === "chat";
  }
  if (event.type === "voice.item_added") {
    void handleRealtimeVoiceItemAdded(event.item, event.threadId);
    return;
  }
  if (event.type === "voice.error") {
    handleRealtimeVoiceDisconnect(event.message ?? getUiStrings(state.uiLocale).errors.voiceUpdate, true);
    shouldRender = true;
  }
  if (event.type === "voice.session.stopped") {
    handleRealtimeVoiceDisconnect(
      "reason" in event && event.reason ? String(event.reason) : null,
      false,
    );
    shouldRender = true;
  }
  if (event.type === "turn.completed" && event.threadId) {
    if (!isCurrentConversationEvent && eventConversationId) {
      completeTurnTraceForConversation(eventConversationId, event.threadId, event.turnId ?? "");
      scheduleEmptyAssistantResponseNotice({
        conversationId: eventConversationId,
        threadId: event.threadId,
        turnId: event.turnId ?? "",
        activeUserMessageId: activePromptUserMessageIdsByConversationId.get(eventConversationId) ?? null,
      });
      activeTurnsByConversationId.delete(eventConversationId);
      promptActivitiesByConversationId.delete(eventConversationId);
      activePromptUserMessageIdsByConversationId.delete(eventConversationId);
      streamingAssistantMessageIdsByConversationId.delete(eventConversationId);
      rememberConversationThreadId(eventConversationId, event.threadId);
      renderConversationListIfVisible();
      void persistDetachedConversation(eventConversationId);
      return;
    }
    flushStreamingAssistantDeltas();
    completeTurnTrace(event.threadId, event.turnId ?? "");
    scheduleEmptyAssistantResponseNotice({
      conversationId: state.currentConversationId || null,
      threadId: event.threadId,
      turnId: event.turnId ?? "",
      activeUserMessageId: state.activePromptUserMessageId || null,
    });
    if (
      shouldClearPromptActivityOnTurnCompleted({
        current: state.promptActivity,
        activeTurn: state.activeTurn,
        completedTurnId: event.turnId,
      })
    ) {
      state.promptActivity = null;
    }
    state.streamingAssistantMessageIds.clear();
    state.threadId = event.threadId;
    if (event.turnId) {
      completedTurnIds.add(event.turnId);
    }
    const completedCurrentPromptAnchor = !state.activeTurn?.turnId || !event.turnId || state.activeTurn.turnId === event.turnId;
    if (completedCurrentPromptAnchor) {
      clearActivePromptUserMessageId();
    }
    if (state.activeTurn?.turnId === event.turnId) {
      state.activeTurn = null;
    }
    scheduleConversationPersist();
    flushConversationPersist();
    shouldRender = true;
  }
  if (event.type === "turn.started" && event.activeTurn) {
    if (!isCurrentConversationEvent && eventConversationId) {
      activeTurnsByConversationId.set(eventConversationId, event.activeTurn);
      rememberConversationThreadId(eventConversationId, event.activeTurn.threadId);
      const activity = promotePromptActivityForAssistantProgress({
        current: promptActivitiesByConversationId.get(eventConversationId) ?? null,
        activeTurn: event.activeTurn,
      });
      if (activity) {
        promptActivitiesByConversationId.set(eventConversationId, activity);
      } else {
        promptActivitiesByConversationId.delete(eventConversationId);
      }
      renderConversationListIfVisible();
      return;
    }
    state.activeTurn = event.activeTurn;
    rememberAssistantResponseTurnGroup(event.activeTurn);
    state.promptActivity = promotePromptActivityForAssistantProgress({
      current: state.promptActivity,
      activeTurn: state.activeTurn,
    });
    shouldRender = true;
  }
  if (event.type === "prompt.status" && event.phase) {
    const eventClientRequestId = normalizePromptStatusClientRequestId(event.clientRequestId);
    const resolvedClientRequestId = resolvePromptStatusClientRequestId(eventClientRequestId);
    if (!isCurrentConversationEvent && eventConversationId) {
      promptActivitiesByConversationId.set(eventConversationId, {
        clientRequestId: resolvedClientRequestId,
        phase: event.phase,
      });
      renderConversationListIfVisible();
      return;
    }
    if (event.phase === "compacting") {
      upsertContextCompactionNotice(
        createContextCompactionNoticeKey(resolvedClientRequestId ? { clientRequestId: resolvedClientRequestId } : {}),
        "running",
      );
      scheduleConversationPersist();
      shouldRender = state.activeView === "chat";
    } else if (
      isImageWorkflowPromptActivityPhase(event.phase) &&
      (!resolvedClientRequestId || !isPromptStatusForActiveRequest(eventClientRequestId, resolvedClientRequestId))
    ) {
      // Image placeholders are bound to a concrete prompt. Ignore stale or anonymous
      // image status events so a previous image turn cannot leak into a text answer.
    } else if (!state.promptActivity || !eventClientRequestId || state.promptActivity.clientRequestId === eventClientRequestId) {
      state.promptActivity = {
        clientRequestId: resolvedClientRequestId,
        phase: event.phase,
      };
      if (isImageWorkflowPromptActivityPhase(event.phase)) {
        ensurePendingImageWorkflowMessage(
          state.promptActivity.clientRequestId,
          normalizePromptStatusImageWorkflow(event.workflow) ?? "image-edit",
        );
      }
      shouldRender = state.activeView === "chat";
    }
  }
  if (event.type === "context.compaction.started") {
    if (!isCurrentConversationEvent) {
      renderConversationListIfVisible();
      return;
    }
    upsertContextCompactionNotice(createContextCompactionNoticeKey(event), "running");
    scheduleConversationPersist();
    shouldRender = state.activeView === "chat";
  }
  if (event.type === "context.compaction.completed") {
    if (!isCurrentConversationEvent) {
      renderConversationListIfVisible();
      return;
    }
    if (state.promptActivity?.phase === "compacting") {
      state.promptActivity = null;
    }
    upsertContextCompactionNotice(createContextCompactionNoticeKey(event), "completed");
    state.actionStatus = getUiStrings(state.uiLocale).status.compactCompleted;
    scheduleConversationPersist();
    shouldRender = state.activeView === "chat";
  }
  if (event.type === "turn.activity" && event.threadId && event.turnId) {
    if (!isCurrentConversationEvent && eventConversationId) {
      activeTurnsByConversationId.set(eventConversationId, {
        threadId: event.threadId,
        turnId: event.turnId,
      });
      rememberConversationThreadId(eventConversationId, event.threadId);
      upsertTurnActivityTraceForConversation(eventConversationId, {
        threadId: event.threadId,
        turnId: event.turnId,
        itemId: event.itemId ?? `activity-${Date.now()}`,
        kind: normalizeTraceEventKind(event.kind),
        title: event.title ?? "",
        detail: event.detail ?? "",
        status: event.status === "completed" ? "completed" : "running",
        timestampMs: Number.isFinite(event.timestampMs) ? Number(event.timestampMs) : Date.now(),
      });
      renderConversationListIfVisible();
      return;
    }
    if (!completedTurnIds.has(event.turnId)) {
      if (!state.activeTurn || state.activeTurn.turnId !== event.turnId) {
        state.activeTurn = {
          threadId: event.threadId,
          turnId: event.turnId,
        };
      }
      rememberAssistantResponseTurnGroup(state.activeTurn);
      state.promptActivity = promotePromptActivityForTurnActivity({
        current: state.promptActivity,
        activeTurn: state.activeTurn,
        kind: event.kind,
        status: event.status === "completed" ? "completed" : "running",
      });
      if (event.kind === "image" && state.promptActivity?.clientRequestId) {
        ensurePendingImageWorkflowMessage(state.promptActivity.clientRequestId, "generated-image");
      }
    }
    upsertTurnActivityTrace({
      threadId: event.threadId,
      turnId: event.turnId,
      itemId: event.itemId ?? `activity-${Date.now()}`,
      kind: normalizeTraceEventKind(event.kind),
      title: event.title ?? "",
      detail: event.detail ?? "",
      status: completedTurnIds.has(event.turnId) || event.status === "completed" ? "completed" : "running",
      timestampMs: Number.isFinite(event.timestampMs) ? Number(event.timestampMs) : Date.now(),
    });
    shouldRender = state.activeView === "chat";
  }
  if (event.type === "turn.plan.updated" && event.plan) {
    if (!isCurrentConversationEvent) {
      if (eventConversationId) {
        rememberConversationThreadId(eventConversationId, event.plan.threadId);
        upsertTurnPlanTraceForConversation(eventConversationId, event.plan);
      }
      renderConversationListIfVisible();
      return;
    }
    state.latestPlan = event.plan;
    upsertTurnPlanTrace(event.plan);
    shouldRender = state.activeView === "workspace" || state.activeView === "chat";
  }
  if (event.type === "turn.diff.updated" && event.diff) {
    if (!isCurrentConversationEvent) {
      if (eventConversationId) {
        rememberConversationThreadId(eventConversationId, event.diff.threadId);
        upsertTurnDiffTraceForConversation(eventConversationId, event.diff);
      }
      renderConversationListIfVisible();
      return;
    }
    state.latestDiff = event.diff;
    upsertTurnDiffTrace(event.diff);
    shouldRender = state.activeView === "workspace" || state.activeView === "chat";
  }
  if (event.type === "account.rate_limits.updated") {
    state.rateLimits = event.rateLimits ?? null;
    shouldRender = state.activeView === "workspace";
  }
  if (event.type === "model.rerouted" && event.reroute) {
    if (!isCurrentConversationEvent) {
      renderConversationListIfVisible();
      return;
    }
    state.latestReroute = event.reroute;
    shouldRender = state.activeView !== "context";
  }
  if (event.type === "catalog.updated") {
    if (!initializePromise) {
      void scheduleInitialize();
    }
    return;
  }
  if (event.type === "account.updated" || event.type === "account.login.completed") {
    void scheduleInitialize();
    return;
  }
  if (shouldRender) {
    render();
  }
});

function applyActiveTabUpdate(message: {
  currentPageSupport?: UiInitPayload["currentPageSupport"];
  currentTab?: OpenTabContext | null;
  actionCards?: ActionCard[];
}): void {
  state.currentPageSupport = message.currentPageSupport ?? state.currentPageSupport;
  state.currentTabReference = message.currentTab ?? null;
  state.actionCards = normalizeSidepanelCollections({ actionCards: message.actionCards ?? [] }).actionCards;
  sanitizeUnavailableCurrentPageState();
  render();
  void installActiveTabImagePromptExtractor();
}

async function installActiveTabImagePromptExtractor(): Promise<void> {
  if (!state.currentPageSupport.available) {
    return;
  }
  const response = await sendRuntimeMessage<Record<string, unknown>>({ type: "page.image-prompt-hover.install" }).catch(
    () => null,
  );
  const permissionPlan = response ? getPermissionRequestForRuntimeResponse(response) : null;
  if (!permissionPlan) {
    return;
  }
  state.pendingPermission = {
    plan: permissionPlan,
    errorMessage: "",
  };
  state.actionStatus = "";
  render();
}

async function takePendingOnlineImagePromptExtraction(): Promise<void> {
  const result = await sendRuntimeMessage<{ extraction?: unknown }>({
    type: "image.prompt.pending.take",
  }).catch(() => null);
  if (result?.extraction) {
    await handleOnlineImagePromptExtraction(result.extraction);
  }
}

async function takePendingOnlineImagePromptError(): Promise<void> {
  const result = await sendRuntimeMessage<{ error?: unknown }>({
    type: "image.prompt.error.pending.take",
  }).catch(() => null);
  if (result?.error) {
    await handleOnlineImagePromptError(result.error);
  }
}

async function takePendingContextMenuImageAttachment(): Promise<void> {
  const result = await sendRuntimeMessage<{ attachment?: unknown }>({
    type: "image.attachment.pending.take",
  }).catch(() => null);
  const attachment = createContextMenuImageAttachment(result?.attachment);
  if (!attachment) {
    return;
  }

  const plan = planAttachmentSelection(state.fileAttachments, [attachment]);
  const acceptedFingerprints = new Set(plan.accepted.map((item) => createAttachmentFingerprint(item)));
  const acceptedAttachments = [attachment].filter((item) => acceptedFingerprints.has(createAttachmentFingerprint(item)));
  state.activeView = "chat";
  state.fileAttachments = [...state.fileAttachments, ...acceptedAttachments];
  state.actionStatus = summarizeRejectedFiles(plan.rejected, stringsForState());
  render();
}

type PendingContextMenuAction = "summarize-page" | "summarize-video";

async function takePendingContextMenuAction(): Promise<void> {
  const result = await sendRuntimeMessage<{ action?: unknown }>({
    type: "context.menu.pending.take",
  }).catch(() => null);
  const action = normalizePendingContextMenuAction(result?.action);
  if (!action) {
    return;
  }
  await handleActionCard(action);
}

function normalizePendingContextMenuAction(value: unknown): PendingContextMenuAction | null {
  return value === "summarize-page" || value === "summarize-video" ? value : null;
}

function createContextMenuImageAttachment(value: unknown): UserFileAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Record<string, unknown>;
  const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  if (isHttpUrl(imageUrl)) {
    return createRemoteImageAttachment(imageUrl);
  }
  const dataUrl = parseContextMenuImageDataUrl(imageUrl);
  if (!dataUrl) {
    return null;
  }
  return {
    id: `context-menu-image-${Date.now()}`,
    name: `context-menu-image.${extensionForImageMimeType(dataUrl.mimeType)}`,
    mimeType: dataUrl.mimeType,
    sizeBytes: estimateBase64ByteLength(dataUrl.base64),
    lastModified: Date.now(),
    base64: dataUrl.base64,
    kind: "image",
  };
}

function parseContextMenuImageDataUrl(value: string): { mimeType: string; base64: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(value.trim());
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    mimeType: match[1],
    base64: match[2].replace(/\s+/gu, ""),
  };
}

function extensionForImageMimeType(mimeType: string): string {
  return mimeType === "image/jpeg" || mimeType === "image/jpg"
    ? "jpg"
    : mimeType === "image/webp"
      ? "webp"
      : mimeType === "image/gif"
        ? "gif"
        : "png";
}

function estimateBase64ByteLength(base64: string): number {
  const normalized = base64.replace(/\s+/gu, "");
  if (!normalized) {
    return 0;
  }
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function normalizeOnlineImagePromptExtraction(value: unknown): OnlineImagePromptExtraction | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Record<string, unknown>;
  const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  const attachment = normalizeOnlineImagePromptAttachment(input.attachment);
  if (!isSupportedImagePromptSource(imageUrl) || !(attachment || isHttpUrl(imageUrl))) {
    return null;
  }
  return {
    imageUrl,
    ...(attachment ? { attachment } : {}),
    ...(typeof input.alt === "string" && input.alt.trim() ? { alt: input.alt.trim().slice(0, 240) } : {}),
    ...(typeof input.pageTitle === "string" && input.pageTitle.trim()
      ? { pageTitle: input.pageTitle.trim().slice(0, 240) }
      : {}),
    ...(typeof input.pageUrl === "string" && input.pageUrl.trim() ? { pageUrl: input.pageUrl.trim() } : {}),
  };
}

function normalizeOnlineImagePromptAttachment(value: unknown): UserFileAttachment | null {
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
    sizeBytes: Math.max(0, Number(input.sizeBytes) || 0),
    lastModified: Math.max(0, Number(input.lastModified) || Date.now()),
    base64,
    kind: "image",
    ...(typeof input.sourceUrl === "string" && isHttpUrl(input.sourceUrl.trim()) ? { sourceUrl: input.sourceUrl.trim() } : {}),
  };
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

async function handleOnlineImagePromptExtraction(value: unknown): Promise<void> {
  const extraction = normalizeOnlineImagePromptExtraction(value);
  if (!extraction) {
    return;
  }

  const prompt = createOnlineImagePromptExtractionPrompt({
    ...extraction,
    responseLanguage: state.uiLocale || getBrowserUiLanguage(),
  });
  const attachment = extraction.attachment ?? (isHttpUrl(extraction.imageUrl) ? createRemoteImageAttachment(extraction.imageUrl) : null);
  if (!attachment) {
    await handleOnlineImagePromptError({
      code: "attachment-unavailable",
      imageUrl: extraction.imageUrl,
    });
    return;
  }
  await startNewChat();
  if (!canSendCurrentComposerMessage(prompt)) {
    state.composerDraft = prompt;
    state.fileAttachments = [attachment];
    render();
    return;
  }
  clearVisualPromptAttachments();
  state.fileAttachments = [attachment];
  state.composerDraft = prompt;
  state.activeView = "chat";
  render();
  await sendPrompt(prompt);
}

async function handleOnlineImagePromptError(value: unknown): Promise<void> {
  const error = normalizeOnlineImagePromptError(value);
  if (!error) {
    return;
  }
  state.activeView = "chat";
  state.actionStatus = describeOnlineImagePromptError(error);
  render();
}

function normalizeOnlineImagePromptError(
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

function describeOnlineImagePromptError(error: { code: "attachment-unavailable"; imageUrl: string }): string {
  if (error.code !== "attachment-unavailable") {
    return stringsForState().status.fileAttachFailed;
  }
  const locale = state.uiLocale || getBrowserUiLanguage();
  if (locale.startsWith("ko")) {
    return "이 웹사이트의 이미지를 읽어 첨부하지 못했습니다. 사이트 차단이나 캔버스 보안 제한 때문에 프롬프트 추출을 진행할 수 없습니다.";
  }
  return "Chromex could not attach this page image. The site may be blocking image access or canvas export, so prompt extraction could not continue.";
}

async function initialize(options: { forceCatalog?: boolean } = {}): Promise<void> {
  installSystemThemeListener();
  state.uiLocale = detectUiLocale(getBrowserUiLanguage());
  syncDocumentLanguage();
  const currentConversationIdBeforeInit = state.currentConversationId;
  try {
    const payload = (await sendRuntimeMessage({
      type: "ui.init",
      ...(targetWindowId ? { windowId: targetWindowId } : {}),
      ...(options.forceCatalog ? { forceCatalog: true } : {}),
    })) as UiInitPayload & { error?: string };
    if (payload.error) {
      throw new Error(payload.error);
    }

    state.initError = "";
    state.accountStatus = payload.accountStatus;
    state.currentPageSupport = payload.currentPageSupport;
    state.currentTabReference = payload.currentTab;
    const collections = normalizeSidepanelCollections(payload);
    state.models = collections.models;
    state.selectedProfileId = payload.selectedProfileId;
    state.selectedModel = payload.selectedModel;
    state.selectedReasoningEffort = payload.selectedReasoningEffort;
    state.selectedServiceTier = payload.selectedServiceTier;
    state.modelCatalogState = payload.modelCatalogState;
    state.modelCatalogErrorMessage = payload.modelCatalogErrorMessage ?? "";
    state.runtimeConfig = payload.runtimeConfig;
    state.playwrightRuntime = payload.playwrightRuntime;
    state.imageAssetFolder = payload.imageAssetFolder;
    state.diagnosticLogFolder = payload.diagnosticLogFolder;
    state.actionCards = collections.actionCards;
    state.settings = {
      ...payload.settings,
      allowBrowserActions: true,
      browserActionPermissionMode: normalizeBrowserActionPermissionMode(payload.settings.browserActionPermissionMode),
      playwrightBrowserControlEnabled: payload.settings.playwrightBrowserControlEnabled === true,
      uiLanguage: normalizeUiLanguageSetting(payload.settings.uiLanguage),
      uiTheme: normalizeUiThemeSetting(payload.settings.uiTheme),
      preferredVoice: normalizeCodexRealtimeVoice(payload.settings.preferredVoice),
    };
    state.uiLocale = resolveUiLocale(state.settings.uiLanguage, getBrowserUiLanguage());
    syncDocumentLanguage();
    state.profiles = localizeBuiltinProfiles(collections.profiles, state.uiLocale);
    state.workspaceHarness = payload.workspaceHarness;
    state.appServerSkills = collections.appServerSkills;
    state.connectedApps = collections.connectedApps;
    state.appServerPlugins = collections.appServerPlugins;
    state.mcpServers = collections.mcpServers;
    state.recentChats = collections.recentChats;
    state.serverThreads = collections.serverThreads;
    state.rateLimits = payload.rateLimits;
    state.activeTurn = payload.activeTurn;
    state.latestPlan = payload.latestPlan;
    state.latestDiff = payload.latestDiff;
    state.latestReroute = payload.latestReroute;
    const selectedProfileBeforeFallback = state.selectedProfileId;
    ensureComposerProfileSelection();
    if (state.selectedProfileId !== selectedProfileBeforeFallback) {
      void sendRuntimeMessage({ type: "profile.select", profileId: state.selectedProfileId });
    }
    if (
      shouldHydrateInitConversation({
        currentConversationIdBeforeInit,
        currentConversationIdNow: state.currentConversationId,
        payloadConversationId: payload.currentConversation?.id ?? "",
      })
    ) {
      hydrateConversation(payload.currentConversation);
    }
    syncSelectedReasoningEffort();
    sanitizeUnavailableCurrentPageState();
    renderSync();
    void installActiveTabImagePromptExtractor();
    void takePendingOnlineImagePromptError();
    void takePendingOnlineImagePromptExtraction();
    void takePendingContextMenuImageAttachment();
    void takePendingContextMenuAction();
    if (state.attachments.has("open-tabs") || state.selectedTabIds.length) {
      await loadTabs();
    }
  } catch (error) {
    state.initError = toUserFacingRuntimeError(error, getUiStrings(state.uiLocale).errors.init);
    render();
  }
}

function scheduleInitialize(options: { forceCatalog?: boolean } = {}): Promise<void> {
  if (options.forceCatalog) {
    initializeQueuedForceCatalog = true;
  }
  if (initializePromise) {
    initializeQueued = true;
    return initializePromise;
  }

  initializePromise = (async () => {
    do {
      initializeQueued = false;
      const forceCatalog = initializeQueuedForceCatalog;
      initializeQueuedForceCatalog = false;
      await initialize({ forceCatalog });
    } while (initializeQueued);
  })().finally(() => {
    initializePromise = null;
  });

  return initializePromise;
}

function hydrateConversation(conversation: SavedConversation | null): void {
  flushStreamingAssistantDeltas();
  rememberCurrentConversationSnapshot();
  resetVoiceTranscriptMirrorState(voiceTranscriptMirror);
  streamingDeltaBuffer.clear();
  profileQuestionStreamBuffers.clear();
  profileQuestionCardRenderRequested = false;
  state.streamingAssistantMessageIds.clear();
  state.pendingProfileQuestion = null;
  const normalized = normalizePanelConversation(conversation);
  if (!normalized) {
    state.currentConversationId = "";
    state.threadId = "";
    state.activePromptUserMessageId = "";
    state.messages = [];
    state.attachments = new Set();
    state.selectedTabIds = [];
    state.historyQuery = "";
    state.currentReadStrategy = "auto";
    state.fileAttachments = [];
    state.structuredInputs = [];
    state.chatMessageWindowSize = DEFAULT_CHAT_MESSAGE_WINDOW_SIZE;
    pendingChatScrollToBottom = false;
    pendingChatScrollAnchor = null;
    return;
  }

  state.currentConversationId = normalized.id;
  state.threadId = normalized.threadId ?? "";
  state.activePromptUserMessageId = activePromptUserMessageIdsByConversationId.get(normalized.id) ?? "";
  state.messages = cloneConversationMessages(conversationMessagesById.get(normalized.id) ?? normalized.messages);
  state.chatMessageWindowSize = DEFAULT_CHAT_MESSAGE_WINDOW_SIZE;
  pendingChatScrollToBottom = true;
  pendingChatScrollAnchor = null;
  chatScrollUserOverrideUntil = 0;
  state.attachments = new Set();
  state.selectedTabIds = [];
  state.historyQuery = "";
  state.currentReadStrategy = "auto";
  state.fileAttachments = [];
  syncSelectedReasoningEffort();
  state.structuredInputs = [];
  rememberConversationMetadata(normalized);
  state.promptActivity = promptActivitiesByConversationId.get(normalized.id) ?? null;
  state.activeTurn = activeTurnsByConversationId.get(normalized.id) ?? null;
  state.streamingAssistantMessageIds = new Set(streamingAssistantMessageIdsByConversationId.get(normalized.id) ?? []);
  void restoreConversationImagePreviews();
}

function rememberCurrentConversationSnapshot(): void {
  if (!state.currentConversationId) {
    return;
  }
  conversationMessagesById.set(state.currentConversationId, cloneConversationMessages(state.messages));
  conversationProfilesById.set(state.currentConversationId, state.selectedProfileId || DEFAULT_PROFILE_ID);
  conversationModelsById.set(state.currentConversationId, state.selectedModel || undefined);
  if (state.threadId) {
    rememberConversationThreadId(state.currentConversationId, state.threadId);
  }
  if (state.promptActivity) {
    promptActivitiesByConversationId.set(state.currentConversationId, state.promptActivity);
  } else {
    promptActivitiesByConversationId.delete(state.currentConversationId);
  }
  if (state.activePromptUserMessageId) {
    activePromptUserMessageIdsByConversationId.set(state.currentConversationId, state.activePromptUserMessageId);
  } else {
    activePromptUserMessageIdsByConversationId.delete(state.currentConversationId);
  }
  if (state.activeTurn) {
    activeTurnsByConversationId.set(state.currentConversationId, state.activeTurn);
  } else {
    activeTurnsByConversationId.delete(state.currentConversationId);
  }
  if (state.streamingAssistantMessageIds.size) {
    streamingAssistantMessageIdsByConversationId.set(
      state.currentConversationId,
      new Set(state.streamingAssistantMessageIds),
    );
  } else {
    streamingAssistantMessageIdsByConversationId.delete(state.currentConversationId);
  }
}

function rememberConversationMetadata(conversation: SavedConversation): void {
  conversationProfilesById.set(conversation.id, conversation.profileId || DEFAULT_PROFILE_ID);
  conversationModelsById.set(conversation.id, conversation.model);
  if (conversation.threadId) {
    rememberConversationThreadId(conversation.id, conversation.threadId);
  }
  conversationMessagesById.set(conversation.id, cloneConversationMessages(conversation.messages));
}

function rememberConversationThreadId(conversationId: string, threadId: string | undefined): void {
  const normalizedConversationId = conversationId.trim();
  const normalizedThreadId = threadId?.trim() ?? "";
  if (!normalizedConversationId || !normalizedThreadId) {
    return;
  }
  conversationThreadIdsById.set(normalizedConversationId, normalizedThreadId);
  flushBufferedConversationBridgeEvents(normalizedConversationId, normalizedThreadId);
}

function bufferUnresolvedConversationScopedBridgeEvent(event: SidepanelBridgeEvent): void {
  const threadId = getBridgeEventThreadId(event);
  if (!threadId) {
    return;
  }
  const events = unresolvedConversationBridgeEventsByThreadId.get(threadId) ?? [];
  events.push({ ...event });
  if (events.length > MAX_UNRESOLVED_CONVERSATION_BRIDGE_EVENTS_PER_THREAD) {
    events.splice(0, events.length - MAX_UNRESOLVED_CONVERSATION_BRIDGE_EVENTS_PER_THREAD);
  }
  unresolvedConversationBridgeEventsByThreadId.set(threadId, events);
}

function flushBufferedConversationBridgeEvents(conversationId: string, threadId: string): void {
  const events = unresolvedConversationBridgeEventsByThreadId.get(threadId);
  if (!events?.length) {
    return;
  }
  unresolvedConversationBridgeEventsByThreadId.delete(threadId);
  for (const event of events) {
    applyBufferedConversationBridgeEvent(conversationId, event);
  }
  renderConversationListIfVisible();
}

function applyBufferedConversationBridgeEvent(conversationId: string, event: SidepanelBridgeEvent): void {
  switch (event.type) {
    case "message.delta": {
      cancelEmptyAssistantResponseNotice(event.threadId ?? "", event.turnId ?? "", conversationId);
      upsertAssistantMessageForConversation(conversationId, event.itemId ?? "assistant", event.delta ?? "", true);
      break;
    }
    case "message.completed": {
      cancelEmptyAssistantResponseNotice(event.threadId ?? "", event.turnId ?? "", conversationId);
      upsertAssistantMessageForConversation(conversationId, event.itemId ?? "assistant", event.text ?? "", false);
      clearEmptyAssistantResponseNoticeForTurn(event.threadId ?? "", event.turnId ?? "", conversationId);
      completeTurnTraceForConversation(conversationId, event.threadId ?? "", event.turnId ?? "");
      clearConversationActivity(conversationId);
      void persistDetachedConversation(conversationId);
      break;
    }
    case "turn.started": {
      if (event.activeTurn) {
        activeTurnsByConversationId.set(conversationId, event.activeTurn);
      }
      break;
    }
    case "turn.completed": {
      completeTurnTraceForConversation(conversationId, event.threadId ?? "", event.turnId ?? "");
      scheduleEmptyAssistantResponseNotice({
        conversationId,
        threadId: event.threadId ?? "",
        turnId: event.turnId ?? "",
        activeUserMessageId: activePromptUserMessageIdsByConversationId.get(conversationId) ?? null,
      });
      clearConversationActivity(conversationId);
      void persistDetachedConversation(conversationId);
      break;
    }
    case "turn.activity": {
      if (!event.threadId || !event.turnId) {
        break;
      }
      activeTurnsByConversationId.set(conversationId, {
        threadId: event.threadId,
        turnId: event.turnId,
      });
      upsertTurnActivityTraceForConversation(conversationId, {
        threadId: event.threadId,
        turnId: event.turnId,
        itemId: event.itemId ?? `activity-${Date.now()}`,
        kind: normalizeTraceEventKind(event.kind),
        title: event.title ?? "",
        detail: event.detail ?? "",
        status: event.status === "completed" ? "completed" : "running",
        timestampMs: Number.isFinite(event.timestampMs) ? Number(event.timestampMs) : Date.now(),
      });
      break;
    }
    case "turn.plan.updated": {
      if (event.plan) {
        upsertTurnPlanTraceForConversation(conversationId, event.plan);
      }
      break;
    }
    case "turn.diff.updated": {
      if (event.diff) {
        upsertTurnDiffTraceForConversation(conversationId, event.diff);
      }
      break;
    }
    default:
      break;
  }
}

function getBridgeEventThreadId(event: SidepanelBridgeEvent): string {
  return (
    event.threadId ??
    event.activeTurn?.threadId ??
    event.plan?.threadId ??
    event.diff?.threadId ??
    event.reroute?.threadId ??
    ""
  ).trim();
}

function cloneConversationMessages(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.map((message) => ({
    ...message,
    ...(message.notice ? { notice: { ...message.notice } } : {}),
    ...(message.voice ? { voice: { ...message.voice } } : {}),
    ...(message.images ? { images: message.images.map((image) => ({ ...image })) } : {}),
    ...(message.attachments ? { attachments: message.attachments.map((attachment) => ({ ...attachment })) } : {}),
    ...(message.profile ? { profile: { ...message.profile } } : {}),
    ...(message.trace ? { trace: message.trace.map((item) => ({ ...item })) } : {}),
  }));
}

function resolveBridgeEventConversationId(event: {
  conversationId?: string;
  clientRequestId?: string;
  threadId?: string;
  activeTurn?: CodexActiveTurn;
  plan?: { threadId?: string };
  diff?: { threadId?: string };
  reroute?: { threadId?: string };
}): string | null {
  if (event.conversationId?.trim()) {
    return event.conversationId.trim();
  }
  if (event.clientRequestId) {
    const conversationId = promptRequestConversationIds.get(event.clientRequestId);
    if (conversationId) {
      return conversationId;
    }
  }
  const threadId =
    event.threadId ??
    event.activeTurn?.threadId ??
    event.plan?.threadId ??
    event.diff?.threadId ??
    event.reroute?.threadId;
  if (threadId) {
    for (const [conversationId, candidateThreadId] of conversationThreadIdsById.entries()) {
      if (candidateThreadId === threadId) {
        return conversationId;
      }
    }
  }
  return null;
}

function isBridgeEventForCurrentConversation(conversationId: string | null, eventType = ""): boolean {
  if (isConversationScopedBridgeEventType(eventType)) {
    return Boolean(conversationId && (!state.currentConversationId || conversationId === state.currentConversationId));
  }
  return !conversationId || !state.currentConversationId || conversationId === state.currentConversationId;
}

function shouldDropUnresolvedConversationScopedBridgeEvent(eventType: string, conversationId: string | null): boolean {
  return isConversationScopedBridgeEventType(eventType) && !conversationId;
}

function shouldTreatUnresolvedBridgeEventAsCurrent(
  event: SidepanelBridgeEvent,
  conversationId: string | null,
): boolean {
  if (conversationId || !state.currentConversationId || !isConversationScopedBridgeEventType(event.type)) {
    return false;
  }
  if (!hasCurrentPromptInFlight()) {
    return false;
  }
  const threadId = getBridgeEventThreadId(event);
  if (!threadId) {
    return true;
  }
  const claimedThreadId = getCurrentClaimedBridgeEventThreadId();
  if (claimedThreadId) {
    return threadId === claimedThreadId;
  }
  return Boolean(state.promptActivity || promptSubmissionBootstrapInFlight);
}

function hasCurrentPromptInFlight(): boolean {
  return Boolean(
    promptSubmissionBootstrapInFlight ||
      state.promptActivity ||
      state.activeTurn ||
      state.streamingAssistantMessageIds.size > 0,
  );
}

function getCurrentClaimedBridgeEventThreadId(): string {
  if (state.activeTurn?.threadId) {
    return state.activeTurn.threadId;
  }
  if (state.streamingAssistantMessageIds.size > 0 && state.threadId) {
    return state.threadId;
  }
  return "";
}

function rememberCurrentConversationThreadForBridgeEvent(event: SidepanelBridgeEvent): void {
  const threadId = getBridgeEventThreadId(event);
  if (!threadId || !state.currentConversationId) {
    return;
  }
  rememberConversationThreadId(state.currentConversationId, threadId);
  if (!state.threadId) {
    state.threadId = threadId;
  }
}

function isConversationScopedBridgeEventType(eventType: string): boolean {
  switch (eventType) {
    case "message.delta":
    case "message.completed":
    case "message.image":
    case "prompt.retrying":
    case "prompt.status":
    case "context.compaction.started":
    case "context.compaction.completed":
    case "turn.started":
    case "turn.completed":
    case "turn.activity":
    case "turn.plan.updated":
    case "turn.diff.updated":
    case "model.rerouted":
      return true;
    default:
      return false;
  }
}

function getDetachedConversationMessages(conversationId: string): ConversationMessage[] {
  const existing = conversationMessagesById.get(conversationId);
  if (existing) {
    return existing;
  }
  const messages: ConversationMessage[] = [];
  conversationMessagesById.set(conversationId, messages);
  return messages;
}

function upsertAssistantMessageForConversation(
  conversationId: string,
  itemId: string,
  fragment: string,
  append: boolean,
): void {
  const messages = getDetachedConversationMessages(conversationId);
  const existing = messages.find((message) => message.id === itemId);
  if (!existing && !fragment.trim()) {
    return;
  }
  if (!existing) {
    messages.push({
      id: itemId,
      role: "assistant",
      text: fragment,
    });
    return;
  }
  existing.text = append ? `${existing.text}${fragment}` : fragment;
}

function upsertAssistantImageForConversation(
  conversationId: string,
  itemId: string,
  image: ConversationMessageImage,
): void {
  const messages = getDetachedConversationMessages(conversationId);
  let message = messages.find((entry) => entry.id === itemId);
  if (!message) {
    message = {
      id: itemId,
      role: "assistant",
      text: stringsForState().images.generatedResult,
      images: [],
    };
    messages.push(message);
  }
  const images = [...(message.images ?? [])];
  const existingIndex = images.findIndex((candidate) => isSameConversationImage(candidate, image));
  if (existingIndex >= 0) {
    images[existingIndex] = image;
  } else {
    images.push(image);
  }
  message.images = images;
}

async function hydrateImageForDetachedConversation(input: {
  conversationId: string;
  itemId: string;
  previewRef: string;
  alt: string;
}): Promise<void> {
  upsertAssistantImageForConversation(
    input.conversationId,
    input.itemId,
    createPendingConversationImage(input.previewRef, input.alt),
  );
  try {
    const image = await createConversationImageFromPreviewRef(input.previewRef, input.alt);
    upsertAssistantImageForConversation(input.conversationId, input.itemId, image);
  } catch {
    upsertAssistantImageForConversation(
      input.conversationId,
      input.itemId,
      createFailedConversationImage(input.previewRef, input.alt),
    );
  }
  clearConversationActivity(input.conversationId);
  await persistDetachedConversation(input.conversationId);
}

async function hydrateGeneratedImagesForDetachedConversation(
  conversationId: string,
  messageId: string,
  previewRefs: string[],
  baseAlt: string,
): Promise<void> {
  const refs = normalizeImagePreviewRefs(previewRefs, undefined);
  if (!refs.length) {
    clearConversationActivity(conversationId);
    await persistDetachedConversation(conversationId);
    return;
  }
  await Promise.allSettled(
    refs.map((previewRef, index) =>
      hydrateImageForDetachedConversation({
        conversationId,
        itemId: messageId,
        previewRef,
        alt: createGeneratedImageAlt(baseAlt, index, refs.length),
      }),
    ),
  );
}

function clearConversationActivity(conversationId: string): void {
  promptActivitiesByConversationId.delete(conversationId);
  activePromptUserMessageIdsByConversationId.delete(conversationId);
  activeTurnsByConversationId.delete(conversationId);
  streamingAssistantMessageIdsByConversationId.delete(conversationId);
}

async function persistDetachedConversation(conversationId: string): Promise<void> {
  if (!conversationId || conversationId === state.currentConversationId) {
    scheduleConversationPersist();
    return;
  }
  const messages = conversationMessagesById.get(conversationId);
  if (!messages) {
    return;
  }
  const result = await sendRuntimeMessage<{ conversation: SavedConversation }>({
    type: "conversation.save",
    conversation: {
      id: conversationId,
      title: "",
      profileId: conversationProfilesById.get(conversationId) ?? DEFAULT_PROFILE_ID,
      model: conversationModelsById.get(conversationId),
      threadId: conversationThreadIdsById.get(conversationId) || undefined,
      messages: serializeConversationMessagesForStorage(messages),
      attachments: [],
      structuredInputs: [],
      selectedTabIds: [],
      historyQuery: "",
      readStrategyOverride: "auto",
      updatedAt: Date.now(),
    },
  });
  state.recentChats = upsertRecentChat(state.recentChats, {
    id: result.conversation.id,
    title: result.conversation.title,
    profileId: result.conversation.profileId,
    updatedAt: result.conversation.updatedAt,
  });
  renderConversationListIfVisible();
}

function getSelectedModelOption(): CodexModelOption | null {
  return state.models.find((model) => model.id === state.selectedModel) ?? null;
}

function syncSelectedReasoningEffort(): void {
  const speedTiers = getSelectedModelOption()?.additionalSpeedTiers ?? [];
  state.selectedReasoningEffort = normalizeReasoningEffort(
    state.selectedReasoningEffort,
    getSelectedModelReasoningEfforts(),
    getSelectedModelOption()?.defaultReasoningEffort ?? "",
  );
  state.selectedServiceTier = normalizeServiceTier(
    state.selectedServiceTier,
    speedTiers,
    getDefaultServiceTier(speedTiers),
  );
}

async function persistSelectedModelControls(): Promise<void> {
  await sendRuntimeMessage({
    type: "model.select",
    model: state.selectedModel,
    reasoningEffort: state.selectedReasoningEffort,
    serviceTier: state.selectedServiceTier,
  });
}

function getSelectedModelReasoningEfforts(): string[] {
  return getSelectedModelOption()?.reasoningEfforts ?? DEFAULT_REASONING_EFFORTS;
}

function render(): void {
  if (composerCompositionInProgress) {
    renderDeferredDuringComposerComposition = true;
    return;
  }
  renderBatcher.request();
}

function renderSync(): void {
  if (composerCompositionInProgress) {
    renderDeferredDuringComposerComposition = true;
    return;
  }
  renderBatcher.flush();
}

function flushDeferredComposerCompositionRender(): void {
  if (!renderDeferredDuringComposerComposition || composerCompositionInProgress) {
    return;
  }
  renderDeferredDuringComposerComposition = false;
  render();
}

function renderNow(): void {
  if (composerCompositionInProgress) {
    renderDeferredDuringComposerComposition = true;
    return;
  }

  ensureComposerProfileSelection();
  const strings = getUiStrings(state.uiLocale);
  const mentionOptions = getMentionOptionsForState();
  const tabMentionOptions = getTabMentionOptionsForState();
  const mentionKeyboardOptions = getMentionKeyboardOptionsForState(tabMentionOptions, mentionOptions);
  const mentionActiveIndex = clampMentionOptionIndex(state.mentionActiveIndex, mentionKeyboardOptions.length);
  const slashOptions = getSlashOptionsForState();
  const composerSuggestionsOpen =
    state.slashQuery !== null || state.mentionQuery !== null || state.attachmentMenuOpen || state.composerModelMenuOpen;
  const isPopup = panelMode === "popup";
  const currentTurnActive = isCurrentTurnActive();
  const quickInteractionLocked = isQuickInteractionLocked({
    turnActive: currentTurnActive,
    promptActivityActive: Boolean(state.promptActivity),
  });
  const selectedModelOption = getSelectedModelOption();
  const isEmptyChat = state.activeView === "chat" && state.messages.length === 0;
  const nativeHostHealth = getNativeHostHealth({
    modelCatalogState: state.modelCatalogState,
    modelCatalogErrorMessage: state.modelCatalogErrorMessage,
  });
  const codexBinaryHealth = getCodexBinaryHealth({
    nativeHostStatus: nativeHostHealth.status,
    runtimeConfig: state.runtimeConfig,
    modelCatalogState: state.modelCatalogState,
  });
  const showAuthOnboarding = shouldShowAuthOnboarding(state.accountStatus);
  const showUsageNoticeOnboarding = shouldShowUsageNoticeOnboarding({
    accountStatus: state.accountStatus,
    usageNoticeAccepted: state.settings.usageNoticeAccepted,
  });
  const showOnboarding =
    !smokeTestMode && state.activeView === "chat" && (showAuthOnboarding || showUsageNoticeOnboarding);
  const scrollState = captureScrollPositions();
  const composerState = captureComposerRenderState();
  const returningToChatView =
    state.activeView === "chat" && lastRenderedActiveView !== null && lastRenderedActiveView !== "chat";
  if (returningToChatView) {
    pendingChatScrollToBottom = true;
    pendingChatScrollAnchor = null;
    chatScrollUserOverrideUntil = 0;
  }

  syncDocumentLanguage();
  root.innerHTML = `
    <div class="shell ${isEmptyChat ? "shell-empty-chat" : ""} ${showOnboarding ? "shell-onboarding" : ""}">
      ${
        showOnboarding
          ? ""
          : `<header class="topbar">
        <span class="topbar-spacer" aria-hidden="true"></span>
        <div class="top-actions">
          ${renderTopQuickActions(quickInteractionLocked)}
          <span class="top-quick-separator" aria-hidden="true"></span>
          <button
            id="app-menu-toggle"
            class="icon-button app-menu-toggle ${state.appMenuOpen ? "active" : ""}"
            title="${escapeAttribute(getAppMenuLabels(state.uiLocale).menu)}"
            aria-label="${escapeAttribute(getAppMenuLabels(state.uiLocale).menu)}"
            aria-haspopup="menu"
            aria-expanded="${state.appMenuOpen ? "true" : "false"}"
          >${renderAppMenuDotsIcon()}</button>
          ${state.appMenuOpen ? renderAppMenu(isPopup, false) : ""}
          <button id="new-chat" class="icon-button" title="${escapeAttribute(strings.newChat)}" aria-label="${escapeAttribute(strings.newChat)}">${renderUiIcon("plus")}</button>
          <button
            id="${isPopup ? "dock-chat" : "popout-chat"}"
            class="icon-button"
            title="${escapeAttribute(isPopup ? strings.dock : strings.popOut)}"
            aria-label="${escapeAttribute(isPopup ? strings.dock : strings.popOut)}"
          >${renderPanelModeIcon(isPopup)}</button>
        </div>
      </header>`
      }
      ${renderFloatingNotifications()}
      ${renderPendingPermissionPrompt(strings)}

      <main class="main-stage ${isEmptyChat ? "empty" : ""} ${showOnboarding ? "onboarding" : ""}">
        ${
          showOnboarding
            ? showAuthOnboarding
              ? renderAuthOnboarding(strings, nativeHostHealth, codexBinaryHealth)
              : renderUsageNoticeOnboarding(strings)
            : state.activeView === "chat"
            ? renderChatView(strings)
            : state.activeView === "context"
              ? renderContextView(strings)
              : state.activeView === "skills"
                ? renderSkillsView(strings)
                : state.activeView === "plugins"
                  ? renderPluginMcpView(strings)
                  : renderWorkspaceView(strings)
        }
      </main>

      ${
        showOnboarding
          ? ""
          : `<footer class="composer-shell ${composerSuggestionsOpen ? "has-suggestions" : ""}">
        ${state.activeView === "chat" && !isEmptyChat ? renderScrollToBottomButton() : ""}
        ${state.activeView === "chat" ? renderPinnedActionSuggestions(strings, quickInteractionLocked) : ""}
        <div class="composer-frame ${composerSuggestionsOpen ? "has-suggestions" : ""} ${state.composerDragActive ? "drag-active" : ""}">
          <input id="file-attachment-input" type="file" multiple hidden />
          ${state.attachmentMenuOpen ? renderAttachmentMenu(strings) : ""}
          ${
            state.composerDragActive
              ? `<div class="composer-drop-hint" aria-hidden="true">${escapeHtml(strings.help.dropAttachments)}</div>`
              : ""
          }
          ${
            state.voiceInputActive
              ? renderComposerDictationPanel(strings)
              : `${
                  hasComposerContextReferences()
                    ? `<div class="composer-tray">
                        <div class="context-summary composer-context-summary">
                          ${renderAttachedContextSummary(strings)}
                        </div>
                      </div>`
                    : ""
                }
                <div class="composer-input-row ${getComposerInputRowClasses()}">
                  ${renderComposerCommandPills()}
                  <textarea id="composer" rows="1" placeholder="${escapeAttribute(strings.composerPlaceholder)}">${escapeHtml(state.composerDraft)}</textarea>
                </div>
              ${
                state.slashQuery !== null
                  ? renderSlashCommandPopover(strings, slashOptions, clampSlashCommandIndex(state.slashActiveIndex, slashOptions.length))
                  : state.mentionQuery !== null
                    ? renderMentionTabPicker(strings, tabMentionOptions, mentionOptions, mentionActiveIndex)
                    : ""
              }
                <div class="composer-bar composer-control-bar">
                  <div class="composer-tools">
                    <button
                      class="icon-button composer-attach-button"
                      id="attach-files"
                      aria-expanded="${state.attachmentMenuOpen ? "true" : "false"}"
                      title="${escapeAttribute(strings.actions.attachFiles)}"
                      aria-label="${escapeAttribute(strings.actions.attachFiles)}"
                    >${renderUiIcon("plus")}</button>
                    ${renderComposerBrowserActionPermissionControl(strings)}
                  </div>
                  <div class="composer-submit">
                    ${renderComposerModelDropdownControl(strings, selectedModelOption)}
                    <button
                      id="voice-input-toggle"
                      class="icon-button composer-voice-toggle"
                      title="${escapeAttribute(strings.actions.voiceInput)}"
                      aria-label="${escapeAttribute(strings.actions.voiceInput)}"
                      aria-pressed="false"
                      ${state.voiceEnabled || state.pendingAction === "voice" ? "disabled" : ""}
                    >
                      ${renderUiIcon("mic")}
                    </button>
                    ${renderComposerPrimaryActionButton(strings)}
                  </div>
                </div>`
          }
        </div>
      </footer>`
      }
      ${renderImageAnnotationEditor(strings)}
      ${renderProfileEditorModal(strings)}
      ${renderNativeDialogs(strings)}
    </div>
  `;

  bindEvents();
  scheduleFloatingNotificationDismiss();
  restoreScrollPositions(scrollState);
  updateScrollToBottomButtonVisibility();
  restoreComposerRenderState(composerState);
  lastRenderedActiveView = state.activeView;
}

function resolveComposerPrimaryActionButton(strings: ReturnType<typeof getUiStrings>): {
  id: "send-prompt" | "stop-turn" | "stop-live" | "live-toggle";
  className: string;
  label: string;
  disabled: boolean;
  content: string;
} {
  const currentWorkActive = isCurrentPromptWorkActive();
  const canStopCurrentWork = currentWorkActive;
  const canSendMessage = canSendComposerMessage({
    draft: state.composerDraft,
    turnActive: currentWorkActive,
    promptActivityActive: Boolean(state.promptActivity),
    streamingAssistantActive: state.streamingAssistantMessageIds.size > 0,
    submissionStartingActive: promptSubmissionBootstrapInFlight,
  });
  const action = resolveComposerPrimaryAction({
    composerDraft: state.composerDraft,
    currentWorkActive: canStopCurrentWork,
    liveActive: state.voiceEnabled,
  });
  const id =
    action === "stop-turn"
      ? "stop-turn"
      : action === "send"
        ? "send-prompt"
        : action === "stop-live"
          ? "stop-live"
          : "live-toggle";
  const label =
    action === "stop-turn"
      ? strings.actions.stop
      : action === "send"
        ? strings.actions.send
        : action === "stop-live"
          ? strings.actions.stopLive
          : strings.actions.live;
  const disabled =
    action === "send"
      ? !canSendMessage
      : action === "stop-turn"
        ? false
        : state.pendingAction === "voice" || state.voiceInputActive;
  const className = [
    "send-button",
    action === "stop-turn" ? "stop" : "",
    action === "start-live" || action === "stop-live" ? "live" : "",
    action === "stop-live" ? "live-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const icon =
    action === "stop-turn" ? renderUiIcon("stop-filled") : action === "send" ? renderUiIcon("send") : renderUiIcon("audio-lines");
  const content =
    action === "stop-live"
      ? `<span class="live-button-icon">${icon}</span><span class="live-button-label">${escapeHtml(strings.actions.stopLive)}</span>`
      : icon;

  return {
    id,
    className,
    label,
    disabled,
    content,
  };
}

function renderComposerPrimaryActionButton(strings: ReturnType<typeof getUiStrings> = stringsForState()): string {
  const button = resolveComposerPrimaryActionButton(strings);
  return `
    <button
      id="${button.id}"
      class="${button.className}"
      aria-label="${escapeAttribute(button.label)}"
      title="${escapeAttribute(button.label)}"
      ${button.disabled ? "disabled" : ""}
    >
      ${button.content}
    </button>
  `;
}

function syncComposerPrimaryActionButton(): void {
  const existing = root.querySelector<HTMLButtonElement>("#send-prompt, #stop-turn, #live-toggle, #stop-live");
  if (!existing) {
    return;
  }

  const template = document.createElement("template");
  template.innerHTML = renderComposerPrimaryActionButton().trim();
  const next = template.content.firstElementChild;
  if (!(next instanceof HTMLButtonElement)) {
    return;
  }

  existing.replaceWith(next);
  bindComposerPrimaryActionButton(next);
}

function bindComposerPrimaryActionButton(button: HTMLButtonElement): void {
  if (button.id === "send-prompt") {
    button.addEventListener("click", () => {
      void sendPrompt();
    });
    return;
  }

  if (button.id === "stop-turn") {
    button.addEventListener("click", () => {
      void cancelActivePromptFromComposer();
    });
    return;
  }

  if (button.id === "live-toggle" || button.id === "stop-live") {
    button.addEventListener("click", () => {
      void toggleRealtimeVoiceFromComposer();
    });
  }
}

async function cancelActivePromptFromComposer(): Promise<void> {
  const activePromptRequestId = state.promptActivity?.clientRequestId;
  const activeTurn = state.activeTurn;
  if (!activeTurn && !activePromptRequestId) {
    return;
  }
  if (activePromptRequestId) {
    cancelledPromptRequestIds.add(activePromptRequestId);
  }
  await chrome.runtime.sendMessage({
    type: "prompt.cancel",
    clientRequestId: activePromptRequestId,
    threadId: activeTurn?.threadId,
    turnId: activeTurn?.turnId,
  });
  state.activeTurn = null;
  state.promptActivity = null;
  state.streamingAssistantMessageIds.clear();
  render();
}

async function toggleRealtimeVoiceFromComposer(): Promise<void> {
  if (voiceStartPromise) {
    return;
  }
  state.initError = "";
  state.actionStatus = "";
  state.pendingAction = "voice";
  render();
  try {
    if (!state.voiceEnabled) {
      voiceStartPromise = startRealtimeVoiceSession();
      await voiceStartPromise;
    } else {
      await stopRealtimeVoiceSession({ notifyBridge: true });
    }
  } catch (error) {
    state.initError = error instanceof Error ? error.message : stringsForState().errors.voiceUpdate;
    cleanupRealtimeVoiceResources();
    state.voiceEnabled = false;
  } finally {
    voiceStartPromise = null;
    state.pendingAction = "";
    render();
  }
}

function renderFloatingNotifications(): string {
  const notifications = [
    state.initError
      ? `<p class="error-banner notification-toast" role="alert">${escapeHtml(state.initError)}</p>`
      : "",
    state.actionStatus
      ? `<p class="status-banner notification-toast" role="status">${escapeHtml(state.actionStatus)}</p>`
      : "",
  ].filter(Boolean);

  if (!notifications.length) {
    return "";
  }

  return `
    <div class="notification-stack" aria-live="polite" aria-atomic="true">
      ${notifications.join("")}
    </div>
  `;
}

function scheduleFloatingNotificationDismiss(): void {
  const signature = `${state.initError}\n${state.actionStatus}`.trim();
  if (!signature) {
    clearFloatingNotificationTimer();
    notificationAutoDismissSignature = "";
    return;
  }

  if (signature === notificationAutoDismissSignature && notificationAutoDismissTimer !== null) {
    return;
  }

  clearFloatingNotificationTimer();
  notificationAutoDismissSignature = signature;
  const initErrorSnapshot = state.initError;
  const actionStatusSnapshot = state.actionStatus;
  const dismissDelay = state.initError ? 6_000 : 2_600;
  notificationAutoDismissTimer = window.setTimeout(() => {
    notificationAutoDismissTimer = null;
    notificationAutoDismissSignature = "";
    if (state.initError === initErrorSnapshot) {
      state.initError = "";
    }
    if (state.actionStatus === actionStatusSnapshot) {
      state.actionStatus = "";
    }
    render();
  }, dismissDelay);
}

function clearFloatingNotificationTimer(): void {
  if (notificationAutoDismissTimer === null) {
    return;
  }
  window.clearTimeout(notificationAutoDismissTimer);
  notificationAutoDismissTimer = null;
}

function installGlobalFloatingSurfaceDismissal(): void {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !hasOpenFloatingSurface()) {
        return;
      }
      if (isInsideFloatingSurfaceInteraction(target)) {
        return;
      }
      if (closeFloatingSurfaces()) {
        renderSync();
      }
    },
    { capture: true },
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.pluginConnectionDialog) {
      event.preventDefault();
      closePluginConnectionDialog();
      return;
    }
    if (event.key === "Escape" && state.nativeTextDialog) {
      event.preventDefault();
      closeNativeTextDialog();
      return;
    }
    if (event.key === "Escape" && state.nativeConfirmationDialog) {
      event.preventDefault();
      resolveNativeConfirmation(false);
      return;
    }
    if (event.key !== "Escape" || !hasOpenFloatingSurface()) {
      return;
    }
    event.preventDefault();
    if (closeFloatingSurfaces()) {
      renderSync();
    }
  });
}

function hasOpenFloatingSurface(): boolean {
  return Boolean(
    state.mentionQuery !== null ||
      state.slashQuery !== null ||
      state.attachmentMenuOpen ||
      state.browserActionPermissionMenuOpen ||
      state.composerModelMenuOpen ||
      state.appMenuOpen,
  );
}

function isInsideFloatingSurfaceInteraction(target: Element): boolean {
  if (state.appMenuOpen && target.closest("#app-menu-toggle, .app-menu")) {
    return true;
  }

  const composerSurfaceOpen = Boolean(
    state.mentionQuery !== null ||
      state.slashQuery !== null ||
      state.attachmentMenuOpen ||
      state.browserActionPermissionMenuOpen ||
      state.composerModelMenuOpen,
  );
  if (!composerSurfaceOpen) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        ".composer-frame",
        ".suggestions",
        ".attachment-menu",
        ".composer-permission-group",
        ".composer-permission-menu",
        ".composer-model-reasoning-group",
        ".composer-model-dropdown",
      ].join(","),
    ),
  );
}

function closeFloatingSurfaces(): boolean {
  const wasOpen = hasOpenFloatingSurface();
  state.mentionQuery = null;
  state.mentionActiveIndex = 0;
  state.slashQuery = null;
  state.slashActiveIndex = 0;
  state.attachmentMenuOpen = false;
  state.browserActionPermissionMenuOpen = false;
  state.composerModelMenuOpen = false;
  state.appMenuOpen = false;
  return wasOpen;
}

function renderAppMenu(isPopup: boolean, disabled = false): string {
  const labels = getAppMenuLabels(state.uiLocale);
  const recentChats = getRecentChatDisplayItems(state.appMenuRecentChatLimit);
  const moreVisible = hasAppMenuMoreRecentChats(state.recentChats, state.appMenuRecentChatLimit);
  const disabledAttribute = disabled ? "disabled" : "";
  return `
    <div class="app-menu" role="menu" aria-label="${escapeAttribute(labels.menu)}">
      <section class="app-menu-section" aria-label="${escapeAttribute(labels.recentChats)}">
        <div class="app-menu-section-header">
          <p class="app-menu-title">${escapeHtml(labels.recentChats)}</p>
          ${
            recentChats.length
              ? `<button
                  class="app-menu-clear-button"
                  type="button"
                  data-clear-chat-history="1"
                  aria-label="${escapeAttribute(labels.clearRecentChats)}"
                  title="${escapeAttribute(labels.clearRecentChats)}"
                  ${disabledAttribute}
                >${escapeHtml(labels.clearRecentChats)}</button>`
              : ""
          }
        </div>
        ${
          recentChats.length
            ? recentChats
                .map(
                  (chat) => `
                    <div class="app-menu-chat-row ${chat.selected ? "selected" : ""}">
                      <button
                        class="app-menu-row recent-chat ${chat.selected ? "selected" : ""}"
                        data-chat-id="${escapeAttribute(chat.id)}"
                        role="menuitem"
                        ${disabledAttribute}
                      >
                        <span class="app-menu-icon list" aria-hidden="true">${renderAppMenuListIcon()}</span>
                        <span class="recent-chat-copy">
                          <span class="app-menu-label">${escapeHtml(chat.title || labels.chat)}</span>
                        </span>
                        <span class="recent-chat-meta" aria-hidden="true">
                          ${renderRecentChatProgressIndicator(chat.busy)}
                          <span class="recent-chat-time">${escapeHtml(chat.relativeTime)}</span>
                        </span>
                      </button>
                      <button
                        class="app-menu-delete-button"
                        type="button"
                        data-delete-chat-id="${escapeAttribute(chat.id)}"
                        aria-label="${escapeAttribute(labels.deleteChat)}"
                        title="${escapeAttribute(labels.deleteChat)}"
                        ${disabledAttribute}
                      >${renderUiIcon("trash")}</button>
                    </div>
                  `,
                )
                .join("")
            : `<p class="app-menu-empty">${escapeHtml(labels.noRecentChats)}</p>`
        }
        ${
          moreVisible
            ? `<button class="app-menu-row" data-menu-action="show-more-recent-chats" role="menuitem" ${disabledAttribute}>
                <span class="app-menu-icon" aria-hidden="true">${renderUiIcon("more-horizontal")}</span>
                <span class="app-menu-label">${escapeHtml(labels.more)}</span>
                <span class="app-menu-chevron" aria-hidden="true">${renderUiIcon("chevron-down")}</span>
              </button>`
            : ""
        }
      </section>
      <div class="app-menu-divider" role="separator"></div>
      <button class="app-menu-row" data-menu-view="chat" role="menuitem" ${disabledAttribute}>
        <span class="app-menu-icon" aria-hidden="true">${renderAppMenuChatIcon()}</span>
        <span class="app-menu-label">${escapeHtml(labels.chat)}</span>
      </button>
      <button class="app-menu-row" data-menu-action="compact" role="menuitem" ${!disabled && state.threadId && !isCurrentTurnActive() ? "" : "disabled"}>
        <span class="app-menu-icon list" aria-hidden="true">${renderAppMenuListIcon()}</span>
        <span class="app-menu-label">${escapeHtml(labels.compactConversation)}</span>
      </button>
      <button class="app-menu-row" data-menu-view="skills" role="menuitem" ${disabledAttribute}>
        <span class="app-menu-icon" aria-hidden="true">${renderAppMenuSkillsIcon()}</span>
        <span class="app-menu-label">${escapeHtml(labels.skills)}</span>
        <span class="app-menu-chevron" aria-hidden="true">${renderUiIcon("chevron-right")}</span>
      </button>
      <button class="app-menu-row" data-menu-view="plugins" role="menuitem" ${disabledAttribute}>
        <span class="app-menu-icon" aria-hidden="true">${renderAppMenuPluginMcpIcon()}</span>
        <span class="app-menu-label">${escapeHtml(labels.pluginMcp)}</span>
        <span class="app-menu-chevron" aria-hidden="true">${renderUiIcon("chevron-right")}</span>
      </button>
      <button class="app-menu-row" data-menu-view="workspace" role="menuitem" ${disabledAttribute}>
        <span class="app-menu-icon" aria-hidden="true">${renderAppMenuSettingsIcon()}</span>
        <span class="app-menu-label">${escapeHtml(labels.settingsHelp)}</span>
        <span class="app-menu-chevron" aria-hidden="true">${renderUiIcon("chevron-right")}</span>
      </button>
    </div>
  `;
}

function getRecentChatDisplayItems(limit?: number) {
  return createRecentChatDisplayItems({
    recentChats: state.recentChats,
    currentConversationId: state.currentConversationId,
    busyConversationIds: getBusyConversationIds(),
    now: Date.now(),
    locale: state.uiLocale || getBrowserUiLanguage(),
    ...(typeof limit === "number" ? { limit } : {}),
  });
}

function renderRecentChatProgressIndicator(busy: boolean): string {
  if (!busy) {
    return "";
  }

  return `<span class="recent-chat-progress" role="progressbar"></span>`;
}

function getBusyConversationIds(): Set<string> {
  const busyConversationIds = new Set<string>();
  if (
    state.currentConversationId &&
    (Boolean(state.promptActivity) || isCurrentTurnActive() || state.streamingAssistantMessageIds.size > 0)
  ) {
    busyConversationIds.add(state.currentConversationId);
  }

  for (const conversationId of promptActivitiesByConversationId.keys()) {
    busyConversationIds.add(conversationId);
  }
  for (const conversationId of activeTurnsByConversationId.keys()) {
    busyConversationIds.add(conversationId);
  }
  for (const [conversationId, messageIds] of streamingAssistantMessageIdsByConversationId) {
    if (messageIds.size) {
      busyConversationIds.add(conversationId);
    }
  }
  return busyConversationIds;
}

function renderConversationListIfVisible(): void {
  if (state.appMenuOpen || state.activeView === "workspace") {
    render();
  }
}

const BROWSER_ACTION_PERMISSION_MODES: BrowserActionPermissionMode[] = ["ask", "auto-review", "full"];

function normalizeBrowserActionPermissionMode(value: unknown): BrowserActionPermissionMode {
  return value === "auto-review" || value === "full" || value === "ask" ? value : "ask";
}

function getBrowserActionPermissionMode(): BrowserActionPermissionMode {
  return normalizeBrowserActionPermissionMode(state.settings.browserActionPermissionMode);
}

function getBrowserActionPermissionCopy(
  mode: BrowserActionPermissionMode,
  strings: ReturnType<typeof getUiStrings>,
): { label: string; description: string; icon: UiIconName } {
  switch (mode) {
    case "full":
      return {
        label: strings.permissions.fullPermissions,
        description: strings.permissions.fullPermissionsDescription,
        icon: "shield-alert",
      };
    case "auto-review":
      return {
        label: strings.permissions.autoReviewPermissions,
        description: strings.permissions.autoReviewPermissionsDescription,
        icon: "shield-check",
      };
    case "ask":
    default:
      return {
        label: strings.permissions.basicPermissions,
        description: strings.permissions.basicPermissionsDescription,
        icon: "hand",
      };
  }
}

function renderComposerBrowserActionPermissionControl(strings: ReturnType<typeof getUiStrings>): string {
  const mode = getBrowserActionPermissionMode();
  const copy = getBrowserActionPermissionCopy(mode, strings);
  const menu = state.browserActionPermissionMenuOpen ? renderBrowserActionPermissionDropdown(strings, mode) : "";

  return `
    <div class="composer-permission-group ${state.browserActionPermissionMenuOpen ? "open" : ""}">
      <button
        id="composer-permission-menu-trigger"
        class="composer-permission-menu-trigger ${mode}"
        type="button"
        aria-haspopup="menu"
        aria-expanded="${state.browserActionPermissionMenuOpen ? "true" : "false"}"
        aria-label="${escapeAttribute(strings.permissions.browserActionsToggle)}"
        title="${escapeAttribute(copy.description)}"
      >
        <span class="permission-mode-glyph" aria-hidden="true">${renderUiIcon(copy.icon)}</span>
        <span class="permission-mode-label">${escapeHtml(copy.label)}</span>
        <span class="composer-select-caret" aria-hidden="true">${renderChevronDownIcon()}</span>
      </button>
      ${menu}
    </div>
  `;
}

function renderBrowserActionPermissionDropdown(
  strings: ReturnType<typeof getUiStrings>,
  selectedMode = getBrowserActionPermissionMode(),
): string {
  return `
    <div class="composer-permission-menu" role="menu" aria-label="${escapeAttribute(strings.permissions.browserActionsToggle)}">
      ${BROWSER_ACTION_PERMISSION_MODES.map((mode) => {
        const copy = getBrowserActionPermissionCopy(mode, strings);
        const selected = mode === selectedMode;
        return `
          <button
            class="composer-permission-menu-row ${mode} ${selected ? "selected" : ""}"
            type="button"
            role="menuitemradio"
            aria-checked="${selected ? "true" : "false"}"
            data-browser-action-permission-mode="${escapeAttribute(mode)}"
          >
            <span class="permission-mode-glyph" aria-hidden="true">${renderUiIcon(copy.icon)}</span>
            <span class="composer-permission-menu-copy">
              <strong>${escapeHtml(copy.label)}</strong>
              <span>${escapeHtml(copy.description)}</span>
            </span>
            ${selected ? `<span class="composer-model-menu-check" aria-hidden="true">${renderUiIcon("check")}</span>` : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderBrowserActionPermissionSettings(strings: ReturnType<typeof getUiStrings>): string {
  const selectedMode = getBrowserActionPermissionMode();
  return `
    <div class="browser-action-permission-control" id="setting-browser-action-permission-mode">
      ${BROWSER_ACTION_PERMISSION_MODES.map((mode) => {
        const copy = getBrowserActionPermissionCopy(mode, strings);
        const selected = mode === selectedMode;
        return `
          <button
            class="browser-action-permission-option ${mode} ${selected ? "selected" : ""}"
            type="button"
            aria-pressed="${selected ? "true" : "false"}"
            data-browser-action-permission-mode="${escapeAttribute(mode)}"
          >
            <span class="permission-mode-glyph" aria-hidden="true">${renderUiIcon(copy.icon)}</span>
            <span>
              <strong>${escapeHtml(copy.label)}</strong>
              <small>${escapeHtml(copy.description)}</small>
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderTopQuickActions(disabled = false): string {
  const strings = stringsForState();
  const disabledAttribute = disabled ? "disabled" : "";
  const summarizeTitle = strings.prompts.summarizePage;
  const infographicTitle = strings.prompts.createInfographicFromPage;

  return `
    <div class="top-quick-actions" aria-label="${escapeAttribute(strings.labels.quickActions)}">
      <button
        class="top-quick-action"
        type="button"
        data-top-quick-action="summarize-page"
        data-tooltip="${escapeAttribute(summarizeTitle)}"
        title="${escapeAttribute(summarizeTitle)}"
        aria-label="${escapeAttribute(summarizeTitle)}"
        ${disabledAttribute}
      >
        <span class="top-quick-action-icon top-quick-summary-icon" aria-hidden="true">
          ${renderUiIcon("menu")}
        </span>
      </button>
      <button
        class="top-quick-action infographic"
        type="button"
        data-top-quick-action="infographic"
        data-tooltip="${escapeAttribute(infographicTitle)}"
        title="${escapeAttribute(infographicTitle)}"
        aria-label="${escapeAttribute(infographicTitle)}"
        ${disabledAttribute}
      >
        <span class="top-quick-action-icon top-quick-chart-icon" aria-hidden="true">
          ${renderUiIcon("chart")}
        </span>
      </button>
    </div>
  `;
}

function renderAppMenuDotsIcon(): string {
  return renderUiIcon("more-vertical");
}

function renderAppMenuListIcon(): string {
  return renderUiIcon("list");
}

function renderAppMenuChatIcon(): string {
  return renderUiIcon("message");
}

function renderAppMenuContextIcon(): string {
  return renderUiIcon("panel");
}

function renderAppMenuSkillsIcon(): string {
  return renderUiIcon("zap");
}

function renderAppMenuPluginMcpIcon(): string {
  return renderUiIcon("globe");
}

function renderAppMenuSettingsIcon(): string {
  return renderUiIcon("settings");
}

function renderAuthOnboarding(
  strings: ReturnType<typeof getUiStrings>,
  nativeHostHealth: NativeHostHealth,
  codexBinaryHealth: CodexBinaryHealth,
): string {
  const readiness = resolveAuthOnboardingReadiness({
    nativeHostStatus: nativeHostHealth.status,
    codexBinaryStatus: codexBinaryHealth.status,
  });
  const disabledAttribute = readiness.canStartAuth ? "" : " disabled aria-disabled=\"true\"";

  return `
    <section class="auth-onboarding" aria-labelledby="auth-onboarding-title">
      <div class="auth-onboarding-card">
        <div class="auth-onboarding-icon" aria-hidden="true"></div>
        <div class="auth-onboarding-copy">
          <h1 id="auth-onboarding-title">${escapeHtml(strings.onboarding.title)}</h1>
          <p>${escapeHtml(strings.onboarding.subtitle)}</p>
        </div>
        <div class="auth-onboarding-readiness" aria-label="${escapeAttribute(strings.onboarding.runtimeTitle)}">
          <div class="auth-onboarding-readiness-title">${escapeHtml(strings.onboarding.runtimeTitle)}</div>
          ${readiness.steps
            .map((step) => renderAuthOnboardingRuntimeStep(strings, step, nativeHostHealth, codexBinaryHealth))
            .join("")}
        </div>
        ${
          readiness.canStartAuth
            ? ""
            : `<p class="auth-onboarding-warning">${escapeHtml(strings.onboarding.authDisabled)}</p>`
        }
        <div class="auth-onboarding-install">
          <div class="auth-onboarding-install-title">${escapeHtml(strings.onboarding.installTitle)}</div>
          <p>${escapeHtml(strings.onboarding.installBody)}</p>
          <code>${escapeHtml(strings.onboarding.sourceInstallCommand)}</code>
          <p>${escapeHtml(strings.onboarding.webOnlyUnavailable)}</p>
        </div>
        <div class="auth-onboarding-actions">
          <button id="onboarding-chatgpt-login" class="auth-onboarding-primary" type="button"${disabledAttribute}>
            ${escapeHtml(strings.onboarding.chatgptCta)}
          </button>
          <button id="onboarding-apikey-login" class="auth-onboarding-link" type="button"${disabledAttribute}>
            ${escapeHtml(strings.onboarding.apiCta)}
          </button>
        </div>
        <div class="auth-onboarding-runtime-actions">
          <button id="onboarding-reconnect" class="auth-onboarding-secondary" type="button">
            ${renderUiIcon("refresh")}
            <span>${escapeHtml(strings.onboarding.reconnectCta)}</span>
          </button>
          <button id="onboarding-open-settings" class="auth-onboarding-secondary" type="button">
            ${renderUiIcon("settings")}
            <span>${escapeHtml(strings.onboarding.settingsCta)}</span>
          </button>
        </div>
        <p class="auth-onboarding-note">${escapeHtml(strings.onboarding.bridgeNote)}</p>
        <p class="auth-onboarding-privacy">${escapeHtml(strings.onboarding.privacyNote)}</p>
      </div>
    </section>
  `;
}

function renderAuthOnboardingRuntimeStep(
  strings: ReturnType<typeof getUiStrings>,
  step: { id: "native-host" | "codex-binary" | "account"; state: "ready" | "blocked" | "pending" },
  nativeHostHealth: NativeHostHealth,
  codexBinaryHealth: CodexBinaryHealth,
): string {
  const icon = step.state === "ready" ? "check" : step.state === "blocked" ? "shield-alert" : "refresh";
  return `
    <div class="auth-runtime-step ${step.state}">
      <span class="auth-runtime-step-icon" aria-hidden="true">${renderUiIcon(icon)}</span>
      <span class="auth-runtime-step-label">${escapeHtml(
        getAuthOnboardingRuntimeStepLabel(strings, step.id, nativeHostHealth, codexBinaryHealth),
      )}</span>
    </div>
  `;
}

function getAuthOnboardingRuntimeStepLabel(
  strings: ReturnType<typeof getUiStrings>,
  stepId: "native-host" | "codex-binary" | "account",
  nativeHostHealth: NativeHostHealth,
  codexBinaryHealth: CodexBinaryHealth,
): string {
  if (stepId === "native-host") {
    if (nativeHostHealth.status === "setup-needed") {
      return strings.onboarding.nativeHostSetup;
    }
    if (nativeHostHealth.status === "reconnect") {
      return strings.onboarding.nativeHostReconnect;
    }
    return strings.onboarding.nativeHostReady;
  }

  if (stepId === "codex-binary") {
    if (codexBinaryHealth.status === "not-detected") {
      return strings.onboarding.codexBinaryMissing;
    }
    if (codexBinaryHealth.status === "pending") {
      return strings.onboarding.codexBinaryPending;
    }
    return strings.onboarding.codexBinaryReady;
  }

  return strings.onboarding.accountStep;
}

function renderUsageNoticeOnboarding(strings: ReturnType<typeof getUiStrings>): string {
  const items = [
    {
      icon: "panel" as const,
      title: strings.usageNotice.contextTitle,
      body: strings.usageNotice.contextBody,
    },
    {
      icon: "shield-check" as const,
      title: strings.usageNotice.sensitiveTitle,
      body: strings.usageNotice.sensitiveBody,
    },
    {
      icon: "hand" as const,
      title: strings.usageNotice.permissionsTitle,
      body: strings.usageNotice.permissionsBody,
    },
    {
      icon: "scan" as const,
      title: strings.usageNotice.safetyTitle,
      body: strings.usageNotice.safetyBody,
    },
    {
      icon: "code" as const,
      title: strings.usageNotice.openSourceTitle,
      body: strings.usageNotice.openSourceBody,
    },
  ];

  return `
    <section class="usage-notice-onboarding" aria-labelledby="usage-notice-title">
      <div class="usage-notice-shell">
        <div class="usage-notice-hero" aria-hidden="true">
          <span class="usage-notice-chrome-dot"></span>
          <span class="usage-notice-plus">+</span>
          <span class="usage-notice-codex-icon"></span>
        </div>
        <div class="usage-notice-copy">
          <p class="usage-notice-eyebrow">${escapeHtml(strings.usageNotice.eyebrow)}</p>
          <h1 id="usage-notice-title">${escapeHtml(strings.usageNotice.title)}</h1>
          <p>${escapeHtml(strings.usageNotice.subtitle)}</p>
        </div>
        <div class="usage-notice-card">
          ${items
            .map(
              (item) => `
                <article class="usage-notice-item">
                  <span class="usage-notice-item-icon" aria-hidden="true">${renderUiIcon(item.icon)}</span>
                  <span>
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(item.body)}</span>
                  </span>
                </article>
              `,
            )
            .join("")}
        </div>
        <button class="usage-notice-primary" type="button" data-usage-notice-accept>
          ${escapeHtml(strings.usageNotice.startCta)}
        </button>
        <p class="usage-notice-disclaimer">${escapeHtml(strings.usageNotice.disclaimer)}</p>
      </div>
    </section>
  `;
}

function renderPendingPermissionPrompt(strings: ReturnType<typeof getUiStrings>): string {
  if (!state.pendingPermission) {
    return "";
  }

  const message = toUserFacingPermissionRationale(state.pendingPermission.plan.rationale);
  const detail = state.pendingPermission.errorMessage
    ? strings.status.permissionPromptFailed(state.pendingPermission.errorMessage)
    : state.pendingPermission.retryMessage
      ? strings.status.permissionRetryAfterGrant
      : strings.status.permissionOpenManually;

  return `
    <section class="permission-prompt" role="status">
      <div>
        <strong>${escapeHtml(message)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      <button id="grant-pending-permission" class="permission-prompt-button" type="button">
        ${escapeHtml(strings.actions.grantSiteAccess)}
      </button>
    </section>
  `;
}

function renderNativeDialogs(strings: ReturnType<typeof getUiStrings>): string {
  return [renderPluginConnectionDialog(strings), renderNativeTextDialog(strings), renderNativeConfirmationDialog()]
    .filter(Boolean)
    .join("");
}

function renderPluginConnectionDialog(strings: ReturnType<typeof getUiStrings>): string {
  const dialog = state.pluginConnectionDialog;
  if (!dialog) {
    return "";
  }

  const icon = renderPluginConnectionDialogIcon(dialog);
  const actionLabel = dialog.installUrl ? strings.actions.connect : strings.actions.reload;
  return `
    <div class="plugin-connect-backdrop" role="presentation" data-plugin-connect-backdrop>
      <section class="plugin-connect-modal" role="dialog" aria-modal="true" aria-labelledby="plugin-connect-title">
        <button
          class="icon-button plugin-connect-close"
          type="button"
          data-plugin-connect-close
          aria-label="${escapeAttribute(strings.actions.closeProfileEditor)}"
        >
          ${renderUiIcon("x")}
        </button>
        <div class="plugin-connect-hero" aria-hidden="true">
          <span class="plugin-connect-brand">${renderUiIcon("code")}</span>
          <span class="plugin-connect-dots">•••</span>
          ${icon}
        </div>
        <header class="plugin-connect-title">
          <p>${escapeHtml(dialog.kind === "app" ? strings.labels.apps : strings.labels.plugins)}</p>
          <h2 id="plugin-connect-title">${escapeHtml(dialog.name)}</h2>
        </header>
        <div class="plugin-connect-policy">
          ${renderPluginConnectionNotice(strings.usageNotice.contextTitle, strings.usageNotice.contextBody)}
          ${renderPluginConnectionNotice(strings.usageNotice.sensitiveTitle, strings.usageNotice.sensitiveBody)}
          ${renderPluginConnectionNotice(strings.usageNotice.permissionsTitle, strings.usageNotice.permissionsBody)}
          ${renderPluginConnectionNotice(strings.usageNotice.safetyTitle, strings.usageNotice.safetyBody)}
          ${
            dialog.description
              ? renderPluginConnectionNotice(strings.labels.pluginMcp, dialog.description)
              : ""
          }
          ${renderPluginConnectionAccountNotice(dialog, strings)}
        </div>
        <footer class="plugin-connect-actions">
          <button class="plugin-connect-primary" type="button" data-plugin-connect-confirm>
            ${escapeHtml(actionLabel)}
          </button>
        </footer>
      </section>
    </div>
  `;
}

function renderPluginConnectionNotice(title: string, body: string): string {
  return `
    <section class="plugin-connect-notice">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </section>
  `;
}

function renderPluginConnectionAccountNotice(
  dialog: PluginConnectionDialogState,
  strings: ReturnType<typeof getUiStrings>,
): string {
  if (!dialog.installUrl || !dialog.accountEmail) {
    return "";
  }
  return renderPluginConnectionNotice(
    strings.usageNotice.appConnectionAccountTitle,
    strings.usageNotice.appConnectionAccountBody(dialog.accountEmail),
  );
}

function renderPluginConnectionDialogIcon(dialog: PluginConnectionDialogState): string {
  if (dialog.iconUrl && isSafeMessageImageUrl(dialog.iconUrl)) {
    return `<span class="plugin-connect-app-icon image"><img src="${escapeAttribute(dialog.iconUrl)}" alt="" loading="lazy" /></span>`;
  }
  const icon = dialog.kind === "app" ? "globe" : "code";
  return `<span class="plugin-connect-app-icon">${renderUiIcon(icon)}</span>`;
}

function renderNativeTextDialog(strings: ReturnType<typeof getUiStrings>): string {
  const dialog = state.nativeTextDialog;
  if (!dialog) {
    return "";
  }

  return `
    <div class="native-dialog-backdrop" role="presentation" data-native-text-backdrop>
      <form class="native-dialog-modal" role="dialog" aria-modal="true" aria-labelledby="native-text-dialog-title" data-native-text-dialog>
        <header class="native-dialog-header">
          <div>
            <h2 id="native-text-dialog-title">${escapeHtml(dialog.title)}</h2>
            <p>${escapeHtml(dialog.description)}</p>
          </div>
          <button class="icon-button native-dialog-close" type="button" data-native-text-cancel aria-label="${escapeAttribute(dialog.cancelLabel)}">
            ${renderUiIcon("x")}
          </button>
        </header>
        <label class="native-dialog-field">
          <span>${escapeHtml(dialog.label)}</span>
          <input
            id="native-text-input"
            class="native-dialog-input"
            type="${escapeAttribute(dialog.inputType)}"
            placeholder="${escapeAttribute(dialog.placeholder)}"
            autocomplete="off"
            spellcheck="false"
            ${dialog.submitting ? "disabled" : ""}
          />
        </label>
        ${dialog.error ? `<p class="native-dialog-error" role="alert">${escapeHtml(dialog.error)}</p>` : ""}
        <footer class="native-dialog-actions">
          <button class="settings-compact-button" type="button" data-native-text-cancel ${dialog.submitting ? "disabled" : ""}>${escapeHtml(
            dialog.cancelLabel,
          )}</button>
          <button class="settings-compact-button primary" type="submit" ${dialog.submitting ? "disabled" : ""}>${escapeHtml(
            dialog.submitting ? strings.actions.starting : dialog.confirmLabel,
          )}</button>
        </footer>
      </form>
    </div>
  `;
}

function renderNativeConfirmationDialog(): string {
  const dialog = state.nativeConfirmationDialog;
  if (!dialog) {
    return "";
  }

  return `
    <div class="native-dialog-backdrop" role="presentation" data-native-confirmation-backdrop>
      <section class="native-dialog-modal ${dialog.tone === "danger" ? "danger" : ""}" role="dialog" aria-modal="true" aria-labelledby="native-confirmation-title">
        <header class="native-dialog-header">
          <div>
            <h2 id="native-confirmation-title">${escapeHtml(dialog.title)}</h2>
            <p>${escapeHtml(dialog.message)}</p>
          </div>
        </header>
        <footer class="native-dialog-actions">
          <button class="settings-compact-button" type="button" id="native-confirmation-cancel">${escapeHtml(dialog.cancelLabel)}</button>
          <button class="settings-compact-button primary" type="button" id="native-confirmation-approve">${escapeHtml(dialog.confirmLabel)}</button>
        </footer>
      </section>
    </div>
  `;
}

function renderComposerModelDropdownControl(
  strings: ReturnType<typeof getUiStrings>,
  selectedModelOption: CodexModelOption | null,
): string {
  const efforts = selectedModelOption?.reasoningEfforts ?? DEFAULT_REASONING_EFFORTS;
  const selectedEffort = normalizeReasoningEffort(
    state.selectedReasoningEffort,
    efforts,
    selectedModelOption?.defaultReasoningEffort ?? "",
  );
  const selectedServiceTier = normalizeServiceTier(
    state.selectedServiceTier,
    selectedModelOption?.additionalSpeedTiers ?? [],
  );
  const modelLabel = renderModelChipLabel(strings, selectedModelOption);
  const compactModelLabel = formatCompactModelLabel(modelLabel);
  const reasoningLabel = selectedEffort ? formatReasoningEffortLabel(selectedEffort, state.uiLocale) : "";
  const speedTierActive = isSpeedServiceTier(selectedServiceTier);

  return `
    <div class="composer-model-reasoning-group ${state.composerModelMenuOpen ? "open" : ""}">
      <button
        id="composer-model-menu-trigger"
        class="composer-model-menu-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded="${state.composerModelMenuOpen ? "true" : "false"}"
        aria-label="${escapeAttribute(`${strings.labels.currentModel}: ${modelLabel}. ${strings.labels.reasoningEffort}: ${reasoningLabel}`)}"
      >
        ${state.modelCatalogState === "loading" ? `<span class="composer-model-spinner" aria-hidden="true"></span>` : ""}
        ${speedTierActive ? `<span class="composer-model-flash" aria-hidden="true">${renderComposerLightningIcon()}</span>` : ""}
        <span class="composer-model-trigger-label">${escapeHtml(compactModelLabel)}</span>
        ${reasoningLabel ? `<span class="composer-model-trigger-effort">${escapeHtml(reasoningLabel)}</span>` : ""}
        <span class="composer-select-caret" aria-hidden="true">${renderChevronDownIcon()}</span>
      </button>
      ${
        state.composerModelMenuOpen
          ? renderComposerModelDropdown(strings, selectedModelOption, selectedEffort, efforts, selectedServiceTier)
          : ""
      }
    </div>
  `;
}

function isSpeedServiceTier(serviceTier: string): boolean {
  return serviceTier === "fast";
}

function renderComposerLightningIcon(): string {
  return renderUiIcon("zap");
}

function renderChevronDownIcon(): string {
  return renderUiIcon("chevron-down");
}

function renderComposerModelDropdown(
  strings: ReturnType<typeof getUiStrings>,
  selectedModelOption: CodexModelOption | null,
  selectedEffort: string,
  efforts: string[],
  selectedServiceTier: string,
): string {
  const intelligenceLabel = strings.labels.intelligence;
  const speedLabel = strings.labels.speed;
  const modelSectionLabel = strings.labels.model;
  const reasoningDescriptions = new Map(
    (selectedModelOption?.reasoningEffortOptions ?? []).map((option) => [option.effort, option.description]),
  );
  const speedTiers = selectedModelOption?.additionalSpeedTiers ?? [];
  const unavailableLabel = renderModelChipLabel(strings, selectedModelOption);
  const modelRows =
    state.modelCatalogState === "ready" && state.models.length
      ? state.models
          .map((model) => renderComposerModelMenuRow(model, selectedModelOption, strings))
          .join("")
      : `
          <div class="composer-model-menu-row disabled" data-composer-model-row>
            <span class="composer-model-menu-copy">
              <strong>${escapeHtml(unavailableLabel)}</strong>
              ${state.modelCatalogErrorMessage ? `<span>${escapeHtml(state.modelCatalogErrorMessage)}</span>` : ""}
            </span>
          </div>
        `;

  return `
    <div class="composer-model-dropdown" role="menu" aria-label="${escapeAttribute(strings.labels.currentModel)}">
      <section class="composer-model-menu-section" aria-label="${escapeAttribute(intelligenceLabel)}">
        <p class="composer-model-menu-title">${escapeHtml(intelligenceLabel)}</p>
        ${efforts
          .map((effort) => {
            const selected = effort === selectedEffort;
            return `
              <button
                class="composer-model-menu-row reasoning ${selected ? "selected" : ""}"
                type="button"
                role="menuitemradio"
                aria-checked="${selected ? "true" : "false"}"
                data-composer-reasoning-option="${escapeAttribute(effort)}"
              >
                <span class="composer-model-menu-copy">
                  <strong>${escapeHtml(formatReasoningEffortLabel(effort, state.uiLocale))}</strong>
                  ${reasoningDescriptions.get(effort) ? `<span>${escapeHtml(reasoningDescriptions.get(effort) ?? "")}</span>` : ""}
                </span>
                ${selected ? `<span class="composer-model-menu-check" aria-hidden="true">${renderUiIcon("check")}</span>` : ""}
              </button>
            `;
          })
          .join("")}
      </section>
      ${
        speedTiers.length
          ? `
            <div class="composer-model-menu-divider" role="separator"></div>
            <section class="composer-model-menu-section" aria-label="${escapeAttribute(speedLabel)}">
              <p class="composer-model-menu-title">${escapeHtml(speedLabel)}</p>
              ${["", ...speedTiers]
                .map((tier) => {
                  const selected = tier === selectedServiceTier;
                  const speedTier = isSpeedServiceTier(tier);
                  return `
                    <button
                      class="composer-model-menu-row speed ${speedTier ? "has-icon" : ""} ${selected ? "selected" : ""}"
                      type="button"
                      role="menuitemradio"
                      aria-checked="${selected ? "true" : "false"}"
                      data-composer-service-tier="${escapeAttribute(tier)}"
                    >
                      ${speedTier ? `<span class="composer-model-menu-speed-icon" aria-hidden="true">${renderComposerLightningIcon()}</span>` : ""}
                      <span class="composer-model-menu-copy">
                        <strong>${escapeHtml(formatServiceTierLabel(tier, state.uiLocale))}</strong>
                      </span>
                      ${selected ? `<span class="composer-model-menu-check" aria-hidden="true">${renderUiIcon("check")}</span>` : ""}
                    </button>
                  `;
                })
                .join("")}
            </section>
          `
          : ""
      }
      <div class="composer-model-menu-divider" role="separator"></div>
      <section class="composer-model-menu-section" aria-label="${escapeAttribute(modelSectionLabel)}">
        <p class="composer-model-menu-title">${escapeHtml(modelSectionLabel)}</p>
        ${modelRows}
      </section>
    </div>
  `;
}

function renderComposerModelMenuRow(
  model: CodexModelOption,
  selectedModelOption: CodexModelOption | null,
  strings: ReturnType<typeof getUiStrings>,
): string {
  const selected = model.id === (selectedModelOption?.id ?? "");
  const description = model.description || (model.isDefault ? strings.labels.defaultModel : model.id);
  return `
    <button
      class="composer-model-menu-row model ${selected ? "selected" : ""}"
      type="button"
      role="menuitemradio"
      aria-checked="${selected ? "true" : "false"}"
      data-composer-model-row
      data-composer-model-option="${escapeAttribute(model.id)}"
    >
      <span class="composer-model-menu-copy">
        <strong>${escapeHtml(model.label)}</strong>
        <span>${escapeHtml(description)}</span>
      </span>
      ${selected ? `<span class="composer-model-menu-check" aria-hidden="true">${renderUiIcon("check")}</span>` : `<span class="composer-model-menu-chevron" aria-hidden="true">${renderUiIcon("chevron-right")}</span>`}
    </button>
  `;
}

function formatCompactModelLabel(label: string): string {
  const trimmed = label.trim();
  const gptMatch = /^gpt[-\s]*([0-9]+(?:\.[0-9]+)?)(?:[-\s]*(.+))?$/i.exec(trimmed);
  if (!gptMatch) {
    return trimmed;
  }

  const version = gptMatch[1] ?? trimmed;
  const variant = gptMatch[2] ?? "";
  const normalizedVariant = variant
    .replace(/^codex[-\s]*spark$/i, "Spark")
    .replace(/^codex$/i, "Codex")
    .replace(/^mini$/i, "Mini")
    .replace(/[-_]+/g, " ")
    .trim();

  return normalizedVariant ? `${version} ${normalizedVariant}` : version;
}

function renderMentionTabPicker(
  strings: ReturnType<typeof getUiStrings>,
  tabs: OpenTabContext[],
  mentionOptions: ReturnType<typeof listMentionOptions>,
  activeIndex: number,
): string {
  const header = renderTabMentionHeader(strings);
  const openTabsOption = mentionOptions.find(
    (option): option is Extract<MentionOption, { kind: "context" }> =>
      option.kind === "context" && option.contextId === "open-tabs",
  );
  const structuredMentionOptions = mentionOptions.filter(isStructuredMentionOption);
  const structuredSearchHint = structuredMentionOptions.length ? "" : renderMentionStructuredSearchHint(strings);

  if (state.openTabOptionsState === "loading") {
    return `<div class="suggestions tab-mention-popover">${header}<div class="tab-mention-status">${escapeHtml(strings.status.tabPickerLoading)}</div>${structuredSearchHint}${renderMentionStructuredSections(strings, structuredMentionOptions, activeIndex, 0)}</div>`;
  }

  if (state.openTabOptionsState === "permission" || state.openTabOptionsState === "idle") {
    const actionHtml = openTabsOption
      ? `<button class="tab-mention-action${getMentionKeyboardActiveClass(0, activeIndex)}" data-tab-picker-action="grant" aria-selected="${0 === activeIndex ? "true" : "false"}">
          <strong>${escapeHtml(`@${openTabsOption.contextId}`)}</strong>
          <span>${escapeHtml(strings.status.tabPickerPermission)}</span>
        </button>`
      : "";
    const pluginStartIndex = openTabsOption ? 1 : 0;
    const emptyStatus =
      !actionHtml && !structuredMentionOptions.length ? `<div class="tab-mention-status">${escapeHtml(strings.status.tabPickerEmpty)}</div>` : "";
    return `
      <div class="suggestions tab-mention-popover">
        ${header}
        ${actionHtml}
        ${emptyStatus}
        ${structuredSearchHint}
        ${renderMentionStructuredSections(strings, structuredMentionOptions, activeIndex, pluginStartIndex)}
      </div>
    `;
  }

  if (state.openTabOptionsState === "error") {
    const actionHtml = openTabsOption
      ? `<button class="tab-mention-action${getMentionKeyboardActiveClass(0, activeIndex)}" data-tab-picker-action="grant" aria-selected="${0 === activeIndex ? "true" : "false"}">
          <strong>${escapeHtml(strings.actions.refresh)}</strong>
          <span>${escapeHtml(state.openTabOptionsError || strings.status.tabPickerEmpty)}</span>
        </button>`
      : "";
    const pluginStartIndex = openTabsOption ? 1 : 0;
    const emptyStatus =
      !actionHtml && !structuredMentionOptions.length ? `<div class="tab-mention-status">${escapeHtml(strings.status.tabPickerEmpty)}</div>` : "";
    return `
      <div class="suggestions tab-mention-popover">
        ${header}
        ${actionHtml}
        ${emptyStatus}
        ${structuredSearchHint}
        ${renderMentionStructuredSections(strings, structuredMentionOptions, activeIndex, pluginStartIndex)}
      </div>
    `;
  }

  if (tabs.length === 0) {
    const emptyStatus = structuredMentionOptions.length ? "" : `<div class="tab-mention-status">${escapeHtml(strings.status.tabPickerEmpty)}</div>`;
    return `<div class="suggestions tab-mention-popover">${header}${emptyStatus}${structuredSearchHint}${renderMentionStructuredSections(strings, structuredMentionOptions, activeIndex, 0)}</div>`;
  }

  return `
    <div class="suggestions tab-mention-popover">
      ${header}
      ${tabs
        .map((tab, rowIndex) => {
          const selected = state.selectedTabIds.includes(tab.tabId);
          return `
            <button
              class="tab-mention-row ${selected ? "selected" : ""}${getMentionKeyboardActiveClass(rowIndex, activeIndex)}"
              data-tab-mention-id="${tab.tabId}"
              aria-pressed="${selected ? "true" : "false"}"
              aria-selected="${rowIndex === activeIndex ? "true" : "false"}"
            >
              ${renderTabMentionIcon(tab)}
              <span class="tab-mention-copy">
                <strong>${escapeHtml(tab.title || formatTabMentionUrl(tab.url))}</strong>
                <span>${escapeHtml(formatTabMentionUrl(tab.url))}</span>
              </span>
              <span class="tab-mention-check" aria-hidden="true">${selected ? renderUiIcon("check") : ""}</span>
            </button>
          `;
        })
        .join("")}
      ${structuredSearchHint}
      ${renderMentionStructuredSections(strings, structuredMentionOptions, activeIndex, tabs.length)}
    </div>
  `;
}

function renderMentionStructuredSearchHint(strings: ReturnType<typeof getUiStrings>): string {
  if ((state.mentionQuery ?? "").trim()) {
    return "";
  }
  return `<div class="tab-mention-structured-hint">${escapeHtml(`${strings.labels.apps} / ${strings.labels.plugins} / ${strings.roles.skill} · @${strings.actions.search}`)}</div>`;
}

function renderMentionStructuredSections(
  strings: ReturnType<typeof getUiStrings>,
  options: StructuredMentionOption[],
  activeIndex: number,
  startIndex: number,
): string {
  if (!options.length) {
    return "";
  }
  let rowIndex = startIndex;
  return groupStructuredMentionOptions(options)
    .map((group) => {
      const label = getStructuredMentionKindLabel(group.kind, strings);
      return `
        <div class="tab-mention-structured-section" aria-label="${escapeAttribute(label)}">
          <div class="tab-mention-structured-hint">${escapeHtml(label)}</div>
          ${group.options
            .map((option) => {
              const currentIndex = rowIndex;
              rowIndex += 1;
              return `
                <button
                  class="tab-mention-row structured-mention-row ${escapeAttribute(option.kind)}${getMentionKeyboardActiveClass(currentIndex, activeIndex)}"
                  data-mention-option-id="${escapeAttribute(option.id)}"
                  data-mention-kind="${escapeAttribute(option.kind)}"
                  aria-selected="${currentIndex === activeIndex ? "true" : "false"}"
                >
                  ${renderMentionStructuredIcon(option)}
                  <span class="tab-mention-copy">
                    <strong>${escapeHtml(option.label)}</strong>
                    <span>${escapeHtml(option.description)}</span>
                  </span>
                  <span class="tab-mention-check" aria-hidden="true">${renderUiIcon("plus")}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      `;
    })
    .join("");
}

function getMentionKeyboardActiveClass(index: number, activeIndex: number): string {
  return index === activeIndex ? " keyboard-active" : "";
}

function groupStructuredMentionOptions(
  options: StructuredMentionOption[],
): Array<{ kind: StructuredMentionOption["kind"]; options: StructuredMentionOption[] }> {
  const groups: Array<{ kind: StructuredMentionOption["kind"]; options: StructuredMentionOption[] }> = [];
  for (const option of options) {
    const group = groups.find((item) => item.kind === option.kind);
    if (group) {
      group.options.push(option);
    } else {
      groups.push({ kind: option.kind, options: [option] });
    }
  }
  return groups;
}

function getStructuredMentionKindLabel(
  kind: StructuredMentionOption["kind"],
  strings: ReturnType<typeof getUiStrings>,
): string {
  switch (kind) {
    case "app":
      return strings.roles.app;
    case "plugin":
      return strings.roles.plugin;
    case "skill":
      return strings.roles.skill;
    default:
      return strings.labels.attachedContext;
  }
}

function renderMentionStructuredIcon(option: StructuredMentionOption): string {
  const iconUrl = option.structuredInput.type === "mention" ? (option.structuredInput.iconUrl ?? "") : "";
  if (iconUrl && isSafeMessageImageUrl(iconUrl)) {
    return `
      <span class="tab-mention-icon image" aria-hidden="true">
        <img src="${escapeAttribute(iconUrl)}" alt="" loading="lazy" />
      </span>
    `;
  }
  const icon = option.kind === "app" ? "globe" : option.kind === "skill" ? "zap" : "code";
  return `<span class="tab-mention-icon fallback-web" aria-hidden="true">${renderUiIcon(icon)}</span>`;
}

function renderTabMentionHeader(strings: ReturnType<typeof getUiStrings>): string {
  const selectedCount = state.selectedTabIds.length;
  const doneLabel = strings.actions.done;
  const countLabel =
    selectedCount > 0
      ? strings.status.selectedCount(selectedCount)
      : strings.labels.multipleTabsSelectable;
  return `
    <div class="tab-mention-header">
      <span>${escapeHtml(strings.labels.recentTabs)}</span>
      <span class="tab-mention-header-count">${escapeHtml(countLabel)}</span>
      <button
        class="tab-mention-done"
        data-tab-mention-done
        type="button"
        ${selectedCount > 0 ? "" : "disabled"}
      >${escapeHtml(doneLabel)}</button>
    </div>
  `;
}

function renderTabMentionIcon(tab: OpenTabContext): string {
  if (tab.favIconUrl) {
    return `<span class="tab-mention-icon image"><img src="${escapeAttribute(tab.favIconUrl)}" alt="" loading="lazy" /></span>`;
  }
  return `<span class="tab-mention-icon fallback-web">${renderUiIcon("globe", "tab-reference-lucide-icon")}</span>`;
}

function renderPanelModeIcon(isPopup: boolean): string {
  return renderUiIcon(isPopup ? "panel" : "external-link");
}

function renderSlashCommandPopover(
  strings: ReturnType<typeof getUiStrings>,
  slashOptions: SlashCommandOption[],
  activeIndex: number,
): string {
  return `<div class="suggestions command-popover" role="listbox" aria-label="${escapeAttribute(strings.labels.quickSkills)}">
    ${
      slashOptions.length
        ? slashOptions
            .map(
              (option, index) =>
                `<button class="suggestion ${option.kind} ${option.active ? "active" : ""} ${
                  index === activeIndex ? "keyboard-active" : ""
                }" data-slash-option-id="${escapeAttribute(
                  option.id,
                )}" aria-selected="${index === activeIndex ? "true" : "false"}">
                  ${renderSlashCommandIcon(option)}
                  <span class="suggestion-copy">
                    <strong>${escapeHtml(option.label)}</strong>
                  </span>
                </button>`,
            )
            .join("")
        : `<div class="suggestion command-empty" role="status">
            <span class="suggestion-icon" aria-hidden="true">/</span>
            <span class="suggestion-copy">
              <strong>${escapeHtml(strings.status.slashCommandEmpty)}</strong>
              <span>${escapeHtml(strings.help.quickSkills)}</span>
            </span>
          </div>`
    }
  </div>`;
}

function renderSlashCommandIcon(option: SlashCommandOption): string {
  const visual = option.visual;
  const color = normalizeProfileColorForUi(visual?.color);
  return `
    <span class="suggestion-icon ${option.kind}" ${
      color ? `style="--profile-color: ${escapeAttribute(color)}"` : ""
    } aria-hidden="true">
      ${renderProfileIcon(visual?.icon)}
    </span>
  `;
}

function renderComposerCommandPills(): string {
  if (!state.composerCommandPills.length) {
    return "";
  }
  return state.composerCommandPills.map((pill) => renderComposerCommandPill(pill)).join("");
}

function renderComposerDictationPanel(strings: ReturnType<typeof getUiStrings>): string {
  const doneLabel = strings.actions.done;
  return `
    <div class="composer-dictation-panel" role="group" aria-label="${escapeAttribute(strings.actions.voiceInput)}">
      <span class="composer-dictation-plus" aria-hidden="true">${renderUiIcon("plus")}</span>
      <div class="composer-dictation-waveform" aria-hidden="true">
        ${renderComposerVoiceWaveform()}
      </div>
      <button
        id="voice-dictation-cancel"
        class="composer-dictation-action"
        type="button"
        title="${escapeAttribute(strings.actions.cancelEdit)}"
        aria-label="${escapeAttribute(strings.actions.cancelEdit)}"
      >${renderUiIcon("x")}</button>
      <button
        id="voice-dictation-confirm"
        class="composer-dictation-action confirm"
        type="button"
        title="${escapeAttribute(doneLabel)}"
        aria-label="${escapeAttribute(doneLabel)}"
      >${renderUiIcon("check")}</button>
    </div>
  `;
}

function renderComposerVoiceWaveform(): string {
  return composerVoiceInputWaveformLevels
    .map((level, index) => {
      const normalized = Math.max(0.06, Math.min(1, level));
      return `<span class="composer-waveform-bar" style="--bar-level: ${normalized.toFixed(3)}" data-bar-index="${index}"></span>`;
    })
    .join("");
}

function getComposerInputRowClasses(): string {
  const classes: string[] = [];
  if (state.composerCommandPills.length) {
    classes.push("has-command");
  }
  if (state.composerCommandPills.some((pill) => pill.kind === "profile")) {
    classes.push("has-profile-command");
  }
  return classes.join(" ");
}

function renderComposerCommandPill(pill: ComposerCommandPill): string {
  const strings = getUiStrings(state.uiLocale);
  const visual = getProfileVisualById(pill.id);
  const color = normalizeProfileColorForUi(visual?.color);
  return `
    <span
      class="composer-command-pill ${pill.kind}"
      data-composer-command-pill="${escapeAttribute(pill.id)}"
      data-composer-command-kind="${escapeAttribute(pill.kind)}"
      ${color ? `style="--profile-color: ${escapeAttribute(color)}"` : ""}
    >
      ${renderProfileIcon(visual?.icon)}
      <span>${escapeHtml(pill.label)}</span>
      <button
        type="button"
        class="composer-command-pill-remove"
        data-remove-composer-command-pill="${escapeAttribute(pill.id)}"
        data-remove-composer-command-kind="${escapeAttribute(pill.kind)}"
        aria-label="${escapeAttribute(strings.actions.resetProfile)}"
        title="${escapeAttribute(strings.actions.resetProfile)}"
      >
        ${renderUiIcon("x")}
      </button>
    </span>
  `;
}

function renderAttachmentMenu(strings: ReturnType<typeof getUiStrings>): string {
  const items = listAttachmentMenuItems(state.uiLocale);
  return `
    <div class="attachment-menu" role="menu" aria-label="${escapeAttribute(strings.actions.attachFiles)}">
      ${items
        .map(
          (item) => `
            <button
              class="attachment-menu-item"
              data-attachment-menu-action="${escapeAttribute(item.action)}"
              role="menuitem"
            >
              ${renderAttachmentMenuIcon(item.icon)}
              <span>${escapeHtml(item.label)}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderAttachmentMenuIcon(icon: ReturnType<typeof listAttachmentMenuItems>[number]["icon"]): string {
  const icons: Record<typeof icon, UiIconName> = {
    paperclip: "paperclip",
    video: "video",
    scan: "scan",
    bookmark: "bookmark",
  };
  return renderUiIcon(icons[icon], "attachment-menu-icon");
}

function renderPinnedActionSuggestions(strings: ReturnType<typeof getUiStrings>, disabled = false): string {
  const cards = getPinnedSuggestionCards();
  if (!cards.length) {
    return "";
  }
  const disabledAttribute = disabled ? "disabled" : "";

  return `
    <section class="site-suggestion-rail" aria-label="${escapeAttribute(strings.labels.actionCards)}">
      ${cards
        .map(
          (card) => `
            <button class="site-suggestion action-card" data-action="${escapeAttribute(card.id)}" ${disabledAttribute}>
              ${renderSuggestionCardIcon(card)}
              <span class="site-suggestion-copy">
                <strong title="${escapeAttribute(card.prompt ?? renderActionCardTitle(strings, card))}">${escapeHtml(renderActionCardTitle(strings, card))}</strong>
              </span>
            </button>
          `,
        )
        .join("")}
    </section>
  `;
}

function getPinnedSuggestionCards(): ActionCard[] {
  const selectedProfile = state.profiles.find((profile) => profile.id === state.selectedProfileId) ?? null;
  const profileCards = createProfileSuggestionCards({
    profile: selectedProfile,
    currentTab: state.currentTabReference,
    locale: state.uiLocale,
  });
  const customCards = inferCustomSiteSuggestionCards(
    state.currentTabReference,
    state.settings.customSiteSuggestions,
  );
  const imageCards = createImageAttachmentSuggestionCards({
    attachments: state.fileAttachments,
    locale: state.uiLocale,
  });
  return mergeProfileAndSiteSuggestionCards([...imageCards, ...profileCards], [...customCards, ...state.actionCards], 4);
}

function renderSuggestionCardIcon(card: ActionCard): string {
  if (isImageAttachmentSuggestionCard(card)) {
    return `
      <span class="site-suggestion-site-icon attachment-image" aria-hidden="true">
        ${renderUiIcon("image")}
      </span>
    `;
  }
  if (getSuggestionCardSource(card) === "profile") {
    const selectedProfile = state.profiles.find((profile) => profile.id === state.selectedProfileId) ?? null;
    return renderProfileSuggestionIcon(selectedProfile);
  }
  return renderSiteSuggestionIcon(state.currentTabReference);
}

function isImageAttachmentSuggestionCard(card: Pick<ActionCard, "id">): boolean {
  return card.id === IMAGE_ATTACHMENT_PROMPT_EXTRACT_ACTION_ID || card.id === IMAGE_ATTACHMENT_DESCRIBE_ACTION_ID;
}

function renderProfileSuggestionIcon(profile: ProfileTemplate | null): string {
  const visual = profile?.visual ?? {};
  const color = normalizeProfileColorForUi(visual.color);
  return `
    <span class="site-suggestion-site-icon profile" style="--profile-color: ${escapeAttribute(color)}" aria-hidden="true">
      ${
        visual.imageDataUrl
          ? `<img src="${escapeAttribute(visual.imageDataUrl)}" alt="" />`
          : renderProfileIcon(visual.icon ?? DEFAULT_PROFILE_VISUAL_ICON)
      }
    </span>
  `;
}

function renderSiteSuggestionIcon(tab: OpenTabContext | null): string {
  if (tab?.favIconUrl) {
    return `<span class="site-suggestion-site-icon image"><img src="${escapeAttribute(tab.favIconUrl)}" alt="" loading="lazy" /></span>`;
  }

  const url = tab?.url ?? "";
  if (isYouTubeLikeUrl(url)) {
    return `
      <span class="site-suggestion-site-icon youtube" aria-hidden="true">
        ${renderUiIcon("video")}
      </span>
    `;
  }

  const label = tab?.title || tab?.url || "Site";
  return `<span class="site-suggestion-site-icon fallback">${escapeHtml(getTabReferenceInitial(label))}</span>`;
}

function isYouTubeLikeUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
  } catch {
    return /youtube|youtu\.be/i.test(url);
  }
}

function renderActionCardTitle(strings: ReturnType<typeof getUiStrings>, card: ActionCard): string {
  const localizedTitle = (strings.actionCards as Record<string, string | undefined>)[card.id];
  return localizedTitle?.trim() || card.title;
}

function renderChatView(strings: ReturnType<typeof getUiStrings>): string {
  const renderableMessages = state.messages.filter(shouldRenderConversationMessage);
  const { visibleMessages, hiddenCount } = getChatMessageWindow(renderableMessages, state.chatMessageWindowSize);
  const pendingProfileQuestionHtml = renderPendingProfileQuestionCard({
    pending: state.pendingProfileQuestion,
    uiLocale: state.uiLocale,
    fallbackProfileLabel: strings.labels.profile,
    canSubmit: canSendCurrentComposerMessage(),
  });
  const isEmpty = visibleMessages.length === 0 && !pendingProfileQuestionHtml;
  const promptActivityHtml = renderPromptActivity();
  const { beforePromptActivityMessages, afterPromptActivityMessages } = partitionPromptActivityMessages(visibleMessages);

  return `
    <div class="chat-view ${isEmpty ? "empty" : ""}">
      <div class="chat-scroll ${isEmpty ? "empty" : ""}" id="chat-scroll" data-scroll-key="chat-scroll">
        ${
          isEmpty
            ? `
              <section class="empty-hero">
                <div class="empty-hero-icon" aria-hidden="true"></div>
                <div class="empty-hero-copy">
                  <h2 class="hero-title">${escapeHtml(strings.help.heroPrompt)}</h2>
                  <p class="hero-hint">${escapeHtml(strings.help.heroHint)}</p>
                </div>
              </section>
            `
            : ""
        }
        ${
          !isEmpty
            ? `
              <section class="message-stream" id="messages">
                ${
                  hiddenCount > 0
                    ? `<div class="older-messages-sentinel" data-older-messages-hidden="${hiddenCount}" aria-hidden="true"></div>`
                    : ""
                }
                ${beforePromptActivityMessages.map((message) => renderConversationMessage(message)).join("")}
                ${promptActivityHtml}
                ${pendingProfileQuestionHtml}
                ${afterPromptActivityMessages.map((message) => renderConversationMessage(message)).join("")}
              </section>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function partitionPromptActivityMessages(messages: ConversationMessage[]): {
  beforePromptActivityMessages: ConversationMessage[];
  afterPromptActivityMessages: ConversationMessage[];
} {
  if (!getCurrentPromptActivityForRender()) {
    return { beforePromptActivityMessages: messages, afterPromptActivityMessages: [] };
  }
  const promptAnchorIndex = findPromptActivityAnchorIndex(messages);
  if (promptAnchorIndex >= 0) {
    return {
      beforePromptActivityMessages: messages.slice(0, promptAnchorIndex + 1),
      afterPromptActivityMessages: messages.slice(promptAnchorIndex + 1),
    };
  }

  const beforePromptActivityMessages: ConversationMessage[] = [];
  const afterPromptActivityMessages: ConversationMessage[] = [];
  for (const message of messages) {
    if (isPromptActivitySupplementMessage(message)) {
      afterPromptActivityMessages.push(message);
    } else {
      beforePromptActivityMessages.push(message);
    }
  }
  return { beforePromptActivityMessages, afterPromptActivityMessages };
}

function findPromptActivityAnchorIndex(messages: ConversationMessage[]): number {
  if (state.activePromptUserMessageId) {
    const activeIndex = messages.findIndex((message) => message.id === state.activePromptUserMessageId);
    if (activeIndex >= 0) {
      return activeIndex;
    }
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }
  return -1;
}

function isPromptActivitySupplementMessage(
  message: ConversationMessage,
): boolean {
  return isActiveTurnTraceMessage(message) || isCurrentPromptActivityPendingImageMessage(message) || isCurrentStreamingAssistantMessage(message);
}

function isCurrentStreamingAssistantMessage(message: ConversationMessage): boolean {
  return message.role === "assistant" && state.streamingAssistantMessageIds.has(message.id);
}

function resolveActivePromptUserMessageIdForSend(userMessageId: string, sendAsTurnSteer: boolean): string {
  if (!sendAsTurnSteer) {
    return userMessageId;
  }
  if (state.activePromptUserMessageId && state.messages.some((message) => message.id === state.activePromptUserMessageId)) {
    return state.activePromptUserMessageId;
  }
  return findLatestUserMessageId(state.messages) ?? userMessageId;
}

function findLatestUserMessageId(messages: ConversationMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message.id;
    }
  }
  return null;
}

function setActivePromptUserMessageId(messageId: string): void {
  state.activePromptUserMessageId = messageId;
  if (state.currentConversationId) {
    activePromptUserMessageIdsByConversationId.set(state.currentConversationId, messageId);
  }
}

function clearActivePromptUserMessageId(): void {
  const conversationId = state.currentConversationId;
  state.activePromptUserMessageId = "";
  if (conversationId) {
    activePromptUserMessageIdsByConversationId.delete(conversationId);
  }
}

function isActiveTurnTraceMessage(message: ConversationMessage): boolean {
  const activeTurn = state.activeTurn;
  if (!activeTurn?.threadId || !activeTurn.turnId || !isTraceOnlyAssistantMessage(message)) {
    return false;
  }
  return message.id === createTurnTraceMessageId(activeTurn.threadId, activeTurn.turnId);
}

function normalizePromptStatusClientRequestId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolvePromptStatusClientRequestId(eventClientRequestId: string): string {
  return eventClientRequestId || state.promptActivity?.clientRequestId || "";
}

function isPromptStatusForActiveRequest(eventClientRequestId: string, resolvedClientRequestId: string): boolean {
  if (!resolvedClientRequestId) {
    return false;
  }
  if (!state.promptActivity) {
    return Boolean(eventClientRequestId);
  }
  if (eventClientRequestId && state.promptActivity.clientRequestId !== eventClientRequestId) {
    return false;
  }
  return state.promptActivity.clientRequestId === resolvedClientRequestId;
}

function isCurrentPromptActivityPendingImageMessage(message: ConversationMessage): boolean {
  const clientRequestId = state.promptActivity?.clientRequestId;
  if (!clientRequestId) {
    return false;
  }
  const pendingMessageId = pendingImageWorkflowMessageIdsByRequest.get(clientRequestId);
  return Boolean(pendingMessageId && message.id === pendingMessageId && isPendingImageMessage(message));
}

function createContextCompactionNoticeKey(input: {
  clientRequestId?: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
}): string {
  if (input.clientRequestId) {
    return `client:${input.clientRequestId}`;
  }
  const eventKey = [input.threadId, input.turnId, input.itemId].filter(Boolean).join(":");
  return eventKey || "context-compaction";
}

function upsertContextCompactionNotice(
  key: string,
  noticeState: NonNullable<ConversationMessage["notice"]>["state"],
): void {
  let messageId = contextCompactionNoticeIdsByKey.get(key);
  if (!messageId) {
    messageId = findRunningContextCompactionNotice()?.id;
  }
  if (!messageId) {
    contextCompactionNoticeCounter += 1;
    messageId = `context-compaction-${Date.now()}-${contextCompactionNoticeCounter}`;
    state.messages.push(createContextCompactionNoticeMessage(messageId, noticeState));
  } else {
    const message = state.messages.find((entry) => entry.id === messageId);
    if (message) {
      message.notice = {
        type: "context-compaction",
        state: noticeState,
        automatic: true,
      };
      message.text = "";
      message.role = "assistant";
    } else {
      state.messages.push(createContextCompactionNoticeMessage(messageId, noticeState));
    }
  }
  contextCompactionNoticeIdsByKey.set(key, messageId);
}

function findRunningContextCompactionNotice(): ConversationMessage | undefined {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (!message) {
      continue;
    }
    if (message.notice?.type === "context-compaction" && message.notice.state === "running") {
      return message;
    }
  }
  return undefined;
}

function createContextCompactionNoticeMessage(
  id: string,
  noticeState: NonNullable<ConversationMessage["notice"]>["state"],
): ConversationMessage {
  return {
    id,
    role: "assistant",
    text: "",
    notice: {
      type: "context-compaction",
      state: noticeState,
      automatic: true,
    },
  };
}

function renderScrollToBottomButton(): string {
  const label = stringsForState().actions.jumpToLatest;
  return `
    <button
      id="scroll-to-bottom"
      class="scroll-to-bottom-button"
      type="button"
      aria-label="${escapeAttribute(label)}"
      title="${escapeAttribute(label)}"
      tabindex="-1"
    >
      <span class="scroll-to-bottom-icon" aria-hidden="true">${renderUiIcon("arrow-down")}</span>
    </button>
  `;
}

function renderPromptActivity(): string {
  const activity = getCurrentPromptActivityForRender();
  if (!activity) {
    return "";
  }

  const label = formatPromptActivityLabel(activity, state.uiLocale);
  const detail = getPromptActivityDetail(activity.phase, state.uiLocale);

  return `
    <article class="message-row assistant prompt-activity-row" aria-live="polite">
      <div class="message-card assistant prompt-activity-card">
        <div class="prompt-activity-main">
          <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="prompt-activity-copy">
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(detail)}</small>
          </span>
        </div>
      </div>
    </article>
  `;
}

function getCurrentPromptActivityForRender(): PromptActivityState | null {
  return getEffectivePromptActivityForActiveWork({
    current: state.promptActivity,
    activeTurn: isCurrentTurnActive() ? state.activeTurn : null,
    streamingAssistantMessageIds: state.streamingAssistantMessageIds,
  });
}

function createVoiceTranscriptMessageId(role: string | undefined): string {
  voiceTranscriptMessageCounter += 1;
  const normalizedRole = role === "user" ? "user" : "assistant";
  return `voice-${normalizedRole}-${Date.now()}-${voiceTranscriptMessageCounter}`;
}

function renderConversationMessage(message: ConversationMessage): string {
  if (message.notice) {
    return renderConversationNoticeMessage(message);
  }
  const strings = stringsForState();
  const imageHtml = renderConversationMessageImages(message.id, message.images);
  const attachmentHtml = renderConversationMessageAttachments(message.attachments);
  const structuredInputHtml =
    message.role === "user" ? renderConversationMessageStructuredInputs(message.structuredInputs) : "";
  const traceHtml = renderMessageTrace(message.id, message.trace);
  const editing = message.role === "user" && state.editingMessageId === message.id;
  const editingClass = editing ? "editing" : "";
  const voiceClass = message.delivery === "voice" ? "voice-message" : "";
  const imageResultClass = isImageResultAssistantMessage(message) ? "image-result" : "";
  const actionsHtml = renderMessageActions(message, strings);
  const profileHtml = message.role === "user" ? renderMessageProfileBadge(message.profile) : "";
  const userMetaHtml = message.role === "user" ? renderMessageMetaPills(profileHtml, structuredInputHtml) : "";
  const voiceMetaHtml = message.delivery === "voice" ? renderVoiceMessageMeta(message) : "";
  const hasTextBody = editing || message.delivery === "voice" || Boolean(message.text.trim());
  const messageBodyHtml =
    isImageResultAssistantMessage(message)
      ? ""
      : message.delivery === "voice"
      ? renderVoiceConversationBody(message)
      : `<div class="message-content">${renderMessageContentHtml(message.text, {
          enableYouTubeTimestampLinks: shouldRenderYouTubeTimestampLinks(),
        })}</div>`;
  const cardHtml = hasTextBody || traceHtml || imageHtml || userMetaHtml
    ? `
    <div class="message-card ${message.role} ${editingClass} ${voiceClass} ${imageResultClass}">
      ${userMetaHtml}
      ${traceHtml}
      ${
        editing
          ? renderMessageEditComposer(message, strings)
          : messageBodyHtml
      }
      ${imageHtml}
    </div>
  `
    : "";
  if (message.role === "user") {
    return `
      <article class="message-row user ${voiceClass}" data-message-id="${escapeAttribute(message.id)}">
        <div class="message-user-stack ${editingClass}">
          ${attachmentHtml}
          ${cardHtml}
          ${voiceMetaHtml}
          ${message.text.trim() ? actionsHtml : ""}
        </div>
      </article>
    `;
  }
  return `
    <article class="message-row ${message.role} ${voiceClass}" data-message-id="${escapeAttribute(message.id)}">
      ${cardHtml}
      ${voiceMetaHtml}
      ${actionsHtml}
    </article>
  `;
}

function renderMessageMetaPills(profileHtml: string, structuredInputHtml: string): string {
  const pills = `${profileHtml}${structuredInputHtml}`.trim();
  if (!pills) {
    return "";
  }
  return `<div class="message-meta-pills">${pills}</div>`;
}

function renderConversationMessageStructuredInputs(
  inputs: ConversationMessage["structuredInputs"] | undefined,
): string {
  const items = (inputs ?? []).filter((input) => input.id && input.name && input.path);
  if (!items.length) {
    return "";
  }
  return `
    <div class="conversation-structured-inputs">
      ${items
        .map(
          (input) => `
            <span
              class="summary-chip subtle conversation-structured-input"
              title="${escapeAttribute(input.description || input.path)}"
            >
              ${renderStructuredInputIcon(input)}
              <span>${escapeHtml(input.name)}</span>
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderStructuredInputIcon(input: ConversationMessageStructuredInput): string {
  if (input.iconUrl && isSafeMessageImageUrl(input.iconUrl)) {
    return `<span class="summary-chip-icon image" aria-hidden="true"><img src="${escapeAttribute(input.iconUrl)}" alt="" loading="lazy" /></span>`;
  }
  const icon = input.type === "skill" || input.path.startsWith("plugin://") ? "code" : "globe";
  return `<span class="summary-chip-icon" aria-hidden="true">${renderUiIcon(icon)}</span>`;
}

function renderConversationNoticeMessage(message: ConversationMessage): string {
  const notice = message.notice;
  if (notice?.type !== "context-compaction") {
    return "";
  }
  const strings = stringsForState();
  const label = notice.state === "completed" ? strings.status.compactNoticeCompleted : strings.status.compactNoticeRunning;
  return `
    <article class="message-row notice context-compaction ${notice.state}" data-message-id="${escapeAttribute(message.id)}">
      <div class="message-context-notice" role="status" aria-live="polite">
        <span class="context-notice-label">
          ${renderUiIcon("archive", "context-notice-icon")}
          <span class="context-notice-text">${escapeHtml(label)}</span>
        </span>
      </div>
    </article>
  `;
}

function renderConversationMessageAttachments(
  attachments: ConversationMessage["attachments"] | undefined,
): string {
  const renderableAttachments = (attachments ?? []).filter((attachment) => attachment.id && attachment.name);
  if (!renderableAttachments.length) {
    return "";
  }

  return `
    <div class="message-attachments" role="list">
      ${renderableAttachments
        .map((attachment) =>
          attachment.kind === "image"
            ? renderConversationMessageAttachmentImage(attachment)
            : renderConversationMessageAttachmentFile(attachment),
        )
        .join("")}
    </div>
  `;
}

function renderConversationMessageAttachmentImage(attachment: ConversationMessageAttachment): string {
  if (!attachment.previewSrc || !isSafeMessageImageUrl(attachment.previewSrc)) {
    return renderConversationMessageAttachmentFile(attachment);
  }

  const roleLabel = renderConversationMessageAttachmentRole(attachment);
  return `
    <figure class="message-attachment-image ${attachment.role ? escapeAttribute(attachment.role) : ""}" role="listitem">
      <img src="${escapeAttribute(attachment.previewSrc)}" alt="${escapeAttribute(attachment.name)}" loading="lazy" />
      <figcaption class="message-attachment-caption">
        ${roleLabel}
        <span class="message-attachment-name">${escapeHtml(attachment.name)}</span>
      </figcaption>
    </figure>
  `;
}

function renderConversationMessageAttachmentFile(attachment: ConversationMessageAttachment): string {
  const meta = [
    formatConversationAttachmentKindLabel(attachment),
    formatConversationAttachmentSize(attachment.sizeBytes),
  ].filter(Boolean);

  return `
    <div class="message-attachment-file" role="listitem">
      <span class="message-attachment-file-icon" aria-hidden="true">${renderMessageActionIcon("file")}</span>
      <span class="message-attachment-file-text">
        <strong>${escapeHtml(attachment.name)}</strong>
        <small>${escapeHtml(meta.join(" · "))}</small>
      </span>
    </div>
  `;
}

function renderConversationMessageAttachmentRole(attachment: ConversationMessageAttachment): string {
  if (!attachment.role) {
    return "";
  }
  const label =
    attachment.role === "target"
      ? stringsForState().labels.attachmentTarget
      : stringsForState().labels.attachmentReference;
  return `<span class="message-attachment-role ${escapeAttribute(attachment.role)}">${escapeHtml(label)}</span>`;
}

function formatConversationAttachmentKindLabel(attachment: ConversationMessageAttachment): string {
  const labels = stringsForState().labels;
  switch (attachment.kind) {
    case "image":
      return labels.image;
    case "pdf":
      return labels.pdf;
    case "docx":
      return labels.document;
    case "spreadsheet":
      return labels.spreadsheet;
    case "text":
      return labels.textFile;
    case "binary":
    default:
      return labels.file;
  }
}

function formatConversationAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "";
  }
  if (sizeBytes < 1024) {
    return `${Math.round(sizeBytes)} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(sizeBytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderMessageTrace(messageId: string, trace: ConversationMessage["trace"] | undefined): string {
  const items = getVisibleTraceItems(trace, MAX_TRACE_ITEMS);
  if (!items.length) {
    return "";
  }
  const shouldOpenByDefault = shouldOpenMessageTrace(items);
  if (shouldOpenByDefault && !messageTraceOpenByMessageId.has(messageId)) {
    messageTraceOpenByMessageId.set(messageId, true);
  }
  const shouldOpen = messageTraceOpenByMessageId.get(messageId) ?? shouldOpenByDefault;
  return `
    <details class="message-trace-text"${shouldOpen ? " open" : ""} data-message-trace-id="${escapeAttribute(messageId)}">
      <summary class="message-trace-summary">
        <span>${escapeHtml(formatTraceSummary(items, stringsForState().trace, formatTraceCount))}</span>
        <span class="message-trace-caret" aria-hidden="true">${renderUiIcon("chevron-down")}</span>
      </summary>
      <div class="message-trace-lines" role="list">
        ${items.map((item) => renderMessageTraceItem(item)).join("")}
      </div>
    </details>
  `;
}

function renderMessageTraceItem(item: NonNullable<ConversationMessage["trace"]>[number]): string {
  const title = formatTraceTitle(item, stringsForState().trace);
  const detail = formatTraceDetail(item, title);
  return `
    <div class="message-trace-line ${escapeAttribute(item.kind)} ${escapeAttribute(item.status)}" role="listitem">
      <span class="message-trace-line-text">
        <span class="message-trace-line-main">${escapeHtml(title)}</span>
        ${detail ? `<span class="message-trace-line-detail">${escapeHtml(detail)}</span>` : ""}
      </span>
    </div>
  `;
}

function formatTraceCount(count: number, label: string): string {
  return stringsForState().status.itemCount(count, label);
}

function isImageResultAssistantMessage(message: ConversationMessage): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  return (message.images ?? []).some((image) => image.src || image.assetRef || image.status === "loading" || image.status === "error" || image.status === "deleted");
}

function renderVoiceConversationBody(message: ConversationMessage): string {
  if (message.role === "user") {
    return `
      <div class="message-content voice-transcript-content">
        <span class="voice-transcript-quote" aria-hidden="true">“</span>${escapeHtml(message.text.trim())}<span class="voice-transcript-quote" aria-hidden="true">”</span>
      </div>
    `;
  }

  return `
    <div class="voice-assistant-label">
      <span class="voice-message-icon" aria-hidden="true">${renderVoiceMessageIcon("mic")}</span>
      <span>${escapeHtml(stringsForState().labels.voiceResponse)}</span>
    </div>
    <div class="message-content voice-transcript-content">${renderMessageContentHtml(message.text, {
      enableYouTubeTimestampLinks: shouldRenderYouTubeTimestampLinks(),
    })}</div>
  `;
}

function renderVoiceMessageMeta(message: ConversationMessage): string {
  const label =
    message.role === "user"
      ? formatVoiceDurationLabel(getVoiceMessageDurationMs(message))
      : stringsForState().labels.realtimeVoice;

  return `
    <div class="voice-message-meta ${message.role}">
      <span class="voice-message-icon" aria-hidden="true">${renderVoiceMessageIcon("mic")}</span>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function getVoiceMessageDurationMs(message: ConversationMessage): number | undefined {
  if (message.delivery !== "voice" || !message.voice) {
    return undefined;
  }
  if (isActiveVoiceTranscriptMessage(voiceTranscriptMirror, message)) {
    return Math.max(0, voiceDurationNow - message.voice.startedAt);
  }
  if (typeof message.voice.durationMs === "number") {
    return message.voice.durationMs;
  }
  return undefined;
}

function renderMessageProfileBadge(profile: ConversationMessage["profile"] | undefined): string {
  if (!profile?.id || !profile.name || profile.id === "default") {
    return "";
  }
  const color = normalizeProfileColorForUi(profile.color);
  return `
    <div class="message-profile-badge" style="--profile-color: ${escapeAttribute(color)}" title="${escapeAttribute(profile.name)}">
      ${renderProfileIcon(profile.icon ?? DEFAULT_PROFILE_VISUAL_ICON)}
      <span>${escapeHtml(profile.name)}</span>
    </div>
  `;
}

function shouldRenderYouTubeTimestampLinks(): boolean {
  const currentTab = getCurrentTabReference();
  if (currentTab && isYouTubeLikeUrl(currentTab.url)) {
    return true;
  }

  return state.openTabOptions
    .filter((tab) => state.selectedTabIds.includes(tab.tabId))
    .some((tab) => isYouTubeLikeUrl(tab.url));
}

function renderMessageEditComposer(
  message: ConversationMessage,
  strings: ReturnType<typeof getUiStrings>,
): string {
  const disabled = canStartMessageReplayInteraction() ? "" : "disabled";
  return `
    <div class="message-edit-box">
      <textarea data-message-edit-input="${escapeAttribute(message.id)}">${escapeHtml(message.text)}</textarea>
      <div class="message-edit-actions">
        <button type="button" class="message-action-button primary" data-message-edit-save="${escapeAttribute(message.id)}" ${disabled}>
          ${escapeHtml(strings.actions.saveEdit)}
        </button>
        <button type="button" class="message-action-button" data-message-edit-cancel="${escapeAttribute(message.id)}">
          ${escapeHtml(strings.actions.cancelEdit)}
        </button>
      </div>
    </div>
  `;
}

function getMessageActionTooltip(
  action: "copy" | "copied" | "edit" | "regenerate",
  strings: ReturnType<typeof getUiStrings>,
): string {
  switch (action) {
    case "copy":
      return strings.actions.copyMessage;
    case "copied":
      return strings.actions.copiedMessage;
    case "edit":
      return strings.actions.editMessage;
    case "regenerate":
      return strings.actions.regenerateMessage;
  }
}

function renderMessageCopiedIndicator(): string {
  return `<span class="message-action-check" aria-hidden="true">${renderUiIcon("check")}</span>`;
}

function renderMessageCopyButton(
  message: ConversationMessage,
  strings: ReturnType<typeof getUiStrings>,
): string {
  if (!message.text.trim()) {
    return "";
  }

  const copied = state.copiedMessageId === message.id;
  const label = getMessageActionTooltip(copied ? "copied" : "copy", strings);
  const copiedClass = copied ? " copied" : "";
  return `<button
    type="button"
    class="message-action-button icon${copiedClass}"
    data-message-copy="${escapeAttribute(message.id)}"
    aria-label="${escapeAttribute(label)}"
    data-tooltip="${escapeAttribute(label)}"
  >${copied ? renderMessageCopiedIndicator() : renderMessageActionIcon("copy")}</button>`;
}

function renderMessageActions(
  message: ConversationMessage,
  strings: ReturnType<typeof getUiStrings>,
): string {
  if (isTraceOnlyAssistantMessage(message)) {
    return "";
  }
  if (state.editingMessageId === message.id) {
    return "";
  }

  const disabled = canStartMessageReplayInteraction() ? "" : "disabled";
  if (message.role === "assistant") {
    if (
      !shouldRenderAssistantMessageActions({
        messageId: message.id,
        promptActivityActive: Boolean(state.promptActivity),
        turnActive: isCurrentTurnActive(),
        streamingMessageIds: state.streamingAssistantMessageIds,
      })
    ) {
      return "";
    }
    const copyButton = renderMessageCopyButton(message, strings);
    const regenerateLabel = getMessageActionTooltip("regenerate", strings);
    return `
      <div class="message-actions assistant">
        ${copyButton}
        <button
          type="button"
          class="message-action-button icon"
          data-message-regenerate="${escapeAttribute(message.id)}"
          aria-label="${escapeAttribute(regenerateLabel)}"
          data-tooltip="${escapeAttribute(regenerateLabel)}"
          ${disabled}
        >${renderMessageActionIcon("regenerate")}</button>
      </div>
    `;
  }

  const copyButton = renderMessageCopyButton(message, strings);
  const editLabel = getMessageActionTooltip("edit", strings);
  return `
    <div class="message-actions user user-icon-actions">
      ${copyButton}
      <button
        type="button"
        class="message-action-button icon"
        data-message-edit="${escapeAttribute(message.id)}"
        aria-label="${escapeAttribute(editLabel)}"
        data-tooltip="${escapeAttribute(editLabel)}"
        ${disabled}
      >${renderMessageActionIcon("edit")}</button>
    </div>
  `;
}

function renderConversationMessageImages(messageId: string, images: ConversationMessage["images"] | undefined): string {
  const strings = stringsForState();
  const renderableImages = (images ?? [])
    .map((image, index) => ({ image, index }))
    .filter(
      ({ image }) => isSafeMessageImageUrl(image.src) || image.status === "loading" || image.status === "error" || image.status === "deleted",
    );
  if (!renderableImages.length) {
    return "";
  }

  return `
    <div class="message-images">
      ${renderableImages
        .map(({ image, index }) => {
          if (isSafeMessageImageUrl(image.src)) {
            return `
              <figure class="message-image-frame">
                <button
                  type="button"
                  class="message-image-select"
                  data-image-followup="1"
                  data-image-message-id="${escapeAttribute(messageId)}"
                  data-image-index="${index}"
                  title="${escapeAttribute(strings.actions.followUpEditImage)}"
                  aria-label="${escapeAttribute(strings.actions.followUpEditImage)}"
                >
                  <img src="${escapeAttribute(image.src)}" alt="${escapeAttribute(image.alt || strings.images.image)}" loading="lazy" />
                </button>
                <figcaption class="message-image-overlay-actions">
                  <button type="button" class="image-action-button overlay edit" data-image-followup="1" data-image-message-id="${escapeAttribute(messageId)}" data-image-index="${index}">
                    ${escapeHtml(strings.actions.edit)}
                  </button>
                  <button
                    type="button"
                    class="image-action-button overlay icon"
                    data-image-open="1"
                    data-image-message-id="${escapeAttribute(messageId)}"
                    data-image-index="${index}"
                    title="${escapeAttribute(stringsForState().actions.openPreview)}"
                    aria-label="${escapeAttribute(stringsForState().actions.openPreview)}"
                  >
                    ${renderMessageActionIcon("open")}
                  </button>
                </figcaption>
              </figure>
            `;
          }
          const status = image.status ?? "loading";
          if (status === "loading") {
            const detail = image.alt || strings.images.generating;
            return `
              <figure class="message-image-frame pending loading" aria-label="${escapeAttribute(detail)}">
                <div class="message-image-skeleton" aria-hidden="true"></div>
              </figure>
            `;
          }
          const label = status === "deleted" ? strings.images.deleted : strings.images.previewFailed;
          return `
            <figure class="message-image-frame pending ${status}">
              <div class="message-image-placeholder">
                <span>${escapeHtml(label)}</span>
              </div>
            </figure>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderContextView(strings: ReturnType<typeof getUiStrings>): string {
  const hasPageContext =
    state.attachments.has("current-page") ||
    state.attachments.has("selection") ||
    state.attachments.has("image");

  return `
    <div class="view-scroll context-view" data-scroll-key="context-view">
      ${renderBackToChatHeader(strings, "context")}
      <section class="surface stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.openTabsPanel)}</h2>
        </div>
        <p class="stack-copy">${escapeHtml(strings.help.contextRefine)}</p>
        <div class="chips source-chips">
          ${renderContextReferenceChip("open-tabs", renderOpenTabsLabel(strings))}
        </div>
      </section>

      ${
        hasPageContext
          ? `<section class="surface stack">
              <div class="stack-header">
                <h2>${escapeHtml(strings.labels.readStrategy)}</h2>
              </div>
              <p class="stack-copy">${escapeHtml(strings.help.contextRefine)}</p>
              <div class="read-modes">
                ${renderReadModeButton("auto", strings.readModes.auto)}
                ${renderReadModeButton("dom", strings.readModes.dom)}
                ${renderReadModeButton("vision", strings.readModes.vision)}
                ${renderReadModeButton("hybrid", strings.readModes.hybrid)}
              </div>
            </section>`
          : ""
      }

      ${
        state.attachments.has("open-tabs")
          ? `<section class="surface stack">
              <div class="stack-header">
                <h2>${escapeHtml(strings.labels.openTabsPanel)}</h2>
                <button id="load-tabs">${escapeHtml(strings.actions.refresh)}</button>
              </div>
              <p class="stack-copy">${escapeHtml(strings.help.contextRefine)}</p>
              <div id="tabs-container"></div>
            </section>`
          : ""
      }

      ${
        state.attachments.has("history")
          ? `<section class="surface stack">
              <div class="stack-header">
                <h2>${escapeHtml(strings.labels.historyPanel)}</h2>
              </div>
              <p class="stack-copy">${escapeHtml(strings.help.contextRefine)}</p>
              <div class="inline-form">
                <input id="history-query" placeholder="${escapeAttribute(strings.historyPlaceholder)}" value="${escapeAttribute(state.historyQuery)}" />
                <button id="search-history">${escapeHtml(strings.actions.search)}</button>
              </div>
              <div id="history-container">
                ${state.historyItems
                  .map((item) => `<label class="history-item"><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.url)}</small></label>`)
                  .join("")}
              </div>
            </section>`
          : ""
      }
    </div>
  `;
}

function renderSkillsView(strings: ReturnType<typeof getUiStrings>): string {
  return `
    <div class="view-scroll context-view skills-view" data-scroll-key="skills-view">
      ${renderBackToChatHeader(strings, "skills")}
      <section class="surface stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.codexSkills)}</h2>
          <button id="upload-skill-archive" class="ghost-button small">${escapeHtml(strings.actions.uploadSkillArchive)}</button>
          <input id="skill-archive-input" type="file" accept=".zip,application/zip" hidden />
        </div>
        <p class="stack-copy">${escapeHtml(strings.help.codexSkills)}</p>
        <div class="codex-skill-list">
          ${renderPlaywrightRuntimeSkill(strings)}
          ${state.appServerSkills.map((skill) => renderCodexSkillToggle(skill)).join("")}
        </div>
        ${state.appServerSkills.length ? "" : `<p class="empty-state">${escapeHtml(strings.help.emptySkills)}</p>`}
      </section>
    </div>
  `;
}

function renderPluginMcpView(strings: ReturnType<typeof getUiStrings>): string {
  const apps = getRenderableConnectedApps();
  const plugins = getRenderableAppServerPlugins();

  return `
    <div class="view-scroll context-view plugins-view" data-scroll-key="plugins-view">
      ${renderBackToChatHeader(strings, "plugins")}
      <section class="surface stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.apps)}</h2>
        </div>
        <p class="stack-copy">${escapeHtml(strings.help.pluginMcp)}</p>
        <div class="codex-skill-list">
          ${apps.map((app) => renderConnectedAppToggle(app)).join("")}
        </div>
        ${apps.length ? "" : `<p class="empty-state">${escapeHtml(strings.help.emptyApps)}</p>`}
      </section>

      <section class="surface stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.plugins)}</h2>
          <button id="reload-plugin-catalog" class="ghost-button small">${escapeHtml(strings.actions.reload)}</button>
        </div>
        <div class="codex-skill-list">
          ${plugins.map((plugin) => renderAppServerPluginToggle(plugin)).join("")}
        </div>
        ${plugins.length ? "" : `<p class="empty-state">${escapeHtml(strings.help.emptyPlugins)}</p>`}
      </section>

      <section class="surface stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.mcpServers)}</h2>
          <button id="reload-mcp-servers" class="ghost-button small">${escapeHtml(strings.actions.reload)}</button>
        </div>
        <div class="codex-skill-list">
          ${state.mcpServers.map((server) => renderMcpServerRow(server, strings)).join("")}
        </div>
        ${state.mcpServers.length ? "" : `<p class="empty-state">${escapeHtml(strings.help.emptyMcpServers)}</p>`}
      </section>
    </div>
  `;
}

function getRenderableConnectedApps(): CodexAppOption[] {
  return state.connectedApps.filter((app) => app.isAccessible && app.isEnabled);
}

function isConnectedAppMentionAvailable(app: CodexAppOption): boolean {
  return app.isAccessible && app.isEnabled;
}

function getRenderableAppServerPlugins(): CodexPluginOption[] {
  return state.appServerPlugins.filter((plugin) => plugin.installed && plugin.enabled);
}

function isAppServerPluginMentionAvailable(plugin: CodexPluginOption): boolean {
  return isPluginMentionRouteable(plugin, state.connectedApps);
}

function renderBackToChatHeader(
  strings: ReturnType<typeof getUiStrings>,
  view: "context" | "skills" | "plugins" | "settings",
): string {
  return `
    <div class="view-return-header ${view}" data-view-return-header="${escapeAttribute(view)}">
      <button class="settings-back" data-view="chat" type="button">
        <span aria-hidden="true">${renderUiIcon("arrow-left")}</span>
        <span>${escapeHtml(strings.settingsPanel.backToChat)}</span>
      </button>
    </div>
  `;
}

function renderConnectedAppToggle(app: CodexAppOption): string {
  const strings = stringsForState();
  const selected = isStructuredInputSelected(app.id);
  const detail = app.description || app.path;
  return `
    <label
      class="codex-skill-toggle mention-toggle ${selected ? "enabled" : ""}"
    >
      ${renderPluginMcpRowIcon(app.iconUrl, "globe")}
      <span class="codex-skill-copy">
        <strong>${escapeHtml(app.name)}</strong>
        <span>${escapeHtml(detail)}</span>
      </span>
      <span class="settings-switch codex-skill-switch">
        <input
          type="checkbox"
          data-app-id="${escapeAttribute(app.id)}"
          aria-label="${escapeAttribute(app.name)}"
          ${selected ? "checked" : ""}
        />
        <span aria-hidden="true"></span>
      </span>
    </label>
  `;
}

function renderAppServerPluginToggle(plugin: CodexPluginOption): string {
  const strings = stringsForState();
  const connectionState = getPluginConnectionState(plugin, state.connectedApps);
  const connectionRequired = connectionState === "connection-required";
  const detail =
    connectionRequired
      ? strings.status.setupNeeded
      : plugin.description || plugin.marketplaceName || plugin.path;
  return `
    <div
      class="codex-skill-toggle mention-toggle ${connectionRequired ? "connection-required" : ""}"
    >
      ${renderPluginMcpRowIcon(plugin.iconUrl, "code")}
      <span class="codex-skill-copy">
        <strong>${escapeHtml(plugin.name)}</strong>
        <span>${escapeHtml(detail)}</span>
      </span>
      ${connectionRequired ? renderPluginConnectionButton(plugin, strings) : renderPluginAvailabilityPill(connectionState, strings)}
    </div>
  `;
}

function renderPluginConnectionButton(plugin: CodexPluginOption, strings: ReturnType<typeof getUiStrings>): string {
  return `
    <button
      class="plugin-connect-row-action"
      type="button"
      data-plugin-settings-id="${escapeAttribute(plugin.id)}"
    >
      ${escapeHtml(strings.actions.connect)}
    </button>
  `;
}

function renderPluginAvailabilityPill(
  connectionState: ReturnType<typeof getPluginConnectionState>,
  strings: ReturnType<typeof getUiStrings>,
): string {
  const label = connectionState === "available" ? strings.status.connected : strings.status.workspaceActive;
  return `<span class="plugin-connect-row-action plugin-connect-row-action-muted" aria-hidden="true">${escapeHtml(label)}</span>`;
}

function renderPluginMcpRowIcon(iconUrl: string | undefined, fallbackIcon: UiIconName): string {
  if (iconUrl && isSafeMessageImageUrl(iconUrl)) {
    return `<span class="runtime-skill-icon image" aria-hidden="true"><img src="${escapeAttribute(iconUrl)}" alt="" loading="lazy" /></span>`;
  }
  return `<span class="runtime-skill-icon" aria-hidden="true">${renderUiIcon(fallbackIcon)}</span>`;
}

function renderMcpServerRow(server: CodexMcpServerOption, strings: ReturnType<typeof getUiStrings>): string {
  const needsLogin = server.authStatus === "notLoggedIn" || server.authStatus === "oauth";
  return `
    <div class="codex-skill-toggle mcp-server-row ${server.isAuthenticated ? "enabled" : ""}">
      <span class="runtime-skill-icon" aria-hidden="true">${renderUiIcon("globe")}</span>
      <span class="codex-skill-copy">
        <strong>${escapeHtml(server.name)}</strong>
        <span>${escapeHtml(server.description || server.path)}</span>
      </span>
      <span class="runtime-skill-actions">
        <span class="runtime-skill-status ${server.isAuthenticated ? "ready" : "missing"}">
          ${escapeHtml(server.isAuthenticated ? strings.status.connected : strings.status.setupNeeded)}
        </span>
        ${
          needsLogin && !server.isAuthenticated
            ? `<button
                type="button"
                class="ghost-button small"
                data-mcp-oauth-server="${escapeAttribute(server.name)}"
              >${escapeHtml(strings.actions.connect)}</button>`
            : ""
        }
      </span>
    </div>
  `;
}

function isStructuredInputSelected(inputId: string): boolean {
  return state.structuredInputs.some((input) => input.id === inputId);
}

function renderCodexSkillToggle(skill: CodexSkillOption): string {
  const strings = stringsForState();
  const blockedByRuntime = isCodexSkillRuntimeBlocked(skill);
  const enabled = !blockedByRuntime && isCodexSkillEnabled(skill.id);
  const detail = blockedByRuntime ? strings.help.playwrightRuntimeSkill : skill.description || skill.path;
  return `
    <label class="codex-skill-toggle ${enabled ? "enabled" : ""} ${blockedByRuntime ? "disabled" : ""}">
      <span class="codex-skill-copy">
        <strong>${escapeHtml(skill.name)}</strong>
        <span>${escapeHtml(detail)}</span>
      </span>
      <span class="settings-switch codex-skill-switch">
        <input
          type="checkbox"
          data-codex-skill-toggle="${escapeAttribute(skill.id)}"
          aria-label="${escapeAttribute(skill.name)}"
          ${enabled ? "checked" : ""}
          ${blockedByRuntime ? "disabled" : ""}
        />
        <span aria-hidden="true"></span>
      </span>
    </label>
  `;
}

function renderPlaywrightRuntimeSkill(strings: ReturnType<typeof getUiStrings>): string {
  const runtime = state.playwrightRuntime;
  const enabled = runtime.available && state.settings.playwrightBrowserControlEnabled;
  const statusLabel = runtime.available ? strings.status.connected : strings.status.setupNeeded;
  const versionLabel = runtime.packageName && runtime.packageVersion ? ` · ${runtime.packageName} ${runtime.packageVersion}` : "";
  const detail = `${runtime.message || strings.help.playwrightRuntimeSkill}${versionLabel}`;

  return `
    <div class="codex-skill-toggle runtime-skill ${enabled ? "enabled" : ""} ${runtime.available ? "" : "disabled"}">
      <span class="runtime-skill-icon" aria-hidden="true">${renderUiIcon("code")}</span>
      <span class="codex-skill-copy">
        <strong>${escapeHtml(strings.labels.playwrightBrowserControl)}</strong>
        <span>${escapeHtml(detail)}</span>
      </span>
      <span class="runtime-skill-actions">
        <span class="runtime-skill-status ${runtime.available ? "ready" : "missing"}">${escapeHtml(statusLabel)}</span>
        ${
          runtime.available
            ? ""
            : `<button
                type="button"
                class="ghost-button small runtime-skill-button"
                data-install-playwright-runtime
                ${runtime.installable ? "" : "disabled"}
              >${escapeHtml(strings.actions.installPlaywright)}</button>`
        }
        <button type="button" class="icon-button small" data-refresh-playwright-runtime title="${escapeAttribute(strings.actions.refresh)}" aria-label="${escapeAttribute(strings.actions.refresh)}">
          ${renderUiIcon("refresh")}
        </button>
        <label class="settings-switch codex-skill-switch" aria-label="${escapeAttribute(strings.labels.playwrightBrowserControl)}">
          <input
            type="checkbox"
            data-playwright-runtime-toggle
            ${enabled ? "checked" : ""}
            ${runtime.available ? "" : "disabled"}
          />
          <span aria-hidden="true"></span>
        </label>
      </span>
    </div>
  `;
}

function isCodexSkillEnabled(skillId: string): boolean {
  return state.settings.enabledCodexSkillIds.includes(skillId);
}

function isPlaywrightRuntimeEnabled(): boolean {
  return state.playwrightRuntime.available && state.settings.playwrightBrowserControlEnabled;
}

function isCodexSkillRuntimeBlocked(skill: CodexSkillOption): boolean {
  return getCodexSkillRuntimeRequirement(skill) === "playwright" && !isPlaywrightRuntimeEnabled();
}

function renderWorkspaceView(strings: ReturnType<typeof getUiStrings>): string {
  const isLoggedIn = Boolean(state.accountStatus?.codexAuthenticated);
  const selectedModelOption = getSelectedModelOption();
  const selectedProfile = getSelectedProfile();
  const canDeleteSelectedProfile = Boolean(selectedProfile && selectedProfile.id !== "default");
  const sections = listSettingsSections(state.uiLocale);
  const nativeHostHealth = getNativeHostHealth({
    modelCatalogState: state.modelCatalogState,
    modelCatalogErrorMessage: state.modelCatalogErrorMessage,
  });
  const codexBinaryHealth = getCodexBinaryHealth({
    nativeHostStatus: nativeHostHealth.status,
    runtimeConfig: state.runtimeConfig,
    modelCatalogState: state.modelCatalogState,
  });
  return `
    <div class="view-scroll workspace-view settings-view" data-scroll-key="workspace-view">
      ${renderBackToChatHeader(strings, "settings")}
      <section class="settings-content">
        <header class="settings-page-header">
          <p class="eyebrow">${escapeHtml(strings.brandEyebrow)}</p>
          <h2>${escapeHtml(strings.labels.settings)}</h2>
          <p>${escapeHtml(strings.settingsPanel.overview)}</p>
        </header>

        ${renderSettingsCard(
          "general",
          sections[0]?.label ?? strings.labels.settings,
          strings.settingsPanel.generalDescription,
          [
            renderSettingsRow(
              "language",
              strings.labels.language,
              strings.settings.uiLanguage,
              renderLanguageSelect(),
              {},
            ),
            renderSettingsRow(
              "theme",
              strings.settings.uiTheme,
              strings.settingsPanel.themeDescription,
              renderThemeSelect(),
              {},
            ),
            renderSettingsRow(
              "profile",
              strings.labels.profile,
              strings.settingsPanel.profileDescription,
              `<div class="profile-settings-control">
                ${selectedProfile ? renderProfileVisualBadge(selectedProfile) : `<span class="profile-visual-badge empty" aria-hidden="true"></span>`}
                <label class="settings-select-shell">
                  <select id="profile-select" aria-label="${escapeAttribute(strings.labels.profile)}">
                    ${state.profiles
                      .map(
                        (profile) =>
                          `<option value="${profile.id}" ${
                            profile.id === state.selectedProfileId ? "selected" : ""
                          }>${escapeHtml(profile.name)}</option>`,
                      )
                      .join("")}
                  </select>
                  <span aria-hidden="true">${renderUiIcon("chevron-down")}</span>
                </label>
                <div class="profile-settings-actions">
                  <button id="create-profile" class="settings-compact-button" type="button">${escapeHtml(
                    strings.actions.createProfile,
                  )}</button>
                  <button id="edit-profile" class="settings-compact-button" type="button" ${
                    selectedProfile ? "" : "disabled"
                  }>${escapeHtml(strings.actions.editProfile)}</button>
                  <button id="delete-profile" class="settings-compact-button danger" type="button" ${
                    canDeleteSelectedProfile ? "" : "disabled"
                  } title="${escapeAttribute(canDeleteSelectedProfile ? strings.actions.deleteProfile : strings.profileEditor.deleteDisabled)}">${escapeHtml(
                    strings.actions.deleteProfile,
                  )}</button>
                </div>
              </div>`,
              { expanded: true },
            ),
            renderSettingsRow(
              "site-suggestions",
              strings.labels.siteSuggestions,
              strings.settingsPanel.siteSuggestionsDescription,
              renderCustomSiteSuggestionSettings(strings),
              { expanded: true },
            ),
            renderSettingsRow(
              strings.labels.currentModel,
              strings.settingsPanel.modelDescription,
              `<label class="settings-select-shell ${state.modelCatalogState !== "ready" || !state.models.length ? "disabled" : ""}">
                <select id="model-select" aria-label="${escapeAttribute(strings.labels.currentModel)}" ${state.modelCatalogState !== "ready" || !state.models.length ? "disabled" : ""}>
                  ${
                    state.modelCatalogState === "ready" && state.models.length
                      ? state.models
                          .map(
                            (model) =>
                              `<option value="${escapeAttribute(model.id)}" ${
                                model.id === (selectedModelOption?.id ?? "") ? "selected" : ""
                              }>${escapeHtml(model.label)}${model.isDefault ? ` (${escapeHtml(strings.labels.defaultModel)})` : ""}</option>`,
                          )
                          .join("")
                      : `<option value="">${escapeHtml(renderModelChipLabel(strings, selectedModelOption))}</option>`
                  }
                </select>
                <span aria-hidden="true">${renderUiIcon("chevron-down")}</span>
              </label>`,
            ),
            renderSettingsRow(
              strings.settings.rememberChats,
              strings.settingsPanel.rememberChatsDescription,
              renderSettingsSwitch("setting-remember-chats", state.settings.rememberChats, strings.settings.rememberChats),
            ),
            renderSettingsRow(
              "chat-history",
              strings.labels.recentChats,
              strings.settingsPanel.chatHistoryDescription,
              `<button class="settings-compact-button danger" type="button" data-clear-chat-history="settings" ${
                state.recentChats.length ? "" : "disabled"
              }>${escapeHtml(strings.actions.clearRecentChats)}</button>`,
              {},
            ),
            renderSettingsRow(
              strings.settings.autoCompactConversations,
              strings.settingsPanel.autoCompactDescription,
              renderSettingsSwitch(
                "setting-auto-compact",
                state.settings.autoCompactConversations,
                strings.settings.autoCompactConversations,
              ),
            ),
            renderSettingsRow(
              strings.actions.resetSettings,
              strings.settingsPanel.resetDescription,
              `<button id="reset-settings" class="settings-compact-button danger" type="button">${escapeHtml(strings.actions.resetSettings)}</button>`,
            ),
          ],
        )}

        ${renderSettingsCard(
          "connection",
          sections[1]?.label ?? strings.labels.connection,
          strings.settingsPanel.connectionDescription,
          [
            renderSettingsRow(
              "account",
              strings.account,
              strings.accountHelp,
              `<div class="settings-action-cluster account-settings-actions">
                <span class="settings-status-pill accent">${escapeHtml(renderAccountBadge())}</span>
                ${renderAccountEmailPill()}
                ${state.rateLimits ? `<span class="settings-status-pill">${escapeHtml(renderRateLimitBadge(state.rateLimits))}</span>` : ""}
                ${!isLoggedIn ? `<button id="chatgpt-login">${escapeHtml(strings.actions.chatgptLogin)}</button>` : ""}
                <button id="apikey-login">${escapeHtml(strings.actions.apiKeyFallback)}</button>
                ${isLoggedIn ? `<button id="logout">${escapeHtml(strings.actions.logout)}</button>` : ""}
              </div>`,
              { expanded: true },
            ),
            renderSettingsRow(
              strings.labels.nativeHost,
              renderNativeHostDetail(strings, nativeHostHealth),
              renderSettingsStatusPill(renderNativeHostStatus(strings, nativeHostHealth), nativeHostHealth.tone),
            ),
            renderSettingsRow(
              strings.labels.codexBinary,
              renderCodexBinaryDetail(strings, codexBinaryHealth),
              renderSettingsStatusPill(
                renderCodexBinaryStatus(strings, codexBinaryHealth),
                codexBinaryHealth.tone,
              ),
            ),
            renderSettingsRow(
              strings.actions.reconnect,
              strings.settingsPanel.reconnectDescription,
              `<button id="reconnect-connection">${escapeHtml(strings.actions.reconnect)}</button>`,
            ),
            renderSettingsRow(
              strings.labels.generatedImages,
              renderImageAssetFolderDetail(strings),
              `<div class="settings-action-cluster">
                <span class="settings-status-pill neutral">${escapeHtml(
                  state.imageAssetFolder.assetCount
                    ? formatTraceCount(state.imageAssetFolder.assetCount, strings.labels.file)
                    : strings.status.noGeneratedImages,
                )}</span>
                <button id="refresh-image-folder">${escapeHtml(strings.actions.refresh)}</button>
                <button id="open-image-folder" ${state.imageAssetFolder.latestFolder ? "" : "disabled"}>${escapeHtml(strings.actions.openFolder)}</button>
              </div>`,
            ),
            renderSettingsRow(
              strings.labels.diagnosticLogs,
              renderDiagnosticLogFolderDetail(strings),
              `<div class="settings-action-cluster">
                <span class="settings-status-pill neutral">${escapeHtml(
                  state.diagnosticLogFolder.files.length
                    ? formatTraceCount(state.diagnosticLogFolder.files.length, strings.labels.file)
                    : strings.status.pending,
                )}</span>
                <button id="refresh-log-folder">${escapeHtml(strings.actions.refresh)}</button>
                <button id="open-log-folder" ${state.diagnosticLogFolder.rootDir ? "" : "disabled"}>${escapeHtml(strings.actions.openFolder)}</button>
              </div>`,
            ),
          ],
        )}

        ${renderSettingsCard(
          "permissions",
          sections[2]?.label ?? strings.permissions.generic,
          strings.settingsPanel.permissionsDescription,
          [
            renderSettingsRow(
              "browser-actions",
              strings.settings.allowBrowserActions,
              strings.permissions.currentPageAction,
              renderBrowserActionPermissionSettings(strings),
              { expanded: true },
            ),
          ],
        )}

        ${renderSettingsCard(
          "voice",
          sections[3]?.label ?? strings.labels.voice,
          strings.settingsPanel.voiceDescription,
          [
            renderSettingsRow(
              strings.settings.liveCaptions,
              strings.settingsPanel.liveCaptionsDescription,
              renderSettingsSwitch("setting-live-captions", state.settings.liveCaptions, strings.settings.liveCaptions),
            ),
            renderSettingsRow(
              strings.settings.voiceNavigation,
              strings.settingsPanel.voiceNavigationDescription,
              renderSettingsSwitch("setting-voice-navigation", state.settings.allowVoiceNavigation, strings.settings.voiceNavigation),
            ),
            renderSettingsRow(
              strings.labels.voice,
              strings.settingsPanel.voiceSelectDescription,
              `<label class="settings-select-shell">
                <select id="voice-select" aria-label="${escapeAttribute(strings.labels.voice)}">
                  <option value="">${escapeHtml(strings.settings.systemDefault)}</option>
                  ${state.voiceOptions
                    .map(
                      (voice) =>
                        `<option value="${escapeAttribute(voice.id)}" ${
                          voice.id === state.settings.preferredVoice ? "selected" : ""
                        }>${escapeHtml(voice.label)}</option>`,
                    )
                    .join("")}
                </select>
                <span aria-hidden="true">${renderUiIcon("chevron-down")}</span>
              </label>`,
            ),
          ],
        )}

      </section>
    </div>
  `;
}

function getSelectedProfile(): ProfileTemplate | null {
  return state.profiles.find((profile) => profile.id === state.selectedProfileId) ?? null;
}

function renderCustomSiteSuggestionSettings(strings: ReturnType<typeof getUiStrings>): string {
  const siteKey = state.currentTabReference ? resolveCustomSiteSuggestionKey(state.currentTabReference.url) : null;
  const siteLabel = siteKey ?? strings.status.customSiteSuggestionGenericSite;
  const suggestions = listCustomSiteSuggestionsForTab(
    state.currentTabReference,
    state.settings.customSiteSuggestions,
  ).slice(0, 6);
  const disabledAttribute = siteKey ? "" : "disabled";
  const placeholder = strings.prompts.customSiteSuggestion;
  const emptyLabel = strings.status.customSiteSuggestionEmpty;

  return `
    <div class="custom-site-suggestion-control">
      <div class="custom-site-suggestion-site">
        ${renderSiteSuggestionIcon(state.currentTabReference)}
        <span>${escapeHtml(siteLabel)}</span>
      </div>
      <form class="custom-site-suggestion-form" id="custom-site-suggestion-form">
        <input
          id="custom-site-suggestion-input"
          type="text"
          maxlength="280"
          placeholder="${escapeAttribute(placeholder)}"
          ${disabledAttribute}
        />
        <button class="settings-compact-button primary" type="submit" ${disabledAttribute}>${escapeHtml(
          strings.actions.addSiteSuggestion,
        )}</button>
      </form>
      <div class="custom-site-suggestion-list">
        ${
          suggestions.length
            ? suggestions
                .map(
                  (suggestion) => `
                    <div class="custom-site-suggestion-item">
                      <span>${escapeHtml(suggestion.prompt)}</span>
                      <button
                        class="settings-compact-button danger icon-only"
                        type="button"
                        data-delete-custom-site-suggestion="${escapeAttribute(suggestion.id)}"
                        title="${escapeAttribute(strings.actions.deleteProfile)}"
                        aria-label="${escapeAttribute(strings.actions.deleteProfile)}"
                      >${renderUiIcon("x")}</button>
                    </div>
                  `,
                )
                .join("")
            : `<p class="custom-site-suggestion-empty">${escapeHtml(emptyLabel)}</p>`
        }
      </div>
    </div>
  `;
}

function ensureComposerProfileSelection(): string {
  const resolved = resolveComposerProfileSelection({
    selectedProfileId: state.selectedProfileId,
    profiles: state.profiles,
    composerCommandPills: state.composerCommandPills,
  });
  state.selectedProfileId = resolved.selectedProfileId;
  state.composerCommandPills = resolved.composerCommandPills;
  return state.selectedProfileId;
}

function selectProfileForComposer(profileId: string, options: { visible: boolean }): string {
  const selectedProfileId = normalizeSelectedProfileIdForProfiles(profileId, state.profiles);
  state.selectedProfileId = selectedProfileId;
  if (!options.visible || selectedProfileId === DEFAULT_PROFILE_ID) {
    state.composerCommandPills = state.composerCommandPills.filter((pill) => pill.kind !== "profile");
    return selectedProfileId;
  }

  const profile = state.profiles.find((candidate) => candidate.id === selectedProfileId);
  state.composerCommandPills = upsertComposerCommandPill(state.composerCommandPills, {
    kind: "profile",
    id: selectedProfileId,
    label: profile?.name ?? selectedProfileId,
  });
  return selectedProfileId;
}

function getProfileVisualById(profileId: string): ProfileTemplate["visual"] | undefined {
  return state.profiles.find((profile) => profile.id === profileId)?.visual;
}

async function submitPendingProfileQuestion(answerOverride?: string): Promise<void> {
  const pending = state.pendingProfileQuestion;
  if (!pending || !canSendCurrentComposerMessage()) {
    return;
  }

  const inputAnswer = answerOverride ?? root.querySelector<HTMLTextAreaElement>("#profile-question-answer")?.value ?? pending.answer;
  const answer = inputAnswer.trim();
  if (!answer) {
    state.pendingProfileQuestion = {
      ...pending,
      answer: inputAnswer,
    };
    render();
    return;
  }

  state.pendingProfileQuestion = null;
  const selectedProfileId = selectProfileForComposer(pending.profileId, { visible: pending.profileId !== DEFAULT_PROFILE_ID });
  if (selectedProfileId !== state.selectedProfileId) {
    state.selectedProfileId = selectedProfileId;
  }
  void sendRuntimeMessage({ type: "profile.select", profileId: selectedProfileId }).catch((error) => {
    state.initError = toUserFacingRuntimeError(error, stringsForState().errors.init);
    render();
  });
  render();
  await sendPrompt(answer);
}

function createMessageProfileSnapshot(): ConversationMessageProfile | undefined {
  ensureComposerProfileSelection();
  const profile = getSelectedProfile();
  if (!profile || profile.id === DEFAULT_PROFILE_ID) {
    return undefined;
  }
  return {
    id: profile.id,
    name: profile.name,
    color: normalizeProfileColorForUi(profile.visual?.color),
    icon: profile.visual?.icon ?? DEFAULT_PROFILE_VISUAL_ICON,
  };
}

function createConversationMessageStructuredInputs(
  inputs: CodexStructuredInput[],
): ConversationMessageStructuredInput[] {
  return inputs.map((input) => ({
    id: input.id,
    type: input.type,
    name: input.name,
    path: input.path,
    ...(input.description ? { description: input.description } : {}),
    ...("iconUrl" in input && input.iconUrl ? { iconUrl: input.iconUrl } : {}),
  }));
}

function createProfileEditorState(mode: "create" | "edit", profile?: ProfileTemplate | null): ProfileEditorState {
  const visual = profile?.visual ?? {};
  const suggestions = profile?.suggestedPrompts ?? [];
  return {
    mode,
    ...(profile?.id ? { profileId: profile.id } : {}),
    name: mode === "edit" ? (profile?.name ?? "") : "",
    systemPrompt: mode === "edit" ? (profile?.systemPrompt ?? "") : "",
    color: visual.color ?? DEFAULT_PROFILE_VISUAL_COLOR,
    icon: visual.icon ?? DEFAULT_PROFILE_VISUAL_ICON,
    imageDataUrl: visual.imageDataUrl ?? "",
    suggestedPrompts: [suggestions[0] ?? "", suggestions[1] ?? "", suggestions[2] ?? ""],
    visualPickerOpen: false,
  };
}

function renderProfileVisualBadge(profile: ProfileTemplate): string {
  const visual = profile.visual ?? {};
  const color = normalizeProfileColorForUi(visual.color);
  return `
    <span class="profile-visual-badge" style="--profile-color: ${escapeAttribute(color)}" aria-hidden="true">
      ${
        visual.imageDataUrl
          ? `<img src="${escapeAttribute(visual.imageDataUrl)}" alt="" />`
          : renderProfileIcon(visual.icon ?? DEFAULT_PROFILE_VISUAL_ICON)
      }
    </span>
  `;
}

function renderProfileEditorModal(strings: ReturnType<typeof getUiStrings>): string {
  const editor = state.profileEditor;
  if (!editor) {
    return "";
  }

  const title = editor.mode === "create" ? strings.profileEditor.createTitle : strings.profileEditor.editTitle;
  const suggestions = [0, 1, 2].map((index) => editor.suggestedPrompts[index] ?? "");
  return `
    <div class="profile-editor-backdrop" role="presentation" data-profile-editor-backdrop>
      <section class="profile-editor-modal" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
        <header class="profile-editor-header">
          <div class="profile-editor-title-row">
            <div class="profile-editor-visual-anchor">
              <button
                id="profile-visual-trigger"
                class="profile-editor-preview-trigger"
                type="button"
                aria-haspopup="dialog"
                aria-expanded="${editor.visualPickerOpen ? "true" : "false"}"
                aria-label="${escapeAttribute(`${strings.profileEditor.color} / ${strings.profileEditor.icon} / ${strings.profileEditor.image}`)}"
              >
                ${renderProfileEditorPreview(editor)}
              </button>
              ${editor.visualPickerOpen ? renderProfileVisualPicker(editor, strings) : ""}
            </div>
            <h2 id="profile-editor-title">${escapeHtml(title)}</h2>
          </div>
          <button id="close-profile-editor" class="icon-button" type="button" aria-label="${escapeAttribute(strings.actions.closeProfileEditor)}">
            ${renderUiIcon("x")}
          </button>
        </header>
        <input id="profile-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />

        <div class="profile-editor-body">
          ${
            editor.error
              ? `<p class="profile-editor-error" role="alert">${escapeHtml(editor.error)}</p>`
              : ""
          }
          <label class="profile-editor-field">
            <span>${escapeHtml(strings.profileEditor.name)}</span>
            <input id="profile-editor-name" class="profile-editor-input" type="text" value="${escapeAttribute(editor.name)}" placeholder="${escapeAttribute(strings.profileEditor.namePlaceholder)}" maxlength="80" />
          </label>
          <label class="profile-editor-field">
            <span>${escapeHtml(strings.profileEditor.instructions)}</span>
            <textarea id="profile-editor-prompt" class="profile-editor-textarea" rows="5" maxlength="${MAX_PROFILE_SYSTEM_PROMPT_LENGTH}" placeholder="${escapeAttribute(strings.profileEditor.instructionsPlaceholder)}">${escapeHtml(editor.systemPrompt)}</textarea>
          </label>

          <section class="profile-editor-section">
            <h3>${escapeHtml(strings.profileEditor.recommendations)}</h3>
            <div class="profile-recommendation-list">
              ${suggestions
                .map(
                  (suggestion, index) => `
                    <input
                      class="profile-editor-input"
                      data-profile-suggestion-input="${index}"
                      type="text"
                      value="${escapeAttribute(suggestion)}"
                      placeholder="${escapeAttribute(strings.profileEditor.recommendationPlaceholder(index + 1))}"
                      maxlength="180"
                    />
                  `,
                )
                .join("")}
            </div>
          </section>
        </div>

        <footer class="profile-editor-actions">
          ${
            editor.mode === "edit" && editor.profileId !== "default"
              ? `<button id="delete-profile-in-editor" class="settings-compact-button danger" type="button">${escapeHtml(strings.actions.deleteProfile)}</button>`
              : `<span></span>`
          }
          <div>
            <button id="cancel-profile-editor" class="settings-compact-button" type="button">${escapeHtml(strings.actions.closeProfileEditor)}</button>
            <button id="save-profile-editor" class="settings-compact-button primary" type="button">${escapeHtml(strings.actions.saveProfile)}</button>
          </div>
        </footer>
      </section>
    </div>
  `;
}

function renderProfileEditorPreview(editor: ProfileEditorState): string {
  return `
    <span class="profile-editor-preview" style="--profile-color: ${escapeAttribute(normalizeProfileColorForUi(editor.color))}">
      ${
        editor.imageDataUrl
          ? `<img src="${escapeAttribute(editor.imageDataUrl)}" alt="" />`
          : renderProfileIcon(editor.icon)
      }
    </span>
  `;
}

function renderProfileVisualPicker(
  editor: ProfileEditorState,
  strings: ReturnType<typeof getUiStrings>,
): string {
  const selectedColor = normalizeProfileColorForUi(editor.color);
  return `
    <div class="profile-visual-picker" role="dialog" aria-label="${escapeAttribute(`${strings.profileEditor.color} / ${strings.profileEditor.icon}`)}">
      <div class="profile-color-grid" role="radiogroup" aria-label="${escapeAttribute(strings.profileEditor.color)}">
        ${PROFILE_EDITOR_COLORS.map(
          (color) => `
            <label class="profile-color-option ${selectedColor === color ? "selected" : ""}" style="--profile-color: ${escapeAttribute(color)}">
              <input type="radio" name="profile-editor-color" value="${escapeAttribute(color)}" ${selectedColor === color ? "checked" : ""} />
              <span></span>
            </label>
          `,
        ).join("")}
      </div>
      <div class="profile-visual-picker-divider" aria-hidden="true"></div>
      <div class="profile-icon-grid" role="radiogroup" aria-label="${escapeAttribute(strings.profileEditor.icon)}">
        ${PROFILE_EDITOR_ICONS.map(
          (icon) => `
            <label class="profile-icon-option ${editor.icon === icon ? "selected" : ""}">
              <input type="radio" name="profile-editor-icon" value="${escapeAttribute(icon)}" ${editor.icon === icon ? "checked" : ""} />
              ${renderProfileIcon(icon)}
            </label>
          `,
        ).join("")}
      </div>
      <div class="profile-visual-picker-divider" aria-hidden="true"></div>
      <div class="profile-visual-image-actions">
        <button id="choose-profile-image" class="settings-compact-button" type="button">${escapeHtml(strings.actions.chooseProfileImage)}</button>
        <button id="remove-profile-image" class="settings-compact-button" type="button" ${editor.imageDataUrl ? "" : "disabled"}>${escapeHtml(strings.actions.removeProfileImage)}</button>
      </div>
      <div class="profile-visual-picker-divider" aria-hidden="true"></div>
      <button id="close-profile-visual-picker" class="profile-visual-picker-close" type="button">${escapeHtml(strings.actions.closeProfileEditor)}</button>
    </div>
  `;
}

function normalizeProfileColorForUi(color: string | undefined): string {
  return typeof color === "string" && /^#[0-9a-f]{6}$/iu.test(color) ? color.toLowerCase() : DEFAULT_PROFILE_VISUAL_COLOR;
}

function clearProfileEditorError(editor: ProfileEditorState): ProfileEditorState {
  const { error: _error, ...rest } = editor;
  return rest;
}

function openProfileEditor(mode: "create" | "edit", profile?: ProfileTemplate | null): void {
  state.profileEditor = createProfileEditorState(mode, profile);
  closeFloatingSurfaces();
  render();
}

function closeProfileEditor(): void {
  state.profileEditor = null;
  render();
}

function createNativeTextDialog(
  kind: NativeTextDialogState["kind"],
  options: Partial<Pick<NativeTextDialogState, "afterSubmit" | "description">> = {},
): NativeTextDialogState {
  const strings = getUiStrings(state.uiLocale);
  return {
    kind,
    title: strings.actions.apiKeyFallback,
    description: options.description ?? strings.prompts.apiKeyBridgeDescription,
    label: strings.prompts.apiKey,
    placeholder: "sk-...",
    confirmLabel: strings.actions.save,
    cancelLabel: strings.actions.cancelEdit,
    inputType: "password",
    ...(options.afterSubmit ? { afterSubmit: options.afterSubmit } : {}),
  };
}

function openNativeTextDialog(
  kind: NativeTextDialogState["kind"],
  options: Partial<Pick<NativeTextDialogState, "afterSubmit" | "description">> = {},
): void {
  state.nativeTextDialog = createNativeTextDialog(kind, options);
  closeFloatingSurfaces();
  render();
  window.setTimeout(() => root.querySelector<HTMLInputElement>("#native-text-input")?.focus(), 0);
}

async function startCodexOauthLogin(): Promise<void> {
  try {
    await sendRuntimeMessage({ type: "account.login.start", loginType: "chatgpt" });
    await scheduleInitialize();
    state.initError = "";
    state.actionStatus = "";
  } catch (error) {
    state.initError = toUserFacingRuntimeError(error);
    render();
  }
}

function closeNativeTextDialog(): void {
  state.nativeTextDialog = null;
  render();
}

async function submitNativeTextDialog(): Promise<void> {
  const dialog = state.nativeTextDialog;
  if (!dialog || dialog.submitting) {
    return;
  }
  const value = root.querySelector<HTMLInputElement>("#native-text-input")?.value.trim() ?? "";
  if (!value) {
    state.nativeTextDialog = {
      ...dialog,
      error: stringsForState().errors.valueRequired,
    };
    render();
    return;
  }

  state.nativeTextDialog = { ...dialog, submitting: true };
  render();

  try {
    await sendRuntimeMessage({ type: "account.login.start", loginType: "apiKey", apiKey: value, confirmed: true });
    await scheduleInitialize();
    const afterSubmit = dialog.afterSubmit;
    state.initError = "";
    state.actionStatus = "";
    state.nativeTextDialog = null;
    render();
    if (afterSubmit?.kind === "retry-prompt") {
      await sendPrompt(
        afterSubmit.message,
        createRetrySendPromptOptions(afterSubmit.displayMessage, afterSubmit),
      );
    }
  } catch (error) {
    state.nativeTextDialog = {
      ...dialog,
      error: toUserFacingRuntimeError(error),
      submitting: false,
    };
    render();
  }
}

type OAuthUsageFallbackResult = "not-applicable" | "declined" | "awaiting-api-key" | "switched";

async function handleOAuthUsageFallbackRequest(
  error: unknown,
  retry: NonNullable<NativeTextDialogState["afterSubmit"]>,
): Promise<OAuthUsageFallbackResult> {
  if (
    !shouldOfferApiKeyFallbackForError({
      error,
      accountStatus: state.accountStatus,
      rateLimits: state.rateLimits,
    })
  ) {
    return "not-applicable";
  }

  const strings = stringsForState();
  const approved = await requestNativeConfirmation(strings.prompts.oauthUsageFallbackMessage, {
    title: strings.prompts.oauthUsageFallbackTitle,
    confirmLabel: strings.prompts.oauthUsageFallbackUseApiKey,
  });
  if (!approved) {
    return "declined";
  }

  if (state.accountStatus?.openAiApiKeyConfigured) {
    await sendRuntimeMessage({ type: "account.login.start", loginType: "apiKey", confirmed: true });
    await scheduleInitialize();
    state.actionStatus = strings.status.apiKeyFallbackSwitched;
    state.initError = "";
    return "switched";
  }

  state.actionStatus = strings.status.apiKeyFallbackNeedsKey;
  openNativeTextDialog("api-key", {
    description: strings.status.apiKeyFallbackNeedsKey,
    afterSubmit: retry,
  });
  return "awaiting-api-key";
}

function requestNativeConfirmation(
  message: string,
  options: {
    title?: string;
    confirmLabel?: string;
    tone?: NativeConfirmationDialogState["tone"];
  } = {},
): Promise<boolean> {
  const strings = getUiStrings(state.uiLocale);

  nativeConfirmationResolver?.(false);
  state.nativeConfirmationDialog = {
    title: options.title ?? strings.prompts.allowAction,
    message,
    confirmLabel: options.confirmLabel ?? strings.actions.allow,
    cancelLabel: strings.actions.cancelEdit,
    tone: options.tone ?? "default",
  };
  closeFloatingSurfaces();
  render();
  window.setTimeout(() => root.querySelector<HTMLButtonElement>("#native-confirmation-approve")?.focus(), 0);

  return new Promise((resolve) => {
    nativeConfirmationResolver = resolve;
  });
}

function resolveNativeConfirmation(approved: boolean): void {
  const resolver = nativeConfirmationResolver;
  nativeConfirmationResolver = null;
  state.nativeConfirmationDialog = null;
  render();
  resolver?.(approved);
}

function readProfileEditorForm(): ProfileEditorState {
  const current = state.profileEditor ?? createProfileEditorState("create");
  const name = root.querySelector<HTMLInputElement>("#profile-editor-name")?.value ?? current.name;
  const systemPrompt = root.querySelector<HTMLTextAreaElement>("#profile-editor-prompt")?.value ?? current.systemPrompt;
  const color =
    root.querySelector<HTMLInputElement>('input[name="profile-editor-color"]:checked')?.value ?? current.color;
  const icon =
    root.querySelector<HTMLInputElement>('input[name="profile-editor-icon"]:checked')?.value ?? current.icon;
  const suggestedPrompts = Array.from(root.querySelectorAll<HTMLInputElement>("[data-profile-suggestion-input]"))
    .sort(
      (left, right) =>
        Number(left.dataset.profileSuggestionInput ?? 0) - Number(right.dataset.profileSuggestionInput ?? 0),
    )
    .map((input) => input.value);
  return {
    ...current,
    name,
    systemPrompt,
    color,
    icon,
    suggestedPrompts,
  };
}

async function submitProfileEditor(): Promise<void> {
  const editor = readProfileEditorForm();
  const name = editor.name.trim();
  const strings = getUiStrings(state.uiLocale);
  if (!name) {
    state.profileEditor = {
      ...editor,
      error: strings.profileEditor.name,
    };
    render();
    return;
  }

  try {
    const result = await sendRuntimeMessage<{
      profiles: ProfileTemplate[];
      selectedProfileId: string;
    }>({
      type: editor.mode === "create" ? "profile.create" : "profile.update",
      profileId: editor.profileId,
      name,
      systemPrompt: editor.systemPrompt,
      visual: {
        color: normalizeProfileColorForUi(editor.color),
        icon: editor.icon,
        ...(editor.imageDataUrl ? { imageDataUrl: editor.imageDataUrl } : {}),
      },
      suggestedPrompts: editor.suggestedPrompts,
    });
    state.profiles = localizeBuiltinProfiles(result.profiles, state.uiLocale);
    selectProfileForComposer(result.selectedProfileId, { visible: true });
    state.profileEditor = null;
    state.actionStatus = strings.status.profileSaved;
    scheduleConversationPersist();
    render();
  } catch (error) {
    state.profileEditor = {
      ...editor,
      error: toUserFacingRuntimeError(error),
    };
    render();
  }
}

async function deleteProfile(profileId: string): Promise<void> {
  const strings = getUiStrings(state.uiLocale);
  if (!profileId || profileId === DEFAULT_PROFILE_ID) {
    return;
  }
  try {
    const result = await sendRuntimeMessage<{
      profiles: ProfileTemplate[];
      selectedProfileId: string;
    }>({
      type: "profile.delete",
      profileId,
    });
    state.profiles = localizeBuiltinProfiles(result.profiles, state.uiLocale);
    state.composerCommandPills = removeComposerCommandPill(state.composerCommandPills, profileId);
    selectProfileForComposer(result.selectedProfileId, { visible: result.selectedProfileId !== DEFAULT_PROFILE_ID });
    state.profileEditor = null;
    state.actionStatus = strings.status.profileDeleted;
    scheduleConversationPersist();
    render();
  } catch (error) {
    state.actionStatus = toUserFacingRuntimeError(error);
    render();
  }
}

async function resetSettingsFromUi(): Promise<void> {
  const strings = getUiStrings(state.uiLocale);
  try {
    const result = await sendRuntimeMessage<{
      settings: ExtensionSettings;
      profiles: ProfileTemplate[];
      selectedProfileId: string;
      selectedModel: string;
      selectedReasoningEffort: string;
      selectedServiceTier: string;
    }>({ type: "settings.reset" });
    state.settings = {
      ...result.settings,
      allowBrowserActions: true,
      browserActionPermissionMode: normalizeBrowserActionPermissionMode(result.settings.browserActionPermissionMode),
      uiLanguage: normalizeUiLanguageSetting(result.settings.uiLanguage),
      uiTheme: normalizeUiThemeSetting(result.settings.uiTheme),
      preferredVoice: normalizeCodexRealtimeVoice(result.settings.preferredVoice),
    };
    state.uiLocale = resolveUiLocale(state.settings.uiLanguage, getBrowserUiLanguage());
    syncDocumentLanguage();
    state.profiles = localizeBuiltinProfiles(result.profiles, state.uiLocale);
    selectProfileForComposer(result.selectedProfileId, { visible: false });
    state.selectedModel = result.selectedModel;
    state.selectedReasoningEffort = result.selectedReasoningEffort;
    state.selectedServiceTier = result.selectedServiceTier;
    state.composerCommandPills = state.composerCommandPills.filter((pill) => pill.kind !== "profile");
    state.actionStatus = strings.status.settingsReset;
    scheduleConversationPersist();
    render();
  } catch (error) {
    state.actionStatus = toUserFacingRuntimeError(error);
    render();
  }
}

async function setProfileEditorImageFromFile(file: File): Promise<void> {
  const editor = readProfileEditorForm();
  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    state.profileEditor = {
      ...editor,
      error: stringsForState().errors.profileImageTooLarge,
    };
    render();
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/iu.test(dataUrl)) {
    state.profileEditor = {
      ...editor,
      error: stringsForState().errors.unsupportedImageFormat,
    };
    render();
    return;
  }

  state.profileEditor = {
    ...clearProfileEditorError(editor),
    imageDataUrl: dataUrl,
  };
  render();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function renderSettingsCard(id: string, title: string, description: string, rows: string[]): string {
  return `
    <section id="settings-${escapeAttribute(id)}" class="settings-card">
      <div class="settings-card-header">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="settings-row-list">
        ${rows.join("")}
      </div>
    </section>
  `;
}

type SettingsRowOptions = {
  expanded?: boolean;
};

function renderSettingsRow(title: string, description: string, control: string): string;
function renderSettingsRow(id: string, title: string, description: string, control: string, options: SettingsRowOptions): string;
function renderSettingsRow(
  first: string,
  second: string,
  third: string,
  fourth?: string,
  fifth: SettingsRowOptions = {},
): string {
  const hasId = typeof fourth === "string";
  const id = hasId ? first : "";
  const title = hasId ? second : first;
  const description = hasId ? third : second;
  const control = hasId ? fourth : third;
  const options = hasId ? fifth : {};
  const rowClasses = ["settings-row", id ? `settings-row-${id}` : "", options.expanded ? "expanded-control" : ""]
    .filter(Boolean)
    .join(" ");
  return `
    <div class="${escapeAttribute(rowClasses)}">
      <div class="settings-row-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
      <div class="settings-row-control">${control}</div>
    </div>
  `;
}

function renderSettingsSwitch(id: string, checked: boolean, label: string): string {
  return `
    <label class="settings-switch" aria-label="${escapeAttribute(label)}">
      <input id="${escapeAttribute(id)}" type="checkbox" ${checked ? "checked" : ""} />
      <span aria-hidden="true"></span>
    </label>
  `;
}

function renderLanguageSelect(): string {
  const selectedLanguage = normalizeUiLanguageSetting(state.settings.uiLanguage);
  const strings = getUiStrings(state.uiLocale);
  return `
    <label class="settings-select-shell language-select-shell">
      <select id="setting-ui-language" aria-label="${escapeAttribute(strings.settings.uiLanguage)}">
        ${listSupportedUiLanguageOptions()
          .map(
            (option) =>
              `<option value="${escapeAttribute(option.locale)}" ${
                option.locale === selectedLanguage ? "selected" : ""
              }>${escapeHtml(formatUiLanguageOptionLabel(option, state.uiLocale))}</option>`,
          )
          .join("")}
      </select>
      <span aria-hidden="true">${renderUiIcon("chevron-down")}</span>
    </label>
  `;
}

function renderThemeSelect(): string {
  const selectedTheme = normalizeUiThemeSetting(state.settings.uiTheme);
  const strings = getUiStrings(state.uiLocale);
  const options = [
    { value: "light", label: strings.settings.themeLight },
    { value: "dark", label: strings.settings.themeDark },
    { value: "system", label: strings.settings.themeSystem },
  ] as const;
  return `
    <div class="theme-choice-grid" role="radiogroup" aria-label="${escapeAttribute(strings.settings.uiTheme)}">
      ${options
        .map(
          (option) => `
            <button
              type="button"
              class="theme-choice-card ${option.value === selectedTheme ? "selected" : ""}"
              data-theme-choice="${option.value}"
              role="radio"
              aria-checked="${option.value === selectedTheme ? "true" : "false"}"
              title="${escapeAttribute(option.label)}"
            >
              <span class="theme-preview theme-preview-${option.value}" aria-hidden="true">
                <span class="theme-preview-window left">
                  <span class="theme-preview-bar"></span>
                  <span class="theme-preview-dots"></span>
                </span>
                ${
                  option.value === "system"
                    ? `<span class="theme-preview-window right">
                        <span class="theme-preview-bar"></span>
                        <span class="theme-preview-dots"></span>
                      </span>`
                    : ""
                }
              </span>
              <span class="theme-choice-label">${escapeHtml(option.label)}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSettingsStatusPill(label: string, tone: "ok" | "warn" | "neutral"): string {
  return `<span class="settings-status-pill ${tone}">${escapeHtml(label)}</span>`;
}

function renderNativeHostStatus(strings: ReturnType<typeof getUiStrings>, health: NativeHostHealth): string {
  switch (health.status) {
    case "setup-needed":
      return strings.status.setupNeeded;
    case "reconnect":
      return strings.status.reconnectRequired;
    case "connected":
    default:
      return strings.status.connected;
  }
}

function renderNativeHostDetail(strings: ReturnType<typeof getUiStrings>, health: NativeHostHealth): string {
  if (health.detailSource === "error" && state.modelCatalogErrorMessage) {
    return state.modelCatalogErrorMessage;
  }

  return strings.help.nativeHost;
}

function renderCodexBinaryStatus(strings: ReturnType<typeof getUiStrings>, health: CodexBinaryHealth): string {
  switch (health.status) {
    case "pending":
      return strings.status.pending;
    case "not-detected":
      return strings.status.notDetected;
    case "connected":
      return strings.status.connected;
    case "automatic":
    default:
      return strings.status.automatic;
  }
}

function renderCodexBinaryDetail(strings: ReturnType<typeof getUiStrings>, health: CodexBinaryHealth): string {
  switch (health.detailSource) {
    case "waiting-for-host":
      return strings.help.codexBinaryWaitingForHost;
    case "missing":
      return state.modelCatalogErrorMessage || strings.help.codexBinaryMissing;
    case "recovered":
      return strings.help.codexBinaryRecovered;
    case "detected":
    default:
      return strings.help.codexBinaryDetected;
  }
}

function renderImageAssetFolderDetail(strings: ReturnType<typeof getUiStrings>): string {
  const folder = state.imageAssetFolder.latestFolder || state.imageAssetFolder.rootDir;
  if (!folder) {
    return strings.settingsPanel.generatedImagesEmptyDescription;
  }
  const latest = state.imageAssetFolder.latestAssetPath
    ? `${strings.labels.generatedImageLatest}: ${state.imageAssetFolder.latestAssetPath}`
    : strings.settingsPanel.generatedImagesDescription;
  return `${folder} · ${latest}`;
}

function renderDiagnosticLogFolderDetail(strings: ReturnType<typeof getUiStrings>): string {
  if (!state.diagnosticLogFolder.rootDir) {
    return strings.settingsPanel.diagnosticLogsDescription;
  }
  const latest = state.diagnosticLogFolder.latestLogPath
    ? `${strings.labels.latestLog}: ${state.diagnosticLogFolder.latestLogPath}`
    : strings.settingsPanel.diagnosticLogsDescription;
  return `${state.diagnosticLogFolder.rootDir} · ${latest}`;
}

function renderWorkspaceDiagnostics(strings: ReturnType<typeof getUiStrings>): string {
  const recentChats = getRecentChatDisplayItems();
  return `
    <details class="surface stack diagnostics-panel">
      <summary>${escapeHtml(strings.labels.diagnostics)}</summary>
      <section class="stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.recentChats)}</h2>
          ${
            state.recentChats.length
              ? `<button class="settings-compact-button danger" type="button" data-clear-chat-history="1">${escapeHtml(strings.actions.clearRecentChats)}</button>`
              : ""
          }
        </div>
        ${
          recentChats
            .map(
              (chat) => `
                <div class="recent-chat-row">
                  <button class="recent-chat ${chat.selected ? "selected" : ""}" data-chat-id="${chat.id}">
                    <span class="recent-chat-heading">
                      <strong>${escapeHtml(chat.title)}</strong>
                      ${renderRecentChatProgressIndicator(chat.busy)}
                    </span>
                    <span>${escapeHtml(chat.profileId)}</span>
                    <small>${escapeHtml(chat.relativeTime)}</small>
                  </button>
                  <button
                    class="settings-compact-button danger recent-chat-delete"
                    type="button"
                    data-delete-chat-id="${escapeAttribute(chat.id)}"
                    aria-label="${escapeAttribute(strings.actions.deleteChat)}"
                    title="${escapeAttribute(strings.actions.deleteChat)}"
                  >${renderUiIcon("trash")}</button>
                </div>
              `,
            )
            .join("") || `<p class="empty-state">${escapeHtml(strings.help.emptyRecentChats)}</p>`
        }
      </section>
      <section class="stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.codexThreads)}</h2>
        </div>
        ${
          state.serverThreads
            .map(
              (thread) => `
                <button class="recent-chat ${thread.id === state.threadId ? "selected" : ""}" data-server-thread-id="${escapeAttribute(thread.id)}">
                  <strong>${escapeHtml(thread.title)}</strong>
                  <span>${escapeHtml(thread.status)}</span>
                  <small>${escapeHtml(formatTimestamp(thread.updatedAt))}</small>
                </button>
              `,
            )
            .join("") || `<p class="empty-state">${escapeHtml(strings.help.emptyThreads)}</p>`
        }
      </section>
      <section class="stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.turnPlan)}</h2>
        </div>
        ${
          state.latestPlan?.steps.length
            ? `<div class="meta-list">
                ${state.latestPlan.steps
                  .map((step) => `<p><strong>${escapeHtml(step.status)}</strong><span>${escapeHtml(step.step)}</span></p>`)
                  .join("")}
              </div>`
            : `<p class="empty-state">${escapeHtml(strings.help.emptyPlan)}</p>`
        }
      </section>
      <section class="stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.turnDiff)}</h2>
        </div>
        ${
          state.latestDiff?.diff
            ? `<pre class="diff-preview">${escapeHtml(state.latestDiff.diff)}</pre>`
            : `<p class="empty-state">${escapeHtml(strings.help.emptyDiff)}</p>`
        }
      </section>
      <section class="stack">
        <div class="stack-header">
          <h2>${escapeHtml(strings.labels.workspaceHarness)}</h2>
        </div>
        ${renderWorkspaceHarness(strings)}
      </section>
    </details>
  `;
}

function hasComposerContextReferences(): boolean {
  return Boolean(
    getCurrentTabReference() ||
      state.attachments.size ||
      state.fileAttachments.length ||
      state.structuredInputs.length,
  );
}

function renderAttachedContextSummary(strings: ReturnType<typeof getUiStrings>): string {
  const currentTab = getCurrentTabReference();
  const currentTabChip = currentTab
    ? [renderPassiveTabReferenceChip(currentTab, strings.labels.currentTab, formatCurrentTabReferenceLabel(currentTab))]
    : [];
  const chips = Array.from(state.attachments).flatMap((attachment) => {
    if (attachment === "open-tabs") {
      return renderOpenTabReferenceChips(strings);
    }
    return [
      `<button class="summary-chip context-chip" data-remove-attachment="${escapeAttribute(attachment)}" title="${escapeAttribute(strings.actions.removeAttachment)}" aria-label="${escapeAttribute(strings.actions.removeAttachment)}">
        <span>@${escapeHtml(attachment)}</span>
        <span class="summary-chip-dismiss">${renderUiIcon("x")}</span>
      </button>`,
    ];
  });
  const files = state.fileAttachments.map((attachment) => renderFileAttachmentChip(attachment, strings));

  const structured = state.structuredInputs.map(
    (input) =>
      `<span
        class="summary-chip structured-chip"
        title="${escapeAttribute(input.description || input.path)}"
      >
        ${renderStructuredInputIcon(input)}
        <span class="structured-chip-text">${escapeHtml(structuredInputRoleLabel(input, strings))}: ${escapeHtml(input.name)}</span>
        <button
          type="button"
          class="summary-chip-remove"
          data-remove-structured-input-id="${escapeAttribute(input.id)}"
          title="${escapeAttribute(strings.actions.removeAttachment)}"
          aria-label="${escapeAttribute(strings.actions.removeAttachment)}"
        >
          ${renderUiIcon("x")}
        </button>
      </span>`,
  );

  const contextReferences = [...currentTabChip, ...chips, ...structured];
  const sections: string[] = [];
  if (contextReferences.length) {
    sections.push(`
      <div class="composer-context-group" data-composer-context-group="references">
        ${contextReferences.join("")}
      </div>
    `);
  }
  if (files.length) {
    const label = strings.labels.files;
    sections.push(`
      <div class="composer-file-group" data-composer-file-group="files">
        <span class="composer-file-label">${escapeHtml(label)}</span>
        <div class="composer-file-list">
          ${files.join("")}
        </div>
      </div>
    `);
  }

  return sections.join("");
}

function renderFileAttachmentChip(attachment: UserFileAttachment, strings: ReturnType<typeof getUiStrings>): string {
  const chipLabel = createFileChipLabel(attachment);
  const previewSrc = createImageAttachmentPreviewSrc(attachment);
  if (attachment.kind === "image" && previewSrc) {
    const canAnnotate = isAnnotatableImageAttachment(attachment);
    const previewLabel = canAnnotate ? strings.prompts.markEditArea(attachment.name) : chipLabel;
    const previewContent = `
      <img src="${escapeAttribute(previewSrc)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <span class="file-chip-label">${escapeHtml(chipLabel)}</span>
    `;
    return `
      <span class="summary-chip file-chip image-file-chip">
        ${
          canAnnotate
            ? `<button
                class="file-chip-preview"
                data-edit-file-image-id="${escapeAttribute(attachment.id)}"
                title="${escapeAttribute(previewLabel)}"
                aria-label="${escapeAttribute(previewLabel)}"
              >${previewContent}</button>`
            : `<span
                class="file-chip-preview static"
                title="${escapeAttribute(previewLabel)}"
                aria-label="${escapeAttribute(previewLabel)}"
              >${previewContent}</span>`
        }
        <button
          class="file-chip-remove"
          data-remove-file-id="${escapeAttribute(attachment.id)}"
          title="${escapeAttribute(strings.actions.removeAttachment)}"
          aria-label="${escapeAttribute(strings.actions.removeAttachment)}"
        >${renderUiIcon("x")}</button>
      </span>
    `;
  }

  return `
    <button class="summary-chip file-chip" data-remove-file-id="${escapeAttribute(attachment.id)}" title="${escapeAttribute(strings.actions.removeAttachment)}" aria-label="${escapeAttribute(strings.actions.removeAttachment)}">
      <span class="file-chip-label">${escapeHtml(chipLabel)}</span>
      <span class="summary-chip-dismiss">${renderUiIcon("x")}</span>
    </button>
  `;
}

function renderImageAnnotationEditor(strings: ReturnType<typeof getUiStrings>): string {
  if (!state.imageAnnotationEditor) {
    return "";
  }
  const editorSource = resolveImageAnnotationEditorSource();
  if (!editorSource) {
    return "";
  }

  const labels = {
    ...strings.annotationEditor,
    title: editorSource.mode === "followup" ? strings.annotationEditor.followupTitle : strings.annotationEditor.markTitle,
    done: editorSource.mode === "followup" ? strings.annotationEditor.attach : strings.annotationEditor.done,
    help: editorSource.mode === "followup" ? strings.annotationEditor.followupHelp : strings.annotationEditor.markHelp,
  };
  const colors = ["#ff453a", "#ffcc00", "#30d158", "#0a84ff", "#ffffff"];
  return `
    <div class="image-annotation-backdrop" role="dialog" aria-modal="true" aria-label="${escapeAttribute(labels.title)}">
      <header class="image-annotation-topbar">
        <button class="icon-button image-annotation-close" data-image-annotation-cancel aria-label="${escapeAttribute(labels.close)}">
          ${renderUiIcon("arrow-left")}
        </button>
        <div class="image-annotation-title">
          <strong>${escapeHtml(labels.title)}</strong>
          <span>${escapeHtml(editorSource.name)}</span>
        </div>
        <button class="image-annotation-done" data-image-annotation-done>${escapeHtml(labels.done)}</button>
      </header>
      <div class="image-annotation-workspace">
        <div class="image-annotation-stage">
          <div class="image-annotation-viewport" data-image-annotation-viewport>
            <div class="image-annotation-stage-inner" data-image-annotation-stage-inner>
              <img id="annotation-source-image" src="${escapeAttribute(editorSource.dataUrl)}" alt="${escapeAttribute(editorSource.name)}" />
              <canvas id="annotation-canvas"></canvas>
            </div>
          </div>
          <form class="annotation-text-popover" data-annotation-text-popover hidden>
            <input
              id="annotation-text-input"
              type="text"
              placeholder="${escapeAttribute(labels.text)}"
              autocomplete="off"
            />
            <button type="button" data-annotation-text-cancel>${escapeHtml(labels.close)}</button>
            <button type="submit">${escapeHtml(labels.done)}</button>
          </form>
        </div>
        <div class="image-annotation-zoom-controls" aria-label="${escapeAttribute(labels.title)}">
          <button type="button" data-image-annotation-zoom-out aria-label="${escapeAttribute(labels.zoomOut)}">${renderUiIcon("minus")}</button>
          <span data-image-annotation-zoom-label>100%</span>
          <button type="button" data-image-annotation-zoom-in aria-label="${escapeAttribute(labels.zoomIn)}">${renderUiIcon("plus")}</button>
          <button type="button" data-image-annotation-zoom-reset>${escapeHtml(labels.zoomReset)}</button>
        </div>
        <p class="image-annotation-help">${escapeHtml(labels.help)}</p>
        <div class="image-annotation-toolbar" aria-label="${escapeAttribute(labels.title)}">
          <div class="image-annotation-colors">
            ${colors
              .map(
                (color, index) => `
                  <button
                    class="annotation-color ${index === 0 ? "selected" : ""}"
                    data-annotation-color="${escapeAttribute(color)}"
                    style="--annotation-color: ${escapeAttribute(color)}"
                    aria-label="${escapeAttribute(color)}"
                  ></button>
                `,
              )
              .join("")}
          </div>
          <div class="image-annotation-tools">
            <button class="annotation-tool selected" data-annotation-tool="select">${escapeHtml(labels.select)}</button>
            <button class="annotation-tool" data-annotation-tool="draw">${escapeHtml(labels.draw)}</button>
            <button class="annotation-tool" data-annotation-tool="arrow">${escapeHtml(labels.arrow)}</button>
            <button class="annotation-tool" data-annotation-tool="text">${escapeHtml(labels.text)}</button>
          </div>
          <div class="image-annotation-actions">
            <button class="annotation-secondary" data-image-annotation-undo>${escapeHtml(labels.undo)}</button>
            <button class="annotation-secondary danger" data-image-annotation-delete-selected>${escapeHtml(labels.deleteSelected)}</button>
            <button class="annotation-secondary" data-image-annotation-clear>${escapeHtml(labels.clear)}</button>
          </div>
        </div>
        ${
          editorSource.mode === "followup"
            ? `<form class="image-annotation-followup" data-image-annotation-followup>
                <input id="image-annotation-reference-input" type="file" accept="image/*" multiple hidden />
                ${renderImageAnnotationReferenceChips(strings)}
                <button
                  type="button"
                  class="icon-button annotation-plus"
                  data-image-annotation-add-reference
                  title="${escapeAttribute(labels.addReference)}"
                  aria-label="${escapeAttribute(labels.addReference)}"
                >${renderUiIcon("plus")}</button>
                <textarea id="image-annotation-followup-input" placeholder="${escapeAttribute(labels.promptPlaceholder)}"></textarea>
                <button class="image-annotation-send" type="submit" aria-label="${escapeAttribute(labels.send)}">
                  ${renderUiIcon("send")}
                </button>
              </form>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderImageAnnotationReferenceChips(strings: ReturnType<typeof getUiStrings>): string {
  const references = state.imageAnnotationReferenceAttachments;
  if (references.length === 0) {
    return "";
  }
  return `
    <div class="image-annotation-reference-chips" aria-label="${escapeAttribute(strings.labels.files)}">
      ${references.map((attachment) => renderImageAnnotationReferenceChip(attachment, strings)).join("")}
    </div>
  `;
}

function renderImageAnnotationReferenceChip(
  attachment: UserFileAttachment,
  strings: ReturnType<typeof getUiStrings>,
): string {
  return `
    <button
      class="summary-chip file-chip"
      data-remove-image-annotation-reference-id="${escapeAttribute(attachment.id)}"
      title="${escapeAttribute(strings.actions.removeAttachment)}"
      aria-label="${escapeAttribute(strings.actions.removeAttachment)}"
      type="button"
    >
      <span>${escapeHtml(createFileChipLabel(attachment))}</span>
      <span class="summary-chip-dismiss">${renderUiIcon("x")}</span>
    </button>
  `;
}

function resolveImageAnnotationEditorSource():
  | { mode: "attachment"; name: string; dataUrl: string; attachment: UserFileAttachment }
  | { mode: "followup"; name: string; dataUrl: string }
  | null {
  const editor = state.imageAnnotationEditor;
  if (!editor) {
    return null;
  }
  if (editor.source === "conversation") {
    return {
      mode: "followup",
      name: editor.name,
      dataUrl: editor.dataUrl,
    };
  }

  const attachment = state.fileAttachments.find((item) => item.id === editor.attachmentId);
  if (!attachment || !isAnnotatableImageAttachment(attachment)) {
    return null;
  }
  return {
    mode: "attachment",
    name: attachment.name,
    dataUrl: getImageAttachmentDataUrl(attachment),
    attachment,
  };
}

function getCurrentTabReference(): OpenTabContext | null {
  if (!state.currentTabReference || isCurrentTabContextDismissed()) {
    return null;
  }
  return state.currentTabReference;
}

function getCurrentTabContextKey(tab: OpenTabContext | null = state.currentTabReference): string {
  return tab ? `${tab.tabId}:${tab.url}` : "";
}

function isCurrentTabContextDismissed(): boolean {
  const key = getCurrentTabContextKey();
  return Boolean(key && state.currentTabContextDismissedKey === key);
}

function renderOpenTabReferenceChips(strings: ReturnType<typeof getUiStrings>): string[] {
  const selectedTabs = state.openTabOptions.filter((tab) => state.selectedTabIds.includes(tab.tabId));
  if (selectedTabs.length === 0) {
    return [
      `<button class="summary-chip context-chip" data-remove-attachment="open-tabs" title="${escapeAttribute(strings.actions.removeAttachment)}" aria-label="${escapeAttribute(strings.actions.removeAttachment)}">
        <span>@${escapeHtml(renderOpenTabsSummaryLabel(strings))}</span>
        <span class="summary-chip-dismiss">${renderUiIcon("x")}</span>
      </button>`,
    ];
  }

  return selectedTabs.slice(0, 4).map(
    (tab) => `
      <button class="summary-chip tab-reference-chip removable" data-remove-tab-id="${tab.tabId}" title="${escapeAttribute(strings.actions.removeAttachment)}" aria-label="${escapeAttribute(strings.actions.removeAttachment)}">
        ${renderTabReferenceIcon(tab)}
        <span>${escapeHtml(formatTabReferenceLabel(tab))}</span>
        <span class="summary-chip-dismiss">${renderUiIcon("x")}</span>
      </button>
    `,
  );
}

function renderPassiveTabReferenceChip(tab: OpenTabContext, title: string, label = formatTabReferenceLabel(tab)): string {
  return `
    <button class="summary-chip tab-reference-chip current removable" data-remove-current-tab-context title="${escapeAttribute(title)}" aria-label="${escapeAttribute(title)}">
      ${renderTabReferenceIcon(tab, label)}
      <span>${escapeHtml(label)}</span>
      <span class="summary-chip-dismiss">${renderUiIcon("x")}</span>
    </button>
  `;
}

function renderTabReferenceIcon(tab: OpenTabContext, label = formatTabReferenceLabel(tab)): string {
  if (tab.favIconUrl) {
    return `<span class="tab-reference-icon image"><img src="${escapeAttribute(tab.favIconUrl)}" alt="" loading="lazy" /></span>`;
  }
  return `<span class="tab-reference-icon fallback-web" title="${escapeAttribute(label)}">${renderUiIcon("globe", "tab-reference-lucide-icon")}</span>`;
}

function renderOpenTabsLabel(strings: ReturnType<typeof getUiStrings>): string {
  const count = state.selectedTabIds.length;
  return count ? `${strings.labels.openTabs} (${count})` : strings.labels.openTabs;
}

function renderOpenTabsSummaryLabel(strings: ReturnType<typeof getUiStrings>): string {
  const selectedTabs = state.openTabOptions.filter((tab) => state.selectedTabIds.includes(tab.tabId));
  if (selectedTabs.length === 1) {
    return truncateLabel(selectedTabs[0]?.title || strings.labels.openTabs, 30);
  }
  if (selectedTabs.length > 1) {
    return `${truncateLabel(selectedTabs[0]?.title || strings.labels.openTabs, 22)} +${selectedTabs.length - 1}`;
  }
  return `${strings.labels.openTabs} (${state.selectedTabIds.length || "auto"})`;
}

function truncateLabel(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}...` : value;
}

function renderContextReferenceChip(
  id: PromptRequestPayload["attachments"][number],
  label: string,
): string {
  return `<span class="chip ${state.attachments.has(id) ? "active" : ""}" title="${escapeAttribute(label)}">@${escapeHtml(id)}</span>`;
}

function defaultPromptForContext(strings: ReturnType<typeof getUiStrings>): string {
  if (state.fileAttachments.length > 0 && state.attachments.has("current-page")) {
    return strings.prompts.analyzeFilesAndPage;
  }

  if (state.fileAttachments.length > 0) {
    return strings.prompts.analyzeFiles;
  }

  return "";
}

function buildConversationContextHint(): string {
  return state.messages
    .filter((message) => !message.notice && message.text.trim())
    .slice(-8)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n")
    .slice(-3000);
}

async function ingestSelectedFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList);
  if (files.length === 0) {
    return;
  }

  const plan = planAttachmentSelection(
    state.fileAttachments,
    files.map((file) => ({
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      lastModified: file.lastModified,
    })),
  );
  const acceptedByFingerprint = new Map<string, (typeof plan.accepted)[number]>(
    plan.accepted.map((attachment) => [createAttachmentFingerprint(attachment), attachment] as const),
  );
  const nextAttachments: UserFileAttachment[] = [];

  for (const file of files) {
    const key = createAttachmentFingerprint({
      name: file.name,
      sizeBytes: file.size,
      lastModified: file.lastModified,
    });
    const accepted = acceptedByFingerprint.get(key);
    if (!accepted) {
      continue;
    }

    nextAttachments.push({
      id: `file-${Date.now()}-${nextAttachments.length + state.fileAttachments.length}`,
      name: accepted.name,
      mimeType: accepted.mimeType,
      sizeBytes: accepted.sizeBytes,
      lastModified: accepted.lastModified,
      base64: await readFileAsBase64(file),
      kind: accepted.kind,
    });
  }

  state.fileAttachments = [...state.fileAttachments, ...nextAttachments];
  state.actionStatus = summarizeRejectedFiles(plan.rejected, stringsForState());
  render();
}

async function ingestImageAnnotationReferenceFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList);
  if (files.length === 0) {
    return;
  }

  const plan = planAttachmentSelection(
    state.imageAnnotationReferenceAttachments,
    files.map((file) => ({
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      lastModified: file.lastModified,
    })),
  );
  const acceptedByFingerprint = new Map<string, (typeof plan.accepted)[number]>(
    plan.accepted.map((attachment) => [createAttachmentFingerprint(attachment), attachment] as const),
  );
  const nextAttachments: UserFileAttachment[] = [];

  for (const file of files) {
    const key = createAttachmentFingerprint({
      name: file.name,
      sizeBytes: file.size,
      lastModified: file.lastModified,
    });
    const accepted = acceptedByFingerprint.get(key);
    if (!accepted || accepted.kind !== "image") {
      continue;
    }

    nextAttachments.push({
      id: `image-annotation-reference-${Date.now()}-${nextAttachments.length + state.imageAnnotationReferenceAttachments.length}`,
      name: accepted.name,
      mimeType: accepted.mimeType,
      sizeBytes: accepted.sizeBytes,
      lastModified: accepted.lastModified,
      base64: await readFileAsBase64(file),
      kind: accepted.kind,
    });
  }

  state.imageAnnotationReferenceAttachments = [...state.imageAnnotationReferenceAttachments, ...nextAttachments];
  state.actionStatus = summarizeRejectedFiles(plan.rejected, stringsForState());
  render();
}

function ingestRemoteImageUrls(urls: string[]): void {
  const incoming = urls.map((url, index) => createRemoteImageAttachment(url, index));
  if (incoming.length === 0) {
    return;
  }

  const plan = planAttachmentSelection(state.fileAttachments, incoming);
  const acceptedFingerprints = new Set(plan.accepted.map((attachment) => createAttachmentFingerprint(attachment)));
  const nextAttachments = incoming.filter((attachment) => acceptedFingerprints.has(createAttachmentFingerprint(attachment)));
  state.fileAttachments = [...state.fileAttachments, ...nextAttachments];
  state.actionStatus = summarizeRejectedFiles(plan.rejected, stringsForState());
  render();
}

function installComposerDropHandlers(): void {
  if (composerDropHandlersInstalled) {
    return;
  }
  composerDropHandlersInstalled = true;

  root.addEventListener("dragenter", (event) => {
    if (!hasComposerDropPayload(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    if (!state.composerDragActive) {
      state.composerDragActive = true;
      render();
    }
  });

  root.addEventListener("dragover", (event) => {
    if (!hasComposerDropPayload(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer!.dropEffect = "copy";
    if (!state.composerDragActive) {
      state.composerDragActive = true;
      render();
    }
  });

  root.addEventListener("dragleave", (event) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && root.contains(relatedTarget)) {
      return;
    }
    if (state.composerDragActive) {
      state.composerDragActive = false;
      render();
    }
  });

  root.addEventListener("drop", async (event) => {
    if (!hasComposerDropPayload(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    state.composerDragActive = false;

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      render();
      return;
    }

    const webImageUrls = extractWebImageUrlsFromDropData(dataTransfer);
    const droppedFiles = getDroppedFiles(dataTransfer);
    if (droppedFiles.length > 0) {
      await ingestSelectedFiles(droppedFiles);
      ingestRemoteImageUrls(webImageUrls);
      return;
    }

    ingestRemoteImageUrls(webImageUrls);
    render();
  });
}

function installImageAnnotationEditorHandlers(): void {
  const editor = state.imageAnnotationEditor;
  if (!editor) {
    return;
  }
  const editorSource = resolveImageAnnotationEditorSource();
  const image = root.querySelector<HTMLImageElement>("#annotation-source-image");
  const canvas = root.querySelector<HTMLCanvasElement>("#annotation-canvas");
  const viewport = root.querySelector<HTMLDivElement>("[data-image-annotation-viewport]");
  const stageInner = root.querySelector<HTMLDivElement>("[data-image-annotation-stage-inner]");
  const zoomLabel = root.querySelector<HTMLSpanElement>("[data-image-annotation-zoom-label]");
  const context = canvas?.getContext("2d");
  const textPopover = root.querySelector<HTMLFormElement>("[data-annotation-text-popover]");
  const textInput = root.querySelector<HTMLInputElement>("#annotation-text-input");
  if (!editorSource || !image || !canvas || !viewport || !stageInner || !context) {
    return;
  }

  type AnnotationTool = "select" | "draw" | "arrow" | "text";
  type AnnotationPoint = { x: number; y: number };
  type VectorAnnotation =
    | { id: string; type: "arrow"; from: AnnotationPoint; to: AnnotationPoint; color: string }
    | { id: string; type: "text"; x: number; y: number; text: string; color: string; rotation: number };
  type AnnotationSnapshot = {
    rasterDataUrl: string;
    annotations: VectorAnnotation[];
  };

  let tool: AnnotationTool = "select";
  let color = "#ff453a";
  let drawing = false;
  let startPoint = { x: 0, y: 0 };
  let selectedAnnotationId: string | null = null;
  let draggedAnnotationId: string | null = null;
  let rotatingAnnotationId: string | null = null;
  let rotationCenter: AnnotationPoint | null = null;
  let rotationStartAngle = 0;
  let rotationStartAnnotation: VectorAnnotation | null = null;
  let lastDragPoint: AnnotationPoint | null = null;
  let panning = false;
  let lastPanClientPoint: AnnotationPoint | null = null;
  let pendingTextPoint: AnnotationPoint | null = null;
  let annotationZoom = 1;
  const undoStack: AnnotationSnapshot[] = [];
  const vectorAnnotations: VectorAnnotation[] = [];
  const rasterCanvas = document.createElement("canvas");
  const rasterContext = rasterCanvas.getContext("2d");
  if (!rasterContext) {
    return;
  }

  const cloneAnnotation = (annotation: VectorAnnotation): VectorAnnotation =>
    annotation.type === "arrow"
      ? {
          ...annotation,
          from: { ...annotation.from },
          to: { ...annotation.to },
        }
      : { ...annotation };

  const cloneAnnotations = (): VectorAnnotation[] => vectorAnnotations.map(cloneAnnotation);

  const fitAnnotationStage = () => {
    const width = image.naturalWidth || canvas.width || 1;
    const height = image.naturalHeight || canvas.height || 1;
    const viewportRect = viewport.getBoundingClientRect();
    const maxWidth = Math.max(160, viewportRect.width - 24);
    const maxHeight = Math.max(160, viewportRect.height - 24);
    const fitScale = Math.min(maxWidth / width, maxHeight / height, 1);
    const displayWidth = Math.max(160, Math.round(width * fitScale * annotationZoom));
    const displayHeight = Math.max(120, Math.round(height * fitScale * annotationZoom));
    stageInner.style.width = `${displayWidth}px`;
    stageInner.style.height = `${displayHeight}px`;
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(annotationZoom * 100)}%`;
    }
  };

  const setAnnotationZoom = (nextZoom: number) => {
    annotationZoom = Math.max(0.5, Math.min(4, nextZoom));
    fitAnnotationStage();
  };

  canvas.dataset.annotationTool = tool;

  const initializeCanvas = () => {
    const width = image.naturalWidth || image.clientWidth || 1;
    const height = image.naturalHeight || image.clientHeight || 1;
    canvas.width = width;
    canvas.height = height;
    rasterCanvas.width = width;
    rasterCanvas.height = height;
    context.lineCap = "round";
    context.lineJoin = "round";
    rasterContext.lineCap = "round";
    rasterContext.lineJoin = "round";
    fitAnnotationStage();
    renderCanvas();
  };

  const pointFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  };

  const annotationLineWidth = () => Math.max(5, Math.min(canvas.width, canvas.height) * 0.01);
  const annotationFontSize = () => Math.max(28, Math.min(canvas.width, canvas.height) * 0.045);
  const rotationHandleRadius = () => Math.max(13, annotationLineWidth() * 1.65);

  const normalizeAngle = (angle: number) => {
    const fullTurn = Math.PI * 2;
    return ((angle % fullTurn) + fullTurn) % fullTurn;
  };

  const rotatePoint = (point: AnnotationPoint, center: AnnotationPoint, angle: number): AnnotationPoint => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  };

  const angleFromCenter = (center: AnnotationPoint, point: AnnotationPoint) =>
    Math.atan2(point.y - center.y, point.x - center.x);

  const updateSelectedAnnotationDataset = () => {
    const selected = vectorAnnotations.find((annotation) => annotation.id === selectedAnnotationId);
    canvas.dataset.annotationCount = String(vectorAnnotations.length);
    if (!selected) {
      delete canvas.dataset.selectedAnnotationType;
      delete canvas.dataset.selectedAnnotationPosition;
      delete canvas.dataset.selectedAnnotationRotation;
      return;
    }
    canvas.dataset.selectedAnnotationType = selected.type;
    canvas.dataset.selectedAnnotationPosition =
      selected.type === "arrow"
        ? `${selected.from.x.toFixed(2)},${selected.from.y.toFixed(2)},${selected.to.x.toFixed(2)},${selected.to.y.toFixed(2)}`
        : `${selected.x.toFixed(2)},${selected.y.toFixed(2)}`;
    canvas.dataset.selectedAnnotationRotation =
      selected.type === "arrow"
        ? Math.atan2(selected.to.y - selected.from.y, selected.to.x - selected.from.x).toFixed(3)
        : selected.rotation.toFixed(3);
  };

  const drawArrowPath = (
    targetContext: CanvasRenderingContext2D,
    from: AnnotationPoint,
    to: AnnotationPoint,
    arrowColor: string,
    selected: boolean,
  ) => {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLength = Math.max(14, Math.min(canvas.width, canvas.height) * 0.035);
    targetContext.save();
    targetContext.strokeStyle = arrowColor;
    targetContext.fillStyle = arrowColor;
    targetContext.lineWidth = annotationLineWidth();
    targetContext.lineCap = "round";
    targetContext.lineJoin = "round";
    targetContext.beginPath();
    targetContext.moveTo(from.x, from.y);
    targetContext.lineTo(to.x, to.y);
    targetContext.stroke();
    targetContext.beginPath();
    targetContext.moveTo(to.x, to.y);
    targetContext.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
    targetContext.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
    targetContext.closePath();
    targetContext.fill();
    if (selected) {
      targetContext.setLineDash([7, 5]);
      targetContext.lineWidth = Math.max(2, annotationLineWidth() * 0.45);
      targetContext.strokeStyle = "rgba(169, 199, 255, 0.95)";
      targetContext.beginPath();
      targetContext.moveTo(from.x, from.y);
      targetContext.lineTo(to.x, to.y);
      targetContext.stroke();
    }
    targetContext.restore();
  };

  const textBoxFor = (annotation: Extract<VectorAnnotation, { type: "text" }>) => {
    context.save();
    context.font = `700 ${annotationFontSize()}px sans-serif`;
    const metrics = context.measureText(annotation.text);
    context.restore();
    return {
      x: annotation.x - 10,
      y: annotation.y - 8,
      width: metrics.width + 20,
      height: annotationFontSize() + 18,
    };
  };

  const textCenterFor = (annotation: Extract<VectorAnnotation, { type: "text" }>): AnnotationPoint => {
    const box = textBoxFor(annotation);
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  };

  const annotationCenterFor = (annotation: VectorAnnotation): AnnotationPoint =>
    annotation.type === "arrow"
      ? {
          x: (annotation.from.x + annotation.to.x) / 2,
          y: (annotation.from.y + annotation.to.y) / 2,
        }
      : textCenterFor(annotation);

  const rotationHandleFor = (annotation: VectorAnnotation): AnnotationPoint => {
    if (annotation.type === "arrow") {
      const center = annotationCenterFor(annotation);
      const dx = annotation.to.x - annotation.from.x;
      const dy = annotation.to.y - annotation.from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const offset = Math.max(40, annotationLineWidth() * 5);
      return {
        x: center.x + (-dy / length) * offset,
        y: center.y + (dx / length) * offset,
      };
    }

    const box = textBoxFor(annotation);
    const center = textCenterFor(annotation);
    return rotatePoint(
      {
        x: box.x + box.width / 2,
        y: box.y - Math.max(34, annotationLineWidth() * 4),
      },
      center,
      annotation.rotation,
    );
  };

  const renderRotationHandle = (targetContext: CanvasRenderingContext2D, annotation: VectorAnnotation) => {
    const center = annotationCenterFor(annotation);
    const handle = rotationHandleFor(annotation);
    targetContext.save();
    targetContext.strokeStyle = "rgba(169, 199, 255, 0.95)";
    targetContext.fillStyle = "rgba(15, 17, 20, 0.86)";
    targetContext.lineWidth = Math.max(2, annotationLineWidth() * 0.36);
    targetContext.setLineDash([6, 5]);
    targetContext.beginPath();
    targetContext.moveTo(center.x, center.y);
    targetContext.lineTo(handle.x, handle.y);
    targetContext.stroke();
    targetContext.setLineDash([]);
    targetContext.beginPath();
    targetContext.arc(handle.x, handle.y, rotationHandleRadius(), 0, Math.PI * 2);
    targetContext.fill();
    targetContext.stroke();
    targetContext.beginPath();
    targetContext.arc(handle.x, handle.y, rotationHandleRadius() * 0.38, 0, Math.PI * 1.45);
    targetContext.stroke();
    targetContext.restore();
  };

  function renderCanvas(): void {
    const targetCanvas = canvas;
    const targetContext = context;
    if (!targetCanvas || !targetContext) {
      return;
    }
    targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetContext.drawImage(rasterCanvas, 0, 0);
    for (const annotation of vectorAnnotations) {
      if (annotation.type === "arrow") {
        drawArrowPath(targetContext, annotation.from, annotation.to, annotation.color, annotation.id === selectedAnnotationId);
        if (annotation.id === selectedAnnotationId) {
          renderRotationHandle(targetContext, annotation);
        }
        continue;
      }
      const box = textBoxFor(annotation);
      const center = textCenterFor(annotation);
      targetContext.save();
      targetContext.translate(center.x, center.y);
      targetContext.rotate(annotation.rotation);
      if (annotation.id === selectedAnnotationId) {
        targetContext.fillStyle = "rgba(10, 12, 16, 0.42)";
        targetContext.strokeStyle = "rgba(169, 199, 255, 0.95)";
        targetContext.lineWidth = 2;
        targetContext.setLineDash([7, 5]);
        targetContext.strokeRect(box.x - center.x, box.y - center.y, box.width, box.height);
        targetContext.setLineDash([]);
        targetContext.fillRect(box.x - center.x, box.y - center.y, box.width, box.height);
      }
      targetContext.fillStyle = annotation.color;
      targetContext.font = `700 ${annotationFontSize()}px sans-serif`;
      targetContext.textBaseline = "top";
      targetContext.shadowColor = "rgba(0, 0, 0, 0.45)";
      targetContext.shadowBlur = 6;
      targetContext.lineWidth = 5;
      targetContext.strokeStyle = "rgba(0, 0, 0, 0.56)";
      targetContext.strokeText(annotation.text, annotation.x - center.x, annotation.y - center.y);
      targetContext.fillText(annotation.text, annotation.x - center.x, annotation.y - center.y);
      targetContext.restore();
      if (annotation.id === selectedAnnotationId) {
        renderRotationHandle(targetContext, annotation);
      }
    }
    updateSelectedAnnotationDataset();
  }

  const pushUndoSnapshot = () => {
    undoStack.push({
      rasterDataUrl: rasterCanvas.toDataURL("image/png"),
      annotations: cloneAnnotations(),
    });
    if (undoStack.length > 24) {
      undoStack.shift();
    }
  };

  const restoreSnapshot = (snapshot: AnnotationSnapshot) => {
    vectorAnnotations.splice(0, vectorAnnotations.length, ...snapshot.annotations);
    selectedAnnotationId = null;
    const snapshotImage = new Image();
    snapshotImage.onload = () => {
      rasterContext.clearRect(0, 0, rasterCanvas.width, rasterCanvas.height);
      rasterContext.drawImage(snapshotImage, 0, 0, rasterCanvas.width, rasterCanvas.height);
      renderCanvas();
    };
    snapshotImage.src = snapshot.rasterDataUrl;
  };

  const distanceToSegment = (point: AnnotationPoint, start: AnnotationPoint, end: AnnotationPoint) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
  };

  const hitTestRotationHandle = (point: AnnotationPoint): VectorAnnotation | null => {
    const selected = vectorAnnotations.find((annotation) => annotation.id === selectedAnnotationId);
    if (!selected) {
      return null;
    }
    const handle = rotationHandleFor(selected);
    return Math.hypot(point.x - handle.x, point.y - handle.y) <= rotationHandleRadius() * 1.35
      ? selected
      : null;
  };

  const hitTestAnnotation = (point: AnnotationPoint): VectorAnnotation | null => {
    for (let index = vectorAnnotations.length - 1; index >= 0; index -= 1) {
      const annotation = vectorAnnotations[index];
      if (!annotation) {
        continue;
      }
      if (annotation.type === "text") {
        const box = textBoxFor(annotation);
        const unrotatedPoint = rotatePoint(point, textCenterFor(annotation), -annotation.rotation);
        if (
          unrotatedPoint.x >= box.x - 8 &&
          unrotatedPoint.x <= box.x + box.width + 8 &&
          unrotatedPoint.y >= box.y - 8 &&
          unrotatedPoint.y <= box.y + box.height + 8
        ) {
          return annotation;
        }
        continue;
      }
      if (distanceToSegment(point, annotation.from, annotation.to) <= Math.max(12, annotationLineWidth() * 1.8)) {
        return annotation;
      }
    }
    return null;
  };

  const moveAnnotation = (annotation: VectorAnnotation, dx: number, dy: number) => {
    if (annotation.type === "text") {
      annotation.x += dx;
      annotation.y += dy;
      return;
    }
    annotation.from.x += dx;
    annotation.from.y += dy;
    annotation.to.x += dx;
    annotation.to.y += dy;
  };

  const rotateAnnotation = (
    annotation: VectorAnnotation,
    center: AnnotationPoint,
    angleDelta: number,
    original: VectorAnnotation,
  ) => {
    if (annotation.type === "text" && original.type === "text") {
      annotation.rotation = normalizeAngle(original.rotation + angleDelta);
      return;
    }
    if (annotation.type === "arrow" && original.type === "arrow") {
      annotation.from = rotatePoint(original.from, center, angleDelta);
      annotation.to = rotatePoint(original.to, center, angleDelta);
    }
  };

  const deleteSelectedAnnotation = () => {
    if (!selectedAnnotationId) {
      return;
    }
    const index = vectorAnnotations.findIndex((annotation) => annotation.id === selectedAnnotationId);
    if (index < 0) {
      selectedAnnotationId = null;
      renderCanvas();
      return;
    }
    pushUndoSnapshot();
    vectorAnnotations.splice(index, 1);
    selectedAnnotationId = null;
    renderCanvas();
  };

  const capturePointer = (event: PointerEvent) => {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and some browsers may not have an active pointer to capture.
    }
  };

  const releasePointer = (event: PointerEvent) => {
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };

  const startPanning = (event: PointerEvent) => {
    panning = true;
    lastPanClientPoint = { x: event.clientX, y: event.clientY };
    canvas.dataset.annotationPanning = "true";
    capturePointer(event);
  };

  const stopPanning = () => {
    panning = false;
    lastPanClientPoint = null;
    delete canvas.dataset.annotationPanning;
  };

  const closeTextPopover = () => {
    pendingTextPoint = null;
    if (textPopover) {
      textPopover.hidden = true;
    }
    if (textInput) {
      textInput.value = "";
    }
  };

  const showTextPopover = (point: AnnotationPoint, event: PointerEvent) => {
    if (!textPopover || !textInput) {
      return;
    }
    pendingTextPoint = point;
    const stageRect = textPopover.parentElement?.getBoundingClientRect();
    const left = stageRect ? Math.max(16, Math.min(stageRect.width - 16, event.clientX - stageRect.left)) : 16;
    const top = stageRect ? Math.max(16, Math.min(stageRect.height - 16, event.clientY - stageRect.top)) : 16;
    textPopover.style.left = `${left}px`;
    textPopover.style.top = `${top}px`;
    textPopover.hidden = false;
    textInput.value = "";
    window.setTimeout(() => textInput.focus(), 0);
  };

  const addText = (point: AnnotationPoint, value: string) => {
    const text = value.trim();
    if (!text) {
      closeTextPopover();
      return;
    }
    pushUndoSnapshot();
    const annotation = {
      id: `annotation-text-${Date.now()}-${vectorAnnotations.length}`,
      type: "text" as const,
      x: point.x,
      y: point.y,
      text,
      color,
      rotation: 0,
    };
    vectorAnnotations.push(annotation);
    selectedAnnotationId = annotation.id;
    closeTextPopover();
    renderCanvas();
  };

  if (image.complete) {
    initializeCanvas();
  } else {
    image.addEventListener("load", initializeCanvas, { once: true });
  }

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (canvas.width <= 1 || canvas.height <= 1) {
      initializeCanvas();
    }
    const point = pointFromEvent(event);
    const rotationHit = hitTestRotationHandle(point);
    if (rotationHit) {
      pushUndoSnapshot();
      selectedAnnotationId = rotationHit.id;
      rotatingAnnotationId = rotationHit.id;
      rotationCenter = annotationCenterFor(rotationHit);
      rotationStartAngle = angleFromCenter(rotationCenter, point);
      rotationStartAnnotation = cloneAnnotation(rotationHit);
      renderCanvas();
      capturePointer(event);
      return;
    }

    const hitAnnotation = hitTestAnnotation(point);
    if (hitAnnotation) {
      pushUndoSnapshot();
      selectedAnnotationId = hitAnnotation.id;
      draggedAnnotationId = hitAnnotation.id;
      lastDragPoint = point;
      renderCanvas();
      capturePointer(event);
      return;
    }

    if (tool === "select") {
      closeTextPopover();
      selectedAnnotationId = null;
      renderCanvas();
      startPanning(event);
      return;
    }

    if (tool === "text") {
      showTextPopover(point, event);
      return;
    }

    pushUndoSnapshot();
    drawing = true;
    startPoint = point;
    capturePointer(event);
    if (tool === "draw") {
      selectedAnnotationId = null;
      rasterContext.strokeStyle = color;
      rasterContext.lineWidth = annotationLineWidth();
      rasterContext.beginPath();
      rasterContext.moveTo(point.x, point.y);
      renderCanvas();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (panning && lastPanClientPoint) {
      event.preventDefault();
      viewport.scrollLeft -= event.clientX - lastPanClientPoint.x;
      viewport.scrollTop -= event.clientY - lastPanClientPoint.y;
      lastPanClientPoint = { x: event.clientX, y: event.clientY };
      return;
    }

    const point = pointFromEvent(event);
    if (rotatingAnnotationId && rotationCenter && rotationStartAnnotation) {
      event.preventDefault();
      const annotation = vectorAnnotations.find((item) => item.id === rotatingAnnotationId);
      if (!annotation) {
        return;
      }
      rotateAnnotation(
        annotation,
        rotationCenter,
        angleFromCenter(rotationCenter, point) - rotationStartAngle,
        rotationStartAnnotation,
      );
      renderCanvas();
      return;
    }

    if (draggedAnnotationId && lastDragPoint) {
      event.preventDefault();
      const annotation = vectorAnnotations.find((item) => item.id === draggedAnnotationId);
      if (!annotation) {
        return;
      }
      moveAnnotation(annotation, point.x - lastDragPoint.x, point.y - lastDragPoint.y);
      lastDragPoint = point;
      renderCanvas();
      return;
    }

    if (!drawing) {
      return;
    }
    event.preventDefault();
    if (tool === "draw") {
      rasterContext.lineTo(point.x, point.y);
      rasterContext.stroke();
      renderCanvas();
      return;
    }
    if (tool === "arrow") {
      renderCanvas();
      drawArrowPath(context, startPoint, point, color, false);
    }
  });

  const stopDrawing = (event: PointerEvent) => {
    if (panning) {
      event.preventDefault();
      stopPanning();
      releasePointer(event);
      return;
    }

    if (rotatingAnnotationId) {
      event.preventDefault();
      rotatingAnnotationId = null;
      rotationCenter = null;
      rotationStartAnnotation = null;
      renderCanvas();
      releasePointer(event);
      return;
    }

    if (draggedAnnotationId) {
      event.preventDefault();
      draggedAnnotationId = null;
      lastDragPoint = null;
      renderCanvas();
      releasePointer(event);
      return;
    }

    if (!drawing) {
      return;
    }
    event.preventDefault();
    drawing = false;
    if (tool === "arrow") {
      const annotation = {
        id: `annotation-arrow-${Date.now()}-${vectorAnnotations.length}`,
        type: "arrow" as const,
        from: { ...startPoint },
        to: pointFromEvent(event),
        color,
      };
      vectorAnnotations.push(annotation);
      selectedAnnotationId = annotation.id;
    }
    renderCanvas();
    releasePointer(event);
  };

  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);

  root.querySelectorAll<HTMLButtonElement>("[data-annotation-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      tool = (button.dataset.annotationTool as AnnotationTool) ?? "select";
      canvas.dataset.annotationTool = tool;
      stopPanning();
      root.querySelectorAll("[data-annotation-tool]").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-annotation-color]").forEach((button) => {
    button.addEventListener("click", () => {
      color = button.dataset.annotationColor || color;
      root.querySelectorAll("[data-annotation-color]").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
  });

  root.querySelector<HTMLButtonElement>("[data-image-annotation-undo]")?.addEventListener("click", () => {
    const snapshot = undoStack.pop();
    if (!snapshot) {
      return;
    }
    restoreSnapshot(snapshot);
  });

  root.querySelector<HTMLButtonElement>("[data-image-annotation-delete-selected]")?.addEventListener("click", () => {
    closeTextPopover();
    deleteSelectedAnnotation();
  });

  root.querySelector<HTMLButtonElement>("[data-image-annotation-clear]")?.addEventListener("click", () => {
    closeTextPopover();
    pushUndoSnapshot();
    selectedAnnotationId = null;
    vectorAnnotations.splice(0, vectorAnnotations.length);
    rasterContext.clearRect(0, 0, rasterCanvas.width, rasterCanvas.height);
    renderCanvas();
  });

  root.querySelector<HTMLButtonElement>("[data-image-annotation-zoom-in]")?.addEventListener("click", () => {
    setAnnotationZoom(annotationZoom + 0.25);
  });

  root.querySelector<HTMLButtonElement>("[data-image-annotation-zoom-out]")?.addEventListener("click", () => {
    setAnnotationZoom(annotationZoom - 0.25);
  });

  root.querySelector<HTMLButtonElement>("[data-image-annotation-zoom-reset]")?.addEventListener("click", () => {
    setAnnotationZoom(1);
  });

  textPopover?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!pendingTextPoint) {
      closeTextPopover();
      return;
    }
    addText(pendingTextPoint, textInput?.value ?? "");
  });

  root.querySelector<HTMLButtonElement>("[data-annotation-text-cancel]")?.addEventListener("click", closeTextPopover);

  root.querySelector<HTMLButtonElement>("[data-image-annotation-cancel]")?.addEventListener("click", () => {
    state.imageAnnotationEditor = null;
    state.imageAnnotationReferenceAttachments = [];
    render();
  });

  root.querySelector<HTMLButtonElement>("[data-image-annotation-add-reference]")?.addEventListener("click", () => {
    root.querySelector<HTMLInputElement>("#image-annotation-reference-input")?.click();
  });

  root.querySelector<HTMLInputElement>("#image-annotation-reference-input")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }
    await ingestImageAnnotationReferenceFiles(input.files);
    input.value = "";
  });

  root.querySelectorAll<HTMLButtonElement>("[data-remove-image-annotation-reference-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.removeImageAnnotationReferenceId;
      if (!id) {
        return;
      }
      state.imageAnnotationReferenceAttachments = state.imageAnnotationReferenceAttachments.filter(
        (attachment) => attachment.id !== id,
      );
      render();
    });
  });

  const createAnnotatedDataUrl = () => {
    if (canvas.width <= 1 || canvas.height <= 1) {
      initializeCanvas();
    }
    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const outputContext = output.getContext("2d");
    if (!outputContext) {
      return "";
    }
    outputContext.drawImage(image, 0, 0, output.width, output.height);
    renderCanvas();
    outputContext.drawImage(canvas, 0, 0);
    return output.toDataURL("image/png");
  };

  const attachAnnotatedImage = () => {
    const dataUrl = createAnnotatedDataUrl();
    if (!dataUrl) {
      return null;
    }
    if (editorSource.mode === "attachment") {
      const annotated = createAnnotatedImageAttachment(editorSource.attachment, dataUrl);
      state.fileAttachments = state.fileAttachments.map((item) => (item.id === editorSource.attachment.id ? annotated : item));
      return annotated;
    }

    const annotated = createImageAttachmentFromDataUrl({
      id: `generated-followup-${Date.now()}`,
      name: appendFollowupImageName(editorSource.name),
      dataUrl,
    });
    return annotated;
  };

  root.querySelector<HTMLButtonElement>("[data-image-annotation-done]")?.addEventListener("click", () => {
    const annotated = attachAnnotatedImage();
    if (!annotated) {
      return;
    }
    state.imageAnnotationEditor = null;
    state.imageAnnotationReferenceAttachments = [];
    if (editorSource.mode === "followup") {
      state.fileAttachments = [
        annotated,
        ...state.fileAttachments.filter((attachment) => !attachment.id.startsWith("generated-followup-")),
      ];
    }
    state.actionStatus =
      editorSource.mode === "followup"
        ? stringsForState().status.selectedGeneratedImageAttached
        : stringsForState().status.editRegionApplied;
    render();
  });

  root.querySelector<HTMLFormElement>("[data-image-annotation-followup]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = root.querySelector<HTMLTextAreaElement>("#image-annotation-followup-input")?.value.trim() ?? "";
    const annotated = attachAnnotatedImage();
    if (!annotated) {
      return;
    }
    state.imageAnnotationEditor = null;
    const previousFileAttachments = state.fileAttachments;
    const referenceAttachments = state.imageAnnotationReferenceAttachments;
    state.imageAnnotationReferenceAttachments = [];
    if (!prompt) {
      if (editorSource.mode === "followup") {
        state.fileAttachments = [
          annotated,
          ...state.fileAttachments.filter((attachment) => !attachment.id.startsWith("generated-followup-")),
        ];
      }
      state.actionStatus =
        stringsForState().status.selectedGeneratedImageAttached;
      render();
      focusComposerAtEnd();
      return;
    }
    state.fileAttachments =
      editorSource.mode === "followup"
        ? [annotated, ...referenceAttachments]
        : state.fileAttachments;
    renderSync();
    try {
      await sendPrompt(prompt);
    } finally {
      state.fileAttachments = previousFileAttachments;
    }
  });
}

function appendFollowupImageName(name: string): string {
  const sanitized = name.trim() || "generated-image.png";
  const withoutAnnotated = sanitized.replace(/\.annotated(?=\.[^.]+$)/iu, "");
  const extensionMatch = /\.[^.]+$/u.exec(withoutAnnotated);
  if (!extensionMatch) {
    return `${withoutAnnotated}.annotated.png`;
  }
  return `${withoutAnnotated.slice(0, extensionMatch.index)}.annotated.png`;
}

function removeFileAttachment(id: string): void {
  state.fileAttachments = state.fileAttachments.filter((attachment) => attachment.id !== id);
  if (state.imageAnnotationEditor?.source === "file" && state.imageAnnotationEditor.attachmentId === id) {
    state.imageAnnotationEditor = null;
    state.imageAnnotationReferenceAttachments = [];
  }
}

function clearFileAttachments(): void {
  state.fileAttachments = [];
  state.imageAnnotationEditor = null;
  state.imageAnnotationReferenceAttachments = [];
}

function clearVisualPromptAttachments(): void {
  state.attachments.delete("image");
  state.attachments.delete("selection");
  state.currentReadStrategy = "auto";
  clearFileAttachments();
}

function dismissCurrentTabContext(): void {
  state.currentTabContextDismissedKey = getCurrentTabContextKey();
  state.attachments.delete("current-page");
  state.attachments.delete("selection");
  state.attachments.delete("image");
  state.currentReadStrategy = "auto";
}

function clearTransientComposerContext(): void {
  state.attachments = new Set();
  state.selectedTabIds = [];
  state.historyQuery = "";
  state.currentReadStrategy = "auto";
  state.structuredInputs = [];
  clearFileAttachments();
}

function clearTransientComposerCommandPill(): void {
  state.composerCommandPills = clearTransientComposerCommandPills(state.composerCommandPills);
}

function installSmokeHarness(): void {
  if (!smokeTestMode) {
    return;
  }

  window.__CODEX_SIDEPANEL_SMOKE__ = {
    async waitForComposer(timeoutMs = 5_000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (root.querySelector("#composer")) {
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      throw new Error("Smoke harness timed out waiting for the composer.");
    },
    async injectFiles(files: SmokeAttachmentSeed[]): Promise<string[]> {
      const now = Date.now();
      const browserFiles = files.map(
        (file, index) =>
          new File([base64ToBuffer(file.base64)], file.name, {
            type: file.mimeType,
            lastModified: file.lastModified ?? now + index,
          }),
      );
      await ingestSelectedFiles(browserFiles);
      return state.fileAttachments.map((attachment) => createFileChipLabel(attachment));
    },
    async injectImageAnnotationReferenceFiles(files: SmokeAttachmentSeed[]): Promise<string[]> {
      const now = Date.now();
      const browserFiles = files.map(
        (file, index) =>
          new File([base64ToBuffer(file.base64)], file.name, {
            type: file.mimeType,
            lastModified: file.lastModified ?? now + index,
          }),
      );
      await ingestImageAnnotationReferenceFiles(browserFiles);
      return state.imageAnnotationReferenceAttachments.map((attachment) => attachment.name);
    },
    enableDryRunSubmit(): void {
      smokeDryRunSubmissions = [];
    },
    getDryRunSubmissions(): string[] {
      return Array.from(smokeDryRunSubmissions);
    },
    async submitWithEnter(text: string) {
      const composer = root.querySelector<HTMLTextAreaElement>("#composer");
      if (!composer) {
        return {
          submissionCount: smokeDryRunSubmissions.length,
          lastSubmission: smokeDryRunSubmissions.at(-1) ?? null,
          composerValue: null,
          commandPills: 0,
          slashOptions: 0,
        };
      }

      composer.value = text;
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      composer.focus();
      composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 40));

      return {
        submissionCount: smokeDryRunSubmissions.length,
        lastSubmission: smokeDryRunSubmissions.at(-1) ?? null,
        composerValue: root.querySelector<HTMLTextAreaElement>("#composer")?.value ?? null,
        commandPills: root.querySelectorAll("[data-composer-command-pill]").length,
        slashOptions: root.querySelectorAll("[data-slash-option-id]").length,
      };
    },
    typeIntoComposer(text: string) {
      const composer = root.querySelector<HTMLTextAreaElement>("#composer");
      if (!composer) {
        return {
          sameNode: false,
          activeId: document.activeElement?.id ?? null,
          value: null,
        };
      }

      let currentComposer: HTMLTextAreaElement | null = composer;
      currentComposer.focus();
      for (const character of text) {
        currentComposer = root.querySelector<HTMLTextAreaElement>("#composer");
        if (!currentComposer) {
          break;
        }
        currentComposer.focus();
        currentComposer.value += character;
        currentComposer.dispatchEvent(new Event("input", { bubbles: true }));
      }

      currentComposer = root.querySelector<HTMLTextAreaElement>("#composer");
      return {
        sameNode: composer === currentComposer,
        activeId: document.activeElement?.id ?? null,
        value: currentComposer?.value ?? null,
      };
    },
    inspectCommandPopoverForTest(text: string) {
      state.openTabOptions = [
        {
          tabId: 101,
          title: "ChatGPT",
          url: "https://chatgpt.com/",
          pinned: false,
          audible: false,
        },
        {
          tabId: 102,
          title: "YouTube",
          url: "https://www.youtube.com/watch?v=demo",
          pinned: false,
          audible: false,
        },
      ];
      state.openTabOptionsState = "ready";
      state.profiles = state.profiles.length
        ? state.profiles
        : [
            {
              id: "default",
              name: "Default",
              systemPrompt: "",
              defaultContextPolicy: {
                attachCurrentPageByDefault: false,
                allowedReadStrategies: ["dom"],
              },
              allowedSources: [],
              preferredActions: [],
              adapterHints: [],
            },
          ];
      state.composerDraft = text;
      state.mentionQuery = extractMentionQuery(text);
      state.mentionActiveIndex = 0;
      state.slashQuery = extractSlashQuery(text);
      renderSync();
      const composer = root.querySelector<HTMLTextAreaElement>("#composer");
      composer?.focus({ preventScroll: true });
      if (composer) {
        composer.selectionStart = composer.value.length;
        composer.selectionEnd = composer.value.length;
        rememberComposerInteraction(composer);
      }
      return {
        mentionQuery: state.mentionQuery,
        slashQuery: state.slashQuery,
        suggestionCount: root.querySelectorAll(".suggestions").length,
        tabSuggestionCount: root.querySelectorAll("[data-tab-mention-id]").length,
        slashSuggestionCount: root.querySelectorAll("[data-slash-option-id]").length,
        popoverText: root.querySelector(".suggestions")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        activeId: document.activeElement?.id ?? null,
        composerValue: root.querySelector<HTMLTextAreaElement>("#composer")?.value ?? null,
        shellOverflow: getComputedStyle(root.querySelector<HTMLElement>(".composer-shell") as HTMLElement).overflow,
      };
    },
    simulateActiveTabUpdateForTest(input) {
      state.profiles = state.profiles.length
        ? state.profiles
        : [
            {
              id: "default",
              name: "Default",
              systemPrompt: "",
              defaultContextPolicy: {
                attachCurrentPageByDefault: false,
                allowedReadStrategies: ["dom"],
              },
              allowedSources: [],
              preferredActions: [],
              adapterHints: [],
            },
            {
              id: "marketing-strategist",
              name: "Marketing Strategist",
              systemPrompt: "",
              defaultContextPolicy: {
                attachCurrentPageByDefault: true,
                allowedReadStrategies: ["dom"],
              },
              allowedSources: ["current-page", "file"],
              preferredActions: ["draft-blog-post"],
              adapterHints: [],
            },
          ];
      applyActiveTabUpdate({
        currentPageSupport: {
          available: true,
          blockedReason: "",
        },
        currentTab: {
          tabId: 404,
          title: input.title,
          url: input.url,
          pinned: false,
          audible: false,
        },
        actionCards: input.actionCards.map((card) => ({ ...card })) as ActionCard[],
      });
      renderSync();
      return {
        currentTabTitle: state.currentTabReference?.title ?? "",
        actionCardCount: state.actionCards.length,
        suggestionCount: root.querySelectorAll(".site-suggestion").length,
        firstSuggestionTitle: root.querySelector(".site-suggestion strong")?.textContent ?? "",
        suggestionTitles: Array.from(root.querySelectorAll(".site-suggestion strong")).map((node) => node.textContent ?? ""),
        currentTabContextChip: root.querySelectorAll("[data-remove-current-tab-context]").length,
        pageContextSuppressed: isCurrentTabContextDismissed(),
      };
    },
    selectProfileForTest(profileId: string) {
      selectProfileForComposer(profileId, { visible: profileId !== DEFAULT_PROFILE_ID });
      renderSync();
      return {
        selectedProfileId: state.selectedProfileId,
        suggestionCount: root.querySelectorAll(".site-suggestion").length,
        firstSuggestionTitle: root.querySelector(".site-suggestion strong")?.textContent ?? "",
        suggestionTitles: Array.from(root.querySelectorAll(".site-suggestion strong")).map((node) => node.textContent ?? ""),
      };
    },
    preserveComposerFocusOnRender() {
      const composer = root.querySelector<HTMLTextAreaElement>("#composer");
      if (!composer) {
        return {
          activeId: document.activeElement?.id ?? null,
          value: null,
        };
      }

      composer.focus();
      composer.selectionStart = composer.value.length;
      composer.selectionEnd = composer.value.length;
      rememberComposerInteraction(composer);
      renderSync();
      const currentComposer = root.querySelector<HTMLTextAreaElement>("#composer");
      return {
        activeId: document.activeElement?.id ?? null,
        value: currentComposer?.value ?? null,
      };
    },
    setPromptActivityForTest(active: boolean) {
      state.promptActivity = active
        ? {
            clientRequestId: "smoke-pending",
            phase: "responding",
          }
        : null;
      renderSync();
      const sendButton = root.querySelector<HTMLButtonElement>("#send-prompt");
      return {
        sendButtonDisabled: !sendButton || sendButton.disabled,
        stopButtonVisible: Boolean(root.querySelector<HTMLButtonElement>("#stop-turn")),
        promptActivityVisible: Boolean(root.querySelector(".prompt-activity-card")),
        promptActivityRailVisible: Boolean(root.querySelector(".prompt-activity-rail")),
      };
    },
    setActiveTurnForTest(active: boolean) {
      state.threadId = active ? "smoke-thread" : "";
      state.activeTurn = active ? { threadId: "smoke-thread", turnId: "smoke-turn" } : null;
      state.composerDraft = "";
      renderSync();
      const stopButton = root.querySelector<HTMLButtonElement>("#stop-turn");
      return {
        sendButtonVisible: Boolean(root.querySelector("#send-prompt")),
        stopButtonVisible: Boolean(stopButton),
        stopButtonInSubmitSlot: Boolean(stopButton?.closest(".composer-submit")),
        stopButtonHasSquareIcon: Boolean(stopButton?.classList.contains("stop")),
        chatSignalsVisible: Boolean(root.querySelector(".chat-signals")),
      };
    },
    setPendingPermissionForTest() {
      state.pendingPermission = {
        plan: {
          origins: ["https://example.org/*"],
          rationale: UI_STRINGS.en.permissions.siteRead,
        },
        errorMessage: "This function must be called during a user gesture",
      };
      renderSync();
      return {
        hasPrompt: Boolean(root.querySelector(".permission-prompt")),
        hasButton: Boolean(root.querySelector("#grant-pending-permission")),
      };
    },
    setModelCatalogForTest(input) {
      state.models = input.models;
      state.modelCatalogState = input.models.length ? "ready" : "empty";
      state.modelCatalogErrorMessage = "";
      state.selectedModel = input.selectedModel;
      state.selectedReasoningEffort = input.selectedReasoningEffort ?? "";
      state.selectedServiceTier = input.selectedServiceTier ?? "";
      syncSelectedReasoningEffort();
      renderSync();
      return {
        selectedModel: state.selectedModel,
        selectedReasoningEffort: state.selectedReasoningEffort,
        selectedServiceTier: state.selectedServiceTier,
      };
    },
    setView(view: MainView): string {
      state.activeView = view;
      renderSync();
      return state.activeView;
    },
    snapshot() {
      return {
        activeView: state.activeView,
        actionStatus: state.actionStatus,
        modelLabel: renderModelChipLabel(stringsForState(), state.models.find((model) => model.id === state.selectedModel) ?? null),
        fileChipLabels: state.fileAttachments.map((attachment) => createFileChipLabel(attachment)),
        messageCount: state.messages.length,
      };
    },
    seedChatFixture(input) {
      state.activeView = "chat";
      state.messages = input.messages;
      state.chatMessageWindowSize = DEFAULT_CHAT_MESSAGE_WINDOW_SIZE;
      pendingChatScrollToBottom = true;
      state.actionCards = input.actionCards?.map((card) => ({ ...card })) ?? [];
      renderSync();
      return {
        activeView: state.activeView,
        messageCount: state.messages.length,
      };
    },
    scrollChatBy(offset: number) {
      const container = root.querySelector<HTMLElement>("#chat-scroll");
      if (!container) {
        return {
          hasScrollableArea: false,
          before: 0,
          after: 0,
        };
      }
      const before = container.scrollTop;
      container.scrollTop = before + offset;
      return {
        hasScrollableArea: container.scrollHeight > container.clientHeight,
        before,
        after: container.scrollTop,
      };
    },
  };
}

function summarizeRejectedFiles(rejected: string[], strings: ReturnType<typeof getUiStrings>): string {
  if (rejected.length === 0) {
    return "";
  }

  const first = rejected[0] ?? "";
  const [reason, name] = first.split(":");
  switch (reason) {
    case "duplicate":
      return strings.status.duplicateFile(name || "");
    case "file-too-large":
      return strings.status.fileTooLarge(name || "");
    case "too-many":
      return strings.status.tooManyFiles;
    case "total-too-large":
      return strings.status.totalFilesTooLarge;
    default:
      return strings.status.fileAttachFailed;
  }
}

function stringsForState(): ReturnType<typeof getUiStrings> {
  return getUiStrings(state.uiLocale);
}

async function readFileAsBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return arrayBufferToBase64(arrayBuffer);
}

async function installSkillArchive(file: File): Promise<void> {
  const strings = stringsForState();
  if (!file.name.toLowerCase().endsWith(".zip") && file.type !== "application/zip") {
    state.actionStatus = strings.status.skillArchiveInstallFailed;
    render();
    return;
  }

  state.actionStatus = strings.status.loading;
  render();
  try {
    const result = await sendRuntimeMessage<SkillArchiveInstallResult & { error?: string }>({
      type: "skills.archive.install",
      filename: file.name,
      base64: await readFileAsBase64(file),
    });
    if (result.error) {
      throw new Error(result.error);
    }

    state.appServerSkills = mergeCodexSkillOptions(state.appServerSkills, result.skills);
    state.actionStatus = strings.status.skillArchiveInstalled(result.skills.length);
    render();
  } catch (error) {
    state.actionStatus = `${strings.status.skillArchiveInstallFailed} ${error instanceof Error ? error.message : ""}`.trim();
    render();
  }
}

function mergeCodexSkillOptions(left: CodexSkillOption[], right: CodexSkillOption[]): CodexSkillOption[] {
  const byId = new Map<string, CodexSkillOption>();
  for (const skill of [...left, ...right]) {
    byId.set(skill.id, skill);
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function base64ToBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function renderModelChipLabel(
  strings: ReturnType<typeof getUiStrings>,
  selectedModel: CodexModelOption | null,
): string {
  switch (state.modelCatalogState) {
    case "loading":
      return strings.status.modelCatalogLoading;
    case "error":
      return strings.status.modelCatalogError;
    case "empty":
      return strings.status.modelCatalogEmpty;
    case "ready":
    default:
      return selectedModel?.label ?? strings.status.modelCatalogEmpty;
  }
}

function renderAccountBadge(): string {
  if (!state.accountStatus) {
    return getUiStrings(state.uiLocale).status.loading;
  }

  if (state.accountStatus.authMode === "chatgpt") {
    return getUiStrings(state.uiLocale).status.chatgpt;
  }
  if (state.accountStatus.authMode === "apikey") {
    return getUiStrings(state.uiLocale).status.apiKeyFallback;
  }
  return getUiStrings(state.uiLocale).status.signedOut;
}

function renderAccountEmailPill(): string {
  const email = state.accountStatus?.email?.trim();
  if (!email) {
    return "";
  }
  const strings = getUiStrings(state.uiLocale);
  return `<span class="settings-status-pill" title="${escapeAttribute(strings.status.appServerAccount(email))}">${escapeHtml(email)}</span>`;
}

function renderRateLimitBadge(rateLimits: CodexRateLimits): string {
  const strings = getUiStrings(state.uiLocale);
  const bucket = rateLimits.defaultBucket ?? rateLimits.buckets[0];
  if (!bucket?.primary) {
    return strings.status.rateLimitsUnavailable;
  }

  const reset = bucket.primary.resetsAt ? formatTimestamp(bucket.primary.resetsAt * 1000) : "later";
  return strings.status.rateLimitUsed(bucket.limitName ?? "Codex", bucket.primary.usedPercent, reset);
}

function isCurrentTurnActive(): boolean {
  if (!state.activeTurn) {
    return false;
  }

  if (!state.threadId) {
    return true;
  }

  return state.activeTurn.threadId === state.threadId;
}

function isCurrentPromptWorkActive(): boolean {
  return isCurrentTurnActive() || Boolean(state.promptActivity) || state.streamingAssistantMessageIds.size > 0;
}

function canSendCurrentComposerMessage(
  draft = state.composerDraft,
  options: { allowSteer?: boolean } = {},
): boolean {
  const currentWorkActive = isCurrentPromptWorkActive();
  const steerTurnActive = Boolean(options.allowSteer && isCurrentTurnActive());
  if (currentWorkActive && !steerTurnActive) {
    return false;
  }

  return canSendComposerMessage({
    draft,
    turnActive: steerTurnActive,
    promptActivityActive: Boolean(state.promptActivity),
    streamingAssistantActive: state.streamingAssistantMessageIds.size > 0,
    submissionStartingActive: promptSubmissionBootstrapInFlight,
  });
}

function canStartMessageReplayInteraction(): boolean {
  return (
    !promptSubmissionBootstrapInFlight &&
    !isCurrentTurnActive() &&
    !state.promptActivity &&
    state.streamingAssistantMessageIds.size === 0
  );
}

function canStartCurrentComposerWorkflow(): boolean {
  return (
    !promptSubmissionBootstrapInFlight &&
    !isCurrentTurnActive() &&
    !state.promptActivity &&
    state.streamingAssistantMessageIds.size === 0
  );
}

function isQuickInteractionLockedForState(): boolean {
  return isQuickInteractionLocked({
    turnActive: isCurrentTurnActive(),
    promptActivityActive: Boolean(state.promptActivity),
  });
}

function toggleStructuredInput(input: CodexStructuredInput): void {
  if (state.structuredInputs.some((current) => current.id === input.id)) {
    state.structuredInputs = state.structuredInputs.filter((current) => current.id !== input.id);
    return;
  }

  state.structuredInputs = [...state.structuredInputs, input];
}

function setStructuredInputEnabled(input: CodexStructuredInput, enabled: boolean): void {
  const existing = state.structuredInputs.some((current) => current.id === input.id);
  if (enabled && !existing) {
    state.structuredInputs = [...state.structuredInputs, input];
    return;
  }
  if (!enabled && existing) {
    state.structuredInputs = state.structuredInputs.filter((current) => current.id !== input.id);
  }
}

function openPluginConnectionDialog(plugin: CodexPluginOption): void {
  const companionApp = findCompanionAppForPlugin(plugin, state.connectedApps);
  const iconUrl = plugin.iconUrl || companionApp?.iconUrl || "";
  const accountEmail =
    state.accountStatus?.authMode === "chatgpt" && state.accountStatus.email?.trim()
      ? state.accountStatus.email.trim()
      : "";
  state.pluginConnectionDialog = {
    kind: "plugin",
    id: plugin.id,
    name: plugin.name,
    description: plugin.description || companionApp?.description || plugin.marketplaceName || plugin.path,
    ...(companionApp?.installUrl ? { installUrl: companionApp.installUrl } : {}),
    ...(iconUrl ? { iconUrl } : {}),
    ...(accountEmail ? { accountEmail } : {}),
  };
  closeFloatingSurfaces();
  render();
}

function closePluginConnectionDialog(): void {
  state.pluginConnectionDialog = null;
  render();
}

async function confirmPluginConnectionDialog(): Promise<void> {
  const dialog = state.pluginConnectionDialog;
  if (!dialog) {
    return;
  }
  state.pluginConnectionDialog = null;
  try {
    if (dialog.installUrl) {
      pendingPluginConnectionCatalogRefresh = true;
      await sendRuntimeMessage({ type: "app.install.open", url: dialog.installUrl });
      state.actionStatus = stringsForState().status.connectionRefreshPending;
      render();
      window.setTimeout(() => {
        void refreshPendingPluginConnectionCatalog();
      }, 2500);
      return;
    } else {
      await sendRuntimeMessage({ type: "mcp.servers.reload" });
    }
    await scheduleInitialize({ forceCatalog: true });
    state.actionStatus = stringsForState().status.connectionRefreshed;
  } catch (error) {
    state.actionStatus = toUserFacingRuntimeError(error);
    render();
  }
}

async function refreshPendingPluginConnectionCatalog(): Promise<void> {
  if (!pendingPluginConnectionCatalogRefresh || document.visibilityState === "hidden") {
    return;
  }
  pendingPluginConnectionCatalogRefresh = false;
  try {
    await scheduleInitialize({ forceCatalog: true });
    state.actionStatus = stringsForState().status.connectionRefreshed;
  } catch (error) {
    pendingPluginConnectionCatalogRefresh = true;
    state.actionStatus = toUserFacingRuntimeError(error);
  }
  render();
}

async function toggleCodexSkillEnabled(skillId: string): Promise<void> {
  const nextIds = toggleEnabledCodexSkillId(state.settings.enabledCodexSkillIds, skillId);
  const result = await sendRuntimeMessage<ExtensionSettings>({
    type: "settings.update",
    settings: { enabledCodexSkillIds: nextIds },
  });
  state.settings = {
    ...result,
    preferredVoice: normalizeCodexRealtimeVoice(result.preferredVoice),
  };
  state.structuredInputs = state.structuredInputs.filter((input) => input.type !== "skill" || nextIds.includes(input.id));
  scheduleConversationPersist();
}

async function refreshPlaywrightRuntimeStatus(): Promise<void> {
  try {
    const result = await sendRuntimeMessage<{ playwrightRuntime: UiInitPayload["playwrightRuntime"] }>({
      type: "runtime.playwright.status",
    });
    state.playwrightRuntime = result.playwrightRuntime;
    state.actionStatus = stringsForState().status.playwrightRuntimeRefreshed;
  } catch (error) {
    state.actionStatus = toErrorMessage(error);
  }
  render();
}

async function installPlaywrightRuntimeFromSettings(): Promise<void> {
  const strings = stringsForState();
  state.actionStatus = strings.status.playwrightRuntimeInstalling;
  renderSync();
  try {
    const result = await sendRuntimeMessage<{ playwrightRuntime: UiInitPayload["playwrightRuntime"] }>({
      type: "runtime.playwright.install",
    });
    state.playwrightRuntime = result.playwrightRuntime;
    if (result.playwrightRuntime.available) {
      await updatePlaywrightRuntimeEnabled(true);
      state.actionStatus = strings.status.playwrightRuntimeInstalled;
    } else {
      state.actionStatus = result.playwrightRuntime.message;
    }
  } catch (error) {
    state.actionStatus = `${strings.status.playwrightRuntimeInstallFailed} ${toErrorMessage(error)}`;
  }
  render();
}

async function updatePlaywrightRuntimeEnabled(enabled: boolean): Promise<void> {
  const result = await sendRuntimeMessage<ExtensionSettings>({
    type: "settings.update",
    settings: { playwrightBrowserControlEnabled: enabled },
  });
  state.settings = {
    ...result,
    preferredVoice: normalizeCodexRealtimeVoice(result.preferredVoice),
  };
  if (!enabled) {
    state.structuredInputs = state.structuredInputs.filter(
      (input) => input.type !== "skill" || !isRuntimeGatedStructuredInput(input),
    );
  }
  scheduleConversationPersist();
}

function isRuntimeGatedStructuredInput(input: CodexStructuredInput): boolean {
  return getCodexSkillRuntimeRequirement(input) === "playwright";
}

function getPromptStructuredInputs(): CodexStructuredInput[] {
  return mergeStructuredInputsWithEnabledCodexSkills(
    state.structuredInputs,
    state.appServerSkills,
    state.settings.enabledCodexSkillIds,
    {
      playwrightAvailable: isPlaywrightRuntimeEnabled(),
    },
    state.connectedApps,
  );
}

async function removeComposerCommandPillSelection(pillId: string, kind: ComposerCommandPill["kind"]): Promise<void> {
  state.composerCommandPills = removeComposerCommandPill(state.composerCommandPills, pillId);
  void kind;
  selectProfileForComposer(DEFAULT_PROFILE_ID, { visible: false });
  await sendRuntimeMessage({ type: "profile.select", profileId: DEFAULT_PROFILE_ID });
  scheduleConversationPersist();
}

type MentionKeyboardOption =
  | { kind: "tab-action" }
  | { kind: "tab"; tabId: number }
  | { kind: "structured"; optionId: string };

function getMentionOptionsForState(): MentionOption[] {
  if (state.mentionQuery === null) {
    return [];
  }

  return listMentionOptions(state.mentionQuery, state.uiLocale, {
    apps: state.connectedApps,
    plugins: state.appServerPlugins,
    skills: state.appServerSkills.filter((skill) => !isCodexSkillRuntimeBlocked(skill)),
  }).slice(0, 12);
}

function getTabMentionOptionsForState(): OpenTabContext[] {
  if (state.mentionQuery === null || state.openTabOptionsState !== "ready") {
    return [];
  }

  return listTabMentionOptions(state.openTabOptions, state.mentionQuery, 30);
}

function getMentionKeyboardOptionsForState(
  tabs: OpenTabContext[] = getTabMentionOptionsForState(),
  mentionOptions: MentionOption[] = getMentionOptionsForState(),
): MentionKeyboardOption[] {
  if (state.mentionQuery === null) {
    return [];
  }

  const options: MentionKeyboardOption[] = [];
  const openTabsOption = mentionOptions.find(
    (option): option is Extract<MentionOption, { kind: "context" }> =>
      option.kind === "context" && option.contextId === "open-tabs",
  );
  if (
    openTabsOption &&
    (state.openTabOptionsState === "permission" || state.openTabOptionsState === "idle" || state.openTabOptionsState === "error")
  ) {
    options.push({ kind: "tab-action" });
  }

  if (state.openTabOptionsState === "ready") {
    options.push(...tabs.map((tab) => ({ kind: "tab" as const, tabId: tab.tabId })));
  }

  options.push(
    ...mentionOptions
      .filter(isStructuredMentionOption)
      .map((option) => ({ kind: "structured" as const, optionId: option.id })),
  );

  return options;
}

function findMentionOption(id: string) {
  return getMentionOptionsForState().find((option) => option.id === id);
}

function findSlashOption(id: string) {
  return getSlashOptionsForState().find((option) => option.id === id);
}

function getSlashOptionsForState(): SlashCommandOption[] {
  if (state.slashQuery === null) {
    return [];
  }

  return listSlashCommandOptions(
    state.slashQuery,
    [],
    state.profiles,
    state.uiLocale,
    state.selectedProfileId,
  ).slice(0, 12);
}

function isComposerDropdownOpen(): boolean {
  return (
    state.slashQuery !== null ||
    state.mentionQuery !== null ||
    state.attachmentMenuOpen ||
    state.browserActionPermissionMenuOpen ||
    state.composerModelMenuOpen ||
    state.appMenuOpen
  );
}

async function applySlashOption(option: SlashCommandOption): Promise<void> {
  const selectedProfileId = selectProfileForComposer(option.profileId, { visible: option.profileId !== DEFAULT_PROFILE_ID });
  state.composerDraft = removeActiveSlashToken(state.composerDraft);
  state.slashQuery = null;
  state.slashActiveIndex = 0;
  void sendRuntimeMessage({ type: "profile.select", profileId: selectedProfileId }).catch((error) => {
    state.initError = toUserFacingRuntimeError(error, stringsForState().errors.init);
    render();
  });
  scheduleConversationPersist();
}

function moveSlashCommandSelection(key: string): boolean {
  if (state.slashQuery === null || !isSlashCommandArrowKey(key)) {
    return false;
  }

  const options = getSlashOptionsForState();
  if (!options.length) {
    return false;
  }

  state.slashActiveIndex = getNextSlashCommandIndex(
    state.slashActiveIndex,
    options.length,
    key === "ArrowDown" ? "down" : "up",
  );
  render();
  return true;
}

function moveMentionOptionSelection(key: string): boolean {
  if (state.mentionQuery === null || !isMentionOptionArrowKey(key)) {
    return false;
  }

  const options = getMentionKeyboardOptionsForState();
  if (!options.length) {
    return false;
  }

  state.mentionActiveIndex = getNextMentionOptionIndex(
    state.mentionActiveIndex,
    options.length,
    key === "ArrowDown" ? "down" : "up",
  );
  render();
  return true;
}

function restoreComposerFocus(preventScroll = false): void {
  const composer = root.querySelector<HTMLTextAreaElement>("#composer");
  if (!composer) {
    return;
  }
  composer.value = state.composerDraft;
  composer.focus({ preventScroll });
  composer.selectionStart = composer.value.length;
  composer.selectionEnd = composer.value.length;
  rememberComposerInteraction(composer);
}

async function acceptActiveSlashOptionFromComposer(): Promise<boolean> {
  const options = getSlashOptionsForState();
  const option = options[clampSlashCommandIndex(state.slashActiveIndex, options.length)];
  if (!option) {
    return false;
  }
  await applySlashOption(option);
  renderSync();
  restoreComposerFocus(true);
  return true;
}

async function acceptActiveMentionOptionFromComposer(): Promise<boolean> {
  const options = getMentionKeyboardOptionsForState();
  const option = options[clampMentionOptionIndex(state.mentionActiveIndex, options.length)];
  if (!option) {
    return false;
  }

  await applyMentionKeyboardOption(option);
  renderSync();
  restoreComposerFocus(true);
  return true;
}

async function applyMentionKeyboardOption(option: MentionKeyboardOption): Promise<void> {
  if (option.kind === "tab-action") {
    await refreshOpenTabSuggestions({ requestPermission: true });
    return;
  }

  if (option.kind === "tab") {
    toggleTabMentionSelection(option.tabId);
    return;
  }

  const mentionOption = findMentionOption(option.optionId);
  if (mentionOption && isStructuredMentionOption(mentionOption)) {
    applyStructuredMentionOption(mentionOption);
  }
}

function toggleTabMentionSelection(tabId: number): boolean {
  if (!Number.isFinite(tabId)) {
    return false;
  }

  state.attachments.add("open-tabs");
  state.selectedTabIds = toggleSelectedTabId(state.selectedTabIds, tabId);
  if (state.selectedTabIds.length === 0) {
    state.attachments.delete("open-tabs");
  }
  scheduleConversationPersist();
  return true;
}

function applyStructuredMentionOption(option: StructuredMentionOption): void {
  toggleStructuredInput(option.structuredInput);
  state.mentionQuery = null;
  state.mentionActiveIndex = 0;
  state.composerDraft = removeActiveMentionToken(state.composerDraft);
  scheduleConversationPersist();
}

function removeActiveMentionToken(value: string): string {
  return value.replace(/(?:^|\s)@[\p{L}\p{N}-]*$/iu, (match) => (match.startsWith(" ") ? " " : "")).trimEnd();
}

function structuredInputRoleLabel(input: CodexStructuredInput, strings: ReturnType<typeof getUiStrings>): string {
  if (input.type === "skill") {
    return strings.roles.skill;
  }
  return input.path.startsWith("plugin://") ? strings.roles.plugin : strings.roles.app;
}

function renderReadModeButton(mode: ReadStrategy | "auto", label: string): string {
  return `<button class="mode ${state.currentReadStrategy === mode ? "selected" : ""}" data-mode="${mode}">${escapeHtml(label)}</button>`;
}

function renderWorkspaceHarness(strings: ReturnType<typeof getUiStrings>): string {
  if (!state.workspaceHarness) {
    return `<p class="empty-state">${escapeHtml(strings.help.harnessLoading)}</p>`;
  }

  return `
    <div class="meta-list">
      <p><strong>${escapeHtml(strings.labels.root)}</strong><span>${escapeHtml(state.workspaceHarness.workspaceRoot)}</span></p>
      <p><strong>${escapeHtml(strings.labels.mode)}</strong><span>${escapeHtml(state.workspaceHarness.permissions.defaultMode)}</span></p>
      <p><strong>${escapeHtml(strings.labels.rules)}</strong><span>${state.workspaceHarness.instructionSources.length}</span></p>
      <p><strong>${escapeHtml(strings.labels.hooks)}</strong><span>${
        state.workspaceHarness.hooks.enabled ? `${state.workspaceHarness.hooks.eventCount} events` : "Disabled"
      }</span></p>
      <p><strong>${escapeHtml(strings.labels.workspaceShortcuts)}</strong><span>${state.workspaceHarness.shortcuts.length}</span></p>
    </div>
    <p class="stack-copy">${escapeHtml(strings.help.workspaceHarness)}</p>
  `;
}

function syncDocumentLanguage(): void {
  const strings = getUiStrings(state.uiLocale);
  document.documentElement.lang = state.uiLocale;
  document.documentElement.dir = isRtlUiLocale(state.uiLocale) ? "rtl" : "ltr";
  document.title = state.activeView === "workspace"
    ? `${strings.panelDocumentTitle} · ${strings.tabs.workspace}`
    : state.activeView === "context"
      ? `${strings.panelDocumentTitle} · ${strings.tabs.context}`
      : state.activeView === "skills"
        ? `${strings.panelDocumentTitle} · ${strings.tabs.skills}`
        : state.activeView === "plugins"
          ? `${strings.panelDocumentTitle} · ${strings.tabs.pluginMcp}`
      : `${strings.panelDocumentTitle} · ${strings.tabs.chat}`;
  syncDocumentTheme();
}

function syncDocumentTheme(): void {
  const themeSetting = normalizeUiThemeSetting(state.settings.uiTheme);
  const resolvedTheme = resolveUiTheme(themeSetting, getSystemPrefersDark());
  document.documentElement.dataset.themeSetting = themeSetting;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function installSystemThemeListener(): void {
  if (systemThemeListenerInstalled || typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }
  systemThemeListenerInstalled = true;
  systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  systemThemeMediaQuery.addEventListener("change", () => {
    if (normalizeUiThemeSetting(state.settings.uiTheme) !== "system") {
      return;
    }
    syncDocumentTheme();
  });
}

function captureScrollPositions(): Record<string, { scrollTop: number; stickToBottom: boolean }> {
  const positions: Record<string, { scrollTop: number; stickToBottom: boolean }> = {};
  root.querySelectorAll<HTMLElement>("[data-scroll-key]").forEach((node) => {
    const key = node.dataset.scrollKey ?? "";
    positions[key] = {
      scrollTop: node.scrollTop,
      stickToBottom: shouldStickToBottomAfterRender(
        {
          scrollTop: node.scrollTop,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        },
        { userScrollOverrideActive: key === "chat-scroll" && isChatScrollUserOverrideActive() },
      ),
    };
  });
  return positions;
}

function restoreScrollPositions(positions: Record<string, { scrollTop: number; stickToBottom: boolean }>): void {
  root.querySelectorAll<HTMLElement>("[data-scroll-key]").forEach((node) => {
    const key = node.dataset.scrollKey ?? "";
    if (key === "chat-scroll" && pendingChatScrollAnchor) {
      node.scrollTop = Math.max(
        0,
        node.scrollHeight - pendingChatScrollAnchor.previousScrollHeight + pendingChatScrollAnchor.previousScrollTop,
      );
      pendingChatScrollAnchor = null;
      return;
    }
    if (key === "chat-scroll" && pendingChatScrollToBottom) {
      forceChatScrollToBottom(node);
      pendingChatScrollToBottom = false;
      scheduleChatScrollToBottomAfterLayout();
      return;
    }
    const snapshot = positions[key];
    if (!snapshot) {
      return;
    }
    if (snapshot.stickToBottom) {
      node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
      return;
    }
    node.scrollTop = snapshot.scrollTop;
  });
}

function forceChatScrollToBottom(container = root.querySelector<HTMLElement>("#chat-scroll")): void {
  if (!container) {
    return;
  }
  chatScrollUserOverrideUntil = 0;
  container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
}

function scheduleChatScrollToBottomAfterLayout(): void {
  const run = () => {
    forceChatScrollToBottom();
    updateScrollToBottomButtonVisibility();
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      run();
      window.requestAnimationFrame(run);
    });
    return;
  }
  window.setTimeout(run, 0);
  window.setTimeout(run, 80);
}

function updateScrollToBottomButtonVisibility(): void {
  const container = root.querySelector<HTMLElement>("#chat-scroll");
  const button = root.querySelector<HTMLButtonElement>("#scroll-to-bottom");
  if (!container || !button) {
    return;
  }

  const visible = shouldShowScrollToBottomButton({
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
  });
  button.classList.toggle("visible", visible);
  button.tabIndex = visible ? 0 : -1;
}

function isChatScrollUserOverrideActive(): boolean {
  return Date.now() < chatScrollUserOverrideUntil;
}

function handleChatScroll(): void {
  const container = root.querySelector<HTMLElement>("#chat-scroll");
  if (container) {
    const renderableMessageCount = state.messages.filter(shouldRenderConversationMessage).length;
    const hiddenCount = Math.max(0, renderableMessageCount - state.chatMessageWindowSize);
    if (
      shouldExpandChatMessageWindowOnScroll(
        {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
        },
        hiddenCount,
      )
    ) {
      pendingChatScrollAnchor = {
        previousScrollTop: container.scrollTop,
        previousScrollHeight: container.scrollHeight,
      };
      state.chatMessageWindowSize = calculateNextChatMessageWindowSize(
        state.chatMessageWindowSize,
        renderableMessageCount,
        CHAT_MESSAGE_WINDOW_INCREMENT,
      );
      renderSync();
      updateScrollToBottomButtonVisibility();
      return;
    }
    const scrolledAwayFromLatest = shouldShowScrollToBottomButton({
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    });
    if (scrolledAwayFromLatest) {
      chatScrollUserOverrideUntil = Date.now() + CHAT_SCROLL_USER_OVERRIDE_MS;
    }
  }
  updateScrollToBottomButtonVisibility();
}

function scrollChatToBottom(): void {
  const container = root.querySelector<HTMLElement>("#chat-scroll");
  if (!container) {
    return;
  }
  chatScrollUserOverrideUntil = 0;
  container.scrollTo({
    top: Math.max(0, container.scrollHeight - container.clientHeight),
    behavior: "smooth",
  });
}

function captureComposerRenderState(): {
  shouldRestore: boolean;
  selectionStart: number;
  selectionEnd: number;
} {
  const composer = root.querySelector<HTMLTextAreaElement>("#composer");
  const activeComposer = document.activeElement instanceof HTMLTextAreaElement && document.activeElement.id === "composer";
  if (composer) {
    state.composerSelectionStart = composer.selectionStart ?? composer.value.length;
    state.composerSelectionEnd = composer.selectionEnd ?? composer.value.length;
  }

  return {
    shouldRestore: activeComposer,
    selectionStart: state.composerSelectionStart,
    selectionEnd: state.composerSelectionEnd,
  };
}

function restoreComposerRenderState(snapshot: {
  shouldRestore: boolean;
  selectionStart: number;
  selectionEnd: number;
}): void {
  if (!snapshot.shouldRestore) {
    return;
  }

  const composer = root.querySelector<HTMLTextAreaElement>("#composer");
  if (!composer) {
    return;
  }

  composer.focus({ preventScroll: true });
  const valueLength = composer.value.length;
  composer.selectionStart = Math.min(snapshot.selectionStart, valueLength);
  composer.selectionEnd = Math.min(snapshot.selectionEnd, valueLength);
  rememberComposerInteraction(composer);
}

function parseCssPixelValue(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getComposerTextareaAutosizeMetrics(target: HTMLTextAreaElement): ComposerTextareaAutosizeMetrics {
  const cached = composerTextareaAutosizeMetricsByElement.get(target);
  if (cached) {
    return cached;
  }

  const computedStyle = getComputedStyle(target);
  const lineHeight = parseCssPixelValue(computedStyle.lineHeight, 21);
  const paddingTop = parseCssPixelValue(computedStyle.paddingTop);
  const paddingBottom = parseCssPixelValue(computedStyle.paddingBottom);
  const minHeight = parseCssPixelValue(computedStyle.minHeight, lineHeight * 2 + paddingTop + paddingBottom);
  const metrics = {
    lineHeight,
    paddingTop,
    paddingBottom,
    minHeight,
  };
  composerTextareaAutosizeMetricsByElement.set(target, metrics);
  return metrics;
}

function resizeComposerTextarea(composer?: HTMLTextAreaElement | null): void {
  const target = composer ?? root.querySelector<HTMLTextAreaElement>("#composer");
  if (!target) {
    return;
  }

  target.style.height = "auto";

  const { lineHeight, paddingTop, paddingBottom, minHeight } = getComposerTextareaAutosizeMetrics(target);
  const nextSize = calculateComposerTextareaAutosize({
    scrollHeight: target.scrollHeight,
    lineHeight,
    paddingTop,
    paddingBottom,
    minHeight,
  });

  target.style.height = `${nextSize.height}px`;
  target.style.overflowY = nextSize.overflowY;
}

function rememberComposerInteraction(composer?: HTMLTextAreaElement | null): void {
  const target = composer ?? root.querySelector<HTMLTextAreaElement>("#composer");
  if (!target) {
    return;
  }
  state.composerSelectionStart = target.selectionStart ?? target.value.length;
  state.composerSelectionEnd = target.selectionEnd ?? target.value.length;
  resizeComposerTextarea(target);
}

function bindPluginMcpControls(rootElement: HTMLElement): void {
  rootElement.querySelector<HTMLButtonElement>("#reload-plugin-catalog")?.addEventListener("click", async () => {
    const strings = stringsForState();
    try {
      await scheduleInitialize({ forceCatalog: true });
      state.actionStatus = strings.status.connectionRefreshed;
    } catch (error) {
      state.actionStatus = toUserFacingRuntimeError(error);
    }
    render();
  });

  rootElement.querySelectorAll<HTMLElement>("[data-plugin-settings-id]").forEach((row) => {
    const openSettings = (event: Event): void => {
      const plugin = state.appServerPlugins.find((item) => item.id === row.dataset.pluginSettingsId);
      if (!plugin) {
        return;
      }
      openPluginConnectionDialog(plugin);
    };

    row.addEventListener("click", openSettings);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      openSettings(event);
    });
  });
}

function bindEvents(): void {
  const strings = getUiStrings(state.uiLocale);
  resizeComposerTextarea();

  root.querySelector<HTMLElement>("#chat-scroll")?.addEventListener("scroll", handleChatScroll, {
    passive: true,
  });
  root.querySelector<HTMLButtonElement>("#scroll-to-bottom")?.addEventListener("click", () => {
    scrollChatToBottom();
    window.setTimeout(updateScrollToBottomButtonVisibility, 220);
  });
  root.querySelectorAll<HTMLDetailsElement>("[data-message-trace-id]").forEach((details) => {
    details.addEventListener("toggle", () => {
      const messageId = details.dataset.messageTraceId?.trim();
      if (messageId) {
        messageTraceOpenByMessageId.set(messageId, details.open);
      }
    });
  });

  root.querySelector<HTMLButtonElement>("[data-usage-notice-accept]")?.addEventListener("click", async () => {
    state.settings = await sendRuntimeMessage<ExtensionSettings>({
      type: "settings.update",
      settings: { usageNoticeAccepted: true },
    });
    state.activeView = "chat";
    render();
  });

  root.querySelector<HTMLSelectElement>("#profile-select")?.addEventListener("change", async (event) => {
    const target = event.currentTarget as HTMLSelectElement;
    const selectedProfileId = selectProfileForComposer(target.value, { visible: target.value !== DEFAULT_PROFILE_ID });
    await sendRuntimeMessage({ type: "profile.select", profileId: selectedProfileId });
    scheduleConversationPersist();
    render();
  });

  root.querySelector<HTMLButtonElement>("#create-profile")?.addEventListener("click", () => {
    openProfileEditor("create");
  });

  root.querySelector<HTMLButtonElement>("#edit-profile")?.addEventListener("click", () => {
    openProfileEditor("edit", getSelectedProfile());
  });

  root.querySelector<HTMLButtonElement>("#delete-profile")?.addEventListener("click", () => {
    void deleteProfile(state.selectedProfileId);
  });

  root.querySelector<HTMLButtonElement>("#reset-settings")?.addEventListener("click", () => {
    void resetSettingsFromUi();
  });

  root.querySelector<HTMLButtonElement>("#close-profile-editor")?.addEventListener("click", closeProfileEditor);
  root.querySelector<HTMLButtonElement>("#cancel-profile-editor")?.addEventListener("click", closeProfileEditor);
  root.querySelector<HTMLElement>("[data-profile-editor-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeProfileEditor();
    }
  });
  root.querySelector<HTMLButtonElement>("#save-profile-editor")?.addEventListener("click", () => {
    void submitProfileEditor();
  });
  root.querySelector<HTMLButtonElement>("#delete-profile-in-editor")?.addEventListener("click", () => {
    const profileId = state.profileEditor?.profileId;
    if (profileId) {
      void deleteProfile(profileId);
    }
  });
  root.querySelector<HTMLButtonElement>("#profile-visual-trigger")?.addEventListener("click", () => {
    if (!state.profileEditor) {
      return;
    }
    const editor = readProfileEditorForm();
    state.profileEditor = {
      ...clearProfileEditorError(editor),
      visualPickerOpen: !state.profileEditor.visualPickerOpen,
    };
    render();
  });
  root.querySelector<HTMLButtonElement>("#close-profile-visual-picker")?.addEventListener("click", () => {
    if (!state.profileEditor) {
      return;
    }
    state.profileEditor = {
      ...clearProfileEditorError(readProfileEditorForm()),
      visualPickerOpen: false,
    };
    render();
  });
  root.querySelector<HTMLButtonElement>("#choose-profile-image")?.addEventListener("click", () => {
    root.querySelector<HTMLInputElement>("#profile-image-input")?.click();
  });
  root.querySelector<HTMLButtonElement>("#remove-profile-image")?.addEventListener("click", () => {
    if (!state.profileEditor) {
      return;
    }
    state.profileEditor = {
      ...clearProfileEditorError(readProfileEditorForm()),
      imageDataUrl: "",
    };
    render();
  });
  root.querySelectorAll<HTMLInputElement>('input[name="profile-editor-color"], input[name="profile-editor-icon"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.profileEditor = clearProfileEditorError(readProfileEditorForm());
      render();
    });
  });
  root.querySelector<HTMLInputElement>("#profile-image-input")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) {
      void setProfileEditorImageFromFile(file);
    }
  });

  root.querySelector<HTMLFormElement>("[data-native-text-dialog]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitNativeTextDialog();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-native-text-cancel]").forEach((button) => {
    button.addEventListener("click", closeNativeTextDialog);
  });
  root.querySelector<HTMLElement>("[data-native-text-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeNativeTextDialog();
    }
  });
  root.querySelector<HTMLButtonElement>("#native-confirmation-approve")?.addEventListener("click", () => {
    resolveNativeConfirmation(true);
  });
  root.querySelector<HTMLButtonElement>("#native-confirmation-cancel")?.addEventListener("click", () => {
    resolveNativeConfirmation(false);
  });
  root.querySelector<HTMLElement>("[data-native-confirmation-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      resolveNativeConfirmation(false);
    }
  });

  root.querySelector<HTMLTextAreaElement>("#profile-question-answer")?.addEventListener("input", (event) => {
    if (!state.pendingProfileQuestion) {
      return;
    }
    state.pendingProfileQuestion = {
      ...state.pendingProfileQuestion,
      answer: (event.currentTarget as HTMLTextAreaElement).value,
    };
  });

  root.querySelectorAll<HTMLButtonElement>("[data-profile-question-option]").forEach((button) => {
    button.addEventListener("click", async () => {
      await submitPendingProfileQuestion(button.dataset.profileQuestionOption ?? "");
    });
  });

  root.querySelector<HTMLButtonElement>("[data-profile-question-submit]")?.addEventListener("click", async () => {
    await submitPendingProfileQuestion();
  });

  root.querySelector<HTMLButtonElement>("[data-profile-question-dismiss]")?.addEventListener("click", () => {
    state.pendingProfileQuestion = null;
    render();
  });

  root.querySelector<HTMLSelectElement>("#model-select")?.addEventListener("change", async (event) => {
    const target = event.currentTarget as HTMLSelectElement;
    state.selectedModel = target.value;
    syncSelectedReasoningEffort();
    await persistSelectedModelControls();
    scheduleConversationPersist();
    render();
  });

  root.querySelector<HTMLButtonElement>("#composer-model-menu-trigger")?.addEventListener("click", () => {
    state.attachmentMenuOpen = false;
    state.appMenuOpen = false;
    state.browserActionPermissionMenuOpen = false;
    state.mentionQuery = null;
    state.mentionActiveIndex = 0;
    state.slashQuery = null;
    state.composerModelMenuOpen = !state.composerModelMenuOpen;
    renderSync();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-composer-model-option]").forEach((button) => {
    button.addEventListener("click", async () => {
      const model = button.dataset.composerModelOption;
      if (!model) {
        return;
      }
      state.selectedModel = model;
      syncSelectedReasoningEffort();
      state.composerModelMenuOpen = false;
      await persistSelectedModelControls();
      scheduleConversationPersist();
      renderSync();
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-composer-reasoning-option]").forEach((button) => {
    button.addEventListener("click", async () => {
      const effort = button.dataset.composerReasoningOption;
      if (!effort) {
        return;
      }
      state.selectedReasoningEffort = normalizeReasoningEffort(effort, getSelectedModelReasoningEfforts());
      state.composerModelMenuOpen = false;
      await persistSelectedModelControls();
      scheduleConversationPersist();
      renderSync();
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-composer-service-tier]").forEach((button) => {
    button.addEventListener("click", async () => {
      const tier = button.dataset.composerServiceTier ?? "";
      state.selectedServiceTier = normalizeServiceTier(tier, getSelectedModelOption()?.additionalSpeedTiers ?? []);
      state.composerModelMenuOpen = false;
      await persistSelectedModelControls();
      scheduleConversationPersist();
      renderSync();
    });
  });

  root.querySelector<HTMLButtonElement>("#grant-pending-permission")?.addEventListener("click", async () => {
    const pending = state.pendingPermission;
    if (!pending) {
      return;
    }
    const granted = await requestPermissionPlan(pending.plan, { showPendingPromptOnFailure: true });
    if (granted) {
      const retryMessage = resolvePermissionRetryPrompt({
        pendingRetryMessage: pending.retryMessage,
        composerDraft: state.composerDraft,
        composerValue: root.querySelector<HTMLTextAreaElement>("#composer")?.value ?? null,
      });
      state.pendingPermission = null;
      state.initError = "";
      void installActiveTabImagePromptExtractor();
      if (retryMessage && canSendCurrentComposerMessage()) {
        state.actionStatus =
          stringsForState().status.siteAccessRetry;
        render();
        await sendPrompt(retryMessage);
        return;
      }
      state.actionStatus = stringsForState().status.siteAccessAllowed;
      render();
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.currentReadStrategy = button.dataset.mode as ReadStrategy | "auto";
      scheduleConversationPersist();
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-remove-file-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.removeFileId;
      if (!id) {
        return;
      }
      removeFileAttachment(id);
      state.actionStatus = "";
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-image-followup]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openConversationImageFollowupEditor(button.dataset.imageMessageId, button.dataset.imageIndex);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-image-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openConversationImagePreview(button.dataset.imageMessageId, button.dataset.imageIndex);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-message-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyConversationMessage(button.dataset.messageCopy);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-code-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyMessageCodeBlock(button);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-message-regenerate]").forEach((button) => {
    button.addEventListener("click", async () => {
      await replayConversationFromMessage(button.dataset.messageRegenerate);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-message-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingMessageId = button.dataset.messageEdit ?? null;
      state.actionStatus = "";
      render();
      root.querySelector<HTMLTextAreaElement>(`[data-message-edit-input="${CSS.escape(state.editingMessageId ?? "")}"]`)?.focus({
        preventScroll: true,
      });
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-message-edit-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.editingMessageId === button.dataset.messageEditCancel) {
        state.editingMessageId = null;
      }
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-message-edit-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const messageId = button.dataset.messageEditSave;
      const input = messageId
        ? root.querySelector<HTMLTextAreaElement>(`[data-message-edit-input="${CSS.escape(messageId)}"]`)
        : null;
      await replayConversationFromMessage(messageId, input?.value);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-remove-attachment]").forEach((button) => {
    button.addEventListener("click", async () => {
      const attachment = button.dataset.removeAttachment as PromptRequestPayload["attachments"][number] | undefined;
      if (!attachment) {
        return;
      }
      state.attachments.delete(attachment);
      if (attachment === "open-tabs") {
        state.selectedTabIds = [];
      }
      if (attachment === "history") {
        state.historyItems = [];
        state.historyQuery = "";
      }
      scheduleConversationPersist();
      render();
    });
  });

  root.querySelector<HTMLButtonElement>("[data-remove-current-tab-context]")?.addEventListener("click", () => {
    dismissCurrentTabContext();
    scheduleConversationPersist();
    renderSync();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-remove-tab-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = Number(button.dataset.removeTabId);
      if (!Number.isFinite(tabId)) {
        return;
      }
      state.selectedTabIds = state.selectedTabIds.filter((value) => value !== tabId);
      if (state.selectedTabIds.length === 0) {
        state.attachments.delete("open-tabs");
      }
      scheduleConversationPersist();
      render();
    });
  });

  root.querySelector<HTMLButtonElement>("#attach-files")?.addEventListener("click", () => {
    state.appMenuOpen = false;
    state.composerModelMenuOpen = false;
    state.browserActionPermissionMenuOpen = false;
    state.attachmentMenuOpen = !state.attachmentMenuOpen;
    state.mentionQuery = null;
    state.mentionActiveIndex = 0;
    state.slashQuery = null;
    render();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-attachment-menu-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.attachmentMenuAction as AttachmentMenuAction | undefined;
      if (!action) {
        return;
      }
      await handleAttachmentMenuAction(action);
    });
  });

  root.querySelector<HTMLInputElement>("#file-attachment-input")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }
    await ingestSelectedFiles(input.files);
    input.value = "";
  });

  root.querySelectorAll<HTMLButtonElement>("[data-edit-file-image-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const attachmentId = button.dataset.editFileImageId;
      if (!attachmentId) {
        return;
      }
      state.imageAnnotationEditor = { source: "file", attachmentId };
      state.imageAnnotationReferenceAttachments = [];
      render();
    });
  });

  installImageAnnotationEditorHandlers();
  installComposerDropHandlers();

  root.querySelectorAll<HTMLButtonElement>("[data-remove-structured-input-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.removeStructuredInputId;
      if (!id) {
        return;
      }
      state.structuredInputs = state.structuredInputs.filter((input) => input.id !== id);
      scheduleConversationPersist();
      render();
    });
  });

  root.querySelector<HTMLButtonElement>("#new-chat")?.addEventListener("click", () => {
    state.appMenuOpen = false;
    state.composerModelMenuOpen = false;
    state.browserActionPermissionMenuOpen = false;
    void startNewChat();
  });

  root.querySelector<HTMLButtonElement>("#app-menu-toggle")?.addEventListener("click", () => {
    root.querySelector<HTMLTextAreaElement>("#composer")?.blur();
    state.attachmentMenuOpen = false;
    state.composerModelMenuOpen = false;
    state.browserActionPermissionMenuOpen = false;
    state.mentionQuery = null;
    state.mentionActiveIndex = 0;
    state.slashQuery = null;
    const nextOpen = !state.appMenuOpen;
    state.appMenuOpen = nextOpen;
    if (nextOpen) {
      state.appMenuRecentChatLimit = APP_MENU_RECENT_CHAT_LIMIT;
    }
    renderSync();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-top-quick-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (isQuickInteractionLockedForState()) {
        return;
      }
      state.appMenuOpen = false;
      state.attachmentMenuOpen = false;
      state.composerModelMenuOpen = false;
      state.browserActionPermissionMenuOpen = false;
      state.mentionQuery = null;
      state.mentionActiveIndex = 0;
      state.slashQuery = null;
      const action = button.dataset.topQuickAction;
      if (action === "summarize-page") {
        await handleActionCard("summarize-page");
        return;
      }
      if (action === "infographic") {
        await createInfographicFromCurrentPage();
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-menu-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.appMenuOpen = false;
      state.activeView = button.dataset.menuView as MainView;
      renderSync();
      if (state.activeView === "context" && (state.attachments.has("open-tabs") || state.selectedTabIds.length)) {
        await loadTabs();
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-menu-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.menuAction === "show-more-recent-chats") {
        state.appMenuRecentChatLimit += APP_MENU_RECENT_CHAT_LIMIT;
        state.appMenuOpen = true;
        renderSync();
        return;
      }
      if (isQuickInteractionLockedForState()) {
        return;
      }
      state.appMenuOpen = false;
      if (button.dataset.menuAction === "compact") {
        await compactCurrentConversation();
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.appMenuOpen = false;
      state.activeView = button.dataset.view as MainView;
      renderSync();
      if (state.activeView === "context" && (state.attachments.has("open-tabs") || state.selectedTabIds.length)) {
        await loadTabs();
      }
    });
  });

  root.querySelector<HTMLButtonElement>("#popout-chat")?.addEventListener("click", async () => {
    state.appMenuOpen = false;
    await sendRuntimeMessage({ type: "ui.popout" });
  });

  root.querySelector<HTMLButtonElement>("#dock-chat")?.addEventListener("click", async () => {
    state.appMenuOpen = false;
    const popupWindow = await chrome.windows.getCurrent();
    await sendRuntimeMessage({
      type: "ui.dock",
      ...(targetWindowId ? { targetWindowId } : {}),
      popupWindowId: popupWindow.id,
    });
  });

  root.querySelectorAll<HTMLButtonElement>("#chatgpt-login, #onboarding-chatgpt-login").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }
      void startCodexOauthLogin();
    });
  });

  root.querySelectorAll<HTMLButtonElement>("#apikey-login, #onboarding-apikey-login").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }
      openNativeTextDialog("api-key");
    });
  });

  root.querySelector<HTMLButtonElement>("#onboarding-open-settings")?.addEventListener("click", () => {
    state.activeView = "workspace";
    render();
  });

  root.querySelector<HTMLButtonElement>("#onboarding-reconnect")?.addEventListener("click", async () => {
    try {
      await scheduleInitialize();
      state.actionStatus = strings.status.connectionRefreshed;
      state.initError = "";
      render();
    } catch (error) {
      state.initError = toUserFacingRuntimeError(error);
      render();
    }
  });

  root.querySelector<HTMLButtonElement>("#logout")?.addEventListener("click", async () => {
    try {
      await sendRuntimeMessage({ type: "account.logout" });
      await scheduleInitialize();
      state.initError = "";
    } catch (error) {
      state.initError = toUserFacingRuntimeError(error);
      render();
    }
  });

  root.querySelector<HTMLButtonElement>("#reconnect-connection")?.addEventListener("click", async () => {
    try {
      await scheduleInitialize();
      state.actionStatus = strings.status.connectionRefreshed;
      state.initError = "";
      render();
    } catch (error) {
      state.initError = toUserFacingRuntimeError(error);
      render();
    }
  });

  root.querySelector<HTMLButtonElement>("#refresh-image-folder")?.addEventListener("click", async () => {
    try {
      state.imageAssetFolder = await sendRuntimeMessage<UiInitPayload["imageAssetFolder"]>({
        type: "image.asset.folder",
      });
      state.initError = "";
      render();
    } catch (error) {
      state.initError = toUserFacingRuntimeError(error);
      render();
    }
  });

  root.querySelector<HTMLButtonElement>("#open-image-folder")?.addEventListener("click", async () => {
    try {
      const result = await sendRuntimeMessage<{ opened: true; folder: string }>({
        type: "image.asset.folder.open",
        folder: state.imageAssetFolder.latestFolder || state.imageAssetFolder.rootDir,
      });
    state.actionStatus = stringsForState().status.imageFolderOpened(result.folder);
      state.initError = "";
      render();
    } catch (error) {
      state.initError = toUserFacingRuntimeError(error);
      render();
    }
  });

  root.querySelector<HTMLButtonElement>("#refresh-log-folder")?.addEventListener("click", async () => {
    try {
      state.diagnosticLogFolder = await sendRuntimeMessage<UiInitPayload["diagnosticLogFolder"]>({
        type: "diagnostics.log.folder",
      });
      state.initError = "";
      render();
    } catch (error) {
      state.initError = toUserFacingRuntimeError(error);
      render();
    }
  });

  root.querySelector<HTMLButtonElement>("#open-log-folder")?.addEventListener("click", async () => {
    try {
      const result = await sendRuntimeMessage<{ opened: true; folder: string }>({
        type: "diagnostics.log.folder.open",
        folder: state.diagnosticLogFolder.rootDir,
      });
    state.actionStatus = stringsForState().status.logFolderOpened(result.folder);
      state.initError = "";
      render();
    } catch (error) {
      state.initError = toUserFacingRuntimeError(error);
      render();
    }
  });

  root.querySelector<HTMLTextAreaElement>("#composer")?.addEventListener("input", (event) => {
    const target = event.currentTarget as HTMLTextAreaElement;
    const compositionActive =
      composerCompositionInProgress ||
      ("isComposing" in event && Boolean((event as InputEvent).isComposing));
    const previousComposerDraft = state.composerDraft;
    const previousMentionQuery = state.mentionQuery;
    const previousSlashQuery = state.slashQuery;
    const wasAppMenuOpen = state.appMenuOpen;
    const wasBrowserActionPermissionMenuOpen = state.browserActionPermissionMenuOpen;
    const primaryActionChanged = didComposerPrimaryActionChangeForDraftInput({
      previousComposerDraft,
      nextComposerDraft: target.value,
      currentWorkActive: isCurrentPromptWorkActive(),
      liveActive: state.voiceEnabled,
      compositionInProgress: compositionActive,
    });
    state.composerDraft = target.value;
    state.attachmentMenuOpen = false;
    state.browserActionPermissionMenuOpen = false;
    state.composerModelMenuOpen = false;
    state.appMenuOpen = false;
    rememberComposerInteraction(target);
    if (compositionActive) {
      return;
    }
    state.mentionQuery = extractMentionQuery(target.value);
    state.slashQuery = extractSlashQuery(target.value);
    if (previousMentionQuery !== state.mentionQuery) {
      state.mentionActiveIndex = 0;
    }
    if (previousSlashQuery !== state.slashQuery) {
      state.slashActiveIndex = 0;
    }
    if (state.mentionQuery !== null && previousMentionQuery === null) {
      void refreshOpenTabSuggestions({ requestPermission: false });
    }
    if (primaryActionChanged) {
      syncComposerPrimaryActionButton();
    }
    const shouldRerenderComposer =
      wasAppMenuOpen ||
      wasBrowserActionPermissionMenuOpen ||
      previousMentionQuery !== state.mentionQuery ||
      previousSlashQuery !== state.slashQuery;
    if (!shouldRerenderComposer) {
      return;
    }
    render();
  });

  root.querySelector<HTMLTextAreaElement>("#composer")?.addEventListener("pointerdown", (event) => {
    rememberComposerInteraction(event.currentTarget as HTMLTextAreaElement);
  });

  root.querySelector<HTMLTextAreaElement>("#composer")?.addEventListener("focus", (event) => {
    const wasAppMenuOpen = state.appMenuOpen;
    const wasBrowserActionPermissionMenuOpen = state.browserActionPermissionMenuOpen;
    state.attachmentMenuOpen = false;
    state.browserActionPermissionMenuOpen = false;
    state.appMenuOpen = false;
    rememberComposerInteraction(event.currentTarget as HTMLTextAreaElement);
    if (wasAppMenuOpen || wasBrowserActionPermissionMenuOpen) {
      render();
    }
  });

  root.querySelector<HTMLTextAreaElement>("#composer")?.addEventListener("compositionstart", () => {
    composerCompositionInProgress = true;
    composerCompositionStartDraft = state.composerDraft;
  });

  root.querySelector<HTMLTextAreaElement>("#composer")?.addEventListener("compositionend", (event) => {
    const target = event.currentTarget as HTMLTextAreaElement;
    const previousComposerDraft = composerCompositionStartDraft;
    const previousMentionQuery = state.mentionQuery;
    const previousSlashQuery = state.slashQuery;

    composerCompositionInProgress = false;
    composerCompositionStartDraft = "";
    state.composerDraft = target.value;
    rememberComposerInteraction(target);
    state.mentionQuery = extractMentionQuery(target.value);
    state.slashQuery = extractSlashQuery(target.value);
    if (previousMentionQuery !== state.mentionQuery) {
      state.mentionActiveIndex = 0;
    }
    if (previousSlashQuery !== state.slashQuery) {
      state.slashActiveIndex = 0;
    }
    if (state.mentionQuery !== null && previousMentionQuery === null) {
      void refreshOpenTabSuggestions({ requestPermission: false });
    }
    const primaryActionChanged = didComposerPrimaryActionChangeForDraftInput({
      previousComposerDraft,
      nextComposerDraft: target.value,
      currentWorkActive: isCurrentPromptWorkActive(),
      liveActive: state.voiceEnabled,
    });
    if (primaryActionChanged) {
      syncComposerPrimaryActionButton();
    }
    if (previousMentionQuery !== state.mentionQuery || previousSlashQuery !== state.slashQuery) {
      render();
    }
    flushDeferredComposerCompositionRender();
  });

  root.querySelector<HTMLTextAreaElement>("#composer")?.addEventListener("keydown", (event) => {
    const keyInput = {
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.isComposing,
      keyCode: "keyCode" in event ? Number((event as KeyboardEvent & { keyCode?: number }).keyCode) : undefined,
      compositionInProgress: composerCompositionInProgress,
      dropdownOpen: isComposerDropdownOpen(),
    };
    if (moveSlashCommandSelection(event.key)) {
      event.preventDefault();
      rememberComposerInteraction(event.currentTarget as HTMLTextAreaElement);
      return;
    }
    if (moveMentionOptionSelection(event.key)) {
      event.preventDefault();
      rememberComposerInteraction(event.currentTarget as HTMLTextAreaElement);
      return;
    }

    if (shouldInterceptComposerDropdownOnEnter(keyInput)) {
      event.preventDefault();
      rememberComposerInteraction(event.currentTarget as HTMLTextAreaElement);
      if (state.slashQuery !== null) {
        void acceptActiveSlashOptionFromComposer();
      } else if (state.mentionQuery !== null) {
        void acceptActiveMentionOptionFromComposer();
      }
      return;
    }

    const shouldSubmit = shouldSubmitComposerOnKeydown(keyInput);
    if (!shouldSubmit) {
      rememberComposerInteraction(event.currentTarget as HTMLTextAreaElement);
      return;
    }
    event.preventDefault();
    if (!canSendCurrentComposerMessage(undefined, { allowSteer: isCurrentTurnActive() })) {
      rememberComposerInteraction(event.currentTarget as HTMLTextAreaElement);
      return;
    }
    void sendPrompt();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-tab-picker-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await refreshOpenTabSuggestions({ requestPermission: true });
      const composer = root.querySelector<HTMLTextAreaElement>("#composer");
      if (composer) {
        composer.value = state.composerDraft;
        composer.focus({ preventScroll: true });
        composer.selectionStart = composer.value.length;
        composer.selectionEnd = composer.value.length;
        rememberComposerInteraction(composer);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-tab-mention-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = Number(button.dataset.tabMentionId);
      if (!toggleTabMentionSelection(tabId)) {
        return;
      }
      renderSync();
      const composer = root.querySelector<HTMLTextAreaElement>("#composer");
      if (composer) {
        composer.value = state.composerDraft;
        composer.focus({ preventScroll: true });
        composer.selectionStart = composer.value.length;
        composer.selectionEnd = composer.value.length;
        rememberComposerInteraction(composer);
      }
    });
  });

  root.querySelector<HTMLButtonElement>("[data-tab-mention-done]")?.addEventListener("click", () => {
    state.mentionQuery = null;
    state.mentionActiveIndex = 0;
    state.composerDraft = removeActiveMentionToken(state.composerDraft);
    scheduleConversationPersist();
    renderSync();
    const composer = root.querySelector<HTMLTextAreaElement>("#composer");
    if (composer) {
      composer.value = state.composerDraft;
      composer.focus({ preventScroll: true });
      composer.selectionStart = composer.value.length;
      composer.selectionEnd = composer.value.length;
      rememberComposerInteraction(composer);
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-mention-option-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const option = findMentionOption(button.dataset.mentionOptionId ?? "");
      if (!option) {
        return;
      }
      if (option.kind === "context") {
        await refreshOpenTabSuggestions({ requestPermission: true });
        return;
      }

      applyStructuredMentionOption(option);
      renderSync();
      restoreComposerFocus(true);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-slash-option-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const option = findSlashOption(button.dataset.slashOptionId ?? "");
      if (!option) {
        return;
      }

      await applySlashOption(option);
      renderSync();
      restoreComposerFocus();
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-remove-composer-command-pill]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const pillId = button.dataset.removeComposerCommandPill ?? "";
      if (!pillId) {
        return;
      }

      await removeComposerCommandPillSelection(pillId, "profile");
      renderSync();
      restoreComposerFocus(true);
    });
  });

  root.querySelectorAll<HTMLInputElement>("[data-codex-skill-toggle]").forEach((input) => {
    input.addEventListener("change", async () => {
      const skillId = input.dataset.codexSkillToggle;
      if (!skillId) {
        return;
      }
      await toggleCodexSkillEnabled(skillId);
      render();
    });
  });

  root.querySelector<HTMLInputElement>("[data-playwright-runtime-toggle]")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement | null;
    if (!input || !state.playwrightRuntime.available) {
      return;
    }
    await updatePlaywrightRuntimeEnabled(input.checked);
    render();
  });

  root.querySelector<HTMLButtonElement>("[data-install-playwright-runtime]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await installPlaywrightRuntimeFromSettings();
  });

  root.querySelector<HTMLButtonElement>("[data-refresh-playwright-runtime]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await refreshPlaywrightRuntimeStatus();
  });

  root.querySelector<HTMLButtonElement>("#upload-skill-archive")?.addEventListener("click", () => {
    root.querySelector<HTMLInputElement>("#skill-archive-input")?.click();
  });

  root.querySelector<HTMLInputElement>("#skill-archive-input")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement | null;
    if (!input) {
      return;
    }
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    await installSkillArchive(file);
  });

  root.querySelectorAll<HTMLInputElement>("[data-app-id]").forEach((input) => {
    input.addEventListener("change", async () => {
      const app = state.connectedApps.find((item) => item.id === input.dataset.appId);
      if (!app || !isConnectedAppMentionAvailable(app)) {
        input.checked = false;
        return;
      }
      setStructuredInputEnabled({
        id: app.id,
        type: "mention",
        name: app.name,
        path: app.path,
        description: app.description,
        token: app.token,
        ...(app.iconUrl ? { iconUrl: app.iconUrl } : {}),
      }, input.checked);
      scheduleConversationPersist();
      render();
    });
  });

  bindPluginMcpControls(root);

  root.querySelector<HTMLButtonElement>("[data-plugin-connect-close]")?.addEventListener("click", () => {
    closePluginConnectionDialog();
  });

  root.querySelector<HTMLElement>("[data-plugin-connect-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closePluginConnectionDialog();
    }
  });

  root.querySelector<HTMLButtonElement>("[data-plugin-connect-confirm]")?.addEventListener("click", () => {
    void confirmPluginConnectionDialog();
  });

  root.querySelector<HTMLButtonElement>("#reload-mcp-servers")?.addEventListener("click", async () => {
    const strings = stringsForState();
    try {
      await sendRuntimeMessage({ type: "mcp.servers.reload" });
      const result = await sendRuntimeMessage<{ mcpServers?: CodexMcpServerOption[] }>({
        type: "mcp.servers.list",
        detail: "toolsAndAuthOnly",
      });
      state.mcpServers = result.mcpServers ?? state.mcpServers;
      state.actionStatus = strings.status.connectionRefreshed;
    } catch (error) {
      state.actionStatus = toUserFacingRuntimeError(error);
    }
    render();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-mcp-oauth-server]").forEach((button) => {
    button.addEventListener("click", async () => {
      const name = button.dataset.mcpOauthServer ?? "";
      if (!name) {
        return;
      }
      const strings = stringsForState();
      try {
        await sendRuntimeMessage({ type: "mcp.oauth.login.start", name });
        const result = await sendRuntimeMessage<{ mcpServers?: CodexMcpServerOption[] }>({
          type: "mcp.servers.list",
          detail: "toolsAndAuthOnly",
        });
        state.mcpServers = result.mcpServers ?? state.mcpServers;
        state.actionStatus = strings.status.connectionRefreshed;
      } catch (error) {
        state.actionStatus = toUserFacingRuntimeError(error);
      }
      render();
    });
  });

  const composerPrimaryActionButton = root.querySelector<HTMLButtonElement>(
    "#send-prompt, #stop-turn, #live-toggle, #stop-live",
  );
  if (composerPrimaryActionButton) {
    bindComposerPrimaryActionButton(composerPrimaryActionButton);
  }

  root.querySelector<HTMLButtonElement>("#voice-input-toggle")?.addEventListener("click", async () => {
    if (state.voiceInputActive) {
      void commitComposerVoiceInput();
      return;
    }
    await startComposerVoiceInput();
  });

  root.querySelector<HTMLButtonElement>("#voice-dictation-cancel")?.addEventListener("click", () => {
    cancelComposerVoiceInput();
  });

  root.querySelector<HTMLButtonElement>("#voice-dictation-confirm")?.addEventListener("click", () => {
    void commitComposerVoiceInput();
  });

  root.querySelectorAll<HTMLButtonElement>(".action-card").forEach((button) => {
    button.addEventListener("click", () => {
      if (isQuickInteractionLockedForState()) {
        return;
      }
      void handleActionCard(button.dataset.action ?? "");
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-youtube-seek]").forEach((button) => {
    button.addEventListener("click", () => {
      const seconds = Number(button.dataset.youtubeSeek);
      if (!Number.isFinite(seconds)) {
        return;
      }
      void seekYouTubeTimestamp(seconds);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-delete-chat-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const conversationId = button.dataset.deleteChatId;
      if (!conversationId) {
        return;
      }
      await deleteConversationFromUi(conversationId);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-clear-chat-history]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await clearConversationHistoryFromUi({
        returnToSettings: button.dataset.clearChatHistory === "settings",
      });
    });
  });

  root.querySelectorAll<HTMLButtonElement>(".recent-chat").forEach((button) => {
    button.addEventListener("click", async () => {
      const conversationId = button.dataset.chatId;
      if (!conversationId) {
        return;
      }
      const result = await chrome.runtime.sendMessage({ type: "conversation.resume", conversationId });
      hydrateConversation(result.conversation);
      state.appMenuOpen = false;
      state.activeView = "chat";
      render();
      if (state.attachments.has("open-tabs") || state.selectedTabIds.length) {
        await loadTabs();
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-server-thread-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (isQuickInteractionLockedForState()) {
        return;
      }
      const threadId = button.dataset.serverThreadId;
      if (!threadId) {
        return;
      }
      const result = await chrome.runtime.sendMessage({ type: "conversation.resume.server", threadId });
      hydrateConversation(result.conversation);
      state.threadId = threadId;
      state.appMenuOpen = false;
      state.activeView = "chat";
      render();
    });
  });

  root.querySelector<HTMLButtonElement>("#load-tabs")?.addEventListener("click", () => void loadTabs());

  root.querySelector<HTMLFormElement>("#custom-site-suggestion-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveCustomSiteSuggestionFromSettings();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-delete-custom-site-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      void deleteCustomSiteSuggestionFromSettings(button.dataset.deleteCustomSiteSuggestion);
    });
  });

  root.querySelector<HTMLButtonElement>("#search-history")?.addEventListener("click", async () => {
    const input = root.querySelector<HTMLInputElement>("#history-query");
    state.historyQuery = input?.value ?? "";
    const result = await sendRuntimeMessageWithConfirmation<{ items: Array<{ title: string; url: string }> }>(
      createConfirmedHistorySearchRequest(state.historyQuery),
    );
    if (isCancelledResult(result)) {
      return;
    }
    state.historyItems = result.items;
    if (state.historyQuery) {
      state.attachments.add("history");
      scheduleConversationPersist();
    }
    render();
  });

  root.querySelector<HTMLInputElement>("#setting-remember-chats")?.addEventListener("change", async (event) => {
    state.settings = await chrome.runtime.sendMessage({
      type: "settings.update",
      settings: { rememberChats: (event.currentTarget as HTMLInputElement).checked },
    });
    render();
  });

  root.querySelector<HTMLInputElement>("#setting-auto-compact")?.addEventListener("change", async (event) => {
    state.settings = await chrome.runtime.sendMessage({
      type: "settings.update",
      settings: { autoCompactConversations: (event.currentTarget as HTMLInputElement).checked },
    });
    render();
  });

  root.querySelector<HTMLInputElement>("#setting-live-captions")?.addEventListener("change", async (event) => {
    const enabled = (event.currentTarget as HTMLInputElement).checked;
    state.settings = await chrome.runtime.sendMessage({
      type: "settings.update",
      settings: { liveCaptions: enabled },
    });
    if (!enabled) {
      state.liveCaption = "";
      resetVoiceTranscriptMirrorState(voiceTranscriptMirror);
    }
    render();
  });

  root.querySelector<HTMLInputElement>("#setting-voice-navigation")?.addEventListener("change", async (event) => {
    state.settings = await chrome.runtime.sendMessage({
      type: "settings.update",
      settings: { allowVoiceNavigation: (event.currentTarget as HTMLInputElement).checked },
    });
    render();
  });

  root.querySelector<HTMLButtonElement>("#composer-permission-menu-trigger")?.addEventListener("click", () => {
    state.attachmentMenuOpen = false;
    state.appMenuOpen = false;
    state.composerModelMenuOpen = false;
    state.mentionQuery = null;
    state.mentionActiveIndex = 0;
    state.slashQuery = null;
    state.browserActionPermissionMenuOpen = !state.browserActionPermissionMenuOpen;
    renderSync();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-browser-action-permission-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      const mode = normalizeBrowserActionPermissionMode(button.dataset.browserActionPermissionMode);
      state.browserActionPermissionMenuOpen = false;
      state.settings = await chrome.runtime.sendMessage({
        type: "settings.update",
        settings: {
          allowBrowserActions: true,
          browserActionPermissionMode: mode,
        },
      });
      render();
    });
  });

  root.querySelector<HTMLSelectElement>("#setting-ui-language")?.addEventListener("change", async (event) => {
    const uiLanguage = normalizeUiLanguageSetting((event.currentTarget as HTMLSelectElement).value);
    state.settings = await chrome.runtime.sendMessage({
      type: "settings.update",
      settings: { uiLanguage },
    });
    state.settings = {
      ...state.settings,
      uiLanguage: normalizeUiLanguageSetting(state.settings.uiLanguage),
      uiTheme: normalizeUiThemeSetting(state.settings.uiTheme),
      preferredVoice: normalizeCodexRealtimeVoice(state.settings.preferredVoice),
    };
    state.uiLocale = resolveUiLocale(state.settings.uiLanguage, getBrowserUiLanguage());
    syncDocumentLanguage();
    state.profiles = localizeBuiltinProfiles(state.profiles, state.uiLocale);
    render();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", async () => {
      const uiTheme = normalizeUiThemeSetting(button.dataset.themeChoice);
      if (uiTheme === normalizeUiThemeSetting(state.settings.uiTheme)) {
        return;
      }
      state.settings = await chrome.runtime.sendMessage({
        type: "settings.update",
        settings: { uiTheme },
      });
      state.settings = {
        ...state.settings,
        uiTheme: normalizeUiThemeSetting(state.settings.uiTheme),
        preferredVoice: normalizeCodexRealtimeVoice(state.settings.preferredVoice),
      };
      syncDocumentTheme();
      render();
    });
  });

  root.querySelector<HTMLSelectElement>("#voice-select")?.addEventListener("change", async (event) => {
    state.settings = await chrome.runtime.sendMessage({
      type: "settings.update",
      settings: { preferredVoice: normalizeCodexRealtimeVoice((event.currentTarget as HTMLSelectElement).value) },
    });
    state.settings = {
      ...state.settings,
      preferredVoice: normalizeCodexRealtimeVoice(state.settings.preferredVoice),
    };
    render();
  });
}

async function handleAttachmentMenuAction(action: AttachmentMenuAction): Promise<void> {
  switch (action) {
    case "add-files":
      state.attachmentMenuOpen = false;
      state.browserActionPermissionMenuOpen = false;
      renderSync();
      root.querySelector<HTMLInputElement>("#file-attachment-input")?.click();
      return;
    case "attach-tabs":
      state.attachmentMenuOpen = false;
      state.browserActionPermissionMenuOpen = false;
      state.slashQuery = null;
      state.slashActiveIndex = 0;
      state.mentionQuery = "";
      state.mentionActiveIndex = 0;
      state.composerDraft = ensureTrailingComposerToken(state.composerDraft, "@");
      renderSync();
      await refreshOpenTabSuggestions({ requestPermission: false });
      focusComposerAtEnd();
      return;
    case "attach-screenshot":
      state.attachmentMenuOpen = false;
      state.browserActionPermissionMenuOpen = false;
      state.attachments.add("image");
      state.currentReadStrategy = "vision";
      state.actionStatus = stringsForState().status.screenAttached;
      scheduleConversationPersist();
      render();
      return;
    case "saved-prompts":
      state.attachmentMenuOpen = false;
      state.browserActionPermissionMenuOpen = false;
      state.mentionQuery = null;
      state.mentionActiveIndex = 0;
      state.slashQuery = "";
      state.slashActiveIndex = 0;
      state.composerDraft = ensureTrailingComposerToken(state.composerDraft, "/");
      render();
      focusComposerAtEnd();
      return;
    default:
      state.attachmentMenuOpen = false;
      state.browserActionPermissionMenuOpen = false;
      render();
  }
}

function ensureTrailingComposerToken(value: string, token: "@" | "/"): string {
  const trimmedEnd = value.trimEnd();
  if (trimmedEnd.endsWith(token)) {
    return trimmedEnd;
  }
  return `${trimmedEnd}${trimmedEnd ? " " : ""}${token}`;
}

function focusComposerAtEnd(): void {
  const composer = root.querySelector<HTMLTextAreaElement>("#composer");
  if (!composer) {
    return;
  }
  composer.value = state.composerDraft;
  composer.focus({ preventScroll: true });
  composer.selectionStart = composer.value.length;
  composer.selectionEnd = composer.value.length;
  rememberComposerInteraction(composer);
}

async function loadTabs(): Promise<void> {
  const result = (await sendRuntimeMessageWithConfirmation<{ tabs: OpenTabContext[] }>({
    type: "context.tabs.list",
  })) as { tabs?: OpenTabContext[]; cancelled?: boolean };
  if (isCancelledResult(result) || !result.tabs) {
    return;
  }
  state.openTabOptions = result.tabs as OpenTabContext[];
  state.openTabOptionsState = "ready";
  const container = root.querySelector<HTMLDivElement>("#tabs-container");
  if (!container) {
    return;
  }
  container.innerHTML = result.tabs
    .slice(0, 10)
    .map(
      (tab) => `
        <label class="tab-row tab-row-with-icon">
          <input type="checkbox" data-tab-id="${tab.tabId}" ${state.selectedTabIds.includes(tab.tabId) ? "checked" : ""} />
          ${renderTabReferenceIcon(tab)}
          <span>${escapeHtml(tab.title)}</span>
          <small>${escapeHtml(tab.url)}</small>
        </label>
      `,
    )
    .join("");
  container.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const tabId = Number(checkbox.dataset.tabId);
      if (checkbox.checked) {
        if (!state.selectedTabIds.includes(tabId)) {
          state.selectedTabIds = [...state.selectedTabIds, tabId].slice(0, 10);
        }
        state.attachments.add("open-tabs");
      } else {
        state.selectedTabIds = state.selectedTabIds.filter((value) => value !== tabId);
      }
      scheduleConversationPersist();
      render();
    });
  });
}

async function refreshOpenTabSuggestions(options: { requestPermission: boolean }): Promise<void> {
  if (state.openTabOptionsState === "loading") {
    return;
  }

  state.openTabOptionsState = "loading";
  state.openTabOptionsError = "";
  render();

  try {
    if (!options.requestPermission) {
      const alreadyGranted = await chrome.permissions.contains({ permissions: ["tabs"] }).catch(() => false);
      if (!alreadyGranted) {
        state.openTabOptions = [];
        state.openTabOptionsState = "permission";
        render();
        return;
      }
    }

    const result = options.requestPermission
      ? await sendRuntimeMessageWithConfirmation<{ tabs: OpenTabContext[] }>({ type: "context.tabs.list" })
      : await sendRuntimeMessage<{ tabs?: OpenTabContext[]; requiresPermission?: boolean }>({ type: "context.tabs.list" });

    const tabResult = result as { tabs?: OpenTabContext[]; requiresPermission?: boolean };
    if (isCancelledResult(result) || tabResult.requiresPermission) {
      state.openTabOptions = [];
      state.openTabOptionsState = "permission";
      render();
      return;
    }

    state.openTabOptions = tabResult.tabs ?? [];
    state.openTabOptionsState = "ready";
  } catch (error) {
    state.openTabOptions = [];
    state.openTabOptionsState = "error";
    state.openTabOptionsError = toUserFacingRuntimeError(error);
  }
  render();
}

async function sendPrompt(
  messageOverride?: string,
  options: { resetThread?: boolean; displayMessage?: string } = {},
): Promise<void> {
  const composer = root.querySelector<HTMLTextAreaElement>("#composer");
  const strings = stringsForState();
  const composerText = composer?.value ?? state.composerDraft;
  const isDirectComposerTextSend = messageOverride === undefined && composerText.trim().length > 0;
  const currentWorkActiveAtSubmit = isCurrentPromptWorkActive();
  const message = (messageOverride ?? composer?.value ?? "").trim() || defaultPromptForContext(strings);
  const displayMessage = (options.displayMessage ?? message).trim();
  if (!canSendCurrentComposerMessage(message, { allowSteer: isDirectComposerTextSend })) {
    return;
  }

  if (!message) {
    return;
  }

  if (smokeTestMode) {
    smokeDryRunSubmissions.push(message);
    state.composerDraft = "";
    clearTransientComposerCommandPill();
    if (composer) {
      composer.value = "";
    }
    state.mentionQuery = null;
    state.mentionActiveIndex = 0;
    state.slashQuery = null;
    render();
    return;
  }

  if (state.settings.allowBrowserActions) {
    const command = parseVoiceNavigationCommand(message);
    if (command) {
      const response = await sendRuntimeMessageWithConfirmation<{ matched?: boolean; cancelled?: boolean }>({
        type: "page.navigate",
        command,
      });
      if (isCancelledResult(response)) {
        return;
      }
      state.composerDraft = "";
      clearTransientComposerCommandPill();
      state.liveCaption = message;
      if (composer) {
        composer.value = "";
      }
      scheduleConversationPersist();
      render();
      return;
    }
  }

  let conversationIdAtStart = state.currentConversationId;
  let userMessageId = "";
  let clientRequestId = "";
  let submittedComposerFileAttachments: UserFileAttachment[] = [];
  promptSubmissionBootstrapInFlight = true;

  try {
    Object.assign(state, createPendingComposerDraftState());
    state.activeView = "chat";
    const activeProfileId = ensureComposerProfileSelection();
    if (!state.currentConversationId) {
      const created = await sendRuntimeMessage<{ conversation: SavedConversation }>({
        type: "conversation.new",
        profileId: activeProfileId,
        model: state.selectedModel,
      });
      hydrateConversation(created.conversation);
    }
    conversationIdAtStart = state.currentConversationId;
    if (options.resetThread) {
      state.threadId = "";
      state.activeTurn = null;
    }
    const sendAsTurnSteer = shouldSendComposerAsTurnSteer({
      draft: message,
      resetThread: Boolean(options.resetThread),
      threadId: state.threadId || undefined,
      activeTurn: state.activeTurn,
      currentWorkActive: currentWorkActiveAtSubmit,
      source: isDirectComposerTextSend ? "composer" : "programmatic",
    });
    sanitizeUnavailableCurrentPageState();
    const nextAttachments = Array.from(state.attachments);
    const contextHint = buildConversationContextHint();
    const submittedFileAttachmentState = createSubmittedComposerFileAttachmentState(
      state.fileAttachments,
    );
    submittedComposerFileAttachments = submittedFileAttachmentState.messageFileAttachments;
    const submittedMessageFileAttachments = submittedFileAttachmentState.messageFileAttachments;
    const submittedRequestFileAttachments = submittedFileAttachmentState.requestFileAttachments;
    state.fileAttachments = submittedFileAttachmentState.composerFileAttachments;
    const messageProfile = createMessageProfileSnapshot();
    const submittedMessageStructuredInputs = createConversationMessageStructuredInputs(state.structuredInputs);
    const submittedPromptStructuredInputs = getPromptStructuredInputs();
    userMessageId = `user-${Date.now()}`;
    clientRequestId = `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setActivePromptUserMessageId(resolveActivePromptUserMessageIdForSend(userMessageId, sendAsTurnSteer));
    state.promptActivity = {
      clientRequestId,
      phase: "preparing",
    };
    promptSubmissionBootstrapInFlight = false;
    promptRequestConversationIds.set(clientRequestId, conversationIdAtStart);
    promptActivitiesByConversationId.set(conversationIdAtStart, state.promptActivity);
    state.messages.push({
      id: userMessageId,
      role: "user",
      text: displayMessage || message,
      ...(submittedMessageFileAttachments.length ? { attachments: createConversationMessageAttachments(submittedMessageFileAttachments) } : {}),
      ...(submittedMessageStructuredInputs.length ? { structuredInputs: submittedMessageStructuredInputs } : {}),
      ...(messageProfile ? { profile: messageProfile } : {}),
    });
    rememberCurrentConversationSnapshot();
    renderSync();
    scheduleConversationPersist();

    const generatedImageAttachments = sendAsTurnSteer
      ? []
      : await createGeneratedImageFileAttachmentsForPrompt(
          message,
          contextHint,
          activeProfileId,
          submittedRequestFileAttachments,
        );
    const nextFileAttachments = [...submittedRequestFileAttachments, ...generatedImageAttachments];

    const result = await sendRuntimeMessageWithConfirmation<{
      threadId: string;
      turnId: string;
      actionCards: ActionCard[];
      currentConversationId?: string;
      workflow?: "image-edit" | "browser-action" | "generated-image";
      assistantText?: string;
      previewRef?: string;
      previewRefs?: string[];
      cancelled?: boolean;
    }>({
      type: sendAsTurnSteer ? "turn.steer" : "prompt.send",
      payload: {
        message,
        conversationId: conversationIdAtStart,
        contextHint,
        clientRequestId,
        profileId: activeProfileId,
        model: state.selectedModel,
        reasoningEffort: state.selectedReasoningEffort || undefined,
        serviceTier: state.selectedServiceTier || undefined,
        readStrategyOverride: state.currentReadStrategy,
        attachments: nextAttachments,
        fileAttachments: nextFileAttachments,
        structuredInputs: submittedPromptStructuredInputs,
        selectedTabIds: state.selectedTabIds,
        historyQuery: state.historyQuery,
        resetThread: options.resetThread,
        suppressPageContext: isCurrentTabContextDismissed(),
        conversationMessageCount: state.messages.length,
      },
    });
    if (cancelledPromptRequestIds.delete(clientRequestId)) {
      removePendingImageWorkflowMessage(clientRequestId);
      scheduleConversationPersist();
      return;
    }
    if (isCancelledResult(result)) {
      if (state.pendingPermission) {
        state.pendingPermission = {
          ...state.pendingPermission,
          retryMessage: message,
        };
      }
      removePendingImageWorkflowMessage(clientRequestId);
      state.messages = state.messages.filter((entry) => entry.id !== userMessageId);
      state.promptActivity = null;
      clearActivePromptUserMessageId();
      state.streamingAssistantMessageIds.clear();
      Object.assign(state, createRestoredComposerDraftState(message));
      state.fileAttachments = submittedComposerFileAttachments;
      if (composer) {
        composer.value = message;
      }
      render();
      return;
    }
    const resultConversationId = result.currentConversationId ?? conversationIdAtStart;
    if (result.threadId) {
      rememberConversationThreadId(resultConversationId, result.threadId);
    }
    if (resultConversationId !== state.currentConversationId) {
      if (result.workflow === "generated-image") {
        const previewRefs = normalizeImagePreviewRefs(result.previewRefs, result.previewRef);
        const imageAlt = stringsForState().images.generated;
        const workflowMessageId =
          pendingImageWorkflowMessageIdsByRequest.get(clientRequestId) ??
          completedImageWorkflowMessageIdsByRequest.get(clientRequestId) ??
          `assistant-image-${Date.now()}`;
        await hydrateGeneratedImagesForDetachedConversation(resultConversationId, workflowMessageId, previewRefs, imageAlt);
        pendingImageWorkflowMessageIdsByRequest.delete(clientRequestId);
        streamedImagePreviewRefsByRequest.delete(clientRequestId);
        completedImageWorkflowMessageIdsByRequest.delete(clientRequestId);
      } else {
        clearConversationActivity(resultConversationId);
        await persistDetachedConversation(resultConversationId);
      }
      promptRequestConversationIds.delete(clientRequestId);
      return;
    }
    if (result.workflow === "image-edit") {
      state.currentConversationId = result.currentConversationId ?? state.currentConversationId;
      state.actionCards = result.actionCards;
      state.promptActivity = null;
      clearActivePromptUserMessageId();
      state.streamingAssistantMessageIds.clear();
      const imageAlt = stringsForState().images.edited;
      const messageId = replacePendingImageWorkflowMessage(
        clientRequestId,
        result.assistantText,
        result.previewRef ? createPendingConversationImage(result.previewRef, imageAlt) : undefined,
      );
      if (composer) {
        composer.value = "";
      }
      Object.assign(state, createPendingComposerDraftState());
      clearTransientComposerCommandPill();
      clearTransientComposerContext();
      state.activeTurn = null;
      scheduleConversationPersist();
      render();
      if (result.previewRef) {
        void hydrateConversationImage(messageId, result.previewRef, imageAlt);
      }
      return;
    }
    if (result.workflow === "generated-image") {
      state.currentConversationId = result.currentConversationId ?? state.currentConversationId;
      state.actionCards = result.actionCards;
      state.promptActivity = null;
      clearActivePromptUserMessageId();
      state.streamingAssistantMessageIds.clear();
      const previewRefs = normalizeImagePreviewRefs(result.previewRefs, result.previewRef);
      const imageAlt = stringsForState().images.generated;
      const streamedPreviewRefs = consumeStreamedImagePreviewRefs(clientRequestId);
      if (streamedPreviewRefs.length) {
        const missingPreviewRefs = previewRefs.filter((previewRef) => !streamedPreviewRefs.includes(previewRef));
        const messageId = ensurePendingImageWorkflowMessage(clientRequestId, "generated-image") ?? pushImageWorkflowAssistantMessage("", []);
        for (const [index, previewRef] of missingPreviewRefs.entries()) {
          appendStreamedImageToWorkflowMessage(
            clientRequestId,
            createPendingConversationImage(previewRef, createGeneratedImageAlt(imageAlt, streamedPreviewRefs.length + index, previewRefs.length)),
            previewRef,
          );
        }
        pendingImageWorkflowMessageIdsByRequest.delete(clientRequestId);
        rememberCompletedImageWorkflowMessage(clientRequestId, messageId);
        if (missingPreviewRefs.length) {
          void hydrateConversationImages(messageId, missingPreviewRefs, imageAlt);
        }
      } else {
        const messageId = replacePendingImageWorkflowMessage(
          clientRequestId,
          result.assistantText ?? null,
          previewRefs.map((previewRef, index) =>
            createPendingConversationImage(previewRef, createGeneratedImageAlt(imageAlt, index, previewRefs.length)),
          ),
        );
        rememberCompletedImageWorkflowMessage(clientRequestId, messageId);
        void hydrateConversationImages(messageId, previewRefs, imageAlt);
      }
      if (composer) {
        composer.value = "";
      }
      Object.assign(state, createPendingComposerDraftState());
      clearTransientComposerCommandPill();
      clearTransientComposerContext();
      state.activeTurn = null;
      scheduleConversationPersist();
      render();
      return;
    }
    removePendingImageWorkflowMessage(clientRequestId);
    if (result.workflow === "browser-action") {
      state.currentConversationId = result.currentConversationId ?? state.currentConversationId;
      state.actionCards = result.actionCards;
      state.promptActivity = null;
      clearActivePromptUserMessageId();
      state.streamingAssistantMessageIds.clear();
      state.messages.push({
        id: `assistant-browser-action-${Date.now()}`,
        role: "assistant",
        text: result.assistantText?.trim() || stringsForState().status.pageActionHandled,
      });
      if (composer) {
        composer.value = "";
      }
      Object.assign(state, createPendingComposerDraftState());
      clearTransientComposerCommandPill();
      clearTransientComposerContext();
      state.activeTurn = null;
      scheduleConversationPersist();
      render();
      return;
    }
    state.threadId = result.threadId;
    const acceptedActiveTurn = resolveAcceptedPromptActiveTurn({
      threadId: result.threadId,
      turnId: result.turnId,
      completedTurnIds,
    });
    completedTurnIds.delete(result.turnId);
    rememberAssistantResponseTurnGroup({ threadId: result.threadId, turnId: result.turnId }, `prompt:${clientRequestId}`);
    state.promptActivity = null;
    state.activeTurn = acceptedActiveTurn;
    state.currentConversationId = result.currentConversationId ?? state.currentConversationId;
    state.actionCards = result.actionCards;
    if (composer) {
      composer.value = "";
    }
    Object.assign(state, createPendingComposerDraftState());
    clearTransientComposerCommandPill();
    clearTransientComposerContext();
    scheduleConversationPersist();
    render();
  } catch (error) {
    promptSubmissionBootstrapInFlight = false;
    if (cancelledPromptRequestIds.delete(clientRequestId)) {
      removePendingImageWorkflowMessage(clientRequestId);
      scheduleConversationPersist();
      return;
    }
    removePendingImageWorkflowMessage(clientRequestId);
    if (conversationIdAtStart !== state.currentConversationId) {
      clearConversationActivity(conversationIdAtStart);
      promptRequestConversationIds.delete(clientRequestId);
      const errorMessage = toUserFacingRuntimeError(error);
      getDetachedConversationMessages(conversationIdAtStart).push(createAssistantFailureMessage(errorMessage, state.uiLocale));
      await persistDetachedConversation(conversationIdAtStart);
      return;
    }
    const oauthFallbackResult = await handleOAuthUsageFallbackRequest(
      error,
      createPromptRetryAfterOAuthFallback(message, displayMessage, options),
    );
    if (oauthFallbackResult === "switched" || oauthFallbackResult === "awaiting-api-key") {
      state.messages = state.messages.filter((entry) => entry.id !== userMessageId);
      state.promptActivity = null;
      clearActivePromptUserMessageId();
      state.streamingAssistantMessageIds.clear();
      state.activeTurn = null;
      Object.assign(state, createRestoredComposerDraftState(message));
      state.fileAttachments = submittedComposerFileAttachments;
      if (composer) {
        composer.value = message;
      }
      scheduleConversationPersist();
      render();
      if (oauthFallbackResult === "switched") {
        await sendPrompt(message, createRetrySendPromptOptions(displayMessage, options));
      }
      return;
    }
    state.promptActivity = null;
    clearActivePromptUserMessageId();
    state.streamingAssistantMessageIds.clear();
    const errorMessage = toUserFacingRuntimeError(error);
    state.messages.push(createAssistantFailureMessage(errorMessage, state.uiLocale));
    Object.assign(state, createPendingComposerDraftState());
    if (composer) {
      composer.value = "";
    }
    state.initError = errorMessage;
    state.activeTurn = null;
    scheduleConversationPersist();
    render();
  }
}

function createPromptRetryAfterOAuthFallback(
  message: string,
  displayMessage: string,
  options: { resetThread?: boolean },
): NonNullable<NativeTextDialogState["afterSubmit"]> {
  return {
    kind: "retry-prompt",
    message,
    displayMessage,
    ...(options.resetThread ? { resetThread: true } : {}),
  };
}

function createRetrySendPromptOptions(
  displayMessage: string,
  options: { resetThread?: boolean },
): { resetThread?: boolean; displayMessage?: string } {
  return {
    ...(displayMessage ? { displayMessage } : {}),
    ...(options.resetThread ? { resetThread: true } : {}),
  };
}

async function handleActionCard(actionId: string): Promise<void> {
  const selectedCard = getPinnedSuggestionCards().find((card) => card.id === actionId);
  const displayMessage = selectedCard ? renderActionCardTitle(stringsForState(), selectedCard) : undefined;
  if (isYouTubeCurrentMomentAction(actionId)) {
    try {
      const result = await sendRuntimeMessageWithConfirmation<YouTubeCurrentMomentPromptResult>({
        type: "youtube.current-moment.prompt",
      });
      if (isCancelledResult(result)) {
        return;
      }
      clearVisualPromptAttachments();
      state.activeView = "chat";
      await sendPrompt(result.prompt, createSendPromptDisplayOptions(displayMessage));
    } catch (error) {
      state.initError = toUserFacingRuntimeError(error);
      render();
    }
    return;
  }

  if (actionId === "news-infographic") {
    await createInfographicFromCurrentPage();
    return;
  }

  if (selectedCard && isSlideImageGenerationActionCard(selectedCard)) {
    await createSlideImagesFromCurrentPage(selectedCard.prompt ?? "");
    return;
  }

  if (selectedCard?.prompt) {
    if (isTextFirstActionCard(selectedCard)) {
      clearVisualPromptAttachments();
    }
    state.activeView = "chat";
    await sendPrompt(selectedCard.prompt, createSendPromptDisplayOptions(displayMessage));
    return;
  }

  if (actionId === "edit-image") {
    const clientRequestId = `action-image-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.activeView = "chat";
    state.promptActivity = {
      clientRequestId,
      phase: "preparing-image",
    };
    pushPendingImageWorkflowMessage(clientRequestId, "image-edit");
    render();
    try {
      const result = await sendRuntimeMessageWithConfirmation<{ previewRef?: string; cancelled?: boolean }>({
        type: "image.edit.start",
        prompt: stringsForState().prompts.improveCurrentImage,
      });
      if (isCancelledResult(result) || !result.previewRef) {
        removePendingImageWorkflowMessage(clientRequestId);
        state.promptActivity = null;
        render();
        return;
      }
      const imageAlt = stringsForState().images.edited;
      const messageId = replacePendingImageWorkflowMessage(
        clientRequestId,
        null,
        createPendingConversationImage(result.previewRef, imageAlt),
      );
      state.promptActivity = null;
      scheduleConversationPersist();
      render();
      void hydrateConversationImage(messageId, result.previewRef, imageAlt);
    } catch (error) {
      removePendingImageWorkflowMessage(clientRequestId);
      state.promptActivity = null;
      state.initError = toUserFacingRuntimeError(error);
      state.messages.push(createAssistantFailureMessage(state.initError, state.uiLocale));
      scheduleConversationPersist();
      render();
    }
    return;
  }

  if (actionId.startsWith("seek-")) {
    await seekYouTubeTimestamp(Number(actionId.replace("seek-", "")));
    return;
  }

  const prompts: Record<string, string> = {
    "summarize-page": stringsForState().prompts.summarizePage,
    "summarize-video": stringsForState().prompts.summarizeVideo,
    "summarize-current-timestamp": stringsForState().prompts.summarizeTimestamp,
    "draft-blog-post": stringsForState().prompts.draftBlogPost,
  };
  const prompt = prompts[actionId];
  if (prompt) {
    state.activeView = "chat";
    await sendPrompt(prompt);
  }
}

async function seekYouTubeTimestamp(seconds: number): Promise<void> {
  if (!Number.isFinite(seconds)) {
    return;
  }
  if (smokeTestMode) {
    window.__CODEX_SIDEPANEL_SMOKE_SEEK_MESSAGES__ = [
      ...(window.__CODEX_SIDEPANEL_SMOKE_SEEK_MESSAGES__ ?? []),
      { type: "youtube.seek", seconds },
    ];
    return;
  }
  try {
    await sendRuntimeMessageWithConfirmation({
      type: "youtube.seek",
      seconds,
    });
  } catch (error) {
    state.initError = toUserFacingRuntimeError(error);
    render();
  }
}

function createSendPromptDisplayOptions(displayMessage: string | undefined): { displayMessage?: string } {
  return displayMessage ? { displayMessage } : {};
}

async function createInfographicFromCurrentPage(): Promise<void> {
  if (!canStartCurrentComposerWorkflow()) {
    return;
  }

  const activeProfileId = ensureComposerProfileSelection();
  if (!state.currentConversationId) {
    const created = await sendRuntimeMessage<{ conversation: SavedConversation }>({
      type: "conversation.new",
      profileId: activeProfileId,
      model: state.selectedModel,
    });
    hydrateConversation(created.conversation);
  }

  const conversationIdAtStart = state.currentConversationId;
  const userMessageText = stringsForState().prompts.createInfographicFromPage;
  const userMessageId = `user-infographic-${Date.now()}`;
  const clientRequestId = `infographic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const messageProfile = createMessageProfileSnapshot();
  state.activeView = "chat";
  state.promptActivity = {
    clientRequestId,
    phase: "preparing-image",
  };
  state.messages.push({
    id: userMessageId,
    role: "user",
    text: userMessageText,
    ...(messageProfile ? { profile: messageProfile } : {}),
  });
  const workflowMessageId = pushPendingImageWorkflowMessage(clientRequestId, "infographic");
  promptRequestConversationIds.set(clientRequestId, conversationIdAtStart);
  promptActivitiesByConversationId.set(conversationIdAtStart, state.promptActivity);
  rememberCurrentConversationSnapshot();
  scheduleConversationPersist();
  render();

  try {
    const result = await sendRuntimeMessageWithConfirmation<{
      workflow?: "infographic";
      previewRef?: string;
      previewRefs?: string[];
      actionCards?: ActionCard[];
      currentConversationId?: string;
      cancelled?: boolean;
    }>({
      type: "image.infographic.start",
      clientRequestId,
      conversationId: conversationIdAtStart,
      conversationContext: buildInfographicConversationContext(state.messages),
    });
    if (isCancelledResult(result)) {
      removePendingImageWorkflowMessage(clientRequestId);
      state.messages = state.messages.filter((entry) => entry.id !== userMessageId);
      state.promptActivity = null;
      render();
      return;
    }
    const previewRefs = normalizeImagePreviewRefs(result.previewRefs, result.previewRef);
    const resultConversationId = result.currentConversationId ?? conversationIdAtStart;
    if (!previewRefs.length) {
      if (resultConversationId !== state.currentConversationId) {
        clearConversationActivity(resultConversationId);
        promptRequestConversationIds.delete(clientRequestId);
        await persistDetachedConversation(resultConversationId);
        return;
      }
      removePendingImageWorkflowMessage(clientRequestId);
      state.messages = state.messages.filter((entry) => entry.id !== userMessageId);
      state.promptActivity = null;
      render();
      return;
    }

    const imageAlt = stringsForState().images.infographic;
    if (resultConversationId !== state.currentConversationId) {
      await hydrateGeneratedImagesForDetachedConversation(resultConversationId, workflowMessageId, previewRefs, imageAlt);
      promptRequestConversationIds.delete(clientRequestId);
      return;
    }

    state.actionCards = result.actionCards ?? state.actionCards;
    state.promptActivity = null;
    state.streamingAssistantMessageIds.clear();
    const streamedPreviewRefs = consumeStreamedImagePreviewRefs(clientRequestId);
    if (streamedPreviewRefs.length) {
      const missingPreviewRefs = previewRefs.filter((previewRef) => !streamedPreviewRefs.includes(previewRef));
      const messageId = ensurePendingImageWorkflowMessage(clientRequestId, "infographic") ?? pushImageWorkflowAssistantMessage("", []);
      for (const [index, previewRef] of missingPreviewRefs.entries()) {
        appendStreamedImageToWorkflowMessage(
          clientRequestId,
          createPendingConversationImage(previewRef, createGeneratedImageAlt(imageAlt, streamedPreviewRefs.length + index, previewRefs.length)),
          previewRef,
        );
      }
      pendingImageWorkflowMessageIdsByRequest.delete(clientRequestId);
      rememberCompletedImageWorkflowMessage(clientRequestId, messageId);
      scheduleConversationPersist();
      render();
      if (missingPreviewRefs.length) {
        void hydrateConversationImages(messageId, missingPreviewRefs, imageAlt);
      }
      return;
    }
    const messageId = replacePendingImageWorkflowMessage(
      clientRequestId,
      null,
      previewRefs.map((previewRef, index) =>
        createPendingConversationImage(previewRef, createGeneratedImageAlt(imageAlt, index, previewRefs.length)),
      ),
    );
    rememberCompletedImageWorkflowMessage(clientRequestId, messageId);
    scheduleConversationPersist();
    render();
    void hydrateConversationImages(messageId, previewRefs, imageAlt);
  } catch (error) {
    const errorMessage = toUserFacingRuntimeError(error);
    if (conversationIdAtStart !== state.currentConversationId) {
      clearConversationActivity(conversationIdAtStart);
      promptRequestConversationIds.delete(clientRequestId);
      getDetachedConversationMessages(conversationIdAtStart).push(createAssistantFailureMessage(errorMessage, state.uiLocale));
      await persistDetachedConversation(conversationIdAtStart);
      return;
    }
    removePendingImageWorkflowMessage(clientRequestId);
    state.promptActivity = null;
    state.streamingAssistantMessageIds.clear();
    state.messages.push(createAssistantFailureMessage(errorMessage, state.uiLocale));
    state.initError = errorMessage;
    scheduleConversationPersist();
    render();
  }
}

async function createSlideImagesFromCurrentPage(prompt: string): Promise<void> {
  if (!canStartCurrentComposerWorkflow()) {
    return;
  }

  const activeProfileId = ensureComposerProfileSelection();
  if (!state.currentConversationId) {
    const created = await sendRuntimeMessage<{ conversation: SavedConversation }>({
      type: "conversation.new",
      profileId: activeProfileId,
      model: state.selectedModel,
    });
    hydrateConversation(created.conversation);
  }

  const conversationIdAtStart = state.currentConversationId;
  const userMessageText =
    prompt.trim() || stringsForState().prompts.createSlideImagesFromPage;
  const userMessageId = `user-slide-images-${Date.now()}`;
  const clientRequestId = `slide-images-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const messageProfile = createMessageProfileSnapshot();
  state.activeView = "chat";
  state.promptActivity = {
    clientRequestId,
    phase: "preparing-image",
  };
  state.messages.push({
    id: userMessageId,
    role: "user",
    text: userMessageText,
    ...(messageProfile ? { profile: messageProfile } : {}),
  });
  const workflowMessageId = pushPendingImageWorkflowMessage(clientRequestId, "slide-images");
  promptRequestConversationIds.set(clientRequestId, conversationIdAtStart);
  promptActivitiesByConversationId.set(conversationIdAtStart, state.promptActivity);
  rememberCurrentConversationSnapshot();
  scheduleConversationPersist();
  render();

  try {
    const result = await sendRuntimeMessageWithConfirmation<{
      workflow?: "slide-images";
      previewRef?: string;
      previewRefs?: string[];
      actionCards?: ActionCard[];
      currentConversationId?: string;
      cancelled?: boolean;
    }>({
      type: "image.slides.start",
      clientRequestId,
      conversationId: conversationIdAtStart,
      prompt: userMessageText,
      conversationContext: buildInfographicConversationContext(state.messages),
    });
    if (isCancelledResult(result)) {
      removePendingImageWorkflowMessage(clientRequestId);
      state.messages = state.messages.filter((entry) => entry.id !== userMessageId);
      state.promptActivity = null;
      render();
      return;
    }
    const previewRefs = normalizeImagePreviewRefs(result.previewRefs, result.previewRef);
    const resultConversationId = result.currentConversationId ?? conversationIdAtStart;
    if (!previewRefs.length) {
      if (resultConversationId !== state.currentConversationId) {
        clearConversationActivity(resultConversationId);
        promptRequestConversationIds.delete(clientRequestId);
        await persistDetachedConversation(resultConversationId);
        return;
      }
      removePendingImageWorkflowMessage(clientRequestId);
      state.messages = state.messages.filter((entry) => entry.id !== userMessageId);
      state.promptActivity = null;
      render();
      return;
    }

    const imageAlt = stringsForState().images.slide;
    if (resultConversationId !== state.currentConversationId) {
      await hydrateGeneratedImagesForDetachedConversation(resultConversationId, workflowMessageId, previewRefs, imageAlt);
      promptRequestConversationIds.delete(clientRequestId);
      return;
    }

    state.actionCards = result.actionCards ?? state.actionCards;
    state.promptActivity = null;
    state.streamingAssistantMessageIds.clear();
    const streamedPreviewRefs = consumeStreamedImagePreviewRefs(clientRequestId);
    if (streamedPreviewRefs.length) {
      const missingPreviewRefs = previewRefs.filter((previewRef) => !streamedPreviewRefs.includes(previewRef));
      const messageId = ensurePendingImageWorkflowMessage(clientRequestId, "slide-images") ?? pushImageWorkflowAssistantMessage("", []);
      for (const [index, previewRef] of missingPreviewRefs.entries()) {
        appendStreamedImageToWorkflowMessage(
          clientRequestId,
          createPendingConversationImage(previewRef, createGeneratedImageAlt(imageAlt, streamedPreviewRefs.length + index, previewRefs.length)),
          previewRef,
        );
      }
      pendingImageWorkflowMessageIdsByRequest.delete(clientRequestId);
      rememberCompletedImageWorkflowMessage(clientRequestId, messageId);
      scheduleConversationPersist();
      render();
      if (missingPreviewRefs.length) {
        void hydrateConversationImages(messageId, missingPreviewRefs, imageAlt);
      }
      return;
    }
    const messageId = replacePendingImageWorkflowMessage(
      clientRequestId,
      null,
      previewRefs.map((previewRef, index) =>
        createPendingConversationImage(previewRef, createGeneratedImageAlt(imageAlt, index, previewRefs.length)),
      ),
    );
    rememberCompletedImageWorkflowMessage(clientRequestId, messageId);
    scheduleConversationPersist();
    render();
    void hydrateConversationImages(messageId, previewRefs, imageAlt);
  } catch (error) {
    const errorMessage = toUserFacingRuntimeError(error);
    if (conversationIdAtStart !== state.currentConversationId) {
      clearConversationActivity(conversationIdAtStart);
      promptRequestConversationIds.delete(clientRequestId);
      getDetachedConversationMessages(conversationIdAtStart).push(createAssistantFailureMessage(errorMessage, state.uiLocale));
      await persistDetachedConversation(conversationIdAtStart);
      return;
    }
    removePendingImageWorkflowMessage(clientRequestId);
    state.promptActivity = null;
    state.streamingAssistantMessageIds.clear();
    state.messages.push(createAssistantFailureMessage(errorMessage, state.uiLocale));
    state.initError = errorMessage;
    scheduleConversationPersist();
    render();
  }
}

function buildInfographicConversationContext(messages: ConversationMessage[]): string {
  return messages
    .filter((message) => message.text.trim().length > 0)
    .slice(-8)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text.trim()}`)
    .join("\n\n")
    .slice(0, 8_000);
}

async function copyConversationMessage(messageId: string | undefined): Promise<void> {
  const message = state.messages.find((entry) => entry.id === messageId);
  if (!message?.text.trim()) {
    return;
  }

  await navigator.clipboard.writeText(message.text);
  state.actionStatus = "";
  markMessageCopied(message.id);
  render();
}

async function deleteConversationFromUi(conversationId: string): Promise<void> {
  const strings = stringsForState();
  const message = strings.prompts.deleteChatConfirm;
  const approved = await requestNativeConfirmation(message, {
    title: strings.actions.deleteChat,
    confirmLabel: strings.actions.deleteChat,
    tone: "danger",
  });
  if (!approved) {
    return;
  }

  const deletingCurrentConversation = state.currentConversationId === conversationId;
  const result = await sendRuntimeMessage<{
    recentChats: ConversationSummary[];
    currentConversation: SavedConversation | null;
  }>({
    type: "conversation.delete",
    conversationId,
  });
  state.recentChats = result.recentChats;
  if (deletingCurrentConversation) {
    hydrateConversation(result.currentConversation);
    state.activeView = "chat";
  }
  state.appMenuOpen = false;
  state.actionStatus = strings.status.chatDeleted;
  render();
}

async function clearConversationHistoryFromUi(options: { returnToSettings?: boolean } = {}): Promise<void> {
  if (!state.recentChats.length) {
    return;
  }

  const strings = stringsForState();
  const message = strings.prompts.clearChatHistoryConfirm;
  const approved = await requestNativeConfirmation(message, {
    title: strings.actions.clearRecentChats,
    confirmLabel: strings.actions.clearRecentChats,
    tone: "danger",
  });
  if (!approved) {
    return;
  }

  const result = await sendRuntimeMessage<{
    recentChats: ConversationSummary[];
    currentConversation: SavedConversation | null;
  }>({
    type: "conversation.clear",
  });
  state.recentChats = result.recentChats;
  hydrateConversation(result.currentConversation);
  state.activeView = options.returnToSettings ? "workspace" : "chat";
  state.appMenuOpen = false;
  state.actionStatus = strings.status.chatHistoryCleared;
  render();
}

async function saveCustomSiteSuggestionFromSettings(): Promise<void> {
  const input = root.querySelector<HTMLInputElement>("#custom-site-suggestion-input");
  const prompt = input?.value.trim() ?? "";
  if (!prompt || !state.currentTabReference) {
    return;
  }

  const nextSuggestions = upsertCustomSiteSuggestion(
    state.settings.customSiteSuggestions,
    state.currentTabReference,
    prompt,
  );
  state.settings = await sendRuntimeMessage<ExtensionSettings>({
    type: "settings.update",
    settings: { customSiteSuggestions: nextSuggestions },
  });
  state.actionStatus = stringsForState().status.siteSuggestionSaved;
  render();
}

async function deleteCustomSiteSuggestionFromSettings(suggestionId: string | undefined): Promise<void> {
  if (!suggestionId) {
    return;
  }
  const nextSuggestions = deleteCustomSiteSuggestion(state.settings.customSiteSuggestions, suggestionId);
  state.settings = await sendRuntimeMessage<ExtensionSettings>({
    type: "settings.update",
    settings: { customSiteSuggestions: nextSuggestions },
  });
  state.actionStatus = stringsForState().status.siteSuggestionDeleted;
  render();
}

function markMessageCopied(messageId: string): void {
  state.copiedMessageId = messageId;
  if (copiedMessageResetTimer !== null) {
    window.clearTimeout(copiedMessageResetTimer);
  }

  copiedMessageResetTimer = window.setTimeout(() => {
    copiedMessageResetTimer = null;
    if (state.copiedMessageId !== messageId) {
      return;
    }
    state.copiedMessageId = "";
    render();
  }, 1400);
}

async function copyMessageCodeBlock(button: HTMLButtonElement): Promise<void> {
  const code = button.closest(".message-code-block")?.querySelector("code")?.textContent ?? "";
  if (!code.trim()) {
    return;
  }

  await navigator.clipboard.writeText(code);
  const strings = stringsForState();
  state.actionStatus = strings.status.messageCopied;
  render();
}

async function replayConversationFromMessage(
  messageId: string | undefined,
  editedPrompt?: string,
): Promise<void> {
  if (!messageId || !canStartMessageReplayInteraction()) {
    return;
  }

  const replay = prepareMessageReplay(state.messages, messageId, editedPrompt);
  if (!replay) {
    return;
  }

  state.messages = replay.messagesBeforePrompt;
  state.editingMessageId = null;
  state.threadId = "";
  state.activeTurn = null;
  scheduleConversationPersist();
  await sendPrompt(replay.prompt, { resetThread: true });
}

function isSlideImageGenerationActionCard(card: ActionCard): boolean {
  return card.id === "profile-slide-maker-1";
}

type TurnTraceActivityInput = {
  threadId: string;
  turnId: string;
  itemId: string;
  kind: NonNullable<ConversationMessage["trace"]>[number]["kind"];
  title: string;
  detail: string;
  status: "running" | "completed";
  timestampMs: number;
};

function upsertTurnActivityTrace(activity: TurnTraceActivityInput): void {
  if (upsertTurnActivityTraceInMessages(state.messages, activity)) {
    scheduleConversationPersist();
  }
}

function upsertTurnActivityTraceForConversation(
  conversationId: string,
  activity: TurnTraceActivityInput,
): void {
  if (upsertTurnActivityTraceInMessages(getDetachedConversationMessages(conversationId), activity)) {
    void persistDetachedConversation(conversationId);
  }
}

function upsertTurnActivityTraceInMessages(
  messages: ConversationMessage[],
  activity: TurnTraceActivityInput,
): boolean {
  if (isNoisyTraceText(activity.title) || isNoisyTraceText(activity.detail)) {
    return false;
  }
  const messageId = createTurnTraceMessageId(activity.threadId, activity.turnId);
  let message = messages.find((entry) => entry.id === messageId);
  if (!message) {
    message = {
      id: messageId,
      role: "assistant",
      text: "",
      trace: [],
    };
    messages.push(message);
  }
  const trace = [...(message.trace ?? [])];
  const existingIndex = trace.findIndex((item) => item.id === activity.itemId);
  const nextItem = {
    id: activity.itemId,
    kind: activity.kind,
    title: activity.title.trim(),
    detail: activity.detail.trim(),
    status: activity.status,
    timestampMs: activity.timestampMs,
  };
  if (existingIndex >= 0) {
    trace[existingIndex] = {
      ...trace[existingIndex],
      ...nextItem,
      timestampMs: trace[existingIndex]?.timestampMs || nextItem.timestampMs,
    };
  } else {
    trace.push(nextItem);
  }
  message.trace = trace.slice(-MAX_TRACE_ITEMS);
  return true;
}

function upsertTurnPlanTrace(plan: CodexTurnPlan): void {
  if (upsertTurnPlanTraceInMessages(state.messages, plan)) {
    scheduleConversationPersist();
  }
}

function upsertTurnPlanTraceForConversation(conversationId: string, plan: CodexTurnPlan): void {
  if (upsertTurnPlanTraceInMessages(getDetachedConversationMessages(conversationId), plan)) {
    void persistDetachedConversation(conversationId);
  }
}

function upsertTurnPlanTraceInMessages(messages: ConversationMessage[], plan: CodexTurnPlan): boolean {
  const steps = plan.steps
    .map((step) => ({
      step: step.step.trim(),
      status: step.status,
    }))
    .filter((step) => step.step && !isNoisyTraceText(step.step));
  let changed = removeTurnTraceItemsInMessages(messages, plan.threadId, plan.turnId, (item) => item.id.startsWith("plan-"));

  for (const [index, step] of steps.entries()) {
    if (!step.step) {
      continue;
    }
    changed =
      upsertTurnActivityTraceInMessages(messages, {
      threadId: plan.threadId,
      turnId: plan.turnId,
      itemId: `plan-${index}`,
      kind: "reasoning",
      title: stringsForState().trace.plan,
      detail: step.step,
      status: step.status === "completed" || step.status === "done" ? "completed" : "running",
      timestampMs: Date.now() + index,
      }) || changed;
  }
  return changed;
}

function removeTurnTraceItems(
  threadId: string,
  turnId: string,
  predicate: (item: NonNullable<ConversationMessage["trace"]>[number]) => boolean,
): void {
  if (removeTurnTraceItemsInMessages(state.messages, threadId, turnId, predicate)) {
    scheduleConversationPersist();
  }
}

function removeTurnTraceItemsInMessages(
  messages: ConversationMessage[],
  threadId: string,
  turnId: string,
  predicate: (item: NonNullable<ConversationMessage["trace"]>[number]) => boolean,
): boolean {
  const messageIndex = messages.findIndex((entry) => entry.id === createTurnTraceMessageId(threadId, turnId));
  const message = messageIndex >= 0 ? messages[messageIndex] : undefined;
  if (!message?.trace?.length) {
    return false;
  }
  const nextTrace = message.trace.filter((item) => !predicate(item));
  if (nextTrace.length === message.trace.length) {
    return false;
  }
  message.trace = nextTrace;
  if (!nextTrace.length && message.role === "assistant" && !message.text.trim() && !(message.images ?? []).length) {
    messages.splice(messageIndex, 1);
  }
  return true;
}

function upsertTurnDiffTrace(diff: CodexTurnDiff): void {
  if (upsertTurnDiffTraceInMessages(state.messages, diff)) {
    scheduleConversationPersist();
  }
}

function upsertTurnDiffTraceForConversation(conversationId: string, diff: CodexTurnDiff): void {
  if (upsertTurnDiffTraceInMessages(getDetachedConversationMessages(conversationId), diff)) {
    void persistDetachedConversation(conversationId);
  }
}

function upsertTurnDiffTraceInMessages(messages: ConversationMessage[], diff: CodexTurnDiff): boolean {
  if (!diff.diff.trim()) {
    return false;
  }
  return upsertTurnActivityTraceInMessages(messages, {
    threadId: diff.threadId,
    turnId: diff.turnId,
    itemId: "turn-diff",
    kind: "file",
    title: stringsForState().trace.fileChanges,
    detail: diff.diff.split("\n").find((line) => line.trim())?.trim().slice(0, 180) ?? "",
    status: "completed",
    timestampMs: Date.now(),
  });
}

function markActiveTurnTraceItemsCompleted(): void {
  if (!state.activeTurn?.threadId || !state.activeTurn.turnId) {
    return;
  }
  completeTurnTrace(state.activeTurn.threadId, state.activeTurn.turnId);
}

function completeTurnTrace(threadId: string, turnId: string): void {
  if (!threadId || !turnId) {
    return;
  }
  if (completeTurnTraceInMessages(state.messages, threadId, turnId)) {
    scheduleConversationPersist();
  }
}

function completeTurnTraceForConversation(conversationId: string, threadId: string, turnId: string): void {
  if (completeTurnTraceInMessages(getDetachedConversationMessages(conversationId), threadId, turnId)) {
    void persistDetachedConversation(conversationId);
  }
}

function scheduleEmptyAssistantResponseNotice(input: {
  conversationId: string | null;
  threadId: string;
  turnId: string;
  activeUserMessageId?: string | null;
}): void {
  if (!input.threadId || !input.turnId) {
    return;
  }

  const key = createEmptyAssistantResponseNoticeTimerKey(input.conversationId, input.threadId, input.turnId);
  cancelEmptyAssistantResponseNotice(input.threadId, input.turnId, input.conversationId);
  const timer = setTimeout(() => {
    pendingEmptyAssistantResponseNoticeTimers.delete(key);
    const messages = getMessagesForEmptyAssistantResponseNotice(input.conversationId, input.threadId);
    if (!messages) {
      return;
    }
    const changed = ensureEmptyAssistantResponseNoticeInMessages(
      messages,
      input.threadId,
      input.turnId,
      input.activeUserMessageId ?? null,
    );
    if (!changed) {
      return;
    }
    if (isCurrentEmptyAssistantResponseNoticeConversation(input.conversationId)) {
      scheduleConversationPersist();
      render();
      return;
    }
    if (input.conversationId) {
      void persistDetachedConversation(input.conversationId);
      renderConversationListIfVisible();
    }
  }, EMPTY_ASSISTANT_RESPONSE_NOTICE_DELAY_MS);
  pendingEmptyAssistantResponseNoticeTimers.set(key, timer);
}

function cancelEmptyAssistantResponseNotice(
  threadId: string,
  turnId: string,
  conversationId: string | null = state.currentConversationId || null,
): void {
  if (!threadId || !turnId) {
    return;
  }
  const keys = new Set([
    createEmptyAssistantResponseNoticeTimerKey(conversationId, threadId, turnId),
    createEmptyAssistantResponseNoticeTimerKey(state.currentConversationId || null, threadId, turnId),
  ]);
  for (const key of keys) {
    const timer = pendingEmptyAssistantResponseNoticeTimers.get(key);
    if (!timer) {
      continue;
    }
    clearTimeout(timer);
    pendingEmptyAssistantResponseNoticeTimers.delete(key);
  }
}

function clearEmptyAssistantResponseNoticeForTurn(
  threadId: string,
  turnId: string,
  conversationId: string | null = state.currentConversationId || null,
): void {
  if (!threadId || !turnId) {
    return;
  }
  const messages = getMessagesForEmptyAssistantResponseNotice(conversationId, threadId);
  if (!messages || !clearEmptyAssistantResponseNotice({ messages, threadId, turnId })) {
    return;
  }
  if (isCurrentEmptyAssistantResponseNoticeConversation(conversationId)) {
    scheduleConversationPersist();
    return;
  }
  if (conversationId) {
    void persistDetachedConversation(conversationId);
  }
}

function getMessagesForEmptyAssistantResponseNotice(conversationId: string | null, threadId: string): ConversationMessage[] | null {
  if (isCurrentEmptyAssistantResponseNoticeConversation(conversationId)) {
    if (threadId && state.threadId && state.threadId !== threadId) {
      return null;
    }
    return state.messages;
  }
  return conversationId ? conversationMessagesById.get(conversationId) ?? null : state.messages;
}

function isCurrentEmptyAssistantResponseNoticeConversation(conversationId: string | null): boolean {
  return !conversationId || conversationId === state.currentConversationId;
}

function createEmptyAssistantResponseNoticeTimerKey(
  conversationId: string | null,
  threadId: string,
  turnId: string,
): string {
  return `${conversationId || "current"}:${threadId}:${turnId}`;
}

function ensureEmptyAssistantResponseNoticeInMessages(
  messages: ConversationMessage[],
  threadId: string,
  turnId: string,
  activeUserMessageId?: string | null,
): boolean {
  if (!threadId || !turnId) {
    return false;
  }

  const traceMessageId = createTurnTraceMessageId(threadId, turnId);
  if (!shouldShowEmptyAssistantResponseNotice({ messages, traceMessageId, activeUserMessageId: activeUserMessageId ?? null })) {
    return false;
  }

  const text = createEmptyAssistantResponseNotice({
    locale: state.uiLocale,
    structuredInputNames: getStructuredInputNamesForEmptyResponseNotice(messages, activeUserMessageId),
  });
  let message = messages.find((entry) => entry.id === traceMessageId && entry.role === "assistant");
  if (!message) {
    message = {
      id: `assistant-empty-response-${stableMessageIdPart(`${threadId}-${turnId}`)}`,
      role: "assistant",
      text,
    };
    messages.push(message);
    return true;
  }

  message.text = text;
  return true;
}

function completeTurnTraceInMessages(messages: ConversationMessage[], threadId: string, turnId: string): boolean {
  if (!threadId || !turnId) {
    return false;
  }
  const message = messages.find((entry) => entry.id === createTurnTraceMessageId(threadId, turnId));
  if (!message?.trace?.length) {
    return false;
  }
  message.trace = message.trace.map((item) => ({
    ...item,
    status: "completed",
  }));
  return true;
}

function createTurnTraceMessageId(threadId: string, turnId: string): string {
  return `turn-trace-${threadId}-${turnId}`;
}

function normalizeTraceEventKind(value: unknown): NonNullable<ConversationMessage["trace"]>[number]["kind"] {
  switch (value) {
    case "reasoning":
    case "web":
    case "file":
    case "command":
    case "tool":
    case "browser":
    case "image":
    case "response":
      return value;
    default:
      return "tool";
  }
}

function isTraceOnlyAssistantMessage(message: ConversationMessage): boolean {
  return message.role === "assistant" && !message.text.trim() && Boolean(message.trace?.length) && !(message.images ?? []).length;
}

function upsertAssistantMessage(
  itemId: string,
  fragment: string,
  append: boolean,
  context: { threadId?: string; turnId?: string } = {},
): string | null {
  const messageId = resolveAssistantResponseMessageId(itemId, context);
  const nextText = upsertAssistantResponseTextSegment(messageId, itemId, fragment, append);
  const existing = state.messages.find((message) => message.id === messageId);
  const currentText = existing?.text ?? "";
  const profileQuestionAwareText = consumeProfileQuestionFromAssistantText(messageId, currentText, nextText, false);
  if (!existing && !nextText.trim()) {
    return null;
  }
  if (!existing) {
    state.messages.push({
      id: messageId,
      role: "assistant",
      text: profileQuestionAwareText,
    });
  } else {
    existing.text = profileQuestionAwareText;
  }
  return messageId;
}

function resolveAssistantResponseMessageId(
  itemId: string,
  context: { threadId?: string; turnId?: string } = {},
): string {
  const groupKey = resolveAssistantResponseGroupKey(itemId, context);
  let messageId = assistantResponseMessageIdsByGroupKey.get(groupKey);
  if (!messageId) {
    messageId = `assistant-response-${stableMessageIdPart(groupKey)}`;
    assistantResponseMessageIdsByGroupKey.set(groupKey, messageId);
  }
  assistantResponseGroupKeysByItemId.set(itemId, groupKey);
  return messageId;
}

function resolveAssistantResponseGroupKey(itemId: string, context: { threadId?: string; turnId?: string } = {}): string {
  const existing = assistantResponseGroupKeysByItemId.get(itemId);
  if (existing) {
    return existing;
  }
  const turnKey = createAssistantResponseTurnKey(context.threadId, context.turnId);
  if (turnKey) {
    const turnGroupKey = assistantResponseGroupKeysByTurnKey.get(turnKey);
    if (turnGroupKey) {
      return turnGroupKey;
    }
  }
  if (state.promptActivity?.clientRequestId) {
    const promptGroupKey = `prompt:${state.promptActivity.clientRequestId}`;
    if (turnKey) {
      assistantResponseGroupKeysByTurnKey.set(turnKey, promptGroupKey);
    }
    return promptGroupKey;
  }
  if (turnKey) {
    assistantResponseGroupKeysByTurnKey.set(turnKey, turnKey);
    return turnKey;
  }
  const activeTurnKey = createAssistantResponseTurnKey(state.activeTurn?.threadId, state.activeTurn?.turnId);
  if (activeTurnKey) {
    const activeTurnGroupKey = assistantResponseGroupKeysByTurnKey.get(activeTurnKey) ?? activeTurnKey;
    assistantResponseGroupKeysByTurnKey.set(activeTurnKey, activeTurnGroupKey);
    return activeTurnGroupKey;
  }
  return `item:${itemId}`;
}

function rememberAssistantResponseTurnGroup(
  turn: { threadId?: string; turnId?: string } | null | undefined,
  groupKey = state.promptActivity?.clientRequestId ? `prompt:${state.promptActivity.clientRequestId}` : "",
): void {
  const turnKey = createAssistantResponseTurnKey(turn?.threadId, turn?.turnId);
  if (!turnKey || !groupKey) {
    return;
  }
  assistantResponseGroupKeysByTurnKey.set(turnKey, groupKey);
}

function createAssistantResponseTurnKey(threadId: string | undefined, turnId: string | undefined): string {
  return threadId && turnId ? `turn:${threadId}:${turnId}` : "";
}

function upsertAssistantResponseTextSegment(
  messageId: string,
  itemId: string,
  fragment: string,
  append: boolean,
): string {
  const order = assistantResponseItemOrderByMessageId.get(messageId) ?? [];
  if (!order.includes(itemId)) {
    order.push(itemId);
    assistantResponseItemOrderByMessageId.set(messageId, order);
  }

  const texts = assistantResponseItemTextsByMessageId.get(messageId) ?? new Map<string, string>();
  const previousText = texts.get(itemId) ?? "";
  const nextFragment = append ? `${previousText}${fragment}` : fragment;
  const normalizedNextFragment = normalizeAssistantResponseTextSegment(nextFragment);
  const duplicateItemId = Array.from(texts.entries()).find(
    ([existingItemId, text]) => existingItemId !== itemId && normalizeAssistantResponseTextSegment(text) === normalizedNextFragment,
  )?.[0];
  if (normalizedNextFragment && duplicateItemId) {
    order.splice(order.indexOf(itemId), 1);
    assistantResponseItemOrderByMessageId.set(messageId, order);
  } else {
    texts.set(itemId, nextFragment);
  }
  assistantResponseItemTextsByMessageId.set(messageId, texts);

  return order
    .map((id) => texts.get(id)?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function normalizeAssistantResponseTextSegment(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stableMessageIdPart(value: string): string {
  return value
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96) || "assistant";
}

function consumeProfileQuestionFromAssistantText(itemId: string, currentText: string, fragment: string, append: boolean): string {
  if (!append) {
    profileQuestionStreamBuffers.delete(itemId);
  }
  const rawText = append ? `${currentText}${fragment}` : fragment;
  if (!isProfileQuestionModeEnabledForCurrentTurn()) {
    profileQuestionStreamBuffers.delete(itemId);
    return rawText;
  }

  const buffered = append ? profileQuestionStreamBuffers.get(itemId) : undefined;
  if (buffered !== undefined) {
    const combined = `${buffered}${fragment}`;
    const parsed = parseProfileAskUserQuestion(combined);
    if (parsed) {
      profileQuestionStreamBuffers.delete(itemId);
      setPendingProfileQuestion(itemId, parsed);
      return joinAssistantTextParts(currentText, parsed.cleanedText);
    }
    profileQuestionStreamBuffers.set(itemId, combined);
    return currentText;
  }

  const parsed = parseProfileAskUserQuestion(rawText);
  if (parsed) {
    setPendingProfileQuestion(itemId, parsed);
    return parsed.cleanedText;
  }

  if (hasProfileAskUserQuestionStart(rawText)) {
    if (append) {
      const markerIndex = rawText.indexOf(`<${ASK_USER_QUESTION_TAG}>`);
      if (markerIndex >= 0) {
        profileQuestionStreamBuffers.set(itemId, rawText.slice(markerIndex));
      }
    }
    return stripIncompleteProfileAskUserQuestion(rawText);
  }

  return rawText;
}

function joinAssistantTextParts(left: string, right: string): string {
  const leftTrimmed = left.trimEnd();
  const rightTrimmed = right.trim();
  if (!leftTrimmed) {
    return rightTrimmed;
  }
  if (!rightTrimmed) {
    return leftTrimmed;
  }
  return `${leftTrimmed}\n\n${rightTrimmed}`;
}

function isProfileQuestionModeEnabledForCurrentTurn(): boolean {
  return resolveProfileQuestionProfile()?.id !== DEFAULT_PROFILE_ID;
}

function resolveProfileQuestionProfile(): ProfileTemplate | null {
  let lastUserProfileId: string | undefined;
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message?.role === "user" && message.profile?.id) {
      lastUserProfileId = message.profile.id;
      break;
    }
  }
  const profileId = lastUserProfileId || state.selectedProfileId;
  return state.profiles.find((profile) => profile.id === profileId) ?? null;
}

function setPendingProfileQuestion(itemId: string, question: ProfileAskUserQuestion): void {
  const profile = resolveProfileQuestionProfile();
  if (!profile || profile.id === DEFAULT_PROFILE_ID) {
    return;
  }

  state.pendingProfileQuestion = {
    id: `profile-question-${Date.now()}`,
    messageId: itemId,
    profileId: profile.id,
    profileName: profile.name,
    question: question.question,
    options: question.options,
    allowFreeform: question.allowFreeform,
    answer: "",
    createdAt: Date.now(),
  };
  profileQuestionCardRenderRequested = true;
}

function flushStreamingAssistantDeltas(): void {
  streamingDeltaBuffer.flush();
}

function patchStreamingAssistantMessageDoms(itemIds: string[]): boolean {
  const uniqueItemIds = Array.from(new Set(itemIds));
  if (!uniqueItemIds.length) {
    return true;
  }

  const scrollState = captureScrollPositions();
  for (const itemId of uniqueItemIds) {
    const message = state.messages.find((candidate) => candidate.id === itemId);
    const row = findConversationMessageRow(itemId);
    const content = row?.querySelector<HTMLElement>(".message-content") ?? null;
    if (!message || message.role !== "assistant" || !content) {
      return false;
    }
    content.innerHTML = renderMessageContentHtml(message.text, {
      enableYouTubeTimestampLinks: shouldRenderYouTubeTimestampLinks(),
    });
  }
  restoreScrollPositions(scrollState);
  updateScrollToBottomButtonVisibility();
  return true;
}

function findConversationMessageRow(messageId: string): HTMLElement | null {
  for (const row of Array.from(root.querySelectorAll<HTMLElement>("[data-message-id]"))) {
    if (row.dataset.messageId === messageId) {
      return row;
    }
  }
  return null;
}

type BridgeImageWorkflowEvent = {
  itemId: string;
  previewRef: string;
  alt: string;
  clientRequestId?: string;
  workflow?: Exclude<ImageWorkflowPlaceholderKind, "image-edit">;
  imageIndex?: number;
};

async function handleBridgeImageEvent(event: BridgeImageWorkflowEvent): Promise<void> {
  recordUiDiagnostic("sidepanel.image.event.received", {
    itemId: event.itemId,
    previewRef: event.previewRef,
    clientRequestId: event.clientRequestId ?? null,
    workflow: event.workflow ?? null,
    imageIndex: event.imageIndex ?? null,
  });
  const pendingImage = createPendingConversationImage(event.previewRef, event.alt);
  const workflowMessageId = appendStreamedImageToWorkflowMessage(event.clientRequestId, pendingImage, event.previewRef);
  if (!workflowMessageId) {
    upsertAssistantImageMessage(event.itemId, pendingImage);
    state.promptActivity = {
      clientRequestId: state.promptActivity?.clientRequestId ?? "generated-image",
      phase: "rendering-image-preview",
    };
  }
  scheduleConversationPersist();
  render();

  try {
    const image = await createConversationImageFromPreviewRef(event.previewRef, event.alt);
    recordUiDiagnostic("sidepanel.image.render.ready", {
      itemId: event.itemId,
      previewRef: event.previewRef,
      hasSrc: Boolean(image.src),
    });
    const hydratedWorkflowMessageId = appendStreamedImageToWorkflowMessage(event.clientRequestId, image, event.previewRef);
    if (!hydratedWorkflowMessageId) {
      state.promptActivity = null;
      upsertAssistantImageMessage(event.itemId, image);
    }
    await refreshImageAssetFolderQuietly();
    scheduleConversationPersist();
    render();
    void rememberAutoSavedConversationImage(hydratedWorkflowMessageId ?? event.itemId, event.previewRef);
  } catch (error) {
    recordUiDiagnostic("sidepanel.image.render.failed", {
      itemId: event.itemId,
      previewRef: event.previewRef,
      error: toUserFacingRuntimeError(error),
    });
    const failedWorkflowMessageId = appendStreamedImageToWorkflowMessage(
      event.clientRequestId,
      createFailedConversationImage(event.previewRef, event.alt),
      event.previewRef,
    );
    if (!failedWorkflowMessageId) {
      state.promptActivity = null;
      upsertAssistantImageMessage(event.itemId, createFailedConversationImage(event.previewRef, event.alt));
    }
    state.initError = toUserFacingRuntimeError(error);
    state.messages.push(createAssistantFailureMessage(state.initError, state.uiLocale));
    scheduleConversationPersist();
    render();
  }
}

function upsertAssistantImageMessage(itemId: string, image: ConversationMessageImage): void {
  const existing = state.messages.find((message) => message.id === itemId);
  if (!existing) {
    state.messages.push({
      id: itemId,
      role: "assistant",
      text: stringsForState().images.generatedResult,
      images: [image],
    });
    return;
  }

  const images = [...(existing.images ?? [])];
  const existingIndex = images.findIndex((candidate) => isSameConversationImage(candidate, image));
  if (existingIndex >= 0) {
    images[existingIndex] = image;
  } else {
    images.push(image);
  }
  existing.images = images;
}

function appendStreamedImageToWorkflowMessage(
  clientRequestId: string | undefined,
  image: ConversationMessageImage,
  previewRef: string,
): string | null {
  if (!clientRequestId) {
    return null;
  }
  const existing = getImageWorkflowMessageForStreaming(clientRequestId);
  if (!existing) {
    return null;
  }

  rememberStreamedImagePreviewRef(clientRequestId, previewRef);
  existing.text = "";
  const images = (existing.images ?? []).filter((candidate) => candidate.status !== "loading");
  const existingIndex = images.findIndex((candidate) => isSameConversationImage(candidate, image));
  if (existingIndex >= 0) {
    images[existingIndex] = image;
  } else {
    images.push(image);
  }
  existing.images = images;
  return existing.id;
}

function rememberStreamedImagePreviewRef(clientRequestId: string, previewRef: string): void {
  const normalized = previewRef.trim();
  if (!normalized) {
    return;
  }
  const current = streamedImagePreviewRefsByRequest.get(clientRequestId) ?? [];
  if (!current.includes(normalized)) {
    streamedImagePreviewRefsByRequest.set(clientRequestId, [...current, normalized]);
  }
}

function getImageWorkflowMessageForStreaming(clientRequestId: string): ConversationMessage | null {
  const messageId =
    pendingImageWorkflowMessageIdsByRequest.get(clientRequestId) ??
    completedImageWorkflowMessageIdsByRequest.get(clientRequestId);
  if (!messageId) {
    return null;
  }
  return state.messages.find((message) => message.id === messageId) ?? null;
}

function rememberCompletedImageWorkflowMessage(clientRequestId: string, messageId: string): void {
  completedImageWorkflowMessageIdsByRequest.set(clientRequestId, messageId);
  window.setTimeout(() => {
    if (completedImageWorkflowMessageIdsByRequest.get(clientRequestId) === messageId) {
      completedImageWorkflowMessageIdsByRequest.delete(clientRequestId);
    }
  }, 60_000);
}

async function resolvePreviewRefForUi(previewRef: string): Promise<string> {
  return resolveImagePreviewRefForUi(previewRef, (message) =>
    sendRuntimeMessage(message as unknown as Record<string, unknown>) as Promise<{
      dataBase64: string;
      mimeType: string;
      sizeBytes: number;
      offset: number;
      nextOffset: number;
      done: boolean;
    }>,
  );
}

async function downloadConversationImage(messageId: string | undefined, imageIndex: string | undefined): Promise<void> {
  const image = await getConversationImageForAction(messageId, imageIndex);
  if (!image?.src) {
    return;
  }

  downloadReadyConversationImage(image);
  scheduleConversationPersist();
  state.actionStatus = stringsForState().status.imageDownloadStarted;
  render();
}

function downloadReadyConversationImage(image: ConversationMessageImage): void {
  const anchor = document.createElement("a");
  anchor.href = image.src;
  anchor.download = buildImageDownloadName(image.alt);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function openConversationImagePreview(messageId: string | undefined, imageIndex: string | undefined): Promise<void> {
  const image = await getConversationImageForAction(messageId, imageIndex);
  if (!image?.src) {
    return;
  }
  const preview = createExternalImagePreviewUrl(image.src);
  window.open(preview.url, "_blank", "noopener,noreferrer");
  if (preview.usesObjectUrl) {
    window.setTimeout(preview.revoke, EXTERNAL_IMAGE_PREVIEW_OBJECT_URL_REVOKE_MS);
  }
}

async function rememberAutoSavedConversationImage(messageId: string, assetRef: string): Promise<void> {
  if (!isBridgeImageAssetRef(assetRef) || autoSavedImageAssetRefs.has(assetRef)) {
    return;
  }

  const image = state.messages.find((message) => message.id === messageId)?.images?.find((candidate) => candidate.assetRef === assetRef);
  if (!image?.assetRef) {
    return;
  }

  autoSavedImageAssetRefs.add(assetRef);
  try {
    await refreshImageAssetFolderQuietly();
    scheduleConversationPersist();
    recordUiDiagnostic("sidepanel.image.asset.auto_saved", {
      previewRef: assetRef,
    });
  } catch (error) {
    autoSavedImageAssetRefs.delete(assetRef);
    recordUiDiagnostic("sidepanel.image.asset.auto_save.failed", {
      previewRef: assetRef,
      error: toUserFacingRuntimeError(error),
    });
  }
}

async function releaseConversationImageAsset(image: ConversationMessageImage): Promise<boolean> {
  if (!image.assetRef) {
    return false;
  }
  const previewRef = image.assetRef;
  try {
    await sendRuntimeMessage({
      type: "image.asset.delete",
      previewRef,
    });
  } catch (error) {
    recordUiDiagnostic("sidepanel.image.asset_release.failed", {
      previewRef,
      error: toUserFacingRuntimeError(error),
    });
    return false;
  }
  delete image.assetRef;
  if (image.src) {
    image.status = "ready";
  } else {
    delete image.status;
  }
  await refreshImageAssetFolderQuietly();
  return true;
}

async function openConversationImageFollowupEditor(
  messageId: string | undefined,
  imageIndex: string | undefined,
): Promise<void> {
  const image = await getConversationImageForAction(messageId, imageIndex);
  const index = Number.parseInt(imageIndex ?? "", 10);
  if (!messageId || !Number.isFinite(index) || !image?.src || !isSafeMessageImageUrl(image.src)) {
    return;
  }
  state.imageAnnotationEditor = {
    source: "conversation",
    messageId,
    imageIndex: index,
    name: buildImageDownloadName(image.alt || stringsForState().images.downloadFallback),
    dataUrl: image.src,
  };
  state.imageAnnotationReferenceAttachments = [];
  render();
}

async function refreshImageAssetFolderQuietly(): Promise<void> {
  try {
    state.imageAssetFolder = await sendRuntimeMessage<UiInitPayload["imageAssetFolder"]>({
      type: "image.asset.folder",
    });
  } catch {
    // Folder metadata is informational; image rendering should not fail because this refresh did.
  }
}

async function getConversationImageForAction(
  messageId: string | undefined,
  imageIndex: string | undefined,
): Promise<ConversationMessageImage | null> {
  const index = Number.parseInt(imageIndex ?? "", 10);
  if (!messageId || !Number.isFinite(index) || index < 0) {
    return null;
  }
  const image = state.messages.find((message) => message.id === messageId)?.images?.[index];
  if (!image) {
    return null;
  }
  if (!image.src && image.assetRef) {
    try {
      image.src = await resolvePreviewRefForUi(image.assetRef);
      image.status = "ready";
      render();
    } catch {
      image.status = "deleted";
      render();
      return null;
    }
  }
  return image;
}

function isImageWorkflowPromptActivityPhase(phase: PromptActivityPhase): boolean {
  return phase === "preparing-image" || phase === "editing-image" || phase === "rendering-image-preview";
}

function createImageWorkflowPlaceholderText(kind: ImageWorkflowPlaceholderKind): string {
  const images = stringsForState().images;
  switch (kind) {
    case "infographic":
      return images.pendingInfographic;
    case "slide-images":
      return images.pendingSlideImages;
    case "generated-image":
      return images.pendingGeneratedImage;
    case "image-edit":
    default:
      return images.pendingImageEdit;
  }
}

function createImageWorkflowPlaceholderAlt(kind: ImageWorkflowPlaceholderKind): string {
  const images = stringsForState().images;
  switch (kind) {
    case "infographic":
      return images.pendingInfographicAlt;
    case "slide-images":
      return images.pendingSlideImagesAlt;
    case "generated-image":
      return images.pendingGeneratedImageAlt;
    case "image-edit":
    default:
      return images.pendingImageEditAlt;
  }
}

async function createConversationImageFromPreviewRef(previewRef: string, alt: string): Promise<ConversationMessageImage> {
  const image: ConversationMessageImage = {
    src: "",
    alt,
    status: "loading",
    ...(isBridgeImageAssetRef(previewRef) ? { assetRef: previewRef } : {}),
  };
  image.src = await resolvePreviewRefForUi(previewRef);
  image.status = "ready";
  return image;
}

async function createGeneratedImageFileAttachmentsForPrompt(
  message: string,
  contextHint: string,
  activeProfileId: string,
  submittedFileAttachments: UserFileAttachment[],
): Promise<UserFileAttachment[]> {
  const submittedRequestFileAttachments = [...submittedFileAttachments];
  const remainingSlots = Math.max(0, MAX_FILE_ATTACHMENTS - submittedRequestFileAttachments.length);
  const limit = Math.min(remainingSlots, getGeneratedImageAttachmentLimit());
  if (limit <= 0) {
    return [];
  }

  const candidates = state.messages
    .filter((entry) => entry.role === "assistant")
    .flatMap((entry) => entry.images ?? [])
    .filter((image) => image.status !== "deleted" && image.status !== "error" && (image.src || image.assetRef))
    .slice(-limit);
  const attachments: UserFileAttachment[] = [];

  for (const [index, image] of candidates.entries()) {
    let dataUrl = image.src;
    if (!/^data:image\/[a-z0-9.+-]+;base64,/iu.test(dataUrl) && image.assetRef) {
      dataUrl = await resolvePreviewRefForUi(image.assetRef);
      image.src = dataUrl;
      image.status = "ready";
    }
    const attachment = toGeneratedImageFileAttachment({
      id: `generated-followup-${Date.now()}-${index}`,
      name: createGeneratedImageAttachmentName(image.alt, index),
      dataUrl,
      index,
    });
    if (attachment) {
      attachments.push(attachment);
    }
  }

  if (!attachments.length) {
    return [];
  }

  try {
    const result = await sendRuntimeMessage<{ plan?: AgenticRoutePlan }>({
      type: "prompt.route.preview",
      payload: {
        message,
        contextHint,
        profileId: activeProfileId,
        model: state.selectedModel,
        reasoningEffort: state.selectedReasoningEffort || undefined,
        serviceTier: state.selectedServiceTier || undefined,
        readStrategyOverride: state.currentReadStrategy,
        attachments: Array.from(state.attachments),
        fileAttachments: [...submittedRequestFileAttachments, ...attachments],
        structuredInputs: getPromptStructuredInputs(),
        selectedTabIds: state.selectedTabIds,
        historyQuery: state.historyQuery,
        suppressPageContext: isCurrentTabContextDismissed(),
        conversationMessageCount: state.messages.length,
        ...(state.currentConversationId ? { conversationId: state.currentConversationId } : {}),
      },
    });
    if (!result.plan || !shouldAttachGeneratedImagesForRoutePlan(result.plan)) {
      return [];
    }
    recordUiDiagnostic("sidepanel.generated_images.attached_to_prompt", {
      count: attachments.length,
    });
    return attachments;
  } catch {
    return [];
  }
}

function recordUiDiagnostic(event: string, details: Record<string, unknown> = {}): void {
  void sendRuntimeMessage({
    type: "diagnostics.log.write",
    event,
    details,
  }).catch(() => undefined);
}

async function restoreConversationImagePreviews(): Promise<void> {
  const pendingImages: ConversationMessageImage[] = [];
  for (const message of state.messages) {
    for (const image of message.images ?? []) {
      if (!image.assetRef) {
        continue;
      }
      if (isSafeMessageImageUrl(image.src)) {
        image.status = "ready";
        continue;
      }
      image.src = "";
      image.status = "loading";
      pendingImages.push(image);
    }
  }

  if (pendingImages.length === 0) {
    return;
  }

  pendingChatScrollToBottom = true;
  render();
  await Promise.allSettled(
    pendingImages.map(async (image) => {
      if (!image.assetRef) {
        return;
      }
      try {
        image.src = await resolvePreviewRefForUi(image.assetRef);
        image.status = "ready";
      } catch {
        image.src = "";
        image.status = "deleted";
      }
    }),
  );
  pendingChatScrollToBottom = true;
  render();
}

function pushImageWorkflowAssistantMessage(
  assistantText: string | null | undefined,
  image: ConversationMessageImage | ConversationMessageImage[] | undefined,
): string {
  const text = assistantText?.trim() || "";
  const images = Array.isArray(image) ? image : image ? [image] : [];
  const id = `assistant-image-${Date.now()}`;
  state.messages.push({
    id,
    role: "assistant",
    text,
    ...(images.length ? { images } : {}),
  });
  return id;
}

function getPendingImageWorkflowMessage(clientRequestId: string): ConversationMessage | null {
  const messageId = pendingImageWorkflowMessageIdsByRequest.get(clientRequestId);
  if (!messageId) {
    return null;
  }
  return state.messages.find((message) => message.id === messageId) ?? null;
}

function pushPendingImageWorkflowMessage(clientRequestId: string, kind: ImageWorkflowPlaceholderKind): string {
  const existing = getPendingImageWorkflowMessage(clientRequestId);
  if (existing) {
    return existing.id;
  }
  const messageId = pushImageWorkflowAssistantMessage(
    createImageWorkflowPlaceholderText(kind),
    createLoadingConversationImage(createImageWorkflowPlaceholderAlt(kind)),
  );
  pendingImageWorkflowMessageIdsByRequest.set(clientRequestId, messageId);
  scheduleConversationPersist();
  return messageId;
}

function ensurePendingImageWorkflowMessage(clientRequestId: string | undefined, kind: ImageWorkflowPlaceholderKind): string | null {
  if (!clientRequestId) {
    return null;
  }
  return pushPendingImageWorkflowMessage(clientRequestId, kind);
}

function replacePendingImageWorkflowMessage(
  clientRequestId: string,
  assistantText: string | null | undefined,
  image: ConversationMessageImage | ConversationMessageImage[] | undefined,
): string {
  const existing = getPendingImageWorkflowMessage(clientRequestId);
  pendingImageWorkflowMessageIdsByRequest.delete(clientRequestId);
  streamedImagePreviewRefsByRequest.delete(clientRequestId);
  completedImageWorkflowMessageIdsByRequest.delete(clientRequestId);
  if (!existing) {
    return pushImageWorkflowAssistantMessage(assistantText, image);
  }

  const text =
    assistantText?.trim() ||
    stringsForState().images.editPreview;
  existing.text = text;
  const images = Array.isArray(image) ? image : image ? [image] : [];
  if (images.length) {
    existing.images = images;
  } else {
    delete existing.images;
  }
  return existing.id;
}

function removePendingImageWorkflowMessage(clientRequestId: string): void {
  const messageId = pendingImageWorkflowMessageIdsByRequest.get(clientRequestId);
  streamedImagePreviewRefsByRequest.delete(clientRequestId);
  completedImageWorkflowMessageIdsByRequest.delete(clientRequestId);
  if (!messageId) {
    return;
  }
  pendingImageWorkflowMessageIdsByRequest.delete(clientRequestId);
  state.messages = state.messages.filter((message) => message.id !== messageId);
}

function consumeStreamedImagePreviewRefs(clientRequestId: string): string[] {
  const refs = streamedImagePreviewRefsByRequest.get(clientRequestId) ?? [];
  streamedImagePreviewRefsByRequest.delete(clientRequestId);
  return refs;
}

async function hydrateConversationImages(messageId: string, previewRefs: string[], baseAlt: string): Promise<void> {
  await Promise.allSettled(
    previewRefs.map((previewRef, index) =>
      hydrateConversationImage(messageId, previewRef, createGeneratedImageAlt(baseAlt, index, previewRefs.length)),
    ),
  );
}

async function hydrateConversationImage(messageId: string, previewRef: string, alt: string): Promise<void> {
  try {
    const image = await createConversationImageFromPreviewRef(previewRef, alt);
    upsertAssistantImageMessage(messageId, image);
    await refreshImageAssetFolderQuietly();
    scheduleConversationPersist();
    render();
    void rememberAutoSavedConversationImage(messageId, previewRef);
  } catch {
    upsertAssistantImageMessage(messageId, createFailedConversationImage(previewRef, alt));
    scheduleConversationPersist();
    render();
  }
}

async function startRealtimeVoiceSession(options: { reconnect?: boolean } = {}): Promise<void> {
  const strings = stringsForState();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(strings.errors.voiceUnsupported);
  }
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    throw new Error(strings.errors.voiceUnsupported);
  }

  if (!options.reconnect) {
    voiceReconnectAttempts = 0;
  }
  voiceStopRequested = false;
  cancelVoiceReconnect();
  stopComposerVoiceInput({ render: false });
  cleanupRealtimeVoiceResources();
  state.actionStatus = strings.status.voicePermissionRequest;
  render();

  try {
    const stream = await getMicrophoneStreamForVoice(options);
    state.actionStatus = strings.status.voiceConnecting;
    render();
    realtimeVoiceStream = stream;
    realtimeVoiceTransport = "websocket";
    resetRealtimeVoiceContextSnapshot();
    resetVoiceTranscriptMirrorState(voiceTranscriptMirror);
    ensureRealtimeOutputAudioContext();

    const result = await sendRuntimeMessageWithConfirmation<{
      status?: string;
      threadId?: string;
      sessionId?: string;
      transport?: RealtimeVoiceTransport;
      error?: string;
      cancelled?: boolean;
    }>({
      type: "voice.session.start",
      confirmed: true,
      outputModality: "audio",
      voice: state.settings.preferredVoice,
    });
    if (isCancelledResult(result)) {
      state.actionStatus = strings.status.voiceCancelled;
      cleanupRealtimeVoiceResources();
      return;
    }
    if (result.status === "error" || result.error) {
      throw new Error(result.error || strings.errors.voiceUpdate);
    }
    if (result.threadId) {
      realtimeVoiceThreadId = result.threadId;
    }
    realtimeVoiceTransport = result.transport ?? "websocket";
    if (browserVoiceFallbackActive) {
      return;
    }
    if (result.status === "active") {
      activateRealtimeVoiceSession({
        ...(result.threadId ? { threadId: result.threadId } : {}),
        transport: result.transport ?? realtimeVoiceTransport,
      });
      return;
    }
    await waitForRealtimeVoiceStarted(result.threadId);
  } catch (error) {
    const realtimeReason = state.initError || toErrorMessage(error);
    if (browserVoiceFallbackActive) {
      return;
    }
    cleanupRealtimeVoiceResources();
    if (!options.reconnect && startBrowserVoiceFallbackIfPossible(realtimeReason)) {
      return;
    }
    throw new Error(toUserFacingVoiceStartError(error));
  }
}

async function getMicrophoneStreamForVoice(options: { reconnect?: boolean } = {}): Promise<MediaStream> {
  if (!options.reconnect) {
    const permissionState = await readMicrophonePermissionState();
    if (permissionState === "denied") {
      throw new DOMException("Permission denied", "NotAllowedError");
    }
    if (permissionState === "prompt") {
      const strings = stringsForState();
      state.actionStatus = strings.status.voicePermissionWindow;
      render();
      const result = await openDedicatedMicrophonePermissionWindow();
      if (result.result !== "granted") {
        throw microphonePermissionResultToError(result.result, result.message);
      }

      state.actionStatus = strings.status.voicePermissionGranted;
      render();
    }
  }

  try {
    return await requestMicrophoneStream();
  } catch (error) {
    if (!shouldOpenDedicatedMicrophonePermissionWindow(error, options)) {
      throw error;
    }

    const strings = stringsForState();
    state.actionStatus = strings.status.voicePermissionWindow;
    render();
    const result = await openDedicatedMicrophonePermissionWindow();
    if (result.result !== "granted") {
      throw microphonePermissionResultToError(result.result, result.message);
    }

    state.actionStatus = strings.status.voicePermissionGranted;
    render();
    return requestMicrophoneStream();
  }
}

async function readMicrophonePermissionState(): Promise<PermissionState | "unknown"> {
  if (!navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

async function requestMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

async function openDedicatedMicrophonePermissionWindow(): Promise<{
  result: MicrophonePermissionWindowResult;
  message?: string;
}> {
  if (microphonePermissionWindowPromise) {
    return microphonePermissionWindowPromise;
  }

  const url = chrome.runtime.getURL(`mic-permission.html?locale=${encodeURIComponent(state.uiLocale)}`);
  let permissionWindowId: number | undefined;
  const promise = new Promise<{
    result: MicrophonePermissionWindowResult;
    message?: string;
  }>((resolve) => {
    let settled = false;
    const settle = (result: { result: MicrophonePermissionWindowResult; message?: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.windows?.onRemoved?.removeListener(onWindowRemoved);
      resolve(result);
    };
    const timeoutId = window.setTimeout(() => {
      settle({ result: "dismissed", message: "Permission dismissed" });
    }, 90_000);
    const onMessage = (message: unknown) => {
      if (!isMicrophonePermissionWindowMessage(message)) {
        return;
      }
      settle({
        result: message.result,
        ...(message.message ? { message: message.message } : {}),
      });
    };
    const onWindowRemoved = (windowId: number) => {
      if (permissionWindowId === windowId) {
        settle({ result: "dismissed", message: "Permission dismissed" });
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.windows?.onRemoved?.addListener(onWindowRemoved);
    chrome.windows.create(
      {
        url,
        type: "popup",
        width: 420,
        height: 520,
        focused: true,
      },
      (createdWindow) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          settle({
            result: "dismissed",
            ...(runtimeError.message ? { message: runtimeError.message } : {}),
          });
          return;
        }
        permissionWindowId = createdWindow?.id;
      },
    );
  }).finally(() => {
    microphonePermissionWindowPromise = null;
  });
  microphonePermissionWindowPromise = promise;
  return promise;
}

function isMicrophonePermissionWindowMessage(message: unknown): message is {
  type: "voice.microphone.permission.result";
  result: MicrophonePermissionWindowResult;
  message?: string;
} {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as { type?: unknown; result?: unknown; message?: unknown };
  return (
    candidate.type === "voice.microphone.permission.result" &&
    (candidate.result === "granted" ||
      candidate.result === "dismissed" ||
      candidate.result === "denied" ||
      candidate.result === "unavailable" ||
      candidate.result === "unknown") &&
    (candidate.message === undefined || typeof candidate.message === "string")
  );
}

async function stopRealtimeVoiceSession(options: { notifyBridge: boolean }): Promise<void> {
  const threadId = realtimeVoiceThreadId;
  const wasVoiceActive = Boolean(
    state.voiceEnabled || realtimeVoicePeer || realtimeVoiceStream || pendingVoiceAnswer || realtimeVoiceTransport,
  );
  voiceStopRequested = true;
  cancelVoiceReconnect();
  cleanupRealtimeVoiceResources();
  state.voiceEnabled = false;
  state.liveCaption = "";
  state.actionStatus = stringsForState().status.voiceStopped;
  if (!options.notifyBridge || !wasVoiceActive) {
    render();
    return;
  }
  await chrome.runtime.sendMessage({
    type: "voice.session.stop",
    ...(threadId ? { threadId } : {}),
  });
  realtimeVoiceThreadId = null;
  render();
}

function cleanupRealtimeVoiceResources(): void {
  const activeRecognition = recognition;
  recognition = null;
  voiceRecognitionMode = null;
  state.voiceInputActive = false;
  cleanupComposerVoiceWaveform();
  resetComposerVoiceInputTranscript();
  if (activeRecognition) {
    activeRecognition.onend = null;
    activeRecognition.onresult = null;
    activeRecognition.stop();
  }
  browserVoiceFallbackActive = false;
  stopVoiceDurationTicker();
  cancelPendingVoiceStart();
  cancelPendingVoiceAnswer();
  realtimeVoiceStream?.getTracks().forEach((track) => track.stop());
  realtimeVoiceStream = null;
  realtimeVoicePeer?.close();
  realtimeVoicePeer = null;
  if (realtimeVoiceAudio) {
    realtimeVoiceAudio.pause();
    realtimeVoiceAudio.srcObject = null;
    realtimeVoiceAudio = null;
  }
  for (const source of realtimeOutputAudioSources) {
    try {
      source.stop();
    } catch {
      // The source may already have ended; cleanup must stay best-effort.
    }
  }
  realtimeOutputAudioSources.clear();
  if (realtimeOutputAudioContext) {
    void realtimeOutputAudioContext.close().catch(() => undefined);
    realtimeOutputAudioContext = null;
  }
  realtimeInputAudioWorkletNode?.port.close();
  realtimeInputAudioWorkletNode?.disconnect();
  realtimeInputAudioWorkletNode = null;
  realtimeInputAudioSource?.disconnect();
  realtimeInputAudioSource = null;
  if (realtimeInputAudioContext) {
    void realtimeInputAudioContext.close().catch(() => undefined);
    realtimeInputAudioContext = null;
  }
  realtimeInputAudioSamples = [];
  realtimeAudioSendChain = Promise.resolve();
  realtimeOutputAudioNextTime = 0;
  realtimeOutputSuppressedUntil = 0;
  realtimeBargeInHighRmsFrames = 0;
  liveVoiceRecognitionUtteranceStartedAt = null;
  realtimeVoiceThreadId = null;
  realtimeVoiceTransport = null;
  resetRealtimeVoiceContextSnapshot();
  resetVoiceTranscriptMirrorState(voiceTranscriptMirror);
}

function handleRealtimeVoiceDisconnect(reason: string | null, hadError: boolean): void {
  const wasActive = Boolean(
    state.voiceEnabled || realtimeVoicePeer || realtimeVoiceStream || pendingVoiceAnswer || realtimeVoiceTransport,
  );
  cleanupRealtimeVoiceResources();
  state.voiceEnabled = false;
  state.liveCaption = "";

  if (hadError && reason && !voiceStopRequested && startBrowserVoiceFallbackIfPossible(reason)) {
    voiceReconnectAttempts = 0;
    voiceStopRequested = false;
    return;
  }

  if (
    shouldAutoReconnectVoice({
      wasActive,
      requestedStop: voiceStopRequested,
      attemptCount: voiceReconnectAttempts,
      maxAttempts: MAX_VOICE_RECONNECT_ATTEMPTS,
      reason,
    })
  ) {
    scheduleRealtimeVoiceReconnect();
    return;
  }

  if (hadError && reason) {
    state.initError = reason;
  }
  state.actionStatus = stringsForState().status.voiceStopped;
  voiceReconnectAttempts = 0;
  voiceStopRequested = false;
}

function activateRealtimeVoiceSession(options: {
  threadId?: string;
  transport?: RealtimeVoiceTransport | null;
}): void {
  if (options.threadId) {
    realtimeVoiceThreadId = options.threadId;
  }
  if (options.transport) {
    realtimeVoiceTransport = options.transport;
  }
  state.voiceEnabled = true;
  startVoiceDurationTicker();
  state.liveCaption = "";
  state.actionStatus = stringsForState().status.voiceListening;
  if (realtimeVoiceStream) {
    void startRealtimeAudioInput(realtimeVoiceStream);
  }
  startVoiceRecognition("live");
}

function startVoiceDurationTicker(): void {
  if (voiceDurationTicker !== null) {
    return;
  }
  voiceDurationNow = Date.now();
  voiceDurationTicker = window.setInterval(() => {
    voiceDurationNow = Date.now();
    if (
      state.activeView === "chat" &&
      state.messages.some((message) => isActiveVoiceTranscriptMessage(voiceTranscriptMirror, message))
    ) {
      render();
    }
  }, 500);
}

function stopVoiceDurationTicker(): void {
  if (voiceDurationTicker === null) {
    return;
  }
  window.clearInterval(voiceDurationTicker);
  voiceDurationTicker = null;
}

function scheduleRealtimeVoiceReconnect(): void {
  cancelVoiceReconnect();
  voiceReconnectAttempts += 1;
  state.initError = "";
  state.actionStatus = stringsForState().status.voiceReconnecting(
    voiceReconnectAttempts,
    MAX_VOICE_RECONNECT_ATTEMPTS,
  );
  const delayMs = Math.min(1000 * 2 ** (voiceReconnectAttempts - 1), 4000);
  voiceReconnectTimer = window.setTimeout(() => {
    voiceReconnectTimer = null;
    void retryRealtimeVoiceSession();
  }, delayMs);
}

async function retryRealtimeVoiceSession(): Promise<void> {
  try {
    await startRealtimeVoiceSession({ reconnect: true });
    voiceReconnectAttempts = 0;
    render();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    cleanupRealtimeVoiceResources();
    state.voiceEnabled = false;
    state.liveCaption = "";
    if (!voiceStopRequested && startBrowserVoiceFallbackIfPossible(reason)) {
      voiceReconnectAttempts = 0;
      voiceStopRequested = false;
      render();
      return;
    }
    if (
      shouldAutoReconnectVoice({
        wasActive: true,
        requestedStop: voiceStopRequested,
        attemptCount: voiceReconnectAttempts,
        maxAttempts: MAX_VOICE_RECONNECT_ATTEMPTS,
        reason,
      })
    ) {
      scheduleRealtimeVoiceReconnect();
    } else {
      state.initError = reason;
      state.actionStatus = stringsForState().status.voiceStopped;
      voiceReconnectAttempts = 0;
      voiceStopRequested = false;
    }
    render();
  }
}

function cancelVoiceReconnect(): void {
  if (voiceReconnectTimer === null) {
    return;
  }
  window.clearTimeout(voiceReconnectTimer);
  voiceReconnectTimer = null;
}

function waitForRealtimeVoiceStarted(threadId: string | undefined, timeoutMs = 15_000): Promise<void> {
  if (state.voiceEnabled && (!threadId || realtimeVoiceThreadId === threadId)) {
    return Promise.resolve();
  }

  cancelPendingVoiceStart();
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (!pendingVoiceStart) {
        return;
      }
      pendingVoiceStart = null;
      reject(new Error(stringsForState().errors.voiceUpdate));
    }, timeoutMs);
    pendingVoiceStart = {
      resolve,
      reject,
      timeoutId,
      ...(threadId ? { threadId } : {}),
    };
  });
}

function completeRealtimeVoiceStarted(threadId: string | undefined): void {
  if (!pendingVoiceStart) {
    return;
  }
  if (pendingVoiceStart.threadId && threadId && pendingVoiceStart.threadId !== threadId) {
    return;
  }
  const pending = pendingVoiceStart;
  pendingVoiceStart = null;
  window.clearTimeout(pending.timeoutId);
  pending.resolve();
}

function cancelPendingVoiceStart(): void {
  if (!pendingVoiceStart) {
    return;
  }
  const pending = pendingVoiceStart;
  pendingVoiceStart = null;
  window.clearTimeout(pending.timeoutId);
  pending.reject(new Error(stringsForState().errors.voiceUpdate));
}

function waitForRealtimeVoiceAnswer(timeoutMs = 10_000): Promise<string> {
  cancelPendingVoiceAnswer();
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (!pendingVoiceAnswer) {
        return;
      }
      pendingVoiceAnswer = null;
      reject(new Error(stringsForState().errors.voiceUpdate));
    }, timeoutMs);
    pendingVoiceAnswer = {
      resolve,
      reject,
      timeoutId,
    };
  });
}

function completeRealtimeVoiceHandshake(threadId: string | undefined, sdp: string): void {
  if (!pendingVoiceAnswer) {
    return;
  }
  if (pendingVoiceAnswer.threadId && threadId && pendingVoiceAnswer.threadId !== threadId) {
    return;
  }
  const pending = pendingVoiceAnswer;
  pendingVoiceAnswer = null;
  window.clearTimeout(pending.timeoutId);
  pending.resolve(sdp);
}

function cancelPendingVoiceAnswer(): void {
  if (!pendingVoiceAnswer) {
    return;
  }
  const pending = pendingVoiceAnswer;
  pendingVoiceAnswer = null;
  window.clearTimeout(pending.timeoutId);
  pending.reject(new Error(stringsForState().errors.voiceUpdate));
}

function interruptRealtimeVoiceOutput(): void {
  window.speechSynthesis?.cancel();
  realtimeBargeInHighRmsFrames = 0;
  if (realtimeOutputAudioSources.size) {
    suppressRealtimeOutputForBargeIn();
  }
  for (const source of realtimeOutputAudioSources) {
    try {
      source.stop();
    } catch {
      // Already-ended sources are removed by onended below.
    }
  }
  realtimeOutputAudioSources.clear();
  realtimeOutputAudioNextTime = realtimeOutputAudioContext?.currentTime ?? 0;
}

function suppressRealtimeOutputForBargeIn(): void {
  realtimeOutputSuppressedUntil = Date.now() + REALTIME_BARGE_IN_SUPPRESSION_MS;
}

function shouldSuppressRealtimeOutputAudio(): boolean {
  return Date.now() < realtimeOutputSuppressedUntil;
}

function maybeInterruptRealtimeOutputForInput(input: Float32Array): void {
  if (!realtimeOutputAudioSources.size || !input.length) {
    realtimeBargeInHighRmsFrames = 0;
    return;
  }

  let sum = 0;
  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / input.length);
  if (rms >= REALTIME_BARGE_IN_RMS_THRESHOLD) {
    realtimeBargeInHighRmsFrames += 1;
  } else {
    realtimeBargeInHighRmsFrames = 0;
  }

  if (realtimeBargeInHighRmsFrames >= REALTIME_BARGE_IN_REQUIRED_AUDIO_FRAMES) {
    interruptRealtimeVoiceOutput();
  }
}

function ensureRealtimeOutputAudioContext(): AudioContext | null {
  if (realtimeOutputAudioContext) {
    void realtimeOutputAudioContext.resume().catch(() => undefined);
    return realtimeOutputAudioContext;
  }

  try {
    realtimeOutputAudioContext = new AudioContext();
    realtimeOutputAudioNextTime = realtimeOutputAudioContext.currentTime;
    void realtimeOutputAudioContext.resume().catch(() => undefined);
    return realtimeOutputAudioContext;
  } catch {
    return null;
  }
}

async function playRealtimeOutputAudio(audio: RealtimeOutputAudioChunk): Promise<void> {
  if (shouldSuppressRealtimeOutputAudio()) {
    return;
  }

  const data = typeof audio.data === "string" ? audio.data : "";
  if (!data) {
    return;
  }

  const context = ensureRealtimeOutputAudioContext();
  if (!context) {
    return;
  }

  const sampleRate =
    typeof audio.sampleRate === "number"
      ? audio.sampleRate
      : typeof audio.sample_rate === "number"
        ? audio.sample_rate
        : 24_000;
  const numChannels =
    typeof audio.numChannels === "number"
      ? audio.numChannels
      : typeof audio.num_channels === "number"
        ? audio.num_channels
        : 1;
  if (sampleRate <= 0 || numChannels <= 0) {
    return;
  }

  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const frameCount = Math.floor(samples.length / numChannels);
  if (!frameCount) {
    return;
  }

  const buffer = context.createBuffer(numChannels, frameCount, sampleRate);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = samples[frame * numChannels + channel] ?? 0;
      buffer.getChannelData(channel)[frame] = Math.max(-1, Math.min(1, sample / 32768));
    }
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  realtimeOutputAudioSources.add(source);
  source.onended = () => realtimeOutputAudioSources.delete(source);
  const startAt = Math.max(context.currentTime, realtimeOutputAudioNextTime);
  source.start(startAt);
  realtimeOutputAudioNextTime = startAt + buffer.duration;
}

async function startRealtimeAudioInput(stream: MediaStream): Promise<void> {
  if (!realtimeVoiceThreadId || realtimeInputAudioWorkletNode) {
    return;
  }

  try {
    realtimeInputAudioContext = new AudioContext();
    await realtimeInputAudioContext.audioWorklet.addModule(
      chrome.runtime.getURL("realtime-audio-input-worklet.js"),
    );
    realtimeInputAudioSource = realtimeInputAudioContext.createMediaStreamSource(stream);
    realtimeInputAudioWorkletNode = new AudioWorkletNode(
      realtimeInputAudioContext,
      "realtime-audio-input",
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      },
    );
    realtimeInputAudioWorkletNode.port.onmessage = (event: MessageEvent) => {
      if (!state.voiceEnabled || realtimeVoiceTransport !== "websocket" || !realtimeVoiceThreadId) {
        return;
      }

      const input = coerceRealtimeAudioSamples(event.data);
      const sourceSampleRate = getRealtimeAudioInputSampleRate(event.data, realtimeInputAudioContext?.sampleRate ?? 48_000);
      if (!input.length) {
        return;
      }

      maybeInterruptRealtimeOutputForInput(input);
      for (let index = 0; index < input.length; index += 1) {
        realtimeInputAudioSamples.push(input[index] ?? 0);
      }

      const chunkSize = Math.max(
        1,
        Math.floor((sourceSampleRate * REALTIME_AUDIO_CHUNK_MS) / 1000),
      );
      while (realtimeInputAudioSamples.length >= chunkSize) {
        const samples = realtimeInputAudioSamples.splice(0, chunkSize);
        queueRealtimeAudioFrame(samples, sourceSampleRate);
      }
    };
    realtimeInputAudioSource.connect(realtimeInputAudioWorkletNode);
    realtimeInputAudioWorkletNode.connect(realtimeInputAudioContext.destination);
    void realtimeInputAudioContext.resume().catch(() => undefined);
  } catch (error) {
    handleRealtimeVoiceDisconnect(toUserFacingVoiceStartError(error), true);
  }
}

function coerceRealtimeAudioSamples(data: unknown): Float32Array {
  const samples = data && typeof data === "object" ? (data as { samples?: unknown }).samples : null;
  if (samples instanceof Float32Array) {
    return samples;
  }
  if (Array.isArray(samples)) {
    return new Float32Array(samples);
  }
  return new Float32Array();
}

function getRealtimeAudioInputSampleRate(data: unknown, fallback: number): number {
  const sampleRate = data && typeof data === "object" ? (data as { sampleRate?: unknown }).sampleRate : null;
  return typeof sampleRate === "number" && Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : fallback;
}

function queueRealtimeAudioFrame(samples: number[], sourceSampleRate: number): void {
  const threadId = realtimeVoiceThreadId;
  if (!threadId || !samples.length) {
    return;
  }

  const targetSampleRate = 24_000;
  const resampled = resampleMonoPcm16(samples, sourceSampleRate, targetSampleRate);
  if (!resampled.length) {
    return;
  }
  const data = encodePcm16Base64(resampled);
  realtimeAudioSendChain = realtimeAudioSendChain
    .then(async () => {
      await chrome.runtime.sendMessage({
        type: "voice.session.append_audio",
        threadId,
        audio: {
          data,
          sampleRate: targetSampleRate,
          numChannels: 1,
          samplesPerChannel: resampled.length,
        },
      });
    })
    .catch((error) => {
      if (!voiceStopRequested && state.voiceEnabled) {
        handleRealtimeVoiceDisconnect(toUserFacingVoiceStartError(error), true);
        render();
      }
    });
}

function resampleMonoPcm16(samples: number[], sourceSampleRate: number, targetSampleRate: number): Int16Array {
  if (sourceSampleRate <= 0 || targetSampleRate <= 0 || !samples.length) {
    return new Int16Array();
  }

  const outputLength = Math.max(1, Math.floor((samples.length * targetSampleRate) / sourceSampleRate));
  const output = new Int16Array(outputLength);
  const ratio = sourceSampleRate / targetSampleRate;
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const fraction = sourceIndex - leftIndex;
    const left = samples[leftIndex] ?? 0;
    const right = samples[rightIndex] ?? left;
    const value = left + (right - left) * fraction;
    output[index] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
  }
  return output;
}

function encodePcm16Base64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function waitForIceGatheringComplete(peer: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (peer.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      peer.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    };
    const handleChange = () => {
      if (peer.iceGatheringState === "complete") {
        cleanup();
      }
    };
    const timeoutId = window.setTimeout(cleanup, timeoutMs);
    peer.addEventListener("icegatheringstatechange", handleChange);
  });
}

async function startComposerVoiceInput(): Promise<void> {
  const strings = stringsForState();
  if (state.voiceEnabled || state.pendingAction === "voice") {
    return;
  }
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    state.initError = strings.errors.voiceUnsupported;
    render();
    return;
  }

  state.initError = "";
  state.actionStatus = "";
  resetComposerVoiceInputTranscript();
  render();

  try {
    const stream = await getMicrophoneStreamForVoice();
    state.voiceInputActive = true;
    state.actionStatus = "";
    startComposerVoiceWaveform(stream);
    startVoiceRecognition("composer");
    render();
  } catch (error) {
    state.voiceInputActive = false;
    state.actionStatus = "";
    resetComposerVoiceInputTranscript();
    cleanupComposerVoiceWaveform();
    state.initError = toUserFacingVoiceStartError(error);
    render();
  }
}

function stopComposerVoiceInput(options: { render?: boolean } = {}): void {
  if (voiceRecognitionMode === "composer" && recognition) {
    const activeRecognition = recognition;
    recognition = null;
    voiceRecognitionMode = null;
    activeRecognition.onend = null;
    activeRecognition.onresult = null;
    activeRecognition.stop();
  }
  state.voiceInputActive = false;
  cleanupComposerVoiceWaveform();
  if (state.actionStatus.startsWith(stringsForState().status.voiceInputListening)) {
    state.actionStatus = "";
  }
  if (options.render !== false) {
    render();
  }
}

async function commitComposerVoiceInput(): Promise<void> {
  if (composerVoiceInputCommitPromise) {
    return composerVoiceInputCommitPromise;
  }

  composerVoiceInputCommitPromise = (async () => {
    const optimisticTranscript = getComposerVoiceInputTranscript();
    await finalizeComposerVoiceInputForCommit();
    const transcript = getComposerVoiceInputTranscript() || optimisticTranscript;
    resetComposerVoiceInputTranscript();
    if (transcript) {
      appendVoiceInputTranscriptToComposer(transcript);
      return;
    }
    render();
  })().finally(() => {
    composerVoiceInputCommitPromise = null;
  });

  return composerVoiceInputCommitPromise;
}

function cancelComposerVoiceInput(): void {
  stopComposerVoiceInput({ render: false });
  resetComposerVoiceInputTranscript();
  render();
}

function finalizeComposerVoiceInputForCommit(): Promise<void> {
  if (!(voiceRecognitionMode === "composer" && recognition)) {
    state.voiceInputActive = false;
    cleanupComposerVoiceWaveform();
    if (state.actionStatus.startsWith(stringsForState().status.voiceInputListening)) {
      state.actionStatus = "";
    }
    return Promise.resolve();
  }

  const activeRecognition = recognition;
  recognition = null;
  voiceRecognitionMode = null;
  state.voiceInputActive = false;

  return new Promise((resolve) => {
    let settled = false;
    const timeoutId = window.setTimeout(finish, COMPOSER_VOICE_STOP_FINALIZATION_TIMEOUT_MS);

    function finish(): void {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      activeRecognition.onend = null;
      activeRecognition.onresult = null;
      cleanupComposerVoiceWaveform();
      if (state.actionStatus.startsWith(stringsForState().status.voiceInputListening)) {
        state.actionStatus = "";
      }
      resolve();
    }

    activeRecognition.onend = finish;
    try {
      activeRecognition.stop();
    } catch {
      finish();
    }
  });
}

function appendVoiceInputTranscriptToComposer(transcript: string): void {
  const text = transcript.trim();
  if (!text) {
    return;
  }
  const current = state.composerDraft.trimEnd();
  state.composerDraft = `${current}${current ? " " : ""}${text}`;
  const previousMentionQuery = state.mentionQuery;
  state.mentionQuery = extractMentionQuery(state.composerDraft);
  if (previousMentionQuery !== state.mentionQuery) {
    state.mentionActiveIndex = 0;
  }
  state.slashQuery = extractSlashQuery(state.composerDraft);
  render();
  window.setTimeout(() => focusComposerAtEnd(), 0);
}

function resetComposerVoiceInputTranscript(): void {
  composerVoiceInputFinalTranscript = "";
  composerVoiceInputInterimTranscript = "";
}

function appendComposerVoiceInputFinalTranscript(transcript: string): void {
  const text = transcript.trim();
  if (!text) {
    return;
  }
  const current = composerVoiceInputFinalTranscript.trimEnd();
  composerVoiceInputFinalTranscript = `${current}${current ? " " : ""}${text}`;
  composerVoiceInputInterimTranscript = "";
}

function updateComposerVoiceInputInterimTranscript(transcript: string): void {
  composerVoiceInputInterimTranscript = transcript.trim();
}

function getComposerVoiceInputTranscript(): string {
  return [composerVoiceInputFinalTranscript, composerVoiceInputInterimTranscript]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function createSilentComposerVoiceWaveform(): number[] {
  return Array.from({ length: COMPOSER_VOICE_WAVEFORM_BAR_COUNT }, (_, index) => {
    const centerDistance = Math.abs(index - (COMPOSER_VOICE_WAVEFORM_BAR_COUNT - 1) / 2);
    return 0.08 + Math.max(0, 0.08 - centerDistance * 0.002);
  });
}

function startComposerVoiceWaveform(stream: MediaStream): void {
  cleanupComposerVoiceWaveform();
  composerVoiceInputStream = stream;
  composerVoiceInputWaveformLevels = createSilentComposerVoiceWaveform();

  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    composerVoiceInputAudioContext = new AudioContextCtor();
    composerVoiceInputAudioSource = composerVoiceInputAudioContext.createMediaStreamSource(stream);
    composerVoiceInputAnalyser = composerVoiceInputAudioContext.createAnalyser();
    composerVoiceInputAnalyser.fftSize = 512;
    composerVoiceInputAnalyser.smoothingTimeConstant = 0.72;
    composerVoiceInputAudioSource.connect(composerVoiceInputAnalyser);
    composerVoiceInputAudioData = new Uint8Array(composerVoiceInputAnalyser.frequencyBinCount);
    composerVoiceInputWaveformTimer = window.setInterval(
      updateComposerVoiceWaveform,
      COMPOSER_VOICE_WAVEFORM_REFRESH_MS,
    );
    updateComposerVoiceWaveform();
  } catch {
    composerVoiceInputWaveformTimer = window.setInterval(() => {
      composerVoiceInputWaveformLevels = createAnimatedFallbackVoiceWaveform(Date.now());
      paintComposerVoiceWaveform();
    }, COMPOSER_VOICE_WAVEFORM_REFRESH_MS);
  }
}

function updateComposerVoiceWaveform(): void {
  const analyser = composerVoiceInputAnalyser;
  const audioData = composerVoiceInputAudioData;
  if (!analyser || !audioData) {
    return;
  }
  analyser.getByteTimeDomainData(audioData);
  const bucketSize = Math.max(1, Math.floor(audioData.length / COMPOSER_VOICE_WAVEFORM_BAR_COUNT));
  composerVoiceInputWaveformLevels = Array.from({ length: COMPOSER_VOICE_WAVEFORM_BAR_COUNT }, (_, index) => {
    const start = index * bucketSize;
    const end = Math.min(audioData.length, start + bucketSize);
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const sample = audioData[sampleIndex] ?? 128;
      peak = Math.max(peak, Math.abs(sample - 128) / 128);
    }
    const eased = Math.min(1, 0.1 + peak * 4.2);
    const previous = composerVoiceInputWaveformLevels[index] ?? 0.08;
    return Math.max(0.06, previous * 0.46 + eased * 0.54);
  });
  paintComposerVoiceWaveform();
}

function paintComposerVoiceWaveform(): void {
  const bars = root.querySelectorAll<HTMLSpanElement>(".composer-waveform-bar");
  if (!bars.length) {
    return;
  }

  bars.forEach((bar, index) => {
    const normalized = Math.max(0.06, Math.min(1, composerVoiceInputWaveformLevels[index] ?? 0.08));
    bar.style.setProperty("--bar-level", normalized.toFixed(3));
  });
}

function createAnimatedFallbackVoiceWaveform(now: number): number[] {
  return Array.from({ length: COMPOSER_VOICE_WAVEFORM_BAR_COUNT }, (_, index) => {
    const wave = Math.sin(now / 170 + index * 0.58);
    const cluster = Math.max(0.18, Math.sin(now / 520 + index * 0.2) * 0.5 + 0.5);
    return Math.max(0.06, Math.min(0.78, 0.1 + Math.abs(wave) * 0.55 * cluster));
  });
}

function cleanupComposerVoiceWaveform(): void {
  if (composerVoiceInputWaveformTimer !== null) {
    window.clearInterval(composerVoiceInputWaveformTimer);
    composerVoiceInputWaveformTimer = null;
  }
  composerVoiceInputAudioSource?.disconnect();
  composerVoiceInputAudioSource = null;
  composerVoiceInputAnalyser?.disconnect();
  composerVoiceInputAnalyser = null;
  if (composerVoiceInputAudioContext) {
    void composerVoiceInputAudioContext.close().catch(() => undefined);
    composerVoiceInputAudioContext = null;
  }
  composerVoiceInputStream?.getTracks().forEach((track) => track.stop());
  composerVoiceInputStream = null;
  composerVoiceInputAudioData = null;
  composerVoiceInputWaveformLevels = createSilentComposerVoiceWaveform();
}

function startVoiceRecognition(mode: VoiceRecognitionMode): void {
  if (recognition) {
    if (voiceRecognitionMode === mode) {
      return;
    }
    const activeRecognition = recognition;
    recognition = null;
    voiceRecognitionMode = null;
    activeRecognition.onend = null;
    activeRecognition.onresult = null;
    activeRecognition.stop();
  }
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    if (mode === "composer") {
      state.voiceInputActive = false;
    }
    render();
    return;
  }

  recognition = new SpeechRecognitionCtor();
  voiceRecognitionMode = mode;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event: { results: ArrayLike<SpeechRecognitionResult> }) => {
    let interim = "";

    for (const result of Array.from(event.results)) {
      const transcript = result[0]?.transcript?.trim();
      if (!transcript) {
        continue;
      }
      const resultAt = Date.now();
      if (mode === "live" && liveVoiceRecognitionUtteranceStartedAt === null) {
        liveVoiceRecognitionUtteranceStartedAt = resultAt;
      }

      if (result.isFinal) {
        if (mode === "composer") {
          appendComposerVoiceInputFinalTranscript(transcript);
        } else {
          const startedAt = liveVoiceRecognitionUtteranceStartedAt ?? resultAt;
          liveVoiceRecognitionUtteranceStartedAt = null;
          state.liveCaption = transcript;
          render();
          void handleVoiceTranscript(transcript, { startedAt, endedAt: resultAt });
        }
      } else {
        interim = transcript;
      }
    }

    if (interim) {
      if (mode === "composer") {
        updateComposerVoiceInputInterimTranscript(interim);
      } else {
        state.liveCaption = interim;
        render();
      }
    }
  };
  recognition.onend = () => {
    if (mode === "live" && state.voiceEnabled) {
      try {
        recognition?.start();
      } catch {
        recognition = null;
        voiceRecognitionMode = null;
        state.voiceEnabled = false;
        state.actionStatus = stringsForState().status.voiceStopped;
        render();
      }
      return;
    }
    if (mode === "composer" && state.voiceInputActive) {
      try {
        recognition?.start();
        return;
      } catch {
        // Fall through to cleanup when the browser refuses to resume recognition.
      }
    }
    if (mode === "composer") {
      recognition = null;
      voiceRecognitionMode = null;
      state.voiceInputActive = false;
      cleanupComposerVoiceWaveform();
      if (state.actionStatus.startsWith(stringsForState().status.voiceInputListening)) {
        state.actionStatus = "";
      }
      render();
    }
  };
  try {
    recognition.start();
  } catch {
    recognition = null;
    voiceRecognitionMode = null;
    state.initError = stringsForState().errors.voiceUpdate;
    if (mode === "live") {
      state.voiceEnabled = false;
      state.actionStatus = stringsForState().status.voiceStopped;
    } else {
      state.voiceInputActive = false;
      state.actionStatus = "";
      cleanupComposerVoiceWaveform();
    }
    render();
  }
}

function startBrowserVoiceFallbackIfPossible(reason: string): boolean {
  if (!isRealtimeVoiceBackendUnavailable(reason)) {
    return false;
  }

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    return false;
  }

  void chrome.runtime
    .sendMessage({
      type: "diagnostics.log.write",
      event: "voice.browser_fallback.started",
      details: { reason },
    })
    .catch(() => undefined);
  state.initError = "";
  state.voiceEnabled = true;
  startVoiceDurationTicker();
  browserVoiceFallbackActive = true;
  state.liveCaption = "";
  state.actionStatus = stringsForState().status.voiceFallbackListening;
  startVoiceRecognition("live");
  return true;
}

function isRealtimeVoiceBackendUnavailable(reason: string): boolean {
  return /does not support realtime conversation|codex\/realtime\/calls|unexpected status (?:403|404|501|503)|http error: (?:403|404|501|503)|realtime.*not available|not found/iu.test(
    reason,
  );
}

async function appendRealtimeVoiceTextWithCurrentContext(
  transcript: string,
  options: { includeTranscript: boolean },
): Promise<void> {
  const threadId = realtimeVoiceThreadId;
  if (!threadId) {
    return;
  }

  const contextPrompt = await collectRealtimeVoiceContextSnapshot().catch(() => "");
  const text = createRealtimeVoiceContextAppendText({
    transcript,
    contextPrompt,
    includeTranscript: options.includeTranscript,
  });
  if (!text.trim()) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: "voice.session.append_text",
    threadId,
    text,
  });
}

async function collectRealtimeVoiceContextSnapshot(): Promise<string> {
  const now = Date.now();
  if (
    realtimeVoiceContextSnapshotPrompt &&
    now - realtimeVoiceContextSnapshotCapturedAt < REALTIME_VOICE_CONTEXT_SNAPSHOT_TTL_MS
  ) {
    return realtimeVoiceContextSnapshotPrompt;
  }

  if (realtimeVoiceContextSnapshotPromise) {
    return realtimeVoiceContextSnapshotPromise;
  }

  realtimeVoiceContextSnapshotPromise = (async () => {
    const result = await sendRuntimeMessageWithConfirmation<{ prompt?: string }>({
      type: "voice.context.snapshot",
    });
    if (isCancelledResult(result)) {
      return "";
    }
    const prompt = typeof result.prompt === "string" ? result.prompt : "";
    realtimeVoiceContextSnapshotPrompt = prompt;
    realtimeVoiceContextSnapshotCapturedAt = Date.now();
    return prompt;
  })().finally(() => {
    realtimeVoiceContextSnapshotPromise = null;
  });

  return realtimeVoiceContextSnapshotPromise;
}

function resetRealtimeVoiceContextSnapshot(): void {
  realtimeVoiceContextSnapshotPromise = null;
  realtimeVoiceContextSnapshotPrompt = "";
  realtimeVoiceContextSnapshotCapturedAt = 0;
}

async function shouldRouteRealtimeVoiceTranscriptViaPrompt(transcript: string): Promise<boolean> {
  const message = transcript.trim();
  if (!message || !canSendCurrentComposerMessage()) {
    return false;
  }

  try {
    const result = await sendRuntimeMessage<{ plan?: AgenticRoutePlan }>({
      type: "prompt.route.preview",
      payload: createCurrentVoiceRoutePreviewPayload(message),
    });
    return result.plan ? shouldRouteRealtimeVoiceTranscriptThroughPrompt(result.plan) : false;
  } catch {
    return false;
  }
}

function createCurrentVoiceRoutePreviewPayload(message: string): PromptRequestPayload {
  return createSanitizedVoiceRoutePreviewPayload({
    message,
    contextHint: buildConversationContextHint(),
    profileId: ensureComposerProfileSelection(),
    model: state.selectedModel,
    ...(state.selectedReasoningEffort ? { reasoningEffort: state.selectedReasoningEffort } : {}),
    ...(state.selectedServiceTier ? { serviceTier: state.selectedServiceTier } : {}),
    readStrategyOverride: state.currentReadStrategy,
    attachments: Array.from(state.attachments),
    fileAttachments: state.fileAttachments,
    structuredInputs: getPromptStructuredInputs(),
    selectedTabIds: state.selectedTabIds,
    historyQuery: state.historyQuery,
    suppressPageContext: isCurrentTabContextDismissed(),
    conversationMessageCount: state.messages.length,
    ...(state.currentConversationId ? { conversationId: state.currentConversationId } : {}),
  });
}

async function handleRealtimeVoiceItemAdded(item: Record<string, unknown> | undefined, threadId?: string): Promise<void> {
  if (threadId && realtimeVoiceThreadId && threadId !== realtimeVoiceThreadId) {
    return;
  }

  const handoffPrompt = extractRealtimeVoiceHandoffPrompt(item);
  if (!handoffPrompt || !canSendCurrentComposerMessage()) {
    return;
  }

  interruptRealtimeVoiceOutput();
  state.liveCaption = handoffPrompt;
  render();
  await sendPrompt(handoffPrompt);
}

async function handleVoiceTranscript(
  transcript: string,
  timing: { startedAt?: number; endedAt?: number } = {},
): Promise<void> {
  const strings = getUiStrings(state.uiLocale);
  if (
    shouldInterruptVoiceOutputForTranscript({
      transcript,
      isFinal: true,
      hasQueuedOutput: realtimeOutputAudioSources.size > 0,
    })
  ) {
    interruptRealtimeVoiceOutput();
  }

  if (state.voiceEnabled && realtimeVoiceTransport === "websocket" && realtimeVoiceThreadId) {
    if (await shouldRouteRealtimeVoiceTranscriptViaPrompt(transcript)) {
      interruptRealtimeVoiceOutput();
      state.liveCaption = `${stringsForState().roles.user}: ${transcript}`;
      render();
      await sendPrompt(transcript);
      return;
    }

    mirrorLocalLiveUserTranscript(transcript, timing);
    state.liveCaption = `${stringsForState().roles.user}: ${transcript}`;
    render();
    await appendRealtimeVoiceTextWithCurrentContext(transcript, {
      includeTranscript: !realtimeInputAudioWorkletNode,
    });
    return;
  }

  if (state.settings.allowVoiceNavigation) {
    const command = parseVoiceNavigationCommand(transcript);
    if (command) {
      const result = await sendRuntimeMessageWithConfirmation<{ matched?: boolean; cancelled?: boolean }>({
        type: "page.navigate",
        command,
      });
      if (isCancelledResult(result)) {
        return;
      }
      state.liveCaption = result?.matched === false ? strings.status.noMatchFor(transcript) : transcript;
      render();
      return;
    }
  }

  await sendPrompt(transcript);
}

function mirrorLocalLiveUserTranscript(transcript: string, timing: { startedAt?: number; endedAt?: number } = {}): void {
  if (!state.settings.liveCaptions) {
    return;
  }
  const mirrored = applyVoiceTranscriptDone({
    messages: state.messages,
    mirror: voiceTranscriptMirror,
    role: "user",
    text: transcript,
    threadId: realtimeVoiceThreadId ?? undefined,
    now: timing.endedAt ?? Date.now(),
    ...(typeof timing.startedAt === "number" ? { startedAt: timing.startedAt } : {}),
    createId: () => createVoiceTranscriptMessageId("user"),
  });
  state.liveCaption = mirrored.liveCaption;
  scheduleConversationPersist();
}

function shouldMirrorRealtimeTranscriptEvent(role: string | undefined): boolean {
  return !(role === "user" && voiceRecognitionMode === "live");
}

function speak(text: string): void {
  if (!("speechSynthesis" in window) || !text.trim()) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

async function compactCurrentConversation(): Promise<void> {
  const strings = stringsForState();
  if (!state.threadId || isCurrentTurnActive()) {
    state.actionStatus = strings.status.compactSkipped;
    render();
    return;
  }

  const clientRequestId = `compact-${Date.now()}`;
  const noticeKey = createContextCompactionNoticeKey({ clientRequestId });
  upsertContextCompactionNotice(noticeKey, "running");
  state.actionStatus = strings.status.compactStarted;
  scheduleConversationPersist();
  render();

  try {
    const result = await sendRuntimeMessage<{
      threadId?: string;
      status?: "started" | "completed";
      skipped?: boolean;
      error?: string;
    }>({
      type: "conversation.compact",
      waitForCompletion: true,
    });
    if (result.error) {
      throw new Error(result.error);
    }
    if (result.skipped) {
      state.actionStatus = strings.status.compactSkipped;
    } else {
      state.threadId = result.threadId ?? state.threadId;
      upsertContextCompactionNotice(noticeKey, "completed");
      state.actionStatus = strings.status.compactCompleted;
      scheduleConversationPersist();
    }
  } catch (error) {
    state.initError = toUserFacingRuntimeError(error);
  } finally {
    render();
  }
}

async function startNewChat(): Promise<void> {
  flushStreamingAssistantDeltas();
  await persistConversationBatch.flush();
  const activeProfileId = ensureComposerProfileSelection();
  const result = await sendRuntimeMessage<{ conversation: SavedConversation | null }>({
    type: "conversation.new",
    profileId: activeProfileId,
    model: state.selectedModel,
  });
  hydrateConversation(result.conversation);
  state.messages = [];
  state.chatMessageWindowSize = DEFAULT_CHAT_MESSAGE_WINDOW_SIZE;
  pendingChatScrollToBottom = false;
  pendingChatScrollAnchor = null;
  state.attachments = new Set();
  state.fileAttachments = [];
  state.selectedTabIds = [];
  state.historyQuery = "";
  state.currentReadStrategy = "auto";
  state.structuredInputs = [];
  state.activeTurn = null;
  state.activeView = "chat";
  state.latestPlan = null;
  state.latestDiff = null;
  state.latestReroute = null;
  state.pendingProfileQuestion = null;
  profileQuestionStreamBuffers.clear();
  profileQuestionCardRenderRequested = false;
  completedTurnIds.clear();
  render();
}

function scheduleConversationPersist(): void {
  void persistConversationBatch.schedule();
}

function flushConversationPersist(): void {
  conversationPersistFlushQueue = conversationPersistFlushQueue
    .catch(() => undefined)
    .then(() => persistConversationBatch.flush())
    .catch((error) => {
      console.warn("Failed to flush conversation persistence.", error);
    });
  void conversationPersistFlushQueue;
}

async function persistConversation(): Promise<void> {
  const activeProfileId = ensureComposerProfileSelection();
  let conversationIdForSave = state.currentConversationId;
  const messages = serializeConversationMessagesForStorage(state.messages);
  if (!shouldPersistConversationMessagesForStorage(state.messages)) {
    if (conversationIdForSave) {
      state.recentChats = state.recentChats.filter((item) => item.id !== conversationIdForSave);
    }
    return;
  }
  if (!conversationIdForSave) {
    const created = await sendRuntimeMessage<{ conversation: SavedConversation }>({
      type: "conversation.new",
      profileId: activeProfileId,
      model: state.selectedModel,
    });
    conversationIdForSave = created.conversation.id;
    if (!state.currentConversationId) {
      state.currentConversationId = conversationIdForSave;
    }
  }

  const result = await sendRuntimeMessage<{ conversation: SavedConversation }>({
    type: "conversation.save",
    conversation: {
      id: conversationIdForSave,
      title: "",
      profileId: activeProfileId,
      model: state.selectedModel || undefined,
      threadId: state.threadId || undefined,
      messages,
      attachments: [],
      structuredInputs: [],
      selectedTabIds: [],
      historyQuery: "",
      readStrategyOverride: "auto",
      updatedAt: Date.now(),
    },
  });
  if (
    shouldApplyConversationSaveResultToActiveChat({
      saveStartedConversationId: conversationIdForSave,
      currentConversationId: state.currentConversationId,
      savedConversationId: result.conversation.id,
    })
  ) {
    state.currentConversationId = result.conversation.id;
  }
  state.recentChats = upsertRecentChat(state.recentChats, {
    id: result.conversation.id,
    title: result.conversation.title,
    profileId: result.conversation.profileId,
    updatedAt: result.conversation.updatedAt,
  });
}

function upsertRecentChat(conversations: ConversationSummary[], summary: ConversationSummary): ConversationSummary[] {
  return [summary, ...conversations.filter((item) => item.id !== summary.id)]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 12);
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat(state.uiLocale || getBrowserUiLanguage(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function sendRuntimeMessageWithConfirmation<TResult>(
  message: Record<string, unknown>,
): Promise<TResult | { cancelled: true }> {
  const permissionsGranted = await ensureMessagePermissions(message);
  if (!permissionsGranted) {
    return { cancelled: true };
  }

  let nextMessage: Record<string, unknown> = { ...message };
  let response = (await sendRuntimeMessage(nextMessage)) as Record<string, unknown>;

  for (let retryCount = 0; retryCount < 3; retryCount += 1) {
    if (response?.requiresConfirmation && typeof response.confirmationOperation === "string") {
      const approved = await requestNativeConfirmation(
        getHarnessConfirmationPrompt(response.confirmationOperation, response.error),
      );
      if (!approved) {
        return { cancelled: true };
      }

      if (nextMessage.payload && typeof nextMessage.payload === "object") {
        const payload = nextMessage.payload as PromptRequestPayload & {
          confirmedOperations?: string[];
        };
        const confirmedOperations = new Set(payload.confirmedOperations ?? []);
        confirmedOperations.add(String(response.confirmationOperation));
        nextMessage = {
          ...nextMessage,
          payload: {
            ...payload,
            confirmedOperations: Array.from(confirmedOperations),
          },
        };
      } else {
        nextMessage = {
          ...nextMessage,
          confirmed: true,
        };
      }

      response = (await sendRuntimeMessage(nextMessage)) as Record<string, unknown>;
      continue;
    }

    const permissionPlan = getPermissionRequestForRuntimeResponse(response);
    if (permissionPlan) {
      state.actionStatus = shouldShowPermissionStatusBanner(permissionPlan)
        ? toUserFacingPermissionRationale(permissionPlan.rationale)
        : "";
      render();
      const granted = await requestPermissionPlan(permissionPlan, { showPendingPromptOnFailure: true });
      if (!granted) {
        const rationale = toUserFacingPermissionRationale(permissionPlan.rationale);
        state.initError = rationale;
        return { cancelled: true };
      }
      response = (await sendRuntimeMessage(nextMessage, { retries: 0 })) as Record<string, unknown>;
      continue;
    }

    if (openRequiredAppConnectionDialog(response)) {
      return { cancelled: true };
    }

    break;
  }

  if (response?.error && !("threadId" in response) && !("items" in response) && !("tabs" in response) && !("ok" in response)) {
    throw new Error(String(response.error));
  }

  return response as TResult;
}

function openRequiredAppConnectionDialog(response: Record<string, unknown>): boolean {
  const appConnection = response.appConnection;
  if (!appConnection || typeof appConnection !== "object") {
    return false;
  }

  const connection = appConnection as { kind?: unknown; id?: unknown };
  if (connection.kind === "plugin" && typeof connection.id === "string") {
    const plugin = state.appServerPlugins.find((item) => item.id === connection.id);
    if (!plugin) {
      return false;
    }
    openPluginConnectionDialog(plugin);
    return true;
  }

  return false;
}

function getHarnessConfirmationPrompt(operation: string, fallback: unknown): string {
  const strings = getUiStrings(state.uiLocale);
  switch (operation) {
    case "context.history.read":
      return strings.permissions.history;
    case "context.tabs.read":
      return strings.permissions.openTabs;
    case "page.navigate":
    case "page.dom.perform":
    case "page.image.overlay":
      return strings.permissions.currentPageAction;
    case "voice.session.start":
      return strings.prompts.voiceSessionStart;
    case "image.edit":
      return strings.prompts.imageEditTask;
    default:
      return String(fallback ?? strings.prompts.allowAction);
  }
}

async function sendRuntimeMessage<TResult = unknown>(
  message: Record<string, unknown>,
  options: {
    retries?: number;
  } = {},
): Promise<TResult> {
  const retries = options.retries ?? 1;
  let attempt = 0;

  while (true) {
    try {
      return (await chrome.runtime.sendMessage(message)) as TResult;
    } catch (error) {
      if (attempt < retries && isRetryableRuntimeMessageError(error)) {
        attempt += 1;
        await delay(120);
        continue;
      }
      throw new Error(toUserFacingRuntimeError(error));
    }
  }
}

function toUserFacingRuntimeError(error: unknown, fallback?: string): string {
  const strings = getUiStrings(state.uiLocale);
  switch (classifyRuntimeMessageError(error)) {
    case "transient-disconnect":
      return strings.errors.runtimeDisconnected;
    case "host-access":
      return strings.errors.pageAccess;
    default: {
      const message = toErrorMessage(error).trim();
      return message || fallback || strings.errors.init;
    }
  }
}

function toUserFacingVoiceStartError(error: unknown): string {
  const strings = getUiStrings(state.uiLocale);
  switch (classifyMicrophonePermissionError(error)) {
    case "dismissed":
      return strings.errors.voicePermissionDismissed;
    case "denied":
      return strings.errors.voicePermissionDenied;
    case "unavailable":
      return strings.errors.voiceMicrophoneUnavailable;
    default:
      return toUserFacingRuntimeError(error, strings.errors.voiceUpdate);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isCancelledResult(value: unknown): value is { cancelled: true } {
  return Boolean(value && typeof value === "object" && "cancelled" in value && value.cancelled === true);
}

function isAttachmentUnavailableOnThisPage(
  attachment: PromptRequestPayload["attachments"][number],
): boolean {
  return !state.currentPageSupport.available && isCurrentPageAttachment(attachment);
}

function sanitizeUnavailableCurrentPageState(): void {
  const nextAttachments = sanitizeUnavailableCurrentPageAttachments(
    Array.from(state.attachments),
    state.currentPageSupport,
  );
  state.attachments = new Set(nextAttachments);
}

async function ensureMessagePermissions(message: Record<string, unknown>): Promise<boolean> {
  const activeTabUrl = await getActiveTabUrl();
  const plan = getPermissionRequestForMessage(message, activeTabUrl);
  if (!plan) {
    return true;
  }

  if (plan.blockedReason) {
    state.initError = plan.blockedReason;
    state.actionStatus = "";
    render();
    return false;
  }

  const request: chrome.permissions.Permissions = {
    ...(plan.permissions?.length ? { permissions: plan.permissions } : {}),
    ...(plan.origins?.length ? { origins: plan.origins } : {}),
  };
  state.actionStatus = shouldShowPermissionStatusBanner(plan)
    ? toUserFacingPermissionRationale(plan.rationale)
    : "";
  render();
  const granted = await requestPermissionPlan({ ...plan, ...request }, { showPendingPromptOnFailure: true });
  if (!granted) {
    const rationale = toUserFacingPermissionRationale(plan.rationale);
    state.initError = rationale;
  }
  return granted;
}

async function requestPermissionPlan(
  plan: {
    permissions?: chrome.runtime.ManifestPermission[];
    origins?: string[];
    rationale: string;
  },
  options: { showPendingPromptOnFailure?: boolean } = {},
): Promise<boolean> {
  const request: chrome.permissions.Permissions = {
    ...(plan.permissions?.length ? { permissions: plan.permissions } : {}),
    ...(plan.origins?.length ? { origins: plan.origins } : {}),
  };
  const alreadyGranted = await chrome.permissions.contains(request);
  if (alreadyGranted) {
    state.pendingPermission = null;
    return true;
  }
  const result = await requestOptionalPermissionsWithResult(request);
  if (result.granted) {
    state.pendingPermission = null;
    return true;
  }
  if (options.showPendingPromptOnFailure) {
    const retryMessage = state.pendingPermission?.retryMessage;
    state.pendingPermission = {
      plan,
      errorMessage: result.errorMessage,
      ...(retryMessage ? { retryMessage } : {}),
    };
    state.actionStatus = "";
    render();
  }
  return false;
}

async function getActiveTabUrl(): Promise<string | undefined> {
  const query = targetWindowId
    ? { active: true, windowId: targetWindowId }
    : { active: true, currentWindow: true };
  const [tab] = await chrome.tabs.query(query);
  return tab?.url;
}

function toUserFacingPermissionRationale(rationale: string): string {
  const strings = getUiStrings(state.uiLocale);
  const localized = new Map<string, string>([
    [UI_STRINGS.en.permissions.currentSite, strings.permissions.currentSite],
    [UI_STRINGS.en.permissions.currentSiteAndTabs, strings.permissions.currentSiteAndTabs],
    [UI_STRINGS.en.permissions.openTabs, strings.permissions.openTabs],
    [UI_STRINGS.en.permissions.history, strings.permissions.history],
    [UI_STRINGS.en.permissions.currentPageAction, strings.permissions.currentPageAction],
    [UI_STRINGS.en.permissions.siteCapture, strings.permissions.siteCapture],
    [UI_STRINGS.en.permissions.siteRead, strings.permissions.siteRead],
  ]).get(rationale);
  return localized || rationale || strings.permissions.generic;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
