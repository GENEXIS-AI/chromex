import { describe, expect, test } from "vitest";

import { createPopoutUrlPath, selectBrowserWindowIdForPopout } from "../src/background/popup-window-target.js";

describe("popup window target selection", () => {
  test("uses the active tab window when available", () => {
    expect(
      selectBrowserWindowIdForPopout({
        activeTabWindowId: 11,
        rememberedWindowId: 22,
        focusedWindowId: 33,
      }),
    ).toBe(11);
  });

  test("falls back to the remembered side-panel browser window", () => {
    expect(
      selectBrowserWindowIdForPopout({
        rememberedWindowId: 22,
        focusedWindowId: 33,
      }),
    ).toBe(22);
  });

  test("falls back to the focused normal browser window", () => {
    expect(
      selectBrowserWindowIdForPopout({
        focusedWindowId: 33,
      }),
    ).toBe(33);
  });

  test("falls back to any normal browser window when no active target exists", () => {
    expect(
      selectBrowserWindowIdForPopout({
        normalWindowIds: [44, 55],
      }),
    ).toBe(44);
  });

  test("allows a standalone pop-out when no browser window can be found", () => {
    expect(selectBrowserWindowIdForPopout({})).toBeUndefined();
    expect(createPopoutUrlPath()).toBe("sidepanel.html?mode=popup");
  });

  test("includes the browser window target only when one is known", () => {
    expect(createPopoutUrlPath(77)).toBe("sidepanel.html?mode=popup&targetWindowId=77");
    expect(createPopoutUrlPath(Number.NaN)).toBe("sidepanel.html?mode=popup");
  });
});
