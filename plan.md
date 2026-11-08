# VECTOR//RUN — Online backend plan

**Status:** The product scope is approved by the user. Backend activation and live multiplayer hosting are not yet approved or available; no infrastructure is enabled.

## Approved scope

Add player accounts and profiles with cross-device cloud saves; online global leaderboards; real-time online races with matchmaking; and opt-in sharing/uploads of ghost replays and race data. Keep the existing Three.js racer, manual driving, local AI field and complete offline solo mode available as a resilient fallback.

## Architecture and decisions

### Identity and cloud saves

Use the platform's supported Manus OAuth account flow by default, with the project's authenticated identity as the only owner key. Use the official Three.js auth installer and protected server procedures; never accept client-supplied account/player IDs or build a custom password store. Store profile and versioned game-save data in the project database, keeping current local-browser saves available while offline. Design a deliberate conflict/merge path before syncing pre-existing local saves; never silently overwrite a newer remote or local save.

### Global leaderboards

Use the official account-mode leaderboard integration and immutable game board/rules identifiers for the existing circuit, route and race-format records. Tie writes to the authenticated server-side account, validate payload shape and score/time bounds, and preserve local records when the service is unavailable. The reference leaderboard accepts client-reported scores and is therefore casual, not cheat-proof; do not describe it as verified competition unless game-specific server/replay validation is implemented.

### Ghost and replay sharing

Keep replay/ghost payloads bounded and separate from Git. Authorize uploads on the server, use runtime presigned object storage when that capability is available, and store ownership, sharing/privacy choice and stable object keys in the project database. Sharing is explicit/opt-in; default new runs to private. The runtime storage API has no object-list or object-delete operation, so design application indexing and honest soft-delete/retention behavior and do not promise physical erasure without a verified deletion path.

### Real-time multiplayer and matchmaking

Adapt the approved Three.js Ring Out multiplayer starter's Node/WebSocket transport to the racing game; do not import its Ring Out gameplay. Keep local vehicle prediction responsive. The online server owns rooms, seats, matchmaking, match phases and final match results, validates message shape/rate/speed/bounds and ignores stale revisions. Preserve local AI racing when offline or unconnected. Use a versioned room protocol, reconnect/disconnect handling and honest unavailable states. Global ranked times still need server-side rules/replay verification beyond a relay; do not trust a client result as cheat-proof.

### Serving and data safety

Use a hybrid Webdev release: keep the Three.js static build and route `/api/*` to the installed account/leaderboard backend. Multiplayer's WSS service is separate and needs its own selected Cloud Computer, TLS/WSS endpoint and configured client bootstrap. Use project-specific additive database migrations and preserve user data. The managed database is shared by development and production; tests must not write/delete live player data. The current app continues to work without the backend, and no page should claim a user is signed in, a save uploaded, a rank earned, or a match connected unless the real service confirms it.

## Project map

- `src/main.ts` and the landing/garage UI: login state, cloud-sync status, online leaderboard panels and online-mode entry while retaining local flow.
- `src/engine/save.ts`: versioned local persistence and conflict-aware account sync.
- `src/net/`: multiplayer client transport, protocol, snapshots, retry/disconnect and upload/read API clients.
- `server/`: installed authenticated Webdev backend, game procedures and the separate WebSocket/matchmaking service with its own lockfile.
- `server/migrations/`: additive profile, leaderboard and replay-index schema changes.
- `public/multiplayer/bootstrap.json`: verified WSS URL and shared protocol/build identifier; no secrets.

## Required gates before implementation/deployment

1. The project currently reports managed `server:false`, `database:false`, no deployment, and no selected Multiplayer Cloud Computer. Game feature enablement is one-way; server/database and multiplayer hosting may incur charges.
2. The available-device inventory currently contains only Manus Sandbox, not a Cloud Computer. Before multiplayer hosting, the owner must make a Cloud Computer available and choose it through the project Multiplayer panel. Do not buy one or create an external account on the owner's behalf.
3. Before enabling the managed backend, obtain the user's explicit confirmation for the one-way server/database setup and possible usage charges. Read the current Webdev config, merge its complete existing fields, then verify provisioning and runtime sync before installing integrations.
4. No production public deployment is requested. A project checkpoint or working Preview is not proof of live OAuth, data isolation, uploads, global ranks or public WSS matchmaking.
