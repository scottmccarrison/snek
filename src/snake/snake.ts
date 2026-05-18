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

export class Snake {
  readonly segments: SnakeSegment[];
  growth: number;
  dead: boolean;

  private headPath: { x: number; y: number }[];

  constructor(startX: number, startY: number) {
    this.headPath = [];
    this.segments = [];
    this.growth = 0;
    this.dead = false;
    this.reset(startX, startY);
  }

  reset(startX: number, startY: number): void {
    this.dead = false;
    this.growth = 0;
    // Clear and repopulate in place so `readonly segments` reference stays valid.
    this.segments.length = 0;
    for (let i = 0; i < tuning.snake.initialLength; i++) {
      this.segments.push({ x: startX - i * tuning.snake.spacingPx, y: startY });
    }
    this.headPath = this.segments.map((s) => ({ x: s.x, y: s.y }));
  }

  update(dt: number, dirX: number, dirY: number): void {
    if (this.dead) return;

    // If no input, continue current heading derived from head - next segment.
    let dx = dirX;
    let dy = dirY;
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
    const r = tuning.snake.headRadiusPx + tuning.snake.bodyRadiusPx;
    for (let i = tuning.snake.selfCollisionSkip; i < this.segments.length; i++) {
      const s = this.segments[i];
      const ddx = head.x - s.x;
      const ddy = head.y - s.y;
      if (ddx * ddx + ddy * ddy < r * r) return true;
    }
    return false;
  }

  die(): void {
    this.dead = true;
  }
}
