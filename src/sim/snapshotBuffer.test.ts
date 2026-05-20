// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FoodRenderState, MinimapHead, SnakeRenderState } from "../../shared/protocol";
import { SnapshotBuffer, interpSnake } from "./snapshotBuffer";
import type { SnapshotFrame } from "./snapshotBuffer";

function makeSnake(id: string, x: number, y: number, segCount = 2): SnakeRenderState {
  const segments = [];
  for (let i = 0; i < segCount; i++) {
    segments.push({ x: x - i * 8, y });
  }
  return {
    id,
    ownerType: "player",
    color: 0x4caf50,
    alive: true,
    segments,
    boostActive: false,
    scale: 1,
  };
}

function makeFrame(
  serverTime: number,
  snakes: SnakeRenderState[] = [],
  foods: FoodRenderState[] = [],
  minimapHeads: MinimapHead[] = [],
): SnapshotFrame {
  return {
    serverTime,
    receivedAt: performance.now(),
    phase: "playing",
    snakes,
    foods,
    minimapHeads,
  };
}

describe("SnapshotBuffer", () => {
  it("empty buffer: latest() returns null", () => {
    const buf = new SnapshotBuffer(8);
    expect(buf.latest()).toBeNull();
  });

  it("empty buffer: bracket(any) returns null", () => {
    const buf = new SnapshotBuffer(8);
    expect(buf.bracket(1000)).toBeNull();
  });

  it("single frame: latest() returns it", () => {
    const buf = new SnapshotBuffer(8);
    const frame = makeFrame(1000);
    buf.push(frame);
    expect(buf.latest()).toBe(frame);
  });

  it("single frame: bracket(any) returns null", () => {
    const buf = new SnapshotBuffer(8);
    buf.push(makeFrame(1000));
    expect(buf.bracket(1000)).toBeNull();
    expect(buf.bracket(999)).toBeNull();
    expect(buf.bracket(1001)).toBeNull();
  });

  it("two frames spanning 50ms: bracket at midpoint returns alpha ~0.5", () => {
    const buf = new SnapshotBuffer(8);
    buf.push(makeFrame(1000));
    buf.push(makeFrame(1050));
    const result = buf.bracket(1025);
    expect(result).not.toBeNull();
    expect(result?.alpha).toBeCloseTo(0.5, 5);
  });

  it("two frames: bracket at first frame time returns alpha 0 (clamps to first)", () => {
    const buf = new SnapshotBuffer(8);
    buf.push(makeFrame(1000));
    buf.push(makeFrame(1050));
    const result = buf.bracket(1000);
    expect(result).not.toBeNull();
    // Exactly at first.serverTime clamps to first/first with alpha 0
    expect(result?.alpha).toBe(0);
    expect(result?.prev.serverTime).toBe(1000);
    // next is also first (clamped), not the subsequent frame
    expect(result?.next.serverTime).toBe(1000);
  });

  it("two frames: bracket at last frame time clamps to newest with alpha 0", () => {
    const buf = new SnapshotBuffer(8);
    buf.push(makeFrame(1000));
    buf.push(makeFrame(1050));
    const result = buf.bracket(1050);
    expect(result).not.toBeNull();
    expect(result?.prev.serverTime).toBe(1050);
    expect(result?.next.serverTime).toBe(1050);
    expect(result?.alpha).toBe(0);
  });

  it("bracket() before first frame clamps to first with alpha 0", () => {
    const buf = new SnapshotBuffer(8);
    buf.push(makeFrame(1000));
    buf.push(makeFrame(1050));
    const result = buf.bracket(900);
    expect(result).not.toBeNull();
    expect(result?.prev.serverTime).toBe(1000);
    expect(result?.next.serverTime).toBe(1000);
    expect(result?.alpha).toBe(0);
  });

  it("bracket() after last frame clamps to last with alpha 0", () => {
    const buf = new SnapshotBuffer(8);
    buf.push(makeFrame(1000));
    buf.push(makeFrame(1050));
    const result = buf.bracket(2000);
    expect(result).not.toBeNull();
    expect(result?.prev.serverTime).toBe(1050);
    expect(result?.next.serverTime).toBe(1050);
    expect(result?.alpha).toBe(0);
  });

  it("push beyond maxFrames evicts oldest", () => {
    const buf = new SnapshotBuffer(4);
    for (let i = 0; i < 6; i++) {
      buf.push(makeFrame(1000 + i * 50));
    }
    // Should have 4 frames: serverTimes 1100, 1150, 1200, 1250
    const latest = buf.latest();
    expect(latest?.serverTime).toBe(1250);
    // Bracket at 1000 should clamp to first frame (1100), not 1000
    const result = buf.bracket(1000);
    expect(result?.prev.serverTime).toBe(1100);
  });

  it("non-monotonic frame is rejected", () => {
    const buf = new SnapshotBuffer(8);
    buf.push(makeFrame(1000));
    buf.push(makeFrame(1050));
    // Push out-of-order frame
    buf.push(makeFrame(900));
    // Buffer should still have 2 frames
    const result = buf.bracket(1025);
    expect(result).not.toBeNull();
    // latest should still be 1050
    expect(buf.latest()?.serverTime).toBe(1050);
  });
});

