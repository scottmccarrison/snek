/**
 * FoodSpawner - Phaser client-side wrapper around FoodState.
 *
 * Food balance loop adapted from
 * https://github.com/owenashurst/agar.io-clone/blob/master/src/server/server.js
 * (MIT). Rewritten as a single-player client-side spawner.
 *
 * Pure state logic lives in shared/foodState.ts so the server sim can reuse
 * it without importing Phaser. FoodSpawner owns rendering only.
 */

import type * as Phaser from "phaser";
import { FoodState } from "../../shared/foodState";
import type { FoodItem } from "../../shared/foodState";
import type { Snake } from "../snake/snake";
import { tuning } from "../tuning";

// Re-export FoodItem so importers that referenced it from this module still work.
export type { FoodItem };

// Structural type - avoids circular dep with world.ts until it exists.
interface WorldLike {
  snakes: Map<string, Snake>;
}

export class FoodSpawner {
  private foodState: FoodState;
  private graphics: Phaser.GameObjects.Graphics;

  public get foodCount(): number {
    return this.foodState.size();
  }

  constructor(scene: Phaser.Scene) {
    // Client side uses a random seed per session so visuals vary each run.
    const seed = Math.floor(Math.random() * 0x7fffffff);
    this.foodState = new FoodState(seed);
    this.graphics = scene.add.graphics();
  }

  update(world: WorldLike): void {
    this.foodState.topUp(world.snakes.values());
    this.render();
  }

  /**
   * Spawn pellets at exact positions - used for boost-shed segments.
   * No jitter, no count math: each supplied position becomes one pellet.
   */
  spawnPelletsAt(positions: ReadonlyArray<{ x: number; y: number }>): void {
    this.foodState.spawnPelletsAt(positions);
    this.render();
  }

  spawnPelletBurst(segments: ReadonlyArray<{ x: number; y: number }>): void {
    this.foodState.spawnPelletBurst(segments);
    this.render();
  }

  getFoods(): ReadonlyArray<FoodItem> {
    return Array.from(this.foodState.all());
  }

  checkEat(snake: Snake): number {
    const result = this.foodState.checkEat(snake);
    return result.eaten;
  }

  // Expose FoodState for tests and viewport queries.
  get state(): FoodState {
    return this.foodState;
  }

  private render(): void {
    this.graphics.clear();
    for (const f of this.foodState.all()) {
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
