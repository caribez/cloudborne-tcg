/**
 * Game engine: setup and state transitions. Pure functions over serializable
 * state: every transition works on a deep copy (a draft) and returns it.
 * Legality is delegated to rules.ts; turn automation to turns.ts; Scheme
 * outcomes to schemes.ts; marriage checks to marriage.ts.
 */
import { getCardDefinition, hasCardDefinition } from './cards';
import { CHILD_POOL, createInstances, MAIN_DECK, opaqueIdSource, type DeckEntry, type IdSource } from './deck';
import { appendLog } from './gameLog';
import { randomIntInclusive, shuffled, type Rng } from './random';
import { checkEndTurn, checkPass, checkPlay, DEMO_RULES } from './rules';
import { revealScheme } from './schemes';
import { adjustGold, adjustStandings } from './standings';
import { advanceTurn, beginTurn } from './turns';
import type { ActionResult, CardLocation, Draft, GameAction, GameState, PlayTarget, Rejection, Seat, StandingChange } from './types';

export interface SetupOptions {
  readonly playerNames: readonly string[];
  /** All setup randomness (instance ids, shuffles, income rolls) comes from here. */
  readonly rng: Rng;
  readonly deck?: readonly DeckEntry[];
  readonly childPool?: readonly DeckEntry[];
  /** Instance id generator. Defaults to opaque ids drawn from `rng`. */
  readonly ids?: IdSource;
  /** Lets a session keep revisions increasing across restarts, so old commands stay stale. */
  readonly initialRevision?: number;
}

export function cleanPlayerName(raw: string, fallback: string): string {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
  return name || fallback;
}

export function setupGame(options: SetupOptions): GameState {
  const { playerNames, rng } = options;
  const { minPlayers, maxPlayers, initialHandSize, childrenPerFamily } = DEMO_RULES;
  const n = playerNames.length;
  if (n < minPlayers || n > maxPlayers) {
    throw new Error(`Player count must be ${minPlayers}–${maxPlayers}, got ${n}`);
  }
  const ids = options.ids ?? opaqueIdSource(rng);
  const main = createInstances(options.deck ?? MAIN_DECK, ids);
  const kids = createInstances(options.childPool ?? CHILD_POOL, ids);
  if (main.length < n * initialHandSize) throw new Error('Deck is too small to deal starting hands');
  if (kids.length < n * childrenPerFamily) throw new Error('Child pool is too small');

  const drawPile = shuffled(
    main.map((i) => i.instanceId),
    rng,
  );
  const childPile = shuffled(
    kids.map((i) => i.instanceId),
    rng,
  );
  const hands: string[][] = playerNames.map(() => []);
  // Deal one card at a time round the table, from the top (end) of the pile.
  for (let r = 0; r < initialHandSize; r++) for (const hand of hands) hand.push(drawPile.pop()!);
  const children: string[][] = playerNames.map(() => []);
  for (let r = 0; r < childrenPerFamily; r++) for (const c of children) c.push(childPile.pop()!);
  // One private income roll per individual turn of this fixed-length game.
  const incomeRolls = Array.from({ length: n * DEMO_RULES.rounds }, () => randomIntInclusive(rng, DEMO_RULES.incomeMin, DEMO_RULES.incomeMax));

  const draft: Draft<GameState> = {
    revision: options.initialRevision ?? 0,
    players: playerNames.map((name, seat) => ({ seat, name: cleanPlayerName(name, `Player ${seat + 1}`) })),
    instances: Object.fromEntries([...main, ...kids].map((i) => [i.instanceId, i.defId])),
    drawPile,
    hands,
    characters: playerNames.map(() => []),
    schemes: [],
    children,
    childPile,
    discard: [],
    marriages: [],
    families: playerNames.map(() => ({ standings: { ...DEMO_RULES.startingStandings }, gold: DEMO_RULES.startingGold })),
    turn: { activeSeat: DEMO_RULES.firstSeat, round: 1, number: 1, phase: 'action' },
    reaction: null,
    incomeRolls,
    result: null,
    log: [],
  };
  appendLog(draft, { kind: 'start', players: n });
  // The first turn's automatic draw and income happen immediately.
  beginTurn(draft, DEMO_RULES.firstSeat);
  return draft;
}

const fail = (rejection: Rejection): ActionResult => ({ ok: false, rejection });

function draftOf(state: GameState): Draft<GameState> {
  return structuredClone(state) as Draft<GameState>;
}

