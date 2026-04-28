import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const projectDir = resolve(repoRoot, "output/safari/xcode/ChromexSafari");
const projectPath = resolve(projectDir, "ChromexSafari.xcodeproj");
const derivedDataPath = resolve(repoRoot, "output/safari/DerivedData");

if (!existsSync(projectPath)) {
  console.error("Safari Xcode project is missing. Run `npm run create:safari:xcode` first.");
  process.exit(1);
}

run("xcodebuild", [
  "-project",
  projectPath,
  "-scheme",
  "ChromexSafari",
  "-configuration",
  "Debug",
  "-derivedDataPath",
  derivedDataPath,
  "build",
  "CODE_SIGNING_ALLOWED=NO",
]);

console.log(`Safari app built at: ${resolve(derivedDataPath, "Build/Products/Debug/ChromexSafari.app")}`);

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
