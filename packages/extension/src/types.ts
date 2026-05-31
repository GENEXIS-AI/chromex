import type {
  ActionCard,
  BrowserActionPermissionMode,
  CodexActiveTurn,
  CodexAppOption,
  CodexMcpServerOption,
  CodexModelOption,
  CodexModelReroute,
  CodexPluginOption,
  CodexRateLimits,
  CodexSkillOption,
  CodexStructuredInput,
  CodexThreadSummary,
  CodexTurnDiff,
  CodexTurnPlan,
  HarnessPermissionOperation,
  ImageAssetFolderSnapshot,
  OpenTabContext,
  PageContextEnvelope,
  PlaywrightRuntimeCapability,
  ProfileTemplate,
  ReadStrategy,
  UserFileAttachment,
  WorkspaceHarnessSnapshot,
} from "@codex-sidepanel/shared";

import type { SkillOption } from "./sidepanel/skills.js";
import type { UiLanguageSetting } from "./ui-language.js";
import type { UiThemeSetting } from "./ui-theme.js";
import type { VoiceNavigationCommand } from "./sidepanel/voice-commands.js";

export interface ContentProbeResult {
  rawCapture: {
    metadata: {
      url: string;
      title: string;
      domain: string;
    };
    selectedText: string;
    bodyText: string;
    images: Array<{
      url: string;
      alt?: string;
      width?: number;
      height?: number;
      naturalWidth?: number;
      naturalHeight?: number;
      renderedWidth?: number;
      renderedHeight?: number;
      visibleArea?: number;
      distanceFromViewportCenter?: number;
      viewportRect?: {
        left: number;
        top: number;
        width: number;
        height: number;
      };
      viewportWidth?: number;
      viewportHeight?: number;
      devicePixelRatio?: number;
    }>;
    adapterPayload: Record<string, unknown> | null;
    privacyFlags: {
      containsSensitiveFormData: boolean;
      userConsentedToHistory: boolean;
    };
  };
  features: {
    textLength: number;
    imageCount: number;
    hasCanvas: boolean;
    hasVideo: boolean;
    hasDenseInteractiveUi: boolean;
  };
  adapterActions: string[];
}

export interface UiInitPayload {
  accountStatus: {
    authMode: "chatgpt" | "apikey" | null;
    codexAuthenticated: boolean;
    multimodalAvailable: boolean;
    openAiApiKeyConfigured: boolean;
    email?: string | null;
    planType?: string | null;
  };
  currentPageSupport: {
    available: boolean;
    blockedReason: string;
  };
  currentTab: OpenTabContext | null;
  models: CodexModelOption[];
  profiles: ProfileTemplate[];
  selectedProfileId: string;
  selectedModel: string;
  selectedReasoningEffort: string;
  selectedServiceTier: string;
  modelCatalogState: "loading" | "ready" | "empty" | "error";
  modelCatalogErrorMessage: string;
  currentContext: {
    envelope: PageContextEnvelope;
    readStrategy: ReadStrategy;
  } | null;
  actionCards: ActionCard[];
  settings: ExtensionSettings;
  runtimeConfig: RuntimeConfigSnapshot;
  playwrightRuntime: PlaywrightRuntimeCapability;
  skills: SkillOption[];
  appServerSkills: CodexSkillOption[];
  connectedApps: CodexAppOption[];
  appServerPlugins: CodexPluginOption[];
  mcpServers: CodexMcpServerOption[];
  recentChats: ConversationSummary[];
  serverThreads: CodexThreadSummary[];
  currentConversation: SavedConversation | null;
  rateLimits: CodexRateLimits | null;
  activeTurn: CodexActiveTurn | null;
  latestPlan: CodexTurnPlan | null;
  latestDiff: CodexTurnDiff | null;
  latestReroute: CodexModelReroute | null;
  workspaceHarness: WorkspaceHarnessSnapshot;
  imageAssetFolder: ImageAssetFolderSnapshot;
  diagnosticLogFolder: {
    rootDir: string;
    latestLogPath: string;
    files: string[];
  };
}

export interface UiSettingsSnapshotPayload {
  settings: ExtensionSettings;
  profiles: ProfileTemplate[];
  selectedProfileId: string;
  selectedModel: string;
  selectedReasoningEffort: string;
  selectedServiceTier: string;
}

export interface RuntimeConfigSnapshot {
  workspaceRoot: string;
  codexBinPath: string;
  resolvedCodexBinPath: string;
  codexBinSource: "configured" | "env" | "path" | "common" | "missing";
  configuredCodexBinPathInvalid: boolean;
}

