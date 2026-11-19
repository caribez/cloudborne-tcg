/**
 * CLOUDBORNE CARD DEFINITIONS (demo set).
 *
 * A definition describes what a card *is*. Individual physical copies in a game
 * are card instances (see deck.ts), each with a unique, opaque instance id.
 *
 * Effects are plain data, resolved by small functions in turns.ts, schemes.ts
 * and marriage.ts. Rules text shown to players is generated from this data in
 * cardText.ts, so it cannot drift from what the engine does.
 *
 * Values marked PROVISIONAL in PROTOTYPE_RULES.md are demo decisions, not final design.
 */
import type { Standing } from './types';

export type CardType = 'character' | 'scheme' | 'instant' | 'child';
/** Political affiliation of a Character. Same names as the three standings. */
export type Affiliation = Standing;
/** Tags are separate from affiliation. Military is a tag, not a fourth standing. */
export type CardTag = 'military' | 'noble' | 'cloud-sister';

/** A change to one family's standings, e.g. { aristocracy: 1, popularity: 1 }. */
export type StandingDelta = Readonly<Partial<Record<Standing, number>>>;

interface CardBase {
  /** Stable definition id. */
  readonly id: string;
  readonly name: string;
  readonly type: CardType;
  /** Gold paid to play the card from hand. */
  readonly cost: number;
  readonly flavor?: string;
}

export interface CharacterDefinition extends CardBase {
  readonly type: 'character';
  readonly affiliation: Affiliation;
  readonly tags: readonly CardTag[];
  /** Immediate, permanent standing change when recruited. */
  readonly onRecruit: StandingDelta;
  /** Applied at the start of each of the owner's turns after the turn it was recruited. */
  readonly recurring: { readonly gold: number; readonly cards: number };
  /** Marriage bonus options. One entry: no choice. Several: the player picks one. null: cannot marry. */
  readonly marriage: readonly StandingDelta[] | null;
}

/** Who a Scheme outcome affects. `target` is the chosen opponent, `revealer` the exposing family. */
export interface SchemeEffect {
  readonly owner?: StandingDelta;
  readonly target?: StandingDelta;
  readonly revealer?: StandingDelta;
}

export interface SchemeDefinition extends CardBase {
  readonly type: 'scheme';
  /** True if the Scheme is aimed at an opponent chosen when it is placed. */
  readonly targetsOpponent: boolean;
  /** Resolves at the start of the owner's next turn if never exposed. */
  readonly success: SchemeEffect;
  /** Resolves instead of `success` when an opponent exposes it. */
  readonly revealed: SchemeEffect;
}

export type InstantEffect = 'senate-intervention' | 'corruption' | 'vanish-in-the-crowd' | 'convenient-betrothal';

export interface InstantDefinition extends CardBase {
  readonly type: 'instant';
  readonly effect: InstantEffect;
  /** 'action': in your own action phase. 'reaction': only while one of your Schemes is being investigated. */
  readonly timing: 'action' | 'reaction';
  readonly text: string;
}

export interface ChildDefinition extends CardBase {
  readonly type: 'child';
  /** The Child may only marry a Character carrying this tag. */
  readonly marries: CardTag;
}

export type CardDefinition = CharacterDefinition | SchemeDefinition | InstantDefinition | ChildDefinition;

const character = (d: Omit<CharacterDefinition, 'type'>): CharacterDefinition => ({ type: 'character', ...d });
const scheme = (d: Omit<SchemeDefinition, 'type'>): SchemeDefinition => ({ type: 'scheme', ...d });
const instant = (d: Omit<InstantDefinition, 'type'>): InstantDefinition => ({ type: 'instant', ...d });
const child = (d: Omit<ChildDefinition, 'type' | 'cost'>): ChildDefinition => ({ type: 'child', cost: 0, ...d });
const none = { gold: 0, cards: 0 } as const;

