import { describe, expect, test } from "vitest";

import { createImageAttachmentSuggestionCards } from "../src/sidepanel/image-attachment-suggestions.js";
import { getUiStrings } from "../src/sidepanel/i18n.js";

describe("image attachment suggestions", () => {
  test("creates prompt extraction and description cards for attached images", () => {
    const cards = createImageAttachmentSuggestionCards({
      attachments: [
        {
          id: "image-1",
          name: "landing-page.png",
          mimeType: "image/png",
          sizeBytes: 1000,
          lastModified: 1,
          base64: "abc",
          kind: "image",
        },
      ],
      locale: "ko",
    });

    expect(cards.map((card) => card.id)).toEqual([
      "image-attachment-prompt-extract",
      "image-attachment-describe",
    ]);
    expect(cards.map((card) => card.title)).toEqual([
      getUiStrings("ko").actionCards["image-attachment-prompt-extract"],
      getUiStrings("ko").actionCards["image-attachment-describe"],
    ]);
    expect(cards[0]?.prompt).toContain("landing-page.png");
    expect(cards[0]?.prompt).toContain("이미지 생성 프롬프트");
    expect(cards[0]?.prompt).toContain("한국어로 답해줘");
    expect(cards[0]?.prompt).toContain("이미지 유형을 먼저 판별");
    expect(cards[0]?.prompt).toContain("목적/용도 → 핵심 브리프 → 필수 요소 → 맥락/환경 → 구도/공간 관계");
    expect(cards[0]?.prompt).toContain("사진이면 카메라/렌즈");
    expect(cards[0]?.prompt).toContain("UI/웹사이트/인포그래픽/포스터");
    expect(cards[0]?.prompt).toContain("변수성 텍스트");
    expect(cards[0]?.prompt).toContain("개인정보");
    expect(cards[0]?.prompt).toContain("데이터 값");
    expect(cards[0]?.prompt).toContain("마스터피스, 8k, ultra detailed");
    expect(cards[0]?.prompt).not.toContain("reusable image-generation prompt");
    expect(cards[1]?.prompt).toContain("이미지");
    expect(cards[1]?.prompt).toContain("설명해줘");
  });

  test("does not create cards when no image is attached", () => {
    expect(
      createImageAttachmentSuggestionCards({
        attachments: [
          {
            id: "file-1",
            name: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 100,
            lastModified: 1,
            base64: "abc",
            kind: "text",
          },
        ],
        locale: "en",
      }),
    ).toEqual([]);
  });

  test("uses the selected UI language for generated prompts", () => {
    const cards = createImageAttachmentSuggestionCards({
      attachments: [
        {
          id: "image-1",
          name: "screen.png",
          mimeType: "image/png",
          sizeBytes: 1000,
          lastModified: 1,
          base64: "abc",
          kind: "image",
        },
      ],
      locale: "ja",
    });

    expect(cards[0]?.title).toBe(getUiStrings("ja").actionCards["image-attachment-prompt-extract"]);
    expect(cards[0]?.prompt).toContain("screen.png");
    expect(cards[0]?.prompt).toContain("日本語");
    expect(cards[0]?.prompt).toContain("Classify the image type first");
    expect(cards[0]?.prompt).toContain("For photographs, infer camera/lens");
    expect(cards[0]?.prompt).toContain("For UI, website, infographic, poster");
    expect(cards[0]?.prompt).toContain("variable text");
    expect(cards[0]?.prompt).toContain("personal data");
    expect(cards[0]?.prompt).toContain("data values");
    expect(cards[0]?.prompt).not.toMatch(/\{(?:imageList|outputLanguage|pluralSuffix)\}/u);
  });
});
