import { afterEach, describe, expect, it } from 'vitest';
import { checkConservation } from '../src/shared/engine';
import { expectNoLeak } from './helpers';
import { settle, startHarness, type Harness, type TestClient } from './lanHarness';

let h: Harness;
afterEach(async () => {
  await h?.close();
});

async function lobbyOf(n: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let i = 0; i < n; i++) {
    const c = await h.client();
    const res = await c.join(['Ada', 'Bo', 'Cy', 'Di'][i]!);
    expect(res.ok).toBe(true);
    clients.push(c);
  }
  await settle();
  return clients;
}

async function startedGame(n: number): Promise<TestClient[]> {
  const clients = await lobbyOf(n);
  expect(await clients[0]!.simple('start')).toEqual({ ok: true });
  await settle();
  return clients;
}

describe('lobby', () => {
  it('gives host controls to the first joiner only', async () => {
    h = await startHarness();
    const [a, b] = await lobbyOf(2);
    expect(a!.latest().you.isHost).toBe(true);
    expect(b!.latest().you.isHost).toBe(false);
    expect(a!.latest().lobby.seats.map((s) => s?.name ?? null)).toEqual(['Ada', 'Bo', null, null]);
    const res = await b!.simple('start');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/only the host/i);
  });

  it('needs at least two players to start', async () => {
    h = await startHarness();
    const [a] = await lobbyOf(1);
    expect((await a!.simple('start')).ok).toBe(false);
  });

  it('rejects a fifth player and occupied seats', async () => {
    h = await startHarness();
    const [, b] = await lobbyOf(4);
    const fifth = await h.client();
    const res = await fifth.join('Eve');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/full/i);
    expect(await b!.socket.emitWithAck('takeSeat', 0)).toEqual({ ok: false, message: 'That seat is already taken.' });
  });

  it('lets a player move to a free seat; start compacts seats', async () => {
    h = await startHarness();
    const [a, b] = await lobbyOf(2);
    expect(await b!.socket.emitWithAck('takeSeat', 3)).toEqual({ ok: true });
    await settle();
    expect(a!.latest().lobby.seats.map((s) => s?.name ?? null)).toEqual(['Ada', null, null, 'Bo']);
    await a!.simple('start');
    await settle();
    expect(b!.latest().you.seat).toBe(1);
    expect(b!.latest().game!.players.map((p) => p.name)).toEqual(['Ada', 'Bo']);
  });

  it('rejects joining while a game is in progress', async () => {
    h = await startHarness();
    await startedGame(2);
    const late = await h.client();
    const res = await late.join('Late');
    expect(res.ok).toBe(false);
  });

  it('validates malformed payloads', async () => {
    h = await startHarness();
    const c = await h.client();
    expect(await c.socket.emitWithAck('join', { name: 42 } as never)).toMatchObject({ ok: false });
    expect(await c.socket.emitWithAck('join', { name: 'x', token: '../../etc' } as never)).toMatchObject({ ok: false });
    await c.join('Ada');
    const bad = await c.socket.emitWithAck('command', { commandId: 'x1', baseRevision: 0, action: { type: 'play', cardId: 'c001' } } as never);
    expect(bad).toMatchObject({ accepted: false, code: 'bad-request' });
  });
});

