import { spawnSync } from "node:child_process";

const checks = [
  {
    label: "Xcode developer directory",
    command: "xcode-select",
    args: ["-p"],
    required: true,
  },
  {
    label: "Safari Web Extension converter",
    command: "xcrun",
    args: ["--find", "safari-web-extension-converter"],
    required: true,
    fix: "Install full Xcode from the App Store or Apple Developer, open it once, then run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
  },
  {
    label: "Safari WebDriver",
    command: "xcrun",
    args: ["--find", "safaridriver"],
    required: false,
  },
  {
    label: "Swift compiler",
    command: "xcrun",
    args: ["--find", "swiftc"],
    required: false,
  },
];

let failedRequired = false;
for (const check of checks) {
  const result = spawnSync(check.command, check.args, { encoding: "utf8" });
  if (result.status === 0) {
    console.log(`✓ ${check.label}: ${result.stdout.trim()}`);
    continue;
  }

  const detail = (result.stderr || result.stdout).trim();
  console.log(`✗ ${check.label}: ${detail || "not found"}`);
  if (check.fix) {
    console.log(`  Fix: ${check.fix}`);
  }
  if (check.required) {
    failedRequired = true;
  }
}

if (failedRequired) {
  process.exitCode = 1;
}
