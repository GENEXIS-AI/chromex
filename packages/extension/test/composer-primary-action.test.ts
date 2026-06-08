import { describe, expect, test } from "vitest";

import {
  didComposerPrimaryActionChangeForDraftInput,
  resolveComposerPrimaryAction,
} from "../src/sidepanel/composer-primary-action.js";

describe("composer primary action", () => {
  test("starts live mode when the composer is empty and realtime voice is available", () => {
    expect(
      resolveComposerPrimaryAction({
        composerDraft: "   ",
        currentWorkActive: false,
        liveActive: false,
        liveAvailable: true,
      }),
    ).toBe("start-live");
  });

  test("keeps the empty composer on send when realtime voice is unavailable", () => {
    expect(
      resolveComposerPrimaryAction({
        composerDraft: "   ",
        currentWorkActive: false,
        liveActive: false,
        liveAvailable: false,
      }),
    ).toBe("send");
  });

  test("sends a message when the composer has text", () => {
    expect(
      resolveComposerPrimaryAction({
        composerDraft: "현재 페이지 설명해줘",
        currentWorkActive: false,
        liveActive: false,
        liveAvailable: false,
      }),
    ).toBe("send");
  });

  test("stops live mode while live voice is active", () => {
    expect(
      resolveComposerPrimaryAction({
        composerDraft: "",
        currentWorkActive: false,
        liveActive: true,
        liveAvailable: false,
      }),
    ).toBe("stop-live");
  });

  test("keeps stop-turn while work is running and the composer is empty", () => {
    expect(
      resolveComposerPrimaryAction({
        composerDraft: "   ",
        currentWorkActive: true,
        liveActive: true,
        liveAvailable: false,
      }),
    ).toBe("stop-turn");
  });

  test("sends a steer instruction while work is running and the composer has text", () => {
    expect(
      resolveComposerPrimaryAction({
        composerDraft: "방금 답변은 더 짧게 정리해줘",
        currentWorkActive: true,
        liveActive: true,
        liveAvailable: false,
      }),
    ).toBe("send");
  });

  test("marks the composer for re-render when typing changes live into send", () => {
    expect(
      didComposerPrimaryActionChangeForDraftInput({
        previousComposerDraft: "",
        nextComposerDraft: "현재 페이지 설명해줘",
        currentWorkActive: false,
        liveActive: false,
        liveAvailable: true,
      }),
    ).toBe(true);
  });

  test("marks the composer for re-render when empty disabled send becomes enabled send", () => {
    expect(
      didComposerPrimaryActionChangeForDraftInput({
        previousComposerDraft: "",
        nextComposerDraft: "현재 페이지 설명해줘",
        currentWorkActive: false,
        liveActive: false,
        liveAvailable: false,
      }),
    ).toBe(true);
  });

  test("does not re-render the primary action while text changes within the same send state", () => {
    expect(
      didComposerPrimaryActionChangeForDraftInput({
        previousComposerDraft: "현재 페이지",
        nextComposerDraft: "현재 페이지 설명해줘",
        currentWorkActive: false,
        liveActive: false,
        liveAvailable: false,
      }),
    ).toBe(false);
  });

  test("does not re-render the primary action during IME composition", () => {
    expect(
      didComposerPrimaryActionChangeForDraftInput({
        previousComposerDraft: "",
        nextComposerDraft: "ㅇ",
        currentWorkActive: false,
        liveActive: false,
        liveAvailable: false,
        compositionInProgress: true,
      }),
    ).toBe(false);
  });
});
