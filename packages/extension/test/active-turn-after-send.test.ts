import { describe, expect, test } from "vitest";

import { resolveAcceptedPromptActiveTurn } from "../src/sidepanel/active-turn-after-send.js";

describe("active turn after prompt acceptance", () => {
  test("keeps the returned turn active so streaming responses can be steered", () => {
    expect(
      resolveAcceptedPromptActiveTurn({
        threadId: "thread-1",
        turnId: "turn-1",
        completedTurnIds: new Set(),
      }),
    ).toEqual({ threadId: "thread-1", turnId: "turn-1" });
  });

  test("does not resurrect a turn that already completed before the response handler ran", () => {
    expect(
      resolveAcceptedPromptActiveTurn({
        threadId: "thread-1",
        turnId: "turn-1",
        completedTurnIds: new Set(["turn-1"]),
      }),
    ).toBeNull();
  });
});
