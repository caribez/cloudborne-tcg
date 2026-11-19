import { describe, expect, it } from 'vitest';
import { HotseatSession } from '../src/client/session/hotseatSession';
import { seededRng } from '../src/shared/random';
import { expectNoLeak } from './helpers';

describe('hotseat session', () => {
  it('only the active seat can act and rejections explain why', () => {
    const s = new HotseatSession(['Ada', 'Bo', 'Cy'], () => seededRng(3));
    expect(s.submit(1, { type: 'draw' })).toEqual({ ok: false, message: "It's Ada's turn. Wait for your turn to act." });
    expect(s.submit(0, { type: 'draw' })).toEqual({ ok: true });
    expect(s.submit(0, { type: 'draw' })).toEqual({ ok: false, message: 'You have already drawn a card this turn.' });
    expect(s.submit(0, { type: 'endTurn' })).toEqual({ ok: true });
    expect(s.activeSeat).toBe(1);
  });

  it('public view for the privacy screen carries no private cards', () => {
    const s = new HotseatSession(['Ada', 'Bo'], () => seededRng(3));
    s.submit(0, { type: 'draw' });
    const v = s.publicView();
    expect(v.hand).toEqual([]);
    expectNoLeak(v, s.debugState(), null);
  });

  it('restart deals a fresh game with a higher revision and notifies listeners', () => {
    const s = new HotseatSession(['Ada', 'Bo'], () => seededRng(3));
    let calls = 0;
    s.subscribe(() => calls++);
    s.submit(0, { type: 'endTurn' });
    const rev = s.revision;
    s.restart();
    expect(calls).toBe(2);
    expect(s.revision).toBeGreaterThan(rev);
    expect(s.activeSeat).toBe(0);
    expect(s.viewFor(0).hand).toHaveLength(5);
  });
});
