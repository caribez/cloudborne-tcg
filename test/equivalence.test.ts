/**
 * The same seed, setup and action sequence must produce equivalent results
 * through the hotseat adapter and the LAN server adapter, including reaction
 * windows where priority leaves the active player.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { HotseatSession } from '../src/client/session/hotseatSession';
import { seededRng } from '../src/shared/random';
import type { GameAction, GameState } from '../src/shared/types';
import type { PlayerView } from '../src/shared/views';
import { giveCards, setGold } from './fixtures';
import { settle, startHarness, type Harness, type TestClient } from './lanHarness';

let h: Harness;
afterEach(async () => h?.close());

function prepare(s: GameState): GameState {
  let t = giveCards(s, 0, 'scribe', 'party-lion', 'street-slander', 'vanish-in-the-crowd', 'corruption', 'merchant-king');
  t = giveCards(t, 1, 'senate-intervention', 'senate-intervention', 'scribe');
  for (let seat = 0; seat < t.players.length; seat++) t = setGold(t, seat, 8);
  return t;
}

type Step = (view: PlayerView) => GameAction;
const id = (v: PlayerView, defId: string) => v.hand.find((c) => c.defId === defId)?.instanceId ?? 'missing';
const scheme = (v: PlayerView, n: number) => v.families[0]!.schemes[n]?.instanceId ?? 'missing';
const play =
  (defId: string): Step =>
  (v) => ({ type: 'play', cardId: id(v, defId) });
const end: Step = () => ({ type: 'endTurn' });

// Includes rejected attempts (wrong timing, reaction pending, bad target) to compare refusals too.
const SCRIPT: Step[] = [
  play('scribe'),
  play('party-lion'),
  (v) => ({ type: 'play', cardId: id(v, 'street-slander'), target: { kind: 'seat', seat: 1 } }),
  play('corruption'), // rejected: no investigation
  play('merchant-king'),
  end,
  (v) => ({ type: 'play', cardId: id(v, 'senate-intervention'), target: { kind: 'scheme', schemeId: 'nope' } }), // rejected
  (v) => ({ type: 'play', cardId: id(v, 'senate-intervention'), target: { kind: 'scheme', schemeId: scheme(v, 0) } }),
  end, // rejected: Ada has priority but it is Bo's turn
  play('vanish-in-the-crowd'),
  (v) => ({ type: 'play', cardId: id(v, 'senate-intervention'), target: { kind: 'scheme', schemeId: scheme(v, 1) } }),
  play('corruption'),
  play('scribe'),
  end,
  end,
  end,
  end,
  end,
];

describe('hotseat and LAN equivalence', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} players: identical views and outcomes, including reactions`, async () => {
      const seed = 777 + n;
      const names = ['Ada', 'Bo', 'Cy', 'Di'].slice(0, n);
      const hot = new HotseatSession(names, { rngFactory: () => seededRng(seed), prepareGame: prepare });

      h = await startHarness(seed, 60_000, prepare);
      const clients: TestClient[] = [];
      for (const name of names) {
        const c = await h.client();
        await c.join(name);
        clients.push(c);
      }
      await settle();
      await clients[0]!.simple('start');
      await settle();

      let accepted = 0;
      for (const step of SCRIPT) {
        // Whoever holds decision priority acts, exactly as both UIs do.
        const seat = hot.prioritySeat ?? hot.activeSeat;
        const action = step(hot.viewFor(seat));
        const hotResult = hot.submit(seat, action);
        const lanAck = await clients[seat]!.command(action);
        await settle(15);
        expect(lanAck.accepted).toBe(hotResult.ok);
        if (!hotResult.ok) expect(lanAck.message).toBe(hotResult.message);
        else accepted++;
        for (let s = 0; s < n; s++) expect(clients[s]!.latest().game).toEqual(hot.viewFor(s));
      }
      expect(accepted).toBeGreaterThan(10);
      expect(h.server.authority.debugState()).toEqual(hot.debugState());
      // The script exercised a reveal with Corruption and a cancelled investigation.
      const kinds = hot.debugState().log.map((e) => e.kind);
      expect(kinds).toEqual(expect.arrayContaining(['challenge', 'response', 'schemeRevealed', 'recruit', 'schemePlaced']));
    });
  }
});
