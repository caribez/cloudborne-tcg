/**
 * DECK COMPOSITION (provisional demo distribution) and card instances.
 *
 * The main deck and the Child pool are listed explicitly here. Change the
 * `copies` numbers to try different decks. The equal-copy distribution is a
 * demo convenience, not balancing.
 */
import { CHARACTERS, CHILDREN, INSTANTS, SCHEMES } from './cards';
import type { Rng } from './random';

export interface DeckEntry {
  readonly defId: string;
  readonly copies: number;
}

const copies = (n: number, defs: readonly { id: string }[]): DeckEntry[] => defs.map((d) => ({ defId: d.id, copies: n }));

/** Shared main deck: 4 copies of every Character, Scheme and Instant (44 + 36 + 16 = 96 cards). */
export const MAIN_DECK: readonly DeckEntry[] = [...copies(4, CHARACTERS), ...copies(4, SCHEMES), ...copies(4, INSTANTS)];

/** Separate Child pool: 4 copies of each Child (12), enough for 2 Children × 4 families. */
export const CHILD_POOL: readonly DeckEntry[] = copies(4, CHILDREN);

export interface CardInstance {
  /** Unique within a game, opaque: reveals nothing about the definition or deck position. */
  readonly instanceId: string;
  readonly defId: string;
}

/** Produces a fresh instance id each call. */
export type IdSource = () => string;

/**
 * Opaque ids drawn from the injected Rng ("k" + 10 base-36 characters). With a
 * crypto Rng they are unpredictable; with a seeded Rng they are reproducible
 * for tests. Either way they carry no relation to definitions or deck order.
 */
export function opaqueIdSource(rng: Rng): IdSource {
  const used = new Set<string>();
  return () => {
    for (;;) {
      const hi = Math.floor(rng() * 36 ** 5);
      const lo = Math.floor(rng() * 36 ** 5);
      const id = `k${hi.toString(36).padStart(5, '0')}${lo.toString(36).padStart(5, '0')}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };
}

/** Creates one instance per copy, each with an id from `newId`. */
export function createInstances(composition: readonly DeckEntry[], newId: IdSource): CardInstance[] {
  const instances: CardInstance[] = [];
  for (const entry of composition) {
    for (let i = 0; i < entry.copies; i++) instances.push({ instanceId: newId(), defId: entry.defId });
  }
  return instances;
}
