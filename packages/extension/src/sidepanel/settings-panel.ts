import { getUiStrings, type UiLocale } from "./i18n.js";

export type SettingsSectionId = "general" | "connection" | "voice";

export type SettingsSection = {
  id: SettingsSectionId;
  label: string;
};

const SECTION_ORDER: SettingsSectionId[] = ["general", "connection", "voice"];

export function listSettingsSections(locale: UiLocale): SettingsSection[] {
  const strings = getUiStrings(locale);
  const labels: Record<SettingsSectionId, string> = {
    general: strings.settingsSections.general,
    connection: strings.settingsSections.connection,
    voice: strings.settingsSections.voice,
  };
  return SECTION_ORDER.map((id) => ({
    id,
    label: labels[id],
  }));
}
