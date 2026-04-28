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

Once full Xcode is installed, generate and compile the Safari/macOS wrapper with:

```bash
npm run create:safari:xcode
npm run build:safari:xcode
```

Optional overrides:

```bash
SAFARI_APP_NAME=ChromexSafari SAFARI_BUNDLE_ID=ai.openclaw.chromex.ChromexSafari npm run create:safari:xcode
```

The staging build writes:

```text
output/safari/ChromexSafariExtension/
```

The staged WebExtension is generated from the Chrome extension dist with Safari-oriented manifest changes:

- removes Chrome-only `side_panel`
- removes Chrome-only `sidePanel` permission
- removes Safari-unsupported optional `history` permission and background `type`
- exposes the existing `sidepanel.html` UI as `action.default_popup`
- uses required `<all_urls>` host permission so the current page-reading/injection path can work after user approval
- keeps the rest of the extension code as close to Chrome as possible for early testing

The generated macOS app builds to:

```text
output/safari/DerivedData/Build/Products/Debug/ChromexSafari.app
```

## Known remaining blockers

### 1. Safari signing / registration is still a user-side step

The project compiles with local/ad-hoc signing for CLI validation. Safari may still require opening the generated Xcode project and selecting a development team for both the containing app and extension targets before the extension appears cleanly in Safari settings.

Open:

```text
output/safari/xcode/ChromexSafari/ChromexSafari.xcodeproj
```

Then enable the extension in Safari settings after launching the app.

### 2. Native messaging is bridged, but needs browser-level validation

Chrome uses:

```text
Chrome Extension -> Chrome Native Messaging Host -> Chromex bridge -> codex app-server
```

Safari now uses the generated Swift handler as the transport shim:

```text
Safari WebExtension -> browser.runtime.sendNativeMessage(...) -> SafariWebExtensionHandler.swift -> packages/bridge/dist/cli.js -> codex app-server
```

Because Safari native messaging is request/response rather than Chrome's long-lived native port, the extension client falls back to `sendNativeMessage` and polls a small event queue for async bridge events. This compiles, but the full prompt/streaming flow still needs validation inside Safari.

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
Safari WebExtension background -> browser.runtime.sendNativeMessage(...) -> SafariWebExtensionHandler.swift -> Node bridge process
```

The important Safari difference is that the extension can only native-message its own containing app/extension. There is no Chrome-style `NativeMessagingHosts/*.json` registration. The containing app should own process launch, lifetime, logging, and any App Sandbox/App Group/XPC configuration.

For the MVP, the generated handler launches a single Node bridge process and keeps it alive. Async events such as turn progress, plans, diffs, and rate-limit updates are queued in Swift and fetched by the WebExtension fallback poller.

## Proposed next steps

1. Run `npm run check:safari:tooling` and confirm the converter is available.
2. Run `npm run create:safari:xcode`.
3. Run `npm run build:safari:xcode`.
4. Open the generated project under `output/safari/xcode` and set signing for both app and extension targets if Safari does not list the ad-hoc build.
5. Test minimal flow first: popup opens, reads current page, sends prompt to local Codex, streams response.

## Current local patches related to Safari/Chromex

- `packages/extension/src/background/index.ts`: guards `chrome.sidePanel` and uses a helper to no-op where unavailable.
- `scripts/build-safari-web-extension.mjs`: creates the Safari-staged WebExtension artifact.
- `scripts/check-safari-tooling.mjs`: checks whether Xcode/Safari conversion tooling is installed.
- `scripts/create-safari-xcode-project.mjs`: runs the converter once full Xcode is installed.
- `scripts/build-safari-xcode-app.mjs`: compiles the generated Safari app with Xcode.
- `packages/extension/src/background/native-bridge-client.ts`: uses Chrome's native runtime when present, falls back to `browser.runtime.connectNative`, and finally supports Safari's connectionless `sendNativeMessage` path with event polling.
- `package.json`: exposes the Safari staging/tooling scripts.
