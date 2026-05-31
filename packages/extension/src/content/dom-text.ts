const MAX_BODY_TEXT_LENGTH = 240_000;
const MIN_USEFUL_TEXT_LENGTH = 24;

export type TextCandidateInput = {
  key: string;
  text: string;
  priority: number;
  visibleArea?: number;
  viewportArea?: number;
};

const HIGH_VALUE_CONTENT_SELECTORS = [
  "article",
  "main",
  '[role="main"]',
  '[role="article"]',
  '[role="document"]',
  '[role="dialog"]',
  '[data-message-id]',
  '[data-legacy-message-id]',
  '[aria-label*="message" i]',
  '[aria-label*="email" i]',
  '[aria-label*="mail" i]',
  '[aria-label*="conversation" i]',
  '[aria-label*="thread" i]',
  '[aria-label*="channel" i]',
  '[aria-label*="task" i]',
  '[aria-label*="note" i]',
  '[aria-label*="document" i]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="feed"]',
  '[role="log"]',
  '[role="grid"]',
  '[role="treegrid"]',
  '[role="table"]',
  '[role="tabpanel"]',
  '[data-testid*="message" i]',
  '[data-testid*="thread" i]',
  '[data-testid*="task" i]',
  '[data-testid*="note" i]',
  '[data-testid*="document" i]',
  '[data-qa*="message" i]',
  '[data-qa*="thread" i]',
  '[data-qa*="task" i]',
  '[data-slate-editor="true"]',
  '[data-content-editable-root="true"]',
  '[data-block-id]',
  "blockquote.abstract",
  ".abstract",
  ".authors",
  ".ltx_title",
  ".ltx_authors",
  ".ltx_abstract",
  ".ltx_para",
  ".textLayer",
  "[class*='textLayer']",
  "pdf-viewer",
  "#viewer",
  "#viewerContainer",
  ".notion-page-content",
  ".notion-page-block",
  ".ProseMirror",
  ".ql-editor",
  ".a3s",
  ".adn",
  ".ii.gt",
];

const VISIBLE_TEXT_SELECTORS = [
  "h1",
  "h2",
  "h3",
  '[role="heading"]',
  "p",
  "li",
  "blockquote",
  "pre",
  "td",
  "th",
  '[role="article"]',
  '[role="listitem"]',
  '[role="document"]',
  '[role="row"]',
  '[role="cell"]',
  '[role="gridcell"]',
  '[role="option"]',
  '[data-testid*="message" i]',
  '[data-testid*="task" i]',
  '[data-qa*="message" i]',
  '[data-qa*="task" i]',
  '[data-testid*="comment" i]',
  '[data-qa*="comment" i]',
  '[data-message-id]',
  '[data-legacy-message-id]',
  "blockquote.abstract",
  ".ltx_para",
  ".ltx_abstract",
  ".textLayer",
  "[class*='textLayer']",
  ".a3s",
];

const NON_CONTENT_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "option",
  "[hidden]",
  '[aria-hidden="true"]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
];

export function collectBodyText(documentRef: Document = document, windowRef: Window = window): string {
  const roots: ParentNode[] = [documentRef, ...collectOpenShadowRoots(documentRef)];
  const candidates = [
    ...roots.flatMap((root) => collectElementTextCandidates(root, windowRef, HIGH_VALUE_CONTENT_SELECTORS, 100)),
    ...roots.flatMap((root) => collectElementTextCandidates(root, windowRef, VISIBLE_TEXT_SELECTORS, 40)),
  ];
  const composed = composeBodyText(candidates, MAX_BODY_TEXT_LENGTH);

  if (composed.length >= 800) {
    return composed;
  }

  const fallbackRoot =
    documentRef.querySelector("article") ??
    documentRef.querySelector("main") ??
    documentRef.querySelector('[role="main"]') ??
    documentRef.body;
  return composeBodyText(
    [
      ...candidates,
      {
        key: "fallback-root",
        text: fallbackRoot instanceof HTMLElement ? getReadableElementText(fallbackRoot) : "",
        priority: 1,
      },
    ],
    MAX_BODY_TEXT_LENGTH,
  );
}

export function composeBodyText(candidates: TextCandidateInput[], maxLength = MAX_BODY_TEXT_LENGTH): string {
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      text: cleanText(candidate.text),
      score: scoreTextCandidate(candidate),
    }))
    .filter((candidate) => candidate.text.length >= MIN_USEFUL_TEXT_LENGTH)
    .sort((left, right) => right.score - left.score);

  const segments: string[] = [];
  const seen = new Set<string>();
  let length = 0;

  for (const candidate of ranked) {
    const normalizedKey = normalizeSegmentKey(candidate.text);
    if (!normalizedKey || seen.has(normalizedKey)) {
      continue;
    }
    if (isRedundantSegment(candidate.text, segments)) {
      continue;
    }

    const remaining = maxLength - length;
    if (remaining <= 0) {
      break;
    }
    const next = candidate.text.length > remaining ? `${candidate.text.slice(0, Math.max(0, remaining - 1)).trimEnd()}…` : candidate.text;
    segments.push(next);
    seen.add(normalizedKey);
    length += next.length + 2;
  }

  return segments.join("\n\n").trim();
}

