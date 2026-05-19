// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SeededRng } from "./seededRng";

describe("SeededRng", () => {
  it("same seed produces same sequence", () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);
    const seq1 = Array.from({ length: 20 }, () => rng1.random());
    const seq2 = Array.from({ length: 20 }, () => rng2.random());
    expect(seq1).toEqual(seq2);
  });

  it("different seeds produce different sequences", () => {
    const rng1 = new SeededRng(1);
    const rng2 = new SeededRng(2);
    const seq1 = Array.from({ length: 10 }, () => rng1.random());
    const seq2 = Array.from({ length: 10 }, () => rng2.random());
    expect(seq1).not.toEqual(seq2);
  });

  it("range(min, max) stays within bounds across 1000 samples", () => {
    const rng = new SeededRng(99);
    const min = -5;
    const max = 10;
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(min, max);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThan(max);
    }
  });

  it("int(n) returns 0..n-1 across 1000 samples", () => {
    const rng = new SeededRng(7);
    const n = 6;
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    // All values 0..n-1 should appear
    for (let i = 0; i < n; i++) {
      expect(seen.has(i)).toBe(true);
    }
  });

  it("getState/setState round-trips", () => {
    const rng = new SeededRng(123);
    // Advance a few steps
    rng.random();
    rng.random();
    rng.random();
    const savedState = rng.getState();
    const nextA = rng.random();
    const nextB = rng.random();
    // Restore and replay
    const rng2 = new SeededRng(1);
    rng2.setState(savedState);
    expect(rng2.random()).toBe(nextA);
    expect(rng2.random()).toBe(nextB);
  });
});
