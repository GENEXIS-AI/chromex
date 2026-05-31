import type { ContextSource, ProfileTemplate, ReadStrategy } from "@codex-sidepanel/shared";

const CUSTOM_PROFILE_PREFIX = "custom-";
const DEFAULT_READ_STRATEGIES: ReadStrategy[] = ["dom", "vision", "hybrid", "adapter"];
const DEFAULT_ALLOWED_SOURCES: ContextSource[] = ["current-page", "open-tabs", "history", "selection", "image", "file"];
const DEFAULT_PROFILE_COLOR = "#8b5cf6";
const DEFAULT_PROFILE_ICON = "spark";
const MAX_PROFILE_SUGGESTIONS = 3;
const MAX_IMAGE_DATA_URL_LENGTH = 250_000;
export const MAX_PROFILE_SYSTEM_PROMPT_LENGTH = 16_000;
const SAFE_PROFILE_ICONS = new Set([
  "folder",
  "dollar",
  "book",
  "graduation",
  "pencil",
  "pen",
  "code",
  "terminal",
  "music",
  "popcorn",
  "brush",
  "palette",
  "stethoscope",
  "spark",
  "lotus",
  "briefcase",
  "chart",
  "ring",
  "dumbbell",
  "notebook",
  "scale",
  "mic",
  "plane",
  "globe",
  "wrench",
  "paw",
  "flask",
  "brain",
  "heart",
  "plant",
]);

export function createUserProfileTemplate(input: {
  name: string;
  systemPrompt?: string;
  existingIds?: string[];
  visual?: ProfileTemplate["visual"];
  suggestedPrompts?: string[];
}): ProfileTemplate {
  const name = normalizeProfileName(input.name);
  const systemPrompt = normalizeSystemPrompt(input.systemPrompt ?? "");
  if (!name) {
    throw new Error("Profile name is required.");
  }
  const id = createUniqueProfileId(name, input.existingIds ?? []);

  return {
    id,
    name,
    systemPrompt,
    defaultContextPolicy: {
      attachCurrentPageByDefault: false,
      allowedReadStrategies: DEFAULT_READ_STRATEGIES,
    },
    allowedSources: DEFAULT_ALLOWED_SOURCES,
    preferredActions: [],
    adapterHints: [],
    visual: normalizeProfileVisual(input.visual),
    suggestedPrompts: normalizeSuggestedPrompts(input.suggestedPrompts),
  };
}

export function updateUserProfileTemplate(
  baseProfile: ProfileTemplate,
  input: {
    name: string;
    systemPrompt?: string;
    visual?: ProfileTemplate["visual"];
    suggestedPrompts?: string[];
  },
): ProfileTemplate {
  const name = normalizeProfileName(input.name);
  if (!name) {
    throw new Error("Profile name is required.");
  }

  return {
    ...baseProfile,
    name,
    systemPrompt: normalizeSystemPrompt(input.systemPrompt ?? ""),
    visual: normalizeProfileVisual(input.visual),
    suggestedPrompts: normalizeSuggestedPrompts(input.suggestedPrompts),
  };
}

export function normalizeStoredProfiles(profiles: ProfileTemplate[]): ProfileTemplate[] {
  const seen = new Set<string>();
  return profiles
    .map((profile) => normalizeStoredProfile(profile))
    .filter((profile): profile is ProfileTemplate => Boolean(profile))
    .filter((profile) => {
      if (seen.has(profile.id)) {
        return false;
      }
      seen.add(profile.id);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeStoredProfile(profile: ProfileTemplate): ProfileTemplate | null {
  const id = profile.id?.trim();
  const name = normalizeProfileName(profile.name ?? "");
  if (!id || !name || !isSafeProfileId(id)) {
    return null;
  }

  return {
    id,
    name,
    systemPrompt: normalizeSystemPrompt(profile.systemPrompt ?? ""),
    defaultContextPolicy: {
      attachCurrentPageByDefault: Boolean(profile.defaultContextPolicy?.attachCurrentPageByDefault),
      allowedReadStrategies: normalizeReadStrategies(profile.defaultContextPolicy?.allowedReadStrategies),
    },
    allowedSources: normalizeAllowedSources(profile.allowedSources),
    preferredActions: normalizeStringList(profile.preferredActions),
    adapterHints: normalizeStringList(profile.adapterHints),
    visual: normalizeProfileVisual(profile.visual),
    suggestedPrompts: normalizeSuggestedPrompts(profile.suggestedPrompts),
  };
}

function isSafeProfileId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/iu.test(id);
}

function createUniqueProfileId(name: string, existingIds: string[]): string {
  const seen = new Set(existingIds.map((id) => id.trim()).filter(Boolean));
  const base = `${CUSTOM_PROFILE_PREFIX}${slugify(name) || "profile"}`;
  if (!seen.has(base)) {
    return base;
  }

  let suffix = 2;
  while (seen.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function normalizeProfileName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeSystemPrompt(prompt: string): string {
  return prompt.trim().slice(0, MAX_PROFILE_SYSTEM_PROMPT_LENGTH);
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeReadStrategies(strategies: ReadStrategy[] | undefined): ReadStrategy[] {
  const allowed = new Set<ReadStrategy>(DEFAULT_READ_STRATEGIES);
  const normalized = (strategies ?? []).filter((strategy): strategy is ReadStrategy => allowed.has(strategy));
  return normalized.length ? normalized : DEFAULT_READ_STRATEGIES;
}

function normalizeAllowedSources(sources: ContextSource[] | undefined): ContextSource[] {
  const allowed = new Set<ContextSource>(DEFAULT_ALLOWED_SOURCES);
  const normalized = (sources ?? []).filter((source): source is ContextSource => allowed.has(source));
  return normalized.length ? normalized : DEFAULT_ALLOWED_SOURCES;
}

function normalizeStringList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).slice(0, 20);
}

export function normalizeProfileVisual(visual: ProfileTemplate["visual"] | undefined): NonNullable<ProfileTemplate["visual"]> {
  const color = typeof visual?.color === "string" && /^#[0-9a-f]{6}$/iu.test(visual.color.trim())
    ? visual.color.trim().toLowerCase()
    : DEFAULT_PROFILE_COLOR;
  const icon = typeof visual?.icon === "string" && SAFE_PROFILE_ICONS.has(visual.icon.trim())
    ? visual.icon.trim()
    : DEFAULT_PROFILE_ICON;
  const imageDataUrl =
    typeof visual?.imageDataUrl === "string" &&
    visual.imageDataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH &&
    /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/iu.test(visual.imageDataUrl)
      ? visual.imageDataUrl
      : undefined;

  return {
    color,
    icon,
    ...(imageDataUrl ? { imageDataUrl } : {}),
  };
}

export function normalizeSuggestedPrompts(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).slice(
    0,
    MAX_PROFILE_SUGGESTIONS,
  );
}
