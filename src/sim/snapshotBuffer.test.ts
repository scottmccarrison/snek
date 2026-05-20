// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SnakeRenderState } from "../../shared/protocol";
import { SnapshotBuffer, type SnapshotFrame, interpSnake } from "./snapshotBuffer";

function makeFrame(serverTime: number, snakes: SnakeRenderState[] = []): SnapshotFrame {
  return {
    serverTime,
    receivedAt: serverTime,
    phase: "playing",
    snakes,
    foods: [],
    minimapHeads: [],
  };
}

function makeSnake(id: string, segments: Array<{ x: number; y: number }>): SnakeRenderState {
  return {
    id,
    ownerType: "bot",
    color: 0xff0000,
    alive: true,
    segments,
    boostActive: false,
    scale: 1,
  };
}

describe("SnapshotBuffer", () => {
  it("latest() and bracket() return null on empty buffer", () => {
    const buf = new SnapshotBuffer(8);
    expect(buf.latest()).toBeNull();
    expect(buf.bracket(100)).toBeNull();
  });

  it("single frame: latest returns it, bracket returns null", () => {
    const buf = new SnapshotBuffer(8);
    const f = makeFrame(1000);
    buf.push(f);
    expect(buf.latest()).toBe(f);
    expect(buf.bracket(1000)).toBeNull();
  });

  it("bracket() returns alpha ~0.5 for time exactly between two frames", () => {
    const buf = new SnapshotBuffer(8);
    const a = makeFrame(1000);
    const b = makeFrame(1050);
    buf.push(a);
    buf.push(b);
    const result = buf.bracket(1025);
    expect(result).not.toBeNull();
    expect(result?.prev).toBe(a);
    expect(result?.next).toBe(b);
    expect(result?.alpha).toBeCloseTo(0.5, 5);
  });

  it("bracket() clamps before-oldest with alpha 0", () => {
    const buf = new SnapshotBuffer(8);
    const a = makeFrame(1000);
    const b = makeFrame(1050);
    buf.push(a);
    buf.push(b);
    const result = buf.bracket(500);
    expect(result?.prev).toBe(a);
    expect(result?.next).toBe(a);
    expect(result?.alpha).toBe(0);
  });

  it("bracket() clamps after-newest with alpha 0", () => {
    const buf = new SnapshotBuffer(8);
    const a = makeFrame(1000);
    const b = makeFrame(1050);
    buf.push(a);
    buf.push(b);
    const result = buf.bracket(2000);
    expect(result?.prev).toBe(b);
    expect(result?.next).toBe(b);
    expect(result?.alpha).toBe(0);
  });

  it("push beyond maxFrames evicts oldest", () => {
    const buf = new SnapshotBuffer(3);
    for (let t = 1000; t <= 5000; t += 1000) buf.push(makeFrame(t));
    // After 5 pushes with max 3, only times 3000/4000/5000 remain.
    const result = buf.bracket(3500);
    expect(result?.prev.serverTime).toBe(3000);
    expect(result?.next.serverTime).toBe(4000);
    // Time 1500 is before the oldest (3000) and should clamp.
    const before = buf.bracket(1500);
    expect(before?.prev.serverTime).toBe(3000);
    expect(before?.next.serverTime).toBe(3000);
  });

  it("push() rejects non-monotonic serverTime", () => {
    const buf = new SnapshotBuffer(8);
    buf.push(makeFrame(1000));
    buf.push(makeFrame(1050));
    buf.push(makeFrame(900)); // out of order
    // The bad frame should be rejected; bracket on time 925 should still
    // clamp to the oldest valid frame (1000).
    const result = buf.bracket(925);
    expect(result?.prev.serverTime).toBe(1000);
    expect(result?.next.serverTime).toBe(1000);
    expect(buf.latest()?.serverTime).toBe(1050);
  });

  it("bracket() picks the correct pair among multiple frames", () => {
    const buf = new SnapshotBuffer(8);
    buf.push(makeFrame(1000));
    buf.push(makeFrame(1050));
    buf.push(makeFrame(1100));
    buf.push(makeFrame(1150));
    const result = buf.bracket(1075);
    expect(result?.prev.serverTime).toBe(1050);
    expect(result?.next.serverTime).toBe(1100);
    expect(result?.alpha).toBeCloseTo(0.5, 5);
  });
});

describe("interpSnake", () => {
  it("returns next when prev is missing", () => {
    const next = makeSnake("a", [{ x: 100, y: 100 }]);
    expect(interpSnake(undefined, next, 0.5)).toBe(next);
  });

  it("returns prev at alpha 0", () => {
    const prev = makeSnake("a", [{ x: 0, y: 0 }]);
    const next = makeSnake("a", [{ x: 100, y: 100 }]);
    expect(interpSnake(prev, next, 0)).toBe(prev);
  });

  it("returns next at alpha 1", () => {
    const prev = makeSnake("a", [{ x: 0, y: 0 }]);
    const next = makeSnake("a", [{ x: 100, y: 100 }]);
    expect(interpSnake(prev, next, 1)).toBe(next);
  });

  it("lerps segment positions at alpha 0.5", () => {
    const prev = makeSnake("a", [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ]);
    const next = makeSnake("a", [
      { x: 100, y: 100 },
      { x: 110, y: 120 },
    ]);
    const result = interpSnake(prev, next, 0.5);
    expect(result.segments[0].x).toBeCloseTo(50, 5);
    expect(result.segments[0].y).toBeCloseTo(50, 5);
    expect(result.segments[1].x).toBeCloseTo(60, 5);
    expect(result.segments[1].y).toBeCloseTo(70, 5);
  });

  it("appends growth tail segments without lerp", () => {
    const prev = makeSnake("a", [{ x: 0, y: 0 }]);
    const next = makeSnake("a", [
      { x: 100, y: 100 },
      { x: 110, y: 110 },
      { x: 120, y: 120 },
    ]);
    const result = interpSnake(prev, next, 0.5);
    expect(result.segments.length).toBe(3);
    // Shared prefix lerped:
    expect(result.segments[0].x).toBeCloseTo(50, 5);
    // Growth tail copied from next:
    expect(result.segments[1].x).toBe(110);
    expect(result.segments[2].x).toBe(120);
  });

  it("preserves non-segment fields from next via spread", () => {
    const prev = makeSnake("a", [{ x: 0, y: 0 }]);
    const next: SnakeRenderState = { ...makeSnake("a", [{ x: 100, y: 0 }]), boostActive: true };
    const result = interpSnake(prev, next, 0.5);
    expect(result.boostActive).toBe(true);
    expect(result.id).toBe("a");
    expect(result.color).toBe(0xff0000);
  });

  it("integration: bracket + interpSnake produces midpoint", () => {
    const buf = new SnapshotBuffer(8);
    const snake = (x: number) => makeSnake("a", [{ x, y: 0 }]);
    buf.push({ ...makeFrame(1000), snakes: [snake(0)] });
    buf.push({ ...makeFrame(1050), snakes: [snake(100)] });
    const result = buf.bracket(1025);
    expect(result).not.toBeNull();
    const lerped = interpSnake(
      result?.prev.snakes[0],
      result?.next.snakes[0] as SnakeRenderState,
      result?.alpha ?? 0,
    );
    expect(lerped.segments[0].x).toBeCloseTo(50, 5);
  });
});
