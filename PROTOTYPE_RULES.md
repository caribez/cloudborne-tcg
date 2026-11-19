# Cloudborne demo rules (provisional)

These are the rules the playable demo implements. They are **demo decisions to make the game testable from start to finish**, not approved final design. The historical design is unfinished; see [`docs/political-game-design.md`](docs/political-game-design.md) for the long-term concept. When a rule changes, update this file, the code listed below and the affected tests together.

Items marked **PROVISIONAL** were invented or simplified for this demo and are the first candidates for revision.

## Families and resources

| Rule | Value | Where in code |
| --- | --- | --- |
| Players | 2, 3 or 4 families, fixed seat order, seat 1 starts | `DEMO_RULES` in `src/shared/rules.ts` |
| Family abilities | None: all families start identical | — |
| Standings | Aristocracy (A), Religion (R), Popularity (P): public integers. Never spent | `FamilyState` in `src/shared/types.ts` |
| Starting standings | **PROVISIONAL:** 2 / 2 / 2 (so penalties matter at once) | `DEMO_RULES.startingStandings` |
| Standing limits | Never below 0; no maximum. Simultaneous changes to one family (one Scheme outcome) are summed before the floor is applied | `adjustStandings` in `src/shared/standings.ts` |
| Permanent gains | **PROVISIONAL:** recruitment and marriage bonuses change standings immediately and permanently (no ongoing modifiers) | `engine.ts` (`playCard`) |
| Gold | Public integer, spent on cards, carried over between turns. Starts at 3. Cannot be overspent | `DEMO_RULES.startingGold`, `checkCardUsable` |

## Turn and round structure

A **turn** belongs to one family; a **round** is one turn for every family.

1. **Scheme resolution (automatic).** The active family's Schemes that are due (placed in an earlier round) succeed, in the order they were placed.
2. **Income and draw (automatic).** Draw 1 card from the main deck; gain **1–3 Gold** (equal chances); then each recruited Character's recurring effect, in recruitment order. This also happens on the very first turn.
3. **Action phase.** Play any number of cards you can afford, in any order: recruit Characters, place Schemes, play Senate Intervention or Convenient Betrothal. There is no manual draw and no one-card-per-turn limit.
4. **End turn.** The next seat begins; wrapping back to seat 1 starts a new round.

- **PROVISIONAL income structure:** every family's income rolls are generated privately at setup (one per turn of the fixed-length game), so results are authoritative and reproducible in tests. They are never sent to clients before use. (`setupGame`, `beginTurn` in `src/shared/turns.ts`.)
- Recurring Character effects start on the owner's next turn after recruitment.
- An empty deck simply stops drawing. There is no reshuffle.
- No maximum hand size.

## End of game and scoring (PROVISIONAL)

- The game lasts **8 rounds** (8 turns per family). `DEMO_RULES.rounds`
- **No new Schemes may be placed in round 8.** Schemes from round 7 still resolve in round 8. `DEMO_RULES.noSchemesInFinalRound`
- After the last family's round-8 turn, the game ends: **Score = A + R + P.** Gold does not score. The highest score wins; equal top scores share the victory. `src/shared/victory.ts`
- After the end, every gameplay action is rejected until the game is restarted.

## Cards

The main deck is shuffled and shared. **PROVISIONAL deck composition:** 4 copies of every Character, Scheme and Instant (32 + 24 + 16 = 72 cards). Each family is dealt **7** cards. Edit `MAIN_DECK` in `src/shared/deck.ts`. Card data lives in `src/shared/cards.ts`; rules text is generated from that data (`src/shared/cardText.ts`).

Instants are discarded after resolving; Schemes after their final resolution; Characters and Children stay in play. Every card instance is in exactly one location: main deck, a hand, a Character area, the pending-Scheme area, a family's Children, the unassigned Child pool, or the discard pile. A marriage is a relationship between two instances, never a copy.

### Characters

Pay the cost; the card goes face up into your Character area and its recruit bonus applies immediately. Multiple copies of the same Character are allowed.

| Name | Cost | Affiliation | Tags | Recruit | Each turn | Marriage |
|---|---:|---|---|---|---|---|
| Merchant King | 1 | Aristocracy | Noble | — | +1 Gold | +1 A |
| Cloud Guard | 1 | Aristocracy | Military, Noble | +1 A | — | cannot marry |
| Captain Teos | 2 | Aristocracy | Military, Noble | +1 A, +1 P | draw 1 extra card | +2 A |
| Scribe | 1 | Religion | — | +1 R | — | cannot marry |
| Royal Mate | 2 | Religion | Noble **(PROVISIONAL)** | +1 R, +1 A | — | choose +2 R or +2 A |
| Field Sister | 2 | Religion | Military, Cloud Sister | +1 R, +1 P | — | +1 R **(PROVISIONAL)** |
| War Hero | 1 | Popularity | Military | +1 P | — | cannot marry |
| Wandering Troupe | 2 | Popularity | — | +1 P, +1 A | +1 Gold | cannot marry |

