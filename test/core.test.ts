import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS, CHARACTERS, CHILDREN, getCardDefinition, INSTANTS, SCHEMES } from '../src/shared/cards';
import { CHILD_POOL, MAIN_DECK } from '../src/shared/deck';
import { applyAction, checkConservation, locateCard, parseAction, setupGame } from '../src/shared/engine';
import { seededRng } from '../src/shared/random';
import { DEMO_RULES } from '../src/shared/rules';
import type { GameAction, GameState } from '../src/shared/types';
import { evaluateResult } from '../src/shared/victory';
import { playerView } from '../src/shared/views';
import { act, endTurnsUntil, giveCards, inHand, names, newGame, playDef, rejection, setGold, setIncome, setStandings, standing } from './fixtures';

const count = (deck: readonly { copies: number }[]) => deck.reduce((n, e) => n + e.copies, 0);

describe('card definitions and deck', () => {
  it('has the demo cards with unique ids', () => {
    expect(CHARACTERS).toHaveLength(8);
    expect(SCHEMES).toHaveLength(6);
    expect(INSTANTS).toHaveLength(4);
    expect(CHILDREN).toHaveLength(3);
    expect(new Set(CARD_DEFINITIONS.map((d) => d.id)).size).toBe(CARD_DEFINITIONS.length);
  });

  it('main deck is 4 copies of everything: 32 Characters, 24 Schemes, 16 Instants', () => {
    const byType = (t: string) => MAIN_DECK.filter((e) => getCardDefinition(e.defId).type === t);
    expect(count(byType('character'))).toBe(44);
    expect(count(byType('scheme'))).toBe(36);
    expect(count(byType('instant'))).toBe(16);
    expect(count(MAIN_DECK)).toBe(96);
    expect(MAIN_DECK.some((e) => getCardDefinition(e.defId).type === 'child')).toBe(false);
    expect(count(CHILD_POOL)).toBe(12);
  });

  it('marks Military, noble and Cloud Sister tags as specified', () => {
    const tags = (id: string) => {
      const d = getCardDefinition(id);
      return d.type === 'character' ? d.tags : [];
    };
    for (const id of ['cloud-guard', 'captain-teos', 'field-sister', 'war-hero']) expect(tags(id)).toContain('military');
    for (const id of ['merchant-king', 'scribe', 'royal-mate', 'wandering-troupe']) expect(tags(id)).not.toContain('military');
    for (const c of CHARACTERS.filter((c) => c.affiliation === 'aristocracy')) expect(c.tags).toContain('noble');
    expect(tags('field-sister')).toContain('cloud-sister');
  });
});

