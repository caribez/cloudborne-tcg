/**
 * Game engine: setup and state transitions. Pure functions over serializable
 * state. Legality is delegated to rules.ts; placement policy to placement.ts.
 */
import { hasCardDefinition } from './cards';
import { createInstances, DECK_COMPOSITION, type DeckEntry } from './deck';
import { resolvePlacement } from './placement';
import { shuffled, type Rng } from './random';
import { checkDraw, checkEndTurn, checkPlay, nextSeat, PROVISIONAL_RULES } from './rules';
import type { ActionResult, CardLocation, GameAction, GameState, LogEntry, Rejection, Seat } from './types';

const MAX_LOG = 60;

export interface SetupOptions {
  readonly playerNames: readonly string[];
  readonly rng: Rng;
  readonly composition?: readonly DeckEntry[];
  /** Lets a session keep revisions increasing across restarts, so old commands stay stale. */
  readonly initialRevision?: number;
}

export function cleanPlayerName(raw: string, fallback: string): string {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
  return name || fallback;
}

export function setupGame(options: SetupOptions): GameState {
  const { playerNames, rng } = options;
  const { minPlayers, maxPlayers, initialHandSize } = PROVISIONAL_RULES;
  if (playerNames.length < minPlayers || playerNames.length > maxPlayers) {
    throw new Error(`Player count must be ${minPlayers}–${maxPlayers}, got ${playerNames.length}`);
  }
  const instances = createInstances(options.composition ?? DECK_COMPOSITION);
  if (instances.length < playerNames.length * initialHandSize) {
    throw new Error('Deck is too small to deal starting hands');
  }
  const drawPile = shuffled(
    instances.map((i) => i.instanceId),
    rng,
  );
  const hands: string[][] = playerNames.map(() => []);
  // Deal one card at a time round the table, from the top (end) of the pile.
  for (let round = 0; round < initialHandSize; round++) {
    for (const hand of hands) hand.push(drawPile.pop()!);
  }
  return {
    revision: options.initialRevision ?? 0,
    players: playerNames.map((name, seat) => ({ seat, name: cleanPlayerName(name, `Player ${seat + 1}`) })),
    instances: Object.fromEntries(instances.map((i) => [i.instanceId, i.defId])),
    drawPile,
    hands,
    table: [],
    turn: { activeSeat: PROVISIONAL_RULES.firstSeat, number: 1, drawsThisTurn: 0, playsThisTurn: 0 },
    nextTableOrder: 1,
    log: [{ seq: 1, kind: 'start' }],
  };
}

type NewLogEntry = LogEntry extends infer E ? (E extends LogEntry ? Omit<E, 'seq'> : never) : never;

function appendLog(state: GameState, entry: NewLogEntry): readonly LogEntry[] {
  const seq = (state.log[state.log.length - 1]?.seq ?? 0) + 1;
  const log = [...state.log, { ...entry, seq } as LogEntry];
  return log.length > MAX_LOG ? log.slice(log.length - MAX_LOG) : log;
}

const fail = (rejection: Rejection): ActionResult => ({ ok: false, rejection });

/** Applies an action on behalf of `seat`. Returns a new state or a plain-language rejection. */
export function applyAction(state: GameState, seat: Seat, action: GameAction): ActionResult {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
    return fail({ code: 'unknown-seat', message: 'You are not seated in this game.' });
  }
  switch (action.type) {
    case 'draw': {
      const rejection = checkDraw(state, seat);
      if (rejection) return fail(rejection);
      const drawPile = state.drawPile.slice();
      const cardId = drawPile.pop()!;
      const hands = state.hands.map((h, s) => (s === seat ? [...h, cardId] : h));
      return {
        ok: true,
        state: {
          ...state,
          revision: state.revision + 1,
          drawPile,
          hands,
          turn: { ...state.turn, drawsThisTurn: state.turn.drawsThisTurn + 1 },
          log: appendLog(state, { kind: 'draw', seat }),
        },
      };
    }
    case 'play': {
      const rejection = checkPlay(state, seat, action.cardId, action.x, action.y);
      if (rejection) return fail(rejection);
      const placement = resolvePlacement({ x: action.x, y: action.y, rotation: action.rotation });
      const hands = state.hands.map((h, s) => (s === seat ? h.filter((id) => id !== action.cardId) : h));
      return {
        ok: true,
        state: {
          ...state,
          revision: state.revision + 1,
          hands,
          table: [
            ...state.table,
            {
              instanceId: action.cardId,
              ...placement,
              faceUp: PROVISIONAL_RULES.playFaceUp,
              playedBy: seat,
              order: state.nextTableOrder,
            },
          ],
          nextTableOrder: state.nextTableOrder + 1,
          turn: { ...state.turn, playsThisTurn: state.turn.playsThisTurn + 1 },
          log: appendLog(state, { kind: 'play', seat, defId: state.instances[action.cardId]! }),
        },
      };
    }
    case 'endTurn': {
      const rejection = checkEndTurn(state, seat);
      if (rejection) return fail(rejection);
      const next = nextSeat(state);
      return {
        ok: true,
        state: {
          ...state,
          revision: state.revision + 1,
          turn: { activeSeat: next, number: state.turn.number + 1, drawsThisTurn: 0, playsThisTurn: 0 },
          log: appendLog(state, { kind: 'endTurn', seat, nextSeat: next }),
        },
      };
    }
    default:
      return fail({ code: 'invalid-action', message: 'That action is not recognised.' });
  }
}

/** Finds where a card instance currently is. */
export function locateCard(state: GameState, instanceId: string): CardLocation | null {
  const p = state.drawPile.indexOf(instanceId);
  if (p >= 0) return { zone: 'drawPile', index: p };
  for (let seat = 0; seat < state.hands.length; seat++) {
    const i = state.hands[seat]!.indexOf(instanceId);
    if (i >= 0) return { zone: 'hand', seat, index: i };
  }
  const t = state.table.findIndex((c) => c.instanceId === instanceId);
  if (t >= 0) return { zone: 'table', index: t };
  return null;
}

/** Returns a list of problems; empty means every instance is in exactly one location. */
export function checkConservation(state: GameState): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const all = [...state.drawPile, ...state.hands.flat(), ...state.table.map((c) => c.instanceId)];
  for (const id of all) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const id of Object.keys(state.instances)) {
    const n = seen.get(id) ?? 0;
    if (n !== 1) problems.push(`${id} appears ${n} times`);
    if (!hasCardDefinition(state.instances[id]!)) problems.push(`${id} has unknown definition`);
  }
  for (const id of seen.keys()) if (!(id in state.instances)) problems.push(`${id} is not a registered instance`);
  return problems;
}

/** Runtime check for untrusted action payloads (LAN). Returns null if malformed. */
export function parseAction(raw: unknown): GameAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case 'draw':
      return { type: 'draw' };
    case 'endTurn':
      return { type: 'endTurn' };
    case 'play': {
      const { cardId, x, y, rotation } = a;
      const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
      if (typeof cardId !== 'string' || cardId.length > 64 || !finite(x) || !finite(y) || !finite(rotation)) return null;
      return { type: 'play', cardId, x, y, rotation };
    }
    default:
      return null;
  }
}
