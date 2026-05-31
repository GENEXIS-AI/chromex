import { getUiStrings, type UiLocale } from "./i18n.js";

export const DEFAULT_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"];

export function getDefaultReasoningEffort(reasoningEfforts: string[], appServerDefault = ""): string {
  if (!reasoningEfforts.length) {
    return "";
  }
  if (appServerDefault && reasoningEfforts.includes(appServerDefault)) {
    return appServerDefault;
  }
  for (const preferred of ["xhigh", "high", "medium"]) {
    if (reasoningEfforts.includes(preferred)) {
      return preferred;
    }
  }
  return reasoningEfforts[0] ?? "";
}

export function normalizeReasoningEffort(selected: string, reasoningEfforts: string[], appServerDefault = ""): string {
  if (!reasoningEfforts.length) {
    return "";
  }
  return reasoningEfforts.includes(selected) ? selected : getDefaultReasoningEffort(reasoningEfforts, appServerDefault);
}

export function formatReasoningEffortLabel(reasoningEffort: string, locale: UiLocale): string {
  const labels: Record<string, string> = getUiStrings(locale).composerControls.reasoning;
  return labels[reasoningEffort] ?? reasoningEffort;
}

export function normalizeServiceTier(
  selected: string,
  additionalSpeedTiers: string[],
  defaultServiceTier = "",
): string {
  return normalizeServiceTierWithDefault(selected, additionalSpeedTiers, defaultServiceTier);
}

export function getDefaultServiceTier(additionalSpeedTiers: string[]): string {
  return additionalSpeedTiers.includes("fast") ? "fast" : "";
}

export function normalizeServiceTierWithDefault(
  selected: string,
  additionalSpeedTiers: string[],
  defaultServiceTier: string,
): string {
  if (!selected) {
    return defaultServiceTier && additionalSpeedTiers.includes(defaultServiceTier) ? defaultServiceTier : "";
  }
  return additionalSpeedTiers.includes(selected)
    ? selected
    : defaultServiceTier && additionalSpeedTiers.includes(defaultServiceTier)
      ? defaultServiceTier
      : "";
}

export function formatServiceTierLabel(serviceTier: string, locale: UiLocale): string {
  const labels: Record<string, string> = getUiStrings(locale).composerControls.serviceTier;
  return labels[serviceTier] ?? serviceTier;
}
