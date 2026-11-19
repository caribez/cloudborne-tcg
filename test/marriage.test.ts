import { describe, expect, it } from 'vitest';
import { getCardDefinition } from '../src/shared/cards';
import { checkConservation, locateCard } from '../src/shared/engine';
import { legalMarriages } from '../src/shared/marriage';
import type { GameState, PlayTarget } from '../src/shared/types';
import { playerView } from '../src/shared/views';
import { act, giveCards, inHand, newGame, playDef, rejection, setChildren, setGold, standing } from './fixtures';

/** Seat 0 with the given Children, recruited Characters and a Convenient Betrothal in hand. */
function family(children: string[], characters: string[], betrothals = 1): GameState {
  let s = setChildren(newGame(2, 21), 0, ...children);
  s = setGold(giveCards(s, 0, ...characters, ...Array(betrothals).fill('convenient-betrothal')), 0, 20);
  for (const c of characters) s = playDef(s, 0, c);
  return s;
}
const child = (s: GameState, defId: string) => s.children[0]!.find((id) => s.instances[id] === defId)!;
const char = (s: GameState, defId: string) => s.characters[0]!.find((id) => s.instances[id] === defId)!;
const marry = (s: GameState, childDef: string, charDef: string, option = 0): PlayTarget => ({
  kind: 'marriage',
  childId: child(s, childDef),
  characterId: char(s, charDef),
  option,
});

