import { describe, expect, it, vi } from "vitest";
import { SpatialHash } from "../../shared/spatialHash";
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

describe("FoodSpawner", () => {
  it("refills to targetCount on update", () => {
    const stub = createSceneStub();
    const hash = new SpatialHash<FoodItem>(80);
    const snake = new Snake(0, 0);
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene, hash);

    spawner.update(snake);

    expect(spawner.foodCount).toBe(tuning.food.targetCount);
  });

  it("rejects food spawned inside snake body", () => {
    const stub = createSceneStub();
    const hash = new SpatialHash<FoodItem>(80);
    // Place snake at world center so segments cluster around (640, 360).
    const snake = new Snake(tuning.world.widthPx / 2, tuning.world.heightPx / 2);
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene, hash);

    spawner.update(snake);

    const internal = spawner as unknown as { foods: Map<string, FoodItem> };
    const minDist2 = (tuning.food.radiusPx + tuning.snake.bodyRadiusPx) ** 2;
    for (const food of internal.foods.values()) {
      let tooClose = false;
      for (const seg of snake.segments) {
        const dx = seg.x - food.x;
        const dy = seg.y - food.y;
        if (dx * dx + dy * dy < minDist2) {
          tooClose = true;
          break;
        }
      }
      expect(tooClose).toBe(false);
    }
  });

  it("checkEat removes food and grows snake on overlap", () => {
    const stub = createSceneStub();
    const hash = new SpatialHash<FoodItem>(80);
    const snake = new Snake(100, 100);
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene, hash);

    // Inject a food item at the snake's head position.
    const food: FoodItem = { id: "test", x: 100, y: 100 };
    hash.insert("test", 100, 100, food);
    const internal = spawner as unknown as { foods: Map<string, FoodItem> };
    internal.foods.set("test", food);

    const growthBefore = snake.growth;
    const eaten = spawner.checkEat(snake);

    expect(eaten).toBe(1);
    expect(snake.growth).toBe(growthBefore + tuning.food.growthPerPellet);
    expect(internal.foods.size).toBe(0);
  });

  it("checkEat returns 0 when no overlap", () => {
    const stub = createSceneStub();
    const hash = new SpatialHash<FoodItem>(80);
    const snake = new Snake(100, 100);
    const spawner = new FoodSpawner(stub as unknown as Phaser.Scene, hash);

    // Empty spawner - no food at all.
    expect(spawner.checkEat(snake)).toBe(0);

    // Food far from head.
    const farFood: FoodItem = { id: "far", x: 800, y: 600 };
    hash.insert("far", 800, 600, farFood);
    const internal = spawner as unknown as { foods: Map<string, FoodItem> };
    internal.foods.set("far", farFood);

    expect(spawner.checkEat(snake)).toBe(0);
  });
});