function collectElementTextCandidates(
  root: ParentNode,
  windowRef: Window,
  selectors: string[],
  basePriority: number,
): TextCandidateInput[] {
  const elements = selectors.flatMap((selector) => querySelectorAllSafe(root, selector));
  const uniqueElements = Array.from(new Set(elements)).slice(0, 640);
  return uniqueElements
    .map<TextCandidateInput | null>((element, index) => {
      if (!(element instanceof HTMLElement) || !isElementVisible(element, windowRef)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      const viewportArea = visibleViewportArea(rect, windowRef);
      const text = getReadableElementText(element);
      if (!text) {
        return null;
      }
      return {
        key: `${element.tagName.toLowerCase()}:${selectorSignature(element)}:${index}`,
        text,
        priority: basePriority + selectorPriorityBonus(element),
        visibleArea: rect.width * rect.height,
        viewportArea,
      };
    })
    .filter((candidate): candidate is TextCandidateInput => candidate !== null);
}

function getReadableElementText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  removeNonContentNodes(clone);
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

export function removeNonContentNodes(root: HTMLElement): void {
  for (const selector of NON_CONTENT_SELECTORS) {
    for (const element of querySelectorAllSafe(root, selector)) {
      element.remove();
    }
  }
}

function scoreTextCandidate(candidate: TextCandidateInput): number {
  const usefulLength = Math.min(cleanText(candidate.text).length, 4_000) / 40;
  const visibleScore = Math.min(candidate.visibleArea ?? 0, 1_000_000) / 20_000;
  const viewportScore = Math.min(candidate.viewportArea ?? 0, 1_000_000) / 12_000;
  return candidate.priority * 10 + usefulLength + visibleScore + viewportScore;
}

function selectorPriorityBonus(element: HTMLElement): number {
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  const className = typeof element.className === "string" ? element.className : "";
  let bonus = 0;
  if (role === "article" || role === "document") {
    bonus += 12;
  }
  if (role === "main") {
    bonus += 8;
  }
  if (element.matches("article, main, [data-message-id], [data-legacy-message-id]")) {
    bonus += 10;
  }
  if (/\b(a3s|adn|ii|gt)\b/u.test(className)) {
    bonus += 16;
  }
  return bonus;
}

function querySelectorAllSafe(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function collectOpenShadowRoots(root: ParentNode): ShadowRoot[] {
  const elements = Array.from(root.querySelectorAll("*"));
  const shadowRoots: ShadowRoot[] = [];
  for (const element of elements) {
    if (!element.shadowRoot) {
      continue;
    }
    shadowRoots.push(element.shadowRoot, ...collectOpenShadowRoots(element.shadowRoot));
  }
  return shadowRoots;
}

function visibleViewportArea(rect: DOMRect, windowRef: Window): number {
  const viewportWidth = windowRef.innerWidth || windowRef.document.documentElement.clientWidth || 0;
  const viewportHeight = windowRef.innerHeight || windowRef.document.documentElement.clientHeight || 0;
  const left = Math.max(0, Math.min(rect.left, viewportWidth));
  const right = Math.max(0, Math.min(rect.right, viewportWidth));
  const top = Math.max(0, Math.min(rect.top, viewportHeight));
  const bottom = Math.max(0, Math.min(rect.bottom, viewportHeight));
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function isElementVisible(element: HTMLElement, windowRef: Window): boolean {
  const style = windowRef.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function selectorSignature(element: HTMLElement): string {
  const id = element.id ? `#${element.id}` : "";
  const role = element.getAttribute("role") ? `[role=${element.getAttribute("role")}]` : "";
  const cls = typeof element.className === "string" ? element.className.split(/\s+/u).slice(0, 3).join(".") : "";
  return `${id}${role}${cls ? `.${cls}` : ""}`;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSegmentKey(value: string): string {
  return cleanText(value).toLowerCase().slice(0, 240);
}

function isRedundantSegment(text: string, previousSegments: string[]): boolean {
  const normalized = cleanText(text).toLowerCase();
  if (normalized.length < 80) {
    return previousSegments.some((segment) => cleanText(segment).toLowerCase() === normalized);
  }
  return previousSegments.some((segment) => {
    const previous = cleanText(segment).toLowerCase();
    return previous.includes(normalized) || normalized.includes(previous);
  });
}
