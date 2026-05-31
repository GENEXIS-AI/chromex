import { cleanArxivTitle, extractArxivIdFromUrl, isArxivUrl } from "./adapters/arxiv.js";
import { inferPdfFilename, isLikelyPdfUrl, resolvePdfSourceUrl } from "./adapters/pdf.js";
import { isYouTubeVideoUrl } from "./adapters/youtube.js";

const SHOPPING_HOST_SUFFIXES = [
  "amazon.com",
  "amazon.co.kr",
  "coupang.com",
  "11st.co.kr",
  "gmarket.co.kr",
  "auction.co.kr",
  "kurly.com",
  "shopping.google.com",
  "bestbuy.com",
  "walmart.com",
  "target.com",
] as const;

const KOREAN_MAIL_HOSTS = [
  "mail.naver.com",
  "mail.daum.net",
  "mail.kakao.com",
  "mail.worksmobile.com",
  "mail.dooray.com",
  "mail.hiworks.com",
] as const;

const TEAMS_HOSTS = ["teams.microsoft.com", "teams.cloud.microsoft", "teams.live.com"] as const;
const NAVER_WORKS_HOSTS = ["naverworks.com", "worksmobile.com", "works.naver.com"] as const;

const NOTES_HOSTS = [
  "app.evernote.com",
  "evernote.com",
  "onenote.com",
  "www.onenote.com",
  "onenote.office.com",
  "keep.google.com",
  "notes.samsung.com",
] as const;

const KANBAN_HOSTS = [
  "trello.com",
  "app.asana.com",
  "asana.com",
  "atlassian.net",
  "jira.com",
  "app.clickup.com",
  "clickup.com",
] as const;

const KOREAN_WRITING_HOSTS = [
  "blog.naver.com",
  "m.blog.naver.com",
  "cafe.naver.com",
  "brunch.co.kr",
  "tistory.com",
  "velog.io",
  "post.naver.com",
  "smartstore.naver.com",
] as const;

const KOREAN_WORK_HOSTS = ["dooray.com", "works.do", "notion.so", "flex.team", "channel.io", "monday.com"] as const;
const KOREAN_COMMUNITY_HOSTS = ["cafe.naver.com", "kin.naver.com", "band.us", "dcinside.com", "theqoo.net", "clien.net", "fmkorea.com"] as const;
const KOREAN_HIRING_HOSTS = [
  "wanted.co.kr",
  "saramin.co.kr",
  "jobkorea.co.kr",
  "jumpit.co.kr",
  "programmers.co.kr",
  "career.programmers.co.kr",
  "rallit.com",
] as const;

const KOREAN_NEWS_HOSTS = [
  "news.naver.com",
  "n.news.naver.com",
  "m.news.naver.com",
  "sports.news.naver.com",
  "entertain.naver.com",
  "news.daum.net",
  "v.daum.net",
  "media.daum.net",
  "yna.co.kr",
  "hani.co.kr",
  "khan.co.kr",
  "chosun.com",
  "joongang.co.kr",
  "donga.com",
  "mk.co.kr",
  "hankyung.com",
  "etnews.com",
  "zdnet.co.kr",
  "bloter.net",
] as const;

const GLOBAL_NEWS_HOSTS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "cnn.com",
  "nytimes.com",
  "washingtonpost.com",
  "wsj.com",
  "bloomberg.com",
  "ft.com",
  "economist.com",
  "theguardian.com",
  "aljazeera.com",
  "npr.org",
  "cnbc.com",
  "nbcnews.com",
  "abcnews.go.com",
  "cbsnews.com",
  "time.com",
  "politico.com",
  "axios.com",
  "theverge.com",
  "wired.com",
  "techcrunch.com",
  "arstechnica.com",
  "engadget.com",
  "scmp.com",
  "japantimes.co.jp",
] as const;

const TRAVEL_HOSTS = [
  "flights.google.com",
  "maps.google.com",
  "booking.com",
  "airbnb.com",
  "expedia.com",
  "tripadvisor.com",
  "agoda.com",
  "hotels.com",
] as const;

const RESEARCH_HOSTS = [
  "wikipedia.org",
  "medium.com",
  "substack.com",
  "arxiv.org",
  "scholar.google.com",
  "news.ycombinator.com",
] as const;