export const CHARACTERS: readonly CharacterDefinition[] = [
  character({ id: 'merchant-king', name: 'Merchant King', cost: 1, affiliation: 'aristocracy', tags: ['noble'], onRecruit: {}, recurring: { gold: 1, cards: 0 }, marriage: [{ aristocracy: 1 }] }),
  character({ id: 'cloud-guard', name: 'Cloud Guard', cost: 1, affiliation: 'aristocracy', tags: ['military', 'noble'], onRecruit: { aristocracy: 1 }, recurring: none, marriage: null }),
  character({ id: 'captain-teos', name: 'Captain Teos', cost: 2, affiliation: 'aristocracy', tags: ['military', 'noble'], onRecruit: { aristocracy: 1, popularity: 1 }, recurring: { gold: 0, cards: 1 }, marriage: [{ aristocracy: 2 }] }),
  character({ id: 'scribe', name: 'Scribe', cost: 1, affiliation: 'religion', tags: [], onRecruit: { religion: 1 }, recurring: none, marriage: null }),
  // PROVISIONAL: tagged noble so its marriage choice is reachable by Faeoa/Neion in the demo.
  character({ id: 'royal-mate', name: 'Royal Mate', cost: 2, affiliation: 'religion', tags: ['noble'], onRecruit: { religion: 1, aristocracy: 1 }, recurring: none, marriage: [{ religion: 2 }, { aristocracy: 2 }] }),
  // PROVISIONAL: marriage bonus and cloud-sister tag added to demonstrate the marriage subsystem.
  character({ id: 'field-sister', name: 'Field Sister', cost: 2, affiliation: 'religion', tags: ['military', 'cloud-sister'], onRecruit: { religion: 1, popularity: 1 }, recurring: none, marriage: [{ religion: 1 }] }),
  character({ id: 'war-hero', name: 'War Hero', cost: 1, affiliation: 'popularity', tags: ['military'], onRecruit: { popularity: 1 }, recurring: none, marriage: null }),
  character({ id: 'wandering-troupe', name: 'Wandering Troupe', cost: 2, affiliation: 'popularity', tags: [], onRecruit: { popularity: 1, aristocracy: 1 }, recurring: { gold: 1, cards: 0 }, marriage: null }),
  character({ id: 'city-administrator', name: 'City Administrator', cost: 2, affiliation: 'aristocracy', tags: ['noble'], onRecruit: { aristocracy: 1, religion: 1 }, recurring: { gold: 0, cards: 1 }, marriage: [{ aristocracy: 1 }, { religion: 1 }] }),
  character({ id: 'gardener', name: 'Gardener', cost: 2, affiliation: 'religion', tags: [], onRecruit: { religion: 1, popularity: 1 }, recurring: none, marriage: null }),
  character({ id: 'honor-guards', name: 'Honor Guards', cost: 2, affiliation: 'popularity', tags: ['military'], onRecruit: { popularity: 1, aristocracy: 1 }, recurring: none, marriage: null }),

];

