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
  // Smoothed heading. The bot's FSM produces a TARGET direction each frame;
  // we rotate currentDir toward target at tuning.bot.turnRateRadPerSec to
  // prevent instant flips (which produced sharp angles in the body).
  private currentDirX = 0;
  private currentDirY = 0;
  private hasHeading = false;

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

  // Smooth currentDir toward the target direction at the bot turn rate.
  // First call snaps directly (no prior heading). Subsequent calls clamp
  // the angular delta to maxStep = turnRate * dt.
  private smooth(
    targetDirX: number,
    targetDirY: number,
    dt: number,
  ): { dirX: number; dirY: number } {
    if (!this.hasHeading) {
      this.currentDirX = targetDirX;
      this.currentDirY = targetDirY;
      this.hasHeading = true;
      return { dirX: this.currentDirX, dirY: this.currentDirY };
    }
    const currentAngle = Math.atan2(this.currentDirY, this.currentDirX);
    const targetAngle = Math.atan2(targetDirY, targetDirX);
    let delta = targetAngle - currentAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const maxStep = tuning.bot.turnRateRadPerSec * dt;
    const step = Math.max(-maxStep, Math.min(maxStep, delta));
    const newAngle = currentAngle + step;
    this.currentDirX = Math.cos(newAngle);
    this.currentDirY = Math.sin(newAngle);
    return { dirX: this.currentDirX, dirY: this.currentDirY };
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
      return this.smooth(dx / len, dy / len, dt);
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
      const target = this.applyDrift(nearestFood.x - head.x, nearestFood.y - head.y);
      return this.smooth(target.dirX, target.dirY, dt);
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
    const target = this.applyDrift(this.wanderTarget.x - head.x, this.wanderTarget.y - head.y);
    return this.smooth(target.dirX, target.dirY, dt);
  }
}
