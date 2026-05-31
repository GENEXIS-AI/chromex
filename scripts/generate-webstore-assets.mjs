import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "output/chrome-web-store-assets");
const COLOR_ICON = resolve(ROOT, "packages/extension/public/icons/codex-128.png");
const LINE_ICON = resolve(ROOT, "packages/extension/public/icons/chromex-line-source.png");
const COLOR_ICON_DATA_URI = await toDataUri(COLOR_ICON, "image/png");
const LINE_ICON_DATA_URI = await toDataUri(LINE_ICON, "image/png");

const screenshotScenarios = [
  {
    file: "screenshot-1-browser-assistant-1280x800.png",
    title: "Ask Chromex about the page you are viewing",
    subtitle: "A side panel assistant that can read the current page, selected tabs, screenshots, files, and images only when you ask.",
    pageKind: "github",
    panelKind: "chat",
    prompt: "Summarize this repository and identify the highest-risk open issues.",
    chips: ["Current tab", "github.com/open-source/project"],
    answerTitle: "Repository brief",
    answer: [
      "Chromex is using the active tab context to summarize the repository and organize next steps.",
      "It found setup instructions, recent issues, and a release checklist without copying the entire raw page into the prompt."
    ],
    suggestions: ["Summarize this page", "Find risks", "Draft a reply"]
  },
  {
    file: "screenshot-2-youtube-context-1280x800.png",
    title: "Turn YouTube videos into useful notes",
    subtitle: "Video-aware suggestions, transcript-aware summaries, timestamped notes, and one-click seek actions.",
    pageKind: "youtube",
    panelKind: "youtube",
    prompt: "Create timestamped notes for this video and highlight the key examples.",
    chips: ["YouTube", "Designing Agentic Browser UX"],
    answerTitle: "Timestamped notes",
    answer: [
      "00:42 Why browser context matters",
      "04:18 Planning before acting",
      "09:31 When to use DOM, vision, or both"
    ],
    suggestions: ["Summarize video", "Explain current scene", "Chapter notes"]
  },
  {
    file: "screenshot-3-image-editing-1280x800.png",
    title: "Edit images from the page or your upload",
    subtitle: "Use page images, screenshots, uploaded references, and follow-up edits in one conversation.",
    pageKind: "image",
    panelKind: "image",
    prompt: "Change the poster text to English and keep the original layout.",
    chips: ["Uploaded image", "Current page image"],
    answerTitle: "Image edit ready",
    answer: ["The edited image is saved locally and can be opened or refined from the chat."],
    suggestions: ["Translate image text", "Remove background", "Create variants"]
  },
  {
    file: "screenshot-4-local-bridge-privacy-1280x800.png",
    title: "Built for local-first privacy controls",
    subtitle: "OAuth, API-key fallback, generated assets, audio, and diagnostics stay behind the local native bridge.",
    pageKind: "news",
    panelKind: "privacy",
    prompt: "Use only the current article and create a source-grounded summary.",
    chips: ["Current article", "DOM first"],
    answerTitle: "Privacy boundary",
    answer: [
      "The extension stores no raw OpenAI API keys.",
      "Page and tab access power core workflows; history, microphone, and screen capture stay feature-scoped."
    ],
    suggestions: ["Article summary", "Fact check claims", "Create infographic"]
  },
  {
    file: "screenshot-5-voice-and-files-1280x800.png",
    title: "Talk, attach files, and keep working",
    subtitle: "Dictate into chat, start a live session, attach files, and route each request to the right workflow.",
    pageKind: "docs",
    panelKind: "voice",
    prompt: "Turn this draft and the attached PDF into an executive update.",
    chips: ["Current doc", "roadmap.pdf"],
    answerTitle: "Working with attachments",
    answer: [
      "Chromex can combine page context with uploaded files while keeping attachments visually separate from tab context.",
      "Profiles tune the response style without exposing hidden instructions in chat."
    ],
    suggestions: ["Draft executive summary", "Compare with PDF", "Rewrite for Slack"]
  }
];

