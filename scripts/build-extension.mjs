import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { writeExtensionLocaleFiles } from "./extension-locales.mjs";

const root = process.cwd();
const outdir = resolve(root, "dist");
const buildId = process.env.CODEX_EXTENSION_BUILD_ID ?? new Date().toISOString().replace(/[-:.TZ]/gu, "");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    background: resolve(root, "src/background/index.ts"),
    content: resolve(root, "src/content/index.ts"),
    sidepanel: resolve(root, "src/sidepanel/index.ts"),
    "mic-permission": resolve(root, "src/mic-permission/index.ts"),
    offscreen: resolve(root, "src/offscreen/index.ts"),
  },
  outdir,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome116"],
  sourcemap: true,
});

await cp(resolve(root, "public"), outdir, { recursive: true });
await writeExtensionLocaleFiles(resolve(outdir, "_locales"));

const sidepanelHtmlPath = resolve(outdir, "sidepanel.html");
const sidepanelHtml = await readFile(sidepanelHtmlPath, "utf8");
await writeFile(
  sidepanelHtmlPath,
  sidepanelHtml
    .replace(/href="sidepanel\.css(?:\?v=[^"]*)?"/u, `href="sidepanel.css?v=${buildId}"`)
    .replace(/src="sidepanel\.js(?:\?v=[^"]*)?"/u, `src="sidepanel.js?v=${buildId}"`),
);
await writeFile(
  resolve(outdir, "build-info.json"),
  JSON.stringify(
    {
      buildId,
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
