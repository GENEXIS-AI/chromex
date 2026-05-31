import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const sidepanelStateSource = readFileSync(resolve(process.cwd(), "src/sidepanel/sidepanel-state.ts"), "utf8");
const i18nSource = readFileSync(resolve(process.cwd(), "src/sidepanel/i18n.ts"), "utf8");
const stylesSource = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8");
const typesSource = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");

describe("context compaction notice", () => {
  test("renders compaction as a chat timeline notice instead of a transient process card", () => {
    expect(typesSource).toContain('type: "context-compaction"');
    expect(sidepanelSource).toContain("upsertContextCompactionNotice");
    expect(sidepanelSource).toContain("renderConversationNoticeMessage");
    expect(sidepanelSource).toContain('event.phase === "compacting"');
    expect(sidepanelSource).not.toContain('phase: "compacting",\n  };');
  });

  test("persists and restores context compaction notices", () => {
    expect(sidepanelStateSource).toContain("normalizeMessageNotice");
    expect(sidepanelStateSource).toContain("notice.state === \"completed\"");
    expect(sidepanelStateSource).toContain("notice.automatic !== false");
  });

  test("uses compact separator styling and localized copy", () => {
    expect(i18nSource).toContain("compactNoticeRunning");
    expect(i18nSource).toContain("컨텍스트가 자동으로 압축됨");
    expect(stylesSource).toContain(".message-context-notice::before");
    expect(stylesSource).toContain(".context-notice-icon");
    expect(stylesSource).toContain(".message-row.notice.running .context-notice-text");
  });
});
