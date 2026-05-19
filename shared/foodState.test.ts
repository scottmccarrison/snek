// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Snake } from "../src/snake/snake";
import { tuning } from "../src/tuning";
import { FoodState } from "./foodState";

describe("FoodState", () => {
  it("topUp fills to targetCount", () => {
    const fs = new FoodState(1);
    fs.topUp([]);
    expect(fs.size()).toBe(tuning.food.targetCount);
  });

  it("checkEat removes food and grows snake", () => {
    const fs = new FoodState(1);
    const snake = new Snake(100, 100);
    // Directly inject a food item at the snake's head
    const data = fs.serialize();
    data.foods.push({ id: "test-eat", x: 100, y: 100, isPellet: false });
    data.nextId = 99;
    data.rngState = fs.serialize().rngState;
    const fs2 = FoodState.restore(data);

    const growthBefore = snake.growth;
    const result = fs2.checkEat(snake);

    expect(result.eaten).toBe(1);
    expect(result.eatenIds).toContain("test-eat");
    expect(snake.growth).toBeGreaterThan(growthBefore);
    expect(fs2.size()).toBe(0);
  });

  it("spawnPelletsAt creates pellets with isPellet=true", () => {
    const fs = new FoodState(1);
    fs.spawnPelletsAt([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(fs.size()).toBe(2);
    for (const f of fs.all()) {
      expect(f.isPellet).toBe(true);
    }
  });

  it("spawnPelletBurst creates N=max(1, floor(seg * ratio)) pellets", () => {
    const fs = new FoodState(1);
    const segments = Array.from({ length: 20 }, (_, i) => ({ x: i * 8, y: 0 }));
    fs.spawnPelletBurst(segments);
    const expected = Math.max(1, Math.floor(20 * tuning.death.pelletsPerSegment));
    expect(fs.size()).toBe(expected);
    for (const f of fs.all()) {
      expect(f.isPellet).toBe(true);
    }
  });

  it("same seed = same spawn sequence (determinism)", () => {
    const fs1 = new FoodState(42);
    const fs2 = new FoodState(42);
    fs1.topUp([]);
    fs2.topUp([]);
    const foods1 = Array.from(fs1.all()).map((f) => `${f.x.toFixed(2)},${f.y.toFixed(2)}`);
    const foods2 = Array.from(fs2.all()).map((f) => `${f.x.toFixed(2)},${f.y.toFixed(2)}`);
    expect(foods1).toEqual(foods2);
  });

  it("serialize then restore preserves state", () => {
    const fs = new FoodState(7);
    fs.spawnPelletsAt([{ x: 50, y: 60 }]);
    fs.topUp([]);
    const snap = fs.serialize();

    const fs2 = FoodState.restore(snap);

    expect(fs2.size()).toBe(fs.size());
    expect(fs2.serialize().nextId).toBe(snap.nextId);
    expect(fs2.serialize().rngState).toBe(snap.rngState);
    // Spot-check a few foods are identical
    const foods1 = Array.from(fs.all()).sort((a, b) => a.id.localeCompare(b.id));
    const foods2 = Array.from(fs2.all()).sort((a, b) => a.id.localeCompare(b.id));
    expect(foods1.length).toBe(foods2.length);
    for (let i = 0; i < Math.min(5, foods1.length); i++) {
      expect(foods2[i].id).toBe(foods1[i].id);
      expect(foods2[i].x).toBe(foods1[i].x);
      expect(foods2[i].y).toBe(foods1[i].y);
      expect(foods2[i].isPellet).toBe(foods1[i].isPellet);
    }
  });
});
