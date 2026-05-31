export interface ComposerSubmitKeyInput {
  key: string;
  shiftKey: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  isComposing: boolean;
  keyCode?: number | undefined;
  compositionInProgress: boolean;
  dropdownOpen?: boolean | undefined;
}

export function shouldSubmitComposerOnKeydown(input: ComposerSubmitKeyInput): boolean {
  if (!isComposerSubmitTrigger(input)) {
    return false;
  }

  const forceSubmit = input.metaKey || input.ctrlKey;
  if (input.dropdownOpen && !forceSubmit) {
    return false;
  }

  return true;
}

export function shouldInterceptComposerDropdownOnEnter(input: ComposerSubmitKeyInput): boolean {
  if (!isComposerSubmitTrigger(input)) {
    return false;
  }

  const forceSubmit = input.metaKey || input.ctrlKey;
  if (forceSubmit) {
    return false;
  }

  return Boolean(input.dropdownOpen);
}

function isComposerSubmitTrigger(input: ComposerSubmitKeyInput): boolean {
  if (input.key !== "Enter") {
    return false;
  }

  if (input.shiftKey) {
    return false;
  }

  if (input.isComposing || input.compositionInProgress || input.keyCode === 229) {
    return false;
  }

  return true;
}
