import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const css = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function readFinalDeclaration(selector: string, property: string): string {
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let value = "";

  while ((match = blockPattern.exec(css))) {
    const selectorList = (match[1] ?? "")
      .split(",")
      .map((item) => item.trim());
    if (!selectorList.includes(selector)) {
      continue;
    }

    const declarations = match[2] ?? "";
    for (const declaration of declarations.split(";")) {
      const [name, ...rawValue] = declaration.split(":");
      if (name?.trim() === property) {
        value = rawValue.join(":").trim();
      }
    }
  }

  return value;
}

describe("site suggestion icons", () => {
  test("routes profile suggestions to profile icons and site suggestions to site icons", () => {
    expect(source).toContain("renderSuggestionCardIcon(card)");
    expect(source).toContain("function renderSuggestionCardIcon(card: ActionCard): string");
    expect(source).toContain("getSuggestionCardSource(card) === \"profile\"");
    expect(source).toContain("renderProfileSuggestionIcon(selectedProfile)");
    expect(readFinalDeclaration(".site-suggestion-site-icon.profile", "color")).toBe("var(--profile-color)");
    expect(readFinalDeclaration(".site-suggestion-site-icon.profile svg", "width")).toBe("16px");
  });
});
