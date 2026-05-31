const RECOVERABLE_TURN_STEER_PATTERNS = [
  "no active turn to steer",
  "no active turn",
  "turn is not active",
  "active turn not found",
];

export function isRecoverableTurnSteerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  return RECOVERABLE_TURN_STEER_PATTERNS.some((pattern) => normalized.includes(pattern));
}
