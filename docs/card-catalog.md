# Cloudborne — Historical card catalog

**Status:** archival reference / work in progress. This is not an implementation specification or an approved balance pass.

This catalog reconstructs the card pool preserved in the owner's January 2014 design archive. It also identifies the cards selected for the proposed modern playable demo. Keep this document alongside the implemented rules and card definitions, not as a replacement for them.

## 1. Sources and interpretation

- **XLSX:** `kortspel 2/kort spreadsheet.xlsx`, `Sheet1` (archive timestamp 2014-01-28). Main deck card numbers 1–78; additional Buff and Debuff lists. Tables below preserve the original English names and effect text, including spelling errors; whitespace is normalized. Card numbers are read from the cached worksheet values, including formula-generated numbers.
- **DOCX:** `kortspel 2/kortfördelning.docx` (2014-01-14). Earlier distributions, card ideas, and named Children; summarized in English below.
- **JPG:** individual cards in `characters/`, `scheme/`, `instants/`, `children/`, `money/`; earlier `demokort/` and root-level dated JPGs; `print 1.jpg` is the nine-card print sheet corresponding to the demo art.
- **Modern demo:** the separately proposed political-game demo specification (2026). The “Demo” column means **selected by that proposal**, not verified as implemented. Read actual code and current rules to determine implementation status.

**A = Aristocracy; R = Religion; P = Popularity.** Costs are in Gold. Boon is used in card effects, while the positive-event list is headed “Buffs”. Their equivalence is a working interpretation, not a defined rule. `—` means unspecified. A dash in the source name column is an intentionally unnamed design slot, not a named card. Preserve these slots; do not invent names or treat them as a single duplicate card.

Use the XLSX as the most recent *dated historical baseline*, not proof of final intent. JPG effects can differ substantially. Never combine bonuses from different versions unless the owner explicitly approves a new version. Costs are not printed on the gold-border Scheme and Instant images; the XLSX costs must not be attributed to those images.

## 2. Inventory and planned distribution

| Category | Historical plan | Modern demo selection |
| --- | --- | --- |
| Characters | 36 XLSX slots, including 7 unnamed; plus Furian Warlord outside that list | 8 definitions |
| Instants | 23 XLSX entries: 13 offensive, 10 defensive | 4 definitions |
| Schemes | 19 XLSX entries; earlier DOCX targets 24 | 5 historical + 1 new |
| Children | 44 planned slots; 15 named normal Children + 1 penalty Child in DOCX | 3 definitions |
| Buffs / Boons | 11 XLSX entries | Deferred |
| Debuffs | 13 XLSX entries | Deferred |
| Gold | 3 illustrated denominations; quantities unspecified | Numeric resource |

The 78 main-deck slots are 36 Characters, 23 Instants, and 19 Schemes. Character column H explicitly lists one copy per numbered slot; H is blank for Instants and Schemes. The 78-card total suggests one slot per numbered entry, but those blank quantities are not explicit copy counts. The earlier DOCX proposes three separate A/R/P piles, whereas the XLSX has a single main-deck draw simulation. Do not assume these are simultaneously active rules.

The historical character distribution is symmetrical across affiliations: each of A, R and P has five cost-1, four cost-2, two cost-3 and one cost-4 slots. The DOCX describes corresponding +1, +1/+1, +2 and +3 bonus tiers, although individual XLSX effects may differ.

## 3. Characters — XLSX baseline

The following table reproduces the effect cell, not a fully specified trigger model. A blank marriage effect means no effect is documented, not necessarily that marriage is prohibited. Military Character is a subtype, not a fourth standing. All 36 rows have a source copy count of 1.

### Aristocracy

