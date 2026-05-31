import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const sidepanelCss = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8");
const normalizedSidepanelSource = sidepanelSource.replace(/\r\n/g, "\n");

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

describe("voice input and live action rendering", () => {
  test("separates dictation from live mode controls", () => {
    expect(sidepanelSource).toContain('id="voice-input-toggle"');
    expect(sidepanelSource).toContain('"live-toggle"');
    expect(sidepanelSource).toContain("function bindComposerPrimaryActionButton");
    expect(sidepanelSource).toContain("function toggleRealtimeVoiceFromComposer");
    expect(sidepanelSource).toContain('resolveComposerPrimaryAction');
    expect(sidepanelSource).toContain("didComposerPrimaryActionChangeForDraftInput");
    expect(sidepanelSource).toContain('renderUiIcon("audio-lines")');
    expect(sidepanelSource).not.toContain('id="voice-toggle"');
  });

  test("updates live/send action swaps without re-rendering the composer", () => {
    expect(sidepanelSource).toContain("function syncComposerPrimaryActionButton");
    expect(normalizedSidepanelSource).not.toContain(`if (primaryActionChanged) {
      renderSync();
      return;
    }`);
    expect(normalizedSidepanelSource).toContain(`if (primaryActionChanged) {
      syncComposerPrimaryActionButton();
    }`);
  });

  test("reuses composer autosize style metrics while the textarea DOM is stable", () => {
    const resizeBody = extractFunctionBody("resizeComposerTextarea");
    const firstRenderSyncIndex = sidepanelSource.indexOf("renderSync();");
    const metricsCacheIndex = sidepanelSource.indexOf("const composerTextareaAutosizeMetricsByElement");

    expect(sidepanelSource).toContain("composerTextareaAutosizeMetricsByElement");
    expect(sidepanelSource).toContain("function getComposerTextareaAutosizeMetrics");
    expect(metricsCacheIndex).toBeGreaterThanOrEqual(0);
    expect(firstRenderSyncIndex).toBeGreaterThanOrEqual(0);
    expect(metricsCacheIndex).toBeLessThan(firstRenderSyncIndex);
    expect(resizeBody).toContain("getComposerTextareaAutosizeMetrics(target)");
    expect(resizeBody).not.toContain("getComputedStyle(target)");
  });

  test("composer dictation updates the draft instead of sending prompts", () => {
    const dictationBody = extractFunctionBody("appendVoiceInputTranscriptToComposer");
    expect(dictationBody).toContain("state.composerDraft");
    expect(dictationBody).toContain("render()");
    expect(dictationBody).not.toContain("sendPrompt");
    expect(dictationBody).not.toContain("handleVoiceTranscript");
  });

  test("dictation uses a waveform confirmation panel before inserting transcript", () => {
    expect(sidepanelSource).toContain("renderComposerDictationPanel");
    expect(sidepanelSource).toContain("composer-dictation-waveform");
    expect(sidepanelSource).toContain('id="voice-dictation-cancel"');
    expect(sidepanelSource).toContain('id="voice-dictation-confirm"');
    expect(sidepanelSource).toContain("commitComposerVoiceInput");
    expect(sidepanelSource).toContain("cancelComposerVoiceInput");
    expect(sidepanelSource).toContain("startComposerVoiceWaveform");
  });

  test("dictation waveform paints bars without re-rendering the side panel", () => {
    const waveformBody = extractFunctionBody("updateComposerVoiceWaveform");
    expect(waveformBody).toContain("paintComposerVoiceWaveform()");
    expect(waveformBody).not.toContain("render()");
  });

  test("dictation confirmation waits for the final recognition result before committing", () => {
    const commitBody = extractFunctionBody("commitComposerVoiceInput");
    expect(commitBody).toContain("optimisticTranscript");
    expect(commitBody).toContain("await finalizeComposerVoiceInputForCommit()");
    expect(commitBody).toContain("appendVoiceInputTranscriptToComposer(transcript)");
    expect(sidepanelSource).toContain("COMPOSER_VOICE_STOP_FINALIZATION_TIMEOUT_MS");
    expect(sidepanelSource).toContain("activeRecognition.onresult = null");
  });

  test("shows hover tooltips for dictation and realtime voice controls", () => {
    expect(sidepanelSource).toContain("getVoiceInputTooltip");
    expect(sidepanelSource).toContain('data-tooltip="${escapeAttribute(getVoiceInputTooltip())}"');
    expect(sidepanelSource).toContain("getComposerPrimaryActionTooltip");
    expect(sidepanelCss).toContain(".composer-submit [data-tooltip]::after");
    expect(sidepanelCss).toContain(".composer-submit [data-tooltip]:hover::after");
  });

  test("does not auto-transcribe uploaded audio files before sending the prompt", () => {
    const sendPromptBody = extractFunctionBody("sendPrompt");

    expect(sendPromptBody).toContain("text: displayMessage || message");
    expect(sendPromptBody).toContain("const goalCommand = parseGoalCommand(message)");
    expect(sendPromptBody).toContain("const runtimeMessage = goalCommand?.objective ?? message");
    expect(sendPromptBody).toContain("message: runtimeMessage");
    expect(sendPromptBody).not.toContain("text: runtimeMessage");
    expect(sidepanelSource).not.toContain("transcribeAudioFileAttachmentsForPrompt");
    expect(sidepanelSource).not.toContain("transcribeAudioFileAttachment");
    expect(sidepanelSource).not.toContain("createAudioFileTranscriptionStream");
    expect(sidepanelSource).not.toContain("decodeAudioFileAttachment");
    expect(sidepanelSource).not.toContain("buildPromptWithAudioFileTranscripts");
    expect(sidepanelSource).not.toContain("AUDIO_FILE_TRANSCRIPTION_");
    expect(sidepanelSource).not.toContain('phase: "transcribing-audio"');
  });

  test("can route dictation through Codex app-server audio transcription for captured computer audio", () => {
    expect(sidepanelSource).toContain("startComposerRealtimeVoiceInput");
    expect(sidepanelSource).toContain("requestComputerAudioStreamForDictation");
    expect(sidepanelSource).toContain("createComposerRealtimeVoiceWebRtcOffer");
    expect(sidepanelSource).toContain('outputModality: "text"');
    expect(sidepanelSource).toContain("composerVoiceInputRealtimeSessionId");
    expect(sidepanelSource).toContain("handleComposerRealtimeTranscriptDone");
    expect(sidepanelSource).toContain("queueComposerRealtimeAudioFrame");
    expect(sidepanelSource).toContain('type: "dictation.transcription.start"');
    expect(sidepanelSource).toContain('type: "dictation.transcription.append_audio"');
    expect(sidepanelSource).toContain('type: "dictation.transcription.stop"');

    const dictationStartBody = extractFunctionBody("startComposerRealtimeVoiceInput");
    const dictationWebRtcBody = extractFunctionBody("startComposerRealtimeVoiceInputWithWebRtc");
    const dictationOfferIndex = sidepanelSource.indexOf("async function createComposerRealtimeVoiceWebRtcOffer");
    const dictationAudioBody = extractFunctionBody("queueComposerRealtimeAudioFrame");
    const dictationStopBody = extractFunctionBody("stopComposerRealtimeVoiceInputSession");
    expect(dictationStartBody).toContain("shouldUseComposerRealtimeWebRtcDictation()");
    expect(dictationWebRtcBody).toContain("sdp,");
    expect(dictationOfferIndex).toBeGreaterThanOrEqual(0);
    expect(sidepanelSource.slice(dictationOfferIndex, dictationOfferIndex + 600)).toContain(
      "addTrack(audioTrack, stream)",
    );
    expect(sidepanelSource.slice(dictationOfferIndex, dictationOfferIndex + 600)).toContain(
      'createDataChannel("oai-events")',
    );
    expect(sidepanelSource.slice(dictationOfferIndex, dictationOfferIndex + 600)).toContain(
      "attachComposerRealtimeVoiceDataChannelHandlers",
    );
    expect(dictationStartBody).not.toContain('type: "voice.session.start"');
    expect(dictationAudioBody).not.toContain('type: "voice.session.append_audio"');
    expect(dictationStopBody).not.toContain('type: "voice.session.stop"');
  });

  test("waits for queued realtime audio sends and late transcripts before closing dictation", () => {
    const finalizeBody = extractFunctionBody("finalizeComposerRealtimeVoiceInputForCommit");
    const queueBody = extractFunctionBody("queueComposerRealtimeAudioFrame");
    const doneBody = extractFunctionBody("handleComposerRealtimeTranscriptDone");
    const resetBody = extractFunctionBody("resetComposerRealtimeAudioResponseTracking");

    expect(sidepanelSource).toContain("composerVoiceInputRealtimeAudioChunksSent");
    expect(sidepanelSource).toContain("composerVoiceInputRealtimeLastAudioSentAt");
    expect(sidepanelSource).toContain("composerVoiceInputRealtimeLastTranscriptAt");
    expect(queueBody).toContain("composerVoiceInputRealtimeAudioChunksSent += 1");
    expect(queueBody).toContain("composerVoiceInputRealtimeLastAudioSentAt = Date.now()");
    expect(doneBody).toContain("composerVoiceInputRealtimeLastTranscriptAt = Date.now()");
    expect(finalizeBody).toContain("const audioSendChain = composerVoiceInputRealtimeAudioSendChain");
    expect(finalizeBody).toContain("await audioSendChain.catch(() => undefined)");
    expect(finalizeBody.indexOf("await stopComposerRealtimeVoiceInputSession(threadIdForStop)")).toBeLessThan(
      finalizeBody.indexOf("await waitForComposerRealtimeTranscriptAfterAudioFlush()"),
    );
    expect(finalizeBody).toContain("await waitForComposerRealtimeTranscriptAfterAudioFlush()");
    expect(resetBody).toContain("composerVoiceInputRealtimeAudioChunksSent = 0");
  });

  test("uses smaller realtime audio chunks to reduce transcription latency", () => {
    expect(sidepanelSource).toContain("const REALTIME_AUDIO_CHUNK_MS = 120");
  });

  test("reads WebRTC realtime data channel transcript events into composer dictation", () => {
    const attachBody = extractFunctionBody("attachComposerRealtimeVoiceDataChannelHandlers");
    const resetBody = extractFunctionBody("resetComposerVoiceInputTranscript");
    const appendBody = extractFunctionBody("appendComposerVoiceInputFinalTranscript");
    const interimBody = extractFunctionBody("updateComposerVoiceInputInterimTranscript");

    expect(attachBody).toContain("channel.onmessage");
    expect(attachBody).toContain("handleComposerRealtimeVoiceDataChannelMessage(event.data)");
    expect(sidepanelSource).toContain("conversation.item.input_audio_transcription.delta");
    expect(sidepanelSource).toContain("conversation.item.input_audio_transcription.completed");
    expect(sidepanelSource).toContain("response.output_text.delta");
    expect(sidepanelSource).toContain("response.output_audio_transcript.done");
    expect(sidepanelSource).toContain("composerVoiceInputRealtimeDataChannelTranscriptsActive");
    expect(sidepanelSource).toContain("dictation.webrtc.data_channel.transcript");
    expect(sidepanelSource).toContain('payload.delta, "replace"');
    expect(sidepanelSource).toContain('transcript.deltaMode === "replace"');
    expect(sidepanelSource).toContain("updateComposerVoiceInputInterimTranscript(transcript.text)");
    expect(sidepanelSource).toContain("mergeComposerVoiceInputTranscript");
    expect(sidepanelSource).toContain("trimComposerVoiceInputTranscriptOverlap");
    expect(sidepanelSource).toContain("findComposerVoiceInputTranscriptOverlap");
    expect(sidepanelSource).toContain("findComposerVoiceInputTranscriptPrefixOverlapInTail");
    expect(sidepanelSource).toContain("collapseComposerVoiceInputTranscriptRepetitions");
    expect(sidepanelSource).toContain("findComposerVoiceInputTranscriptRepeatedSpan");
    expect(sidepanelSource).toContain("getComposerVoiceInputTranscriptTokens");
    expect(appendBody).toContain("collapseComposerVoiceInputTranscriptRepetitions(merged)");
    expect(sidepanelSource).toContain("return collapseComposerVoiceInputTranscriptRepetitions(transcript)");
    expect(interimBody).toContain("trimComposerVoiceInputTranscriptOverlap(current, text)");
    expect(resetBody).toContain("composerVoiceInputRealtimeDataChannelTranscriptsActive = false");
  });

  test("tries app-server microphone dictation before falling back to browser speech recognition", () => {
    const microphoneBody = extractFunctionBody("startComposerVoiceInput");
    const realtimeMicBody = extractFunctionBody("tryStartComposerRealtimeMicrophoneDictation");
    expect(sidepanelSource).toContain("shouldUseComposerRealtimeMicrophoneDictation");
    expect(microphoneBody).toContain("await tryStartComposerRealtimeMicrophoneDictation(options)");
    expect(microphoneBody).toContain("window.SpeechRecognition || window.webkitSpeechRecognition");
    expect(realtimeMicBody).toContain("getMicrophoneStreamForVoice()");
    expect(realtimeMicBody).toContain("await startComposerRealtimeVoiceInputWithWebRtc(stream)");
    expect(realtimeMicBody).toContain("shouldFallbackMicrophoneDictationToBrowserSpeech");
  });

  test("tries browser WebRTC tab audio dictation before requesting API-key fallback", () => {
    const dictationStartIndex = sidepanelSource.indexOf("async function startComposerRealtimeVoiceInput");
    const authCheckIndex = sidepanelSource.indexOf("handleRealtimeApiKeyRequirement", dictationStartIndex);
    const pickerIndex = sidepanelSource.indexOf("requestComputerAudioStreamForDictation", dictationStartIndex);
    const webRtcIndex = sidepanelSource.indexOf("shouldUseComposerRealtimeWebRtcDictation", dictationStartIndex);
    const dictationStartBody = extractFunctionBody("startComposerRealtimeVoiceInput");

    expect(dictationStartIndex).toBeGreaterThanOrEqual(0);
    expect(authCheckIndex).toBeGreaterThanOrEqual(0);
    expect(pickerIndex).toBeGreaterThan(dictationStartIndex);
    expect(webRtcIndex).toBeGreaterThan(dictationStartIndex);
    expect(dictationStartBody).toContain("getKnownChatgptRealtimeEndpointFailureReason()");
    expect(sidepanelSource).toContain('kind: "retry-composer-dictation"');
  });

  test("keeps the display capture video track alive while transcribing tab audio", () => {
    const captureBody = extractFunctionBody("requestComputerAudioStreamForDictation");

    expect(captureBody).toContain("getDisplayMedia");
    expect(captureBody).not.toContain("stream.getVideoTracks().forEach((track) => track.stop());");
    expect(captureBody).toContain("stream.getTracks().forEach((track) => track.stop());");
  });

  test("requests system audio for window and full-screen display capture", () => {
    const captureBody = extractFunctionBody("requestComputerAudioStreamForDictation");
    const optionsBody = extractFunctionBody("createComputerAudioDisplayMediaOptions");

    expect(captureBody).toContain("createComputerAudioDisplayMediaOptions()");
    expect(optionsBody).toContain('systemAudio: "include"');
    expect(optionsBody).toContain('windowAudio: "system"');
    expect(optionsBody).toContain('surfaceSwitching: "include"');
    expect(optionsBody).toContain("suppressLocalAudioPlayback: false");
  });

  test("falls back to extension desktop capture when web display capture does not provide window or screen audio", () => {
    const captureBody = extractFunctionBody("requestComputerAudioStreamForDictation");
    const fallbackBody = extractFunctionBody("requestDesktopCaptureAudioStreamForDictation");
    const constraintsBody = extractFunctionBody("createDesktopCaptureMediaConstraints");
    const noAudioBody = extractFunctionBody("getComputerAudioCaptureNoAudioMessage");
    const silentBody = extractFunctionBody("getComputerAudioCaptureSilentMessage");

    expect(sidepanelSource).toContain("chrome.desktopCapture.chooseDesktopMedia");
    expect(sidepanelSource).toContain("requestDesktopCaptureAudioStreamForDictation");
    expect(captureBody).toContain("tryRequestDesktopCaptureAudioStreamForDictation(displaySurface)");
    expect(sidepanelSource).toContain('chooseDesktopMedia(["screen", "window", "tab", "audio"]');
    expect(sidepanelSource).toContain("options?.canRequestAudioTrack");
    expect(constraintsBody).toContain("chromeMediaSource: \"desktop\"");
    expect(constraintsBody).toContain("chromeMediaSourceId: streamId");
    expect(noAudioBody).toContain("getComputerAudioCaptureFallbackAdvice(displaySurface)");
    expect(silentBody).toContain("getComputerAudioCaptureFallbackAdvice(displaySurface)");
  });

  test("boosts low-level window and full-screen capture audio before transcription", () => {
    const captureBody = extractFunctionBody("requestComputerAudioStreamForDictation");
    const boostBody = extractFunctionBody("createBoostedComputerAudioStream");
    const gainBody = extractFunctionBody("getComputerAudioCaptureGain");

    expect(captureBody).toContain("prepareComputerAudioStreamForDictation(stream)");
    expect(sidepanelSource).toContain("composerVoiceInputAudioBoostContext");
    expect(sidepanelSource).toContain("cleanupComposerVoiceInputAudioBoost()");
    expect(gainBody).toContain('case "monitor"');
    expect(gainBody).toContain('case "window"');
    expect(gainBody).toContain("COMPUTER_AUDIO_CAPTURE_BOOST_GAIN");
    expect(boostBody).toContain("createGain()");
    expect(boostBody).toContain("gainNode.gain.value = gain");
    expect(boostBody).toContain("createDynamicsCompressor()");
    expect(boostBody).toContain("createMediaStreamDestination()");
    expect(boostBody).toContain("destination.stream.getAudioTracks()[0]");
  });

  test("keeps Chrome system loopback audio direct instead of replacing it with a WebAudio destination track", () => {
    const prepareBody = extractFunctionBody("prepareComputerAudioStreamForDictation");
    const bypassBody = extractFunctionBody("shouldBypassComputerAudioBoost");

    expect(prepareBody).toContain("shouldBypassComputerAudioBoost(stream)");
    expect(bypassBody).toContain('label.includes("system audio")');
    expect(bypassBody).toContain('deviceId === "loopback"');
    expect(sidepanelSource).toContain("dictation.display_audio.boost_skipped");
  });

  test("shows connection and finalization progress instead of waveform during realtime dictation handshakes", () => {
    const panelBody = extractFunctionBody("renderComposerDictationPanel");
    const realtimeStartBody = extractFunctionBody("startComposerRealtimeVoiceInput");
    const realtimeWebRtcBody = extractFunctionBody("startComposerRealtimeVoiceInputWithWebRtc");
    const finalizeBody = extractFunctionBody("finalizeComposerRealtimeVoiceInputForCommit");

    expect(sidepanelSource).toContain('type ComposerVoiceInputPhase = "idle" | "starting" | "listening" | "stopping"');
    expect(panelBody).toContain("composer-dictation-progress");
    expect(panelBody).toContain("getComposerDictationProgressLabel");
    expect(realtimeStartBody).toContain('composerVoiceInputPhase = "starting"');
    expect(realtimeStartBody).toContain("startComposerVoiceInputListening(stream)");
    expect(sidepanelSource).toContain(
      "async function startComposerRealtimeVoiceInputWithWebRtc(stream: MediaStream): Promise<boolean>",
    );
    expect(realtimeWebRtcBody).toContain("return true;");
    expect(realtimeWebRtcBody).toContain("return false;");
    expect(finalizeBody).toContain('composerVoiceInputPhase = "stopping"');
    expect(finalizeBody).toContain("render()");
    expect(finalizeBody).toContain("cleanupComposerVoiceWaveform()");
  });

  test("warns when display capture provides no audio or a silent audio track", () => {
    const captureBody = extractFunctionBody("requestComputerAudioStreamForDictation");
    const waveformBody = extractFunctionBody("startComposerVoiceWaveform");
    const updateBody = extractFunctionBody("updateComposerVoiceWaveform");
    const monitorBody = extractFunctionBody("startComposerVoiceInputSilenceMonitor");
    const cleanupBody = extractFunctionBody("cleanupComposerVoiceWaveform");

    expect(captureBody).toContain("getComputerAudioCaptureNoAudioMessage(displaySurface)");
    expect(sidepanelSource).toContain("logComputerAudioCaptureDiagnostics(stream, \"selected\")");
    expect(waveformBody).toContain("composerVoiceInputAudioContext.resume()");
    expect(waveformBody).toContain("startComposerVoiceInputSilenceMonitor(stream)");
    expect(updateBody).toContain("composerVoiceInputLastAudibleAt = Date.now()");
    expect(monitorBody).toContain("getComputerAudioCaptureSilentMessage");
    expect(monitorBody).toContain("logComputerAudioCaptureDiagnostics(stream, \"silent\")");
    expect(cleanupBody).toContain("composerVoiceInputSilenceWarningTimer");
  });

  test("treats realtime dictation assistant transcript output as recognized text", () => {
    const deltaBody = extractFunctionBody("handleComposerRealtimeTranscriptDelta");
    const doneBody = extractFunctionBody("handleComposerRealtimeTranscriptDone");

    expect(deltaBody).not.toContain('event.role !== "user"');
    expect(doneBody).not.toContain('event.role !== "user"');
    expect(doneBody).toContain("appendComposerVoiceInputFinalTranscript(text)");
  });

  test("stops retrying ChatGPT realtime dictation after the endpoint is known unavailable", () => {
    const dictationSelectorBody = extractFunctionBody("shouldUseComposerRealtimeWebRtcDictation");
    const microphoneSelectorBody = extractFunctionBody("shouldUseComposerRealtimeMicrophoneDictation");

    expect(dictationSelectorBody).toContain("getKnownChatgptRealtimeEndpointFailureReason()");
    expect(microphoneSelectorBody).toContain("getKnownChatgptRealtimeEndpointFailureReason()");
  });

  test("uses browser WebRTC for captured tab audio when API-key auth is active", () => {
    const dictationSelectorBody = extractFunctionBody("shouldUseComposerRealtimeWebRtcDictation");

    expect(dictationSelectorBody).toContain("window.RTCPeerConnection");
    expect(dictationSelectorBody).toContain("navigator.mediaDevices?.getDisplayMedia");
    expect(dictationSelectorBody).toContain('state.accountStatus.authMode === "apikey"');
    expect(dictationSelectorBody).toContain("return true;");
    expect(dictationSelectorBody).toContain("return !getKnownChatgptRealtimeEndpointFailureReason();");
  });

  test("retries dictation through the current selected input source after API-key setup", () => {
    const dialogSubmitBody = extractFunctionBody("submitNativeTextDialog");
    expect(dialogSubmitBody).toContain('afterSubmit?.kind === "retry-composer-dictation"');
    expect(dialogSubmitBody).toContain("await startComposerVoiceInput({ target: afterSubmit.target });");
    expect(dialogSubmitBody).not.toContain("await startComposerRealtimeVoiceInput({ target: afterSubmit.target });");
  });

  test("intercepts dictation realtime events before general live voice activation", () => {
    const dictationStartIndex = sidepanelSource.indexOf("isComposerRealtimeVoiceInputStartedEvent(event)");
    const liveStartIndex = sidepanelSource.indexOf('event.type === "voice.session.started"', dictationStartIndex + 1);
    const dictationReturnIndex = sidepanelSource.indexOf("return;", dictationStartIndex);
    const dictationEventBody = extractFunctionBody("isComposerRealtimeVoiceInputEvent");

    expect(dictationStartIndex).toBeGreaterThanOrEqual(0);
    expect(liveStartIndex).toBeGreaterThan(dictationStartIndex);
    expect(dictationReturnIndex).toBeGreaterThan(dictationStartIndex);
    expect(dictationReturnIndex).toBeLessThan(liveStartIndex);
    expect(dictationEventBody).toContain("composerVoiceInputRealtimeSessionId");
    expect(dictationEventBody).toContain("event.sessionId === composerVoiceInputRealtimeSessionId");
  });
});
