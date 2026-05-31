export function resolvePermissionRetryPrompt(input: {
  pendingRetryMessage?: string | undefined;
  composerDraft?: string | undefined;
  composerValue?: string | null;
}): string {
  return (input.pendingRetryMessage || input.composerDraft || input.composerValue || "").trim();
}
