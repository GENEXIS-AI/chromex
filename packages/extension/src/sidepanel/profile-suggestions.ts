import type { ActionCard, OpenTabContext, ProfileTemplate } from "@codex-sidepanel/shared";

import { getPromptOutputLanguageName } from "../ui-language.js";
import { getUiStrings } from "./i18n.js";

export interface ProfileSuggestionInput {
  profile: ProfileTemplate | null;
  currentTab: OpenTabContext | null;
  locale: string;
}

type ProfilePromptTemplate = {
  id: string;
  prompt: (context: ProfileSuggestionContext) => string;
};

type ProfileSuggestionContext = {
  title: string;
  siteLabel: string;
  isYouTube: boolean;
  outputLanguage: string;
};

export type SuggestionCardSource = "profile" | "site";

const PROFILE_PROMPTS: Record<string, ProfilePromptTemplate[]> = {
  "youtube-summarizer": [
    promptTemplate(
      "profile-youtube-summarizer-summary",
      ({ title }) =>
        `Summarize the current YouTube video "${title}". Focus on the main claim, evidence, conclusion, and important timestamped moments.`,
    ),
    promptTemplate(
      "profile-youtube-summarizer-chapters",
      ({ title }) =>
        `Create chapter-by-chapter study notes for the current YouTube video "${title}". Separate key ideas, quotable lines, and follow-up questions for each section.`,
    ),
  ],
  "research-assistant": [
    promptTemplate(
      "profile-research-assistant-evidence",
      ({ title, siteLabel }) =>
        `Analyze "${title}" on ${siteLabel} as research material. Separate key claims, supporting evidence, counterpoints, uncertainty, and sources to verify.`,
    ),
    promptTemplate(
      "profile-research-assistant-questions",
      ({ title }) => `Create 7 follow-up research questions for "${title}" and explain how to verify each one.`,
    ),
  ],
  "fact-checker": [
    promptTemplate(
      "profile-fact-checker-claims",
      ({ title, siteLabel }) =>
        `Fact-check "${title}" on ${siteLabel}. Extract checkable claims and list evidence, counter-evidence, missing context, verdict, and confidence for each.`,
    ),
    promptTemplate(
      "profile-fact-checker-framing",
      ({ title }) =>
        `Find statements in "${title}" that may be technically true but misleading because of missing context. Rewrite a verified-only summary.`,
    ),
    promptTemplate(
      "profile-fact-checker-sources",
      ({ title }) =>
        `For the top 5 claims in "${title}", identify which primary or official sources would verify them and the order to check them.`,
    ),
  ],
  "strategy-analyst": [
    promptTemplate(
      "profile-strategy-analyst-opportunities",
      ({ title, siteLabel }) =>
        `Analyze "${title}" on ${siteLabel} from a strategy perspective. Summarize opportunities, risks, assumptions, decision points, and recommended next actions.`,
    ),
    promptTemplate(
      "profile-strategy-analyst-options",
      ({ title }) => `Based on "${title}", compare 3 possible actions by cost, impact, risk, and recommendation.`,
    ),
  ],
  "product-manager": [
    promptTemplate(
      "profile-product-manager-prd",
      ({ title }) =>
        `Draft a PRD from "${title}" with problem statement, target user, evidence, non-goals, success metrics, user stories, risks, and launch measurement.`,
    ),
    promptTemplate(
      "profile-product-manager-opportunity",
      ({ title }) =>
        `Evaluate the product opportunity in "${title}". Cover user pain, business impact, validation plan, RICE-style priority, and what evidence would change the decision.`,
    ),
    promptTemplate(
      "profile-product-manager-roadmap",
      ({ title }) =>
        `Classify ideas from "${title}" into Now / Next / Later and explain the evidence, trade-offs, and dependencies for each.`,
    ),
  ],
  "marketing-strategist": [
    promptTemplate(
      "profile-marketing-strategist-hooks",
      ({ title, siteLabel, isYouTube }) =>
        `Analyze "${title}" on ${siteLabel}${isYouTube ? " video" : ""} from a marketing perspective. Suggest 10 content hooks, target audiences, key messages, and CTAs.`,
    ),
    promptTemplate(
      "profile-marketing-strategist-campaigns",
      ({ title }) => `Create 5 campaign ideas from "${title}". For each, list target, message, channel, and success metric.`,
    ),
  ],
  "slide-maker": [
    promptTemplate(
      "profile-slide-maker-images",
      ({ title, siteLabel }) =>
        `Create presentation-friendly 16:9 slide images from "${title}" on ${siteLabel} by analyzing the source into meaningful parts and making one representative slide image for each part unless I ask for a different format. First define audience, objective, design direction, and a compact source-part storyboard. For each slide, write one source-grounded slide spec and one source-grounded image prompt, then generate the slides sequentially in this same Codex turn, one image at a time. For slide 2 and later, use the previous generated slide image path or preview reference plus the previous slide prompt as explicit continuity references for style, layout, palette, typography, and components. Choose a visual language that fits the content instead of reusing one generic template. Do not invent numbers, charts, logos, or claims not present in the source context.`,
    ),
    promptTemplate(
      "profile-slide-maker-storyboard",
      ({ title }) =>
        `Storyboard a deck from "${title}" by segmenting the source into meaningful parts. For each representative part, include audience need, slide title, core message, source evidence needed, and recommended visual structure.`,
    ),
    promptTemplate(
      "profile-slide-maker-executive",
      ({ title }) =>
        `Turn "${title}" into decision-ready executive slide images by mapping the source's meaningful parts into a board-ready narrative: decision context, executive summary, key insights, options or trade-offs, recommendation, execution plan, risks, and asks only where supported by the source. First create the source-part storyboard, then write a source-grounded slide spec and image prompt for each representative part, and generate the slides sequentially in this same Codex turn, one image at a time. For every slide after slide 1, include the previous generated slide image path or preview reference and previous slide prompt summary as continuity references so the deck feels like one coherent visual system. Do not stop at an outline unless I explicitly ask only for planning.`,
    ),
  ],
  "sales-gtm-strategist": [
    promptTemplate(
      "profile-sales-gtm-strategist-outreach",
      ({ title, siteLabel }) =>
        `Use "${title}" on ${siteLabel} to identify ICP, customer pain, trigger event, personalization points, and write 3 concise sales outreach drafts.`,
    ),
    promptTemplate(
      "profile-sales-gtm-strategist-objections",
      ({ title }) =>
        `From "${title}", list likely customer objections, proof needed, response scripts, and next-best actions in a table.`,
    ),
    promptTemplate(
      "profile-sales-gtm-strategist-tests",
      ({ title }) =>
        `Design 3 GTM experiments from "${title}" with target, message, channel, success metric, and stop criteria.`,
    ),
  ],
  "legal-reviewer": [
    promptTemplate(
      "profile-legal-reviewer-risks",
      ({ title }) =>
        `Review "${title}" from a legal-understanding perspective. Summarize risks, obligations, ambiguous wording, and questions for qualified legal counsel. Do not present this as legal advice.`,
    ),
    promptTemplate(
      "profile-legal-reviewer-obligations",
      ({ title }) =>
        `Extract obligations, deadlines, restrictions, and terms needing clarification from "${title}" in a table.`,
    ),
  ],
  "teacher-mode": [
    promptTemplate(
      "profile-teacher-mode-simple",
      ({ title }) =>
        `Explain "${title}" in simple terms for a beginner. Use analogies, examples, and end with 3 check-for-understanding questions.`,
    ),
    promptTemplate(
      "profile-teacher-mode-concepts",
      ({ title }) =>
        `Extract the must-know concepts from "${title}" as term, explanation, example, common misconception, and one-line summary.`,
    ),
  ],
  "data-analyst": [
    promptTemplate(
      "profile-data-analyst-insights",
      ({ title }) =>
        `Analyze the visible metrics and data in "${title}". Summarize insights, anomalies, likely causes, and follow-up analyses.`,
    ),
    promptTemplate(
      "profile-data-analyst-plan",
      ({ title }) =>
        `Create a data analysis plan for "${title}" including required data, metric definitions, visualization ideas, and validation steps.`,
    ),
  ],
  "product-ux-strategist": [
    promptTemplate(
      "profile-product-ux-strategist-improvements",
      ({ title, siteLabel }) =>
        `Evaluate "${title}" on ${siteLabel} from a product and UX perspective. Identify user goals, friction, accessibility issues, prioritized fixes, and implementation-ready copy.`,
    ),
    promptTemplate(
      "profile-product-ux-strategist-conversion",
      ({ title }) =>
        `Suggest conversion improvements for "${title}" covering information architecture, CTA, trust signals, accessibility, and priority.`,
    ),
  ],
  "writing-editor": [
    promptTemplate(
      "profile-writing-editor-improve",
      ({ title }) => `Improve the writing in "${title}" while preserving intent. Explain the main edits briefly.`,
    ),
    promptTemplate(
      "profile-writing-editor-tone",
      ({ title }) => `Rewrite "${title}" in three tones: professional, friendly, and short social-post style.`,
    ),
  ],
  "customer-support": [
    promptTemplate(
      "profile-customer-support-reply",
      ({ title }) =>
        `Draft a customer support reply using "${title}" as context. Include empathy, problem confirmation, resolution steps, and missing information to request.`,
    ),
    promptTemplate(
      "profile-customer-support-diagnose",
      ({ title }) =>
        `From "${title}", summarize the customer's likely issue, possible root causes, clarifying questions, resolution path, and escalation criteria.`,
    ),
  ],
  "hr-recruiting-partner": [
    promptTemplate(
      "profile-hr-recruiting-partner-copy",
      ({ title }) =>
        `Improve "${title}" from an HR and recruiting perspective. Clarify expectations, evaluation criteria, and bias risks.`,
    ),
    promptTemplate(
      "profile-hr-recruiting-partner-interview",
      ({ title }) => `Create job-relevant interview questions from "${title}" with strong-answer criteria and red flags in a table.`,
    ),
  ],
  "finance-business-analyst": [
    promptTemplate(
      "profile-finance-business-analyst-numbers",
      ({ title }) =>
        `Interpret the financial or business metrics in "${title}". Separate conclusion, assumptions, risks, and follow-up checks.`,
    ),
    promptTemplate(
      "profile-finance-business-analyst-scenarios",
      ({ title }) => `Build upside, base, and downside scenarios from "${title}" with key assumptions, sensitivities, and risk factors.`,
    ),
    promptTemplate(
      "profile-finance-business-analyst-pricing",
      ({ title }) =>
        `Analyze "${title}" from pricing and profitability perspectives. Cover unit economics, margin risk, and validation experiments.`,
    ),
  ],
  "email-comms-assistant": [
    promptTemplate(
      "profile-email-comms-assistant-reply",
      ({ title }) => `Draft a natural reply for "${title}". Include the other person's intent, any missing questions, and a shorter version.`,
    ),
    promptTemplate(
      "profile-email-comms-assistant-actions",
      ({ title }) => `From "${title}", extract the sender's request, deadline, my action items, and what the reply should include.`,
    ),
    promptTemplate(
      "profile-email-comms-assistant-tone",
      ({ title }) => `Write three reply versions for "${title}": formal, concise, and friendly.`,
    ),
  ],
  "roast-coach": [
    promptTemplate(
      "profile-roast-coach-roast",
      ({ title }) =>
        `Review "${title}" in roast-coach mode. Give a sharp one-line roast, the real issue underneath, weak assumptions, a smarter revision, and one next action.`,
    ),
    promptTemplate(
      "profile-roast-coach-self-deception",
      ({ title }) =>
        `Find where "${title}" may contain self-justification, unsupported confidence, or weaknesses other people would immediately notice. Turn it into actionable improvements.`,
    ),
    promptTemplate(
      "profile-roast-coach-preflight",
      ({ title }) =>
        `Before publishing "${title}", identify embarrassing phrasing, flimsy claims, likely misunderstandings, and how to fix them.`,
    ),
  ],
  "harsh-comment-simulator": [
    promptTemplate(
      "profile-harsh-comment-simulator-comments",
      ({ title }) =>
        `Simulate harsh public reactions to "${title}". For each reaction, explain the legitimate concern underneath and how to revise or respond.`,
    ),
    promptTemplate(
      "profile-harsh-comment-simulator-controversy",
      ({ title }) =>
        `Predict where "${title}" could be controversial, maliciously interpreted, or attacked. Suggest defensible responses and revisions.`,
    ),
    promptTemplate(
      "profile-harsh-comment-simulator-replies",
      ({ title }) => `Create 5 types of harsh comments about "${title}" and write concise, non-defensive responses for each.`,
    ),
  ],
};

