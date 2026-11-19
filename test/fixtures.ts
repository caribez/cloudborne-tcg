/**
 * Test-only helpers for building deterministic situations without relying on
 * lucky draws. They operate on plain state data and keep card conservation:
 * cards are moved between zones, never created. Never used by production code.
 */
import { expect } from 'vitest';
import { getCardDefinition } from '../src/shared/cards';
import { applyAction, checkConservation, setupGame } from '../src/shared/engine';
import { seededRng } from '../src/shared/random';
import type { Draft, GameAction, GameState, PlayTarget, Seat } from '../src/shared/types';

export const NAMES = ['Ada', 'Bo', 'Cy', 'Di'];
export const names = (n: number) => NAMES.slice(0, n);

export function newGame(n = 2, seed = 1): GameState {
  return setupGame({ playerNames: names(n), rng: seededRng(seed) });
}

function edit(state: GameState, fn: (d: Draft<GameState>) => void): GameState {
  const d = structuredClone(state) as Draft<GameState>;
  fn(d);
  return d;
}

/**
 * Moves one instance of each listed definition into `seat`'s hand: from the
 * draw pile if possible, otherwise from another hand (which gets the top deck
 * card instead, so hand sizes elsewhere stay the same).
 */
export function giveCards(state: GameState, seat: Seat, ...defIds: string[]): GameState {
  return edit(state, (d) => {
    for (const defId of defIds) {
      const i = d.drawPile.findIndex((id) => d.instances[id] === defId);
      if (i >= 0) {
        const [id] = d.drawPile.splice(i, 1);
        d.hands[seat]!.push(id!);
        continue;
      }
      const other = d.hands.findIndex((h, s) => s !== seat && h.some((id) => d.instances[id] === defId));
      if (other < 0) throw new Error(`no ${defId} available to give`);
      const hand = d.hands[other]!;
      const j = hand.findIndex((id) => d.instances[id] === defId);
      const replacement = d.drawPile.pop();
      if (replacement === undefined) throw new Error('deck empty');
      const [id] = hand.splice(j, 1, replacement);
      d.hands[seat]!.push(id!);
    }
  });
}

/** Moves cards of the listed definitions to the top of the draw pile (last listed = drawn first). */
export function stackDeck(state: GameState, ...defIds: string[]): GameState {
  return edit(state, (d) => {
    for (const defId of defIds) {
      const i = d.drawPile.findIndex((id) => d.instances[id] === defId);
      if (i < 0) throw new Error(`no ${defId} left in the draw pile`);
      const [id] = d.drawPile.splice(i, 1);
      d.drawPile.push(id!);
    }
  });
}

/** Replaces a family's Children with pool Children of the listed definitions (returns the old ones to the pool). */
export function setChildren(state: GameState, seat: Seat, ...defIds: string[]): GameState {
  return edit(state, (d) => {
    d.childPile.push(...d.children[seat]!);
    d.children[seat] = [];
    for (const defId of defIds) {
      const i = d.childPile.findIndex((id) => d.instances[id] === defId);
      if (i < 0) throw new Error(`no ${defId} left in the child pool`);
      const [id] = d.childPile.splice(i, 1);
      d.children[seat]!.push(id!);
    }
  });
}

export function setGold(state: GameState, seat: Seat, gold: number): GameState {
  return edit(state, (d) => {
    d.families[seat]!.gold = gold;
  });
}

export function setStandings(state: GameState, seat: Seat, standings: Partial<GameState['families'][number]['standings']>): GameState {
  return edit(state, (d) => {
    Object.assign(d.families[seat]!.standings, standings);
  });
}

/** Overwrites the pre-rolled income sequence (e.g. all 2s) for predictable Gold. */
export function setIncome(state: GameState, roll: number): GameState {
  return edit(state, (d) => {
    d.incomeRolls = d.incomeRolls.map(() => roll);
  });
}

/** The instance id of the first card of `defId` in `seat`'s hand. */
export function inHand(state: GameState, seat: Seat, defId: string): string {
  const id = state.hands[seat]!.find((i) => state.instances[i] === defId);
  if (!id) throw new Error(`${defId} not in hand of seat ${seat}`);
  return id;
}

export function defOf(state: GameState, id: string): string {
  return state.instances[id]!;
}

export function act(state: GameState, seat: Seat, action: GameAction): GameState {
  const r = applyAction(state, seat, action);
  if (!r.ok) throw new Error(`unexpected rejection (${r.rejection.code}): ${r.rejection.message}`);
  expect(checkConservation(r.state)).toEqual([]);
  return r.state;
}

export function rejection(state: GameState, seat: Seat, action: GameAction): { code: string; message: string } {
  const r = applyAction(state, seat, action);
  if (r.ok) throw new Error('expected a rejection');
  return r.rejection;
}

/** Plays the first `defId` card in `seat`'s hand. */
export function playDef(state: GameState, seat: Seat, defId: string, target?: PlayTarget): GameState {
  const cardId = inHand(state, seat, defId);
  return act(state, seat, target ? { type: 'play', cardId, target } : { type: 'play', cardId });
}

/** Ends turns until it is `seat`'s turn (at least one end turn unless already there and `force`). */
export function endTurnsUntil(state: GameState, seat: Seat): GameState {
  let s = state;
  do s = act(s, s.turn.activeSeat, { type: 'endTurn' });
  while (s.turn.activeSeat !== seat);
  return s;
}

export function standing(state: GameState, seat: Seat) {
  return state.families[seat]!.standings;
}

export function cardName(defId: string): string {
  return getCardDefinition(defId).name;
}
