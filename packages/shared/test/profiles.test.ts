import { describe, expect, test } from "vitest";

import { getProfileTemplate, listProfileTemplates } from "../src/index.js";

describe("profile templates", () => {
  test("lists the built-in templates", () => {
    const profiles = listProfileTemplates();

    expect(profiles.map((profile) => profile.name)).toEqual([
      "Default",
      "YouTube Summarizer",
      "Research Assistant",
      "Fact Checker",
      "Strategy Analyst",
      "Product Manager",
      "Marketing Strategist",
      "Slide Production Expert",
      "Sales & GTM Strategist",
      "Legal Reviewer",
      "Teacher Mode",
      "Data Analyst",
      "Product & UX Strategist",
      "Writing Editor",
      "Customer Support",
      "HR & Recruiting Partner",
      "Finance & Business Analyst",
      "Email & Comms Assistant",
      "Roast Coach",
      "Harsh Comment Simulator",
    ]);
    expect(profiles.map((profile) => profile.id)).not.toContain("image-editor");
  });

  test("uses an empty default profile for unopinionated chats", () => {
    const profile = getProfileTemplate("default");

    expect(profile.name).toBe("Default");
    expect(profile.systemPrompt).toBe("");
    expect(profile.defaultContextPolicy.attachCurrentPageByDefault).toBe(false);
    expect(profile.preferredActions).toEqual([]);
    expect(profile.adapterHints).toEqual([]);
  });

  test("returns a youtube profile with current-page defaults", () => {
    const profile = getProfileTemplate("youtube-summarizer");

    expect(profile.id).toBe("youtube-summarizer");
    expect(profile.defaultContextPolicy.attachCurrentPageByDefault).toBe(true);
    expect(profile.adapterHints).toContain("youtube");
    expect(profile.allowedSources).toContain("open-tabs");
  });

  test("returns professional profiles with focused role instructions", () => {
    const legal = getProfileTemplate("legal-reviewer");
    const teacher = getProfileTemplate("teacher-mode");
    const analyst = getProfileTemplate("strategy-analyst");
    const product = getProfileTemplate("product-manager");
    const support = getProfileTemplate("customer-support");
    const factChecker = getProfileTemplate("fact-checker");
    const roast = getProfileTemplate("roast-coach");
    const harshComments = getProfileTemplate("harsh-comment-simulator");
    const slideMaker = getProfileTemplate("slide-maker");

    expect(legal.systemPrompt).toContain("not a substitute for licensed legal advice");
    expect(teacher.systemPrompt).toContain("Teach in layers");
    expect(analyst.systemPrompt).toContain("Distinguish facts from assumptions and recommendations");
    expect(product.systemPrompt).toContain("Lead with the problem, not the requested feature");
    expect(support.systemPrompt).toContain("FEEL -> FACT -> FIX");
    expect(factChecker.systemPrompt).toContain("discrete checkable claims");
    expect(roast.systemPrompt).toContain("Do not attack immutable identity");
    expect(harshComments.systemPrompt).toContain("purpose is preparation, not harassment");
    expect(slideMaker.systemPrompt).toContain("one slide image at a time");
    expect(slideMaker.systemPrompt).toContain("storyboard before generating visuals");
    expect(slideMaker.systemPrompt).toContain("gpt-image-2 and Nano Banana style");
    expect(slideMaker.systemPrompt).toContain("creative direction matrix");
    expect(slideMaker.systemPrompt).toContain("source-grounded slide spec");
    expect(slideMaker.systemPrompt).toContain("generate the actual presentation slide images sequentially");
    expect(slideMaker.systemPrompt).toContain("infer the deck length from the meaningful source parts or sections");
    expect(slideMaker.systemPrompt).toContain("one representative slide for each distinct part");
    expect(slideMaker.systemPrompt).toContain("Reference images or Input images");
    expect(slideMaker.systemPrompt).toContain("Previous slide prompt summary");
    expect(slideMaker.systemPrompt).toContain("Reference image unavailable");
    expect(slideMaker.systemPrompt).toContain("deck visual system contract");
    expect(slideMaker.systemPrompt).toContain("same palette, typography, grid, spacing, component shapes");
    expect(slideMaker.preferredActions).toContain("create-slide-images");
  });
});
