export interface ComposerSendState {
  draft: string;
  turnActive: boolean;
  promptActivityActive: boolean;
  streamingAssistantActive: boolean;
  submissionStartingActive?: boolean;
}

export function canSendComposerMessage(state: ComposerSendState): boolean {
  const hasDraft = state.draft.trim().length > 0;
  if (!hasDraft) {
    return false;
  }

  if (state.submissionStartingActive) {
    return false;
  }

  if (state.turnActive) {
    return true;
  }

  return !state.promptActivityActive && !state.streamingAssistantActive;
}
