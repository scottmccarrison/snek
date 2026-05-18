/**
 * Segment-chain snake kinematics. The head advances at constant speed
 * along a unit-vector direction; body segments trail along a deque of
 * recent head positions at fixed `spacingPx` cumulative distance.
 *
 * Algorithm adapted from
 * https://github.com/knagaitsev/slither.io-clone/blob/master/src/snake.js
 * (MIT). Rewritten in TypeScript; no source code copied.
 */

import { tuning } from "../tuning";

export interface SnakeSegment {
  x: number;
  y: number;
}

export interface SnakeConfig {
  id: string;
  ownerType: "player" | "bot";
  color: number;
  startX: number;
  startY: number;
  initialLength?: number;
}

export class Snake {
  readonly id: string;
  readonly ownerType: "player" | "bot";
  readonly color: number;
  readonly segments: SnakeSegment[];
  growth: number;
  dead: boolean;
  killedBy: string | null = null;
  pendingDirX = 0;
  pendingDirY = 0;

  private headPath: { x: number; y: number }[];

  constructor(
    startX: number,
    startY: number,
    config?: Partial<Omit<SnakeConfig, "startX" | "startY">>,
  ) {
    this.id = config?.id ?? "player";
    this.ownerType = config?.ownerType ?? "player";
    this.color = config?.color ?? tuning.snake.headColor;
    this.headPath = [];
    this.segments = [];
    this.growth = 0;
    this.dead = false;
    const len = config?.initialLength ?? tuning.snake.initialLength;
    this.resetWithLength(startX, startY, len);
  }

  reset(startX: number, startY: number): void {
    this.resetWithLength(startX, startY, tuning.snake.initialLength);
  }

  // Visual + collision scale derived from current length. Capped so growth
  // doesn't run away. At length=initialLength the scale is 1.0; doubling
  // length adds 0.5 to scale (log2-based), capped at tuning.snake.maxBodyScale.
  get scale(): number {
    const ratio = Math.max(1, this.segments.length / tuning.snake.initialLength);
    return Math.min(tuning.snake.maxBodyScale, 1 + Math.log2(ratio) * 0.5);
  }

  get headRadius(): number {
    return tuning.snake.headRadiusPx * this.scale;
  }

  get bodyRadius(): number {
    return tuning.snake.bodyRadiusPx * this.scale;
  }

  private resetWithLength(startX: number, startY: number, length: number): void {
    this.dead = false;
    this.killedBy = null;
    this.growth = 0;
    this.pendingDirX = 0;
    this.pendingDirY = 0;
    this.segments.length = 0;
    for (let i = 0; i < length; i++) {
      this.segments.push({ x: startX - i * tuning.snake.spacingPx, y: startY });
    }
    this.headPath = this.segments.map((s) => ({ x: s.x, y: s.y }));
  }

  update(dt: number, dirX?: number, dirY?: number): void {
    if (this.dead) return;

    // Use explicit args if provided, else fall back to pendingDir, else derive from heading.
    let dx = dirX ?? this.pendingDirX;
    let dy = dirY ?? this.pendingDirY;

    // If no input, continue current heading derived from head - next segment.
    if (dx === 0 && dy === 0) {
      const head = this.segments[0];
      const next = this.segments[1] ?? head;
      const ddx = head.x - next.x;
      const ddy = head.y - next.y;
      const len = Math.hypot(ddx, ddy) || 1;
      dx = ddx / len;
      dy = ddy / len;
    }

    const newHead = {
      x: this.segments[0].x + dx * tuning.snake.speedPxPerSec * dt,
      y: this.segments[0].y + dy * tuning.snake.speedPxPerSec * dt,
    };
    this.headPath.unshift(newHead);

    // Place segment 0 at new head position.
    this.segments[0].x = newHead.x;
    this.segments[0].y = newHead.y;

    // Place each subsequent segment along the path at cumulative distance i*spacingPx.
    // acc tracks cumulative distance from headPath[0] to headPath[pathIdx] (the
    // start of the current edge). On each i, walk forward until we find the edge
    // that contains the target distance, then interpolate inside it. Do NOT set
    // acc=target on placement: acc must stay anchored to pathIdx so the next i
    // can walk forward from the same edge.
    let acc = 0;
    let pathIdx = 0;

    for (let i = 1; i < this.segments.length; i++) {
      const target = i * tuning.snake.spacingPx;
      while (pathIdx < this.headPath.length - 1) {
        const a = this.headPath[pathIdx];
        const b = this.headPath[pathIdx + 1];
        const step = Math.hypot(a.x - b.x, a.y - b.y);
        if (acc + step >= target) {
          const frac = step > 0 ? (target - acc) / step : 0;
          this.segments[i].x = a.x + (b.x - a.x) * frac;
          this.segments[i].y = a.y + (b.y - a.y) * frac;
          break;
        }
        acc += step;
        pathIdx++;
      }
      if (pathIdx >= this.headPath.length - 1) {
        // Path exhausted; pin remaining segments to the last path point.
        const last = this.headPath[this.headPath.length - 1];
        this.segments[i].x = last.x;
        this.segments[i].y = last.y;
      }
    }

    // Trim deque: keep enough history to cover full length + safety buffer.
    // Be generous - prefer keeping too many entries to too few. At dt=1/60
    // and speed=180, body needs ~22 entries; cap at 256 to bound memory.
    const minEntriesNeeded =
      Math.ceil(
        (this.segments.length * tuning.snake.spacingPx) /
          Math.max(1e-3, tuning.snake.speedPxPerSec * dt),
      ) + 8;
    const cap = 256;
    const keep = Math.min(cap, Math.max(minEntriesNeeded, this.segments.length + 4));
    if (this.headPath.length > keep) this.headPath.length = keep;

    // Consume growth credit: append tail segments while growth > 0.
    while (this.growth > 0) {
      const last = this.segments[this.segments.length - 1];
      this.segments.push({ x: last.x, y: last.y });
      this.growth--;
    }
  }

  grow(n: number): void {
    this.growth += n;
  }

  checkSelfCollision(): boolean {
    const head = this.segments[0];
    // bodyRadius * 0.5 (not head+body radii): during tight turns the head is
    // visually "inside" the body chain, which should not be a death. Self-
    // death needs a clear head-body overlap, not a brushing of outer rings.
    const r = this.bodyRadius * 0.5;
    // Skip a full turning-circle worth of segments past the base skip.
    // Rationale: in a tight turn the body curves through a circle of
    // diameter ~2 * speed / turnRate. Segments along that arc can be
    // arbitrarily close to the head (the wraparound point sits ~13 segments
    // back at current tuning). Padding the skip by the segments-per-turn
    // means a single sharp turn can't put a "near-head" body segment inside
    // the hitbox. Sustained spinning (multiple full rotations) is still
    // catchable as a real self-bite, since that geometry truly is a self-
    // crossing.
    const turnRadius = tuning.snake.speedPxPerSec / tuning.snake.turnRateRadPerSec;
    const segmentsPerTurn = Math.ceil((2 * Math.PI * turnRadius) / tuning.snake.spacingPx);
    const dynamicSkip = tuning.snake.selfCollisionSkip + segmentsPerTurn;
    for (let i = dynamicSkip; i < this.segments.length; i++) {
      const s = this.segments[i];
      const ddx = head.x - s.x;
      const ddy = head.y - s.y;
      if (ddx * ddx + ddy * ddy < r * r) return true;
    }
    return false;
  }

  die(killedBy?: string): void {
    if (this.dead) return;
    this.dead = true;
    this.killedBy = killedBy ?? null;
  }
}
