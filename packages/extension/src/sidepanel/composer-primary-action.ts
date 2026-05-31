export type ComposerPrimaryAction = "send" | "start-live" | "stop-live" | "stop-turn";

export interface ComposerPrimaryActionInput {
  composerDraft: string;
  currentWorkActive: boolean;
  liveActive: boolean;
  liveAvailable: boolean;
}

export interface ComposerPrimaryActionDraftInput {
  previousComposerDraft: string;
  nextComposerDraft: string;
  currentWorkActive: boolean;
  liveActive: boolean;
  liveAvailable: boolean;
  compositionInProgress?: boolean;
}

export function resolveComposerPrimaryAction(input: ComposerPrimaryActionInput): ComposerPrimaryAction {
  if (input.composerDraft.trim()) {
    return "send";
  }

  if (input.currentWorkActive) {
    return "stop-turn";
  }

  if (input.liveActive) {
    return "stop-live";
  }

  return input.liveAvailable ? "start-live" : "send";
}

export function didComposerPrimaryActionChangeForDraftInput(input: ComposerPrimaryActionDraftInput): boolean {
  if (input.compositionInProgress) {
    return false;
  }

  const previousAction = resolveComposerPrimaryAction({
    composerDraft: input.previousComposerDraft,
    currentWorkActive: input.currentWorkActive,
    liveActive: input.liveActive,
    liveAvailable: input.liveAvailable,
  });
  const nextAction = resolveComposerPrimaryAction({
    composerDraft: input.nextComposerDraft,
    currentWorkActive: input.currentWorkActive,
    liveActive: input.liveActive,
    liveAvailable: input.liveAvailable,
  });
  if (previousAction !== nextAction) {
    return true;
  }

  return (
    nextAction === "send" &&
    Boolean(input.previousComposerDraft.trim()) !== Boolean(input.nextComposerDraft.trim())
  );
}
