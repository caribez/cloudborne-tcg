/**
 * Hotseat session adapter: an in-browser authority holding canonical state
 * for all players at one screen. Uses exactly the same engine and action
 * types as the LAN server. Contains no DOM code (it is unit-tested in Node).
 */
import { applyAction, setupGame } from '../../shared/engine';
import { seededRng, type Rng } from '../../shared/random';
import { decisionSeat } from '../../shared/rules';
import type { GameAction, GameState, Seat } from '../../shared/types';
import { playerView, publicView, type PlayerView } from '../../shared/views';
import type { SubmitResult } from './types';

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]!;
}

export interface HotseatOptions {
  readonly rngFactory?: () => Rng;
  /** Test hook: adjusts each freshly set-up game (same role as the LAN authority's). */
  readonly prepareGame?: (state: GameState) => GameState;
}

export class HotseatSession {
  private state: GameState;
  private readonly listeners = new Set<() => void>();
  private readonly rngFactory: () => Rng;
  private readonly prepareGame: (state: GameState) => GameState;

  constructor(
    private readonly names: readonly string[],
    options: HotseatOptions | (() => Rng) = {},
  ) {
    const opts = typeof options === 'function' ? { rngFactory: options } : options;
    this.rngFactory = opts.rngFactory ?? (() => seededRng(randomSeed()));
    this.prepareGame = opts.prepareGame ?? ((s) => s);
    this.state = this.prepareGame(setupGame({ playerNames: names, rng: this.rngFactory() }));
  }

  get activeSeat(): Seat {
    return this.state.turn.activeSeat;
  }

  /** Who must decide next: the reactor during a reaction window, else the active player; null once finished. */
  get prioritySeat(): Seat | null {
    return decisionSeat(this.state);
  }

  get finished(): boolean {
    return this.state.turn.phase === 'finished';
  }

  get revision(): number {
    return this.state.revision;
  }

  playerName(seat: Seat): string {
    return this.state.players[seat]?.name ?? `Player ${seat + 1}`;
  }

  /** The private view for one seat. The UI only asks for the confirmed, revealed player. */
  viewFor(seat: Seat): PlayerView {
    return playerView(this.state, seat);
  }

  publicView(): PlayerView {
    return publicView(this.state);
  }

  /** Applies an action for `seat`. The hotseat UI only passes the revealed seat. */
  submit(seat: Seat, action: GameAction): SubmitResult {
    const result = applyAction(this.state, seat, action);
    if (!result.ok) return { ok: false, message: result.rejection.message };
    this.state = result.state;
    for (const fn of this.listeners) fn();
    return { ok: true };
  }

  restart(): void {
    this.state = this.prepareGame(setupGame({ playerNames: this.names, rng: this.rngFactory(), initialRevision: this.state.revision + 1 }));
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** For tests only. */
  debugState(): GameState {
    return this.state;
  }
}
