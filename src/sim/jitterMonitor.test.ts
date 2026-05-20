// @vitest-environment node
import { describe, expect, it } from "vitest";
import { JitterMonitor } from "./jitterMonitor";

describe("JitterMonitor", () => {
  it("warm-up (0 samples) returns expectedGap + 25 clamped", () => {
    const m = new JitterMonitor(30, 50);
    // 50 + 25 = 75, within [50, 200].
    expect(m.getEffectiveDelayMs(50, 200)).toBe(75);
  });

  it("warm-up (1 sample) still returns expectedGap + 25", () => {
    const m = new JitterMonitor(30, 50);
    m.record(1000);
    expect(m.getEffectiveDelayMs(50, 200)).toBe(75);
  });

  it("warm-up (2 samples) still returns expectedGap + 25", () => {
    const m = new JitterMonitor(30, 50);
    m.record(1000);
    m.record(1050);
    expect(m.getEffectiveDelayMs(50, 200)).toBe(75);
  });

  it("steady arrivals at expectedGap return expectedGap (no jitter)", () => {
    const m = new JitterMonitor(30, 50);
    for (let t = 1000; t <= 1500; t += 50) m.record(t);
    expect(m.getEffectiveDelayMs(50, 200)).toBe(50);
  });

  it("bursty arrivals widen the delay", () => {
    const m = new JitterMonitor(30, 50);
    // 9 normal 50ms gaps, then one 150ms gap (100ms jitter).
    for (let t = 1000; t <= 1450; t += 50) m.record(t);
    m.record(1450 + 150);
    // p95 of 10 gaps - index = floor(10*0.95) = 9 - is the max (150).
    // Effective = 50 + 100 = 150.
    expect(m.getEffectiveDelayMs(50, 200)).toBe(150);
  });

  it("clamps to maxMs ceiling", () => {
    const m = new JitterMonitor(30, 50);
    m.record(1000);
    m.record(1500); // 500ms gap
    m.record(2000); // 500ms gap
    m.record(2500); // 500ms gap
    // Effective would be 500, clamped to 200.
    expect(m.getEffectiveDelayMs(50, 200)).toBe(200);
  });

  it("clamps to minMs floor", () => {
    const m = new JitterMonitor(30, 50);
    // Steady arrivals at expectedGap = 50ms. effective = 50.
    // With minMs = 75, should clamp up to 75.
    for (let t = 1000; t <= 1500; t += 50) m.record(t);
    expect(m.getEffectiveDelayMs(75, 200)).toBe(75);
  });

  it("evicts oldest beyond windowSize", () => {
    const m = new JitterMonitor(5, 50);
    // 4 huge gaps (1000ms each), then 5 normal gaps.
    m.record(0);
    m.record(1000);
    m.record(2000);
    m.record(3000);
    m.record(4000);
    // Now record 5 more at steady 50ms - these should push out the huge gaps.
    for (let t = 4050; t <= 4250; t += 50) m.record(t);
    // Window is now: [4000, 4050, 4100, 4150, 4200] (5 entries),
    // gaps are all 50, jitter = 0, effective = 50.
    expect(m.getEffectiveDelayMs(50, 200)).toBe(50);
  });
});
