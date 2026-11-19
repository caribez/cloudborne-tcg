# Cloudborne: political card game demo

A playable vertical slice of **Cloudborne**, a political and dynastic card game for 2–4 families. Recruit Characters, place hidden Schemes, investigate (and get trapped by) your rivals, marry your Children into power, and finish 8 rounds with the highest Aristocracy + Religion + Popularity. Play **hotseat** (one screen) or **LAN** (one browser per player).

The rules are **provisional demo rules**: see [`PROTOTYPE_RULES.md`](PROTOTYPE_RULES.md). The design direction is in [`docs/political-game-design.md`](docs/political-game-design.md).

## Requirements

- Only the **host** computer needs [Node.js](https://nodejs.org/) **22.12 or newer** (npm included).
- Players need a current desktop browser with WebGL (Chrome, Edge, Firefox, Safari).
- Play doesn't use the internet. Everything is bundled locally, including card art, which is generated in the browser. Third-party assets and their licenses are listed in [`CREDITS.md`](CREDITS.md).

## Commands

```bash
npm install          # once
npm run dev          # development: Vite (http://localhost:5173) + Socket.IO backend, hot reload
npm run build        # build client (dist/client) and server (dist/server)
npm start            # serve the built game + multiplayer on one port (default 3000)
npm run typecheck    # strict TypeScript for client, shared and server code
npm test             # Vitest: rules, Schemes/reactions, marriage, views/privacy, layout, LAN, hotseat/LAN equivalence
```

`PORT=4000 npm start` changes the port. `HOST=127.0.0.1 npm start` keeps the server off the network.

## How to play (short version)

Each family starts with A 2 / R 2 / P 2, 3 Gold, 7 cards and 2 Children. At the start of your turn, your due Schemes resolve, you draw a card, and you gain 1–3 Gold plus any Character bonuses. Then play as many cards as you can afford and end your turn.

- **Characters** (gold/blue/red frames by affiliation) go into your Character area: an immediate standing bonus, sometimes Gold or an extra card every turn.
- **Schemes** (purple) are placed **face down**. Opponents see only a card back. At the start of your next turn the Scheme succeeds unless someone has exposed it.
- **Senate Intervention** (teal) investigates another family's hidden Scheme. Its owner then decides: **Corruption** (the reveal's penalties hit the investigator), **Vanish in the Crowd** (the investigation fails), or **Allow the investigation** (the Revealed effect applies). Beware **Planted Scandal**, a trap that punishes whoever exposes it.
- **Convenient Betrothal** marries one of your Children to an eligible Character of yours for a lasting bonus.
- No new Schemes in round 8. After round 8 the highest A + R + P wins; ties share the victory.

### Hotseat (one computer)

Open the page, choose **Hotseat**, pick 2–4 families and names, and start. After the page has loaded, hotseat needs no server connection.

