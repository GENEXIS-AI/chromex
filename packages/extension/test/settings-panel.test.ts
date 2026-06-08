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
      "voice",
    ]);
  });

  test("localizes settings sections for Korean browser UI", () => {
    expect(listSettingsSections("ko").map((section) => section.label)).toEqual([
      "일반",
      "연결",
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
    expect(sidepanelSource).toContain('id: "setting-ui-language"');
    expect(sidepanelSource).toContain("formatUiLanguageOptionLabel");
    expect(sidepanelSource).toContain("renderSettingsSelectControl");
    expect(sidepanelSource).toContain("data-settings-select-trigger");
    expect(sidepanelSource).toContain("data-settings-select-option");
    expect(sidepanelSource).toContain("data-settings-select-search");
    expect(sidepanelSource).toContain('role="listbox"');
    expect(sidepanelSource).not.toContain('<select id="setting-ui-language"');
  });

  test("does not duplicate current model selection inside settings", () => {
    expect(sidepanelSource).not.toContain("strings.settingsPanel.modelDescription");
    expect(sidepanelSource).not.toContain('id: "model-select"');
  });

  test("renders current-site custom suggestion controls inside settings", () => {
    expect(sidepanelSource).toContain("renderCustomSiteSuggestionSettings");
    expect(sidepanelSource).toContain('id="create-custom-site-suggestion"');
    expect(sidepanelSource).toContain('data-edit-custom-site-suggestion');
    expect(sidepanelSource).toContain('data-delete-custom-site-suggestion');
    expect(sidepanelSource).toContain("renderCustomSiteSuggestionEditorModal");
    expect(sidepanelSource).toContain('id="custom-site-suggestion-command"');
    expect(sidepanelSource).toContain('id="custom-site-suggestion-prompt"');
    expect(readFinalDeclaration(".custom-site-suggestion-control", "display")).toBe("grid");
    expect(readFinalDeclaration(".custom-site-suggestion-item", "grid-template-columns")).toBe("minmax(0, 1fr) auto auto");
  });

  test("lets dictation choose the microphone or computer audio capture source", () => {
    expect(sidepanelSource).toContain("getVoiceInputSourceSettingsTitle");
    expect(sidepanelSource).toContain("getVoiceInputSourceSettingsDescription");
    expect(sidepanelSource).toContain("renderVoiceInputSourceControl");
    expect(sidepanelSource).toContain('id: "setting-voice-input-source"');
    expect(sidepanelSource).toContain('"voice-input-source"');
    expect(sidepanelSource).toContain('"voice-select"');
    expect(sidepanelSource).toContain("voiceInputAudioSource");
    expect(sidepanelSource).not.toContain('<select id="setting-voice-input-source"');
    expect(readFinalDeclaration(".settings-row-voice-input-source .settings-row-control", "justify-content")).toBe(
      "stretch",
    );
    expect(readFinalDeclaration(".settings-row-voice-select .settings-row-control", "justify-content")).toBe(
      "stretch",
    );
    expect(readFinalDeclaration(".voice-input-source-select-shell", "width")).toBe("100%");
    expect(readFinalDeclaration(".voice-select-shell", "width")).toBe("100%");
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
    expect(readFinalDeclaration(".custom-select-shell", "display")).toBe("block");
    expect(readFinalDeclaration(".settings-select-button", "display")).toBe("grid");
    expect(readFinalDeclaration(".settings-select-menu", "position")).toBe("absolute");
    expect(readFinalDeclaration(".settings-select-menu", "z-index")).toBe("1710");
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

  test("keeps browser action permission mode in composer without a settings card", () => {
    expect(sidepanelSource).toContain("browserActionPermissionMode");
    expect(sidepanelSource).toContain("renderBrowserActionPermissionDropdown");
    expect(sidepanelSource).toContain("composer-permission-menu-trigger");
    expect(sidepanelSource).toContain("data-browser-action-permission-mode");
    expect(sidepanelSource).not.toContain("renderSettingsCard(\n          \"permissions\"");
    expect(sidepanelSource).not.toContain("setting-browser-action-permission-mode");
    expect(readFinalDeclaration(".composer-permission-group", "position")).toBe("relative");
    expect(readFinalDeclaration(".composer-permission-menu", "position")).toBe("absolute");
  });

  test("keeps the composer permission popover visible and neutral until hover", () => {
    expect(readFinalDeclaration(".composer-permission-menu", "z-index")).toBe("1200");
    expect(readFinalDeclaration(".composer-permission-menu-trigger", "background")).toBe("transparent");
    expect(readFinalDeclaration(".composer-permission-menu-row.selected", "background")).toBe("transparent");
    expect(readFinalDeclaration(".browser-action-permission-option.selected", "background")).toBe("transparent");
    expect(css).toContain("@media (max-width: 460px)");
    expect(css).toContain(".composer-permission-menu-trigger .permission-mode-label");
  });

  test("styles settings search as a compact top control", () => {
    expect(sidepanelSource).toContain("function renderViewStickyTop");
    expect(sidepanelSource).toContain('renderViewStickyTop(strings, "skills"');
    expect(sidepanelSource).toContain('renderViewStickyTop(strings, "plugins"');
    expect(readFinalDeclaration(".view-sticky-top", "position")).toBe("sticky");
    expect(readFinalDeclaration(".view-sticky-top", "display")).toBe("grid");
    expect(readFinalDeclaration(".view-sticky-top", "gap")).toBe("10px");
    expect(readFinalDeclaration(".view-sticky-top", "background")).toBe("var(--bg)");
    expect(readFinalDeclaration(".view-sticky-top .view-return-header", "position")).toBe("static");
    expect(readFinalDeclaration(".settings-search-control", "display")).toBe("grid");
    expect(readFinalDeclaration(".settings-search-control", "grid-template-columns")).toBe("20px minmax(0, 1fr)");
    expect(readFinalDeclaration(".settings-search-control input", "min-height")).toBe("40px");
    expect(readFinalDeclaration(".settings-search-control input", "background")).toBe("transparent");
  });

  test("renders plan mode as a dismissible neutral pill", () => {
    expect(sidepanelSource).toContain("function renderComposerPlanModeBadge");
    expect(sidepanelSource).toContain("data-plan-mode-dismiss");
    expect(sidepanelSource).toContain("async function setPlanModeEnabled");
    expect(readFinalDeclaration(".composer-plan-mode-badge", "background")).toBe("transparent");
    expect(readFinalDeclaration(".composer-plan-mode-dismiss", "background")).toBe("transparent");
  });

  test("keeps the light theme flat with borders instead of heavy shadows", () => {
    expect(readFinalDeclaration(':root[data-theme="light"]', "--shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"]', "--shadow-soft")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"]', "--shadow-popover")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"]', "--shadow-composer")).toBe("0 1px 2px rgba(15, 23, 42, 0.05)");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-card', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .app-menu', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .attachment-menu', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .command-popover', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .tab-mention-popover', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-model-dropdown', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-permission-menu', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .native-dialog-modal', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .profile-editor-modal', "box-shadow")).toBe("none");
  });

  test("keeps light theme menus neutral until hover", () => {
    expect(readFinalDeclaration(':root[data-theme="light"] .view-return-header', "background")).toBe("var(--bg)");
    expect(readFinalDeclaration(':root[data-theme="light"] .view-return-header', "backdrop-filter")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-back', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-back:hover', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-select-shell', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-select-button', "background")).toBe("#ffffff");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-select-menu', "background")).toBe("#eef3f8");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-select-option', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-select-option:hover', "background")).toBe("#dfe8f2");
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-model-menu-trigger', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-permission-menu-trigger', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-plan-mode-badge', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .command-popover .suggestion', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-model-menu-row', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .site-suggestion', "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .command-popover .suggestion:hover', "background")).toBe("var(--surface-hover)");
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-model-menu-row:not(.disabled):hover', "background")).toBe(
      "var(--surface-hover)",
    );
  });

  test("uses restrained font weights in light theme settings and menus", () => {
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-card-header h3', "font-weight")).toBe("600");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-row-copy strong', "font-weight")).toBe("600");
    expect(readFinalDeclaration(':root[data-theme="light"] .app-menu-label', "font-weight")).toBe("500");
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-model-menu-copy strong', "font-weight")).toBe("500");
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-permission-menu-copy strong', "font-weight")).toBe("500");
    expect(readFinalDeclaration(':root[data-theme="light"] .message-content h2', "font-weight")).toBe("600");
  });

  test("keeps light profile and site suggestion text readable", () => {
    expect(readFinalDeclaration(':root[data-theme="light"] .profile-editor-title-row h2', "color")).toBe(
      "var(--text)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .profile-editor-field > span', "color")).toBe(
      "var(--text)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .profile-editor-section h3', "color")).toBe(
      "var(--text)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .custom-site-suggestion-site', "color")).toBe(
      "var(--muted-strong)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .custom-site-suggestion-copy strong', "color")).toBe(
      "var(--text)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .custom-site-suggestion-copy small', "color")).toBe(
      "var(--muted)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .custom-site-suggestion-editor-site', "color")).toBe(
      "var(--muted)",
    );
  });
});
