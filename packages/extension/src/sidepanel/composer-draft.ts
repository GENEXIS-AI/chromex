export interface ComposerDraftState {
  composerDraft: string;
  mentionQuery: string | null;
  slashQuery: string | null;
}

export function createPendingComposerDraftState(): ComposerDraftState {
  return {
    composerDraft: "",
    mentionQuery: null,
    slashQuery: null,
  };
}

export function createRestoredComposerDraftState(message: string): ComposerDraftState {
  return {
    composerDraft: message,
    mentionQuery: null,
    slashQuery: null,
  };
}
