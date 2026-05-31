import type { CodexAppOption, CodexPluginOption, CodexSkillOption, CodexStructuredInput } from "@codex-sidepanel/shared";

import { isPluginMentionRouteable } from "../plugin-connection-availability.js";
import { getUiStrings, type UiLocale } from "./i18n.js";

export type ContextMentionId = "open-tabs";

export type MentionOption =
  | {
      id: `context:${ContextMentionId}`;
      kind: "context";
      contextId: ContextMentionId;
      label: string;
      description: string;
    }
  | {
      id: `app:${string}`;
      kind: "app";
      label: string;
      description: string;
      structuredInput: CodexStructuredInput & { type: "mention"; iconUrl?: string };
    }
  | {
      id: `plugin:${string}`;
      kind: "plugin";
      label: string;
      description: string;
      structuredInput: CodexStructuredInput & { type: "mention"; iconUrl?: string };
    }
  | {
      id: `skill:${string}`;
      kind: "skill";
      label: string;
      description: string;
      structuredInput: CodexStructuredInput & { type: "skill" };
    };

export type StructuredMentionOption = Extract<MentionOption, { kind: "app" | "plugin" | "skill" }>;

export interface StructuredMentionCatalog {
  apps?: CodexAppOption[];
  plugins?: CodexPluginOption[];
  skills?: CodexSkillOption[];
}

export type MentionOptionDirection = "down" | "up";

export function extractMentionQuery(value: string): string | null {
  const match = /(?:^|\s)@([\p{L}\p{N}-]*)$/iu.exec(value);
  if (!match) {
    return null;
  }
  return (match[1] ?? "").toLowerCase();
}

export function isMentionOptionArrowKey(key: string): key is "ArrowDown" | "ArrowUp" {
  return key === "ArrowDown" || key === "ArrowUp";
}

export function clampMentionOptionIndex(index: number, optionCount: number): number {
  if (optionCount <= 0) {
    return 0;
  }

  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(index), optionCount - 1));
}

export function getNextMentionOptionIndex(
  currentIndex: number,
  optionCount: number,
  direction: MentionOptionDirection,
): number {
  if (optionCount <= 0) {
    return 0;
  }

  const current = clampMentionOptionIndex(currentIndex, optionCount);
  if (direction === "down") {
    return (current + 1) % optionCount;
  }
  return (current - 1 + optionCount) % optionCount;
}

export function isStructuredMentionOption(option: MentionOption): option is StructuredMentionOption {
  return option.kind === "app" || option.kind === "plugin" || option.kind === "skill";
}

export function listMentionOptions(
  query: string,
  locale: UiLocale = "en",
  catalog: StructuredMentionCatalog = {},
): MentionOption[] {
  const strings = getUiStrings(locale);
  const options: MentionOption[] = [
    {
      id: "context:open-tabs",
      kind: "context",
      contextId: "open-tabs",
      label: strings.labels.openTabs,
      description: strings.permissions.openTabs,
    },
  ];
  const appOptions = (catalog.apps ?? [])
    .filter(isAppMentionRouteable)
    .map((app): MentionOption => {
      const description = app.description || app.path;
      return {
        id: `app:${app.id}`,
        kind: "app",
        label: app.name,
        description,
        structuredInput: {
          id: app.id,
          type: "mention",
          name: app.name,
          path: app.path,
          token: app.token,
          description,
          ...(app.iconUrl ? { iconUrl: app.iconUrl } : {}),
        },
      };
    });
  const pluginOptions = (catalog.plugins ?? [])
    .filter((plugin) => isPluginMentionRouteable(plugin, catalog.apps ?? []))
    .map((plugin): MentionOption => {
      const description = plugin.description || plugin.marketplaceName || plugin.path;
      return {
        id: `plugin:${plugin.id}`,
        kind: "plugin",
        label: plugin.name,
        description,
        structuredInput: {
          id: plugin.id,
          type: "mention",
          name: plugin.name,
          path: plugin.path,
          token: plugin.token,
          description,
          ...(plugin.iconUrl ? { iconUrl: plugin.iconUrl } : {}),
        },
      };
    });
  const skillOptions = (catalog.skills ?? []).map((skill): MentionOption => {
    const description = skill.description || skill.path;
    return {
      id: `skill:${skill.id}`,
      kind: "skill",
      label: skill.name,
      description,
      structuredInput: {
        id: skill.id,
        type: "skill",
        name: skill.name,
        path: skill.path,
        token: skill.token,
        description,
      },
    };
  });
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return options;
  }

  return [...options, ...appOptions, ...pluginOptions, ...skillOptions].filter((option) =>
    matchesMentionQuery(option, normalized),
  );
}

function isAppMentionRouteable(app: CodexAppOption): boolean {
  return app.isAccessible && app.isEnabled;
}

function matchesMentionQuery(option: MentionOption, normalizedQuery: string): boolean {
  const searchable =
    option.kind === "context"
      ? [option.contextId, option.label, option.description, "tabs", "tab"]
      : [
          option.id,
          option.label,
          option.description,
          option.structuredInput.id,
          option.structuredInput.name,
          option.structuredInput.token,
          option.structuredInput.path,
        ];
  return searchable.some((value) => value.toLowerCase().includes(normalizedQuery));
}
