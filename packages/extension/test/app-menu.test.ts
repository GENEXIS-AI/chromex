import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  APP_MENU_RECENT_CHAT_LIMIT,
  createRecentChatDisplayItems,
  formatRelativeRecentChatTime,
  listAppMenuRecentChats,
  getAppMenuLabels,
  hasAppMenuMoreRecentChats,
} from "../src/sidepanel/app-menu.js";
import type { ConversationSummary } from "../src/types.js";

const css = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

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

function makeConversation(index: number): ConversationSummary {
  return {
    id: `chat-${index}`,
    title: `대화 ${index}`,
    profileId: "research",
    updatedAt: 1_700_000_000 + index,
  };
}

describe("top app menu", () => {
  test("keeps recent chat history compact in the top menu", () => {
    const chats = Array.from({ length: 9 }, (_, index) => makeConversation(index + 1));

    expect(listAppMenuRecentChats(chats).map((chat) => chat.id)).toEqual([
      "chat-9",
      "chat-8",
      "chat-7",
      "chat-6",
      "chat-5",
    ]);
    expect(hasAppMenuMoreRecentChats(chats)).toBe(true);
    expect(hasAppMenuMoreRecentChats(chats.slice(0, 5))).toBe(false);
  });

  test("sorts recent chats by latest activity before applying the compact menu limit", () => {
    const chats = [
      { ...makeConversation(1), updatedAt: 300 },
      { ...makeConversation(2), updatedAt: 100 },
      { ...makeConversation(3), updatedAt: 500 },
      { ...makeConversation(4), updatedAt: 200 },
      { ...makeConversation(5), updatedAt: 400 },
      { ...makeConversation(6), updatedAt: 50 },
    ];

    expect(listAppMenuRecentChats(chats).map((chat) => chat.id)).toEqual([
      "chat-3",
      "chat-5",
      "chat-1",
      "chat-4",
      "chat-2",
    ]);
  });

  test("formats compact relative chat times with localized units", () => {
    const now = Date.UTC(2026, 3, 28, 12, 0, 0);

    expect(formatRelativeRecentChatTime(now - 14 * 60 * 60 * 1000, now, "ko")).toBe("14시간");
    expect(formatRelativeRecentChatTime(now - 3 * 24 * 60 * 60 * 1000, now, "ko")).toBe("3일");
    expect(formatRelativeRecentChatTime(now - 2 * 7 * 24 * 60 * 60 * 1000, now, "ko")).toBe("2주");
    expect(formatRelativeRecentChatTime(now - 14 * 60 * 60 * 1000, now, "en")).toBe("14 hours");
  });

  test("prepares recent chat display state once for all recent-chat surfaces", () => {
    const now = Date.UTC(2026, 3, 28, 12, 0, 0);
    const chats = [
      { ...makeConversation(1), updatedAt: now - 14 * 60 * 60 * 1000 },
      { ...makeConversation(2), updatedAt: now - 3 * 24 * 60 * 60 * 1000 },
      { ...makeConversation(3), updatedAt: now - 10 * 60 * 1000 },
    ];

    expect(
      createRecentChatDisplayItems({
        recentChats: chats,
        currentConversationId: "chat-1",
        busyConversationIds: new Set(["chat-3"]),
        now,
        locale: "ko",
        limit: 2,
      }).map((chat) => ({
        id: chat.id,
        selected: chat.selected,
        busy: chat.busy,
        relativeTime: chat.relativeTime,
      })),
    ).toEqual([
      { id: "chat-3", selected: false, busy: true, relativeTime: "10분" },
      { id: "chat-1", selected: true, busy: false, relativeTime: "14시간" },
    ]);
  });

  test("expands hidden recent chats in place instead of opening settings", () => {
    expect(APP_MENU_RECENT_CHAT_LIMIT).toBe(5);
    expect(sidepanelSource).toContain("appMenuRecentChatLimit");
    expect(sidepanelSource).toContain('data-menu-action="show-more-recent-chats"');
    expect(sidepanelSource).toContain("state.appMenuRecentChatLimit += APP_MENU_RECENT_CHAT_LIMIT");
    expect(sidepanelSource).not.toContain('<button class="app-menu-row" data-menu-view="workspace" role="menuitem" ${disabledAttribute}>\n                <span class="app-menu-icon" aria-hidden="true">...</span>');
  });

  test("localizes menu destinations for Korean browser UI", () => {
    expect(getAppMenuLabels("ko")).toMatchObject({
      menu: "메뉴",
      recentChats: "최근 채팅",
      clearRecentChats: "전체 삭제",
      deleteChat: "채팅 삭제",
      more: "더보기",
      createInfographic: "인포그래픽 만들기",
      skills: "스킬",
      pluginMcp: "플러그인/MCP",
      settingsHelp: "설정 및 도움말",
    });
  });

  test("omits context from the top menu while keeping skills and plugin MCP destinations", () => {
    expect(sidepanelSource).not.toContain('data-menu-view="context" role="menuitem"');
    expect(sidepanelSource).toContain('data-menu-view="skills"');
    expect(sidepanelSource).toContain('data-menu-view="plugins"');
    expect(sidepanelSource).toContain('data-menu-view="workspace"');
  });

  test("localizes current-page infographic quick action", () => {
    expect(getAppMenuLabels("en")).toMatchObject({
      createInfographic: "Create infographic",
    });
  });

  test("does not expose unsupported new-tab continuation actions", () => {
    const koLabels = getAppMenuLabels("ko") as Record<string, string>;
    const enLabels = getAppMenuLabels("en") as Record<string, string>;

    expect(koLabels.openInNewTab).toBeUndefined();
    expect(enLabels.openInNewTab).toBeUndefined();
    expect(Object.values(koLabels)).not.toContain("새 탭에서 채팅 계속하기");
    expect(Object.values(enLabels)).not.toContain("Continue chat in new tab");
  });

  test("uses compact rows and labels for the recent-chat popover", () => {
    expect(readFinalDeclaration(".app-menu", "width")).toBe("min(304px, calc(100vw - 28px))");
    expect(readFinalDeclaration(".app-menu", "padding")).toBe("8px 0");
    expect(readFinalDeclaration(".app-menu-row", "min-height")).toBe("40px");
    expect(readFinalDeclaration(".app-menu-row", "padding")).toBe("0 16px");
    expect(readFinalDeclaration(".app-menu-label", "font-size")).toBe("13px");
    expect(readFinalDeclaration(".app-menu-chat-row", "grid-template-columns")).toBe("minmax(0, 1fr) 44px");
    expect(readFinalDeclaration(".app-menu-delete-button", "width")).toBe("44px");
    expect(readFinalDeclaration(".app-menu-delete-button", "min-height")).toBe("40px");
    expect(readFinalDeclaration(".app-menu-delete-button", "opacity")).toBe("1");
  });

  test("renders recent chat progress, relative time, and trash controls in the popover", () => {
    expect(sidepanelSource).toContain("createRecentChatDisplayItems");
    expect(sidepanelSource).toContain("renderRecentChatProgressIndicator(chat.busy)");
    expect(sidepanelSource).toContain('renderUiIcon("trash")');
    expect(readFinalDeclaration(".recent-chat-progress", "animation")).toBe("recent-chat-spin 0.9s linear infinite");
    expect(readFinalDeclaration(".recent-chat-time", "font-size")).toBe("12px");
  });

  test("shows recent chat delete as a neutral trash icon that only turns red on direct hover", () => {
    expect(readFinalDeclaration(".app-menu-delete-button", "color")).toBe("#ffffff");
    expect(readFinalDeclaration(".app-menu-delete-button", "background")).toBe("transparent");
    expect(readFinalDeclaration(".app-menu-delete-button:hover", "color")).toBe("#ff5a52");
    expect(readFinalDeclaration(".app-menu-delete-button:hover", "background")).toBe("transparent");
    expect(readFinalDeclaration(".app-menu-chat-row:hover .app-menu-delete-button", "color")).toBe("");
    expect(readFinalDeclaration(".app-menu-chat-row:focus-within .app-menu-delete-button", "color")).toBe("");
    expect(readFinalDeclaration(".app-menu-chat-row:hover", "background")).toBe("rgba(255, 255, 255, 0.1)");
    expect(readFinalDeclaration(".app-menu-chat-row.selected", "background")).toBe("transparent");
    expect(readFinalDeclaration(".app-menu-chat-row.selected .app-menu-row", "background")).toBe("transparent");
    expect(readFinalDeclaration(".app-menu-delete-button .ui-lucide-icon", "width")).toBe("18px");
    expect(readFinalDeclaration(".app-menu-delete-button .ui-lucide-icon", "height")).toBe("18px");
    expect(css).not.toContain(".app-menu-delete-button::before");
    expect(css).not.toContain(".app-menu-delete-button::after");
    expect(sidepanelSource).toContain('class="app-menu-chat-row ${chat.selected ? "selected" : ""}"');
  });

  test("keeps recent chat delete controls visible in light theme", () => {
    expect(css).not.toContain("::root");
    expect(css).toContain(':root[data-theme="light"] .app-menu-delete-button');
    expect(readFinalDeclaration(':root[data-theme="light"] .app-menu-delete-button', "color")).toBe("#334155");
  });

  test("does not show recent chat row backgrounds until hover or keyboard focus", () => {
    expect(readFinalDeclaration(".recent-chat", "background")).toBe("transparent");
    expect(readFinalDeclaration(".recent-chat:hover", "background")).toBe("rgba(255, 255, 255, 0.055)");
    expect(readFinalDeclaration(".recent-chat:focus-visible", "background")).toBe("rgba(255, 255, 255, 0.055)");
    expect(readFinalDeclaration(".app-menu-chat-row.selected", "background")).toBe("transparent");
    expect(readFinalDeclaration(':root[data-theme="light"] .app-menu-chat-row.selected', "background")).toBe(
      "transparent",
    );
  });
});