describe('game synchronization', () => {
  for (const n of [2, 3, 4]) {
    it(`deals ${n} players and sends each only their own hand`, async () => {
      h = await startHarness();
      const clients = await startedGame(n);
      const state = h.server.authority.debugState()!;
      clients.forEach((c, seat) => {
        const g = c.latest().game!;
        expect(g.viewer).toBe(seat);
        expect(g.hand.map((x) => x.instanceId)).toEqual(state.hands[seat]);
        expect(g.players.map((p) => p.handCount)).toEqual(Array(n).fill(5));
        expect(g.drawPileCount).toBe(40 - 5 * n);
      });
    });
  }

  it('uses the session seat, not anything the client claims', async () => {
    h = await startHarness();
    const [, b] = await startedGame(2);
    // Bo tries to act although it's Ada's turn; there is no way to claim another seat.
    const res = await b!.command({ type: 'draw' });
    expect(res).toMatchObject({ accepted: false, code: 'not-your-turn' });
    const forged = await b!.socket.emitWithAck('command', { commandId: 'f1', baseRevision: b!.latest().game!.revision, action: { type: 'endTurn' }, seat: 0 } as never);
    expect(forged.accepted).toBe(false);
  });

  it('broadcasts accepted actions as filtered snapshots, never leaking hidden cards', async () => {
    h = await startHarness();
    const clients = await startedGame(3);
    const [a, b] = clients as [TestClient, TestClient, TestClient];
    await a.command({ type: 'draw' });
    await settle();
    const card = a.latest().game!.hand[0]!.instanceId;
    expect(await a.command({ type: 'play', cardId: card, x: 1, y: 2, rotation: 90 })).toMatchObject({ accepted: true });
    await a.command({ type: 'endTurn' });
    await settle();
    await b.command({ type: 'draw' });
    // Bo tries to play Ada's card: rejection must not reveal anything.
    const peek = await b.command({ type: 'play', cardId: a.latest().game!.hand[0]!.instanceId, x: 0, y: 0, rotation: 0 });
    expect(peek.accepted).toBe(false);
    await settle();

    const state = h.server.authority.debugState()!;
    expect(checkConservation(state)).toEqual([]);
    for (const [seat, client] of clients.entries()) {
      const g = client.latest().game!;
      expect(g.revision).toBe(state.revision);
      expect(g.table).toEqual([expect.objectContaining({ instanceId: card, x: 1, y: 2, rotation: 90, playedBy: 0 })]);
      // Final hidden set: nothing the client ever received mentions a card it cannot currently see,
      // except cards that became public (the played card).
      expectNoLeak(client.received.slice(-3), state, seat);
    }
    // Snapshots never carry anyone's reconnect token.
    for (const client of clients) {
      const otherTokens = clients.filter((o) => o !== client).map((o) => o.token!);
      const json = JSON.stringify(client.received);
      for (const t of otherTokens) expect(json).not.toContain(t);
      const snapshotsJson = JSON.stringify(client.snapshots);
      expect(snapshotsJson).not.toContain(client.token!);
    }
  });

  it('never sends deck order or other hands at any point in a game', async () => {
    h = await startHarness();
    const clients = await startedGame(4);
    // Every seat draws and ends; the payload stream is checked against the state at each step.
    for (let turn = 0; turn < 8; turn++) {
      const seat = turn % 4;
      const c = clients[seat]!;
      await c.command({ type: 'draw' });
      await settle();
      await c.command({ type: 'endTurn' });
      await settle();
      const state = h.server.authority.debugState()!;
      clients.forEach((cl, s) => {
        // The latest snapshot must leak nothing about current hidden cards.
        expectNoLeak(cl.latest(), state, s);
      });
    }
    // Across the whole history, a client must never have seen a card id that is
    // still hidden from it (in deck or another hand) at the end.
    const final = h.server.authority.debugState()!;
    clients.forEach((cl, s) => expectNoLeak(cl.received, final, s));
  });
});

describe('commands: ids, retries and revisions', () => {
  it('a retried draw is acknowledged again but applied once', async () => {
    h = await startHarness();
    const [a] = await startedGame(2);
    const base = a!.latest().game!.revision;
    const first = await a!.command({ type: 'draw' }, { commandId: 'retry-1', baseRevision: base });
    const again = await a!.command({ type: 'draw' }, { commandId: 'retry-1', baseRevision: base });
    expect(first).toMatchObject({ accepted: true, duplicate: false, revision: base + 1 });
    expect(again).toMatchObject({ accepted: true, duplicate: true, revision: base + 1 });
    await settle();
    expect(a!.latest().game!.hand).toHaveLength(6);
    expect(h.server.authority.debugState()!.revision).toBe(base + 1);
  });

  it('a retried play cannot play twice', async () => {
    h = await startHarness();
    const [a] = await startedGame(2);
    const base = a!.latest().game!.revision;
    const card = a!.latest().game!.hand[0]!.instanceId;
    const action = { type: 'play' as const, cardId: card, x: 0, y: 0, rotation: 0 };
    await a!.command(action, { commandId: 'p-1', baseRevision: base });
    await a!.command(action, { commandId: 'p-1', baseRevision: base });
    await settle();
    expect(h.server.authority.debugState()!.table).toHaveLength(1);
    expect(a!.latest().game!.hand).toHaveLength(4);
  });

  it('rejects a stale command and resynchronizes the sender', async () => {
    h = await startHarness();
    const [a] = await startedGame(2);
    const base = a!.latest().game!.revision;
    await a!.command({ type: 'draw' }, { baseRevision: base });
    await settle();
    const resync = a!.nextSnapshot();
    const stale = await a!.command({ type: 'endTurn' }, { baseRevision: base });
    expect(stale).toMatchObject({ accepted: false, code: 'stale' });
    const snap = await resync;
    expect(snap.game!.revision).toBe(base + 1);
    expect(snap.game!.activeSeat).toBe(0); // the stale end-turn did not happen
  });
});