export function createSitePayload(tab: Pick<{ title: string; url: string }, "title" | "url">): Record<string, unknown> | null {
  const url = parseUrl(tab.url);
  if (!url) {
    return null;
  }
  const hostname = url.hostname.replace(/^www\./iu, "").toLowerCase();
  const title = cleanTitle(tab.title);

  if (isYouTubeVideoUrl(tab.url)) {
    return {
      platform: "youtube",
      title: normalizeYouTubeTabTitle(tab.title),
      currentTimeSeconds: 0,
      chapterTitles: [],
    };
  }
  if (isArxivUrl(tab.url)) {
    const arxivId = extractArxivIdFromUrl(tab.url);
    return {
      platform: "arxiv",
      title: cleanArxivTitle(title) || "arXiv paper",
      arxivId,
      absUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : tab.url,
      pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}` : tab.url,
      htmlUrl: arxivId ? `https://arxiv.org/html/${arxivId}` : tab.url,
    };
  }
  if (isLikelyPdfUrl(tab.url, tab.title)) {
    const sourceUrl = resolvePdfSourceUrl(tab.url) || tab.url;
    return {
      platform: "pdf-document",
      title,
      filename: inferPdfFilename(sourceUrl, tab.title),
      sourceUrl,
    };
  }
  if (hostname === "mail.google.com") {
    return { platform: "gmail", title };
  }
  if (isRegionalMailHost(hostname)) {
    return { platform: "korean-mail", title, host: hostname };
  }
  if (hostname === "docs.google.com") {
    if (url.pathname.startsWith("/document/")) {
      return { platform: "google-docs", title };
    }
    if (url.pathname.startsWith("/spreadsheets/")) {
      return { platform: "google-sheets", title };
    }
    if (url.pathname.startsWith("/presentation/")) {
      return { platform: "google-slides", title };
    }
  }
  if (hostname === "drive.google.com") {
    return { platform: "google-drive", title };
  }
  if (hostname === "meet.google.com") {
    return { platform: "google-meet", title };
  }
  if (hostname === "chat.google.com") {
    return { platform: "google-chat", title };
  }
  if (hostname === "keep.google.com") {
    return { platform: "google-keep", title };
  }
  if (hostname === "calendar.google.com") {
    return { platform: "google-calendar", title };
  }
  if (hostname === "github.com") {
    return { platform: "github", title };
  }
  if (hostname.endsWith("notion.so") || hostname === "notion.site") {
    return { platform: "notion", title };
  }
  if (isSlackHost(hostname)) {
    return { platform: "slack", title, host: hostname };
  }
  if (isTeamsHost(hostname)) {
    return { platform: "teams", title, host: hostname };
  }
  if (isKakaoWorkHost(hostname)) {
    return { platform: "kakaowork", title, host: hostname };
  }
  if (isNaverWorksHost(hostname)) {
    return { platform: "naver-works", title, host: hostname };
  }
  if (isFlowHost(hostname)) {
    return { platform: "flow", title, host: hostname };
  }
  if (isNotesHost(hostname)) {
    return { platform: inferNotesPlatform(hostname), title, host: hostname };
  }
  if (isKanbanHost(hostname)) {
    return { platform: inferKanbanPlatform(hostname), title, host: hostname };
  }
  if (isRegionalWritingHost(hostname)) {
    return { platform: "korean-writing", title, host: hostname };
  }
  if (isRegionalWorkHost(hostname)) {
    return { platform: "korean-work", title, host: hostname };
  }
  if (isRegionalCommunityHost(hostname)) {
    return { platform: "korean-community", title, host: hostname };
  }
  if (isRegionalHiringHost(hostname)) {
    return { platform: "korean-hiring", title, host: hostname };
  }
  if (isNewsHost(hostname)) {
    return {
      platform: "news",
      title,
      host: hostname,
      region: isRegionalNewsHost(hostname) ? "kr" : "global",
    };
  }
  if (hostname === "figma.com") {
    return { platform: "figma", title };
  }
  if (isShoppingHost(hostname)) {
    return { platform: "shopping", title };
  }
  if (isTravelHost(hostname)) {
    return { platform: "travel", title };
  }
  if (isResearchHost(hostname)) {
    return { platform: "research", title };
  }
  return null;
}

