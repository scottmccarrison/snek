// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FoodState } from "../../../shared/foodState";
import { tuning } from "../../../src/tuning";
import { SnakeSim } from "./snakeSim";

const FIXED_DT = 1 / tuning.net.serverTickHz;

describe("SnakeSim", () => {
  it("tick is deterministic given the same seed and inputs", () => {
    const sim1 = new SnakeSim(42);
    const sim2 = new SnakeSim(42);

    sim1.addPlayer("p1", { color: 0xff0000, nickname: "Alice", startX: 500, startY: 500 });
    sim2.addPlayer("p1", { color: 0xff0000, nickname: "Alice", startX: 500, startY: 500 });

    // Apply identical inputs and tick both sims
    for (let i = 0; i < 10; i++) {
      sim1.applyInput("p1", { angle: 0.5, boostActive: false });
      sim2.applyInput("p1", { angle: 0.5, boostActive: false });
      sim1.tick(FIXED_DT);
      sim2.tick(FIXED_DT);
    }

    const snap1 = sim1.snapshot(500, 500);
    const snap2 = sim2.snapshot(500, 500);

    expect(snap1.snakes.length).toBe(snap2.snakes.length);
    if (snap1.snakes.length > 0 && snap2.snakes.length > 0) {
      const s1 = snap1.snakes[0];
      const s2 = snap2.snakes[0];
      expect(s1.id).toBe(s2.id);
      expect(s1.segments[0].x).toBeCloseTo(s2.segments[0].x, 5);
      expect(s1.segments[0].y).toBeCloseTo(s2.segments[0].y, 5);
    }
  });

  it("serialize then restore preserves state", () => {
    const sim = new SnakeSim(7);
    sim.addPlayer("p1", { color: 0x1976d2, nickname: "Bob", startX: 1000, startY: 1000 });

    // Run for a bit
    for (let i = 0; i < 20; i++) {
      sim.applyInput("p1", { angle: 1.0 });
      sim.tick(FIXED_DT);
    }

    const snap = sim.serialize();
    const restored = SnakeSim.restore(snap);

    // Both sims should produce identical snapshots at the same cull center
    const s1 = sim.snapshot(1000, 1000);
    const s2 = restored.snapshot(1000, 1000);

    expect(s1.snakes.length).toBe(s2.snakes.length);
    expect(s1.foods.length).toBe(s2.foods.length);
    if (s1.snakes.length > 0) {
      expect(s1.snakes[0].segments[0].x).toBeCloseTo(s2.snakes[0].segments[0].x, 5);
      expect(s1.snakes[0].segments[0].y).toBeCloseTo(s2.snakes[0].segments[0].y, 5);
    }
  });

  it("applyInput rejects NaN angles", () => {
    const sim = new SnakeSim(1);
    sim.addPlayer("p1", { color: 0xff0000, nickname: "test", startX: 500, startY: 500 });

    const snake = sim.world.snakes.get("p1");
    if (!snake) throw new Error("snake not found");
    const prevDirX = snake.pendingDirX;
    const prevDirY = snake.pendingDirY;

    const result = sim.applyInput("p1", { angle: Number.NaN });
    expect(result).toBe(false);
    expect(snake.pendingDirX).toBe(prevDirX);
    expect(snake.pendingDirY).toBe(prevDirY);
  });

  it("applyInput rejects non-finite angles", () => {
    const sim = new SnakeSim(1);
    sim.addPlayer("p1", { color: 0xff0000, nickname: "test", startX: 500, startY: 500 });

    expect(sim.applyInput("p1", { angle: Number.POSITIVE_INFINITY })).toBe(false);
    expect(sim.applyInput("p1", { angle: Number.NEGATIVE_INFINITY })).toBe(false);
  });

  it("applyInput rejects non-boolean boostActive", () => {
    const sim = new SnakeSim(1);
    sim.addPlayer("p1", { color: 0xff0000, nickname: "test", startX: 500, startY: 500 });

    // Cast to bypass TS type checking - simulating bad network input
    expect(sim.applyInput("p1", { boostActive: "true" as unknown as boolean })).toBe(false);
    expect(sim.applyInput("p1", { boostActive: 1 as unknown as boolean })).toBe(false);
  });

  it("addPlayer / removePlayer maintains snake list", () => {
    const sim = new SnakeSim(1);
    expect(sim.world.snakes.size).toBe(0);

    sim.addPlayer("p1", { color: 0xff0000, nickname: "Alice" });
    sim.addPlayer("p2", { color: 0x0000ff, nickname: "Bob" });
    expect(sim.world.snakes.size).toBe(2);

    sim.removePlayer("p1");
    expect(sim.world.snakes.size).toBe(1);
    expect(sim.world.snakes.has("p2")).toBe(true);
    expect(sim.world.snakes.has("p1")).toBe(false);
  });

  it("tick emits snake_died on OOB", () => {
    const sim = new SnakeSim(1);
    // Place snake near the right edge so it will go OOB
    sim.addPlayer("p1", {
      color: 0xff0000,
      nickname: "edge",
      startX: tuning.world.widthPx - 5,
      startY: tuning.world.heightPx / 2,
    });

    // Point snake to the right (toward OOB)
    sim.applyInput("p1", { angle: 0 }); // angle 0 = cos(0)=1, sin(0)=0 -> rightward

    let deathEvents: { type: string }[] = [];
    // Tick until OOB or max 100 ticks
    for (let i = 0; i < 100; i++) {
      const events = sim.tick(FIXED_DT);
      deathEvents = deathEvents.concat(events.filter((e) => e.type === "snake_died"));
      if (deathEvents.length > 0) break;
    }

    expect(deathEvents.length).toBeGreaterThan(0);
    expect(deathEvents[0].type).toBe("snake_died");
  });

  it("tick emits food_eaten when head intersects pellet", () => {
    const sim = new SnakeSim(1);
    sim.addPlayer("p1", { color: 0xff0000, nickname: "eater", startX: 500, startY: 500 });

    // Inject a food item at the snake's exact head position via FoodState
    const foodData = sim.foodState.serialize();
    foodData.foods.push({ id: "testfood", x: 500, y: 500, isPellet: false });
    sim.foodState = FoodState.restore(foodData);

    const events = sim.tick(FIXED_DT);
    const eatEvents = events.filter((e) => e.type === "food_eaten");
    expect(eatEvents.length).toBeGreaterThan(0);
  });

  it("snapshot culls to viewRadius", () => {
    const sim = new SnakeSim(1);
    // Place player at center
    sim.addPlayer("center", { color: 0xff0000, nickname: "c", startX: 2000, startY: 2000 });
    // Place a second player far away
    sim.addPlayer("far", { color: 0x0000ff, nickname: "f", startX: 10, startY: 10 });

    const snap = sim.snapshot(2000, 2000);

    // "center" snake should be in snapshot; "far" should NOT
    const centerInSnap = snap.snakes.find((s) => s.id === "center");
    const farInSnap = snap.snakes.find((s) => s.id === "far");

    expect(centerInSnap).toBeDefined();
    expect(farInSnap).toBeUndefined();
  });

  it("snapshot includes segments + scale + boostActive", () => {
    const sim = new SnakeSim(1);
    sim.addPlayer("p1", { color: 0xff0000, nickname: "test", startX: 500, startY: 500 });
    sim.applyInput("p1", { boostActive: false });
    sim.tick(FIXED_DT);

    const snap = sim.snapshot(500, 500);
    expect(snap.snakes.length).toBeGreaterThan(0);

    const s = snap.snakes[0];
    expect(Array.isArray(s.segments)).toBe(true);
    expect(s.segments.length).toBeGreaterThan(0);
    expect(typeof s.scale).toBe("number");
    expect(s.scale).toBeGreaterThan(0);
    expect(typeof s.boostActive).toBe("boolean");
  });
});
