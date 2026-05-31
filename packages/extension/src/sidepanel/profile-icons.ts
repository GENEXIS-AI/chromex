import {
  BadgeCheck,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  ChartNoAxesColumnIncreasing,
  CircleDollarSign,
  CodeXml,
  Dumbbell,
  FlaskConical,
  Flower2,
  Folder,
  Globe,
  GraduationCap,
  Heart,
  Mic,
  Music,
  Notebook,
  Paintbrush,
  Palette,
  PawPrint,
  PenLine,
  Pencil,
  Plane,
  Popcorn,
  Scale,
  Sparkles,
  Sprout,
  SquareTerminal,
  Stethoscope,
  Wrench,
  Zap,
  type IconNode,
} from "lucide";

import { escapeAttribute } from "./html-escape.js";

export const DEFAULT_PROFILE_ICON_ID = "spark";

const PROFILE_ICON_NODES: Record<string, IconNode> = {
  folder: Folder,
  dollar: CircleDollarSign,
  book: BookOpen,
  graduation: GraduationCap,
  pencil: Pencil,
  pen: PenLine,
  code: CodeXml,
  terminal: SquareTerminal,
  music: Music,
  popcorn: Popcorn,
  brush: Paintbrush,
  palette: Palette,
  stethoscope: Stethoscope,
  spark: Sparkles,
  lotus: Flower2,
  briefcase: BriefcaseBusiness,
  chart: ChartNoAxesColumnIncreasing,
  ring: BadgeCheck,
  dumbbell: Dumbbell,
  notebook: Notebook,
  scale: Scale,
  mic: Mic,
  plane: Plane,
  globe: Globe,
  wrench: Wrench,
  paw: PawPrint,
  flask: FlaskConical,
  brain: Brain,
  heart: Heart,
  plant: Sprout,
  zap: Zap,
};

const FALLBACK_PROFILE_ICON_NODE = Sparkles;

export function renderProfileIcon(iconId: string | undefined): string {
  const normalizedId = normalizeProfileIconId(iconId);
  const node = PROFILE_ICON_NODES[normalizedId] ?? FALLBACK_PROFILE_ICON_NODE;
  return `
    <svg
      class="lucide profile-lucide-icon"
      data-profile-icon="${escapeAttribute(normalizedId)}"
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

export function normalizeProfileIconId(iconId: string | undefined): string {
  const normalized = iconId?.trim() ?? "";
  return normalized in PROFILE_ICON_NODES ? normalized : DEFAULT_PROFILE_ICON_ID;
}

function renderIconChild(tag: string, attrs: Record<string, string | number | undefined>): string {
  return `<${tag} ${Object.entries(attrs)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => `${name}="${escapeAttribute(String(value))}"`)
    .join(" ")}></${tag}>`;
}
