import type {
  CodexAppOption,
  CodexMcpServerOption,
  CodexModelOption,
  CodexPluginOption,
  CodexRateLimitBucket,
  CodexRateLimits,
  CodexSkillOption,
  CodexThreadMessage,
  CodexThreadSummary,
  CodexThreadTranscript,
  CodexTurnSummary,
} from "@codex-sidepanel/shared";
import { extractVisibleUserRequest } from "./prompt.js";

type AppServerModel = {
  id: string;
  model?: string;
  displayName?: string;
  description?: string;
  isDefault?: boolean;
  hidden?: boolean;
  inputModalities?: string[];
  defaultReasoningEffort?: string;
  additionalSpeedTiers?: string[];
  supportsParallelToolCalls?: boolean;
  supports_parallel_tool_calls?: boolean;
  supportsSearchTool?: boolean;
  supports_search_tool?: boolean;
  supportedReasoningEfforts?: Array<
    { value?: string; id?: string; name?: string; reasoningEffort?: string; description?: string } | string
  >;
};

type AppServerThread = {
  id: string;
  name?: string | null;
  preview?: string | null;
  updatedAt?: number | null;
  status?: string | { type?: string | null } | null;
  cwd?: string | null;
  source?: string | null;
  turns?: AppServerTurn[];
};

type AppServerTurn = {
  id: string;
  status?: string | { type?: string | null } | null;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
  items?: AppServerThreadItem[];
};

type AppServerThreadItem =
  | { type: "userMessage"; id: string; content?: AppServerUserInput[] | null }
  | { type: "agentMessage"; id: string; text?: string | null }
  | { type: string; id?: string };

type AppServerUserInput =
  | { type: "text"; text?: string | null }
  | { type: "skill"; name?: string | null }
  | { type: "mention"; name?: string | null; path?: string | null }
  | { type: "image"; url?: string | null }
  | { type: "localImage"; path?: string | null };

type AppServerRateLimitsResponse = {
  rateLimits?: AppServerRateLimitSnapshot | null;
  rateLimitsByLimitId?: Record<string, AppServerRateLimitSnapshot | undefined> | null;
};

type AppServerRateLimitSnapshot = {
  limitId?: string | null;
  limitName?: string | null;
  planType?: string | null;
  primary?: AppServerRateLimitWindow | null;
  secondary?: AppServerRateLimitWindow | null;
};

type AppServerRateLimitWindow = {
  usedPercent?: number | null;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
};

type AppServerSkillEntry = {
  cwd?: string | null;
  skills?: Array<{
    name: string;
    description?: string | null;
    path: string;
    scope?: CodexSkillOption["scope"] | null;
    enabled?: boolean | null;
  }> | null;
};

type AppServerApp = {
  id: string;
  name: string;
  description?: string | null;
  installUrl?: string | null;
  install_url?: string | null;
  logoUrl?: string | null;
  logo_url?: string | null;
  iconUrl?: string | null;
  icon_url?: string | null;
  isAccessible?: boolean | null;
  is_accessible?: boolean | null;
  isEnabled?: boolean | null;
  is_enabled?: boolean | null;
};

type AppServerPluginListResponse = {
  marketplaces?: AppServerPluginMarketplace[];
};

type AppServerPluginMarketplace = {
  name: string;
  plugins?: AppServerPluginSummary[] | null;
};

type AppServerPluginSummary = {
  id: string;
  name: string;
  installed?: boolean | null;
  enabled?: boolean | null;
  logoUrl?: string | null;
  iconUrl?: string | null;
  icon?: string | null;
  manifest?: {
    logoUrl?: string | null;
    logo_url?: string | null;
    iconUrl?: string | null;
    icon_url?: string | null;
  } | null;
  interface?: {
    displayName?: string | null;
    shortDescription?: string | null;
    longDescription?: string | null;
    logoUrl?: string | null;
    iconUrl?: string | null;
    iconSmall?: string | null;
    iconLarge?: string | null;
    imageUrl?: string | null;
    capabilities?: string[] | null;
  } | null;
};

type AppServerMcpStatusResponse = {
  data?: AppServerMcpServerStatus[] | null;
  nextCursor?: string | null;
  next_cursor?: string | null;
};

type AppServerMcpServerStatus = {
  name?: string | null;
  tools?: AppServerMcpTool[] | Record<string, AppServerMcpTool | undefined> | null;
  resources?: unknown[] | null;
  resourceTemplates?: unknown[] | null;
  resource_templates?: unknown[] | null;
  authStatus?: string | { type?: string | null } | null;
  auth_status?: string | { type?: string | null } | null;
};

type AppServerMcpTool = {
  name?: string | null;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
  input_schema?: Record<string, unknown> | null;
};

