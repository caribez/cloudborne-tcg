# Prototype implementation brief

Saved from the initial request so later work can refer to it. Current rules live
in `PROTOTYPE_RULES.md`; approved rule changes supersede the temporary rules below.
The placeholder rules and free table placement described here have since been
replaced by the Cloudborne demo rules (see `PROTOTYPE_RULES.md` and
`docs/political-game-design.md`); the architecture, hotseat and LAN requirements still apply.

## Goal

A browser-based card-game prototype for 2–4 human players. The rules are still
being workshopped. The goal is a pleasant, usable environment for testing
card-game ideas, with a hand, a draw pile, and cards placed on a shared playing
area. Keep rules easy to replace as the design develops. Implement working
hotseat and LAN multiplayer.

## Technology

- TypeScript with strict checking; Vite for the client; Three.js for a simple 3D tabletop and 3D card objects; HTML/CSS for menus, buttons, status messages and readable card inspection; Node.js with Socket.IO for the LAN server; Vitest for game-core and networking tests.
- Current compatible stable packages, a committed lockfile, modest dependencies.
- Fixed or gently adjustable tabletop camera, simple lighting, thin card geometry with distinct fronts and backs, locally generated placeholder textures. Legibility and responsive interaction over effects.

## Architecture

1. Game core: serializable state, setup, action validation, turn progression, rules, transitions.
2. Player views: public and private information each player may see.
3. Session adapters: in-browser authority for hotseat, server authority for LAN.
4. Presentation: Three.js scene, animation, pointer input, HTML interface.

Both modes use the same core and action types. No Three.js objects, DOM references, sockets or animation progress in game state. Presentation consumes a player view and submits intentions. Card definitions are distinct from card instances with unique IDs; locations are explicit; table placement uses logical coordinates and rotation. Sample cards, deck composition, hand size and provisional rules live in small, obvious modules; plain functions, no rules language or plugin framework.

## Provisional rules (temporary)

- 40 simple placeholder cards; 2, 3 or 4 players; deal five cards each; the rest is a face-down draw pile.
- On their turn a player may draw at most one card, play at most one card face up onto the shared table, and end their turn. Drawing and playing are optional and may happen in either order.
- Drawing from an empty pile is unavailable and leaves state unchanged.
- Turns advance in seat order. No scoring or win condition; repeated turns and restarting suffice.

## Table interaction

Local (LAN) / active (hotseat) hand along the bottom; other players' names, hand counts and the active player; draw-pile count; clear End Turn button; select a card then click the table to place it; hover/selection feedback; enlarged inspection; brief draw/play animations; bounded play area with logical coordinates and a separate snapping/placement helper; overlapping cards remain inspectable; Escape or a UI control cancels selection; plain-language rejection messages; correctness independent of animation timing; clean desktop resizing; restrained visual style without external art.

## Hotseat

2–4 players on one computer; player count and names set before starting; only the current hand shown; at turn end hide the outgoing hand and dismiss previews/animations immediately; opaque "Pass to [player name]" screen; next hand revealed only after explicit confirmation; Hide Hand control; no leaks through hover, keyboard or animations; works without a backend once loaded. Protection is against casual viewing.

## LAN

One host computer runs the Node.js server; every player (host included) uses a browser via the host's LAN URL. One lobby/game per server; names, available seats, host Start control, shared lobby view. Host = first joiner of a new lobby, bound to their session; only they start/restart. 2–4 players; occupied seats protected. Server authoritative over shuffling, dealing, turns, ownership and placement; commands validated using session identity. Each player receives only their own hand plus public information — never hidden identities, deck order or shuffle seeds; no "broadcast and hide". Complete filtered snapshots after accepted actions. Command IDs, acknowledgements, revisions; deduplicated retries; stale commands never applied twice. Input disabled while disconnected; resynchronize from a filtered snapshot after reconnecting; opaque reconnect token (sessionStorage) recovers the seat; connection status shown; game pauses during a disconnect. In-memory sessions.

Out of scope: mixed local/remote seats, discovery, matchmaking, accounts, host migration, databases.

Practical setup: one dev command; Vite proxies Socket.IO HTTP and WebSocket; build/start serve client and Socket.IO from one origin and one LAN port; bind to the LAN interface and print localhost and LAN URLs; derive the socket address from the page origin; only the host needs Node.js; assets bundled locally; document same-network setup, firewalls and client-isolated networks.

## Validation and handover

Test setup for all player counts; legal/illegal actions, turn limits, empty pile; card conservation; no hidden-information leaks in snapshots, errors or logs; retries cannot draw/play twice; reconnection restores seat and view; hotseat/LAN equivalence; a full lobby rejects a fifth player. Check the hotseat handoff and LAN synchronization in separate browser contexts; if physical LAN devices are unavailable, say so and give a manual checklist. Provide a README (setup, LAN instructions, controls, architecture, where to edit cards and rules) and a short PROTOTYPE_RULES.md.
