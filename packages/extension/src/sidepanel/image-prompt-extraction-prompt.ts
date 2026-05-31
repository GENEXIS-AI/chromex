import { getTranslatedUiLocale } from "../ui-language.js";

export interface AdaptiveImagePromptExtractionPromptInput {
  source: "attachment" | "online";
  imageList?: string | undefined;
  imageCount?: number | undefined;
  outputLanguage: string;
  locale?: string | undefined;
}

export function createAdaptiveImagePromptExtractionPrompt(
  input: AdaptiveImagePromptExtractionPromptInput,
): string {
  return getTranslatedUiLocale(input.locale) === "ko"
    ? createKoreanPrompt(input)
    : createEnglishPrompt(input);
}

function createEnglishPrompt(input: AdaptiveImagePromptExtractionPromptInput): string {
  return [
    createEnglishOpening(input),
    "Classify the image type first, then extract only the prompt controls that fit that type: photograph, cinematic still, portrait, product, food, interior, architecture, landscape, macro, fashion, historical/documentary, illustration, poster, infographic, UI, website, slide, social card, logo, text-heavy image, or composite.",
    "Use this prompt spine for the final result: intended use -> core brief -> required elements -> context/environment -> composition/spatial relationships -> lighting/color/material -> constraints/fixed details -> output/format.",
    "For photographs, infer camera/lens feel, focal length/framing, aperture/depth of field, shutter/motion, ISO/grain, color temperature, exposure, time of day, and natural/flash/studio light. Treat camera settings as generative cues, not guaranteed EXIF.",
    "For UI, website, infographic, poster, social card, slide, or text-heavy design, capture layout grid, visual hierarchy, typography, spacing, components, copy treatment, iconography, brand palette, and text treatment.",
    "Do not turn all visible text into prompt text. Include exact text only when it is stable fixed copy that defines the design, such as a public headline, label, slogan, logo wordmark, or navigation item.",
    "Exclude variable text, personal data, data values, timestamps, usernames, account names, IDs, prices, counts, scores, analytics, chart numbers, table cells, message contents, addresses, phone numbers, emails, URLs, private names, or any text that looks contextual, generated, user-specific, or likely to change. Describe those areas structurally instead, such as placeholder metric chips, sample chart labels, blurred profile rows, or generic UI copy.",
    "If the image is data-heavy, preserve the chart/table/dashboard layout, visual hierarchy, and typography style, but do not copy the actual values unless they are clearly fictional design placeholders.",
    "For product, food, fashion, interior, architecture, landscape, macro, cinematic, historical, illustration, or artwork, include the relevant material, surface, styling, scale, era, medium, rendering/film language, and environment cues.",
    "Describe how composition rules are applied, including subject placement, negative space, leading lines, ratio/framing, and foreground/midground/background relationships, instead of only naming golden ratio or grid.",
    "Keep visual variables connected so lighting, palette, material, mood, and subject reinforce the same state-space; do not stack unrelated keywords.",
    "Separate observed facts from inferred style. Do not invent private identities, brands, or unreadable text.",
    "Avoid generic quality boosters such as masterpiece, 8k, ultra detailed unless they are visibly meaningful; use purpose-specific constraints and negative prompts instead.",
    "Do not generate or edit an image unless I explicitly ask for image generation or editing.",
    `Answer in ${input.outputLanguage}.`,
    "At the end, provide a final copy-ready image-generation prompt in a code block. Include negative constraints inside the prompt when useful.",
  ].join("\n");
}

