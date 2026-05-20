import { FoodState } from "../../../shared/foodState";
import type { FoodRenderState, MinimapHead, SnakeRenderState } from "../../../shared/protocol";
import { SeededRng } from "../../../shared/seededRng";
import { World } from "../../../src/sim/world";
import { Snake } from "../../../src/snake/snake";
import { tuning } from "../../../src/tuning";

export type SimEvent =
  | { type: "snake_died"; snakeId: string; killedBy: string | null }
  | { type: "food_eaten"; ids: string[]; snakeId: string };

export interface SimSnapshot {
  rngState: number;
  elapsedMs: number;
  snakes: Array<{
    id: string;
    ownerType: "player" | "bot";
    color: number;
    segments: Array<{ x: number; y: number }>;
    growth: number;
    dead: boolean;
    killedBy: string | null;
    boostActive: boolean;
  }>;
  food: ReturnType<FoodState["serialize"]>;
}

export interface AddPlayerConfig {
  color: number;
  nickname: string;
  startX?: number;
  startY?: number;
}

export class SnakeSim {
  // Exposed as readonly for tests and Room DO to inspect snake state.
  readonly world: World;
  // Exposed as public for tests and Room DO snapshot injection.
  foodState: FoodState;
  private rng: SeededRng;
  private elapsedMs = 0;
  private events: SimEvent[] = [];

  constructor(seed: number) {
    this.rng = new SeededRng(seed);
    this.foodState = new FoodState(seed);
    this.world = new World({
      onSnakeDied: (snakeId, killedBy) => {
        const snake = this.world.snakes.get(snakeId);
        if (snake) {
          // Burst pellets from dying snake's body
          this.foodState.spawnPelletBurst(snake.segments);
        }
        this.events.push({ type: "snake_died", snakeId, killedBy });
      },
    });
    this.foodState.topUp(this.world.snakes.values());
  }

  addPlayer(snakeId: string, config: AddPlayerConfig): void {
    const startX = config.startX ?? this.rng.range(200, tuning.world.widthPx - 200);
    const startY = config.startY ?? this.rng.range(200, tuning.world.heightPx - 200);
    const snake = new Snake(startX, startY, {
      id: snakeId,
      ownerType: "player",
      color: config.color,
    });
    this.world.addSnake(snake);
  }

  removePlayer(snakeId: string): void {
    this.world.removeSnake(snakeId);
  }

  addBot(snakeId: string, color: number, startX: number, startY: number): void {
    const snake = new Snake(startX, startY, {
      id: snakeId,
      ownerType: "bot",
      color,
    });
    this.world.addSnake(snake);
  }

  // Validates input. Rejects NaN, Infinity, out-of-range. Server returns
  // false to indicate the input was rejected (caller may log/rate-limit).
  applyInput(snakeId: string, input: { angle?: number; boostActive?: boolean }): boolean {
    const snake = this.world.snakes.get(snakeId);
    if (!snake || snake.dead) return false;
    if (input.angle !== undefined) {
      if (typeof input.angle !== "number" || !Number.isFinite(input.angle)) return false;
      // Normalize angle to a unit direction vector
      snake.pendingDirX = Math.cos(input.angle);
      snake.pendingDirY = Math.sin(input.angle);
    }
    if (input.boostActive !== undefined) {
      if (typeof input.boostActive !== "boolean") return false;
      snake.boostActive = input.boostActive;
    }
    return true;
  }

  // Advance the sim by dt seconds. Returns events emitted this tick.
  // Caller should always pass 1 / tuning.net.serverTickHz (fixed step).
  tick(dt: number): SimEvent[] {
    this.events = [];
    this.elapsedMs += dt * 1000;
    this.world.update(dt);
    // Check eats for every alive snake. Also collect shed pellets from boost.
    for (const snake of this.world.snakes.values()) {
      if (snake.dead) continue;
      // Boost-shed pellets
      const shed = snake.consumeShedPositions();
      if (shed.length > 0) this.foodState.spawnPelletsAt(shed);
      // Eat check
      const result = this.foodState.checkEat(snake);
      if (result.eaten > 0) {
        this.events.push({
          type: "food_eaten",
          ids: result.eatenIds,
          snakeId: snake.id,
        });
      }
    }
    // Top up food after eats
    this.foodState.topUp(this.world.snakes.values());
    return this.events;
  }

