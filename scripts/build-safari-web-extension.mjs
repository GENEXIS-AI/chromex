import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const chromeDist = resolve(repoRoot, "packages/extension/dist");
const safariOut = resolve(repoRoot, "output/safari/ChromexSafariExtension");

run("npm", ["run", "build", "--workspace", "@codex-sidepanel/extension"]);

await rm(safariOut, { recursive: true, force: true });
await mkdir(safariOut, { recursive: true });
await cp(chromeDist, safariOut, { recursive: true });

const manifestPath = resolve(safariOut, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

// Safari has no Chrome Side Panel equivalent. For the first Safari prototype,
// run the existing side-panel app as the toolbar popup. A proper v1 can move
// this UI into the containing macOS app window.
manifest.action = {
  ...(manifest.action ?? {}),
  default_popup: "sidepanel.html",
};

delete manifest.side_panel;
delete manifest.minimum_chrome_version;
delete manifest.key;

manifest.permissions = (manifest.permissions ?? []).filter((permission) => permission !== "sidePanel");
manifest.optional_permissions = (manifest.optional_permissions ?? []).filter((permission) => permission !== "history");
if (manifest.background && typeof manifest.background === "object") {
  delete manifest.background.type;
}

// Safari's site-access UX is stricter and the Chrome optional-host flow is not
// enough for the current scripted page-reading path. Keep the staged Safari
// build explicit so content-script injection works after the user approves the
// extension in Safari.
manifest.host_permissions = ["<all_urls>"];
delete manifest.optional_host_permissions;

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  resolve(safariOut, "SAFARI_PORT_NOTES.txt"),
  [
    "Chromex Safari WebExtension staging build",
    "",
    "This directory is generated from packages/extension/dist by scripts/build-safari-web-extension.mjs.",
    "It is not a complete Safari app bundle yet.",
    "",
    "Important differences from the Chrome build:",
    "- Chrome side_panel is removed; sidepanel.html is exposed as action.default_popup.",
    "- sidePanel and Safari-unsupported history permissions are removed.",
    "- background.type is removed because the bundled background script does not need module loading in Safari.",
    "- <all_urls> is a required host permission for the current page-reading path.",
    "- Chrome's native messaging host installer does not apply to Safari; a containing macOS app bridge is still required.",
    "",
  ].join("\n"),
);

console.log(`Safari WebExtension staged at: ${safariOut}`);

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
