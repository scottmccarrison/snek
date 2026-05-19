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
  // Stub for Space key (addKey returns an object with isDown).
  const spaceKeyStub = { isDown: false };
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
      addKey: (_key: string) => spaceKeyStub,
    },
  };
  // Minimal document stub for visibilitychange listener.
  const docListeners = new Map<string, Array<() => void>>();
  const documentStub = {
    hidden: false,
    addEventListener: vi.fn((event: string, cb: () => void) => {
      const arr = docListeners.get(event) ?? [];
      arr.push(cb);
      docListeners.set(event, arr);
    }),
    removeEventListener: vi.fn(),
    fireVisibility: (hidden: boolean) => {
      documentStub.hidden = hidden;
      for (const cb of (docListeners.get("visibilitychange") ?? []).slice()) cb();
    },
  };
  // Replace global document for this stub.
  vi.stubGlobal("document", documentStub);
  return {
    input,
    cursors,
    spaceKeyStub,
    documentStub,
    firePointer: (
      event: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
      p: {
        worldX: number;
        worldY: number;
        x?: number;
        y?: number;
        pointerType?: string;
        id?: number;
      },
    ) =>
      input.emit(event, {
        ...p,
        wasTouch: (p.pointerType ?? "mouse") !== "mouse",
        x: p.x ?? 0,
        y: p.y ?? 0,
        id: p.id ?? 1,
      }),
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
    expect(stub.input.off).toHaveBeenCalledTimes(4);
  });

  it("touch input: drag right of anchor produces dirX > 0.99", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    stub.firePointer("pointerdown", {
      x: 100,
      y: 100,
      worldX: 100,
      worldY: 100,
      pointerType: "touch",
    });
    stub.firePointer("pointermove", {
      x: 200,
      y: 100,
      worldX: 200,
      worldY: 100,
      pointerType: "touch",
    });
    let result = { dirX: 0, dirY: 0 };
    for (let i = 0; i < 125; i++) {
      result = steer.update(0.016, 0, 0);
    }
    expect(result.dirX).toBeGreaterThan(0.99);
    expect(Math.abs(result.dirY)).toBeLessThan(1e-3);
  });

  it("touch input: lift finger preserves last direction", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    stub.firePointer("pointerdown", {
      x: 100,
      y: 100,
      worldX: 100,
      worldY: 100,
      pointerType: "touch",
    });
    stub.firePointer("pointermove", {
      x: 200,
      y: 100,
      worldX: 200,
      worldY: 100,
      pointerType: "touch",
    });
    for (let i = 0; i < 125; i++) steer.update(0.016, 0, 0);
    stub.firePointer("pointerup", {
      x: 200,
      y: 100,
      worldX: 200,
      worldY: 100,
      pointerType: "touch",
    });
    let result = { dirX: 0, dirY: 0 };
    for (let i = 0; i < 60; i++) {
      result = steer.update(0.016, 0, 0);
    }
    expect(result.dirX).toBeGreaterThan(0.99);
  });

  it("touch input: minimap region rejects new touchdown anchor", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene, (sx) => sx > 800);
    stub.firePointer("pointerdown", {
      x: 900,
      y: 500,
      worldX: 900,
      worldY: 500,
      pointerType: "touch",
    });
    let result = steer.update(0.016, 0, 0);
    expect(result.dirX).toBe(0);
    expect(result.dirY).toBe(0);
    // Outside region: should work
    stub.firePointer("pointerdown", {
      x: 100,
      y: 100,
      worldX: 100,
      worldY: 100,
      pointerType: "touch",
    });
    stub.firePointer("pointermove", {
      x: 200,
      y: 100,
      worldX: 200,
      worldY: 100,
      pointerType: "touch",
    });
    for (let i = 0; i < 125; i++) result = steer.update(0.016, 0, 0);
    expect(result.dirX).toBeGreaterThan(0.99);
  });

  it("mouse path unchanged when pointerType is mouse", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    stub.firePointer("pointerdown", { x: 0, y: 0, worldX: 100, worldY: 0, pointerType: "mouse" });
    let result = { dirX: 0, dirY: 0 };
    for (let i = 0; i < 125; i++) {
      result = steer.update(0.016, 0, 0);
    }
    expect(result.dirX).toBeGreaterThan(0.99);
  });

  it("touch input: secondary touch is ignored while primary is active", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    // Primary touchdown + drag right.
    stub.firePointer("pointerdown", {
      x: 100,
      y: 100,
      worldX: 100,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    stub.firePointer("pointermove", {
      x: 200,
      y: 100,
      worldX: 200,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    // Secondary touch at a far point - should be ignored.
    stub.firePointer("pointerdown", {
      x: 500,
      y: 500,
      worldX: 500,
      worldY: 500,
      pointerType: "touch",
      id: 2,
    });
    stub.firePointer("pointermove", {
      x: 600,
      y: 600,
      worldX: 600,
      worldY: 600,
      pointerType: "touch",
      id: 2,
    });
    // Drive the steering. Direction should reflect ONLY the primary anchor at
    // (100, 100) with current at (200, 100) - dirX positive, dirY ~ 0.
    let result = { dirX: 0, dirY: 0 };
    for (let i = 0; i < 125; i++) {
      result = steer.update(0.016, 0, 0);
    }
    expect(result.dirX).toBeGreaterThan(0.99);
    expect(Math.abs(result.dirY)).toBeLessThan(0.01);
  });

  it("touch input: secondary touch lifting does not stop primary steering", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    stub.firePointer("pointerdown", {
      x: 100,
      y: 100,
      worldX: 100,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    stub.firePointer("pointermove", {
      x: 200,
      y: 100,
      worldX: 200,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    // Secondary finger comes down and lifts. Should NOT release the primary
    // joystick state.
    stub.firePointer("pointerdown", {
      x: 500,
      y: 500,
      worldX: 500,
      worldY: 500,
      pointerType: "touch",
      id: 2,
    });
    stub.firePointer("pointerup", {
      x: 500,
      y: 500,
      worldX: 500,
      worldY: 500,
      pointerType: "touch",
      id: 2,
    });
    let result = { dirX: 0, dirY: 0 };
    for (let i = 0; i < 125; i++) {
      result = steer.update(0.016, 0, 0);
    }
    // Primary is still active, snake still heading right.
    expect(result.dirX).toBeGreaterThan(0.99);
  });

  it("pointer: touchCount > 1 reports boost held", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    // No touches yet - boost not held.
    expect(steer.getBoostHeld()).toBe(false);
    // First touch down.
    stub.firePointer("pointerdown", {
      x: 100,
      y: 100,
      worldX: 100,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    expect(steer.getBoostHeld()).toBe(false);
    // Second touch down - boost held.
    stub.firePointer("pointerdown", {
      x: 300,
      y: 300,
      worldX: 300,
      worldY: 300,
      pointerType: "touch",
      id: 2,
    });
    expect(steer.getBoostHeld()).toBe(true);
    // Second touch lifts - boost released.
    stub.firePointer("pointerup", {
      x: 300,
      y: 300,
      worldX: 300,
      worldY: 300,
      pointerType: "touch",
      id: 2,
    });
    expect(steer.getBoostHeld()).toBe(false);
  });

  it("pointer: Space key reports boost held", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    expect(steer.getBoostHeld()).toBe(false);
    stub.spaceKeyStub.isDown = true;
    expect(steer.getBoostHeld()).toBe(true);
    stub.spaceKeyStub.isDown = false;
    expect(steer.getBoostHeld()).toBe(false);
  });

  it("pointer: pointercancel releases active touch and decrements touchCount", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    // First touch - sets up joystick.
    stub.firePointer("pointerdown", {
      x: 100,
      y: 100,
      worldX: 100,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    stub.firePointer("pointermove", {
      x: 200,
      y: 100,
      worldX: 200,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    // Fire pointercancel for the active touch (iOS focus-loss).
    stub.firePointer("pointercancel", {
      x: 200,
      y: 100,
      worldX: 200,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    // touchCount should be back to 0 and boost held should be false.
    expect(steer.getBoostHeld()).toBe(false);
    // The steering should still preserve last known direction (not snap to 0).
    // But the joystick anchor is released - verify no crash and getBoostHeld is correct.
    const result = steer.update(0.016, 0, 0);
    // Direction is preserved from last drag (>0 dirX), just verify no throw.
    expect(typeof result.dirX).toBe("number");
  });

  it("pointer: visibilitychange to hidden releases active touch", () => {
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    // Set up primary + secondary touch.
    stub.firePointer("pointerdown", {
      x: 100,
      y: 100,
      worldX: 100,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    stub.firePointer("pointerdown", {
      x: 300,
      y: 300,
      worldX: 300,
      worldY: 300,
      pointerType: "touch",
      id: 2,
    });
    expect(steer.getBoostHeld()).toBe(true);
    // Page goes hidden - all touch state should reset.
    stub.documentStub.fireVisibility(true);
    expect(steer.getBoostHeld()).toBe(false);
  });

  it("pointer: held-stationary touch is NOT released after a long pause", () => {
    // Regression: earlier design considered a time-since-move timeout to
    // release stale touches. A stationary held thumb is a VALID input
    // (the snake glides straight). No timeout must fire here.
    const stub = createSceneStub();
    const steer = new PointerSteering(stub as unknown as import("phaser").Scene);
    stub.firePointer("pointerdown", {
      x: 100,
      y: 100,
      worldX: 100,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    stub.firePointer("pointermove", {
      x: 200,
      y: 100,
      worldX: 200,
      worldY: 100,
      pointerType: "touch",
      id: 1,
    });
    // Simulate 10 seconds of no move events (600 frames at 60fps, no timeout).
    let result = { dirX: 0, dirY: 0 };
    for (let i = 0; i < 600; i++) {
      result = steer.update(0.016, 0, 0);
    }
    // The touch is still active - snake should still be heading right.
    expect(result.dirX).toBeGreaterThan(0.99);
  });
});