describe('disconnect and reconnect', () => {
  it('pauses on disconnect, restores the seat and view with the token, then resumes', async () => {
    h = await startHarness();
    const [a, b] = await startedGame(2);
    const bToken = b!.token!;
    const bHand = b!.latest().game!.hand;
    b!.close();
    await settle();
    expect(a!.latest().waitingFor).toEqual(['Bo']);
    expect(a!.latest().lobby.seats[1]!.connected).toBe(false);
    expect(await a!.command({ type: 'draw' })).toMatchObject({ accepted: false, code: 'paused' });

    // "Refresh": a brand-new socket presenting the stored token.
    const b2 = await h.client();
    const res = await b2.join('ignored', bToken);
    expect(res).toMatchObject({ ok: true, resumed: true });
    const snap = b2.latest();
    expect(snap.you.seat).toBe(1);
    expect(snap.game!.hand).toEqual(bHand);
    await settle();
    expect(a!.latest().waitingFor).toEqual([]);
    expect(await a!.command({ type: 'draw' })).toMatchObject({ accepted: true });
  });

  it('an unknown token cannot take a seat in a running game', async () => {
    h = await startHarness();
    await startedGame(2);
    const x = await h.client();
    expect((await x.join('X', 'A'.repeat(32))).ok).toBe(false);
  });

  it('a second tab with the same token replaces the first socket', async () => {
    h = await startHarness();
    const [a] = await startedGame(2);
    const dup = await h.client();
    const kicked = new Promise<string>((r) => a!.socket.once('notice', r));
    await dup.join('Ada', a!.token!);
    expect(await kicked).toMatch(/another browser tab/);
    await settle();
    expect(dup.latest().you.seat).toBe(0);
    expect(dup.latest().waitingFor).toEqual([]);
  });

  it('frees a lobby seat after the grace period but keeps the host', async () => {
    h = await startHarness(1, 50);
    const [a, b] = await lobbyOf(2);
    b!.close();
    await settle(120);
    expect(a!.latest().lobby.seats.filter(Boolean)).toHaveLength(1);
    const c = await h.client();
    await c.join('Cy');
    a!.close();
    await settle(120);
    const snap = c.latest();
    expect(snap.lobby.seats[0]).toMatchObject({ name: 'Ada', isHost: true, connected: false });
  });
});

describe('host controls', () => {
  it('only the host can restart or end; restart reshuffles and makes old commands stale', async () => {
    h = await startHarness();
    const [a, b] = await startedGame(2);
    expect((await b!.simple('restart')).ok).toBe(false);
    expect((await b!.simple('backToLobby')).ok).toBe(false);
    const oldRev = a!.latest().game!.revision;
    expect(await a!.simple('restart')).toEqual({ ok: true });
    await settle();
    const g = a!.latest().game!;
    expect(g.revision).toBeGreaterThan(oldRev);
    expect(g.hand).toHaveLength(5);
    expect(await a!.command({ type: 'draw' }, { baseRevision: oldRev })).toMatchObject({ accepted: false, code: 'stale' });
    expect(await a!.simple('backToLobby')).toEqual({ ok: true });
    await settle();
    expect(b!.latest().game).toBeNull();
    expect(b!.latest().lobby.phase).toBe('lobby');
  });
});
