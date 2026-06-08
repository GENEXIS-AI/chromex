import type { UiLocale } from "./i18n.js";
import { getUiStrings } from "./i18n.js";

export type AttachmentMenuAction =
  | "add-files"
  | "toggle-plan-mode"
  | "attach-tabs"
  | "attach-screenshot"
  | "saved-prompts";

export interface AttachmentMenuItem {
  action: AttachmentMenuAction;
  label: string;
  icon: "paperclip" | "list-checks" | "video" | "scan" | "bookmark";
  section: "primary";
  enabled: boolean;
  kind?: "button" | "toggle";
  hasSubmenu?: boolean;
}

export function listAttachmentMenuItems(locale: UiLocale): AttachmentMenuItem[] {
  const strings = getUiStrings(locale);
  return [
    {
      action: "add-files",
      label: strings.actions.attachFiles,
      icon: "paperclip",
      section: "primary",
      enabled: true,
    },
    {
      action: "toggle-plan-mode",
      label: locale === "ko" ? "플랜 모드" : "Plan mode",
      icon: "list-checks",
      section: "primary",
      enabled: true,
      kind: "toggle",
    },
    {
      action: "attach-tabs",
      label: strings.actions.attachTabs,
      icon: "video",
      section: "primary",
      enabled: true,
    },
    {
      action: "attach-screenshot",
      label: strings.actions.attachScreenshot,
      icon: "scan",
      section: "primary",
      enabled: true,
    },
    {
      action: "saved-prompts",
      label: strings.actions.savedPrompts,
      icon: "bookmark",
      section: "primary",
      enabled: true,
    },
  ];
}