  snapshot(
    cullCenterX: number,
    cullCenterY: number,
  ): {
    snakes: SnakeRenderState[];
    foods: FoodRenderState[];
    minimapHeads: MinimapHead[];
  } {
    const cullR = tuning.net.viewRadiusPx;
    const cullR2 = cullR * cullR;
    const snakes: SnakeRenderState[] = [];
    // Minimap heads: every snake's head position regardless of viewport
    // cull. Cheap (~32 bytes per entry, ~10 entries) so we always send it.
    // Without this, distant bots wouldn't show on the player's minimap.
    const minimapHeads: MinimapHead[] = [];
    for (const snake of this.world.snakes.values()) {
      const h = snake.segments[0];
      minimapHeads.push({
        id: snake.id,
        color: snake.color,
        x: h.x,
        y: h.y,
        dead: snake.dead,
        length: snake.segments.length,
      });
      // Snake segments only included for nearby snakes (rendering cost).
      const dx = h.x - cullCenterX;
      const dy = h.y - cullCenterY;
      if (dx * dx + dy * dy > cullR2) continue;
      snakes.push({
        id: snake.id,
        ownerType: snake.ownerType,
        color: snake.color,
        alive: !snake.dead,
        segments: snake.segments.map((s) => ({ x: s.x, y: s.y })),
        boostActive: snake.boostActive,
        scale: snake.scale,
      });
    }
    const foodItems = this.foodState.queryWithin(cullCenterX, cullCenterY, cullR);
    const foods: FoodRenderState[] = foodItems.map((f) => ({
      id: f.id,
      x: f.x,
      y: f.y,
      isPellet: f.isPellet,
    }));
    return { snakes, foods, minimapHeads };
  }

  serialize(): SimSnapshot {
    return {
      rngState: this.rng.getState(),
      elapsedMs: this.elapsedMs,
      snakes: Array.from(this.world.snakes.values()).map((s) => ({
        id: s.id,
        ownerType: s.ownerType,
        color: s.color,
        segments: s.segments.map((seg) => ({ x: seg.x, y: seg.y })),
        growth: s.growth,
        dead: s.dead,
        killedBy: s.killedBy,
        boostActive: s.boostActive,
      })),
      food: this.foodState.serialize(),
    };
  }

  static restore(data: SimSnapshot): SnakeSim {
    const sim = new SnakeSim(1);
    sim.rng.setState(data.rngState);
    sim.elapsedMs = data.elapsedMs;
    sim.foodState = FoodState.restore(data.food);
    // Reconstruct snakes. World starts empty from constructor; rebuild from serialized.
    for (const sd of data.snakes) {
      const snake = new Snake(sd.segments[0].x, sd.segments[0].y, {
        id: sd.id,
        ownerType: sd.ownerType,
        color: sd.color,
        initialLength: sd.segments.length,
      });
      // Overwrite segments to exactly match serialized
      snake.segments.length = 0;
      for (const seg of sd.segments) snake.segments.push({ x: seg.x, y: seg.y });
      snake.growth = sd.growth;
      snake.dead = sd.dead;
      snake.killedBy = sd.killedBy;
      snake.boostActive = sd.boostActive;
      sim.world.addSnake(snake);
    }
    return sim;
  }

  // Used by Room to spawn after a respawn request.
  respawnSnake(snakeId: string, color: number): void {
    const old = this.world.snakes.get(snakeId);
    if (!old || !old.dead) return;
    this.world.removeSnake(snakeId);
    this.addPlayer(snakeId, { color, nickname: "" });
  }
}
