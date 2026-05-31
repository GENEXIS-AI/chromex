export type ReadStrategy = "dom" | "vision" | "hybrid" | "adapter";

export type ContextSource =
  | "current-page"
  | "open-tabs"
  | "history"
  | "selection"
  | "image"
  | "file";

export interface PageMetadata {
  url: string;
  title: string;
  domain: string;
}

export interface VisionAsset {
  ref: string;
  kind: "screenshot" | "page-image";
  originUrl?: string;
  width?: number;
  height?: number;
}

export interface PrivacyFlags {
  containsSensitiveFormData: boolean;
  userConsentedToHistory: boolean;
}

export interface PageContextEnvelope {
  metadata: PageMetadata;
  selectionText: string;
  domSummary: string;
  visionAssets: VisionAsset[];
  adapterPayload: Record<string, unknown> | null;
  privacyFlags: PrivacyFlags;
}

export interface RawPageCapture {
  metadata: PageMetadata;
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
  screenshotRef?: string;
  adapterPayload: Record<string, unknown> | null;
  privacyFlags: PrivacyFlags;
}

export interface ReadStrategyInput {
  url: string;
  textLength: number;
  imageCount: number;
  hasCanvas: boolean;
  hasVideo: boolean;
  hasDenseInteractiveUi: boolean;
  adapterMatched: boolean;
}

export interface OpenTabContext {
  tabId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  pinned: boolean;
  audible: boolean;
}

export interface HistoryContext {
  query: string;
  items: Array<{
    title: string;
    url: string;
    lastVisitTime?: number;
    visitCount?: number;
  }>;
}

export interface ImageContext {
  source: "clicked-image" | "page-image" | "screenshot-crop";
  originUrl?: string;
  blobRef: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface ImageAssetFolderSnapshot {
  rootDir: string;
  latestFolder: string;
  folders: string[];
  assetCount: number;
  latestAssetPath?: string;
}

export type UserFileAttachmentKind = "image" | "audio" | "text" | "pdf" | "docx" | "spreadsheet" | "binary";

export interface UserFileAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  base64: string;
  kind: UserFileAttachmentKind;
  sourceUrl?: string;
}

export interface VoiceSessionState {
  status: "idle" | "connecting" | "active" | "error";
  threadId?: string;
  sessionId?: string;
  transport?: "webrtc" | "websocket" | "browser-speech";
  outputModality?: "audio" | "text";
  realtimeAvailable?: boolean;
  error?: string;
  errorCode?: "requires-api-key" | string;
}

export interface CodexModelOption {
  id: string;
  label: string;
  description: string;
  isDefault: boolean;
  supportsImages: boolean;
  reasoningEfforts: string[];
  reasoningEffortOptions?: Array<{
    effort: string;
    description: string;
  }>;
  defaultReasoningEffort?: string;
  additionalSpeedTiers?: string[];
  supportsParallelToolCalls?: boolean;
  supportsSearchTool?: boolean;
}

export interface CodexRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface CodexRateLimitBucket {
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
}

export interface CodexRateLimits {
  defaultBucket: CodexRateLimitBucket | null;
  buckets: CodexRateLimitBucket[];
}

export interface CodexSkillOption {
  id: string;
  name: string;
  description: string;
  path: string;
  scope: "user" | "repo" | "system" | "admin";
  cwd: string;
  token: string;
}

export interface SkillArchiveInstallParams {
  filename: string;
  base64: string;
}

export interface SkillArchiveInstallResult {
  rootDir: string;
  skills: CodexSkillOption[];
}

export interface CodexAppOption {
  id: string;
  name: string;
  description: string;
  path: string;
  token: string;
  isAccessible: boolean;
  isEnabled: boolean;
  installUrl?: string;
  iconUrl?: string;
}

export interface CodexPluginOption {
  id: string;
  name: string;
  description: string;
  marketplaceName: string;
  path: string;
  token: string;
  installed: boolean;
  enabled: boolean;
  iconUrl?: string;
  capabilities: string[];
}

export type CodexMcpAuthStatus = "unsupported" | "notLoggedIn" | "bearerToken" | "oauth" | string;

export interface CodexMcpToolOption {
  name: string;
  description: string;
  inputSchema: Record<string, unknown> | null;
}

