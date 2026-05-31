export function createRealtimeVoiceContextAppendText(input: {
  transcript: string;
  contextPrompt: string;
  includeTranscript: boolean;
}): string {
  const context = input.contextPrompt.trim();
  const transcript = input.transcript.trim();
  if (!context) {
    return transcript;
  }

  const parts = [
    "<live_voice_screen_context>",
    "Use this context for the user's current spoken request. Do not describe this wrapper or mention internal context collection.",
    "Answer the latest spoken request now from the attached page and screen evidence. Do not promise a later follow-up or preparation; give the actual answer in this response.",
    input.includeTranscript
      ? "The spoken request is included below."
      : "The spoken request is also carried by realtime audio; the text copy below is the same user request for routing and context grounding. Produce one direct answer.",
    context,
    "</live_voice_screen_context>",
  ];

  if (transcript) {
    parts.push("<spoken_user_request>", transcript, "</spoken_user_request>");
  }

  return parts.join("\n");
}
