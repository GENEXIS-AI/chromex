export function extractRealtimeVoiceHandoffPrompt(item: Record<string, unknown> | undefined): string {
  if (!item) {
    return "";
  }

  const itemType = getRealtimeVoiceItemString(item, "type") || getRealtimeVoiceItemString(item, "kind");
  if (itemType !== "handoff_request") {
    return "";
  }

  return (
    getRealtimeVoiceItemString(item, "prompt") ||
    getRealtimeVoiceItemString(item, "message") ||
    getRealtimeVoiceItemString(item, "text") ||
    getRealtimeVoiceItemString(item, "input") ||
    getRealtimeVoiceHandoffContentText(item.content)
  );
}

function getRealtimeVoiceItemString(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === "string" ? value.trim() : "";
}

function getRealtimeVoiceHandoffContentText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (typeof entry === "object" && entry !== null) {
        const record = entry as Record<string, unknown>;
        return getRealtimeVoiceItemString(record, "text") || getRealtimeVoiceItemString(record, "input");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}
