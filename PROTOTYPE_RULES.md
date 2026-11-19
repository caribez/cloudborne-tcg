# Prototype rules (temporary)

These rules exist only to exercise the foundation (hands, draw pile, shared
table, hotseat, LAN). They are **placeholders**, not a design. When a rule
changes, update this file, the code listed below, and the affected tests together.

## Current provisional rules

| Rule | Value | Where in code |
| --- | --- | --- |
| Players | 2, 3 or 4 | `src/shared/rules.ts` → `PROVISIONAL_RULES` |
| Deck | 40 placeholder cards: 4 suits (Sun, Moon, Star, Cloud) × values 1–10, one copy each | `src/shared/cards.ts`, `src/shared/deck.ts` |
| Starting hand | 5 cards each, dealt one at a time in seat order | `PROVISIONAL_RULES.initialHandSize`, `setupGame` in `src/shared/engine.ts` |
| Draw pile | The remaining cards, shuffled, face down | `setupGame` |
| First player | Seat 1 | `PROVISIONAL_RULES.firstSeat` |
| On your turn | You **may** draw at most 1 card and **may** play at most 1 card, in either order, then end your turn | `checkDraw` / `checkPlay` / `checkEndTurn` in `rules.ts` |
| Playing | The card goes face up onto the shared table at the clicked spot | `PROVISIONAL_RULES.playFaceUp`, `applyAction` |
| Placement | Anywhere inside the 72 × 44 playing area; position snaps to 0.5 units, rotation to 15°; the card is nudged to lie fully inside; overlapping is allowed | `src/shared/placement.ts` |
| Empty draw pile | Drawing is unavailable and changes nothing | `checkDraw` |
| Turn order | Seat order, wrapping around | `nextSeat` in `rules.ts` |
| End of game | None. No scoring, no winner. Use Restart to deal again | — |
| Card effects | None. Every card says "Placeholder card. No effect yet." | `cards.ts` |

## Implementation assumptions (also provisional)

- Ending a turn without drawing or playing is allowed.
- Played cards never move again and stay face up. Table cards keep the order they were played in (later on top).
- The public log records draws without naming the card, and plays with the card name.
- LAN: a disconnected seated player pauses the game for everyone; there is no timeout. In the lobby, a disconnected non-host player's seat is freed after 60 seconds.
- LAN: the first player to join an empty lobby is the host for the server's lifetime (no host hand-over). The host cannot leave the lobby while others are seated.
- LAN: players cannot join a game in progress; the host returns everyone to the lobby first.
- Hotseat: a page refresh loses the game (state is kept in memory only).

## Open design questions

- What is the goal of the game: scoring, victory conditions, game end?
- Do cards have effects, costs or types? Do suits and values mean anything?
- Should table placement carry meaning (zones, rows, per-player areas, adjacency)?
- Can cards on the table be moved, tapped/rotated, flipped, stacked, or returned to hand?
- Face-down plays? (Views already hide face-down table cards, but no rule creates them.)
- Discard pile, reshuffling when the draw pile runs out?
- Hand size limits, mandatory draws, mulligans?
- More than one action per turn, simultaneous play, or reactions out of turn?
- Seat order and first player selection.
- Should a disconnected LAN player be skipped after a timeout instead of pausing the game?
