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
});
