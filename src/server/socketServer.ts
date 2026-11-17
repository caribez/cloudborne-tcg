/**
 * Socket.IO transport for the LAN authority. Each socket authenticates once
 * with `join` (optionally presenting its reconnect token); afterwards every
 * request is attributed to that session's seat, never to client-supplied ids.
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  parseCommand,
  parseJoin,
  type ClientToServerEvents,
  type CommandAck,
  type ServerToClientEvents,
  type SimpleAck,
} from '../shared/protocol';
import { LanAuthority, type AuthorityOptions } from './authority';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface LanServer {
  readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  readonly authority: LanAuthority;
  close(): Promise<void>;
}

export function attachLanServer(httpServer: HttpServer, options: Omit<AuthorityOptions, 'onChange'> = {}): LanServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    maxHttpBufferSize: 16 * 1024,
    // Notice dropped connections within ~10 s (defaults allow ~45 s) so the game pauses promptly.
    pingInterval: 5000,
    pingTimeout: 5000,
    // Same-origin in dev (Vite proxy) and production; no CORS needed.
    serveClient: false,
  });
  /** token -> the one socket currently bound to that session */
  const bound = new Map<string, GameSocket>();

  const broadcast = () => {
    for (const [token, socket] of bound) {
      const snap = authority.snapshotFor(token);
      if (snap) socket.emit('snapshot', snap);
      else bound.delete(token); // session removed (left / lobby grace expired)
    }
  };
  const authority = new LanAuthority({ ...options, onChange: () => queueMicrotask(broadcast) });

  io.on('connection', (socket: GameSocket) => {
    let token: string | null = null;
    const ackFn = <T>(ack: unknown, fallback: (r: T) => void = () => {}): ((r: T) => void) =>
      typeof ack === 'function' ? (ack as (r: T) => void) : fallback;
    const requireToken = (ack: (r: SimpleAck) => void): string | null => {
      if (!token || !authority.hasSession(token)) {
        ack({ ok: false, message: 'Join the lobby first.' });
        return null;
      }
      return token;
    };

    socket.on('join', (raw, rawAck) => {
      const ack = ackFn(rawAck);
      const req = parseJoin(raw);
      if (!req) return ack({ ok: false, message: 'Invalid join request.' });
      const res = authority.join(req);
      if (res.ok) {
        const previous = bound.get(res.token);
        token = res.token;
        bound.set(res.token, socket); // rebind first so the old socket's disconnect is ignored
        if (previous && previous !== socket) {
          previous.emit('notice', 'This seat was opened in another browser tab or window.');
          previous.disconnect(true);
        }
      }
      ack(res);
      // The join may not change shared state (e.g. same-tab reconnect), so always sync the joiner.
      if (res.ok) {
        const snap = authority.snapshotFor(res.token);
        if (snap) socket.emit('snapshot', snap);
      }
    });

    const simple = (name: 'leave' | 'start' | 'restart' | 'backToLobby') => {
      socket.on(name, (rawAck) => {
        const ack = ackFn<SimpleAck>(rawAck);
        const t = requireToken(ack);
        if (!t) return;
        const res = authority[name](t);
        if (name === 'leave' && res.ok) {
          bound.delete(t);
          token = null;
        }
        ack(res);
      });
    };
    simple('leave');
    simple('start');
    simple('restart');
    simple('backToLobby');

    socket.on('setName', (name, rawAck) => {
      const ack = ackFn<SimpleAck>(rawAck);
      const t = requireToken(ack);
      if (!t) return;
      ack(typeof name === 'string' && name.length <= 200 ? authority.setName(t, name) : { ok: false, message: 'Invalid name.' });
    });

    socket.on('takeSeat', (seat, rawAck) => {
      const ack = ackFn<SimpleAck>(rawAck);
      const t = requireToken(ack);
      if (!t) return;
      ack(typeof seat === 'number' ? authority.takeSeat(t, seat) : { ok: false, message: 'Invalid seat.' });
    });

    socket.on('command', (raw, rawAck) => {
      const ack = ackFn<CommandAck>(rawAck);
      const req = parseCommand(raw);
      const commandId =
        typeof raw === 'object' && raw !== null && typeof (raw as { commandId?: unknown }).commandId === 'string'
          ? String((raw as { commandId: string }).commandId).slice(0, 64)
          : '';
      if (!req) {
        return ack({ commandId, accepted: false, duplicate: false, revision: -1, code: 'bad-request', message: 'That request was malformed.' });
      }
      if (!token || !authority.hasSession(token)) {
        return ack({ commandId, accepted: false, duplicate: false, revision: -1, code: 'not-joined', message: 'Join the game first.' });
      }
      const res = authority.command(token, req);
      ack(res);
      // After a rejection the client may be out of date: resend its authoritative view.
      if (!res.accepted) {
        const snap = authority.snapshotFor(token);
        if (snap) socket.emit('snapshot', snap);
      }
    });

    socket.on('sync', () => {
      if (!token) return;
      const snap = authority.snapshotFor(token);
      if (snap) socket.emit('snapshot', snap);
    });

    socket.on('disconnect', () => {
      if (token && bound.get(token) === socket) {
        bound.delete(token);
        authority.disconnect(token);
      }
    });
  });

  return {
    io,
    authority,
    close: () =>
      new Promise<void>((resolve) => {
        authority.dispose();
        void io.close(() => resolve());
      }),
  };
}
