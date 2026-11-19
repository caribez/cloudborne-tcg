/**
 * ============================================================
 *  DEMO RULES — provisional values for the Cloudborne demo.
 *  See PROTOTYPE_RULES.md. Replace freely as the design develops.
 * ============================================================
 *
 * Rule values and legality checks live here as small functions. The engine
 * (engine.ts) calls them; networking and rendering never encode rules
 * themselves, so changing this file changes both modes at once.
 */
import { getCardDefinition, type CardDefinition } from './cards';
import { legalMarriages, checkMarriage } from './marriage';
import type { GameState, PlayTarget, Rejection, RejectionCode, Seat, Standings } from './types';

export const DEMO_RULES = {
  minPlayers: 2,
  maxPlayers: 4,
  /** Main-deck cards dealt to each family at setup. */
  initialHandSize: 7,
  /** Children assigned to each family from the Child pool at setup. */
  childrenPerFamily: 2,
  startingStandings: { aristocracy: 2, religion: 2, popularity: 2 } satisfies Standings,
  startingGold: 3,
  /** Gold income at the start of every turn: uniform in [min, max]. */
  incomeMin: 1,
  incomeMax: 3,
  /** Main-deck cards drawn at the start of every turn (before Character bonuses). */
  drawsPerTurn: 1,
  /** Fixed game length in rounds (one turn per family each round). */
  rounds: 8,
  /** No new Schemes may be placed in the final round. */
  noSchemesInFinalRound: true,
  firstSeat: 0,
} as const;

function reject(code: RejectionCode, message: string): Rejection {
  return { code, message };
}

const nameOf = (state: GameState, seat: Seat) => state.players[seat]?.name ?? 'another player';

/** The seat entitled to make the next decision: the reactor during a reaction window, else the active player. */
export function decisionSeat(state: GameState): Seat | null {
  if (state.turn.phase === 'finished') return null;
  if (state.reaction) return state.reaction.reactor;
  return state.turn.activeSeat;
}

export function isFinalRound(state: GameState): boolean {
  return state.turn.round >= DEMO_RULES.rounds;
}

function checkRunning(state: GameState): Rejection | null {
  return state.turn.phase === 'finished' ? reject('game-over', 'The game is over. Restart to play again.') : null;
}

/** Ordinary actions: your own action phase with no open reaction window. */
function checkActionPhase(state: GameState, seat: Seat): Rejection | null {
  if (state.turn.activeSeat !== seat) {
    if (state.reaction?.reactor === seat) return reject('not-your-decision', 'Respond to the investigation first.');
    return reject('not-your-turn', `It's ${nameOf(state, state.turn.activeSeat)}'s turn. Wait for your turn to act.`);
  }
  if (state.reaction) {
    return reject('reaction-pending', `Wait for ${nameOf(state, state.reaction.reactor)} to respond to the investigation.`);
  }
  return null;
}

/** Reaction cards and passing: only the Scheme owner, only while their Scheme is challenged. */
function checkReactionWindow(state: GameState, seat: Seat, what: string): Rejection | null {
  const r = state.reaction;
  if (!r) return reject('wrong-timing', `${what} only while one of your Schemes is being investigated.`);
  if (r.reactor !== seat) return reject('not-your-decision', `${nameOf(state, r.reactor)} is deciding how to respond. Please wait.`);
  return null;
}

/** Opposing pending Schemes a family could investigate. */
export function investigableSchemes(state: GameState, seat: Seat): string[] {
  return state.schemes.filter((s) => s.owner !== seat).map((s) => s.instanceId);
}

/**
 * Everything about playing a card except its specific target: timing,
 * priority, ownership, Gold, round restrictions and whether any legal target
 * exists. Used for "is this card playable?" hints and by checkPlay.
 */
export function checkCardUsable(state: GameState, seat: Seat, cardId: string): Rejection | null {
  const running = checkRunning(state);
  if (running) return running;
  // Ownership before anything card-specific: an opponent's card and a non-existent
  // card must be indistinguishable (no hint about hidden cards).
  if (!state.hands[seat]?.includes(cardId)) return reject('card-not-in-hand', "That card isn't in your hand.");
  const def = getCardDefinition(state.instances[cardId]!);
  const timing =
    def.type === 'instant' && def.timing === 'reaction' ? checkReactionWindow(state, seat, `${def.name} can be played`) : checkActionPhase(state, seat);
  if (timing) return timing;
  if (def.type === 'scheme' && DEMO_RULES.noSchemesInFinalRound && isFinalRound(state)) {
    return reject('final-round', `No new Schemes can be placed in the final round (round ${DEMO_RULES.rounds}).`);
  }
  const gold = state.families[seat]!.gold;
  if (gold < def.cost) {
    return reject('insufficient-gold', `${def.name} costs ${def.cost} Gold; you have ${gold}.`);
  }
  if (def.type === 'instant' && def.effect === 'senate-intervention' && investigableSchemes(state, seat).length === 0) {
    return reject('invalid-target', 'No other family has a hidden Scheme to investigate.');
  }
  if (def.type === 'instant' && def.effect === 'convenient-betrothal' && legalMarriages(state, seat).length === 0) {
    return reject('invalid-target', 'None of your Children can marry any of your Characters right now.');
  }
  return null;
}

