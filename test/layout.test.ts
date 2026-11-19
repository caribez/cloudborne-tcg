import { describe, expect, it } from 'vitest';
import { bandOrder, CARD_SIZE, computeLayout, spread, ZONES } from '../src/shared/layout';
import { HIDDEN, playerView } from '../src/shared/views';
import { endTurnsUntil, giveCards, newGame, playDef, setChildren, setGold } from './fixtures';

describe('table layout', () => {
  it('puts the anchor family nearest and the others in turn order', () => {
    expect(bandOrder(4, 2)).toEqual([2, 3, 0, 1]);
    expect(bandOrder(2, 0)).toEqual([0, 1]);
    const v = playerView(newGame(4), 2);
    const bands = computeLayout(v, 2).bands;
    expect(bands.map((b) => b.seat)).toEqual([2, 3, 0, 1]);
    for (let i = 1; i < bands.length; i++) expect(bands[i]!.minY).toBeGreaterThan(bands[i - 1]!.maxY);
  });

  it('keeps cards inside their zone, compressing when crowded', () => {
    for (const n of [1, 3, 7, 12]) {
      const xs = spread(n, ZONES.characters.minX, ZONES.characters.maxX);
      expect(xs).toHaveLength(n);
      for (const x of xs) {
        expect(x - CARD_SIZE.width / 2).toBeGreaterThanOrEqual(ZONES.characters.minX - 1e-9);
        expect(x + CARD_SIZE.width / 2).toBeLessThanOrEqual(ZONES.characters.maxX + 1e-9);
      }
    }
  });

  it('lays out every public card by zone and hides opponents’ Schemes', () => {
    let s = setChildren(newGame(2, 4), 0, 'faeoa-of-the-moon', 'junae-the-devout');
    s = setGold(giveCards(s, 0, 'captain-teos', 'party-lion', 'convenient-betrothal'), 0, 9);
    s = playDef(s, 0, 'captain-teos');
    s = playDef(s, 0, 'party-lion');
    const faeoa = s.children[0]!.find((id) => s.instances[id] === 'faeoa-of-the-moon')!;
    s = playDef(s, 0, 'convenient-betrothal', { kind: 'marriage', childId: faeoa, characterId: s.characters[0]![0]!, option: 0 });
    s = endTurnsUntil(s, 1);
    // Ada's Scheme stays pending until her next turn.
    const mine = computeLayout(playerView(s, 0), 0);
    const theirs = computeLayout(playerView(s, 1), 1);
    const scheme = s.schemes[0]!.instanceId;
    expect(mine.cards.find((c) => c.instanceId === scheme)).toMatchObject({ zone: 'scheme', defId: 'party-lion', secret: true, owner: 0 });
    expect(theirs.cards.find((c) => c.instanceId === scheme)).toMatchObject({ zone: 'scheme', defId: HIDDEN, secret: false, owner: 0 });
    // Married child tucked under its spouse; the unmarried one in the Children zone.
    const teos = mine.cards.find((c) => c.zone === 'character')!;
    const spouse = mine.cards.find((c) => c.instanceId === faeoa)!;
    expect(spouse).toMatchObject({ married: true, x: teos.x });
    expect(spouse.y).toBeGreaterThan(teos.y);
    expect(spouse.elevation).toBeLessThan(teos.elevation);
    const single = mine.cards.find((c) => c.zone === 'child' && !c.married)!;
    expect(single.x).toBeLessThan(ZONES.children.maxX);
    // Discard pile on the right with the spent Betrothal on top.
    expect(mine.cards.filter((c) => c.zone === 'discard').at(-1)).toMatchObject({ defId: 'convenient-betrothal', x: mine.discard.x });
    // Every visible public card is placed exactly once.
    const ids = mine.cards.map((c) => c.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
