const MISSING_HOST_PATTERNS = [
  "specified native messaging host not found",
  "native host has exited",
];

const FORBIDDEN_HOST_PATTERNS = [
  "access to the specified native messaging host is forbidden",
  "permission to connect to native host denied",
];

export function toFriendlyNativeHostErrorMessage(rawMessage: string | undefined): string {
  const message = (rawMessage ?? "").trim();
  const normalized = message.toLowerCase();

  if (MISSING_HOST_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "Codex native host is not installed for this browser profile yet. Install the local bridge once, then reload the extension. On Windows, use the extension ID shown in chrome://extensions with --browser=chrome instead of a profile folder.";
  }

  if (FORBIDDEN_HOST_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "This browser profile is connected to a different native host registration. Reinstall the local bridge for the currently loaded extension ID, then reload the extension. On Windows, native messaging is registered through the current-user registry.";
  }

  if (normalized.includes("disconnected")) {
    return "The Codex native host disconnected. Reload the extension, then check Workspace > Connection if it keeps happening.";
  }

  return message || "The Codex native host is unavailable. Reinstall the local bridge once, then reconnect from Workspace > Connection.";
}