| No. | Name | Cost | Source type | Original effect (XLSX G) | Demo | Row |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Sivashir Slaves | 1 | Character | +1 A | — | 4 |
| 2 | Cais Tax Driver | 1 | Character | Opponent take 1 debuff. Gain +1 gold per round Marriage +1A | — | 5 |
| 3 | Merchant King | 1 | Character | Take 1 extra gold per round, Marriage +1 A | Yes | 6 |
| 4 | Furian Diplomat | 1 | Character | +1 A, Choose 1 Furian card effect to avoid. Marriage +1A | — | 7 |
| 5 | Cloud Guard | 1 | Military Character | +1 A | Yes | 8 |
| 6 | Aielan Princess | 2 | Character | +1 A, take 1 boon each round. Marriage +1A and +1P | — | 10 |
| 7 | Captain Teos | 2 | Military Character | +1 A,+1 P, Draw 1 extra deck card per round. Marriage +2A | Yes | 11 |
| 8 | City Administrator | 2 | Character | +1 A,+1 R, Draw 1 extra deck card per round. Marriage +1A or +1R | — | 12 |
| 9 | (unnamed) | 2 | Character | +1 A,+1 R | — | 13 |
| 10 | Lefai Aristocrat | 3 | Character | +2A, You may draw a deck card instead of gold. Marriage +3A | — | 15 |
| 11 | Palatin | 3 | Character | +2A | — | 16 |
| 12 | Cloud Prince | 4 | Character | +3A, Take +1 Gold card per round, 1 opp take 1 debuff. Marriage +4A | — | 18 |

### Religion

| No. | Name | Cost | Source type | Original effect (XLSX G) | Demo | Row |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | Initiate Sister | 1 | Character | Take 1 Boon each round. | — | 21 |
| 14 | Scribe | 1 | Character | +1 R | Yes | 22 |
| 15 | Lorekeeper | 1 | Character | +1 R | — | 23 |
| 16 | (unnamed) | 1 | Character | +1 R | — | 24 |
| 17 | (unnamed) | 1 | Character | +1 R | — | 25 |
| 18 | Royal Mate | 2 | Character | +1 R, +1 A, Marriage: +2R or +2A | Yes | 27 |
| 19 | (unnamed) | 2 | Character | +1 R, +1 A | — | 28 |
| 20 | Gardener | 2 | Character | +1 R, +1 P | — | 29 |
| 21 | Field Sister | 2 | Military Character | +1 R, +1 P | Yes | 30 |
| 22 | High Sister Dionys | 3 | Character | +2R, You may draw boon instead of gold. Marriage +3R | — | 32 |
| 23 | High Sister Minai | 3 | Military Character | +2R, Opponent: -1R Save one other char per round. Marriage: +3R or +2P | — | 33 |
| 24 | Cloud Mother | 4 | Character | +3R, Take 2 Boons each round. | — | 35 |

### Popularity

| No. | Name | Cost | Source type | Original effect (XLSX G) | Demo | Row |
| --- | --- | --- | --- | --- | --- | --- |
| 25 | War Hero | 1 | Military Character | +1 P | Yes | 38 |
| 26 | Street Performer | 1 | Character | +1 P | — | 39 |
| 27 | Military Squad | 1 | Military Character | Choose an opponent, they take 1 debuff. | — | 40 |
| 28 | (unnamed) | 1 | Character | +1 P | — | 41 |
| 29 | (unnamed) | 1 | Character | +1 P | — | 42 |
| 30 | Honor Guards | 2 | Military Character | +1 P, +1 A | — | 44 |
| 31 | Daelon the Monk | 2 | Character | +1 P, +1 R Marriage: +2R | — | 45 |
| 32 | Seer | 2 | Character | +1 P, +1 R | — | 46 |
| 33 | Wandering Troupe | 2 | Character | +1 P, +1 A. Gain 1 extra gold per round. | Yes | 47 |
| 34 | (unnamed) | 3 | Character | +2P | — | 49 |
| 35 | Furian Slayer | 3 | Military Character | +2P, can  force another opp to draw debuff instead of gold. Marriage +3P | — | 50 |
| 36 | General Beron | 4 | Military Character | +3P, All Opp take  1 debuff each round | — | 52 |

### Additional historical Character: Furian Warlord

