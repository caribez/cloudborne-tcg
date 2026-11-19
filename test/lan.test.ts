import { afterEach, describe, expect, it } from 'vitest';
import { checkConservation } from '../src/shared/engine';
import type { GameState } from '../src/shared/types';
import { HIDDEN } from '../src/shared/views';
import { giveCards, setGold } from './fixtures';
import { expectNoLeak } from './helpers';
import { settle, startHarness, type Harness, type TestClient } from './lanHarness';

let h: Harness;
afterEach(async () => {
  await h?.close();
});

/** Server-side test setup: Ada holds Schemes and defensive cards, Bo and Cy hold Senate Interventions. */
function intrigue(s: GameState): GameState {
  let t = giveCards(s, 0, 'party-lion', 'street-slander', 'vanish-in-the-crowd', 'corruption', 'scribe');
  t = giveCards(t, 1, 'senate-intervention', 'senate-intervention', 'scribe');
  if (t.players.length > 2) t = giveCards(t, 2, 'senate-intervention');
  for (let seat = 0; seat < t.players.length; seat++) t = setGold(t, seat, 6);
  return t;
}

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

const handOf = (c: TestClient, defId: string) => c.latest().game!.hand.find((x) => x.defId === defId)!.instanceId;

/** Ada places Party Lion, ends her turn; Bo investigates it. Returns the Scheme id. */
async function openChallenge(a: TestClient, b: TestClient): Promise<string> {
  const lion = handOf(a, 'party-lion');
  expect(await a.command({ type: 'play', cardId: lion })).toMatchObject({ accepted: true });
  await settle();
  expect(await a.command({ type: 'endTurn' })).toMatchObject({ accepted: true });
  await settle();
  expect(await b.command({ type: 'play', cardId: handOf(b, 'senate-intervention'), target: { kind: 'scheme', schemeId: lion } })).toMatchObject({ accepted: true });
  await settle();
  return lion;
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
    expect(b!.latest().game!.families.map((p) => p.name)).toEqual(['Ada', 'Bo']);
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
    for (const action of [{ type: 'play', cardId: 5 }, { type: 'draw' }, { type: 'play', cardId: 'k1', target: { kind: 'seat', seat: 'Bo' } }]) {
      const bad = await c.socket.emitWithAck('command', { commandId: 'x1', baseRevision: 0, action } as never);
      expect(bad).toMatchObject({ accepted: false, code: 'bad-request' });
    }
  });
});

describe('game synchronization', () => {
  for (const n of [2, 3, 4]) {
    it(`sets up ${n} families and sends each only their own hand`, async () => {
      h = await startHarness();
      const clients = await startedGame(n);
      const state = h.server.authority.debugState()!;
      clients.forEach((c, seat) => {
        const g = c.latest().game!;
        expect(g.viewer).toBe(seat);
        expect(g.hand.map((x) => x.instanceId)).toEqual(state.hands[seat]);
        expect(g.families.map((p) => p.handCount)).toEqual([8, ...Array(n - 1).fill(7)]);
        expect(g.drawPileCount).toBe(144 - 7 * n - 1);
        expect(g.families.map((f) => f.gold)).toEqual(state.families.map((f) => f.gold));
        expectNoLeak(c.received, state, seat);
      });
    });
  }

  it('uses the session seat, not anything the client claims', async () => {
    h = await startHarness();
    const [, b] = await startedGame(2);
    expect(await b!.command({ type: 'endTurn' })).toMatchObject({ accepted: false, code: 'not-your-turn' });
    const forged = await b!.socket.emitWithAck('command', { commandId: 'f1', baseRevision: b!.latest().game!.revision, action: { type: 'endTurn' }, seat: 0 } as never);
    expect(forged.accepted).toBe(false);
  });

  it('hides a placed Scheme and its target from opponents in every payload', async () => {
    h = await startHarness(1234, 60_000, intrigue);
    const clients = await startedGame(3);
    const [a, b, c] = clients as [TestClient, TestClient, TestClient];
    const slander = handOf(a, 'street-slander');
    expect(await a.command({ type: 'play', cardId: slander, target: { kind: 'seat', seat: 2 } })).toMatchObject({ accepted: true });
    await settle();
    const state = h.server.authority.debugState()!;
    expect(checkConservation(state)).toEqual([]);
    expect(a.latest().game!.families[0]!.schemes[0]).toMatchObject({ instanceId: slander, defId: 'street-slander', target: 2 });
    for (const [seat, client] of [
      [1, b],
      [2, c],
    ] as const) {
      expect(client.latest().game!.families[0]!.schemes[0]).toMatchObject({ instanceId: slander, defId: HIDDEN, target: null });
      expectNoLeak(client.received, state, seat);
    }
    // Bo cannot play Ada's cards; the rejection is the same as for a made-up id.
    const peek = await b.command({ type: 'play', cardId: a.latest().game!.hand[0]!.instanceId });
    const fake = await b.command({ type: 'play', cardId: 'kzzzzzzzzzz' });
    expect(peek.message).toBe(fake.message);
  });

  it('never sends anyone else\u2019s reconnect token, and no token in snapshots', async () => {
    h = await startHarness();
    const clients = await startedGame(3);
    await clients[0]!.command({ type: 'endTurn' });
    await settle();
    for (const client of clients) {
      const json = JSON.stringify(client.received);
      for (const other of clients.filter((o) => o !== client)) expect(json).not.toContain(other.token!);
      expect(JSON.stringify(client.snapshots)).not.toContain(client.token!);
    }
  });

  it('never sends deck order, other hands or hidden Schemes at any point in a game', async () => {
    h = await startHarness(99, 60_000, intrigue);
    const clients = await startedGame(4);
    await clients[0]!.command({ type: 'play', cardId: handOf(clients[0]!, 'party-lion') });
    await settle();
    for (let turn = 0; turn < 8; turn++) {
      const seat = turn % 4;
      await clients[seat]!.command({ type: 'endTurn' });
      await settle();
      const state = h.server.authority.debugState()!;
      clients.forEach((cl, s) => expectNoLeak(cl.latest(), state, s));
    }
    const final = h.server.authority.debugState()!;
    clients.forEach((cl, s) => expectNoLeak(cl.received, final, s));
  });
});

