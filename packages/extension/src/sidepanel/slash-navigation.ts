export type SlashCommandDirection = "down" | "up";

export function isSlashCommandArrowKey(key: string): key is "ArrowDown" | "ArrowUp" {
  return key === "ArrowDown" || key === "ArrowUp";
}

export function clampSlashCommandIndex(index: number, optionCount: number): number {
  if (optionCount <= 0) {
    return 0;
  }

  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(index), optionCount - 1));
}

export function getNextSlashCommandIndex(
  currentIndex: number,
  optionCount: number,
  direction: SlashCommandDirection,
): number {
  if (optionCount <= 0) {
    return 0;
  }

  const current = clampSlashCommandIndex(currentIndex, optionCount);
  if (direction === "down") {
    return (current + 1) % optionCount;
  }
  return (current - 1 + optionCount) % optionCount;
}