describe('setup', () => {
  for (const n of [2, 3, 4]) {
    it(`sets up ${n} families with hands, Children, standings, Gold and the first turn`, () => {
      const s = newGame(n);
      expect(s.players.map((p) => p.name)).toEqual(names(n));
      // Seat 0's first turn has already started: one automatic draw.
      expect(s.hands.map((h) => h.length)).toEqual([8, ...Array(n - 1).fill(7)]);
      expect(s.drawPile).toHaveLength(96 - 7 * n - 1);
      expect(s.children.map((c) => c.length)).toEqual(Array(n).fill(2));
      expect(s.childPile).toHaveLength(12 - 2 * n);
      for (const f of s.families) expect(f.standings).toEqual({ aristocracy: 2, religion: 2, popularity: 2 });
      expect(s.families[0]!.gold).toBe(3 + s.incomeRolls[0]!);
      for (const f of s.families.slice(1)) expect(f.gold).toBe(3);
      expect(s.turn).toEqual({ activeSeat: 0, round: 1, number: 1, phase: 'action' });
      expect(s.incomeRolls).toHaveLength(n * 8);
      expect(s.characters.flat()).toEqual([]);
      expect(s.schemes).toEqual([]);
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

  it('rolls income uniformly from 1 to 3', () => {
    const seen = new Map<number, number>();
    for (let seed = 1; seed <= 40; seed++) for (const r of newGame(4, seed).incomeRolls) seen.set(r, (seen.get(r) ?? 0) + 1);
    expect([...seen.keys()].sort()).toEqual([1, 2, 3]);
    for (const v of seen.values()) expect(v).toBeGreaterThan(300); // 1280 rolls, ~427 each
  });
});

describe('economy', () => {
  it('turn start draws one card and adds the pre-rolled income', () => {
    const s0 = newGame(2, 5);
    const top = s0.drawPile[s0.drawPile.length - 1]!;
    const s = act(s0, 0, { type: 'endTurn' });
    expect(s.turn).toMatchObject({ activeSeat: 1, round: 1, number: 2 });
    expect(s.hands[1]).toHaveLength(8);
    expect(locateCard(s, top)).toEqual({ zone: 'hand', seat: 1, index: 7 });
    expect(s.families[1]!.gold).toBe(3 + s.incomeRolls[1]!);
    expect(s.log.at(-1)).toMatchObject({ kind: 'income', seat: 1, roll: s.incomeRolls[1], bonusGold: 0, cards: 1, missed: 0 });
  });

  it('recruiting pays Gold, moves the card to the Character area and applies its bonus', () => {
    let s = setGold(giveCards(newGame(), 0, 'captain-teos'), 0, 5);
    const id = inHand(s, 0, 'captain-teos');
    s = act(s, 0, { type: 'play', cardId: id });
    expect(s.families[0]!.gold).toBe(3);
    expect(locateCard(s, id)).toEqual({ zone: 'characters', seat: 0, index: 0 });
    expect(standing(s, 0)).toEqual({ aristocracy: 3, religion: 2, popularity: 3 });
    expect(s.log.at(-1)).toMatchObject({ kind: 'recruit', seat: 0, defId: 'captain-teos', cost: 2 });
  });

  it('rejects unaffordable cards without changing state', () => {
    const s = setGold(giveCards(newGame(), 0, 'royal-mate'), 0, 1);
    const before = JSON.stringify(s);
    expect(rejection(s, 0, { type: 'play', cardId: inHand(s, 0, 'royal-mate') })).toEqual({
      code: 'insufficient-gold',
      message: 'Royal Mate costs 2 Gold; you have 1.',
    });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('allows any number of affordable plays in one turn', () => {
    let s = setGold(giveCards(newGame(), 0, 'scribe', 'war-hero', 'cloud-guard', 'party-lion'), 0, 4);
    s = playDef(s, 0, 'scribe');
    s = playDef(s, 0, 'war-hero');
    s = playDef(s, 0, 'cloud-guard');
    s = playDef(s, 0, 'party-lion');
    expect(s.families[0]!.gold).toBe(0);
    expect(s.characters[0]).toHaveLength(3);
    expect(s.schemes).toHaveLength(1);
    expect(standing(s, 0)).toEqual({ aristocracy: 3, religion: 3, popularity: 3 });
  });

  it('recurring Character effects start on the owner’s next turn', () => {
    let s = setIncome(setGold(giveCards(newGame(2, 9), 0, 'merchant-king', 'captain-teos', 'wandering-troupe'), 0, 5), 2);
    s = playDef(s, 0, 'merchant-king');
    s = playDef(s, 0, 'captain-teos');
    s = playDef(s, 0, 'wandering-troupe');
    expect(s.families[0]!.gold).toBe(0); // no bonus yet this turn
    const hand = s.hands[0]!.length;
    s = endTurnsUntil(s, 0);
    // 2 income + 1 Merchant King + 1 Troupe; 1 draw + 1 extra from Captain Teos.
    expect(s.families[0]!.gold).toBe(4);
    expect(s.hands[0]).toHaveLength(hand + 2);
    expect(s.log.at(-1)).toMatchObject({ kind: 'income', seat: 0, roll: 2, bonusGold: 2, cards: 2, missed: 0 });
  });

  it('standings never fall below 0', () => {
    let s = setStandings(setGold(giveCards(newGame(), 0, 'party-lion'), 0, 3), 0, { aristocracy: 0 });
    s = giveCards(s, 1, 'senate-intervention');
    s = playDef(s, 0, 'party-lion');
    s = endTurnsUntil(s, 1);
    s = playDef(s, 1, 'senate-intervention', { kind: 'scheme', schemeId: s.schemes[0]!.instanceId });
    s = act(s, 0, { type: 'pass' });
    expect(standing(s, 0).aristocracy).toBe(0);
    expect(s.log.at(-1)).toMatchObject({ kind: 'schemeRevealed', changes: [] });
  });

  it('an empty deck simply stops drawing (no reshuffle)', () => {
    let s = newGame(2);
    s = { ...s, discard: [...s.discard, ...s.drawPile], drawPile: [] };
    expect(checkConservation(s)).toEqual([]);
    const hand = s.hands[1]!.length;
    s = act(s, 0, { type: 'endTurn' });
    expect(s.hands[1]).toHaveLength(hand);
    expect(s.drawPile).toEqual([]);
    expect(s.log.at(-1)).toMatchObject({ kind: 'income', cards: 0, missed: 1 });
  });
});

describe('turns, rounds and game end', () => {
  it('rejects acting out of turn without changing state', () => {
    const s = giveCards(newGame(3), 1, 'scribe');
    for (const a of [{ type: 'endTurn' }, { type: 'play', cardId: inHand(s, 1, 'scribe') }, { type: 'pass' }] as GameAction[]) {
      expect(['not-your-turn', 'wrong-timing']).toContain(rejection(s, 1, a).code);
    }
  });

  it('has no manual draw action any more', () => {
    expect(parseAction({ type: 'draw' })).toBeNull();
  });

  for (const n of [2, 3, 4]) {
    it(`${n} players: exactly ${DEMO_RULES.rounds} turns each, in seat order, then the game ends`, () => {
      let s = newGame(n);
      const turns: { seat: number; round: number }[] = [];
      while (s.turn.phase !== 'finished') {
        turns.push({ seat: s.turn.activeSeat, round: s.turn.round });
        s = act(s, s.turn.activeSeat, { type: 'endTurn' });
      }
      expect(turns).toHaveLength(n * 8);
      turns.forEach((t, i) => expect(t).toEqual({ seat: i % n, round: Math.floor(i / n) + 1 }));
      expect(s.result).not.toBeNull();
      expect(s.log.at(-1)).toMatchObject({ kind: 'gameOver' });
    });
  }

  it('forbids new Schemes in the final round but allows other cards', () => {
    let s = newGame(2);
    while (s.turn.round < 8) s = act(s, s.turn.activeSeat, { type: 'endTurn' });
    s = setGold(giveCards(s, 0, 'party-lion', 'scribe'), 0, 5);
    expect(rejection(s, 0, { type: 'play', cardId: inHand(s, 0, 'party-lion') }).code).toBe('final-round');
    const v = playerView(s, 0);
    expect(v.finalRound).toBe(true);
    expect(v.hand.find((c) => c.defId === 'party-lion')!.playable).toBe(false);
    s = playDef(s, 0, 'scribe');
  });

  it('Schemes from round 7 still resolve in round 8', () => {
    let s = newGame(2);
    while (s.turn.round < 7) s = act(s, s.turn.activeSeat, { type: 'endTurn' });
    s = endTurnsUntil(s, 1);
    s = setGold(giveCards(s, 1, 'party-lion'), 1, 3);
    s = playDef(s, 1, 'party-lion');
    const a = standing(s, 1).aristocracy;
    s = endTurnsUntil(s, 1);
    expect(s.turn.round).toBe(8);
    expect(standing(s, 1).aristocracy).toBe(a + 2);
  });

  it('rejects every gameplay action once the game is over', () => {
    let s = newGame(2);
    while (s.turn.phase !== 'finished') s = act(s, s.turn.activeSeat, { type: 'endTurn' });
    const card = s.hands[0]![0]!;
    for (const seat of [0, 1]) {
      for (const a of [{ type: 'endTurn' }, { type: 'pass' }, { type: 'play', cardId: card }] as GameAction[]) {
        expect(rejection(s, seat, a).code).toBe('game-over');
      }
    }
  });

  it('scores A + R + P, ranks ties together and shares victory', () => {
    const fam = (a: number, r: number, p: number) => ({ standings: { aristocracy: a, religion: r, popularity: p }, gold: 99 });
    const res = evaluateResult({ families: [fam(1, 2, 3), fam(4, 4, 0), fam(2, 2, 2), fam(0, 0, 1)] });
    expect(res.scores.map((x) => [x.seat, x.total, x.rank])).toEqual([
      [1, 8, 1],
      [0, 6, 2],
      [2, 6, 2],
      [3, 1, 4],
    ]);
    expect(res.winners).toEqual([1]);
    const tie = evaluateResult({ families: [fam(3, 3, 3), fam(1, 1, 1), fam(4, 4, 1)] });
    expect(tie.winners).toEqual([0, 2]);
    expect(tie.scores.filter((x) => x.rank === 1)).toHaveLength(2);
  });

  it('final result reflects final standings, not Gold', () => {
    let s = setGold(setStandings(newGame(2), 1, { religion: 9 }), 0, 50);
    while (s.turn.phase !== 'finished') s = act(s, s.turn.activeSeat, { type: 'endTurn' });
    expect(s.result!.winners).toEqual([1]);
    expect(s.result!.scores[0]).toMatchObject({ seat: 1, total: 13, rank: 1 });
  });
});

/** Plays a whole game with random legal choices, checking conservation at every step. */
function randomGame(n: number, seed: number): { final: GameState; accepted: number } {
  const rng = seededRng(seed);
  let s = newGame(n, seed);
  let accepted = 0;
  for (let step = 0; step < 2000 && s.turn.phase !== 'finished'; step++) {
    const seat = s.reaction ? s.reaction.reactor : s.turn.activeSeat;
    const view = playerView(s, seat);
    const options: GameAction[] = [];
    for (const c of view.hand) {
      if (!c.playable) continue;
      if (c.targets) for (const t of c.targets) options.push({ type: 'play', cardId: c.instanceId, target: t });
      else options.push({ type: 'play', cardId: c.instanceId });
    }
    if (view.can.pass) options.push({ type: 'pass' });
    if (view.can.endTurn && (options.length === 0 || rng() < 0.3)) options.push({ type: 'endTurn' });
    const action = options[Math.floor(rng() * options.length)]!;
    const r = applyAction(s, seat, action);
    expect(r.ok, r.ok ? '' : r.rejection.message).toBe(true);
    if (r.ok) {
      s = r.state;
      accepted++;
    }
    expect(checkConservation(s)).toEqual([]);
    for (const f of s.families) for (const v of Object.values(f.standings)) expect(v).toBeGreaterThanOrEqual(0);
    for (const f of s.families) expect(f.gold).toBeGreaterThanOrEqual(0);
  }
  return { final: s, accepted };
}

describe('whole games', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} players: random legal play conserves cards and always finishes`, () => {
      for (const seed of [3, 17]) {
        const { final, accepted } = randomGame(n, seed);
        expect(final.turn.phase).toBe('finished');
        expect(final.schemes).toEqual([]); // every Scheme resolved by the end
        expect(accepted).toBeGreaterThan(n * 8);
      }
    });
  }

  it('never mutates the input state', () => {
    const s = setGold(giveCards(newGame(), 0, 'scribe'), 0, 3);
    const frozen = JSON.stringify(s);
    applyAction(s, 0, { type: 'play', cardId: inHand(s, 0, 'scribe') });
    applyAction(s, 0, { type: 'endTurn' });
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('parseAction', () => {
  it('accepts well-formed actions and rejects junk', () => {
    expect(parseAction({ type: 'endTurn', extra: 1 })).toEqual({ type: 'endTurn' });
    expect(parseAction({ type: 'pass' })).toEqual({ type: 'pass' });
    expect(parseAction({ type: 'play', cardId: 'k1' })).toEqual({ type: 'play', cardId: 'k1' });
    expect(parseAction({ type: 'play', cardId: 'k1', target: null })).toEqual({ type: 'play', cardId: 'k1' });
    expect(parseAction({ type: 'play', cardId: 'k1', target: { kind: 'seat', seat: 1 } })).toEqual({ type: 'play', cardId: 'k1', target: { kind: 'seat', seat: 1 } });
    expect(parseAction({ type: 'play', cardId: 'k1', target: { kind: 'scheme', schemeId: 'k2', junk: 1 } })).toEqual({
      type: 'play',
      cardId: 'k1',
      target: { kind: 'scheme', schemeId: 'k2' },
    });
    expect(parseAction({ type: 'play', cardId: 'k1', target: { kind: 'marriage', childId: 'a', characterId: 'b', option: 1 } })).toMatchObject({
      target: { kind: 'marriage', childId: 'a', characterId: 'b', option: 1 },
    });
    expect(parseAction({ type: 'play', cardId: 'k1', target: { kind: 'seat', seat: -1 } })).toBeNull();
    expect(parseAction({ type: 'play', cardId: 'k1', target: { kind: 'marriage', childId: 'a', characterId: 'b', option: 0.5 } })).toBeNull();
    expect(parseAction({ type: 'play', cardId: 'k1', target: 'Bo' })).toBeNull();
    expect(parseAction({ type: 'play', cardId: 5 })).toBeNull();
    expect(parseAction({ type: 'play', cardId: 'x'.repeat(65) })).toBeNull();
    expect(parseAction({ type: 'steal' })).toBeNull();
    expect(parseAction(null)).toBeNull();
    expect(parseAction('endTurn')).toBeNull();
  });
});
