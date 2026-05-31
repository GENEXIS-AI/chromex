export interface QuickInteractionLockState {
  turnActive: boolean;
  promptActivityActive: boolean;
}

export function isQuickInteractionLocked(state: QuickInteractionLockState): boolean {
  return state.turnActive || state.promptActivityActive;
}
