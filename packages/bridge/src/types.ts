import type {
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
  CodexThreadTranscript,
  CodexTurnDiff,
  CodexTurnPlan,
  CodexTurnSummary,
  AgenticRouteInput,
  AgenticRoutePlan,
  BrowserDomActionPlan,
  BrowserDomSnapshot,
  ImageAssetFolderSnapshot,
  PageContextEnvelope,
  ProfileTemplate,
  PromptRoutingPlan,
  PlaywrightRuntimeCapability,
  SkillArchiveInstallParams,
  SkillArchiveInstallResult,
  UserFileAttachment,
  VoiceSessionState,
  WorkspaceHarnessSnapshot,
} from "@codex-sidepanel/shared";
import type { BridgeDiagnostics } from "./diagnostics.js";

export interface BridgeRequest<TParams = unknown> {
  id: string;
  method: string;
  params: TParams;
}

export interface BridgeResponse<TResult = unknown> {
  id: string;
  result?: TResult;
  error?: {
    message: string;
  };
}

export type BridgeEvent =
  | { type: "message.delta"; itemId: string; delta: string; threadId?: string; turnId?: string }
  | { type: "message.completed"; itemId: string; text: string; threadId?: string; turnId?: string }
  | {
      type: "message.image";
      itemId: string;
      previewRef: string;
      alt: string;
      threadId?: string;
      turnId?: string;
      clientRequestId?: string;
      workflow?: "infographic" | "slide-images" | "generated-image";
      imageIndex?: number;
    }
  | { type: "prompt.retrying"; clientRequestId: string | null; attempt: number; maxAttempts: number; reason: string }
  | {
      type: "turn.activity";
      threadId: string;
      turnId: string;
      itemId: string;
      kind: "reasoning" | "web" | "file" | "command" | "tool" | "browser" | "image" | "response";
      title: string;
      detail: string;
      status: "running" | "completed";
      timestampMs: number;
    }
  | { type: "turn.started"; activeTurn: CodexActiveTurn }
  | { type: "turn.completed"; threadId: string; turnId: string }
  | { type: "turn.failed"; threadId: string; turnId: string; message: string; clientRequestId?: string | null }
  | { type: "goal.updated"; threadId: string; goal: ThreadGoal }
  | { type: "goal.cleared"; threadId: string }
  | {
      type: "plan.user_input.requested";
      requestId: string;
      threadId: string;
      turnId: string;
      itemId: string;
      questions: PlanUserInputQuestion[];
    }
  | { type: "plan.user_input.resolved"; requestId: string; threadId: string }
  | { type: "context.compaction.started"; threadId: string; turnId: string; itemId: string }
  | { type: "context.compaction.completed"; threadId: string; turnId: string; itemId: string }
  | { type: "turn.plan.updated"; plan: CodexTurnPlan }
  | { type: "turn.diff.updated"; diff: CodexTurnDiff }
  | { type: "account.login.completed"; loginId: string | null; success: boolean; error: string | null }
  | { type: "account.updated"; authMode: "chatgpt" | "apikey" | null; planType: string | null }
  | { type: "account.rate_limits.updated"; rateLimits: CodexRateLimits | null }
  | { type: "model.rerouted"; reroute: CodexModelReroute }
  | { type: "catalog.updated"; kind: "skills" | "apps" | "mcp" }
  | { type: "mcp.oauth.login.completed"; serverName: string; success: boolean; error: string | null }
  | { type: "route.started"; clientRequestId: string | null }
  | { type: "route.plan.created"; plan: AgenticRoutePlan }
  | { type: "browser.action.plan.started"; clientRequestId: string | null }
  | { type: "browser.action.plan.created"; plan: BrowserDomActionPlan }
  | {
      type: "voice.session.started";
      threadId: string;
      sessionId: string | null;
      transport: "webrtc" | "websocket";
    }
  | { type: "voice.session.stopped"; threadId: string; sessionId: string | null; reason: string | null }
  | { type: "voice.sdp"; threadId: string; sdp: string }
  | { type: "voice.transcript.delta"; threadId: string; role: string; delta: string }
  | { type: "voice.transcript.done"; threadId: string; role: string; text: string }
  | { type: "voice.item_added"; threadId: string; item: Record<string, unknown> }
  | { type: "voice.output_audio.delta"; threadId: string; audio: Record<string, unknown> }
  | { type: "voice.error"; threadId: string; sessionId: string | null; message: string; errorCode?: string };

export interface BridgeRuntimeConfig {
  workspaceRoot: string;
  codexBinPath: string;
  resolvedCodexBinPath: string;
  codexBinSource: "configured" | "env" | "path" | "common" | "missing";
  configuredCodexBinPathInvalid: boolean;
}

export interface AccountStatus {
  authMode: "chatgpt" | "apikey" | null;
  codexAuthenticated: boolean;
  multimodalAvailable: boolean;
  openAiApiKeyConfigured: boolean;
  email?: string | null;
  planType?: string | null;
}

