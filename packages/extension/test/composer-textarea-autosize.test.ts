import { describe, expect, test } from "vitest";

import {
  calculateComposerTextareaAutosize,
  COMPOSER_TEXTAREA_MAX_VISIBLE_LINES,
} from "../src/sidepanel/composer-textarea-autosize.js";

describe("composer textarea autosize", () => {
  test("caps the visible composer input at three text lines", () => {
    expect(COMPOSER_TEXTAREA_MAX_VISIBLE_LINES).toBe(3);

    expect(
      calculateComposerTextareaAutosize({
        scrollHeight: 240,
        lineHeight: 21,
        paddingTop: 3,
        paddingBottom: 0,
        minHeight: 46,
      }),
    ).toEqual({
      height: 66,
      overflowY: "auto",
    });
  });

  test("uses the natural scroll height before the three-line cap is reached", () => {
    expect(
      calculateComposerTextareaAutosize({
        scrollHeight: 58,
        lineHeight: 21,
        paddingTop: 3,
        paddingBottom: 0,
        minHeight: 46,
      }),
    ).toEqual({
      height: 58,
      overflowY: "hidden",
    });
  });
});
