# snek Phase 5 - Multiplayer foundation

## Context

Phase 5 is the MP foundation per the snek roadmap. Exit criterion: two real browsers in two real networks join the same room (4-letter code), play together, see each other eat + die. Refresh survives via reconnect. Server-authoritative, no prediction yet (jankiness OK - that's Phase 6).

snek's sim is already mostly DOM/Phaser-free (Snake, World, SpatialHash are pure). Worms repo (~/worms) provides the canonical Cloudflare Worker + Durable Object pattern: 20Hz alarm-driven tick, hibernation-safe storage, resume-token reconnect, 4-letter code matchmaking.

**Worker module access to client sim** (B1 from adversarial review). `worker/tsconfig.json` currently includes `src/**/*` and `../shared/**/*`, where `src/` is `worker/src/` and `shared/` is the repo-root `shared/` dir. It does NOT include the repo-root `src/` (where `snake.ts` lives). We extend the worker tsconfig in PR 1 to add the specific deterministic-sim paths instead of moving files around:

```jsonc
// worker/tsconfig.json
"include": [
  "src/**/*",
  "../shared/**/*",
  "../src/snake/snake.ts",
  "../src/sim/world.ts",
  "../src/tuning.ts"
]
```

Plus a one-line build-time check that `Snake` and `World` don't import anything DOM-touching. We don't move files because (a) it's a much larger blast radius, (b) the client-side code already works in its current location, and (c) `tuning.ts` is referenced everywhere - moving it is a sweep.

Plan is the 8 sub-tasks 5.1 - 5.8 in three sequential PRs. Within each PR, agents run in parallel where surfaces don't conflict.

## Roadmap reminder

- 5.1 Protocol (3h) - shared/protocol.ts discriminated union
- 5.2 SnakeSim server (6h) - worker/src/sim/snakeSim.ts
- 5.3 Room DO (6h) - worker/src/room.ts, alarm + broadcast + hibernation
- 5.4 Matchmaking (2h) - POST /snek/api/room codegen, WS upgrade via env.ROOMS
- 5.5 Client WS (4h) - src/net/wsClient.ts + reconnectLoop.ts + client.ts
- 5.6 Lobby scene (4h) - DOM-augmented Phaser scene, name + code, ?room= deep link
- 5.7 E2E smoke + security (3h) - two browsers on live, /security-review artifact, rate limiting
- 5.8 Phase doc + ADR-003 (1h) - wire format decision

## Workstream split

### PR 1 (Phase 5a): protocol + server sim + decouple food
**Branch**: `feature/phase-5-server-sim`
**Worktrees**: ws1 (protocol), ws2 (server sim + food decouple)
**Sub-tasks**: 5.1 + 5.2 + part of 5.3 prep (FoodState decoupling)

### PR 2 (Phase 5b): Room DO + matchmaking + client transport + lobby
**Branch**: `feature/phase-5-room-and-client`
**Worktrees**: ws1 (Room DO + matchmaking entry), ws2 (client WS + reconnect + lobby)
**Sub-tasks**: 5.3 + 5.4 + 5.5 + 5.6

### PR 3 (Phase 5c): E2E smoke + security + docs
**Branch**: `feature/phase-5-smoke-and-docs`
**Worktrees**: single (sequential)
**Sub-tasks**: 5.7 + 5.8

## Hard constraints (every agent prompt)

- **No em dashes anywhere.** grep-verify before commit.
- **All new tunables in `src/tuning.ts`** under a new `tuning.net` block.
- **Tests must pass.** Each PR maintains or grows the suite. Server sim needs its own test file with a deterministic replay.
- **Security**: server validates EVERY client input. Invalid angles, NaN, out-of-range booleans, oversized strings - all rejected without crashing.
- **Deterministic sim**: seeded RNG everywhere (no raw `Math.random()` on server). Server monotonic time via `state.storage.getAlarm() / Date.now()` only.
- **Hibernation safety**: any Room state that survives sleep must be in `state.storage`. No `setInterval` loops; use alarms.
- **No DOM/Phaser in worker/**: worker must compile without those types.

---

## PR 1 (Phase 5a) - Protocol + Server sim + Food decouple

**Goal**: deterministic server-side game loop, ready to plug into a Durable Object. No client changes yet.

**New tunables** (`src/tuning.ts` -> new `tuning.net` block):
```ts
net: {
  serverTickHz: 20;
  viewRadiusPx: 800;            // server snapshot culling radius
  maxHumansPerRoom: 8;
  minSnakesPerRoom: 6;          // bot fillup target (Phase 7 uses this)
  resumeTokenTtlSec: 60;        // disconnect grace window
  maxInputsPerSecPerClient: 60;
  maxClientLogPerSecPerSocket: 30;
  nicknameMaxLen: 16;
}
```

### WS A (PR 1): Protocol module
**Worktree**: `/home/scott/snek-ws1`
**Branch**: `feature/phase-5-server-sim` (single branch; both agents commit here, sequentially after this one's PR pushes)

Files to create:
- `shared/protocol.ts` - discriminated union types for ClientMsg + ServerMsg
- `shared/protocol.test.ts` - sanity tests on round-trip JSON

ClientMsg types:
- `{ type: "set_nickname"; nickname: string }`
- `{ type: "set_color"; colorIdx: number }` (palette index, 0..palette.length-1; server may override on collision)
- `{ type: "input_dir"; angle: number }` (radians, normalized)
- `{ type: "input_boost"; active: boolean }`
- `{ type: "respawn" }` (requested after death; server enforces a 2s cooldown)
- `{ type: "leave" }`
- `{ type: "client_log"; level: "info" | "warn" | "error"; msg: string }`

ServerMsg types:
- `{ type: "welcome"; sessionId: string; resumeToken: string; snakeId: string; worldDims: {w: number; h: number}; tickHz: number }`
- `{ type: "state"; serverTime: number; snakes: SnakeRenderState[]; foods: FoodRenderState[] }`
- `{ type: "snake_died"; snakeId: string; killedBy: string | null }`
- `{ type: "snake_respawned"; snakeId: string }`
- `{ type: "food_eaten"; ids: string[] }`
- `{ type: "error"; code: string; message: string }`

Add a ClientMsg `respawn` so a dead player can come back (B4 from adversarial review):
- `{ type: "respawn" }` - server enforces a minimum 2-second cooldown after death; re-adds the snake to the sim at a random safe spot; broadcasts `snake_respawned` so the dead client can clear its death screen + next `state` shows the new snake.

**Resume token transport** (B3): the WebSocket upgrade URL carries nickname, color, and optional resume token as query params, mirroring worms:

```
wss://mccarrison.me/snek/api/room/{CODE}?nickname=<urlencoded>&color=<0..palette.length-1>&resumeToken=<hex, optional>
```

First connect: no `resumeToken` param. Server issues fresh sessionId + 32-char-hex resume token in `welcome`. Reconnect: client appends `?resumeToken=<token>`. Server validates: not expired (`resumeTokenTtlSec` since issue), not used (single-use), matches a known session. On valid resume, server invalidates the old token, issues a new one in the welcome message, restores the snake's existing state. On invalid/expired/missing, treat as a fresh join.

Color is a palette INDEX (0..palette.length-1), not a raw RGB number (SF4 from review). Server stores `tuning.bot.palette[idx]`. If two clients pick the same color, server overrides one to the next free slot - no error, just a different color. Reduces validation surface and prevents "two-greens" confusion.

Shared types (used by both ClientMsg/ServerMsg and the server sim):
```ts
export interface SnakeRenderState {
  id: string;
  ownerType: "player" | "bot";
  color: number;
  alive: boolean;
  segments: Array<{ x: number; y: number }>;
  boostActive: boolean;
  scale: number; // pre-computed so client doesn't redo log/sqrt math
}

export interface FoodRenderState {
  id: string;
  x: number;
  y: number;
  isPellet: boolean;
}
```

Test: construct a sample of each ClientMsg + ServerMsg, JSON.stringify + JSON.parse, assert type-narrowing works (TypeScript test - real assertions via a type-guard helper exported alongside).

### WS B (PR 1): Server sim + Food decouple
**Worktree**: `/home/scott/snek-ws2` (or work after WS A pushes - both on same branch)
**Depends on**: WS A's protocol types

Files to create:
- `shared/foodState.ts` - extract pure logic from `src/food/foodSpawner.ts`. Field: `Map<string, FoodItem>` + nextId counter + spawn/eat methods (no rendering).
- `shared/seededRng.ts` - simple PRNG (xorshift32 or mulberry32). API: `new SeededRng(seed)`, `random(): number` in [0,1).
- `worker/src/sim/snakeSim.ts` - the deterministic server-side sim.

snakeSim API:
```ts
export class SnakeSim {
  private snakes: Map<string, Snake>;
  private foodState: FoodState;
  private rng: SeededRng;
  private elapsedMs = 0;
  private events: SimEvent[] = [];

  constructor(seed: number);

  // Lifecycle
  addPlayer(snakeId: string, config: { color: number; nickname: string }): void;
  removePlayer(snakeId: string): void;

  // Input from clients
  applyInput(snakeId: string, input: { angle?: number; boostActive?: boolean }): void;

  // Step the simulation by dt seconds. Returns events emitted this tick.
  tick(dt: number): SimEvent[];

  // Snapshots for broadcasts. cullCenterX/Y = viewer head; returns
  // snakes/foods within tuning.net.viewRadiusPx of that point. Food
  // culling uses the existing shared SpatialHash (SF1 from review) so
  // we never walk the full pellet list; snake culling is O(snakes) which
  // is fine at 8-14 snakes/room. ALL broadcasts are culled - no
  // "broadcast everything" path (SF2 from review).
  snapshot(cullCenterX: number, cullCenterY: number): {
    snakes: SnakeRenderState[];
    foods: FoodRenderState[];
  };

  // Hibernation: serialize all state to a JSON-safe blob; restore from it.
  serialize(): SimSnapshot;
  static restore(data: SimSnapshot): SnakeSim;
}

export type SimEvent =
  | { type: "snake_died"; snakeId: string; killedBy: string | null }
  | { type: "food_eaten"; ids: string[] };
```

Decoupling FoodSpawner:
- Keep `src/food/foodSpawner.ts` as the CLIENT-side wrapper (Phaser rendering + reads from a `FoodState`).
- New `shared/foodState.ts` owns: id generation, spawn, checkEat math, isPellet flag, growth multiplier lookup.
- `FoodState` constructor REQUIRES a `seed: number`. No default. (B2 from adversarial review.) Server uses the room's deterministic seed; client passes `Math.floor(Math.random() * 0x7fffffff)` per session so solo behavior stays visually varied. The seeded RNG governs spawn rejection-sampling and pellet jitter so server replays are reproducible.
- Replace `FoodSpawner`'s internal map with a `FoodState` instance. Render is unchanged client-side. Existing food tests stay green (they don't depend on RNG distribution).

Prep `BotBrain` for server-side use later (SF5 from review). PR 1 adds an optional `(rng?: SeededRng)` constructor arg to `BotBrain` and threads it through every `Math.random()` call site (driftPhase, randomPersonality, pickRandomTarget, etc). When `rng` is undefined, BotBrain falls back to `Math.random()` so existing client behavior is unchanged. This costs ~30 lines and saves a sweep in Phase 7. Bot AI is still NOT run server-side in Phase 5.

Tests (`worker/src/sim/snakeSim.test.ts`):
1. `tick is deterministic given the same seed and inputs` - run two sims, identical inputs, assert same snapshots
2. `serialize then restore preserves state` - mid-game serialize, restore in new sim, compare snapshots
3. `applyInput rejects NaN angles and out-of-range booleans` - server input hardening
4. `addPlayer / removePlayer maintains snake list` - basic CRUD
5. `tick emits snake_died event on OOB` - World.ts logic preserved
6. `tick emits food_eaten event when head intersects pellet` - FoodState integration
7. `snapshot culls to viewRadius` - distant snakes/foods excluded
8. `snapshot includes segments + scale + boostActive` - render-ready output

**Implementation order for WS B**:
1. Write `shared/seededRng.ts` + tests.
2. Write `shared/foodState.ts` - port the pure pieces of FoodSpawner. Test in isolation.
3. Refactor `src/food/foodSpawner.ts` to use FoodState internally (no behavior change client-side; tests still pass).
4. Write `worker/src/sim/snakeSim.ts` per the API above. Reuse `Snake` + `World` from `src/snake/` and `src/sim/` - they're DOM-free.
5. Add tests.
6. Verify the worker compiles (tsc in worker/).

**File reuse from client tree**:
The worker can import directly from `src/snake/snake.ts`, `src/sim/world.ts`, `src/tuning.ts`. tsconfig already includes them. Don't duplicate.

### PR 1 verification

**Test harness for worker** (SF8 from review). Worker tests live at `worker/src/sim/snakeSim.test.ts`. To pick them up under the root vitest run, the root `vitest.config.ts` gains a `test.include` entry for `worker/src/**/*.test.ts` (or we add `vitest` as a workspace - simpler to just include the path). Worker tests run in `environment: 'node'` (not jsdom). Worker's `tsconfig.json` adds `"types": ["@cloudflare/workers-types", "vitest/globals"]`.

```bash
cd /home/scott/snek-ws1
npm install
npm run typecheck                     # root client + worker both clean
cd worker && npm run typecheck && cd ..
npm run lint
npm run test:run                      # 103 + ~15 new = ~118 pass
npm run build
grep -rn $'\xe2\x80\x94' --include='*.ts' --include='*.md' --include='*.json' --include='*.html' --include='*.css' . | grep -v node_modules
```

### PR 1 commit message

```
[Phase 5a] Wire protocol + server sim + FoodState decouple

5.1 shared/protocol.ts: discriminated union for ClientMsg /
ServerMsg. Six client message types (set_nickname, set_color,
input_dir, input_boost, leave, client_log) and six server message
types (welcome, state, snake_died, food_eaten, error).

5.2 worker/src/sim/snakeSim.ts: deterministic server-side game
loop. Reuses the existing Snake + World classes (already DOM-
free) plus a new FoodState extracted from FoodSpawner. Seeded
RNG (mulberry32) for spawn jitter. applyInput hardened against
NaN / out-of-range. Hibernation-safe via serialize/restore.

shared/foodState.ts: pure food state (no Phaser). FoodSpawner
now wraps it for client-side rendering. shared/seededRng.ts:
deterministic PRNG.

tuning.net block: serverTickHz, viewRadiusPx, max-humans-per-room,
resumeTokenTtlSec, rate-limit caps, nickname length cap.

10 new tests across protocol + foodState + seededRng + snakeSim.
Total: ~113.

Closes part of #61 (Phase 5 meta).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## PR 2 (Phase 5b) - Room DO + matchmaking + client transport + lobby

**Goal**: real WebSocket flow end-to-end. Two browsers can join a room and see each other's snakes move.

### WS A (PR 2): Room DO + matchmaking entry
**Worktree**: `/home/scott/snek-ws1`
**Branch**: `feature/phase-5-room-and-client`

Files to create / modify:
- `worker/src/room.ts` - Room class (Durable Object)
- `worker/src/codegen.ts` - 4-letter room code generator (alphabet without I/O)
- `worker/src/sanitize.ts` - input validation helpers (nicknames, angles)
- `worker/src/index.ts` - extend with POST /snek/api/room + WS upgrade route
- `worker/wrangler.toml` - add `[[durable_objects.bindings]]` + `[[migrations]]`

Room DO skeleton (modeled on worms `worker/src/room.ts`):
```ts
export class Room implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private code = "";
  private sim: SnakeSim | null = null;
  private tickInProgress = false;
  private lastTickMs = 0;
  // session -> resumeToken; persisted to storage
  private resumeTokens = new Map<string, { token: string; snakeId: string; expiresAt: number }>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    state.blockConcurrencyWhile(async () => this.loadState());
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") return new Response("expected websocket", { status: 426 });
    const url = new URL(request.url);
    const code = url.pathname.split("/").pop()?.toUpperCase() ?? "";
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(code)) {
      return new Response("invalid code", { status: 400 });
    }
    this.code = code;
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    await this.ensureTickScheduled();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, msg: string): Promise<void> {
    // parse + dispatch ClientMsg. rate-limit per socket.
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // remove session, schedule grace period before snake removal
  }

  async alarm(): Promise<void> {
    if (this.tickInProgress) return;
    this.tickInProgress = true;
    try {
      // SF7: fixed dt regardless of alarm jitter. Clients lerp at their
      // own framerate against the latest two snapshots; the server's
      // simulation clock advances by exactly 1/serverTickHz per tick.
      const fixedDt = 1 / tuning.net.serverTickHz;
      const sockets = this.state.getWebSockets();

      // SF3: idle-room teardown. If no live sockets AND no live resume
      // tokens, GC and stop scheduling.
      this.gcExpiredResumeTokens();
      if (sockets.length === 0 && this.resumeTokens.size === 0) {
        if (this.sim) {
          await this.state.storage.delete("sim");
          this.sim = null;
        }
        return; // do NOT reschedule
      }

      // SF6: if no live sockets but tokens still pending, slow the tick
      // until they expire. Saves CPU on hibernated rooms with pending grace.
      if (sockets.length === 0) {
        const earliestExpiry = Math.min(
          ...Array.from(this.resumeTokens.values()).map((t) => t.expiresAt),
        );
        await this.state.storage.setAlarm(earliestExpiry);
        return;
      }

      if (this.sim) {
        const events = this.sim.tick(fixedDt);
        this.broadcastState(); // per-socket viewport-culled
        this.broadcastEvents(events);
        await this.persistSim();
      }
      await this.state.storage.setAlarm(Date.now() + 1000 * fixedDt);
    } finally {
      this.tickInProgress = false;
    }
  }

  private gcExpiredResumeTokens(): void {
    const now = Date.now();
    for (const [sessionId, t] of this.resumeTokens) {
      if (t.expiresAt < now) this.resumeTokens.delete(sessionId);
    }
  }

  private async loadState(): Promise<void> {
    // restore sim, resumeTokens, code from storage
  }

  private async persistSim(): Promise<void> {
    if (!this.sim) return;
    await this.state.storage.put("sim", this.sim.serialize());
  }

  private broadcastState(): void {
    // per-socket snapshot (viewport-culled around that socket's snake head)
  }

  private broadcastEvents(events: SimEvent[]): void { /* ... */ }
  private async ensureTickScheduled(): Promise<void> { /* ... */ }
}
```

Matchmaking entry (`worker/src/index.ts`):
```ts
if (url.pathname === "/snek/api/room" && request.method === "POST") {
  const code = generateUniqueCode();
  // Could "warm" the DO by calling .get(id) so it claims storage; but lazy is fine.
  return Response.json({ code });
}
if (url.pathname.startsWith("/snek/api/room/") && request.headers.get("Upgrade") === "websocket") {
  const code = url.pathname.split("/").pop()?.toUpperCase() ?? "";
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(code)) return new Response("bad code", { status: 400 });
  const id = env.ROOMS.idFromName(code);
  return env.ROOMS.get(id).fetch(request);
}
// otherwise fall through to existing asset handling
```

wrangler.toml additions:
```toml
[[durable_objects.bindings]]
name = "ROOMS"
class_name = "Room"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]
```

Tests (`worker/src/room.test.ts`):
1. `codegen produces 4-letter codes from the restricted alphabet`
2. `codegen avoids I and O` (squat-pattern defense)
3. `sanitize.normalizeNickname strips control chars + zero-width`
4. `sanitize.isValidAngle rejects NaN, Infinity, out-of-range`
5. `sanitize.isValidBoost rejects non-booleans`

Room DO tests via the `cloudflare:test` harness are nice-to-have but tricky to set up under vitest; defer to manual E2E in PR 3.

### WS B (PR 2): Client transport + lobby scene
**Worktree**: `/home/scott/snek-ws2`
**Branch**: `feature/phase-5-room-and-client` (separate worktree, same branch when WS A pushes - or use ws1 sequentially)

Files to create:
- `src/net/client.ts` - thin NetClient. computes wsBaseUrl + httpBaseUrl from window.location.
- `src/net/wsClient.ts` - RoomHandle: connect, send, dispatch.
- `src/net/reconnectLoop.ts` - exponential backoff array.
- `src/scenes/LobbyScene.ts` - DOM-augmented Phaser scene with name input + Host / Join.

Files to modify:
- `src/main.ts` - register LobbyScene before GameScene.
- `src/scenes/BootScene.ts` - change `this.scene.start("GameScene")` to a router (NH2 from review):
  ```ts
  const params = new URLSearchParams(window.location.search);
  if (params.get("offline") === "1") this.scene.start("GameScene");
  else this.scene.start("LobbyScene");
  ```
- `src/scenes/GameScene.ts` - on construct from lobby, accept a `RoomHandle`. Wire `room.onMessage("state", ...)` to render the snapshot. Wire local input -> `room.send({type:"input_dir", angle})`.

NetClient API (verbatim adapt from worms):
```ts
export interface NetClient {
  httpBase: string;
  wsBase: string;
  createRoom(): Promise<{ code: string }>;
  joinRoom(code: string, nickname: string, color: number, resumeToken?: string): Promise<RoomHandle>;
}
```

LobbyScene UI (DOM overlay over a static background, NOT the live world):
- "snek" title
- Name input (12 chars; persists to localStorage `snek.playerName` - already used by start menu)
- "Host new room" button -> POST /snek/api/room -> join the returned code
- Code input (4 letters, auto-uppercase, autocomplete off) + "Join" button
- "Play offline" button (existing solo + bots) - kept so the MVP gameplay still works without network
- Personal bests list, labeled "Your offline runs" (NH3 from review). MP scoring is per-session-max-length; cross-session MP bests are out of scope for Phase 5 and revisit in Phase 7 with the global leaderboard.
- ?room=ABCD deep link auto-fills + auto-joins
- ?offline=1 skips lobby and goes straight to GameScene (existing solo + bots mode)

Reconcile with existing StartMenu:
- StartMenu is removed; LobbyScene replaces it. The "Play" button becomes "Host new room" (single-player against bots happens inside the room as well; the room's bot fillup brings them in). Optional: keep an "Offline" button for the existing single-player mode.

Decision: in PR 2, keep BOTH paths. LobbyScene shows "Host new room", "Join code", and "Play offline". Offline goes to GameScene with no RoomHandle (existing behavior). Host/Join goes to GameScene with a RoomHandle. This preserves the solo MVP.

GameScene changes (additive):
- Accept `init({ room?: RoomHandle, nickname: string })`.
- If `room` is set, run in MP mode: don't construct local World/foodSpawner; instead render the server snapshot. Local input goes to `room.send`.
- If `room` is null, run in solo mode (existing behavior - kept for offline play).
- The HUD, death screen, sound manager are shared between both modes.

```ts
private mode: "solo" | "mp" = "solo";
private room: RoomHandle | null = null;
```

In `update()`:
- solo: existing flow (tick world, render local views)
- mp: just render snapshots (no world tick locally)

For MP mode in Phase 5, we don't predict locally - the snake just lerps between snapshots. Janky but expected; Phase 6 fixes it.

**SnakeView lifecycle reconciler (B5 from adversarial review).** In MP mode the client has `SnakeRenderState` DTOs from server snapshots, NOT `Snake` class instances. Two refactors handle this cleanly:

1. **Refactor `SnakeView` to take a minimal interface**:
   ```ts
   export interface RenderableSnake {
     id: string;
     color: number;
     segments: ReadonlyArray<{ x: number; y: number }>;
     scale: number;
     boostActive: boolean;
     dead: boolean;
   }
   ```
   `Snake` already satisfies this (existing client). `SnakeRenderState` from the protocol satisfies it after adding a `dead` flag (server snapshot can include it). `SnakeView` reads only these fields.

2. **GameScene reconciler in MP mode**:
   ```ts
   // In MP update():
   private syncMpViews(snapshot: { snakes: SnakeRenderState[] }): void {
     const seen = new Set<string>();
     for (const s of snapshot.snakes) {
       seen.add(s.id);
       let view = this.snakeViews.get(s.id);
       if (!view) {
         view = new SnakeView(this, s, s.id === this.playerSnakeId ? playerOpts : undefined);
         this.snakeViews.set(s.id, view);
       }
       view.applyState(s); // new method: updates the cached RenderableSnake
     }
     // Destroy views whose snakes are no longer in the snapshot
     for (const [id, view] of this.snakeViews) {
       if (!seen.has(id)) {
         view.destroy();
         this.snakeViews.delete(id);
       }
     }
   }
   ```

3. `SnakeView.applyState(s: RenderableSnake)` stores the latest state; existing `render()` reads from it instead of the constructor-time `Snake` reference. In solo mode, `applyState` is a no-op (the live `Snake` instance is the source of truth via its mutable `segments` array - same identity reference is captured at construction).

Pin the test: `MP reconciler: a snake disappearing from the snapshot has its view destroyed`.

Tests:
- `client.ts: wsBase computed correctly from a sample window.location`
- `wsClient: connect resolves on welcome message` (mock WebSocket)
- `wsClient: send dispatches typed messages`
- `reconnectLoop: backoff array advances` (vi.useFakeTimers)
- `LobbyScene: ?room= query param auto-fills code` (jsdom)

### PR 2 verification

Same as PR 1 plus a manual local test:
- Start `npm run dev` for the client and `wrangler dev` for the worker.
- Open two browsers, host in one, join in the other. Confirm welcome+state messages flow.

### PR 2 commit message

```
[Phase 5b] Room DO + matchmaking + client WS + lobby

5.3 worker/src/room.ts: Room Durable Object. 20Hz alarm-driven
tick. Hibernation-safe (SnakeSim serializes to storage). Per-
client viewport culling. Resume token issued on welcome and
matched on reconnect inside the grace window.

5.4 worker/src/index.ts: POST /snek/api/room generates a 4-letter
code via worker/src/codegen.ts (alphabet without I/O). WS upgrade
on /snek/api/room/{CODE} routes to env.ROOMS.idFromName(code).
wrangler.toml gets the DO binding + migration entry.

5.5 src/net/*: NetClient, RoomHandle wsClient, reconnect loop.
Verbatim shape from worms.

5.6 src/scenes/LobbyScene.ts: DOM overlay with name + host/join +
personal bests + offline button. ?room=ABCD deep link auto-fills
the code. ?offline=1 skips lobby into the existing solo flow.

GameScene now accepts an optional RoomHandle. solo mode runs the
local sim (unchanged from PR-merged MVP). mp mode renders server
snapshots only.

~9 new tests (5 codegen+sanitize + 4 client net + reconciler). Total: ~127.

Closes part of #61.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## PR 3 (Phase 5c) - E2E smoke + security review + docs

### 5.7 E2E smoke + security review

Manual checklist run + `/security-review` skill invocation.

- Deploy to staging or direct prod via `npm run deploy`.
- Two browsers in different networks (or two browser profiles + mobile emulation):
  - Host opens lobby, taps Host -> sees room code.
  - Visitor opens `mccarrison.me/snek/?room={CODE}` -> auto-joins.
  - Both see each other's snake move.
  - Eating + death + food shedding all reflect cross-player.
  - Hard refresh one tab -> the other sees a brief disconnect, then the same snake reappears (resume token flow).
  - One client disconnects (close tab) -> the other sees that snake disappear after the grace window.

`/security-review` artifact:
- New endpoints: POST `/snek/api/room`, GET `/snek/api/room/{CODE}` (WS upgrade)
- New external input: all ClientMsg fields. Audited: nickname (length cap + control-char strip), angle (NaN + range), boost (boolean coerce), color (range 0..0xFFFFFF or fixed palette).
- Per-socket rate limits enforced in Room.webSocketMessage: 60 inputs/sec, 30 client_log/sec.
- Resume tokens are random 16-byte hex; single-use; expire after `resumeTokenTtlSec`.
- DO storage is the only persistence; no PII beyond nickname (which is user-chosen).
- No SSRF / file IO / shell exec / SQL anywhere.
- CORS not applicable (same-origin).

Rate-limit implementation: a per-socket ring buffer of message timestamps. On each incoming message: discard timestamps older than 1 second; if buffer length > cap, drop the message + send an `error` with code `rate_limit`.

### 5.8 Phase doc + ADR-003

- Copy this plan to `docs/plans/phase-5-mp-foundation.md`.
- New `docs/decisions/003-wire-format-json-v1.md` documenting:
  - Decision: JSON for Phase 5. Revisit in Phase 6 if bandwidth budget breached.
  - Why: simpler debugging, no schema churn, gzip + binary tag delivers compactness when needed.
  - Revisit criteria: 50-snake room sustained > 10KB/s/client.
- Update `docs/ROADMAP.md` Phase 5 row -> Done, link to PRs.
- Update `CLAUDE.md` status.

### PR 3 commit message

```
docs: Phase 5 plan + ADR-003 (JSON wire format)

Commits the canonical Phase 5 plan and the wire-format decision.
ADR-003 documents the choice to ship JSON in Phase 5 with a
clear revisit trigger in Phase 6 (50-snake room above 10KB/s/client).

ROADMAP and CLAUDE.md updated.
```

---

## Order of operations for `/build`

For each PR:

1. Create worktree(s).
2. Dispatch agent(s) per the WS plan. PR 1 has WS A (protocol) then WS B (server sim) sequentially since B depends on A. PR 2 can run WS A and WS B in parallel - server WS A and client WS B touch different files.
3. Haiku verifier runs after each agent push.
4. Run `/bugcheck` on the integration branch.
5. Triage findings. Fix Critical/High inline.
6. Open PR, wait for CI.
7. Manual mobile-emulation visual check (and for PR 2, a manual two-browser MP smoke).
8. Squash-merge, deploy via `npm run deploy`.

PR 3 is doc-only + manual security review; no agents needed.

## Risks

| Risk | Mitigation |
|---|---|
| Server sim drift from client sim | Same Snake/World classes used in both. Deterministic seeded RNG. Test: replay scenario, identical snapshots. |
| Hibernation loses state | SnakeSim.serialize + restore round-trip tested. resumeTokens persist. alarm is the only re-entry point. |
| Resume token replay | Single-use - server invalidates on successful resume + issues a fresh one. |
| Rate-limit DoS via spamming codes | POST /api/room is unauthenticated. Add a per-IP cap in PR 3 if scout finds abuse vectors. (Cloudflare's edge already provides some protection.) |
| Viewport culling miss / segments pop | Culling radius (800px) >> viewport diagonal (~1500px at 1280x720 zoomed). Conservative. Tunable. |
| GameScene mode toggle leaks state across solo/mp | Each call to `init(...)` runs a clean teardown of the prior mode. Mp mode skips world construction entirely. |
| Multi-touch boost across MP | Client sends `input_boost{active}` on touch state change. Server tracks per-snake boost flag and applies in tick. Same code path as solo. |
| JSON bandwidth too high | Phase 6 decision gate (ADR-003 revisit). 20Hz * 50 snakes * ~20 segments * 16 bytes/segment = ~320KB/s without culling. Viewport culling drops to ~15 snakes visible -> ~96KB/s -> need delta or binary for 50 concurrent. Acceptable for Phase 5 demo (typically 2-4 players). |

## Verification (after each PR deploys)

PR 1: tests pass locally + on CI. No user-visible change.

PR 2: live at mccarrison.me/snek/. Open in two browsers:
1. Browser A: lands on lobby, taps Host -> code shown.
2. Browser B: same lobby, types code -> Join.
3. Both join the same world; see each other move.
4. Eat pellets / die / shed food works cross-client.
5. Refresh Browser A -> reconnects, same snake/state.

PR 3: docs committed, ADR-003 linked from ROADMAP.

## Changes from adversarial review

5 blocking, 8 should-fix, 3 nice-to-have. All blocking + should-fix applied; all 3 nice-to-have applied.

**Blocking (applied):**
- **B1** Worker `tsconfig.json` does NOT include the root `src/` tree, so the worker can't import `Snake`/`World`/`tuning` directly. Plan now extends worker's `include` array with the three specific files we need (`../src/snake/snake.ts`, `../src/sim/world.ts`, `../src/tuning.ts`) - smaller blast radius than moving sim into `shared/`.
- **B2** `FoodState` constructor requires a `seed: number`. Client passes `Math.floor(Math.random() * 0x7fffffff)` per session so solo behavior stays visually varied; server passes the room's deterministic seed for reproducible replays.
- **B3** Resume token transport spec'd. WS upgrade URL is `/snek/api/room/{CODE}?nickname=...&color=<idx>&resumeToken=<hex,optional>`. First connect: no token; server issues one in `welcome`. Reconnect: client appends `resumeToken`. Server invalidates the old token + issues fresh one on successful resume.
- **B4** MP respawn protocol added. New `ClientMsg { type: "respawn" }` with 2-second server cooldown; new `ServerMsg { type: "snake_respawned"; snakeId }`. Death screen tap-to-play-again in MP mode sends the respawn message instead of locally rebuilding the world.
- **B5** SnakeView lifecycle reconciler. Refactored SnakeView to accept a minimal `RenderableSnake` interface (both `Snake` and `SnakeRenderState` satisfy it). GameScene MP-mode reconciler creates/destroys views per snapshot, indexed by snake id. Test pinned: "snake disappearing from snapshot has its view destroyed."

**Should-fix (applied):**
- **SF1** Food culling uses the existing `shared/spatialHash.ts` so `snapshot()` never walks the full pellet list.
- **SF2** Viewport culling is mandatory in every broadcast - no "broadcast everything" path. Stated explicitly in `snapshot()` doc.
- **SF3** Idle-room teardown spec'd in `alarm()`. When no live sockets AND no live resume tokens, GC stored sim + stop scheduling.
- **SF4** `set_color` is a palette INDEX (0..palette.length-1), not raw RGB. Server picks free slot on collision - no client error.
- **SF5** `BotBrain` constructor accepts an optional `(rng?: SeededRng)` arg; threaded through every `Math.random()` site. When undefined, falls back to `Math.random()` so client behavior is unchanged. ~30-line prep saves a Phase-7 sweep.
- **SF6** Hibernation grace + resume token interaction. When last socket closes but tokens are still pending, alarm reschedules at the earliest token expiry (slow tick saves CPU on hibernated rooms with pending grace).
- **SF7** Server tick uses a FIXED `dt = 1/serverTickHz`, ignoring wall-clock alarm jitter. Clients lerp at their own framerate against the latest two snapshots.
- **SF8** Worker test harness. Root `vitest.config.ts` gains `worker/src/**/*.test.ts` in test include; worker tests run in `environment: 'node'`. Worker `tsconfig.json` adds `"vitest/globals"` to `types`.

**Nice-to-have (applied):**
- **NH1** Test counts pinned per PR. PR 1: ~15 new (~118 total). PR 2: ~9 new (~127 total).
- **NH2** `BootScene.create` becomes a router: `?offline=1` -> GameScene; else -> LobbyScene.
- **NH3** Personal bests in LobbyScene relabeled "Your offline runs". MP scoring stays per-session-max-length in Phase 5; cross-session MP bests are deferred to Phase 7's global leaderboard.
