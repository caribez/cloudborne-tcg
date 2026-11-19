/**
 * TURN STRUCTURE (automated phases).
 *  1. Scheme resolution: the active family's eligible Schemes succeed, in placement order.
 *  2. Income and draw: draw 1, gain the pre-rolled 1–3 Gold, then recurring
 *     Character effects in recruitment order.
 *  3. Action phase: the player acts (engine.ts / rules.ts).
 *  4. End turn: next seat; wrapping to the first seat starts a new round; after
 *     the last turn of the final round the game ends.
 */
import { getCardDefinition } from './cards';
import { appendLog } from './gameLog';
import { DEMO_RULES, nextSeat } from './rules';
import { resolveSchemeSuccess } from './schemes';
import { adjustGold } from './standings';
import type { Draft, GameResult, GameState, Seat } from './types';
import { evaluateResult } from './victory';

/** Draws up to `n` cards for `seat`. Returns how many were drawn (an empty deck simply stops). */
function drawCards(state: Draft<GameState>, seat: Seat, n: number): number {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const card = state.drawPile.pop();
    if (card === undefined) break;
    state.hands[seat]!.push(card);
    drawn++;
  }
  return drawn;
}

/** Runs the automatic start of `seat`'s turn (phases 1 and 2). */
export function beginTurn(state: Draft<GameState>, seat: Seat): void {
  appendLog(state, { kind: 'turnStart', seat, round: state.turn.round });

  // Phase 1: eligible Schemes, oldest first. Characters recruited this game are already in place.
  const due = state.schemes.filter((s) => s.owner === seat && s.resolvesInRound <= state.turn.round).map((s) => s.instanceId);
  for (const id of due) resolveSchemeSuccess(state, id);

  // Phase 2: draw, income, recurring Character effects (recruitment order).
  let wanted = DEMO_RULES.drawsPerTurn;
  let drawn = drawCards(state, seat, DEMO_RULES.drawsPerTurn);
  const roll = state.incomeRolls[state.turn.number - 1] ?? DEMO_RULES.incomeMin;
  adjustGold(state, seat, roll);
  let bonusGold = 0;
  for (const id of state.characters[seat]!) {
    const def = getCardDefinition(state.instances[id]!);
    if (def.type !== 'character') continue;
    if (def.recurring.gold) {
      adjustGold(state, seat, def.recurring.gold);
      bonusGold += def.recurring.gold;
    }
    if (def.recurring.cards) {
      wanted += def.recurring.cards;
      drawn += drawCards(state, seat, def.recurring.cards);
    }
  }
  appendLog(state, { kind: 'income', seat, roll, bonusGold, cards: drawn, missed: wanted - drawn });
}

/** Phase 4: pass the turn on, or finish the game after the final turn. */
export function advanceTurn(state: Draft<GameState>): void {
  appendLog(state, { kind: 'endTurn', seat: state.turn.activeSeat });
  const next = nextSeat(state);
  const round = next === DEMO_RULES.firstSeat ? state.turn.round + 1 : state.turn.round;
  if (round > DEMO_RULES.rounds) {
    state.turn.phase = 'finished';
    state.result = evaluateResult(state) as Draft<GameResult>;
    appendLog(state, { kind: 'gameOver', winners: [...state.result.winners] });
    return;
  }
  state.turn = { activeSeat: next, round, number: state.turn.number + 1, phase: 'action' };
  beginTurn(state, next);
}
