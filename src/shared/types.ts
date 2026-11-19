/**
 * Canonical game state and actions. Everything here is plain serializable data:
 * no class instances, DOM nodes, Three.js objects, sockets or animation state.
 */

export type Seat = number; // 0-based seat index, also the turn order

export interface PlayerInfo {
  readonly seat: Seat;
  readonly name: string;
}

/** A card lying on the shared table. Position is in logical table units (see placement.ts). */
export interface TableCard {
  readonly instanceId: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly faceUp: boolean;
  readonly playedBy: Seat;
  /** Stacking order: higher values lie on top. */
  readonly order: number;
}

export type LogEntry =
  | { readonly seq: number; readonly kind: 'start' }
  | { readonly seq: number; readonly kind: 'draw'; readonly seat: Seat }
  | { readonly seq: number; readonly kind: 'play'; readonly seat: Seat; readonly defId: string }
  | { readonly seq: number; readonly kind: 'endTurn'; readonly seat: Seat; readonly nextSeat: Seat };

export interface TurnState {
  readonly activeSeat: Seat;
  /** Starts at 1 and increases every time any player ends a turn. */
  readonly number: number;
  readonly drawsThisTurn: number;
  readonly playsThisTurn: number;
}

/**
 * Card locations are explicit: every instance id appears in exactly one of
 * `drawPile`, one `hands[seat]`, or `table`. See `locateCard` / `checkConservation`.
 */
export interface GameState {
  /** Increments with every accepted action. Used for stale-command detection. */
  readonly revision: number;
  readonly players: readonly PlayerInfo[];
  /** instanceId -> card definition id, for every card in the game. */
  readonly instances: Readonly<Record<string, string>>;
  /** Face-down draw pile. The last element is the top card. */
  readonly drawPile: readonly string[];
  /** hands[seat] lists instance ids in the order they were received. */
  readonly hands: readonly (readonly string[])[];
  readonly table: readonly TableCard[];
  readonly turn: TurnState;
  readonly nextTableOrder: number;
  /** Public log only: never records which card was drawn. */
  readonly log: readonly LogEntry[];
}

/** Player intentions. The same types are used by hotseat and LAN. */
export type GameAction =
  | { readonly type: 'draw' }
  | { readonly type: 'play'; readonly cardId: string; readonly x: number; readonly y: number; readonly rotation: number }
  | { readonly type: 'endTurn' };

export type RejectionCode =
  | 'not-your-turn'
  | 'draw-limit'
  | 'draw-pile-empty'
  | 'play-limit'
  | 'card-not-in-hand'
  | 'outside-table'
  | 'invalid-action'
  | 'unknown-seat';

export interface Rejection {
  readonly code: RejectionCode;
  /** Plain-language explanation safe to show the acting player (never reveals hidden cards). */
  readonly message: string;
}

export type ActionResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly rejection: Rejection };

export type CardLocation =
  | { readonly zone: 'drawPile'; readonly index: number }
  | { readonly zone: 'hand'; readonly seat: Seat; readonly index: number }
  | { readonly zone: 'table'; readonly index: number };
