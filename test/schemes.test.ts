import { describe, expect, it } from 'vitest';
import { locateCard } from '../src/shared/engine';
import { decisionSeat } from '../src/shared/rules';
import type { GameState, Seat } from '../src/shared/types';
import { act, endTurnsUntil, giveCards, inHand, newGame, playDef, rejection, setGold, setIncome, standing } from './fixtures';

/** Seat `owner` places `defId` (with optional target), then play passes to `challenger`'s turn. */
function placed(defId: string, opts: { n?: number; owner?: Seat; target?: Seat; challenger?: Seat; extra?: string[] } = {}) {
  const n = opts.n ?? 2;
  const owner = opts.owner ?? 0;
  const challenger = opts.challenger ?? (owner + 1) % n;
  let s = setIncome(newGame(n, 11), 2);
  if (s.turn.activeSeat !== owner) s = endTurnsUntil(s, owner);
  s = setGold(giveCards(s, owner, defId, ...(opts.extra ?? [])), owner, 6);
  s = giveCards(s, challenger, 'senate-intervention');
  const schemeId = inHand(s, owner, defId);
  s = playDef(s, owner, defId, opts.target !== undefined ? { kind: 'seat', seat: opts.target } : undefined);
  s = endTurnsUntil(s, challenger);
  return { s, schemeId, owner, challenger };
}

function challenge(s: GameState, challenger: Seat, schemeId: string): GameState {
  return playDef(s, challenger, 'senate-intervention', { kind: 'scheme', schemeId });
}

describe('placing Schemes', () => {
  it('pays the cost and places the Scheme face down with owner, target and timing', () => {
    let s = setGold(giveCards(newGame(3), 0, 'street-slander'), 0, 4);
    const id = inHand(s, 0, 'street-slander');
    s = act(s, 0, { type: 'play', cardId: id, target: { kind: 'seat', seat: 2 } });
    expect(s.families[0]!.gold).toBe(3);
    expect(s.hands[0]).not.toContain(id);
    expect(s.schemes).toEqual([{ instanceId: id, owner: 0, target: 2, placedRound: 1, resolvesInRound: 2 }]);
    expect(locateCard(s, id)).toEqual({ zone: 'schemes', seat: 0, index: 0 });
    // The public log records only that a Scheme was placed and its cost.
    expect(s.log.at(-1)).toEqual({ seq: expect.any(Number), kind: 'schemePlaced', seat: 0, cost: 1 });
  });

  it('validates Scheme targets', () => {
    const s = setGold(giveCards(newGame(3), 0, 'street-slander', 'party-lion'), 0, 4);
    const slander = inHand(s, 0, 'street-slander');
    const lion = inHand(s, 0, 'party-lion');
    expect(rejection(s, 0, { type: 'play', cardId: slander }).code).toBe('target-required');
    expect(rejection(s, 0, { type: 'play', cardId: slander, target: { kind: 'seat', seat: 0 } }).code).toBe('invalid-target');
    expect(rejection(s, 0, { type: 'play', cardId: slander, target: { kind: 'seat', seat: 3 } }).code).toBe('invalid-target');
    expect(rejection(s, 0, { type: 'play', cardId: lion, target: { kind: 'seat', seat: 1 } }).code).toBe('invalid-target');
  });
});

