/**
 * LAN session adapter (browser side). Connects to the page's own origin,
 * authenticates with a per-tab reconnect token kept in sessionStorage, and
 * submits commands with ids, base revisions and bounded retries.
 *
 * Input is only allowed while connected AND resynchronized; nothing is
 * buffered across a disconnect.
 */
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, CommandAck, ServerSnapshot, ServerToClientEvents, SimpleAck } from '../../shared/protocol';
import type { GameAction } from '../../shared/types';
import type { SubmitResult } from './types';

const TOKEN_KEY = 'cloudborne.lan.token';
const NAME_KEY = 'cloudborne.lan.name';
const ACK_TIMEOUT_MS = 4000;
const MAX_ATTEMPTS = 3;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface LanClientState {
  readonly connection: ConnectionState;
  /** True once the latest authoritative snapshot after (re)joining has arrived. */
  readonly synced: boolean;
  readonly joined: boolean;
  readonly snapshot: ServerSnapshot | null;
  readonly joinError: string | null;
  readonly notice: string | null;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Random id without crypto.randomUUID (unavailable on plain-http LAN origins). */
function randomId(bytes = 12): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hasStoredLanSession(): boolean {
  return !!storage()?.getItem(TOKEN_KEY);
}

export function storedLanName(): string {
  return storage()?.getItem(NAME_KEY) ?? '';
}

export class LanClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private state: LanClientState = { connection: 'connecting', synced: false, joined: false, snapshot: null, joinError: null, notice: null };
  private readonly listeners = new Set<(s: LanClientState) => void>();
  private name: string | null = null;
  private pending = false;

  constructor() {
    // No URL: connect to the origin that served this page (works for dev proxy, production and LAN IPs).
    this.socket = io({ autoConnect: false, reconnectionDelayMax: 3000 });
    this.socket.on('connect', () => {
      this.update({ connection: 'connected', synced: false, notice: null });
      // Rejoin automatically after a drop or a page refresh.
      const token = storage()?.getItem(TOKEN_KEY);
      if (token || this.name !== null) void this.join(this.name ?? storedLanName());
    });
    this.socket.on('disconnect', () => {
      // Drop anything Socket.IO buffered while offline: stale moves must not be replayed.
      this.socket.sendBuffer = [];
      this.update({ connection: 'disconnected', synced: false });
    });
    this.socket.on('connect_error', () => this.update({ connection: 'disconnected', synced: false }));
    this.socket.on('snapshot', (snapshot) => this.update({ snapshot, synced: true, joined: true }));
    this.socket.on('notice', (notice) => {
      // Another tab took this seat; stop reconnecting so the two tabs do not fight.
      this.socket.io.opts.reconnection = false;
      this.update({ notice });
    });
    this.socket.connect();
  }

  get current(): LanClientState {
    return this.state;
  }

  subscribe(fn: (s: LanClientState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  async join(name: string): Promise<SimpleAck> {
    this.name = name;
    storage()?.setItem(NAME_KEY, name);
    if (!this.socket.connected) return { ok: false, message: 'Not connected to the host yet.' };
    const token = storage()?.getItem(TOKEN_KEY) ?? undefined;
    try {
      const res = await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('join', token ? { name, token } : { name });
      if (!res.ok) {
        // A token the server no longer knows (e.g. after a server restart) is useless: discard it.
        if (token) storage()?.removeItem(TOKEN_KEY);
        this.update({ joinError: res.message, joined: false });
        return { ok: false, message: res.message };
      }
      storage()?.setItem(TOKEN_KEY, res.token);
      this.update({ joinError: null });
      return { ok: true };
    } catch {
      return { ok: false, message: 'The host did not answer. Check the connection and try again.' };
    }
  }

  /** Forget this tab's seat (used after leaving the lobby). */
  forget(): void {
    storage()?.removeItem(TOKEN_KEY);
    this.name = null;
    this.update({ joined: false, snapshot: null });
  }

  async lobby(event: 'start' | 'restart' | 'backToLobby' | 'leave'): Promise<SimpleAck> {
    if (!this.canSend()) return { ok: false, message: 'Not connected to the host.' };
    try {
      const res = await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event);
      if (event === 'leave' && res.ok) this.forget();
      return res;
    } catch {
      return { ok: false, message: 'The host did not answer in time.' };
    }
  }

  async takeSeat(seat: number): Promise<SimpleAck> {
    if (!this.canSend()) return { ok: false, message: 'Not connected to the host.' };
    try {
      return await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('takeSeat', seat);
    } catch {
      return { ok: false, message: 'The host did not answer in time.' };
    }
  }

  async setName(name: string): Promise<SimpleAck> {
    if (!this.canSend()) return { ok: false, message: 'Not connected to the host.' };
    storage()?.setItem(NAME_KEY, name);
    try {
      return await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('setName', name);
    } catch {
      return { ok: false, message: 'The host did not answer in time.' };
    }
  }

  /**
   * Sends a game command. Retries with the SAME command id if the ack is lost;
   * the server answers duplicates from its record without applying them again.
   */
  async submit(action: GameAction): Promise<SubmitResult> {
    const game = this.state.snapshot?.game;
    if (!this.canSend() || !game) return { ok: false, message: 'Not connected to the host. Wait for the connection to return.' };
    if (this.pending) return { ok: false, message: 'Still waiting for the host to confirm your last action.' };
    this.pending = true;
    const req = { commandId: randomId(), baseRevision: game.revision, action };
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (!this.socket.connected) break;
        try {
          const ack: CommandAck = await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('command', req);
          return ack.accepted ? { ok: true } : { ok: false, message: ack.message ?? 'The host rejected that action.' };
        } catch {
          // Timed out: retry the identical command if still connected.
        }
      }
      return { ok: false, message: 'Lost contact with the host. Your view will refresh from the host when it reconnects.' };
    } finally {
      this.pending = false;
    }
  }

  canSend(): boolean {
    return this.socket.connected && this.state.synced;
  }

  dispose(): void {
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.listeners.clear();
  }

  private update(patch: Partial<LanClientState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }
}
