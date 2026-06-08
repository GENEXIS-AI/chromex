# Chromex

[![CI](https://github.com/GENEXIS-AI/chromex/actions/workflows/ci.yml/badge.svg)](https://github.com/GENEXIS-AI/chromex/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/GENEXIS-AI/chromex?style=social)](https://github.com/GENEXIS-AI/chromex/stargazers)
[![English](https://img.shields.io/badge/readme-English-111827.svg)](./README.md)
[![한국어](https://img.shields.io/badge/readme-한국어-2563eb.svg)](./readmes/README.ko.md)
[![日本語](https://img.shields.io/badge/readme-日本語-dc2626.svg)](./readmes/README.ja.md)
[![简体中文](https://img.shields.io/badge/readme-简体中文-16a34a.svg)](./readmes/README.zh-CN.md)

Chromex is a Chrome MV3 side-panel assistant that connects Chrome to Codex through a local native bridge. It helps users work with the current page, selected tabs, uploaded files, voice input, images, and browser workflows while keeping credentials out of extension storage.

Published by **GenexisAI CHOI**.

![Chromex browser side-panel assistant](./assets/chromex-hero.png)

## What It Does

- Chat with the current webpage, selected open tabs, screenshots, uploaded files, PDFs, Office files, images, and browser history when requested.
- Summarize and compare page content, YouTube videos, news articles, research pages, PDFs, and arXiv papers.
- Edit or generate images through Codex image workflows with local output handling.
- Use voice transcription, plan mode, page-aware suggestions, custom profiles, and optional Codex skills.
- Run the unified Translation/Live mode for live transcripts, optional realtime translation, and follow-up chat over the captured transcript.
- Run browser-control workflows through Chrome content scripts with visible in-page activity indicators.

## Chrome Web Store Install

Chrome Web Store users do **not** need to build Chromex from source.

For a step-by-step guide with copy buttons in English, Korean, Japanese, and Simplified Chinese, use the public setup page: <https://genexis-ai.github.io/chromex/install/>

1. Install the official Codex CLI and confirm it works. See the official Codex CLI install options at <https://github.com/openai/codex>.

```bash
npm install -g @openai/codex
codex --version
```

   Chromex requires `@openai/codex` **0.130.0 or newer**. Older releases (for example 0.124.x and 0.125.x) refuse some bootstrap feature flags and surface as `codex app-server exited with code 1` immediately after a successful `codex login`.

2. Download `chromex-local-bridge.zip` from the latest [GitHub Release](https://github.com/GENEXIS-AI/chromex/releases/latest), unzip it, and run:

```bash
node scripts/install-native-host.mjs --browser=chrome
```

3. Fully quit every Chrome window, reopen Chrome, then press **Check connection** in Chromex.

The Store extension can run only after this one-time local bridge registration. The bridge lets Chrome start the local Codex app-server safely through Chrome Native Messaging; the extension itself cannot install that local host automatically.

## Install From Source

Use the source checkout or [`chromex-public-source.zip`](https://github.com/GENEXIS-AI/chromex/releases/latest/download/chromex-public-source.zip):

```bash
git clone https://github.com/GENEXIS-AI/chromex.git
cd chromex
npm install
npm run build
node scripts/install-native-host.mjs
```

Then close every Chrome window, reopen Chrome, open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose:

```text
packages/extension/dist
```

Important: run `npm install`, `npm run build`, and `install-native-host.mjs` from the `chromex` source folder that contains `package.json`. If Windows reports `ENOENT Could not read package.json`, you are in the wrong folder.

### Windows Local Bridge Setup

On Windows, install Node.js 20 LTS or newer, then install and verify the Codex CLI first:

```powershell
npm install -g @openai/codex
codex --version
```

Use the npm install path above even if `winget install Codex -s msstore` fails. `0x8a15005e: The server certificate did not match any of the expected values` is a Windows Store / TLS certificate-chain problem outside Chromex, not a Chromex install step.

Then use **PowerShell** from the `chromex` source folder:

```powershell
npm install
npm run build
node scripts/install-native-host.mjs --browser=chrome
```

Then open `chrome://extensions`, click **Reload** on Chromex, and press **Check connection** in the Chromex side panel.

If the side panel still says the local bridge is waiting:

1. Confirm Chromex is loaded from `packages/extension/dist`.
2. Copy the extension ID shown on the Chromex card in `chrome://extensions`.
3. Re-run the installer with that ID:

```powershell
node scripts/install-native-host.mjs <extension-id> --browser=chrome
```

The expected public release ID is `menmlhahmendmkiicbjihgjhppkgaeom`. If Chrome shows a different ID, use the ID shown in Chrome.

If login fails with `Failed to start codex app-server`, Chromex can reach the local bridge but cannot start the Codex CLI. Re-run `codex --version`. If Windows cannot find it, set the optional Codex binary path to `%APPDATA%\npm\codex.cmd`, or set the folder to `%APPDATA%\npm`. Do not put your workspace folder in the Codex binary field; the workspace folder and Codex executable path are separate settings.

To force executable detection on Windows:

```powershell
npm install -g @openai/codex
where codex
codex --version
```

If `where codex` prints `C:\Users\<you>\AppData\Roaming\npm\codex.cmd`, open Chromex settings and set the optional Codex binary path to `%APPDATA%\npm\codex.cmd`, save, close every Chrome window, reopen Chrome, and press **Check connection**.

## Runtime Boundary

Chromex uses this boundary:

```text
Chrome Extension -> Native Messaging Host -> Local Bridge -> codex app-server
```

The source tree is organized as:

- `packages/extension`: Chrome MV3 side-panel extension
- `packages/bridge`: local bridge daemon for Codex app-server and multimodal workflows
- `packages/native-host`: Chrome Native Messaging relay
- `packages/shared`: shared types, policies, profiles, and helpers

## Language Support

Chromex follows the browser language automatically by default. Users can also choose a language in **Settings > General > App UI language**.

The extension ships Chrome `_locales` entries for English, Korean, Japanese, Chinese, Arabic, French, German, Spanish, Portuguese, Hindi, Vietnamese, Thai, Turkish, Ukrainian, and many other Chrome-compatible locales. Model responses are instructed to follow the selected UI language unless the user asks for another language.

## Security And Privacy Defaults

- The extension does not store raw OpenAI API keys, OAuth tokens, or ChatGPT session tokens in Chrome extension storage.
- Codex OAuth / ChatGPT login is handled through the local Codex app-server flow.
- API-key login is an optional local fallback and is never used automatically without user confirmation.
- Realtime translation uses a separately confirmed OpenAI API key path and can be disconnected from settings.
- Page content, tab data, screenshots, browser history, microphone input, and browser actions are used only for user-requested workflows.
- `history`, `tabs`, screen capture, microphone, and site access are requested only when a feature needs them.
- Conversation history is session-only by default. Persistent local chat history is opt-in.
- Native-host child processes and workspace hooks run with a reduced environment allowlist.
- Generated image originals, temporary uploads, and diagnostics are handled by the local bridge.

Read [SECURITY.md](./SECURITY.md) and [PRIVACY.md](./PRIVACY.md) before publishing or deploying a modified build.

## Features

- Persistent MV3 side panel with chat-first UX.
- Automatic routing for page, file, image, history, voice, and browser-control requests.
- `@` picker for selecting one or more open tabs.
- `/` picker for profile selection.
- Plan mode for turning ambiguous requests into an explicit plan before execution.
- Attachments for images, text, PDF, DOCX, CSV, TSV, XLSX, and XLSM.
- Read strategy policy for DOM, vision, hybrid, and site-adapter workflows.
- Selected-text context injection with fact-check suggestions and right-click ask flow.
- Editable site suggestions where the visible command and the sent prompt can be different.
- Translation/Live mode with live transcript history, optional realtime translation playback, and transcript-grounded follow-up chat.
- Site-aware suggestions for YouTube, news, research, mail, collaboration, notes, task tools, shopping, travel, and Korean work services.
- YouTube adapter with current timestamp context and seek actions.
- Non-destructive image editing for uploaded images, page images, or visible screen captures.
- Markdown rendering with code blocks, tables, links, and copy controls.
- Optional Codex skills loaded from a user's local `.codex/skills/*/SKILL.md` only when enabled.

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run release:audit
```

Optional browser smoke test:

```bash
npm run smoke
```

If no compatible browser exists, install the Playwright Chromium runtime:

```bash
npm run smoke:install-browser
```

The built extension is emitted to:

```text
packages/extension/dist
```

## Release Management

Chromex uses normal open-source release history from `0.1.1` onward. Versioning, pull request flow, and release checklist are documented in [RELEASE.md](./RELEASE.md).

## Troubleshooting

- **Native host missing or forbidden**: run `npm run build`, then `node scripts/install-native-host.mjs --browser=chrome`, reload the extension in `chrome://extensions`, and check Chromex onboarding/system status. If Chrome shows a different extension ID, run `node scripts/install-native-host.mjs <extension-id> --browser=chrome`.
- **Codex executable is not detected**: run `npm install -g @openai/codex`, `where codex`, and `codex --version`. If needed, set the optional Codex binary path in Chromex to `%APPDATA%\npm\codex.cmd`, save, fully restart Chrome, and press **Check connection**.
- **Model list does not load**: confirm the native bridge is connected, then sign in through the app-server-backed login flow.
- **Page context is unavailable**: open Chromex from the target tab or approve the Chrome site permission prompt when the workflow requests access.
- **Chrome still shows old UI**: run `npm run build`, reload the extension card, and confirm Chrome is loading `packages/extension/dist`.
- **Browser smoke test fails because no browser exists**: run `npm run smoke:install-browser`, then `npm run smoke`.

## License

MIT. See [LICENSE](./LICENSE).

## Star History

<a href="https://www.star-history.com/#GENEXIS-AI/chromex&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date" />
  </picture>
</a>
