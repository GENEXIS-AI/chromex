export type HistoryContextItem = {
  title: string;
  url: string;
  lastVisitTime?: number;
  visitCount?: number;
};

export const HISTORY_SEARCH_MAX_RESULTS = 5000;
export const HISTORY_CONTEXT_MAX_ITEMS = 1000;

export type HistorySearchOptions = {
  text: string;
  maxResults: number;
  startTime: number;
};

type SearchQuery = {
  engine: string;
  query: string;
};

const SEARCH_QUERY_PARAMS = new Map<string, { engine: string; params: string[] }>([
  ["google.", { engine: "Google", params: ["q"] }],
  ["search.naver.com", { engine: "Naver", params: ["query"] }],
  ["search.daum.net", { engine: "Daum", params: ["q"] }],
  ["bing.com", { engine: "Bing", params: ["q"] }],
  ["duckduckgo.com", { engine: "DuckDuckGo", params: ["q"] }],
  ["youtube.com", { engine: "YouTube", params: ["search_query"] }],
]);

export function resolveHistoryContextQuery(payloadHistoryQuery?: string, routeHistoryQuery?: string): string {
  const explicitQuery = payloadHistoryQuery?.trim();
  if (explicitQuery) {
    return explicitQuery;
  }
  return routeHistoryQuery?.trim() ?? "";
}

export function createHistorySearchOptions(query: string): HistorySearchOptions {
  return {
    text: query,
    maxResults: HISTORY_SEARCH_MAX_RESULTS,
    startTime: 0,
  };
}

export function limitHistoryContextItems(items: HistoryContextItem[]): HistoryContextItem[] {
  return items.slice(0, HISTORY_CONTEXT_MAX_ITEMS);
}

export function extractSearchQueryFromHistoryUrl(url: string): SearchQuery | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./u, "").toLowerCase();
  for (const [hostPattern, config] of SEARCH_QUERY_PARAMS) {
    if (!host.includes(hostPattern)) {
      continue;
    }
    for (const param of config.params) {
      const query = parsed.searchParams.get(param)?.trim();
      if (query) {
        return {
          engine: config.engine,
          query,
        };
      }
    }
  }

  return null;
}

export function createHistoryContextSummary(items: HistoryContextItem[]): string {
  if (items.length === 0) {
    return "No browser history entries matched the requested history context.";
  }

  const enriched = items.map((item) => ({
    item,
    search: extractSearchQueryFromHistoryUrl(item.url),
  }));
  const sorted = [...enriched].sort((left, right) => {
    if (left.search && !right.search) {
      return -1;
    }
    if (!left.search && right.search) {
      return 1;
    }
    return (right.item.lastVisitTime ?? 0) - (left.item.lastVisitTime ?? 0);
  });

  return sorted
    .map(({ item, search }) => {
      const visited = item.lastVisitTime ? new Date(item.lastVisitTime).toISOString() : "unknown time";
      const visits = typeof item.visitCount === "number" ? `, visits: ${item.visitCount}` : "";
      if (search) {
        return `- Search (${search.engine}): "${search.query}" — ${item.title} — ${item.url} — last visited: ${visited}${visits}`;
      }
      return `- Page: ${item.title} — ${item.url} — last visited: ${visited}${visits}`;
    })
    .join("\n");
}
