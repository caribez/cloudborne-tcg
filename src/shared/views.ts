/**
 * Player views: the information one viewer may see, derived from canonical
 * state. Presentation code only ever receives a PlayerView, and the LAN server
 * only ever sends PlayerViews, never GameState.
 *
 * Hidden from a viewer: draw-pile order and identities, other families' hands,
 * other families' hidden Scheme identities and targets, future income rolls,
 * the unassigned Child pool, and the instance → definition map.
 */
import { checkCardUsable, checkEndTurn, checkPass, decisionSeat, DEMO_RULES, isFinalRound, legalTargets, turnHint } from './rules';
import type { GameResult, GameState, LogEntry, Marriage, Phase, PlayTarget, Seat, Standings } from './types';
import { politicalScore } from './victory';

/** Placeholder definition id for a card whose identity the viewer may not know. */
export const HIDDEN = 'hidden';

export interface ViewCard {
  readonly instanceId: string;
  readonly defId: string;
}

/** A card in the viewer's own hand, with what the viewer could do with it right now. */
export interface ViewHandCard extends ViewCard {
  readonly playable: boolean;
  /** Why the card cannot be played now (null when playable). */
  readonly reason: string | null;
  /** Legal targets, or null if the card takes no target. */
  readonly targets: readonly PlayTarget[] | null;
}

export interface ViewScheme {
  readonly instanceId: string;
  readonly owner: Seat;
  /** The real definition only for the owner; HIDDEN for everyone else. */
  readonly defId: string;
  /** The intended target, only for the owner. */
  readonly target: Seat | null;
  readonly placedRound: number;
  readonly resolvesInRound: number;
  /** True while a Senate Intervention is trying to expose it. */
  readonly challenged: boolean;
}

export interface ViewFamily {
  readonly seat: Seat;
  readonly name: string;
  readonly handCount: number;
  readonly standings: Standings;
  readonly gold: number;
  readonly score: number;
  readonly characters: readonly ViewCard[];
  readonly schemes: readonly ViewScheme[];
  readonly children: readonly ViewCard[];
}

export interface ViewReaction {
  readonly initiator: Seat;
  readonly reactor: Seat;
  readonly schemeId: string;
}

export interface PlayerView {
  readonly revision: number;
  /** The seat whose private information is included, or null for a public view. */
  readonly viewer: Seat | null;
  readonly families: readonly ViewFamily[];
  readonly activeSeat: Seat;
  /** Who must decide next (the reactor during a reaction window), or null when finished. */
  readonly decisionSeat: Seat | null;
  readonly phase: Phase;
  readonly round: number;
  readonly maxRounds: number;
  readonly finalRound: boolean;
  readonly turnNumber: number;
  readonly drawPileCount: number;
  /** Face up, oldest first. */
  readonly discard: readonly ViewCard[];
  readonly marriages: readonly Marriage[];
  readonly reaction: ViewReaction | null;
  /** The viewer's own hand; empty for a public view. */
  readonly hand: readonly ViewHandCard[];
  readonly log: readonly LogEntry[];
  /** What the viewer may do right now (for enabling buttons; the authority re-checks). */
  readonly can: { readonly endTurn: boolean; readonly pass: boolean };
  readonly hint: string;
  readonly result: GameResult | null;
}

export function playerView(state: GameState, viewer: Seat | null): PlayerView {
  const seated = viewer !== null && Number.isInteger(viewer) && viewer >= 0 && viewer < state.players.length;
  const v = seated ? viewer : null;
  const publicCard = (id: string): ViewCard => ({ instanceId: id, defId: state.instances[id]! });
  const families: ViewFamily[] = state.players.map((p) => {
    const f = state.families[p.seat]!;
    return {
      seat: p.seat,
      name: p.name,
      handCount: state.hands[p.seat]!.length,
      standings: { ...f.standings },
      gold: f.gold,
      score: politicalScore(f.standings),
      characters: state.characters[p.seat]!.map(publicCard),
      children: state.children[p.seat]!.map(publicCard),
      schemes: state.schemes
        .filter((s) => s.owner === p.seat)
        .map((s) => ({
          instanceId: s.instanceId,
          owner: s.owner,
          defId: s.owner === v ? state.instances[s.instanceId]! : HIDDEN,
          target: s.owner === v ? s.target : null,
          placedRound: s.placedRound,
          resolvesInRound: s.resolvesInRound,
          challenged: state.reaction?.schemeId === s.instanceId,
        })),
    };
  });
  const hand: ViewHandCard[] =
    v === null
      ? []
      : state.hands[v]!.map((id) => {
          const why = checkCardUsable(state, v, id);
          return { instanceId: id, defId: state.instances[id]!, playable: why === null, reason: why?.message ?? null, targets: legalTargets(state, v, id) };
        });
  const r = state.reaction;
  return {
    revision: state.revision,
    viewer: v,
    families,
    activeSeat: state.turn.activeSeat,
    decisionSeat: decisionSeat(state),
    phase: state.turn.phase,
    round: state.turn.round,
    maxRounds: DEMO_RULES.rounds,
    finalRound: isFinalRound(state),
    turnNumber: state.turn.number,
    drawPileCount: state.drawPile.length,
    discard: state.discard.map(publicCard),
    marriages: state.marriages.map((m) => ({ ...m })),
    reaction: r ? { initiator: r.initiator, reactor: r.reactor, schemeId: r.schemeId } : null,
    hand,
    log: state.log.map((e) => structuredClone(e)),
    can: {
      endTurn: v !== null && checkEndTurn(state, v) === null,
      pass: v !== null && checkPass(state, v) === null,
    },
    hint: v === null ? '' : turnHint(state, v),
    result: state.result ? structuredClone(state.result) : null,
  };
}

/** View with no private information, e.g. for the hotseat privacy screen. */
export function publicView(state: GameState): PlayerView {
  return playerView(state, null);
}
