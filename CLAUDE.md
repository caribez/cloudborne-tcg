# Card game prototype

## Project intent
Cloudborne: a browser-based political and dynastic card game for 2–4 human players, playable in hotseat and LAN.
The current build is a playable demo (standings, Gold, Characters, hidden Schemes with reactions, marriage, 8-round provisional scoring).
The rules are being workshopped. Optimize for quick rule changes, readable interactions, and reliable shared state.

## Scope and references
- Foundation brief: `docs/prototype-brief.md`. Design concept (long-term vs. demo): `docs/political-game-design.md`.
- Historical card catalog: `docs/card-catalog.md` is the primary reference for historical card designs, alternative versions, flavor texts, planned distributions, and future card expansions.
- Keep historical designs, provisional demo rules (`PROTOTYPE_RULES.md`), and actual implemented behavior (`src/shared/` and tests) clearly separated. The historical catalog is not an implementation specification or an approved balance pass.
- Consult the catalog before designing, modifying, or introducing cards. Preserve historical variants and source distinctions; do not silently merge versions, invent missing effects, or resolve open design questions without approval.
- Do not implement or activate additional historical cards unless explicitly requested. Document selected historical versions and any provisional deviations. Note that adding definitions to the current card arrays automatically adds copies to the demo deck.
- If historical designs, documented demo rules, and implemented behavior disagree, identify the discrepancy rather than silently changing gameplay.
- Keep the exact current rules and explicitly provisional assumptions in `PROTOTYPE_RULES.md`.
- When the user changes a rule, update that document and affected behavior/tests together. Later approved decisions supersede earlier provisional rules.
- Do not invent scoring, victory conditions, card effects, or balancing unless requested. Mark demo-only decisions as provisional.
- Out of scope unless requested: accounts, databases, matchmaking, AI opponents, physics, mixed hotseat/LAN seats, a generic rules editor or card scripting language.

## Stack and commands
Use strict TypeScript, Vite, Three.js, HTML/CSS, Node.js, Socket.IO, and Vitest.
Keep dependencies modest; use the repository's package manager and lockfile. For a new repository, use npm.

When scaffolding, provide these scripts:
- `npm run dev`: start browser development and the LAN backend together.
- `npm run build`: build the browser client and server.
- `npm start`: serve the built client and multiplayer on one LAN-accessible origin.
- `npm run typecheck`: check all client, shared, and server TypeScript.
- `npm test`: run automated tests once.

These are target scripts until implemented. Check `package.json` before using them and document actual prerequisites in the README.

## Architectural constraints
- Maintain one framework-independent game core for both modes.
- Keep setup, validation, and state transitions separate from rendering and transport.
- Use serializable state and typed actions. Inject randomness at setup/shuffle boundaries so tests can reproduce behavior.
- Distinguish card definitions from unique card instances. Every instance must occupy exactly one location.
- Store table positions in logical coordinates, independent of camera and viewport.
- Derive a player-specific view from canonical state. Presentation consumes that view and submits commands; it encodes no rules (playability and legal targets come from the view).
- Distinguish the active player from the player with decision priority (reaction windows). Hotseat handoffs follow decision priority.
- Keep card data and rule functions in small, clearly named modules. Avoid speculative abstractions.
- Animation must follow accepted state changes and must not determine game outcomes.

## Multiplayer and privacy
- Hotseat runs the shared core locally without a multiplayer connection.
- In hotseat, hide the outgoing hand, private previews, and animations immediately at handoff. Reveal the next hand only after explicit confirmation.
- In LAN mode, show the local player's hand regardless of whose turn it is.
- The LAN server owns the game state and validates every command using the authenticated session's seat.
- Filter information before sending it. Never send opponents' private cards, hidden Scheme identities or targets, deck order, future income, shuffle seeds, or reconnect credentials in public payloads, logs, or errors. Instance ids stay opaque.
- Test-only hooks (`prepareGame`, `?e2e&seed=` for hotseat, `CLOUDBORNE_TEST_SEED` for the host) must never be reachable by LAN clients.
- Prefer complete filtered snapshots for this small turn-based prototype.
- Deduplicate command IDs, validate revisions, and acknowledge acceptance or rejection.
- Disable input while disconnected; resynchronize before accepting new input. Do not replay stale buffered commands.
- Bind reconnect tokens and lobby host privileges to session identity.
- Use the page's origin for sockets. Proxy Socket.IO HTTP and WebSocket traffic during development.
- Only the host needs Node.js; joining players use browsers.

## Presentation
Use simple 3D cards and a readable tabletop camera. Use HTML/CSS for interface controls and card inspection.
Prioritize click-to-select/place, readable hands, clear turn/connection status, and helpful rejection messages.
Keep assets local and use generated placeholders during this phase. Add visual polish after the interactions work.

## Working method
- Inspect existing code and relevant documents before changing them. Preserve unrelated work.
- Give a short plan for substantial tasks, then implement in small working increments.
- Choose ordinary implementation details independently. Ask when a missing decision changes intended gameplay or scope.
- Keep work focused on the current request. Avoid unrelated refactors and premature frameworks.
- When working on the initial build, progress through core, hotseat, LAN, and verification. Keep both modes using the shared core.
- Consult official documentation when a dependency API is uncertain.
- Keep this file concise. Put changing rules, detailed requirements, and setup instructions in their respective documents.

## Verification and handover
Run type checking, relevant tests, and the build before reporting implementation complete.
Test observable behavior: 2–4 player setup, action legality, economy, Scheme timing and reactions, marriage, game end, card conservation, hidden-information filtering, duplicate commands, and reconnect/seat recovery. Use `test/fixtures.ts` for deterministic card situations.
Check that the same initial state and actions yield equivalent results through both mode adapters.
Exercise hotseat handoff and LAN synchronization in separate browser contexts when tooling permits.
Distinguish automated checks, manual checks, and unverified behavior. Do not claim physical LAN testing unless performed.
Finish with a brief account of changes, verification, and remaining limitations. Update setup/rule documentation when behavior changes.
