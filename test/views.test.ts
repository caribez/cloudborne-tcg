import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS, SCHEMES } from '../src/shared/cards';
import { applyAction, setupGame } from '../src/shared/engine';
import { describeLogEntry } from '../src/shared/logText';
import { seededRng } from '../src/shared/random';
import type { GameState } from '../src/shared/types';
import { HIDDEN, playerView, publicView } from '../src/shared/views';
import { act, endTurnsUntil, giveCards, inHand, newGame, playDef, setGold } from './fixtures';
import { expectNoLeak } from './helpers';

/** Ada places Street Slander at Cy; Bo investigates it; the reaction window is open. */
function midGame(): { s: GameState; slander: string; lion: string } {
  let s = setGold(giveCards(newGame(3, 5), 0, 'street-slander', 'party-lion', 'scribe'), 0, 6);
  const slander = inHand(s, 0, 'street-slander');
  const lion = inHand(s, 0, 'party-lion');
  s = act(s, 0, { type: 'play', cardId: slander, target: { kind: 'seat', seat: 2 } });
  s = act(s, 0, { type: 'play', cardId: lion });
  s = playDef(s, 0, 'scribe');
  s = endTurnsUntil(s, 1);
  s = setGold(giveCards(s, 1, 'senate-intervention'), 1, 3);
  s = playDef(s, 1, 'senate-intervention', { kind: 'scheme', schemeId: slander });
  return { s, slander, lion };
}

describe('player views', () => {
  it('include only the viewer’s hand, with counts for others', () => {
    const { s } = midGame();
    for (const seat of [0, 1, 2]) {
      const v = playerView(s, seat);
      expect(v.viewer).toBe(seat);
      expect(v.hand.map((c) => c.instanceId)).toEqual(s.hands[seat]);
      expect(v.families.map((f) => f.handCount)).toEqual(s.hands.map((h) => h.length));
      expect(v.drawPileCount).toBe(s.drawPile.length);
      expectNoLeak(v, s, seat);
    }
  });

  it('show hidden Schemes to their owner only, without definition or target for anyone else', () => {
    const { s, slander, lion } = midGame();
    const own = playerView(s, 0).families[0]!.schemes;
    expect(own.map((x) => [x.instanceId, x.defId, x.target])).toEqual([
      [slander, 'street-slander', 2],
      [lion, 'party-lion', null],
    ]);
    for (const viewer of [1, 2, null]) {
      const schemes = playerView(s, viewer).families[0]!.schemes;
      expect(schemes.map((x) => [x.instanceId, x.defId, x.target])).toEqual([
        [slander, HIDDEN, null],
        [lion, HIDDEN, null],
      ]);
      // Public facts: that it exists, when it was placed, that it is under investigation.
      expect(schemes[0]).toMatchObject({ owner: 0, placedRound: 1, resolvesInRound: 2, challenged: true });
    }
  });

  it('public view has no hand, no actions and leaks nothing', () => {
    const { s } = midGame();
    const v = publicView(s);
    expect(v.hand).toEqual([]);
    expect(v.viewer).toBeNull();
    expect(v.can).toEqual({ endTurn: false, pass: false });
    expectNoLeak(v, s, null);
  });

  it('exposes the reaction window and who decides, but not the Scheme', () => {
    const { s, slander } = midGame();
    for (const viewer of [0, 1, 2]) {
      const v = playerView(s, viewer);
      expect(v.reaction).toEqual({ initiator: 1, reactor: 0, schemeId: slander });
      expect(v.decisionSeat).toBe(0);
      expect(v.activeSeat).toBe(1);
      expect(v.can.pass).toBe(viewer === 0);
      expect(v.can.endTurn).toBe(false);
    }
  });

  it('never includes future income, deck order or the instance map', () => {
    const { s } = midGame();
    const json = JSON.stringify(playerView(s, 1));
    expect(json).not.toContain('incomeRolls');
    expect(json).not.toContain('"instances"');
    expect(json).not.toContain('drawPile"');
  });

  it('report playability and legal targets for the viewer’s hand', () => {
    let s = setGold(giveCards(newGame(2, 3), 0, 'royal-mate', 'scribe', 'senate-intervention', 'street-slander'), 0, 1);
    const v = playerView(s, 0);
    const card = (d: string) => v.hand.find((c) => c.defId === d)!;
    expect(card('royal-mate')).toMatchObject({ playable: false, reason: 'Royal Mate costs 2 Gold; you have 1.', targets: null });
    expect(card('scribe')).toMatchObject({ playable: true, reason: null, targets: null });
    expect(card('senate-intervention')).toMatchObject({ playable: false, targets: [] });
    expect(card('street-slander')).toMatchObject({ playable: true, targets: [{ kind: 'seat', seat: 1 }] });
    s = endTurnsUntil(s, 1);
    expect(playerView(s, 0).hand.every((c) => !c.playable)).toBe(true);
  });
});

