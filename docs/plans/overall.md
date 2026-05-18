# snek - Phased Ticket Plan

## 1. Context

**What we're building**: `snek`, a browser-based snake.io / slither.io clone. Mobile-first (touch primary, keyboard secondary). Will live at `mccarrison.me/snek`. Same product shape as worms: friend texts a link, opens in browser, plays.

**Why now**: worms is at M6; engine knowledge (Phaser 3, Vite, Cloudflare Workers + Durable Objects, hand-rolled WS protocol, 20Hz authoritative tick loop) transfers cleanly. snek is mechanically simpler than worms (no terrain, no physics engine, no turns, no weapons), so it exercises the same stack against a different game shape.

**Intended outcome**:
- Phases 0-4: playable solo + bots game, mobile-first, deployable static client. Target: ~10 working days (~2 weeks calendar).
- Phases 5-7: multiplayer with rooms, prediction, interpolation, leaderboard. Target: another ~12 working days. **Honest total: 3-5 weeks calendar**.

**Solo-first reasoning** (already locked with Scott): bots are reusable as MP room-fillers, the game is "fun" by end of Phase 3 without any backend, and netcode complexity is easier to design once the deterministic sim works locally.

**Crib policy** (Scott's explicit ask): no forks, no clones. Pull specific files/functions from reference repos, rewrite in our TS style, attribute the source in a comment at the top of the destination file, track in `NOTICE`.

---

## 2. Stack Decisions (locked)

| Concern | Choice | Notes |
|---|---|---|
| Renderer | Phaser 3.90 | Same as worms; reuse main.ts boot patterns. |
| Language | TypeScript 5.x, strict | Same tsconfig as worms verbatim. |
| Build | Vite 6 | Same vite.config.ts shape, `base: "/snek/"`. |
| Lint/format | Biome 1.9 | Same config as worms. |
| Server | Cloudflare Workers + Durable Objects | Reuse `worker/` layout, `wrangler.toml`, asset-binding pattern. |
| Transport | Native WebSocket, JSON for Phase 5, binary in Phase 6 if profiling demands | |
| Physics | None. Hand-rolled circle/circle + circle/segment collision. | Drop planck (overkill). |
| State machines | None. Plain switch on enum. | Drop xstate (snek state graph is tiny). |
| Spatial structure | Spatial hash grid from Phase 1 onward (used everywhere by Phase 3) | Bucket ~80px (~head diameter * 4). |
| Node | 20+, pinned via `.nvmrc` | Verbatim from worms. |
| Deploy | Cloudflare Pages (static) + Workers (server) | `npm run deploy` does `build` then `wrangler deploy`. |
| CI | GitHub Actions: typecheck, lint, build, test | Verbatim shape from worms `.github/workflows/ci.yml`. |

**Drops vs worms** (explicit): planck, xstate, Aseprite asset pipeline, `src/weapons/`, `src/terrain/`, `src/state/turnMachine.ts`, `src/state/turnArbiter.ts`, `worker/src/sim/` (worms-specific), `worker/src/turnArbiter.ts`.

---

## 3. Repo Conventions (mirror worms)

- **CLAUDE.md** at root from PR 1 (mission, target platforms, stack, conventions, pick-up ritual, references by phase).
- **No em dashes anywhere**. Regular hyphens only.
- **Mobile-first / touch-first mandate**: any plan that ships keyboard-only gameplay blocks merge. Drag-from-anywhere = direction vector relative to head; second-touch (or hold) = boost.
- **Plans live in repo** at `docs/plans/phase-N-<shortname>.md`. Committed with the first PR of that phase.
- **GitHub issues are source of truth**. Milestones per phase (`Phase 0`, `Phase 1`, ..., `Phase 7`). Area labels: `area:client`, `area:server`, `area:netcode`, `area:art`, `area:infra`. Type: `enhancement` / `bug`.
- **Auto-merge**: docs/config/infra. **Hold for review**: game logic, netcode, user-visible behavior.
- **Skill invocations**:
  - `/frontend-design` for HUD, lobby, leaderboard, death screen (any UI epic).
  - `/security-review` before Phase 5 ships (WS auth, room codes, input sanitization).
  - `/review` for any PR touching netcode or wire format.
- **Tunables in `src/tuning.ts`**: head speed, body spacing, food spawn rate, bot count, boost cost, view radius, spatial hash bucket size. No magic numbers in game logic.

---

## 4. Reference Code Map

| Source | File | snek destination | Note |
|---|---|---|---|
| worms | `vite.config.ts` | `vite.config.ts` | Verbatim, base -> `/snek/`. |
| worms | `tsconfig.json` | `tsconfig.json` | Verbatim. |
| worms | `biome.json` | `biome.json` | Verbatim. |
| worms | `.nvmrc`, `.editorconfig`, `.gitignore`, `.gitattributes` | (same) | Verbatim. |
| worms | `package.json` scripts | `package.json` | Same shape; drop planck, xstate, dat.gui, canvas. |
| worms | `.github/workflows/ci.yml` | `.github/workflows/ci.yml` | Verbatim. |
| worms | `worker/wrangler.toml` | `worker/wrangler.toml` | Adapt: name=`snek-api`, route=`mccarrison.me/snek*`, DO class=`Room`. |
| worms | `worker/src/index.ts` | `worker/src/index.ts` | Adapt: matchmaker entry, code claim, WS upgrade. |
| worms | `worker/src/codegen.ts` | `worker/src/codegen.ts` | Verbatim. 4-letter alphabet (no I, O). |
| worms | `worker/src/room.ts` (alarm loop, drainInputs, broadcast, persistence, hibernation) | `worker/src/room.ts` | Strong adapt. Same shape; replace `Simulation` with `SnakeSim`. Drop turn arbiter. |
| worms | `worker/src/sanitize.ts` | `worker/src/sanitize.ts` | Verbatim (nickname validation). |
| worms | `src/net/wsClient.ts` (RoomHandle, joinRoom/createRoom) | `src/net/wsClient.ts` | Adapt: same RoomHandle shape, snek's own ClientMsg/ServerMsg. |
| worms | `src/net/reconnectLoop.ts` | `src/net/reconnectLoop.ts` | Verbatim (pure choreography). |
| worms | `src/net/client.ts` | `src/net/client.ts` | Adapt: thin NetClient. |
| worms | `src/debug/logger.ts` | `src/debug/logger.ts` | Verbatim. |
| worms | `src/tuning.ts` shape | `src/tuning.ts` | Same pattern, different fields. |
| owenashurst/agar.io-clone | `server/server.js` food balance, viewport culling | snek `worker/src/room.ts` broadcast | Cherry-pick algorithms only. |
| jondubois/iogrid | spatial hash impl | `shared/spatialHash.ts` | Steal bucket/query logic; rewrite in TS. Used by client AND server. |
| knagaitsev/slither.io-clone | `src/client/Snake.js` segment-chain follow | `src/snake/segments.ts` | Algorithm: head leads, segments trail at fixed spacing along recorded head path. |
| knagaitsev/slither.io-clone | mouse-angle direction math | `src/input/pointer.ts` | Algorithm: vec from head to pointer, normalize. Adapt for touch. |
| knagaitsev/slither.io-clone | death-to-pellets burst | `src/snake/death.ts` | Algorithm: on death, spawn N food along body path with jitter. |
| ClitherProject/Slither.io-Protocol | (docs only) | `docs/decisions/003-wire-format.md` | Reference for delta encoding + RLE minimap as inspiration. JSON until Phase 6. |

---

## 5. Phase Breakdown

### Phase 0 - Scaffolding (target: 1 day, ~7h)

**Done when**: cloning the repo + `npm install` + `npm run dev` shows a Phaser canvas at `localhost:5173/snek/`. CI green. `npm run deploy` puts a static build behind `mccarrison.me/snek/` via a stub Worker (no game logic yet).

**Issues**:

**0.1** - Initialize repo with worms-shape scaffolding (2-3h). `area:infra`, `area:client`.
- `npm run dev` boots, browser shows a centered colored rect rendered by Phaser at `/snek/`.
- `npm run typecheck/lint/build/test:run` all pass.
- No planck/xstate/dat.gui/canvas deps.
- Mobile viewport meta + portrait-blocker CSS.
- Refs: worms `vite.config.ts`, `tsconfig.json`, `biome.json`, `.nvmrc`, `package.json`, `index.html`, `src/main.ts` (minimal BootScene -> GameScene).

**0.2** - Commit CLAUDE.md and docs scaffolding (2h). `area:infra`.
- CLAUDE.md at root mirroring worms structure (sections: Mission, Target Platforms, Status, Stack, Conventions, Pick-up Ritual, Key Decisions, References).
- `docs/ROADMAP.md` lists 7 phases with one-line summaries.
- `docs/decisions/001-stack-choices.md` (why drop planck, xstate, hand-roll WS).
- README skeleton (what / how to run / how to deploy).
- No em dashes anywhere. Deps: 0.1.

**0.3** - GitHub Actions CI (1h). `area:infra`.
- `.github/workflows/ci.yml` running typecheck, lint, build, `test:run`. Green on scaffold.
- `node-version-file: .nvmrc`, `permissions: contents: read`.
- Ref: verbatim worms `.github/workflows/ci.yml` minus worker steps. Deps: 0.1.

**0.4** - Deploy static build to Cloudflare Pages at mccarrison.me/snek (2h). `area:infra`, `area:server`.
- `worker/wrangler.toml` defines `snek-api`, route `mccarrison.me/snek*`, `PATH_PREFIX=/snek`, ASSETS binding to `../dist`.
- `worker/src/index.ts` redirects `/snek` -> `/snek/`, otherwise `env.ASSETS.fetch`.
- `npm run deploy` from root = build + wrangler deploy from `worker/`.
- Live URL serves hello canvas.
- `/security-review` (touches deploy). Deps: 0.1, 0.3.

**Exit**: live URL works, CI green, conventions in place, ready to write `docs/plans/phase-1-solo-snake.md`.

---

### Phase 1 - Solo snake on single screen (target: 2-3 days, ~15h)

**Done when**: open snek in mobile browser, drag finger anywhere, snake follows toward drag vector, eats colored circles, body lengthens. Hit own body -> death -> tap to restart. Single 1280x720 viewport.

**Issues**:

**1.1** - Segment-chain snake (head + body kinematics) (4h). `area:client`.
- `src/snake/snake.ts` exports `Snake` with `update(dt, dirX, dirY)` and `segments[]` (first=head).
- Head moves at `tuning.snake.speed` px/s; segments trail at fixed `tuning.snake.spacing` along recorded head path (deque sampled every frame).
- Initial length 8 segments.
- Unit test: 1s of rightward input -> head advanced `speed` px, segment 1 trails by `spacing`.
- Ref: knagaitsev/slither.io-clone `src/client/Snake.js` segment trail (rewrite in TS).

**1.2** - Render snake with Phaser graphics (2h). `area:client`.
- `src/snake/snakeView.ts` consumes `Snake`, renders chain of overlapping `fillCircle` each frame.
- Head slightly larger, distinct color. Colors from `tuning.snake`.
- 60fps on desktop Chrome with 80-segment snake (manual FPS check).
- Mobile emulation sanity-check (iPhone 12). Deps: 1.1.

**1.3** - Touch + pointer input that steers snake (3h). `area:client`.
- `src/input/pointer.ts` exports `PointerSteering.update(headX, headY): {dirX, dirY}` (unit vec from head to pointer).
- Smooth turning at `tuning.snake.turnRateRadPerSec`; no instant 180.
- Touch-first: drag anywhere on mobile is steering. Arrow keys = bonus (desktop only).
- Tested on Chrome DevTools iPhone 12 emulation. Ref: knagaitsev/slither.io-clone mouse-angle math (atan2). Deps: 1.1, 1.2.

**1.4** - Spawn food pellets, detect snake-eats-food (3h). `area:client`.
- `src/food/foodSpawner.ts` keeps `tuning.food.targetCount` (e.g. 50) on viewport, respawns eaten.
- `Snake.length` grows by `tuning.food.growthPerPellet` per eat.
- Collision: circle/circle via spatial hash (introduce `shared/spatialHash.ts` here for reuse).
- No food spawns inside snake body (rejection sample).
- Refs: agar.io-clone `server/server.js` food balance loop; iogrid spatial hash. Deps: 1.1, 1.2.

**1.5** - Self-collision death and restart (2h). `area:client`.
- `Snake.checkSelfCollision()` true when head intersects body segment more than `tuning.snake.selfCollisionSkip` (e.g. 6) back.
- On death: fade to red over 500ms via tween, then tap-to-restart prompt.
- Restart resets snake at center, respawns food. Ref: knagaitsev/slither.io-clone self-collision skip. Deps: 1.1, 1.4.

**1.6** - Commit phase plan + ADR-002 (no physics engine) (1h). `area:infra`.
- `docs/plans/phase-1-solo-snake.md` summarizes shipped + deferred.
- `docs/decisions/002-no-physics-engine.md` documents why we skipped planck. Deps: 1.1-1.5.

**Exit**: solo snake fun for 60s on a phone. No console errors, no obvious drops on Pixel 6 / iPhone 12. Tuning values in `src/tuning.ts`. Death-and-restart works mobile + desktop.

---

### Phase 2 - Larger world + camera + minimap (target: 1-2 days, ~8h)

**Done when**: world 4000x4000, camera follows head smoothly, minimap shows position, world edges kill.

**Issues**:

**2.1** - Expand world + camera follow head (2h). `area:client`.
- World size in tuning. `cameras.main.startFollow(headObject, true, 0.1, 0.1)` for smooth lerp.
- Tiled background pattern via `TileSprite` or `Graphics` grid.
- Snake renders correctly at world coordinates. Ref: Phaser Camera docs (Context7). Deps: 1.5.

**2.2** - Promote spatial hash to primary lookup (3h). `area:client`.
- `shared/spatialHash.ts` exports `SpatialHash<T>` with `insert/remove/update/queryCircle`.
- Food spawner inserts on create, removes on eat. Snake queries hash for nearby food.
- Unit test: 10k random items, queryCircle returns correct neighborhood.
- Ref: jondubois/iogrid spatial hash (rewrite in TS). Deps: 2.1.

**2.3** - Minimap overlay (2h). `area:client`.
- `tuning.minimap.sizePx` (160px) bottom-right corner, faint background.
- Snake position as colored dot at scaled coords. Respects iOS safe areas.
- Doesn't capture pointer events meant for steering. Deps: 2.1.

**2.4** - World edges kill (1h). `area:client`.
- Head outside world rect -> death via same path as 1.5.
- 4px red line at bounds + vignette in last 100px. Tested at 4 corners. Deps: 2.1.

**2.5** - Commit phase plan (30min). `area:infra`. Deps: 2.1-2.4.

**Exit**: snake roams 4000x4000 with smooth camera. Minimap reflects position. Walls kill. Spatial hash ready for many snakes.

---

### Phase 3 - Bot snakes (target: 2-3 days, ~16h)

**Done when**: 10 bots wandering, all snakes can eat food + each other, dead snakes burst into pellets, head-on-body collisions kill the attacking head.

**Issues**:

**3.1** - Generalize snake to support N instances (3h). `area:client`.
- `src/sim/world.ts` exports `World` with `addSnake/removeSnake/update(dt)`.
- Player snake is a regular map entry. Spatial hash indexes all heads by snakeId.
- All Phase 1-2 behavior still works for player. Deps: 2.2, 2.4.

**3.2** - Bot AI state machine (4h). `area:client`.
- `src/snake/botBrain.ts` exports `BotBrain.update(snake, world, dt): {dirX, dirY}`.
- 3 states (plain switch on enum): `wander`, `seek_food`, `flee`. No xstate.
- View radius from `tuning.bot.viewRadiusPx`. Flee > seek thresholds.
- Wander target re-rolled every `tuning.bot.wanderResampleMs`.
- Unit test: bot in flee state with larger snake adjacent moves away. Deps: 3.1.

**3.3** - Snake-vs-snake collision + death-to-pellets (4h). `area:client`.
- `World.update` runs head-vs-body via spatial hash queries per head.
- On collision: head-owner dies, killer credited.
- Death converts body to food at `tuning.death.pelletsPerSegment` rate (jittered, distinct color, 2x value).
- Dead bot respawns after delay; dead player triggers tap-to-restart.
- Tested: 10 bots in tight quarters, no exceptions, count stable.
- Ref: knagaitsev/slither.io-clone death burst. Deps: 3.1, 3.2.

**3.4** - Bot population manager (2h). `area:client`.
- `src/sim/botManager.ts` keeps `tuning.bot.targetCount` (10) alive.
- Respawns away from player (`minRespawnDistFromPlayerPx`).
- Random color + length (8-30 segments) per spawn. Deps: 3.2.

**3.5** - Render multiple snakes + perf check (2h). `area:client`.
- All snakes render with own color. Player visually distinct (thicker outline / different head shape).
- Minimap: player bright dot, bots dim. 10 bots + player = 240 segments at 60fps desktop.
- Mobile emulation (iPhone 12 + CPU 4x throttle): 30fps minimum. No orphaned renderables on kill. Deps: 3.1, 3.3, 3.4.

**3.6** - Commit phase plan (30min). `area:infra`. Note any perf concerns for Phase 4/6. Deps: 3.5.

**Exit**: 10 bots + player, no crashes, runs 5+ min without leaks. Snake-vs-snake feels correct. Mobile perf acceptable. Recognizably slither.io now.

---

### Phase 4 - Polish + feel (target: 1-2 days, ~14h)

**Done when**: hold-tap to boost (costs length), HUD shows score+length+top-5, death has satisfying screen + tap-to-respawn, touch feels responsive on a real phone.

**Issues**:

**4.1** - Boost mechanic (3h). `area:client`.
- Hold second touch (or hold mouse / spacebar): 2x speed, drains `tuning.snake.boostDrainPerSec` (1 seg/s). Min length 8 to boost.
- Touch UX: small "boost" button OR simultaneous second touch (pick whichever tests better on real phone; document choice).
- Visual: glow during boost; pellets shed from tail (reuse death-pellet visuals).
- Ref: knagaitsev/slither.io-clone boost. Deps: 3.1.

**4.2** - HUD (score, length, top-5 leaderboard) (3h). `area:client`.
- Phaser text or DOM overlay (profile both, pick).
- Updates every frame, no GC churn.
- Leaderboard sorts all snakes by length desc, top 5 with color swatches.
- Mobile-safe: doesn't overlap minimap, respects iOS safe areas.
- Invoke `/frontend-design` at plan time. Deps: 3.5.

**4.3** - Death screen + respawn flow (2h). `area:client`.
- DOM overlay with final score, length, "killed by X", "tap to play again".
- Tap-respawn resets player only (world/bots/food continue).
- Auto-respawn after 10s for kiosk mode.
- Invoke `/frontend-design`. Deps: 3.3, 4.2.

**4.4** - Mobile touch refinement (3h). `area:client`.
- Real-device testing pass on at least one iOS + one Android (or browserstack).
- Drag deadzone tuned (no jitter on micro-jiggles).
- Palm-contact handling. Steering survives pointer focus loss (iOS Safari edge case). Deps: 4.1.

**4.5** - Minimal audio (eat, die, boost) (2h). `area:client`, `area:art`.
- 3 CC0 files in `public/sfx/`, license in `NOTICE`.
- Rate-limited eat sound. Mute button persists to localStorage.
- iOS Safari AudioContext unlock on first user gesture. Deps: 4.2.

**4.6** - Commit phase plan + tag v0.1.0-mvp (1h). `area:infra`.
- `docs/plans/phase-4-polish.md`. README has "Play it" link + GIF/screenshot. Git tag `v0.1.0-mvp` on merge. Deps: 4.1-4.5.

**Exit**: game fun for 5+ min on real phone. HUD readable in landscape with one-thumb. Boost balanced. Death + respawn not frustrating. **Decision point**: Scott plays for an evening before greenlighting Phase 5.

---

### Phase 5 - Multiplayer foundation (target: 3-4 days, ~29h)

**Done when**: two browsers, same 4-letter room code, both snakes appear, can eat + kill each other. Refresh = reconnect.

**Issues**:

**5.1** - Wire protocol (3h). `area:netcode`, `area:infra`.
- `shared/protocol.ts` with `ClientMsg` / `ServerMsg` discriminated unions (JSON for now).
- ClientMsg: `set_nickname`, `set_color`, `input_dir{angle}`, `input_boost{active}`, `client_log`, `leave`.
- ServerMsg: `welcome{sessionId, resumeToken, snakeId, worldDims}`, `state{snakes[], food[], serverTime}`, `snake_died{snakeId, killedBy}`, `food_eaten{ids}`, `error{code, message}`.
- State snapshot viewport-culled (`tuning.net.viewRadiusPx`). Both sides import types.
- Refs: worms `shared/protocol.ts` pattern; ClitherProject doc (inspiration only). Deps: 4.6.

**5.2** - Build SnakeSim that runs on server (6h). `area:server`, `area:netcode`.
- `worker/src/sim/snakeSim.ts` runs same game logic as Phase 3 client sim. No DOM, no Phaser.
- `applyInput(snakeId, {angle, boost})`, `tick(dt): {events: SimEvent[]}`.
- Deterministic given same inputs (seeded RNG).
- Unit test: replay 1s scenario, deterministic output.
- Shared types in `shared/`. Refs: worms `worker/src/sim/simulation.ts` shape; reuse `shared/spatialHash.ts`. Deps: 5.1.

**5.3** - Room Durable Object (6h). `area:server`, `area:netcode`.
- `worker/src/room.ts` modeled on worms `worker/src/room.ts`.
- 20Hz alarm: drain inputs -> step sim -> broadcast `state` (per-client viewport-culled) -> persist -> reschedule.
- Hibernation-safe (sim serializes to DO storage; reloads on cold start).
- Max 8 human players; bots fill to `tuning.net.minSnakesPerRoom` (6).
- Resume token flow identical to worms.
- `/security-review` at plan time. Refs: worms `worker/src/room.ts` (strong adapt). Deps: 5.2.

**5.4** - Matchmaking entry point (2h). `area:server`, `area:netcode`.
- `worker/src/index.ts`: `POST /snek/api/room` returns `{code}`; `GET /snek/api/room/{CODE}` WS upgrade to DO via `env.ROOMS.idFromName(code)`.
- Codegen no I/O. All other paths fall through to ASSETS.
- Refs: worms `worker/src/index.ts` + `codegen.ts` verbatim adapt. Deps: 5.3.

**5.5** - Client WS transport + reconnect (4h). `area:client`, `area:netcode`.
- `src/net/wsClient.ts` (RoomHandle), `src/net/reconnectLoop.ts` (verbatim), `src/net/client.ts` (thin NetClient).
- GameScene: connect -> on welcome, start render loop -> on state, update renderer.
- Reconnect: resume token in localStorage, exponential backoff.
- Refs: worms `src/net/` verbatim adapt. Deps: 5.4.

**5.6** - Lobby scene (4h). `area:client`, `area:netcode`.
- DOM-augmented (Phaser `dom.createContainer: true`) nickname + code inputs.
- Tap targets >=60px. Web Share API on mobile, clipboard fallback.
- `?room=ABCD` deep link auto-fills code.
- Phase 5: auto-start on first join (host/ready flow deferred to Phase 7).
- `/frontend-design` at plan time. Refs: worms `src/scenes/LobbyScene.ts` pattern. Deps: 5.5.

**5.7** - E2E MP smoke + security review (3h). `area:netcode`, `area:server`.
- Two browsers in same room work on `mccarrison.me/snek`.
- `/security-review` artifact attached.
- Server input validation: invalid angles, NaN, out-of-range boost rejected without crashing.
- Rate limiting: 60 inputs/sec/client max; 30 client-log msgs/sec/socket.
- `/review` at plan time. Refs: worms `worker/src/sanitize.ts`; OWASP CSWSH. Deps: 5.6.

**5.8** - Commit phase plan + ADR-003 (wire format) (1h). `area:infra`.
- `docs/plans/phase-5-mp-foundation.md` + `docs/decisions/003-wire-format-json-v1.md` (JSON-first decision; binary revisit gate in Phase 6). Deps: 5.7.

**Exit**: two real players in two real browsers on live URL. Refresh survives via reconnect. Server authoritative. Feel may be janky (no prediction yet) -> Phase 6.

---

### Phase 6 - MP correctness (target: 3-4 days, ~19-22h)

**Done when**: with 100ms simulated latency, local snake feels responsive (predicts), remote snakes glide smoothly between snapshots, 50+ snakes within bandwidth budget.

**Issues**:

**6.1** - Client-side prediction for local snake (5h). `area:netcode`, `area:client`.
- `src/sim/clientSim.ts` runs SnakeSim locally for player snake.
- Inputs apply locally in 0ms + sent to server.
- Reconciliation: on server snapshot, if head delta > `tuning.net.snapThresholdPx` (60px), snap. Else let local stand.
- Test with Chrome DevTools "Slow 3G": local feels responsive. Refs: Gaffer On Games Networked Physics. Deps: 5.8.

**6.2** - Snapshot interpolation for remote snakes (4h). `area:netcode`, `area:client`.
- `src/render/interpolator.ts` keeps recent-snapshots ring buffer per remote snake.
- Render time = `serverTime - tuning.net.interpolationOffsetMs` (100ms).
- Each frame, interpolate each remote head + segments between bracketing snapshots.
- Test: 50ms simulated latency, no jitter/teleport on remotes. Deps: 6.1.

**6.3** - Server viewport culling (3h). `area:netcode`, `area:server`.
- `Room.broadcastState` builds per-client snapshot via spatial hash query around each head.
- Bandwidth target: < 10 KB/s per client with 50 snakes (measure via DO logs).
- Snakes entering/leaving viewport handled (client removes after N consecutive ticks missing). Ref: agar.io-clone viewport culling. Deps: 6.2.

**6.4** - Lag compensation for collisions (4h). `area:netcode`, `area:server`.
- Server keeps short history (500ms) of each snake's segments.
- On head-vs-body check, server uses attacker's input timestamp to look up defender at that time.
- Test: 100ms simulated latency, clean head-on-body registers as kill.
- Limitations: no lag comp on walls or food.
- `/review` at plan time. Ref: Gaffer On Games lag comp. Deps: 6.3.

**6.5** - Binary wire format decision (3-6h). `area:netcode`.
- Profile bandwidth in 50-snake room with JSON. If above budget, migrate `state` to binary (byte-tag + delta-encoded body segments + RLE minimap inspired by ClitherProject).
- Other messages stay JSON.
- Decision documented in ADR-003 either way (amended if binary stays unneeded). Deps: 6.3.

**6.6** - Commit phase plan (30min). `area:infra`. Deps: 6.5.

**Exit**: feels responsive at 100ms latency. 50-snake world on bandwidth budget. Collisions feel fair.

---

### Phase 7 - MP feel + polish (target: 2-3 days, ~16h)

**Done when**: shippable as small public MP product. Friends text link, play, have a good time.

**Issues**:

**7.1** - Bots fill empty rooms server-side (3h). `area:server`, `area:netcode`.
- `worker/src/sim/botManager.ts` runs in DO. Bots when `< tuning.net.minSnakesPerRoom` real players. Despawn gracefully when humans join.
- Bots use lag-comp-aware collision same as humans.
- Ref: lift Phase 3 `src/snake/botBrain.ts` into worker tree. Deps: 6.4.

**7.2** - Smooth turning under jitter (2h). `area:netcode`, `area:client`.
- Reconciliation lerp over `tuning.net.snapLerpMs` (100ms) instead of hard teleport.
- Test on flaky network: snaps visible but not jarring. Deps: 6.1.

**7.3** - Killfeed (2h). `area:client`, `area:netcode`.
- `src/ui/killfeed.ts` listens for `snake_died`, renders last 5.
- Above minimap, below leaderboard. Bot kills distinguished.
- `/frontend-design` at plan time. Deps: 5.7.

**7.4** - Cross-room leaderboard (in-memory) (4h). `area:server`, `area:netcode`.
- Singleton `Leaderboard` DO with `submitScore` + `getTopN`.
- Each Room DO posts final scores on death. Lobby queries on entry, shows top 10.
- Daily reset via DO alarm. No DB.
- `/security-review` (cross-DO RPC). Ref: Cloudflare DO RPC docs (Context7). Deps: 7.1.

**7.5** - QR code for room share (1h). `area:client`.
- Tiny CC0/MIT JS QR lib (no telemetry).
- Encodes `https://mccarrison.me/snek/?room=ABCD`. Lobby-only. Deps: 5.6.

**7.6** - Anti-grief + rate limiting (3h). `area:server`, `area:netcode`.
- WS conn rate limit per IP (Workers KV or per-isolate).
- Stricter Unicode handling in nickname. Strip control chars. Don't broadcast unvalidated nicknames.
- Log suspected abuse (rapid disconnect/reconnect cycles).
- `/security-review` + `/review`. Ref: worms `worker/src/sanitize.ts` adapt; OWASP WS. Deps: 7.4.

**7.7** - Commit final phase plan + tag v1.0 (1h). `area:infra`.
- `docs/plans/phase-7-polish.md`. ROADMAP -> shipped. `v1.0.0` git tag. README final pass with screenshots. Deps: 7.6.

**Exit**: shareable with friends without disclaimers. Server costs in budget. 50-snake room playable. Killfeed/leaderboard/bot-fill make rooms feel populated.

---

## 6. Cross-phase risks

| Risk | Where it bites | Mitigation now |
|---|---|---|
| Wire format lock-in: JSON in Phase 5 may be too chatty at scale | Phase 6 | Define `state` as separable message in Phase 5 protocol so swapping its encoder doesn't ripple. Reserve binary tag bytes in ADR-003. |
| Spatial hash bucket size: too small = many buckets per query; too large = O(N) per bucket | Phase 3 perf, again Phase 6 with 50 snakes | Tunable from day one. Profile at end of Phase 3 to set default. |
| Mobile perf budget: 60fps at 50 snakes on 2yo phone | Phase 3 (10), Phase 6 (50) | Phaser Graphics fine short, can choke at scale. Switch to instanced sprite-based body if Phase 3 profiling shows > 8ms/frame on emulated iPhone 12. |
| Determinism: client predict vs server sim float drift | Phase 6 reconciliation | Use rounded-to-int positions in wire snapshot. Local sim can use floats if snapshot quantization is consistent. |
| Resume token leak hijacks snake | Phase 5 reconnect | 32B crypto random, rotated on each resume (worms pattern). localStorage risk documented in ADR. |
| Dumb bot AI = boring before MP fills | Phase 3, Phase 7 polish | Extra time in Phase 3 for FSM tuning. Bot count + view radius are big knobs. |
| DO hibernation correctness: state lost on cold start | Phase 5+ | Mirror worms persistSim / reloadSim exactly. Test cold restart in CI. |
| Touch UX regression: Phase 4 boost zone conflicts with Phase 1 drag-anywhere steering | Phase 4 | Boost is SECONDARY touch zone; steering is anywhere except boost. Test on real device before 4.4 done. |

---

## 7. Open questions for Scott

1. **Bot personalities**: persistent (named, color-stable across respawns) or anonymous (random per spawn)? Default: anonymous. Flag at Phase 3.
2. **Public play or invite-only by default**? Phase 5 ships invite-only. Quick-play button could land in Phase 7.
3. **Accounts/persistence**? Default: no accounts. Lifetime stats would add a DO + tiny schema; can slot Phase 7 if you want.
4. **Art direction**: procedural circles forever, or a pixel-art skin pack? Default: pure procedural. Skins = +2-3 days for asset pipeline + skin picker.
5. **Domain**: `mccarrison.me/snek` path-prefix (worms pattern, default) or subdomain `snek.mccarrison.me`?
6. **Phase 4 gate**: I built a "play for an evening" decision point before Phase 5. Confirm or remove?
7. **Bot brain ownership**: Phase 3 client-side, Phase 7 server-side. Phase 3 code structured for mechanical lift-and-shift. If you'd rather skip client bots and do server-only at Phase 5, saves ~6h but loses "snek is fun without a server" at Phase 3.

---

## 8. Verification

| Phase | How to verify |
|---|---|
| 0 | `https://mccarrison.me/snek/` shows canvas. CI green. Local `typecheck/lint/build/test:run` all pass. |
| 1 | Hand a phone to someone unfamiliar; they figure out steering in 10s. 60s without crash. Self-collision clean. |
| 2 | World feels big. Minimap readable. Edges kill. No camera judder. |
| 3 | 10 bots produce visible kills/respawns over 60s. Mobile emulation holds 30fps min. |
| 4 | Play 5 min on real phone without putting it down. HUD readable in landscape with one thumb. |
| 5 | Two browsers connected to same room see each other within 200ms. Refresh either; player resumes. Invalid input from devtools rejected without crashing. |
| 6 | Slow 3G + 100ms throttle: local smooth, remotes don't jitter. 50-snake bandwidth < 10KB/s/client. |
| 7 | 3 friends share URL via text, join, play a session without bug reports. Leaderboard reflects top scores. |

**Per-PR verification checklist** (every issue):
- `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build` all pass.
- UI tickets: tested on Chrome DevTools mobile emulation (iPhone 12 + Pixel 6).
- Netcode tickets: `/review` ran.
- Deploy/auth tickets: `/security-review` ran.
- No em dashes in diff.
- No magic numbers in game logic; new tunables in `src/tuning.ts`.
- PR body has `Closes #N`.

---

## 9. Effort summary

| Phase | Estimate | Worst case |
|---|---|---|
| 0 | 7h | 1 day |
| 1 | 15h | 2.5 days |
| 2 | 8h | 1.5 days |
| 3 | 16h | 3 days |
| 4 | 14h | 2.5 days |
| **MVP total (0-4)** | **60h** | **~10 working days** |
| 5 | 29h | 5 days |
| 6 | 19-22h | 4 days |
| 7 | 16h | 3 days |
| **Full total (0-7)** | **125-128h** | **~22 working days** |

**1-2 weeks MVP**: tight but achievable. **3-5 weeks full**: on target at steady pace.

**Scope cuts if Phase 1-4 slips**: 4.5 audio -> Phase 7. 3.5 render polish -> Phase 4. 2.3 minimap -> Phase 4.
**Scope cuts if Phase 5-7 slips**: 6.4 lag comp -> post-launch. 7.4 cross-room leaderboard -> defer. 7.5 QR -> defer.

---

## 10. Execution flow (after plan approval)

1. Answer the 7 open questions in section 7 (or accept defaults).
2. Create the `snek` repo on GitHub (private to start; flip later).
3. Clone to `~/snek`. Bootstrap with Phase 0.1.
4. Create 7 milestones (`Phase 0` ... `Phase 7`) + area labels in the repo.
5. File the Phase 0 issues (0.1 - 0.4) with the descriptions above. Defer Phase 1+ issue creation to after Phase 0 ships (avoid stale tickets if scope shifts).
6. Pick off 0.1, ship, repeat.

**Critical worms files for first agent pickup** (all absolute paths):
- `/home/scott/worms/vite.config.ts` - base path + dev proxy. Used by 0.1.
- `/home/scott/worms/CLAUDE.md` - conventions template. Used by 0.2.
- `/home/scott/worms/.github/workflows/ci.yml` - CI shape. Used by 0.3.
- `/home/scott/worms/worker/wrangler.toml` + `worker/src/index.ts` - deploy + asset binding. Used by 0.4.
- `/home/scott/worms/worker/src/room.ts` - 20Hz alarm loop. Used by 5.3.
- `/home/scott/worms/src/net/wsClient.ts` - RoomHandle abstraction. Used by 5.5.
