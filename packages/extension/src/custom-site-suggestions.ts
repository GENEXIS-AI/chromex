import type { ActionCard, OpenTabContext } from "@codex-sidepanel/shared";

import type { CustomSiteSuggestion } from "./types.js";

const MAX_CUSTOM_SITE_SUGGESTIONS = 60;
const MAX_CUSTOM_SITE_COMMAND_LENGTH = 80;
const MAX_CUSTOM_SITE_PROMPT_LENGTH = 2000;
const MAX_CUSTOM_SITE_LABEL_LENGTH = 80;

type SiteInput = Pick<OpenTabContext, "title" | "url">;

export function resolveCustomSiteSuggestionKey(url: string): string | null {
  const parsed = parseHttpUrl(url);
  if (parsed) {
    return normalizeHost(parsed.hostname);
  }

  const hostCandidate = url.trim().replace(/^www\./iu, "");
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/iu.test(hostCandidate)) {
    return normalizeHost(hostCandidate);
  }

  return null;
}

export function createCustomSiteSuggestion(
  tab: SiteInput,
  command: string,
  promptOrCreatedAt: string | number = command,
  createdAt = Date.now(),
): CustomSiteSuggestion {
  const siteKey = resolveCustomSiteSuggestionKey(tab.url);
  if (!siteKey) {
    throw new Error("Custom suggestions can only be registered for normal web sites.");
  }
  const normalizedPrompt = normalizePrompt(typeof promptOrCreatedAt === "number" ? command : promptOrCreatedAt);
  const normalizedCommand = normalizeCommand(command || normalizedPrompt);
  const normalizedCreatedAt = typeof promptOrCreatedAt === "number" ? promptOrCreatedAt : createdAt;
  if (!normalizedCommand) {
    throw new Error("Custom suggestion command is required.");
  }
  if (!normalizedPrompt) {
    throw new Error("Custom suggestion prompt is required.");
  }

  return {
    id: createSuggestionId(siteKey, normalizedCommand, normalizedPrompt, normalizedCreatedAt),
    siteKey,
    siteLabel: createSiteLabel(tab, siteKey),
    command: normalizedCommand,
    prompt: normalizedPrompt,
    createdAt: normalizedCreatedAt,
  };
}

export function upsertCustomSiteSuggestion(
  current: CustomSiteSuggestion[],
  tab: SiteInput,
  command: string,
  promptOrCreatedAt: string | number = command,
  createdAt = Date.now(),
): CustomSiteSuggestion[] {
  const next = createCustomSiteSuggestion(tab, command, promptOrCreatedAt, createdAt);
  return normalizeCustomSiteSuggestions([
    next,
    ...current.filter(
      (item) => item.siteKey !== next.siteKey || item.command !== next.command || item.prompt !== next.prompt,
    ),
  ]);
}

export function deleteCustomSiteSuggestion(current: CustomSiteSuggestion[], suggestionId: string): CustomSiteSuggestion[] {
  return normalizeCustomSiteSuggestions(current.filter((item) => item.id !== suggestionId));
}

export function normalizeCustomSiteSuggestions(value: unknown): CustomSiteSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: CustomSiteSuggestion[] = [];
  for (const item of value) {
    const suggestion = normalizeCustomSiteSuggestion(item);
    if (!suggestion) {
      continue;
    }
    const dedupeKey = `${suggestion.siteKey}\n${suggestion.command}\n${suggestion.prompt}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    normalized.push(suggestion);
  }

  return normalized
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_CUSTOM_SITE_SUGGESTIONS);
}

export function listCustomSiteSuggestionsForTab(
  tab: SiteInput | null | undefined,
  suggestions: CustomSiteSuggestion[],
): CustomSiteSuggestion[] {
  const siteKey = tab ? resolveCustomSiteSuggestionKey(tab.url) : null;
  if (!siteKey) {
    return [];
  }
  return normalizeCustomSiteSuggestions(suggestions).filter((item) => item.siteKey === siteKey);
}

export function inferCustomSiteSuggestionCards(
  tab: SiteInput | null | undefined,
  suggestions: CustomSiteSuggestion[],
): ActionCard[] {
  return listCustomSiteSuggestionsForTab(tab, suggestions).map((suggestion) => ({
    id: `custom-site-${suggestion.id}`,
    title: suggestion.command,
    description: suggestion.siteLabel,
    kind: "prompt",
    prompt: suggestion.prompt,
  }));
}

export function createSiteLabel(_tab: SiteInput, siteKey: string): string {
  return siteKey;
}

function normalizeCustomSiteSuggestion(value: unknown): CustomSiteSuggestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Partial<CustomSiteSuggestion>;
  const siteKey = resolveCustomSiteSuggestionKey(String(input.siteKey ?? ""));
  const prompt = normalizePrompt(input.prompt ?? "");
  const command = normalizeCommand(input.command ?? prompt);
  if (!siteKey || !command || !prompt) {
    return null;
  }
  const createdAt = Number.isFinite(input.createdAt) ? Number(input.createdAt) : Date.now();
  const fallbackId = createSuggestionId(siteKey, command, prompt, createdAt);
  const id = normalizeSuggestionId(input.id) || fallbackId;
  const siteLabel = normalizeSiteLabel(input.siteLabel, siteKey);
  return {
    id,
    siteKey,
    siteLabel,
    command,
    prompt,
    createdAt,
  };
}

function normalizeSuggestionId(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

function createSuggestionId(siteKey: string, command: string, prompt: string, createdAt: number): string {
  return normalizeSuggestionId(`${siteKey}-${createdAt}-${hashString(`${command}\n${prompt}`)}`);
}

function normalizeCommand(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_CUSTOM_SITE_COMMAND_LENGTH);
}

function normalizePrompt(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_CUSTOM_SITE_PROMPT_LENGTH);
}

function normalizeSiteLabel(value: unknown, siteKey: string): string {
  const label = String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_CUSTOM_SITE_LABEL_LENGTH);
  return label || siteKey;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeHost(value: string): string {
  return value.trim().replace(/^www\./iu, "").toLowerCase();
}

function hashString(value: string): string {
  let hash = 5381;
  for (const character of value) {
    hash = (hash * 33) ^ character.codePointAt(0)!;
  }
  return (hash >>> 0).toString(36);
}
