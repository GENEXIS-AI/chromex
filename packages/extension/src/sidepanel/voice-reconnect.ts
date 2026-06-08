export interface VoiceReconnectInput {
  wasActive: boolean;
  requestedStop: boolean;
  attemptCount: number;
  maxAttempts: number;
  reason: string | null;
}

const TERMINAL_REASON_PATTERN =
  /(auth|sign.?in|login|required|permission|denied|cancel|unsupported|not available|does not support realtime conversation|codex\/realtime\/calls|unexpected status (?:403|404|501|503)|http error: (?:403|404|501|503)|not found|failed to update the voice session|invalid_offer|failed to parse offer|failed to unmarshal SDP)/iu;

export function shouldAutoReconnectVoice(input: VoiceReconnectInput): boolean {
  if (!input.wasActive || input.requestedStop) {
    return false;
  }

  if (input.attemptCount >= input.maxAttempts) {
    return false;
  }

  if (input.reason && TERMINAL_REASON_PATTERN.test(input.reason)) {
    return false;
  }

  return true;
}