export function createProfileSuggestionCards(input: ProfileSuggestionInput): ActionCard[] {
  const profile = input.profile;
  if (!profile || profile.id === "default") {
    return [];
  }

  const context = createSuggestionContext(input.currentTab, input.locale);
  if (profile.suggestedPrompts?.length) {
    return profile.suggestedPrompts.slice(0, 3).map((prompt, index) => ({
      id: `profile-${profile.id}-custom-${index + 1}`,
      title: createPromptTitle(prompt),
      description: "",
      kind: "prompt",
      prompt: withOutputLanguage(interpolatePrompt(prompt, context), context),
    }));
  }

  const templates = PROFILE_PROMPTS[profile.id] ?? createFallbackTemplates(profile.name);
  return templates.slice(0, 3).map((template) => ({
    id: template.id,
    title: getActionCardTitle(input.locale, template.id),
    description: "",
    kind: "prompt",
    prompt: withOutputLanguage(template.prompt(context), context),
  }));
}

function promptTemplate(
  id: string,
  prompt: (context: ProfileSuggestionContext) => string,
): ProfilePromptTemplate {
  return { id, prompt };
}

function getActionCardTitle(locale: string, cardId: string): string {
  const localized = getActionCardTitleFromCatalog(locale, cardId);
  if (localized) {
    return localized;
  }
  return getActionCardTitleFromCatalog("en", cardId) ?? cardId;
}