- Military is a tag, not a standing. Character affiliations represent political influence, not social status. The noble tag is assigned individually and independently of affiliation. Aristocracy Characters are not necessarily nobles (e.g. Sivashir Slaves), and Characters of other affiliations may be nobles (e.g. Royal Mate).
**PROVISIONAL** Field Sister carries the Cloud Sister tag and its marriage bonus is a demo addition.
- **PROVISIONAL (demo resolution of a gap):** Royal Mate is also tagged Noble. Without it, no Child could ever marry Royal Mate, and its marriage choice would be unreachable.

### Schemes

Pay the cost; the Scheme is placed **face down** in your Scheme area. If it needs a target, you choose an opponent when placing it. Everyone sees that a Scheme exists, when it was placed and what you paid. Only you see its identity, text and target. All concealed Schemes share the same card back.

At the start of your **next turn**, an unexposed Scheme is revealed, its **Success** effect applies, and it is discarded. It costs nothing more to resolve.

| Name | Cost | Success | Revealed |
|---|---:|---|---|
| Party Lion | 1 | You gain 2 A | You lose 1 A |
| Dealing with Heresy | 1 | You gain 2 R | You lose 1 R |
| Helping the Poor | 1 | You gain 1 P | You lose 1 P |
| Street Slander | 1 | Target opponent loses 2 P | You lose 1 A and 1 P |
| Furian Truce | 2 | You gain 2 A and 1 P | You lose 1 P; the revealer gains 2 P |
| Planted Scandal **(PROVISIONAL, experimental)** | 1 | No effect | The revealer loses 2 P |

Planted Scandal is a trap: it is worthless unless someone investigates it. It is publicly indistinguishable from any other Scheme.

### Instants and the reaction window

| Name | Cost | When | Effect |
|---|---:|---|---|
| Senate Intervention | 1 | Your action phase | Choose another family's pending Scheme and try to expose it. Opens a reaction window. |
| Corruption | 1 | Reaction: your Scheme is being investigated | The reveal proceeds, but standing **losses** that would hit you hit the revealer instead. Effects aimed at the revealer still apply. Success never triggers. |
| Vanish in the Crowd | 1 | Reaction: your Scheme is being investigated | The investigation fails. The Scheme stays hidden, keeps its timing and can be investigated again later. The Senate Intervention is still spent. |
| Convenient Betrothal | 1 | Your action phase | Marry one of your Children to an eligible Character of yours (see Marriage). |

**PROVISIONAL restricted reaction system** (`src/shared/rules.ts`, `engine.ts`):

1. Senate Intervention is paid and discarded; the game enters a **reaction window**. The active player keeps the turn, but **decision priority** passes to the Scheme's owner. The Scheme is not yet revealed, and the public log does not name it.
2. Only the Scheme's owner may respond, with **one** of: Corruption, Vanish in the Crowd, or an explicit **pass** ("Allow the investigation"). Passing is required even with no defensive card. No nested responses, no timers.
3. If not cancelled, the Scheme is revealed, its **Revealed** effect applies (never Success), and it is discarded.
4. Priority returns to the active player. While the window is open, every other action, including ending the turn, is rejected.

## Children and marriage (PROVISIONAL)

- A separate Child pool holds 4 copies each of Faeoa of the Moon, Neion the Feather and Junaé the Devout (12). Each family receives **2** at random at setup. Children are public, free and never in the hand. `CHILD_POOL` in `deck.ts`.
- **Eligibility:** Faeoa and Neion may only marry a **Noble**; Junaé may only marry a **Cloud Sister**. The Character must have a marriage effect. Both cards belong to the acting family, and neither may already be married. `src/shared/marriage.ts`
- **Same-family marriages only.** Cross-family marriage needs ownership, consent and reward rules first.
- The Character's marriage bonus applies once, immediately. For a choice (Royal Mate), the player picks one option before playing.
- No divorce, death, aging, reproduction or new Children.

## Implementation assumptions (also provisional)

- Deterministic order of automatic effects: Schemes in placement order, then the base draw, then income, then Characters in recruitment order.
- Character ownership and controller are the same family (no control changes exist yet).
- Rejected actions change nothing and explain why in plain language. A card in someone else's hand and a non-existent card get the same rejection.
- LAN: a disconnected seated player pauses the game for everyone (also during a reaction window); there is no timeout. In the lobby, a disconnected non-host player's seat is freed after 60 seconds.
- LAN: the first player to join an empty lobby is the host for the server's lifetime. Only the host can start, restart or return to the lobby. Nobody can join a game in progress.
- Hotseat: a page refresh loses the game (state is in memory only). Hotseat privacy protects against casual glances at a shared screen, not against inspecting browser memory.

## Open design questions

- The real victory condition: thresholds per standing, objectives, secret agendas, or a different scoring.
- Card distribution and costs from the historical design; uniqueness of named Characters.
- Whether standings should be partly temporary or recalculated, and whether Gold should become cards.
- A fuller reaction system: counter-responses, third parties joining, timing windows on other actions.
- Cross-family marriage, inheritance, and what Children do beyond marriage.
- Asymmetric family abilities, alliances, Boons and Debuffs, military and territory.
- Whether the Gold cost of a Scheme should be hidden too, since it hints at the Scheme.
