import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  createAnnotatedImageAttachment,
  createImageAttachmentFromDataUrl,
  getImageAttachmentDataUrl,
  isAnnotatableImageAttachment,
} from "../src/sidepanel/image-annotation.js";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const sidepanelCss = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function readFinalDeclaration(selector: string, property: string): string {
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let value = "";

  while ((match = blockPattern.exec(sidepanelCss))) {
    const selectorList = (match[1] ?? "")
      .split(",")
      .map((item) => item.trim());
    if (!selectorList.includes(selector)) {
      continue;
    }

    const declarations = match[2] ?? "";
    for (const declaration of declarations.split(";")) {
      const [name, ...rawValue] = declaration.split(":");
      if (name?.trim() === property) {
        value = rawValue.join(":").trim();
      }
    }
  }

  return value;
}

describe("image annotation attachments", () => {
  const attachment = {
    id: "file-1",
    name: "mockup.png",
    mimeType: "image/png",
    sizeBytes: 67,
    lastModified: 1,
    base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2XWgAAAAASUVORK5CYII=",
    kind: "image" as const,
  };

  test("detects upload images that can be marked up", () => {
    expect(isAnnotatableImageAttachment(attachment)).toBe(true);
    expect(getImageAttachmentDataUrl(attachment)).toContain("data:image/png;base64,");
  });

  test("replaces an uploaded image with the annotated PNG payload", () => {
    const annotated = createAnnotatedImageAttachment(
      attachment,
      "data:image/png;base64,QUJDRA==",
      123,
    );

    expect(annotated).toMatchObject({
      id: "file-1",
      name: "mockup.annotated.png",
      mimeType: "image/png",
      base64: "QUJDRA==",
      kind: "image",
      lastModified: 123,
    });
    expect(annotated.sizeBytes).toBe(4);
  });

  test("creates an editable attachment from a generated conversation image", () => {
    const generated = createImageAttachmentFromDataUrl({
      id: "generated-1",
      name: "generated.png",
      dataUrl: "data:image/png;base64,QUJDRA==",
      lastModified: 321,
    });

    expect(generated).toMatchObject({
      id: "generated-1",
      name: "generated.png",
      mimeType: "image/png",
      base64: "QUJDRA==",
      kind: "image",
      sizeBytes: 4,
      lastModified: 321,
    });
    expect(isAnnotatableImageAttachment(generated)).toBe(true);
  });

  test("renders zoom controls for large follow-up image editing", () => {
    expect(sidepanelSource).toContain('<header class="image-annotation-topbar">');
    expect(sidepanelSource).toContain('<div class="image-annotation-workspace">');
    expect(sidepanelSource).toContain("data-image-annotation-zoom-in");
    expect(sidepanelSource).toContain("data-image-annotation-zoom-out");
    expect(sidepanelSource).toContain("data-image-annotation-zoom-reset");
    expect(sidepanelSource).toContain("annotationZoom");
    expect(sidepanelSource).toContain("fitAnnotationStage");
  });

  test("supports select-mode panning, selected-layer deletion, and vector rotation handles", () => {
    expect(sidepanelSource).toContain('type AnnotationTool = "select" | "draw" | "arrow" | "text"');
    expect(sidepanelSource).toContain('data-annotation-tool="select"');
    expect(sidepanelSource).toContain("data-image-annotation-delete-selected");
    expect(sidepanelSource).toContain("deleteSelectedAnnotation");
    expect(sidepanelSource).toContain("hitTestRotationHandle");
    expect(sidepanelSource).toContain("rotatingAnnotationId");
    expect(sidepanelSource).toContain("rotateAnnotation");
    expect(sidepanelSource).toContain("renderRotationHandle");
    expect(sidepanelSource).toContain("startPanning");
    expect(sidepanelSource).toContain("viewport.scrollLeft");
  });

  test("keeps follow-up reference images isolated from the main composer attachments", () => {
    expect(sidepanelSource).toContain("imageAnnotationReferenceAttachments");
    expect(sidepanelSource).toContain("ingestImageAnnotationReferenceFiles");
    expect(sidepanelSource).toContain("data-remove-image-annotation-reference-id");
    expect(sidepanelSource).not.toContain('root.querySelector<HTMLInputElement>("#image-annotation-reference-input")?.addEventListener("change", async (event) => {\n    const input = event.currentTarget as HTMLInputElement;\n    if (!input.files?.length) {\n      return;\n    }\n    await ingestSelectedFiles(input.files);');
  });

  test("keeps annotation color swatches visible on light image-edit surfaces", () => {
    expect(readFinalDeclaration(".annotation-color", "background")).toBe("var(--annotation-color)");
    expect(readFinalDeclaration(".annotation-color", "forced-color-adjust")).toBe("none");
    expect(readFinalDeclaration(':root[data-theme="light"] .annotation-color', "border-color")).toBe(
      "rgba(17, 24, 39, 0.32)",
    );
    expect(readFinalDeclaration(':root[data-theme="light"] .annotation-color', "box-shadow")).toContain(
      "rgba(17, 24, 39, 0.04)",
    );
    expect(
      readFinalDeclaration(':root[data-theme="light"] .annotation-color[data-annotation-color="#ffffff"]', "box-shadow"),
    ).toContain("rgba(17, 24, 39, 0.18)");
    expect(readFinalDeclaration(':root[data-theme="light"] .annotation-color.selected', "box-shadow")).toContain(
      "0 0 0 4px #111318",
    );
  });
});