function createKoreanPrompt(input: AdaptiveImagePromptExtractionPromptInput): string {
  return [
    createKoreanOpening(input),
    "이미지 유형을 먼저 판별해줘. 실사 사진, 시네마틱 컷, 인물, 제품, 음식, 인테리어, 건축, 풍경, 매크로, 패션, 과거/다큐, 일러스트, 포스터, 인포그래픽, UI/웹사이트/슬라이드, 소셜 카드, 로고, 텍스트 중심 이미지, 합성 이미지 중 무엇에 가까운지 보고 그 유형에 맞는 항목만 깊게 추출해줘.",
    "최종 프롬프트는 목적/용도 → 핵심 브리프 → 필수 요소 → 맥락/환경 → 구도/공간 관계 → 빛/색/재질 → 제약/금지/고정 → 출력/포맷 흐름으로 재구성해줘.",
    "사진이면 카메라/렌즈 느낌, 초점거리/프레이밍, 조리개/심도, 셔터스피드/움직임, ISO/그레인, 색온도, 노출, 시간대, 자연광/플래시/스튜디오광을 추출해줘. 단, 실제 EXIF 확정값이 아니라 생성용 감각 제어값으로 표현해줘.",
    "UI/웹사이트/인포그래픽/포스터/소셜 카드/슬라이드처럼 디자인 이미지면 레이아웃 그리드, 정보 위계, 타이포그래피, 간격, 컴포넌트, 카피 처리, 아이콘, 브랜드 팔레트, 텍스트 처리 방식을 우선 추출해줘.",
    "화면에 보이는 모든 텍스트를 프롬프트 텍스트로 옮기지 마. 정확한 텍스트는 공개 헤드라인, 라벨, 슬로건, 로고 워드마크, 내비게이션처럼 디자인을 규정하는 안정적인 고정 문구일 때만 포함해줘.",
    "변수성 텍스트, 개인정보, 데이터 값, 타임스탬프, 사용자명, 계정명, ID, 가격, 개수, 점수, 분석 수치, 차트 숫자, 표 셀, 메시지 내용, 주소, 전화번호, 이메일, URL, 개인 이름처럼 맥락 의존적이거나 사용자별이거나 바뀔 가능성이 있는 텍스트는 제외해줘. 대신 placeholder metric chips, sample chart labels, blurred profile rows, generic UI copy처럼 구조적으로 설명해줘.",
    "데이터 중심 이미지라면 차트/표/대시보드의 레이아웃, 정보 위계, 타이포그래피 스타일은 유지하되, 명백한 가상 디자인 placeholder가 아닌 실제 값은 복사하지 마.",
    "제품, 음식, 패션, 인테리어, 건축, 풍경, 매크로, 시네마틱, 과거 이미지, 일러스트, 아트워크라면 재질, 표면, 스타일링, 스케일, 시대감, 매체감, 렌더링/필름 언어, 환경 단서를 해당 유형에 맞게 포함해줘.",
    "황금비나 그리드 같은 말을 단순히 붙이지 말고, 피사체 위치, 여백, 시선 유도선, 비율/프레이밍, 전경/중경/후경 관계가 어떤 방식으로 적용되는지 설명해줘.",
    "조명, 색감, 재질, 무드, 피사체가 서로 같은 상태공간을 강화하도록 연결해줘. 관계없는 키워드를 많이 쌓는 방식은 피해야 해.",
    "관찰된 사실과 추정을 구분해줘. 보이지 않는 개인 신원, 브랜드, 읽히지 않는 텍스트는 지어내지 마.",
    "마스터피스, 8k, ultra detailed 같은 범용 품질 강화어는 피하고, 목적에 맞는 구체적 제약과 제외 프롬프트를 사용해줘.",
    "내가 명시적으로 이미지 생성이나 편집을 요청하지 않는 한 이미지를 생성하거나 편집하지 마.",
    `${input.outputLanguage}로 답해줘.`,
    "마지막에는 바로 복사해서 쓸 수 있는 최종 이미지 생성 프롬프트를 코드블럭 안에 따로 제공해줘. 필요한 경우 제외할 요소도 최종 프롬프트 안에 포함해줘.",
  ].join("\n");
}

function createEnglishOpening(input: AdaptiveImagePromptExtractionPromptInput): string {
  if (input.source === "online") {
    return "Analyze the attached online image and reverse-engineer an image-generation prompt that can recreate this image or produce a similar result.";
  }
  const imageCount = input.imageCount ?? 1;
  const imageList = input.imageList?.trim() || "image";
  return `Analyze the attached image${imageCount > 1 ? "s" : ""} (${imageList}) and extract a reusable image-generation prompt.`;
}

function createKoreanOpening(input: AdaptiveImagePromptExtractionPromptInput): string {
  if (input.source === "online") {
    return "첨부한 온라인 이미지를 분석해서, 이 이미지를 다시 생성하거나 비슷한 결과를 만들 수 있는 이미지 생성 프롬프트를 역추출해줘.";
  }
  const imageCount = input.imageCount ?? 1;
  const imageList = input.imageList?.trim() || "이미지";
  return `첨부한 이미지${imageCount > 1 ? "들" : ""}(${imageList})를 분석해서 재사용 가능한 이미지 생성 프롬프트를 추출해줘.`;
}
