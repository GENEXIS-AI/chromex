import type { ProfileTemplate } from "@codex-sidepanel/shared";
import { getTranslatedUiLocale, type UiLocale } from "./ui-language.js";

const BUILTIN_PROFILE_NAMES: Partial<Record<UiLocale, Record<string, string>>> & { en: Record<string, string> } = {
  en: {
    default: "Default",
    "youtube-summarizer": "YouTube Summarizer",
    "research-assistant": "Research Assistant",
    "fact-checker": "Fact Checker",
    "strategy-analyst": "Strategy Analyst",
    "product-manager": "Product Manager",
    "marketing-strategist": "Marketing Strategist",
    "slide-maker": "Slide Production Expert",
    "sales-gtm-strategist": "Sales & GTM Strategist",
    "legal-reviewer": "Legal Reviewer",
    "teacher-mode": "Teacher Mode",
    "data-analyst": "Data Analyst",
    "product-ux-strategist": "Product & UX Strategist",
    "writing-editor": "Writing Editor",
    "customer-support": "Customer Support",
    "hr-recruiting-partner": "HR & Recruiting Partner",
    "finance-business-analyst": "Finance & Business Analyst",
    "email-comms-assistant": "Email & Communications Assistant",
    "roast-coach": "Roast Coach",
    "harsh-comment-simulator": "Harsh Comment Simulator",
  },
  ko: {
    default: "기본",
    "youtube-summarizer": "YouTube 요약",
    "research-assistant": "리서치 어시스턴트",
    "fact-checker": "팩트체커",
    "strategy-analyst": "전략 분석가",
    "product-manager": "제품 매니저",
    "marketing-strategist": "마케팅 전략가",
    "slide-maker": "슬라이드 제작 전문가",
    "sales-gtm-strategist": "세일즈/GTM 전략가",
    "legal-reviewer": "법률 검토",
    "teacher-mode": "선생님 모드",
    "data-analyst": "데이터 분석가",
    "product-ux-strategist": "제품/UX 전략가",
    "writing-editor": "글쓰기 편집자",
    "customer-support": "고객 지원",
    "hr-recruiting-partner": "HR/채용 파트너",
    "finance-business-analyst": "재무/비즈니스 분석가",
    "email-comms-assistant": "이메일/커뮤니케이션",
    "roast-coach": "로스팅 코치",
    "harsh-comment-simulator": "악플 시뮬레이터",
  },
};

type ProfileNameLocale = keyof typeof BUILTIN_PROFILE_NAMES;

const BUILTIN_PROFILE_IDS = new Set(Object.keys(BUILTIN_PROFILE_NAMES.en));

export function localizeBuiltinProfiles(profiles: ProfileTemplate[], locale: string | undefined): ProfileTemplate[] {
  return profiles.map((profile) => {
    const name = localizeBuiltinProfileName(profile.id, profile.name, locale);
    return name === profile.name ? profile : { ...profile, name };
  });
}

export function localizeBuiltinProfileName(
  profileId: string,
  fallbackName: string,
  locale: string | undefined,
): string {
  if (!BUILTIN_PROFILE_IDS.has(profileId)) {
    return fallbackName;
  }

  const localeKey = getProfileNameLocale(locale);
  return (BUILTIN_PROFILE_NAMES[localeKey] ?? BUILTIN_PROFILE_NAMES.en)[profileId] ?? fallbackName;
}

function getProfileNameLocale(locale: string | undefined): ProfileNameLocale {
  const translatedLocale = getTranslatedUiLocale(locale);
  return BUILTIN_PROFILE_NAMES[translatedLocale] ? translatedLocale : "en";
}
