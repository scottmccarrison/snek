/**
 * FoodSpawner - maintains tuning.food.targetCount pellets in the world,
 * rejection-sampling to keep them out of snake bodies.
 *
 * Food balance loop adapted from
 * https://github.com/owenashurst/agar.io-clone/blob/master/src/server/server.js
 * (MIT). Rewritten as a single-player client-side spawner.
 */

import type * as Phaser from "phaser";
import type { SpatialHash } from "../../shared/spatialHash";
import type { Snake } from "../snake/snake";
import { tuning } from "../tuning";

export interface FoodItem {
  id: string;
  x: number;
  y: number;
  isPellet: boolean;
}

// Structural type - avoids circular dep with world.ts until it exists.
interface WorldLike {
  snakes: Map<string, Snake>;
}

export class FoodSpawner {
  private foods: Map<string, FoodItem> = new Map();
  private graphics: Phaser.GameObjects.Graphics;
  private nextId = 0;

  public get foodCount(): number {
    return this.foods.size;
  }

  constructor(
    scene: Phaser.Scene,
    private hash: SpatialHash<FoodItem>,
  ) {
    this.graphics = scene.add.graphics();
  }

  update(world: WorldLike): void {
    let attempts = 0;
    const maxAttempts = tuning.food.targetCount * 20;
    while (this.foods.size < tuning.food.targetCount && attempts < maxAttempts) {
      attempts++;
      const x = Math.random() * tuning.world.widthPx;
      const y = Math.random() * tuning.world.heightPx;
      let collides = false;
      for (const s of world.snakes.values()) {
        if (s.dead) continue;
        if (this.collidesWithSnakeBody(x, y, s)) {
          collides = true;
          break;
        }
      }
      if (collides) continue;
      const id = `food-${this.nextId++}`;
      const item: FoodItem = { id, x, y, isPellet: false };
      this.foods.set(id, item);
      this.hash.insert(id, x, y, item);
    }
    this.render();
  }

  private collidesWithSnakeBody(x: number, y: number, snake: Snake): boolean {
    const r = tuning.food.radiusPx + snake.bodyRadius;
    const r2 = r * r;
    for (const seg of snake.segments) {
      const dx = seg.x - x;
      const dy = seg.y - y;
      if (dx * dx + dy * dy < r2) return true;
    }
    return false;
  }

  /**
   * Spawn pellets at exact positions - used for boost-shed segments.
   * No jitter, no count math: each supplied position becomes one pellet.
   * Pellets reuse tuning.death.pelletGrowthMultiplier so they behave
   * identically to death pellets when eaten.
   */
  spawnPelletsAt(positions: ReadonlyArray<{ x: number; y: number }>): void {
    for (const pos of positions) {
      const id = `pellet-${this.nextId++}`;
      const item: FoodItem = { id, x: pos.x, y: pos.y, isPellet: true };
      this.foods.set(id, item);
      this.hash.insert(id, item.x, item.y, item);
    }
    this.render();
  }

  spawnPelletBurst(segments: ReadonlyArray<{ x: number; y: number }>): void {
    const count = Math.max(1, Math.floor(segments.length * tuning.death.pelletsPerSegment));
    const step = segments.length / count;
    for (let i = 0; i < count; i++) {
      const idx = Math.min(segments.length - 1, Math.floor(i * step));
      const seg = segments[idx];
      const jx = (Math.random() * 2 - 1) * tuning.death.pelletJitterPx;
      const jy = (Math.random() * 2 - 1) * tuning.death.pelletJitterPx;
      const id = `pellet-${this.nextId++}`;
      const item: FoodItem = { id, x: seg.x + jx, y: seg.y + jy, isPellet: true };
      this.foods.set(id, item);
      this.hash.insert(id, item.x, item.y, item);
    }
    this.render();
  }

  getFoods(): ReadonlyArray<FoodItem> {
    return Array.from(this.foods.values());
  }

  checkEat(snake: Snake): number {
    const head = snake.segments[0];
    const r = snake.headRadius + tuning.food.radiusPx;
    const r2 = r * r;
    const candidates = this.hash.queryCircle(head.x, head.y, r);
    let eaten = 0;
    for (const f of candidates) {
      if (!this.foods.has(f.id)) continue; // already removed this frame
      const dx = head.x - f.x;
      const dy = head.y - f.y;
      if (dx * dx + dy * dy < r2) {
        this.foods.delete(f.id);
        this.hash.remove(f.id);
        const growthMultiplier = f.isPellet ? tuning.death.pelletGrowthMultiplier : 1;
        snake.grow(tuning.food.growthPerPellet * growthMultiplier);
        eaten++;
      }
    }
    return eaten;
  }

  private render(): void {
    this.graphics.clear();
    for (const f of this.foods.values()) {
      if (f.isPellet) {
        this.graphics.fillStyle(tuning.death.pelletColor);
        this.graphics.fillCircle(f.x, f.y, tuning.death.pelletRadiusPx);
      } else {
        this.graphics.fillStyle(tuning.food.color);
        this.graphics.fillCircle(f.x, f.y, tuning.food.radiusPx);
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