function targetKind(def: CardDefinition): PlayTarget['kind'] | null {
  if (def.type === 'scheme') return def.targetsOpponent ? 'seat' : null;
  if (def.type === 'instant' && def.effect === 'senate-intervention') return 'scheme';
  if (def.type === 'instant' && def.effect === 'convenient-betrothal') return 'marriage';
  return null;
}

/** Full legality check for playing `cardId` with `target`. */
export function checkPlay(state: GameState, seat: Seat, cardId: string, target: PlayTarget | undefined): Rejection | null {
  const usable = checkCardUsable(state, seat, cardId);
  if (usable) return usable;
  const def = getCardDefinition(state.instances[cardId]!);
  const kind = targetKind(def);
  if (!kind) return target ? reject('invalid-target', `${def.name} does not take a target.`) : null;
  if (!target) {
    const what = kind === 'seat' ? 'an opponent to target' : kind === 'scheme' ? "another family's hidden Scheme" : 'a Child and a Character to marry';
    return reject('target-required', `Choose ${what} for ${def.name}.`);
  }
  if (target.kind !== kind) return reject('invalid-target', `That is not a valid target for ${def.name}.`);
  switch (target.kind) {
    case 'seat':
      if (!Number.isInteger(target.seat) || target.seat < 0 || target.seat >= state.players.length || target.seat === seat) {
        return reject('invalid-target', `${def.name} must target another family.`);
      }
      return null;
    case 'scheme':
      // Same message whether the id is your own Scheme, a card elsewhere, or nothing at all.
      if (!investigableSchemes(state, seat).includes(target.schemeId)) {
        return reject('invalid-target', `${def.name} must target a hidden Scheme belonging to another family.`);
      }
      return null;
    case 'marriage':
      return checkMarriage(state, seat, target.childId, target.characterId, target.option);
  }
}

/** All legal targets for a card in hand, or null if the card takes no target. */
export function legalTargets(state: GameState, seat: Seat, cardId: string): PlayTarget[] | null {
  const defId = state.instances[cardId];
  if (!defId || !state.hands[seat]?.includes(cardId)) return null;
  const def = getCardDefinition(defId);
  switch (targetKind(def)) {
    case 'seat':
      return state.players.filter((p) => p.seat !== seat).map((p) => ({ kind: 'seat', seat: p.seat }));
    case 'scheme':
      return investigableSchemes(state, seat).map((schemeId) => ({ kind: 'scheme', schemeId }));
    case 'marriage':
      return legalMarriages(state, seat);
    default:
      return null;
  }
}

export function checkPass(state: GameState, seat: Seat): Rejection | null {
  return checkRunning(state) ?? checkReactionWindow(state, seat, 'You can pass');
}

export function checkEndTurn(state: GameState, seat: Seat): Rejection | null {
  return checkRunning(state) ?? checkActionPhase(state, seat);
}

/** Turns advance in seat order. */
export function nextSeat(state: GameState): Seat {
  return (state.turn.activeSeat + 1) % state.players.length;
}

/** Short reminder for the viewer (empty when nothing to say). */
export function turnHint(state: GameState, seat: Seat): string {
  if (state.turn.phase === 'finished') return 'The game is over.';
  const r = state.reaction;
  if (r) {
    if (r.reactor === seat) return `${nameOf(state, r.initiator)} is investigating one of your Schemes. Play Corruption or Vanish in the Crowd, or allow it.`;
    if (r.initiator === seat) return `Waiting for ${nameOf(state, r.reactor)} to respond to your investigation.`;
    return `${nameOf(state, r.reactor)} is responding to an investigation.`;
  }
  if (state.turn.activeSeat !== seat) return `Waiting for ${nameOf(state, state.turn.activeSeat)}. You can inspect cards meanwhile.`;
  const final = isFinalRound(state) ? ' Final round: no new Schemes.' : '';
  return `Recruit Characters, place Schemes or play Instants as your Gold allows, then end your turn.${final}`;
}
