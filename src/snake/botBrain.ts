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

    // Avoid check (highest priority): steer away from any non-self snake
    // segment - head or body - that sits within fleeRadiusPx AND in the
    // forward hemisphere of our current heading. Behind us we're already
    // moving away. This replaces the prior "flee only from bigger snake
    // heads" rule; bots now treat every body as an obstacle, which is
    // closer to how a real player plays.
    const headingX = this.currentDirX;
    const headingY = this.currentDirY;
    const hasHeading = headingX !== 0 || headingY !== 0;
    let nearestThreat: { x: number; y: number } | null = null;
    let nearestThreatDistSq = Number.POSITIVE_INFINITY;
    const fr = tuning.bot.fleeRadiusPx;
    const fr2 = fr * fr;
    for (const other of world.snakes.values()) {
      if (other.id === snake.id) continue;
      if (other.dead) continue;
      for (const s of other.segments) {
        const dx = s.x - head.x;
        const dy = s.y - head.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= fr2) continue;
        if (hasHeading) {
          const alignment = dx * headingX + dy * headingY;
          if (alignment <= 0) continue;
        }
        if (d2 < nearestThreatDistSq) {
          nearestThreat = s;
          nearestThreatDistSq = d2;
        }
      }
    }
    if (nearestThreat) {
      this.state = "flee";
      const dx = head.x - nearestThreat.x;
      const dy = head.y - nearestThreat.y;
      const len = Math.hypot(dx, dy) || 1;
      return this.smooth(dx / len, dy / len, dt);
    }

    // Seek food check. Only target food in the FORWARD hemisphere relative
    // to the bot's current heading - a pellet just behind the bot is
    // unreachable at our turn rate (the bot would orbit it forever) and
    // looks like a stuck bot to a player. If currentDir is not yet set
    // (very first update), skip seek and fall through to wander.
    let nearestFood: { x: number; y: number } | null = null;
    let nearestFoodDistSq = Number.POSITIVE_INFINITY;
    const hasHeadingNow = this.currentDirX !== 0 || this.currentDirY !== 0;
    for (const f of foods) {
      const dx = f.x - head.x;
      const dy = f.y - head.y;
      const d2 = dx * dx + dy * dy;
      const sr = tuning.bot.seekRadiusPx;
      if (d2 >= sr * sr) continue;
      if (hasHeadingNow) {
        // Dot with heading: positive means in front of the bot.
        const alignment = dx * this.currentDirX + dy * this.currentDirY;
        if (alignment <= 0) continue;
      }
      if (d2 < nearestFoodDistSq) {
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
