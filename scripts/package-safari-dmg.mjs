import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const version = process.env.SAFARI_PACKAGE_VERSION || readPackageVersion();
const identity = process.env.DEVELOPER_ID_APPLICATION || process.env.CODESIGN_IDENTITY || "Developer ID Application";
const notaryProfile = process.env.NOTARY_PROFILE || "chromex-safari";
const skipNotarize = process.env.SKIP_NOTARIZE === "1" || process.argv.includes("--skip-notarize");
const projectDir = resolve(repoRoot, "output/safari/xcode/ChromexSafari");
const projectPath = resolve(projectDir, "ChromexSafari.xcodeproj");
const derivedDataPath = resolve(repoRoot, "output/safari/DerivedData-Release");
const appPath = resolve(derivedDataPath, "Build/Products/Release/ChromexSafari.app");
const releaseDir = resolve(repoRoot, "output/release");
const dmgRoot = resolve(releaseDir, "dmg-root-signed");
const dmgPath = resolve(releaseDir, `ChromexSafari-${version}-safari.dmg`);

if (!existsSync(projectPath)) {
  console.error("Safari Xcode project is missing. Run `npm run create:safari:xcode` first.");
  process.exit(1);
}

assertDeveloperIdIdentity(identity);

run("xcodebuild", [
  "-project",
  projectPath,
  "-scheme",
  "ChromexSafari",
  "-configuration",
  "Release",
  "-derivedDataPath",
  derivedDataPath,
  "clean",
  "build",
  "CODE_SIGN_STYLE=Manual",
  `CODE_SIGN_IDENTITY=${identity}`,
  "ENABLE_HARDENED_RUNTIME=YES",
]);

run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
run("spctl", ["--assess", "--type", "execute", "--verbose=2", appPath], { allowFailure: true });

rmSync(dmgRoot, { recursive: true, force: true });
rmSync(dmgPath, { force: true });
mkdirSync(dmgRoot, { recursive: true });
run("ditto", [appPath, resolve(dmgRoot, basename(appPath))]);
symlinkSync("/Applications", resolve(dmgRoot, "Applications"));
run("hdiutil", ["create", "-volname", "Chromex Safari", "-srcfolder", dmgRoot, "-ov", "-format", "UDZO", dmgPath]);
run("codesign", ["--force", "--timestamp", "--sign", identity, dmgPath]);
run("codesign", ["--verify", "--verbose=2", dmgPath]);

if (!skipNotarize) {
  assertNotaryCredentials(notaryProfile);
  run("xcrun", ["notarytool", "submit", dmgPath, "--keychain-profile", notaryProfile, "--wait"]);
  run("xcrun", ["stapler", "staple", appPath]);
  run("xcrun", ["stapler", "staple", dmgPath]);
  run("spctl", ["--assess", "--type", "open", "--verbose=2", dmgPath]);
}

const digest = createHash("sha256").update(readFileSync(dmgPath)).digest("hex");
console.log(`Safari DMG ready: ${dmgPath}`);
console.log(`SHA-256: ${digest}`);

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
  return packageJson.version;
}

function assertDeveloperIdIdentity(name) {
  const result = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (!output.includes("Developer ID Application")) {
    console.error("Missing Developer ID Application certificate in this keychain.");
    console.error("Install it from Apple Developer > Certificates, Identifiers & Profiles, then retry.");
    process.exit(1);
  }
  if (name !== "Developer ID Application" && !output.includes(name)) {
    console.error(`Requested signing identity was not found: ${name}`);
    process.exit(1);
  }
}

function assertNotaryCredentials(profile) {
  const result = spawnSync("xcrun", ["notarytool", "history", "--keychain-profile", profile], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`Missing notarytool keychain profile: ${profile}`);
    console.error("Create it with:");
    console.error(`xcrun notarytool store-credentials ${profile} --apple-id <apple-id> --team-id <team-id> --password <app-specific-password>`);
    console.error("or use App Store Connect API key credentials.");
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status ?? 1);
  }
}
