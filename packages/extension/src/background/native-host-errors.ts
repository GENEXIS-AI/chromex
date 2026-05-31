const MISSING_HOST_PATTERNS = [
  "specified native messaging host not found",
  "native messaging host host name is not registered",
];

const EXITED_HOST_PATTERNS = [
  "native host has exited",
  "failed to start native messaging host",
];

const FORBIDDEN_HOST_PATTERNS = [
  "access to the specified native messaging host is forbidden",
  "permission to connect to native host denied",
];

export function toFriendlyNativeHostErrorMessage(rawMessage: string | undefined): string {
  const message = (rawMessage ?? "").trim();
  const normalized = message.toLowerCase();

  if (MISSING_HOST_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "Codex native host is not installed for this browser profile yet. Install the local bridge once, then reload the extension. Chrome Web Store installs must use the latest Chromex local bridge installer, which includes the Store extension ID automatically. On Windows, run node scripts/install-native-host.mjs --browser=chrome, then verify both reg query commands with /reg:32 and /reg:64.";
  }

  if (EXITED_HOST_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "The Codex native host was found but exited immediately. Rebuild and reinstall the local bridge, then reload the extension and fully restart Chrome if it keeps failing. Check Workspace > Connection for the bridge log and avoid running a separate codex app-server --listen process while testing Chromex.";
  }

  if (FORBIDDEN_HOST_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "This browser profile is connected to a different native host registration. Reinstall the local bridge for the currently loaded extension ID, then reload the extension. On Windows, native messaging is registered through the current-user registry.";
  }

  if (normalized.includes("disconnected")) {
    return "The Codex native host disconnected. Reload the extension, then check Workspace > Connection if it keeps happening.";
  }

  return message || "The Codex native host is unavailable. Reinstall the local bridge once, then reconnect from Workspace > Connection.";
}
