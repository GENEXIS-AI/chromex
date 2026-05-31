export type UiThemeSetting = "system" | "dark" | "light";
export type ResolvedUiTheme = "dark" | "light";

const SUPPORTED_UI_THEMES = new Set<UiThemeSetting>(["system", "dark", "light"]);

export function normalizeUiThemeSetting(value: unknown): UiThemeSetting {
  return typeof value === "string" && SUPPORTED_UI_THEMES.has(value as UiThemeSetting)
    ? (value as UiThemeSetting)
    : "system";
}

export function resolveUiTheme(setting: UiThemeSetting, prefersDark: boolean): ResolvedUiTheme {
  if (setting === "system") {
    return prefersDark ? "dark" : "light";
  }
  return setting;
}
