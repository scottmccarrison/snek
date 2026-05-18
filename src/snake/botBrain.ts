import type { World } from "../sim/world";
import { tuning } from "../tuning";
import type { Snake } from "./snake";

export type BotState = "wander" | "seek_food" | "flee";

export class BotBrain {
  private state: BotState = "wander";
  private wanderTarget: { x: number; y: number };
  private lastResampleMs = 0;
  private elapsedMs = 0;
  // Per-bot phase offset so drifting bots don't all sway in sync. Stays
  // constant for the bot's lifetime.
  private driftPhase: number;

  constructor() {
    this.wanderTarget = this.pickRandomTarget();
    this.driftPhase = Math.random() * Math.PI * 2;
  }

  // Smooth sine-based angular perturbation. Applied to seek_food and wander
  // so bots don't head laser-straight at every pellet. Flee state skips this
  // (when a larger snake is chasing you, you go in a straight line).
  private drift(): number {
    return (
      Math.sin(this.elapsedMs * tuning.bot.driftFrequency + this.driftPhase) *
      tuning.bot.driftAngleRad
    );
  }

  private applyDrift(dx: number, dy: number): { dirX: number; dirY: number } {
    const baseAngle = Math.atan2(dy, dx);
    const a = baseAngle + this.drift();
    return { dirX: Math.cos(a), dirY: Math.sin(a) };
  }

  private pickRandomTarget(): { x: number; y: number } {
    return {
      x: Math.random() * tuning.world.widthPx,
      y: Math.random() * tuning.world.heightPx,
    };
  }

  update(
    snake: Snake,
    world: World,
    foods: ReadonlyArray<{ x: number; y: number }>,
    dt: number,
  ): { dirX: number; dirY: number } {
    this.elapsedMs += dt * 1000;
    const head = snake.segments[0];

    // Flee check (highest priority): flee from snakes larger than self.
    let nearestThreat: { x: number; y: number } | null = null;
    let nearestThreatDistSq = Number.POSITIVE_INFINITY;
    for (const other of world.snakes.values()) {
      if (other.id === snake.id) continue;
      if (other.dead) continue;
      if (other.segments.length <= snake.segments.length) continue;
      const oh = other.segments[0];
      const dx = oh.x - head.x;
      const dy = oh.y - head.y;
      const d2 = dx * dx + dy * dy;
      const fr = tuning.bot.fleeRadiusPx;
      if (d2 < fr * fr && d2 < nearestThreatDistSq) {
        nearestThreat = { x: oh.x, y: oh.y };
        nearestThreatDistSq = d2;
      }
    }
    if (nearestThreat) {
      this.state = "flee";
      const dx = head.x - nearestThreat.x;
      const dy = head.y - nearestThreat.y;
      const len = Math.hypot(dx, dy) || 1;
      return { dirX: dx / len, dirY: dy / len };
    }

    // Seek food check.
    let nearestFood: { x: number; y: number } | null = null;
    let nearestFoodDistSq = Number.POSITIVE_INFINITY;
    for (const f of foods) {
      const dx = f.x - head.x;
      const dy = f.y - head.y;
      const d2 = dx * dx + dy * dy;
      const sr = tuning.bot.seekRadiusPx;
      if (d2 < sr * sr && d2 < nearestFoodDistSq) {
        nearestFood = f;
        nearestFoodDistSq = d2;
      }
    }
    if (nearestFood) {
      this.state = "seek_food";
      return this.applyDrift(nearestFood.x - head.x, nearestFood.y - head.y);
    }

    // Wander: resample target periodically.
    if (
      this.state !== "wander" ||
      this.elapsedMs - this.lastResampleMs > tuning.bot.wanderResampleMs
    ) {
      this.wanderTarget = this.pickRandomTarget();
      this.lastResampleMs = this.elapsedMs;
    }
    this.state = "wander";
    return this.applyDrift(this.wanderTarget.x - head.x, this.wanderTarget.y - head.y);
  }
}