describe("interpSnake", () => {
  it("alpha 0 returns prev positions", () => {
    const prev = makeSnake("s1", 0, 0, 3);
    const next = makeSnake("s1", 100, 0, 3);
    const result = interpSnake(prev, next, 0);
    expect(result.segments[0].x).toBe(prev.segments[0].x);
    expect(result.segments[0].y).toBe(prev.segments[0].y);
  });

  it("alpha 1 returns next positions", () => {
    const prev = makeSnake("s1", 0, 0, 3);
    const next = makeSnake("s1", 100, 0, 3);
    const result = interpSnake(prev, next, 1);
    expect(result.segments[0].x).toBe(next.segments[0].x);
    expect(result.segments[0].y).toBe(next.segments[0].y);
  });

  it("alpha 0.5 lerps positions", () => {
    const prev: SnakeRenderState = {
      id: "s1",
      ownerType: "player",
      color: 0xff0000,
      alive: true,
      segments: [
        { x: 0, y: 0 },
        { x: -8, y: 0 },
      ],
      boostActive: false,
      scale: 1,
    };
    const next: SnakeRenderState = {
      id: "s1",
      ownerType: "player",
      color: 0xff0000,
      alive: true,
      segments: [
        { x: 100, y: 20 },
        { x: 92, y: 20 },
      ],
      boostActive: false,
      scale: 1,
    };
    const result = interpSnake(prev, next, 0.5);
    expect(result.segments[0].x).toBeCloseTo(50, 5);
    expect(result.segments[0].y).toBeCloseTo(10, 5);
  });

  it("growth: prev 8 segments, next 10 - returns 10 segments with last 2 from next directly", () => {
    const prev: SnakeRenderState = {
      id: "s1",
      ownerType: "player",
      color: 0xff0000,
      alive: true,
      segments: Array.from({ length: 8 }, (_, i) => ({ x: -i * 8, y: 0 })),
      boostActive: false,
      scale: 1,
    };
    const next: SnakeRenderState = {
      id: "s1",
      ownerType: "player",
      color: 0xff0000,
      alive: true,
      segments: Array.from({ length: 10 }, (_, i) => ({ x: 100 - i * 8, y: 0 })),
      boostActive: false,
      scale: 1,
    };
    const result = interpSnake(prev, next, 0.5);
    expect(result.segments.length).toBe(10);
    // Last 2 segments come from next directly (no lerp)
    expect(result.segments[8].x).toBe(next.segments[8].x);
    expect(result.segments[9].x).toBe(next.segments[9].x);
    // First segments should be lerped
    expect(result.segments[0].x).toBeCloseTo((prev.segments[0].x + next.segments[0].x) / 2, 5);
  });

  it("no prev returns next unchanged", () => {
    const next = makeSnake("s1", 100, 200, 5);
    const result = interpSnake(undefined, next, 0.5);
    expect(result).toBe(next);
  });

  it("integration: push 3 frames, bracket at midpoint, interpSnake produces lerped positions", () => {
    const buf = new SnapshotBuffer(8);
    const snake1000: SnakeRenderState = {
      id: "s1",
      ownerType: "player",
      color: 0xff0000,
      alive: true,
      segments: [
        { x: 0, y: 0 },
        { x: -8, y: 0 },
      ],
      boostActive: false,
      scale: 1,
    };
    const snake1050: SnakeRenderState = {
      id: "s1",
      ownerType: "player",
      color: 0xff0000,
      alive: true,
      segments: [
        { x: 50, y: 0 },
        { x: 42, y: 0 },
      ],
      boostActive: false,
      scale: 1,
    };
    const snake1100: SnakeRenderState = {
      id: "s1",
      ownerType: "player",
      color: 0xff0000,
      alive: true,
      segments: [
        { x: 100, y: 0 },
        { x: 92, y: 0 },
      ],
      boostActive: false,
      scale: 1,
    };

    buf.push(makeFrame(1000, [snake1000]));
    buf.push(makeFrame(1050, [snake1050]));
    buf.push(makeFrame(1100, [snake1100]));

    const result = buf.bracket(1075);
    expect(result).not.toBeNull();
    expect(result?.prev.serverTime).toBe(1050);
    expect(result?.next.serverTime).toBe(1100);
    expect(result?.alpha).toBeCloseTo(0.5, 5);

    const prevSnake = result?.prev.snakes.find((s) => s.id === "s1");
    const nextSnake = result?.next.snakes.find((s) => s.id === "s1");
    expect(prevSnake).toBeDefined();
    expect(nextSnake).toBeDefined();

    if (!nextSnake) throw new Error("nextSnake not found");
    const interpolated = interpSnake(prevSnake, nextSnake, result?.alpha ?? 0);
    expect(interpolated.segments[0].x).toBeCloseTo(75, 5); // midpoint between 50 and 100
    expect(interpolated.segments[0].y).toBeCloseTo(0, 5);
  });
});
