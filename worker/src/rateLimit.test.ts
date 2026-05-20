// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { _resetForTests, checkRate } from "./rateLimit";

describe("checkRate", () => {
  afterEach(() => {
    _resetForTests();
  });

  it("first request from a new IP succeeds", () => {
    expect(checkRate("1.2.3.4", 10, 0.5, 1000)).toBe(true);
  });

  it("burst: capacity requests succeed, capacity+1 fails", () => {
    const t = 1000;
    for (let i = 0; i < 10; i++) expect(checkRate("ip", 10, 0.5, t)).toBe(true);
    // No time has elapsed - no refill - 11th must fail.
    expect(checkRate("ip", 10, 0.5, t)).toBe(false);
  });

  it("refills over time at the configured rate", () => {
    let t = 1000;
    // Drain capacity.
    for (let i = 0; i < 10; i++) checkRate("ip", 10, 0.5, t);
    expect(checkRate("ip", 10, 0.5, t)).toBe(false);
    // 2 seconds later -> 1 token refilled (0.5/s).
    t += 2000;
    expect(checkRate("ip", 10, 0.5, t)).toBe(true);
    // Empty again.
    expect(checkRate("ip", 10, 0.5, t)).toBe(false);
  });

  it("refill caps at capacity (tokens don't grow unbounded)", () => {
    let t = 1000;
    checkRate("ip", 10, 0.5, t); // 9 left
    t += 600_000; // 10 minutes -> infinite tokens if uncapped
    // Should still cap at 10. Drain capacity to check.
    for (let i = 0; i < 10; i++) expect(checkRate("ip", 10, 0.5, t)).toBe(true);
    expect(checkRate("ip", 10, 0.5, t)).toBe(false);
  });

  it("different IPs have independent buckets", () => {
    const t = 1000;
    for (let i = 0; i < 10; i++) checkRate("alice", 10, 0.5, t);
    expect(checkRate("alice", 10, 0.5, t)).toBe(false);
    // Bob is unaffected.
    expect(checkRate("bob", 10, 0.5, t)).toBe(true);
  });

  it("tokens never go negative", () => {
    let t = 1000;
    for (let i = 0; i < 10; i++) checkRate("ip", 10, 0.5, t);
    // Many denied requests in a row.
    for (let i = 0; i < 100; i++) expect(checkRate("ip", 10, 0.5, t)).toBe(false);
    // 2s later, exactly 1 token should be available.
    t += 2000;
    expect(checkRate("ip", 10, 0.5, t)).toBe(true);
    expect(checkRate("ip", 10, 0.5, t)).toBe(false);
  });
});
