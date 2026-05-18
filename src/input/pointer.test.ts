import { describe, expect, it, vi } from "vitest";
import { tuning } from "../tuning";
import { PointerSteering } from "./pointer";

function createSceneStub() {
  const listeners = new Map<string, Array<(arg: unknown) => void>>();
  const cursors = {
    left: { isDown: false },
    right: { isDown: false },
    up: { isDown: false },
    down: { isDown: false },
  };
  const input = {
    on: vi.fn((event: string, cb: (arg: unknown) => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(cb);
      listeners.set(event, arr);
    }),
    off: vi.fn((event: string, cb: (arg: unknown) => void) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(
        event,
        arr.filter((f) => f !== cb),
      );
    }),
    emit: (event: string, arg: unknown) => {
      for (const cb of (listeners.get(event) ?? []).slice()) cb(arg);
    },
    keyboard: {
      createCursorKeys: () => cursors,
    },
  };
  return {
    input,
    cursors,
    firePointer: (event: "pointerdown" | "pointermove", p: { worldX: number; worldY: number }) =>
      input.emit(event, p),
  };
}

describe("PointerSteering", () => {
  it("returns zero direction with no input", () => {
    const stub = createSceneStub();
    const steering = new PointerSteering(stub as unknown as import("phaser").Scene);
    const result = steering.update(0.016, 0, 0);
    expect(result).toEqual({ dirX: 0, dirY: 0 });
  });

  it("returns unit vector pointing toward pointer after convergence", () => {
    const stub = createSceneStub();
    const steering = new PointerSteering(stub as unknown as import("phaser").Scene);
    stub.firePointer("pointermove", { worldX: 100, worldY: 0 });
    let result = { dirX: 0, dirY: 0 };
    // ~125 iterations at 0.016s dt = ~2 simulated seconds
    for (let i = 0; i < 125; i++) {
      result = steering.update(0.016, 0, 0);
    }
    expect(Math.abs(result.dirX - 1)).toBeLessThan(1e-3);
    expect(Math.abs(result.dirY)).toBeLessThan(1e-3);
  });

  it("smooths toward target at turnRateRadPerSec", () => {
    const stub = createSceneStub();
    const steering = new PointerSteering(stub as unknown as import("phaser").Scene);
    // First converge to (1, 0)
    stub.firePointer("pointermove", { worldX: 100, worldY: 0 });
    for (let i = 0; i < 200; i++) {
      steering.update(0.016, 0, 0);
    }
    // Now point to (0, 100) - 90 degrees from current heading
    stub.firePointer("pointermove", { worldX: 0, worldY: 100 });
    const dt = 0.01;
    const result = steering.update(dt, 0, 0);
    const resultAngle = Math.atan2(result.dirY, result.dirX);
    // Starting angle was ~0 (pointing right), should have moved toward PI/2
    const angleMoved = Math.abs(resultAngle - 0);
    expect(angleMoved).toBeLessThanOrEqual(tuning.snake.turnRateRadPerSec * dt + 1e-6);
  });

  it("arrow key right sets target direction to (1, 0)", () => {
    const stub = createSceneStub();
    const steering = new PointerSteering(stub as unknown as import("phaser").Scene);
    stub.cursors.right.isDown = true;
    let result = { dirX: 0, dirY: 0 };
    for (let i = 0; i < 200; i++) {
      result = steering.update(0.016, 0, 0);
    }
    expect(result.dirX).toBeGreaterThan(0.99);
    expect(Math.abs(result.dirY)).toBeLessThan(1e-3);
  });

  it("destroy() removes input listeners", () => {
    const stub = createSceneStub();
    const steering = new PointerSteering(stub as unknown as import("phaser").Scene);
    steering.destroy();
    expect(stub.input.off).toHaveBeenCalledTimes(2);
  });
});
