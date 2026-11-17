# Cloudborne: table prototype

A browser card-game sandbox for 2–4 players with a hand, a face-down draw pile and a shared 3D table. It supports **hotseat** (one screen) and **LAN** (one browser per player) play. The rules are temporary placeholders. See [`PROTOTYPE_RULES.md`](PROTOTYPE_RULES.md).

## Requirements

- Only the **host** computer needs [Node.js](https://nodejs.org/) **22.12 or newer** (npm included).
- Players need a current desktop browser with WebGL (Chrome, Edge, Firefox, Safari).
- Play doesn't use the internet. Everything is bundled locally, including card art, which is generated in the browser.

## Commands

```bash
npm install          # once
npm run dev          # development: Vite (http://localhost:5173) + Socket.IO backend, hot reload
npm run build        # build client (dist/client) and server (dist/server)
npm start            # serve the built game + multiplayer on one port (default 3000)
npm run typecheck    # strict TypeScript for client, shared and server code
npm test             # Vitest: game core, views, LAN server, hotseat/LAN equivalence
```

`PORT=4000 npm start` changes the port. `HOST=127.0.0.1 npm start` keeps the server off the network.

## Playing

### Hotseat (one computer)

Open the page, choose **Hotseat**, pick 2–4 players and names, and start. After the page has loaded, hotseat needs no server connection.

- Only the current player's hand is shown. **End turn** immediately hides it and shows an opaque **"Pass to …"** screen. The next hand appears only after that player clicks **"I'm …: show my hand"**.
- **Hide hand** (top bar) covers your hand at any time.
- Privacy guards against casual glances at a shared screen. It doesn't stop someone determined to cheat.

### LAN (one browser per player)

1. On the host: `npm install`, `npm run build`, `npm start`. The terminal prints URLs such as:
   ```
   This computer:  http://localhost:3000/
   LAN:            http://192.168.1.23:3000/
   ```
2. The host opens the localhost URL, and everyone else opens the **LAN URL** in their browser. All of them choose **LAN game** and enter a name. The lobby also shows the LAN URL.
3. The first player to join becomes the **host** and is the only one who can **Start**, **Restart game** or go **Back to lobby**. Players can switch to a free seat with **Sit here**. A fifth player is turned away.
4. During play, every player always sees their own hand.

**Reconnecting:** if a player refreshes or briefly loses the connection, the game pauses for everyone with a banner naming who's missing. Input is disabled until the server resends that player's current view. Reopening the **same browser tab** restores the seat automatically. The tab keeps an opaque token in `sessionStorage`, so a new tab or another browser counts as a new player. Game state lives only in the server's memory, so stopping `npm start` ends the game.

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
| Inspect a card | Hover it in your hand or on the table. The enlarged card appears at the top right |
| Select a card to play | Click it in your hand (click again to deselect) |
| Place it | Click a spot on the table. A green ghost shows where it will land (red means outside the area) |
| Rotate before placing | **Q** / **E** (15° steps) or the ⟲ ⟳ buttons |
| Cancel selection | **Esc** or **Cancel** |
| Draw | Click the draw pile, the **Draw card** button, or press **D** |
| End your turn | **End turn** |
| Overlapping cards | Click a pile to pin the inspector, click again to cycle through it, or pick a card from the list. **Esc** closes it |
| Zoom | Mouse wheel (limited range) |

Rejected actions explain the reason in a red message, for example "You have already drawn a card this turn."

## Where to edit things

| What | File |
| --- | --- |
| Card names, suits, values, text | `src/shared/cards.ts` |
| Deck composition (which cards, how many copies) | `src/shared/deck.ts` |
| Player counts, hand size, per-turn limits, legality checks, turn order | `src/shared/rules.ts` (`PROVISIONAL_RULES` and `check*` functions) |
| What an action does to the state | `src/shared/engine.ts` (`applyAction`) |
| Table size, snapping, rotation step, placement policy | `src/shared/placement.ts` |
| What each player may see | `src/shared/views.ts` |
| Log wording | `src/shared/logText.ts` |
| Card artwork (generated) | `src/client/render/cardArt.ts` |

To add an action, such as discarding, add a variant to `GameAction` in `src/shared/types.ts`, a `check…` function in `rules.ts`, a `case` in `applyAction`, and a branch in `parseAction` so the LAN server accepts it. Then call it from the UI. Networking needs no other changes.

## Architecture

```
src/
  shared/            framework-free game core, used by both modes
    types.ts         serializable GameState, GameAction, rejections
    cards.ts deck.ts card definitions vs. instances (unique ids like c017)
    rules.ts         PROVISIONAL rules: limits, legality, turn order
    engine.ts        setupGame (injected RNG), applyAction, conservation check, parseAction
    placement.ts     logical table bounds, snapping, rotation
    views.ts         playerView / publicView: what one viewer may see
    protocol.ts      LAN wire types + validators
  server/            LAN authority (Node)
    authority.ts     lobby, seats, host, sessions, command ids/revisions, pause, filtered snapshots
    socketServer.ts  Socket.IO transport: binds sockets to session tokens
    staticFiles.ts   serves the built client
    main.ts          one-port server, prints localhost/LAN URLs
  client/
    session/         hotseatSession.ts (in-browser authority), lanClient.ts (socket adapter)
    render/          tableScene.ts (Three.js table, hand layer, picking, tweens), cardArt.ts
    ui/              gameScreen.ts (shared HUD/controller), hotseatMode.ts, lanMode.ts
```

- **One core, two authorities.** Hotseat runs `applyAction` in the browser through `HotseatSession`. LAN runs the same function on the server through `LanAuthority`. Both use the same `GameAction` types, and a test checks that identical seeds and action scripts give identical views.
- **State is plain data.** It holds instance ids in explicit zones (`drawPile`, `hands[seat]`, `table`) plus an `instanceId → definition` map. Table cards store logical `x`, `y`, `rotation` and stacking `order`. No Three.js, DOM, socket or animation data lives in the game state.
- **Presentation only sees `PlayerView`s** and submits intentions. Animations are cosmetic tweens that can be finished instantly. Hit-testing uses logical layout, not animating meshes, so input never depends on animation timing.
- **LAN privacy.** The server builds a separate snapshot for each recipient from `playerView`. Opponents' hands appear only as counts. Deck order, the shuffle seed (crypto-random, never stored in state) and other players' reconnect tokens are never sent. Rejection messages are identical for "someone else's card" and "nonexistent card".
- **Commands** carry a client-generated id and the revision they were based on. The server stores each session's recent results, so a retry with the same id gets the original answer without being applied again. A command based on an old revision is rejected as stale, and the server resends the sender's view. While disconnected, the client sends nothing and drops Socket.IO's offline buffer. It accepts input again only after a fresh snapshot.
- **Hotseat privacy.** At handoff the scene receives a *public* view, so the outgoing hand's meshes and data are removed. At the same moment tweens are finished, the inspector and selection are cleared, input is locked, keys are swallowed, and an opaque overlay is shown.

### Implementation choices

- Seats are compacted when the game starts, so lobby seat *n* is game seat *n* during play.
- Revisions keep increasing across restarts, so commands from a previous deal are always stale.
- A second tab presenting the same token takes over the seat, and the old tab is told why.
- The hand is drawn in a separate orthographic layer, so it stays legible at any window size. The table camera is fixed (zoom only) and refits on resize.
- `?e2e` in the URL exposes card screen positions on `window.__cloudborne` for the browser smoke scripts. It shows positions only, never hidden cards.

## Testing

`npm test` runs the automated suites:

- `test/core.test.ts`: setup for 2/3/4 players, legal and illegal actions, turn limits, seat order, empty draw pile, card conservation over a long random game, immutability, placement and payload validation.
- `test/views.test.ts`: views contain only the viewer's hand. Public views, the log and rejection messages leak nothing.
- `test/lan.test.ts`: a real Socket.IO server and clients covering host-only start, the 5th-player rejection, occupied seats, session-bound seats, filtered snapshots over a whole game, retried draw/play applied once, stale revisions, pause, refresh/reconnect with the token, duplicate tabs, lobby grace period and host restart.
- `test/equivalence.test.ts`: the same seed and actions give identical views and state through hotseat and LAN, for 2, 3 and 4 players.
- `test/hotseat.test.ts`: the hotseat adapter.

Optional browser smoke checks use Playwright, which isn't a project dependency. Install it with `npm i -D playwright && npx playwright install chromium`, then run them against a running server:

```bash
node scripts/e2e-hotseat.mjs http://localhost:3000   # handoff privacy, limits, overlap inspection, resize
node scripts/e2e-lan.mjs http://localhost:3000       # 2 browser contexts: lobby, sync, refresh/pause, traffic leak check
```

Restart the server before `e2e-lan.mjs` so the lobby starts empty.

### Manual LAN checklist (physical devices)

1. Run `npm run build && npm start` on the host and note the LAN URL.
2. On a second device, open the LAN URL. The menu should load (if it doesn't, see *Network troubleshooting*).
3. Have both devices join. The host's lobby shows both names, and the second device shows "Waiting for … to start".
4. Start. Each device shows its own five cards and only a card count for the other player.
5. Host: play a card, draw, and end the turn. The other device sees the card at the same table position, the counts update, and its turn begins.
6. Refresh the second device's page. The host sees "Game paused". After the reload, the second device has the same hand and the game resumes.
7. Turn off Wi-Fi on the second device for about 20 seconds. Within about 10 seconds its screen shows "Connection lost" with input disabled, and the host sees "Game paused". When Wi-Fi returns, it resynchronizes and the game resumes.
8. Try joining from a third device during the game. It should be refused with "A game is already in progress".
9. Host: **Back to lobby**, then **Start** again. Everyone gets a fresh deal.

## Known limitations

- One lobby per server. No spectators, host hand-over, or joining mid-game.
- All state is in memory. Restarting the server ends the game, and refreshing a hotseat page loses it.
- Hotseat privacy guards only against casual glances, and LAN traffic is plain HTTP on the local network.
- Pausing on disconnect has no timeout. If a player never returns, the host uses **Back to lobby**.
- Physical multi-device LAN play hasn't been tested yet (see the checklist above). Automated checks use separate browser contexts on one machine.
