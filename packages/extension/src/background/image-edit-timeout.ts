export const IMAGE_EDIT_TIMEOUT_MS = 20 * 60 * 1000;
export const IMAGE_GENERATION_WORKFLOW_TIMEOUT_MS = 60 * 60 * 1000;

export function buildImageEditTimeoutMessage(localizedMessage?: string): string {
  return (
    localizedMessage?.trim() ||
    "Image editing timed out after 20 minutes. Check your Codex login, image generation access, and network connection, then try again."
  );
}

export function buildImageGenerationWorkflowTimeoutMessage(localizedMessageOrLocale?: string): string {
  const value = localizedMessageOrLocale?.trim();
  if (value && /^ko(?:-|$)/iu.test(value)) {
    return "이미지 생성이 60분 동안 완료되지 않았습니다. 이미 도착한 이미지는 채팅에 보존됩니다. Codex 이미지 생성 권한과 네트워크 상태를 확인한 뒤 이어서 생성해 주세요.";
  }
  return (
    value ||
    "Image generation timed out after 60 minutes. Images that already arrived stay in the chat. Check your Codex image generation access and network connection, then continue from the saved results."
  );
}
