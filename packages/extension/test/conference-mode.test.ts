import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  buildConferenceModeContextHint,
  buildConferenceModeTranslatedContextHint,
  mergeConferenceModeTranscriptEntry,
  parseConferenceModeAssistantText,
  type ConferenceTranscriptEntry,
} from "../src/sidepanel/conference-mode.js";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const sidepanelCss = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function extractFunctionBody(name: string): string {
  const startMatch = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "u").exec(sidepanelSource);
  const start = startMatch?.index ?? -1;
  expect(start).toBeGreaterThanOrEqual(0);
  const paramsStart = sidepanelSource.indexOf("(", start);
  expect(paramsStart).toBeGreaterThanOrEqual(0);
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
  expect(braceStart).toBeGreaterThanOrEqual(0);
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

describe("conference mode", () => {
  test("parses labeled assistant translation output", () => {
    expect(
      parseConferenceModeAssistantText(`ORIGINAL: We need to answer now.\nKOREAN: 이제 답변해야 합니다.`),
    ).toEqual({
      sourceText: "We need to answer now.",
      translationText: "이제 답변해야 합니다.",
    });
  });

  test("attaches assistant translations to the latest source transcript", () => {
    const entries: ConferenceTranscriptEntry[] = [
      {
        id: "conference-transcript-1",
        sourceText: "We need to answer now.",
        translationText: "",
        createdAt: 100,
      },
    ];

    const next = mergeConferenceModeTranscriptEntry(entries, {
      sourceText: "",
      translationText: "이제 답변해야 합니다.",
      createdAt: 110,
    });

    expect(next).toEqual([
      {
        id: "conference-transcript-1",
        sourceText: "We need to answer now.",
        translationText: "이제 답변해야 합니다.",
        createdAt: 100,
      },
    ]);
  });

  test("does not add a second translation-only card when the same translation already exists", () => {
    const entries: ConferenceTranscriptEntry[] = [
      {
        id: "conference-transcript-1",
        sourceText: "But then, a team of researchers introduced a new model known as the transformer.",
        translationText: "하지만 그때 한 연구팀이 '트랜스포머'라고 알려진 새로운 모델을 도입했습니다.",
        createdAt: 100,
      },
    ];

    const next = mergeConferenceModeTranscriptEntry(entries, {
      sourceText: "",
      translationText: "하지만 그때 한 연구팀이 '트랜스포머'라고 알려진 새로운 모델을 도입했습니다.",
      createdAt: 120,
    });

    expect(next).toEqual(entries);
  });

  test("builds hidden chat context from the original conference transcript only", () => {
    const hint = buildConferenceModeContextHint([
      {
        id: "conference-transcript-1",
        sourceText: "We should decide the launch scope.",
        translationText: "출시 범위를 결정해야 합니다.",
        createdAt: 100,
      },
    ]);

    expect(hint).toContain("Live conference transcript context:");
    expect(hint).toContain("Original: We should decide the launch scope.");
    expect(hint).not.toContain("Korean:");
    expect(hint).not.toContain("출시 범위를 결정해야 합니다.");
  });

  test("builds conference question context from translated transcript only", () => {
    const hint = buildConferenceModeTranslatedContextHint([
      {
        id: "conference-transcript-1",
        sourceText: "We should decide the launch scope.",
        translationText: "출시 범위를 결정해야 합니다.",
        createdAt: 100,
      },
    ]);

    expect(hint).toContain("Translated conference transcript context:");
    expect(hint).toContain("출시 범위를 결정해야 합니다.");
    expect(hint).not.toContain("We should decide the launch scope.");
    expect(hint).not.toContain("Original:");
  });

  test("adds unified live interpretation mode to the more menu and renders it as a dedicated view", () => {
    const renderMenuBody = extractFunctionBody("renderAppMenu");
    const chatViewBody = extractFunctionBody("renderChatView");
    const renderNowBody = extractFunctionBody("renderNow");

    expect(renderMenuBody).not.toContain("shouldShowRealtimeVoiceControls()");
    expect(renderMenuBody).toContain('data-menu-action="conference-toggle"');
    expect(renderMenuBody).not.toContain('data-menu-action="interpreter-open"');
    expect(renderMenuBody).toContain("getConferenceModeMenuLabel()");
    expect(renderMenuBody).toContain('renderUiIcon("audio-lines")');
    expect(chatViewBody).not.toContain("renderConferenceModePanel()");
    expect(renderNowBody).toContain('state.activeView === "conference"');
    expect(sidepanelSource).toContain("function renderConferenceModeView");
    expect(sidepanelSource).toContain("conference-view");
    expect(sidepanelSource).toContain("function bindConferenceModeControls");
    expect(sidepanelSource).toContain('id="conference-mode-start"');
    expect(sidepanelSource).toContain('id="conference-mode-stop"');
  });

  test("uses stored translation API key without switching normal Codex chat auth", () => {
    const startBody = extractFunctionBody("startConferenceMode");
    const toggleBody = extractFunctionBody("toggleConferenceMode");

    expect(toggleBody).not.toContain("shouldShowRealtimeVoiceControls()");
    expect(toggleBody).not.toContain("startConferenceMode()");
    expect(startBody).not.toContain('state.accountStatus?.authMode !== "apikey"');
    expect(startBody).not.toContain("!state.accountStatus?.codexAuthenticated");
    expect(startBody).toContain("!state.accountStatus?.openAiApiKeyConfigured");
    expect(startBody).toContain("openNativeTextDialog(\"api-key\"");
    expect(startBody).toContain('afterSubmit: { kind: "retry-conference-mode" }');
  });

  test("opens unified live mode without immediately prompting for audio capture", () => {
    const toggleBody = extractFunctionBody("toggleConferenceMode");

    expect(toggleBody).toContain('state.activeView = "conference"');
    expect(toggleBody).toContain("state.appMenuOpen = false");
    expect(toggleBody).toContain("state.conferenceMode.viewActive = true");
    expect(toggleBody).toContain("render()");
    expect(toggleBody).not.toContain("requestComputerAudioStreamForDictation");
    expect(toggleBody).not.toContain("startConferenceMode()");
  });

  test("starts unified mode through realtime translation with conference defaults", () => {
    const startBody = extractFunctionBody("startConferenceMode");

    expect(startBody).toContain("const livePlaybackEnabled = state.realtimeInterpreter.livePlaybackEnabled");
    expect(startBody).toContain("requestRealtimeInterpreterDisplayAudioStream({");
    expect(startBody).toContain("suppressLocalAudioPlayback: livePlaybackEnabled");
    expect(startBody).toContain("playTranslatedAudio: livePlaybackEnabled");
    expect(startBody).toContain('type: "translation.client_secret.create"');
    expect(startBody).toContain("https://api.openai.com/v1/realtime/translations");
    expect(startBody).not.toContain('type: "dictation.transcription.start"');
    expect(startBody).not.toContain("getConferenceModePrompt()");
  });

  test("conference translation uses transcript deltas directly instead of creating response translations", () => {
    const startBody = extractFunctionBody("startConferenceMode");
    const payloadBody = extractFunctionBody("handleConferenceModeTranslationPayload");

    expect(startBody).not.toContain("routeConferenceModeToRealtimeInterpreter()");
    expect(startBody).not.toContain("response.create");
    expect(payloadBody).toContain('payload.type === "session.input_transcript.delta"');
    expect(payloadBody).toContain('payload.type === "session.output_transcript.delta"');
    expect(payloadBody).toContain("commitConferenceModePartialIfReady({ force: true })");
    expect(payloadBody).not.toContain("createConferenceModeTranslationRequestEvent");
  });

  test("ignores stale conference start results after a new conference page cancels the previous recording", () => {
    const startBody = extractFunctionBody("startConferenceMode");
    const guardBody = extractFunctionBody("isCurrentConferenceModeStart");

    expect(startBody).toContain("const startSessionId = state.conferenceMode.sessionId");
    expect(startBody).toContain("const startGeneration = ++realtimeInterpreterStartGeneration");
    expect(startBody).toContain("isCurrentConferenceModeStart(startSessionId)");
    expect(startBody).toContain("startGeneration !== realtimeInterpreterStartGeneration");
    expect(startBody).toContain("pendingStream.getTracks().forEach((track) => track.stop())");
    expect(guardBody).toContain("state.conferenceMode.sessionId === sessionId");
    expect(guardBody).toContain("state.conferenceMode.starting");
  });

  test("does not create overlapping translation responses for conference transcripts", () => {
    const startBody = extractFunctionBody("startConferenceMode");
    const realtimeDataBody = extractFunctionBody("handleRealtimeInterpreterDataChannelMessage");
    const payloadBody = extractFunctionBody("handleConferenceModeTranslationPayload");
    const commitBody = extractFunctionBody("commitConferenceModePartialIfReady");
    const cleanupBody = extractFunctionBody("cleanupConferenceModeResources");

    expect(startBody).not.toContain("startConferenceModeAudioInput");
    expect(startBody).not.toContain("queueConferenceModeAudioFrame");
    expect(startBody).not.toContain("requestConferenceModeTranslation");
    expect(realtimeDataBody).toContain('realtimeTranslationOwner === "conference"');
    expect(realtimeDataBody).toContain("handleConferenceModeTranslationPayload(payload)");
    expect(payloadBody).not.toContain("response.create");
    expect(payloadBody).not.toContain("requestConferenceModeTranslation");
    expect(commitBody).toContain("appendConferenceModeTranscript(sourceText, translationText)");
    expect(cleanupBody).toContain("conferenceModeDataChannel = null");
    expect(cleanupBody).toContain("conferenceModePendingTranslationRequests = []");
    expect(cleanupBody).toContain("conferenceModeTranslationInFlight = false");
  });

  test("routes conference voice events away from live voice chat messages", () => {
    const listenerIndex = sidepanelSource.indexOf('if (event.type === "voice.output_audio.delta")');
    const conferenceIndex = sidepanelSource.indexOf("isConferenceModeVoiceEvent(event)");
    const liveIndex = sidepanelSource.indexOf('if (event.type === "voice.session.started")');

    expect(conferenceIndex).toBeGreaterThanOrEqual(0);
    expect(conferenceIndex).toBeGreaterThan(listenerIndex);
    expect(conferenceIndex).toBeLessThan(liveIndex);
    expect(sidepanelSource).toContain("handleConferenceModeVoiceEvent(event)");
  });

  test("injects the original conference transcript into the next chat prompt context", () => {
    const contextBody = extractFunctionBody("buildConversationContextHint");
    const activeBody = extractFunctionBody("isConferenceModeQuestionContextActive");

    expect(contextBody).toContain("buildTranscriptSourceOnlyContextHint");
    expect(contextBody).toContain("isConferenceModeQuestionContextActive()");
    expect(contextBody).toContain("state.conferenceMode.entries");
    expect(activeBody).toContain("entry.sourceText.trim()");
    expect(activeBody).toContain("state.conferenceMode.partialSourceText.trim()");
  });

  test("uses transcript context by default while preserving explicit conference attachments", () => {
    const sendPromptBody = extractFunctionBody("sendPrompt");
    const mentionBody = extractFunctionBody("getMentionOptionsForState");
    const attachmentActionBody = extractFunctionBody("handleAttachmentMenuAction");
    const contextActiveBody = extractFunctionBody("isConferenceModeQuestionContextActive");
    const conferenceViewBody = extractFunctionBody("renderConferenceModeView");

    expect(sendPromptBody).toContain("const transcriptQuestionContextActiveAtSubmit = isTranscriptQuestionContextActive()");
    expect(sendPromptBody).toContain("const transcriptQuestionContextActive = transcriptQuestionContextActiveAtSubmit");
    expect(sendPromptBody).toContain("resolveActiveTranscriptViewForPrompt()");
    expect(sendPromptBody).toContain("const nextAttachments = Array.from(state.attachments)");
    expect(sendPromptBody).toContain("selectedTextContext: createPromptSelectedTextContextPayload()");
    expect(sendPromptBody).toContain("fileAttachments: nextFileAttachments");
    expect(sendPromptBody).toContain("selectedTabIds: state.selectedTabIds");
    expect(sendPromptBody).toContain("suppressPageContext: transcriptQuestionContextActive || isCurrentTabContextDismissed()");
    expect(mentionBody).not.toContain("isConferenceModeQuestionContextActive()");
    expect(attachmentActionBody).not.toContain("getConferenceModeContextOnlyMessage()");
    expect(contextActiveBody).toContain("state.conferenceMode.viewActive");
    expect(contextActiveBody.indexOf("state.conferenceMode.viewActive")).toBeLessThan(
      contextActiveBody.indexOf("state.conferenceMode.entries.some"),
    );
    expect(contextActiveBody).toContain("entry.sourceText.trim()");
    expect(contextActiveBody).toContain("state.conferenceMode.partialSourceText.trim()");
    expect(conferenceViewBody).toContain("renderConferenceQuestionStream()");
    expect(sidepanelSource).toContain("function renderConferenceQuestionStream");
    expect(sidepanelSource).toContain("conference-chat-stream");
  });

  test("keeps a stop button visible while any unified live audio resource is running", () => {
    const panelBody = extractFunctionBody("renderConferenceModePanel");
    const runningBody = extractFunctionBody("isConferenceModeAudioSessionRunning");

    expect(panelBody).toContain("isConferenceModeAudioSessionRunning()");
    expect(panelBody).toContain('id="conference-mode-stop"');
    expect(runningBody).toContain("state.conferenceMode.active");
    expect(runningBody).toContain("state.conferenceMode.starting");
    expect(runningBody).toContain("state.conferenceMode.stopping");
    expect(runningBody).toContain('realtimeTranslationOwner === "conference"');
    expect(runningBody).toContain("realtimeInterpreterPeer");
    expect(runningBody).toContain("realtimeInterpreterStream");
    expect(runningBody).toContain("realtimeInterpreterDataChannel");
  });

  test("plays translated audio only when unified live playback is enabled", () => {
    const offerBody = extractFunctionBody("createRealtimeInterpreterWebRtcOffer");
    const peerBody = extractFunctionBody("attachRealtimeInterpreterPeerHandlers");
    const startBody = extractFunctionBody("startConferenceMode");

    expect(sidepanelSource).toContain("options: { playTranslatedAudio?: boolean } = {}");
    expect(sidepanelSource).toContain("playTranslatedAudio: options.playTranslatedAudio ?? true");
    expect(peerBody).toContain("if (!options.playTranslatedAudio)");
    expect(peerBody).toContain("return;");
    expect(startBody).toContain("playTranslatedAudio: livePlaybackEnabled");
  });

  test("keeps conference controls fixed while only transcript and chat panes scroll when pinned", () => {
    const panelBody = extractFunctionBody("renderConferenceModePanel");
    const renderBody = extractFunctionBody("renderNow");
    const scrollBody = extractFunctionBody("scrollConferenceTranscriptToBottom");
    const bindBody = extractFunctionBody("bindEvents");

    expect(panelBody).toContain('id="conference-transcript-scroll"');
    expect(renderBody).toContain("scrollConferenceTranscriptToBottom({ onlyIfPinned: true })");
    expect(scrollBody).toContain("conferenceTranscriptStickToBottom");
    expect(bindBody).toContain("#conference-transcript-scroll");
    expect(bindBody).toContain("handleConferenceTranscriptScroll");
    expect(sidepanelSource).toContain("function scrollConferenceTranscriptToBottom");
    expect(readFinalDeclaration(".conference-view", "overflow")).toBe("hidden");
    expect(readFinalDeclaration(".conference-mode-list", "overflow-y")).toBe("auto");
    expect(readFinalDeclaration(".conference-chat-stream", "overflow-y")).toBe("auto");
  });

  test("lets the chat menu exit conference mode without losing the transcript", () => {
    const menuViewBody = extractFunctionBody("switchMainViewFromMenu");
    const stopBody = extractFunctionBody("stopConferenceMode");
    const panelGateBody = extractFunctionBody("shouldRenderConferenceModePanel");

    expect(menuViewBody).toContain('view === "chat"');
    expect(menuViewBody).toContain("exitConferenceModeView");
    expect(stopBody).toContain("viewActive: options.keepViewActive");
    expect(stopBody).toContain("entries: options.preserveEntries ? state.conferenceMode.entries : []");
    expect(panelGateBody).toContain("state.conferenceMode.viewActive");
  });

  test("starts a fresh conference page from the header plus button", () => {
    const newConferenceBody = extractFunctionBody("startNewConferencePage");
    const stopBody = extractFunctionBody("stopConferenceMode");
    const clickIndex = sidepanelSource.indexOf('root.querySelector<HTMLButtonElement>("#new-chat")');
    const clickBody = sidepanelSource.slice(clickIndex, clickIndex + 650);

    expect(clickIndex).toBeGreaterThanOrEqual(0);
    expect(clickBody).toContain('state.activeView === "conference" || state.conferenceMode.viewActive');
    expect(clickBody).toContain("startNewConferencePage()");
    expect(newConferenceBody).toContain("stopConferenceMode({ notifyBridge: true, preserveEntries: true, keepViewActive: true })");
    expect(newConferenceBody).toContain('type: "conversation.new"');
    expect(newConferenceBody).toContain('state.activeView = "conference"');
    expect(newConferenceBody).toContain("createConferenceModeState()");
    expect(newConferenceBody).toContain("viewActive: true");
    expect(stopBody).toContain("cleanupConferenceModeResources()");
  });

  test("keeps the unified live panel visible for a fresh conference session and preserves the previous transcript first", () => {
    const panelGateBody = extractFunctionBody("shouldRenderConferenceModePanel");
    const newConferenceBody = extractFunctionBody("startNewConferencePage");

    expect(panelGateBody.trim()).toBe("return state.conferenceMode.viewActive;");
    expect(newConferenceBody).toContain("await persistConferenceConversationBeforeReset()");
    expect(newConferenceBody).toContain("stopConferenceMode({ notifyBridge: true, preserveEntries: true, keepViewActive: true })");
    expect(newConferenceBody).toContain("state.conferenceMode = {");
    expect(newConferenceBody).toContain("viewActive: true");
  });

  test("persists and restores conference/live mode as its own conversation history", () => {
    const persistBody = extractFunctionBody("persistConversation");
    const hydrateBody = extractFunctionBody("hydrateConversation");
    const recentClickIndex = sidepanelSource.indexOf('root.querySelectorAll<HTMLButtonElement>(".recent-chat")');
    const recentClickBody = sidepanelSource.slice(recentClickIndex, recentClickIndex + 650);

    expect(sidepanelSource).toContain("conferenceModesByConversationId");
    expect(sidepanelSource).toContain("function serializeConferenceModeForStorage");
    expect(sidepanelSource).toContain("function restoreConferenceModeFromConversation");
    expect(persistBody).toContain("const conferenceSnapshot = serializeConferenceModeForStorage()");
    expect(persistBody).toContain("conversationMode: conferenceSnapshot ? \"conference\" : \"chat\"");
    expect(persistBody).toContain("conferenceMode: conferenceSnapshot");
    expect(hydrateBody).toContain("restoreConferenceModeFromConversation(normalized)");
    expect(hydrateBody).toContain('state.activeView = "conference"');
    expect(recentClickBody).toContain("resolveMainViewForConversation(result.conversation)");
  });

  test("uses a compact transcript and translation layout without placeholder ellipses", () => {
    expect(readFinalDeclaration(".conference-mode-panel", "border")).toBe("1px solid var(--line)");
    expect(readFinalDeclaration(".conference-mode-entry", "grid-template-columns")).toBe("1fr");
    expect(readFinalDeclaration(".conference-mode-entry", "box-shadow")).toBe("none");
    expect(sidepanelSource).toContain("conference-mode-translation-pending");
    expect(sidepanelSource).not.toContain('entry.translationText || "…"');
  });

  test("shows a live audio waveform while conference mode is active", () => {
    const panelBody = extractFunctionBody("renderConferenceModePanel");
    const startBody = extractFunctionBody("startConferenceMode");
    const cleanupBody = extractFunctionBody("cleanupConferenceModeResources");

    expect(panelBody).toContain("conference-mode-waveform");
    expect(panelBody).toContain("renderComposerVoiceWaveform()");
    expect(startBody).toContain("startComposerVoiceWaveform(stream)");
    expect(cleanupBody).toContain("cleanupComposerVoiceWaveform()");
  });

  test("lets users opt into translated audio playback before starting unified live mode", () => {
    const panelBody = extractFunctionBody("renderConferenceModePanel");
    const bindBody = extractFunctionBody("bindConferenceModeControls");
    const startBody = extractFunctionBody("startConferenceMode");

    expect(sidepanelSource).toContain("livePlaybackEnabled: false");
    expect(panelBody).toContain('id="conference-live-playback-toggle"');
    expect(panelBody).toContain('role="switch"');
    expect(panelBody).toContain('aria-checked="${livePlaybackEnabled ? "true" : "false"}"');
    expect(panelBody).toContain("conference-mode-switch-track");
    expect(panelBody).toContain("isConferenceModeAudioSessionRunning()");
    expect(panelBody).toContain('${sessionRunning ? "disabled" : ""}');
    expect(bindBody).toContain("#conference-live-playback-toggle");
    expect(bindBody).toContain("state.realtimeInterpreter.livePlaybackEnabled = !state.realtimeInterpreter.livePlaybackEnabled");
    expect(startBody).toContain("requestRealtimeInterpreterDisplayAudioStream({");
    expect(startBody).toContain("suppressLocalAudioPlayback: livePlaybackEnabled");
    expect(startBody).toContain("playTranslatedAudio: livePlaybackEnabled");
    expect(sidepanelCss).toContain(".conference-mode-switch");
    expect(sidepanelCss).toContain(".conference-mode-switch-track");
  });

  test("uses start and stop wording for unified live mode audio capture", () => {
    const panelBody = extractFunctionBody("renderConferenceModePanel");

    expect(panelBody).toContain('id="conference-mode-start"');
    expect(panelBody).toContain("labels.start");
    expect(panelBody).toContain('id="conference-mode-stop"');
    expect(panelBody).not.toContain("labels.chooseAudio");
  });

  test("keeps interpreter settings available inside the unified live mode panel", () => {
    const panelBody = extractFunctionBody("renderConferenceModePanel");
    const bindBody = extractFunctionBody("bindConferenceModeControls");
    const hasOpenBody = extractFunctionBody("hasOpenFloatingSurface");
    const insideBody = extractFunctionBody("isInsideFloatingSurfaceInteraction");
    const closeBody = extractFunctionBody("closeFloatingSurfaces");

    expect(panelBody).toContain('id="conference-mode-settings-toggle"');
    expect(panelBody).toContain("conference-mode-settings-toggle");
    expect(panelBody).toContain('id="conference-mode-settings-popover"');
    expect(panelBody).toContain("conference-mode-settings-popover");
    expect(panelBody).toContain('aria-expanded="${state.realtimeInterpreter.settingsOpen ? "true" : "false"}"');
    expect(panelBody).toContain('${state.realtimeInterpreter.settingsOpen ? renderRealtimeInterpreterControls() : ""}');
    expect(bindBody).toContain("#conference-mode-settings-toggle");
    expect(bindBody).toContain("state.realtimeInterpreter.settingsOpen = !state.realtimeInterpreter.settingsOpen");
    expect(hasOpenBody).toContain("state.realtimeInterpreter.settingsOpen");
    expect(insideBody).toContain(".conference-mode-settings-toggle");
    expect(insideBody).toContain(".conference-mode-settings-popover");
    expect(closeBody).toContain("state.realtimeInterpreter.settingsOpen = false");
    expect(readFinalDeclaration(".conference-mode-panel", "position")).toBe("relative");
    expect(sidepanelCss).toContain(".conference-mode-settings-popover");
  });

  test("aligns unified live mode controls with the shared theme tokens", () => {
    expect(readFinalDeclaration(".conference-mode-actions", "align-items")).toBe("center");
    expect(readFinalDeclaration(".conference-mode-button", "min-height")).toBe("32px");
    expect(readFinalDeclaration(".conference-mode-button.primary", "background")).toContain("color-mix");
    expect(readFinalDeclaration(".conference-mode-settings-toggle", "width")).toBe("32px");
    expect(readFinalDeclaration(".conference-mode-settings-toggle", "height")).toBe("32px");
    expect(readFinalDeclaration(".conference-mode-settings-toggle", "padding")).toBe("0");
    expect(readFinalDeclaration(".realtime-interpreter-icon-button", "padding")).toBe("0");
    expect(readFinalDeclaration(".realtime-interpreter-icon-button", "line-height")).toBe("1");
  });

  test("preserves realtime failure details instead of replacing them with a generic update error", () => {
    const errorBody = extractFunctionBody("handleConferenceModeError");
    const cleanupBody = extractFunctionBody("cleanupConferenceModeResources");
    const voiceErrorBody = extractFunctionBody("toUserFacingVoiceStartError");

    expect(errorBody).toContain("rememberChatgptRealtimeEndpointFailure(message)");
    expect(errorBody).toContain("cleanupConferenceModeResources(message)");
    expect(cleanupBody).toContain("cancelPendingVoiceAnswer(reason)");
    expect(voiceErrorBody).toContain('? "conference" : "live"');
    expect(voiceErrorBody).toContain('getRealtimeApiKeyRequiredMessage(');
  });

  test("invalidates queued conference audio frames when live transcription is stopped", () => {
    const startAudioBody = extractFunctionBody("startConferenceModeAudioInput");
    const queueBody = extractFunctionBody("queueConferenceModeAudioFrame");
    const stopBody = extractFunctionBody("stopConferenceMode");
    const cleanupBody = extractFunctionBody("cleanupConferenceModeResources");

    expect(sidepanelSource).toContain("let conferenceModeAudioGeneration = 0");
    expect(startAudioBody).toContain("const audioGeneration = ++conferenceModeAudioGeneration");
    expect(startAudioBody).toContain("queueConferenceModeAudioFrame(threadId, samples, sourceSampleRate, audioGeneration)");
    expect(queueBody).toContain("audioGeneration !== conferenceModeAudioGeneration");
    expect(queueBody).toContain("!state.conferenceMode.active");
    expect(queueBody).toContain("state.conferenceMode.threadId !== threadId");
    expect(stopBody).toContain("conferenceModeAudioGeneration += 1");
    expect(cleanupBody).toContain("conferenceModeAudioGeneration += 1");
  });

  test("uses the available sidepanel width for conference transcript and chat panes", () => {
    expect(readFinalDeclaration(".conference-view", "padding")).toBe("0 6px 10px");
    expect(readFinalDeclaration(".conference-view-shell", "gap")).toBe("10px");
    expect(readFinalDeclaration(".conference-chat-section", "min-height")).toBe("170px");
    expect(readFinalDeclaration(".conference-message-stream", "max-width")).toBe("none");
    expect(readFinalDeclaration(".conference-message-stream", "gap")).toBe("14px");
  });

  test("lets users resize conference transcript and chat panes", () => {
    const conferenceViewBody = extractFunctionBody("renderConferenceModeView");
    const bindBody = extractFunctionBody("bindEvents");

    expect(sidepanelSource).toContain("conferencePaneSplitRatio");
    expect(conferenceViewBody).toContain("--conference-transcript-ratio");
    expect(conferenceViewBody).toContain("conference-pane-resizer");
    expect(conferenceViewBody).toContain('role="separator"');
    expect(bindBody).toContain("bindConferencePaneResizer()");
    expect(sidepanelCss).toContain(".conference-pane-resizer");
    expect(readFinalDeclaration(".conference-chat-stream", "padding")).toBe("12px");
  });
});