export function mapModels(data: AppServerModel[]): CodexModelOption[] {
  return data
    .filter((model) => !model.hidden)
    .map((model) => {
      const reasoningEffortOptions = (model.supportedReasoningEfforts ?? [])
        .map((option) => {
          const effort =
            typeof option === "string"
              ? option
              : option.reasoningEffort ?? option.value ?? option.id ?? option.name ?? "";
          if (!effort) {
            return null;
          }
          return {
            effort,
            description: typeof option === "string" ? "" : option.description?.trim() || "",
          };
        })
        .filter((option): option is { effort: string; description: string } => option !== null);

      return {
        id: model.model ?? model.id,
        label: model.displayName?.trim() || model.model || model.id,
        description: model.description?.trim() || "",
        isDefault: Boolean(model.isDefault),
        supportsImages: (model.inputModalities ?? []).includes("image"),
        reasoningEfforts: reasoningEffortOptions.map((option) => option.effort),
        reasoningEffortOptions,
        ...(model.defaultReasoningEffort ? { defaultReasoningEffort: model.defaultReasoningEffort } : {}),
        additionalSpeedTiers: model.additionalSpeedTiers ?? [],
        supportsParallelToolCalls: Boolean(model.supportsParallelToolCalls ?? model.supports_parallel_tool_calls),
        supportsSearchTool: Boolean(model.supportsSearchTool ?? model.supports_search_tool),
      };
    })
    .sort((left, right) => {
      if (left.isDefault && !right.isDefault) {
        return -1;
      }
      if (!left.isDefault && right.isDefault) {
        return 1;
      }
      return left.label.localeCompare(right.label);
    });
}

export function mapMcpServerStatusResponse(response: AppServerMcpStatusResponse): {
  servers: CodexMcpServerOption[];
  nextCursor: string | null;
} {
  return {
    servers: mapMcpServers(response.data ?? []),
    nextCursor: response.nextCursor ?? response.next_cursor ?? null,
  };
}

