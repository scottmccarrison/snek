/**
 * SpatialHash<T> - uniform grid for fast circle-radius queries.
 *
 * Algorithm adapted from
 * https://github.com/jondubois/iogrid (MIT) grid-cell sharding.
 * Rewritten in TypeScript; single-process variant.
 */

interface BucketEntry<T> {
  x: number;
  y: number;
  item: T;
}

export class SpatialHash<T> {
  private buckets: Map<string, Map<string, BucketEntry<T>>> = new Map();
  private idToBucket: Map<string, string> = new Map();

  constructor(private bucketPx: number) {}

  private bucketKey(x: number, y: number): string {
    return `${Math.floor(x / this.bucketPx)},${Math.floor(y / this.bucketPx)}`;
  }

  insert(id: string, x: number, y: number, item: T): void {
    const key = this.bucketKey(x, y);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Map();
      this.buckets.set(key, bucket);
    }
    bucket.set(id, { x, y, item });
    this.idToBucket.set(id, key);
  }

  remove(id: string): void {
    const key = this.idToBucket.get(id);
    if (key === undefined) return;
    this.buckets.get(key)?.delete(id);
    this.idToBucket.delete(id);
  }

  update(id: string, x: number, y: number): void {
    const oldKey = this.idToBucket.get(id);
    if (oldKey === undefined) return;
    const oldBucket = this.buckets.get(oldKey);
    const entry = oldBucket?.get(id);
    if (!entry) return;
    const newKey = this.bucketKey(x, y);
    if (newKey === oldKey) {
      entry.x = x;
      entry.y = y;
      return;
    }
    oldBucket?.delete(id);
    let newBucket = this.buckets.get(newKey);
    if (!newBucket) {
      newBucket = new Map();
      this.buckets.set(newKey, newBucket);
    }
    newBucket.set(id, { x, y, item: entry.item });
    this.idToBucket.set(id, newKey);
  }

  queryCircle(x: number, y: number, r: number): T[] {
    const minBx = Math.floor((x - r) / this.bucketPx);
    const maxBx = Math.floor((x + r) / this.bucketPx);
    const minBy = Math.floor((y - r) / this.bucketPx);
    const maxBy = Math.floor((y + r) / this.bucketPx);
    const out: T[] = [];
    for (let bx = minBx; bx <= maxBx; bx++) {
      for (let by = minBy; by <= maxBy; by++) {
        const bucket = this.buckets.get(`${bx},${by}`);
        if (!bucket) continue;
        for (const v of bucket.values()) out.push(v.item);
      }
    }
    return out;
  }

  clear(): void {
    this.buckets.clear();
    this.idToBucket.clear();
  }
}
