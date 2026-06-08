import { getPromptOutputLanguageName } from "./ui-language.js";

export interface ComicImagePromptInput {
  locale: string;
  pageTitle: string;
  pageUrl: string;
  userPrompt: string;
}

export function buildComicImagePrompt(input: ComicImagePromptInput): string {
  const outputLanguage = getPromptOutputLanguageName(input.locale);
  const title = input.pageTitle.trim() || "Current page";
  const url = input.pageUrl.trim() || "unknown URL";
  const userPrompt = input.userPrompt.trim();

  return [
    "Instructions:",
    "Use Codex app-server image generation through the available image-generation tool. Do not call a direct Image API. Do not request a batched multi-image API response.",
    "Task type: sequential-current-page-comic-generation.",
    "Output language: " + outputLanguage + ".",
    "Source boundary:",
    'The page context is attached separately as "PRIVATE PAGE CONTEXT". Use only that current-page DOM/adapter data, attached files, and prior conversation context as source material.',
    "Workflow:",
    "- First create a compact comic storyboard by segmenting the source into meaningful story beats, sections, or argument turns.",
    "- Then generate each comic image sequentially in this same Codex turn: finish comic image 1, then start comic image 2, then continue until the storyboard is complete.",
    "- Each comic image must be a separate image-generation tool call. Do not generate all comic images in one sprite sheet, one giant poster, or one batched multi-image request unless the user explicitly asks for that.",
    "- Infer the number of panels and comic images from the source. Do not hard-code a default panel count, do not force any fixed panel format, and do not compress important material just to fit one image.",
    "- If the source has too much content for one comic image, split it into multiple comic images: one representative comic image per meaningful story segment, merging only tiny or redundant segments.",
    "- Generate the actual comic images after the storyboard. Do not return only an outline or optional image prompts.",
    "- Reference chaining is required for multi-image comics: after comic image 1 is generated, use its saved image path or preview reference and its exact image prompt as continuity input for comic image 2; repeat this for every later image.",
    "- Every comic image 2+ generation prompt must include: Reference images/Input images = previous generated comic image, role = visual continuity reference; Previous comic prompt summary; Reused visual system = character design, palette, panel border style, typography, caption style, linework, lighting, and scene depth.",
    "- If the previous generated image cannot be attached as an actual image input, do not silently continue as unrelated images. Add an explicit continuity instruction inside each comic image 2+ request: Comic visual system contract = same character design, palette, panel border style, typography, caption style, linework, lighting, and overall comic identity as comic image 1.",
    "- Before generating comic image 1, define the Comic visual system contract in concrete terms. Reuse that exact contract in every later comic image prompt, even when a previous image path or preview reference is also available.",
    "- The previous comic image reference is for consistent comic design only. Do not copy the previous image's content, scene, caption, or event into the next image unless the storyboard explicitly requires continuity.",
    "- Save every generated comic image and mention each saved path or image result in order.",
    "Comic design requirements:",
    "- Do not reduce the page into generic concept-only scenes. The comic must preserve concrete people, products, events, claims, examples, numbers, and cause-effect steps from the source when those details are available.",
    "- Every storyboard beat must include: source detail, visual scene, explanatory caption or speech bubble, and why it matters.",
    "- For each generated image prompt, describe explicit panel-by-panel content: panel scene, characters or objects, on-image text, caption or speech bubble, and the source fact being explained.",
    "- Use readable captions and speech bubbles. Keep text short enough to be legible inside the image.",
    "- If the source contains explanations, definitions, comparisons, or process steps, convert those explanations into captions, callout boxes, mini diagrams, before/after panels, or short narrator text instead of dropping them.",
    "- Each panel should advance the story or explanation with one clear beat grounded in the source.",
    "- A viewer should understand the actual source argument visually and conceptually without reading the original page.",
    "- Prefer visual storytelling, scene changes, character reactions, symbolic objects, simple diagrams, and clear before/after moments over dense text.",
    "- Do not invent metrics, charts, logos, citations, dates, quotes, or claims not present in the source context.",
    "User request:",
    userPrompt || "Create comic images from the current page.",
    "Page metadata:",
    `Title: ${title}`,
    `URL: ${url}`,
  ].join("\n");
}
