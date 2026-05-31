import { Mic, type IconNode } from "lucide";

import { escapeAttribute } from "./html-escape.js";

type VoiceMessageIcon = "mic";

const VOICE_MESSAGE_ICON_NODES: Record<VoiceMessageIcon, IconNode> = {
  mic: Mic,
};

export function renderVoiceMessageIcon(icon: VoiceMessageIcon): string {
  const node = VOICE_MESSAGE_ICON_NODES[icon];
  return `
    <svg
      class="lucide voice-message-lucide-icon ${escapeAttribute(icon)}"
      data-voice-message-icon="${escapeAttribute(icon)}"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      ${node.map(([tag, attrs]) => renderIconChild(tag, attrs)).join("")}
    </svg>
  `;
}

function renderIconChild(tag: string, attrs: Record<string, string | number | undefined>): string {
  return `<${tag} ${Object.entries(attrs)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => `${name}="${escapeAttribute(String(value))}"`)
    .join(" ")}></${tag}>`;
}
