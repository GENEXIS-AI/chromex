import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const I18N_SOURCE = resolve(ROOT, "packages/extension/src/sidepanel/i18n.ts");
const START_MARKER = "  // __GENERATED_SIDE_PANEL_TRANSLATIONS_START__";
const END_MARKER = "  // __GENERATED_SIDE_PANEL_TRANSLATIONS_END__";
const MAX_CHUNK_CHARS = 4_800;
const REQUEST_DELAY_MS = 30;

const GOOGLE_TARGET_LOCALE = {
  fil: "tl",
  nb: "no",
  "pt-BR": "pt",
  "pt-PT": "pt",
};

const DYNAMIC_TEMPLATES = {
  "status.voiceReconnecting": "Voice connection dropped. Reconnecting {attempt}/{maxAttempts}...",
  "status.noMatchFor": 'No matching content found for "{query}"',
  "status.duplicateFile": '"{name}" is already attached.',
  "status.fileTooLarge": '"{name}" is too large to attach.',
  "status.skillArchiveInstalled": "{count} skills installed.",
  "status.imageFolderOpened": "Opened image folder: {folder}",
  "status.logFolderOpened": "Opened log folder: {folder}",
  "status.rateLimitUsed": "{limitName} {usedPercent}% used, resets {reset}",
  "prompts.imageAttachmentPromptExtract":
    "Analyze the attached image{pluralSuffix} ({imageList}) and extract a reusable image-generation prompt. Include subject, composition, style, lighting, colors, typography or text treatment if visible, aspect ratio, negative constraints, and the details needed to recreate the result. Do not generate or edit an image unless I explicitly ask for image generation or editing. Answer in {outputLanguage}.",
  "prompts.imageAttachmentDescribe":
    "Describe the attached image{pluralSuffix} ({imageList}). Explain what is visible, important context, notable text, visual hierarchy, and any uncertainty. Answer in {outputLanguage}.",
  "profileEditor.recommendationPlaceholder": "Recommendation {index}",
};

const tempDir = await mkdtemp(resolve(tmpdir(), "chromex-i18n-"));
const bundledModule = resolve(tempDir, "i18n.mjs");

try {
  await build({
    entryPoints: [I18N_SOURCE],
    outfile: bundledModule,
    bundle: true,
    platform: "node",
    format: "esm",
    target: ["node22"],
    logLevel: "silent",
  });

  const i18n = await import(pathToFileURL(bundledModule).href);
  const locales = i18n
    .listSupportedUiLanguageOptions()
    .map((option) => option.locale)
    .filter((locale) => locale !== "auto" && locale !== "en" && locale !== "ko");
  const staticKeys = i18n.listStaticUiStringTranslationKeys();
  const dynamicKeys = i18n.listDynamicUiStringTemplateKeys();
  const entries = [
    ...staticKeys.map((key) => ({ key, text: getPathValue(i18n.UI_STRINGS.en, key) })),
    ...dynamicKeys.map((key) => ({ key, text: DYNAMIC_TEMPLATES[key] })),
  ].filter((entry) => typeof entry.text === "string" && entry.text.trim());

  const catalog = {};
  for (const [index, locale] of locales.entries()) {
    console.log(`[${index + 1}/${locales.length}] translating ${locale}`);
    catalog[locale] = await translateEntries(locale, entries);
  }

  await replaceGeneratedCatalog(catalog);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function translateEntries(locale, entries) {
  const targetLocale = GOOGLE_TARGET_LOCALE[locale] ?? locale;
  const translated = {};
  for (const chunk of chunkEntries(entries)) {
    const chunkResult = await translateChunk(targetLocale, chunk);
    Object.assign(translated, chunkResult);
    await delay(REQUEST_DELAY_MS);
  }
  return translated;
}

async function translateChunk(targetLocale, entries) {
  const protectedEntries = entries.map((entry) => ({
    ...entry,
    ...protectTemplatePlaceholders(entry.text),
  }));
  const payload = protectedEntries.map((entry, index) => `@@${index}@@ ${entry.text}`).join("\n");
  const translatedText = await requestTranslation(targetLocale, payload);
  const parsed = parseMarkedTranslations(translatedText);
  return Object.fromEntries(
    protectedEntries.map((entry, index) => [
      entry.key,
      restoreTemplatePlaceholders(parsed[index]?.trim() || entry.originalText, entry.placeholders),
    ]),
  );
}

function protectTemplatePlaceholders(text) {
  const placeholders = [];
  const protectedText = text.replace(/\{[A-Za-z][A-Za-z0-9]*\}/gu, (placeholder) => {
    const token = `__CHROMEX_PLACEHOLDER_${placeholders.length}__`;
    placeholders.push({ token, placeholder });
    return token;
  });
  return { text: protectedText, originalText: text, placeholders };
}

function restoreTemplatePlaceholders(text, placeholders) {
  return placeholders.reduce(
    (result, { token, placeholder }) => result.replaceAll(token, placeholder),
    text,
  );
}

async function requestTranslation(targetLocale, text) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: targetLocale,
    dt: "t",
    q: text,
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params}`;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      return (payload[0] ?? []).map((part) => part[0]).join("");
    } catch (error) {
      lastError = error;
      await delay(250 * attempt);
    }
  }
  throw lastError ?? new Error(`Translation failed for ${targetLocale}`);
}

function parseMarkedTranslations(value) {
  const markerPattern = /@@(\d+)@{1,2}/gu;
  const matches = [...value.matchAll(markerPattern)];
  const parsed = {};
  for (const [index, match] of matches.entries()) {
    const key = Number.parseInt(match[1], 10);
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? value.length : value.length;
    parsed[key] = value.slice(start, end).trim();
  }
  return parsed;
}

function chunkEntries(entries) {
  const chunks = [];
  let current = [];
  let currentChars = 0;
  for (const entry of entries) {
    const entryChars = entry.text.length + entry.key.length + 12;
    if (current.length && currentChars + entryChars > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(entry);
    currentChars += entryChars;
  }
  if (current.length) {
    chunks.push(current);
  }
  return chunks;
}

function getPathValue(root, path) {
  return path.split(".").reduce((value, part) => value?.[part], root);
}

async function replaceGeneratedCatalog(catalog) {
  const source = await readFile(I18N_SOURCE, "utf8");
  const json = JSON.stringify(catalog, null, 2);
  const body = json
    .split("\n")
    .slice(1, -1)
    .map((line) => `  ${line}`)
    .join("\n");
  const nextSource = source.replace(
    new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`, "u"),
    `${START_MARKER}\n${body}\n${END_MARKER}`,
  );
  if (nextSource === source) {
    throw new Error("Generated translation markers were not found.");
  }
  await writeFile(I18N_SOURCE, nextSource);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