function getActionCardTitleFromCatalog(locale: string, cardId: string): string | null {
  const title = (getUiStrings(locale).actionCards as Record<string, string>)[cardId];
  return typeof title === "string" && title.trim() ? title : null;
}

function createPromptTitle(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/gu, " ");
  return normalized.length <= 24 ? normalized : `${normalized.slice(0, 23).trimEnd()}…`;
}

function interpolatePrompt(prompt: string, context: ProfileSuggestionContext): string {
  return prompt
    .replaceAll("{title}", context.title)
    .replaceAll("{site}", context.siteLabel);
}

function withOutputLanguage(prompt: string, context: ProfileSuggestionContext): string {
  return `${prompt} Answer in ${context.outputLanguage}.`;
}

export function mergeProfileAndSiteSuggestionCards(
  profileCards: ActionCard[],
  siteCards: ActionCard[],
  limit: number,
): ActionCard[] {
  const seen = new Set<string>();
  const merged: ActionCard[] = [];
  const reservedSiteCount =
    siteCards.length >= 2
      ? Math.min(2, Math.max(0, limit - 1))
      : Math.min(siteCards.length, limit);
  const primaryProfileCount = Math.max(0, limit - reservedSiteCount);
  const orderedCards = [
    ...profileCards.slice(0, primaryProfileCount),
    ...siteCards,
    ...profileCards.slice(primaryProfileCount),
  ];
  for (const card of orderedCards) {
    if (seen.has(card.id)) {
      continue;
    }
    seen.add(card.id);
    merged.push(card);
    if (merged.length >= limit) {
      break;
    }
  }
  return merged;
}

