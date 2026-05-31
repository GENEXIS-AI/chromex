import type { OpenTabContext } from "@codex-sidepanel/shared";

export function listTabMentionOptions(tabs: OpenTabContext[], query: string, limit = 8): OpenTabContext[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? tabs.filter((tab) => tabMatchesQuery(tab, normalizedQuery))
    : tabs;
  return filtered.slice(0, limit);
}

export function formatTabMentionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.hostname.replace(/^www\./u, "");
    }
  } catch {
    // Fall through to compact raw URL display.
  }
  return url.length > 42 ? `${url.slice(0, 39)}...` : url;
}

export function toggleSelectedTabId(selectedTabIds: number[], tabId: number): number[] {
  if (selectedTabIds.includes(tabId)) {
    return selectedTabIds.filter((value) => value !== tabId);
  }
  return [...selectedTabIds, tabId].slice(-10);
}

function tabMatchesQuery(tab: OpenTabContext, normalizedQuery: string): boolean {
  return [tab.title, tab.url].some((value) => value.toLowerCase().includes(normalizedQuery));
}