const promoAssets = [
  {
    file: "small-promo-440x280.png",
    width: 440,
    height: 280,
    title: "Chromex",
    subtitle: "Codex-powered browser assistant",
    mode: "small"
  },
  {
    file: "marquee-promo-1400x560.png",
    width: 1400,
    height: 560,
    title: "Chromex",
    subtitle: "Page context, voice, image editing, and browser workflows in one Chrome side panel",
    mode: "marquee"
  }
];

await mkdir(OUT_DIR, { recursive: true });
await copyFile(COLOR_ICON, resolve(OUT_DIR, "icon-128.png"));

const browserExecutablePath = readEnvValue(process.env, "BROWSER_EXECUTABLE_PATH")?.trim();
const discoveredBrowserExecutablePath = browserExecutablePath || (await findExistingBrowserExecutable());
let browser;
try {
  browser = await chromium.launch({
    ...(discoveredBrowserExecutablePath ? { executablePath: discoveredBrowserExecutablePath } : {}),
    headless: true,
  });
} catch (error) {
  throw new Error(
    [
      "Chrome Web Store asset rendering needs a local Chromium/Chrome executable.",
      "Run `npm run smoke:install-browser` or set BROWSER_EXECUTABLE_PATH to an installed Chrome/Chromium executable, then rerun `npm run store:assets`.",
      error instanceof Error ? `Original error: ${error.message}` : `Original error: ${String(error)}`,
    ].join("\n"),
  );
}
try {
  for (const scenario of screenshotScenarios) {
    await renderPng({
      browser,
      width: 1280,
      height: 800,
      file: scenario.file,
      html: renderScreenshot(scenario)
    });
  }
  for (const asset of promoAssets) {
    await renderPng({
      browser,
      width: asset.width,
      height: asset.height,
      file: asset.file,
      html: renderPromo(asset)
    });
  }
} finally {
  await browser.close();
}

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceIcon: "packages/extension/public/icons/codex-128.png",
  assets: [
    "icon-128.png",
    ...screenshotScenarios.map((item) => item.file),
    ...promoAssets.map((item) => item.file)
  ].map((file) => ({
    file,
    path: `output/chrome-web-store-assets/${file}`
  }))
};
await writeFile(resolve(OUT_DIR, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${manifest.assets.length} Chrome Web Store assets in ${OUT_DIR}`);

async function renderPng({ browser, width, height, file, html }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: resolve(OUT_DIR, file), type: "png" });
  } finally {
    await page.close();
  }
}

function renderScreenshot(scenario) {
  return htmlPage(`
    <main class="store-shot">
      <section class="browser ${scenario.pageKind}">
        ${renderBrowserChrome(scenario)}
        ${renderPageMock(scenario.pageKind)}
      </section>
      <aside class="panel ${scenario.panelKind}">
        <header class="panel-top">
          <span class="panel-brand"><img src="${COLOR_ICON_DATA_URI}" alt=""> Chromex</span>
          <span class="top-icons">☰ ⋮ ＋</span>
        </header>
        <section class="assistant-hero">
          <img class="line-icon" src="${LINE_ICON_DATA_URI}" alt="">
          <h2>${escapeHtml(scenario.title)}</h2>
          <p>${escapeHtml(scenario.subtitle)}</p>
        </section>
        <section class="suggestions" aria-label="Suggested questions">
          ${scenario.suggestions.map((item) => `<button><span>${siteIcon(scenario.pageKind)}</span>${escapeHtml(item)}</button>`).join("")}
        </section>
        <section class="response-card">
          <div class="response-eyebrow">${escapeHtml(scenario.answerTitle)}</div>
          ${scenario.answer.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </section>
        <section class="composer">
          <div class="chips">${scenario.chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</div>
          <p>${escapeHtml(scenario.prompt)}</p>
          <footer>
            <span class="plus">＋</span>
            <span class="model">5.5 · balanced</span>
            <span class="mic">◌</span>
            <span class="send">➤</span>
          </footer>
        </section>
      </aside>
    </main>
  `);
}

function renderPromo(asset) {
  const isMarquee = asset.mode === "marquee";
  return htmlPage(`
    <main class="promo ${asset.mode}">
      <div class="promo-copy">
        <img src="${COLOR_ICON_DATA_URI}" alt="">
        <h1>${escapeHtml(asset.title)}</h1>
        <p>${escapeHtml(asset.subtitle)}</p>
        ${isMarquee ? `<div class="promo-tags"><span>Page context</span><span>Voice</span><span>Image editing</span><span>Local bridge</span></div>` : ""}
      </div>
      <div class="promo-panel">
        <div class="mini-line"></div>
        <div class="mini-line short"></div>
        <div class="mini-card">Summarize this page</div>
        <div class="mini-card blue">Create an infographic</div>
        <div class="mini-composer">Ask anything…</div>
      </div>
    </main>
  `);
}

function renderBrowserChrome(scenario) {
  const host = {
    github: "github.com/open-source/project",
    youtube: "youtube.com/watch?v=agentic-ux",
    image: "design.example.com/poster",
    news: "news.example.com/ai-browser-agents",
    docs: "docs.google.com/document/d/roadmap"
  }[scenario.pageKind] ?? "example.com";
  return `
    <div class="browser-top">
      <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
      <div class="address">${escapeHtml(host)}</div>
    </div>
  `;
}

function renderPageMock(kind) {
  if (kind === "youtube") {
    return `
      <div class="page youtube-page">
        <div class="video-card"><div class="play">▶</div><div class="wave"></div></div>
        <h1>Designing Agentic Browser UX</h1>
        <p>Transcript, chapters, and current playback moment are available.</p>
        <div class="comments"><span></span><span></span><span></span></div>
      </div>
    `;
  }
  if (kind === "image") {
    return `
      <div class="page image-page">
        <div class="poster"><strong>글로벌 출시</strong><em>Launch plan</em></div>
        <div class="side-list"><span></span><span></span><span></span><span></span></div>
      </div>
    `;
  }
  if (kind === "news") {
    return `
      <div class="page article-page">
        <p class="kicker">Analysis</p>
        <h1>Browser assistants move from search to action</h1>
        <p>New tools combine page context, user-selected permissions, and local runtimes.</p>
        <div class="article-lines">${Array.from({ length: 10 }, () => "<span></span>").join("")}</div>
      </div>
    `;
  }
  if (kind === "docs") {
    return `
      <div class="page docs-page">
        <h1>Q2 Product Roadmap</h1>
        <div class="doc-block"></div>
        <div class="doc-block small"></div>
        <div class="file-chip">roadmap.pdf</div>
      </div>
    `;
  }
  return `
    <div class="page github-page">
      <h1>open-source/project</h1>
      <div class="repo-grid"><span></span><span></span><span></span><span></span></div>
      <div class="issue-list">${Array.from({ length: 6 }, (_, index) => `<p><b>#${index + 42}</b> Improve browser workflow reliability</p>`).join("")}</div>
    </div>
  `;
}

function siteIcon(kind) {
  return {
    youtube: "▶",
    github: "◉",
    image: "▧",
    news: "◆",
    docs: "▤"
  }[kind] ?? "◆";
}

function htmlPage(body) {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <style>${css()}</style>
      </head>
      <body>${body}</body>
    </html>`;
}

function css() {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #090b0d;
      color: #f5f7fb;
      font-family: "SF Pro Display", "SF Pro Text", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .store-shot {
      width: 1280px;
      height: 800px;
      display: grid;
      grid-template-columns: 1fr 420px;
      gap: 18px;
      padding: 28px;
      background:
        radial-gradient(circle at 18% 10%, rgba(65, 201, 255, .18), transparent 34%),
        radial-gradient(circle at 87% 18%, rgba(132, 95, 255, .22), transparent 34%),
        linear-gradient(135deg, #0f1418, #090b0d 58%, #10131a);
    }
    .browser, .panel {
      border: 1px solid rgba(255,255,255,.12);
      background: rgba(13, 16, 20, .82);
      box-shadow: 0 34px 120px rgba(0,0,0,.44);
      overflow: hidden;
    }
    .browser { border-radius: 28px; }
    .panel {
      border-radius: 30px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background:
        linear-gradient(180deg, rgba(25,28,33,.96), rgba(12,14,17,.96)),
        #121418;
    }
    .browser-top {
      height: 54px;
      padding: 16px 18px;
      display: flex;
      gap: 9px;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,.09);
      background: rgba(255,255,255,.04);
    }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .red { background: #ff5f57; } .yellow { background: #ffbd2e; } .green { background: #28c840; }
    .address {
      margin-left: 12px;
      height: 30px;
      flex: 1;
      border-radius: 16px;
      background: rgba(255,255,255,.08);
      color: #aeb6c6;
      font-size: 14px;
      display: flex;
      align-items: center;
      padding: 0 18px;
    }
    .page { padding: 34px; height: calc(100% - 54px); }
    .github-page h1, .article-page h1, .docs-page h1 {
      font-size: 42px;
      margin: 0 0 24px;
      letter-spacing: -.04em;
    }
    .repo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 18px;
      margin-bottom: 26px;
    }
    .repo-grid span, .doc-block, .video-card, .poster {
      border-radius: 24px;
      background: linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.04));
      border: 1px solid rgba(255,255,255,.12);
    }
    .repo-grid span { height: 106px; }
    .issue-list {
      display: grid;
      gap: 10px;
      color: #cdd4df;
      font-size: 18px;
    }
    .issue-list p {
      margin: 0;
      padding: 14px 18px;
      border-radius: 16px;
      background: rgba(255,255,255,.06);
    }
    .video-card {
      height: 420px;
      display: grid;
      place-items: center;
      background:
        linear-gradient(135deg, rgba(0, 151, 255, .42), rgba(142, 84, 255, .32)),
        radial-gradient(circle at 70% 35%, rgba(255,255,255,.32), transparent 18%);
    }
    .play {
      width: 106px;
      height: 106px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(0,0,0,.42);
      font-size: 44px;
    }
    .youtube-page h1 {
      font-size: 36px;
      margin: 24px 0 8px;
    }
    .youtube-page p, .article-page p, .docs-page p {
      color: #b7bfcd;
      font-size: 20px;
      line-height: 1.45;
    }
    .comments, .side-list, .article-lines {
      display: grid;
      gap: 12px;
      margin-top: 24px;
    }
    .comments span, .side-list span, .article-lines span {
      height: 18px;
      border-radius: 999px;
      background: rgba(255,255,255,.10);
    }
    .image-page {
      display: grid;
      grid-template-columns: 1.1fr .8fr;
      gap: 28px;
      align-items: center;
    }
    .poster {
      height: 560px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 44px;
      background:
        linear-gradient(160deg, rgba(255, 198, 94, .86), rgba(255, 112, 124, .72) 46%, rgba(80, 134, 255, .66)),
        #333;
    }
    .poster strong {
      font-size: 54px;
      color: #0d1117;
      letter-spacing: -.04em;
    }
    .poster em {
      margin-top: 12px;
      color: rgba(13,17,23,.76);
      font-size: 28px;
      font-style: normal;
    }
    .side-list span { height: 82px; }
    .article-page .kicker {
      color: #8bd5ff;
      text-transform: uppercase;
      font-weight: 800;
      letter-spacing: .14em;
    }
    .article-lines span:nth-child(odd) { width: 92%; }
    .article-lines span:nth-child(even) { width: 78%; }
    .doc-block { height: 260px; margin-bottom: 18px; }
    .doc-block.small { height: 160px; }
    .file-chip {
      display: inline-flex;
      padding: 16px 22px;
      border-radius: 18px;
      background: rgba(155, 181, 255, .16);
      color: #c8d7ff;
      font-weight: 700;
    }
    .panel-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #d8dde8;
      font-size: 15px;
      font-weight: 700;
    }
    .panel-brand { display: flex; align-items: center; gap: 10px; }
    .panel-brand img { width: 24px; height: 24px; border-radius: 7px; }
    .top-icons { color: #aab2c2; letter-spacing: 8px; }
    .assistant-hero {
      margin-top: 10px;
      text-align: center;
      padding: 10px 18px 4px;
    }
    .line-icon {
      width: 58px;
      height: 58px;
      object-fit: contain;
      filter: grayscale(1) brightness(.72) contrast(.72);
      opacity: .9;
    }
    .assistant-hero h2 {
      margin: 14px 0 8px;
      font-size: 25px;
      line-height: 1.04;
      letter-spacing: -.04em;
    }
    .assistant-hero p {
      margin: 0 auto;
      max-width: 330px;
      color: #aeb6c6;
      font-size: 14px;
      line-height: 1.45;
    }
    .suggestions {
      display: grid;
      gap: 8px;
      padding: 4px 4px 0;
    }
    .suggestions button {
      height: 34px;
      border: 0;
      border-radius: 14px;
      background: transparent;
      color: #e7eaf1;
      display: flex;
      gap: 12px;
      align-items: center;
      font: 700 14px inherit;
      text-align: left;
    }
    .suggestions span {
      width: 22px;
      height: 22px;
      border-radius: 8px;
      background: #ff003d;
      display: grid;
      place-items: center;
      font-size: 11px;
      color: #fff;
    }
    .response-card {
      border-left: 3px solid #80a8ff;
      padding: 6px 0 6px 16px;
      color: #e5e9f2;
      font-size: 14px;
      line-height: 1.45;
    }
    .response-eyebrow {
      color: #9ebcff;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .response-card p { margin: 6px 0; }
    .composer {
      margin-top: auto;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 24px;
      background: rgba(255,255,255,.045);
      padding: 14px 16px 14px;
      min-height: 122px;
    }
    .chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .chips span {
      max-width: 300px;
      border-radius: 12px;
      padding: 7px 11px;
      background: rgba(154, 183, 255, .16);
      color: #c7d6ff;
      font-size: 13px;
      font-weight: 700;
    }
    .composer p {
      margin: 0 0 12px;
      color: #eef2fa;
      font-size: 16px;
      line-height: 1.35;
    }
    .composer footer {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #b8c0cc;
    }
    .plus {
      font-size: 28px;
      line-height: 1;
    }
    .model {
      margin-left: auto;
      border-radius: 999px;
      background: rgba(255,255,255,.07);
      padding: 9px 14px;
      font-weight: 800;
      color: #e8ecf4;
    }
    .send {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: #fff;
      color: #0d1117;
      display: grid;
      place-items: center;
      font-weight: 900;
    }
    .promo {
      width: 100vw;
      height: 100vh;
      padding: 34px;
      display: grid;
      align-items: center;
      background:
        radial-gradient(circle at 82% 15%, rgba(159, 107, 255, .32), transparent 36%),
        radial-gradient(circle at 18% 85%, rgba(49, 199, 255, .28), transparent 32%),
        linear-gradient(135deg, #080b0f, #131822);
      overflow: hidden;
    }
    .promo.small { grid-template-columns: 1fr; gap: 0; }
    .promo.marquee { grid-template-columns: 1fr 560px; gap: 58px; padding: 56px 78px; }
    .promo-copy img {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      box-shadow: 0 22px 54px rgba(45, 123, 255, .38);
    }
    .promo.small .promo-copy img { width: 54px; height: 54px; border-radius: 14px; }
    .promo-copy h1 {
      margin: 16px 0 8px;
      font-size: 58px;
      line-height: .9;
      letter-spacing: -.06em;
    }
    .promo.small .promo-copy h1 { font-size: 36px; }
    .promo-copy p {
      margin: 0;
      color: #c1c8d5;
      font-size: 24px;
      line-height: 1.25;
      max-width: 720px;
    }
    .promo.small .promo-copy p { font-size: 16px; max-width: 250px; }
    .promo-tags {
      display: flex;
      gap: 12px;
      margin-top: 28px;
      flex-wrap: wrap;
    }
    .promo-tags span {
      padding: 11px 15px;
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      color: #d6ddea;
      font-weight: 800;
    }
    .promo-panel {
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 34px;
      background: rgba(16,19,24,.86);
      padding: 28px;
      min-height: 280px;
      box-shadow: 0 34px 120px rgba(0,0,0,.34);
    }
    .promo.small .promo-panel {
      display: none;
    }
    .mini-line, .mini-line.short {
      height: 17px;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(122,170,255,.7), rgba(255,255,255,.12));
      margin-bottom: 14px;
    }
    .mini-line.short { width: 58%; }
    .mini-card {
      padding: 16px 18px;
      border-radius: 18px;
      background: rgba(255,255,255,.07);
      color: #edf1f9;
      font-weight: 800;
      margin-top: 14px;
    }
    .mini-card.blue {
      background: linear-gradient(135deg, rgba(88,164,255,.34), rgba(123,93,255,.28));
    }
    .mini-composer {
      margin-top: 18px;
      border-radius: 20px;
      padding: 18px;
      color: #8993a4;
      border: 1px solid rgba(255,255,255,.14);
    }
  `;
}

async function toDataUri(file, mimeType) {
  return `data:${mimeType};base64,${(await readFile(file)).toString("base64")}`;
}

function readEnvValue(env, key) {
  const exactValue = env[key];
  if (typeof exactValue === "string") {
    return exactValue;
  }

  const normalizedKey = key.toLowerCase();
  const actualKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === normalizedKey);
  const value = actualKey ? env[actualKey] : undefined;
  return typeof value === "string" ? value : undefined;
}

async function findExistingBrowserExecutable() {
  for (const candidate of browserExecutableCandidates()) {
    if (await isExecutableFile(candidate)) {
      return candidate;
    }
  }

  for (const root of playwrightBrowserRoots()) {
    const executable = await findCachedBrowserExecutable(root);
    if (executable) {
      return executable;
    }
  }

  return null;
}

function browserExecutableCandidates() {
  const currentPlatform = platform();
  if (currentPlatform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  if (currentPlatform === "win32") {
    const localAppData = readEnvValue(process.env, "LOCALAPPDATA") ?? join(homedir(), "AppData", "Local");
    return [
      join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      join(localAppData, "Google", "Chrome for Testing", "Application", "chrome.exe"),
      join(readEnvValue(process.env, "ProgramFiles") ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      join(readEnvValue(process.env, "ProgramFiles") ?? "C:\\Program Files", "Google", "Chrome for Testing", "Application", "chrome.exe"),
      join(readEnvValue(process.env, "ProgramFiles") ?? "C:\\Program Files", "Chromium", "Application", "chrome.exe"),
      join(readEnvValue(process.env, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      join(readEnvValue(process.env, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)", "Google", "Chrome for Testing", "Application", "chrome.exe"),
      join(readEnvValue(process.env, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)", "Chromium", "Application", "chrome.exe"),
    ];
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome-for-testing",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
}

function playwrightBrowserRoots() {
  const configured = readEnvValue(process.env, "PLAYWRIGHT_BROWSERS_PATH");
  const roots = [];
  if (configured && configured !== "0") {
    roots.push(resolve(configured));
  }

  const home = homedir();
  const currentPlatform = platform();
  if (currentPlatform === "darwin") {
    roots.push(resolve(home, "Library", "Caches", "ms-playwright"));
  } else if (currentPlatform === "win32") {
    roots.push(resolve(readEnvValue(process.env, "LOCALAPPDATA") || resolve(home, "AppData", "Local"), "ms-playwright"));
  } else {
    roots.push(resolve(readEnvValue(process.env, "XDG_CACHE_HOME") || resolve(home, ".cache"), "ms-playwright"));
  }

  return [...new Set(roots)];
}

async function findCachedBrowserExecutable(root) {
  const executableNames = platform() === "win32" ? new Set(["chrome.exe", "headless_shell.exe"]) : new Set(["chrome", "Chromium", "chrome-headless-shell"]);
  return findExecutableByName(root, executableNames, 5);
}

async function findExecutableByName(directory, executableNames, depth) {
  if (depth < 0) {
    return null;
  }

  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isFile() && executableNames.has(entry.name) && (await isExecutableFile(path))) {
      return path;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const executable = await findExecutableByName(resolve(directory, entry.name), executableNames, depth - 1);
    if (executable) {
      return executable;
    }
  }

  return null;
}

async function isExecutableFile(path) {
  try {
    await access(path, platform() === "win32" ? fsConstants.R_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
