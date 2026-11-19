/**
 * DECK COMPOSITION (provisional).
 *
 * Lists which card definitions go into the shared draw pile and how many
 * copies of each. Change this to try different decks.
 */
import { CARD_DEFINITIONS } from './cards';

export interface DeckEntry {
  readonly defId: string;
  readonly copies: number;
}

/** One copy of each of the 40 sample cards. */
export const DECK_COMPOSITION: readonly DeckEntry[] = CARD_DEFINITIONS.map((d) => ({
  defId: d.id,
  copies: 1,
}));

export interface CardInstance {
  /** Unique within a game. Never derived from deck order. */
  readonly instanceId: string;
  readonly defId: string;
}

/** Creates one instance per copy. Ids are sequential here; deck order is shuffled separately. */
export function createInstances(composition: readonly DeckEntry[] = DECK_COMPOSITION): CardInstance[] {
  const instances: CardInstance[] = [];
  let n = 0;
  for (const entry of composition) {
    for (let i = 0; i < entry.copies; i++) {
      n++;
      instances.push({ instanceId: `c${String(n).padStart(3, '0')}`, defId: entry.defId });
    }
  }
  return instances;
}
