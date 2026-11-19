/**
 * Hotseat session adapter: an in-browser authority holding canonical state
 * for all players at one screen. Uses exactly the same engine and action
 * types as the LAN server. Contains no DOM code (it is unit-tested in Node).
 */
import { applyAction, setupGame } from '../../shared/engine';
import { seededRng, type Rng } from '../../shared/random';
import type { GameAction, GameState, Seat } from '../../shared/types';
import { playerView, publicView, type PlayerView } from '../../shared/views';
import type { SubmitResult } from './types';

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]!;
}

export class HotseatSession {
  private state: GameState;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly names: readonly string[],
    private readonly rngFactory: () => Rng = () => seededRng(randomSeed()),
  ) {
    this.state = setupGame({ playerNames: names, rng: rngFactory() });
  }

  get activeSeat(): Seat {
    return this.state.turn.activeSeat;
  }

  get revision(): number {
    return this.state.revision;
  }

  playerName(seat: Seat): string {
    return this.state.players[seat]?.name ?? `Player ${seat + 1}`;
  }

  /** The private view for one seat. The UI only asks for the active, confirmed player. */
  viewFor(seat: Seat): PlayerView {
    return playerView(this.state, seat);
  }

  publicView(): PlayerView {
    return publicView(this.state);
  }

  /** Applies an action for `seat`. The caller (the hotseat UI) only passes the revealed active seat. */
  submit(seat: Seat, action: GameAction): SubmitResult {
    const result = applyAction(this.state, seat, action);
    if (!result.ok) return { ok: false, message: result.rejection.message };
    this.state = result.state;
    for (const fn of this.listeners) fn();
    return { ok: true };
  }

  restart(): void {
    this.state = setupGame({ playerNames: this.names, rng: this.rngFactory(), initialRevision: this.state.revision + 1 });
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
