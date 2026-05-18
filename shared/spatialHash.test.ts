import { describe, expect, it } from "vitest";
import { SpatialHash } from "./spatialHash";

describe("SpatialHash", () => {
  it("inserts and queries items within radius", () => {
    const hash = new SpatialHash<string>(10);
    hash.insert("a", 0, 0, "item-a");
    hash.insert("b", 5, 5, "item-b");
    hash.insert("c", 50, 50, "item-c");
    hash.insert("d", 100, 100, "item-d");

    const results = hash.queryCircle(0, 0, 15);
    // The hash may return extras from adjacent buckets; assert inclusions only.
    expect(results).toContain("item-a");
    expect(results).toContain("item-b");
    expect(results).not.toContain("item-d");
  });

  it("update() moves an item to a new bucket", () => {
    const hash = new SpatialHash<string>(10);
    hash.insert("a", 5, 5, "item-a");

    expect(hash.queryCircle(50, 50, 1)).not.toContain("item-a");

    hash.update("a", 50, 50);

    expect(hash.queryCircle(50, 50, 1)).toContain("item-a");
    expect(hash.queryCircle(5, 5, 1)).not.toContain("item-a");
  });

  it("remove() drops the item", () => {
    const hash = new SpatialHash<string>(10);
    hash.insert("a", 5, 5, "item-a");
    hash.remove("a");

    expect(hash.queryCircle(5, 5, 10)).toHaveLength(0);
  });

  it("queryCircle returns empty for empty hash", () => {
    const hash = new SpatialHash<number>(10);
    expect(hash.queryCircle(0, 0, 100)).toHaveLength(0);
  });

  it("handles 10k items at 4000x4000 world scale", () => {
    const hash = new SpatialHash<number>(80);
    // Seed the RNG-like loop deterministically.
    for (let i = 0; i < 10_000; i++) {
      const x = (i * 991) % 4000;
      const y = (i * 1747) % 4000;
      hash.insert(`item-${i}`, x, y, i);
    }
    // 100 random-ish queries should each return a bounded number of candidates.
    let totalCandidates = 0;
    const startMs = performance.now();
    for (let q = 0; q < 100; q++) {
      const qx = (q * 173) % 4000;
      const qy = (q * 281) % 4000;
      const results = hash.queryCircle(qx, qy, 100);
      totalCandidates += results.length;
    }
    const elapsed = performance.now() - startMs;
    // Loose budget: 100 queries < 50ms in node (catches O(n^2) regressions).
    expect(elapsed).toBeLessThan(50);
    // Sanity: queries returned SOME items (not zero across all 100).
    expect(totalCandidates).toBeGreaterThan(0);
  });
});
