import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { getUiStrings } from "../src/sidepanel/i18n.js";
import {
  resolveAuthOnboardingReadiness,
  shouldShowAuthOnboarding,
  shouldShowUsageNoticeOnboarding,
} from "../src/sidepanel/onboarding.js";
import type { UiInitPayload } from "../src/types.js";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const sidepanelCss = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8");

const signedOutAccount: UiInitPayload["accountStatus"] = {
  authMode: null,
  codexAuthenticated: false,
  multimodalAvailable: false,
  openAiApiKeyConfigured: false,
};

describe("auth onboarding", () => {
  test("shows onboarding only after Codex account status confirms the user is signed out", () => {
    expect(shouldShowAuthOnboarding(null)).toBe(false);
    expect(shouldShowAuthOnboarding(signedOutAccount)).toBe(true);
    expect(shouldShowAuthOnboarding({ ...signedOutAccount, codexAuthenticated: true, authMode: "chatgpt" })).toBe(false);
  });

  test("localizes welcome copy and login choices", () => {
    expect(getUiStrings("en").onboarding.title).toBe("Welcome to Chromex");
    expect(getUiStrings("en").onboarding.chatgptCta).toBe("Continue with ChatGPT");
    expect(getUiStrings("en").onboarding.nativeHostSetup).toContain("local bridge");
    expect(getUiStrings("en").onboarding.codexBinaryMissing).toContain("Codex");
    expect(getUiStrings("en").onboarding.codexBinaryMissing).toContain("npm install -g @openai/codex");
    expect(getUiStrings("en").onboarding.codexBinaryMissing).toContain("%APPDATA%\\npm\\codex.cmd");
    expect(getUiStrings("en").onboarding.installBody).toContain("package.json");
    expect(getUiStrings("en").onboarding.installBody).toContain("close every Chrome window");
    expect(getUiStrings("ko").onboarding.title).toBe("Welcome to Chromex");
    expect(getUiStrings("ko").onboarding.apiCta).toBe("API 키로 사용");
    expect(getUiStrings("ko").onboarding.nativeHostSetup).toContain("로컬 브리지");
    expect(getUiStrings("ko").onboarding.webOnlyUnavailable).toContain("로컬 브리지");
    expect(getUiStrings("ko").onboarding.installBody).toContain("package.json");
    expect(getUiStrings("ko").onboarding.codexBinaryMissing).toContain("where codex");
  });

  test("renders a centered internal onboarding surface with existing login actions", () => {
    expect(sidepanelSource).toContain("renderAuthOnboarding");
    expect(sidepanelSource).toContain("shouldShowAuthOnboarding(state.accountStatus)");
    expect(sidepanelSource).toContain('id="onboarding-chatgpt-login"');
    expect(sidepanelSource).toContain('id="onboarding-apikey-login"');
    expect(sidepanelSource).toContain('id="onboarding-reconnect"');
    expect(sidepanelSource).toContain('id="onboarding-open-settings"');
    expect(sidepanelSource).toContain('class="auth-onboarding-install"');
    expect(sidepanelSource).toContain('class="auth-onboarding-install-guide"');
    expect(sidepanelSource).toContain("https://genexis-ai.github.io/chromex/install/");
    expect(sidepanelSource).toContain("getNativeHostInstallCopy(strings)");
    expect(sidepanelSource).toContain("isChromeWebStoreInstall");
    expect(sidepanelSource).toContain("odlalmnpmmakfigepbaabimjcmcppgfo");
    expect(sidepanelSource).toContain("syncAuthOnboardingAutoReconnect");
    expect(sidepanelSource).toContain("getNativeHostInstallCommand(strings)");
    expect(sidepanelSource).toContain("formatNativeHostInstallCommand");
    expect(sidepanelSource).toContain('.join("\\n")');
    expect(sidepanelSource).toContain("chrome.runtime?.id");
    expect(sidepanelSource).toContain("strings.onboarding.webOnlyUnavailable");
    expect(sidepanelSource).toContain('openNativeTextDialog("api-key")');
    expect(sidepanelCss).toContain(".auth-onboarding");
    expect(sidepanelCss).toContain(".auth-onboarding-card");
    expect(sidepanelCss).toContain(".auth-onboarding-readiness");
    expect(sidepanelCss).toContain(".auth-onboarding-install");
    expect(sidepanelCss).toContain(".auth-onboarding-install-guide");
    expect(sidepanelCss).toContain("white-space: pre-wrap");
  });

  test("blocks login until the local native host and Codex runtime are ready", () => {
    expect(
      resolveAuthOnboardingReadiness({
        nativeHostStatus: "setup-needed",
        codexBinaryStatus: "pending",
      }),
    ).toMatchObject({
      canStartAuth: false,
      primaryIssue: "native-host",
    });

    expect(
      resolveAuthOnboardingReadiness({
        nativeHostStatus: "connected",
        codexBinaryStatus: "not-detected",
      }),
    ).toMatchObject({
      canStartAuth: false,
      primaryIssue: "codex-binary",
    });

    expect(
      resolveAuthOnboardingReadiness({
        nativeHostStatus: "connected",
        codexBinaryStatus: "automatic",
      }),
    ).toMatchObject({
      canStartAuth: true,
      primaryIssue: null,
    });
  });
});

describe("usage notice onboarding", () => {
  test("shows the post-login notice only after Codex authentication and before acceptance", () => {
    expect(
      shouldShowUsageNoticeOnboarding({
        accountStatus: null,
        usageNoticeAccepted: false,
      }),
    ).toBe(false);
    expect(
      shouldShowUsageNoticeOnboarding({
        accountStatus: signedOutAccount,
        usageNoticeAccepted: false,
      }),
    ).toBe(false);
    expect(
      shouldShowUsageNoticeOnboarding({
        accountStatus: { ...signedOutAccount, codexAuthenticated: true, authMode: "chatgpt" },
        usageNoticeAccepted: false,
      }),
    ).toBe(true);
    expect(
      shouldShowUsageNoticeOnboarding({
        accountStatus: { ...signedOutAccount, codexAuthenticated: true, authMode: "chatgpt" },
        usageNoticeAccepted: true,
      }),
    ).toBe(false);
  });

  test("renders a first-run disclosure screen before the chat surface", () => {
    expect(sidepanelSource).toContain("renderUsageNoticeOnboarding");
    expect(sidepanelSource).toContain("shouldShowUsageNoticeOnboarding");
    expect(sidepanelSource).toContain("data-usage-notice-accept");
    expect(sidepanelSource).toContain("usageNoticeAccepted: true");
    expect(sidepanelCss).toContain(".usage-notice-onboarding");
    expect(sidepanelCss).toContain(".usage-notice-card");
  });

  test("keeps the first-run disclosure compact enough for side panel viewports", () => {
    expect(sidepanelCss).toContain("place-items: start center");
    expect(sidepanelCss).toContain("width: min(100%, 680px)");
    expect(sidepanelCss).toContain("font-size: clamp(28px, 5.4vw, 40px)");
    expect(sidepanelCss).toContain("min-height: 38px");
    expect(sidepanelCss).toContain("@media (max-width: 420px)");
  });

  test("localizes the first-run disclosure copy", () => {
    expect(getUiStrings("en").usageNotice.title).toBe("Before you start chatting");
    expect(getUiStrings("ko").usageNotice.title).toBe("채팅을 시작하기 전에");
    expect(getUiStrings("ko").usageNotice.startCta).toBe("채팅 시작");
  });
});