export interface LoginParams {
  type: "chatgpt" | "chatgptDeviceCode" | "apiKey";
  apiKey?: string;
}

export interface SessionParams {
  cwd?: string;
  model?: string;
}

export interface PromptSendParams {
  clientRequestId?: string;
  profile: ProfileTemplate;
  message: string;
  conversationContext?: string;
  contexts: PageContextEnvelope[];
  fileAttachments?: UserFileAttachment[];
  routePlan?: PromptRoutingPlan;
  structuredInputs?: CodexStructuredInput[];
  threadId?: string;
  cwd?: string;
  model?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  planMode?: boolean;
  useGoal?: boolean;
  goalObjective?: string;
}

export interface ThreadGoal {
  threadId: string;
  objective: string;
  status: string;
  tokenBudget?: number | null;
  tokensUsed?: number | null;
  timeUsedSeconds?: number | null;
  budgetLimited?: boolean | null;
  createdAt?: number | null;
  updatedAt?: number | null;
}

export interface GoalSetParams {
  threadId: string;
  objective?: string;
  status?: string;
  tokenBudget?: number | null;
  budgetLimited?: boolean | null;
}

export interface GoalSetResult {
  goal: ThreadGoal;
}

export interface GoalGetResult {
  goal: ThreadGoal | null;
}

export interface GoalClearResult {
  cleared: boolean;
}

export interface PlanUserInputOption {
  label: string;
  description: string;
}

export interface PlanUserInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: PlanUserInputOption[];
}

export interface PlanUserInputResponseParams {
  requestId: string;
  answers: Record<string, { answers: string[] }>;
}

export interface ThreadCompactParams {
  threadId?: string;
  waitForCompletion?: boolean;
}

export interface ThreadCompactResult {
  threadId: string;
  status: "started" | "completed";
  turnId?: string;
}

export interface ImageEditParams {
  prompt: string;
  image: {
    base64: string;
    mimeType: string;
    filename?: string;
  };
  referenceImages?: Array<{
    base64: string;
    mimeType: string;
    filename?: string;
  }>;
  size?: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
}

export interface ImageGenerateParams {
  prompt: string;
  contexts?: PageContextEnvelope[];
  fileAttachments?: UserFileAttachment[];
  conversationContext?: string;
  clientRequestId?: string;
  conversationId?: string;
  workflow?: "infographic" | "slide-images" | "generated-image";
  model?: string;
  quality?: "low" | "medium" | "high" | "auto";
  size?: string;
}

export interface ImagePreviewParams {
  jobId: string;
}

export interface ImageAssetReadParams {
  previewRef: string;
  offset?: number | null;
  length?: number | null;
}

export interface ImageAssetReadResult {
  previewRef: string;
  dataBase64: string;
  mimeType: string;
  sizeBytes: number;
  offset: number;
  nextOffset: number;
  done: boolean;
}

export interface ImageAssetDeleteParams {
  previewRef: string;
}

export interface ImageAssetDeleteResult {
  deleted: boolean;
  previewRef: string;
  path: string;
}

export interface VoiceStartParams {
  threadId?: string;
  cwd?: string;
  sdp?: string;
  outputModality?: "audio" | "text";
  prompt?: string;
  sessionId?: string;
  realtimeSessionId?: string;
  voice?: string;
}

export interface VoiceStopParams {
  threadId?: string;
  sessionId?: string;
}

export interface VoiceAppendTextParams {
  threadId?: string;
  text: string;
}

export interface VoiceAppendAudioParams {
  threadId?: string;
  audio: {
    data: string;
    sampleRate: number;
    numChannels: number;
    samplesPerChannel?: number;
    itemId?: string;
  };
}

export interface RealtimeTranslationClientSecretParams {
  targetLanguage?: string;
  sourceTranscriptionModel?: string;
  ttlSeconds?: number;
}

export interface RealtimeTranslationClientSecretResult {
  value: string;
  expiresAt: number | null;
  sessionId: string | null;
  model: "gpt-realtime-translate";
  targetLanguage: string;
}

