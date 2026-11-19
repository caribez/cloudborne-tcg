import { expect } from 'vitest';
import type { GameState } from '../src/shared/types';

/** Every instance id and definition id the viewer must NOT learn. */
export function hiddenTokens(state: GameState, viewer: number | null): string[] {
  const hidden = [...state.drawPile, ...state.hands.flatMap((h, seat) => (seat === viewer ? [] : h))];
  return hidden.flatMap((id) => [id, state.instances[id]!]);
}

export function expectNoLeak(payload: unknown, state: GameState, viewer: number | null): void {
  const json = JSON.stringify(payload);
  for (const token of hiddenTokens(state, viewer)) {
    // Quote-delimited so 'c001' does not match 'c0010' and 'sun-1' does not match 'sun-10'.
    expect(json, `leaked ${token}`).not.toContain(`"${token}"`);
  }
}

