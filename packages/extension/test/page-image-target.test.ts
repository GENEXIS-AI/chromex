import { describe, expect, test } from "vitest";

import { extractCssImageUrls, selectEditablePageImageCandidate } from "../src/page-image-target.js";

describe("selectEditablePageImageCandidate", () => {
  test("prefers the visible image the user is most likely looking at over earlier DOM images", () => {
    const selected = selectEditablePageImageCandidate([
      {
        url: "https://cdn.example.com/offscreen-hero.jpg",
        naturalWidth: 1600,
        naturalHeight: 900,
        renderedWidth: 1600,
        renderedHeight: 900,
        visibleArea: 0,
        distanceFromViewportCenter: 1800,
      },
      {
        url: "https://cdn.example.com/sidebar-icon.png",
        naturalWidth: 96,
        naturalHeight: 96,
        renderedWidth: 48,
        renderedHeight: 48,
        visibleArea: 2304,
        distanceFromViewportCenter: 420,
      },
      {
        url: "https://cdn.example.com/product-photo.jpg",
        naturalWidth: 1200,
        naturalHeight: 900,
        renderedWidth: 640,
        renderedHeight: 480,
        visibleArea: 307200,
        distanceFromViewportCenter: 18,
      },
    ]);

    expect(selected?.url).toBe("https://cdn.example.com/product-photo.jpg");
  });

  test("ignores tiny decorative images", () => {
    const selected = selectEditablePageImageCandidate([
      {
        url: "https://cdn.example.com/tracker.gif",
        naturalWidth: 1,
        naturalHeight: 1,
        renderedWidth: 1,
        renderedHeight: 1,
        visibleArea: 1,
        distanceFromViewportCenter: 0,
      },
    ]);

    expect(selected).toBeNull();
  });

  test("extracts visible CSS background image URLs including image-set variants", () => {
    expect(
      extractCssImageUrls(
        'linear-gradient(red, blue), url("https://cdn.example.com/hero ko.png"), image-set(url("https://cdn.example.com/hero@2x.webp") 2x)',
      ),
    ).toEqual([
      "https://cdn.example.com/hero ko.png",
      "https://cdn.example.com/hero@2x.webp",
    ]);
  });
});
