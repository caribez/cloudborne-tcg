/**
 * Human-readable text for public log entries. Entries never contain hidden
 * information, so these strings are safe for every viewer: a placed Scheme is
 * only "a hidden Scheme" until it is revealed.
 */
import { getCardDefinition } from './cards';
import { STANDING_ABBR } from './cardText';
import type { LogEntry, Seat, StandingChange } from './types';

/** "Ada +1 A, Bo −2 P" */
export function describeChanges(changes: readonly StandingChange[], name: (seat: Seat) => string): string {
  if (!changes.length) return 'no standing changes';
  const bySeat = new Map<Seat, string[]>();
  for (const c of changes) {
    const list = bySeat.get(c.seat) ?? [];
    list.push(`${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta)} ${STANDING_ABBR[c.standing]}`);
    bySeat.set(c.seat, list);
  }
  return [...bySeat].map(([seat, parts]) => `${name(seat)} ${parts.join(', ')}`).join('; ');
}

export function describeLogEntry(entry: LogEntry, players: readonly { readonly name: string }[]): string {
  const name = (seat: number) => players[seat]?.name ?? `Seat ${seat + 1}`;
  const card = (defId: string) => getCardDefinition(defId).name;
  switch (entry.kind) {
    case 'start':
      return `Game started with ${entry.players} families. Cards and Children dealt.`;
    case 'turnStart':
      return `Round ${entry.round}: ${name(entry.seat)}'s turn begins.`;
    case 'income': {
      const parts = [`+${entry.roll} Gold income`];
      if (entry.bonusGold) parts.push(`+${entry.bonusGold} Gold from Characters`);
      parts.push(`drew ${entry.cards} card${entry.cards === 1 ? '' : 's'}`);
      if (entry.missed) parts.push(`${entry.missed} not drawn: the deck is empty`);
      return `${name(entry.seat)}: ${parts.join(', ')}.`;
    }
    case 'recruit': {
      const gains = entry.changes.length ? ` (${describeChanges(entry.changes, name)})` : '';
      return `${name(entry.seat)} recruited ${card(entry.defId)} for ${entry.cost} Gold${gains}.`;
    }
    case 'schemePlaced':
      return `${name(entry.seat)} placed a hidden Scheme (paid ${entry.cost} Gold).`;
    case 'challenge':
      return `${name(entry.seat)} played Senate Intervention to investigate a hidden Scheme of ${name(entry.owner)}.`;
    case 'response':
      return entry.defId === 'vanish-in-the-crowd'
        ? `${name(entry.seat)} played Vanish in the Crowd: the investigation fails and the Scheme stays hidden.`
        : `${name(entry.seat)} played ${card(entry.defId)}.`;
    case 'allow':
      return `${name(entry.seat)} allowed the investigation.`;
    case 'schemeRevealed': {
      const aim = entry.target !== null ? ` aimed at ${name(entry.target)}` : '';
      const corrupt = entry.corrupted ? ' Corruption turned the penalties onto the revealer.' : '';
      return `Exposed: ${name(entry.owner)}'s Scheme was ${card(entry.defId)}${aim}.${corrupt} Result: ${describeChanges(entry.changes, name)}.`;
    }
    case 'schemeSucceeded': {
      const aim = entry.target !== null ? ` against ${name(entry.target)}` : '';
      return `${name(entry.owner)}'s Scheme ${card(entry.defId)}${aim} succeeded: ${describeChanges(entry.changes, name)}.`;
    }
    case 'marriage':
      return `${name(entry.seat)} arranged a marriage: ${card(entry.childDefId)} ⚭ ${card(entry.characterDefId)} (${describeChanges(entry.changes, name)}).`;
    case 'endTurn':
      return `${name(entry.seat)} ended their turn.`;
    case 'gameOver':
      return entry.winners.length > 1
        ? `Game over. Shared victory: ${entry.winners.map(name).join(' and ')}.`
        : `Game over. ${name(entry.winners[0] ?? 0)} wins.`;
  }
}
