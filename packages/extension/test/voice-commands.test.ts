import { describe, expect, test } from "vitest";

import { parseVoiceNavigationCommand } from "../src/sidepanel/voice-commands.js";

describe("parseVoiceNavigationCommand", () => {
  test("parses scroll commands", () => {
    expect(parseVoiceNavigationCommand("scroll down")).toEqual({
      kind: "scroll",
      direction: "down",
    });
    expect(parseVoiceNavigationCommand("go to top")).toEqual({
      kind: "scroll",
      direction: "top",
    });
  });

  test("parses highlight commands", () => {
    expect(parseVoiceNavigationCommand("highlight gluten free recipes")).toEqual({
      kind: "highlight",
      query: "gluten free recipes",
    });
    expect(parseVoiceNavigationCommand("take me to pricing")).toEqual({
      kind: "highlight",
      query: "pricing",
    });
  });

  test("returns null for normal chat", () => {
    expect(parseVoiceNavigationCommand("summarize this page")).toBeNull();
  });
});