/** Applies an action on behalf of `seat`. Returns a new state or a plain-language rejection. */
export function applyAction(state: GameState, seat: Seat, action: GameAction): ActionResult {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
    return fail({ code: 'unknown-seat', message: 'You are not seated in this game.' });
  }
  let rejection: Rejection | null;
  let run: (d: Draft<GameState>) => void;
  switch (action.type) {
    case 'play':
      rejection = checkPlay(state, seat, action.cardId, action.target);
      run = (d) => playCard(d, seat, action.cardId, action.target);
      break;
    case 'pass':
      rejection = checkPass(state, seat);
      run = (d) => {
        appendLog(d, { kind: 'allow', seat });
        finishChallenge(d, 'none');
      };
      break;
    case 'endTurn':
      rejection = checkEndTurn(state, seat);
      run = (d) => advanceTurn(d);
      break;
    default:
      return fail({ code: 'invalid-action', message: 'That action is not recognised.' });
  }
  if (rejection) return fail(rejection);
  const draft = draftOf(state);
  run(draft);
  draft.revision = state.revision + 1;
  return { ok: true, state: draft };
}

/** Plays a card already validated by checkPlay: pay, move it, resolve it. */
function playCard(d: Draft<GameState>, seat: Seat, cardId: string, target: PlayTarget | undefined): void {
  const def = getCardDefinition(d.instances[cardId]!);
  d.hands[seat] = d.hands[seat]!.filter((id) => id !== cardId);
  adjustGold(d, seat, -def.cost);

  switch (def.type) {
    case 'character': {
      d.characters[seat]!.push(cardId);
      const changes: StandingChange[] = [];
      adjustStandings(d, seat, def.onRecruit, changes);
      appendLog(d, { kind: 'recruit', seat, defId: def.id, cost: def.cost, changes });
      return;
    }
    case 'scheme': {
      d.schemes.push({
        instanceId: cardId,
        owner: seat,
        target: target?.kind === 'seat' ? target.seat : null,
        placedRound: d.turn.round,
        resolvesInRound: d.turn.round + 1,
      });
      // Public: that a Scheme exists and what it cost. Never its name or target.
      appendLog(d, { kind: 'schemePlaced', seat, cost: def.cost });
      return;
    }
    case 'instant': {
      d.discard.push(cardId);
      switch (def.effect) {
        case 'senate-intervention': {
          if (target?.kind !== 'scheme') throw new Error('validated target missing');
          const scheme = d.schemes.find((s) => s.instanceId === target.schemeId)!;
          d.reaction = { kind: 'challenge', initiator: seat, reactor: scheme.owner, schemeId: scheme.instanceId, instantId: cardId };
          d.turn.phase = 'reaction';
          appendLog(d, { kind: 'challenge', seat, owner: scheme.owner, schemeId: scheme.instanceId });
          return;
        }
        case 'corruption':
          appendLog(d, { kind: 'response', seat, defId: def.id });
          finishChallenge(d, 'corruption');
          return;
        case 'vanish-in-the-crowd':
          appendLog(d, { kind: 'response', seat, defId: def.id });
          finishChallenge(d, 'vanish');
          return;
        case 'convenient-betrothal': {
          if (target?.kind !== 'marriage') throw new Error('validated target missing');
          const character = getCardDefinition(d.instances[target.characterId]!);
          if (character.type !== 'character' || !character.marriage) throw new Error('validated character missing');
          d.marriages.push({ seat, childId: target.childId, characterId: target.characterId, option: target.option });
          const changes: StandingChange[] = [];
          adjustStandings(d, seat, character.marriage[target.option]!, changes);
          appendLog(d, { kind: 'marriage', seat, childDefId: d.instances[target.childId]!, characterDefId: character.id, changes });
          return;
        }
      }
      return;
    }
    case 'child':
      throw new Error('Children are never in hand');
  }
}

/** Closes the reaction window and returns priority to the active player. */
function finishChallenge(d: Draft<GameState>, response: 'none' | 'corruption' | 'vanish'): void {
  const r = d.reaction;
  if (!r) throw new Error('No reaction window is open');
  // Vanish in the Crowd: the Scheme stays hidden with its original timing.
  if (response !== 'vanish') revealScheme(d, r.schemeId, r.initiator, response === 'corruption');
  d.reaction = null;
  d.turn.phase = 'action';
}

