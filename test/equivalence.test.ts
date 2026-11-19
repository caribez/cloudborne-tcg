/**
 * The same seed and the same action sequence must produce equivalent results
 * through the hotseat adapter and the LAN server adapter.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { HotseatSession } from '../src/client/session/hotseatSession';
import { seededRng } from '../src/shared/random';
import type { GameAction } from '../src/shared/types';
import type { PlayerView } from '../src/shared/views';
import { settle, startHarness, type Harness, type TestClient } from './lanHarness';

let h: Harness;
afterEach(async () => h?.close());

type Step = (view: PlayerView) => GameAction;
const draw: Step = () => ({ type: 'draw' });
const end: Step = () => ({ type: 'endTurn' });
const playFirst =
  (x: number, y: number, rotation = 0): Step =>
  (v) => ({ type: 'play', cardId: v.hand[0]!.instanceId, x, y, rotation });

// Includes rejected attempts (second draw, out-of-range spot) to compare refusals too.
const SCRIPT: Step[] = [draw, playFirst(-10, 5, 30), draw, end, playFirst(12, -3), draw, end, playFirst(80, 0), end, draw, playFirst(0, 0, 90), end, end, draw, end];

describe('hotseat and LAN equivalence', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} players: identical views and outcomes`, async () => {
      const seed = 777 + n;
      const names = ['Ada', 'Bo', 'Cy', 'Di'].slice(0, n);
      const hot = new HotseatSession(names, () => seededRng(seed));

      h = await startHarness(seed);
      const clients: TestClient[] = [];
      for (const name of names) {
        const c = await h.client();
        await c.join(name);
        clients.push(c);
      }
      await settle();
      await clients[0]!.simple('start');
      await settle();

      for (const step of SCRIPT) {
        const seat = hot.activeSeat;
        const action = step(hot.viewFor(seat));
        const hotResult = hot.submit(seat, action);
        const lanAck = await clients[seat]!.command(action);
        await settle(15);
        expect(lanAck.accepted).toBe(hotResult.ok);
        if (!hotResult.ok) expect(lanAck.message).toBe(hotResult.message);
        for (let s = 0; s < n; s++) expect(clients[s]!.latest().game).toEqual(hot.viewFor(s));
      }
      expect(h.server.authority.debugState()).toEqual(hot.debugState());
    });
  }
});
