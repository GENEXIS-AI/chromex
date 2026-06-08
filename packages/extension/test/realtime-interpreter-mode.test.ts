import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(new URL("../src/sidepanel/index.ts", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("../src/background/index.ts", import.meta.url), "utf8");
const sidepanelCss = readFileSync(new URL("../public/sidepanel.css", import.meta.url), "utf8");

function extractFunctionBody(name: string): string {
  const startMatch = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "u").exec(sidepanelSource);
  const start = startMatch?.index ?? -1;
  expect(start).toBeGreaterThanOrEqual(0);
  const paramsStart = sidepanelSource.indexOf("(", start);
  let parenDepth = 0;
  let signatureEnd = -1;
  for (let index = paramsStart; index < sidepanelSource.length; index += 1) {
    const char = sidepanelSource[index];
    if (char === "(") {
      parenDepth += 1;
    } else if (char === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnd = index;
        break;
      }
    }
  }
  expect(signatureEnd).toBeGreaterThanOrEqual(0);
  const braceStart = sidepanelSource.indexOf("{", signatureEnd);
  let depth = 0;
  for (let index = braceStart; index < sidepanelSource.length; index += 1) {
    const char = sidepanelSource[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return sidepanelSource.slice(braceStart + 1, index);
      }
    }
  }
  throw new Error(`Unable to extract ${name}`);
}

