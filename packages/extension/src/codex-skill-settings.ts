import type { CodexAppOption, CodexSkillOption, CodexStructuredInput } from "@codex-sidepanel/shared";

export interface CodexSkillRuntimeAvailability {
  playwrightAvailable?: boolean;
}

export type CodexSkillRuntimeRequirement = "playwright";

export interface CodexSkillRuntimeProbe {
  id?: string;
  name?: string;
  description?: string;
  path?: string;
  token?: string;
}

export function normalizeEnabledCodexSkillIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

export function toggleEnabledCodexSkillId(enabledIds: string[], skillId: string): string[] {
  const normalizedSkillId = skillId.trim();
  const current = normalizeEnabledCodexSkillIds(enabledIds);
  if (!normalizedSkillId) {
    return current;
  }

  if (current.includes(normalizedSkillId)) {
    return current.filter((item) => item !== normalizedSkillId);
  }

  return [...current, normalizedSkillId];
}

export function createEnabledCodexSkillInputs(
  skills: CodexSkillOption[],
  enabledIds: string[],
  runtimeAvailability: CodexSkillRuntimeAvailability = {},
): CodexStructuredInput[] {
  const enabled = new Set(normalizeEnabledCodexSkillIds(enabledIds));
  return skills
    .filter((skill) => enabled.has(skill.id))
    .filter((skill) => isRuntimeAvailableForSkill(skill, runtimeAvailability))
    .map((skill) => ({
      id: skill.id,
      type: "skill" as const,
      name: skill.name,
      path: skill.path,
      description: skill.description,
      token: skill.token,
    }));
}

export function mergeStructuredInputsWithEnabledCodexSkills(
  structuredInputs: CodexStructuredInput[],
  skills: CodexSkillOption[],
  enabledIds: string[],
  runtimeAvailability: CodexSkillRuntimeAvailability = {},
  apps: CodexAppOption[] = [],
): CodexStructuredInput[] {
  const merged = new Map<string, CodexStructuredInput>();
  const explicitSkillInputs: CodexStructuredInput[] = [];
  for (const input of structuredInputs) {
    if (input.type === "skill") {
      if (isRuntimeAvailableForSkill(input, runtimeAvailability)) {
        explicitSkillInputs.push(input);
      }
      continue;
    }
    merged.set(input.id, input);
  }

  const enabledSkillInputs = createEnabledCodexSkillInputs(skills, enabledIds, runtimeAvailability);
  for (const input of createLinkedAppMentionsForSkills([...explicitSkillInputs, ...enabledSkillInputs], apps)) {
    if (!merged.has(input.id)) {
      merged.set(input.id, input);
    }
  }

  for (const input of explicitSkillInputs) {
    merged.set(input.id, input);
  }

  for (const input of enabledSkillInputs) {
    merged.set(input.id, input);
  }

  return Array.from(merged.values());
}

function createLinkedAppMentionsForSkills(
  skillInputs: CodexStructuredInput[],
  apps: CodexAppOption[],
): CodexStructuredInput[] {
  const availableApps = apps.filter((app) => app.isAccessible && app.isEnabled);
  if (!skillInputs.length || !availableApps.length) {
    return [];
  }

  const result: CodexStructuredInput[] = [];
  for (const skill of skillInputs) {
    if (skill.type !== "skill") {
      continue;
    }
    const app = availableApps.find((candidate) => doesAppMatchSkill(candidate, skill));
    if (!app || result.some((input) => input.id === app.id)) {
      continue;
    }
    result.push({
      id: app.id,
      type: "mention",
      name: app.name,
      path: app.path,
      description: app.description,
      token: app.token,
    });
  }
  return result;
}

function doesAppMatchSkill(app: CodexAppOption, skill: CodexStructuredInput & { type: "skill" }): boolean {
  const skillKeys = new Set(
    [skill.name, skill.token, skill.id.split("#").pop() ?? ""].map(toStructuredMatchKey).filter(Boolean),
  );
  return [app.id, app.name, app.token, app.path.replace(/^app:\/\//iu, "")]
    .map(toStructuredMatchKey)
    .filter(Boolean)
    .some((key) => skillKeys.has(key));
}

function toStructuredMatchKey(value: string): string {
  return value
    .trim()
    .replace(/^[$@]/u, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}

function isRuntimeAvailableForSkill(
  skill: CodexSkillRuntimeProbe | CodexStructuredInput,
  runtimeAvailability: CodexSkillRuntimeAvailability,
): boolean {
  switch (getCodexSkillRuntimeRequirement(skill)) {
    case "playwright":
      return runtimeAvailability.playwrightAvailable === true;
    default:
      return true;
  }
}

export function getCodexSkillRuntimeRequirement(
  skill: CodexSkillRuntimeProbe | CodexStructuredInput,
): CodexSkillRuntimeRequirement | null {
  const haystack = [skill.id, skill.name, skill.description, skill.path, skill.token]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" ");
  if (PLAYWRIGHT_RUNTIME_SKILL_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return "playwright";
  }
  return null;
}

const PLAYWRIGHT_RUNTIME_SKILL_PATTERNS = [
  /\bplaywright\b/iu,
  /\bpuppeteer\b/iu,
  /\bselenium\b/iu,
  /\bchromium\b/iu,
  /\bbrowser[-\s]?automation\b/iu,
  /\bbrowser[-\s]?control\b/iu,
];
