import type { ActionCard } from "@codex-sidepanel/shared";

const PROMPT_RESULT_ACTION_CARD_LIMIT = 6;

export function mergePromptResultActionCards(
  existingCards: ActionCard[],
  incomingCards: ActionCard[] | null | undefined,
): ActionCard[] {
  const incoming = incomingCards ?? [];
  if (!incoming.length) {
    return existingCards;
  }

  const seen = new Set<string>();
  const merged: ActionCard[] = [];
  for (const card of [...incoming, ...existingCards]) {
    if (!card.id || seen.has(card.id)) {
      continue;
    }
    seen.add(card.id);
    merged.push(card);
    if (merged.length >= PROMPT_RESULT_ACTION_CARD_LIMIT) {
      break;
    }
  }
  return merged;
}
