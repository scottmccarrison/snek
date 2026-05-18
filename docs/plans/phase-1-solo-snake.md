# Phase 1 - Solo snake on a single screen

## Status

Done. PR [#15](https://github.com/scottmccarrison/snek/pull/15) merged 2026-05-18.

## What shipped

Issues [#9](https://github.com/scottmccarrison/snek/issues/9) through [#13](https://github.com/scottmccarrison/snek/issues/13) shipped in PR #15. Issue [#14](https://github.com/scottmccarrison/snek/issues/14) (this docs PR) closes separately.

- [#9](https://github.com/scottmccarrison/snek/issues/9) - **Snake class**: segment-chain kinematics, head + body, `grow()`, `die()`, `reset()`, self-collision skipping the first N segments.
- [#10](https://github.com/scottmccarrison/snek/issues/10) - **SnakeView**: Phaser Graphics renderer; fade-to-dead-color death tween over 500ms.
- [#11](https://github.com/scottmccarrison/snek/issues/11) - **PointerSteering**: touch + mouse + arrow-key input, angle computed from pointer position relative to head, smoothed by `turnRateRadPerSec`.
- [#12](https://github.com/scottmccarrison/snek/issues/12) - **SpatialHash**: uniform-grid collision accelerator; used by FoodSpawner; designed for Phase 2/3/5 reuse on client and server.
- [#13](https://github.com/scottmccarrison/snek/issues/13) - **FoodSpawner**: 50 pellets, rejection-sampled to avoid spawning inside the snake body, head-overlap detection drives eat + grow.
- [#9](https://github.com/scottmccarrison/snek/issues/9) + [#13](https://github.com/scottmccarrison/snek/issues/13) - **GameScene integration**: single-screen 1280x720 world, self-collision OR out-of-bounds triggers death, tap-or-space restart.

## Architecture

```
GameScene (wires everything, owns update loop)
  |
  +-- Snake (segment chain, grow/die/reset, self-collision check)
  |     |
  |     +-- SnakeView (Phaser Graphics, death tween)
  |
  +-- PointerSteering (touch/mouse/arrow -> heading angle -> Snake input)
  |
  +-- FoodSpawner (pellet lifecycle, eat detection)
        |
        +-- SpatialHash<T> (shared/spatialHash.ts, reusable in Phase 5 server)
```

`SpatialHash` is the only module under `shared/`; everything else is under `src/`.

## Reference attributions

Three OSS algorithm sources were cribbed and rewritten in TypeScript:

| Source | Used for |
|--------|----------|
| knagaitsev/slither.io-clone (MIT) | Segment-chain kinematics, mouse-angle steering math, self-collision skip heuristic |
| jondubois/iogrid (MIT) | Spatial hash grid |
| owenashurst/agar.io-clone (MIT) | Food balance loop (target-count rejection sampling) |

Full attribution with destination file paths is in `NOTICE`.

## Tuning observations

Values that shipped in `src/tuning.ts` worked well for the 1280x720 single-screen world without adjustment:

| Key | Value | Note |
|-----|-------|-------|
| `snake.speedPxPerSec` | 180 | Feels brisk without being uncontrollable |
| `snake.spacingPx` | 8 | Tight enough to look like a snake; wide enough for self-collision |
| `snake.turnRateRadPerSec` | 6 | Responsive but not twitchy |
| `snake.selfCollisionSkip` | 6 | Prevents instant death on sharp turns |
| `snake.initialLength` | 8 | Gives a visible snake on spawn |
| `snake.headRadiusPx` | 9 | |
| `snake.bodyRadiusPx` | 7 | |
| `food.targetCount` | 50 | Field feels dense but not cluttered at 1280x720 |
| `food.radiusPx` | 5 | |
| `food.growthPerPellet` | 4 | Growth per eat feels satisfying |
| `world.spatialBucketPx` | 80 | ~9x8 grid for 1280x720 |
| `death.fadeMs` | 500 | |

No re-tuning should be needed for Phase 2 unless the world size changes significantly; the bucket size will need updating when the world expands.

## Deferred to Phase 2

Out-of-bounds death in Phase 1 uses a placeholder visual: a thin red border rectangle drawn by GameScene. The proper world edge rendering (tile-based boundary, vignette, "you are approaching the edge" signal) lands in Phase 2 alongside the camera and minimap.

## Bugcheck findings

Bugcheck ran before merge and caught two restart-listener bugs:

- **H1** (double-restart): a second tap while the fade-out tween was still running fired `restartGame()` twice. Fixed by a closure flag that serializes listener lifecycle.
- **H2** (dangling listener): the pointer-down listener added on death was not removed on restart, causing a leak that accumulated across play sessions. Fixed alongside H1.

Two lower-severity items were deferred as low-risk for Phase 1 scope:

- **M1** (Promise leak on scene shutdown): if the player navigates away mid-tween, a Phaser tween promise may remain unresolved. Deferred to Phase 2 when scene transitions become real.
- **L1** (NaN guard on heading): `Math.atan2(0, 0)` returns 0 rather than NaN in all tested environments; the guard is defensive but not urgent.
