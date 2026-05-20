import type { SnakeRenderState } from "../../shared/protocol";
import { Snake } from "../snake/snake";
import { tuning } from "../tuning";

// Client-side prediction for the local player's snake. Runs Snake.update
// at frame rate against current pointer/boost input; reconciles against
// each server snapshot by snap-resetting on dead-state change,
// segment-count change, or head drift beyond tuning.net.predictionSnapThresholdPx.
// Other reconciliation modes (smooth lerp on snap, input replay) are
// deferred to Phase 7.2.
export interface ReconcileResult {
  snapped: boolean;
  reason?: "first-snapshot" | "dead" | "segment-count" | "drift";
}

export class ClientPrediction {
  private snake: Snake | null = null;

  constructor(private readonly snakeId: string) {}

  private resetFrom(state: SnakeRenderState): void {
    const head = state.segments[0];
    const snake = new Snake(head.x, head.y, {
      id: this.snakeId,
      ownerType: "player",
      color: state.color,
      initialLength: state.segments.length,
    });
    // Overwrite segments to match server exactly. headPath rebuilds itself
    // on subsequent update() calls.
    snake.segments.length = 0;
    for (const s of state.segments) snake.segments.push({ x: s.x, y: s.y });
    snake.dead = !state.alive;
    snake.boostActive = state.boostActive;
    this.snake = snake;
  }

  // Advance the local snake by dtSec with the current input. No-op if no
  // snake yet, dead, or dtSec is implausible (tab was hidden -> huge dt
  // would explode prediction; 0 or negative = nothing to integrate).
  step(dtSec: number, dirX: number, dirY: number, boostActive: boolean): void {
    if (!this.snake || this.snake.dead) return;
    if (dtSec <= 0 || dtSec > 0.25) return;
    this.snake.pendingDirX = dirX;
    this.snake.pendingDirY = dirY;
    this.snake.boostActive = boostActive;
    this.snake.update(dtSec);
  }

  // Compare against server snapshot, snap-reset if needed.
  reconcile(state: SnakeRenderState): ReconcileResult {
    if (!this.snake) {
      this.resetFrom(state);
      return { snapped: true, reason: "first-snapshot" };
    }
    if (!state.alive && !this.snake.dead) {
      this.resetFrom(state);
      return { snapped: true, reason: "dead" };
    }
    if (this.snake.segments.length !== state.segments.length) {
      this.resetFrom(state);
      return { snapped: true, reason: "segment-count" };
    }
    const ph = this.snake.segments[0];
    const sh = state.segments[0];
    const dx = ph.x - sh.x;
    const dy = ph.y - sh.y;
    const t = tuning.net.predictionSnapThresholdPx;
    if (dx * dx + dy * dy > t * t) {
      this.resetFrom(state);
      return { snapped: true, reason: "drift" };
    }
    return { snapped: false };
  }

  getSnake(): Snake | null {
    return this.snake;
  }
}
