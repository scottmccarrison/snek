# snek roadmap

Source of truth: [GitHub issues](https://github.com/scottmccarrison/snek/issues). This file mirrors them with status, PR links, and plan docs.

## Phases

Solo + bots first (Phases 0-4), then multiplayer (Phases 5-7). The game is "fun" by end of Phase 3 without any backend; netcode complexity is easier to design once the deterministic sim works locally.

| # | Phase | Status | PR | Plan |
|---|---|---|---|---|
| 0 | Scaffolding (Vite, Phaser, Biome, CI, deploy stub) | Done | - | (Phase 0 ships as 4 small PRs; no separate plan doc) |
| 1 | Solo snake on single screen | Done | [#15](https://github.com/scottmccarrison/snek/pull/15) | [phase-1-solo-snake.md](plans/phase-1-solo-snake.md) |
| 2 | Larger world + camera + minimap | Done | [#23](https://github.com/scottmccarrison/snek/pull/23) | [phase-2-world-camera.md](plans/phase-2-world-camera.md) |
| 3 | Bot snakes (FSM AI, snake-vs-snake, death-to-pellets) | Done | [#31](https://github.com/scottmccarrison/snek/pull/31) | [phase-3-bots.md](plans/phase-3-bots.md) |
| 4 | Polish + feel (boost, HUD, death screen, audio, mobile touch) | Todo | - | - |
| 5 | MP foundation (CF Worker + DO + 20Hz tick + WS protocol + reconnect) | Todo | - | - |
| 6 | MP correctness (prediction, interpolation, lag comp, viewport culling, binary decision) | Todo | - | - |
| 7 | MP feel + polish (server-side bots, killfeed, cross-room leaderboard, QR share, anti-grief) | Todo | - | - |

Overall plan with detailed per-issue breakdown: [docs/plans/overall.md](plans/overall.md).

## Estimates

| Phases | Estimate | Worst case |
|---|---|---|
| 0-4 (MVP, solo + bots) | ~60 hours | ~10 working days |
| 5-7 (multiplayer) | ~65 hours | ~12 working days |
| **Total** | **~125 hours** | **~22 working days** |

Calendar target: 3-5 weeks at steady pace.

## Scope cuts (if needed)

- **MVP slip**: drop audio (4.5) until Phase 7. Defer minimap (2.3) to Phase 4. Skip render polish (3.5).
- **MP slip**: defer lag compensation (6.4) post-launch. Skip cross-room leaderboard (7.4). Skip QR code (7.5).
