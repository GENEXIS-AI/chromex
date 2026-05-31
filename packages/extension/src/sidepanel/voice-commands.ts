export type VoiceNavigationCommand =
  | { kind: "scroll"; direction: "up" | "down" | "top" | "bottom" }
  | { kind: "highlight"; query: string }
  | { kind: "clear-highlights" };

export function parseVoiceNavigationCommand(value: string): VoiceNavigationCommand | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized === "scroll down" ||
    normalized === "scroll me" ||
    normalized === "go down" ||
    normalized === "next section"
  ) {
    return { kind: "scroll", direction: "down" };
  }

  if (normalized === "scroll up" || normalized === "go up" || normalized === "previous section") {
    return { kind: "scroll", direction: "up" };
  }

  if (normalized === "go to top" || normalized === "top") {
    return { kind: "scroll", direction: "top" };
  }

  if (normalized === "go to bottom" || normalized === "bottom") {
    return { kind: "scroll", direction: "bottom" };
  }

  if (normalized === "clear highlights" || normalized === "clear highlight") {
    return { kind: "clear-highlights" };
  }

  const highlightMatch =
    /^(?:highlight|find|show me|take me to|go to)\s+(.+)$/i.exec(value.trim()) ??
    /^(?:scroll to)\s+(.+)$/i.exec(value.trim());
  const query = highlightMatch?.[1]?.trim();
  if (query) {
    return { kind: "highlight", query };
  }

  return null;
}
