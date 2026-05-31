export interface PageImageViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EditablePageImageCandidate {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  renderedWidth?: number;
  renderedHeight?: number;
  visibleArea?: number;
  distanceFromViewportCenter?: number;
  viewportRect?: PageImageViewportRect;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
}

const MIN_VISIBLE_AREA = 4096;
const MIN_RENDERED_SIDE = 48;

export function selectEditablePageImageCandidate(
  candidates: EditablePageImageCandidate[],
): EditablePageImageCandidate | null {
  return candidates
    .filter(isEditablePageImageCandidate)
    .sort(compareEditablePageImageCandidates)[0] ?? null;
}

export function sortEditablePageImageCandidates(
  candidates: EditablePageImageCandidate[],
): EditablePageImageCandidate[] {
  return [...candidates].sort(compareEditablePageImageCandidates);
}

export function extractCssImageUrls(value: string): string[] {
  const urls: string[] = [];
  for (const match of value.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)"']+))\s*\)/giu)) {
    const url = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

function isEditablePageImageCandidate(candidate: EditablePageImageCandidate): boolean {
  if (!candidate.url.trim()) {
    return false;
  }

  const renderedWidth = candidate.renderedWidth ?? candidate.viewportRect?.width ?? candidate.naturalWidth ?? 0;
  const renderedHeight = candidate.renderedHeight ?? candidate.viewportRect?.height ?? candidate.naturalHeight ?? 0;
  if (renderedWidth < MIN_RENDERED_SIDE || renderedHeight < MIN_RENDERED_SIDE) {
    return false;
  }

  return estimateVisibleArea(candidate) >= MIN_VISIBLE_AREA;
}

function compareEditablePageImageCandidates(
  left: EditablePageImageCandidate,
  right: EditablePageImageCandidate,
): number {
  const areaDelta = estimateVisibleArea(right) - estimateVisibleArea(left);
  if (areaDelta !== 0) {
    return areaDelta;
  }

  const distanceDelta = estimateDistanceFromViewportCenter(left) - estimateDistanceFromViewportCenter(right);
  if (distanceDelta !== 0) {
    return distanceDelta;
  }

  return estimateNaturalPixels(right) - estimateNaturalPixels(left);
}

function estimateVisibleArea(candidate: EditablePageImageCandidate): number {
  if (typeof candidate.visibleArea === "number") {
    return candidate.visibleArea;
  }

  const width = candidate.renderedWidth ?? candidate.viewportRect?.width ?? candidate.naturalWidth ?? 0;
  const height = candidate.renderedHeight ?? candidate.viewportRect?.height ?? candidate.naturalHeight ?? 0;
  return Math.max(0, width) * Math.max(0, height);
}

function estimateDistanceFromViewportCenter(candidate: EditablePageImageCandidate): number {
  return typeof candidate.distanceFromViewportCenter === "number"
    ? candidate.distanceFromViewportCenter
    : Number.POSITIVE_INFINITY;
}

function estimateNaturalPixels(candidate: EditablePageImageCandidate): number {
  return Math.max(0, candidate.naturalWidth ?? 0) * Math.max(0, candidate.naturalHeight ?? 0);
}