describe("realtime interpreter mode", () => {
  test("merges realtime interpreter entry into the unified conference/live menu item", () => {
    const renderMenuBody = extractFunctionBody("renderAppMenu");
    const conferencePanelBody = extractFunctionBody("renderConferenceModePanel");

    expect(renderMenuBody).toContain('data-menu-action="conference-toggle"');
    expect(renderMenuBody).toContain("getConferenceModeMenuLabel()");
    expect(renderMenuBody).not.toContain('data-menu-action="interpreter-open"');
    expect(renderMenuBody).not.toContain("getRealtimeInterpreterMenuLabel()");
    expect(conferencePanelBody).toContain('id="conference-live-playback-toggle"');
    expect(conferencePanelBody).toContain("getConferenceModeMenuLabel()");
  });

  test("requires only a stored OpenAI API key before creating a realtime translate session", () => {
    const startBody = extractFunctionBody("startRealtimeInterpreterMode");

    expect(startBody).not.toContain('state.accountStatus?.authMode !== "apikey"');
    expect(startBody).not.toContain("!state.accountStatus?.codexAuthenticated");
    expect(startBody).toContain("!state.accountStatus?.openAiApiKeyConfigured");
    expect(startBody).toContain('afterSubmit: { kind: "retry-realtime-interpreter" }');
    expect(startBody).toContain("getRealtimeInterpreterApiKeyDescription");
    expect(startBody).toContain('type: "translation.client_secret.create"');
    expect(startBody).toContain("requestRealtimeInterpreterAudioStream");
    expect(startBody).toContain("createRealtimeInterpreterWebRtcOffer");
    expect(startBody).toContain('https://api.openai.com/v1/realtime/translations');
    expect(startBody).not.toContain('https://api.openai.com/v1/realtime/translations/calls');
    expect(startBody).not.toContain('https://api.openai.com/v1/realtime/calls"');
    expect(startBody).not.toContain('type: "voice.session.start"');
    expect(startBody).not.toContain('type: "dictation.transcription.start"');
    expect([...startBody.matchAll(/type: "translation\.client_secret\.create"/gu)]).toHaveLength(1);
  });

  test("explains realtime interpreter API-key setup, estimated pricing, and official links", () => {
    const descriptionBody = extractFunctionBody("getRealtimeInterpreterApiKeyDescription");
    const renderDialogBody = extractFunctionBody("renderNativeTextDialogDescription");

    expect(descriptionBody).toContain("gpt-realtime-translate");
    expect(descriptionBody).toContain("$0.034/min");
    expect(descriptionBody).toContain("10분 약 $0.34");
    expect(descriptionBody).toContain("1시간 약 $2.04");
    expect(descriptionBody).toContain("https://platform.openai.com/api-keys");
    expect(descriptionBody).toContain("https://openai.com/api/pricing/");
    expect(descriptionBody).toContain("https://platform.openai.com/settings/organization/billing/overview");
    expect(renderDialogBody).toContain("target=\"_blank\"");
    expect(renderDialogBody).toContain('rel="noreferrer"');
  });

  test("keeps interpreter language and audio source controls inside the particle tab", () => {
    const renderBody = extractFunctionBody("renderRealtimeInterpreterControls");

    expect(renderBody).toContain('id="realtime-interpreter-language"');
    expect(renderBody).toContain("const languageDisabled = state.realtimeInterpreter.starting");
    expect(renderBody).toContain('${languageDisabled ? "disabled" : ""}');
    expect(renderBody).toContain('id="realtime-interpreter-microphone"');
    expect(renderBody).toContain('id="realtime-interpreter-refresh-devices"');
    expect(renderBody).toContain('data-interpreter-source="display"');
    expect(renderBody).toContain('data-interpreter-source="microphone"');
    expect(renderBody).not.toContain("realtime-interpreter-voice-adaptive");
    expect(renderBody).toContain("realtime-interpreter-cost-note");
    expect(renderBody).toContain("labels.costGuideTitle");
    expect(renderBody).toContain("labels.costGuideBody");
    expect(renderBody).toContain('id="realtime-interpreter-output-volume"');
    expect(renderBody).toContain("labels.outputVolume");
    expect(renderBody).toContain("labels.outputVolumeHelp");
    expect(sidepanelSource).toContain('state.realtimeInterpreter.inputSource === "microphone"');
    expect(sidepanelSource).toContain("requestRealtimeInterpreterMicrophoneStream");
    expect(sidepanelSource).toContain("requestComputerAudioStreamForDictation");
  });

  test("updates the active realtime translation target language through session.update", () => {
    const bindBody = extractFunctionBody("bindRealtimeInterpreterControls");
    const updateBody = extractFunctionBody("updateRealtimeInterpreterTargetLanguage");
    const sendUpdateBody = extractFunctionBody("sendRealtimeInterpreterTargetLanguageUpdate");

    expect(bindBody).toContain("updateRealtimeInterpreterTargetLanguage(value)");
    expect(updateBody).toContain("state.realtimeInterpreter.targetLanguage = nextLanguage");
    expect(updateBody).toContain("state.realtimeInterpreter.active || state.conferenceMode.active");
    expect(updateBody).toContain("sendRealtimeInterpreterTargetLanguageUpdate(nextLanguage)");
    expect(sendUpdateBody).toContain("realtimeInterpreterDataChannel.readyState !== \"open\"");
    expect(sendUpdateBody).toContain('type: "session.update"');
    expect(sendUpdateBody).toContain("audio");
    expect(sendUpdateBody).toContain("output");
    expect(sendUpdateBody).toContain("language");
  });

  test("uses a start and stop button for audio capture instead of an audio-select label", () => {
    const viewBody = extractFunctionBody("renderRealtimeInterpreterView");

    expect(viewBody).toContain('id="realtime-interpreter-start"');
    expect(viewBody).toContain("labels.start");
    expect(viewBody).toContain('id="realtime-interpreter-stop"');
    expect(viewBody).not.toContain("labels.chooseAudio");
  });

  test("moves interpreter settings behind a top popover toggle", () => {
    const viewBody = extractFunctionBody("renderRealtimeInterpreterView");
    const bindBody = extractFunctionBody("bindRealtimeInterpreterControls");
    const startBody = extractFunctionBody("startRealtimeInterpreterMode");
    const stopBody = extractFunctionBody("stopRealtimeInterpreterMode");

    expect(sidepanelSource).toContain("settingsOpen: boolean");
    expect(viewBody).toContain('id="realtime-interpreter-settings-toggle"');
    expect(viewBody).toContain('class="realtime-interpreter-settings-popover"');
    expect(viewBody).toContain('aria-expanded="${state.realtimeInterpreter.settingsOpen ? "true" : "false"}"');
    expect(viewBody).toContain('${state.realtimeInterpreter.settingsOpen ? renderRealtimeInterpreterControls() : ""}');
    expect(viewBody).not.toContain("${controlsHtml}");
    expect(bindBody).toContain("#realtime-interpreter-settings-toggle");
    expect(bindBody).toContain("state.realtimeInterpreter.settingsOpen = !state.realtimeInterpreter.settingsOpen");
    expect(startBody).toContain("settingsOpen: false");
    expect(stopBody).toContain("settingsOpen: false");
    expect(sidepanelCss).toContain(".realtime-interpreter-settings-popover");
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-settings-popover\s*\{[^}]*position:\s*absolute/su);
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-settings-popover\s*\{[^}]*overflow-y:\s*auto/su);
  });

  test("centers the microphone refresh icon inside the input control", () => {
    expect(sidepanelCss).toContain(".realtime-interpreter-refresh-button");
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-refresh-button\s*\{[^}]*display:\s*grid/su);
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-refresh-button\s*\{[^}]*place-items:\s*center/su);
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-refresh-button svg\s*\{[^}]*display:\s*block/su);
  });

  test("requests tab audio suppression at capture time and confirms it for browser tabs", () => {
    const displayCaptureBody = extractFunctionBody("requestRealtimeInterpreterDisplayAudioStream");
    const displayOptionsBody = extractFunctionBody("createComputerAudioDisplayMediaOptions");
    const suppressBody = extractFunctionBody("suppressBrowserTabLocalAudioPlayback");
    const shouldSuppressBody = extractFunctionBody("shouldSuppressLocalAudioPlaybackForDisplaySurface");

    expect(displayCaptureBody).toContain("requestComputerAudioStreamForDictation({");
    expect(displayCaptureBody).toContain("suppressLocalAudioPlayback: Boolean(options.suppressLocalAudioPlayback)");
    expect(displayCaptureBody).toContain("shouldSuppressLocalAudioPlaybackForDisplaySurface(displaySurface)");
    expect(displayCaptureBody).toContain("suppressBrowserTabLocalAudioPlayback(stream)");
    expect(shouldSuppressBody).toContain('displaySurface === "browser"');
    expect(suppressBody).toContain(".applyConstraints");
    expect(suppressBody).toContain("suppressLocalAudioPlayback: true");
    expect(sidepanelSource).toContain("suppressLocalAudioPlayback = false");
    expect(displayOptionsBody).toContain("suppressLocalAudioPlayback");
  });

  test("plays translated remote audio with the configured interpreter volume even when WebRTC sends a track without streams", () => {
    const peerBody = extractFunctionBody("attachRealtimeInterpreterPeerHandlers");
    const bindBody = extractFunctionBody("bindRealtimeInterpreterControls");

    expect(peerBody).toContain("event.streams[0] ?? new MediaStream([event.track])");
    expect(peerBody).toContain("realtimeInterpreterAudio.muted = false");
    expect(peerBody).toContain("applyRealtimeInterpreterOutputVolume()");
    expect(sidepanelSource).toContain("function clampRealtimeInterpreterOutputVolume");
    expect(sidepanelSource).toContain("function applyRealtimeInterpreterOutputVolume");
    expect(sidepanelSource).toContain("const DEFAULT_REALTIME_INTERPRETER_OUTPUT_VOLUME = 0.5");
    expect(sidepanelSource).toContain("outputVolume: DEFAULT_REALTIME_INTERPRETER_OUTPUT_VOLUME");
    expect(bindBody).toContain("#realtime-interpreter-output-volume");
    expect(bindBody).toContain("state.realtimeInterpreter.outputVolume = volume");
    expect(bindBody).toContain("applyRealtimeInterpreterOutputVolume()");
  });

  test("routes translation client secret creation through the native bridge only", () => {
    expect(backgroundSource).toContain('case "translation.client_secret.create"');
    expect(backgroundSource).toContain('bridge.request("translation.client_secret.create"');
  });

  test("stores interpreter API keys without switching Codex chat auth to API-key mode", () => {
    const submitDialogBody = extractFunctionBody("submitNativeTextDialog");
    const saveKeyBody = extractFunctionBody("saveRealtimeTranslationApiKey");
    const sendPromptBody = extractFunctionBody("sendPrompt");

    expect(submitDialogBody).toContain("isRealtimeTranslationApiKeyDialog(dialog)");
    expect(submitDialogBody).toContain("saveRealtimeTranslationApiKey(value)");
    expect(saveKeyBody).toContain('type: "translation.api_key.save"');
    expect(backgroundSource).toContain('case "translation.api_key.save"');
    expect(submitDialogBody).not.toContain('loginType: "apiKey"');
    expect(sendPromptBody).toContain("await ensureChatgptAuthForCodexPrompt()");
  });

  test("lets main settings disconnect the stored interpreter API key without logging out Codex", () => {
    const settingsBody = extractFunctionBody("renderWorkspaceView");
    const disconnectBody = extractFunctionBody("disconnectRealtimeTranslationApiKey");

    expect(settingsBody).toContain("state.accountStatus?.openAiApiKeyConfigured");
    expect(settingsBody).toContain("strings.status.apiKeyConnected");
    expect(settingsBody).toContain('id="disconnect-api-key"');
    expect(settingsBody).toContain("strings.actions.disconnectApiKey");
    expect(disconnectBody).toContain('type: "translation.api_key.clear"');
    expect(disconnectBody).toContain("openAiApiKeyConfigured: false");
    expect(disconnectBody).toContain("stopConferenceMode({");
    expect(disconnectBody).toContain("stopRealtimeInterpreterMode({");
    expect(disconnectBody).toContain("scheduleInitialize()");
    expect(disconnectBody).not.toContain("account.logout");
    expect(backgroundSource).toContain('case "translation.api_key.clear"');
    expect(backgroundSource).toContain('bridge.request("translation.api_key.clear"');
    expect(backgroundSource).toContain("openAiApiKeyConfigured: false");
  });

  test("renders transcript deltas from the translation data channel, not assistant response turns", () => {
    const handlerBody = extractFunctionBody("handleRealtimeInterpreterDataChannelMessage");

    expect(handlerBody).toContain('payload.type === "session.input_transcript.delta"');
    expect(handlerBody).toContain('payload.type === "session.output_transcript.delta"');
    expect(handlerBody).toContain('payload.type === "session.input_transcript.done"');
    expect(handlerBody).toContain('payload.type === "session.output_transcript.done"');
    expect(handlerBody).not.toContain("response.create");
  });

  test("cancels in-flight interpreter startup and closes captured media when stop is pressed", () => {
    const startBody = extractFunctionBody("startRealtimeInterpreterMode");
    const stopBody = extractFunctionBody("stopRealtimeInterpreterMode");
    const cleanupBody = extractFunctionBody("cleanupRealtimeInterpreterResources");

    expect(sidepanelSource).toContain("let realtimeInterpreterStartGeneration = 0");
    expect(startBody).toContain("const startGeneration = ++realtimeInterpreterStartGeneration");
    expect(startBody).toContain("isCurrentRealtimeInterpreterStart(startGeneration)");
    expect(startBody).toContain("closeStaleRealtimeInterpreterStart(peer, pendingStream)");
    expect(stopBody).toContain("realtimeInterpreterStartGeneration += 1");
    expect(cleanupBody).toContain("realtimeInterpreterDataChannel.onmessage = null");
    expect(cleanupBody).toContain("realtimeInterpreterDataChannel.close()");
    expect(cleanupBody).toContain("cleanupComposerVoiceWaveform()");
  });

  test("preserves partial interpreter transcript when stopping", () => {
    const stopBody = extractFunctionBody("stopRealtimeInterpreterMode");
    const commitBody = extractFunctionBody("commitRealtimeInterpreterPartialIfReady");

    expect(stopBody).toContain("commitRealtimeInterpreterPartialIfReady({ force: true, allowSourceOnly: true })");
    expect(stopBody).toContain("entries: options.preserveEntries ? state.realtimeInterpreter.entries : []");
    expect(commitBody).toContain("allowSourceOnly");
    expect(commitBody).toContain("!translationText && !(options.allowSourceOnly && sourceText)");
  });

  test("injects the original interpreter transcript into chat questions", () => {
    const contextBody = extractFunctionBody("buildConversationContextHint");
    const activeBody = extractFunctionBody("isRealtimeInterpreterQuestionContextActive");
    const hintBody = extractFunctionBody("buildRealtimeInterpreterContextHint");
    const sourceOnlyHintBody = extractFunctionBody("buildTranscriptSourceOnlyContextHint");
    const sendPromptBody = extractFunctionBody("sendPrompt");

    expect(contextBody).toContain("isRealtimeInterpreterQuestionContextActive()");
    expect(contextBody).toContain("buildRealtimeInterpreterContextHint");
    expect(activeBody).toContain("state.realtimeInterpreter.viewActive");
    expect(activeBody).toContain("entry.sourceText.trim()");
    expect(activeBody).not.toContain("entry.translationText.trim()");
    expect(hintBody).toContain("Realtime interpreter original transcript context:");
    expect(hintBody).not.toContain("Translation:");
    expect(hintBody).toContain("buildTranscriptSourceOnlyContextHint");
    expect(sourceOnlyHintBody).toContain("Original:");
    expect(sendPromptBody).toContain("const transcriptQuestionContextActiveAtSubmit = isTranscriptQuestionContextActive()");
    expect(sendPromptBody).toContain("resolveActiveTranscriptViewForPrompt()");
    expect(sendPromptBody).toContain("suppressPageContext: transcriptQuestionContextActive || isCurrentTabContextDismissed()");
    expect(sendPromptBody).toContain("selectedTabIds: state.selectedTabIds");
    expect(sendPromptBody).toContain("conversationContext: contextHint");
  });

  test("renders live source and translated subtitles without duplicating completed entries", () => {
    const viewBody = extractFunctionBody("renderRealtimeInterpreterView");
    const transcriptBody = extractFunctionBody("renderRealtimeInterpreterTranscriptScrollContents");
    const captionBody = extractFunctionBody("renderRealtimeInterpreterLiveCaptions");

    expect(viewBody).toContain("renderRealtimeInterpreterTranscriptScrollContents()");
    expect(transcriptBody).toContain("const liveCaptionHtml = hasPartial ? renderRealtimeInterpreterLiveCaptions() : \"\"");
    expect(transcriptBody).toContain("${liveCaptionHtml}");
    expect(transcriptBody).toContain("!rows && !hasPartial");
    expect(viewBody).not.toContain("partialRow");
    expect(captionBody).toContain("state.realtimeInterpreter.partialSourceText");
    expect(captionBody).toContain("state.realtimeInterpreter.partialTranslationText");
    expect(captionBody).not.toContain("state.realtimeInterpreter.entries.at(-1)");
    expect(captionBody).toContain("if (!sourceText && !translationText)");
    expect(captionBody).toContain("labels.originalCaptions");
    expect(captionBody).toContain("labels.translatedCaptions");
    expect(sidepanelCss).toContain(".realtime-interpreter-caption-card");
    expect(sidepanelCss).toContain(".realtime-interpreter-caption-source");
    expect(sidepanelCss).toContain(".realtime-interpreter-caption-translation");
  });

  test("auto-scrolls translated transcript entries only while the user is pinned to bottom", () => {
    const renderBody = extractFunctionBody("renderNow");
    const scrollBody = extractFunctionBody("scrollRealtimeInterpreterTranscriptToBottom");
    const bindBody = extractFunctionBody("bindEvents");

    expect(renderBody).toContain("scrollRealtimeInterpreterTranscriptToBottom({ onlyIfPinned: true })");
    expect(scrollBody).toContain('state.activeView !== "interpreter"');
    expect(scrollBody).toContain('root.querySelector<HTMLElement>("#realtime-interpreter-scroll")');
    expect(scrollBody).toContain("realtimeInterpreterTranscriptStickToBottom");
    expect(scrollBody).toContain("node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight)");
    expect(bindBody).toContain("#realtime-interpreter-scroll");
    expect(bindBody).toContain("handleRealtimeInterpreterTranscriptScroll");
  });

  test("patches live transcript DOM without replacing open interpreter settings", () => {
    const conferencePayloadBody = extractFunctionBody("handleConferenceModeTranslationPayload");
    const interpreterPayloadBody = extractFunctionBody("handleRealtimeInterpreterDataChannelMessage");
    const conferencePatchBody = extractFunctionBody("updateConferenceModeTranscriptDom");
    const interpreterPatchBody = extractFunctionBody("updateRealtimeInterpreterTranscriptDom");

    expect(conferencePayloadBody).toContain("renderOrPatchConferenceModeTranscript()");
    expect(interpreterPayloadBody).toContain("renderOrPatchRealtimeInterpreterTranscript()");
    expect(conferencePatchBody).toContain('root.querySelector<HTMLElement>("#conference-transcript-scroll")');
    expect(conferencePatchBody).toContain("list.innerHTML = renderConferenceModeTranscriptListContents()");
    expect(interpreterPatchBody).toContain('root.querySelector<HTMLElement>("#realtime-interpreter-scroll")');
    expect(interpreterPatchBody).toContain("scroll.innerHTML = renderRealtimeInterpreterTranscriptScrollContents()");
    expect(conferencePatchBody).toContain("scrollConferenceTranscriptToBottom({ onlyIfPinned: true })");
    expect(interpreterPatchBody).toContain("scrollRealtimeInterpreterTranscriptToBottom({ onlyIfPinned: true })");
  });

  test("keeps the interpreter settings reachable in short sidepanel heights", () => {
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-view\s*\{[^}]*overflow-y:\s*hidden/su);
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-view\s*\{[^}]*overflow-x:\s*hidden/su);
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-transcript-scroll\s*\{[^}]*overflow-y:\s*auto/su);
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-transcript-scroll\s*\{[^}]*scrollbar-gutter:\s*stable/su);
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-list\s*\{[^}]*max-height:\s*none/su);
  });

  test("keeps a compact waveform session fixed outside the scrolling transcript area", () => {
    const viewBody = extractFunctionBody("renderRealtimeInterpreterView");
    const statusBody = extractFunctionBody("getRealtimeInterpreterStatusLabel");

    expect(viewBody).toContain("realtime-interpreter-session");
    expect(viewBody).toContain("realtime-interpreter-header");
    expect(viewBody).toContain("realtime-interpreter-title-row");
    expect(viewBody).toContain("realtime-interpreter-waveform");
    expect(viewBody).toContain("renderComposerVoiceWaveform()");
    expect(viewBody).toContain('class="realtime-interpreter-transcript-scroll"');
    expect(viewBody).toContain('id="realtime-interpreter-scroll"');
    expect(viewBody).toContain("renderRealtimeInterpreterQuestionStream()");
    expect(viewBody).not.toContain("realtime-interpreter-orb");
    expect(viewBody).not.toContain("renderRealtimeInterpreterParticles");
    expect(viewBody).not.toContain("gpt-realtime-translate");
    expect(viewBody).not.toContain("API 통역 탭");
    expect(statusBody).not.toContain("Codex 기능");
    expect(statusBody).not.toContain("OpenAI API realtime translate");
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-session\s*\{[^}]*flex:\s*0 0 auto/su);
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-session\s*\{[^}]*text-align:\s*left/su);
    expect(sidepanelCss).toMatch(/\.realtime-interpreter-session\s*\{[^}]*min-height:\s*0/su);
    expect(sidepanelCss).toContain(".realtime-interpreter-waveform");
    expect(sidepanelCss).not.toContain(".realtime-interpreter-orb");
  });

  test("keeps interpreter transcript and chat panes independently resizable", () => {
    const viewBody = extractFunctionBody("renderRealtimeInterpreterView");
    const bindBody = extractFunctionBody("bindEvents");

    expect(sidepanelSource).toContain("realtimeInterpreterPaneSplitRatio");
    expect(viewBody).toContain("realtime-interpreter-workspace");
    expect(viewBody).toContain("--realtime-interpreter-transcript-ratio");
    expect(viewBody).toContain("realtime-interpreter-pane-resizer");
    expect(viewBody).toContain("renderRealtimeInterpreterQuestionStream()");
    expect(bindBody).toContain("bindRealtimeInterpreterPaneResizer()");
    expect(sidepanelCss).toContain(".realtime-interpreter-pane-resizer");
    expect(sidepanelCss).toContain(".realtime-interpreter-chat-section");
  });

  test("ships compact interpreter styling and keeps the chat pane visible", () => {
    expect(sidepanelCss).toContain(".realtime-interpreter-view");
    expect(sidepanelCss).toContain(".realtime-interpreter-header");
    expect(sidepanelCss).toContain(".realtime-interpreter-title-row");
    expect(sidepanelCss).toContain(".realtime-interpreter-waveform");
    expect(sidepanelCss).toContain(".realtime-interpreter-chat-section");
    expect(sidepanelCss).toContain(".realtime-interpreter-entry-source");
    expect(sidepanelCss).toContain(".realtime-interpreter-entry-translation");
    expect(sidepanelSource).not.toContain("renderRealtimeInterpreterParticles");
    expect(sidepanelSource).not.toContain("paintRealtimeInterpreterParticles");
  });
});