export interface PromptRequestPayload {
  conversationId?: string;
  message: string;
  contextHint?: string;
  conversationContext?: string;
  profileId: string;
  clientRequestId?: string;
  model?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  readStrategyOverride?: ReadStrategy | "auto";
  selectedTabIds?: number[];
  historyQuery?: string;
  attachments: Array<"current-page" | "open-tabs" | "history" | "selection" | "image">;
  selectedTextContext?: SelectedPageTextContext;
  fileAttachments?: UserFileAttachment[];
  structuredInputs?: CodexStructuredInput[];
  confirmedOperations?: HarnessPermissionOperation[];
  resetThread?: boolean;
  suppressPageContext?: boolean;
  conversationMessageCount?: number;
  planMode?: boolean;
  useGoal?: boolean;
  goalObjective?: string;
}

export interface SelectedPageTextContext {
  text: string;
  contextText?: string;
  url: string;
  title: string;
  domain: string;
  tabId?: number;
  favIconUrl?: string;
}

export interface PromptResponsePayload {
  threadId: string;
  turnId: string;
  actionCards: ActionCard[];
}

export interface TabListPayload {
  tabs: OpenTabContext[];
}

export type VoiceInputAudioSource = "microphone" | "computer";

export interface ExtensionSettings {
  uiLanguage: UiLanguageSetting;
  uiTheme: UiThemeSetting;
  usageNoticeAccepted: boolean;
  shareCurrentTabByDefault: boolean;
  rememberChats: boolean;
  liveCaptions: boolean;
  allowVoiceNavigation: boolean;
  allowBrowserActions: boolean;
  browserActionPermissionMode: BrowserActionPermissionMode;
  imagePromptHoverButtonEnabled: boolean;
  planModeEnabled: boolean;
  playwrightBrowserControlEnabled: boolean;
  preferredVoice: string;
  voiceInputAudioSource: VoiceInputAudioSource;
  workspaceRoot: string;
  codexBinPath: string;
  enabledCodexSkillIds: string[];
  autoCompactConversations: boolean;
  customSiteSuggestions: CustomSiteSuggestion[];
}

export interface CustomSiteSuggestion {
  id: string;
  siteKey: string;
  siteLabel: string;
  command: string;
  prompt: string;
  createdAt: number;
}

export interface ConversationMessageImage {
  src: string;
  alt: string;
  assetRef?: string;
  status?: "loading" | "ready" | "error" | "deleted";
}

export interface ConversationMessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: UserFileAttachment["kind"];
  sizeBytes: number;
  previewSrc?: string;
  sourceUrl?: string;
  role?: "target" | "reference";
}

export interface ConversationMessageProfile {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

export interface ConversationMessageStructuredInput {
  id: string;
  type: "mention" | "skill";
  name: string;
  path: string;
  description?: string;
  iconUrl?: string;
}

export interface ConversationMessageTraceItem {
  id: string;
  kind: "reasoning" | "web" | "file" | "command" | "tool" | "browser" | "image" | "response";
  title: string;
  detail: string;
  status: "running" | "completed";
  timestampMs: number;
}

export interface ConversationMessageContext {
  platform?: string;
  url?: string;
  title?: string;
  domain?: string;
  favIconUrl?: string;
  tabId?: number;
  source?: "selection";
  selectionText?: string;
  contextText?: string;
}

export interface ConversationMessagePlan extends CodexTurnPlan {
  accepted?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  steer?: boolean;
  notice?: {
    type: "context-compaction";
    state: "running" | "completed";
    automatic: boolean;
  };
  delivery?: "text" | "voice";
  voice?: {
    startedAt: number;
    durationMs?: number;
  };
  images?: ConversationMessageImage[];
  attachments?: ConversationMessageAttachment[];
  structuredInputs?: ConversationMessageStructuredInput[];
  profile?: ConversationMessageProfile;
  trace?: ConversationMessageTraceItem[];
  context?: ConversationMessageContext;
  plan?: ConversationMessagePlan;
}

export interface ConferenceTranscriptSnapshotEntry {
  id: string;
  sourceText: string;
  translationText: string;
  createdAt: number;
}

export interface ConversationConferenceModeSnapshot {
  sourceLabel?: string;
  entries: ConferenceTranscriptSnapshotEntry[];
  partialSourceText?: string;
  partialTranslationText?: string;
  targetLanguage?: string;
  livePlaybackEnabled?: boolean;
  updatedAt?: number;
}

export interface SavedConversation {
  id: string;
  title: string;
  profileId: string;
  model?: string;
  threadId?: string;
  conversationMode?: "chat" | "conference";
  conferenceMode?: ConversationConferenceModeSnapshot;
  messages: ConversationMessage[];
  attachments: PromptRequestPayload["attachments"];
  structuredInputs: CodexStructuredInput[];
  selectedTabIds: number[];
  historyQuery: string;
  readStrategyOverride: ReadStrategy | "auto";
  updatedAt: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  profileId: string;
  conversationMode?: "chat" | "conference";
  updatedAt: number;
}

export interface PageNavigationPayload {
  command: VoiceNavigationCommand;
}
