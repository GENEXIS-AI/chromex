import type {
  AgenticRouteInput,
  AgenticRoutePlan,
  CodexAppOption,
  CodexMcpServerOption,
  CodexPluginOption,
  CodexStructuredInput,
} from "@codex-sidepanel/shared";
import { findCompanionAppForPlugin, isPluginMentionRouteable } from "../plugin-connection-availability.js";

export function createAvailableRouteStructuredInputs(input: {
  apps: CodexAppOption[];
  plugins: CodexPluginOption[];
  mcpServers: CodexMcpServerOption[];
}): CodexStructuredInput[] {
  return dedupeStructuredInputs([
    ...input.apps
      .filter((app) => app.isAccessible && app.isEnabled)
      .map((app): CodexStructuredInput => ({
        id: app.id,
        type: "mention",
        name: app.name,
        path: app.path,
        description: app.description,
        token: app.token,
    })),
    ...input.plugins
      .filter((plugin) => isPluginMentionRouteable(plugin, input.apps))
      .map((plugin): CodexStructuredInput => ({
        id: plugin.id,
        type: "mention",
        name: plugin.name,
        path: plugin.path,
        description: plugin.description,
        token: plugin.token,
      })),
    ...input.mcpServers
      .filter((server) => server.isAuthenticated && server.toolCount > 0)
      .map((server): CodexStructuredInput => ({
        id: server.id,
        type: "mention",
        name: server.name,
        path: server.path,
        description: server.description,
        token: server.token,
      })),
  ]);
}

export function resolveRouteStructuredInputs(
  plan: Pick<AgenticRoutePlan, "structuredInputIds">,
  input: Pick<AgenticRouteInput, "availableStructuredInputs">,
): CodexStructuredInput[] {
  const available = new Map((input.availableStructuredInputs ?? []).map((structuredInput) => [structuredInput.id, structuredInput]));
  return plan.structuredInputIds
    .map((id) => available.get(id))
    .filter((structuredInput): structuredInput is CodexStructuredInput => Boolean(structuredInput));
}

export function mergeExplicitAndRouteStructuredInputs(
  explicitInputs: CodexStructuredInput[],
  routeInputs: CodexStructuredInput[],
): CodexStructuredInput[] {
  return dedupeStructuredInputs([...explicitInputs, ...routeInputs]);
}

export function expandPluginStructuredInputsWithConnectedApps(
  inputs: CodexStructuredInput[],
  apps: CodexAppOption[],
): CodexStructuredInput[] {
  const usableApps = apps.filter((app) => app.isAccessible && app.isEnabled);
  if (inputs.length === 0 || usableApps.length === 0) {
    return inputs;
  }

  const expanded: CodexStructuredInput[] = [];
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();

  const append = (input: CodexStructuredInput): void => {
    if (!input.id.trim() || seenIds.has(input.id) || seenPaths.has(input.path)) {
      return;
    }
    expanded.push(input);
    seenIds.add(input.id);
    seenPaths.add(input.path);
  };

  for (const input of inputs) {
    const companionApp = input.type === "mention" ? findCompanionAppForPlugin(input, usableApps) : null;
    if (companionApp) {
      append({
        id: companionApp.id,
        type: "mention",
        name: companionApp.name,
        path: companionApp.path,
        description: companionApp.description,
        token: companionApp.token,
      });
    }
    append(input);
  }

  return expanded;
}

function dedupeStructuredInputs(inputs: CodexStructuredInput[]): CodexStructuredInput[] {
  const merged = new Map<string, CodexStructuredInput>();
  for (const input of inputs) {
    if (!input.id.trim()) {
      continue;
    }
    merged.set(input.id, input);
  }
  return Array.from(merged.values());
}
