import { describe, expect, test } from "vitest";

import {
  hasProfileAskUserQuestionStart,
  parseProfileAskUserQuestion,
  stripIncompleteProfileAskUserQuestion,
} from "../src/sidepanel/profile-question.js";

describe("profile ask-user question parser", () => {
  test("extracts a structured profile question and removes tool markup", () => {
    const result = parseProfileAskUserQuestion(
      [
        "before",
        '<chromex_ask_user_question>{"question":"보고서 톤을 어떻게 잡을까요?","options":["임원 보고","실무 상세","한 장 요약"],"allowFreeform":true}</chromex_ask_user_question>',
        "after",
      ].join("\n"),
    );

    expect(result).toEqual({
      question: "보고서 톤을 어떻게 잡을까요?",
      options: ["임원 보고", "실무 상세", "한 장 요약"],
      allowFreeform: true,
      cleanedText: "before\n\nafter",
    });
  });

  test("ignores malformed payloads", () => {
    expect(parseProfileAskUserQuestion("<chromex_ask_user_question>not json</chromex_ask_user_question>")).toBeNull();
    expect(parseProfileAskUserQuestion('<chromex_ask_user_question>{"options":["A"]}</chromex_ask_user_question>')).toBeNull();
  });

  test("clips options and hides incomplete streamed markers", () => {
    const partial = "visible text <chromex_ask_user_question>{\"question\":\"";

    expect(hasProfileAskUserQuestionStart(partial)).toBe(true);
    expect(stripIncompleteProfileAskUserQuestion(partial)).toBe("visible text");

    const parsed = parseProfileAskUserQuestion(
      '<chromex_ask_user_question>{"question":"Pick one","options":["A","B","C","D"]}</chromex_ask_user_question>',
    );
    expect(parsed?.options).toEqual(["A", "B", "C"]);
  });
});
