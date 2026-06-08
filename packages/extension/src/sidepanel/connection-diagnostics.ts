type ModelCatalogState = "loading" | "ready" | "empty" | "error";
type RuntimeConfig = {
  codexBinSource: "configured" | "env" | "path" | "common" | "missing";
  configuredCodexBinPathInvalid: boolean;
};

export type HealthTone = "ok" | "warn" | "neutral";
export type NativeHostStatus = "connected" | "setup-needed" | "reconnect";
export type CodexBinaryStatus = "connected" | "automatic" | "not-detected" | "pending";

export interface NativeHostHealth {
  status: NativeHostStatus;
  tone: HealthTone;
  detailSource: "default" | "error";
}

export interface CodexBinaryHealth {
  status: CodexBinaryStatus;
  tone: HealthTone;
  detailSource: "detected" | "recovered" | "missing" | "waiting-for-host";
}

const NATIVE_HOST_SETUP_PATTERNS = [
  "native host is not installed",
  "different native host registration",
  "native host is unavailable",
  "specified native messaging host not found",
  "access to the specified native messaging host is forbidden",
  "permission to connect to native host denied",
];

const NATIVE_HOST_RECONNECT_PATTERNS = [
  "native host disconnected",
  "native host has exited",
  "found but exited immediately",
  "exited immediately",
  "failed to start native messaging host",
];

export function getNativeHostHealth(input: {
  modelCatalogState: ModelCatalogState;
  modelCatalogErrorMessage: string;
}): NativeHostHealth {
  if (input.modelCatalogState !== "error") {
    return {
      status: "connected",
      tone: "ok",
      detailSource: "default",
    };
  }

  const error = input.modelCatalogErrorMessage.toLowerCase();
  if (NATIVE_HOST_SETUP_PATTERNS.some((pattern) => error.includes(pattern))) {
    return {
      status: "setup-needed",
      tone: "warn",
      detailSource: "error",
    };
  }

  if (NATIVE_HOST_RECONNECT_PATTERNS.some((pattern) => error.includes(pattern))) {
    return {
      status: "reconnect",
      tone: "warn",
      detailSource: "error",
    };
  }

  return {
    status: "connected",
    tone: "ok",
    detailSource: "default",
  };
}

export function getCodexBinaryHealth(input: {
  nativeHostStatus: NativeHostStatus;
  runtimeConfig: RuntimeConfig;
  modelCatalogState: ModelCatalogState;
}): CodexBinaryHealth {
  if (input.nativeHostStatus !== "connected") {
    return {
      status: "pending",
      tone: "neutral",
      detailSource: "waiting-for-host",
    };
  }

  if (input.runtimeConfig.codexBinSource === "missing") {
    if (input.modelCatalogState === "ready" || input.modelCatalogState === "empty") {
      return {
        status: "automatic",
        tone: "ok",
        detailSource: "detected",
      };
    }

    if (input.modelCatalogState === "loading") {
      return {
        status: "pending",
        tone: "neutral",
        detailSource: "waiting-for-host",
      };
    }

    return {
      status: "not-detected",
      tone: "warn",
      detailSource: "missing",
    };
  }

  if (input.runtimeConfig.configuredCodexBinPathInvalid) {
    return {
      status: "automatic",
      tone: "ok",
      detailSource: "recovered",
    };
  }

  return {
    status: input.runtimeConfig.codexBinSource === "configured" ? "connected" : "automatic",
    tone: "ok",
    detailSource: "detected",
  };
}
