import type { UserFileAttachment } from "@codex-sidepanel/shared";

import type { PromptRequestPayload } from "../types.js";

type VoiceRoutePreviewPayloadInput = {
  message: string;
  contextHint: string;
  profileId: string;
  model: string;
  selectedReasoningEffort?: string;
  selectedServiceTier?: string;
  readStrategyOverride: PromptRequestPayload["readStrategyOverride"];
  attachments: PromptRequestPayload["attachments"];
  selectedTextContext?: PromptRequestPayload["selectedTextContext"];
  fileAttachments: UserFileAttachment[];
  structuredInputs: PromptRequestPayload["structuredInputs"];
  selectedTabIds: number[];
  historyQuery: string;
  suppressPageContext: boolean;
  conversationMessageCount: number;
  conversationId?: string;
};

export function createVoiceRoutePreviewPayload(input: VoiceRoutePreviewPayloadInput): PromptRequestPayload {
  return {
    message: input.message,
    contextHint: input.contextHint,
    profileId: input.profileId,
    model: input.model,
    ...(input.selectedReasoningEffort ? { reasoningEffort: input.selectedReasoningEffort } : {}),
    ...(input.selectedServiceTier ? { serviceTier: input.selectedServiceTier } : {}),
    ...(input.readStrategyOverride ? { readStrategyOverride: input.readStrategyOverride } : {}),
    attachments: input.attachments,
    ...(input.selectedTextContext ? { selectedTextContext: input.selectedTextContext } : {}),
    fileAttachments: sanitizeVoiceRoutePreviewFileAttachments(input.fileAttachments),
    ...(input.structuredInputs ? { structuredInputs: input.structuredInputs } : {}),
    selectedTabIds: input.selectedTabIds,
    historyQuery: input.historyQuery,
    suppressPageContext: input.suppressPageContext,
    conversationMessageCount: input.conversationMessageCount,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  };
}

export function sanitizeVoiceRoutePreviewFileAttachments(
  attachments: UserFileAttachment[],
): UserFileAttachment[] {
  return attachments.map((attachment) => ({
    ...attachment,
    base64: "",
  }));
}
