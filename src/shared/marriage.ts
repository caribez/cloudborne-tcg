/**
 * MARRIAGE SUBSYSTEM (demo). A Child marries a Character of the same family
 * via Convenient Betrothal. The marriage is a relationship between two
 * existing instances; the Character's marriage bonus is applied once.
 *
 * PROVISIONAL: same-family marriages only; eligibility by a single tag.
 */
import { getCardDefinition } from './cards';
import type { GameState, PlayTarget, Rejection, Seat } from './types';

export type MarriageTarget = Extract<PlayTarget, { kind: 'marriage' }>;

export function isMarried(state: GameState, instanceId: string): boolean {
  return state.marriages.some((m) => m.childId === instanceId || m.characterId === instanceId);
}

const invalid = (message: string): Rejection => ({ code: 'invalid-target', message });

/** Why this Child cannot marry this Character for this family (null = allowed). */
export function checkMarriage(state: GameState, seat: Seat, childId: string, characterId: string, option: number): Rejection | null {
  // Ownership first, with one message for "not yours" and "does not exist".
  if (!state.children[seat]?.includes(childId)) return invalid('Choose one of your own Children.');
  if (!state.characters[seat]?.includes(characterId)) return invalid('Choose one of your own recruited Characters.');
  const childDef = getCardDefinition(state.instances[childId]!);
  const charDef = getCardDefinition(state.instances[characterId]!);
  if (childDef.type !== 'child' || charDef.type !== 'character') return invalid('A Child can only marry a Character.');
  if (isMarried(state, childId)) return invalid(`${childDef.name} is already married.`);
  if (isMarried(state, characterId)) return invalid(`${charDef.name} is already married.`);
  if (!charDef.marriage) return invalid(`${charDef.name} cannot marry.`);
  if (!charDef.tags.includes(childDef.marries)) {
    return invalid(`${childDef.name} may only marry a ${childDef.marries === 'noble' ? 'noble' : 'Cloud Sister'}; ${charDef.name} is not one.`);
  }
  if (!Number.isInteger(option) || option < 0 || option >= charDef.marriage.length) {
    return invalid(`Choose one of ${charDef.name}'s marriage bonuses.`);
  }
  return null;
}

/** Every legal (Child, Character, bonus option) combination for a family. */
export function legalMarriages(state: GameState, seat: Seat): MarriageTarget[] {
  const out: MarriageTarget[] = [];
  for (const childId of state.children[seat] ?? []) {
    for (const characterId of state.characters[seat] ?? []) {
      const def = getCardDefinition(state.instances[characterId]!);
      const options = def.type === 'character' ? (def.marriage?.length ?? 0) : 0;
      for (let option = 0; option < options; option++) {
        if (!checkMarriage(state, seat, childId, characterId, option)) out.push({ kind: 'marriage', childId, characterId, option });
      }
    }
  }
  return out;
}
