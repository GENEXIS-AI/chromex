import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");
const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

function getFunctionSource(source: string, functionName: string): string {
  const start = source.indexOf(`function ${functionName}`);
  const asyncStart = source.indexOf(`async function ${functionName}`);
  const functionStart = start === -1 ? asyncStart : asyncStart === -1 ? start : Math.min(start, asyncStart);
  expect(functionStart).toBeGreaterThanOrEqual(0);
  const nextFunction = source.indexOf("\nfunction ", functionStart + 1);
  const nextAsyncFunction = source.indexOf("\nasync function ", functionStart + 1);
  const candidates = [nextFunction, nextAsyncFunction].filter((index) => index > functionStart);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(functionStart, end);
}

describe("startup performance", () => {
  test("loads stored UI settings before the full model catalog finishes", () => {
    const listenerStart = backgroundSource.indexOf("chrome.runtime.onMessage.addListener");
    const settingsSnapshotIndex = backgroundSource.indexOf('message.type === "ui.settings.snapshot"', listenerStart);
    const stateLoadIndex = backgroundSource.indexOf("await ensureStateLoaded()", listenerStart);

    expect(settingsSnapshotIndex).toBeGreaterThan(listenerStart);
    expect(settingsSnapshotIndex).toBeLessThan(stateLoadIndex);
    expect(backgroundSource).toContain("loadStoredUiSettingsSnapshot");
  });

  test("does not block ui.init on model/plugin catalog refresh", () => {
    const buildInitPayload = getFunctionSource(backgroundSource, "buildUiInitPayload");

    expect(buildInitPayload).toContain("void triggerCatalogRefresh");
    expect(buildInitPayload).not.toContain("catalog.refresh(ui.init)");
    expect(buildInitPayload).not.toContain("await softTimeout(\n    triggerCatalogRefresh");
  });

  test("sidepanel starts the settings snapshot and ui init requests in parallel", () => {
    const initializeBlock = getFunctionSource(sidepanelSource, "initialize");
    const settingsSnapshotIndex = initializeBlock.indexOf("applyInitialSettingsSnapshot");
    const uiInitIndex = initializeBlock.indexOf('type: "ui.init"');

    expect(settingsSnapshotIndex).toBeGreaterThanOrEqual(0);
    expect(uiInitIndex).toBeGreaterThan(settingsSnapshotIndex);
    expect(initializeBlock).toContain("const settingsSnapshotPromise");
    expect(initializeBlock).toContain("const initPayloadPromise");
  });

  test("queues catalog updates that arrive while sidepanel initialization is active", () => {
    const catalogHandlerIndex = sidepanelSource.indexOf('event.type === "catalog.updated"');
    const catalogHandlerBlock = sidepanelSource.slice(
      catalogHandlerIndex,
      sidepanelSource.indexOf('event.type === "account.updated"', catalogHandlerIndex),
    );

    expect(catalogHandlerIndex).toBeGreaterThanOrEqual(0);
    expect(catalogHandlerBlock).toContain("void scheduleInitialize();");
    expect(catalogHandlerBlock).not.toContain("if (!initializePromise)");
  });

  test("does not force model catalog refreshes for unrelated settings updates", () => {
    const settingsUpdateBlock = getFunctionSource(backgroundSource, "handleSettingsUpdate");
    const guardIndex = settingsUpdateBlock.indexOf("shouldRefreshCatalogAfterSettingsUpdate");
    const refreshIndex = settingsUpdateBlock.indexOf("triggerCatalogRefresh");

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(refreshIndex).toBeGreaterThan(guardIndex);
    expect(settingsUpdateBlock).toContain("return settings;");
    expect(settingsUpdateBlock).toContain("previousWorkspaceRoot: previousSettings.workspaceRoot");
    expect(settingsUpdateBlock).toContain("previousCodexBinPath: previousSettings.codexBinPath");
  });
});
