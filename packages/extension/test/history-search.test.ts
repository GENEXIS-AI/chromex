import { describe, expect, test } from "vitest";

import { createConfirmedHistorySearchRequest } from "../src/sidepanel/history-search.js";

describe("history search", () => {
  test("marks direct browser history searches as a user-confirmed action", () => {
    expect(createConfirmedHistorySearchRequest("codex")).toEqual({
      type: "context.history.search",
      query: "codex",
      confirmed: true,
    });
  });
});
