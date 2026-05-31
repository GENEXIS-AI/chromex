export class BrowserPermissionRequiredError extends Error {
  readonly permission: chrome.permissions.Permissions;
  readonly rationale: string;

  constructor(permission: chrome.permissions.Permissions, rationale: string) {
    super(rationale);
    this.name = "BrowserPermissionRequiredError";
    this.permission = permission;
    this.rationale = rationale;
  }
}

export function isBrowserPermissionRequiredError(error: unknown): error is BrowserPermissionRequiredError {
  if (error instanceof BrowserPermissionRequiredError) {
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
    candidate.name === "BrowserPermissionRequiredError" &&
    typeof candidate.permission === "object" &&
    candidate.permission !== null &&
    typeof candidate.rationale === "string"
  );
}
