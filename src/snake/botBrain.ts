import type { World } from "../sim/world";
import { tuning } from "../tuning";
import type { Snake } from "./snake";

export type BotState = "wander" | "seek_food" | "flee";

export interface BotPersonality {
  aggression: number;
  caution: number;
  greed: number;
  attention: number;
}

function randInRange(range: { min: number; max: number }): number {
  return range.min + Math.random() * (range.max - range.min);
}

export class BotBrain {
  readonly personality: BotPersonality;

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

  private cachedDecision: { state: BotState; dirX: number; dirY: number } | null = null;
  private cacheFramesRemaining = 0;

  constructor(personality?: BotPersonality) {
    this.personality = personality ?? BotBrain.randomPersonality();
    this.wanderTarget = this.pickRandomTarget();
    this.driftPhase = Math.random() * Math.PI * 2;
  }

  static randomPersonality(): BotPersonality {
    return {
      aggression: randInRange(tuning.bot.personalityRange.aggression),
      caution: randInRange(tuning.bot.personalityRange.caution),
      greed: randInRange(tuning.bot.personalityRange.greed),
      attention: randInRange(tuning.bot.personalityRange.attention),
    };
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
    const cx = tuning.world.widthPx / 2;
    const cy = tuning.world.heightPx / 2;
    const halfDiag = Math.hypot(cx, cy);
    let best = { x: 0, y: 0 };
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < tuning.bot.wanderCandidates; i++) {
      const x = Math.random() * tuning.world.widthPx;
      const y = Math.random() * tuning.world.heightPx;
      const dist = Math.hypot(x - cx, y - cy);
      const score = 1 - dist / halfDiag;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    return best;
  }

  update(
    snake: Snake,
    world: World,
    foods: ReadonlyArray<{ x: number; y: number }>,
    dt: number,
  ): { dirX: number; dirY: number } {
    this.elapsedMs += dt * 1000;

    if (this.cacheFramesRemaining <= 0 || this.cachedDecision === null) {
      this.cachedDecision = this.evaluateState(snake, world, foods, dt);
      const maxCache = Math.round(
        tuning.bot.attentionCacheFrames * (1 - this.personality.attention),
      );
      this.cacheFramesRemaining = maxCache;
    } else {
      this.cacheFramesRemaining--;
    }

    let dirX = this.cachedDecision.dirX;
    let dirY = this.cachedDecision.dirY;
    if (this.cachedDecision.state !== "flee") {
      const a = Math.atan2(dirY, dirX) + this.drift();
      dirX = Math.cos(a);
      dirY = Math.sin(a);
    }
    return this.smooth(dirX, dirY, dt);
  }

  // evaluateState produces a UNIT DIRECTION vector. It does NOT apply drift
  // and does NOT call smooth() - that's the per-frame post-pass in update().
  private evaluateState(
    snake: Snake,
    world: World,
    foods: ReadonlyArray<{ x: number; y: number }>,
    _dt: number,
  ): { state: BotState; dirX: number; dirY: number } {
    const head = snake.segments[0];

    // Avoid (highest priority): non-self segment in forward hemisphere within
    // cautious flee radius. Higher caution = bigger effective flee radius.
    const headingX = this.currentDirX;
    const headingY = this.currentDirY;
    const hasHeading = headingX !== 0 || headingY !== 0;
    let nearestThreat: { x: number; y: number } | null = null;
    let nearestThreatDistSq = Number.POSITIVE_INFINITY;
    const effectiveFleeR =
      tuning.bot.fleeRadiusPx * (1 + tuning.bot.cautionFleeRadiusBonus * this.personality.caution);
    const fr2 = effectiveFleeR * effectiveFleeR;
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
      const dx = head.x - nearestThreat.x;
      const dy = head.y - nearestThreat.y;
      const len = Math.hypot(dx, dy) || 1;
      return { state: "flee", dirX: dx / len, dirY: dy / len };
    }

    // Seek food: density-weighted scoring among forward-hemisphere foods in range.
    const sr = tuning.bot.seekRadiusPx;
    const seekR2 = sr * sr;
    const densityR2 = tuning.bot.densityRadiusPx * tuning.bot.densityRadiusPx;
    const greedFactor = 1 + tuning.bot.greedClusterWeight * this.personality.greed;
    const hasHeadingNow = this.currentDirX !== 0 || this.currentDirY !== 0;

    const inRangeFoods: { x: number; y: number; d2: number }[] = [];
    for (const f of foods) {
      const dx = f.x - head.x;
      const dy = f.y - head.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= seekR2) continue;
      if (hasHeadingNow) {
        const alignment = dx * this.currentDirX + dy * this.currentDirY;
        if (alignment <= 0) continue;
      }
      inRangeFoods.push({ x: f.x, y: f.y, d2 });
    }

    let bestFood: { x: number; y: number } | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const f of inRangeFoods) {
      let density = 0;
      for (const other of inRangeFoods) {
        if (other === f) continue;
        const ddx = other.x - f.x;
        const ddy = other.y - f.y;
        if (ddx * ddx + ddy * ddy < densityR2) density++;
      }
      const distScore = 1 - Math.sqrt(f.d2) / sr;
      const densityScore = density / 5;
      const score = distScore + densityScore * greedFactor;
      if (score > bestScore) {
        bestScore = score;
        bestFood = { x: f.x, y: f.y };
      }
    }
    if (bestFood) {
      const dx = bestFood.x - head.x;
      const dy = bestFood.y - head.y;
      const len = Math.hypot(dx, dy) || 1;
      return { state: "seek_food", dirX: dx / len, dirY: dy / len };
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
    const dx = this.wanderTarget.x - head.x;
    const dy = this.wanderTarget.y - head.y;
    const len = Math.hypot(dx, dy) || 1;
    return { state: "wander", dirX: dx / len, dirY: dy / len };
  }

  // internal use only - testing
  get debugCachedState(): BotState | null {
    return this.cachedDecision?.state ?? null;
  }

  // internal use only - testing. Raw evaluateState direction before drift/smoothing.
  get debugCachedDir(): { dirX: number; dirY: number } {
    return {
      dirX: this.cachedDecision?.dirX ?? 0,
      dirY: this.cachedDecision?.dirY ?? 0,
    };
  }

  // internal use only - testing
  get debugWanderTarget(): { x: number; y: number } {
    return this.wanderTarget;
  }
}
