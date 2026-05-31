import { describe, expect, test } from "vitest";

import {
  buildGoogleWorkspaceExportCandidates,
  collectGoogleWorkspaceAdapterPayload,
  extractGoogleWorkspaceFileId,
  parseCsvPreview,
  parseSlideTextPreview,
} from "../src/adapters/google-workspace.js";

describe("Google Workspace adapter", () => {
  test("extracts document ids and export candidates for Docs, Sheets, and Slides", () => {
    expect(extractGoogleWorkspaceFileId("https://docs.google.com/document/d/doc123/edit")).toBe("doc123");
    expect(extractGoogleWorkspaceFileId("https://docs.google.com/spreadsheets/d/sheet123/edit#gid=42")).toBe("sheet123");
    expect(extractGoogleWorkspaceFileId("https://docs.google.com/presentation/d/slide123/edit#slide=id.p2")).toBe("slide123");

    expect(buildGoogleWorkspaceExportCandidates("google-docs", "doc123")).toContain(
      "https://docs.google.com/document/d/doc123/export?format=txt",
    );
    expect(buildGoogleWorkspaceExportCandidates("google-sheets", "sheet123", { gid: "42" })).toContain(
      "https://docs.google.com/spreadsheets/d/sheet123/export?format=csv&gid=42",
    );
    expect(buildGoogleWorkspaceExportCandidates("google-slides", "slide123")).toContain(
      "https://docs.google.com/presentation/d/slide123/export/txt",
    );
  });

  test("parses sheet CSV into a compact tabular preview", () => {
    const preview = parseCsvPreview("Name,Revenue,Status\nAlpha,1200,Open\nBeta,950,Closed");

    expect(preview.headers).toEqual(["Name", "Revenue", "Status"]);
    expect(preview.rows).toEqual([
      ["Alpha", "1200", "Open"],
      ["Beta", "950", "Closed"],
    ]);
    expect(preview.rowCount).toBe(3);
    expect(preview.columnCount).toBe(3);
  });

  test("parses slide text into slide-level sections", () => {
    const slides = parseSlideTextPreview("Title slide\nOpening point\n\nMetrics\nRevenue up\nCosts down");

    expect(slides).toEqual([
      { slideNumber: 1, title: "Title slide", text: "Title slide\nOpening point" },
      { slideNumber: 2, title: "Metrics", text: "Metrics\nRevenue up\nCosts down" },
    ]);
  });

  test("collects export-backed payload before falling back to DOM text", async () => {
    const exported = await collectGoogleWorkspaceAdapterPayload({
      url: "https://docs.google.com/spreadsheets/d/sheet123/edit#gid=42",
      title: "Q4 metrics - Google Sheets",
      documentText: "Visible canvas only",
      fetchText: async (url) => {
        expect(url).toContain("gid=42");
        return "Metric,Value\nARR,100\nChurn,2%";
      },
    });

    expect(exported).toMatchObject({
      platform: "google-sheets",
      fileId: "sheet123",
      gid: "42",
      extractionSource: "export",
      title: "Q4 metrics",
      tablePreview: {
        headers: ["Metric", "Value"],
        rows: [
          ["ARR", "100"],
          ["Churn", "2%"],
        ],
      },
    });

    const fallback = await collectGoogleWorkspaceAdapterPayload({
      url: "https://docs.google.com/document/d/doc123/edit",
      title: "Launch plan - Google Docs",
      documentText: "Heading\nParagraph from visible editor",
      fetchText: async () => "",
    });

    expect(fallback).toMatchObject({
      platform: "google-docs",
      fileId: "doc123",
      extractionSource: "dom-fallback",
      textPreview: "Heading\nParagraph from visible editor",
    });
  });
});
