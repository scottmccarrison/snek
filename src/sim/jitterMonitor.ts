// Per-user adaptive interpolation delay. Tracks snapshot arrival gaps to
// compute a delay that covers the expected tick interval plus observed
// p95 jitter, so well-connected players get a tight remote-snake window
// (less visual lag) and flaky connections get a wider one (no stutter
// when packets are late).
//
// Warm-up returns expectedGap + 25ms, which with the project defaults
// (expectedGap = 50ms, min 50ms, max 200ms) matches the legacy fixed
// 75ms interpolationDelayMs.
export class JitterMonitor {
  private arrivalTimes: number[] = [];

  constructor(
    private readonly windowSize: number,
    private readonly expectedGapMs: number,
  ) {}

  record(receivedAt: number): void {
    this.arrivalTimes.push(receivedAt);
    while (this.arrivalTimes.length > this.windowSize) this.arrivalTimes.shift();
  }

  // Note: with fewer than ~20 samples, p95 is effectively the max observed
  // gap (floor(n*0.95) saturates at n-1). That's the desired conservative
  // behavior during the first second of play.
  getEffectiveDelayMs(minMs: number, maxMs: number): number {
    if (this.arrivalTimes.length < 3) {
      return Math.min(maxMs, Math.max(minMs, this.expectedGapMs + 25));
    }
    const gaps: number[] = [];
    for (let i = 1; i < this.arrivalTimes.length; i++) {
      gaps.push(this.arrivalTimes[i] - this.arrivalTimes[i - 1]);
    }
    gaps.sort((a, b) => a - b);
    const idx = Math.min(Math.floor(gaps.length * 0.95), gaps.length - 1);
    const p95 = gaps[idx];
    const jitter = Math.max(0, p95 - this.expectedGapMs);
    const effective = this.expectedGapMs + jitter;
    return Math.min(maxMs, Math.max(minMs, effective));
  }
}