export function normalizeYouTubeTabTitle(title: string): string {
  const normalized = title.trim().replace(/\s+-\s+YouTube$/iu, "").trim();
  return normalized || "YouTube video";
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function cleanTitle(title: string): string {
  return title
    .trim()
    .replace(/\s+-\s+(Gmail|Google Docs|Google Sheets|Google Slides|Google Calendar|GitHub|Figma|Notion)$/iu, "")
    .trim();
}

function isShoppingHost(hostname: string): boolean {
  return (hostname.endsWith("naver.com") && hostname.startsWith("shopping.")) || matchesAnyHost(hostname, SHOPPING_HOST_SUFFIXES);
}

function isRegionalMailHost(hostname: string): boolean {
  return matchesAnyHost(hostname, KOREAN_MAIL_HOSTS);
}

function isSlackHost(hostname: string): boolean {
  return hostname === "app.slack.com" || hostname.endsWith(".slack.com");
}

function isTeamsHost(hostname: string): boolean {
  return matchesAnyHost(hostname, TEAMS_HOSTS);
}

function isKakaoWorkHost(hostname: string): boolean {
  return hostname === "kakaowork.com" || hostname.endsWith(".kakaowork.com");
}

function isNaverWorksHost(hostname: string): boolean {
  return matchesAnyHost(hostname, NAVER_WORKS_HOSTS);
}

function isFlowHost(hostname: string): boolean {
  return hostname === "flow.team" || hostname.endsWith(".flow.team");
}

function isNotesHost(hostname: string): boolean {
  return matchesAnyHost(hostname, NOTES_HOSTS);
}

function inferNotesPlatform(hostname: string): string {
  if (hostname === "keep.google.com") {
    return "google-keep";
  }
  if (hostname === "notes.samsung.com" || hostname.endsWith(".notes.samsung.com")) {
    return "samsung-notes";
  }
  if (hostname === "app.evernote.com" || hostname.endsWith(".evernote.com") || hostname === "evernote.com") {
    return "evernote";
  }
  return "onenote";
}

function isKanbanHost(hostname: string): boolean {
  return matchesAnyHost(hostname, KANBAN_HOSTS);
}

function inferKanbanPlatform(hostname: string): string {
  if (hostname === "trello.com" || hostname.endsWith(".trello.com")) {
    return "trello";
  }
  if (hostname === "app.asana.com" || hostname.endsWith(".asana.com") || hostname === "asana.com") {
    return "asana";
  }
  if (hostname.endsWith(".atlassian.net") || hostname === "atlassian.net" || hostname.endsWith(".jira.com") || hostname === "jira.com") {
    return "jira";
  }
  return "clickup";
}

function isRegionalWritingHost(hostname: string): boolean {
  return matchesAnyHost(hostname, KOREAN_WRITING_HOSTS);
}

function isRegionalWorkHost(hostname: string): boolean {
  return matchesAnyHost(hostname, KOREAN_WORK_HOSTS);
}

function isRegionalCommunityHost(hostname: string): boolean {
  return matchesAnyHost(hostname, KOREAN_COMMUNITY_HOSTS);
}

function isRegionalHiringHost(hostname: string): boolean {
  return matchesAnyHost(hostname, KOREAN_HIRING_HOSTS);
}

function isNewsHost(hostname: string): boolean {
  return isRegionalNewsHost(hostname) || isGlobalNewsHost(hostname);
}

function isRegionalNewsHost(hostname: string): boolean {
  return matchesAnyHost(hostname, KOREAN_NEWS_HOSTS);
}

function isGlobalNewsHost(hostname: string): boolean {
  return matchesAnyHost(hostname, GLOBAL_NEWS_HOSTS);
}

function isTravelHost(hostname: string): boolean {
  return matchesAnyHost(hostname, TRAVEL_HOSTS);
}

function isResearchHost(hostname: string): boolean {
  return matchesAnyHost(hostname, RESEARCH_HOSTS);
}

function matchesAnyHost(hostname: string, domains: readonly string[]): boolean {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}
