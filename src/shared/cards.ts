/**
 * SAMPLE CARD DEFINITIONS (placeholder content).
 *
 * A definition describes what a card *is*. Individual physical copies in a game
 * are CardInstances (see deck.ts), each with a unique instance id.
 *
 * Edit this file to change card names, suits, values or text. Card effects are
 * deliberately absent: the provisional rules give cards no abilities yet.
 */

export type SuitId = 'sun' | 'moon' | 'star' | 'cloud';

export interface SuitInfo {
  readonly id: SuitId;
  readonly name: string;
  /** Glyph drawn on generated placeholder textures. Plain text, no font files needed. */
  readonly glyph: string;
  /** Base colour for generated textures and UI accents (CSS colour string). */
  readonly color: string;
}

export const SUITS: Readonly<Record<SuitId, SuitInfo>> = {
  sun: { id: 'sun', name: 'Sun', glyph: '☀', color: '#d9822b' },
  moon: { id: 'moon', name: 'Moon', glyph: '☾', color: '#5b6fb5' },
  star: { id: 'star', name: 'Star', glyph: '★', color: '#a1832c' },
  cloud: { id: 'cloud', name: 'Cloud', glyph: '☁', color: '#4c8a8a' },
};

export interface CardDefinition {
  readonly id: string;
  readonly name: string;
  readonly suit: SuitId;
  readonly value: number;
  /** Rules text shown on inspection. Placeholder until card effects are designed. */
  readonly text: string;
}

function makeSuit(suit: SuitId, count: number): CardDefinition[] {
  const cards: CardDefinition[] = [];
  for (let value = 1; value <= count; value++) {
    cards.push({
      id: `${suit}-${value}`,
      name: `${SUITS[suit].name} ${value}`,
      suit,
      value,
      text: 'Placeholder card. No effect yet.',
    });
  }
  return cards;
}

/** 4 suits × values 1–10 = 40 distinct placeholder definitions. */
export const CARD_DEFINITIONS: readonly CardDefinition[] = [
  ...makeSuit('sun', 10),
  ...makeSuit('moon', 10),
  ...makeSuit('star', 10),
  ...makeSuit('cloud', 10),
];

const byId = new Map(CARD_DEFINITIONS.map((d) => [d.id, d]));

export function getCardDefinition(defId: string): CardDefinition {
  const def = byId.get(defId);
  if (!def) throw new Error(`Unknown card definition: ${defId}`);
  return def;
}

export function hasCardDefinition(defId: string): boolean {
  return byId.has(defId);
}
