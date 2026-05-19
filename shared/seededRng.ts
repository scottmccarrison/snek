/**
 * SeededRng - Mulberry32 PRNG.
 *
 * Fast, simple, 32-bit period (~4 billion values). Suitable for
 * deterministic server-side simulation where reproducibility matters more
 * than cryptographic quality.
 */

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Coerce + ensure non-zero
    this.state = seed | 0 || 1;
  }

  random(): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Convenience: random float in [min, max).
  range(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  // Convenience: integer in [0, n).
  int(n: number): number {
    return Math.floor(this.random() * n);
  }

  // For tests: serialize/restore.
  getState(): number {
    return this.state;
  }

  setState(s: number): void {
    this.state = s;
  }
}
