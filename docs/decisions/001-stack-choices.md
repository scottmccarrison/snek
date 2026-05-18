# ADR-001: Stack choices for snek

- **Status**: Accepted
- **Date**: 2026-05-18
- **Related**: Phase 0 (scaffolding), Phase 5 (MP foundation)

## Context

snek is a snake.io / slither.io clone. Mechanically simpler than worms (no terrain, no physics engine, no turns, no weapons), so the stack should be lighter than worms while reusing what carries over cleanly. The author has spent ~6 months building worms (Phaser 3 + planck + xstate + Cloudflare Workers + Durable Objects + hand-rolled WS protocol); much of that knowledge transfers. The question is what to keep, drop, or replace.

User priorities (in order):

1. **Casual drop-in-and-play on mobile.** Text a friend a link, both tap to join, play. No accounts, no install.
2. **Snappy and intuitive.** Fast cold load, 60fps on mid-tier phones, instant input response.
3. **Reuse from worms where it pays.** Avoid relearning Cloudflare DO + Phaser boot + Vite + WS protocol. Avoid re-debugging hibernation, reconnect, scale.refresh().

Against these, snek doesn't need:

- A rigid-body physics engine (planck): snake collision is circle-circle (head vs food) and circle-segment (head vs body). All movement is unit-vector + speed. planck adds bundle size and complexity for no benefit.
- A state machine framework (xstate): snek's game-state graph is roughly { menu, playing, dead, restart }. Plain switch on an enum is easier to read and grep.
- An asset pipeline (Aseprite): snek's visuals can ship as procedural Phaser Graphics (circles, lines, color). Skin packs are a Phase 7 extension if we want them.
- A full multiplayer framework (Colyseus): worms validated the hand-rolled Cloudflare Worker + Durable Object + native WS pattern. Reusing that shape is faster than learning Colyseus and brings no upside given worms-level scale.

## Decision

| Layer | Choice | Why |
|---|---|---|
| Renderer | Phaser 3.90 | Same as worms; reuse main.ts boot patterns, Scale.FIT, scene management. Batteries-included 2D with mature mobile support. |
| Language | TypeScript 5 (strict) | Same tsconfig as worms verbatim. |
| Build | Vite 6 + Biome 1.9 | Same as worms. `base: "/snek/"`. |
| Server | Cloudflare Workers + Durable Objects | Same as worms. Per-room DO, 20Hz alarm tick, hibernation-safe. |
| Transport | Native WebSocket, JSON-first | Reuses worms `wsClient.ts` RoomHandle abstraction. Binary revisited Phase 6 if profiling demands. |
| Physics | None | Hand-rolled circle/circle + circle/segment collision. planck is dropped. |
| State machines | None | Plain switch on enum. xstate is dropped. |
| Spatial structure | Spatial hash grid (custom) | Algorithm cribbed from jondubois/iogrid; written from scratch in TS. From Phase 1. |
| Deploy | Cloudflare Pages (static) + Workers (server) | Same shape as worms. `npm run deploy`. |
| CI | GitHub Actions: typecheck, lint, build, test | Verbatim from worms `.github/workflows/ci.yml` shape, minus worker-specific steps. |

## Alternatives considered

1. **Keep planck for collision**. Considered for "consistency with worms". Rejected: snek's collision needs are 2 primitive checks; planck would mean carrying ~150KB and a rigid-body model that's never used.
2. **Use Colyseus instead of hand-rolled WS**. Faster initial netcode if we hadn't already done it once. Rejected: worms code is the reference we're cribbing from; Colyseus would mean a second learning curve. Reuse what's paid for.
3. **Pixi.js instead of Phaser**. Lighter than Phaser. Rejected: Phaser's input + scene + audio + camera give us things we'd otherwise hand-roll; the bundle-size delta is small once Phaser tree-shakes.
4. **Three.js / WebGL2 hand-rolled**. Massive overkill for 2D snake.
5. **Hand-rolled Canvas2D**. Doable for snek's visual simplicity, but loses Phaser's input + scene + camera. Probably what slither.io itself uses (per Clither protocol research). Reconsider in Phase 6 if Phaser bundle size becomes a measurable mobile-perf issue.

## Consequences

**Immediate (Phase 0)**:
- `package.json` includes only `phaser` as a runtime dep (vite/biome/typescript/vitest dev deps). No planck, xstate, dat.gui, canvas.
- `tsconfig.json`, `biome.json`, `vite.config.ts` cribbed verbatim from worms.
- `vite.config.ts` `base: "/snek/"`; dev proxy for `/snek/api` stubbed but unused until Phase 5.

**Phase 1-3 (solo + bots)**:
- All game logic lives client-side; no server.
- Spatial hash in `shared/spatialHash.ts` is the first piece designed for reuse on both sides.
- Snake update loop (head leads, segments trail along recorded path) is hand-rolled - no physics integration.

**Phase 5 (MP foundation)**:
- `worker/` workspace added with `wrangler.toml`, mirrors worms structure.
- `worker/src/room.ts` strongly adapts worms `worker/src/room.ts` 20Hz alarm tick loop. Replace `Simulation` (planck-based) with `SnakeSim` (no physics).
- `src/net/wsClient.ts` verbatim-adapts worms equivalent. ClientMsg/ServerMsg types are snek-specific.

**Phase 6 revisit gates**:
- Binary wire format: profile 50-snake room with JSON; if > 10 KB/s/client, migrate `state` message to binary using ClitherProject/Slither.io-Protocol as reference.
- Phaser bundle size on mobile: profile cold load at end of Phase 3 on emulated iPhone 12; if > 2s, consider Pixi swap or Phaser tree-shake audit.

**What we lose**: a tiny amount of code-sharing between snek and worms repos. They share conventions (no em dashes, mobile-first, plans-in-repo, GH issues as truth) but not source. That's fine: snek is a separate game, not a fork.

## Open questions (non-blocking)

- **Co-locate snek-api Worker with worms-api Worker?** Both on the same Cloudflare account; routing is path-prefix. No technical reason to share a Worker. Default: separate (`snek-api`).
- **Skin packs in Phase 7 or never?** Per the plan's open question 4. Decision deferred until end of MVP.

## How to use this ADR

When writing a phase plan, cite this ADR if proposing a new dependency, a new state machine library, or a different netcode approach. The bar for adding back something we dropped is "I have measured evidence the dropped tool would solve a real problem." Speculation is not enough.
