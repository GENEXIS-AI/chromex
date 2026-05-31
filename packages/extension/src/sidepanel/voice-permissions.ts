export type MicrophonePermissionErrorKind = "dismissed" | "denied" | "unavailable" | "unknown";
export type MicrophonePermissionWindowResult = MicrophonePermissionErrorKind | "granted";

const DISMISSED_PATTERNS = [/permission dismissed/i, /request dismissed/i, /\bdismissed\b/i, /\bcancelled\b/i, /\bcanceled\b/i];
const DENIED_PATTERNS = [/permission denied/i, /denied by system/i, /not allowed/i, /blocked/i];
const UNAVAILABLE_NAMES = new Set(["NotFoundError", "DevicesNotFoundError", "OverconstrainedError", "NotReadableError", "TrackStartError"]);
const DENIED_NAMES = new Set(["NotAllowedError", "PermissionDeniedError", "SecurityError"]);

export function classifyMicrophonePermissionError(error: unknown): MicrophonePermissionErrorKind {
  const name = getErrorName(error);
  const message = getErrorMessage(error);

  if (DISMISSED_PATTERNS.some((pattern) => pattern.test(message))) {
    return "dismissed";
  }

  if (UNAVAILABLE_NAMES.has(name) || /device not found/i.test(message) || /no.*microphone/i.test(message)) {
    return "unavailable";
  }

  if (DENIED_NAMES.has(name) || DENIED_PATTERNS.some((pattern) => pattern.test(message))) {
    return "denied";
  }

  return "unknown";
}

export function shouldOpenDedicatedMicrophonePermissionWindow(
  error: unknown,
  options: { reconnect?: boolean } = {},
): boolean {
  return !options.reconnect && classifyMicrophonePermissionError(error) === "dismissed";
}

export function microphonePermissionResultToError(result: MicrophonePermissionWindowResult, message?: string): Error {
  if (result === "denied") {
    return new DOMException(message || "Permission denied", "NotAllowedError");
  }
  if (result === "unavailable") {
    return new DOMException(message || "Requested device not found", "NotFoundError");
  }
  if (result === "dismissed") {
    return new DOMException(message || "Permission dismissed", "NotAllowedError");
  }
  return new Error(message || "Microphone permission was not granted.");
}

function getErrorName(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) {
    return error.name;
  }
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return "";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error ?? "");
}