- Source: `characters/furian warlord.jpg` (also in `demokort/` and `print 1.jpg`); DOCX calls it a Wild card. No numbered XLSX entry.
- Type: Character. Cost: 2 Gold. Affiliation and Military tag not specified on the card.
- When played: choose any Character in play; its owner discards it. Lose 1 A.
- Ability: each turn you may roll a die; 1–4 no effect; 5–6 an opponent discards a random card from their hand.
- Flavor: “Damn the Furians, they come and wreak havoc in our court.”
- Demo: deferred.

## 4. Instants — XLSX baseline

The offensive/defensive headings come from the spreadsheet; they do not independently establish when a card may be played. Only the effect text determines explicit historical timing.

### Offensive Instants

| No. | Name | Cost | Original effect (XLSX G) | Demo | Row |
| --- | --- | --- | --- | --- | --- |
| 37 | Devious Plan | 1 | Draw a debuff. Choose a Player that recieves it. | — | 58 |
| 38 | Hit and Run | 1 | When a player draws a boon. Play this and take the boon. | — | 59 |
| 39 | Frenzied Crowd | 2 | Kill one aristocrat. If the owner has more than 5 A, you may kill one more. | — | 60 |
| 40 | Witch burning | 2 | Kill one religious. If the owner has more than 5 R, you may kill one more. | — | 61 |
| 41 | Harsh Times | 2 | Kill one popularity. If the owner has more than 5 P, you may kill one more. | — | 62 |
| 42 | Furian Counter-attack | 2 | Kill two military characters. | — | 63 |
| 43 | Poisoned Food | 1 | Kill a child of any player. | — | 64 |
| 44 | Senate intervention | 1 | Reveal a scheme. | Yes | 65 |
| 45 | Nasty Rumours | 1 | Break any marriage. | — | 66 |
| 46 | Delayed Plans | 1 | Target can't activate or play any schemes on their next turn. | — | 67 |
| 47 | Riding the tide | 1 | Reveal a scheme. In addition to the fail event, you gain the success event. | — | 68 |
| 48 | Impressing Justice | 1 | Reveal a scheme. Take 1 deck card. | — | 69 |
| 49 | Honour is rewarded | 1 | Reveal a scheme. Take 1 gold card. | — | 70 |

### Defensive Instants

| No. | Name | Cost | Original effect (XLSX G) | Demo | Row |
| --- | --- | --- | --- | --- | --- |
| 50 | Dream Vision | 1 | Look at the top 3 cards in a deck and pick one. | — | 73 |
| 51 | Clear Sky | 1 | Prevent any character from dying. | — | 74 |
| 52 | Convenient Betrothal | 1 | Marry a child of yours with any legal character in play. | Yes | 75 |
| 53 | Shield of Faith | 2 | Prevent a religious character from dying. Then gain +1R. | — | 76 |
| 54 | Heroism | 2 | Prevent a popularity character from dying. Then gain +1P | — | 77 |
| 55 | Bodyguards | 2 | Prevent an aristocracy character from dying. Then gain +1A. | — | 78 |
| 56 | Corruption | 1 | On reveal: The revealer takes the fail effect instead of you. | Yes | 79 |
| 57 | Lost evidence | 1 | On reveal: The negative effect doesn't apply | — | 80 |
| 58 | Vanish in the crowd | 1 | Cancel a reveal. | Yes | 81 |
| 59 | Palace Gardens | 3 | Avoid any negative incoming effect. Pass your next turn | — | 82 |

## 5. Schemes — XLSX baseline

The DOCX says Schemes are bought and may be placed on one's own turn; if unopposed they are turned face up on one's next turn. Distinguish the Success effect from the Fail/Revealed effect. The exact payment moment and handling of multiple reactions still need a design decision.

