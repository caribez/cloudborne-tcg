import { describe, expect, it } from 'vitest';
import { HotseatSession } from '../src/client/session/hotseatSession';
import { seededRng } from '../src/shared/random';
import type { GameState } from '../src/shared/types';
import { giveCards, setGold } from './fixtures';
import { expectNoLeak } from './helpers';

const prepare = (s: GameState) => setGold(giveCards(setGold(giveCards(s, 0, 'party-lion', 'scribe'), 0, 5), 1, 'senate-intervention'), 1, 5);
const card = (s: HotseatSession, seat: number, defId: string) => s.viewFor(seat).hand.find((c) => c.defId === defId)!.instanceId;

describe('hotseat session', () => {
  it('only the seat with decision priority can act, and rejections explain why', () => {
    const s = new HotseatSession(['Ada', 'Bo', 'Cy'], { rngFactory: () => seededRng(3), prepareGame: prepare });
    expect(s.submit(1, { type: 'endTurn' })).toEqual({ ok: false, message: "It's Ada's turn. Wait for your turn to act." });
    expect(s.submit(0, { type: 'play', cardId: card(s, 0, 'scribe') })).toEqual({ ok: true });
    expect(s.submit(0, { type: 'endTurn' })).toEqual({ ok: true });
    expect(s.activeSeat).toBe(1);
    expect(s.prioritySeat).toBe(1);
  });

  it('decision priority moves to the reacting player and back (drives the handoff)', () => {
    const s = new HotseatSession(['Ada', 'Bo'], { rngFactory: () => seededRng(3), prepareGame: prepare });
    const lion = card(s, 0, 'party-lion');
    s.submit(0, { type: 'play', cardId: lion });
    s.submit(0, { type: 'endTurn' });
    expect(s.prioritySeat).toBe(1);
    expect(s.submit(1, { type: 'play', cardId: card(s, 1, 'senate-intervention'), target: { kind: 'scheme', schemeId: lion } })).toEqual({ ok: true });
    expect(s.activeSeat).toBe(1);
    expect(s.prioritySeat).toBe(0); // Ada must decide: the UI hands the screen over
    expect(s.submit(1, { type: 'endTurn' }).ok).toBe(false);
    expect(s.submit(0, { type: 'pass' })).toEqual({ ok: true });
    expect(s.prioritySeat).toBe(1); // back to Bo: another handoff
  });

  it('public view for the privacy screen carries no private cards or hidden Schemes', () => {
    const s = new HotseatSession(['Ada', 'Bo'], { rngFactory: () => seededRng(3), prepareGame: prepare });
    s.submit(0, { type: 'play', cardId: card(s, 0, 'party-lion') });
    const v = s.publicView();
    expect(v.hand).toEqual([]);
    expect(v.families[0]!.schemes[0]!.defId).toBe('hidden');
    expectNoLeak(v, s.debugState(), null);
  });

  it('reports the end of the game and restarts with a higher revision', () => {
    const s = new HotseatSession(['Ada', 'Bo'], () => seededRng(3));
    let calls = 0;
    s.subscribe(() => calls++);
    while (!s.finished) expect(s.submit(s.activeSeat, { type: 'endTurn' })).toEqual({ ok: true });
    expect(calls).toBe(16);
    expect(s.prioritySeat).toBeNull();
    expect(s.publicView().result!.winners).toEqual([0, 1]);
    expect(s.submit(0, { type: 'endTurn' })).toEqual({ ok: false, message: 'The game is over. Restart to play again.' });
    const rev = s.revision;
    s.restart();
    expect(calls).toBe(17);
    expect(s.revision).toBeGreaterThan(rev);
    expect(s.finished).toBe(false);
    expect(s.activeSeat).toBe(0);
    expect(s.viewFor(0).hand).toHaveLength(8);
  });
});
