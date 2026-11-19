/**
 * Canonical game state and actions. Everything here is plain serializable data:
 * no class instances, DOM nodes, Three.js objects, sockets or animation state.
 *
 * The canonical state contains secrets (hand contents, deck order, hidden
 * Scheme identities and targets, future income rolls). It never leaves the
 * authority: presentation and the network only ever see PlayerViews (views.ts).
 */

export type Seat = number; // 0-based seat index, also the turn order

/** The three public political standings of a family. */
export type Standing = 'aristocracy' | 'religion' | 'popularity';
export type Standings = Readonly<Record<Standing, number>>;

export interface PlayerInfo {
  readonly seat: Seat;
  readonly name: string;
}

/** A family's public resources. Standings never drop below 0; Gold is spent on cards. */
export interface FamilyState {
  readonly standings: Standings;
  readonly gold: number;
}

/** A face-down Scheme waiting in its owner's Scheme area. */
export interface PendingScheme {
  readonly instanceId: string;
  readonly owner: Seat;
  /** Target opponent for Schemes that need one, else null. Secret while hidden. */
  readonly target: Seat | null;
  readonly placedRound: number;
  /** The Scheme resolves at the start of its owner's turn in this round (its owner's next turn). */
  readonly resolvesInRound: number;
}

/** A marriage between a Child and a Character of the same family. */
export interface Marriage {
  readonly seat: Seat;
  readonly childId: string;
  readonly characterId: string;
  /** Index into the Character's marriage options (the chosen bonus). */
  readonly option: number;
}

/**
 * An open reaction window: a Senate Intervention is trying to expose a Scheme.
 * Decision priority belongs to `reactor` (the Scheme's owner) until they respond or pass.
 */
export interface PendingChallenge {
  readonly kind: 'challenge';
  readonly initiator: Seat;
  readonly reactor: Seat;
  readonly schemeId: string;
  /** The Senate Intervention instance that opened the window (already spent and discarded). */
  readonly instantId: string;
}

export type Phase = 'action' | 'reaction' | 'finished';

export interface TurnState {
  readonly activeSeat: Seat;
  /** 1-based round. A round is one turn for every family. */
  readonly round: number;
  /** 1-based count of individual turns since the game started. */
  readonly number: number;
  readonly phase: Phase;
}

/** An applied (post-clamp) change to one family's standing, recorded for the log. */
export interface StandingChange {
  readonly seat: Seat;
  readonly standing: Standing;
  readonly delta: number;
}

export interface FamilyScore {
  readonly seat: Seat;
  readonly standings: Standings;
  readonly total: number;
  /** 1 = best. Equal totals share a rank. */
  readonly rank: number;
}

export interface GameResult {
  /** Ordered best first. */
  readonly scores: readonly FamilyScore[];
  /** Every family with the highest score (a tie is a shared victory). */
  readonly winners: readonly Seat[];
}

/**
 * Public log. Entries are written to be safe for every viewer: hidden Schemes
 * are never named or targeted, drawn cards are never named, income rolls are
 * only recorded once they have happened.
 */
export type LogEntry =
  | { readonly seq: number; readonly kind: 'start'; readonly players: number }
  | { readonly seq: number; readonly kind: 'turnStart'; readonly seat: Seat; readonly round: number }
  | {
      readonly seq: number;
      readonly kind: 'income';
      readonly seat: Seat;
      readonly roll: number;
      readonly bonusGold: number;
      readonly cards: number;
      /** Draws that could not happen because the deck was empty. */
      readonly missed: number;
    }
  | { readonly seq: number; readonly kind: 'recruit'; readonly seat: Seat; readonly defId: string; readonly cost: number; readonly changes: readonly StandingChange[] }
  | { readonly seq: number; readonly kind: 'schemePlaced'; readonly seat: Seat; readonly cost: number }
  | { readonly seq: number; readonly kind: 'challenge'; readonly seat: Seat; readonly owner: Seat; readonly schemeId: string }
  | { readonly seq: number; readonly kind: 'response'; readonly seat: Seat; readonly defId: string }
  | { readonly seq: number; readonly kind: 'allow'; readonly seat: Seat }
  | {
      readonly seq: number;
      readonly kind: 'schemeRevealed';
      readonly owner: Seat;
      readonly revealer: Seat;
      readonly defId: string;
      readonly target: Seat | null;
      readonly corrupted: boolean;
      readonly changes: readonly StandingChange[];
    }
  | { readonly seq: number; readonly kind: 'schemeSucceeded'; readonly owner: Seat; readonly defId: string; readonly target: Seat | null; readonly changes: readonly StandingChange[] }
  | { readonly seq: number; readonly kind: 'marriage'; readonly seat: Seat; readonly childDefId: string; readonly characterDefId: string; readonly changes: readonly StandingChange[] }
  | { readonly seq: number; readonly kind: 'endTurn'; readonly seat: Seat }
  | { readonly seq: number; readonly kind: 'gameOver'; readonly winners: readonly Seat[] };