| No. | Name | Cost | Original effect (XLSX G) | Demo | Row |
| --- | --- | --- | --- | --- | --- |
| 60 | Dealing with heresy | 1 | Success: +2R, Fail: -1R | Yes | 86 |
| 61 | Party Lion | 1 | Success: +2A Fail -1A | Yes | 87 |
| 62 | Military Coup | 1 | Succeed: Kill 1 Military Character. Fail: Loose 2 Characters | — | 88 |
| 63 | Scandal Party | 1 | Opponent -2A Fail: -2A | — | 89 |
| 64 | Shadow Beast | 3 | Kill 2 Characters. Fail: -3R | — | 90 |
| 65 | Propaganda | 1 | +1 P Fail: -1P | — | 91 |
| 66 | Inquisitor | 1 | Opponent -2R Fail: -1R -1A | — | 92 |
| 67 | Vajero Assassin | 2 | Kill 1 Character, Fail: -2P -1A | — | 93 |
| 68 | Pilgrimage | 2 | Gain 1R, 2P. Fail: -1R -1P | — | 94 |
| 69 | Helping the Poor | 1 | Gain 1P. Fail -1P | Yes | 95 |
| 70 | Prophet of Aiel | 1 | Gain 1R. Fail -1R | — | 96 |
| 71 | Bathing House | 2 | Gain 1A, 2P. Fail: -1A, -1P | — | 97 |
| 72 | Furian Truce | 2 | Gain 2A, 1P. Fail: -1P, +2P to Revealer | Yes | 98 |
| 73 | Street Slander | 1 | Opponent -2P. Fail: -1A, -1P | Yes | 99 |
| 74 | Robbed | 1 | Opponent: no gold next round. Fail: no gold next round | — | 100 |
| 75 | Blessed Marriage | 2 | Gain 2A, 1R. Fail: -1A, -2R | — | 101 |
| 76 | New Monastery | 2 | Gain 2R, 1P. Fail: -2R | — | 102 |
| 77 | Cash Flow | 1 | Take Extra Gold card next round. Fail opponent take 1 gold. | — | 103 |
| 78 | Phalannean Artifact | 2 | Gain 2R, 1A. Fail: -1R, -2P | — | 104 |

### Earlier DOCX Scheme plan (24 slots)

| Category | Planned count | Named or described in DOCX |
| --- | ---: | --- |
| A | 2 | One unnamed +1 A, fail −1 A; Party Lion +1 A, fail −1 A (Cais flavor) |
| R | 2 | Prophet of Aiel +1 R, fail −1 R; one unnamed +1 R, fail −1 R |
| P | 2 | Helping the Poor +1 P, fail −1 P; one unnamed +1 P, fail −1 P |
| A + R | 2 | Phalannean Artifact +2 R +1 A; Blessed Marriage +2 A +1 R |
| A + P | 2 | Furian Alliance (effect unspecified); one unspecified slot |
| R + P | 2 | Pilgrimage +2 R +1 P; New Monastery +1 R +2 P |
| Offensive | 6 | Street Slander −2 P; five unspecified slots |
| Buffs | 6 | No individual definitions given under this heading |

Furian Alliance may be an early name for Furian Truce, but the archive does not explicitly identify them as the same card. Keep it as a separate unresolved idea. The DOCX also mentions Schemes for gaining Children and suggests milder failure penalties for tier-1 Schemes (e.g. discard or show a card). It suggests making Scheme rewards attractive enough to induce opponents to interfere, without making interference automatic.

## 6. Debuffs — XLSX baseline

No cost, main-deck card number, frequency or copy counts are specified. All 13 are deferred from the modern demo.

| Name | Original effect (XLSX G) | Row |
| --- | --- | --- |
| Tragic Death | Loose 1 Child | 121 |
| Dwindling Interest | Loose 2 of highest standing | 122 |
| Lazy Staff | Discard cards until 3 remain . | 123 |
| Uninspired Speech | Take no card from char/scheme deck next round | 124 |
| Delayed Shipment | Take no gold next turn (unless a card tells you to) | 125 |
| Severed Ties | Throw 1 Random card from hand. | 126 |
| Caught off guard | Show one random card to everyone. | 127 |
| Unwilling Gratitude | Give 1 random card from hand to another player. | 128 |
| Mysterious Disappearance | Loose 1 character in play. | 129 |
| Disloyal staff | Give one character in play to another player (in play). | 130 |
| Failed Plans | Discard 1 scheme from hand. | 131 |
| Denthiri | Loose 1 Religion, loose 2 characters in play. | 132 |
| Out of Grace | Loose 2 of highest standing. All opp gain 1 of the same. | 133 |