- Only the hand of the player who currently has **decision priority** is shown. Whenever priority moves (end of turn, an investigation handing the decision to the Scheme's owner, and back again), the hand and every private preview disappear at once behind an opaque **"Pass to …"** screen. The next hand appears only after that player clicks **"I'm …: show my hand"**.
- **Hide hand** (top bar) covers your hand at any time.
- Privacy guards against casual glances at a shared screen. It doesn't stop someone inspecting browser memory.
- After the final round a results screen offers **Play again**, **New setup** or **Main menu**.

### LAN (one browser per player)

1. On the host: `npm install`, `npm run build`, `npm start`. The terminal prints URLs such as:
   ```
   This computer:  http://localhost:3000/
   LAN:            http://192.168.1.23:3000/
   ```
2. The host opens the localhost URL, and everyone else opens the **LAN URL** in their browser. All of them choose **LAN game** and enter a name. The lobby also shows the LAN URL.
3. The first player to join becomes the **host** and is the only one who can **Start**, **Restart game** or go **Back to lobby**. Players can switch to a free seat with **Sit here**. A fifth player is turned away.
4. Every player always sees their own hand. When someone investigates your Scheme, the decision panel appears on your screen; everyone else sees who is deciding.
5. At the end, everyone sees the results; the host can restart or return to the lobby.

**Reconnecting:** if a player refreshes or briefly loses the connection, the game pauses for everyone with a banner naming who's missing (also in the middle of an investigation). Input is disabled until the server resends that player's current view. Reopening the **same browser tab** restores the seat automatically. The tab keeps an opaque token in `sessionStorage`, so a new tab or another browser counts as a new player. Game state lives only in the server's memory, so stopping `npm start` ends the game.

`npm run dev` also works for LAN testing: open `http://<host-ip>:5173/`. Vite proxies Socket.IO (HTTP polling and WebSocket) to the backend on port 3001, so the browser always connects to the page's own origin.

### Network troubleshooting

- **Same network:** all devices must be on the same Wi-Fi or wired network. The host's address is usually `192.168.x.x` or `10.x.x.x`. If several are printed (VPN, Docker, virtual adapters), use the one on your Wi-Fi or Ethernet adapter.
- **Firewall:** allow incoming connections to Node.js on the chosen port (default 3000; 5173 for `npm run dev`).
  - **Windows:** when the "Windows Defender Firewall" prompt appears, allow Node.js on **Private networks**. Make sure the Wi-Fi network profile is set to *Private*.
  - **macOS:** System Settings → Network → Firewall → Options → allow incoming connections for `node`.
  - **Linux (ufw):** `sudo ufw allow 3000/tcp`.
- **Networks that block devices from reaching each other:** guest Wi-Fi, hotel, café, campus and corporate networks often enable "client/AP isolation". The page then never loads on other devices, even though it works on the host. Use a home router or a phone hotspot instead, or connect the devices to a cheap travel router.
- **Quick test from another device:** open `http://<host-ip>:3000/`. If the page doesn't load, the problem is the network or firewall, not the game.
- The `npm run dev` terminal may print `ws proxy socket error … ECONNRESET` when a tab closes. These messages are harmless.

## Controls

| Action | How |
| --- | --- |
| Inspect a card | Hover it in your hand or on the table. The enlarged card and its rules appear at the top right. Click a table card to pin it |
| Select a card | Click it in your hand. The panel at the bottom right shows its cost, rules, whether it is playable now (and why not), and its legal targets |
| Choose a target | Click a target button in the panel, or click a green-highlighted card on the table (a hidden Scheme to investigate; a Child or Character to marry), or click an opponent's nameplate (Street Slander) |
| Confirm | **Recruit / Place Scheme / Play** button in the panel |
| Cancel | **Esc** or **Cancel** |
| Respond to an investigation | The red decision panel: **Play Corruption**, **Play Vanish in the Crowd**, or **Allow the investigation** |
| End your turn | **End turn** |
| Zoom | Mouse wheel (limited range) |

Family nameplates beside each table row show A / R / P, score, Gold, hand size and pending Schemes. The event log (bottom left) explains every automatic step: Scheme results, income, draws and recurring bonuses. Rejected actions explain the reason in a red message, for example "Royal Mate costs 2 Gold; you have 1."

## Where to edit things

| What | File |
| --- | --- |
| Card names, costs, affiliations, tags, effects, marriage bonuses | `src/shared/cards.ts` (rules text is generated from this data in `cardText.ts`) |
| Main deck and Child pool composition | `src/shared/deck.ts` (`MAIN_DECK`, `CHILD_POOL`) |
| Starting values, income range, hand size, rounds, final-round rule, legality checks | `src/shared/rules.ts` (`DEMO_RULES` and `check*` functions) |
| Turn-start automation (Scheme resolution, draw, income, recurring effects) | `src/shared/turns.ts` |
| Scheme Success / Revealed resolution, Corruption redirection | `src/shared/schemes.ts` |
| Marriage eligibility | `src/shared/marriage.ts` |
| Victory condition and scoring | `src/shared/victory.ts` |
| Standing and Gold changes (floor at 0) | `src/shared/standings.ts` |
| What each action does to the state | `src/shared/engine.ts` (`applyAction`, `playCard`) |
| What each player may see | `src/shared/views.ts` |
| Log wording | `src/shared/logText.ts` |
| Table zones and card positions (logical coordinates) | `src/shared/layout.ts` |
| Card artwork (generated) | `src/client/render/cardArt.ts` |

A new card that fits an existing effect shape needs only a definition (and deck copies). A genuinely new effect needs a small case in the relevant resolver (`engine.ts`, `turns.ts` or `schemes.ts`), and if it takes a new kind of target, a `PlayTarget` variant in `types.ts`, a check in `rules.ts` and a branch in `parseTarget` (`engine.ts`) so the LAN server accepts it.

## Architecture

```
src/
  shared/            framework-free game core, used by both modes
    types.ts         serializable GameState, typed GameAction/PlayTarget, reaction window, log entries
    cards.ts         card definitions (data);  cardText.ts: rules text from data
    deck.ts          deck/Child pool composition, opaque instance ids
    rules.ts         DEMO_RULES, legality, decision priority, legal targets
    engine.ts        setupGame (injected RNG), applyAction, locateCard, checkConservation, parseAction
    turns.ts schemes.ts marriage.ts standings.ts victory.ts gameLog.ts   small rule modules
    views.ts         playerView / publicView: what one viewer may see
    layout.ts        deterministic table layout in logical coordinates
    logText.ts       privacy-safe log wording
    protocol.ts      LAN wire types + validators
  server/            LAN authority (Node)
    authority.ts     lobby, seats, host, sessions, command ids/revisions, pause, filtered snapshots
    socketServer.ts  Socket.IO transport: binds sockets to session tokens
    staticFiles.ts   serves the built client
    main.ts          one-port server, prints localhost/LAN URLs
  client/
    session/         hotseatSession.ts (in-browser authority), lanClient.ts (socket adapter)
    render/          tableScene.ts (Three.js table, zones, hand layer, picking, tweens), cardArt.ts
    ui/              gameScreen.ts (shared HUD: nameplates, targeting, reactions, results), hotseatMode.ts, lanMode.ts
```

- **One core, two authorities.** Hotseat runs `applyAction` in the browser through `HotseatSession`; LAN runs the same function on the server through `LanAuthority`. A test checks that identical seeds and action scripts (including investigations and responses) give identical views and state.
- **State is plain data.** Instance ids live in explicit zones (`drawPile`, `hands`, `characters`, `schemes`, `children`, `childPile`, `discard`), plus an `instanceId → definition` map and a `marriages` relation. `checkConservation` verifies that every instance is in exactly one valid zone. Transitions copy the state, so the input is never mutated.
- **Decision priority.** `turn.activeSeat` is whose turn it is; `decisionSeat(state)` is who must act next, which is the Scheme owner while a `reaction` window is open. Both adapters and both UIs follow it.
- **Randomness** comes only from the setup RNG: opaque instance ids, the deck and Child pool shuffles, and one income roll per turn of the fixed-length game. The LAN server uses crypto randomness by default; tests inject a seeded RNG.
- **Presentation only sees `PlayerView`s** and submits typed intentions. The view lists each hand card's playability, the reason it can't be played, and its legal targets, so the UI holds no rules. Card positions are derived from the view by `layout.ts`. The renderer reconciles meshes by instance id **and** appearance, so a Scheme that is revealed (or a viewer change) refreshes its face. Animations are cosmetic and can be finished instantly.
- **Privacy.** Views send opponents' hands as counts and other families' pending Schemes as `defId: "hidden"` with no target. Deck order, income rolls, the Child pool, the instance map and reconnect tokens are never sent. Instance ids are random (`k` + 10 characters), so they reveal nothing about definitions or deck order. The public log says "placed a hidden Scheme" and "investigate a hidden Scheme" and names the card only once it is revealed. Rejections are identical for "someone else's card" and "nonexistent card".
- **Commands** carry a client-generated id and the revision they were based on. The server stores each session's recent results, so a retry with the same id gets the original answer without being applied again. A command based on an old revision is rejected as stale, and the server resends the sender's view. While disconnected, the client sends nothing and drops Socket.IO's offline buffer. It accepts input again only after a fresh snapshot.

### Implementation choices

- Seats are compacted when the game starts, so lobby seat *n* is game seat *n* during play.
- Revisions keep increasing across restarts, so commands from a previous deal are always stale.
- A second tab presenting the same token takes over the seat, and the old tab is told why.
- Each family has one table row (the viewer's row nearest), split into Children, Characters and Schemes zones; married Children are tucked under their spouse with a gold outline. Deck and discard sit on the right. The hand is drawn in a separate orthographic layer.
- `?e2e` in the URL exposes card screen positions and the identities already visible in the current view on `window.__cloudborne`, for the browser smoke scripts. `?e2e&seed=N` fixes the **hotseat** shuffle for those scripts.

## Testing

`npm test` runs the automated suites (all deterministic):

- `test/core.test.ts`: card data and deck composition; setup for 2/3/4 families; turn-start draw and income; Gold costs and insufficient-Gold rejection; several plays per turn; recurring effects; standing floor; empty deck; exactly 8 turns per family and round counting; final-round Scheme ban; scoring, ranks and shared victories; game-over rejection; whole random games conserving cards; immutability; payload validation.
- `test/schemes.test.ts`: face-down placement, targets, success timing for 2/3/4 players, resolution order, every Revealed effect, Planted Scandal, Senate Intervention targeting, explicit priority, blocked actions during reactions, illegal reactions, Corruption redirection, Vanish in the Crowd, resource deduction, no duplicate resolution.
- `test/marriage.test.ts`: starting Children, every legal combination, ineligible tags, unmarriageable Characters, other families' cards, double marriages, Royal Mate's choice.
- `test/views.test.ts`: views, public view, hidden Scheme identity and target, reaction info, log and rejection privacy, opaque instance ids (no inference from sorted ids, no reuse across games).
- `test/layout.test.ts`: deterministic zones, compression, married Children, hidden Schemes.
- `test/lan.test.ts`: a real Socket.IO server and clients: lobby rules, session-bound seats, filtered snapshots over a whole game, hidden Schemes in every payload, tokens, reactions (only the owner may respond, the active player waits), a retried reaction applied once, **reconnect during a pending reaction**, retries, stale revisions, pause and resume, duplicate tabs, lobby grace period, host restart, game completion and restart.
- `test/equivalence.test.ts`: the same seed and script (recruits, Schemes, investigations, Vanish, Corruption, rejections) give identical views and state through hotseat and LAN, for 2, 3 and 4 players.
- `test/hotseat.test.ts`: the hotseat adapter, including priority moving to the reactor and back.

Test-only fixtures (`test/fixtures.ts`) move specific cards into hands so combinations can be tested without lucky draws. The LAN authority and the hotseat session accept a `prepareGame` hook for the same purpose. It is set only in server-side code; clients cannot reach it.

Optional browser smoke checks use Playwright, which isn't a project dependency. Install it with `npm i -D playwright && npx playwright install chromium`, then run them against a running server:

```bash
node scripts/e2e-hotseat.mjs http://localhost:3000   # turn loop, marriage, hidden Scheme, investigation handoffs, Planted Scandal, privacy, full game, results
```

```bash
CLOUDBORNE_TEST_SEED=137 npm start                     # in another terminal, freshly started: a predictable opening for the LAN script
node scripts/e2e-lan.mjs http://localhost:3000        # 2 browser contexts: lobby, sync, investigation, reload mid-decision, traffic leak check
```

`CLOUDBORNE_TEST_SEED` makes every game on that server predictable and prints a warning. Never set it for real play. Set `E2E_SHOTS=<dir>` to save screenshots.

### Manual LAN checklist (physical devices)

1. Run `npm run build && npm start` on the host and note the LAN URL.
2. On a second device, open the LAN URL. The menu should load (if it doesn't, see *Network troubleshooting*).
3. Have both devices join. The host's lobby shows both names, and the second device shows "Waiting for … to start".
4. Start. The first player has 8 cards, the other 7; both see A 2 / R 2 / P 2 for each family and their Gold.
5. Host: recruit a Character and place a Scheme, then end the turn. The other device sees the Character, a face-down Scheme, the Gold changes, and its own turn begin with an automatic draw and income.
6. Second device: if it holds a Senate Intervention, investigate the Scheme. The host's screen shows the red decision panel; the second device shows who is deciding and cannot end its turn. Respond on the host and check both screens agree on the outcome.
7. Refresh the host's page while a decision is pending. The other device sees "Game paused"; after the reload the decision panel is back.
8. Turn off Wi-Fi on the second device for about 20 seconds. Within about 10 seconds its screen shows "Connection lost" with input disabled, and the host sees "Game paused". When Wi-Fi returns, it resynchronizes and the game resumes.
9. Try joining from a third device during the game. It should be refused with "A game is already in progress".
10. Host: **Back to lobby**, then **Start** again. Everyone gets a fresh deal.

## Known limitations

- Rules and balance are provisional (see `PROTOTYPE_RULES.md`). The equal-copy deck and 8-round score are for testing the loop, not balance.
- The reaction system is deliberately narrow: one response by the Scheme owner, no stack, no timers.
- One lobby per server. No spectators, host hand-over, or joining mid-game.
- All state is in memory. Restarting the server ends the game, and refreshing a hotseat page loses it.
- Hotseat privacy guards only against casual glances, and LAN traffic is plain HTTP on the local network. The Gold paid for a Scheme is public and hints at what it might be.
- Pausing on disconnect has no timeout. If a player never returns, the host uses **Back to lobby**.
- Physical multi-device LAN play hasn't been tested (see the checklist above). Automated checks use separate browser contexts on one machine.
- Card text on the 3D table is small; the HTML inspector is the readable view. Art is generated placeholder geometry.