describe('Scheme success timing', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} players: resolves at the start of the owner's next turn, exactly once`, () => {
      let s = setIncome(newGame(n, 4), 1);
      s = endTurnsUntil(s, 1); // seat 1, round 1
      s = setGold(giveCards(s, 1, 'party-lion'), 1, 3);
      const id = inHand(s, 1, 'party-lion');
      s = playDef(s, 1, 'party-lion');
      const a = standing(s, 1).aristocracy;
      // Every other family takes a turn first; the Scheme stays pending.
      for (let i = 0; i < n - 1; i++) {
        s = act(s, s.turn.activeSeat, { type: 'endTurn' });
        expect(s.turn.activeSeat).not.toBe(1);
        expect(s.schemes.map((x) => x.instanceId)).toEqual([id]);
      }
      s = act(s, s.turn.activeSeat, { type: 'endTurn' });
      expect(s.turn).toMatchObject({ activeSeat: 1, round: 2 });
      expect(standing(s, 1).aristocracy).toBe(a + 2);
      expect(s.schemes).toEqual([]);
      expect(locateCard(s, id)?.zone).toBe('discard');
      // Resolution happens before the income phase, and is logged with the revealed name.
      const kinds = s.log.slice(-3).map((e) => e.kind);
      expect(kinds).toEqual(['turnStart', 'schemeSucceeded', 'income']);
      // Never again.
      s = endTurnsUntil(s, 1);
      expect(standing(s, 1).aristocracy).toBe(a + 2);
      expect(s.discard.filter((x) => x === id)).toHaveLength(1);
    });
  }

  it('Street Slander costs the target 2 Popularity on success; Planted Scandal does nothing', () => {
    let { s, owner } = placed('street-slander', { n: 3, target: 2, extra: ['planted-scandal'] });
    s = endTurnsUntil(s, owner);
    expect(standing(s, 2).popularity).toBe(0);
    expect(standing(s, owner)).toEqual({ aristocracy: 2, religion: 2, popularity: 2 });
    ({ s } = placed('planted-scandal'));
    const before = s.families.map((f) => ({ ...f.standings }));
    s = endTurnsUntil(s, 0);
    expect(s.families.map((f) => f.standings)).toEqual(before);
    expect(s.log.some((e) => e.kind === 'schemeSucceeded' && e.defId === 'planted-scandal')).toBe(true);
  });

  it('several Schemes resolve in the order they were placed', () => {
    let s = setGold(giveCards(newGame(2), 0, 'party-lion', 'helping-the-poor', 'dealing-with-heresy'), 0, 5);
    s = playDef(s, 0, 'helping-the-poor');
    s = playDef(s, 0, 'party-lion');
    s = playDef(s, 0, 'dealing-with-heresy');
    s = endTurnsUntil(s, 0);
    const resolved = s.log.filter((e) => e.kind === 'schemeSucceeded').map((e) => (e.kind === 'schemeSucceeded' ? e.defId : ''));
    expect(resolved).toEqual(['helping-the-poor', 'party-lion', 'dealing-with-heresy']);
    expect(standing(s, 0)).toEqual({ aristocracy: 4, religion: 4, popularity: 3 });
  });
});

describe('Senate Intervention and the reaction window', () => {
  it('targets only other families’ pending Schemes, with one message for every bad id', () => {
    let { s, schemeId } = placed('party-lion');
    s = setGold(giveCards(s, 1, 'helping-the-poor'), 1, 5);
    const own = inHand(s, 1, 'helping-the-poor');
    s = playDef(s, 1, 'helping-the-poor');
    const senate = inHand(s, 1, 'senate-intervention');
    const msg = (id: string) => rejection(s, 1, { type: 'play', cardId: senate, target: { kind: 'scheme', schemeId: id } });
    const expected = { code: 'invalid-target', message: 'Senate Intervention must target a hidden Scheme belonging to another family.' };
    expect(msg(own)).toEqual(expected); // own Scheme
    expect(msg(s.hands[0]![0]!)).toEqual(expected); // a card in the opponent's hand
    expect(msg(s.drawPile[0]!)).toEqual(expected); // a card in the deck
    expect(msg('no-such-card')).toEqual(expected);
    expect(rejection(s, 1, { type: 'play', cardId: senate }).code).toBe('target-required');
    expect(rejection(s, 1, { type: 'play', cardId: senate, target: { kind: 'seat', seat: 0 } }).code).toBe('invalid-target');
    s = challenge(s, 1, schemeId);
    expect(s.reaction).toMatchObject({ initiator: 1, reactor: 0, schemeId });
  });

  it('is not playable when no other family has a pending Scheme', () => {
    const s = setGold(giveCards(newGame(2), 0, 'senate-intervention'), 0, 3);
    expect(rejection(s, 0, { type: 'play', cardId: inHand(s, 0, 'senate-intervention') })).toMatchObject({ code: 'invalid-target' });
  });

  it('gives the Scheme owner explicit priority and blocks ordinary actions', () => {
    let { s, schemeId } = placed('party-lion', { extra: ['corruption', 'scribe'] });
    s = setGold(giveCards(s, 1, 'scribe'), 1, 4);
    s = challenge(s, 1, schemeId);
    expect(s.families[1]!.gold).toBe(3);
    expect(s.turn.phase).toBe('reaction');
    expect(decisionSeat(s)).toBe(0);
    expect(locateCard(s, inHandOrDiscard(s, 'senate-intervention'))?.zone).toBe('discard');
    // Still hidden and pending while the owner decides.
    expect(s.schemes.map((x) => x.instanceId)).toEqual([schemeId]);
    expect(s.log.at(-1)).toMatchObject({ kind: 'challenge', seat: 1, owner: 0, schemeId });
    // The active player waits.
    expect(rejection(s, 1, { type: 'endTurn' }).code).toBe('reaction-pending');
    expect(rejection(s, 1, { type: 'play', cardId: inHand(s, 1, 'scribe') }).code).toBe('reaction-pending');
    expect(rejection(s, 1, { type: 'pass' }).code).toBe('not-your-decision');
    // The reactor may only react.
    expect(rejection(s, 0, { type: 'play', cardId: inHand(s, 0, 'scribe') }).code).toBe('not-your-decision');
    expect(rejection(s, 0, { type: 'endTurn' }).code).toBe('not-your-decision');
    s = act(s, 0, { type: 'pass' });
    expect(s.reaction).toBeNull();
    expect(s.turn.phase).toBe('action');
    expect(decisionSeat(s)).toBe(1); // priority back to the active player
    s = playDef(s, 1, 'scribe');
  });

  it('in a 3-player game only the Scheme owner may respond', () => {
    let { s, schemeId } = placed('party-lion', { n: 3, owner: 0, challenger: 1 });
    s = setGold(giveCards(s, 2, 'corruption', 'vanish-in-the-crowd'), 2, 5);
    s = challenge(s, 1, schemeId);
    expect(rejection(s, 2, { type: 'play', cardId: inHand(s, 2, 'corruption') }).code).toBe('not-your-decision');
    expect(rejection(s, 2, { type: 'pass' }).code).toBe('not-your-decision');
  });

  it('rejects reaction cards outside a reaction window and when unaffordable', () => {
    let { s, schemeId } = placed('party-lion', { extra: ['corruption', 'vanish-in-the-crowd'] });
    s = endTurnsUntil(s, 0);
    // Party Lion has resolved; give a fresh one for the next test step.
    s = setGold(giveCards(s, 0, 'party-lion'), 0, 5);
    expect(rejection(s, 0, { type: 'play', cardId: inHand(s, 0, 'corruption') }).code).toBe('wrong-timing');
    expect(rejection(s, 0, { type: 'pass' }).code).toBe('wrong-timing');
    s = playDef(s, 0, 'party-lion');
    s = endTurnsUntil(s, 1);
    s = setGold(giveCards(s, 1, 'senate-intervention'), 1, 3);
    s = setGold(s, 0, 0);
    s = challenge(s, 1, s.schemes[0]!.instanceId);
    expect(rejection(s, 0, { type: 'play', cardId: inHand(s, 0, 'vanish-in-the-crowd') })).toEqual({
      code: 'insufficient-gold',
      message: 'Vanish in the Crowd costs 1 Gold; you have 0.',
    });
    expect(rejection(s, 0, { type: 'play', cardId: inHand(s, 0, 'corruption') }).code).toBe('insufficient-gold');
    void schemeId;
  });
});

