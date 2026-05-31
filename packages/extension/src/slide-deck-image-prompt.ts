import { getPromptOutputLanguageName } from "./ui-language.js";

export interface SlideDeckImagePromptInput {
  locale: string;
  pageTitle: string;
  pageUrl: string;
  userPrompt: string;
}

export function buildSlideDeckImagePrompt(input: SlideDeckImagePromptInput): string {
  const outputLanguage = getPromptOutputLanguageName(input.locale);
  const title = input.pageTitle.trim() || "Current page";
  const url = input.pageUrl.trim() || "unknown URL";
  const userPrompt = input.userPrompt.trim();

  return [
    "Instructions:",
    "Use Codex app-server image generation through the available image-generation tool. Do not call a direct Image API. Do not request a batched multi-image API response.",
    "Task type: sequential-slide-image-generation.",
    "Output language: " + outputLanguage + ".",
    "Source boundary:",
    'The page context is attached separately as "PRIVATE PAGE CONTEXT". Use only that current-page DOM/adapter data, attached files, and prior conversation context as source material.',
    "Workflow:",
    "- First create a compact storyboard by segmenting the source into meaningful parts or sections, then assign a slide title, source-grounded message, and visual structure to each representative part.",
    "- Then generate each slide image sequentially in this same Codex turn: finish slide 1, then start slide 2, then continue until the storyboard is complete.",
    "- Each slide must be a separate image-generation tool call. Do not generate all slides in one image, one sprite sheet, or a single collage unless the user explicitly asks for that.",
    "- If the user specifies a slide count, honor it. If not, infer the sequence from the source: one representative slide per meaningful part, merging tiny or redundant parts. Do not hard-code a default slide count.",
    "- For executive-report, board, leadership, investor, or decision-meeting requests, generate the actual slide images after the storyboard. Do not return only an outline or optional image prompts.",
    "- Reference chaining is required for multi-slide generation: after slide 1 is generated, use its saved image path or preview reference and its exact image prompt as continuity input for slide 2; repeat this for every later slide.",
    "- Every slide 2+ image-generation prompt must include: Reference images/Input images = previous generated slide image, role = visual continuity reference; Previous slide prompt summary; Reused visual system = palette, typography, grid, spacing, components, and illustration/chart style.",
    "- If the previous generated image cannot be attached as an actual image input, do not silently continue as unrelated images. Add an explicit continuity instruction inside each slide 2+ request: Deck visual system contract = same palette, typography, grid, spacing, component shapes, icon style, chart style, illustration style, lighting, depth, and overall presentation identity as slide 1.",
    "- Before generating slide 1, define the Deck visual system contract in concrete terms. Reuse that exact contract in every later slide prompt, even when a previous image path or preview reference is also available.",
    "- The previous slide reference is for consistent deck design only. Do not copy the previous slide's content, claim, chart, or headline into the next slide unless the storyboard explicitly requires it.",
    "- Save every generated slide image and mention each saved path or image result in order.",
    "Slide design requirements:",
    "- Aim for a presentation-friendly 16:9 landscape slide unless the user asks for a different format.",
    "- Use large typography, strong hierarchy, clean spacing, consistent visual system, and no tiny paragraphs.",
    "- Each slide should have one clear title, one core message, and only source-grounded supporting evidence.",
    "- Prefer diagrams, process flows, comparison layouts, timelines, and insight cards over generic posters.",
    "- Do not invent metrics, charts, logos, citations, dates, quotes, or claims not present in the source context.",
    "User request:",
    userPrompt || "Create presentation slide images from the current page.",
    "Page metadata:",
    `Title: ${title}`,
    `URL: ${url}`,
  ].join("\n");
}
