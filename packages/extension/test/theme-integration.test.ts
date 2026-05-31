import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const storageSource = readFileSync(new URL("../src/background/storage.ts", import.meta.url), "utf8");
const sidepanelSource = readFileSync(new URL("../src/sidepanel/index.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../src/sidepanel/i18n.ts", import.meta.url), "utf8");
const sidepanelCss = readFileSync(new URL("../public/sidepanel.css", import.meta.url), "utf8");
const micPermissionCss = readFileSync(new URL("../public/mic-permission.css", import.meta.url), "utf8");

function readFinalDeclaration(selector: string, property: string): string {
  const css = sidepanelCss.replace(/\/\*[\s\S]*?\*\//g, "");
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

describe("theme integration", () => {
  test("persists the theme setting and exposes it in the settings UI", () => {
    expect(storageSource).toContain('uiTheme: "system"');
    expect(storageSource).toContain("normalizeUiThemeSetting");
    expect(sidepanelSource).toContain("renderThemeSelect");
    expect(sidepanelSource).toContain("data-theme-choice");
    expect(sidepanelSource).toContain('role="radiogroup"');
    expect(sidepanelSource).toContain("syncDocumentTheme");
    expect(i18nSource).toContain("themeSystem");
    expect(i18nSource).toContain("themeLight");
  });

  test("ships light/system CSS instead of a dark-only panel", () => {
    expect(sidepanelCss).toContain(':root[data-theme="light"]');
    expect(sidepanelCss).toContain('[data-theme-setting="system"]');
    expect(sidepanelCss).toContain(".theme-choice-grid");
    expect(sidepanelCss).toContain(".theme-preview-system");
    expect(sidepanelCss).toContain(':root[data-theme="light"] .view-return-header');
    expect(sidepanelCss).toContain(':root[data-theme="light"] .message-code-block');
    expect(sidepanelCss).toContain(':root[data-theme="light"] .tab-mention-header');
    expect(sidepanelCss).toContain(':root[data-theme="light"] .composer-model-trigger-label');
    expect(sidepanelCss).toContain("color-scheme: light");
    expect(micPermissionCss).toContain("@media (prefers-color-scheme: light)");
  });

  test("maps high-traffic chat, activity, settings, and menu surfaces to light theme tokens", () => {
    expect(sidepanelCss).toContain("--surface-elevated:");
    expect(sidepanelCss).toContain("--surface-hover:");
    expect(sidepanelCss).toContain("--shadow-popover:");
    expect(sidepanelCss).toContain("--activity-muted:");
    expect(readFinalDeclaration(':root[data-theme="light"]', "--shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"]', "--shadow-soft")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"]', "--shadow-popover")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"]', "--shadow-composer")).toBe("0 1px 2px rgba(15, 23, 42, 0.05)");
    expect(readFinalDeclaration(':root[data-theme="light"] .prompt-activity-card', "border-bottom")).toBe(
      "1px solid var(--line)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .prompt-activity-copy strong', "color")).toBe(
      "var(--text)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .message-trace-summary', "color")).toBe(
      "var(--activity-muted)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .message-trace-line.running .message-trace-line-text', "background")).toContain(
      "var(--activity-shimmer)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .app-menu', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .app-menu-chat-row:hover', "background")).toBe(
      "var(--surface-hover)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-card', "box-shadow")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .settings-row', "border-top")).toBe(
      "1px solid var(--line)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-shell', "box-shadow")).toBe(
      "var(--shadow-composer)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-dictation-panel', "background")).toBe(
      "var(--surface-2)",
    );
    expect(readFinalDeclaration(".view-sticky-top", "background")).toBe("var(--bg)");
    expect(readFinalDeclaration(".view-return-header", "backdrop-filter")).toBe("none");
  });

  test("keeps light popover list rows transparent until hover or keyboard focus", () => {
    for (const selector of [
      ':root[data-theme="light"] .attachment-menu-item',
      ':root[data-theme="light"] .command-popover .suggestion',
      ':root[data-theme="light"] .tab-mention-row',
      ':root[data-theme="light"] .tab-mention-action',
      ':root[data-theme="light"] .composer-model-menu-row',
      ':root[data-theme="light"] .composer-permission-menu-row',
      ':root[data-theme="light"] .browser-action-permission-option',
      ':root[data-theme="light"] .site-suggestion',
      ':root[data-theme="light"] .selected-page-context-chip',
    ]) {
      expect(readFinalDeclaration(selector, "background")).toBe("transparent");
      expect(readFinalDeclaration(selector, "box-shadow")).toBe("none");
    }

    for (const selector of [
      ':root[data-theme="light"] .app-menu-row.selected',
      ':root[data-theme="light"] .command-popover .suggestion.profile.active',
      ':root[data-theme="light"] .tab-mention-row.selected',
      ':root[data-theme="light"] .composer-model-menu-row.selected',
      ':root[data-theme="light"] .composer-permission-menu-row.selected',
      ':root[data-theme="light"] .browser-action-permission-option.selected',
    ]) {
      expect(readFinalDeclaration(selector, "background")).toBe("transparent");
    }

    for (const selector of [
      ':root[data-theme="light"] .attachment-menu-item:hover',
      ':root[data-theme="light"] .command-popover .suggestion:hover',
      ':root[data-theme="light"] .command-popover .suggestion.keyboard-active',
      ':root[data-theme="light"] .tab-mention-row:hover',
      ':root[data-theme="light"] .tab-mention-row.keyboard-active',
      ':root[data-theme="light"] .composer-model-menu-row:not(.disabled):hover',
      ':root[data-theme="light"] .composer-permission-menu-row:hover',
      ':root[data-theme="light"] .browser-action-permission-option:hover',
      ':root[data-theme="light"] .site-suggestion:hover',
    ]) {
      expect(readFinalDeclaration(selector, "background")).toBe("var(--surface-hover)");
    }
  });

  test("keeps light composer controls visually neutral until interaction", () => {
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-model-menu-trigger', "background")).toBe(
      "transparent",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-permission-menu-trigger', "background")).toBe(
      "transparent",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-permission-menu-trigger .permission-mode-glyph', "background")).toBe(
      "transparent",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-submit .send-button.live', "background")).toBe(
      "#111318",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-submit .send-button.live', "color")).toBe(
      "#ffffff",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-submit .send-button.live-active', "background")).toBe(
      "#111318",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .composer-submit .send-button.live-active', "color")).toBe(
      "#ffffff",
    );
  });
});
