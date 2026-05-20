// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SnakeRenderState } from "../../shared/protocol";
import { tuning } from "../tuning";
import { ClientPrediction } from "./clientPrediction";

function makePlayerState(
  x: number,
  y: number,
  segCount = 20,
  alive = true,
  boostActive = false,
  color = 0x4caf50,
): SnakeRenderState {
  const segments = [];
  for (let i = 0; i < segCount; i++) {
    segments.push({ x: x - i * 8, y });
  }
  return {
    id: "player-1",
    ownerType: "player",
    color,
    alive,
    segments,
    boostActive,
    scale: 1,
  };
}

describe("ClientPrediction", () => {
  it("getSnake() returns null before any reconcile", () => {
    const cp = new ClientPrediction("player-1");
    expect(cp.getSnake()).toBeNull();
  });

  it("first reconcile builds a snake matching server state", () => {
    const cp = new ClientPrediction("player-1");
    const state = makePlayerState(200, 300, 20, true, false, 0xff0000);
    const result = cp.reconcile(state);
    expect(result.snapped).toBe(true);
    expect(result.reason).toBe("first-snapshot");

    const snake = cp.getSnake();
    expect(snake).not.toBeNull();
    expect(snake?.segments[0].x).toBe(200);
    expect(snake?.segments[0].y).toBe(300);
    expect(snake?.segments.length).toBe(20);
    expect(snake?.dead).toBe(false);
    expect(snake?.color).toBe(0xff0000);
    expect(snake?.boostActive).toBe(false);
  });

  it("second reconcile with identical state returns snapped: false", () => {
    const cp = new ClientPrediction("player-1");
    const state = makePlayerState(200, 300);
    cp.reconcile(state);
    // Reconcile again with same state
    const result = cp.reconcile(state);
    expect(result.snapped).toBe(false);
  });

  it("step() is a no-op when no snake yet (no throw)", () => {
    const cp = new ClientPrediction("player-1");
    expect(() => cp.step(1 / 60, 1, 0, false)).not.toThrow();
    expect(cp.getSnake()).toBeNull();
  });

  it("step() advances head along input direction over multiple ticks", () => {
    const cp = new ClientPrediction("player-1");
    const state = makePlayerState(100, 100);
    cp.reconcile(state);

    const snake0 = cp.getSnake();
    if (!snake0) throw new Error("snake not found");
    const initialX = snake0.segments[0].x;
    // Step for 1 second with rightward input
    const fps = 60;
    for (let i = 0; i < fps; i++) {
      cp.step(1 / fps, 1, 0, false);
    }
    const snake1 = cp.getSnake();
    if (!snake1) throw new Error("snake not found");
    const finalX = snake1.segments[0].x;
    const moved = finalX - initialX;
    // Should have moved approximately speedPxPerSec pixels
    expect(moved).toBeCloseTo(tuning.snake.speedPxPerSec, -1); // within 10px
  });

  it("step() is a no-op when dtSec > 0.25 (position unchanged)", () => {
    const cp = new ClientPrediction("player-1");
    const state = makePlayerState(100, 100);
    cp.reconcile(state);

    const snakeBefore = cp.getSnake();
    if (!snakeBefore) throw new Error("snake not found");
    const before = { x: snakeBefore.segments[0].x, y: snakeBefore.segments[0].y };
    cp.step(0.3, 1, 0, false);
    const snakeAfter = cp.getSnake();
    if (!snakeAfter) throw new Error("snake not found");
    expect(snakeAfter.segments[0].x).toBe(before.x);
    expect(snakeAfter.segments[0].y).toBe(before.y);
  });

  it("step() is a no-op when dtSec <= 0", () => {
    const cp = new ClientPrediction("player-1");
    const state = makePlayerState(100, 100);
    cp.reconcile(state);

    const snakeBefore = cp.getSnake();
    if (!snakeBefore) throw new Error("snake not found");
    const before = { x: snakeBefore.segments[0].x, y: snakeBefore.segments[0].y };
    cp.step(0, 1, 0, false);
    cp.step(-0.1, 1, 0, false);
    const snakeAfter = cp.getSnake();
    if (!snakeAfter) throw new Error("snake not found");
    expect(snakeAfter.segments[0].x).toBe(before.x);
    expect(snakeAfter.segments[0].y).toBe(before.y);
  });

  it("reconcile snaps with reason 'dead' when state.alive becomes false", () => {
    const cp = new ClientPrediction("player-1");
    cp.reconcile(makePlayerState(100, 100, 20, true));

    const deadState = makePlayerState(100, 100, 20, false);
    const result = cp.reconcile(deadState);
    expect(result.snapped).toBe(true);
    expect(result.reason).toBe("dead");
    expect(cp.getSnake()?.dead).toBe(true);
  });

  it("reconcile snaps with reason 'segment-count' when length differs", () => {
    const cp = new ClientPrediction("player-1");
    cp.reconcile(makePlayerState(100, 100, 20));

    // Server says snake grew
    const grownState = makePlayerState(100, 100, 21);
    const result = cp.reconcile(grownState);
    expect(result.snapped).toBe(true);
    expect(result.reason).toBe("segment-count");
    expect(cp.getSnake()?.segments.length).toBe(21);
  });

  it("reconcile snaps with reason 'drift' when head distance > predictionSnapThresholdPx", () => {
    const cp = new ClientPrediction("player-1");
    cp.reconcile(makePlayerState(100, 100));

    // Move local snake far away via steps
    for (let i = 0; i < 200; i++) {
      cp.step(1 / 60, 1, 0, false);
    }

    // Server snapshot still says snake is near original position
    const serverState = makePlayerState(100, 100);
    const result = cp.reconcile(serverState);
    expect(result.snapped).toBe(true);
    expect(result.reason).toBe("drift");
  });

  it("reconcile does NOT snap when drift is just under threshold", () => {
    const cp = new ClientPrediction("player-1");
    const state = makePlayerState(100, 100);
    cp.reconcile(state);

    // Server snapshot with head just inside the threshold
    const threshold = tuning.net.predictionSnapThresholdPx;
    const nearState = makePlayerState(100 + threshold - 1, 100);
    const result = cp.reconcile(nearState);
    // Drift = threshold - 1 < threshold, so no snap
    // But note: predicted head is still at 100 (no steps taken),
    // server says 100 + threshold - 1, so distance = threshold - 1
    expect(result.snapped).toBe(false);
  });
});
