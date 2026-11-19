/**
 * ============================================================
 *  PROVISIONAL RULES — temporary, for testing the foundation.
 *  See PROTOTYPE_RULES.md. Replace freely as the design develops.
 * ============================================================
 *
 * Turn structure, limits and legality checks live here as small functions.
 * The engine (engine.ts) calls them; networking and rendering never encode
 * rules themselves, so changing this file changes both modes at once.
 */
import { isInsideTable } from './placement';
import type { GameState, Rejection, Seat } from './types';

export const PROVISIONAL_RULES = {
  minPlayers: 2,
  maxPlayers: 4,
  initialHandSize: 5,
  maxDrawsPerTurn: 1,
  maxPlaysPerTurn: 1,
  /** Played cards land face up on the shared table. */
  playFaceUp: true,
  /** First player to act. */
  firstSeat: 0,
} as const;

function reject(code: Rejection['code'], message: string): Rejection {
  return { code, message };
}

function checkTurn(state: GameState, seat: Seat): Rejection | null {
  if (state.turn.activeSeat !== seat) {
    const active = state.players[state.turn.activeSeat]?.name ?? 'another player';
    return reject('not-your-turn', `It's ${active}'s turn. Wait for your turn to act.`);
  }
  return null;
}

export function checkDraw(state: GameState, seat: Seat): Rejection | null {
  const turn = checkTurn(state, seat);
  if (turn) return turn;
  if (state.turn.drawsThisTurn >= PROVISIONAL_RULES.maxDrawsPerTurn) {
    return reject('draw-limit', 'You have already drawn a card this turn.');
  }
  if (state.drawPile.length === 0) {
    return reject('draw-pile-empty', 'The draw pile is empty, so there is nothing to draw.');
  }
  return null;
}

export function checkPlay(state: GameState, seat: Seat, cardId: string, x: number, y: number): Rejection | null {
  const turn = checkTurn(state, seat);
  if (turn) return turn;
  if (state.turn.playsThisTurn >= PROVISIONAL_RULES.maxPlaysPerTurn) {
    return reject('play-limit', 'You have already played a card this turn.');
  }
  if (!state.hands[seat]?.includes(cardId)) {
    return reject('card-not-in-hand', "That card isn't in your hand.");
  }
  if (!isInsideTable(x, y)) {
    return reject('outside-table', 'That spot is outside the playing area. Click inside the marked table.');
  }
  return null;
}

export function checkEndTurn(state: GameState, seat: Seat): Rejection | null {
  return checkTurn(state, seat);
}

/** Turns advance in seat order. */
export function nextSeat(state: GameState): Seat {
  return (state.turn.activeSeat + 1) % state.players.length;
}

/** Short reminder shown in the UI for the active player. */
export function turnHint(state: GameState, seat: Seat): string {
  if (state.turn.activeSeat !== seat) return '';
  const parts: string[] = [];
  if (state.turn.drawsThisTurn < PROVISIONAL_RULES.maxDrawsPerTurn && state.drawPile.length > 0) parts.push('draw a card');
  if (state.turn.playsThisTurn < PROVISIONAL_RULES.maxPlaysPerTurn && (state.hands[seat]?.length ?? 0) > 0) parts.push('play a card');
  return parts.length ? `You may ${parts.join(' and ')}, then end your turn.` : 'Nothing left to do: end your turn.';
}
