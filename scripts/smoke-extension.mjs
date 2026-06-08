import { spawn } from "node:child_process";
import { access, cp, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createRequire } from "node:module";
import process from "node:process";

const extensionPath = resolve(process.cwd(), "packages/extension/dist");
const stagedExtensionRoot = await mkdtemp(join(tmpdir(), "codex-sidepanel-extension-"));
const stagedExtensionPath = join(stagedExtensionRoot, "extension");
const userDataDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-smoke-"));
const installBrowserIfMissing = process.env.SMOKE_INSTALL_BROWSER !== "0";

let browserContext;

try {
  await cp(extensionPath, stagedExtensionPath, { recursive: true });
  const sidepanelHtml = await readFile(join(extensionPath, "sidepanel.html"), "utf8");
  const buildInfo = JSON.parse(await readFile(join(extensionPath, "build-info.json"), "utf8"));
  if (
    typeof buildInfo.buildId !== "string" ||
    !buildInfo.buildId ||
    !sidepanelHtml.includes(`sidepanel.css?v=${buildInfo.buildId}`) ||
    !sidepanelHtml.includes(`sidepanel.js?v=${buildInfo.buildId}`)
  ) {
    throw new Error("Smoke test failed: built sidepanel assets are not cache-busted with the current build id.");
  }
  const { chromium } = await loadPlaywright();
  const launchOptions = await detectChromiumLaunchOptions();

  browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.SMOKE_HEADLESS !== "false",
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${stagedExtensionPath}`,
      `--load-extension=${stagedExtensionPath}`,
    ],
    ...launchOptions,
  });

  const serviceWorker = await waitForExtensionServiceWorker(browserContext);

  const extensionId = new URL(serviceWorker.url()).host;
  const microphonePermissionPage = await browserContext.newPage();
  await microphonePermissionPage.goto(`chrome-extension://${extensionId}/mic-permission.html?locale=ko`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  const microphonePermissionUi = await microphonePermissionPage.evaluate(() => ({
    title: document.querySelector("h1")?.textContent ?? "",
    button: document.querySelector("#allow-microphone")?.textContent ?? "",
    status: document.querySelector("#microphone-status")?.textContent ?? "",
  }));
  await microphonePermissionPage.close();
  if (
    !microphonePermissionUi.title.includes("마이크") ||
    !microphonePermissionUi.button.includes("마이크") ||
    !microphonePermissionUi.status.includes("허용")
  ) {
    throw new Error(
      `Smoke test failed: microphone permission helper page did not render (${JSON.stringify(microphonePermissionUi)}).`,
    );
  }

  const page = await browserContext.newPage();
  await page.setViewportSize({ width: 375, height: 780 });
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html?mode=popup&test=1`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await waitForSmokeHarness(page);
  await waitForSmokeComposer(page);

  const emptyHeroIconState = await page.evaluate(() => {
    const icon = document.querySelector(".empty-hero-icon");
    const style = icon ? getComputedStyle(icon) : null;
    return {
      present: Boolean(icon),
      backgroundImage: style?.backgroundImage ?? "",
      opacity: style?.opacity ?? "",
    };
  });
  if (
    !emptyHeroIconState.present ||
    !emptyHeroIconState.backgroundImage.includes("codex-mono-512.png") ||
    Number.parseFloat(emptyHeroIconState.opacity) < 0.7
  ) {
    throw new Error(`Smoke test failed: empty hero does not use the monochrome Chromex icon (${JSON.stringify(emptyHeroIconState)}).`);
  }
  await assertEmptyHeroCentered(page, 375, 780);
  await assertEmptyHeroCentered(page, 760, 780);
  await page.setViewportSize({ width: 375, height: 780 });

  const typingResult = await page.evaluate(() => {
    const harness = window.__CODEX_SIDEPANEL_SMOKE__;
    return typeof harness?.typeIntoComposer === "function" ? harness.typeIntoComposer("hello") : null;
  });
  if (!typingResult || typingResult.value !== "hello" || typingResult.activeId !== "composer") {
    throw new Error(
      `Smoke test failed: composer typing is broken (${JSON.stringify(typingResult)}).`,
    );
  }

  await waitForSmokeComposer(page);
  await page.locator("#composer").click();
  await page.keyboard.type(" world");
  const clickedComposerValue = await page.locator("#composer").inputValue();
  if (clickedComposerValue !== "hello world") {
    throw new Error(`Smoke test failed: clicking the composer did not preserve focus (${clickedComposerValue}).`);
  }

  const preservedFocus = await page.evaluate(() => {
    const harness = window.__CODEX_SIDEPANEL_SMOKE__;
    return typeof harness?.preserveComposerFocusOnRender === "function"
      ? harness.preserveComposerFocusOnRender()
      : null;
  });
  if (!preservedFocus || preservedFocus.activeId !== "composer" || preservedFocus.value !== "hello world") {
    throw new Error(
      `Smoke test failed: composer focus was lost across render (${JSON.stringify(preservedFocus)}).`,
    );
  }

  const mentionPopoverState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.inspectCommandPopoverForTest?.("@") ?? null,
  );
  if (
    !mentionPopoverState ||
    mentionPopoverState.mentionQuery !== "" ||
    mentionPopoverState.tabSuggestionCount < 2 ||
    mentionPopoverState.activeId !== "composer" ||
    mentionPopoverState.composerValue !== "@" ||
    mentionPopoverState.shellOverflow === "hidden"
  ) {
    throw new Error(`Smoke test failed: @ tab picker is broken (${JSON.stringify(mentionPopoverState)}).`);
  }
  await page.locator("[data-tab-mention-id]").first().click();
  const selectedTabMentionState = await page.evaluate(() => ({
    composerValue: document.querySelector("#composer")?.value ?? null,
    selectedTabChips: document.querySelectorAll("[data-remove-tab-id]").length,
    popoverOpen: Boolean(document.querySelector(".tab-mention-popover")),
    selectedRows: document.querySelectorAll(".tab-mention-row.selected").length,
  }));
  if (
    selectedTabMentionState.composerValue !== "@" ||
    selectedTabMentionState.selectedTabChips < 1 ||
    !selectedTabMentionState.popoverOpen ||
    selectedTabMentionState.selectedRows < 1
  ) {
    throw new Error(`Smoke test failed: @ tab selection is broken (${JSON.stringify(selectedTabMentionState)}).`);
  }
  const clickedSecondTab = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("[data-tab-mention-id]")).find(
      (node) => node instanceof HTMLButtonElement && !node.classList.contains("selected"),
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  });
  if (!clickedSecondTab) {
    throw new Error("Smoke test failed: @ tab picker did not expose a second unselected tab.");
  }
  const multiSelectedTabMentionState = await page.evaluate(() => ({
    composerValue: document.querySelector("#composer")?.value ?? null,
    selectedTabChips: document.querySelectorAll("[data-remove-tab-id]").length,
    popoverOpen: Boolean(document.querySelector(".tab-mention-popover")),
    selectedRows: document.querySelectorAll(".tab-mention-row.selected").length,
  }));
  if (
    multiSelectedTabMentionState.composerValue !== "@" ||
    multiSelectedTabMentionState.selectedTabChips < 2 ||
    !multiSelectedTabMentionState.popoverOpen ||
    multiSelectedTabMentionState.selectedRows < 2
  ) {
    throw new Error(
      `Smoke test failed: @ tab picker did not support multi-select (${JSON.stringify(multiSelectedTabMentionState)}).`,
    );
  }
  await page.locator("[data-tab-mention-done]").click();
  const doneTabMentionState = await page.evaluate(() => ({
    composerValue: document.querySelector("#composer")?.value ?? null,
    popoverOpen: Boolean(document.querySelector(".tab-mention-popover")),
    selectedTabChips: document.querySelectorAll("[data-remove-tab-id]").length,
  }));
  if (doneTabMentionState.composerValue !== "" || doneTabMentionState.popoverOpen) {
    throw new Error(`Smoke test failed: @ tab picker done action is broken (${JSON.stringify(doneTabMentionState)}).`);
  }
  if (doneTabMentionState.selectedTabChips > 0) {
    await page.locator("[data-remove-tab-id]").first().click();
  }

  const slashPopoverState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.inspectCommandPopoverForTest?.("/") ?? null,
  );
  if (
    !slashPopoverState ||
    slashPopoverState.slashQuery !== "" ||
    slashPopoverState.slashSuggestionCount < 1 ||
    slashPopoverState.activeId !== "composer" ||
    slashPopoverState.composerValue !== "/" ||
    slashPopoverState.shellOverflow === "hidden"
  ) {
    throw new Error(`Smoke test failed: / command picker is broken (${JSON.stringify(slashPopoverState)}).`);
  }
  const slashSearchState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.inspectCommandPopoverForTest?.("/youtube") ?? null,
  );
  if (
    !slashSearchState ||
    slashSearchState.slashQuery !== "youtube" ||
    slashSearchState.slashSuggestionCount < 1 ||
    !/youtube/i.test(slashSearchState.popoverText) ||
    slashSearchState.composerValue !== "/youtube"
  ) {
    throw new Error(`Smoke test failed: / command search did not filter results (${JSON.stringify(slashSearchState)}).`);
  }
  const slashNoMatchState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.inspectCommandPopoverForTest?.("/definitelynomatch") ?? null,
  );
  if (
    !slashNoMatchState ||
    slashNoMatchState.slashQuery !== "definitelynomatch" ||
    slashNoMatchState.slashSuggestionCount !== 1 ||
    slashNoMatchState.suggestionCount !== 1 ||
    !/create manually|직접 만들기/i.test(slashNoMatchState.popoverText)
  ) {
    throw new Error(`Smoke test failed: / command no-match state did not keep direct profile creation (${JSON.stringify(slashNoMatchState)}).`);
  }
  await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.enableDryRunSubmit?.());
  const slashNoMatchEnterState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.submitWithEnter?.("/definitelynomatch") ?? null,
  );
  if (
    !slashNoMatchEnterState ||
    slashNoMatchEnterState.submissionCount !== 0 ||
    slashNoMatchEnterState.commandPills !== 0 ||
    slashNoMatchEnterState.composerValue !== ""
  ) {
    throw new Error(
      `Smoke test failed: Enter did not apply direct profile creation for an unmatched / command (${JSON.stringify(slashNoMatchEnterState)}).`,
    );
  }
  await page.locator("#cancel-profile-editor").click({ timeout: 2_000 }).catch(() => undefined);
  await page.locator('[data-view="chat"]').click({ timeout: 2_000 }).catch(() => undefined);
  const slashEnterState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.submitWithEnter?.("/research") ?? null,
  );
  if (
    !slashEnterState ||
    slashEnterState.submissionCount !== 0 ||
    slashEnterState.slashOptions !== 0 ||
    slashEnterState.commandPills < 1
  ) {
    throw new Error(`Smoke test failed: Enter submitted instead of accepting / command (${JSON.stringify(slashEnterState)}).`);
  }
  await page.locator("#composer").fill("/");
  await page.waitForSelector('[data-slash-option-id^="profile:"]', { timeout: 2_000 });
  const selectedSlashCommandState = await page.evaluate(() => ({
    slashOptions: Array.from(document.querySelectorAll("[data-slash-option-id]")).map((option) =>
      option.getAttribute("data-slash-option-id"),
    ),
    skillOptions: Array.from(document.querySelectorAll("[data-slash-option-id]")).filter(
      (option) => {
        const optionId = String(option.getAttribute("data-slash-option-id") ?? "");
        return !optionId.startsWith("profile:") && optionId !== "create-profile";
      },
    ).length,
  }));
  if (
    selectedSlashCommandState.slashOptions.length < 1 ||
    selectedSlashCommandState.skillOptions !== 0
  ) {
    throw new Error(`Smoke test failed: / command should list profiles plus direct creation only (${JSON.stringify(selectedSlashCommandState)}).`);
  }

  await page.locator("#composer").fill("/");
  await page.waitForSelector('[data-slash-option-id^="profile:"]', { timeout: 2_000 });
  await page.locator('[data-slash-option-id^="profile:"]').first().click();
  const selectedProfileCommandState = await page.evaluate(() => ({
    composerValue: document.querySelector("#composer")?.value ?? null,
    slashOptions: document.querySelectorAll("[data-slash-option-id]").length,
    commandPills: document.querySelectorAll("[data-composer-command-pill]").length,
    commandKinds: Array.from(document.querySelectorAll("[data-composer-command-pill]")).map((pill) =>
      pill.getAttribute("data-composer-command-kind"),
    ),
    commandLabels: Array.from(document.querySelectorAll("[data-composer-command-pill]")).map((pill) =>
      pill.textContent?.replace(/\s+/g, " ").trim() ?? "",
    ),
    titledPills: document.querySelectorAll("[data-composer-command-pill][title]").length,
    inputRowFlexWrap: getComputedStyle(document.querySelector(".composer-input-row")).flexWrap,
    commandPillStyles: Array.from(document.querySelectorAll("[data-composer-command-pill]")).map((pill) => {
      const style = getComputedStyle(pill);
      const rect = pill.getBoundingClientRect();
      const remove = pill.querySelector("[data-remove-composer-command-pill]");
      const removeRect = remove?.getBoundingClientRect();
      return {
        height: rect.height,
        borderRadius: Number.parseFloat(style.borderTopLeftRadius),
        fontSize: Number.parseFloat(style.fontSize),
        removeRightInset: removeRect ? rect.right - removeRect.right : Number.POSITIVE_INFINITY,
      };
    }),
  }));
  if (
    selectedProfileCommandState.composerValue !== "" ||
    selectedProfileCommandState.slashOptions !== 0 ||
    selectedProfileCommandState.commandPills !== 1 ||
    !selectedProfileCommandState.commandKinds.includes("profile") ||
    selectedProfileCommandState.commandKinds.includes("skill") ||
    selectedProfileCommandState.commandLabels.some((label) => !label) ||
    selectedProfileCommandState.titledPills !== 0 ||
    selectedProfileCommandState.inputRowFlexWrap !== "wrap" ||
    selectedProfileCommandState.commandPillStyles.some(
      (pill) => pill.height > 28 || pill.borderRadius > 10 || pill.fontSize > 13 || pill.removeRightInset < 0 || pill.removeRightInset > 6,
    )
  ) {
    throw new Error(`Smoke test failed: / profile selection did not render a composer pill (${JSON.stringify(selectedProfileCommandState)}).`);
  }
  await page.locator('[data-remove-composer-command-kind="profile"]').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-composer-command-kind="profile"]').length === 0 &&
      document.querySelectorAll("[data-remove-composer-command-pill]").length === 0,
    { timeout: 2_000 },
  ).catch(() => undefined);
  const removedProfilePillState = await page.evaluate(() => ({
    profilePills: document.querySelectorAll('[data-composer-command-kind="profile"]').length,
    skillPills: document.querySelectorAll('[data-composer-command-kind="skill"]').length,
    removeButtons: document.querySelectorAll("[data-remove-composer-command-pill]").length,
  }));
  if (
    removedProfilePillState.profilePills !== 0 ||
    removedProfilePillState.skillPills !== 0 ||
    removedProfilePillState.removeButtons !== 0
  ) {
    throw new Error(`Smoke test failed: profile pill remove did not reset only profile (${JSON.stringify(removedProfilePillState)}).`);
  }

  await page.locator("#composer").fill("");
  await page.keyboard.type("@");
  await page.waitForSelector(".suggestions", { timeout: 2_000 });
  const typedMentionPopoverState = await page.evaluate(() => ({
    value: document.querySelector("#composer")?.value ?? "",
    suggestions: document.querySelectorAll(".suggestions").length,
    shellOverflow: getComputedStyle(document.querySelector(".composer-shell")).overflow,
  }));
  if (
    typedMentionPopoverState.value !== "@" ||
    typedMentionPopoverState.suggestions < 1 ||
    typedMentionPopoverState.shellOverflow === "hidden"
  ) {
    throw new Error(`Smoke test failed: typing @ did not open a visible picker (${JSON.stringify(typedMentionPopoverState)}).`);
  }
  await page.locator(".topbar").click();
  const dismissedMentionPopoverState = await page.evaluate(() => ({
    suggestions: document.querySelectorAll(".suggestions").length,
    tabPopover: Boolean(document.querySelector(".tab-mention-popover")),
  }));
  if (dismissedMentionPopoverState.suggestions !== 0 || dismissedMentionPopoverState.tabPopover) {
    throw new Error(`Smoke test failed: @ picker did not close on outside click (${JSON.stringify(dismissedMentionPopoverState)}).`);
  }

  await page.locator("#composer").fill("");
  await page.keyboard.type("/");
  await page.waitForSelector("[data-slash-option-id]", { timeout: 2_000 });
  const typedSlashPopoverState = await page.evaluate(() => ({
    value: document.querySelector("#composer")?.value ?? "",
    slashOptions: document.querySelectorAll("[data-slash-option-id]").length,
    slashIcons: document.querySelectorAll(".suggestion-icon").length,
    commandPopover: Boolean(document.querySelector(".command-popover")),
    firstSuggestionDisplay: getComputedStyle(document.querySelector("[data-slash-option-id]")).display,
    firstSuggestionColumns: getComputedStyle(document.querySelector("[data-slash-option-id]")).gridTemplateColumns,
    shellOverflow: getComputedStyle(document.querySelector(".composer-shell")).overflow,
  }));
  if (
    typedSlashPopoverState.value !== "/" ||
    typedSlashPopoverState.slashOptions < 1 ||
    typedSlashPopoverState.slashIcons < 1 ||
    !typedSlashPopoverState.commandPopover ||
    typedSlashPopoverState.firstSuggestionDisplay !== "grid" ||
    !typedSlashPopoverState.firstSuggestionColumns.includes("24px") ||
    typedSlashPopoverState.shellOverflow === "hidden"
  ) {
    throw new Error(`Smoke test failed: typing / did not open a visible command picker (${JSON.stringify(typedSlashPopoverState)}).`);
  }
  await page.locator(".topbar").click();
  const dismissedSlashPopoverState = await page.evaluate(() => ({
    slashOptions: document.querySelectorAll("[data-slash-option-id]").length,
    commandPopover: Boolean(document.querySelector(".command-popover")),
  }));
  if (dismissedSlashPopoverState.slashOptions !== 0 || dismissedSlashPopoverState.commandPopover) {
    throw new Error(`Smoke test failed: / picker did not close on outside click (${JSON.stringify(dismissedSlashPopoverState)}).`);
  }

  const activeTabSuggestionState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.simulateActiveTabUpdateForTest?.({
      title: "A useful video - YouTube",
      url: "https://www.youtube.com/watch?v=abc",
      actionCards: [
        {
          id: "youtube-summary-question",
          title: "영상 핵심 요약",
          description: "영상 내용을 요약합니다.",
          kind: "prompt",
          prompt: "__smoke_youtube_summary__",
        },
      ],
    }) ?? null,
  );
  if (
    !activeTabSuggestionState ||
    activeTabSuggestionState.currentTabTitle !== "A useful video - YouTube" ||
    activeTabSuggestionState.actionCardCount !== 1 ||
    activeTabSuggestionState.suggestionCount < 1 ||
    activeTabSuggestionState.currentTabContextChip !== 1 ||
    activeTabSuggestionState.pageContextSuppressed ||
    !activeTabSuggestionState.firstSuggestionTitle
  ) {
    throw new Error(`Smoke test failed: active-tab suggested questions did not render (${JSON.stringify(activeTabSuggestionState)}).`);
  }
  const compactSiteSuggestionState = await page.evaluate(() => ({
    descriptionRows: document.querySelectorAll(".site-suggestion-copy span").length,
    siteIcons: document.querySelectorAll(".site-suggestion-site-icon").length,
    youtubeIcons: document.querySelectorAll(".site-suggestion-site-icon.youtube").length,
    firstSuggestionText: document.querySelector(".site-suggestion")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    questionWhiteSpace: getComputedStyle(document.querySelector(".site-suggestion-copy strong")).whiteSpace,
    questionOverflowWrap: getComputedStyle(document.querySelector(".site-suggestion-copy strong")).overflowWrap,
  }));
  if (
    compactSiteSuggestionState.descriptionRows !== 0 ||
    compactSiteSuggestionState.siteIcons < 1 ||
    compactSiteSuggestionState.youtubeIcons < 1 ||
    !compactSiteSuggestionState.firstSuggestionText ||
    compactSiteSuggestionState.questionWhiteSpace === "nowrap" ||
    !/break-word|anywhere/.test(compactSiteSuggestionState.questionOverflowWrap)
  ) {
    throw new Error(
      `Smoke test failed: site suggestions should be compact question-only rows with a site icon (${JSON.stringify(compactSiteSuggestionState)}).`,
    );
  }

  await page.locator("[data-remove-current-tab-context]").click();
  const removedCurrentTabContextState = await page.evaluate(() => ({
    currentTabContextChip: document.querySelectorAll("[data-remove-current-tab-context]").length,
  }));
  if (removedCurrentTabContextState.currentTabContextChip !== 0) {
    throw new Error(
      `Smoke test failed: current tab context chip was not removable (${JSON.stringify(removedCurrentTabContextState)}).`,
    );
  }
  const changedActiveTabSuggestionState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.simulateActiveTabUpdateForTest?.({
      title: "Another useful page",
      url: "https://example.com/next",
      actionCards: [],
    }) ?? null,
  );
  if (
    !changedActiveTabSuggestionState ||
    changedActiveTabSuggestionState.currentTabContextChip !== 1 ||
    changedActiveTabSuggestionState.pageContextSuppressed
  ) {
    throw new Error(
      `Smoke test failed: current tab context did not restore on tab/page change (${JSON.stringify(changedActiveTabSuggestionState)}).`,
    );
  }

  await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.enableDryRunSubmit?.());
  const enterSubmission = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.submitWithEnter?.("__smoke_enter_submit__") ?? null,
  );
  if (
    !enterSubmission ||
    enterSubmission.submissionCount !== 1 ||
    enterSubmission.lastSubmission !== "__smoke_enter_submit__" ||
    enterSubmission.composerValue !== ""
  ) {
    throw new Error(`Smoke test failed: Enter submit is broken (${JSON.stringify(enterSubmission)}).`);
  }

  const busyComposerState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.setPromptActivityForTest?.(true) ?? null,
  );
  if (
    !busyComposerState?.sendButtonDisabled ||
    busyComposerState.promptActivityRailVisible
  ) {
    throw new Error(
      `Smoke test failed: compact prompt activity state is broken (${JSON.stringify(busyComposerState)}).`,
    );
  }
  const pendingPermissionState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.setPendingPermissionForTest?.() ?? null,
  );
  if (!pendingPermissionState?.hasPrompt || !pendingPermissionState?.hasButton) {
    throw new Error(`Smoke test failed: pending site permission CTA did not render (${JSON.stringify(pendingPermissionState)}).`);
  }
  await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.enableDryRunSubmit?.());
  const blockedSubmission = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.submitWithEnter?.("__smoke_blocked_while_responding__") ?? null,
  );
  if (
    !blockedSubmission ||
    blockedSubmission.submissionCount !== 0 ||
    blockedSubmission.lastSubmission !== null ||
    blockedSubmission.composerValue !== "__smoke_blocked_while_responding__"
  ) {
    throw new Error(`Smoke test failed: Enter submitted while responding (${JSON.stringify(blockedSubmission)}).`);
  }
  await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.setPromptActivityForTest?.(false));
  const activeTurnButtonState = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.setActiveTurnForTest?.(true) ?? null,
  );
  if (
    !activeTurnButtonState ||
    activeTurnButtonState.sendButtonVisible ||
    !activeTurnButtonState.stopButtonVisible ||
    !activeTurnButtonState.stopButtonInSubmitSlot ||
    !activeTurnButtonState.stopButtonHasSquareIcon ||
    activeTurnButtonState.chatSignalsVisible
  ) {
    throw new Error(
      `Smoke test failed: active turn did not replace the send button with an inline-only stop icon (${JSON.stringify(activeTurnButtonState)}).`,
    );
  }
  await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.setActiveTurnForTest?.(false));

  const chipLabels = await page.evaluate((files) => window.__CODEX_SIDEPANEL_SMOKE__?.injectFiles(files) ?? [], [
    {
      name: "brief.txt",
      mimeType: "text/plain",
      base64: Buffer.from("alpha\nbeta\ngamma\n", "utf8").toString("base64"),
    },
    {
      name: "pixel.png",
      mimeType: "image/png",
      base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2XWgAAAAASUVORK5CYII=",
    },
  ]);

  const composerPlaceholder = await page.locator("#composer").getAttribute("placeholder");

  if (!chipLabels.some((label) => label.includes("brief.txt"))) {
    throw new Error("Smoke test failed: text attachment chip did not render.");
  }
  if (!chipLabels.some((label) => label.includes("pixel.png"))) {
    throw new Error("Smoke test failed: image attachment chip did not render.");
  }
  if (!composerPlaceholder) {
    throw new Error("Smoke test failed: composer placeholder is missing.");
  }
  await page.waitForSelector("[data-composer-file-group]", { timeout: 2_000 });
  const composerAttachmentLayout = await page.evaluate(() => {
    const composer = document.querySelector("#composer");
    const style = composer ? getComputedStyle(composer) : null;
    return {
      contextGroups: document.querySelectorAll("[data-composer-context-group]").length,
      fileGroups: document.querySelectorAll("[data-composer-file-group]").length,
      fileInsideContextGroup: Boolean(document.querySelector("[data-composer-context-group] .file-chip")),
      tabInsideFileGroup: Boolean(document.querySelector("[data-composer-file-group] .tab-reference-chip")),
      textareaFontSize: style?.fontSize ?? "",
      textareaMinHeight: style?.minHeight ?? "",
    };
  });
  if (
    composerAttachmentLayout.contextGroups < 1 ||
    composerAttachmentLayout.fileGroups !== 1 ||
    composerAttachmentLayout.fileInsideContextGroup ||
    composerAttachmentLayout.tabInsideFileGroup ||
    Number.parseFloat(composerAttachmentLayout.textareaFontSize) > 15 ||
    Number.parseFloat(composerAttachmentLayout.textareaMinHeight) > 52
  ) {
    throw new Error(`Smoke test failed: composer attachments are not visually separated (${JSON.stringify(composerAttachmentLayout)}).`);
  }
  const topNavigationState = await page.evaluate(() => ({
    appMenu: Boolean(document.querySelector("#app-menu-toggle")),
    viewTabs: document.querySelectorAll(".view-tabs").length,
  }));
  if (!topNavigationState.appMenu || topNavigationState.viewTabs !== 0) {
    throw new Error(`Smoke test failed: top navigation did not collapse into the app menu (${JSON.stringify(topNavigationState)}).`);
  }

  await page.locator("[data-edit-file-image-id]").first().click();
  await page.locator(".image-annotation-backdrop").waitFor({ timeout: 5_000 });
  const annotationState = await page.evaluate(() => ({
    modal: Boolean(document.querySelector(".image-annotation-backdrop")),
    canvas: Boolean(document.querySelector("#annotation-canvas")),
    colors: document.querySelectorAll("[data-annotation-color]").length,
    tools: document.querySelectorAll("[data-annotation-tool]").length,
    done: Boolean(document.querySelector("[data-image-annotation-done]")),
  }));
  if (
    !annotationState.modal ||
    !annotationState.canvas ||
    annotationState.colors < 5 ||
    annotationState.tools < 3 ||
    !annotationState.done
  ) {
    throw new Error(`Smoke test failed: image annotation editor did not render (${JSON.stringify(annotationState)}).`);
  }
  const movableAnnotationState = await page.evaluate(async () => {
    const canvas = document.querySelector("#annotation-canvas");
    if (!canvas) {
      return null;
    }
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const dispatch = (type, xRatio, yRatio, pointerId) => {
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId,
          clientX: rect.left + rect.width * xRatio,
          clientY: rect.top + rect.height * yRatio,
        }),
      );
    };
    const moveSelected = (fromX, fromY, toX, toY, pointerId) => {
      dispatch("pointerdown", fromX, fromY, pointerId);
      dispatch("pointermove", toX, toY, pointerId);
      dispatch("pointerup", toX, toY, pointerId);
    };

    document.querySelector('[data-annotation-tool="text"]')?.click();
    await waitFrame();
    dispatch("pointerdown", 0.34, 0.34, 71);
    await waitFrame();
    const annotationTextInput = document.querySelector("#annotation-text-input");
    annotationTextInput.value = "Move me";
    annotationTextInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("[data-annotation-text-popover]")?.requestSubmit();
    await waitFrame();
    const textBefore = canvas.dataset.selectedAnnotationPosition ?? "";
    const textType = canvas.dataset.selectedAnnotationType ?? "";
    moveSelected(0.34, 0.34, 0.52, 0.48, 72);
    await waitFrame();
    const textAfter = canvas.dataset.selectedAnnotationPosition ?? "";

    document.querySelector("[data-image-annotation-clear]")?.click();
    await waitFrame();
    document.querySelector('[data-annotation-tool="arrow"]')?.click();
    await waitFrame();
    dispatch("pointerdown", 0.18, 0.72, 81);
    dispatch("pointermove", 0.48, 0.58, 81);
    dispatch("pointerup", 0.48, 0.58, 81);
    await waitFrame();
    const arrowBefore = canvas.dataset.selectedAnnotationPosition ?? "";
    const arrowType = canvas.dataset.selectedAnnotationType ?? "";
    moveSelected(0.32, 0.65, 0.56, 0.42, 82);
    await waitFrame();
    const arrowAfter = canvas.dataset.selectedAnnotationPosition ?? "";

    return {
      textType,
      textBefore,
      textAfter,
      arrowType,
      arrowBefore,
      arrowAfter,
    };
  });
  if (
    !movableAnnotationState ||
    movableAnnotationState.textType !== "text" ||
    !movableAnnotationState.textBefore ||
    movableAnnotationState.textBefore === movableAnnotationState.textAfter ||
    movableAnnotationState.arrowType !== "arrow" ||
    !movableAnnotationState.arrowBefore ||
    movableAnnotationState.arrowBefore === movableAnnotationState.arrowAfter
  ) {
    throw new Error(`Smoke test failed: text and arrow annotations are not movable (${JSON.stringify(movableAnnotationState)}).`);
  }
  await page.locator("[data-image-annotation-done]").click();
  const annotatedSnapshot = await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.snapshot() ?? null);
  if (!annotatedSnapshot?.fileChipLabels?.some((label) => label.includes("pixel.annotated.png"))) {
    throw new Error(`Smoke test failed: annotated image did not replace attachment (${JSON.stringify(annotatedSnapshot)}).`);
  }

  await page.locator("#app-menu-toggle").click();
  const appMenuState = await page.evaluate(() => ({
    menu: Boolean(document.querySelector(".app-menu")),
    skillsItem: Boolean(document.querySelector('[data-menu-view="skills"]')),
    pluginsItem: Boolean(document.querySelector('[data-menu-view="plugins"]')),
    settingsItem: Boolean(document.querySelector('[data-menu-view="workspace"]')),
  }));
  if (!appMenuState.menu || !appMenuState.skillsItem || !appMenuState.pluginsItem || !appMenuState.settingsItem) {
    throw new Error(`Smoke test failed: app menu destinations did not render (${JSON.stringify(appMenuState)}).`);
  }
  await page.locator(".composer-frame").click();
  const dismissedAppMenuState = await page.evaluate(() => ({
    menu: Boolean(document.querySelector(".app-menu")),
  }));
  if (dismissedAppMenuState.menu) {
    throw new Error(`Smoke test failed: app menu did not close on outside click (${JSON.stringify(dismissedAppMenuState)}).`);
  }
  const composerControls = await page.evaluate(() => ({
    modelMenuTrigger: Boolean(document.querySelector("#composer-model-menu-trigger")),
    nativeModelSelect: Boolean(document.querySelector("#composer-model-select")),
    nativeReasoningSelect: Boolean(document.querySelector("#composer-reasoning-select")),
    permissionPill: Boolean(document.querySelector("#composer-permission-pill")),
    shieldIcon: Boolean(document.querySelector(".composer-shield-icon")),
    modelReasoningGroup: Boolean(document.querySelector(".composer-model-reasoning-group")),
    microphone: Boolean(document.querySelector("#voice-input-toggle")),
    sendButton: Boolean(document.querySelector("#send-prompt")),
    liveButton: Boolean(document.querySelector("#live-toggle")),
  }));
  if (
    !composerControls.modelMenuTrigger ||
    composerControls.nativeModelSelect ||
    composerControls.nativeReasoningSelect ||
    composerControls.permissionPill ||
    composerControls.shieldIcon ||
    !composerControls.modelReasoningGroup ||
    (!composerControls.sendButton && !composerControls.liveButton)
  ) {
    throw new Error(`Smoke test failed: composer control bar is incomplete (${JSON.stringify(composerControls)}).`);
  }
  await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.setModelCatalogForTest?.({
      selectedModel: "gpt-5.4",
      models: [
        {
          id: "gpt-5.4",
          label: "GPT-5.4",
          description: "Flagship",
          isDefault: true,
          supportsImages: true,
          reasoningEfforts: ["low", "medium", "high", "xhigh"],
          defaultReasoningEffort: "medium",
          reasoningEffortOptions: [
            { effort: "low", description: "Fast responses with lighter reasoning" },
            { effort: "medium", description: "Balanced reasoning" },
            { effort: "high", description: "Greater reasoning depth" },
            { effort: "xhigh", description: "Extra high reasoning depth" },
          ],
          additionalSpeedTiers: ["fast"],
        },
      ],
    }),
  );
  await page.locator("#composer-model-menu-trigger").click();
  const composerModelMenu = await page.evaluate(() => ({
    menu: Boolean(document.querySelector(".composer-model-dropdown")),
    reasoningOptions: document.querySelectorAll("[data-composer-reasoning-option]").length,
    serviceTierOptions: document.querySelectorAll("[data-composer-service-tier]").length,
    modelRows: document.querySelectorAll("[data-composer-model-row]").length,
    modelMenuIcons: document.querySelectorAll("[data-composer-model-row] .composer-model-menu-icon").length,
    modelDescription: document.querySelector("[data-composer-model-row] .composer-model-menu-copy span")?.textContent ?? "",
    triggerFlashVisible: Boolean(document.querySelector("#composer-model-menu-trigger .composer-model-flash")),
    triggerCaretSvg: Boolean(document.querySelector("#composer-model-menu-trigger .composer-select-caret svg")),
    triggerLabel: document.querySelector(".composer-model-trigger-label")?.textContent?.trim() ?? "",
    triggerFontSize: getComputedStyle(document.querySelector("#composer-model-menu-trigger")).fontSize,
    triggerBorderWidth: getComputedStyle(document.querySelector("#composer-model-menu-trigger")).borderTopWidth,
    triggerBackground: getComputedStyle(document.querySelector("#composer-model-menu-trigger")).backgroundColor,
    groupBorderWidth: getComputedStyle(document.querySelector(".composer-model-reasoning-group")).borderTopWidth,
    groupBackground: getComputedStyle(document.querySelector(".composer-model-reasoning-group")).backgroundColor,
    modelRowTitleFontSize: getComputedStyle(document.querySelector("[data-composer-model-row] strong")).fontSize,
    speedIconRows: document.querySelectorAll("[data-composer-service-tier='fast'] .composer-model-menu-speed-icon svg").length,
    attachButtonFontSize: getComputedStyle(document.querySelector("#attach-files")).fontSize,
    attachButtonWidth: getComputedStyle(document.querySelector("#attach-files")).width,
    primaryActionWidth: getComputedStyle(document.querySelector("#send-prompt, #live-toggle")).width,
    checkedItems: document.querySelectorAll(".composer-model-menu-check").length,
    expanded: document.querySelector("#composer-model-menu-trigger")?.getAttribute("aria-expanded"),
  }));
  if (
    !composerModelMenu.menu ||
    composerModelMenu.reasoningOptions < 4 ||
    composerModelMenu.serviceTierOptions !== 2 ||
    composerModelMenu.modelRows < 1 ||
    composerModelMenu.modelMenuIcons !== 0 ||
    composerModelMenu.modelDescription !== "Flagship" ||
    !composerModelMenu.triggerFlashVisible ||
    !composerModelMenu.triggerCaretSvg ||
    composerModelMenu.triggerLabel !== "5.4" ||
    Number.parseFloat(composerModelMenu.triggerFontSize) > 13 ||
    composerModelMenu.triggerBorderWidth !== "0px" ||
    composerModelMenu.groupBorderWidth !== "0px" ||
    !isAcceptableModelTriggerBackground(composerModelMenu.triggerBackground) ||
    !/rgba\(0,\s*0,\s*0,\s*0\)/.test(composerModelMenu.groupBackground) ||
    composerModelMenu.speedIconRows !== 1 ||
    Number.parseFloat(composerModelMenu.modelRowTitleFontSize) > 14 ||
    Number.parseFloat(composerModelMenu.attachButtonFontSize) > 24 ||
    Number.parseFloat(composerModelMenu.attachButtonWidth) > 34 ||
    Number.parseFloat(composerModelMenu.primaryActionWidth) > 40 ||
    composerModelMenu.checkedItems < 1 ||
    composerModelMenu.expanded !== "true"
  ) {
    throw new Error(`Smoke test failed: composer model dropdown did not render (${JSON.stringify(composerModelMenu)}).`);
  }
  await assertComposerControlsInsideFrame(page, "composer with model menu open");
  await page.locator(".topbar").click();
  const dismissedModelMenuState = await page.evaluate(() => ({
    menu: Boolean(document.querySelector(".composer-model-dropdown")),
    expanded: document.querySelector("#composer-model-menu-trigger")?.getAttribute("aria-expanded"),
  }));
  if (dismissedModelMenuState.menu || dismissedModelMenuState.expanded !== "false") {
    throw new Error(`Smoke test failed: composer model dropdown did not close on outside click (${JSON.stringify(dismissedModelMenuState)}).`);
  }
  await page.locator("#composer-model-menu-trigger").click();
  await page.locator('[data-composer-service-tier="fast"]').click();
  const serviceTierMenuCount = await page.locator(".composer-model-dropdown").count();
  const speedChipState = await page.evaluate(() => ({
    flashVisible: Boolean(document.querySelector("#composer-model-menu-trigger .composer-model-flash")),
    flashSvgVisible: Boolean(document.querySelector("#composer-model-menu-trigger .composer-model-flash svg")),
    speedLabelVisible: Boolean(document.querySelector(".composer-model-trigger-speed")),
  }));
  if (!speedChipState.flashVisible || !speedChipState.flashSvgVisible || speedChipState.speedLabelVisible) {
    throw new Error(`Smoke test failed: speed tier was not reflected in the model chip (${JSON.stringify(speedChipState)}).`);
  }
  void serviceTierMenuCount;
  await page
    .waitForFunction(
      () => document.querySelector("#composer-model-menu-trigger")?.getAttribute("aria-expanded") === "false",
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  if ((await page.locator("#composer-model-menu-trigger").getAttribute("aria-expanded")) === "true") {
    await page.locator(".topbar").click();
  }
  await page.locator("#composer-model-menu-trigger").click();
  await page.waitForSelector("[data-composer-reasoning-option]", { timeout: 5_000 });
  await page.locator("[data-composer-reasoning-option]").first().click();
  await page
    .waitForFunction(() => !document.querySelector(".composer-model-dropdown"), undefined, { timeout: 5_000 })
    .catch(() => undefined);
  const composerModelMenuClosed = await page.locator(".composer-model-dropdown").count();
  if (composerModelMenuClosed !== 0) {
    throw new Error("Smoke test failed: composer model dropdown did not close after selecting reasoning.");
  }
  await assertNoHorizontalOverflow(page, "composer");
  await assertComposerControlsInsideFrame(page, "composer");
  await page.setViewportSize({ width: 320, height: 700 });
  await assertNoHorizontalOverflow(page, "compact composer");
  await assertComposerControlsInsideFrame(page, "compact composer");
  await page.setViewportSize({ width: 375, height: 780 });

  await page.locator("#app-menu-toggle").click();
  await page.locator('[data-menu-view="workspace"]').click();
  const settingsControls = await page.evaluate(() => ({
    settingsCards: document.querySelectorAll(".settings-card").length,
    navItems: document.querySelectorAll(".settings-nav-item").length,
    backButton: Boolean(document.querySelector(".settings-back")),
    profileSelect: Boolean(document.querySelector("#profile-select")),
    createProfile: Boolean(document.querySelector("#create-profile")),
    modelSelect: Boolean(document.querySelector("#model-select")),
    browserActionsSwitch: Boolean(document.querySelector("#setting-browser-actions")),
    voiceSwitch: Boolean(document.querySelector("#setting-live-captions")),
    voiceOptions: Array.from(document.querySelectorAll("#voice-select option")).map((option) => option.value),
    voiceSelectPresent: Boolean(document.querySelector("#voice-select")),
    generatedImages: Boolean(document.querySelector("#refresh-image-folder")) && Boolean(document.querySelector("#open-image-folder")),
    workspaceRulesVisible: Array.from(document.querySelectorAll(".settings-row")).some((row) =>
      /Workspace rules|워크스페이스 규칙/i.test(row.textContent ?? ""),
    ),
    advancedVisible: Array.from(document.querySelectorAll(".settings-card")).some((card) =>
      /Advanced|고급|workspace harness|워크스페이스 하네스/i.test(card.textContent ?? ""),
    ),
  }));
  if (
    settingsControls.settingsCards !== 3 ||
    settingsControls.navItems !== 0 ||
    !settingsControls.backButton ||
    !settingsControls.profileSelect ||
    !settingsControls.createProfile ||
    settingsControls.modelSelect ||
    settingsControls.browserActionsSwitch ||
    !settingsControls.voiceSwitch ||
    (settingsControls.voiceSelectPresent && !settingsControls.voiceOptions.includes("sage")) ||
    settingsControls.voiceOptions.some((value) => /samantha|google|microsoft/i.test(value)) ||
    !settingsControls.generatedImages ||
    settingsControls.workspaceRulesVisible ||
    settingsControls.advancedVisible
  ) {
    throw new Error(`Smoke test failed: settings panel is incomplete (${JSON.stringify(settingsControls)}).`);
  }
  await page.locator("#create-profile").click();
  await page.locator("#profile-editor-name").fill("Smoke Profile");
  await page.locator("#profile-editor-prompt").fill("Answer smoke prompts directly.");
  await page.locator("#save-profile-editor").click();
  await page.waitForFunction(
    () => {
      const label = document.querySelector('[data-settings-select-root="profile-select"] .settings-select-value');
      return label?.textContent === "Smoke Profile";
    },
    undefined,
    { timeout: 5_000 },
  );
  const createdProfileState = await page.evaluate(() => {
    const label = document.querySelector('[data-settings-select-root="profile-select"] .settings-select-value');
    return {
      selectedLabel: label?.textContent ?? "",
      hasSmokeProfile: label?.textContent === "Smoke Profile",
    };
  });
  if (
    createdProfileState.selectedLabel !== "Smoke Profile" ||
    !createdProfileState.hasSmokeProfile
  ) {
    throw new Error(`Smoke test failed: custom profile creation did not update the selector (${JSON.stringify(createdProfileState)}).`);
  }
  await assertNoHorizontalOverflow(page, "settings");

  const chatFixture = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.seedChatFixture?.({
      messages: [
        {
          id: "empty-assistant-fixture",
          role: "assistant",
          text: "",
        },
        ...Array.from({ length: 18 }, (_, index) => ({
          id: `message-${index}`,
          role: index % 4 === 0 ? "user" : "assistant",
          text:
            index % 4 === 0
              ? `질문 ${index + 1}`
              : `응답 ${index + 1}\n\n- 1:23 항목 A\n- 항목 B\n\n${index === 1 ? "https://example.com/" + "a".repeat(240) : ""}\n\n\`\`\`ts\nconst step = "${"x".repeat(index === 5 ? 260 : 12)}";\n\`\`\``,
        })),
        {
          id: "generated-image-fixture",
          role: "assistant",
          text: "이미지 결과",
          images: [
            {
              src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2XWgAAAAASUVORK5CYII=",
              alt: "Generated image",
              status: "ready",
            },
            {
              src: "",
              alt: "Pending generated image",
              assetRef: "codex-asset:smoke",
              status: "loading",
            },
          ],
        },
      ],
      actionCards: [
        {
          id: "youtube-summary-question",
          title: "요약",
          description: "현재 페이지를 요약합니다.",
          kind: "prompt",
          prompt: "__smoke_action_card_prompt__",
        },
      ],
    }) ?? null,
  );
  if (!chatFixture || chatFixture.activeView !== "chat" || chatFixture.messageCount !== 20) {
    throw new Error(`Smoke test failed: seeding chat fixture failed (${JSON.stringify(chatFixture)}).`);
  }

  const imageRenderState = await page.evaluate(() => ({
    readyImages: document.querySelectorAll(".message-image-frame img").length,
    pendingImages: document.querySelectorAll(".message-image-frame.pending.loading").length,
    imageOpenButtons: document.querySelectorAll("[data-image-open]").length,
    renderedMessages: document.querySelectorAll(".message-stream > .message-row").length,
  }));
  if (
    imageRenderState.readyImages < 1 ||
    imageRenderState.pendingImages < 1 ||
    imageRenderState.imageOpenButtons < 1 ||
    imageRenderState.renderedMessages !== 19
  ) {
    throw new Error(`Smoke test failed: generated image previews did not render (${JSON.stringify(imageRenderState)}).`);
  }
  const idleMessageActionState = await page.evaluate(() => ({
    copyButtons: document.querySelectorAll("[data-message-copy]").length,
    regenerateButtons: document.querySelectorAll("[data-message-regenerate]").length,
  }));
  if (idleMessageActionState.copyButtons < 1 || idleMessageActionState.regenerateButtons < 1) {
    throw new Error(`Smoke test failed: completed assistant messages did not expose actions (${JSON.stringify(idleMessageActionState)}).`);
  }
  const busyMessageActionState = await page.evaluate(() => {
    window.__CODEX_SIDEPANEL_SMOKE__?.setPromptActivityForTest?.(true);
    return {
      copyButtons: document.querySelectorAll(".message-actions.assistant [data-message-copy]").length,
      regenerateButtons: document.querySelectorAll(".message-actions.assistant [data-message-regenerate]").length,
    };
  });
  if (busyMessageActionState.copyButtons !== 0 || busyMessageActionState.regenerateButtons !== 0) {
    throw new Error(`Smoke test failed: assistant message actions remained visible during response (${JSON.stringify(busyMessageActionState)}).`);
  }
  await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.setPromptActivityForTest?.(false));
  const layoutBeforeCopyToast = await page.evaluate(() => ({
    shellHeight: document.querySelector(".shell")?.getBoundingClientRect().height ?? 0,
    mainTop: document.querySelector(".main-stage")?.getBoundingClientRect().top ?? 0,
    mainHeight: document.querySelector(".main-stage")?.getBoundingClientRect().height ?? 0,
  }));
  await page.locator("[data-message-copy]").first().click();
  await page.waitForFunction(
    () => Boolean(document.querySelector("[data-message-copy].copied .message-action-check")),
    undefined,
    { timeout: 2_000 },
  );
  const copyFeedbackState = await page.evaluate(() => {
    return {
      inlineStatusBanners: document.querySelectorAll(".shell > .status-banner").length,
      floatingToasts: document.querySelectorAll(".notification-toast.status-banner").length,
      copiedButtons: document.querySelectorAll("[data-message-copy].copied .message-action-check").length,
      shellHeight: document.querySelector(".shell")?.getBoundingClientRect().height ?? 0,
      mainTop: document.querySelector(".main-stage")?.getBoundingClientRect().top ?? 0,
      mainHeight: document.querySelector(".main-stage")?.getBoundingClientRect().height ?? 0,
    };
  });
  if (
    copyFeedbackState.inlineStatusBanners !== 0 ||
    copyFeedbackState.floatingToasts !== 0 ||
    copyFeedbackState.copiedButtons !== 1 ||
    Math.abs(copyFeedbackState.shellHeight - layoutBeforeCopyToast.shellHeight) > 1 ||
    Math.abs(copyFeedbackState.mainTop - layoutBeforeCopyToast.mainTop) > 1 ||
    Math.abs(copyFeedbackState.mainHeight - layoutBeforeCopyToast.mainHeight) > 1
  ) {
    throw new Error(
      `Smoke test failed: copy feedback caused a layout shift or did not use the inline check state (${JSON.stringify({
        layoutBeforeCopyToast,
        copyFeedbackState,
      })}).`,
    );
  }
  await page.waitForFunction(() => !document.querySelector("[data-message-copy].copied"), undefined, { timeout: 4_000 });
  await assertNoHorizontalOverflow(page, "chat messages after long response");
  await assertPanelFrameStable(page, "chat messages after long response");
  await page.setViewportSize({ width: 375, height: 520 });
  await assertPanelFrameStable(page, "compact side panel after long response");
  await page.setViewportSize({ width: 375, height: 780 });

  await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.enableDryRunSubmit?.());
  await page.locator("[data-image-followup]").first().click();
  await page.locator(".image-annotation-backdrop").waitFor({ timeout: 5_000 });
  const followupEditorState = await page.evaluate(() => ({
    modal: Boolean(document.querySelector(".image-annotation-backdrop")),
    followupInput: Boolean(document.querySelector("#image-annotation-followup-input")),
    followupAttach: Boolean(document.querySelector("[data-image-annotation-add-reference]")),
    followupSend: Boolean(document.querySelector(".image-annotation-send")),
  }));
  if (
    !followupEditorState.modal ||
    !followupEditorState.followupInput ||
    !followupEditorState.followupAttach ||
    !followupEditorState.followupSend
  ) {
    throw new Error(`Smoke test failed: generated image follow-up editor did not render (${JSON.stringify(followupEditorState)}).`);
  }
  await page.evaluate((files) => window.__CODEX_SIDEPANEL_SMOKE__?.injectImageAnnotationReferenceFiles?.(files) ?? [], [
    {
      name: "followup-reference.png",
      mimeType: "image/png",
      base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2XWgAAAAASUVORK5CYII=",
      lastModified: 9_999,
    },
  ]);
  await page.waitForFunction(
    () => document.querySelector(".image-annotation-reference-chips")?.textContent?.includes("followup-reference.png"),
    undefined,
    { timeout: 5_000 },
  );
  await page.locator("#image-annotation-followup-input").fill("__smoke_generated_followup_edit__");
  await page.locator(".image-annotation-send").click();
  await page.waitForFunction(
    () =>
      (window.__CODEX_SIDEPANEL_SMOKE__?.getDryRunSubmissions?.() ?? []).includes(
        "__smoke_generated_followup_edit__",
      ),
    undefined,
    { timeout: 5_000 },
  );
  const followupSubmissions = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.getDryRunSubmissions?.() ?? [],
  );
  const followupSnapshot = await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.snapshot() ?? null);
  if (
    followupSubmissions.at(-1) !== "__smoke_generated_followup_edit__" ||
    !followupSnapshot?.fileChipLabels?.some((label) => label.includes(".annotated.png"))
  ) {
    throw new Error(
      `Smoke test failed: generated image follow-up was not submitted with an annotated attachment (${JSON.stringify({
        followupSubmissions,
        followupSnapshot,
      })}).`,
    );
  }

  if ((await page.locator("[data-image-open]").count()) < 1) {
    throw new Error("Smoke test failed: generated image open button was not rendered.");
  }

  await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.enableDryRunSubmit?.());
  await page.locator('[data-top-quick-action="summarize-page"]').click();
  const quickSystemSubmissions = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.getDryRunSubmissions?.() ?? [],
  );
  const quickSystemPrompt = quickSystemSubmissions.at(-1) ?? "";
  if (!/current|현재/i.test(quickSystemPrompt)) {
    throw new Error(`Smoke test failed: quick system did not submit current-page prompt (${JSON.stringify(quickSystemSubmissions)}).`);
  }

  await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.simulateActiveTabUpdateForTest?.({
      title: "A useful video - YouTube",
      url: "https://www.youtube.com/watch?v=action-card-smoke",
      actionCards: [
        {
          id: "youtube-summary-question",
          title: "요약",
          description: "현재 페이지를 요약합니다.",
          kind: "prompt",
          prompt: "__smoke_action_card_prompt__",
        },
      ],
    }),
  );
  await page.waitForSelector('[data-action="youtube-summary-question"]', { timeout: 5_000 });
  await page.locator('[data-action="youtube-summary-question"]').click();
  const actionSubmissions = await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.getDryRunSubmissions?.() ?? [],
  );
  if (actionSubmissions.at(-1) !== "__smoke_action_card_prompt__") {
    throw new Error(`Smoke test failed: action card did not submit immediately (${JSON.stringify(actionSubmissions)}).`);
  }

  await page.evaluate(() =>
    window.__CODEX_SIDEPANEL_SMOKE__?.simulateActiveTabUpdateForTest?.({
      title: "A useful video - YouTube",
      url: "https://www.youtube.com/watch?v=seek-smoke",
      actionCards: [],
    }),
  );
  await page.evaluate(() => {
    window.__CODEX_SIDEPANEL_SMOKE_SEEK_MESSAGES__ = [];
  });
  await page.locator('[data-youtube-seek="83"]').first().click();
  const seekMessage = await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE_SEEK_MESSAGES__?.at(-1) ?? null);
  if (!seekMessage || seekMessage.type !== "youtube.seek" || seekMessage.seconds !== 83) {
    throw new Error(`Smoke test failed: timestamp click did not request YouTube seek (${JSON.stringify(seekMessage)}).`);
  }

  const scrollState = await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.scrollChatBy?.(360) ?? null);
  if (!scrollState || !scrollState.hasScrollableArea || scrollState.after <= scrollState.before) {
    throw new Error(`Smoke test failed: the chat view did not scroll as expected (${JSON.stringify(scrollState)}).`);
  }

  if (pageErrors.length > 0) {
    throw new Error(`Smoke test failed with page errors: ${pageErrors.map((error) => error.message).join("; ")}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        extensionId,
        browserTarget: launchOptions.channel ?? launchOptions.executablePath ?? null,
        chips: chipLabels,
      },
      null,
      2,
    ),
  );
} finally {
  await browserContext?.close().catch(() => undefined);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  await rm(stagedExtensionRoot, { recursive: true, force: true }).catch(() => undefined);
}

async function assertComposerControlsInsideFrame(page, label) {
  const composerClipState = await page.evaluate(() => {
    const frame = document.querySelector(".composer-frame")?.getBoundingClientRect();
    const controlBar = document.querySelector(".composer-control-bar")?.getBoundingClientRect();
    const sendButton = document.querySelector("#send-prompt, #stop-turn, #live-toggle")?.getBoundingClientRect();
    const modelTrigger = document.querySelector("#composer-model-menu-trigger")?.getBoundingClientRect();
    const voiceButton = document.querySelector("#voice-input-toggle")?.getBoundingClientRect();
    const modelGapTarget = voiceButton ?? sendButton;
    return {
      frameRight: Math.round(frame?.right ?? 0),
      controlBarRight: Math.round(controlBar?.right ?? 0),
      sendButtonRight: Math.round(sendButton?.right ?? 0),
      modelTriggerRight: Math.round(modelTrigger?.right ?? 0),
      voiceButtonLeft: Math.round(voiceButton?.left ?? 0),
      modelToVoiceGap: Math.round((modelGapTarget?.left ?? 0) - (modelTrigger?.right ?? 0)),
      sendRightInset: Math.round((frame?.right ?? 0) - (sendButton?.right ?? 0)),
    };
  });
  if (
    composerClipState.controlBarRight > composerClipState.frameRight + 1 ||
    composerClipState.sendButtonRight > composerClipState.frameRight + 1 ||
    composerClipState.modelTriggerRight > composerClipState.frameRight + 1 ||
    composerClipState.modelToVoiceGap < 0 ||
    composerClipState.modelToVoiceGap > 8 ||
    composerClipState.sendRightInset < 0 ||
    composerClipState.sendRightInset > 14
  ) {
    throw new Error(`Smoke test failed: ${label} controls are not right-aligned (${JSON.stringify(composerClipState)}).`);
  }
}

function isAcceptableModelTriggerBackground(background) {
  const lightSurfaceMatch = background.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/u);
  if (lightSurfaceMatch) {
    const [, red, green, blue] = lightSurfaceMatch.map(Number);
    if (red >= 230 && green >= 230 && blue >= 230) {
      return true;
    }
  }
  return (
    /rgba\(0,\s*0,\s*0,\s*0\)/.test(background) ||
    background === "rgb(238, 241, 246)"
  );
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const offenders = Array.from(document.body.querySelectorAll("*"))
      .filter((element) => !element.closest(".composer-context-summary, .site-suggestion-rail"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((rect) => rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1))
      .slice(0, 8);
    return {
      viewportWidth,
      scrollWidth,
      offenders,
    };
  });

  if (overflow.scrollWidth > overflow.viewportWidth + 1 || overflow.offenders.length > 0) {
    throw new Error(`Smoke test failed: ${label} has horizontal overflow (${JSON.stringify(overflow)}).`);
  }
}

async function assertEmptyHeroCentered(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForSelector("#chat-scroll .empty-hero", { state: "attached", timeout: 5_000 });
  const layout = await page.evaluate(() => {
    const centerOf = (rect) => rect.left + rect.width / 2;
    const chatScroll = document.querySelector("#chat-scroll");
    const hero = document.querySelector(".empty-hero");
    const icon = document.querySelector(".empty-hero-icon");
    const copy = document.querySelector(".empty-hero-copy");
    const title = document.querySelector(".hero-title");
    const hint = document.querySelector(".hero-hint");
    const chatRect = chatScroll?.getBoundingClientRect();
    const heroRect = hero?.getBoundingClientRect();
    const iconRect = icon?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    const hintRect = hint?.getBoundingClientRect();
    const chatStyle = chatScroll ? getComputedStyle(chatScroll) : null;
    const chatCenter = chatRect ? centerOf(chatRect) : 0;
    return {
      chatPresent: Boolean(chatRect),
      heroPresent: Boolean(heroRect),
      chatWidth: Math.round(chatRect?.width ?? 0),
      heroWidth: Math.round(heroRect?.width ?? 0),
      chatDisplay: chatStyle?.display ?? "",
      chatPlaceItems: chatStyle?.placeItems ?? "",
      heroOffset: heroRect ? Math.abs(centerOf(heroRect) - chatCenter) : Number.POSITIVE_INFINITY,
      iconOffset: iconRect ? Math.abs(centerOf(iconRect) - chatCenter) : Number.POSITIVE_INFINITY,
      copyOffset: copyRect ? Math.abs(centerOf(copyRect) - chatCenter) : Number.POSITIVE_INFINITY,
      titleOffset: titleRect ? Math.abs(centerOf(titleRect) - chatCenter) : Number.POSITIVE_INFINITY,
      hintOffset: hintRect ? Math.abs(centerOf(hintRect) - chatCenter) : Number.POSITIVE_INFINITY,
    };
  });

  const maxOffset = 2;
  if (
    !layout.chatPresent ||
    !layout.heroPresent ||
    layout.chatDisplay !== "grid" ||
    !layout.chatPlaceItems.includes("center") ||
    layout.heroOffset > maxOffset ||
    layout.iconOffset > maxOffset ||
    layout.copyOffset > maxOffset ||
    layout.titleOffset > maxOffset ||
    layout.hintOffset > maxOffset
  ) {
    throw new Error(`Smoke test failed: empty hero is not centered at ${width}px (${JSON.stringify(layout)}).`);
  }
}

async function waitForSmokeComposer(page) {
  await page.evaluate(() => window.__CODEX_SIDEPANEL_SMOKE__?.waitForComposer());
  await page.waitForSelector("#composer", { state: "attached", timeout: 5_000 });
}

async function assertPanelFrameStable(page, label) {
  const layout = await page.evaluate(() => {
    const viewportHeight = document.documentElement.clientHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const bodyHeight = document.body.scrollHeight;
    const shell = document.querySelector(".shell")?.getBoundingClientRect();
    const mainStage = document.querySelector(".main-stage")?.getBoundingClientRect();
    const composer = document.querySelector(".composer-shell")?.getBoundingClientRect();
    const mainStageElement = document.querySelector(".main-stage");
    const composerElement = document.querySelector(".composer-shell");
    const chatScroll = document.querySelector("#chat-scroll");
    const chatScrollRect = chatScroll?.getBoundingClientRect();
    const bodyOverflowY = getComputedStyle(document.body).overflowY;
    const mainStageStyle = mainStageElement ? getComputedStyle(mainStageElement) : null;
    const composerStyle = composerElement ? getComputedStyle(composerElement) : null;
    return {
      viewportHeight,
      documentHeight,
      bodyHeight,
      shellBottom: Math.round(shell?.bottom ?? 0),
      mainStageHeight: Math.round(mainStage?.height ?? 0),
      mainStageBottom: Math.round(mainStage?.bottom ?? 0),
      composerTop: Math.round(composer?.top ?? 0),
      composerBottom: Math.round(composer?.bottom ?? 0),
      chatScrollBottom: Math.round(chatScrollRect?.bottom ?? 0),
      bodyOverflowY,
      mainStageFlexBasis: mainStageStyle?.flexBasis ?? "",
      composerFlexShrink: composerStyle?.flexShrink ?? "",
      chatScrollable: chatScroll ? chatScroll.scrollHeight > chatScroll.clientHeight : false,
    };
  });
  const compactViewportAllowsCollapsedMainStage = layout.viewportHeight <= 560;

  if (
    layout.documentHeight > layout.viewportHeight + 1 ||
    layout.bodyHeight > layout.viewportHeight + 1 ||
    layout.shellBottom > layout.viewportHeight + 1 ||
    layout.composerBottom > layout.viewportHeight + 1 ||
    layout.mainStageBottom > layout.composerTop + 1 ||
    layout.chatScrollBottom > layout.composerTop + 1 ||
    (!compactViewportAllowsCollapsedMainStage && layout.mainStageHeight <= 0) ||
    layout.mainStageFlexBasis !== "0px" ||
    layout.composerFlexShrink !== "0" ||
    !layout.chatScrollable ||
    layout.bodyOverflowY !== "hidden"
  ) {
    throw new Error(`Smoke test failed: ${label} moved the panel frame (${JSON.stringify(layout)}).`);
  }
}

async function loadPlaywright() {
  for (const moduleName of ["playwright", "playwright-core"]) {
    try {
      return await import(moduleName);
    } catch {
      continue;
    }
  }

  const nodePath = process.env.NODE_PATH;
  if (nodePath) {
    const require = createRequire(import.meta.url);
    for (const moduleName of ["playwright", "playwright-core"]) {
      try {
        return require(join(nodePath, moduleName));
      } catch {
        continue;
      }
    }
  }

  throw new Error(
    "Playwright is not installed. Add playwright-core as a devDependency or set NODE_PATH to a directory containing playwright.",
  );
}

async function detectChromiumLaunchOptions() {
  const playwrightChannel = readEnvValue(process.env, "PLAYWRIGHT_CHANNEL");
  if (playwrightChannel) {
    return {
      channel: playwrightChannel,
    };
  }

  const browserExecutablePath = readEnvValue(process.env, "BROWSER_EXECUTABLE_PATH");
  if (browserExecutablePath) {
    return {
      executablePath: browserExecutablePath,
    };
  }

  const playwrightBrowser = await findPlaywrightChromiumExecutable();
  if (playwrightBrowser) {
    return {
      executablePath: playwrightBrowser,
    };
  }

  const systemBrowser = await findSystemChromiumExecutable();
  if (systemBrowser) {
    return {
      executablePath: systemBrowser,
    };
  }

  if (installBrowserIfMissing) {
    await installPlaywrightChromium();
    const installedBrowser = await findPlaywrightChromiumExecutable();
    if (installedBrowser) {
      return {
        executablePath: installedBrowser,
      };
    }
  }

  throw new Error(
    [
      "Smoke tests need Chromium or Chrome for Testing.",
      "Run `npx -y playwright@1.59.1 install chromium`, set `BROWSER_EXECUTABLE_PATH`, or install Chrome for Testing.",
      "Google Chrome and Microsoft Edge no longer support command-line side-loading for this workflow.",
    ].join(" "),
  );
}

async function waitForSmokeHarness(page) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => Boolean(window.__CODEX_SIDEPANEL_SMOKE__)).catch(() => false);
    if (ready) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Smoke test failed: the sidepanel smoke harness never became ready.");
}

async function waitForExtensionServiceWorker(browserContext) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const [serviceWorker] = browserContext.serviceWorkers();
    if (serviceWorker) {
      return serviceWorker;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Smoke test failed: the MV3 service worker never became available.");
}

async function installPlaywrightChromium() {
  const version = await readPlaywrightVersion();
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["-y", `playwright@${version}`, "install", "chromium"];

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(npxCommand, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI: process.env.CI ?? "1",
      },
      stdio: "inherit",
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(undefined);
        return;
      }
      rejectPromise(new Error(`Failed to install Playwright Chromium (exit code ${code ?? "unknown"}).`));
    });
  });
}

async function readPlaywrightVersion() {
  const packageJsonPath = resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version =
    packageJson.devDependencies?.playwright ??
    packageJson.devDependencies?.["playwright-core"] ??
    packageJson.dependencies?.playwright ??
    packageJson.dependencies?.["playwright-core"];

  if (typeof version !== "string") {
    return "1.59.1";
  }

  const normalized = version.replace(/^[^\d]*/, "");
  return normalized || "1.59.1";
}

async function findPlaywrightChromiumExecutable() {
  const roots = resolvePlaywrightCacheRoots();
  const executableSuffixes = resolveChromiumExecutableSuffixes();

  for (const root of roots) {
    const executable = await findNewestExecutable(root, executableSuffixes, (entry) => entry.startsWith("chromium-"));
    if (executable) {
      return executable;
    }
  }

  return null;
}

function resolvePlaywrightCacheRoots() {
  const roots = [];
  const envRoot = readEnvValue(process.env, "PLAYWRIGHT_BROWSERS_PATH");
  if (envRoot && envRoot !== "0") {
    roots.push(resolve(envRoot));
  }

  const home = homedir();
  if (platform() === "darwin") {
    roots.push(join(home, "Library", "Caches", "ms-playwright"));
  } else if (platform() === "linux") {
    roots.push(join(home, ".cache", "ms-playwright"));
  } else if (platform() === "win32") {
    roots.push(join(readEnvValue(process.env, "LOCALAPPDATA") ?? join(home, "AppData", "Local"), "ms-playwright"));
  }

  return roots;
}

function resolveChromiumExecutableSuffixes() {
  if (platform() === "darwin") {
    return [
      join("chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      join("chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      join("chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
      join("chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
    ];
  }
  if (platform() === "linux") {
    return [join("chrome-linux", "chrome"), join("chrome-linux64", "chrome")];
  }
  if (platform() === "win32") {
    return [join("chrome-win", "chrome.exe"), join("chrome-win64", "chrome.exe")];
  }
  return [];
}

async function findSystemChromiumExecutable() {
  const candidates = platform() === "darwin"
    ? [
        "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ]
    : platform() === "linux"
      ? ["/usr/bin/google-chrome-for-testing", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
      : platform() === "win32"
      ? [
          join(readEnvValue(process.env, "LOCALAPPDATA") ?? join(homedir(), "AppData", "Local"), "Google", "Chrome", "Application", "chrome.exe"),
          join(readEnvValue(process.env, "LOCALAPPDATA") ?? join(homedir(), "AppData", "Local"), "Google", "Chrome for Testing", "Application", "chrome.exe"),
          join(readEnvValue(process.env, "ProgramFiles") ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
          join(readEnvValue(process.env, "ProgramFiles") ?? "C:\\Program Files", "Google", "Chrome for Testing", "Application", "chrome.exe"),
          join(readEnvValue(process.env, "ProgramFiles") ?? "C:\\Program Files", "Chromium", "Application", "chrome.exe"),
          join(readEnvValue(process.env, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
          join(readEnvValue(process.env, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)", "Google", "Chrome for Testing", "Application", "chrome.exe"),
          join(readEnvValue(process.env, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)", "Chromium", "Application", "chrome.exe"),
        ]
      : [];

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function readEnvValue(env, key) {
  const exactValue = env[key];
  if (typeof exactValue === "string") {
    return exactValue;
  }

  const normalizedKey = key.toLowerCase();
  const actualKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === normalizedKey);
  const value = actualKey ? env[actualKey] : undefined;
  return typeof value === "string" ? value : undefined;
}

async function findNewestExecutable(root, executableSuffixes, matchDir) {
  if (executableSuffixes.length === 0) {
    return null;
  }

  let entries;
  try {
    entries = await readdir(root, {
      withFileTypes: true,
    });
  } catch {
    return null;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !matchDir(entry.name)) {
      continue;
    }
    const entryPath = join(root, entry.name);
    try {
      const metadata = await stat(entryPath);
      candidates.push({
        path: entryPath,
        mtimeMs: metadata.mtimeMs,
      });
    } catch {
      continue;
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || basename(right.path).localeCompare(basename(left.path)));

  for (const candidate of candidates) {
    for (const suffix of executableSuffixes) {
      const executablePath = join(candidate.path, suffix);
      try {
        await access(executablePath, fsConstants.X_OK);
        return executablePath;
      } catch {
        continue;
      }
    }
  }

  return null;
}