describe('reactions over LAN', () => {
  it('only the Scheme owner may respond; the active player waits; priority returns', async () => {
    h = await startHarness(5, 60_000, intrigue);
    const [a, b, c] = (await startedGame(3)) as [TestClient, TestClient, TestClient];
    const lion = await openChallenge(a, b);
    for (const cl of [a, b, c]) {
      const g = cl.latest().game!;
      expect(g.reaction).toEqual({ initiator: 1, reactor: 0, schemeId: lion });
      expect(g.decisionSeat).toBe(0);
      expect(g.phase).toBe('reaction');
    }
    expect(a.latest().game!.can.pass).toBe(true);
    expect(await b.command({ type: 'pass' })).toMatchObject({ accepted: false, code: 'not-your-decision' });
    expect(await c.command({ type: 'pass' })).toMatchObject({ accepted: false, code: 'not-your-decision' });
    expect(await c.command({ type: 'play', cardId: handOf(c, 'senate-intervention'), target: { kind: 'scheme', schemeId: lion } })).toMatchObject({
      accepted: false,
      code: 'not-your-turn',
    });
    expect(await b.command({ type: 'endTurn' })).toMatchObject({ accepted: false, code: 'reaction-pending' });
    expect(await b.command({ type: 'play', cardId: handOf(b, 'scribe') })).toMatchObject({ accepted: false, code: 'reaction-pending' });
    // Still hidden for everyone but Ada until the reveal resolves.
    expect(b.latest().game!.families[0]!.schemes[0]!.defId).toBe(HIDDEN);
    expect(await a.command({ type: 'pass' })).toMatchObject({ accepted: true });
    await settle();
    for (const cl of [a, b, c]) {
      const g = cl.latest().game!;
      expect(g.reaction).toBeNull();
      expect(g.decisionSeat).toBe(1);
      expect(g.discard.at(-1)).toEqual({ instanceId: lion, defId: 'party-lion' });
      expect(g.families[0]!.standings.aristocracy).toBe(1);
    }
    expect(await b.command({ type: 'play', cardId: handOf(b, 'scribe') })).toMatchObject({ accepted: true });
  });

  it('a retried reaction is applied once', async () => {
    h = await startHarness(5, 60_000, intrigue);
    const [a, b] = (await startedGame(2)) as [TestClient, TestClient];
    await openChallenge(a, b);
    const gold = a.latest().game!.families[0]!.gold;
    const base = a.latest().game!.revision;
    const action = { type: 'play' as const, cardId: handOf(a, 'vanish-in-the-crowd') };
    const first = await a.command(action, { commandId: 'react-1', baseRevision: base });
    const again = await a.command(action, { commandId: 'react-1', baseRevision: base });
    expect(first).toMatchObject({ accepted: true, duplicate: false });
    expect(again).toMatchObject({ accepted: true, duplicate: true, revision: first.revision });
    await settle();
    expect(a.latest().game!.families[0]!.gold).toBe(gold - 1);
    expect(h.server.authority.debugState()!.revision).toBe(base + 1);
    expect(a.latest().game!.families[0]!.schemes).toHaveLength(1); // Vanish kept it hidden
  });

  it('survives the reactor reconnecting mid-decision', async () => {
    h = await startHarness(5, 60_000, intrigue);
    const [a, b] = (await startedGame(2)) as [TestClient, TestClient];
    const lion = await openChallenge(a, b);
    const token = a.token!;
    a.close();
    await settle();
    expect(b.latest().waitingFor).toEqual(['Ada']);
    expect(await b.command({ type: 'endTurn' })).toMatchObject({ accepted: false, code: 'paused' });

    const a2 = await h.client();
    expect(await a2.join('ignored', token)).toMatchObject({ ok: true, resumed: true });
    const g = a2.latest().game!;
    expect(g.viewer).toBe(0);
    expect(g.reaction).toEqual({ initiator: 1, reactor: 0, schemeId: lion });
    expect(g.families[0]!.schemes[0]).toMatchObject({ instanceId: lion, defId: 'party-lion', challenged: true });
    expect(g.can.pass).toBe(true);
    await settle();
    expect(b.latest().waitingFor).toEqual([]);
    expect(await a2.command({ type: 'play', cardId: handOf(a2, 'corruption') })).toMatchObject({ accepted: true });
    await settle();
    expect(b.latest().game!.families[1]!.standings.aristocracy).toBe(1); // redirected penalty
    expect(b.latest().game!.decisionSeat).toBe(1);
  });
});