export function getSuggestionCardSource(card: Pick<ActionCard, "id">): SuggestionCardSource {
  return card.id.startsWith("profile-") ? "profile" : "site";
}

function createSuggestionContext(tab: OpenTabContext | null, locale: string): ProfileSuggestionContext {
  const outputLanguage = getPromptOutputLanguageName(locale);
  const title = normalizeTitle(tab?.title ?? "current page");
  const siteLabel = getSiteLabel(tab?.url ?? "");
  return {
    title,
    siteLabel,
    isYouTube: isYouTubeLikeUrl(tab?.url ?? ""),
    outputLanguage,
  };
}

function createFallbackTemplates(profileName: string): ProfilePromptTemplate[] {
  return [
    promptTemplate(
      "profile-fallback-analyze",
      ({ title }) =>
        `Analyze "${title}" from the perspective of ${profileName}. Summarize the key points, important details, and recommended next actions.`,
    ),
  ];
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+-\s+YouTube$/iu, "").trim() || "current page";
}

function getSiteLabel(url: string): string {
  if (isYouTubeLikeUrl(url)) {
    return "the current YouTube page";
  }
  try {
    const hostname = new URL(url).hostname.replace(/^www\./iu, "");
    return hostname || "the current site";
  } catch {
    return "the current site";
  }
}

function isYouTubeLikeUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./iu, "");
    return hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
  } catch {
    return /youtube|youtu\.be/iu.test(url);
  }
}