export interface CodexMcpServerOption {
  id: string;
  name: string;
  description: string;
  path: string;
  token: string;
  authStatus: CodexMcpAuthStatus;
  isAuthenticated: boolean;
  toolCount: number;
  tools: CodexMcpToolOption[];
  resourceCount: number;
  resourceTemplateCount: number;
}

export type CodexStructuredInput =
  | {
      id: string;
      type: "skill";
      name: string;
      path: string;
      description?: string;
      token: string;
    }
  | {
      id: string;
      type: "mention";
      name: string;
      path: string;
      description?: string;
      token: string;
      iconUrl?: string;
    };

export interface CodexThreadSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  status: string;
  cwd: string;
  source: string;
}

export interface CodexThreadMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface CodexThreadTranscript {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  status: string;
  cwd: string;
  messages: CodexThreadMessage[];
}

export interface CodexTurnSummary {
  id: string;
  status: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
}

export interface CodexActiveTurn {
  threadId: string;
  turnId: string;
}

export interface CodexPlanStep {
  step: string;
  status: string;
}

export interface CodexTurnPlan {
  threadId: string;
  turnId: string;
  explanation: string | null;
  steps: CodexPlanStep[];
}

export interface CodexTurnDiff {
  threadId: string;
  turnId: string;
  diff: string;
}

export interface CodexModelReroute {
  threadId: string;
  turnId: string;
  fromModel: string;
  toModel: string;
  reason: string;
}

export interface DefaultContextPolicy {
  attachCurrentPageByDefault: boolean;
  allowedReadStrategies: ReadStrategy[];
}

export interface ProfileTemplate {
  id: string;
  name: string;
  systemPrompt: string;
  defaultContextPolicy: DefaultContextPolicy;
  allowedSources: ContextSource[];
  preferredActions: string[];
  adapterHints: string[];
  visual?: {
    color?: string;
    icon?: string;
    imageDataUrl?: string;
  };
  suggestedPrompts?: string[];
}

export interface ActionCard {
  id: string;
  title: string;
  description: string;
  kind: "workflow" | "prompt";
  prompt?: string;
}

export interface SiteAdapterResult {
  adapterId: string;
  context: Record<string, unknown>;
  actions: string[];
}

export interface ActionCardInput {
  readStrategy: ReadStrategy;
  adapterActions: string[];
  availableSources: ContextSource[];
  adapterPayload?: Record<string, unknown> | null;
  locale?: string;
}

export interface PromptEnvelope {
  profile: ProfileTemplate;
  message: string;
  contexts: PageContextEnvelope[];
}

export type PromptRoutingTask =
  | "general"
  | "document-analysis"
  | "visual-analysis"
  | "image-generate"
  | "image-edit"
  | "comparison";

export type PromptRoutingContextMode = "none" | "page-only" | "files-only" | "page-plus-files";

export type AgenticIntentAction =
  | "answer"
  | "summarize"
  | "compare"
  | "generate-image"
  | "edit-image"
  | "extract"
  | "navigate"
  | "clarify";

export type AgenticIntentTarget =
  | "conversation"
  | "current-page"
  | "visible-image"
  | "uploaded-file"
  | "selected-tabs"
  | "browser-history"
  | "none";

export interface AgenticIntentPlan {
  summary: string;
  action: AgenticIntentAction;
  target: AgenticIntentTarget;
  constraints: string[];
  needsClarification: boolean;
  clarificationQuestion?: string;
}

export interface PromptRoutingPlan {
  task: PromptRoutingTask;
  contextMode: PromptRoutingContextMode;
  requiresVision: boolean;
  pageReadStrategy: ReadStrategy | "auto";
  intent?: AgenticIntentPlan;
  browserControl?: AgenticBrowserControlRouting;
  selectedProfileId: string;
  selectedModel: string;
  notes: string[];
  reroutedProfile: boolean;
  reroutedModel: boolean;
}

export type AgenticRoutePlanSource = "llm" | "fallback";

export type AgenticRouteContextSource = "current-page" | "open-tabs" | "history" | "selection" | "image";

export interface AgenticContextRequest {
  source: AgenticRouteContextSource;
  readStrategy: ReadStrategy | "auto";
  required: boolean;
  reason: string;
}

