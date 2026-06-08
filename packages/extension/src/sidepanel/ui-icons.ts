import {
  ArrowDown,
  ArrowLeft,
  Archive,
  AudioLines,
  BadgeQuestionMark,
  Bookmark,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  CodeXml,
  Copy,
  CornerDownRight,
  ExternalLink,
  FileText,
  Globe,
  Hand,
  Image,
  List,
  ListChecks,
  Menu,
  MessageCircle,
  Mic,
  Minus,
  MoreHorizontal,
  MoreVertical,
  PanelRight,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Video,
  X,
  Zap,
  type IconNode,
} from "lucide";

import { escapeAttribute } from "./html-escape.js";

export type UiIconName =
  | "archive"
  | "arrow-down"
  | "arrow-left"
  | "audio-lines"
  | "bookmark"
  | "chart"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "code"
  | "copy"
  | "corner-down-right"
  | "external-link"
  | "file-text"
  | "globe"
  | "hand"
  | "image"
  | "list"
  | "list-checks"
  | "menu"
  | "message"
  | "mic"
  | "minus"
  | "more-horizontal"
  | "more-vertical"
  | "panel"
  | "paperclip"
  | "pencil"
  | "plus"
  | "question"
  | "refresh"
  | "scan"
  | "search"
  | "send"
  | "settings"
  | "shield-alert"
  | "shield-check"
  | "sparkles"
  | "stop"
  | "stop-filled"
  | "trash"
  | "video"
  | "x"
  | "zap";

const UI_ICON_NODES: Record<UiIconName, IconNode> = {
  archive: Archive,
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "audio-lines": AudioLines,
  bookmark: Bookmark,
  chart: ChartColumn,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  code: CodeXml,
  copy: Copy,
  "corner-down-right": CornerDownRight,
  "external-link": ExternalLink,
  "file-text": FileText,
  globe: Globe,
  hand: Hand,
  image: Image,
  list: List,
  "list-checks": ListChecks,
  menu: Menu,
  message: MessageCircle,
  mic: Mic,
  minus: Minus,
  "more-horizontal": MoreHorizontal,
  "more-vertical": MoreVertical,
  panel: PanelRight,
  paperclip: Paperclip,
  pencil: Pencil,
  plus: Plus,
  question: BadgeQuestionMark,
  refresh: RefreshCw,
  scan: ScanLine,
  search: Search,
  send: Send,
  settings: Settings,
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  stop: Square,
  "stop-filled": Square,
  trash: Trash2,
  video: Video,
  x: X,
  zap: Zap,
};

export function renderUiIcon(icon: UiIconName, className = "ui-lucide-icon"): string {
  const node = UI_ICON_NODES[icon];
  const fill = icon === "stop-filled" ? "currentColor" : "none";
  return `
    <svg
      class="lucide ${escapeAttribute(className)} ${escapeAttribute(icon)}"
      data-ui-icon="${escapeAttribute(icon)}"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="${fill}"
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
