import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const webExtensionDir = resolve(repoRoot, "output/safari/ChromexSafariExtension");
const projectLocation = resolve(repoRoot, "output/safari/xcode");
const appName = process.env.SAFARI_APP_NAME || "ChromexSafari";
const bundleIdentifier = process.env.SAFARI_BUNDLE_ID || "ai.openclaw.chromex.safari";

const converter = spawnSync("xcrun", ["--find", "safari-web-extension-converter"], { encoding: "utf8" });
if (converter.status !== 0) {
  console.error(
    [
      "safari-web-extension-converter is not available.",
      "Install full Xcode, open it once, then run:",
      "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
      "After that, rerun:",
      "  npm run create:safari:xcode",
    ].join("\n"),
  );
  process.exit(1);
}

run("npm", ["run", "build:safari:webextension"]);
await mkdir(projectLocation, { recursive: true });

run("xcrun", [
  "safari-web-extension-converter",
  webExtensionDir,
  "--project-location",
  projectLocation,
  "--app-name",
  appName,
  "--bundle-identifier",
  bundleIdentifier,
  "--swift",
  "--macOS-only",
  "--copy-resources",
  "--no-open",
  "--force",
]);

console.log(`Safari Xcode project created under: ${projectLocation}`);
console.log(`App name: ${appName}`);
console.log(`Bundle ID: ${bundleIdentifier}`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
