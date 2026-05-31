import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("open-source repository hygiene", () => {
  test("ships a root license for public distribution", () => {
    const licensePath = resolve(repoRoot, "LICENSE");
    const packageJson = JSON.parse(readRepoFile("package.json")) as { license?: string };
    const workspacePackages = ["packages/shared", "packages/bridge", "packages/native-host", "packages/extension"];

    expect(existsSync(licensePath)).toBe(true);
    expect(readRepoFile("LICENSE")).toContain("MIT License");
    expect(packageJson.license).toBe("MIT");
    for (const workspacePath of workspacePackages) {
      const workspacePackageJson = JSON.parse(readRepoFile(`${workspacePath}/package.json`)) as { license?: string };
      expect(workspacePackageJson.license).toBe("MIT");
    }
  });

  test("keeps generated local artifacts out of source control", () => {
    const gitignore = readRepoFile(".gitignore");

    expect(gitignore).toContain(".codex-sidepanel/");
    expect(gitignore).toContain("packages/*/dist/");
    expect(gitignore).toContain("tmp-smoke-debug.png");
    expect(gitignore).toContain("codex-sidepanel-backups/");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain("coverage/");
  });

  test("keeps public readmes user-facing without exposing store packaging commands", () => {
    const publicReleaseScript = readRepoFile("scripts/package-public-release.mjs");
    const readme = readRepoFile("README.md");
    const koreanReadme = readRepoFile("readmes/README.ko.md");
    const japaneseReadme = readRepoFile("readmes/README.ja.md");
    const chineseReadme = readRepoFile("readmes/README.zh-CN.md");
    const publicReadmes = [readme, koreanReadme, japaneseReadme, chineseReadme];

    expect(publicReleaseScript).toContain("/^docs\\//u");
    expect(readme).toContain("./readmes/README.ko.md");
    expect(readme).toContain("./readmes/README.ja.md");
    expect(readme).toContain("./readmes/README.zh-CN.md");
    for (const publicReadme of publicReadmes) {
      expect(publicReadme).toContain("assets/chromex-hero.png");
      expect(publicReadme).toContain("releases/latest/download/chromex-public-source.zip");
      expect(publicReadme).toContain("chromex-local-bridge.zip");
      expect(publicReadme).toContain("ENOENT Could not read package.json");
      expect(publicReadme).toContain("README.ja.md");
      expect(publicReadme).toContain("README.zh-CN.md");
      expect(publicReadme.trim().endsWith("</a>")).toBe(true);
      expect(publicReadme).toContain("install-native-host.mjs <extension-id> --browser=chrome");
      expect(publicReadme).toContain("menmlhahmendmkiicbjihgjhppkgaeom");
      expect(publicReadme).toContain("npm install -g @openai/codex");
      expect(publicReadme).toContain("codex --version");
      expect(publicReadme).toContain("%APPDATA%\\npm\\codex.cmd");
      expect(publicReadme).not.toContain("chromex-unpacked-extension.zip");
      expect(publicReadme).not.toContain("Chrome Web Store Package");
      expect(publicReadme).not.toContain("npm run package:webstore");
      expect(publicReadme).not.toContain("npm run package:public");
      expect(publicReadme).not.toContain("output/chrome-web-store");
    }
    expect(publicReleaseScript).not.toContain("chromex-unpacked-extension");
    expect(publicReleaseScript).not.toContain("requireManifestKey: true");
    expect(publicReleaseScript).not.toContain("delete manifest.key");
    expect(existsSync(resolve(repoRoot, "assets/chromex-hero.png"))).toBe(true);
    expect(readme).not.toContain(["What", "Is", "Not", "Published"].join(" "));
    expect(koreanReadme).not.toContain(["공개하지", "않는", "항목"].join(" "));
    expect(japaneseReadme).not.toContain(["公開", "しない", "項目"].join(""));
    expect(chineseReadme).not.toContain(["不", "发布", "的", "项目"].join(""));
    expect(readme).not.toContain(["intentionally", "excludes"].join(" "));
    expect(koreanReadme).not.toContain(["의도적으로", "제외"].join(" "));
    for (const publicReadme of publicReadmes) {
      expect(publicReadme).not.toContain("docs/");
      expect(publicReadme).not.toContain(["CONTRIBUTING", "md"].join("."));
    }
  });

  test("publishes only the public privacy policy through GitHub Pages", () => {
    const pagesWorkflow = readRepoFile(".github/workflows/pages.yml");
    const publicIndex = readRepoFile("docs/pages/index.html");
    const installPage = readRepoFile("docs/pages/install/index.html");
    const privacyPage = readRepoFile("docs/pages/privacy/index.html");

    expect(pagesWorkflow).toContain("actions/deploy-pages");
    expect(pagesWorkflow).toContain("path: docs/pages");
    expect(publicIndex).toContain("./install/");
    expect(publicIndex).toContain("./privacy/");
    expect(publicIndex).toContain("English, 한국어, 日本語, 简体中文");
    expect(installPage).toContain("Chromex 설치 가이드");
    expect(installPage).toContain("Chromex Store Install Guide");
    expect(installPage).toContain("日本語");
    expect(installPage).toContain("简体中文");
    expect(installPage).toContain("nodejs.org/en/download");
    expect(installPage).toContain("github.com/openai/codex");
    expect(installPage).toContain("chromex-local-bridge.zip");
    expect(installPage).toContain("node scripts/install-native-host.mjs --browser=chrome");
    expect(installPage).toContain("%APPDATA%\\npm\\codex.cmd");
    expect(installPage).not.toContain("npm run build");
    expect(installPage).not.toContain("npm install\n");
    expect(privacyPage).toContain("Chromex Privacy Policy");
    expect(privacyPage).toContain("Chromex 개인정보 처리방침");
    expect(privacyPage).toContain("Chromex プライバシーポリシー");
    expect(privacyPage).toContain("Chromex 隐私政策");
    expect(privacyPage).toContain("Chromex does not sell user data.");
    expect(privacyPage).not.toContain("npm run package:webstore");
  });

  test("keeps private maintainer rules out of public-facing documents", () => {
    const readme = readRepoFile("README.md");
    const koreanReadme = readRepoFile("readmes/README.ko.md");
    const japaneseReadme = readRepoFile("readmes/README.ja.md");
    const chineseReadme = readRepoFile("readmes/README.zh-CN.md");
    const publicReleaseScript = readRepoFile("scripts/package-public-release.mjs");

    expect(publicReleaseScript).toContain("(?:CODEX|CLAUDE|AGENTS|GEMINI|MEMORY)");

    expect(readme).not.toMatch(/legacy personal account/iu);
    expect(koreanReadme).not.toMatch(/과거 개인 계정/iu);
    expect(japaneseReadme).not.toMatch(/過去の個人アカウント/iu);
    expect(chineseReadme).not.toMatch(/历史个人账号/iu);
    expect(readme).not.toMatch(/clean public history/iu);
    expect(koreanReadme).not.toMatch(/공개 커밋 이력/iu);
    expect(japaneseReadme).not.toMatch(/公開コミット履歴/iu);
    expect(chineseReadme).not.toMatch(/公开提交历史/iu);
    expect(readme).not.toMatch(/non-user release rules/iu);
    expect(koreanReadme).not.toContain(["내부", "배포", "규칙"].join(" "));
    expect(japaneseReadme).not.toContain(["内部", "リリース", "ルール"].join(""));
    expect(chineseReadme).not.toContain(["内部", "发布", "规则"].join(""));
  });

  test("provides clean public packaging and git-history audit scripts", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["package:public"]).toContain("scripts/package-public-release.mjs");
    expect(packageJson.scripts?.["package:public"]).toContain("scripts/package-local-bridge.mjs");
    expect(packageJson.scripts?.["package:local-bridge"]).toContain("scripts/package-local-bridge.mjs");
    expect(packageJson.scripts?.["release:audit:history"]).toBe("node scripts/audit-git-history.mjs");
    expect(existsSync(resolve(repoRoot, "RELEASE.md"))).toBe(true);
    expect(readRepoFile("RELEASE.md")).toContain("0.1.1");
    expect(readRepoFile("RELEASE.md")).toContain("semantic versioning");
    expect(readRepoFile("RELEASE.md")).toContain("chromex-public-source.zip");
    expect(readRepoFile("RELEASE.md")).not.toContain("chromex-unpacked-extension.zip");
    expect(existsSync(resolve(repoRoot, "scripts/package-public-release.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "scripts/package-local-bridge.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "scripts/audit-git-history.mjs"))).toBe(true);
    expect(readRepoFile("scripts/package-local-bridge.mjs")).toContain("bridge/cli.bundle.cjs");
    expect(readRepoFile("scripts/package-local-bridge.mjs")).toContain('format: "cjs"');
    expect(readRepoFile("scripts/package-local-bridge.mjs")).toContain('"import.meta.url": "__chromexImportMetaUrl"');
  });

  test("does not allow legacy extension ids in the native-host installer by default", () => {
    const installer = readRepoFile("scripts/install-native-host.mjs");

    expect(installer).toContain("--include-legacy-extension-ids");
    expect(installer).toContain("includeLegacyExtensionIds ? LEGACY_EXTENSION_IDS : []");
    expect(installer).toContain("%APPDATA%\\\\npm");
    expect(installer).toContain("%USERPROFILE%\\\\scoop\\\\shims");
    expect(installer).toContain('resolve(homeDir, "Downloads", "chromex-extension")');
    expect(installer).toContain("assertSelectedBrowsersSupportedOnPlatform");
    expect(installer).toContain('profileDir && platformFamily !== "win32"');
    expect(installer).toContain("--profile-dir is ignored on Windows");
    expect(installer).not.toContain("[extensionId, ...LEGACY_EXTENSION_IDS, ...discoveredExtensionIds]");
  });
});