function inHandOrDiscard(s: GameState, defId: string): string {
  return [...s.discard].reverse().find((id) => s.instances[id] === defId)!;
}

describe('revealed outcomes (owner allows the investigation)', () => {
  const cases: [string, Seat | undefined, Partial<Record<'owner' | 'revealer', Partial<Record<string, number>>>>][] = [
    // Expected standings after the reveal (everyone starts at 2).
    ['party-lion', undefined, { owner: { aristocracy: 1 } }],
    ['dealing-with-heresy', undefined, { owner: { religion: 1 } }],
    ['helping-the-poor', undefined, { owner: { popularity: 1 } }],
    ['street-slander', 1, { owner: { aristocracy: 1, popularity: 1 } }],
    ['furian-truce', undefined, { owner: { popularity: 1 }, revealer: { popularity: 4 } }],
    ['planted-scandal', undefined, { revealer: { popularity: 0 } }],
  ];
  for (const [defId, target, expected] of cases) {
    it(`${defId}: Revealed effect instead of Success, then discarded`, () => {
      let { s, schemeId } = placed(defId, { target });
      const ownerBefore = { ...standing(s, 0) };
      const revealerBefore = { ...standing(s, 1) };
      s = act(challenge(s, 1, schemeId), 0, { type: 'pass' });
      expect(s.schemes).toEqual([]);
      expect(locateCard(s, schemeId)?.zone).toBe('discard');
      expect(standing(s, 0)).toEqual({ ...ownerBefore, ...expected.owner });
      expect(standing(s, 1)).toEqual({ ...revealerBefore, ...expected.revealer });
      expect(s.log.slice(-2).map((e) => e.kind)).toEqual(['allow', 'schemeRevealed']);
      expect(s.log.at(-1)).toMatchObject({ kind: 'schemeRevealed', owner: 0, revealer: 1, defId, corrupted: false, target: target ?? null });
      // Success never follows a reveal.
      const after = s.families.map((f) => ({ ...f.standings }));
      s = endTurnsUntil(s, 0);
      expect(s.families.map((f) => f.standings)).toEqual(after);
    });
  }

  it('Planted Scandal punishes the investigating family (2 → 0 Popularity)', () => {
    let { s, schemeId } = placed('planted-scandal');
    s = act(challenge(s, 1, schemeId), 0, { type: 'pass' });
    expect(standing(s, 1).popularity).toBe(0);
    expect(standing(s, 0).popularity).toBe(2);
  });
});

