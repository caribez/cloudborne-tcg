/**
 * Player-facing rules text, generated from card data so text and engine
 * behaviour cannot drift apart. Used by the HTML inspector and card art.
 */
import { getCardDefinition, TAG_NAMES, TYPE_NAMES, type CardDefinition, type SchemeEffect, type StandingDelta } from './cards';
import { STANDINGS } from './standings';
import type { Standing } from './types';

export const STANDING_NAMES: Readonly<Record<Standing, string>> = {
  aristocracy: 'Aristocracy',
  religion: 'Religion',
  popularity: 'Popularity',
};
export const STANDING_ABBR: Readonly<Record<Standing, string>> = { aristocracy: 'A', religion: 'R', popularity: 'P' };

/** "+1 A, +1 P" style summary (signed). Empty string for no change. */
export function formatDelta(delta: StandingDelta): string {
  return STANDINGS.filter((s) => delta[s])
    .map((s) => `${delta[s]! > 0 ? '+' : ''}${delta[s]} ${STANDING_ABBR[s]}`)
    .join(', ');
}

function amounts(delta: StandingDelta, sign: 1 | -1): string {
  const parts = STANDINGS.filter((s) => (delta[s] ?? 0) * sign > 0).map((s) => `${Math.abs(delta[s]!)} ${STANDING_ABBR[s]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

function party(subjectGains: string, subjectLoses: string, delta: StandingDelta | undefined): string[] {
  if (!delta) return [];
  const out: string[] = [];
  const g = amounts(delta, 1);
  const l = amounts(delta, -1);
  if (g) out.push(`${subjectGains} ${g}`);
  if (l) out.push(`${subjectLoses} ${l}`);
  return out;
}

/** One sentence describing a Scheme outcome from the owner's point of view. */
export function describeSchemeEffect(effect: SchemeEffect): string {
  const parts = [
    ...party('You gain', 'You lose', effect.owner),
    ...party('Target opponent gains', 'Target opponent loses', effect.target),
    ...party('The revealer gains', 'The revealer loses', effect.revealer),
  ];
  return parts.length ? `${parts.join('. ')}.` : 'No effect.';
}

export function typeLine(def: CardDefinition): string {
  if (def.type === 'character') {
    const tags = def.tags.map((t) => TAG_NAMES[t]);
    return [`Character · ${STANDING_NAMES[def.affiliation]}`, ...(tags.length ? [tags.join(', ')] : [])].join(' · ');
  }
  if (def.type === 'instant') return def.timing === 'reaction' ? 'Instant · Reaction' : 'Instant';
  if (def.type === 'scheme') return def.targetsOpponent ? 'Scheme · Targets an opponent' : 'Scheme';
  return TYPE_NAMES[def.type];
}

export interface RulesLine {
  readonly label: string;
  readonly text: string;
}

/** Labelled rules lines for a card ("On recruit", "Each turn", "Success", "Revealed", ...). */
export function rulesLines(def: CardDefinition): RulesLine[] {
  switch (def.type) {
    case 'character': {
      const lines: RulesLine[] = [];
      const onRecruit = formatDelta(def.onRecruit);
      if (onRecruit) lines.push({ label: 'Recruit', text: onRecruit });
      const each: string[] = [];
      if (def.recurring.gold) each.push(`+${def.recurring.gold} Gold`);
      if (def.recurring.cards) each.push(`draw ${def.recurring.cards} extra card${def.recurring.cards > 1 ? 's' : ''}`);
      if (each.length) lines.push({ label: 'Each turn', text: each.join(', ') });
      lines.push({
        label: 'Marriage',
        text: !def.marriage ? 'Cannot marry' : def.marriage.length === 1 ? formatDelta(def.marriage[0]!) : `Choose ${def.marriage.map(formatDelta).join(' or ')}`,
      });
      return lines;
    }
    case 'scheme':
      return [
        { label: 'Success', text: describeSchemeEffect(def.success) },
        { label: 'Revealed', text: describeSchemeEffect(def.revealed) },
      ];
    case 'instant':
      return [{ label: '', text: def.text }];
    case 'child':
      return [{ label: 'Marriage', text: `May only marry a ${TAG_NAMES[def.marries]} Character of your family.` }];
  }
}

/** Short label for a marriage option, e.g. "+2 R". */
export function marriageOptionText(characterDefId: string, option: number): string {
  const def = getCardDefinition(characterDefId);
  if (def.type !== 'character' || !def.marriage) return '';
  return formatDelta(def.marriage[option] ?? {});
}
