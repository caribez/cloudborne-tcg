/**
 * LAN authority: the single lobby and game hosted by this server.
 *
 * Transport-agnostic on purpose (no sockets here) so the rules of seating,
 * hosting, command handling and filtering can be tested directly. The
 * Socket.IO layer (socketServer.ts) authenticates each socket to a session
 * token and forwards calls.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { applyAction, cleanPlayerName, setupGame } from '../shared/engine';
import {
  MAX_SEATS,
  type CommandAck,
  type CommandRequest,
  type JoinAck,
  type JoinRequest,
  type LobbySeat,
  type ServerSnapshot,
  type SimpleAck,
} from '../shared/protocol';
import { seededRng, type Rng } from '../shared/random';
import { PROVISIONAL_RULES } from '../shared/rules';
import type { GameState } from '../shared/types';
import { playerView } from '../shared/views';

interface Session {
  readonly token: string;
  readonly playerId: string;
  name: string;
  seat: number | null;
  connected: boolean;
  graceTimer: ReturnType<typeof setTimeout> | null;
  /** Results of recent command ids, so retries are answered without re-applying. */
  readonly recent: Map<string, CommandAck>;
}

export interface AuthorityOptions {
  /** Produces the shuffle RNG for each new game. Defaults to a crypto-seeded PRNG. The seed is never exposed. */
  readonly rngFactory?: () => Rng;
  /** How long a disconnected player keeps a lobby seat (not during a game). */
  readonly lobbyGraceMs?: number;
  /** Called after any change that may alter someone's snapshot. */
  readonly onChange?: () => void;
  readonly log?: (message: string) => void;
  /** LAN URLs shown in the lobby so the host can tell others where to connect. */
  readonly shareUrls?: readonly string[];
}

const RECENT_LIMIT = 200;
const secureToken = () => randomBytes(24).toString('base64url');
const defaultRng = () => seededRng(randomInt(0, 2 ** 32));

export class LanAuthority {
  private readonly sessions = new Map<string, Session>();
  private seats: (string | null)[] = Array.from({ length: MAX_SEATS }, () => null);
  private hostToken: string | null = null;
  private game: GameState | null = null;
  private lastRevision = -1;
  private readonly rngFactory: () => Rng;
  private readonly lobbyGraceMs: number;
  private readonly onChange: () => void;
  private readonly log: (m: string) => void;
  private readonly shareUrls: readonly string[];

  constructor(options: AuthorityOptions = {}) {
    this.rngFactory = options.rngFactory ?? defaultRng;
    this.lobbyGraceMs = options.lobbyGraceMs ?? 60_000;
    this.onChange = options.onChange ?? (() => {});
    this.log = options.log ?? (() => {});
    this.shareUrls = options.shareUrls ?? [];
  }

  get phase(): 'lobby' | 'playing' {
    return this.game ? 'playing' : 'lobby';
  }

  // ---------- sessions ----------

  join(req: JoinRequest): JoinAck {
    if (req.token) {
      const existing = this.sessions.get(req.token);
      if (existing) {
        this.markConnected(existing);
        this.log(`${existing.name} reconnected`);
        this.changed();
        return { ok: true, token: existing.token, playerId: existing.playerId, resumed: true };
      }
    }
    if (this.game) {
      return { ok: false, message: 'A game is already in progress on this server. Ask the host to return to the lobby.' };
    }
    const seat = this.seats.indexOf(null);
    if (seat < 0) {
      return { ok: false, message: `The lobby is full (${MAX_SEATS} of ${MAX_SEATS} seats taken).` };
    }
    const session: Session = {
      token: secureToken(),
      playerId: randomBytes(6).toString('hex'),
      name: cleanPlayerName(req.name, `Player ${seat + 1}`),
      seat,
      connected: true,
      graceTimer: null,
      recent: new Map(),
    };
    this.sessions.set(session.token, session);
    this.seats[seat] = session.token;
    if (!this.hostToken) this.hostToken = session.token;
    this.log(`${session.name} joined seat ${seat + 1}${this.hostToken === session.token ? ' (host)' : ''}`);
    this.changed();
    return { ok: true, token: session.token, playerId: session.playerId, resumed: false };
  }

