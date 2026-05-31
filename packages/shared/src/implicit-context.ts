import type { ReadStrategy } from "./types.js";

export type PromptContextAttachment = "current-page" | "open-tabs" | "history" | "selection" | "image";

export interface ImplicitContextPlan {
  attachments: PromptContextAttachment[];
  readStrategyOverride: ReadStrategy | "auto";
  inferredAttachments: PromptContextAttachment[];
  notes: string[];
}

export function inferImplicitContextPlan(input: {
  message: string;
  contextHint?: string;
  explicitAttachments: PromptContextAttachment[];
  readStrategyOverride?: ReadStrategy | "auto";
}): ImplicitContextPlan {
  const attachments = new Set(input.explicitAttachments);
  const notes: string[] = [];
  let readStrategyOverride = input.readStrategyOverride ?? "auto";

  if (attachments.has("image") && (readStrategyOverride === "auto" || readStrategyOverride === "dom")) {
    readStrategyOverride = "hybrid";
    notes.push("Explicit image context requires hybrid page reading.");
  }

  return {
    attachments: Array.from(attachments),
    readStrategyOverride,
    inferredAttachments: [],
    notes,
  };
}
