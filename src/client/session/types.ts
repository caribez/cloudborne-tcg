import type { GameAction } from '../../shared/types';

/** Result of submitting an intention to an authority (local or remote). */
export type SubmitResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export type { GameAction };