  /** Whether a token belongs to a live session. */
  hasSession(token: string): boolean {
    return this.sessions.has(token);
  }

  disconnect(token: string): void {
    const s = this.sessions.get(token);
    if (!s || !s.connected) return;
    s.connected = false;
    this.log(`${s.name} disconnected`);
    if (!this.game) this.startGrace(s);
    this.changed();
  }

  private markConnected(s: Session): void {
    s.connected = true;
    if (s.graceTimer) clearTimeout(s.graceTimer);
    s.graceTimer = null;
  }

  private startGrace(s: Session): void {
    // The host keeps their seat and privileges (no host migration in this prototype).
    if (s.token === this.hostToken || s.graceTimer) return;
    s.graceTimer = setTimeout(() => {
      s.graceTimer = null;
      if (!s.connected && !this.game) this.removeSession(s);
    }, this.lobbyGraceMs);
    s.graceTimer.unref?.();
  }

  private removeSession(s: Session): void {
    if (s.graceTimer) clearTimeout(s.graceTimer);
    this.sessions.delete(s.token);
    this.seats = this.seats.map((t) => (t === s.token ? null : t));
    if (this.hostToken === s.token) this.hostToken = null;
    if (this.sessions.size === 0) this.hostToken = null; // brand-new lobby
    this.log(`${s.name} left the lobby`);
    this.changed();
  }

  // ---------- lobby actions ----------

  setName(token: string, name: string): SimpleAck {
    const s = this.sessions.get(token);
    if (!s) return { ok: false, message: 'Join the lobby first.' };
    if (this.game) return { ok: false, message: 'Names can only be changed in the lobby.' };
    s.name = cleanPlayerName(name, s.name);
    this.changed();
    return { ok: true };
  }

  takeSeat(token: string, seat: number): SimpleAck {
    const s = this.sessions.get(token);
    if (!s) return { ok: false, message: 'Join the lobby first.' };
    if (this.game) return { ok: false, message: 'Seats can only be changed in the lobby.' };
    if (!Number.isInteger(seat) || seat < 0 || seat >= MAX_SEATS) return { ok: false, message: 'That seat does not exist.' };
    const occupant = this.seats[seat];
    if (occupant === token) return { ok: true };
    if (occupant) return { ok: false, message: 'That seat is already taken.' };
    this.seats = this.seats.map((t) => (t === token ? null : t));
    this.seats[seat] = token;
    s.seat = seat;
    this.changed();
    return { ok: true };
  }

  leave(token: string): SimpleAck {
    const s = this.sessions.get(token);
    if (!s) return { ok: true };
    if (this.game) return { ok: false, message: 'You cannot leave during a game. Ask the host to return to the lobby.' };
    if (token === this.hostToken && this.sessions.size > 1) {
      return { ok: false, message: 'The host cannot leave while other players are in the lobby (no host hand-over yet).' };
    }
    this.removeSession(s);
    return { ok: true };
  }

  start(token: string): SimpleAck {
    if (token !== this.hostToken) return { ok: false, message: 'Only the host can start the game.' };
    if (this.game) return { ok: false, message: 'The game has already started.' };
    const seated = this.seats.filter((t): t is string => t !== null).map((t) => this.sessions.get(t)!);
    if (seated.length < PROVISIONAL_RULES.minPlayers) {
      return { ok: false, message: `At least ${PROVISIONAL_RULES.minPlayers} players are needed to start.` };
    }
    const away = seated.filter((s) => !s.connected);
    if (away.length) return { ok: false, message: `Waiting for ${away.map((s) => s.name).join(', ')} to reconnect.` };
    // Compact seats so lobby seat index equals game seat index during play.
    this.seats = Array.from({ length: MAX_SEATS }, (_, i) => seated[i]?.token ?? null);
    seated.forEach((s, i) => (s.seat = i));
    this.newGame(seated);
    return { ok: true };
  }

  restart(token: string): SimpleAck {
    if (token !== this.hostToken) return { ok: false, message: 'Only the host can restart the game.' };
    if (!this.game) return { ok: false, message: 'No game is running.' };
    const seated = this.seats.filter((t): t is string => t !== null).map((t) => this.sessions.get(t)!);
    this.newGame(seated);
    return { ok: true };
  }