/**
 * Card locations are explicit: every instance id appears in exactly one of
 * `drawPile`, a `hands[seat]`, a `characters[seat]`, `schemes`, a
 * `children[seat]`, `childPile` or `discard`. See locateCard / checkConservation.
 * Marriages are relationships between instances, never extra copies.
 */
export interface GameState {
  /** Increments with every accepted action. Used for stale-command detection. */
  readonly revision: number;
  readonly players: readonly PlayerInfo[];
  /** instanceId -> card definition id, for every card in the game. Secret. */
  readonly instances: Readonly<Record<string, string>>;
  /** Shared main deck, face down. The last element is the top card. Secret order. */
  readonly drawPile: readonly string[];
  /** hands[seat] lists instance ids in the order they were received. Secret to others. */
  readonly hands: readonly (readonly string[])[];
  /** Recruited Characters per family, in recruitment order. Public. */
  readonly characters: readonly (readonly string[])[];
  /** All pending face-down Schemes, in the order they were placed. */
  readonly schemes: readonly PendingScheme[];
  /** Each family's Children. Public. */
  readonly children: readonly (readonly string[])[];
  /** Unassigned Children (not used after setup in this demo). */
  readonly childPile: readonly string[];
  /** Discard pile, face up. The last element is the most recent. Public. */
  readonly discard: readonly string[];
  readonly marriages: readonly Marriage[];
  readonly families: readonly FamilyState[];
  readonly turn: TurnState;
  /** The open reaction window, if any. */
  readonly reaction: PendingChallenge | null;
  /** Pre-rolled Gold income per individual turn (index = turn number - 1). Secret until used. */
  readonly incomeRolls: readonly number[];
  readonly result: GameResult | null;
  readonly log: readonly LogEntry[];
}

/** What a played card is aimed at. Which kind is required depends on the card. */
export type PlayTarget =
  | { readonly kind: 'seat'; readonly seat: Seat }
  | { readonly kind: 'scheme'; readonly schemeId: string }
  | { readonly kind: 'marriage'; readonly childId: string; readonly characterId: string; readonly option: number };

/** Player intentions. The same types are used by hotseat and LAN. */
export type GameAction =
  | { readonly type: 'play'; readonly cardId: string; readonly target?: PlayTarget }
  /** Reaction window only: let the investigation proceed without a defensive card. */
  | { readonly type: 'pass' }
  | { readonly type: 'endTurn' };

export type RejectionCode =
  | 'not-your-turn'
  | 'not-your-decision'
  | 'reaction-pending'
  | 'wrong-timing'
  | 'card-not-in-hand'
  | 'insufficient-gold'
  | 'target-required'
  | 'invalid-target'
  | 'final-round'
  | 'game-over'
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
  | { readonly zone: 'characters'; readonly seat: Seat; readonly index: number }
  | { readonly zone: 'schemes'; readonly seat: Seat; readonly index: number }
  | { readonly zone: 'children'; readonly seat: Seat; readonly index: number }
  | { readonly zone: 'childPile'; readonly index: number }
  | { readonly zone: 'discard'; readonly index: number };

/** Mutable deep copy type used inside the engine while building the next state. */
export type Draft<T> = T extends readonly (infer U)[] ? Draft<U>[] : T extends object ? { -readonly [K in keyof T]: Draft<T[K]> } : T;
