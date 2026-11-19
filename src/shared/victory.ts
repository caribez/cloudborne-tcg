/**
 * PROVISIONAL DEMO VICTORY: after the fixed number of rounds, the family with
 * the highest Aristocracy + Religion + Popularity wins; ties share the
 * victory. Gold does not score. Replace this module to try other end conditions.
 */
import type { FamilyScore, GameResult, GameState, Standings } from './types';

export function politicalScore(standings: Standings): number {
  return standings.aristocracy + standings.religion + standings.popularity;
}

export function evaluateResult(state: Pick<GameState, 'families'>): GameResult {
  const totals = state.families.map((f, seat) => ({ seat, standings: { ...f.standings }, total: politicalScore(f.standings) }));
  const sorted = [...totals].sort((a, b) => b.total - a.total || a.seat - b.seat);
  const scores: FamilyScore[] = sorted.map((t) => ({ ...t, rank: 1 + sorted.filter((o) => o.total > t.total).length }));
  const best = sorted[0]?.total ?? 0;
  return { scores, winners: sorted.filter((t) => t.total === best).map((t) => t.seat) };
}
