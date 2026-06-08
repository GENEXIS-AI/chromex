import { getUiStrings, type UiLocale } from "./i18n.js";

export type PromptActivityPhase =
  | "preparing"
  | "collecting-context"
  | "routing"
  | "compacting"
  | "reconnecting"
  | "waiting-for-codex"
  | "responding"
  | "preparing-image"
  | "editing-image"
  | "rendering-image-preview";

export interface PromptActivityState {
  clientRequestId: string;
  phase: PromptActivityPhase;
  retryAttempt?: number;
  retryMax?: number;
  retryReason?: string;
}

export interface PromptActivityStep {
  id: PromptActivityPhase;
  label: string;
  state: "done" | "active" | "pending";
}

const STEP_ORDER: PromptActivityPhase[] = [
  "preparing",
  "routing",
  "compacting",
  "collecting-context",
  "waiting-for-codex",
  "responding",
];

const IMAGE_STEP_ORDER: PromptActivityPhase[] = [
  "preparing-image",
  "editing-image",
  "rendering-image-preview",
];

export function getPromptActivityLabel(phase: PromptActivityPhase, locale: UiLocale): string {
  return getUiStrings(locale).promptActivity.labels[phase];
}

export function formatPromptActivityLabel(activity: PromptActivityState, locale: UiLocale): string {
  if (
    activity.phase === "reconnecting" &&
    typeof activity.retryAttempt === "number" &&
    typeof activity.retryMax === "number"
  ) {
    const attempt = Math.max(1, Math.floor(activity.retryAttempt));
    const max = Math.max(attempt, Math.floor(activity.retryMax));
    return `${getUiStrings(locale).promptActivity.labels.reconnecting} ${attempt}/${max}`;
  }
  return getPromptActivityLabel(activity.phase, locale);
}

export function getPromptActivityDetail(phase: PromptActivityPhase, locale: UiLocale): string {
  return getUiStrings(locale).promptActivity.details[phase];
}

export function getPromptActivitySteps(phase: PromptActivityPhase, locale: UiLocale): PromptActivityStep[] {
  const stepLabels = getUiStrings(locale).promptActivity.steps;
  if (phase === "reconnecting") {
    return [
      {
        id: "reconnecting",
        label: stepLabels.reconnecting,
        state: "active",
      },
    ];
  }
  const order = IMAGE_STEP_ORDER.includes(phase) ? IMAGE_STEP_ORDER : STEP_ORDER;
  const activeIndex = Math.max(order.indexOf(phase), 0);
  return order.map((id, index) => ({
    id,
    label: getPromptActivityStepLabel(id, locale),
    state: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
  }));
}

function getPromptActivityStepLabel(phase: PromptActivityPhase, locale: UiLocale): string {
  return getUiStrings(locale).promptActivity.steps[phase];
}
