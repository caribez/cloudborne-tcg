/** Spins up a real HTTP + Socket.IO LAN server on a random port and connects real clients. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  CommandAck,
  CommandRequest,
  JoinAck,
  ServerSnapshot,
  ServerToClientEvents,
  SimpleAck,
} from '../src/shared/protocol';
import { seededRng } from '../src/shared/random';
import type { GameAction } from '../src/shared/types';
import { attachLanServer, type LanServer } from '../src/server/socketServer';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TestClient {
  socket: ClientSocket;
  token: string | null;
  snapshots: ServerSnapshot[];
  /** Every payload received from the server (for leak checks). */
  received: unknown[];
  latest(): ServerSnapshot;
  join(name: string, token?: string): Promise<JoinAck>;
  command(action: GameAction, opts?: { commandId?: string; baseRevision?: number }): Promise<CommandAck>;
  simple(event: 'start' | 'restart' | 'backToLobby' | 'leave'): Promise<SimpleAck>;
  nextSnapshot(pred?: (s: ServerSnapshot) => boolean): Promise<ServerSnapshot>;
  close(): void;
}

export interface Harness {
  url: string;
  server: LanServer;
  client(): Promise<TestClient>;
  close(): Promise<void>;
}

let cmdCounter = 0;

export async function startHarness(seed = 1234, lobbyGraceMs = 60_000): Promise<Harness> {
  const http = createServer();
  const server = attachLanServer(http, { rngFactory: () => seededRng(seed), lobbyGraceMs });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const clients: TestClient[] = [];

  async function client(): Promise<TestClient> {
    const socket: ClientSocket = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    const c: TestClient = {
      socket,
      token: null,
      snapshots: [],
      received: [],
      latest() {
        const s = c.snapshots[c.snapshots.length - 1];
        if (!s) throw new Error('no snapshot yet');
        return s;
      },
      async join(name, token) {
        // A snapshot always follows a successful join; listen before sending.
        const snap = c.nextSnapshot();
        const res = await socket.emitWithAck('join', token ? { name, token } : { name });
        c.received.push(res);
        if (res.ok) c.token = res.token;
        if (res.ok) await snap;
        return res;
      },
      async command(action, opts = {}) {
        const req: CommandRequest = {
          commandId: opts.commandId ?? `t${++cmdCounter}`,
          baseRevision: opts.baseRevision ?? c.latest().game!.revision,
          action,
        };
        const res = await socket.emitWithAck('command', req);
        c.received.push(res);
        return res;
      },
      async simple(event) {
        const res = await socket.emitWithAck(event);
        c.received.push(res);
        return res;
      },
      nextSnapshot(pred = () => true) {
        return new Promise((resolve) => {
          const on = (s: ServerSnapshot) => {
            if (pred(s)) {
              socket.off('snapshot', on);
              resolve(s);
            }
          };
          socket.on('snapshot', on);
        });
      },
      close() {
        socket.disconnect();
      },
    };
    socket.on('snapshot', (s) => {
      c.snapshots.push(s);
      c.received.push(s);
    });
    socket.on('notice', (m) => c.received.push(m));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    clients.push(c);
    return c;
  }

  return {
    url,
    server,
    client,
    async close() {
      for (const c of clients) c.close();
      await server.close();
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}

/** Waits until queued broadcasts have been delivered. */
export const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
