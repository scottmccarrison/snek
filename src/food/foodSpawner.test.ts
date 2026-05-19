import { describe, expect, it, vi } from "vitest";
import { FoodState } from "../../shared/foodState";
import { Snake } from "../snake/snake";
import { tuning } from "../tuning";
import { FoodSpawner } from "./foodSpawner";
import type { FoodItem } from "./foodSpawner";

function createSceneStub() {
  const graphics = {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillCircle: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    add: { graphics: () => graphics },
    graphics,
  };
}

function worldStub(snake: Snake) {
  return { snakes: new Map([["player", snake]]) };
}

describe("FoodSpawner", () => {
  it("refills to targetCount on update", () => {
    const stub = createSceneStub();
    const snake = new Snake(0, 0);
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene);

    spawner.update(worldStub(snake));

    expect(spawner.foodCount).toBe(tuning.food.targetCount);
  });

  it("attempts to reject food spawned inside snake body", () => {
    const stub = createSceneStub();
    // Place snake at world center so segments cluster around (2000, 2000).
    const snake = new Snake(tuning.world.widthPx / 2, tuning.world.heightPx / 2);
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene);

    spawner.update(worldStub(snake));

    // The spawner fills to targetCount. FoodState does rejection sampling
    // (up to 8 attempts per item). Verify the count is filled - exact
    // collision-free placement is best-effort.
    expect(spawner.foodCount).toBe(tuning.food.targetCount);

    // The vast majority of food should be outside the snake body.
    const minDist2 = (tuning.food.radiusPx + tuning.snake.bodyRadiusPx) ** 2;
    let overlapCount = 0;
    for (const food of spawner.state.all()) {
      for (const seg of snake.segments) {
        const dx = seg.x - food.x;
        const dy = seg.y - food.y;
        if (dx * dx + dy * dy < minDist2) {
          overlapCount++;
          break;
        }
      }
    }
    // With 8 rejection attempts per item, the overlap rate should be very low.
    // Allow up to 2% of food to be too close (extremely conservative bound).
    expect(overlapCount).toBeLessThan(tuning.food.targetCount * 0.02);
  });

  it("checkEat removes food and grows snake on overlap", () => {
    const stub = createSceneStub();
    const snake = new Snake(100, 100);
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene);

    // Inject a food item at the snake's head via spawnPelletsAt
    // (using isPellet=true; use a non-pellet via FoodState.restore trick)
    // Simplest: restore a FoodState with the exact food item we want, then
    // replace the spawner's internal state via the state getter.
    const snap = spawner.state.serialize();
    snap.foods.push({ id: "test", x: 100, y: 100, isPellet: false });
    const restored = FoodState.restore(snap);
    // Replace internal foodState via the getter (cast to access private field)
    (spawner as unknown as { foodState: FoodState }).foodState = restored;

    const growthBefore = snake.growth;
    const eaten = spawner.checkEat(snake);

    expect(eaten).toBe(1);
    expect(snake.growth).toBe(growthBefore + tuning.food.growthPerPellet);
    expect(spawner.foodCount).toBe(0);
  });

  it("checkEat returns 0 when no overlap", () => {
    const stub = createSceneStub();
    const snake = new Snake(100, 100);
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene);

    // Empty spawner - no food at all.
    expect(spawner.checkEat(snake)).toBe(0);

    // Food far from head - inject via spawnPelletsAt
    spawner.spawnPelletsAt([{ x: 800, y: 600 }]);

    expect(spawner.checkEat(snake)).toBe(0);
  });

  it("spawnPelletBurst creates pellets proportional to segment count", () => {
    const stub = createSceneStub();
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene);

    const segments = Array.from({ length: 20 }, (_, i) => ({ x: i * 8, y: 0 }));
    spawner.spawnPelletBurst(segments);

    const pellets = Array.from(spawner.state.all()).filter((f: FoodItem) => f.isPellet);
    const expectedCount = Math.max(1, Math.floor(20 * tuning.death.pelletsPerSegment));
    expect(pellets.length).toBe(expectedCount);
    for (const p of pellets) {
      expect(p.isPellet).toBe(true);
    }
  });

  it("checkEat applies pelletGrowthMultiplier for pellet items", () => {
    const stub = createSceneStub();
    const snake = new Snake(100, 100);
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene);

    // Inject a pellet at the snake's head via FoodState.restore
    const snap = spawner.state.serialize();
    snap.foods.push({ id: "pellet-test", x: 100, y: 100, isPellet: true });
    const restored = FoodState.restore(snap);
    (spawner as unknown as { foodState: FoodState }).foodState = restored;

    const growthBefore = snake.growth;
    const eaten = spawner.checkEat(snake);

    expect(eaten).toBe(1);
    const expectedGrowth = tuning.food.growthPerPellet * tuning.death.pelletGrowthMultiplier;
    expect(snake.growth).toBe(growthBefore + expectedGrowth);
  });
});