export const SCHEMES: readonly SchemeDefinition[] = [
  scheme({ id: 'party-lion', name: 'Party Lion', cost: 1, targetsOpponent: false, success: { owner: { aristocracy: 2 } }, revealed: { owner: { aristocracy: -1 } } }),
  scheme({ id: 'dealing-with-heresy', name: 'Dealing with Heresy', cost: 1, targetsOpponent: false, success: { owner: { religion: 2 } }, revealed: { owner: { religion: -1 } } }),
  scheme({ id: 'helping-the-poor', name: 'Helping the Poor', cost: 1, targetsOpponent: false, success: { owner: { popularity: 1 } }, revealed: { owner: { popularity: -1 } } }),
  scheme({ id: 'street-slander', name: 'Street Slander', cost: 1, targetsOpponent: true, success: { target: { popularity: -2 } }, revealed: { owner: { aristocracy: -1, popularity: -1 } } }),
  scheme({ id: 'furian-truce', name: 'Furian Truce', cost: 2, targetsOpponent: false, success: { owner: { aristocracy: 2, popularity: 1 } }, revealed: { owner: { popularity: -1 }, revealer: { popularity: 2 } } }),
  scheme({ id: 'scandal-party', name: 'Scandal Party', cost: 1, targetsOpponent: true, success: { target: { aristocracy: -2 } }, revealed: { owner: { aristocracy: -2 } } }),
  scheme({ id: 'inquisitor', name: 'Inquisitor', cost: 1, targetsOpponent: true, success: { target: { religion: -2 } }, revealed: { owner: { religion: -1, aristocracy: -1 } }, flavor: 'You know what to do.' }),
  scheme({ id: 'phalannean-artifact', name: 'Phalannean Artifact', cost: 2, targetsOpponent: false, success: { owner: { religion: 2, aristocracy: 1 } }, revealed: { owner: { religion: -1, popularity: -2 } }, flavor: 'Have you heard? They found the Tomb of Feion on Mount Celes.' }),
  // PROVISIONAL experimental trap card (not a historical design).
  scheme({
    id: 'planted-scandal',
    name: 'Planted Scandal',
    cost: 1,
    targetsOpponent: false,
    success: {},
    revealed: { revealer: { popularity: -2 } },
    flavor: 'A staged scandal: whoever comes looking finds themselves implicated.',
  }),
];

export const INSTANTS: readonly InstantDefinition[] = [
  instant({
    id: 'senate-intervention',
    name: 'Senate Intervention',
    cost: 1,
    effect: 'senate-intervention',
    timing: 'action',
    text: "Your action phase: choose another family's hidden Scheme and try to expose it. Its owner may respond first.",
  }),
  instant({
    id: 'corruption',
    name: 'Corruption',
    cost: 1,
    effect: 'corruption',
    timing: 'reaction',
    text: 'When one of your Schemes is investigated: it is still revealed, but standing losses that would hit you hit the revealer instead.',
  }),
  instant({
    id: 'vanish-in-the-crowd',
    name: 'Vanish in the Crowd',
    cost: 1,
    effect: 'vanish-in-the-crowd',
    timing: 'reaction',
    text: 'When one of your Schemes is investigated: the investigation fails. The Scheme stays hidden and keeps its timing.',
  }),
  instant({
    id: 'convenient-betrothal',
    name: 'Convenient Betrothal',
    cost: 1,
    effect: 'convenient-betrothal',
    timing: 'action',
    text: "Your action phase: marry one of your Children to an eligible Character of yours. Gain that Character's marriage bonus.",
  }),
];

export const CHILDREN: readonly ChildDefinition[] = [
  child({ id: 'faeoa-of-the-moon', name: 'Faeoa of the Moon', marries: 'noble' }),
  child({ id: 'neion-the-feather', name: 'Neion the Feather', marries: 'noble' }),
  child({ id: 'junae-the-devout', name: 'Junaé the Devout', marries: 'cloud-sister' }),
];

export const CARD_DEFINITIONS: readonly CardDefinition[] = [...CHARACTERS, ...SCHEMES, ...INSTANTS, ...CHILDREN];

const byId = new Map<string, CardDefinition>(CARD_DEFINITIONS.map((d) => [d.id, d]));

export function getCardDefinition(defId: string): CardDefinition {
  const def = byId.get(defId);
  if (!def) throw new Error(`Unknown card definition: ${defId}`);
  return def;
}

export function hasCardDefinition(defId: string): boolean {
  return byId.has(defId);
}

export const TAG_NAMES: Readonly<Record<CardTag, string>> = {
  military: 'Military',
  noble: 'Noble',
  'cloud-sister': 'Cloud Sister',
};

export const TYPE_NAMES: Readonly<Record<CardType, string>> = {
  character: 'Character',
  scheme: 'Scheme',
  instant: 'Instant',
  child: 'Child',
};
