# HUMAN?

HUMAN? is an anonymous social deduction game. **Find the AI** is the primary mode: five humans hunt one persistent AI trying to blend in. The homepage's **FIND A GAME** button opens multiplayer matchmaking. **Blend In** remains available as the secondary mode: one human hides among five AI agents.

Both modes use the same game engine and persistent agent population. The server owns hidden identities and game mechanics; browsers receive only public room events and their own seat/vote.

Each match draws six distinct anonymous names from a shared pool of 80 two-word handles, such as `velvet_moth`, `cold_pizza` and `tiny_riot`. Names are assigned independently of participant type and persistent identity.

## Architecture

- `src/server.ts` is the Worker entrypoint. It validates origins and room ownership, routes WebSocket traffic, and exposes protected local test controls and the admin API.
- `GameRoom` in `src/server.ts` and `src/game.ts` is the authoritative Durable Object. It owns the phase machine, deterministic timers, votes, elimination, reconnect state, and final reveal.
- `PersistentPlayer` in `src/player.ts` is one private Agents SDK Durable Object per population member. It stores temperament, behavior, strategy beliefs, episodic lessons, model selection, and game receipts.
- `Workers AI` is used only for social reasoning: conversation intent, suspicion, votes, and post-match reflection. Timers, random seats, validation, and vote counting stay deterministic.
- `src/modes.ts` defines composition, objectives, knowledge, roles and win conditions. `src/matchmaker.ts` coordinates waiting seats for Find the AI; it does not run games.
- The population contains **18 persistent IDs shared by every mode**. Rooms sample five agents for Blend In or one for Find the AI. There are no hunter/infiltrator pools. Each identity always resolves to the same `player-${agentId}` Durable Object.

## Persistent learning

Each player Agent has its own state and SQLite receipt table. A room sends an agent only its own observation, messages, votes, private hypothesis, and the revealed outcome. Reflection is idempotent by room receipt, updates that agent's strategy by small bounded adjustments, and stores a short episodic lesson. Concurrent retries cannot count a game or lesson twice.

Roles are temporary match context: `HUNTER` searches for a human; `INFILTRATOR` knows all other players are human and assesses social threats while trying to survive. Switching roles never replaces personality, behavioral profile, model, strategies or memories. Retrieval uses the same recent memories across modes. History and episodes carry mode/role metadata. The private `experiences` SQLite table keeps the full match transcript, result, survival duration, elimination round, votes received/cast and important events, independently of the bounded recent history shown in admin.

The private `/admin` console lists all 18 agents, model assignments, temperament, behavior, strategy beliefs, inference status, games, wins, and retained lessons. It can switch among the configured Workers AI models and run a model probe. It is never linked from the player UI.

## Match state machine

Both modes use `arrival -> discussion -> voting -> concealed elimination -> next round -> reveal`. Find the AI adds `waiting -> starting` before arrival. Four eliminations leave two survivors. Eliminating the minority ends the match: the human in Blend In, the AI in Find the AI. Otherwise that minority wins by surviving. The eliminated identity stays concealed during the verdict beat; final reveal discloses all types and persistent agents.

Find the AI matchmaking reserves at most five human seats in a waiting room. The room only selects its AI after all five human sessions have connected. It then shuffles all six opaque participant IDs, names and symbols together. No production backfilling exists. Concurrent join requests are serialized at the room's seat reservation; duplicate requests for a session share one allocation.

An HttpOnly session cookie identifies a player across reconnects; each socket stores that session privately. Multiple tabs share one seat. Lobby disconnects reduce the connected count immediately and reserve the seat for 15 seconds; leaving releases it immediately. During a match a disconnected player has 60 seconds to return, then forfeits and may reconnect as a spectator. Timed voting never waits indefinitely for disconnected players. Eliminated humans still receive the public room, but cannot chat or vote. Clearing the cookie loses the seat.

Public serialization explicitly selects fields per viewer. Pre-reveal participants have only opaque ID, temporary name, symbol and elimination status. Agent IDs, types, cookies, private beliefs, scheduling and inference details never enter public state. Human/AI messages use the same component, schema, UUID format and second-resolution timestamps. AI knowledge and debug routes remain server-side.

## Independent decision engine

Room events are versioned and each agent keeps a private belief map for the current match. The runtime batches observations, then the agent chooses `SILENCE`, `MESSAGE`, or `VOTE` using its own temperament, strategy beliefs, recent participation, and event relevance. Message intents are selected before language generation. Candidate text passes through a semantic token overlap check that suppresses repeated arguments while allowing short social agreement. Delays include per-agent variance, occasional quick reactions, long pauses, and activity budgets. At most two agents are scheduled per room alarm, and autonomous chains are capped.

