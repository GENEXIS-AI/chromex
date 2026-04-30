import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { createOnlineImagePromptExtractionPrompt } from "../src/sidepanel/online-image-prompt.js";

const contentSource = readFileSync(resolve(process.cwd(), "src/content/index.ts"), "utf8");
const normalizedContentSource = contentSource.replace(/\r\n?/gu, "\n");
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");
const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "public/manifest.json"), "utf8")) as {
  content_scripts?: Array<{
    matches?: string[];
    js?: string[];
    run_at?: string;
    all_frames?: boolean;
  }>;
};

function getFunctionSource(source: string, name: string): string {
  const startMatch = new RegExp(`(?:async\\s+)?function\\s+${name}\\b`, "u").exec(source);
  const start = startMatch?.index ?? -1;
  if (start < 0) {
    return "";
  }
  const rest = source.slice(start + 1);
  const nextMatch = /\n(?:async\s+)?function\s+/u.exec(rest);
  return nextMatch ? source.slice(start, start + 1 + nextMatch.index) : source.slice(start);
}

describe("online image prompt extraction", () => {
  test("builds a prompt that asks for a reusable generation prompt from the attached image", () => {
    const prompt = createOnlineImagePromptExtractionPrompt({
      alt: "product launch poster",
      pageTitle: "Launch gallery",
      pageUrl: "https://example.com/gallery",
      responseLanguage: "ko",
    });

    expect(prompt).toContain("첨부한 온라인 이미지를 분석");
    expect(prompt).toContain("이미지 생성 프롬프트");
    expect(prompt).toContain("한국어로 답해줘");
    expect(prompt).toContain("코드블럭");
    expect(prompt).toContain("이미지 유형을 먼저 판별");
    expect(prompt).toContain("목적/용도 → 핵심 브리프 → 필수 요소 → 맥락/환경 → 구도/공간 관계");
    expect(prompt).toContain("사진이면 카메라/렌즈");
    expect(prompt).toContain("UI/웹사이트/인포그래픽/포스터");
    expect(prompt).toContain("변수성 텍스트");
    expect(prompt).toContain("개인정보");
    expect(prompt).toContain("데이터 값");
    expect(prompt).toContain("고정 문구");
    expect(prompt).toContain("텍스트 처리 방식");
    expect(prompt).toContain("마스터피스, 8k, ultra detailed");
    expect(prompt).toContain("관찰된 사실과 추정");
    expect(prompt).toContain("product launch poster");
    expect(prompt).toContain("Launch gallery");
    expect(prompt).toContain("https://example.com/gallery");
    expect(prompt).not.toContain("한 줄짜리");
  });

  test("falls back to English prompt copy for locales without dedicated online-image strings", () => {
    const prompt = createOnlineImagePromptExtractionPrompt({
      alt: "product launch poster",
      pageTitle: "Launch gallery",
      pageUrl: "https://example.com/gallery",
      responseLanguage: "ja",
    });

    expect(prompt).toContain("Analyze the attached online image");
    expect(prompt).toContain("Reference context");
    expect(prompt).toContain("Image description/alt");
    expect(prompt).toContain("Answer in 日本語");
    expect(prompt).toContain("Classify the image type first");
    expect(prompt).toContain("intended use -> core brief -> required elements");
    expect(prompt).toContain("For photographs, infer camera/lens");
    expect(prompt).toContain("For UI, website, infographic, poster");
    expect(prompt).toContain("variable text");
    expect(prompt).toContain("personal data");
    expect(prompt).toContain("data values");
    expect(prompt).toContain("fixed copy");
    expect(prompt).toContain("text treatment");
    expect(prompt).toContain("masterpiece, 8k, ultra detailed");
    expect(prompt).not.toContain("첨부한 온라인 이미지를 분석");
    expect(prompt).not.toContain("참고 맥락");
  });

  test("wires the hover icon click through background into an auto-sent sidepanel prompt", () => {
    expect(contentSource).toContain('message.type === "page.image-prompt-hover.install"');
    expect(contentSource).toContain('type: "page.image-prompt.extract"');
    expect(contentSource).toContain("const imageCandidate = describePageImage(image)");
    expect(contentSource).toContain("chromex-image-prompt-button");
    expect(contentSource).toContain("IMAGE_PROMPT_HOVER_ICON_DATA_URL");
    expect(contentSource).not.toContain('chrome.runtime.getURL("icons/codex-32.png")');
    expect(contentSource).not.toContain('button.textContent = "✦"');
    expect(contentSource).toContain('document.addEventListener("pointerover", handleImagePromptPointerOver, listenerOptions)');
    expect(contentSource).not.toContain('document.addEventListener("pointerout"');
    expect(contentSource).not.toContain('document.addEventListener("pointermove"');
    expect(contentSource).not.toContain('document.addEventListener("mousemove"');
    expect(contentSource).not.toContain('document.addEventListener("mouseover"');
    expect(contentSource).toContain("function handleImagePromptPointerOver");
    expect(contentSource).toContain("function isPointerInsideImagePromptHoverSurface");
    expect(backgroundSource).toContain("function installImagePromptHoverForTab");
    expect(backgroundSource).toContain("void installImagePromptHoverForTab(activeTab).catch(() => undefined)");
    expect(backgroundSource).toContain('case "page.image-prompt-hover.install"');
    expect(backgroundSource).toContain('case "page.image-prompt.extract"');
    expect(backgroundSource).toContain("chrome.sidePanel.open");
    expect(backgroundSource).toContain('pendingImagePromptExtraction');
    expect(sidepanelSource).toContain('message.type === "ui.image-prompt.extract"');
    expect(sidepanelSource).toContain("handleOnlineImagePromptExtraction");
    expect(sidepanelSource).toContain("await startNewChat()");
    expect(sidepanelSource).toContain("createRemoteImageAttachment");
    expect(sidepanelSource).toContain("normalizeOnlineImagePromptAttachment");
    expect(sidepanelSource).toContain("await sendPrompt(prompt)");
  });

  test("loads the hover button content script automatically on normal web pages", () => {
    expect(manifest.content_scripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          matches: ["http://*/*", "https://*/*"],
          js: ["content.js"],
          run_at: "document_idle",
          all_frames: false,
        }),
      ]),
    );
    expect(normalizedContentSource).toContain("\ninstallImagePromptHover();\n");
    expect(manifest.permissions).toContain("offscreen");
  });

  test("removes stale hover buttons from the page instead of leaving hidden DOM behind", () => {
    expect(contentSource).toContain("function removeImagePromptHoverButtons");
    expect(contentSource).toContain("removeImagePromptHoverButtons(button)");
    expect(contentSource).toContain("removeImagePromptHoverButtons(imagePromptHoverButton)");
    expect(contentSource).toContain("button.remove()");
    expect(contentSource).not.toContain('document.addEventListener("pointerleave"');
    expect(contentSource).not.toContain('document.addEventListener("mouseleave"');
    expect(contentSource).toContain('window.addEventListener("blur", handleImagePromptForceHide, listenerOptions)');
  });

  test("keeps repeated hover installation idempotent", () => {
    const installer = getFunctionSource(contentSource, "installImagePromptHover");

    expect(installer).toContain("if (imagePromptHoverInstalled)");
    expect(installer).toContain("removeImagePromptHoverButtons(imagePromptHoverButton)");
    expect(installer).not.toContain("if (imagePromptHoverInstalled) {\n    removeImagePromptHoverButtons();");
  });

  test("pings content scripts before injecting to avoid duplicate hover listeners", () => {
    const messageListener = contentSource.slice(contentSource.indexOf("function chromexRuntimeMessageListener"));
    const ensureContentScript = getFunctionSource(backgroundSource, "ensureContentScript");

    expect(messageListener).toContain('message.type === "page.ping"');
    expect(messageListener).toContain("isActiveContentScriptInstance()");
    expect(ensureContentScript).toContain("hasActiveContentScript(tabId)");
    expect(ensureContentScript.indexOf("hasActiveContentScript(tabId)")).toBeLessThan(
      ensureContentScript.indexOf("chrome.scripting.executeScript"),
    );
    expect(backgroundSource).toContain('chrome.tabs.sendMessage(tabId, { type: "page.ping" })');
  });

  test("surfaces site access requirements when hover injection is blocked on real pages", () => {
    const runtimeCaseStart = backgroundSource.indexOf('case "page.image-prompt-hover.install"');
    const runtimeCase = backgroundSource.slice(
      runtimeCaseStart,
      backgroundSource.indexOf('case "page.image-prompt.extract"', runtimeCaseStart),
    );
    const backgroundInstaller = getFunctionSource(backgroundSource, "installImagePromptHoverForTab");
    const sidepanelInstaller = getFunctionSource(sidepanelSource, "installActiveTabImagePromptExtractor");

    expect(runtimeCase).toContain("sendResponse(await installImagePromptHoverForTab");
    expect(backgroundInstaller).toContain("return { ok: true, installed: false }");
    expect(backgroundInstaller).toContain("await sendMessageToTab");
    expect(backgroundInstaller).toContain("return { ok: true, installed: true }");
    expect(backgroundInstaller).not.toContain(".catch(() => undefined)");
    expect(sidepanelInstaller).toContain("getPermissionRequestForRuntimeResponse(response)");
    expect(sidepanelInstaller).toContain("state.pendingPermission =");
    expect(sidepanelInstaller).not.toContain("await requestPermissionPlan");
    expect(sidepanelSource).toContain("void installActiveTabImagePromptExtractor();");
  });

  test("aborts the previous injected content script instance before registering page listeners", () => {
    const startup = contentSource.slice(0, contentSource.indexOf("async function collectPageProbe"));
    const cleanup = getFunctionSource(contentSource, "cleanupContentScriptInstance");

    expect(contentSource).toContain("CHROMEX_CONTENT_CLEANUP_KEY");
    expect(contentSource).toContain("chromexContentScriptAbortController = new AbortController()");
    expect(startup).toContain("cleanupPreviousContentScriptInstance()");
    expect(startup.indexOf("cleanupPreviousContentScriptInstance()")).toBeLessThan(
      startup.indexOf("registerChromexRuntimeMessageListener()"),
    );
    expect(startup.indexOf("registerChromexRuntimeMessageListener()")).toBeLessThan(
      startup.indexOf("startContentScriptRuntimeWatchdog()"),
    );
    expect(cleanup).toContain("chromexContentScriptAbortController.abort()");
    expect(cleanup).toContain("getSafeChromeRuntime()");
    expect(cleanup).toContain("runtime?.onMessage.removeListener(chromexRuntimeMessageListener)");
    expect(cleanup).toContain("stopContentScriptRuntimeWatchdog()");
  });

  test("guards extension runtime access so invalidated content scripts do not throw from page events", () => {
    const startup = contentSource.slice(0, contentSource.indexOf("function chromexRuntimeMessageListener"));
    const register = getFunctionSource(contentSource, "registerChromexRuntimeMessageListener");
    const runtimeAccessor = getFunctionSource(contentSource, "getSafeChromeRuntime");
    const clickHandler = getFunctionSource(contentSource, "extractPromptFromHoveredImage");

    expect(contentSource).toContain("function getSafeChromeRuntime");
    expect(runtimeAccessor).toContain("try");
    expect(runtimeAccessor).toContain("chrome.runtime?.id");
    expect(runtimeAccessor).toContain("catch");
    expect(startup).not.toContain("chrome.runtime.onMessage.addListener(chromexRuntimeMessageListener)");
    expect(register).toContain("const runtime = getSafeChromeRuntime()");
    expect(register).toContain("runtime.onMessage.addListener(chromexRuntimeMessageListener)");
    expect(clickHandler).toContain("const runtime = getSafeChromeRuntime()");
    expect(clickHandler).toContain("cleanupContentScriptInstance()");
    expect(clickHandler).toContain("await runtime.sendMessage");
    expect(clickHandler).not.toContain("await chrome.runtime.sendMessage");
  });

  test("runs a runtime watchdog outside hover handlers to abort stale listeners after extension reloads", () => {
    const watchdog = getFunctionSource(contentSource, "startContentScriptRuntimeWatchdog");
    const stopper = getFunctionSource(contentSource, "stopContentScriptRuntimeWatchdog");
    const pointerOverHandler = getFunctionSource(contentSource, "handleImagePromptPointerOver");

    expect(contentSource).toContain("let chromexRuntimeWatchdogTimer");
    expect(watchdog).toContain("window.setInterval");
    expect(watchdog).toContain("getSafeChromeRuntime()");
    expect(watchdog).toContain("cleanupContentScriptInstance()");
    expect(stopper).toContain("window.clearInterval");
    expect(pointerOverHandler).not.toContain("getSafeChromeRuntime");
    expect(pointerOverHandler).not.toContain("chrome.runtime");
  });

  test("catches invalidated-context errors inside hover event handlers before Chrome logs them as uncaught", () => {
    const pointerOverHandler = getFunctionSource(contentSource, "handleImagePromptPointerOver");
    const forceHideHandler = getFunctionSource(contentSource, "handleImagePromptForceHide");
    const visibilityHandler = getFunctionSource(contentSource, "handleImagePromptVisibilityChange");
    const eventErrorHandler = getFunctionSource(contentSource, "handleImagePromptEventError");

    expect(pointerOverHandler).toContain("try");
    expect(pointerOverHandler).toContain("handleImagePromptEventError(error)");
    expect(forceHideHandler).toContain("handleImagePromptEventError(error)");
    expect(visibilityHandler).toContain("handleImagePromptEventError(error)");
    expect(eventErrorHandler).toContain("handleImagePromptRuntimeError(error)");
    expect(eventErrorHandler).toContain("throw error");
  });

  test("registers hover lifecycle listeners with an abort signal", () => {
    const installer = getFunctionSource(contentSource, "installImagePromptHover");

    expect(installer).toContain("signal: chromexContentScriptAbortController.signal");
    expect(installer).toContain('document.addEventListener("visibilitychange", handleImagePromptVisibilityChange, listenerOptions)');
    expect(installer).toContain('window.addEventListener("blur", handleImagePromptForceHide, listenerOptions)');
    expect(installer).not.toContain('document.addEventListener("visibilitychange", handleImagePromptVisibilityChange, true)');
  });

  test("lets only the latest injected content script handle image hover events", () => {
    const pointerOverHandler = getFunctionSource(contentSource, "handleImagePromptPointerOver");
    const forceHideHandler = getFunctionSource(contentSource, "handleImagePromptForceHide");
    const visibilityHandler = getFunctionSource(contentSource, "handleImagePromptVisibilityChange");
    const getButton = getFunctionSource(contentSource, "getImagePromptHoverButton");

    expect(contentSource).toContain("CHROMEX_CONTENT_INSTANCE_KEY");
    expect(contentSource).toContain("isActiveContentScriptInstance()");
    expect(pointerOverHandler).toContain("if (!isActiveContentScriptInstance())");
    expect(forceHideHandler).toContain("if (!isActiveContentScriptInstance())");
    expect(visibilityHandler).toContain("if (!isActiveContentScriptInstance())");
    expect(getButton).toContain("if (!isActiveContentScriptInstance())");
  });

  test("keeps DOM hover lifecycle handlers free of extension runtime calls", () => {
    const pointerOverHandler = getFunctionSource(contentSource, "handleImagePromptPointerOver");
    const forceHideHandler = getFunctionSource(contentSource, "handleImagePromptForceHide");
    const visibilityHandler = getFunctionSource(contentSource, "handleImagePromptVisibilityChange");
    const runtimeErrorHandler = getFunctionSource(contentSource, "handleImagePromptRuntimeError");
    const clickHandler = getFunctionSource(contentSource, "extractPromptFromHoveredImage");

    expect(pointerOverHandler).not.toContain("chrome.runtime");
    expect(forceHideHandler).not.toContain("chrome.runtime");
    expect(visibilityHandler).not.toContain("chrome.runtime");
    expect(runtimeErrorHandler).toContain("Extension context invalidated");
    expect(runtimeErrorHandler).toContain("cleanupContentScriptInstance()");
    expect(clickHandler).toContain("try");
    expect(clickHandler).toContain("runtime.sendMessage");
    expect(clickHandler).toContain("handleImagePromptRuntimeError(error)");
  });

  test("keeps the hover button stable while the pointer moves from the image onto the button", () => {
    const pointerOverHandler = getFunctionSource(contentSource, "handleImagePromptPointerOver");

    expect(pointerOverHandler).toContain("isPointerInsideImagePromptHoverSurface");
    expect(pointerOverHandler.indexOf("isPointerInsideImagePromptHoverSurface")).toBeLessThan(
      pointerOverHandler.indexOf("findPromptExtractableImageFromPointerEvent(event)"),
    );
    expect(pointerOverHandler).toContain("hideImagePromptHoverButton();");
  });

  test("does not use pointerout to hide the hover button when the browser retargets over the button", () => {
    const pointerOverHandler = getFunctionSource(contentSource, "handleImagePromptPointerOver");

    expect(contentSource).not.toContain("handleImagePromptPointerOut");
    expect(contentSource).not.toContain("isNodeInsideImagePromptHoverSurface");
    expect(pointerOverHandler).not.toContain("event.relatedTarget");
    expect(pointerOverHandler).toContain("isPointerInsideImagePromptHoverSurface(event.clientX, event.clientY)");
    expect(pointerOverHandler.indexOf("isPointerInsideImagePromptHoverSurface(event.clientX, event.clientY)")).toBeLessThan(
      pointerOverHandler.indexOf("hideImagePromptHoverButton();"),
    );
  });

  test("keeps the hover button positioned during scroll instead of force hiding it", () => {
    const installer = getFunctionSource(contentSource, "installImagePromptHover");
    const scrollHandler = getFunctionSource(contentSource, "handleImagePromptScroll");

    expect(contentSource).toContain("let imagePromptHoverLastPointer");
    expect(installer).toContain('document.addEventListener("scroll", handleImagePromptScroll, listenerOptions)');
    expect(installer).not.toContain('document.addEventListener("scroll", handleImagePromptForceHide');
    expect(scrollHandler).toContain("window.requestAnimationFrame");
    expect(scrollHandler).toContain("refreshImagePromptHoverTargetAtPointer");
    expect(contentSource).toContain("function refreshImagePromptHoverTargetAtPointer");
  });

  test("keeps the hover surface anchored to the last visible image rect", () => {
    const showButton = getFunctionSource(contentSource, "showImagePromptHoverButton");
    const hideButton = getFunctionSource(contentSource, "hideImagePromptHoverButton");
    const surface = getFunctionSource(contentSource, "isPointerInsideImagePromptHoverSurface");

    expect(contentSource).toContain("let imagePromptHoverTargetRect");
    expect(contentSource).not.toContain("imagePromptHoverFrame");
    expect(contentSource).not.toContain("resolveImagePromptHoverFrame");
    expect(showButton).toContain("imagePromptHoverTargetRect = target.anchorRect");
    expect(surface).toContain("isPointInsideRect(imagePromptHoverTargetRect");
    expect(surface).not.toContain("isPointInsideElementRect(imagePromptHoverTarget, clientX, clientY)");
    expect(hideButton).toContain("imagePromptHoverTargetRect = null");
  });

  test("positions the hover button from the visible clipped image area, not the raw img box", () => {
    const anchorResolver = getFunctionSource(contentSource, "resolveImagePromptHoverAnchorRect");
    const clippingHelper = getFunctionSource(contentSource, "isImagePromptClippingElement");
    const insideElement = getFunctionSource(contentSource, "findPromptExtractableImageInsideElement");
    const positioner = getFunctionSource(contentSource, "positionImagePromptHoverButton");

    expect(contentSource).toContain("function resolveImagePromptHoverAnchorRect");
    expect(anchorResolver).toContain("element.getBoundingClientRect()");
    expect(anchorResolver).toContain("window.getComputedStyle(parent)");
    expect(anchorResolver).toContain("isImagePromptClippingElement");
    expect(anchorResolver).toContain("new DOMRect");
    expect(anchorResolver).toContain("clamp(rect.left, 0, window.innerWidth");
    expect(clippingHelper).toContain("overflowX");
    expect(clippingHelper).toContain("overflowY");
    expect(clippingHelper).toContain("hidden");
    expect(clippingHelper).toContain("clip");
    expect(insideElement).toContain("createImagePromptTargetFromElement(element, clientX, clientY)");
    expect(positioner).toContain("rect.left + IMAGE_PROMPT_HOVER_BUTTON_INSET_PX");
    expect(positioner).not.toContain("rect.right - IMAGE_PROMPT_HOVER_BUTTON_SIZE_PX - IMAGE_PROMPT_HOVER_BUTTON_INSET_PX");
    expect(positioner).toContain("rect.top + IMAGE_PROMPT_HOVER_BUTTON_INSET_PX");
  });

  test("fades the hover button in and out instead of abruptly inserting and removing it", () => {
    const getButton = getFunctionSource(contentSource, "getImagePromptHoverButton");
    const showButton = getFunctionSource(contentSource, "showImagePromptHoverButton");
    const hideButton = getFunctionSource(contentSource, "hideImagePromptHoverButton");
    const setVisible = getFunctionSource(contentSource, "setImagePromptHoverButtonVisible");
    const clearTimer = getFunctionSource(contentSource, "clearImagePromptHoverButtonRemoveTimer");

    expect(contentSource).toContain("const IMAGE_PROMPT_HOVER_FADE_MS");
    expect(contentSource).toContain("let imagePromptHoverButtonRemoveTimer");
    expect(getButton).toContain("transition");
    expect(getButton).toContain("opacity: \"0\"");
    expect(getButton).toContain("transform: \"scale(0.94)\"");
    expect(showButton).toContain("clearImagePromptHoverButtonRemoveTimer()");
    expect(showButton).toContain("window.requestAnimationFrame");
    expect(showButton).toContain("setImagePromptHoverButtonVisible(button, true)");
    expect(setVisible).toContain('button.style.opacity = visible ? "1" : "0"');
    expect(setVisible).toContain('button.style.transform = visible ? "scale(1)" : "scale(0.94)"');
    expect(hideButton).toContain("window.setTimeout");
    expect(hideButton).toContain("setImagePromptHoverButtonVisible(button, false)");
    expect(clearTimer).toContain("window.clearTimeout(imagePromptHoverButtonRemoveTimer)");
  });

  test("keeps the hover button stable and directly clickable", () => {
    const installer = getFunctionSource(contentSource, "installImagePromptHover");
    const getButton = getFunctionSource(contentSource, "getImagePromptHoverButton");
    const clickHandler = getFunctionSource(contentSource, "handleImagePromptButtonClick");

    expect(installer).toContain('document.addEventListener("click", handleImagePromptButtonClick, listenerOptions)');
    expect(getButton).toContain('pointerEvents: "auto"');
    expect(getButton).toContain('button.addEventListener("click", handleImagePromptButtonClick');
    expect(clickHandler).toContain("isPointInsideRect(imagePromptHoverButtonRect");
    expect(clickHandler).toContain("event.preventDefault()");
    expect(clickHandler).toContain("event.stopPropagation()");
    expect(clickHandler).toContain("event.stopImmediatePropagation()");
    expect(clickHandler).toContain("void extractPromptFromHoveredImage()");
  });

  test("finds prompt images when pointer events target wrappers or overlay siblings", () => {
    const pointerOverHandler = getFunctionSource(contentSource, "handleImagePromptPointerOver");
    const resolver = getFunctionSource(contentSource, "findPromptExtractableImageFromPointerEvent");
    const candidateCollector = getFunctionSource(contentSource, "collectImagePromptPointerCandidates");
    const elementCollector = getFunctionSource(contentSource, "collectImagePromptCandidateElements");

    expect(pointerOverHandler).toContain("findPromptExtractableImageFromPointerEvent(event)");
    expect(pointerOverHandler).toContain("hideImagePromptHoverButton();");
    expect(contentSource).not.toContain("scheduleImagePromptPointerScan");
    expect(contentSource).not.toContain("requestAnimationFrame(() => {\n    imagePromptHoverPointerFrame");
    expect(resolver).toContain("collectImagePromptPointerCandidates(event)");
    expect(candidateCollector).toContain("event.composedPath()");
    expect(candidateCollector).toContain("document.elementsFromPoint");
    expect(candidateCollector).toContain("document.elementFromPoint");
    expect(resolver).toContain("findPromptExtractableImageInsideElement");
    expect(elementCollector).toContain("current.parentElement");
    expect(elementCollector).toContain("current !== document.body");
  });

  test("finds image prompt targets on social feeds without treating videos as images", () => {
    const insideElement = getFunctionSource(contentSource, "findPromptExtractableImageInsideElement");
    const elementCollector = getFunctionSource(contentSource, "collectImagePromptCandidateElements");
    const elementTarget = getFunctionSource(contentSource, "createImagePromptTargetFromElement");
    const backgroundTarget = getFunctionSource(contentSource, "createImagePromptTargetFromElementBackground");

    expect(contentSource).toContain("type ImagePromptHoverTarget");
    expect(insideElement).toContain("collectImagePromptCandidateElements(candidate, clientX, clientY)");
    expect(insideElement).toContain("createImagePromptTargetFromElement(element, clientX, clientY)");
    expect(contentSource).not.toContain("IMAGE_PROMPT_ROOT_ELEMENT_LIMIT");
    expect(contentSource).not.toContain("document.createTreeWalker");
    expect(elementCollector).toContain("querySelectorAll(\"img, [role='img']\")");
    expect(elementCollector).toContain(".slice(0, 8)");
    expect(elementTarget).not.toContain("HTMLVideoElement");
    expect(contentSource).toContain("createImagePromptTargetFromElementBackground");
    expect(contentSource).not.toContain("createImagePromptTargetFromVideoPoster");
    expect(backgroundTarget).toContain("extractCssImageUrls");
    expect(backgroundTarget).toContain("describeElementImage");
  });

  test("rejects image-looking candidates that belong to video player contexts", () => {
    const imageTarget = getFunctionSource(contentSource, "createImagePromptTargetFromImage");
    const backgroundTarget = getFunctionSource(contentSource, "createImagePromptTargetFromElementBackground");
    const mediaContextGuard = getFunctionSource(contentSource, "isImagePromptVideoContextElement");
    const mediaMarkerGuard = getFunctionSource(contentSource, "hasImagePromptVideoContextMarker");

    expect(imageTarget).toContain("isImagePromptVideoContextElement(image)");
    expect(backgroundTarget).toContain("isImagePromptVideoContextElement(element)");
    expect(mediaContextGuard).toContain('current.querySelector("video")');
    expect(mediaContextGuard).toContain("hasImagePromptVideoContextMarker");
    expect(mediaMarkerGuard).toContain("aria-label");
    expect(mediaMarkerGuard).toContain("data-testid");
    expect(mediaMarkerGuard).toContain("play");
    expect(mediaMarkerGuard).toContain("video");
    expect(mediaMarkerGuard).toContain("동영상");
  });

  test("chooses the largest extractable image inside wrapper targets", () => {
    const insideElement = getFunctionSource(contentSource, "findPromptExtractableImageInsideElement");

    expect(insideElement).toContain("bestTarget");
    expect(insideElement).toContain("bestArea");
    expect(insideElement).toContain("anchorRect.width * anchorRect.height");
  });

  test("uses a single pointer surface instead of hover hide timers", () => {
    const pointerOverHandler = getFunctionSource(contentSource, "handleImagePromptPointerOver");
    const hideButton = getFunctionSource(contentSource, "hideImagePromptHoverButton");

    expect(contentSource).not.toContain("scheduleHideImagePromptHoverButton");
    expect(contentSource).not.toContain("hideImagePromptHoverButtonIfPointerOutsideSurface");
    expect(contentSource).not.toContain("handleImagePromptPointerOut");
    expect(pointerOverHandler).toContain("hideImagePromptHoverButton();");
    expect(hideButton).toContain("imagePromptHoverTarget = null");
  });

  test("opens the side panel before async storage work and avoids extra page context", () => {
    const messageListenerStart = backgroundSource.indexOf("chrome.runtime.onMessage.addListener");
    const fastExtractPath = backgroundSource.indexOf('message.type === "page.image-prompt.extract"', messageListenerStart);
    expect(fastExtractPath).toBeGreaterThanOrEqual(0);
    expect(fastExtractPath).toBeLessThan(backgroundSource.indexOf("await ensureStateLoaded()", messageListenerStart));

    const backgroundHandler = getFunctionSource(backgroundSource, "handlePageImagePromptExtraction");
    expect(backgroundHandler).toContain("sidePanelOpenPromise = chrome.sidePanel.open");
    expect(backgroundHandler.indexOf("sidePanelOpenPromise = chrome.sidePanel.open")).toBeLessThan(
      backgroundHandler.indexOf("createOnlineImagePromptAttachment(extraction, tab)"),
    );
    expect(backgroundHandler).toContain("await chrome.storage.session.set");
    expect(backgroundHandler).toContain("await sidePanelOpenPromise");
    expect(backgroundHandler.indexOf("await sidePanelOpenPromise")).toBeGreaterThan(
      backgroundHandler.indexOf("await chrome.storage.session.set"),
    );

    const clickHandler = getFunctionSource(contentSource, "extractPromptFromHoveredImage");
    expect(clickHandler).toContain('type: "page.image-prompt.extract"');
    expect(clickHandler).toContain("imageUrl,");
    expect(clickHandler).toContain("const imageCandidate = target.candidate");
    expect(clickHandler).toContain("imageCandidate,");
    expect(clickHandler).not.toContain("pageTitle: document.title");
    expect(clickHandler).not.toContain("pageUrl: window.location.href");
    expect(clickHandler).not.toContain("alt: image.alt.trim()");
  });

  test("materializes the hovered image into an actual image attachment for the prompt", () => {
    const backgroundHandler = getFunctionSource(backgroundSource, "handlePageImagePromptExtraction");
    expect(backgroundHandler).toContain("createOnlineImagePromptAttachment(extraction, tab)");
    expect(backgroundHandler).toContain("attachment ? { ...extraction, attachment } : extraction");

    expect(backgroundSource).toContain("function capturePromptVisibleImage");
    expect(backgroundSource).toContain("cropVisibleTabDataUrlToImageCandidate");
    expect(backgroundSource).toContain("base64: input.base64");
    expect(backgroundSource).toContain("sourceUrl: extraction.imageUrl");

    const sidepanelHandler = getFunctionSource(sidepanelSource, "handleOnlineImagePromptExtraction");
    expect(sidepanelHandler).toContain(
      "extraction.attachment ?? (isHttpUrl(extraction.imageUrl) ? createRemoteImageAttachment(extraction.imageUrl) : null)",
    );
    expect(sidepanelHandler.indexOf("state.fileAttachments = [attachment]")).toBeLessThan(
      sidepanelHandler.indexOf("await sendPrompt(prompt)"),
    );
  });

  test("keeps hover extraction available for blob and data image sources", () => {
    const sourceGuard = getFunctionSource(contentSource, "isSupportedImagePromptSource");
    const extractableGuard = getFunctionSource(contentSource, "isPromptExtractableImage");
    const clickHandler = getFunctionSource(contentSource, "extractPromptFromHoveredImage");
    const backgroundNormalizer = getFunctionSource(backgroundSource, "normalizePendingImagePromptExtraction");
    const backgroundAttachment = getFunctionSource(backgroundSource, "createOnlineImagePromptAttachment");
    const sidepanelNormalizer = getFunctionSource(sidepanelSource, "normalizeOnlineImagePromptExtraction");
    const sidepanelHandler = getFunctionSource(sidepanelSource, "handleOnlineImagePromptExtraction");

    expect(sourceGuard).toContain("blob:");
    expect(sourceGuard).toContain("data:image/");
    expect(extractableGuard).toContain("isSupportedImagePromptSource(source)");
    expect(extractableGuard).not.toContain("!/^https?:");
    expect(clickHandler).toContain("createImagePromptAttachmentForHoveredTarget");
    expect(clickHandler).not.toContain("if (!/^https?:");
    expect(backgroundNormalizer).toContain("isSupportedImagePromptSource(imageUrl)");
    expect(backgroundNormalizer).toContain("attachment || imageCandidate || isFetchableImagePromptSource(imageUrl)");
    expect(backgroundAttachment).toContain("isFetchableImagePromptSource(extraction.imageUrl)");
    expect(sidepanelNormalizer).toContain("isSupportedImagePromptSource(imageUrl)");
    expect(sidepanelHandler).toContain(
      "extraction.attachment ?? (isHttpUrl(extraction.imageUrl) ? createRemoteImageAttachment(extraction.imageUrl) : null)",
    );
    expect(sidepanelHandler).toContain("if (!attachment)");
  });

  test("surfaces a visible failure when the hovered image cannot be materialized into an attachment", () => {
    const backgroundHandler = getFunctionSource(backgroundSource, "handlePageImagePromptExtraction");
    const sidepanelMessageHandler = sidepanelSource.slice(
      sidepanelSource.indexOf("chrome.runtime.onMessage.addListener"),
      sidepanelSource.indexOf('if (message.type !== "bridge.event")'),
    );
    const pendingErrorTaker = getFunctionSource(sidepanelSource, "takePendingOnlineImagePromptError");
    const sidepanelHandler = getFunctionSource(sidepanelSource, "handleOnlineImagePromptExtraction");

    expect(backgroundHandler).toContain("pendingImagePromptError");
    expect(backgroundHandler).toContain('type: "ui.image-prompt.error"');
    expect(backgroundHandler).toContain("buildOnlineImagePromptAttachmentError");
    expect(sidepanelMessageHandler).toContain('message.type === "ui.image-prompt.error"');
    expect(sidepanelMessageHandler).toContain("void handleOnlineImagePromptError(message.error)");
    expect(pendingErrorTaker).toContain('type: "image.prompt.error.pending.take"');
    expect(sidepanelHandler).not.toContain("if (!attachment) {\n    return;\n  }");
    expect(sidepanelHandler).toContain("await handleOnlineImagePromptError(");
  });

  test("falls back to an offscreen document crop path when worker canvas APIs are unavailable", () => {
    const cropInput = getFunctionSource(backgroundSource, "cropVisibleTabToImageCandidate");
    const cropDataUrl = getFunctionSource(backgroundSource, "cropVisibleTabDataUrlToImageCandidate");
    const offscreenEnsure = getFunctionSource(backgroundSource, "ensureOffscreenDocumentForImageProcessing");
    const offscreenCrop = getFunctionSource(backgroundSource, "cropVisibleTabDataUrlToImageCandidateViaOffscreenDocument");
    const offscreenSource = readFileSync(resolve(process.cwd(), "src/offscreen/index.ts"), "utf8");

    expect(cropInput).toContain("return cropVisibleTabDataUrlToImageCandidate(dataUrl, candidate);");
    expect(cropDataUrl).toContain("cropVisibleTabDataUrlToImageCandidateViaOffscreenDocument");
    expect(cropDataUrl).toContain("typeof createImageBitmap !== \"function\" || typeof OffscreenCanvas === \"undefined\"");
    expect(offscreenEnsure).toContain("chrome.offscreen");
    expect(offscreenEnsure).toContain(".createDocument({");
    expect(backgroundSource).toContain('const OFFSCREEN_DOCUMENT_PATH = "offscreen.html"');
    expect(backgroundSource).toContain('const OFFSCREEN_IMAGE_CROP_MESSAGE_TYPE = "offscreen.image.crop"');
    expect(offscreenCrop).toContain("type: OFFSCREEN_IMAGE_CROP_MESSAGE_TYPE");
    expect(offscreenSource).toContain('message.type !== "offscreen.image.crop"');
    expect(offscreenSource).toContain("canvas.toBlob");
  });
});
