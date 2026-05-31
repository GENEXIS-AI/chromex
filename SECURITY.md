# Security Policy

## Supported Scope

This repository ships a Chrome extension, a native messaging host, and a local bridge that talks to `codex app-server`. The security boundary is intentionally split so browser-delivered code does not own long-lived secrets.

## Reporting a Vulnerability

If you publish this repository on GitHub, enable GitHub Security Advisories and ask reporters to use a private vulnerability report instead of a public issue.

Until a private channel exists, do not encourage public disclosure of active vulnerabilities.

## Secure Defaults In This Repository

- No private signing `.pem` or developer-only secret is committed.
- No extension signing `.pem` should live in source control.
- `tabs`, `history`, and origin access are optional runtime permissions.
- The extension does not store raw API keys or ChatGPT tokens in `chrome.storage`.
- The installer does not import `OPENAI_API_KEY` into a file.
- Conversation history is session-only by default. Persistent device storage is opt-in.
- Native-host child processes forward a reduced environment allowlist instead of the full parent shell.
- Workspace hook commands also receive a reduced environment allowlist so user-defined hooks do not automatically inherit unrelated secrets.
- Native messaging manifests restrict access to the exact installed extension origin.
- Legacy unpacked extension IDs are not allowed in native-host manifests unless the user explicitly passes the migration flag during install.
- A stable public manifest key is committed intentionally so unpacked installs keep a stable origin for native messaging. This is public metadata, not a private signing secret.

## Release Checklist

Before publishing:

1. Run `npm run typecheck`
2. Run `npm run test`
3. Run `npm run build`
4. Run `npm run smoke`
5. Run `npm audit --audit-level=high --omit=dev`
6. Confirm `.gitignore` excludes build artifacts, `node_modules`, `.pem`, `.crx`, and local-only files
7. Confirm `packages/extension/public/manifest.json` includes only the public extension key and no private signing material
8. Confirm no generated native-host manifest or local secret file is tracked
9. Confirm `.codex/` workspace configuration is not tracked in the public repository
10. Confirm the GitHub Actions matrix in `.github/workflows/ci.yml` is green on `ubuntu`, `macos`, and `windows`

## Data Handling Notes

- ChatGPT auth is delegated to `codex app-server`, which persists managed auth on the local machine.
- API key login is optional and should be treated as a local fallback only.
- The extension stores UI preferences locally and may cache advanced connection overrides if the runtime is configured programmatically, but public UI setup uses automatic detection.
- Chat history is session-only unless the user explicitly enables device persistence in Workspace settings.

## Browser Permissions Guidance

This project follows Chrome's minimum-permission guidance:

- required permissions are limited to the core side-panel/runtime bridge
- optional permissions are requested at runtime with feature-specific explanations
- `activeTab` is used for user-initiated page access instead of blanket required host access
