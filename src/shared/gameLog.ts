/** Appending to the public log inside an engine transition. */
import type { Draft, GameState, LogEntry } from './types';

export const MAX_LOG = 120;

type NewLogEntry = LogEntry extends infer E ? (E extends LogEntry ? Omit<E, 'seq'> : never) : never;

export function appendLog(state: Draft<GameState>, entry: NewLogEntry): void {
  const seq = (state.log[state.log.length - 1]?.seq ?? 0) + 1;
  state.log.push({ ...entry, seq } as Draft<LogEntry>);
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}
