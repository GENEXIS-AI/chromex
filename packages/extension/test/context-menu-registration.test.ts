import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");

describe("context menu registration", () => {
  test("clears stale extension menu items before recreating fixed ids", () => {
    expect(backgroundSource).toContain("registerContextMenus");
    expect(backgroundSource).toContain("chrome.contextMenus.removeAll");
    expect(backgroundSource).toContain("safeCreateContextMenu");
    expect(backgroundSource).toContain("consumeContextMenuRuntimeError");
  });

  test("removes each fixed menu id before creating it so duplicate-id failures are consumed", () => {
    const safeCreateBlock = backgroundSource.slice(
      backgroundSource.indexOf("function safeCreateContextMenu"),
      backgroundSource.indexOf("function registerContextMenus"),
    );

    expect(safeCreateBlock).toContain("chrome.contextMenus.remove");
    expect(safeCreateBlock).toContain("consumeContextMenuRuntimeError");
    expect(safeCreateBlock).toContain("chrome.contextMenus.create");
  });

  test("registers every fixed context menu id through the safe creator", () => {
    const menuItemsBlock = backgroundSource.slice(
      backgroundSource.indexOf("const CONTEXT_MENU_ITEMS"),
      backgroundSource.indexOf("function consumeContextMenuRuntimeError"),
    );
    const registrationBlock = backgroundSource.slice(
      backgroundSource.indexOf("function registerContextMenus"),
      backgroundSource.indexOf("chrome.commands.onCommand.addListener"),
    );

    expect(menuItemsBlock).toContain('id: "ask-codex-page"');
    expect(menuItemsBlock).toContain('id: "ask-codex-selection"');
    expect(menuItemsBlock).toContain('contexts: ["selection"]');
    expect(menuItemsBlock).toContain('id: "edit-codex-image"');
    expect(menuItemsBlock).toContain('id: "summarize-codex-youtube"');
    expect(registrationBlock).toContain("for (const item of CONTEXT_MENU_ITEMS)");
    expect(registrationBlock).toContain("safeCreateContextMenu(item)");
  });

  test("stores selected text from the context menu for the sidepanel to consume", () => {
    expect(backgroundSource).toContain('info.menuItemId === "ask-codex-selection"');
    expect(backgroundSource).toContain("createPendingSelectionContext");
    expect(backgroundSource).toContain("pendingSelectionContext");
    expect(backgroundSource).toContain("takePendingContextMenuSelection");
    expect(backgroundSource).toContain('case "context.menu.selection.pending.take"');
  });
});
