# Phase 2 - Larger world + camera + minimap

## Status

Done. PR [#23](https://github.com/scottmccarrison/snek/pull/23) merged 2026-05-18.

## What shipped

Issues [#18](https://github.com/scottmccarrison/snek/issues/18) through [#22](https://github.com/scottmccarrison/snek/issues/22) shipped in PR #23. Issue [#22](https://github.com/scottmccarrison/snek/issues/22) (this docs PR) closes separately.

- [#18](https://github.com/scottmccarrison/snek/issues/18) - **World expansion**: world grew from 1280x720 to 4000x4000; `world.widthPx` / `world.heightPx` in tuning; `world.spatialBucketPx` updated to 80.
- [#19](https://github.com/scottmccarrison/snek/issues/19) - **Camera follow**: Phaser camera locks on snake head with lerp=0.12 smoothing; tiled 32x32 grid background via TileSprite + procedural dim-grid texture.
- [#20](https://github.com/scottmccarrison/snek/issues/20) - **World boundary**: 4px red strokeRect at world edges; four semi-transparent vignette rects in the last 100px of each edge to warn the player they are approaching the boundary.
- [#21](https://github.com/scottmccarrison/snek/issues/21) - **Minimap**: 160px panel in the bottom-right corner (16px inset) with cyan border; snake head shown as a 4px dot clamped inside the frame; pointer events that land inside the minimap rect are filtered out of steering via a new optional `shouldIgnore` callback on PointerSteering.
- [#18](https://github.com/scottmccarrison/snek/issues/18) - **Spatial hash scale test**: 10k-item scale test added (100 queries < 50ms in Node) ahead of Phase 3 bot load.

## Architecture

Phase 2 layers new subsystems on top of the Phase 1 graph without modifying existing game logic.

```
GameScene (wires everything, owns update loop)
  |
  +-- Snake / SnakeView / PointerSteering  (Phase 1, unchanged)
  |     |
  |     +-- PointerSteering (new shouldIgnore callback filters minimap hits)
  |
  +-- FoodSpawner / SpatialHash  (Phase 1, SpatialHash bucket size updated)
  |
  +-- [NEW] Camera system
  |     - Phaser camera.startFollow(head) with lerp 0.12
  |     - TileSprite background scrolls naturally under the camera
  |
  +-- [NEW] EdgeRenderer
  |     - strokeRect border at world boundary (4px, red)
  |     - 4x TileSprite or Graphics vignette rects (last 100px each edge)
  |
  +-- [NEW] MinimapView
        - Fixed-position Graphics panel (bottom-right, 160x160)
        - Reads world position of snake head each frame, maps to minimap space
        - Dot clamp accounts for dot radius so dot never clips the frame border
        - Reads cam.width / cam.height per call (not cached) to stay correct
          if the viewport is resized
```

The `shouldIgnore` callback added to PointerSteering is the only touch point back into Phase 1 code; it is additive (optional callback, default undefined = no filtering) and does not alter existing behavior.

## Tuning observations

| Key | Value | Note |
|-----|-------|-------|
| `world.widthPx` | 4000 | At 180px/s the snake takes ~22s to cross; end-to-end diagonal is ~9 minutes which feels fine for a single-player world |
| `world.heightPx` | 4000 | Same |
| `world.spatialBucketPx` | 80 | Kept from Phase 1; bucket count scales to 50x50 = 2500 cells for the larger world, well within budget |
| `world.bgFillColor` | 0x111118 | Dark blue-grey; easy on the eyes in landscape |
| `world.bgGridColor` | 0x2a2a35 | Subtle grid lines; visible but not distracting |
| `camera.lerp` | 0.12 | Felt smooth without perceptible lag on desktop; will verify on mid-tier mobile in Phase 4 |
| `edge.borderPx` | 4 | Visible without dominating; red reads as "stop" clearly |
| `edge.vignettePx` | 100 | Gives about 0.5s warning at max speed; enough to react |
| `edge.vignetteAlpha` | 0.18 | Noticeable but not disorienting |
| `minimap.sizePx` | 160 | Readable on desktop; will verify on 375px-wide phones in Phase 4 |
| `minimap.dotRadiusPx` | 4 | Big enough to see at a glance |

The 4000x4000 world is deliberately oversized for a single-snake phase. Phase 3 bots will fill the space; Phase 4 can re-tune if the world feels empty at the start of a session.

## Bugcheck findings

Bugcheck ran before merge and caught two minimap issues:

- **L1** (dot clamp off by radius): the minimap dot clamp was computed against the panel edge without accounting for dot radius, so the dot could draw 4px outside the frame border on one side. Fixed by subtracting `dotRadiusPx` from the clamp bounds.
- **L2** (stale viewport dimensions): MinimapView was caching `cam.width` / `cam.height` at construction time. If the Phaser canvas is resized (e.g., orientation change on mobile), the minimap would map head position incorrectly. Fixed by reading dimensions per frame.

Both were low severity. No other issues were raised.

## Deferred to Phase 3+

- **Out-of-bounds death frame**: when the snake hits the boundary, the death is triggered correctly but the head can be 1px off-screen in the final rendered frame before the fade begins. This is a cosmetic edge case. Phase 3+ can clamp the head draw position to the world boundary for the death frame if user feedback flags it; it is not worth the complexity now.
- **Minimap mobile size**: 160px reads fine on desktop. Actual phone readability is unverified until Phase 4 polish when real-device testing happens.
