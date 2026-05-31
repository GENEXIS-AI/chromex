import { Copy, ExternalLink, File, Pencil, RefreshCw, type IconNode } from "lucide";

import { escapeAttribute } from "./html-escape.js";

type MessageActionIcon = "copy" | "edit" | "file" | "open" | "regenerate";

const MESSAGE_ACTION_ICON_NODES: Record<MessageActionIcon, IconNode> = {
  copy: Copy,
  edit: Pencil,
  file: File,
  open: ExternalLink,
  regenerate: RefreshCw,
};

export function renderMessageActionIcon(icon: MessageActionIcon): string {
  const node = MESSAGE_ACTION_ICON_NODES[icon];
  return `
    <svg
      class="lucide message-action-lucide-icon ${escapeAttribute(icon)}"
      data-message-action-icon="${escapeAttribute(icon)}"
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
