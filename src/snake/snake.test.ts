import { describe, expect, it } from "vitest";
import { tuning } from "../tuning";
import { Snake } from "./snake";

describe("Snake", () => {
  it("head advances at speedPxPerSec along the input direction after 1 second", () => {
    const snake = new Snake(100, 100);
    for (let i = 0; i < 60; i++) {
      snake.update(1 / 60, 1, 0);
    }
    expect(snake.segments[0].x).toBeCloseTo(100 + tuning.snake.speedPxPerSec, 3);
    expect(snake.segments[0].y).toBe(100);
  });

  it("segment 1 trails head by spacingPx after the snake stretches", () => {
    const snake = new Snake(100, 100);
    // Run enough frames for the body to fully spread out (more than initial length * spacing / speed seconds).
    for (let i = 0; i < 120; i++) {
      snake.update(1 / 60, 1, 0);
    }
    const seg0 = snake.segments[0];
    const seg1 = snake.segments[1];
    const dist = Math.hypot(seg0.x - seg1.x, seg0.y - seg1.y);
    expect(dist).toBeCloseTo(tuning.snake.spacingPx, 0); // within 0.5px
  });

  it("initial length matches tuning.snake.initialLength", () => {
    const snake = new Snake(100, 100);
    expect(snake.segments.length).toBe(tuning.snake.initialLength);
  });

  it("grow(n) appends n segments after enough frames", () => {
    const snake = new Snake(100, 100);
    const startLen = snake.segments.length;
    snake.grow(4);
    // Run until length stabilizes (growth is consumed each frame).
    let prevLen = snake.segments.length;
    let stable = 0;
    for (let i = 0; i < 200; i++) {
      snake.update(1 / 60, 1, 0);
      if (snake.segments.length === prevLen) {
        stable++;
        if (stable >= 5) break;
      } else {
        stable = 0;
        prevLen = snake.segments.length;
      }
    }
    expect(snake.segments.length).toBe(startLen + 4);
  });

  it("checkSelfCollision returns false on fresh snake", () => {
    const snake = new Snake(100, 100);
    expect(snake.checkSelfCollision()).toBe(false);
  });

  it("checkSelfCollision returns true when head wraps into body", () => {
    const snake = new Snake(100, 100);
    // The dynamic skip is roughly selfCollisionSkip + segmentsPerTurn (~13)
    // = ~19 at current tuning. Grow well past that so the target segment is
    // clearly within the checked range. Then move a deep segment onto the
    // head and confirm the check fires.
    snake.grow(40);
    for (let i = 0; i < 60; i++) {
      snake.update(1 / 60, 1, 0);
    }
    const idx = snake.segments.length - 1; // tail, guaranteed past skip
    snake.segments[idx].x = snake.segments[0].x;
    snake.segments[idx].y = snake.segments[0].y;
    expect(snake.checkSelfCollision()).toBe(true);
  });

  it("segments occupy distinct positions after one update with no input", () => {
    // Regression: an earlier segment-placement bug caused segments[2..N] to
    // stack at the same position after a single update because acc=target
    // pinned the path index. The visible symptom was the snake self-colliding
    // immediately on scene load.
    const snake = new Snake(640, 360);
    snake.update(1 / 60, 0, 0);
    const positions = new Set(snake.segments.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)}`));
    expect(positions.size).toBe(snake.segments.length);
  });

  it("does not self-collide on the first update from a fresh snake", () => {
    // Regression: paired with the segment-stacking bug, this caused the head
    // to overlap stacked segments past selfCollisionSkip on the very first
    // update.
    const snake = new Snake(640, 360);
    for (let i = 0; i < 30; i++) {
      snake.update(1 / 60, 0, 0);
      expect(snake.checkSelfCollision()).toBe(false);
    }
  });

  it("die() makes update() a no-op", () => {
    const snake = new Snake(100, 100);
    snake.die();
    const beforeX = snake.segments[0].x;
    const beforeY = snake.segments[0].y;
    snake.update(1 / 60, 1, 0);
    expect(snake.segments[0].x).toBe(beforeX);
    expect(snake.segments[0].y).toBe(beforeY);
  });

  it("does not self-collide on a realistic 270-degree turn at high body scale", () => {
    // Regression for #49: at high scale, the head's old hitbox
    // (head + body radii ~ 48px at scale 3) was larger than the turn-circle
    // diameter (~33px), so segments on the wraparound of the turning circle
    // fell inside the head's hitbox on ANY turn past ~180deg.
    //
    // Realistic player input: panic 3/4-turn then continue. Sustained spinning
    // (multiple full rotations) is intentionally NOT tested - that geometry
    // IS a real self-bite and can't be distinguished from one.
    const snake = new Snake(2000, 2000);
    snake.grow(80);
    for (let i = 0; i < 200; i++) {
      snake.update(1 / 60, 1, 0);
    }
    expect(snake.scale).toBeGreaterThanOrEqual(2);

    let dirX = 1;
    let dirY = 0;
    const turnPerFrame = tuning.snake.turnRateRadPerSec / 60;
    // 270 deg = 3π/2 radians; at turnRate=11 rad/s, this is ~0.43s = 26 frames.
    const turnFrames = Math.ceil((3 * Math.PI) / 2 / turnPerFrame);
    for (let i = 0; i < turnFrames; i++) {
      const a = Math.atan2(dirY, dirX) + turnPerFrame;
      dirX = Math.cos(a);
      dirY = Math.sin(a);
      snake.update(1 / 60, dirX, dirY);
      expect(snake.checkSelfCollision()).toBe(false);
    }
    // Continue straight for 30 frames after the turn completes.
    for (let i = 0; i < 30; i++) {
      snake.update(1 / 60, dirX, dirY);
      expect(snake.checkSelfCollision()).toBe(false);
    }
  });

  it("reset(x,y) brings the snake back to initial length at the given point", () => {
    const snake = new Snake(100, 100);
    snake.grow(5);
    for (let i = 0; i < 60; i++) {
      snake.update(1 / 60, 1, 0);
    }
    snake.die();
    snake.reset(50, 60);
    expect(snake.segments.length).toBe(tuning.snake.initialLength);
    expect(snake.dead).toBe(false);
    expect(snake.growth).toBe(0);
    expect(snake.segments[0].x).toBe(50);
    expect(snake.segments[0].y).toBe(60);
  });
});
