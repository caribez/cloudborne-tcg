/**
 * The one place where standings and Gold change. Every effect goes through
 * these functions so the floor at 0 and the change records are consistent.
 */
import type { StandingDelta } from './cards';
import type { Draft, GameState, Seat, Standing, StandingChange } from './types';

export const STANDINGS: readonly Standing[] = ['aristocracy', 'religion', 'popularity'];

/** Adds two deltas (used to combine simultaneous changes to one family). */
export function sumDeltas(...deltas: (StandingDelta | undefined)[]): Partial<Record<Standing, number>> {
  const out: Partial<Record<Standing, number>> = {};
  for (const d of deltas) {
    if (!d) continue;
    for (const s of STANDINGS) if (d[s]) out[s] = (out[s] ?? 0) + d[s]!;
  }
  return out;
}

/**
 * Applies a standing change to one family, never below 0, and appends the
 * change actually applied to `changes` (losses that hit the floor are
 * recorded as the smaller amount, or not at all).
 */
export function adjustStandings(state: Draft<GameState>, seat: Seat, delta: StandingDelta, changes: StandingChange[]): void {
  const family = state.families[seat]!;
  for (const s of STANDINGS) {
    const want = delta[s] ?? 0;
    if (!want) continue;
    const before = family.standings[s];
    const after = Math.max(0, before + want);
    family.standings[s] = after;
    if (after !== before) changes.push({ seat, standing: s, delta: after - before });
  }
}

export function adjustGold(state: Draft<GameState>, seat: Seat, amount: number): void {
  const family = state.families[seat]!;
  family.gold = Math.max(0, family.gold + amount);
}
