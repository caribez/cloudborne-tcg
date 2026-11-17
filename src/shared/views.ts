/**
 * Player views: the information one viewer may see, derived from canonical
 * state. Presentation code only ever receives a PlayerView, and the LAN server
 * only ever sends PlayerViews, never GameState.
 *
 * Hidden: draw-pile order and identities, other players' hand contents.
 */
import { checkDraw, checkEndTurn, PROVISIONAL_RULES, turnHint } from './rules';
import type { GameState, LogEntry, Seat } from './types';

export interface ViewCard {
  readonly instanceId: string;
  readonly defId: string;
}

export interface ViewTableCard extends ViewCard {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly faceUp: boolean;
  readonly playedBy: Seat;
  readonly order: number;
}

export interface ViewPlayer {
  readonly seat: Seat;
  readonly name: string;
  readonly handCount: number;
}

export interface PlayerView {
  readonly revision: number;
  /** The seat whose private information is included, or null for a public view. */
  readonly viewer: Seat | null;
  readonly players: readonly ViewPlayer[];
  readonly activeSeat: Seat;
  readonly turnNumber: number;
  readonly drawsThisTurn: number;
  readonly playsThisTurn: number;
  readonly drawPileCount: number;
  readonly table: readonly ViewTableCard[];
  /** The viewer's own hand; empty for a public view. */
  readonly hand: readonly ViewCard[];
  readonly log: readonly LogEntry[];
  /** What the viewer may do right now (for enabling buttons; the authority re-checks). */
  readonly can: { readonly draw: boolean; readonly play: boolean; readonly endTurn: boolean };
  readonly hint: string;
}

export function playerView(state: GameState, viewer: Seat | null): PlayerView {
  const seated = viewer !== null && viewer >= 0 && viewer < state.players.length;
  const v = seated ? viewer : null;
  const hand = v === null ? [] : state.hands[v]!.map((id) => ({ instanceId: id, defId: state.instances[id]! }));
  const isActive = v !== null && state.turn.activeSeat === v;
  return {
    revision: state.revision,
    viewer: v,
    players: state.players.map((p) => ({ seat: p.seat, name: p.name, handCount: state.hands[p.seat]!.length })),
    activeSeat: state.turn.activeSeat,
    turnNumber: state.turn.number,
    drawsThisTurn: state.turn.drawsThisTurn,
    playsThisTurn: state.turn.playsThisTurn,
    drawPileCount: state.drawPile.length,
    table: state.table.map((c) => ({
      instanceId: c.instanceId,
      // Face-down table cards would hide their identity; none exist under the current rules.
      defId: c.faceUp ? state.instances[c.instanceId]! : 'hidden',
      x: c.x,
      y: c.y,
      rotation: c.rotation,
      faceUp: c.faceUp,
      playedBy: c.playedBy,
      order: c.order,
    })),
    hand,
    log: state.log.map((e) => ({ ...e })),
    can: {
      draw: v !== null && checkDraw(state, v) === null,
      play: isActive && state.turn.playsThisTurn < PROVISIONAL_RULES.maxPlaysPerTurn && hand.length > 0,
      endTurn: v !== null && checkEndTurn(state, v) === null,
    },
    hint: v === null ? '' : turnHint(state, v),
  };
}

/** View with no private information, e.g. for the hotseat privacy screen. */
export function publicView(state: GameState): PlayerView {
  return playerView(state, null);
}
