import { describe, expect, it } from 'vitest';
import { applyAction, setupGame } from '../src/shared/engine';
import { describeLogEntry } from '../src/shared/logText';
import { seededRng } from '../src/shared/random';
import type { GameState } from '../src/shared/types';
import { playerView, publicView } from '../src/shared/views';
import { expectNoLeak } from './helpers';

function midGame(): GameState {
  let s = setupGame({ playerNames: ['Ada', 'Bo', 'Cy'], rng: seededRng(5) });
  const step = (seat: number, a: Parameters<typeof applyAction>[2]) => {
    const r = applyAction(s, seat, a);
    if (!r.ok) throw new Error(r.rejection.message);
    s = r.state;
  };
  step(0, { type: 'draw' });
  step(0, { type: 'play', cardId: s.hands[0]![2]!, x: 3, y: 4, rotation: 0 });
  step(0, { type: 'endTurn' });
  step(1, { type: 'draw' });
  step(1, { type: 'endTurn' });
  return s;
}

describe('player views', () => {
  it('include only the viewer hand, with counts for others', () => {
    const s = midGame();
    for (const seat of [0, 1, 2]) {
      const v = playerView(s, seat);
      expect(v.viewer).toBe(seat);
      expect(v.hand.map((c) => c.instanceId)).toEqual(s.hands[seat]);
      expect(v.players.map((p) => p.handCount)).toEqual(s.hands.map((h) => h.length));
      expect(v.drawPileCount).toBe(s.drawPile.length);
      expect(v.table).toHaveLength(1);
      expectNoLeak(v, s, seat);
    }
  });

  it('public view has no hand and leaks nothing', () => {
    const s = midGame();
    const v = publicView(s);
    expect(v.hand).toEqual([]);
    expect(v.viewer).toBeNull();
    expect(v.can).toEqual({ draw: false, play: false, endTurn: false });
    expectNoLeak(v, s, null);
  });

  it('log never names a drawn card', () => {
    const s = midGame();
    const lines = s.log.map((e) => describeLogEntry(e, s.players));
    expect(lines).toContain('Ada drew a card.');
    expect(lines.some((l) => l.startsWith('Ada played '))).toBe(true);
    expectNoLeak(s.log, s, null);
  });

  it('rejection messages do not reveal hidden cards', () => {
    const s = midGame();
    const othersCard = s.hands[0]![0]!;
    const r = applyAction(s, 2, { type: 'play', cardId: othersCard, x: 0, y: 0, rotation: 0 });
    const r2 = applyAction(s, 2, { type: 'play', cardId: 'does-not-exist', x: 0, y: 0, rotation: 0 });
    expect(r.ok || r2.ok).toBe(false);
    if (!r.ok && !r2.ok) {
      expect(r.rejection).toEqual(r2.rejection); // indistinguishable
      expectNoLeak(r.rejection, s, 2);
    }
  });

  it('reports what the viewer can do', () => {
    const s = midGame();
    expect(playerView(s, 2).can).toEqual({ draw: true, play: true, endTurn: true });
    expect(playerView(s, 0).can).toEqual({ draw: false, play: false, endTurn: false });
  });
});