describe('commands: ids, retries and revisions', () => {
  it('a retried recruit is acknowledged again but paid and applied once', async () => {
    h = await startHarness(1, 60_000, intrigue);
    const [a] = await startedGame(2);
    const base = a!.latest().game!.revision;
    const action = { type: 'play' as const, cardId: handOf(a!, 'scribe') };
    const first = await a!.command(action, { commandId: 'retry-1', baseRevision: base });
    const again = await a!.command(action, { commandId: 'retry-1', baseRevision: base });
    expect(first).toMatchObject({ accepted: true, duplicate: false, revision: base + 1 });
    expect(again).toMatchObject({ accepted: true, duplicate: true, revision: base + 1 });
    await settle();
    expect(a!.latest().game!.families[0]!.gold).toBe(5);
    expect(a!.latest().game!.families[0]!.characters).toHaveLength(1);
    expect(h.server.authority.debugState()!.revision).toBe(base + 1);
  });

  it('a retried end turn cannot skip a player', async () => {
    h = await startHarness();
    const [a] = await startedGame(3);
    const base = a!.latest().game!.revision;
    await a!.command({ type: 'endTurn' }, { commandId: 'e-1', baseRevision: base });
    await a!.command({ type: 'endTurn' }, { commandId: 'e-1', baseRevision: base });
    await settle();
    expect(h.server.authority.debugState()!.turn.activeSeat).toBe(1);
  });

  it('rejects a stale command and resynchronizes the sender', async () => {
    h = await startHarness(1, 60_000, intrigue);
    const [a] = await startedGame(2);
    const base = a!.latest().game!.revision;
    await a!.command({ type: 'play', cardId: handOf(a!, 'scribe') }, { baseRevision: base });
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
    expect(await a!.command({ type: 'endTurn' })).toMatchObject({ accepted: false, code: 'paused' });

    const b2 = await h.client();
    const res = await b2.join('ignored', bToken);
    expect(res).toMatchObject({ ok: true, resumed: true });
    const snap = b2.latest();
    expect(snap.you.seat).toBe(1);
    expect(snap.game!.hand).toEqual(bHand);
    await settle();
    expect(a!.latest().waitingFor).toEqual([]);
    expect(await a!.command({ type: 'endTurn' })).toMatchObject({ accepted: true });
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

describe('host controls and game completion', () => {
  it('only the host can restart or end; restart re-deals and makes old commands stale', async () => {
    h = await startHarness();
    const [a, b] = await startedGame(2);
    expect((await b!.simple('restart')).ok).toBe(false);
    expect((await b!.simple('backToLobby')).ok).toBe(false);
    const oldRev = a!.latest().game!.revision;
    expect(await a!.simple('restart')).toEqual({ ok: true });
    await settle();
    const g = a!.latest().game!;
    expect(g.revision).toBeGreaterThan(oldRev);
    expect(g.hand).toHaveLength(8);
    expect(await a!.command({ type: 'endTurn' }, { baseRevision: oldRev })).toMatchObject({ accepted: false, code: 'stale' });
    expect(await a!.simple('backToLobby')).toEqual({ ok: true });
    await settle();
    expect(b!.latest().game).toBeNull();
    expect(b!.latest().lobby.phase).toBe('lobby');
  });

  it('plays to the end, rejects further actions, and restarts', async () => {
    h = await startHarness();
    const clients = await startedGame(2);
    for (let i = 0; i < 16; i++) {
      const seat = i % 2;
      expect(await clients[seat]!.command({ type: 'endTurn' })).toMatchObject({ accepted: true });
      await settle(5);
    }
    await settle();
    const g = clients[1]!.latest().game!;
    expect(g.phase).toBe('finished');
    expect(g.result!.winners).toEqual([0, 1]); // nobody gained anything: shared victory
    expect(g.result!.scores.map((s) => s.total)).toEqual([6, 6]);
    for (const c of clients) expect(await c.command({ type: 'endTurn' })).toMatchObject({ accepted: false, code: 'game-over' });
    expect(await clients[0]!.simple('restart')).toEqual({ ok: true });
    await settle();
    expect(clients[1]!.latest().game!).toMatchObject({ phase: 'action', round: 1, result: null });
  });
});
