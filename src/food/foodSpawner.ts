/**
 * FoodSpawner - maintains tuning.food.targetCount pellets in the world,
 * rejection-sampling to keep them out of the snake's body.
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

  update(snake: Snake): void {
    let attempts = 0;
    const maxAttempts = tuning.food.targetCount * 20;
    while (this.foods.size < tuning.food.targetCount && attempts < maxAttempts) {
      attempts++;
      const x = Math.random() * tuning.world.widthPx;
      const y = Math.random() * tuning.world.heightPx;
      if (this.collidesWithSnake(x, y, snake)) continue;
      const id = `food-${this.nextId++}`;
      const item: FoodItem = { id, x, y };
      this.foods.set(id, item);
      this.hash.insert(id, x, y, item);
    }
    this.render();
  }

  private collidesWithSnake(x: number, y: number, snake: Snake): boolean {
    const r = tuning.food.radiusPx + tuning.snake.bodyRadiusPx;
    const r2 = r * r;
    for (const seg of snake.segments) {
      const dx = seg.x - x;
      const dy = seg.y - y;
      if (dx * dx + dy * dy < r2) return true;
    }
    return false;
  }

  checkEat(snake: Snake): number {
    const head = snake.segments[0];
    const r = tuning.snake.headRadiusPx + tuning.food.radiusPx;
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
        snake.grow(tuning.food.growthPerPellet);
        eaten++;
      }
    }
    return eaten;
  }

  private render(): void {
    this.graphics.clear();
    this.graphics.fillStyle(tuning.food.color);
    for (const f of this.foods.values()) {
      this.graphics.fillCircle(f.x, f.y, tuning.food.radiusPx);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
