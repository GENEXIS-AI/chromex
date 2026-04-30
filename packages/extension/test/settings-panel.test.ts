import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { listSettingsSections } from "../src/sidepanel/settings-panel.js";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");
const storageSource = readFileSync(resolve(process.cwd(), "src/background/storage.ts"), "utf8");
const css = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function readFinalDeclaration(selector: string, property: string): string {
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let value = "";

  while ((match = blockPattern.exec(css))) {
    const selectorList = (match[1] ?? "")
      .split(",")
      .map((item) => item.trim());
    if (!selectorList.includes(selector)) {
      continue;
    }

    const declarations = match[2] ?? "";
    for (const declaration of declarations.split(";")) {
      const [name, ...rawValue] = declaration.split(":");
      if (name?.trim() === property) {
        value = rawValue.join(":").trim();
      }
    }
  }

  return value;
}

describe("settings panel structure", () => {
  test("keeps the public settings sections simple and scannable", () => {
    expect(listSettingsSections("ko").map((section) => section.id)).toEqual([
      "general",
      "connection",
      "permissions",
      "voice",
    ]);
  });

  test("localizes settings sections for Korean browser UI", () => {
    expect(listSettingsSections("ko").map((section) => section.label)).toEqual([
      "일반",
      "연결",
      "권한",
      "음성",
    ]);
  });

  test("keeps a sticky return-to-chat action in context and settings views", () => {
    expect(sidepanelSource).toContain("function renderBackToChatHeader");
    expect(sidepanelSource).toContain('renderBackToChatHeader(strings, "context")');
    expect(sidepanelSource).toContain('renderBackToChatHeader(strings, "settings")');
    expect(readFinalDeclaration(".view-return-header", "position")).toBe("sticky");
    expect(readFinalDeclaration(".view-return-header", "top")).toBe("0");
    expect(readFinalDeclaration(".view-return-header", "z-index")).toBe("30");
  });

  test("stacks dense profile and account controls so settings rows do not overflow", () => {
    expect(sidepanelSource).toMatch(/renderSettingsRow\(\s*"profile"/);
    expect(sidepanelSource).toMatch(/renderSettingsRow\(\s*"account"/);
    expect(readFinalDeclaration(".settings-row.expanded-control", "grid-template-columns")).toBe("minmax(0, 1fr)");
    expect(readFinalDeclaration(".settings-row.expanded-control .settings-row-control", "justify-self")).toBe("stretch");
    expect(readFinalDeclaration(".profile-settings-control", "display")).toBe("grid");
    expect(readFinalDeclaration(".profile-settings-control", "grid-template-columns")).toBe("34px minmax(0, 1fr)");
    expect(readFinalDeclaration(".profile-settings-actions", "grid-column")).toBe("1 / -1");
    expect(readFinalDeclaration(".settings-action-cluster.account-settings-actions", "justify-content")).toBe("flex-start");
    expect(readFinalDeclaration(".settings-status-pill", "max-width")).toBe("100%");
  });

  test("renders app UI language controls in settings", () => {
    expect(sidepanelSource).toContain("renderLanguageSelect");
    expect(sidepanelSource).toContain('id="setting-ui-language"');
    expect(sidepanelSource).toContain("formatUiLanguageOptionLabel");
  });

  test("renders current-site custom suggestion controls inside settings", () => {
    expect(sidepanelSource).toContain("renderCustomSiteSuggestionSettings");
    expect(sidepanelSource).toContain('id="custom-site-suggestion-input"');
    expect(sidepanelSource).toContain('data-delete-custom-site-suggestion');
    expect(readFinalDeclaration(".custom-site-suggestion-control", "display")).toBe("grid");
    expect(readFinalDeclaration(".custom-site-suggestion-form", "grid-template-columns")).toBe("minmax(0, 1fr) auto");
  });

  test("exposes a clear-all chat history action inside settings", () => {
    expect(sidepanelSource).toContain("strings.settingsPanel.chatHistoryDescription");
    expect(sidepanelSource).toContain('`${strings.settingsPanel.chatHistoryDescription} (${state.recentChats.length})`');
    expect(sidepanelSource).toContain('data-clear-chat-history="settings"');
    expect(sidepanelSource).toContain('returnToSettings: button.dataset.clearChatHistory === "settings"');
    expect(sidepanelSource).toContain('state.recentChats.length ? "" : "disabled"');
  });

  test("previews the number of recent chats before clearing history", () => {
    expect(sidepanelSource).toContain("const visibleChatCount = state.recentChats.length");
    expect(sidepanelSource).toContain('`${strings.prompts.clearChatHistoryConfirm}\\n\\n${strings.labels.recentChats}: ${visibleChatCount}`');
    expect(sidepanelSource).toContain('title: `${strings.actions.clearRecentChats} (${visibleChatCount})`');
    expect(sidepanelSource).toContain("deletedCount: number");
    expect(sidepanelSource).toContain('`${strings.status.chatHistoryCleared} (${result.deletedCount})`');
  });

  test("does not add unused storage usage plumbing for chat history counts", () => {
    expect(sidepanelSource).not.toContain('type: "storage.usage"');
    expect(backgroundSource).not.toContain('case "storage.usage"');
    expect(storageSource).not.toContain("getStorageUsage");
  });

  test("uses compact typography for settings rows and controls", () => {
    expect(readFinalDeclaration(".settings-page-header h2", "font-size")).toBe("22px");
    expect(readFinalDeclaration(".settings-page-header h2", "line-height")).toBe("30px");
    expect(readFinalDeclaration(".settings-card-header h3", "font-size")).toBe("15px");
    expect(readFinalDeclaration(".settings-row", "min-height")).toBe("56px");
    expect(readFinalDeclaration(".settings-row", "padding")).toBe("11px 14px");
    expect(readFinalDeclaration(".settings-row-copy strong", "font-size")).toBe("13px");
    expect(readFinalDeclaration(".settings-row-copy span", "font-size")).toBe("12px");
    expect(readFinalDeclaration(".settings-select-shell", "min-height")).toBe("36px");
    expect(readFinalDeclaration(".settings-compact-button", "min-height")).toBe("36px");
    expect(readFinalDeclaration(".settings-compact-button", "font-size")).toBe("12px");
  });

  test("uses compact typography in the context view menu panels", () => {
    expect(readFinalDeclaration(".context-view .surface", "padding")).toBe("12px");
    expect(readFinalDeclaration(".context-view .stack-header h2", "font-size")).toBe("13px");
    expect(readFinalDeclaration(".context-view .stack-copy", "font-size")).toBe("12px");
    expect(readFinalDeclaration(".context-view .empty-state", "font-size")).toBe("12px");
    expect(readFinalDeclaration(".context-view .history-item", "font-size")).toBe("12px");
    expect(readFinalDeclaration(".context-view .tab-row", "font-size")).toBe("12px");
    expect(readFinalDeclaration(".context-view .chip", "min-height")).toBe("32px");
    expect(readFinalDeclaration(".context-view .chip", "font-size")).toBe("12px");
  });

  test("renders browser action permission mode in settings and composer", () => {
    expect(sidepanelSource).toContain("browserActionPermissionMode");
    expect(sidepanelSource).toContain("renderBrowserActionPermissionDropdown");
    expect(sidepanelSource).toContain("composer-permission-menu-trigger");
    expect(sidepanelSource).toContain("data-browser-action-permission-mode");
    expect(sidepanelSource).toContain("setting-browser-action-permission-mode");
    expect(readFinalDeclaration(".composer-permission-group", "position")).toBe("relative");
    expect(readFinalDeclaration(".composer-permission-menu", "position")).toBe("fixed");
    expect(readFinalDeclaration(".browser-action-permission-control", "display")).toBe("grid");
  });

  test("keeps the composer permission popover visible and neutral until hover", () => {
    expect(readFinalDeclaration(".composer-permission-menu", "z-index")).toBe("1200");
    expect(readFinalDeclaration(".composer-permission-menu-trigger", "background")).toBe("transparent");
    expect(readFinalDeclaration(".composer-permission-menu-row.selected", "background")).toBe("transparent");
    expect(readFinalDeclaration(".browser-action-permission-option.selected", "background")).toBe("transparent");
    expect(css).toContain("@media (max-width: 460px)");
    expect(css).toContain(".composer-permission-menu-trigger .permission-mode-label");
  });
});
