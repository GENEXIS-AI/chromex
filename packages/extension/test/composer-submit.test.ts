import { describe, expect, test } from "vitest";

import { createPendingComposerDraftState, createRestoredComposerDraftState } from "../src/sidepanel/composer-draft.js";
import { canSendComposerMessage } from "../src/sidepanel/composer-send-guard.js";
import {
  shouldInterceptComposerDropdownOnEnter,
  shouldSubmitComposerOnKeydown,
} from "../src/sidepanel/composer-submit.js";

describe("composer submit key handling", () => {
  test("submits on plain Enter", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        compositionInProgress: false,
      }),
    ).toBe(true);
  });

  test("does not submit on Shift+Enter", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: true,
        isComposing: false,
        compositionInProgress: false,
      }),
    ).toBe(false);
  });

  test("does not submit while IME composition is active", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: false,
        isComposing: true,
        compositionInProgress: true,
      }),
    ).toBe(false);
  });

  test("does not submit when the browser reports the IME keyCode", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        keyCode: 229,
        compositionInProgress: false,
      }),
    ).toBe(false);
  });

  test("does not submit while a composer dropdown is open", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        compositionInProgress: false,
        dropdownOpen: true,
      }),
    ).toBe(false);
  });

  test("submits on Cmd+Enter (macOS)", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: false,
        metaKey: true,
        isComposing: false,
        compositionInProgress: false,
      }),
    ).toBe(true);
  });

  test("submits on Ctrl+Enter (Windows/Linux)", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: false,
        ctrlKey: true,
        isComposing: false,
        compositionInProgress: false,
      }),
    ).toBe(true);
  });

  test("does not submit on Shift+Enter even with Ctrl held", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: true,
        ctrlKey: true,
        isComposing: false,
        compositionInProgress: false,
      }),
    ).toBe(false);
  });

  test("submits on Cmd+Enter even when composer dropdown is open", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: false,
        metaKey: true,
        isComposing: false,
        compositionInProgress: false,
        dropdownOpen: true,
      }),
    ).toBe(true);
    expect(
      shouldInterceptComposerDropdownOnEnter({
        key: "Enter",
        shiftKey: false,
        metaKey: true,
        isComposing: false,
        compositionInProgress: false,
        dropdownOpen: true,
      }),
    ).toBe(false);
  });

  test("submits on Ctrl+Enter even when composer dropdown is open", () => {
    expect(
      shouldSubmitComposerOnKeydown({
        key: "Enter",
        shiftKey: false,
        ctrlKey: true,
        isComposing: false,
        compositionInProgress: false,
        dropdownOpen: true,
      }),
    ).toBe(true);
    expect(
      shouldInterceptComposerDropdownOnEnter({
        key: "Enter",
        shiftKey: false,
        ctrlKey: true,
        isComposing: false,
        compositionInProgress: false,
        dropdownOpen: true,
      }),
    ).toBe(false);
  });

  test("intercepts plain Enter for open composer dropdowns", () => {
    expect(
      shouldInterceptComposerDropdownOnEnter({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        compositionInProgress: false,
        dropdownOpen: true,
      }),
    ).toBe(true);
    expect(
      shouldInterceptComposerDropdownOnEnter({
        key: "Enter",
        shiftKey: true,
        isComposing: false,
        compositionInProgress: false,
        dropdownOpen: true,
      }),
    ).toBe(false);
  });

  test("clears the composer immediately while a submitted message is pending", () => {
    expect(createPendingComposerDraftState()).toEqual({
      composerDraft: "",
      mentionQuery: null,
      slashQuery: null,
    });
  });

  test("restores the submitted text only when the pending send is cancelled or fails", () => {
    expect(createRestoredComposerDraftState("현재 페이지 설명해줘")).toEqual({
      composerDraft: "현재 페이지 설명해줘",
      mentionQuery: null,
      slashQuery: null,
    });
  });

  test("allows a normal message only when no prompt, turn, or stream is active", () => {
    expect(canSendComposerMessage({ draft: "새 질문", turnActive: false, promptActivityActive: false, streamingAssistantActive: false })).toBe(true);
    expect(canSendComposerMessage({ draft: "새 질문", turnActive: true, promptActivityActive: false, streamingAssistantActive: false })).toBe(true);
    expect(canSendComposerMessage({ draft: "   ", turnActive: true, promptActivityActive: false, streamingAssistantActive: false })).toBe(false);
    expect(canSendComposerMessage({ draft: "새 질문", turnActive: false, promptActivityActive: true, streamingAssistantActive: false })).toBe(false);
    expect(canSendComposerMessage({ draft: "새 질문", turnActive: false, promptActivityActive: false, streamingAssistantActive: true })).toBe(false);
    expect(canSendComposerMessage({ draft: "새 질문", turnActive: true, promptActivityActive: true, streamingAssistantActive: true })).toBe(true);
    expect(
      canSendComposerMessage({
        draft: "새 질문",
        turnActive: false,
        promptActivityActive: false,
        streamingAssistantActive: false,
        submissionStartingActive: true,
      }),
    ).toBe(false);
  });
});
