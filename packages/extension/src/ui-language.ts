export type UiLanguageOption = {
  locale: string;
  nativeName: string;
  englishName: string;
  koreanName: string;
};

export const SUPPORTED_UI_LANGUAGE_OPTIONS = [
  { locale: "auto", nativeName: "Auto detect", englishName: "Auto detect", koreanName: "자동 탐지" },
  { locale: "af", nativeName: "Afrikaans", englishName: "Afrikaans", koreanName: "아프리칸스어" },
  { locale: "ar", nativeName: "العربية", englishName: "Arabic", koreanName: "아랍어" },
  { locale: "az", nativeName: "Azərbaycanca", englishName: "Azerbaijani", koreanName: "아제르바이잔어" },
  { locale: "be", nativeName: "Беларуская", englishName: "Belarusian", koreanName: "벨라루스어" },
  { locale: "bg", nativeName: "Български", englishName: "Bulgarian", koreanName: "불가리아어" },
  { locale: "bn", nativeName: "বাংলা", englishName: "Bengali", koreanName: "벵골어" },
  { locale: "bs", nativeName: "Bosanski", englishName: "Bosnian", koreanName: "보스니아어" },
  { locale: "ca", nativeName: "Català", englishName: "Catalan", koreanName: "카탈루냐어" },
  { locale: "cs", nativeName: "Čeština", englishName: "Czech", koreanName: "체코어" },
  { locale: "cy", nativeName: "Cymraeg", englishName: "Welsh", koreanName: "웨일스어" },
  { locale: "da", nativeName: "Dansk", englishName: "Danish", koreanName: "덴마크어" },
  { locale: "de", nativeName: "Deutsch", englishName: "German", koreanName: "독일어" },
  { locale: "el", nativeName: "Ελληνικά", englishName: "Greek", koreanName: "그리스어" },
  { locale: "en", nativeName: "English", englishName: "English", koreanName: "영어" },
  { locale: "es", nativeName: "Español", englishName: "Spanish", koreanName: "스페인어" },
  { locale: "et", nativeName: "Eesti", englishName: "Estonian", koreanName: "에스토니아어" },
  { locale: "eu", nativeName: "Euskara", englishName: "Basque", koreanName: "바스크어" },
  { locale: "fa", nativeName: "فارسی", englishName: "Persian", koreanName: "페르시아어" },
  { locale: "fi", nativeName: "Suomi", englishName: "Finnish", koreanName: "핀란드어" },
  { locale: "fil", nativeName: "Filipino", englishName: "Filipino", koreanName: "필리핀어" },
  { locale: "fr", nativeName: "Français", englishName: "French", koreanName: "프랑스어" },
  { locale: "ga", nativeName: "Gaeilge", englishName: "Irish", koreanName: "아일랜드어" },
  { locale: "gl", nativeName: "Galego", englishName: "Galician", koreanName: "갈리시아어" },
  { locale: "gu", nativeName: "ગુજરાતી", englishName: "Gujarati", koreanName: "구자라트어" },
  { locale: "he", nativeName: "עברית", englishName: "Hebrew", koreanName: "히브리어" },
  { locale: "hi", nativeName: "हिन्दी", englishName: "Hindi", koreanName: "힌디어" },
  { locale: "hr", nativeName: "Hrvatski", englishName: "Croatian", koreanName: "크로아티아어" },
  { locale: "hu", nativeName: "Magyar", englishName: "Hungarian", koreanName: "헝가리어" },
  { locale: "hy", nativeName: "Հայերեն", englishName: "Armenian", koreanName: "아르메니아어" },
  { locale: "id", nativeName: "Indonesia", englishName: "Indonesian", koreanName: "인도네시아어" },
  { locale: "is", nativeName: "Íslenska", englishName: "Icelandic", koreanName: "아이슬란드어" },
  { locale: "it", nativeName: "Italiano", englishName: "Italian", koreanName: "이탈리아어" },
  { locale: "ja", nativeName: "日本語", englishName: "Japanese", koreanName: "일본어" },
  { locale: "ka", nativeName: "ქართული", englishName: "Georgian", koreanName: "조지아어" },
  { locale: "kk", nativeName: "Қазақша", englishName: "Kazakh", koreanName: "카자흐어" },
  { locale: "km", nativeName: "ខ្មែរ", englishName: "Khmer", koreanName: "크메르어" },
  { locale: "kn", nativeName: "ಕನ್ನಡ", englishName: "Kannada", koreanName: "칸나다어" },
  { locale: "ko", nativeName: "한국어", englishName: "Korean", koreanName: "한국어" },
  { locale: "lo", nativeName: "ລາວ", englishName: "Lao", koreanName: "라오어" },
  { locale: "lt", nativeName: "Lietuvių", englishName: "Lithuanian", koreanName: "리투아니아어" },
  { locale: "lv", nativeName: "Latviešu", englishName: "Latvian", koreanName: "라트비아어" },
  { locale: "mk", nativeName: "Македонски", englishName: "Macedonian", koreanName: "마케도니아어" },
  { locale: "ml", nativeName: "മലയാളം", englishName: "Malayalam", koreanName: "말라얄람어" },
  { locale: "mn", nativeName: "Монгол", englishName: "Mongolian", koreanName: "몽골어" },
  { locale: "mr", nativeName: "मराठी", englishName: "Marathi", koreanName: "마라티어" },
  { locale: "ms", nativeName: "Melayu", englishName: "Malay", koreanName: "말레이어" },
  { locale: "my", nativeName: "မြန်မာ", englishName: "Burmese", koreanName: "버마어" },
  { locale: "nb", nativeName: "Norsk bokmål", englishName: "Norwegian Bokmal", koreanName: "노르웨이어" },
  { locale: "ne", nativeName: "नेपाली", englishName: "Nepali", koreanName: "네팔어" },
  { locale: "nl", nativeName: "Nederlands", englishName: "Dutch", koreanName: "네덜란드어" },
  { locale: "pa", nativeName: "ਪੰਜਾਬੀ", englishName: "Punjabi", koreanName: "펀자브어" },
  { locale: "pl", nativeName: "Polski", englishName: "Polish", koreanName: "폴란드어" },
  { locale: "pt-BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazil)", koreanName: "포르투갈어(브라질)" },
  { locale: "pt-PT", nativeName: "Português (Portugal)", englishName: "Portuguese (Portugal)", koreanName: "포르투갈어(포르투갈)" },
  { locale: "ro", nativeName: "Română", englishName: "Romanian", koreanName: "루마니아어" },
  { locale: "ru", nativeName: "Русский", englishName: "Russian", koreanName: "러시아어" },
  { locale: "si", nativeName: "සිංහල", englishName: "Sinhala", koreanName: "싱할라어" },
  { locale: "sk", nativeName: "Slovenčina", englishName: "Slovak", koreanName: "슬로바키아어" },
  { locale: "sl", nativeName: "Slovenščina", englishName: "Slovenian", koreanName: "슬로베니아어" },
  { locale: "sq", nativeName: "Shqip", englishName: "Albanian", koreanName: "알바니아어" },
  { locale: "sr", nativeName: "Српски", englishName: "Serbian", koreanName: "세르비아어" },
  { locale: "sv", nativeName: "Svenska", englishName: "Swedish", koreanName: "스웨덴어" },
  { locale: "sw", nativeName: "Kiswahili", englishName: "Swahili", koreanName: "스와힐리어" },
  { locale: "ta", nativeName: "தமிழ்", englishName: "Tamil", koreanName: "타밀어" },
  { locale: "te", nativeName: "తెలుగు", englishName: "Telugu", koreanName: "텔루구어" },
  { locale: "th", nativeName: "ไทย", englishName: "Thai", koreanName: "태국어" },
  { locale: "tr", nativeName: "Türkçe", englishName: "Turkish", koreanName: "튀르키예어" },
  { locale: "uk", nativeName: "Українська", englishName: "Ukrainian", koreanName: "우크라이나어" },
  { locale: "ur", nativeName: "اردو", englishName: "Urdu", koreanName: "우르두어" },
  { locale: "uz", nativeName: "Oʻzbek", englishName: "Uzbek", koreanName: "우즈베크어" },
  { locale: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", koreanName: "베트남어" },
  { locale: "zh-CN", nativeName: "中文（中国）", englishName: "Chinese (China)", koreanName: "중국어(중국)" },
  { locale: "zh-TW", nativeName: "中文（台灣）", englishName: "Chinese (Taiwan)", koreanName: "중국어(대만)" },
] as const;

export type UiLocale = Exclude<(typeof SUPPORTED_UI_LANGUAGE_OPTIONS)[number]["locale"], "auto">;
export type UiLanguageSetting = "auto" | UiLocale;
export type TranslatedUiLocale = UiLocale;

const SUPPORTED_LOCALE_MAP = new Map(
  SUPPORTED_UI_LANGUAGE_OPTIONS.filter((option) => option.locale !== "auto").map((option) => [
    option.locale.toLowerCase(),
    option.locale,
  ]),
);

const RTL_LOCALES = new Set<UiLocale>(["ar", "fa", "he", "ur"]);

export function listSupportedUiLanguageOptions(): UiLanguageOption[] {
  return [...SUPPORTED_UI_LANGUAGE_OPTIONS];
}

export function normalizeUiLanguageSetting(value: unknown): UiLanguageSetting {
  if (value === "auto") {
    return "auto";
  }
  if (typeof value !== "string") {
    return "auto";
  }
  return normalizeSupportedLocale(value) ?? "auto";
}

export function resolveUiLocale(setting: UiLanguageSetting | string | undefined, browserLanguage: string): UiLocale {
  const normalizedSetting = normalizeUiLanguageSetting(setting);
  return normalizedSetting === "auto" ? detectUiLocale(browserLanguage) : normalizedSetting;
}

export function detectUiLocale(language: string): UiLocale {
  const normalized = normalizeLanguageTag(language);
  if (!normalized) {
    return "en";
  }

  if (normalized.startsWith("zh")) {
    return normalized.includes("hant") ||
      normalized.includes("tw") ||
      normalized.includes("hk") ||
      normalized.includes("mo")
      ? "zh-TW"
      : "zh-CN";
  }

  if (normalized.startsWith("pt-br")) {
    return "pt-BR";
  }
  if (normalized.startsWith("pt")) {
    return "pt-PT";
  }
  if (normalized.startsWith("fil") || normalized.startsWith("tl")) {
    return "fil";
  }
  if (normalized.startsWith("no")) {
    return "nb";
  }

  const exact = normalizeSupportedLocale(normalized);
  if (exact) {
    return exact;
  }

  const base = normalized.split("-")[0] ?? "";
  return normalizeSupportedLocale(base) ?? "en";
}

export function getTranslatedUiLocale(locale: UiLocale | string | undefined): TranslatedUiLocale {
  if (!locale) {
    return "en";
  }
  return normalizeSupportedLocale(locale) ?? detectUiLocale(locale);
}

export function getPromptOutputLanguageName(locale: UiLocale | string | undefined): string {
  const translatedLocale = getTranslatedUiLocale(locale);
  const option = SUPPORTED_UI_LANGUAGE_OPTIONS.find((item) => item.locale === translatedLocale);
  return option?.englishName ?? "English";
}

export function isRtlUiLocale(locale: UiLocale | string | undefined): boolean {
  const normalized = normalizeSupportedLocale(locale);
  return normalized ? RTL_LOCALES.has(normalized) : false;
}

export function formatUiLanguageOptionLabel(option: UiLanguageOption, uiLocale: UiLocale | string): string {
  if (option.locale === "auto") {
    return option.nativeName;
  }
  const uiLanguageName = getLocalizedLanguageName(option, uiLocale);
  if (option.nativeName === uiLanguageName) {
    return option.nativeName;
  }
  return `${option.nativeName} · ${uiLanguageName}`;
}

function getLocalizedLanguageName(option: UiLanguageOption, uiLocale: UiLocale | string): string {
  if (option.locale === "auto") {
    return option.nativeName;
  }

  try {
    const displayNames = new Intl.DisplayNames([getTranslatedUiLocale(uiLocale)], { type: "language" });
    const localized = displayNames.of(option.locale);
    if (localized) {
      return localized;
    }
  } catch {
    // Some embedded Chromium builds can lack Intl.DisplayNames data for a locale.
  }

  return option.englishName;
}

function normalizeSupportedLocale(value: unknown): UiLocale | null {
  if (typeof value !== "string") {
    return null;
  }
  return (SUPPORTED_LOCALE_MAP.get(normalizeLanguageTag(value)) ?? null) as UiLocale | null;
}

function normalizeLanguageTag(value: string): string {
  return value.trim().replaceAll("_", "-").toLowerCase();
}
