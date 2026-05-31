export const COMPOSER_TEXTAREA_MAX_VISIBLE_LINES = 3;

export type ComposerTextareaAutosizeMetrics = {
  scrollHeight: number;
  lineHeight: number;
  paddingTop: number;
  paddingBottom: number;
  minHeight: number;
};

export type ComposerTextareaAutosizeResult = {
  height: number;
  overflowY: "hidden" | "auto";
};

export function calculateComposerTextareaAutosize(
  metrics: ComposerTextareaAutosizeMetrics,
): ComposerTextareaAutosizeResult {
  const lineHeight = Math.max(1, metrics.lineHeight);
  const maxHeight = Math.max(
    metrics.minHeight,
    lineHeight * COMPOSER_TEXTAREA_MAX_VISIBLE_LINES + metrics.paddingTop + metrics.paddingBottom,
  );
  const height = Math.ceil(Math.min(Math.max(metrics.scrollHeight, metrics.minHeight), maxHeight));

  return {
    height,
    overflowY: metrics.scrollHeight > maxHeight ? "auto" : "hidden",
  };
}
