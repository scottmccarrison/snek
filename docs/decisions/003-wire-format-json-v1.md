# ADR-003: Wire format for multiplayer is JSON in v1

- **Status**: Accepted
- **Date**: 2026-05-19
- **Related**: Phase 5 (MP foundation), Phase 6 (MP correctness)

## Context

Phase 5 ships the multiplayer foundation: server-authoritative 20Hz tick on a Cloudflare Durable Object, per-client viewport-culled state broadcasts over WebSocket, and a `ClientMsg` / `ServerMsg` protocol shared by both ends.

The wire format choice is between:

1. **JSON** - human-readable, JS-native, no schema codegen, easy to debug from Chrome DevTools Network tab.
2. **Binary** - compact byte-tag + delta-encoded body segments (modeled on the reverse-engineered slither.io protocol, see ClitherProject's protocol docs).

worms uses JSON. It works at worms scale (a few players, low-frequency turn-based updates). snek's broadcast volume is much higher: 20Hz full-snapshot per client, with snakes that can grow to ~50-200 segments of two floats each.

## Decision

**Ship JSON in Phase 5. Revisit in Phase 6 if measured bandwidth breaches the budget.**

JSON now because:

- It's already what `shared/protocol.ts` and `worker/src/sim/snakeSim.ts` produce. Zero migration cost.
- Debuggable in DevTools Network tab. Critical for first-MP iteration.
- Per-client viewport culling (already implemented) keeps the practical broadcast size manageable for the Phase 5 scale (2-4 humans + bot fillup deferred to Phase 7).
- We don't yet have profiling data to justify the complexity of a binary format.

## Revisit gate

Move to binary if, during Phase 6 profiling:

- Sustained per-client bandwidth > 10 KB/s with 50+ snakes in viewport, OR
- Mobile data usage during a typical 5-minute session > 5 MB.

If we hit the gate, the migration is bounded:

- `state` messages become binary (byte tag = `0x01`, then varint-encoded snake count, then delta-encoded segments per snake).
- All other messages (`welcome`, `snake_died`, `food_eaten`, etc.) stay JSON. They're low-frequency and don't justify the codec churn.
- Decode is hand-rolled; no protobuf / flatbuffers dependency.

## Why not binary now

- We don't have bandwidth measurements to design against. Premature optimization.
- Binary makes the first MP debugging session miserable. Phase 5's exit criterion is "two browsers can play"; debuggability beats compactness here.
- Phase 6 has profiling work anyway (client prediction tuning, interpolation buffer). Co-locate the binary migration decision with that data.

## What this enables

- Phase 5 can ship without a binary codec, schema versioning, or migration plumbing.
- Phase 6 can profile real bandwidth and revisit. If the gate isn't hit (likely for small rooms), we never write the binary path. If it is hit, we have a measured target.
