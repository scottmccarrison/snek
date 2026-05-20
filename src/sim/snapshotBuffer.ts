import type { FoodRenderState, MinimapHead, SnakeRenderState } from "../../shared/protocol";

// Snapshot interpolation buffer for MP remote-snake rendering. Server
// sends state every 50ms (20 Hz); the client renders at serverTime
// minus tuning.net.interpolationDelayMs so there are always bracketing
// frames to lerp between, even under jitter. Pattern inspiration:
// Gaffer On Games "Networked Physics" series.
export interface SnapshotFrame {
  serverTime: number;
  receivedAt: number;
  phase: "lobby" | "playing";
  snakes: SnakeRenderState[];
  foods: FoodRenderState[];
  minimapHeads: MinimapHead[];
}

export interface BracketResult {
  prev: SnapshotFrame;
  next: SnapshotFrame;
  alpha: number;
}

export class SnapshotBuffer {
  private frames: SnapshotFrame[] = [];

  constructor(private readonly maxFrames: number) {}

  // Reject non-monotonic frames (DO restart / clock skew would otherwise
  // produce out-of-range alpha in bracket()).
  push(frame: SnapshotFrame): boolean {
    const last = this.frames[this.frames.length - 1];
    if (last && frame.serverTime < last.serverTime) return false;
    this.frames.push(frame);
    while (this.frames.length > this.maxFrames) this.frames.shift();
    return true;
  }

  latest(): SnapshotFrame | null {
    return this.frames[this.frames.length - 1] ?? null;
  }

  bracket(renderServerTime: number): BracketResult | null {
    if (this.frames.length < 2) return null;
    const last = this.frames[this.frames.length - 1];
    const first = this.frames[0];
    if (renderServerTime >= last.serverTime) return { prev: last, next: last, alpha: 0 };
    if (renderServerTime <= first.serverTime) return { prev: first, next: first, alpha: 0 };
    for (let i = 1; i < this.frames.length; i++) {
      const next = this.frames[i];
      const prev = this.frames[i - 1];
      if (prev.serverTime <= renderServerTime && renderServerTime <= next.serverTime) {
        const span = next.serverTime - prev.serverTime;
        const alpha = span === 0 ? 0 : (renderServerTime - prev.serverTime) / span;
        return { prev, next, alpha };
      }
    }
    return { prev: last, next: last, alpha: 0 };
  }
}

// Lerp a snake's segments between two snapshots. Lerps the shared-prefix
// segments; tail segments unique to `next` (growth) are appended without
// lerp. If prev is missing (snake just appeared), returns next.
export function interpSnake(
  prev: SnakeRenderState | undefined,
  next: SnakeRenderState,
  alpha: number,
): SnakeRenderState {
  if (!prev) return next;
  if (alpha <= 0) return prev;
  if (alpha >= 1) return next;
  const minLen = Math.min(prev.segments.length, next.segments.length);
  const segments = new Array<{ x: number; y: number }>(next.segments.length);
  for (let i = 0; i < minLen; i++) {
    const a = prev.segments[i];
    const b = next.segments[i];
    segments[i] = { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
  }
  for (let i = minLen; i < next.segments.length; i++) {
    segments[i] = { x: next.segments[i].x, y: next.segments[i].y };
  }
  return { ...next, segments };
}
