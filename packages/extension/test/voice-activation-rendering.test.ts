import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

function functionBody(name: string): string {
  const start = sidepanelSource.indexOf(`function ${name}`);
  if (start < 0) {
    return "";
  }

  const nextFunction = sidepanelSource.indexOf("\nfunction ", start + 1);
  return nextFunction < 0 ? sidepanelSource.slice(start) : sidepanelSource.slice(start, nextFunction);
}

describe("voice activation sequencing", () => {
  test("does not send microphone audio until the app-server reports realtime started", () => {
    const startBody = functionBody("startRealtimeVoiceSession");
    const eventBlockIndex = sidepanelSource.indexOf('event.type === "voice.session.started"');

    expect(sidepanelSource).toContain("activateRealtimeVoiceSession");
    expect(startBody).not.toContain("startRealtimeAudioInput(stream)");
    expect(startBody).toContain("waitForRealtimeVoiceStarted");
    expect(sidepanelSource.slice(eventBlockIndex, eventBlockIndex + 500)).toContain("activateRealtimeVoiceSession");
  });

  test("does not depend on browser speech recognition for app-server realtime voice", () => {
    const startBody = functionBody("startRealtimeVoiceSession");
    const activationBody = functionBody("activateRealtimeVoiceSession");

    expect(startBody).not.toContain("window.SpeechRecognition || window.webkitSpeechRecognition");
    expect(activationBody).not.toContain("browserVoiceFallbackActive");
    expect(activationBody).not.toContain('startVoiceRecognition("live")');
  });

  test("keeps early realtime disconnects on the reconnect path while startup is pending", () => {
    const startBody = functionBody("startRealtimeVoiceSession");
    const disconnectBody = functionBody("handleRealtimeVoiceDisconnect");
    const retryBody = functionBody("retryRealtimeVoiceSession");

    expect(disconnectBody).toContain("pendingVoiceStart");
    expect(startBody).toContain("voiceReconnectTimer !== null");
    expect(startBody).toContain("voiceReconnectAttempts > 0");
    expect(retryBody).toContain("!state.voiceEnabled");
  });

  test("starts live voice through browser WebRTC without browser speech fallback", () => {
    const startBody = functionBody("startRealtimeVoiceSession");
    const disconnectBody = functionBody("handleRealtimeVoiceDisconnect");
    const retryBody = functionBody("retryRealtimeVoiceSession");
    const offerBody = functionBody("createRealtimeVoiceWebRtcOffer");

    expect(sidepanelSource).toContain("function isRealtimeVoiceApiKeyRequired");
    expect(sidepanelSource).toContain("handleRealtimeApiKeyRequirement");
    expect(sidepanelSource).toContain("function isRealtimeVoiceAvailableForAccount");
    expect(functionBody("isRealtimeVoiceAvailableForAccount")).toContain("state.accountStatus?.codexAuthenticated");
    expect(functionBody("isRealtimeVoiceAvailableForAccount")).toContain('state.accountStatus.authMode === "apikey"');
    expect(sidepanelSource).toContain("function shouldShowRealtimeVoiceControls");
    expect(sidepanelSource).toContain("liveAvailable: shouldShowRealtimeVoiceControls()");
    expect(sidepanelSource).toContain("function renderComposerVoiceInputToggle");
    expect(startBody).toContain("createRealtimeVoiceWebRtcOffer(stream)");
    expect(offerBody).toContain("addTrack(audioTrack, stream)");
    expect(offerBody).toContain('createDataChannel("oai-events")');
    expect(startBody).toContain("buildRealtimeVoiceStartMessage");
    expect(startBody).toContain("waitForRealtimeVoiceAnswer");
    expect(startBody).toContain("setRemoteDescription");
    expect(startBody).toContain("getKnownChatgptRealtimeEndpointFailureReason()");
    expect(sidepanelSource).toContain('kind: "retry-live-voice"');
    expect(startBody).not.toContain("startBrowserVoiceFallbackIfPossible");
    expect(disconnectBody).not.toContain("startBrowserVoiceFallbackIfPossible");
    expect(retryBody).not.toContain("startBrowserVoiceFallbackIfPossible");
  });

  test("treats realtime closed reasons as actionable during startup, not as a silent stop", () => {
    const disconnectBody = functionBody("handleRealtimeVoiceDisconnect");

    expect(disconnectBody).toContain("const wasConnected = state.voiceEnabled");
    expect(disconnectBody).toContain("reason && !voiceStopRequested && isRealtimeVoiceApiKeyRequired(reason)");
    expect(disconnectBody).toContain("reason && !voiceStopRequested && isRealtimeVoiceStartupFatal(reason)");
    expect(disconnectBody).toContain("!hadError && reason && !voiceStopRequested && !wasConnected");
    expect(disconnectBody).toContain('state.actionStatus = ""');
  });

  test("does not loop reconnects for invalid realtime WebRTC offers", () => {
    const classifierBody = functionBody("isRealtimeVoiceStartupFatal");
    const retryBody = functionBody("retryRealtimeVoiceSession");

    expect(sidepanelSource).toContain("function isRealtimeVoiceStartupFatal");
    expect(classifierBody).toContain("invalid_offer");
    expect(classifierBody).toContain("failed to parse offer");
    expect(classifierBody).toContain("failed to unmarshal SDP");
    expect(retryBody).toContain("!isRealtimeVoiceStartupFatal(reason)");
  });

  test("surfaces invalid API-key realtime failures without reconnecting", () => {
    const invalidKeyClassifierBody = functionBody("isRealtimeVoiceInvalidApiKey");
    const disconnectBody = functionBody("handleRealtimeVoiceDisconnect");
    const errorBody = functionBody("toUserFacingVoiceStartError");

    expect(sidepanelSource).toContain("function isRealtimeVoiceInvalidApiKey");
    expect(invalidKeyClassifierBody).toContain("Incorrect API key");
    expect(invalidKeyClassifierBody).toContain("invalid_api_key");
    expect(functionBody("isRealtimeVoiceStartupFatal")).toContain("isRealtimeVoiceInvalidApiKey(reason)");
    expect(disconnectBody).toContain("getRealtimeInvalidApiKeyMessage");
    expect(errorBody).toContain("getRealtimeInvalidApiKeyMessage");
  });

  test("routes ChatGPT realtime 404 endpoint failures into API-key fallback messaging", () => {
    const requirementBody = functionBody("getRealtimeApiKeyRequiredMessage");
    const classifierBody = functionBody("isRealtimeVoiceApiKeyRequired");
    const startBody = functionBody("startRealtimeVoiceSession");
    const requirementHandlerBody = functionBody("handleRealtimeApiKeyRequirement");

    expect(sidepanelSource).toContain("function isRealtimeVoiceApiKeyFallbackEndpointUnavailable");
    expect(functionBody("isRealtimeVoiceApiKeyFallbackEndpointUnavailable")).toContain("404 Not Found");
    expect(requirementBody).toContain("API 키 모드로 전환해야");
    expect(requirementBody).toContain("realtime 음성 엔드포인트가 열려 있지 않습니다");
    expect(classifierBody).toContain("isRealtimeVoiceApiKeyFallbackEndpointUnavailable");
    expect(startBody).toContain("getKnownChatgptRealtimeEndpointFailureReason()");
    expect(requirementHandlerBody).not.toContain("account.login.start");
    expect(requirementHandlerBody).not.toContain("loginType: \"apiKey\"");
  });

  test("does not claim realtime voice events as the active chat thread", () => {
    const rememberBody = functionBody("rememberCurrentConversationThreadForBridgeEvent");
    const startParamsBody = functionBody("buildRealtimeVoiceStartMessage");

    expect(sidepanelSource).toContain("function isRealtimeVoiceBridgeEvent");
    expect(rememberBody).toContain("isRealtimeVoiceBridgeEvent(event)");
    expect(startParamsBody).not.toContain("threadId: state.threadId");
  });
});