export interface BridgeCodexPlane {
  accountStatus(): Promise<AccountStatus>;
  login(params: LoginParams): Promise<unknown>;
  cancelLogin(params: { loginId: string }): Promise<void>;
  logout(): Promise<void>;
  listModels(): Promise<CodexModelOption[]>;
  listThreads(params: { cwd?: string; limit?: number; searchTerm?: string }): Promise<CodexThreadSummary[]>;
  readThread(params: { threadId: string }): Promise<CodexThreadTranscript>;
  listTurns(params: { threadId: string; limit?: number }): Promise<CodexTurnSummary[]>;
  listSkills(params: { cwd?: string; forceReload?: boolean; extraUserRoots?: string[] }): Promise<CodexSkillOption[]>;
  listApps(params: { threadId?: string; forceRefetch?: boolean }): Promise<CodexAppOption[]>;
  listPlugins(params: { cwd?: string }): Promise<CodexPluginOption[]>;
  listMcpServers(params?: { cursor?: string; limit?: number; detail?: "full" | "toolsAndAuthOnly" }): Promise<CodexMcpServerOption[]>;
  startMcpOauthLogin(params: { name: string; scopes?: string[]; timeoutSecs?: number }): Promise<{ authorizationUrl: string }>;
  callMcpTool(params: {
    threadId: string;
    server: string;
    tool: string;
    arguments?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
  }): Promise<{ content: unknown[]; structuredContent?: unknown; isError?: boolean; meta?: unknown }>;
  reloadMcpServers(): Promise<{ ok: true }>;
  readRateLimits(): Promise<CodexRateLimits | null>;
  setGoal(params: GoalSetParams): Promise<GoalSetResult>;
  getGoal(params: { threadId: string }): Promise<GoalGetResult>;
  clearGoal(params: { threadId: string }): Promise<GoalClearResult>;
  respondToUserInputRequest(params: PlanUserInputResponseParams): Promise<{ ok: true }>;
  openSession(params: SessionParams): Promise<{ threadId: string }>;
  resumeSession(params: { threadId: string }): Promise<{ threadId: string }>;
  sendPrompt(
    params: PromptSendParams,
    emit: (event: BridgeEvent) => void,
  ): Promise<{ threadId: string; turnId: string }>;
  compactThread(params: ThreadCompactParams): Promise<ThreadCompactResult>;
  steerTurn(params: PromptSendParams & { expectedTurnId: string }): Promise<{ threadId: string; turnId: string }>;
  interruptTurn(params: { threadId: string; turnId: string }): Promise<{ threadId: string; turnId: string }>;
}

export interface BridgeWorkspacePlane {
  readHarness(): Promise<WorkspaceHarnessSnapshot>;
  readConfig(): Promise<BridgeRuntimeConfig>;
  updateConfig(config: Partial<BridgeRuntimeConfig>): Promise<BridgeRuntimeConfig>;
  readPlaywrightRuntime(): Promise<PlaywrightRuntimeCapability>;
  installPlaywrightRuntime(): Promise<PlaywrightRuntimeCapability>;
  listExternalSkills(params?: { cwd?: string }): Promise<CodexSkillOption[]>;
  listExternalSkillRoots(): Promise<string[]>;
  installSkillArchive(params: SkillArchiveInstallParams & { cwd?: string }): Promise<SkillArchiveInstallResult>;
}

export interface BridgeVoicePlane {
  start(params?: VoiceStartParams, emit?: (event: BridgeEvent) => void): Promise<VoiceSessionState>;
  appendText(params: VoiceAppendTextParams): Promise<void>;
  appendAudio(params: VoiceAppendAudioParams): Promise<void>;
  stop(params?: VoiceStopParams): Promise<void>;
}

export interface BridgeImagePlane {
  startEdit(params: ImageEditParams): Promise<{ jobId: string; previewRef: string }>;
  startGenerate(
    params: ImageGenerateParams,
    emit?: (event: BridgeEvent) => void,
  ): Promise<{ jobId: string; previewRef: string; previewRefs: string[] }>;
  previewEdit(params: ImagePreviewParams): Promise<{ previewRef: string }>;
  readAsset(params: ImageAssetReadParams): Promise<ImageAssetReadResult>;
  deleteAsset(params: ImageAssetDeleteParams): Promise<ImageAssetDeleteResult>;
  describeAssetFolder(): Promise<ImageAssetFolderSnapshot>;
  openAssetFolder(params?: { folder?: string | null }): Promise<{ opened: true; folder: string }>;
}

export interface BridgeLocalFilePlane {
  reveal(params: { path: string }): Promise<{ opened: true; path: string; folder: string }>;
}

export interface BridgeRealtimeTranslationPlane {
  saveApiKey(params: { apiKey: string }): Promise<{ stored: true }>;
  clearApiKey(): Promise<{ cleared: true }>;
  createClientSecret(
    params?: RealtimeTranslationClientSecretParams,
  ): Promise<RealtimeTranslationClientSecretResult>;
}

export interface BridgeRoutePlane {
  plan(params: AgenticRouteInput, emit: (event: BridgeEvent) => void): Promise<AgenticRoutePlan>;
}

export interface BridgeBrowserActionPlane {
  plan(
    params: { message: string; snapshot: BrowserDomSnapshot; locale?: string; generatedText?: string },
    emit: (event: BridgeEvent) => void,
  ): Promise<BrowserDomActionPlan>;
}

export interface BridgeDependencies {
  codex: BridgeCodexPlane;
  voice: BridgeVoicePlane;
  translation: BridgeRealtimeTranslationPlane;
  image: BridgeImagePlane;
  localFiles: BridgeLocalFilePlane;
  route: BridgeRoutePlane;
  browserAction: BridgeBrowserActionPlane;
  workspace: BridgeWorkspacePlane;
  diagnostics?: BridgeDiagnostics;
}
