import { toOriginPermissionPattern } from "./permission-plans.js";
import { classifyRuntimeMessageError } from "./runtime-errors.js";

export function buildTabOriginPermission(url: string | undefined): chrome.permissions.Permissions | null {
  if (!url) {
    return null;
  }

  const originPattern = toOriginPermissionPattern(url);
  if (!originPattern) {
    return null;
  }

  return {
    origins: [originPattern],
  };
}

export function buildVisibleTabCapturePermission(): chrome.permissions.Permissions {
  return {
    origins: ["<all_urls>"],
  };
}

export function shouldAttemptTabOriginRecovery(url: string | undefined, error: unknown): boolean {
  return Boolean(buildTabOriginPermission(url)) && classifyRuntimeMessageError(error) === "host-access";
}

export class SitePermissionRequiredError extends Error {
  readonly permission: chrome.permissions.Permissions;
  readonly rationale: string;

  constructor(url: string | undefined, options: { captureOnly?: boolean } = {}) {
    const permission = options.captureOnly ? buildVisibleTabCapturePermission() : buildTabOriginPermission(url);
    const message = options.captureOnly
      ? "Codex needs screen capture access before it can capture the current screen. Approve the browser permission prompt, then try again."
      : "Codex needs access to this site before it can read this tab. Approve the browser permission prompt, then try again.";
    super(message);
    this.name = "SitePermissionRequiredError";
    this.permission = permission ?? {};
    this.rationale = message;
  }
}

export function isSitePermissionRequiredError(error: unknown): error is SitePermissionRequiredError {
  if (error instanceof SitePermissionRequiredError) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    name?: unknown;
    permission?: unknown;
    rationale?: unknown;
  };
  return (
    candidate.name === "SitePermissionRequiredError" &&
    typeof candidate.permission === "object" &&
    candidate.permission !== null &&
    typeof candidate.rationale === "string"
  );
}
