import { describe, expect, test } from "vitest";

import { parseGoalCommand } from "../src/sidepanel/goal-command.js";

describe("goal command parsing", () => {
  test("extracts an explicit /goal objective", () => {
    expect(parseGoalCommand("/goal fix the browser workflow")).toEqual({
      objective: "fix the browser workflow",
    });
  });

  test("ignores empty or non-goal messages", () => {
    expect(parseGoalCommand("/goal   ")).toBeNull();
    expect(parseGoalCommand("goal fix this")).toBeNull();
    expect(parseGoalCommand("please /goal fix this")).toBeNull();
  });
});
