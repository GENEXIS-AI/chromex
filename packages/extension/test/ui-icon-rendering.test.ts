import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const messageContentSource = readFileSync(resolve(process.cwd(), "src/sidepanel/message-content.ts"), "utf8");
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

describe("sidepanel icon rendering", () => {
  test("renders common controls through the lucide-backed UI icon renderer", () => {
    expect(sidepanelSource).toContain('from "./ui-icons.js"');
    expect(sidepanelSource).toContain('renderUiIcon("plus")');
    expect(sidepanelSource).toContain('renderUiIcon("mic")');
    expect(sidepanelSource).toContain('renderUiIcon("send")');
    expect(sidepanelSource).toContain('renderUiIcon("stop-filled")');
    expect(sidepanelSource).toContain('renderUiIcon("chevron-down")');
    expect(sidepanelSource).toContain('renderUiIcon("chevron-right")');
    expect(sidepanelSource).toContain('renderUiIcon("check")');
    expect(sidepanelSource).toContain('renderUiIcon("x")');
    expect(sidepanelSource).toContain('renderUiIcon("arrow-down")');
    expect(sidepanelSource).toContain('renderUiIcon("globe"');
    expect(sidepanelSource).not.toContain('aria-hidden="true">v</span>');
    expect(sidepanelSource).not.toContain('aria-hidden="true">⌄</span>');
    expect(sidepanelSource).not.toContain('aria-hidden="true">›</span>');
    expect(sidepanelSource).not.toContain('aria-hidden="true">✓</span>');
    expect(sidepanelSource).not.toContain('summary-chip-dismiss">x</span>');
  });

  test("renders markdown code block icons through the same icon renderer", () => {
    expect(messageContentSource).toContain('from "./ui-icons.js"');
    expect(messageContentSource).toContain('renderUiIcon("code")');
    expect(messageContentSource).toContain('renderUiIcon("copy")');
    expect(messageContentSource).not.toContain("<svg viewBox=");
  });

  test("renders the streaming stop control as a filled lucide icon", () => {
    const iconSource = readFileSync(resolve(process.cwd(), "src/sidepanel/ui-icons.ts"), "utf8");

    expect(iconSource).toContain('| "stop-filled"');
    expect(iconSource).toContain('"stop-filled": Square');
    expect(iconSource).toContain('const fill = icon === "stop-filled" ? "currentColor" : "none";');
    expect(sidepanelSource).toContain('renderUiIcon("stop-filled")');
    expect(sidepanelSource).not.toContain('renderUiIcon("stop")');
  });

  test("keeps icon-only buttons centered without hover reflow", () => {
    expect(readFinalDeclaration(".icon-button", "display")).toBe("grid");
    expect(readFinalDeclaration(".icon-button", "place-items")).toBe("center");
    expect(readFinalDeclaration(".icon-button", "line-height")).toBe("1");
    expect(readFinalDeclaration(".message-code-copy", "display")).toBe("inline-grid");
    expect(readFinalDeclaration(".message-code-copy", "place-items")).toBe("center");
    expect(readFinalDeclaration(".message-code-copy svg", "display")).toBe("block");
    expect(readFinalDeclaration(".message-action-button.icon svg", "display")).toBe("block");
  });
});