describe('Corruption', () => {
  it('redirects the owner’s penalties to the revealer and costs the owner 1 Gold', () => {
    let { s, schemeId } = placed('street-slander', { target: 1, extra: ['corruption'] });
    const gold = s.families[0]!.gold;
    s = challenge(s, 1, schemeId);
    s = playDef(s, 0, 'corruption');
    expect(s.families[0]!.gold).toBe(gold - 1);
    expect(standing(s, 0)).toEqual({ aristocracy: 2, religion: 2, popularity: 2 });
    expect(standing(s, 1)).toEqual({ aristocracy: 1, religion: 2, popularity: 1 });
    expect(s.schemes).toEqual([]);
    expect(s.log.slice(-2).map((e) => e.kind)).toEqual(['response', 'schemeRevealed']);
    expect(s.log.at(-1)).toMatchObject({ corrupted: true });
    expect(s.reaction).toBeNull();
    expect(decisionSeat(s)).toBe(1);
  });

  it('still applies effects aimed at the revealer (Furian Truce: −1 redirected, +2 kept → net +1 P)', () => {
    let { s, schemeId } = placed('furian-truce', { extra: ['corruption'] });
    s = playDef(challenge(s, 1, schemeId), 0, 'corruption');
    expect(standing(s, 0).popularity).toBe(2);
    expect(standing(s, 1).popularity).toBe(3);
  });

  it('cannot save the revealer from Planted Scandal and never triggers Success', () => {
    let { s, schemeId } = placed('planted-scandal', { extra: ['corruption'] });
    s = playDef(challenge(s, 1, schemeId), 0, 'corruption');
    expect(standing(s, 1).popularity).toBe(0);
    ({ s, schemeId } = placed('party-lion', { extra: ['corruption'] }));
    s = playDef(challenge(s, 1, schemeId), 0, 'corruption');
    expect(standing(s, 0).aristocracy).toBe(2); // no +2 Success
    expect(standing(s, 1).aristocracy).toBe(1); // the −1 was redirected
  });
});

describe('Vanish in the Crowd', () => {
  it('cancels the reveal; the Scheme stays hidden, keeps its timing and can be challenged again', () => {
    let { s, schemeId } = placed('party-lion', { n: 3, owner: 0, challenger: 1, extra: ['vanish-in-the-crowd'] });
    const gold0 = s.families[0]!.gold;
    const gold1 = s.families[1]!.gold;
    s = playDef(challenge(s, 1, schemeId), 0, 'vanish-in-the-crowd');
    expect(s.families[0]!.gold).toBe(gold0 - 1);
    expect(s.families[1]!.gold).toBe(gold1 - 1); // the Senate Intervention is still spent
    expect(s.schemes).toEqual([{ instanceId: schemeId, owner: 0, target: null, placedRound: 1, resolvesInRound: 2 }]);
    expect(s.discard.map((id) => s.instances[id])).toEqual(expect.arrayContaining(['senate-intervention', 'vanish-in-the-crowd']));
    expect(s.log.some((e) => e.kind === 'schemeRevealed')).toBe(false);
    expect(s.reaction).toBeNull();
    expect(decisionSeat(s)).toBe(1);
    // Another family may try again later.
    s = endTurnsUntil(s, 2);
    s = setGold(giveCards(s, 2, 'senate-intervention'), 2, 3);
    s = challenge(s, 2, schemeId);
    expect(s.reaction).toMatchObject({ initiator: 2, reactor: 0 });
    s = act(s, 0, { type: 'pass' });
    expect(locateCard(s, schemeId)?.zone).toBe('discard');
  });

  it('a saved Scheme still succeeds on time, exactly once', () => {
    let { s, schemeId } = placed('party-lion', { extra: ['vanish-in-the-crowd'] });
    s = playDef(challenge(s, 1, schemeId), 0, 'vanish-in-the-crowd');
    s = endTurnsUntil(s, 0);
    expect(standing(s, 0).aristocracy).toBe(4);
    expect(s.log.filter((e) => e.kind === 'schemeSucceeded')).toHaveLength(1);
    expect(locateCard(s, schemeId)?.zone).toBe('discard');
  });
});