export interface AgenticImageEditRouting {
  shouldEdit: boolean;
  target: "none" | "page-image" | "uploaded-image" | "ambiguous";
  targetFileId?: string;
  prompt?: string;
  reason: string;
}

export type BrowserAutomationMode = "dom" | "playwright" | "computer-use";

export type BrowserControlSurface = "active-tab" | "new-tab";

export type AgenticBrowserControlPrecondition =
  | "external-research"
  | "content-generation"
  | "context-collection"
  | "user-confirmation";

export interface PlaywrightRuntimeCapability {
  available: boolean;
  packageName: "playwright" | "playwright-core" | null;
  packageVersion: string;
  browserInstalled: boolean;
  browserExecutablePath: string;
  installable: boolean;
  installCommand: string;
  message: string;
}

export interface RuntimeCapabilitySnapshot {
  playwright: PlaywrightRuntimeCapability;
}

export interface AgenticBrowserControlRouting {
  shouldControl: boolean;
  mode: BrowserAutomationMode;
  surface: BrowserControlSurface;
  fallbackMode?: BrowserAutomationMode;
  preconditions?: AgenticBrowserControlPrecondition[];
  reason: string;
}

export interface AgenticRoutePlan {
  version: 1;
  source: AgenticRoutePlanSource;
  task: PromptRoutingTask;
  contextMode: PromptRoutingContextMode;
  contextRequests: AgenticContextRequest[];
  structuredInputIds: string[];
  historyQuery: string;
  requiresVision: boolean;
  pageReadStrategy: ReadStrategy | "auto";
  intent: AgenticIntentPlan;
  selectedProfileId: string;
  selectedModel: string;
  imageEdit: AgenticImageEditRouting;
  browserControl: AgenticBrowserControlRouting;
  notes: string[];
  confidence: number;
}

export interface AgenticRouteInput {
  message: string;
  contextHint?: string;
  selectedProfileId: string;
  availableProfileIds?: string[];
  selectedModel: string;
  models: CodexModelOption[];
  readStrategyOverride: ReadStrategy | "auto";
  explicitAttachments: AgenticRouteContextSource[];
  fileAttachments: UserFileAttachment[];
  selectedTabIds?: number[];
  historyQuery?: string;
  locale?: string;
  availableStructuredInputs?: CodexStructuredInput[];
  activeTab?: {
    title?: string;
    url?: string;
    restricted?: boolean;
  };
  browserAutomationCapabilities?: Partial<Record<BrowserAutomationMode, boolean>>;
}

export type BrowserDomActionKind = "click" | "fill" | "select" | "scroll" | "focus" | "submit" | "navigate";

export interface BrowserDomElementSnapshot {
  ref: string;
  role: string;
  tagName: string;
  label: string;
  text: string;
  selector: string;
  value?: string;
  href?: string;
  inputType?: string;
  placeholder?: string;
  contentEditable?: string;
  ariaExpanded?: string;
  ariaHasPopup?: string;
  ariaControls?: string;
  tabIndex?: number;
  isTextEntryCandidate?: boolean;
  opensEditableSurface?: boolean;
  disabled: boolean;
  viewportRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface BrowserDomSnapshot {
  metadata: PageMetadata;
  elements: BrowserDomElementSnapshot[];
  capabilities?: {
    supportsDomAutomation: boolean;
    supportsVisualControlIndicator: boolean;
    preferredAutomationMode: BrowserAutomationMode;
  };
}

export interface BrowserDomActionStep {
  action: BrowserDomActionKind;
  targetRef?: string;
  selector?: string;
  label?: string;
  value?: string;
  url?: string;
  direction?: "up" | "down" | "left" | "right" | "top" | "bottom";
  amountPx?: number;
  reason: string;
}

export interface BrowserDomActionPlan {
  shouldAct: boolean;
  summary: string;
  steps: BrowserDomActionStep[];
  requiresConfirmation: boolean;
  confidence: number;
}

export interface BrowserDomActionStepResult {
  step: BrowserDomActionStep;
  ok: boolean;
  message: string;
}

export interface BrowserDomActionResult {
  ok: boolean;
  summary: string;
  results: BrowserDomActionStepResult[];
  controlMode?: BrowserAutomationMode;
  cancelled?: boolean;
}
