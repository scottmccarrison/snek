# ADR-002: No physics engine confirmed for snek

- **Status**: Accepted
- **Date**: 2026-05-18
- **Related**: [ADR-001](001-stack-choices.md) (stack choices, where planck was dropped)

## Context

ADR-001 dropped planck on the grounds that snek's collision needs are too simple to justify a rigid-body engine. Phase 1 was the first real test of whether that decision held up under actual code.

Phase 1 shipped six playable components: a segment-chain snake, a Phaser Graphics renderer, pointer steering, a spatial hash grid, a food spawner, and a game scene that wires them all together. Every collision check written was either circle/circle (head vs food pellet) or circle/segment (head vs body segment). Movement is pure unit-vector * speed; no forces, no impulses, no constraints.

## Decision

Continue without a physics engine for the rest of the snek project (Phases 2-7).

## Evidence from Phase 1

Total collision code shipped is under 100 lines across three call sites:

| File | Check | Shape |
|------|-------|-------|
| `src/snake/snake.ts` (`checkSelfCollision`) | Head vs body segments | Circle/segment distance |
| `src/food/foodSpawner.ts` (`checkEat`) | Head vs pellet | Circle/circle overlap |
| `src/scenes/GameScene.ts` (`isOutOfBounds`) | Head vs world boundary | Point vs AABB |

No constraint, joint, or sleeping-body concept was needed. No check required more than one distance comparison. planck's rigid-body model would have added bundle size and a mental model that was never used.

## Alternatives reconsidered

**Re-introduce planck for Phase 5+ (server-side sim).** The server sim (`SnakeSim` in `worker/src/room.ts`, Phase 5) is structurally identical to the client sim: same three collision checks, same unit-vector movement. There is no new collision shape at any planned phase that would benefit from a rigid-body engine.

Rejected for the same reason as ADR-001: "I have measured evidence the dropped tool would solve a real problem" is the bar. Phase 1 provided evidence in the other direction.

## Consequences

- Phases 2-7 continue without planck or any other physics engine.
- `shared/spatialHash.ts` is the only collision-adjacent data structure in the shared layer; it is a grid index, not a physics integrator.
- If a future phase introduces a collision shape that genuinely does not fit circle/circle or circle/segment (no phase in the current roadmap does), this ADR should be revisited with a concrete example.

## How to use this ADR

Cite this ADR if any phase plan proposes adding planck or another physics engine. The bar for reversing this decision is measured evidence of a real problem, not a speculative "it might be cleaner." Point to the specific collision check that does not fit circle/circle, circle/segment, or point/AABB, and explain why a rigid-body engine solves it better than a hand-rolled check.
