# Cloudborne: political game design

Cloudborne is a political and dynastic strategy card game set in the cloud world of the Fading Forever universe. Each player leads a family seeking political power through the nobility, religious institutions and the people, and through economic development, marriage, propaganda, sabotage and secret intrigue. The intended experience is closer to court intrigue than to a combat card game: open influence and hidden intentions, with traps on both sides.

This document separates the **long-term concept** (direction, not yet designed in detail) from the **demo implementation** (what the code does now). The exact demo rules are in [`PROTOTYPE_RULES.md`](../PROTOTYPE_RULES.md). Nothing in the demo column is an approved final decision.

## Design pillars

1. **Public power versus secret intentions.** Standings and Gold are public. Plans are not.
2. **Institutional power is built over time.** Recruited Characters and marriages leave lasting marks on a family's standing.
3. **Economy constrains ambition.** Gold is the bottleneck between wanting to act and acting, and between attacking and staying safe.
4. **Hidden schemes with uncertain outcomes.** A face-down Scheme is a threat, a bluff or a trap, and opponents must decide what it is worth to find out.
5. **Counterplay and bluffing.** Exposing a Scheme is never automatically good, and defending one costs resources too.
6. **Dynastic development.** Children and marriage turn short-term recruits into long-term alliances.

## How the systems relate

```
            Gold (spendable, public)
              │ pays for
              ▼
  Characters ──► permanent standing gains, recurring Gold or cards
  Schemes    ──► delayed, hidden standing swings (yours or a rival's)
  Instants   ──► investigations, defences, marriages
              │
              ▼
  Standings A / R / P (public, accumulated, not spent) ──► political power / score
              ▲
  Children + Characters ──► marriages: one-off lasting bonuses
```

### Political standings

Three separate public measures of influence: **Aristocracy** (the elite and nobility), **Religion** (religious institutions) and **Popularity** (the general population). They are accumulated, not spent, so they describe a family's *position* rather than its *budget*. Keeping them separate lets cards specialise (a religious Character, a slander against the people's favourite) and leaves room for future victory conditions that reward balance or dominance in one sphere.

- *Long-term:* standings may gate cards, unlock offices or titles, decay, or be contested between families.
- *Demo:* integers starting at 2, floor 0, no cap. All changes are immediate and permanent. Score = A + R + P.

### Economic power

Gold is the only spendable resource. Income is partly random each turn, and some Characters add a steady trickle. Because reactions also cost Gold, spending everything on your own turn leaves you defenceless on everyone else's. Keeping a reserve is itself a signal.

- *Long-term:* Gold may become physical cards, trade between families, bribes, taxes and economic Characters with larger engines.
- *Demo:* start with 3, +1–3 per turn (pre-rolled privately for reproducibility), Merchant King and Wandering Troupe add +1 per turn.

### Character recruitment

Characters are the visible institutional network: guards, captains, scribes, sisters, heroes, troupes. They bring an immediate standing gain on recruitment, may provide recurring benefits, carry an affiliation and tags (Military, Noble, Cloud Sister), and determine who your Children can marry. They are public, so recruiting tells opponents what you are building.

- *Long-term:* uniqueness for named Characters, assassination and protection, loyalty, factions, Characters whose value depends on affiliation balance.
- *Demo:* eight Characters, multiple copies allowed, effects applied once on recruitment plus simple recurring Gold or extra draws.

### Secret Schemes: the central mechanic

A Scheme is a planned political action placed face down. Its owner knows what it is; everyone else sees only that it exists and what it cost. It resolves at the start of its owner's next turn, so every rival gets exactly one chance to interfere. A successful Scheme usually pays off for its owner or damages a target; an exposed one usually backfires.

The interesting part is the uncertainty. A one-Gold face-down card might be a harmless self-promotion, a slander aimed at you, or a trap. **Planted Scandal** exists to test this: it does nothing unless investigated, and then it humiliates the investigator. Its presence alone makes every investigation a gamble.

- *Long-term:* more Scheme types (propaganda, sabotage, conspiracies against several families), longer fuses, Schemes that grow if left alone, hidden costs.
- *Demo:* six Schemes, one-round fuse, an optional opponent target, Success and Revealed outcomes. The Gold paid is public (an accepted information leak for now).

### Counterplay

Investigating costs a Senate Intervention and Gold, and gives the Scheme's owner one defensive response:

- **Allow** the reveal and accept the Revealed outcome (which may hurt the investigator, as with Furian Truce or Planted Scandal);
- **Corruption:** the reveal happens but the owner's penalties are turned onto the investigator;
- **Vanish in the Crowd:** the investigation fails and the Scheme stays secret, still on schedule.

Every option costs something, and none is always right. The investigator has to weigh the cost, what the target's Gold reserve suggests about possible defences, and the chance of a trap.

- *Long-term:* a fuller reaction system with third parties, counter-responses and more timing windows; information-gathering short of exposure.
- *Demo:* one deliberately restricted reaction window. Only the owner responds, at most once, with an explicit pass if they do nothing. No stack and no timers.

### Dynastic politics

Each family has Children. A Convenient Betrothal marries a Child to an eligible Character of the same family, granting a one-off bonus and permanently binding the two. Eligibility depends on tags (a noble match, a match within the Cloud Sisters), so what you recruit shapes whom you can marry.

- *Long-term:* marriages **between** families (alliances, consent, dowries, broken engagements), inheritance, heirs, aging and succession, marriage as a diplomatic weapon.
- *Demo:* two public Children per family, three Child definitions, same-family marriages only, one-off bonuses, no further life events.

## What the demo deliberately leaves out

AI opponents, deckbuilding and collection, asymmetric family abilities, diplomacy and alliances, military combat, territories, full Boon and Debuff decks, assassination and protection, campaigns, accounts and matchmaking, and visual polish. These are potential extensions, not commitments.

## Questions for the next design iteration

1. **Victory:** what should winning mean? Thresholds in all three standings, dominance in one, secret objectives, or offices won through standings?
2. **Information:** should Scheme costs be hidden too? Should there be ways to peek without exposing?
3. **Tempo:** is a one-round fuse right? Would longer or variable fuses create better tension?
4. **Economy:** is random 1–3 income too swingy? Should Gold income depend on Characters or standings?
5. **Traps:** does Planted Scandal create interesting bluffing, or does it just deter all investigation? How many copies feel right?
6. **Reactions:** are Corruption and Vanish balanced against Senate Intervention at the same cost?
7. **Dynasty:** what should Children do besides marrying, and how should cross-family marriages work?
