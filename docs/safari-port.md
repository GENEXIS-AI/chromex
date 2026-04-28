# Safari Port Notes

Status: first-pass local prototype scaffolding.

## Goal

Port Chromex from a Chrome MV3 side-panel extension to a Safari Web Extension distributed inside a macOS containing app.

## Current staged artifact

Run from the repo root:

```bash
npm run check:safari:tooling
npm run build:safari:webextension
```

This writes:

```text
output/safari/ChromexSafariExtension/
```

The staged WebExtension is generated from the Chrome extension dist with Safari-oriented manifest changes:

- removes Chrome-only `side_panel`
- removes Chrome-only `sidePanel` permission
- exposes the existing `sidepanel.html` UI as `action.default_popup`
- uses required `<all_urls>` host permission so the current page-reading/injection path can work after user approval
- keeps the rest of the extension code as close to Chrome as possible for early testing

## Known hard blockers

### 1. Full Xcode is required

This machine currently has only Command Line Tools:

```text
/Library/Developer/CommandLineTools
```

`xcrun safari-web-extension-converter` is missing. Installing full Xcode should provide the converter and the Safari Web Extension project templates.

### 2. Native messaging is not portable as-is

Chrome uses:

```text
Chrome Extension -> Chrome Native Messaging Host -> Chromex bridge -> codex app-server
```

Safari needs a containing macOS app / Safari Web Extension wrapper. The Chrome native-host manifests under Chrome's profile directories do not apply. The bridge can likely be reused, but the Safari app must own the native communication path and launch/relay to the existing Node bridge.

### 3. No direct Safari Side Panel equivalent

Chrome's `chrome.sidePanel` UX is not available in Safari. Prototype uses a toolbar popup. A better Safari v1 should probably use one of:

- toolbar popup for quick chat
- a containing macOS app window for the full Chromex UI
- a Safari popover that opens a larger app window for long sessions

### 4. Chrome-specific API guards are required

Background code now guards `chrome.sidePanel` calls so Safari does not crash when the API is absent. More Safari API compatibility checks are still needed around:

- `chrome.scripting`
- `chrome.storage.session`
- `chrome.offscreen`
- `chrome.tabCapture` / visible-tab capture behavior
- native messaging availability
- context menus

## Native bridge strategy

Chrome's bridge is already split in a useful way:

```text
extension background -> chrome.runtime.connectNative("com.codex.sidepanel.bridge") -> packages/native-host -> packages/bridge
```

For Safari, keep `packages/bridge` as the shared core and replace only the transport:

```text
Safari WebExtension background -> browser.runtime.connectNative(...) -> SafariWebExtensionHandler.swift -> containing macOS app / XPC -> Node bridge process
```

The important Safari difference is that the extension can only native-message its own containing app/extension. There is no Chrome-style `NativeMessagingHosts/*.json` registration. The containing app should own process launch, lifetime, logging, and any App Sandbox/App Group/XPC configuration.

For an MVP, target a single long-lived native port because Chromex expects both request/response messages and asynchronous bridge events such as turn progress, plans, diffs, and rate-limit updates.

## Proposed next steps

1. Install/open full Xcode on the Mac.
2. Run `npm run check:safari:tooling` and confirm the converter is available.
3. Run `npm run build:safari:webextension`.
4. Convert the staged extension with Apple's Safari Web Extension converter.
5. Create the containing macOS app bundle ID and signing settings.
6. Replace Chrome native-host install assumptions with Safari app-owned bridge launching.
7. Test minimal flow first: popup opens, reads current page, sends prompt to local Codex, streams response.

## Current local patches related to Safari/Chromex

- `packages/extension/src/background/index.ts`: guards `chrome.sidePanel` and uses a helper to no-op where unavailable.
- `scripts/build-safari-web-extension.mjs`: creates the Safari-staged WebExtension artifact.
- `scripts/check-safari-tooling.mjs`: checks whether Xcode/Safari conversion tooling is installed.
- `package.json`: exposes the Safari staging/tooling scripts.
