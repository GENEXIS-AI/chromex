export type RuntimeMessageErrorKind =
  | "transient-disconnect"
  | "stale-tab"
  | "extension-reload-required"
  | "host-access"
  | "auth-expired"
  | "invalid-api-key"
  | "usage-limit"
  | "invalid-image"
  | "missing-configuration"
  | "unknown";

const TRANSIENT_DISCONNECT_PATTERNS = [
  /message channel closed before a response was received/i,
  /receiving end does not exist/i,
  /message port closed before a response was received/i,
  /extension context invalidated/i,
  /frame with id \d+ was removed/i,
  /temporarily lost (?:its )?connection to this tab/i,
];

const STALE_TAB_PATTERNS = [
  /no tab with id[: ]\s*\d+/i,
  /tab with id \d+ does not exist/i,
];

const EXTENSION_RELOAD_REQUIRED_PATTERNS = [
  /could not load file:\s*['"]?content\.js['"]?/i,
  /failed to load file:\s*['"]?content\.js['"]?/i,
];

const HOST_ACCESS_PATTERNS = [
  /cannot access contents of url/i,
  /missing host permission/i,
  /either the '<all_urls>' or 'activetab' permission is required/i,
];

const AUTH_EXPIRED_PATTERNS = [
  /access token could not be refreshed/i,
  /signed in to another account/i,
  /please sign in again/i,
];

const INVALID_API_KEY_PATTERNS = [
  /incorrect API key provided/i,
  /auth error code:\s*invalid_api_key/i,
  /\binvalid_api_key\b/i,
  /401 Unauthorized.*API key/i,
];

const USAGE_LIMIT_PATTERNS = [
  /you(?:'|’)ve hit your usage limit/i,
  /usage limit/i,
  /purchase more credits/i,
];

const INVALID_IMAGE_PATTERNS = [
  /invalid image in your last message/i,
  /please remove it and try again/i,
];

const MISSING_CONFIGURATION_PATTERNS = [/failed to load configuration/i];

export function classifyRuntimeMessageError(error: unknown): RuntimeMessageErrorKind {
  const message = toErrorMessage(error);
  if (STALE_TAB_PATTERNS.some((pattern) => pattern.test(message))) {
    return "stale-tab";
  }
  if (EXTENSION_RELOAD_REQUIRED_PATTERNS.some((pattern) => pattern.test(message))) {
    return "extension-reload-required";
  }
  if (INVALID_API_KEY_PATTERNS.some((pattern) => pattern.test(message))) {
    return "invalid-api-key";
  }
  if (USAGE_LIMIT_PATTERNS.some((pattern) => pattern.test(message))) {
    return "usage-limit";
  }
  if (INVALID_IMAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return "invalid-image";
  }
  if (MISSING_CONFIGURATION_PATTERNS.some((pattern) => pattern.test(message))) {
    return "missing-configuration";
  }
  if (TRANSIENT_DISCONNECT_PATTERNS.some((pattern) => pattern.test(message))) {
    return "transient-disconnect";
  }
  if (HOST_ACCESS_PATTERNS.some((pattern) => pattern.test(message))) {
    return "host-access";
  }
  if (AUTH_EXPIRED_PATTERNS.some((pattern) => pattern.test(message))) {
    return "auth-expired";
  }
  return "unknown";
}

export function isRetryableRuntimeMessageError(error: unknown): boolean {
  const kind = classifyRuntimeMessageError(error);
  return kind === "transient-disconnect" || kind === "stale-tab";
}

export function isRecoverableTabMessagingError(error: unknown): boolean {
  const kind = classifyRuntimeMessageError(error);
  return kind === "transient-disconnect" || kind === "stale-tab" || kind === "extension-reload-required";
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "");
}