## 7. Buffs / Boons — XLSX baseline

No cost, main-deck card number or quantities are specified. All 11 are deferred from the modern demo.

| Name | Original effect (XLSX G) | Row |
| --- | --- | --- |
| A New Dawn | Gain 1 Child | 137 |
| Inheritance | Take an extra gold card next round | 138 |
| Charming Cheeks | Take an extra deck/scheme card next round | 139 |
| Dinner with the senate | Gain 1 of a standing of your choosing | 140 |
| No rest for the wicked | You may play 1 scheme and resolve it immediately. | 141 |
| Volunteers | Play 1 character for free. | 142 |
| Prosperous Year | Take 1 Gold card and 2 deck cards. | 143 |
| Nalthiri | Resurrect up to 3 characters. | 144 |
| War Bounty | All Players take 1 gold card in turn order. | 145 |
| Seraf Blessing | Use this card as an instant to prevent a character from dying | 146 |
| Opportunity | Take 1 gold or 1 deck card. | 147 |

## 8. Children — DOCX plan and JPG definitions

The DOCX plans 44 normal Child slots: 15 with one marriage affiliation, 24 with two, and 5 with three. A separate penalty Child is named; whether that card is included in 44 is unclear. The source names only 15 normal Children, so 29 normal slots are unnamed if each listed name represents one slot. Do not invent identities for them.

| Eligible affiliations (DOCX) | Count planned | Named normal Children | Unnamed slots |
| --- | ---: | --- | ---: |
| Aristocracy | 5 | Neion, “The Feather”; Faeoa of the Moon; Jewel Eyed Linya; Cindrea the Lavish; Oenos the Tidy | 0 |
| Religion | 5 | Junaé the Devout; Haena the Chaste; Stone-faced Derthos | 2 |
| Popularity | 5 | Siblys - gaunt of face; Bejae the Bull; Caso, the Drunk | 2 |
| Aristocrat + Religion | 8 | — | 8 |
| Aristocrat + Popularity | 8 | Velaes the Silver tounge; Brenae the Smiling | 6 |
| Religion + Popularity | 8 | — | 8 |
| All three | 5 | Liys the Meek; Feor the Just | 3 |
| Total | 44 | 15 named normal Children | 29 |

Penalty Child: **Maleos the Insane** — Aristocracy. Can only be married off for a penalty; magnitude and recipient unspecified.

The source says “Start: 12 barn för 6 spelare” (12 Children for six players). It also mentions being able to receive five Children per player before reshuffling; the exact meaning of the count is not defined.

### Illustrated Child rules and flavor

All three are selected for the modern demo. No cost is printed. The actual JPG eligibility is more specific than the DOCX affiliation headings; in particular, Cloud Sister is not synonymous with every Religion Character.

- **Faeoa of the Moon** (`children/faeoa of the moon.jpg`): “Can only marry a noble.” Flavor: “- All those nights gazing at the clouds has made her simple-minded and spoiled. - Well, at least she still have her looks. - Yes, let’s marry her before they fade…”
- **Neion “The Feather”** (`children/neion the feather.jpg`): “Can only marry a noble.” Flavor: “So beautiful, but so fragile. Neion was never a man of strength. The bed was always his retreat. Let’s hope the daughter deals with him gently on their wedding night…”
- **Junaé the Devout** (`children/junaé the devout.jpg`): “Can only marry a Cloud Sister.” Flavor: “Junaé was a prodigy in the tactics of war and was to be groomed for command until one day when he suddenly turned to the church. Despite harsh penances, you could not sway him from joining the Monks of Celes.”

## 9. Gold cards

| Denomination | Image source | Copies |
| --- | --- | --- |
| 1 Gold | `money/1 gold.jpg` | Unspecified |
| 2 Gold | `money/2 gold.jpg` | Unspecified |
| 3 Gold | `money/3gold.jpg` | Unspecified |

