import { getCardDefinition } from './cards';
import type { LogEntry, PlayerInfo } from './types';

/** Human-readable text for a public log entry. */
export function describeLogEntry(entry: LogEntry, players: readonly Pick<PlayerInfo, 'name'>[]): string {
  const name = (seat: number) => players[seat]?.name ?? `Seat ${seat + 1}`;
  switch (entry.kind) {
    case 'start':
      return 'Game started. Cards dealt.';
    case 'draw':
      return `${name(entry.seat)} drew a card.`;
    case 'play':
      return `${name(entry.seat)} played ${getCardDefinition(entry.defId).name}.`;
    case 'endTurn':
      return `${name(entry.seat)} ended their turn. ${name(entry.nextSeat)} is up.`;
  }
}
