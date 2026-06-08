import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
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

describe("profile editor rendering", () => {
  test("opens color, icon, and image controls from the visual preview trigger", () => {
    expect(sidepanelSource).toContain("visualPickerOpen: false");
    expect(sidepanelSource).toContain('profile-editor-modal ${editor.visualPickerOpen ? "has-visual-picker" : ""}');
    expect(sidepanelSource).toContain("id=\"profile-visual-trigger\"");
    expect(sidepanelSource).toContain("renderProfileVisualPicker(editor, strings)");
    expect(sidepanelSource).toContain("#close-profile-visual-picker");
  });

  test("keeps profile visual controls out of the main editor body", () => {
    expect(sidepanelSource).not.toContain("<h3>${escapeHtml(strings.profileEditor.color)}</h3>");
    expect(sidepanelSource).not.toContain("<h3>${escapeHtml(strings.profileEditor.icon)}</h3>");
    expect(sidepanelSource).not.toContain("<h3>${escapeHtml(strings.profileEditor.image)}</h3>");
  });

  test("caps profile system instructions at 16000 characters in the editor", () => {
    expect(sidepanelSource).toContain('id="profile-editor-prompt"');
    expect(sidepanelSource).toContain("MAX_PROFILE_SYSTEM_PROMPT_LENGTH");
    expect(sidepanelSource).toContain('maxlength="${MAX_PROFILE_SYSTEM_PROMPT_LENGTH}"');
  });

  test("styles the visual picker as an anchored dropdown", () => {
    expect(readFinalDeclaration(".profile-editor-visual-anchor", "position")).toBe("relative");
    expect(readFinalDeclaration(".profile-editor-preview-trigger", "border")).toBe("0");
    expect(readFinalDeclaration(".profile-editor-modal.has-visual-picker", "overflow")).toBe("visible");
    expect(readFinalDeclaration(".profile-visual-picker", "position")).toBe("absolute");
    expect(readFinalDeclaration(".profile-visual-picker", "z-index")).toBe("3");
    expect(readFinalDeclaration(".profile-visual-picker", "overflow-y")).toBe("auto");
    expect(readFinalDeclaration(".profile-visual-picker", "overscroll-behavior")).toBe("contain");
    expect(readFinalDeclaration(".profile-visual-picker-close", "position")).toBe("sticky");
    expect(readFinalDeclaration(".profile-visual-picker-close", "bottom")).toBe("0");
    expect(readFinalDeclaration(".profile-visual-picker-divider", "height")).toBe("1px");
  });
});
