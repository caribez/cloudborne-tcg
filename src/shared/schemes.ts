/**
 * SCHEME RESOLUTION. A pending Scheme ends in exactly one of two ways:
 *  - success: never exposed, it resolves at the start of its owner's next turn;
 *  - revealed: an opponent exposed it (Senate Intervention not cancelled).
 * Either way it is revealed publicly and moved to the discard pile, so it can
 * never resolve twice.
 */
import { getCardDefinition, type SchemeDefinition, type StandingDelta } from './cards';
import { appendLog } from './gameLog';
import { adjustStandings, STANDINGS, sumDeltas } from './standings';
import type { Draft, GameState, PendingScheme, Seat, Standing, StandingChange } from './types';

function schemeDef(state: Draft<GameState>, id: string): SchemeDefinition {
  const def = getCardDefinition(state.instances[id]!);
  if (def.type !== 'scheme') throw new Error(`${id} is not a Scheme`);
  return def;
}

/** Removes a pending Scheme and puts it face up on the discard pile. */
function discardScheme(state: Draft<GameState>, id: string): PendingScheme {
  const index = state.schemes.findIndex((s) => s.instanceId === id);
  if (index < 0) throw new Error(`${id} is not a pending Scheme`);
  const [scheme] = state.schemes.splice(index, 1);
  state.discard.push(id);
  return scheme!;
}

type Part = { seat: Seat; delta: StandingDelta | undefined };

/** Applies a set of per-family deltas, combining simultaneous changes to one family first. */
function applyAll(state: Draft<GameState>, parts: readonly Part[]): StandingChange[] {
  const changes: StandingChange[] = [];
  const bySeat = new Map<Seat, Partial<Record<Standing, number>>>();
  for (const p of parts) bySeat.set(p.seat, sumDeltas(bySeat.get(p.seat), p.delta));
  for (const [seat, delta] of [...bySeat].sort((a, b) => a[0] - b[0])) adjustStandings(state, seat, delta, changes);
  return changes;
}

/** Unexposed Scheme at its owner's turn start: reveal, apply Success, discard. */
export function resolveSchemeSuccess(state: Draft<GameState>, id: string): void {
  const def = schemeDef(state, id);
  const scheme = discardScheme(state, id);
  const parts: Part[] = [{ seat: scheme.owner, delta: def.success.owner }];
  if (scheme.target !== null) parts.push({ seat: scheme.target, delta: def.success.target });
  const changes = applyAll(state, parts);
  appendLog(state, { kind: 'schemeSucceeded', owner: scheme.owner, defId: def.id, target: scheme.target, changes });
}

/**
 * Exposed Scheme: reveal, apply Revealed (never Success), discard.
 * With Corruption, standing losses aimed at the owner hit the revealer
 * instead; the owner keeps any gains and the revealer's own effects still apply.
 */
export function revealScheme(state: Draft<GameState>, id: string, revealer: Seat, corrupted: boolean): void {
  const def = schemeDef(state, id);
  const scheme = discardScheme(state, id);
  const ownerDelta = def.revealed.owner ?? {};
  const keep: Partial<Record<Standing, number>> = {};
  const redirected: Partial<Record<Standing, number>> = {};
  for (const s of STANDINGS) {
    const v = ownerDelta[s];
    if (!v) continue;
    if (corrupted && v < 0) redirected[s] = v;
    else keep[s] = v;
  }
  const parts: Part[] = [
    { seat: scheme.owner, delta: keep },
    { seat: revealer, delta: sumDeltas(redirected, def.revealed.revealer) },
  ];
  if (scheme.target !== null) parts.push({ seat: scheme.target, delta: def.revealed.target });
  const changes = applyAll(state, parts);
  appendLog(state, { kind: 'schemeRevealed', owner: scheme.owner, revealer, defId: def.id, target: scheme.target, corrupted, changes });
}
