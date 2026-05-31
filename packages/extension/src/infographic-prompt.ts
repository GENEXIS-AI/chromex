import { getTranslatedUiLocale, listSupportedUiLanguageOptions } from "./ui-language.js";

export interface InfographicPromptInput {
  locale: string;
  pageTitle: string;
  pageUrl: string;
  adapterPayload?: Record<string, unknown> | null;
}

type InfographicSiteTemplate = "youtube" | "paper" | "news" | "information" | "default";

export function buildInfographicPrompt(input: InfographicPromptInput): string {
  const locale = getInfographicLocaleLabel(input.locale);
  const title = input.pageTitle.trim() || "Current page";
  const url = input.pageUrl.trim() || "unknown URL";
  const siteTemplate = inferInfographicSiteTemplate(input);
  const siteFocus = createSiteFocusPrompt(siteTemplate);

  return [
    "Instructions:",
    "Create a beautiful visual explainer image for the relevant country/culture that best explains the context of this page.",
    `Locale/culture: ${locale.nativeName} (${locale.locale}). Use this as the language, cultural, reading-flow, and visual-tone context.`,
    "Source:",
    "Use the attached current-page context as the source of truth.",
    siteFocus ? `Context focus: ${siteFocus}` : "",
    "Do not invent names, numbers, quotes, claims, dates, citations, or logos that are not in the page context.",
    "Page metadata:",
    `Title: ${title}`,
    `URL: ${url}`,
  ].filter(Boolean).join("\n");
}

function inferInfographicSiteTemplate(input: InfographicPromptInput): InfographicSiteTemplate {
  const platform = getString(input.adapterPayload?.platform);
  if (platform === "youtube") {
    return "youtube";
  }
  if (platform === "arxiv" || platform === "pdf-document" || platform === "research") {
    return "paper";
  }
  if (platform === "news") {
    return "news";
  }
  if (isInformationPlatform(platform)) {
    return "information";
  }

  const parsed = parseUrl(input.pageUrl);
  const hostname = parsed?.hostname.replace(/^www\./iu, "").toLowerCase() ?? "";
  const pathname = parsed?.pathname.toLowerCase() ?? "";
  if (hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be") {
    return "youtube";
  }
  if (hostname === "arxiv.org" || pathname.endsWith(".pdf") || /\b(?:doi|paper|journal|research)\b/iu.test(hostname + pathname)) {
    return "paper";
  }
  if (/\b(?:news|article|press|media|journal)\b/iu.test(hostname + pathname)) {
    return "news";
  }
  if (/\b(?:docs|notion|wiki|help|guide|dashboard|report|manual|learn|support)\b/iu.test(hostname + pathname)) {
    return "information";
  }
  return "default";
}

function createSiteFocusPrompt(template: InfographicSiteTemplate): string {
  switch (template) {
    case "youtube":
      return "the video's main context and takeaway.";
    case "paper":
      return "the paper's core question, contribution, and implication.";
    case "news":
      return "what happened and why it matters.";
    case "information":
      return "the page's main context and most useful takeaway.";
    case "default":
      return "the page's main context and most useful takeaway.";
  }
}

function getInfographicLocaleLabel(locale: string): { locale: string; nativeName: string } {
  const translatedLocale = getTranslatedUiLocale(locale);
  const option = listSupportedUiLanguageOptions().find((item) => item.locale === translatedLocale);
  return {
    locale: translatedLocale,
    nativeName: option?.nativeName ?? "English",
  };
}

function isInformationPlatform(platform: string): boolean {
  return new Set([
    "google-docs",
    "google-sheets",
    "google-slides",
    "google-drive",
    "google-keep",
    "github",
    "notion",
    "figma",
    "shopping",
    "travel",
    "gmail",
    "korean-mail",
    "slack",
    "google-chat",
    "teams",
    "kakaowork",
    "naver-works",
    "flow",
    "asana",
    "clickup",
    "jira",
    "trello",
    "evernote",
    "onenote",
    "samsung-notes",
    "korean-writing",
    "korean-work",
    "korean-community",
    "korean-hiring",
  ]).has(platform);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
