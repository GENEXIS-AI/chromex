import type { ReadStrategy, ReadStrategyInput } from "./types.js";

export function determineReadStrategy(input: ReadStrategyInput): ReadStrategy {
  if (input.adapterMatched) {
    return "adapter";
  }

  if (input.hasCanvas) {
    return "hybrid";
  }

  if (input.hasVideo || input.hasDenseInteractiveUi) {
    return "hybrid";
  }

  if (input.textLength < 500 && input.imageCount > 0) {
    return "vision";
  }

  return "dom";
}
