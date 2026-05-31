import type { UiInitPayload } from "../types.js";
import type { CodexBinaryStatus, NativeHostStatus } from "./connection-diagnostics.js";

type AuthOnboardingIssue = "native-host" | "codex-binary" | null;

export type AuthOnboardingRuntimeStepId = "native-host" | "codex-binary" | "account";
export type AuthOnboardingRuntimeStepState = "ready" | "blocked" | "pending";

export type AuthOnboardingRuntimeStep = {
  id: AuthOnboardingRuntimeStepId;
  state: AuthOnboardingRuntimeStepState;
};

export function shouldShowAuthOnboarding(accountStatus: UiInitPayload["accountStatus"] | null): boolean {
  return accountStatus !== null && !accountStatus.codexAuthenticated;
}

export function shouldShowUsageNoticeOnboarding(input: {
  accountStatus: UiInitPayload["accountStatus"] | null;
  usageNoticeAccepted: boolean;
}): boolean {
  return Boolean(input.accountStatus?.codexAuthenticated) && !input.usageNoticeAccepted;
}

export function resolveAuthOnboardingReadiness(input: {
  nativeHostStatus: NativeHostStatus;
  codexBinaryStatus: CodexBinaryStatus;
}): {
  canStartAuth: boolean;
  primaryIssue: AuthOnboardingIssue;
  steps: AuthOnboardingRuntimeStep[];
} {
  if (input.nativeHostStatus !== "connected") {
    return {
      canStartAuth: false,
      primaryIssue: "native-host",
      steps: [
        { id: "native-host", state: "blocked" },
        { id: "codex-binary", state: "pending" },
        { id: "account", state: "pending" },
      ],
    };
  }

  if (input.codexBinaryStatus === "not-detected") {
    return {
      canStartAuth: false,
      primaryIssue: "codex-binary",
      steps: [
        { id: "native-host", state: "ready" },
        { id: "codex-binary", state: "blocked" },
        { id: "account", state: "pending" },
      ],
    };
  }

  return {
    canStartAuth: true,
    primaryIssue: null,
    steps: [
      { id: "native-host", state: "ready" },
      { id: "codex-binary", state: input.codexBinaryStatus === "pending" ? "pending" : "ready" },
      { id: "account", state: "pending" },
    ],
  };
}
