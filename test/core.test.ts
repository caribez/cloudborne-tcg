import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS } from '../src/shared/cards';
import { applyAction, checkConservation, locateCard, parseAction, setupGame } from '../src/shared/engine';
import { resolvePlacement, TABLE_BOUNDS } from '../src/shared/placement';
import { seededRng } from '../src/shared/random';
import { PROVISIONAL_RULES } from '../src/shared/rules';
import type { GameAction, GameState } from '../src/shared/types';

const names = (n: number) => ['Ada', 'Bo', 'Cy', 'Di'].slice(0, n);
const newGame = (n = 2, seed = 1) => setupGame({ playerNames: names(n), rng: seededRng(seed) });

function act(state: GameState, seat: number, action: GameAction): GameState {
  const r = applyAction(state, seat, action);
  if (!r.ok) throw new Error(`unexpected rejection: ${r.rejection.message}`);
  expect(checkConservation(r.state)).toEqual([]);
  return r.state;
}
function rejectCode(state: GameState, seat: number, action: GameAction): string {
  const r = applyAction(state, seat, action);
  if (r.ok) throw new Error('expected rejection');
  return r.rejection.code;
}
const play = (cardId: string, x = 0, y = 0): GameAction => ({ type: 'play', cardId, x, y, rotation: 0 });

describe('setup', () => {
  it('has 40 distinct placeholder cards', () => {
    expect(CARD_DEFINITIONS).toHaveLength(40);
    expect(new Set(CARD_DEFINITIONS.map((d) => d.id)).size).toBe(40);
  });

  for (const n of [2, 3, 4]) {
    it(`deals five cards to each of ${n} players`, () => {
      const s = newGame(n);
      expect(s.players.map((p) => p.name)).toEqual(names(n));
      expect(s.hands).toHaveLength(n);
      for (const h of s.hands) expect(h).toHaveLength(PROVISIONAL_RULES.initialHandSize);
      expect(s.drawPile).toHaveLength(40 - 5 * n);
      expect(s.table).toEqual([]);
      expect(s.turn).toEqual({ activeSeat: 0, number: 1, drawsThisTurn: 0, playsThisTurn: 0 });
      expect(checkConservation(s)).toEqual([]);
    });
  }

  it('rejects 1 or 5 players', () => {
    expect(() => setupGame({ playerNames: ['A'], rng: seededRng(1) })).toThrow();
    expect(() => setupGame({ playerNames: ['A', 'B', 'C', 'D', 'E'], rng: seededRng(1) })).toThrow();
  });

  it('is reproducible from the injected RNG and differs across seeds', () => {
    expect(newGame(3, 42)).toEqual(newGame(3, 42));
    expect(newGame(3, 42).drawPile).not.toEqual(newGame(3, 43).drawPile);
  });

  it('cleans player names', () => {
    const s = setupGame({ playerNames: ['  ', 'x'.repeat(50)], rng: seededRng(1) });
    expect(s.players[0]!.name).toBe('Player 1');
    expect(s.players[1]!.name).toHaveLength(20);
  });
});

