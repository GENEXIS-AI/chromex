import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { writeExtensionLocaleFiles } from "./extension-locales.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await writeExtensionLocaleFiles(resolve(root, "packages/extension/public/_locales"));
