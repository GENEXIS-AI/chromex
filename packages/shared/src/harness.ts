export type HarnessPermissionMode = "default" | "acceptBrowserActions" | "plan" | "auto";
export type BrowserActionPermissionMode = "ask" | "auto-review" | "full";

export type HarnessPermissionOperation =
  | "prompt.send"
  | "context.tabs.read"
  | "context.history.read"
  | "image.edit"
  | "voice.session.start"
  | "page.navigate"
  | "page.dom.perform"
  | "page.image.overlay";

export type WorkspaceInstructionKind = "memory" | "rule";
export type WorkspaceInstructionScope = "user" | "project" | "local";
export type WorkspaceShortcutSource = "user" | "project";

export interface HarnessPermissionConfig {
  defaultMode: HarnessPermissionMode;
  allow: string[];
  ask: string[];
  deny: string[];
}

export interface WorkspaceInstructionSource {
  id: string;
  title: string;
  path: string;
  kind: WorkspaceInstructionKind;
  scope: WorkspaceInstructionScope;
  domains?: string[];
  profiles?: string[];
}

export interface WorkspaceShortcut {
  id: string;
  name: string;
  prompt: string;
  description: string;
  source: WorkspaceShortcutSource;
  path: string;
  readonly: true;
}

export interface WorkspaceHookSummary {
  enabled: boolean;
  eventCount: number;
}

export interface WorkspaceHarnessSnapshot {
  workspaceRoot: string;
  configSources: string[];
  instructionSources: WorkspaceInstructionSource[];
  permissions: HarnessPermissionConfig;
  hooks: WorkspaceHookSummary;
  shortcuts: WorkspaceShortcut[];
}

export interface PermissionResolutionOptions {
  browserActionsEnabled?: boolean;
  browserActionPermissionMode?: BrowserActionPermissionMode;
  confirmedOperations?: string[];
}

export interface PermissionResolution {
  operation: HarnessPermissionOperation;
  decision: "allow" | "ask" | "deny";
  reason: string;
}

export const DEFAULT_HARNESS_PERMISSIONS: HarnessPermissionConfig = {
  defaultMode: "default",
  allow: ["prompt.send", "context.tabs.read"],
  ask: [],
  deny: [],
};

const DEFAULT_CONFIRMATION_OPERATIONS = new Set<HarnessPermissionOperation>([
  "page.navigate",
  "page.dom.perform",
  "page.image.overlay",
]);
const PLAN_BLOCKED_OPERATIONS = new Set<HarnessPermissionOperation>([
  "context.history.read",
  "voice.session.start",
  ...DEFAULT_CONFIRMATION_OPERATIONS,
  "image.edit",
]);

export function resolveHarnessPermission(
  config: HarnessPermissionConfig,
  operation: HarnessPermissionOperation,
  options: PermissionResolutionOptions = {},
): PermissionResolution {
  if (options.browserActionsEnabled === false && isBrowserMutation(operation)) {
    return {
      operation,
      decision: "deny",
      reason: "Browser actions are disabled in the side panel settings.",
    };
  }

  if (options.confirmedOperations?.includes(operation)) {
    return {
      operation,
      decision: "allow",
      reason: "User confirmed this action for the current request.",
    };
  }

  if (config.deny.some((pattern) => matchesHarnessPattern(pattern, operation))) {
    return {
      operation,
      decision: "deny",
      reason: "Blocked by workspace harness permissions.",
    };
  }

  if (config.allow.some((pattern) => matchesHarnessPattern(pattern, operation))) {
    return {
      operation,
      decision: "allow",
      reason: "Allowed by workspace harness permissions.",
    };
  }

  if (config.ask.some((pattern) => matchesHarnessPattern(pattern, operation))) {
    return {
      operation,
      decision: "ask",
      reason: "Workspace harness requires confirmation for this action.",
    };
  }

  if (isBrowserMutation(operation) && options.browserActionPermissionMode) {
    switch (options.browserActionPermissionMode) {
      case "full":
        return {
          operation,
          decision: "allow",
          reason: "Side panel full browser action mode allows this action.",
        };
      case "auto-review":
        return {
          operation,
          decision: "allow",
          reason: "Side panel auto-review mode allows this action after planner review.",
        };
      case "ask":
      default:
        return {
          operation,
          decision: "ask",
          reason: "Side panel basic browser action mode requires confirmation.",
        };
    }
  }

  switch (config.defaultMode) {
    case "plan":
      return {
        operation,
        decision: PLAN_BLOCKED_OPERATIONS.has(operation) ? "deny" : "allow",
        reason: PLAN_BLOCKED_OPERATIONS.has(operation)
          ? "Plan mode blocks browser mutations and multimodal write actions."
          : "Plan mode allows read-only analysis actions.",
      };
    case "acceptBrowserActions":
      return {
        operation,
        decision: "allow",
        reason: "Workspace harness is configured to auto-accept browser actions.",
      };
    case "auto":
      return {
        operation,
        decision: "allow",
        reason: "Workspace harness auto mode allows this action unless a rule denies it.",
      };
    case "default":
    default:
      return {
        operation,
        decision: DEFAULT_CONFIRMATION_OPERATIONS.has(operation) ? "ask" : "allow",
        reason: DEFAULT_CONFIRMATION_OPERATIONS.has(operation)
          ? "This action touches browsing state or external data and needs confirmation."
          : "This action is allowed by the default workspace policy.",
      };
  }
}

export function matchesHarnessPattern(pattern: string, value: string): boolean {
  const normalized = pattern.trim();
  if (!normalized || normalized === "*") {
    return true;
  }

  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "u").test(value);
}

function isBrowserMutation(operation: HarnessPermissionOperation): boolean {
  return operation === "page.navigate" || operation === "page.dom.perform" || operation === "page.image.overlay";
}
