import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

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

describe("composer layout css", () => {
  test("moves the text area onto its own row when command pills are present", () => {
    expect(readFinalDeclaration(".composer-input-row.has-command", "align-items")).toBe("flex-start");
    expect(readFinalDeclaration(".composer-input-row.has-command textarea", "flex")).toBe("0 0 100%");
    expect(readFinalDeclaration(".composer-input-row.has-command textarea", "width")).toBe("100%");
    expect(readFinalDeclaration(".composer-input-row.has-command textarea", "min-width")).toBe("100%");
    expect(readFinalDeclaration(".composer-input-row.has-command textarea", "min-height")).toBe("46px");
  });

  test("keeps the visible composer input capped at three compact rows", () => {
    expect(readFinalDeclaration(".composer-frame textarea", "max-height")).toBe("66px");
    expect(readFinalDeclaration(".composer-frame textarea", "overflow-y")).toBe("hidden");
  });

  test("keeps attached image file chips fully visible in the composer", () => {
    expect(readFinalDeclaration(".composer-context-summary", "max-height")).toBe("none");
    expect(readFinalDeclaration(".composer-context-summary", "overflow-y")).toBe("visible");
    expect(readFinalDeclaration(".composer-file-group", "min-height")).toBe("64px");
    expect(readFinalDeclaration(".composer-file-list", "min-height")).toBe("56px");
    expect(readFinalDeclaration(".composer-file-list", "align-items")).toBe("center");
    expect(readFinalDeclaration(".image-file-chip", "height")).toBe("56px");
    expect(readFinalDeclaration(".image-file-chip", "overflow")).toBe("visible");
    expect(readFinalDeclaration(".file-chip-preview", "height")).toBe("52px");
    expect(readFinalDeclaration(".file-chip-preview img", "width")).toBe("40px");
    expect(readFinalDeclaration(".file-chip-preview img", "height")).toBe("40px");
  });

  test("keeps long file attachment names inside the composer chip bounds", () => {
    expect(readFinalDeclaration(".file-chip", "min-width")).toBe("0");
    expect(readFinalDeclaration(".composer-file-list .file-chip", "flex")).toBe("0 1 auto");
    expect(readFinalDeclaration(".file-chip-label", "min-width")).toBe("0");
    expect(readFinalDeclaration(".file-chip-label", "overflow")).toBe("hidden");
    expect(readFinalDeclaration(".file-chip-label", "text-overflow")).toBe("ellipsis");
    expect(readFinalDeclaration(".file-chip-label", "white-space")).toBe("nowrap");
  });

  test("keeps selected-page context chips inside the composer without horizontal scrolling", () => {
    expect(readFinalDeclaration('.composer-context-group[data-composer-context-group="references"]', "width")).toBe(
      "100%",
    );
    expect(readFinalDeclaration('.composer-context-group[data-composer-context-group="references"]', "max-width")).toBe(
      "100%",
    );
    expect(readFinalDeclaration('.composer-context-group[data-composer-context-group="references"]', "overflow-x")).toBe(
      "hidden",
    );
    expect(readFinalDeclaration('.composer-context-group[data-composer-context-group="references"]', "flex-wrap")).toBe(
      "wrap",
    );
    expect(readFinalDeclaration(".composer-file-list", "overflow-x")).toBe("auto");
  });

  test("lays out selected-page context chips as fixed icon text dismiss columns", () => {
    expect(readFinalDeclaration(".selected-page-context-chip", "display")).toBe("grid");
    expect(readFinalDeclaration(".selected-page-context-chip", "grid-template-columns")).toBe(
      "24px minmax(0, 1fr) 28px",
    );
    expect(readFinalDeclaration(".selected-page-context-chip", "width")).toBe("100%");
    expect(readFinalDeclaration(".selected-page-context-chip", "max-width")).toBe("100%");
    expect(readFinalDeclaration(".selected-page-context-chip", "min-width")).toBe("0");
    expect(readFinalDeclaration(".selected-page-context-chip", "overflow")).toBe("hidden");
    expect(readFinalDeclaration(".selected-page-context-chip .summary-chip-dismiss", "position")).toBe("static");
    expect(readFinalDeclaration(".selected-page-context-chip .summary-chip-dismiss", "justify-self")).toBe("end");
    expect(readFinalDeclaration(".selected-page-context-chip .summary-chip-dismiss", "transform")).toBe("none");
    expect(readFinalDeclaration(".selected-page-context-icon", "justify-self")).toBe("start");
    expect(readFinalDeclaration(".selected-page-context-icon", "place-items")).toBe("center");
  });

  test("renders fenced code blocks as bordered cards with a header copy action", () => {
    expect(readFinalDeclaration(".message-code-block", "overflow")).toBe("hidden");
    expect(readFinalDeclaration(".message-code-header", "display")).toBe("flex");
    expect(readFinalDeclaration(".message-code-title", "font-size")).toBe("14px");
    expect(readFinalDeclaration(".message-code-copy", "width")).toBe("34px");
    expect(readFinalDeclaration(".message-code-block pre", "margin")).toBe("0");
  });

  test("styles rendered markdown blocks without default browser spacing", () => {
    expect(readFinalDeclaration(".message-content h1", "font-size")).toBe("20px");
    expect(readFinalDeclaration(".message-content ul", "padding-left")).toBe("22px");
    expect(readFinalDeclaration(".message-content li", "margin")).toBe("4px 0");
    expect(readFinalDeclaration(".message-content blockquote", "border-left")).toBe("3px solid rgba(169, 199, 255, 0.35)");
    expect(readFinalDeclaration(".message-content a", "color")).toBe("#a9c7ff");
    expect(readFinalDeclaration(".message-content p code", "display")).toBe("inline");
  });

  test("keeps rendered markdown tables readable inside the side panel", () => {
    expect(readFinalDeclaration(".message-table-scroll", "overflow-x")).toBe("auto");
    expect(readFinalDeclaration(".message-content table", "border-collapse")).toBe("collapse");
    expect(readFinalDeclaration(".message-content th", "font-weight")).toBe("650");
    expect(readFinalDeclaration(".message-content th", "background")).toBe("rgba(255, 255, 255, 0.055)");
    expect(readFinalDeclaration(".message-content td", "border-top")).toBe("1px solid rgba(255, 255, 255, 0.08)");
  });

  test("highlights slash command keyboard selection like hover state", () => {
    expect(readFinalDeclaration(".command-popover .suggestion.keyboard-active", "background")).toBe("#3b3d3d");
    expect(readFinalDeclaration(".command-popover .suggestion.keyboard-active", "transform")).toBe("none");
  });

  test("highlights mention keyboard selection like hover state", () => {
    expect(readFinalDeclaration(".tab-mention-row.keyboard-active", "background")).toBe("#3b3d3d");
    expect(readFinalDeclaration(".tab-mention-action.keyboard-active", "background")).toBe("#3b3d3d");
    expect(readFinalDeclaration(".tab-mention-row.keyboard-active", "transform")).toBe("none");
  });

  test("keeps assistant message actions below the response instead of beside it", () => {
    expect(readFinalDeclaration(".message-row.assistant", "flex-direction")).toBe("column");
    expect(readFinalDeclaration(".message-row.assistant", "align-items")).toBe("flex-start");
    expect(readFinalDeclaration(".message-actions.assistant", "align-self")).toBe("flex-start");
    expect(readFinalDeclaration(".message-actions.assistant", "gap")).toBe("6px");
  });

  test("uses compact icon actions for message controls", () => {
    expect(readFinalDeclaration(".message-actions.user-icon-actions", "gap")).toBe("5px");
    expect(readFinalDeclaration(".message-actions.user-icon-actions", "padding-right")).toBe("2px");
    expect(readFinalDeclaration(".message-actions.assistant", "gap")).toBe("6px");
    expect(readFinalDeclaration(".message-action-button.icon", "width")).toBe("26px");
    expect(readFinalDeclaration(".message-action-button.icon", "height")).toBe("26px");
    expect(readFinalDeclaration(".message-action-button.icon svg", "width")).toBe("16px");
    expect(readFinalDeclaration(".message-action-button.icon svg", "height")).toBe("16px");
  });

  test("shows message action tooltips as floating labels", () => {
    expect(readFinalDeclaration(".message-action-button[data-tooltip]", "position")).toBe("relative");
    expect(readFinalDeclaration(".message-action-button[data-tooltip]::after", "content")).toBe("attr(data-tooltip)");
    expect(readFinalDeclaration(".message-action-button[data-tooltip]::after", "position")).toBe("absolute");
    expect(readFinalDeclaration(".message-action-button[data-tooltip]:hover::after", "opacity")).toBe("1");
    expect(readFinalDeclaration(".message-action-check", "font-size")).toBe("15px");
  });

  test("removes excess spacing when trace details are collapsed", () => {
    expect(readFinalDeclaration(".message-trace-text", "margin")).toBe("6px 0 2px");
    expect(readFinalDeclaration(".message-trace-text:not([open])", "margin-bottom")).toBe("0");
    expect(readFinalDeclaration(".message-trace-text:not([open]) .message-trace-summary", "margin-bottom")).toBe("0");
    expect(readFinalDeclaration(".message-trace-summary", "margin-bottom")).toBe("4px");
    expect(readFinalDeclaration(".message-trace-lines", "gap")).toBe("3px");
  });

  test("applies trace shimmer once per running line at a slower pace", () => {
    expect(readFinalDeclaration(".message-trace-line.running .message-trace-line-text", "animation")).toBe(
      "trace-text-sheen 3.8s ease-in-out infinite",
    );
    expect(readFinalDeclaration(".message-trace-line.running .message-trace-line-main", "animation")).toBe("");
    expect(readFinalDeclaration(".message-trace-line.running .message-trace-line-detail", "animation")).toBe("");
  });

  test("keeps topbar overlays unclipped and separates quick actions from menu controls", () => {
    expect(readFinalDeclaration(".topbar", "overflow")).toBe("visible");
    expect(readFinalDeclaration(".topbar", "grid-template-columns")).toBe("minmax(0, 1fr) auto");
    expect(readFinalDeclaration(".top-quick-actions", "flex")).toBe("0 0 auto");
    expect(readFinalDeclaration(".top-quick-actions", "overflow")).toBe("visible");
    expect(readFinalDeclaration(".top-quick-action", "width")).toBe("34px");
    expect(readFinalDeclaration(".top-quick-action", "padding")).toBe("0");
    expect(readFinalDeclaration(".top-quick-action[data-tooltip]::after", "content")).toBe("attr(data-tooltip)");
    expect(readFinalDeclaration(".top-quick-action[data-tooltip]::after", "z-index")).toBe("var(--z-tooltip)");
    expect(readFinalDeclaration(".top-quick-action[data-tooltip]::after", "right")).toBe("0");
    expect(readFinalDeclaration(".top-quick-action[data-tooltip]::after", "left")).toBe("auto");
    expect(readFinalDeclaration(".top-quick-action[data-tooltip]:hover::after", "opacity")).toBe("1");
    expect(readFinalDeclaration(".top-quick-action.infographic", "background")).toBe("transparent");
    expect(readFinalDeclaration(".top-quick-action.infographic", "color")).toBe("#c8cdd5");
    expect(readFinalDeclaration(".top-quick-action.infographic:hover", "background")).toBe("rgba(255, 255, 255, 0.1)");
    expect(readFinalDeclaration(".top-quick-action-icon", "width")).toBe("18px");
    expect(readFinalDeclaration(".top-quick-action-icon", "height")).toBe("18px");
    expect(readFinalDeclaration(".top-quick-summary-icon", "gap")).toBe("0");
    expect(readFinalDeclaration(".top-quick-action-icon svg", "width")).toBe("18px");
    expect(readFinalDeclaration(".top-quick-action-icon svg", "display")).toBe("block");
    expect(readFinalDeclaration(".top-quick-chart-icon", "width")).toBe("18px");
    expect(readFinalDeclaration(".top-quick-chart-icon", "font-size")).toBe("18px");
    expect(readFinalDeclaration(".top-quick-separator", "width")).toBe("1px");
    expect(readFinalDeclaration(".top-actions", "z-index")).toBe("90");
    expect(css).not.toContain(".quick-system");
    expect(css).not.toContain(".quick-system-button");
  });

  test("places the scroll-to-bottom button above the composer without changing layout height", () => {
    expect(readFinalDeclaration(".composer-shell", "overflow")).toBe("visible");
    expect(readFinalDeclaration(".composer-frame", "overflow")).toBe("hidden");
    expect(readFinalDeclaration(".scroll-to-bottom-button", "position")).toBe("absolute");
    expect(readFinalDeclaration(".scroll-to-bottom-button", "bottom")).toBe("calc(100% + 12px)");
    expect(readFinalDeclaration(".scroll-to-bottom-button", "left")).toBe("50%");
    expect(readFinalDeclaration(".scroll-to-bottom-button", "width")).toBe("36px");
    expect(readFinalDeclaration(".scroll-to-bottom-button", "height")).toBe("36px");
    expect(readFinalDeclaration(".scroll-to-bottom-button", "padding")).toBe("0");
    expect(readFinalDeclaration(".scroll-to-bottom-button.visible", "opacity")).toBe("1");
    expect(readFinalDeclaration(".scroll-to-bottom-icon", "font-size")).toBe("16px");
    expect(readFinalDeclaration(".scroll-to-bottom-icon svg", "width")).toBe("16px");
  });

  test("styles native in-panel dialogs instead of browser input popups", () => {
    expect(readFinalDeclaration(".native-dialog-backdrop", "position")).toBe("fixed");
    expect(readFinalDeclaration(".native-dialog-backdrop", "z-index")).toBe("1300");
    expect(readFinalDeclaration(".native-dialog-modal", "background")).toBe("#242628");
    expect(readFinalDeclaration(".native-dialog-input", "font-size")).toBe("14px");
    expect(readFinalDeclaration(".annotation-text-popover", "position")).toBe("absolute");
    expect(readFinalDeclaration(".annotation-text-popover", "z-index")).toBe("4");
  });

  test("keeps large annotated images zoomable inside a scrollable viewport", () => {
    expect(readFinalDeclaration(".image-annotation-stage", "overflow")).toBe("hidden");
    expect(readFinalDeclaration(".image-annotation-viewport", "overflow")).toBe("auto");
    expect(readFinalDeclaration(".image-annotation-stage-inner", "position")).toBe("relative");
    expect(readFinalDeclaration(".image-annotation-stage-inner", "max-width")).toBe("none");
    expect(readFinalDeclaration(".image-annotation-stage img", "object-fit")).toBe("contain");
    expect(readFinalDeclaration(".image-annotation-zoom-controls", "display")).toBe("inline-flex");
    expect(readFinalDeclaration('.image-annotation-stage canvas[data-annotation-tool="select"]', "cursor")).toBe("grab");
    expect(readFinalDeclaration('.image-annotation-stage canvas[data-annotation-panning="true"]', "cursor")).toBe("grabbing");
  });

  test("uses simple image-first generated result cards with overlay actions", () => {
    expect(readFinalDeclaration(".message-card.assistant.image-result", "background")).toBe("transparent");
    expect(readFinalDeclaration(".message-card.assistant.image-result", "padding")).toBe("0");
    expect(readFinalDeclaration(".message-images", "max-width")).toBe("min(100%, 520px)");
    expect(readFinalDeclaration(".message-attachment-image", "max-width")).toBe("min(100%, 420px)");
    expect(readFinalDeclaration(".message-image-frame", "border")).toBe("0");
    expect(readFinalDeclaration(".message-image-frame", "border-radius")).toBe("22px");
    expect(readFinalDeclaration(".message-image-frame img", "max-height")).toBe("min(340px, 42vh)");
    expect(readFinalDeclaration(".message-image-overlay-actions", "position")).toBe("absolute");
    expect(readFinalDeclaration(".message-image-overlay-actions", "inset")).toBe("auto 10px 10px 10px");
    expect(readFinalDeclaration(".image-action-button.overlay", "min-height")).toBe("36px");
    expect(readFinalDeclaration(".image-action-button.overlay", "padding")).toBe("0 12px");
    expect(readFinalDeclaration(".image-action-button.overlay", "font-size")).toBe("12px");
    expect(readFinalDeclaration(".image-action-button.overlay.icon", "width")).toBe("36px");
    expect(readFinalDeclaration(".image-action-button.overlay svg", "width")).toBe("17px");
    expect(readFinalDeclaration(".message-image-skeleton", "min-height")).toBe("min(300px, 42vh)");
  });

  test("keeps follow-up image editor composer aligned with the main composer", () => {
    expect(readFinalDeclaration(".image-annotation-backdrop", "grid-template-rows")).toBe("auto minmax(0, 1fr)");
    expect(readFinalDeclaration(".image-annotation-backdrop", "z-index")).toBe("1400");
    expect(readFinalDeclaration(".image-annotation-topbar", "display")).toBe("grid");
    expect(readFinalDeclaration(".image-annotation-topbar", "position")).toBe("relative");
    expect(readFinalDeclaration(".image-annotation-topbar", "z-index")).toBe("2");
    expect(readFinalDeclaration(".image-annotation-workspace", "display")).toBe("grid");
    expect(readFinalDeclaration(".image-annotation-workspace", "grid-template-rows")).toBe(
      "minmax(0, 1fr) auto auto auto auto",
    );
    expect(readFinalDeclaration(".image-annotation-workspace", "overflow")).toBe("hidden");
    expect(readFinalDeclaration(".image-annotation-followup", "grid-template-columns")).toBe("36px minmax(0, 1fr) 40px");
    expect(readFinalDeclaration(".image-annotation-followup", "border-radius")).toBe("24px");
    expect(readFinalDeclaration(".image-annotation-followup textarea", "min-height")).toBe("42px");
    expect(readFinalDeclaration(".image-annotation-followup textarea", "font-size")).toBe("15px");
    expect(readFinalDeclaration(".annotation-plus", "width")).toBe("36px");
    expect(readFinalDeclaration(".image-annotation-send", "width")).toBe("40px");
    expect(readFinalDeclaration(".image-annotation-send", "height")).toBe("40px");
    expect(readFinalDeclaration(".image-annotation-send", "padding")).toBe("0");
    expect(readFinalDeclaration(".image-annotation-send", "place-items")).toBe("center");
  });

  test("centers the circular composer send icon visually", () => {
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active)", "width")).toBe("40px");
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active)", "height")).toBe("40px");
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active)", "padding")).toBe("0");
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active)", "display")).toBe("grid");
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active)", "place-items")).toBe("center");
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active)", "align-items")).toBe("center");
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active)", "justify-items")).toBe("center");
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active)", "font-size")).toBe("0");
    expect(readFinalDeclaration('.composer-submit .send-button:not(.live-active) svg[data-ui-icon="send"]', "width")).toBe(
      "18px",
    );
    expect(readFinalDeclaration('.composer-submit .send-button:not(.live-active) svg[data-ui-icon="send"]', "margin")).toBe(
      "0",
    );
    expect(readFinalDeclaration('.composer-submit .send-button:not(.live-active) svg[data-ui-icon="send"]', "transform")).toBe(
      "none",
    );
  });

  test("keeps hover tooltips above clipped surfaces and inside side-panel edges", () => {
    expect(readFinalDeclaration(":root", "--z-tooltip")).toBe("2147483000");
    expect(readFinalDeclaration(".composer-frame", "overflow")).toBe("hidden");
    expect(
      readFinalDeclaration(".composer-frame:has(.composer-submit [data-tooltip]:hover)", "overflow"),
    ).toBe("visible");
    expect(readFinalDeclaration(".composer-submit [data-tooltip]::after", "z-index")).toBe("var(--z-tooltip)");
    expect(readFinalDeclaration(".composer-submit [data-tooltip]::after", "right")).toBe("0");
    expect(readFinalDeclaration(".composer-submit [data-tooltip]::after", "max-width")).toBe(
      "min(260px, calc(100dvw - 24px))",
    );
    expect(readFinalDeclaration(".composer-submit [data-tooltip]:hover::after", "transform")).toBe("translateY(0)");
    expect(readFinalDeclaration(".message-action-button[data-tooltip]::after", "z-index")).toBe("var(--z-tooltip)");
    expect(readFinalDeclaration(".message-action-button[data-tooltip]::after", "white-space")).toBe("normal");
    expect(readFinalDeclaration(".message-actions.user .message-action-button[data-tooltip]::after", "right")).toBe(
      "0",
    );
  });

  test("anchors composer popovers to their controls and keeps command popovers inside composer edges", () => {
    expect(readFinalDeclaration(".suggestions", "left")).toBe("10px");
    expect(readFinalDeclaration(".suggestions", "right")).toBe("10px");
    expect(readFinalDeclaration(".suggestions", "bottom")).toBe("calc(100% + 10px)");
    expect(readFinalDeclaration(".suggestions", "width")).toBe("auto");
    expect(readFinalDeclaration(".suggestions", "max-width")).toBe("none");
    expect(readFinalDeclaration(".composer-frame.has-suggestions", "overflow")).toBe("visible");
    expect(readFinalDeclaration(".composer-model-dropdown", "position")).toBe("absolute");
    expect(readFinalDeclaration(".composer-model-dropdown", "right")).toBe(
      "clamp(-84px, calc(100dvw - 360px), 0px)",
    );
    expect(readFinalDeclaration(".composer-model-dropdown", "bottom")).toBe("calc(100% + 8px)");
    expect(readFinalDeclaration(".composer-permission-menu", "position")).toBe("absolute");
    expect(readFinalDeclaration(".composer-permission-menu", "left")).toBe("0");
    expect(readFinalDeclaration(".composer-permission-menu", "bottom")).toBe("calc(100% + 8px)");
  });

  test("uses a compact model picker menu scale", () => {
    expect(readFinalDeclaration(".composer-model-dropdown", "width")).toBe("min(276px, calc(100dvw - 24px))");
    expect(readFinalDeclaration(".composer-model-dropdown", "max-height")).toBe("min(340px, calc(100dvh - 132px))");
    expect(readFinalDeclaration(".composer-model-dropdown", "padding")).toBe("7px");
    expect(readFinalDeclaration(".composer-model-dropdown", "border-radius")).toBe("16px");
    expect(readFinalDeclaration(".composer-model-menu-row", "min-height")).toBe("34px");
    expect(readFinalDeclaration(".composer-model-menu-row", "padding")).toBe("5px 8px");
    expect(readFinalDeclaration(".composer-model-menu-copy strong", "font-size")).toBe("12.5px");
    expect(readFinalDeclaration(".composer-model-menu-copy span", "font-size")).toBe("11px");
    expect(readFinalDeclaration(".composer-model-menu-title", "font-size")).toBe("11.5px");
  });

  test("removes hover animation from composer and image editor send buttons", () => {
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active)", "transition")).toBe("none");
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active):hover", "transform")).toBe("none");
    expect(readFinalDeclaration(".composer-submit .send-button:not(.live-active):hover", "transition")).toBe("none");
    expect(readFinalDeclaration(".image-annotation-send", "transition")).toBe("none");
    expect(readFinalDeclaration(".image-annotation-send:hover", "transform")).toBe("none");
    expect(readFinalDeclaration(".image-annotation-send:hover", "transition")).toBe("none");
  });

  test("renders compact dictation waveform controls inside the composer", () => {
    expect(readFinalDeclaration(".composer-dictation-panel", "display")).toBe("grid");
    expect(readFinalDeclaration(".composer-dictation-panel", "grid-template-columns")).toBe(
      "30px minmax(0, 1fr) 32px 32px",
    );
    expect(readFinalDeclaration(".composer-dictation-waveform", "display")).toBe("flex");
    expect(readFinalDeclaration(".composer-waveform-bar", "height")).toBe("max(3px, calc(34px * var(--bar-level)))");
    expect(readFinalDeclaration(".composer-dictation-action", "place-items")).toBe("center");
  });

  test("expands edited user messages into a wide scrollable editor card", () => {
    expect(readFinalDeclaration(".message-user-stack.editing", "width")).toBe("min(100%, 760px)");
    expect(readFinalDeclaration(".message-user-stack.editing", "max-width")).toBe("min(100%, 760px)");
    expect(readFinalDeclaration(".message-user-stack.editing", "align-items")).toBe("stretch");
    expect(readFinalDeclaration(".message-card.user.editing", "width")).toBe("100%");
    expect(readFinalDeclaration(".message-card.user.editing", "padding")).toBe("22px");
    expect(readFinalDeclaration(".message-card.user.editing", "border-radius")).toBe("22px 22px 6px 22px");
    expect(readFinalDeclaration(".message-card.user.editing", "background")).toBe("#292b2f");
    expect(readFinalDeclaration(".message-edit-box textarea", "min-height")).toBe("128px");
    expect(readFinalDeclaration(".message-edit-box textarea", "max-height")).toBe("min(48vh, 320px)");
    expect(readFinalDeclaration(".message-edit-box textarea", "overflow-y")).toBe("auto");
    expect(readFinalDeclaration(".message-edit-box textarea", "font-size")).toBe("15px");
    expect(readFinalDeclaration(".message-edit-box textarea", "line-height")).toBe("1.72");
    expect(readFinalDeclaration(".message-edit-actions .message-action-button", "background")).toBe(
      "rgba(255, 255, 255, 0.055)",
    );
    expect(readFinalDeclaration(".message-edit-actions .message-action-button", "color")).toBe("#aeb4bf");
    expect(readFinalDeclaration(".message-edit-actions .message-action-button.primary", "background")).toBe(
      "rgba(169, 199, 255, 0.18)",
    );
    expect(readFinalDeclaration(".message-edit-actions .message-action-button.primary", "color")).toBe("#c7d9ff");
  });
});
