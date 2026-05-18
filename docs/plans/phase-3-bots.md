# Phase 3 - Bot snakes

## Status

Done. PR [#31](https://github.com/scottmccarrison/snek/pull/31) merged 2026-05-18.

## What shipped

Issues [#25](https://github.com/scottmccarrison/snek/issues/25) through [#30](https://github.com/scottmccarrison/snek/issues/30) shipped in PR #31. Issue [#30](https://github.com/scottmccarrison/snek/issues/30) (this docs PR) closes separately.

- [#25](https://github.com/scottmccarrison/snek/issues/25) - **Multi-snake world**: World class owns `Map<id, Snake>`; player is one entry alongside up to 10 bots; snake-vs-snake collision is O(N*M) post-update position check with mutual head-vs-body kills; deaths are collected then emitted to avoid mid-iteration mutation.
- [#26](https://github.com/scottmccarrison/snek/issues/26) - **BotBrain FSM**: 3-state machine (flee > seek_food > wander); view radius 300px; flee threshold 250px; seek threshold 200px; wander target re-rolls every 3s.
- [#27](https://github.com/scottmccarrison/snek/issues/27) - **BotManager + respawn**: owns brain lifecycles for all bots; target count 10; 2000ms respawn delay; round-robin palette of 8 non-green colors; min respawn distance 600px from player.
- [#28](https://github.com/scottmccarrison/snek/issues/28) - **Death-to-pellets bursts**: `FoodSpawner.spawnPelletBurst` walks the segment array with step proportional to `pelletsPerSegment` (0.5 = one pellet per 2 segments); 8px jitter; pellets are visually distinct (brighter yellow, 7px radius vs food's 5px) and worth 2x growth.
- [#29](https://github.com/scottmccarrison/snek/issues/29) - **Per-snake visuals + minimap**: Snake constructor extended with optional config (id/ownerType/color) keeping `new Snake(x, y)` backwards-compatible; SnakeView reads `snake.color` and draws a faint white outline (0.3 alpha) for the player; minimap renders bot dots at 0.7 alpha with smaller radius, player dot on top at full alpha.
- [#30](https://github.com/scottmccarrison/snek/issues/30) - **Phase 3 plan + status docs** (this file).

## Architecture

Phase 3 introduces shared mutable state across multiple snakes. The key design choice is `snake.pendingDirX / pendingDirY` as a single shared input channel: both human input (PointerSteering) and bot AI (BotBrain) write a unit direction vector into that field each frame, and `World.update` reads it uniformly when it calls `snake.update(dt)`. Nothing in the sim needs to know whether a snake is player-controlled or bot-controlled.

```
GameScene (wires everything, owns update loop)
  |
  +-- PointerSteering
  |     - writes player snake's pendingDirX / pendingDirY each pointer event
  |
  +-- World (Map<id, Snake>)
  |     - calls snake.update(dt) for every snake, reading pendingDir
  |     - runs O(N*M) snake-vs-snake collision post-update
  |     - collects deaths into an array, then emits all at once (safe iteration)
  |
  +-- BotManager
  |     - owns one BotBrain per bot snake
  |     - calls brain.tick(snake, world) each frame
  |     - brain writes output into snake.pendingDirX / pendingDirY
  |     - handles respawn: waits 2000ms, then re-inserts a fresh Snake into World
  |
  +-- BotBrain (per-bot FSM)
  |     - state: flee | seek_food | wander
  |     - flee: steer away from nearest snake head within 250px
  |     - seek_food: steer toward nearest food pellet within 200px
  |     - wander: steer toward a random target; re-rolls every 3s
  |     - reads getFoods() snapshot from FoodSpawner for seek state
  |
  +-- FoodSpawner (updated)
  |     - rejection-checks all live snake bodies (not just player) via World ref
  |     - new getFoods() snapshot used by BotBrain
  |     - spawnPelletBurst: walks segment array, emits pellets with step + jitter
  |
  +-- SnakeView (per-snake instance)
  |     - reads snake.color for body fill
  |     - draws player outline (white, 0.3 alpha, +2px radius) when ownerType === 'player'
  |
  +-- MinimapView (updated)
        - renders bot dots (0.7 alpha, smaller radius) from World snake map
        - renders player dot on top (full alpha, full radius)
```

`FoodSpawner.update` now takes the full World reference so rejection-sampling checks every live snake body, not just the player. This is the only breaking change to an existing subsystem interface; the call site in GameScene is the only caller.

## Tuning observations

| Key | Value | Note |
|-----|-------|------|
| `bot.targetCount` | 10 | Feels populated without being overwhelming on a 4000x4000 world |
| `bot.viewRadiusPx` | 300 | Wide enough that bots react before they are already overlapping |
| `bot.fleeRadiusPx` | 250 | Must be less than viewRadiusPx; bots flee reliably without hair-trigger |
| `bot.seekRadiusPx` | 200 | Bots beeline for pellets but do not ignore nearby threats |
| `bot.wanderResampleMs` | 3000 | Bots change direction every 3s in wander state; motion feels organic |
| `bot.respawnDelayMs` | 2000 | Short enough that the bot count recovers quickly; long enough to notice a kill |
| `bot.minRespawnDistFromPlayerPx` | 600 | Bots never spawn on top of the player |
| `bot.palette` | 8 colors (red, blue, orange, purple, yellow, teal, pink, brown) | Distinct enough that you can tell snakes apart on the minimap at a glance |
| `death.pelletsPerSegment` | 0.5 | One pellet per 2 segments; a 30-segment bot drops 15 pellets, which feels rewarding without flooding the map |
| `death.pelletGrowthMultiplier` | 2 | Eating a death pellet is visibly more rewarding than a normal food dot |

The flee/seek/wander thresholds are tuned so bot behavior is legible: you can watch a bot switch states in real time as you approach it. The 3-state FSM was enough to produce interesting emergent behavior without needing path planning or anything more complex.

## Bugcheck findings

Bugcheck ran before merge.

- **0 Critical, 0 High, 0 Medium** issues found.
- **1 Low**: `spawnPelletBurst` called with a 0-segment array would compute `step = 0 / pelletsPerSegment` producing NaN positions. This is unreachable in practice because `bot.minLength = 8`; a snake is never killed before it reaches minimum length. Documented, no fix applied.
- **16/16 regression checks passed.** All Phase 1-2 tests were untouched. `pointer.ts`, `BootScene.ts`, `main.ts`, `sanity.test.ts`, and `spatialHash` internals are unchanged. 14 new tests added (5 World, 4 BotBrain, 3 BotManager, 2 FoodSpawner). Total: 39 tests.

## Deferred to Phase 4+

- **Player death-to-pellets**: in Phase 3, pellets only burst from bot kills. If the player dies (OOB or body collision) no pellets spawn. Phase 4 can revisit this once the death screen and restart flow are in place.
- **Continuous-world restart**: Phase 3 destroys all snakes (including bots) when the player dies and rebuilds from scratch on restart. Phase 4 may keep bots alive across restarts so the world feels persistent and lived-in between runs.
