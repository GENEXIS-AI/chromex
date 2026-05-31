import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const sidepanelCss = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8");

function readFinalDeclaration(selector: string, property: string): string {
  const css = sidepanelCss.replace(/\/\*[\s\S]*?\*\//g, "");
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

describe("voice message rendering", () => {
  test("renders voice transcript messages with role-specific classes and metadata", () => {
    expect(sidepanelSource).toContain('message.delivery === "voice"');
    expect(sidepanelSource).toContain("renderVoiceConversationBody");
    expect(sidepanelSource).toContain("renderVoiceMessageMeta");
    expect(sidepanelSource).toContain("renderVoiceMessageIcon");
    expect(sidepanelSource).toContain("voice-transcript-content");
    expect(sidepanelSource).toContain("voice-message-meta");
  });

  test("styles user voice sends separately from assistant voice responses", () => {
    expect(sidepanelCss).toContain(".message-row.voice-message.user");
    expect(sidepanelCss).toContain(".message-card.user.voice-message");
    expect(sidepanelCss).toContain(".message-row.voice-message.assistant");
    expect(sidepanelCss).toContain(".message-card.assistant.voice-message");
    expect(sidepanelCss).toContain(".voice-message-meta");
  });

  test("keeps user voice bubbles wide enough for natural transcript wrapping", () => {
    expect(readFinalDeclaration(".message-row.voice-message.user .message-user-stack", "width")).toBe("min(88%, 560px)");
    expect(readFinalDeclaration(".message-row.voice-message.user .message-user-stack", "max-width")).toBe("min(88%, 560px)");
    expect(readFinalDeclaration(".message-card.user.voice-message", "max-width")).toBe("100%");
    expect(readFinalDeclaration(".message-card.user.voice-message", "padding")).toBe("16px 22px");
    expect(readFinalDeclaration(".message-card.user.voice-message .voice-transcript-content", "font-size")).toBe("16px");
    expect(readFinalDeclaration(".message-card.user.voice-message .voice-transcript-content", "line-height")).toBe("1.58");
  });

  test("right-aligns the live voice duration with the user message edge", () => {
    expect(readFinalDeclaration(".voice-message-meta.user", "align-self")).toBe("flex-end");
    expect(readFinalDeclaration(".voice-message-meta.user", "justify-content")).toBe("flex-end");
    expect(readFinalDeclaration(".voice-message-meta.user", "width")).toBe("100%");
    expect(readFinalDeclaration(".voice-message-meta.user", "padding-right")).toBe("8px");
  });
});
