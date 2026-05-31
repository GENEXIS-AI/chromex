import {
  isBrowserPermissionRequiredError,
  type BrowserPermissionRequiredError,
} from "../browser-permission-errors.js";
import { isSitePermissionRequiredError, type SitePermissionRequiredError } from "../page-access.js";
import { classifyRuntimeMessageError, isRetryableRuntimeMessageError } from "../runtime-errors.js";

export type ExpectedPermissionError = BrowserPermissionRequiredError | SitePermissionRequiredError;

export type ExpectedPermissionErrorResponse = {
  error: string;
  requiresPermission: true;
  permission: chrome.permissions.Permissions;
  rationale: string;
};

export function toExpectedPermissionErrorResponse(error: unknown): ExpectedPermissionErrorResponse | null {
  if (!isSitePermissionRequiredError(error) && !isBrowserPermissionRequiredError(error)) {
    return null;
  }

  return {
    error: error.message,
    requiresPermission: true,
    permission: error.permission,
    rationale: error.rationale,
  };
}

export function shouldLogBackgroundMessageError(error: unknown): boolean {
  if (toExpectedPermissionErrorResponse(error) !== null) {
    return false;
  }
  if (isRetryableRuntimeMessageError(error)) {
    return false;
  }
  if (classifyRuntimeMessageError(error) === "auth-expired") {
    return false;
  }

  return !isExpectedRecoverableBackgroundError(error);
}

function isExpectedRecoverableBackgroundError(error: unknown): boolean {
  switch (classifyRuntimeMessageError(error)) {
    case "auth-expired":
    case "extension-reload-required":
    case "invalid-api-key":
    case "invalid-image":
    case "missing-configuration":
    case "stale-tab":
    case "usage-limit":
      return true;
    default:
      break;
  }

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("allow access to file urls") ||
    message.includes("chrome blocks extensions from reading or modifying this protected browser page") ||
    message.includes("chrome web store pages cannot be scripted") ||
    message.includes("generated image asset is no longer available") ||
    message.includes("extensions gallery cannot be scripted") ||
    /\bthread not found\b|no turns for conversation|unknown conversation/iu.test(message)
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return String(error ?? "");
}