describe('log privacy', () => {
  it('never names a hidden Scheme or its target, nor a drawn card', () => {
    const { s } = midGame();
    const lines = s.log.map((e) => describeLogEntry(e, s.players));
    expect(lines).toContain('Ada placed a hidden Scheme (paid 1 Gold).');
    expect(lines).toContain('Bo played Senate Intervention to investigate a hidden Scheme of Ada.');
    const text = lines.join('\n');
    for (const sch of SCHEMES) expect(text).not.toContain(sch.name);
    expect(text).not.toContain('Cy loses');
    expect(lines.some((l) => /drew 1 card/.test(l))).toBe(true);
    expectNoLeak(s.log, s, null);
  });

  it('names the Scheme once it is revealed', () => {
    let { s } = midGame();
    s = act(s, 0, { type: 'pass' });
    const last = describeLogEntry(s.log.at(-1)!, s.players);
    expect(last).toBe("Exposed: Ada's Scheme was Street Slander aimed at Cy. Result: Ada −1 A, −1 P.");
  });
});

describe('rejections', () => {
  it('do not reveal hidden cards: someone else’s card and a non-existent card look the same', () => {
    const { s } = midGame();
    const othersCard = s.hands[0]![0]!;
    const deckCard = s.drawPile[0]!;
    const r1 = applyAction(s, 1, { type: 'play', cardId: othersCard });
    const r2 = applyAction(s, 1, { type: 'play', cardId: 'does-not-exist' });
    const r3 = applyAction(s, 1, { type: 'play', cardId: deckCard });
    expect(r1.ok || r2.ok || r3.ok).toBe(false);
    if (!r1.ok && !r2.ok && !r3.ok) {
      expect(r1.rejection).toEqual(r2.rejection);
      expect(r3.rejection).toEqual(r2.rejection);
      expectNoLeak(r1.rejection, s, 1);
    }
  });
});

describe('opaque instance ids', () => {
  const game = (seed: number) => setupGame({ playerNames: ['A', 'B'], rng: seededRng(seed) });

  it('look random and never embed definition ids', () => {
    const s = game(1);
    for (const [id, defId] of Object.entries(s.instances)) {
      expect(id).toMatch(/^k[0-9a-z]{10}$/);
      expect(id).not.toContain(defId);
      for (const d of CARD_DEFINITIONS) expect(id.includes(d.id)).toBe(false);
    }
  });

  it('carry no ordering relationship to definitions (no inference from sorted ids)', () => {
    for (const seed of [1, 2, 3]) {
      const s = game(seed);
      const ids = Object.keys(s.instances).sort();
      // With sequential ids in definition order nearly every neighbour would share a definition.
      const sameNeighbours = ids.slice(1).filter((id, i) => s.instances[id] === s.instances[ids[i]!]).length;
      expect(sameNeighbours).toBeLessThan(15);
    }
  });

  it('differ between games, so no lookup table can be built from earlier games', () => {
    const a = new Set(Object.keys(game(1).instances));
    const b = Object.keys(game(2).instances);
    expect(b.filter((id) => a.has(id))).toEqual([]);
  });
});
