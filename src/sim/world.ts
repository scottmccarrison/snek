import type { Snake } from "../snake/snake";
import { tuning } from "../tuning";

export interface WorldEvents {
  onSnakeDied(snakeId: string, killedBy: string | null): void;
}

export class World {
  readonly snakes: Map<string, Snake> = new Map();

  constructor(private events: WorldEvents) {}

  addSnake(snake: Snake): void {
    this.snakes.set(snake.id, snake);
  }

  removeSnake(id: string): void {
    this.snakes.delete(id);
  }

  update(dt: number): void {
    for (const snake of this.snakes.values()) {
      if (snake.dead) continue;
      snake.update(dt);
    }
    this.checkSnakeVsSnake();
  }

  /** Exposed for unit tests that need to check collisions without running kinematics. */
  checkCollisionsNow(): void {
    this.checkSnakeVsSnake();
  }

  private checkSnakeVsSnake(): void {
    // Snapshot alive list before any kills - all snakes are still "alive" for
    // the duration of this pass so mutual kills both register in the same frame.
    const alive = Array.from(this.snakes.values()).filter((s) => !s.dead);
    const r = tuning.snake.headRadiusPx + tuning.snake.bodyRadiusPx;
    const r2 = r * r;
    // Collect pending deaths without calling die() yet, so A's death does not
    // prevent B from also dying when both heads land on the other's body.
    const pendingDeaths = new Map<string, string | null>(); // snakeId -> killedBy
    for (const head of alive) {
      if (pendingDeaths.has(head.id)) continue; // already scheduled to die
      const h = head.segments[0];
      for (const other of alive) {
        if (other.id === head.id) continue;
        for (let i = 1; i < other.segments.length; i++) {
          const s = other.segments[i];
          const dx = h.x - s.x;
          const dy = h.y - s.y;
          if (dx * dx + dy * dy < r2) {
            pendingDeaths.set(head.id, other.id);
            break;
          }
        }
        if (pendingDeaths.has(head.id)) break;
      }
    }
    // Apply all deaths at once, then emit events.
    for (const [snakeId, killedBy] of pendingDeaths) {
      const snake = this.snakes.get(snakeId);
      if (snake) snake.die(killedBy ?? undefined);
      this.events.onSnakeDied(snakeId, killedBy);
    }
  }
}
