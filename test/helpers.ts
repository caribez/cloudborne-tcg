import { expect } from 'vitest';
import type { GameState } from '../src/shared/types';

/** Instance ids the viewer must NOT learn: deck, other hands and the unassigned Child pool. */
export function hiddenInstanceIds(state: GameState, viewer: number | null): string[] {
  return [...state.drawPile, ...state.childPile, ...state.hands.flatMap((h, seat) => (seat === viewer ? [] : h))];
}

/** Keys of canonical secrets that must never appear in anything sent to a player. (Reconnect tokens are checked separately.) */
const SECRET_KEYS = ['incomeRolls', 'instances', 'drawPile', 'childPile', 'seed'];

/**
 * Asserts a payload reveals nothing hidden from `viewer`:
 *  - no hidden instance id appears anywhere (quote-delimited);
 *  - no canonical secret keys;
 *  - other families' pending Schemes never carry a real definition or a target,
 *    wherever they appear (scheme lists, reaction objects, log entries).
 */
export function expectNoLeak(payload: unknown, state: GameState, viewer: number | null): void {
  const json = JSON.stringify(payload);
  for (const id of hiddenInstanceIds(state, viewer)) expect(json, `leaked instance ${id}`).not.toContain(`"${id}"`);
  for (const key of SECRET_KEYS) expect(json, `leaked key ${key}`).not.toContain(`"${key}":`);
  const secretSchemes = new Set(state.schemes.filter((s) => s.owner !== viewer).map((s) => s.instanceId));
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object' || node === null) return;
    const o = node as Record<string, unknown>;
    const ref = (typeof o.instanceId === 'string' && o.instanceId) || (typeof o.schemeId === 'string' && o.schemeId) || '';
    if (secretSchemes.has(ref)) {
      expect(o.defId === undefined || o.defId === 'hidden', `hidden Scheme ${ref} carries a definition`).toBe(true);
      expect(o.target === undefined || o.target === null, `hidden Scheme ${ref} carries a target`).toBe(true);
    }
    Object.values(o).forEach(walk);
  };
  walk(payload);
}