All three use the same gold-stack illustration and display only their denomination as the rule text. The modern demo represents Gold numerically and does not require these to exist as card instances.

## 10. JPG rule variants — Characters and Instants

The following transcriptions are normalized for clarity; they are separate versions, not extra effects to add to the XLSX version. Flavor text is retained as an archival reference (minor punctuation and line-break normalization).

### Lefai Aristocrat (XLSX #10)

- Root `2014-01-07 21.31.41.jpg`: 2 Gold. Opponent loses 1 nobility; owner gains 1 nobility. Optional die roll each turn: 5–6 draw a card, 1–2 discard one; 3–4 not specified. Image has red 1, blue 1, yellow 2 circles whose meaning is unknown.
- Root `2014-01-08 16.22.15.jpg`: 2 Gold. Same effect but uses Aristocracy instead of nobility; no colored circles.
- `characters/lefai aristocrat.jpg` (also `demokort/`, print sheet): 2 Gold. Opponent loses 1 A, owner gains 2 A. Optional die each turn: 1–4 no effect; 5–6 draw a card. Flavor: “Never trust them, whatever you do. Do not trust the Denae family.”
- DOCX: +2 A, −1 opponent (standing implied A), in the +2 tier.
- XLSX: 3 Gold, +2 A, optional card draw instead of Gold, Marriage +3 A; no opponent penalty or dice in the text.

### Cloud Mother (#24)

- `demokort/cloud mother.jpg` / `print 1.jpg`: 6 Gold. When played, all players with less than 5 R lose 2 A and 2 P. Each turn owner may look at two cards of an opponent and take one into their hand. No +3 R effect is printed.
- `characters/cloud mother.jpg`: 7 Gold. Same effects, plus gain 3 R (listed after the all-players penalty). Illustrated.
- XLSX: 4 Gold, +3 R, take 2 Boons each round.
- Flavor shared by JPGs: “She has been communicating with the goddess for weeks now. Mark my words, when she awakens we will be the first to know.”

### Furian Warlord

See section 3 for the complete historical image version and flavor text.

### Senate Intervention (#44)

- `instants/senate intervention.jpg`: play at any time; reveal an opponent's Scheme card. No printed cost.
- Flavor: “Dear Senate, I have reason to believe he has acted unjust and fooled not only me, but all of you as well.”
- XLSX: cost 1; reveal a Scheme. Modern demo restricts initiation to one's own action phase.

### Corruption (#56)

- `instants/corruption.jpg`: play when you are about to reveal a Scheme. The Scheme's Reveal is transferred to the player who forced it. No printed cost. The first sentence is ambiguous about whose reveal is imminent.
- Flavor: “Please stop this charade. We have already learned that it was your doing all along.”
- XLSX: cost 1; on reveal the revealer takes the fail effect instead of you.
- Modern demo narrows redirection to negative standings targeting the Scheme owner and preserves independent revealer effects.

### Delayed Plans (#46)

- `instants/delayed plans.jpg`: play at any time; target player may not activate any Schemes on their next turn. No printed cost.
- Flavor: “Excuse me sir, this alley is closed for renovations. Perhaps you could take the main road instead?”
- XLSX: cost 1; target cannot activate **or play** Schemes next turn.

## 11. JPG rule variants — Schemes

All rows below refer to the gold-border cards in `scheme/`. No Gold costs are printed. “Owner” is the default recipient of an unqualified gain or loss; opponent and revealer are stated where the image specifies them.