describe('starting Children', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} families each get two public Children from the separate pool`, () => {
      const s = newGame(n, 8);
      for (let seat = 0; seat < n; seat++) {
        expect(s.children[seat]).toHaveLength(2);
        for (const id of s.children[seat]!) expect(getCardDefinition(s.instances[id]!).type).toBe('child');
        // Public: every viewer sees every family's Children.
        expect(playerView(s, (seat + 1) % n).families[seat]!.children.map((c) => c.instanceId)).toEqual(s.children[seat]);
      }
      expect(s.drawPile.some((id) => getCardDefinition(s.instances[id]!).type === 'child')).toBe(false);
    });
  }
});

describe('Convenient Betrothal', () => {
  it('marries a Child to an eligible Character, applies the bonus once and costs 1 Gold', () => {
    let s = family(['faeoa-of-the-moon', 'junae-the-devout'], ['captain-teos']);
    const a = standing(s, 0).aristocracy;
    const gold = s.families[0]!.gold;
    const target = marry(s, 'faeoa-of-the-moon', 'captain-teos');
    const card = inHand(s, 0, 'convenient-betrothal');
    s = act(s, 0, { type: 'play', cardId: card, target });
    expect(standing(s, 0).aristocracy).toBe(a + 2);
    expect(s.families[0]!.gold).toBe(gold - 1);
    expect(s.marriages).toEqual([{ seat: 0, childId: target.kind === 'marriage' ? target.childId : '', characterId: char(s, 'captain-teos'), option: 0 }]);
    expect(locateCard(s, card)?.zone).toBe('discard');
    // A relationship, not a copy: both cards stay where they were.
    expect(locateCard(s, child(s, 'faeoa-of-the-moon'))?.zone).toBe('children');
    expect(locateCard(s, char(s, 'captain-teos'))?.zone).toBe('characters');
    expect(checkConservation(s)).toEqual([]);
    expect(s.log.at(-1)).toMatchObject({ kind: 'marriage', childDefId: 'faeoa-of-the-moon', characterDefId: 'captain-teos' });
  });

  it('accepts every valid combination from the demo eligibility rules', () => {
    const s = family(['faeoa-of-the-moon', 'junae-the-devout'], ['merchant-king', 'captain-teos', 'royal-mate', 'field-sister', 'cloud-guard', 'scribe', 'war-hero', 'wandering-troupe']);
    const pairs = legalMarriages(s, 0).map((t) => `${s.instances[t.childId]}+${s.instances[t.characterId]}#${t.option}`);
    expect(pairs.sort()).toEqual(
      [
        'faeoa-of-the-moon+merchant-king#0',
        'faeoa-of-the-moon+captain-teos#0',
        'faeoa-of-the-moon+royal-mate#0',
        'faeoa-of-the-moon+royal-mate#1',
        'junae-the-devout+field-sister#0',
      ].sort(),
    );
  });

  it('rejects ineligible tags, Characters without a marriage effect and other families’ cards', () => {
    let s = family(['faeoa-of-the-moon', 'junae-the-devout'], ['field-sister', 'cloud-guard', 'merchant-king']);
    s = setGold(giveCards(s, 1, 'scribe'), 1, 5);
    const card = inHand(s, 0, 'convenient-betrothal');
    const play = (t: PlayTarget) => rejection(s, 0, { type: 'play', cardId: card, target: t });
    expect(play(marry(s, 'faeoa-of-the-moon', 'field-sister')).message).toMatch(/only marry a noble/);
    expect(play(marry(s, 'junae-the-devout', 'merchant-king')).message).toMatch(/only marry a Cloud Sister/);
    expect(play(marry(s, 'faeoa-of-the-moon', 'cloud-guard')).message).toBe('Cloud Guard cannot marry.');
    expect(play({ kind: 'marriage', childId: s.children[1]![0]!, characterId: char(s, 'merchant-king'), option: 0 }).message).toBe(
      'Choose one of your own Children.',
    );
    expect(play({ kind: 'marriage', childId: child(s, 'faeoa-of-the-moon'), characterId: s.hands[1]![0]!, option: 0 }).message).toBe(
      'Choose one of your own recruited Characters.',
    );
    expect(play({ kind: 'seat', seat: 1 }).code).toBe('invalid-target');
    expect(rejection(s, 0, { type: 'play', cardId: card }).code).toBe('target-required');
  });

  it('prevents marrying either card twice', () => {
    let s = family(['faeoa-of-the-moon', 'neion-the-feather'], ['merchant-king', 'captain-teos'], 3);
    s = playDef(s, 0, 'convenient-betrothal', marry(s, 'faeoa-of-the-moon', 'merchant-king'));
    expect(rejection(s, 0, { type: 'play', cardId: inHand(s, 0, 'convenient-betrothal'), target: marry(s, 'faeoa-of-the-moon', 'captain-teos') }).message).toBe(
      'Faeoa of the Moon is already married.',
    );
    expect(rejection(s, 0, { type: 'play', cardId: inHand(s, 0, 'convenient-betrothal'), target: marry(s, 'neion-the-feather', 'merchant-king') }).message).toBe(
      'Merchant King is already married.',
    );
    s = playDef(s, 0, 'convenient-betrothal', marry(s, 'neion-the-feather', 'captain-teos'));
    expect(s.marriages).toHaveLength(2);
    // Nobody left to marry: the remaining Betrothal is not playable.
    expect(playerView(s, 0).hand.find((c) => c.defId === 'convenient-betrothal')).toMatchObject({ playable: false, targets: [] });
  });

  it('requires choosing one of Royal Mate’s bonuses and applies only that one', () => {
    for (const [option, expected] of [
      [0, { aristocracy: 3, religion: 5 }],
      [1, { aristocracy: 5, religion: 3 }],
    ] as const) {
      let s = family(['neion-the-feather'], ['royal-mate']);
      s = playDef(s, 0, 'convenient-betrothal', marry(s, 'neion-the-feather', 'royal-mate', option));
      expect(standing(s, 0)).toMatchObject(expected);
      expect(s.marriages[0]!.option).toBe(option);
    }
    const s = family(['neion-the-feather'], ['royal-mate']);
    const card = inHand(s, 0, 'convenient-betrothal');
    expect(rejection(s, 0, { type: 'play', cardId: card, target: marry(s, 'neion-the-feather', 'royal-mate', 2) }).message).toBe(
      "Choose one of Royal Mate's marriage bonuses.",
    );
  });

  it('Field Sister and Junaé: +1 R', () => {
    let s = family(['junae-the-devout'], ['field-sister']);
    const r = standing(s, 0).religion;
    s = playDef(s, 0, 'convenient-betrothal', marry(s, 'junae-the-devout', 'field-sister'));
    expect(standing(s, 0).religion).toBe(r + 1);
  });
});
