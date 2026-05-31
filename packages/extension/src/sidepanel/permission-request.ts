export interface OptionalPermissionRequestResult {
  granted: boolean;
  errorMessage: string;
}

type PermissionsApi = Pick<typeof chrome.permissions, "request">;
type RuntimeApi = {
  lastError?: {
    message?: string;
  } | undefined;
};

export function requestOptionalPermissionsWithResult(
  request: chrome.permissions.Permissions,
  permissionsApi: PermissionsApi = chrome.permissions,
  runtimeApi: RuntimeApi = chrome.runtime,
): Promise<OptionalPermissionRequestResult> {
  return new Promise((resolve) => {
    permissionsApi.request(request, (granted) => {
      resolve({
        granted: Boolean(granted),
        errorMessage: runtimeApi.lastError?.message ?? "",
      });
    });
  });
}
