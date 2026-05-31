import { classifyRuntimeMessageError, toErrorMessage } from "../runtime-errors.js";

export type RuntimeErrorCopyLocale = string | undefined;

export function getSpecificRuntimeErrorMessage(
  error: unknown,
  locale: RuntimeErrorCopyLocale,
): string | null {
  const message = toErrorMessage(error).trim();
  const isKo = locale === "ko";
  switch (classifyRuntimeMessageError(error)) {
    case "extension-reload-required":
      return isKo
        ? "확장 프로그램 파일을 읽지 못했습니다. chrome://extensions에서 Chromex를 다시 로드한 뒤 현재 페이지를 새로고침해 주세요."
        : "Chromex could not load its extension script. Reload Chromex from chrome://extensions, then refresh the current page.";
    case "invalid-api-key":
      return isKo
        ? "저장된 OpenAI API 키가 유효하지 않습니다. 설정에서 API 키를 지우거나 다시 입력한 뒤, ChatGPT 계정으로 사용할 경우 API 키 모드를 끄고 다시 시도해 주세요."
        : "The saved OpenAI API key is invalid. Remove or replace it in settings, or turn off API-key mode before retrying with your ChatGPT account.";
    case "invalid-image":
      return isKo
        ? "마지막 메시지의 이미지가 손상됐거나 지원되지 않는 형식입니다. 해당 이미지 첨부를 제거하고 다시 시도해 주세요."
        : "The last message contains a broken or unsupported image. Remove that image attachment, then try again.";
    case "missing-configuration":
      return isKo
        ? "Codex 설정 파일을 읽지 못했습니다. 계정 연결과 로컬 브리지 설치 상태를 확인한 뒤 Chrome을 완전히 재시작해 주세요."
        : "Codex could not read its configuration file. Check account connection and local bridge setup, then fully restart Chrome.";
    case "stale-tab":
      return isKo
        ? "대상 탭이 이미 닫혔거나 이동되었습니다. 현재 탭을 다시 연 뒤 요청을 다시 시도해 주세요."
        : "The target tab was closed or replaced. Reopen the current tab, then try again.";
    case "usage-limit":
      return isKo
        ? formatUsageLimitMessageKo(message)
        : formatUsageLimitMessageEn(message);
    default:
      return null;
  }
}

function formatUsageLimitMessageKo(message: string): string {
  const retryHint = extractRetryHint(message);
  return retryHint
    ? `Codex 사용 한도에 도달했습니다. ${retryHint} 이후 다시 시도하거나 사용량 설정에서 크레딧을 확인해 주세요.`
    : "Codex 사용 한도에 도달했습니다. 사용량 설정에서 크레딧을 확인하거나 나중에 다시 시도해 주세요.";
}

function formatUsageLimitMessageEn(message: string): string {
  const retryHint = extractRetryHint(message);
  return retryHint
    ? `You've hit your Codex usage limit. Try again after ${retryHint}, or check credits in usage settings.`
    : "You've hit your Codex usage limit. Check credits in usage settings or try again later.";
}

function extractRetryHint(message: string): string | null {
  const match = message.match(/try again at\s+(.+?)(?:\.|$)/iu);
  return match?.[1]?.trim() || null;
}
