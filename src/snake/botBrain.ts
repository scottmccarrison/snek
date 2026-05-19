import type { World } from "../sim/world";
import { tuning } from "../tuning";
import type { Snake } from "./snake";

export type BotState = "wander" | "seek_food" | "flee" | "hunt";

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

  private lastTargetPos: { x: number; y: number } | null = null;
  private lastTargetSnakeId: string | null = null;
  private lastTargetMs = 0;
  private lastThreatDist: number | null = null;

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

    // Hunters need per-frame velocity sampling for lead-the-target.
    // Force re-evaluation regardless of attention cache.
    if (this.cachedDecision?.state === "hunt") {
      this.cacheFramesRemaining = 0;
    }

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
    dt: number,
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
    // Self-body avoidance: treat the bot's own segments past the curve-skip
    // count as threats too. Without this, a long bot turning sharply curves
    // into itself and dies (its own body is invisible to the avoid scan).
    // Skip math mirrors Snake.checkSelfCollision: skip a full turning-circle
    // worth of segments past the base skip so normal turning doesn't trigger.
    // Only runs once heading is known; on the spawn frame the body is right
    // behind the head and would always be "in range" without a hemisphere
    // filter, falsely triggering flee.
    if (hasHeading) {
      const turnRadius = tuning.snake.speedPxPerSec / tuning.snake.turnRateRadPerSec;
      const segmentsPerTurn = Math.ceil((2 * Math.PI * turnRadius) / tuning.snake.spacingPx);
      const selfSkip = tuning.snake.selfCollisionSkip + segmentsPerTurn;
      for (let i = selfSkip; i < snake.segments.length; i++) {
        const s = snake.segments[i];
        const dx = s.x - head.x;
        const dy = s.y - head.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= fr2) continue;
        const alignment = dx * headingX + dy * headingY;
        if (alignment <= 0) continue;
        if (d2 < nearestThreatDistSq) {
          nearestThreat = s;
          nearestThreatDistSq = d2;
        }
      }
    }
    // Wall avoidance: treat the nearest point on each world edge as a
    // virtual threat. Forward-hemisphere filter means the bot only flees
    // when actually heading at a wall (parallel or away = no flee). Without
    // this, a bot that's fleeing a body threat can be pushed straight into
    // the edge with no warning.
    const wallPoints = [
      { x: 0, y: head.y },
      { x: tuning.world.widthPx, y: head.y },
      { x: head.x, y: 0 },
      { x: head.x, y: tuning.world.heightPx },
    ];
    for (const w of wallPoints) {
      const dx = w.x - head.x;
      const dy = w.y - head.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= fr2) continue;
      if (hasHeading) {
        const alignment = dx * headingX + dy * headingY;
        if (alignment <= 0) continue;
      }
      if (d2 < nearestThreatDistSq) {
        nearestThreat = w;
        nearestThreatDistSq = d2;
      }
    }
    if (nearestThreat) {
      let fleeX = head.x - nearestThreat.x;
      let fleeY = head.y - nearestThreat.y;
      const fleeLen = Math.hypot(fleeX, fleeY) || 1;
      fleeX /= fleeLen;
      fleeY /= fleeLen;

      const threatDist = Math.sqrt(nearestThreatDistSq);
      if (
        this.lastThreatDist !== null &&
        threatDist < this.lastThreatDist &&
        threatDist < tuning.bot.curlActivationThreatRange
      ) {
        // Closing AND close: curl. Direction is per-bot consistent via driftPhase.
        // Note: Phaser uses y-down screen coords, so a positive angle in
        // (cos -sin / sin cos) rotates CLOCKWISE on screen. Both signs are valid.
        const perpBias = tuning.bot.curlPerpBias * (1 - this.personality.caution);
        let angle = this.driftPhase < Math.PI ? perpBias : -perpBias;

        // Don't curl into a wall: probe ahead and flip sign if OOB.
        const lookAhead = 30;
        const probe = (a: number) => {
          const c = Math.cos(a);
          const s = Math.sin(a);
          const px = head.x + (fleeX * c - fleeY * s) * lookAhead;
          const py = head.y + (fleeX * s + fleeY * c) * lookAhead;
          return px > 0 && px < tuning.world.widthPx && py > 0 && py < tuning.world.heightPx;
        };
        if (!probe(angle) && probe(-angle)) angle = -angle;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const newX = fleeX * cos - fleeY * sin;
        const newY = fleeX * sin + fleeY * cos;
        fleeX = newX;
        fleeY = newY;
      }
      this.lastThreatDist = threatDist;
      return { state: "flee", dirX: fleeX, dirY: fleeY };
    }

    // Hunt: long aggressive bots actively pursue smaller snakes.
    if (
      snake.segments.length >= tuning.bot.huntThresholdLength &&
      this.personality.aggression >= tuning.bot.huntAggressionThreshold
    ) {
      let prey: Snake | null = null;
      let preyDistSq = Number.POSITIVE_INFINITY;
      const huntR = tuning.bot.fleeRadiusPx * 2;
      const huntR2 = huntR * huntR;
      for (const other of world.snakes.values()) {
        if (other.id === snake.id) continue;
        if (other.dead) continue;
        if (other.segments.length > snake.segments.length * tuning.bot.preyLengthRatio) continue;
        const oh = other.segments[0];
        const dx = oh.x - head.x;
        const dy = oh.y - head.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < huntR2 && d2 < preyDistSq) {
          prey = other;
          preyDistSq = d2;
        }
      }
      if (prey) {
        const lead = this.leadPosition(prey, head, dt);
        const ldx = lead.x - head.x;
        const ldy = lead.y - head.y;
        const llen = Math.hypot(ldx, ldy) || 1;
        this.lastThreatDist = null;
        return { state: "hunt", dirX: ldx / llen, dirY: ldy / llen };
      }
      // No prey found - clear lead-tracking state.
      this.lastTargetSnakeId = null;
      this.lastTargetPos = null;
    }

    // Not in flee state - reset threat distance tracking.
    this.lastThreatDist = null;

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

  private leadPosition(
    prey: Snake,
    head: { x: number; y: number },
    dt: number,
  ): { x: number; y: number } {
    const preyHead = prey.segments[0];
    let leadX = preyHead.x;
    let leadY = preyHead.y;
    const now = this.elapsedMs;
    // Velocity sample valid only if we tracked this prey last frame.
    const sampleFresh =
      this.lastTargetSnakeId === prey.id &&
      this.lastTargetPos !== null &&
      now - this.lastTargetMs <= 2 * dt * 1000;
    if (sampleFresh && this.lastTargetPos) {
      const vx = (preyHead.x - this.lastTargetPos.x) / Math.max(dt, 1e-3);
      const vy = (preyHead.y - this.lastTargetPos.y) / Math.max(dt, 1e-3);
      const dx = preyHead.x - head.x;
      const dy = preyHead.y - head.y;
      const dist = Math.hypot(dx, dy);
      const t = Math.min(dist / tuning.snake.speedPxPerSec, tuning.bot.leadTimeMs / 1000);
      leadX = preyHead.x + vx * t;
      leadY = preyHead.y + vy * t;
    }
    this.lastTargetSnakeId = prey.id;
    this.lastTargetPos = { x: preyHead.x, y: preyHead.y };
    this.lastTargetMs = now;
    return { x: leadX, y: leadY };
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