/** Finds where a card instance currently is. */
export function locateCard(state: GameState, instanceId: string): CardLocation | null {
  const inList = (list: readonly string[]) => list.indexOf(instanceId);
  let i = inList(state.drawPile);
  if (i >= 0) return { zone: 'drawPile', index: i };
  for (let seat = 0; seat < state.players.length; seat++) {
    if ((i = inList(state.hands[seat]!)) >= 0) return { zone: 'hand', seat, index: i };
    if ((i = inList(state.characters[seat]!)) >= 0) return { zone: 'characters', seat, index: i };
    if ((i = inList(state.children[seat]!)) >= 0) return { zone: 'children', seat, index: i };
  }
  i = state.schemes.findIndex((s) => s.instanceId === instanceId);
  if (i >= 0) return { zone: 'schemes', seat: state.schemes[i]!.owner, index: i };
  if ((i = inList(state.childPile)) >= 0) return { zone: 'childPile', index: i };
  if ((i = inList(state.discard)) >= 0) return { zone: 'discard', index: i };
  return null;
}

/** Returns a list of problems; empty means every instance is in exactly one valid location. */
export function checkConservation(state: GameState): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const all = [
    ...state.drawPile,
    ...state.hands.flat(),
    ...state.characters.flat(),
    ...state.schemes.map((s) => s.instanceId),
    ...state.children.flat(),
    ...state.childPile,
    ...state.discard,
  ];
  for (const id of all) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const id of Object.keys(state.instances)) {
    const n = seen.get(id) ?? 0;
    if (n !== 1) problems.push(`${id} appears ${n} times`);
    if (!hasCardDefinition(state.instances[id]!)) problems.push(`${id} has unknown definition`);
  }
  for (const id of seen.keys()) if (!(id in state.instances)) problems.push(`${id} is not a registered instance`);
  // Zones only hold the right kinds of cards.
  const typeOf = (id: string) => (hasCardDefinition(state.instances[id] ?? '') ? getCardDefinition(state.instances[id]!).type : null);
  for (const id of state.characters.flat()) if (typeOf(id) !== 'character') problems.push(`${id} in a Character area is not a Character`);
  for (const s of state.schemes) if (typeOf(s.instanceId) !== 'scheme') problems.push(`${s.instanceId} in a Scheme area is not a Scheme`);
  for (const id of [...state.children.flat(), ...state.childPile]) if (typeOf(id) !== 'child') problems.push(`${id} among Children is not a Child`);
  for (const id of [...state.drawPile, ...state.hands.flat()]) if (typeOf(id) === 'child') problems.push(`${id} is a Child in the main deck or a hand`);
  // Marriages relate existing in-play instances of the same family, each at most once.
  const married = new Map<string, number>();
  for (const m of state.marriages) {
    if (!state.children[m.seat]?.includes(m.childId)) problems.push(`marriage child ${m.childId} not in family ${m.seat}`);
    if (!state.characters[m.seat]?.includes(m.characterId)) problems.push(`marriage character ${m.characterId} not in family ${m.seat}`);
    for (const id of [m.childId, m.characterId]) married.set(id, (married.get(id) ?? 0) + 1);
  }
  for (const [id, n] of married) if (n > 1) problems.push(`${id} is married ${n} times`);
  return problems;
}

/** Runtime check for untrusted action payloads (LAN). Returns null if malformed. */
export function parseAction(raw: unknown): GameAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case 'pass':
      return { type: 'pass' };
    case 'endTurn':
      return { type: 'endTurn' };
    case 'play': {
      if (!isId(a.cardId)) return null;
      if (a.target === undefined || a.target === null) return { type: 'play', cardId: a.cardId };
      const target = parseTarget(a.target);
      return target ? { type: 'play', cardId: a.cardId, target } : null;
    }
    default:
      return null;
  }
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isSmallInt = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

function parseTarget(raw: unknown): PlayTarget | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  switch (t.kind) {
    case 'seat':
      return isSmallInt(t.seat, 16) ? { kind: 'seat', seat: t.seat } : null;
    case 'scheme':
      return isId(t.schemeId) ? { kind: 'scheme', schemeId: t.schemeId } : null;
    case 'marriage':
      return isId(t.childId) && isId(t.characterId) && isSmallInt(t.option, 16)
        ? { kind: 'marriage', childId: t.childId, characterId: t.characterId, option: t.option }
        : null;
    default:
      return null;
  }
}