| Card | Succeed (JPG) | Revealed (JPG) | Image filename | Difference in XLSX |
| --- | --- | --- | --- | --- |
| Party Lion (#61) | Owner +1 A | Owner −1 P | party lion.jpg | Success +2 A; fail −1 A |
| Helping the Poor (#69) | Owner +1 P | Owner −1 P | helping the poor.jpg | Same standing effects |
| Propaganda (#65) | Owner +1 P | Revealer +1 P | propaganda.jpg | Fail owner −1 P instead |
| Prophet of Aiel (#70) | Owner +1 A, +1 P | Owner discards 1 card and loses 1 P | prophet of aiel.jpg | Success +1 R; fail −1 R |
| Phalannean Artifact (#78) | Owner +2 R, +1 P | Owner −1 R, −2 P | phalannean artifact.jpg | Success +2 R, +1 A; same fail |
| Pilgrimage (#68) | Owner +2 R, +1 P | Owner −1 R, −1 P | pilgrimage.jpg | Success +1 R, +2 P; same fail |
| Blessed Marriage (#75) | Owner +2 A, +1 R | Owner −2 A | blessed marriage.jpg | Fail −1 A, −2 R |
| Furian Truce (#72) | Owner +2 A, +1 P | Owner −1 A; revealer +2 P | furian truce.jpg | Owner −1 P instead; same revealer reward |
| Bathing House (#71) | Owner +1 A, +2 P | Owner −1 P; revealer +1 A | bathing house.jpg | Fail −1 A, −1 P; no revealer bonus |
| Street Slander (#73) | Target opponent −2 P | Owner −1 A, −1 P | slander on the streets.jpg | Same effects |
| Inquisitor (#66) | Target loses 1 R if R ≥ 5, otherwise 2 R | Owner −1 A, −1 P | inquisitor.jpg | Target −2 R; fail −1 R, −1 A |

### Earlier root-level Scheme versions

- `2014-01-08 16.20.15.jpg` — Phalannean Artifact: success +2 Religiousness and +1 Popularity; revealed −2 Popularity and −1 Religiousness. Flavor: “There it was, hidden away for generations.” Same numerical outcome as gold-border image, older terminology and artwork.
- `2014-01-08 16.20.35.jpg` — Slander on the streets (later Street Slander): target opponent −2 P; revealed owner −1 P and −1 A. Flavor: “The Lord has done it again...” Same numerical outcome as gold-border card.
- The three Scheme images in `demokort/` and `print 1.jpg` correspond to the gold-border Prophet of Aiel, Phalannean Artifact and Street Slander.

### Scheme flavor text (gold-border JPGs)

| Card | Success flavor | Revealed flavor |
| --- | --- | --- |
| Party Lion | Never a dull moment with you! Let’s have another drink. Bring in the slaves! | Never will I see such decadence as that in the filthy city of Cais. |
| Helping the Poor | Rejoice at the generousity of our great prince! | What have you done?! That food was spoiled. Now half the commoners lay sick and some already died! |
| Propaganda | The generous, the merciful, the just. The Leader. | I am sure I saw another poster here just yesterday. What was his name again? Can’t seem to recall... |
| Prophet of Aiel | Like a melody, his words rang through the crowded streets. | To think they would listen to that madman... |
| Phalannean Artifact | Have you heard? They found the Tomb of Feion on Mount Celes. | Those shameless noblemen should never’ve been trusted... |
| Pilgrimage | What I saw at Mount Celes was astonishing. I now feel as if born anew. Pray with me! | That one... He actually expects us to fall for that charade. |
| Blessed Marriage | The Cloud mother gave you her blessing, marry anyone you like. | How could you be so stupid to let him marry the maid? We are a laughing stock now! |
| Furian Truce | I dare say, that was a bold and well struck move! | We demand justice for all our fathers and brothers slain down there by those filthy barbarians! |
| Bathing House | Nothing’s quite like a hot bath after a senate meeting. | The bathing water there is never clean, not to mention that which you drink. |
| Street Slander | With his mother? How wicked! | Her slaves are put on the streets to spread lies around them. |
| Inquisitor | You know what to do. | I didn’t think they’d go after our own family! |

## 12. Additional DOCX design fragments

- Sivashir Slaves: +1 A, Danaé flavor suggested.
- Aielan Princess: listed in A +1/+1 tier; Lefai Aristocrat and Cais Tax Driver in +2 tier (Cais moves to cost 1 in XLSX).
- High Sister: generic name in R +2 tier. XLSX later lists High Sister Dionys and High Sister Minai; no explicit mapping.
- Palace Gardens: idea for getting away and avoiding something bad; XLSX specifies avoiding a negative incoming effect and passing next turn.
- Add Instants and some “curses” to each pile, including money, reveal protection and boosts.
- Debuff ideas: smaller hand, discard/give away/show a card, kill own Character in play, no Gold next round, a Child dies, lose A/R/P, block draw from one A/R/P pile for a round. Several correspond to later XLSX entries; the last presupposes separate piles.

## 13. Modern demo overlay — not historical rules

The separate 2026 demo proposal selected 21 unique definitions, of which 20 are historical and one is new. The proposal specifies 4 copies of each main-deck definition (72 cards), 4 copies of each of the 3 Child definitions (12 Children), and numerical Gold. This is not the 2014 distribution.

- Characters (8): Merchant King, Cloud Guard, Captain Teos, Scribe, Royal Mate, Field Sister, War Hero, Wandering Troupe. Use the proposed demo effects, with Field Sister receiving an experimental +1 R marriage bonus absent from the XLSX. The demo grants all Aristocracy Characters the `noble` tag, and Field Sister the `cloud-sister` tag, neither of which is defined as a universal mapping in the historical material.
- Schemes (6): Party Lion, Dealing with Heresy, Helping the Poor, Street Slander, Furian Truce, **Planted Scandal**. The five historical cards follow the XLSX standing effects.
- Instants (4): Senate Intervention, Corruption, Vanish in the Crowd, Convenient Betrothal. Demo timing and reaction limits are deliberate simplifications. Convenient Betrothal is restricted to same-family marriages in the demo; XLSX says any legal Character in play.
- Children (3): Faeoa of the Moon, Neion “The Feather”, Junaé the Devout, following the JPG marriage restrictions.

### Planted Scandal — new experimental Scheme

- Cost: 1 Gold.
- Success: no effect.
- Revealed: revealing family loses 2 P.
- Purpose: test whether an intentionally concealed trap deters investigation and creates bluffing. This belongs only to the modern experiment; it is not in the 2014 archive.

## 14. Unresolved rules and implementation guidance

For Claude Code and future contributors:

1. Treat this catalog as a reference library, not a request to implement or enable every card immediately. Inspect existing implementation and the current approved demo rules first. Preserve current working behavior unless a new task explicitly authorizes changing it.
2. Maintain stable IDs for named definitions; if encoding historical versions, give them separate version identifiers. Do not create playable placeholders from unnamed slots without approval. Keep names, source text, normalized rules, and runtime effect definitions distinct.
3. Do not silently choose between XLSX and JPG variants. The demo can select one version, but document the selection. Do not infer missing effects from flavor text.
4. New card families require design work: death and discard semantics (including loss or retention of standing gains), marriage eligibility and benefits after death/divorce, cross-family marriage consent, exact Gold card versus Gold unit semantics, Boon/Debuff triggers and target selection, tie-breaking for highest standing, optional abilities and replacement draws, effect order, interrupts, duration, and empty decks.
5. Some effects are ambiguous even in the spreadsheet: Furian Diplomat's chosen immunity and duration; High Sister Minai's save timing; Cais Tax Driver/Cloud Prince Debuff timing; unspecified choices for discards and deaths; Riding the Tide when a success effect targets an opponent; and Palace Gardens' skipped turn. Do not implement these by guessing without recording a provisional decision.
6. For hidden Schemes, preserve authoritative server validation and filtered views. No concealed identity, target or effect should be revealed by IDs, rendering, logs or errors. Never rely on flavor text for resolving a card.
7. Validate any expansion with deterministic rule tests, card-conservation checks, privacy checks, multiplayer reaction tests, and actual playtesting. Separate implemented, tested, proposed and archived statuses.

No historical source establishes a complete victory condition, final turn sequence, full reaction stack, or final list of all 44 Children. These remain design tasks, not omissions to be filled automatically by this catalog.
