import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");
const sidepanelI18nSource = readFileSync(resolve(process.cwd(), "src/sidepanel/i18n.ts"), "utf8");
const css = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function getFunctionSource(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);

  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      opened = true;
    } else if (char === "}") {
      depth -= 1;
      if (opened && depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return source.slice(start);
}

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

describe("Codex skill toggles", () => {
  test("renders Codex app-server skills as persistent on/off toggles", () => {
    expect(sidepanelSource).toContain("renderSkillsView");
    expect(sidepanelSource).toContain("renderCodexSkillToggle");
    expect(sidepanelSource).toContain("data-codex-skill-toggle=");
    expect(sidepanelSource).toContain("toggleCodexSkillEnabled");
    expect(sidepanelSource).not.toContain("data-app-server-skill-id=");
    expect(sidepanelSource).not.toContain("renderCodexSkillSettings");
    expect(css).not.toContain(".settings-codex-skill-list");
  });

  test("sends only enabled Codex skills to the prompt runtime", () => {
    expect(sidepanelSource).toContain("getPromptStructuredInputs()");
    expect(sidepanelSource).toContain("mergeStructuredInputsWithEnabledCodexSkills");
    expect(backgroundSource).toContain("mergeStructuredInputsWithEnabledCodexSkills");
  });

  test("uses compact settings-style rows for Codex skill switches", () => {
    expect(readFinalDeclaration(".codex-skill-list", "display")).toBe("grid");
    expect(readFinalDeclaration(".codex-skill-toggle", "display")).toBe("flex");
    expect(readFinalDeclaration(".codex-skill-toggle.enabled", "border-color")).toBe("rgba(169, 199, 255, 0.24)");
  });

  test("blocks install-required automation skills unless the local runtime is enabled", () => {
    expect(sidepanelSource).toContain("getCodexSkillRuntimeRequirement");
    expect(sidepanelSource).toContain("isCodexSkillRuntimeBlocked");
    expect(sidepanelSource).toContain("isRuntimeGatedStructuredInput");
    expect(sidepanelSource).not.toContain("isPlaywrightSkillOption");
    expect(sidepanelSource).not.toContain("isPlaywrightStructuredInput");
  });

  test("keeps context attachment controls separate from app-server skills", () => {
    const contextView = getFunctionSource(sidepanelSource, "renderContextView");
    const skillsView = getFunctionSource(sidepanelSource, "renderSkillsView");

    expect(contextView).not.toContain("strings.labels.attachedContext");
    expect(contextView).not.toContain("renderCodexSkillToggle");
    expect(contextView).not.toContain("upload-skill-archive");
    expect(skillsView).toContain("renderCodexSkillToggle");
    expect(skillsView).toContain("upload-skill-archive");
  });

  test("renders plugin and MCP management as a sibling settings-style menu", () => {
    const pluginView = [
      getFunctionSource(sidepanelSource, "renderPluginMcpView"),
      getFunctionSource(sidepanelSource, "renderConnectedAppToggle"),
      getFunctionSource(sidepanelSource, "renderAppServerPluginToggle"),
      getFunctionSource(sidepanelSource, "renderPluginConnectionButton"),
      getFunctionSource(sidepanelSource, "renderMcpServerRow"),
    ].join("\n");

    expect(pluginView).toContain("getRenderableConnectedApps()");
    expect(pluginView).toContain("getRenderableAppServerPlugins()");
    expect(pluginView).toContain("getRenderableMcpServers()");
    expect(pluginView).toContain("data-app-id=");
    expect(pluginView).toContain("data-plugin-settings-id=");
    expect(pluginView).not.toContain("data-plugin-id=");
    expect(pluginView).toContain("data-mcp-oauth-server=");
    expect(pluginView).toContain("reload-plugin-catalog");
    expect(pluginView).toContain("reload-mcp-servers");
  });

  test("adds search controls to the top of skill and plugin settings views", () => {
    const skillsView = getFunctionSource(sidepanelSource, "renderSkillsView");
    const pluginView = getFunctionSource(sidepanelSource, "renderPluginMcpView");
    const bindEvents = getFunctionSource(sidepanelSource, "bindEvents");

    expect(skillsView).toContain('"settings-skill-search"');
    expect(skillsView).toContain("getFilteredCodexSkills()");
    expect(skillsView).toContain("shouldShowPlaywrightRuntimeSkill(strings)");
    expect(pluginView).toContain('"settings-plugin-mcp-search"');
    expect(pluginView).toContain("getRenderableConnectedApps()");
    expect(pluginView).toContain("getRenderableAppServerPlugins()");
    expect(pluginView).toContain("getRenderableMcpServers()");
    expect(sidepanelSource).toContain("state.skillSettingsSearchQuery");
    expect(sidepanelSource).toContain("state.pluginMcpSettingsSearchQuery");
    expect(bindEvents).toContain("bindSettingsSearchInput");
  });

  test("renders only connected apps before Plugins/MCP injection", () => {
    const pluginView = getFunctionSource(sidepanelSource, "renderPluginMcpView");
    const appFilter = getFunctionSource(sidepanelSource, "getRenderableConnectedApps");
    const pluginFilter = getFunctionSource(sidepanelSource, "getRenderableAppServerPlugins");

    expect(pluginView).toContain("getRenderableConnectedApps()");
    expect(pluginView).toContain("getRenderableAppServerPlugins()");
    expect(pluginView).not.toContain("state.connectedApps.map");
    expect(appFilter).toContain("app.isAccessible");
    expect(appFilter).toContain("app.isEnabled");
    expect(appFilter).not.toContain("app.installUrl");
    expect(appFilter).not.toContain("findCompanionAppForPlugin");
    expect(pluginFilter).toContain("plugin.installed && plugin.enabled");
  });

  test("renders connected app mention inputs with real on/off switches", () => {
    const appToggle = getFunctionSource(sidepanelSource, "renderConnectedAppToggle");

    expect(appToggle).toContain("settings-switch codex-skill-switch");
    expect(appToggle).toContain('type="checkbox"');
    expect(appToggle).toContain("data-app-id=");
    expect(readFinalDeclaration(".mention-toggle", "display")).toBe("grid");
    expect(readFinalDeclaration(".mention-toggle", "grid-template-columns")).toBe("auto minmax(0, 1fr) auto");
  });

  test("renders plugin rows without persistent toggle switches", () => {
    const pluginToggle = getFunctionSource(sidepanelSource, "renderAppServerPluginToggle");
    const pluginConnectButton = getFunctionSource(sidepanelSource, "renderPluginConnectionButton");

    expect(pluginToggle).not.toContain("settings-switch codex-skill-switch");
    expect(pluginToggle).not.toContain('type="checkbox"');
    expect(pluginToggle).not.toContain("data-plugin-id=");
    expect(pluginToggle).toContain('connectionState === "connection-required"');
    expect(pluginToggle).toContain("renderPluginConnectionButton");
    expect(pluginToggle).toContain("renderPluginAvailabilityPill");
    expect(pluginConnectButton).toContain("plugin-connect-row-action");
  });

  test("opens plugin settings dialog from plugin row without toggling injection", () => {
    const pluginToggle = getFunctionSource(sidepanelSource, "renderAppServerPluginToggle");
    const pluginConnectButton = getFunctionSource(sidepanelSource, "renderPluginConnectionButton");
    const eventBinding = getFunctionSource(sidepanelSource, "bindPluginMcpControls");

    expect(pluginToggle).toContain("renderPluginConnectionButton");
    expect(pluginConnectButton).toContain("data-plugin-settings-id=");
    expect(eventBinding).toContain("[data-plugin-settings-id]");
    expect(eventBinding).toContain("openPluginConnectionDialog(plugin)");
  });

  test("offers a plugin catalog refresh button to re-check app connections", () => {
    const pluginView = getFunctionSource(sidepanelSource, "renderPluginMcpView");
    const eventBinding = getFunctionSource(sidepanelSource, "bindPluginMcpControls");

    expect(pluginView).toContain('id="reload-plugin-catalog"');
    expect(eventBinding).toContain("#reload-plugin-catalog");
    expect(eventBinding).toContain("scheduleInitialize({ forceCatalog: true })");
  });

  test("opens a plugin connection modal without rendering unconnected app rows", () => {
    expect(sidepanelSource).toContain("PluginConnectionDialogState");
    expect(sidepanelSource).toContain("renderPluginConnectionDialog");
    expect(sidepanelSource).not.toContain("openConnectedAppDialog");
    expect(sidepanelSource).toContain("openPluginConnectionDialog");
    expect(sidepanelSource).toContain("openRequiredAppConnectionDialog");
    expect(backgroundSource).toContain("appConnection");
    expect(sidepanelSource).toContain('type: "app.install.open"');
    expect(backgroundSource).toContain("openAppInstallUrl");
    expect(css).toContain(".plugin-connect-modal");
  });

  test("force-refreshes the app catalog after plugin app connection flows", () => {
    expect(backgroundSource).toContain("forceCatalog: Boolean(message.forceCatalog)");
    expect(backgroundSource).toContain("force: Boolean(options.forceCatalog)");
    expect(backgroundSource).toContain("catalog refresh before plugin connection check failed");
    expect(sidepanelSource).toContain("pendingPluginConnectionCatalogRefresh");
    expect(sidepanelSource).toContain("connectionRefreshPending");
    expect(sidepanelSource).toContain("scheduleInitialize({ forceCatalog: true })");
  });

  test("explains that plugin app connections use the Codex app-server account", () => {
    expect(sidepanelSource).toContain("renderPluginConnectionAccountNotice");
    expect(sidepanelSource).toContain("state.accountStatus?.authMode === \"chatgpt\"");
    expect(sidepanelSource).toContain("state.accountStatus.email");
    expect(sidepanelSource).toContain("renderAccountEmailPill()");
    expect(sidepanelI18nSource).toContain("appConnectionAccountTitle");
    expect(sidepanelI18nSource).toContain("appConnectionAccountBody");
    expect(sidepanelI18nSource).toContain("appServerAccount");
  });
});
