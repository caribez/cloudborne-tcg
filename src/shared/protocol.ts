/**
 * LAN wire protocol shared by the Socket.IO server and browser client.
 * Every server→client payload is built per recipient from filtered views.
 * Reconnect tokens travel only in the `join` request and its private ack.
 */
import type { GameAction, RejectionCode, Seat } from './types';
import type { PlayerView } from './views';
import { parseAction } from './engine';

export const MAX_SEATS = 4;

export interface LobbySeat {
  /** Public, non-secret identifier (distinct from the reconnect token). */
  readonly playerId: string;
  readonly name: string;
  readonly connected: boolean;
  readonly isHost: boolean;
}

export interface LobbyView {
  readonly phase: 'lobby' | 'playing';
  /** Fixed-length list; null means the seat is free. During play, seat index = game seat. */
  readonly seats: readonly (LobbySeat | null)[];
  readonly minPlayers: number;
  /** URLs other devices can open to join (LAN addresses of the host). */
  readonly shareUrls: readonly string[];
}

export interface ServerSnapshot {
  readonly lobby: LobbyView;
  /** The recipient's filtered game view, or null when no game is running. */
  readonly game: PlayerView | null;
  readonly you: { readonly playerId: string; readonly seat: Seat | null; readonly isHost: boolean };
  /** Names of disconnected seated players while a game is paused; empty when running. */
  readonly waitingFor: readonly string[];
}

// ---- client → server ----

export interface JoinRequest {
  readonly name: string;
  readonly token?: string;
}
export type JoinAck =
  | { readonly ok: true; readonly token: string; readonly playerId: string; readonly resumed: boolean }
  | { readonly ok: false; readonly message: string };

export interface CommandRequest {
  readonly commandId: string;
  readonly baseRevision: number;
  readonly action: GameAction;
}

export type CommandRejectCode = RejectionCode | 'stale' | 'paused' | 'no-game' | 'not-seated' | 'bad-request' | 'not-joined';

export interface CommandAck {
  readonly commandId: string;
  readonly accepted: boolean;
  /** True when this ack repeats the stored result of an earlier identical command id. */
  readonly duplicate: boolean;
  /** Authoritative revision after handling the command. */
  readonly revision: number;
  readonly code?: CommandRejectCode;
  readonly message?: string;
}

export interface SimpleAck {
  readonly ok: boolean;
  readonly message?: string;
}

/** Socket.IO event maps (typed on both ends). */
export interface ClientToServerEvents {
  join: (req: JoinRequest, ack: (res: JoinAck) => void) => void;
  setName: (name: string, ack: (res: SimpleAck) => void) => void;
  takeSeat: (seat: number, ack: (res: SimpleAck) => void) => void;
  leave: (ack: (res: SimpleAck) => void) => void;
  start: (ack: (res: SimpleAck) => void) => void;
  restart: (ack: (res: SimpleAck) => void) => void;
  backToLobby: (ack: (res: SimpleAck) => void) => void;
  command: (req: CommandRequest, ack: (res: CommandAck) => void) => void;
  sync: () => void;
}

export interface ServerToClientEvents {
  snapshot: (snap: ServerSnapshot) => void;
  /** Sent before the server drops a socket (e.g. same seat opened in another tab). */
  notice: (message: string) => void;
}

// ---- validators for untrusted input ----

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const COMMAND_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseJoin(raw: unknown): JoinRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || r.name.length > 200) return null;
  if (r.token !== undefined && r.token !== null && (typeof r.token !== 'string' || !TOKEN_RE.test(r.token))) return null;
  return typeof r.token === 'string' ? { name: r.name, token: r.token } : { name: r.name };
}

export function parseCommand(raw: unknown): CommandRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.commandId !== 'string' || !COMMAND_ID_RE.test(r.commandId)) return null;
  if (typeof r.baseRevision !== 'number' || !Number.isInteger(r.baseRevision) || r.baseRevision < 0) return null;
  const action = parseAction(r.action);
  if (!action) return null;
  return { commandId: r.commandId, baseRevision: r.baseRevision, action };
}