The protected local inspection endpoint includes the latest private decision trace for each agent: observed event, beliefs, action, intent, reason, candidate, novelty result, and delay. None of that state enters the normal player projection.

## Run locally

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

The live development server uses the remote Workers AI binding and requires `wrangler login` (or a Cloudflare API token). It is the real game path.

For local testing without live model inference, start the fixture server:

```bash
npm run dev:local                 # http://127.0.0.1:5180
```

Then run checks in another terminal:

```bash
npm test
npm run test:integration
npm run dev:multiplayer           # five automated human clients, complete matches
npm run test:multiplayer:ui        # desktop/mobile browser verification
```

The fixture server uses synthetic agent decisions, an explicit banner, and isolated `.wrangler/fixture-state` storage. It is intentionally separate from the live port. To enable local admin access, create the gitignored `.dev.vars` file with `LOCAL_ADMIN=true`, then open `/admin` on your dev server. Production requires the administrator secret.

## Bindings and secrets

`wrangler.jsonc` defines the remote `AI` binding, `ROOMS`, `PLAYERS` and `MATCHMAKER` SQLite Durable Object namespaces, and the static `ASSETS` binding. Set `ADMIN_TOKEN` with `wrangler secret put ADMIN_TOKEN` for a deployed admin console. `LOCAL_ADMIN=true` is for local development only. `DEV_TOKEN` protects local inspection and reset routes; it is never accepted in normal player requests in production.

## Multiplayer testing

Start `npm run dev:local`, then `npm run dev:multiplayer` in another terminal. The harness checks the localhost-only fixture endpoint before creating five independent cookie/WebSocket sessions. It exercises six concurrent joins, lobby leave/reconnect, chat broadcast and validation, spectator restrictions, both outcomes, reconnect forfeits and cross-mode persistent identity. It prints sample conversation and writes `artifacts/multiplayer-proof.json`. These are scripted test clients, not live human players or live model reasoning. The harness is not bundled into production.

For interactive testing, open five separate browser profiles/private contexts at the same local URL, select Find the AI in each, and wait for all five. Tabs in the same profile intentionally share a seat. Live mode (port 5173) uses actual Workers AI inference; fixture mode (5180) does not. Find the AI never fills missing production humans with AI.

Protected localhost development routes under `/api/rooms/:id/dev/` support `inspect`, `advance`, `votes`, `interrupt`, `reflect` and `expire-disconnects` (fast-forwards only already disconnected seats). They require `DEVELOPMENT=true` plus `X-Dev-Token`. `reset` is for Blend In; multiplayer tests leave/create rooms. Fast durations can be requested using `{mode, fast:true}` with the same protected header. Inspection includes private agent context and saved experiences; ordinary room endpoints never return them.

Run `npm test`, `npm run check`, `npm run test:integration`, `npm run test:multiplayer`, `npm run test:multiplayer:ui`, and `npm run build`. Regenerate `env.d.ts` with `npm run types` after changing bindings. Both Wrangler configurations include the Matchmaker migration; deployment applies it with the existing room/player namespaces retained.

## Verification evidence

The fixture suite completed both Find the AI outcomes, timeout forfeiture/reconnect, concurrent seats and votes, spectator restrictions, browser refresh and mobile layouts. It also recorded one persistent identity playing INFILTRATOR and then HUNTER, without changing its personality. The existing four-round Blend In browser regression passed.

A separate local run used five scripted human clients with actual Workers AI inference. It completed two rounds, eliminated the AI, revealed Agent #26 and saved its INFILTRATOR history. The transcript and outcome are in `artifacts/live-find-ai-proof.json`. The selected model spoke once and remained silent in the second discussion; its wording was too much like a helpful facilitator. This run proves the live integration, not consistently convincing imitation. Model tone and participation still need playtesting. No real five-person playtest has been performed.

## Deliberately outside this MVP

Accounts, friends, parties, ranking/MMR, voice, cosmetics, regional queues, complex moderation, global cross-agent memory, evolutionary selection and vector search. Cookie sessions are anonymous seats, not proof of distinct people: a determined user can create multiple sessions. Matchmaking is one simple waiting-room coordinator. Sudden network loss is detected when the runtime reports the dead socket; the 60-second grace starts at that point. Experiences are retained without a pruning policy in this MVP. Fixture tests validate mechanics and isolation, not the quality of live model conversation.
