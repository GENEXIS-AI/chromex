# Release Management

Chromex uses normal open-source release history from `0.1.1` onward. Do not rewrite public history for routine releases after the initial public import.

## Versioning

Chromex follows semantic versioning:

- Patch releases, such as `0.1.1`, are for bug fixes, security fixes, documentation updates, packaging fixes, and small compatibility improvements.
- Minor releases, such as `0.2.0`, are for user-visible features that remain backward compatible.
- Major releases, such as `1.0.0`, are for breaking changes in installation, native-host behavior, extension permissions, or public APIs.

All workspace package versions should stay aligned with the root `package.json` version.

## Release Checklist

Before tagging a release:

1. Update the root and workspace package versions.
2. Run `npm install --package-lock-only --ignore-scripts` so `package-lock.json` matches the version bump.
3. Run `npm run typecheck`.
4. Run `npm run test`.
5. Run `npm run build`.
6. Run `npm run release:audit`.
7. Run `npm run package:webstore` for Chrome Web Store upload artifacts.
8. Run `npm run package:public` for GitHub source release artifacts.
9. Verify the release assets under `output/public-release/`.
10. Upload both the versioned source archive and stable direct-download source archive to the GitHub Release.

## GitHub Flow

Use this flow for normal development:

1. Create a branch from `main`.
2. Commit focused changes with clear messages.
3. Open a pull request.
4. Wait for CI to pass on Linux, macOS, and Windows.
5. Squash or merge according to project preference.
6. Tag releases from `main` after verification.

Use this flow for a release:

```bash
git tag v0.1.1
git push origin main
git push origin v0.1.1
```

Then upload the generated release archives from `output/public-release/` to the matching GitHub Release.

For each release, attach these files:

- `chromex-<version>-public-source-<timestamp>.zip`
- `chromex-public-source.zip`

The stable asset names power README links such as:

```text
https://github.com/GENEXIS-AI/chromex/releases/latest/download/chromex-public-source.zip
```

## Compatibility Policy

Release changes must preserve these expectations unless the release notes explicitly say otherwise:

- Chrome MV3 extension loading remains supported through `packages/extension/dist`.
- Chrome Web Store packages must not contain `manifest.key`, source maps, local build metadata, signing keys, or local machine paths.
- Native-host installation must work on Chrome-supported desktop operating systems.
- Chrome Web Store users should install Codex CLI plus the prebuilt `chromex-local-bridge.zip`; source build commands are for source installs only.
- OAuth is preferred over API-key fallback, and API-key fallback must require explicit user confirmation.
- Browser permissions should remain feature-gated and requested only when needed.