  backToLobby(token: string): SimpleAck {
    if (token !== this.hostToken) return { ok: false, message: 'Only the host can end the game.' };
    if (!this.game) return { ok: true };
    this.lastRevision = this.game.revision;
    this.game = null;
    for (const s of this.sessions.values()) if (!s.connected) this.startGrace(s);
    this.log('Game ended; back to lobby');
    this.changed();
    return { ok: true };
  }

  private newGame(seated: Session[]): void {
    const initialRevision = Math.max(this.lastRevision, this.game?.revision ?? -1) + 1;
    this.game = setupGame({ playerNames: seated.map((s) => s.name), rng: this.rngFactory(), initialRevision });
    this.lastRevision = this.game.revision;
    this.log(`Game started with ${seated.length} players`);
    this.changed();
  }

  // ---------- game commands ----------

  command(token: string, req: CommandRequest): CommandAck {
    const s = this.sessions.get(token);
    const revision = this.game?.revision ?? this.lastRevision;
    if (!s) return { commandId: req.commandId, accepted: false, duplicate: false, revision, code: 'not-joined', message: 'Join the game first.' };
    const prior = s.recent.get(req.commandId);
    if (prior) return { ...prior, duplicate: true };

    const ack = this.evaluate(s, req);
    s.recent.set(req.commandId, ack);
    if (s.recent.size > RECENT_LIMIT) s.recent.delete(s.recent.keys().next().value!);
    if (ack.accepted) this.changed();
    return ack;
  }

  private evaluate(s: Session, req: CommandRequest): CommandAck {
    const base = { commandId: req.commandId, duplicate: false };
    const game = this.game;
    if (!game) return { ...base, accepted: false, revision: this.lastRevision, code: 'no-game', message: 'No game is running.' };
    const reject = (code: CommandAck['code'], message: string): CommandAck => ({ ...base, accepted: false, revision: game.revision, code, message });
    if (s.seat === null) return reject('not-seated', 'You are not seated in this game.');
    const waiting = this.waitingFor();
    if (waiting.length) return reject('paused', `The game is paused while waiting for ${waiting.join(', ')} to reconnect.`);
    if (req.baseRevision !== game.revision) {
      return reject('stale', 'The table changed before your action arrived. Your view has been refreshed; please try again.');
    }
    const result = applyAction(game, s.seat, req.action);
    if (!result.ok) return reject(result.rejection.code, result.rejection.message);
    this.game = result.state;
    this.lastRevision = result.state.revision;
    return { ...base, accepted: true, revision: result.state.revision };
  }

  // ---------- views ----------

  private waitingFor(): string[] {
    if (!this.game) return [];
    return this.seats
      .filter((t): t is string => t !== null)
      .map((t) => this.sessions.get(t)!)
      .filter((s) => !s.connected)
      .map((s) => s.name);
  }

  /** The filtered snapshot for one session. Never includes tokens, deck order or other hands. */
  snapshotFor(token: string): ServerSnapshot | null {
    const me = this.sessions.get(token);
    if (!me) return null;
    const seats = this.seats.map((t): LobbySeat | null => {
      if (!t) return null;
      const s = this.sessions.get(t)!;
      return { playerId: s.playerId, name: s.name, connected: s.connected, isHost: t === this.hostToken };
    });
    return {
      lobby: { phase: this.phase, seats, minPlayers: PROVISIONAL_RULES.minPlayers, shareUrls: this.shareUrls },
      game: this.game ? playerView(this.game, me.seat) : null,
      you: { playerId: me.playerId, seat: me.seat, isHost: token === this.hostToken },
      waitingFor: this.waitingFor(),
    };
  }

  /** For tests only: the canonical state. Never send this to a client. */
  debugState(): GameState | null {
    return this.game;
  }

  dispose(): void {
    for (const s of this.sessions.values()) if (s.graceTimer) clearTimeout(s.graceTimer);
  }

  private changed(): void {
    this.onChange();
  }
}
