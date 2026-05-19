/**
 * FoodState - pure food management with no rendering dependencies.
 *
 * Extracted from src/food/foodSpawner.ts so the server-side sim can use it
 * without importing Phaser. FoodSpawner now wraps this for client-side
 * rendering.
 */

import type { Snake } from "../src/snake/snake";
import { tuning } from "../src/tuning";
import { SeededRng } from "./seededRng";
import { SpatialHash } from "./spatialHash";

export interface FoodItem {
  id: string;
  x: number;
  y: number;
  isPellet: boolean;
}

export interface FoodEatResult {
  eaten: number; // count of foods this snake just ate
  eatenIds: string[]; // ids of eaten foods (for the food_eaten event)
}

export class FoodState {
  private foods = new Map<string, FoodItem>();
  private hash: SpatialHash<FoodItem>;
  private rng: SeededRng;
  private nextId = 1;

  constructor(seed: number) {
    this.rng = new SeededRng(seed);
    this.hash = new SpatialHash<FoodItem>(tuning.world.spatialBucketPx);
  }

  // Maintain target count. Rejects spawn points inside snake bodies via
  // rejection sampling against the world's snake list.
  topUp(snakes: Iterable<Snake>): void {
    while (this.foods.size < tuning.food.targetCount) {
      // pick a point not too close to any snake body
      let attempts = 0;
      let x = 0;
      let y = 0;
      while (attempts < 8) {
        x = this.rng.range(0, tuning.world.widthPx);
        y = this.rng.range(0, tuning.world.heightPx);
        let collides = false;
        for (const s of snakes) {
          if (s.dead) continue;
          for (const seg of s.segments) {
            const dx = seg.x - x;
            const dy = seg.y - y;
            const r = s.bodyRadius + tuning.food.radiusPx;
            if (dx * dx + dy * dy < r * r) {
              collides = true;
              break;
            }
          }
          if (collides) break;
        }
        if (!collides) break;
        attempts++;
      }
      const id = `f${this.nextId++}`;
      const item: FoodItem = { id, x, y, isPellet: false };
      this.foods.set(id, item);
      this.hash.insert(id, x, y, item);
    }
  }

  // Check if snake's head eats any food. Returns count + ids. Mutates the
  // food map (removes eaten items) and grows the snake.
  checkEat(snake: Snake): FoodEatResult {
    const head = snake.segments[0];
    const r = snake.headRadius + tuning.food.radiusPx;
    const nearby = this.hash.queryCircle(head.x, head.y, r);
    const eatenIds: string[] = [];
    for (const f of nearby) {
      if (!this.foods.has(f.id)) continue; // already removed this frame
      const dx = f.x - head.x;
      const dy = f.y - head.y;
      if (dx * dx + dy * dy < r * r) {
        const growth = f.isPellet
          ? tuning.death.pelletGrowthMultiplier * tuning.food.growthPerPellet
          : tuning.food.growthPerPellet;
        snake.grow(growth);
        this.foods.delete(f.id);
        this.hash.remove(f.id);
        eatenIds.push(f.id);
      }
    }
    return { eaten: eatenIds.length, eatenIds };
  }

  // Spawn pellets at explicit positions (boost shedding).
  spawnPelletsAt(positions: ReadonlyArray<{ x: number; y: number }>): void {
    for (const p of positions) {
      const id = `f${this.nextId++}`;
      const item: FoodItem = { id, x: p.x, y: p.y, isPellet: true };
      this.foods.set(id, item);
      this.hash.insert(id, p.x, p.y, item);
    }
  }

  // Spawn pellet burst from a dead snake's body (per pelletsPerSegment ratio).
  // No-op on empty segments (defensive - dead snakes always have segments in
  // normal play, but a respawn race could theoretically leave one empty).
  spawnPelletBurst(segments: ReadonlyArray<{ x: number; y: number }>): void {
    if (segments.length === 0) return;
    const count = Math.max(1, Math.floor(segments.length * tuning.death.pelletsPerSegment));
    for (let i = 0; i < count; i++) {
      const idx = this.rng.int(segments.length);
      const seg = segments[idx];
      const jx = this.rng.range(-tuning.death.pelletJitterPx, tuning.death.pelletJitterPx);
      const jy = this.rng.range(-tuning.death.pelletJitterPx, tuning.death.pelletJitterPx);
      const id = `f${this.nextId++}`;
      const item: FoodItem = { id, x: seg.x + jx, y: seg.y + jy, isPellet: true };
      this.foods.set(id, item);
      this.hash.insert(id, item.x, item.y, item);
    }
  }

  // Iterate all foods (for snapshot building).
  all(): IterableIterator<FoodItem> {
    return this.foods.values();
  }

  // For viewport culling: query the spatial hash.
  queryWithin(cx: number, cy: number, radius: number): FoodItem[] {
    return this.hash.queryCircle(cx, cy, radius);
  }

  size(): number {
    return this.foods.size;
  }

  // For serialization
  serialize(): { foods: FoodItem[]; nextId: number; rngState: number } {
    return {
      foods: Array.from(this.foods.values()),
      nextId: this.nextId,
      rngState: this.rng.getState(),
    };
  }

  static restore(data: { foods: FoodItem[]; nextId: number; rngState: number }): FoodState {
    const fs = new FoodState(1);
    fs.rng.setState(data.rngState);
    fs.nextId = data.nextId;
    for (const f of data.foods) {
      fs.foods.set(f.id, f);
      fs.hash.insert(f.id, f.x, f.y, f);
    }
    return fs;
  }
}
