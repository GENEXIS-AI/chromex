import type { OpenTabContext } from "@codex-sidepanel/shared";

export function formatTabReferenceLabel(tab: Pick<OpenTabContext, "title" | "url">): string {
  const brand = getKnownSiteBrand(tab.url);
  if (brand) {
    return brand;
  }

  try {
    const parsed = new URL(tab.url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.hostname.replace(/^www\./u, "");
    }
  } catch {
    // Fall through to title/raw URL fallback.
  }

  return tab.title.trim() || tab.url;
}

export function formatCurrentTabReferenceLabel(tab: Pick<OpenTabContext, "title" | "url">): string {
  const title = tab.title.trim();
  if (title) {
    return title;
  }

  return formatTabReferenceLabel(tab);
}

export function getTabReferenceInitial(label: string): string {
  return label.trim().slice(0, 1).toUpperCase() || "@";
}

function getKnownSiteBrand(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./u, "").toLowerCase();
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be") {
      return "YouTube";
    }
    if (hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com")) {
      return "ChatGPT";
    }
    if (hostname === "gemini.google.com") {
      return "Gemini";
    }
    if (hostname === "x.com" || hostname === "twitter.com") {
      return "X";
    }
    if (hostname === "threads.net" || hostname.endsWith(".threads.net")) {
      return "Threads";
    }
  } catch {
    return "";
  }

  return "";
}
