import type { CodexAppOption, CodexPluginOption, CodexStructuredInput } from "@codex-sidepanel/shared";

export type PluginConnectionState = "available" | "connection-required" | "standalone";

export function getPluginConnectionState(
  plugin: Pick<CodexPluginOption, "id" | "name" | "path" | "token">,
  apps: CodexAppOption[],
): PluginConnectionState {
  const companionApp = findCompanionAppForPlugin(plugin, apps);
  if (!companionApp) {
    return "standalone";
  }
  return companionApp.isAccessible && companionApp.isEnabled ? "available" : "connection-required";
}

export function isPluginMentionRouteable(
  plugin: Pick<CodexPluginOption, "id" | "name" | "path" | "token" | "installed" | "enabled">,
  apps: CodexAppOption[],
): boolean {
  if (!plugin.installed || !plugin.enabled) {
    return false;
  }
  return getPluginConnectionState(plugin, apps) !== "connection-required";
}

export function requiresPluginCompanionAppConnection(
  input: CodexStructuredInput,
  apps: CodexAppOption[],
): boolean {
  return (
    input.type === "mention" &&
    getStructuredInputPath(input).startsWith("plugin://") &&
    getPluginConnectionState(input, apps) === "connection-required"
  );
}

export function findCompanionAppForPlugin(
  plugin: Pick<CodexPluginOption, "id" | "name" | "path" | "token"> | (CodexStructuredInput & { type: "mention" }),
  apps: CodexAppOption[],
): CodexAppOption | null {
  const pluginTokens = createPluginMatchTokens(plugin);
  if (pluginTokens.size === 0) {
    return null;
  }

  return (
    apps.find((app) =>
      [app.id, app.name, app.token, app.path]
        .map(normalizeStructuredInputMatchValue)
        .some((value) => value && pluginTokens.has(value)),
    ) ?? null
  );
}

function createPluginMatchTokens(
  plugin: Pick<CodexPluginOption, "id" | "name" | "path" | "token"> | (CodexStructuredInput & { type: "mention" }),
): Set<string> {
  return new Set(
    [
      plugin.id,
      plugin.name,
      plugin.token,
      getStructuredInputPath(plugin),
      pluginSlugFromPath(getStructuredInputPath(plugin)),
      normalizeStructuredInputString(plugin.id).split("@")[0] ?? "",
    ]
      .map(normalizeStructuredInputMatchValue)
      .filter(Boolean),
  );
}

function pluginSlugFromPath(path: string): string {
  const match = /^plugin:\/\/([^@/?#\s]+)/iu.exec(path.trim());
  return match?.[1] ?? "";
}

function getStructuredInputPath(input: { path?: unknown }): string {
  return normalizeStructuredInputString(input.path);
}

function normalizeStructuredInputMatchValue(value: unknown): string {
  return (
    normalizeStructuredInputString(value)
      .trim()
      .replace(/^\$/u, "")
      .replace(/^app:\/\//iu, "")
      .replace(/^plugin:\/\//iu, "")
      .split("@")[0]
      ?.trim()
      .replace(/[\s_-]+/gu, "")
      .toLowerCase() ?? ""
  );
}

function normalizeStructuredInputString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