export function mapMcpServers(data: AppServerMcpServerStatus[]): CodexMcpServerOption[] {
  return data
    .map((server) => {
      const name = server.name?.trim() ?? "";
      const tools = normalizeMcpTools(server.tools)
        .map((tool) => ({
          name: tool.name?.trim() ?? "",
          description: tool.description?.trim() ?? "",
          inputSchema: tool.inputSchema ?? tool.input_schema ?? null,
        }))
        .filter((tool) => tool.name)
        .sort((left, right) => left.name.localeCompare(right.name));
      const authStatus = normalizeMcpAuthStatus(server.authStatus ?? server.auth_status);

      return {
        id: `mcp:${name}`,
        name,
        description: summarizeMcpServer(name, tools.length, authStatus),
        path: `mcp://${encodeURIComponent(name)}`,
        token: toStructuredToken(name),
        authStatus,
        isAuthenticated: authStatus !== "notLoggedIn",
        toolCount: tools.length,
        tools,
        resourceCount: (server.resources ?? []).length,
        resourceTemplateCount: (server.resourceTemplates ?? server.resource_templates ?? []).length,
      };
    })
    .filter((server) => server.name)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeMcpTools(tools: AppServerMcpServerStatus["tools"]): AppServerMcpTool[] {
  if (Array.isArray(tools)) {
    return tools;
  }
  if (!tools || typeof tools !== "object") {
    return [];
  }
  return Object.entries(tools)
    .filter((entry): entry is [string, AppServerMcpTool] => Boolean(entry[0] && entry[1]))
    .map(([name, tool]) => ({
      ...tool,
      name: tool.name?.trim() || name,
    }));
}

export function mapThreadSummaries(data: AppServerThread[]): CodexThreadSummary[] {
  return data.map((thread) => ({
    id: thread.id,
    title: thread.name?.trim() || thread.preview?.trim() || "Untitled thread",
    preview: thread.preview?.trim() || "",
    updatedAt: toEpochMillis(thread.updatedAt),
    status: normalizeStatus(thread.status),
    cwd: thread.cwd?.trim() || "",
    source: thread.source?.trim() || "unknown",
  }));
}

function normalizeMcpAuthStatus(value: AppServerMcpServerStatus["authStatus"]): string {
  if (typeof value === "string") {
    return value.trim() || "unsupported";
  }
  if (value && typeof value.type === "string") {
    return value.type.trim() || "unsupported";
  }
  return "unsupported";
}

function summarizeMcpServer(name: string, toolCount: number, authStatus: string): string {
  const auth = authStatus === "notLoggedIn" ? "OAuth required" : "Ready";
  return `${auth} MCP server with ${toolCount} ${toolCount === 1 ? "tool" : "tools"}: ${name}`;
}

export function mapThreadTranscript(thread: AppServerThread): CodexThreadTranscript {
  const messages: CodexThreadMessage[] = [];

  for (const turn of thread.turns ?? []) {
    for (const item of turn.items ?? []) {
      if (item.type === "userMessage" && "id" in item) {
        messages.push({
          id: item.id ?? `user-${messages.length + 1}`,
          role: "user",
          text: formatUserInputs("content" in item ? item.content ?? [] : []),
        });
        continue;
      }

      if (item.type === "agentMessage" && "id" in item) {
        const text = ("text" in item ? item.text : undefined)?.trim();
        if (!text) {
          continue;
        }
        messages.push({
          id: item.id ?? `assistant-${messages.length + 1}`,
          role: "assistant",
          text,
        });
      }
    }
  }

  return {
    id: thread.id,
    title: thread.name?.trim() || thread.preview?.trim() || "Untitled thread",
    preview: thread.preview?.trim() || "",
    updatedAt: toEpochMillis(thread.updatedAt),
    status: normalizeStatus(thread.status),
    cwd: thread.cwd?.trim() || "",
    messages,
  };
}

export function mapTurnSummaries(data: AppServerTurn[]): CodexTurnSummary[] {
  return data.map((turn) => ({
    id: turn.id,
    status: normalizeStatus(turn.status),
    startedAt: toEpochMillisOrNull(turn.startedAt),
    completedAt: toEpochMillisOrNull(turn.completedAt),
    durationMs: turn.durationMs ?? null,
  }));
}

export function mapRateLimits(response: AppServerRateLimitsResponse | null | undefined): CodexRateLimits | null {
  if (!response?.rateLimits && !response?.rateLimitsByLimitId) {
    return null;
  }

  const buckets = new Map<string, CodexRateLimitBucket>();
  if (response.rateLimits) {
    const bucket = mapRateLimitBucket(response.rateLimits);
    buckets.set(bucket.limitId ?? "__default__", bucket);
  }

  for (const snapshot of Object.values(response.rateLimitsByLimitId ?? {})) {
    if (!snapshot) {
      continue;
    }
    const bucket = mapRateLimitBucket(snapshot);
    buckets.set(bucket.limitId ?? "__default__", bucket);
  }

  return {
    defaultBucket: response.rateLimits ? mapRateLimitBucket(response.rateLimits) : null,
    buckets: Array.from(buckets.values()),
  };
}

export function mapSkills(entries: AppServerSkillEntry[]): CodexSkillOption[] {
  const skills = new Map<string, CodexSkillOption>();

  for (const entry of entries) {
    const cwd = entry.cwd?.trim() || "";
    for (const skill of entry.skills ?? []) {
      if (skill.enabled === false) {
        continue;
      }

      const mappedSkill: CodexSkillOption = {
        id: `${skill.path}#${skill.name}`,
        name: skill.name,
        description: skill.description?.trim() || "",
        path: skill.path,
        scope: skill.scope ?? "repo",
        cwd,
        token: toStructuredToken(skill.name),
      };
      const dedupeKey = `${cwd}::${skill.name.trim().toLowerCase()}`;
      const existing = skills.get(dedupeKey);
      if (!existing || compareSkillPriority(mappedSkill, existing) < 0) {
        skills.set(dedupeKey, mappedSkill);
      }
    }
  }

  return Array.from(skills.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function mapApps(data: AppServerApp[]): CodexAppOption[] {
  return data
    .map((app) => {
      const installUrl = firstString(app.installUrl, app.install_url);
      const iconUrl = firstString(app.logoUrl, app.logo_url, app.iconUrl, app.icon_url);

      return {
        id: app.id,
        name: app.name,
        description: app.description?.trim() || "",
        path: `app://${app.id}`,
        token: toStructuredToken(app.name),
        isAccessible: booleanFromAliases(app.isAccessible, app.is_accessible),
        isEnabled: booleanFromAliases(app.isEnabled, app.is_enabled),
        ...(installUrl ? { installUrl } : {}),
        ...toOptionalIconUrl(iconUrl),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function mapPlugins(response: AppServerPluginListResponse): CodexPluginOption[] {
  const plugins: CodexPluginOption[] = [];

  for (const marketplace of response.marketplaces ?? []) {
    const marketplaceName = marketplace.name.trim();
    if (!marketplaceName) {
      continue;
    }

    for (const plugin of marketplace.plugins ?? []) {
      if (!plugin.installed || !plugin.enabled) {
        continue;
      }

      const pluginName = plugin.name.trim() || plugin.id.split("@")[0]?.trim() || plugin.id;
      const displayName = plugin.interface?.displayName?.trim() || pluginName;
      const capabilities = (plugin.interface?.capabilities ?? []).map((capability) => capability.trim()).filter(Boolean);
      const iconUrl = resolvePluginIconUrl(plugin);
      plugins.push({
        id: plugin.id,
        name: displayName,
        description:
          plugin.interface?.shortDescription?.trim() ||
          plugin.interface?.longDescription?.trim() ||
          capabilities.join(", "),
        marketplaceName,
        path: `plugin://${pluginName}@${marketplaceName}`,
        token: toStructuredToken(displayName),
        installed: true,
        enabled: true,
        ...toOptionalIconUrl(iconUrl),
        capabilities,
      });
    }
  }

  return plugins.sort((left, right) => left.name.localeCompare(right.name));
}

function resolvePluginIconUrl(plugin: AppServerPluginSummary): string {
  const pluginInterface = plugin.interface;
  return (
    pluginInterface?.logoUrl?.trim() ||
    pluginInterface?.iconUrl?.trim() ||
    pluginInterface?.iconSmall?.trim() ||
    pluginInterface?.iconLarge?.trim() ||
    pluginInterface?.imageUrl?.trim() ||
    plugin.logoUrl?.trim() ||
    plugin.iconUrl?.trim() ||
    plugin.icon?.trim() ||
    plugin.manifest?.logoUrl?.trim() ||
    plugin.manifest?.logo_url?.trim() ||
    plugin.manifest?.iconUrl?.trim() ||
    plugin.manifest?.icon_url?.trim() ||
    ""
  );
}

function toOptionalIconUrl(value: string | null | undefined): { iconUrl: string } | Record<string, never> {
  const normalized = value?.trim() ?? "";
  if (/^(?:https?:\/\/|data:image\/[a-z0-9.+-]+;base64,)/iu.test(normalized)) {
    return { iconUrl: normalized };
  }
  return {};
}

function firstString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const normalized = value?.trim() ?? "";
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function booleanFromAliases(...values: Array<boolean | null | undefined>): boolean {
  return values.some((value) => value === true);
}

export function toStructuredToken(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `$${slug}` : "$tool";
}

function compareSkillPriority(left: CodexSkillOption, right: CodexSkillOption): number {
  const scopeDelta = skillScopeRank(right.scope) - skillScopeRank(left.scope);
  if (scopeDelta !== 0) {
    return scopeDelta;
  }

  return left.path.localeCompare(right.path);
}

function skillScopeRank(scope: CodexSkillOption["scope"]): number {
  switch (scope) {
    case "system":
      return 4;
    case "admin":
      return 3;
    case "repo":
      return 2;
    case "user":
    default:
      return 1;
  }
}

function formatUserInputs(inputs: AppServerUserInput[]): string {
  const parts = inputs
    .map((input) => {
      if (input.type === "text") {
        return extractVisibleUserRequest(input.text ?? "");
      }
      if (input.type === "skill") {
        return input.name ? `[skill:${input.name}]` : "[skill]";
      }
      if (input.type === "mention") {
        if (input.name) {
          return `[mention:${input.name}]`;
        }
        if (input.path) {
          return `[mention:${input.path}]`;
        }
        return "[mention]";
      }
      if (input.type === "image") {
        return input.url ? `[image:${input.url}]` : "[image]";
      }
      if (input.type === "localImage") {
        return input.path ? `[image:${input.path}]` : "[image]";
      }
      return "";
    })
    .filter(Boolean);

  return parts.join(" ").trim();
}

function mapRateLimitBucket(snapshot: AppServerRateLimitSnapshot): CodexRateLimitBucket {
  return {
    limitId: snapshot.limitId ?? null,
    limitName: snapshot.limitName ?? null,
    planType: snapshot.planType ?? null,
    primary: mapRateLimitWindow(snapshot.primary),
    secondary: mapRateLimitWindow(snapshot.secondary),
  };
}

function mapRateLimitWindow(window: AppServerRateLimitWindow | null | undefined) {
  if (!window) {
    return null;
  }

  return {
    usedPercent: Number(window.usedPercent ?? 0),
    windowDurationMins: window.windowDurationMins ?? null,
    resetsAt: window.resetsAt ?? null,
  };
}

function toEpochMillis(value: number | null | undefined): number {
  if (!value) {
    return Date.now();
  }
  return value > 1_000_000_000_000 ? value : value * 1000;
}

function toEpochMillisOrNull(value: number | null | undefined): number | null {
  if (!value) {
    return null;
  }
  return value > 1_000_000_000_000 ? value : value * 1000;
}

function normalizeStatus(status: string | { type?: string | null } | null | undefined): string {
  if (typeof status === "string") {
    return status.trim() || "unknown";
  }

  if (status && typeof status === "object" && typeof status.type === "string") {
    return status.type.trim() || "unknown";
  }

  return "unknown";
}
