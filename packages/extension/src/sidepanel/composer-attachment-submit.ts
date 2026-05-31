import type { UserFileAttachment } from "@codex-sidepanel/shared";

export interface SubmittedComposerFileAttachmentState {
  requestFileAttachments: UserFileAttachment[];
  messageFileAttachments: UserFileAttachment[];
  composerFileAttachments: UserFileAttachment[];
}

export function createSubmittedComposerFileAttachmentState(
  composerFileAttachments: UserFileAttachment[],
  generatedFileAttachments: UserFileAttachment[] = [],
): SubmittedComposerFileAttachmentState {
  const messageFileAttachments = [...composerFileAttachments];

  return {
    requestFileAttachments: [...messageFileAttachments, ...generatedFileAttachments],
    messageFileAttachments,
    composerFileAttachments: [],
  };
}
