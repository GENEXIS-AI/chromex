# Chromex Privacy Policy

Effective date: April 28, 2026

Chromex is a Chrome side-panel assistant that helps users work with webpages, selected tabs, uploaded files, voice input, images, and browser workflows through a local Codex bridge.

This policy explains what data Chromex may process, why it is processed, and how Chromex limits access to user-requested tasks.

## What Chromex Does

Chromex provides an AI assistant inside Chrome. Depending on the feature used, Chromex can summarize webpages, compare selected tabs, answer questions about page content, draft text, process uploaded files, work with images, use voice input, search browser history when requested, and help with browser workflows.

Chromex is designed around user-controlled context. Page content, tab data, screenshots, history, files, images, audio, and browser actions are used only when a user requests a feature that needs that information.

## Data Chromex May Process

Chromex may process the following categories of data when the user requests related features:

- Website content: page text, selected text, DOM-derived content, images, videos, links, screenshots, and other visible or readable content from the current page.
- Tab information: tab titles, URLs, favicons, and user-selected open tabs for comparison or multi-tab context.
- Uploaded files and images: files, screenshots, and images that the user attaches or selects for analysis, editing, or generation workflows.
- Voice audio and transcripts: microphone audio and transcription text when the user uses voice input or live voice features.
- Browser history: visited page titles, URLs, and visit times only when the user asks history-based questions and grants the required Chrome permission.
- User activity: browser action state needed to complete user-requested workflows, such as page interaction planning, clicks, scrolling, or DOM-assisted actions.
- Personal communications: email, chat, document, or collaboration content only when such content is present on a page and the user asks Chromex to process that page.
- Personally identifiable information: names, email addresses, account names, or similar information may be processed if it appears in user-selected page content, uploaded files, communications, or browser history.

Chromex does not intentionally collect health information, financial or payment information, precise location data, or authentication secrets as part of its single purpose.

## Authentication And Local Bridge

Chromex uses a local native bridge to communicate with the user's configured Codex/OpenAI runtime.

The Chrome extension does not store raw OpenAI API keys, OAuth tokens, or ChatGPT session tokens in Chrome extension storage. Authentication handoff, API-key fallback, generated-image files, diagnostics, and runtime-heavy operations are handled by the local bridge installed on the user's computer.

## How Data Is Used

Chromex uses data only to provide the feature requested by the user, such as answering a question, summarizing a page, comparing tabs, transcribing voice input, editing an image, generating an infographic, or performing a browser workflow.

Data may be sent through the local bridge to the user's configured Codex/OpenAI service when needed to complete the requested task. Model responses are treated as data and are not executed as extension code.

## Data Sharing

Chromex does not sell user data.

Chromex does not use user data for advertising.

Chromex does not use user data to determine creditworthiness or for lending purposes.

Chromex does not transfer user data for purposes unrelated to the extension's single purpose. Data is processed only as needed to provide user-requested assistant features or as required to operate the local bridge and configured AI service.

## Storage

Chromex may store local extension preferences such as theme, language, selected model, profile templates, enabled skills, onboarding state, and lightweight conversation metadata.

Large generated image assets, temporary files, and diagnostics are stored by the local bridge rather than Chrome extension storage. Users can remove generated assets from the local output folder.

## Permissions

Chromex requests baseline permissions needed for the side-panel assistant and requests optional permissions only when a feature needs them.

- `sidePanel` displays the assistant UI in Chrome's side panel.
- `activeTab` allows user-triggered access to the current tab.
- `scripting` injects content scripts for user-requested page context and browser helpers.
- `storage` stores local preferences and lightweight state.
- `contextMenus` adds user-triggered right-click actions.
- `nativeMessaging` connects to the local Chromex bridge.
- Optional `history` is used only for user-requested history search.
- Optional `tabs` is used for user-selected open-tab workflows.
- Optional host permissions are requested for site-specific page reading, capture, or browser actions.

## Remote Code

Chromex does not execute remotely hosted JavaScript or remotely supplied extension code. Extension code is packaged with the MV3 extension.

## User Control

Users control when Chromex receives page context, selected tabs, uploaded files, images, voice input, browser history, and browser action permissions. Users can disable optional features, revoke Chrome permissions, clear local settings, and remove generated image files.

## Contact

For privacy or support questions, contact:

<support@genexis.ai>

If this address is not yet active, use the GitHub repository issue tracker:

<https://github.com/GENEXIS-AI/chromex/issues>