describe('turn actions', () => {
  it('allows draw then play, in either order, then end turn', () => {
    let s = newGame();
    const top = s.drawPile[s.drawPile.length - 1]!;
    s = act(s, 0, { type: 'draw' });
    expect(s.hands[0]).toContain(top);
    expect(locateCard(s, top)).toEqual({ zone: 'hand', seat: 0, index: 5 });
    s = act(s, 0, play(top, 10, 5));
    expect(locateCard(s, top)).toEqual({ zone: 'table', index: 0 });
    expect(s.table[0]).toMatchObject({ instanceId: top, x: 10, y: 5, faceUp: true, playedBy: 0, order: 1 });
    s = act(s, 0, { type: 'endTurn' });
    expect(s.turn).toEqual({ activeSeat: 1, number: 2, drawsThisTurn: 0, playsThisTurn: 0 });

    // Seat 1: play first, then draw.
    s = act(s, 1, play(s.hands[1]![0]!));
    s = act(s, 1, { type: 'draw' });
    expect(s.hands[1]).toHaveLength(5);
  });

  it('allows ending a turn without drawing or playing', () => {
    const s = act(newGame(), 0, { type: 'endTurn' });
    expect(s.turn.activeSeat).toBe(1);
  });

  it('enforces the one-draw and one-play limits', () => {
    let s = act(newGame(), 0, { type: 'draw' });
    expect(rejectCode(s, 0, { type: 'draw' })).toBe('draw-limit');
    s = act(s, 0, play(s.hands[0]![0]!));
    expect(rejectCode(s, 0, play(s.hands[0]![0]!))).toBe('play-limit');
  });

  it('rejects acting out of turn without changing state', () => {
    const s = newGame(3);
    for (const a of [{ type: 'draw' }, { type: 'endTurn' }, play(s.hands[1]![0]!)] as GameAction[]) {
      expect(rejectCode(s, 1, a)).toBe('not-your-turn');
    }
  });

  it('rejects playing a card not in your own hand', () => {
    const s = newGame();
    expect(rejectCode(s, 0, play(s.hands[1]![0]!))).toBe('card-not-in-hand');
    expect(rejectCode(s, 0, play(s.drawPile[0]!))).toBe('card-not-in-hand');
    expect(rejectCode(s, 0, play('nope'))).toBe('card-not-in-hand');
  });

  it('rejects positions outside the playing area and clamps edges inside', () => {
    const s = newGame();
    const card = s.hands[0]![0]!;
    expect(rejectCode(s, 0, play(card, TABLE_BOUNDS.maxX + 1, 0))).toBe('outside-table');
    const edge = act(s, 0, play(card, TABLE_BOUNDS.maxX, TABLE_BOUNDS.minY));
    const t = edge.table[0]!;
    expect(t.x).toBeLessThan(TABLE_BOUNDS.maxX);
    expect(t.y).toBeGreaterThan(TABLE_BOUNDS.minY);
  });

  it('advances turns in seat order and wraps', () => {
    let s = newGame(4);
    const seen: number[] = [];
    for (let i = 0; i < 9; i++) {
      seen.push(s.turn.activeSeat);
      s = act(s, s.turn.activeSeat, { type: 'endTurn' });
    }
    expect(seen).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0]);
    expect(s.turn.number).toBe(10);
  });

  it('makes drawing from an empty pile unavailable and leaves state unchanged', () => {
    let s = newGame(2);
    // Drain the pile: each turn draw one.
    while (s.drawPile.length > 0) {
      s = act(s, s.turn.activeSeat, { type: 'draw' });
      s = act(s, s.turn.activeSeat, { type: 'endTurn' });
    }
    const before = JSON.stringify(s);
    const r = applyAction(s, s.turn.activeSeat, { type: 'draw' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection.code).toBe('draw-pile-empty');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('conserves cards through a long random game', () => {
    const rng = seededRng(7);
    let s = newGame(4, 99);
    for (let i = 0; i < 300; i++) {
      const seat = s.turn.activeSeat;
      const hand = s.hands[seat]!;
      const options: GameAction[] = [{ type: 'draw' }, { type: 'endTurn' }];
      if (hand.length) options.push(play(hand[Math.floor(rng() * hand.length)]!, rng() * 100 - 50, rng() * 60 - 30));
      const r = applyAction(s, seat, options[Math.floor(rng() * options.length)]!);
      if (r.ok) s = r.state;
      expect(checkConservation(s)).toEqual([]);
    }
    expect(s.revision).toBeGreaterThan(50);
  });

  it('never mutates the input state', () => {
    const s = newGame();
    const frozen = JSON.stringify(s);
    applyAction(s, 0, { type: 'draw' });
    applyAction(s, 0, play(s.hands[0]![0]!));
    applyAction(s, 0, { type: 'endTurn' });
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('placement helper', () => {
  it('snaps rotation and keeps rotated cards inside', () => {
    const p = resolvePlacement({ x: 50, y: 30, rotation: 97 });
    expect(p.rotation).toBe(90);
    expect(p.x).toBeLessThanOrEqual(50 - 8.8 / 2 + 1e-9);
    expect(p.y).toBeLessThanOrEqual(30 - 6.3 / 2 + 1e-9);
    expect(resolvePlacement({ x: 0, y: 0, rotation: -15 }).rotation).toBe(345);
  });
});

describe('parseAction', () => {
  it('accepts well-formed actions and rejects junk', () => {
    expect(parseAction({ type: 'draw', extra: 1 })).toEqual({ type: 'draw' });
    expect(parseAction({ type: 'play', cardId: 'c001', x: 1, y: 2, rotation: 0 })).toEqual({ type: 'play', cardId: 'c001', x: 1, y: 2, rotation: 0 });
    expect(parseAction({ type: 'play', cardId: 'c001', x: NaN, y: 2, rotation: 0 })).toBeNull();
    expect(parseAction({ type: 'play', cardId: 5, x: 1, y: 2, rotation: 0 })).toBeNull();
    expect(parseAction({ type: 'steal' })).toBeNull();
    expect(parseAction(null)).toBeNull();
    expect(parseAction('draw')).toBeNull();
  });
});
