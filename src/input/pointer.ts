/**
 * PointerSteering converts pointer/touch position into a smoothed unit
 * direction vector toward the cursor. Arrow keys override pointer.
 *
 * Mouse-angle math adapted from
 * https://github.com/knagaitsev/slither.io-clone/blob/master/src/playerSnake.js
 * (MIT). Rewritten in TypeScript; the turn-rate smoothing cap is our addition.
 *
 * Touch-first design: any pointer event on the canvas drives the heading.
 * Phase 2 forward-note: `pointer.worldX/Y` already reflects the active
 * camera transform, so this still produces correct world coords once the
 * camera follows the snake.
 */

import type * as Phaser from "phaser";
import { tuning } from "../tuning";

export interface SteerOutput {
  dirX: number;
  dirY: number;
}

export class PointerSteering {
  private lastPointerX = 0;
  private lastPointerY = 0;
  private hasPointer = false;
  private currentDirX = 0;
  private currentDirY = 0;
  private hasInput = false;
  private arrows: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private pointerDownHandler: (p: Phaser.Input.Pointer) => void;
  private pointerMoveHandler: (p: Phaser.Input.Pointer) => void;

  constructor(private scene: Phaser.Scene) {
    this.pointerDownHandler = (p) => this.onPointer(p);
    this.pointerMoveHandler = (p) => this.onPointer(p);
    scene.input.on("pointerdown", this.pointerDownHandler);
    scene.input.on("pointermove", this.pointerMoveHandler);
    this.arrows = scene.input.keyboard?.createCursorKeys() ?? null;
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    this.lastPointerX = p.worldX;
    this.lastPointerY = p.worldY;
    this.hasPointer = true;
  }

  private readArrows(): { x: number; y: number } | null {
    if (!this.arrows) return null;
    let x = 0;
    let y = 0;
    if (this.arrows.left?.isDown) x -= 1;
    if (this.arrows.right?.isDown) x += 1;
    if (this.arrows.up?.isDown) y -= 1;
    if (this.arrows.down?.isDown) y += 1;
    if (x === 0 && y === 0) return null;
    const len = Math.hypot(x, y);
    return { x: x / len, y: y / len };
  }

  update(dt: number, headX: number, headY: number): SteerOutput {
    let targetDirX = 0;
    let targetDirY = 0;
    let gotTarget = false;
    const arrow = this.readArrows();
    if (arrow) {
      targetDirX = arrow.x;
      targetDirY = arrow.y;
      gotTarget = true;
    } else if (this.hasPointer) {
      const dx = this.lastPointerX - headX;
      const dy = this.lastPointerY - headY;
      const len = Math.hypot(dx, dy);
      if (len > 1e-3) {
        targetDirX = dx / len;
        targetDirY = dy / len;
        gotTarget = true;
      }
    }
    if (!gotTarget && !this.hasInput) return { dirX: 0, dirY: 0 };
    if (gotTarget) this.hasInput = true;
    if (!gotTarget) return { dirX: this.currentDirX, dirY: this.currentDirY };
    if (this.currentDirX === 0 && this.currentDirY === 0) {
      this.currentDirX = targetDirX;
      this.currentDirY = targetDirY;
    } else {
      const currentAngle = Math.atan2(this.currentDirY, this.currentDirX);
      const targetAngle = Math.atan2(targetDirY, targetDirX);
      let delta = targetAngle - currentAngle;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const maxStep = tuning.snake.turnRateRadPerSec * dt;
      const step = Math.max(-maxStep, Math.min(maxStep, delta));
      const newAngle = currentAngle + step;
      this.currentDirX = Math.cos(newAngle);
      this.currentDirY = Math.sin(newAngle);
    }
    return { dirX: this.currentDirX, dirY: this.currentDirY };
  }

  destroy(): void {
    this.scene.input.off("pointerdown", this.pointerDownHandler);
    this.scene.input.off("pointermove", this.pointerMoveHandler);
  }
}
