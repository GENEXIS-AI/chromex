import type { ConversationSummary } from "../types.js";
import type { UiLocale } from "./i18n.js";
import { getUiStrings } from "./i18n.js";

export const APP_MENU_RECENT_CHAT_LIMIT = 5;

export type AppMenuLabels = {
  menu: string;
  chat: string;
  context: string;
  skills: string;
  pluginMcp: string;
  settingsHelp: string;
  recentChats: string;
  compactConversation: string;
  createInfographic: string;
  clearRecentChats: string;
  deleteChat: string;
  more: string;
  noRecentChats: string;
};

export type RecentChatDisplayItem = ConversationSummary & {
  selected: boolean;
  busy: boolean;
  relativeTime: string;
};

export function listAppMenuRecentChats(
  recentChats: ConversationSummary[],
  limit = APP_MENU_RECENT_CHAT_LIMIT,
): ConversationSummary[] {
  return sortRecentChatsByUpdatedAt(recentChats).slice(0, Math.max(0, limit));
}

export function hasAppMenuMoreRecentChats(
  recentChats: ConversationSummary[],
  limit = APP_MENU_RECENT_CHAT_LIMIT,
): boolean {
  return recentChats.length > Math.max(0, limit);
}

export function sortRecentChatsByUpdatedAt(recentChats: ConversationSummary[]): ConversationSummary[] {
  return [...recentChats].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function createRecentChatDisplayItems(input: {
  recentChats: ConversationSummary[];
  currentConversationId?: string | null;
  busyConversationIds?: ReadonlySet<string>;
  now?: number;
  locale?: string;
  limit?: number;
}): RecentChatDisplayItem[] {
  const limit = input.limit ?? input.recentChats.length;
  const now = input.now ?? Date.now();
  const locale = input.locale ?? "en";
  return sortRecentChatsByUpdatedAt(input.recentChats)
    .slice(0, Math.max(0, limit))
    .map((chat) => ({
      ...chat,
      selected: chat.id === input.currentConversationId,
      busy: Boolean(input.busyConversationIds?.has(chat.id)),
      relativeTime: formatRelativeRecentChatTime(chat.updatedAt, now, locale),
    }));
}

export function formatRelativeRecentChatTime(
  updatedAt: number,
  now = Date.now(),
  locale: string = "en",
): string {
  const elapsedMs = Math.max(0, now - updatedAt);
  const elapsedSeconds = Math.max(1, Math.floor(elapsedMs / 1000));
  const minute = 60;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;
  const month = day * 30;
  const year = day * 365;
  const [value, unit] =
    elapsedSeconds < hour
      ? [Math.max(1, Math.floor(elapsedSeconds / minute)), "minute"]
      : elapsedSeconds < day
        ? [Math.floor(elapsedSeconds / hour), "hour"]
        : elapsedSeconds < week
          ? [Math.floor(elapsedSeconds / day), "day"]
          : elapsedSeconds < month
            ? [Math.floor(elapsedSeconds / week), "week"]
            : elapsedSeconds < year
              ? [Math.floor(elapsedSeconds / month), "month"]
              : [Math.floor(elapsedSeconds / year), "year"];

  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "long",
  }).format(value);
}

export function getAppMenuLabels(locale: UiLocale): AppMenuLabels {
  const strings = getUiStrings(locale);
  return {
    menu: strings.appMenu.menu,
    chat: strings.tabs.chat,
    context: strings.tabs.context,
    skills: strings.tabs.skills,
    pluginMcp: strings.tabs.pluginMcp,
    settingsHelp: strings.appMenu.settingsHelp,
    recentChats: strings.labels.recentChats,
    compactConversation: strings.actions.compactConversation,
    createInfographic: strings.actions.createInfographic,
    clearRecentChats: strings.actions.clearRecentChats,
    deleteChat: strings.actions.deleteChat,
    more: strings.appMenu.more,
    noRecentChats: strings.appMenu.noRecentChats,
  };
}
