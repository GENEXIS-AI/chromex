import { describe, expect, test } from "vitest";

import {
  clampSlashCommandIndex,
  getNextSlashCommandIndex,
  isSlashCommandArrowKey,
} from "../src/sidepanel/slash-navigation.js";

describe("slash command keyboard navigation", () => {
  test("moves down and wraps to the first option", () => {
    expect(getNextSlashCommandIndex(0, 3, "down")).toBe(1);
    expect(getNextSlashCommandIndex(2, 3, "down")).toBe(0);
  });

  test("moves up and wraps to the last option", () => {
    expect(getNextSlashCommandIndex(2, 3, "up")).toBe(1);
    expect(getNextSlashCommandIndex(0, 3, "up")).toBe(2);
  });

  test("clamps invalid indexes to the available option range", () => {
    expect(clampSlashCommandIndex(99, 3)).toBe(2);
    expect(clampSlashCommandIndex(-10, 3)).toBe(0);
    expect(clampSlashCommandIndex(0, 0)).toBe(0);
  });

  test("recognizes only vertical arrow keys", () => {
    expect(isSlashCommandArrowKey("ArrowDown")).toBe(true);
    expect(isSlashCommandArrowKey("ArrowUp")).toBe(true);
    expect(isSlashCommandArrowKey("ArrowLeft")).toBe(false);
    expect(isSlashCommandArrowKey("Enter")).toBe(false);
  });
});
