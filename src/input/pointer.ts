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

export interface PointerSteeringOpts {
  onTouchStart?: (screenX: number, screenY: number) => void;
  onTouchMove?: (screenX: number, screenY: number) => void;
  onTouchEnd?: () => void;
}

export class PointerSteering {
  private mouseLastWorldX = 0;
  private mouseLastWorldY = 0;
  private hasMousePointer = false;
  private touchAnchorX = 0;
  private touchAnchorY = 0;
  private touchCurrentX = 0;
  private touchCurrentY = 0;
  private touchDragging = false;
  // ID of the touch pointer currently driving the joystick. Secondary
  // touches (palm contact, second finger) are ignored - we only honor
  // the first touchdown until that pointer lifts. Prevents accidental
  // multi-touch from stealing the anchor or releasing it early.
  private activeTouchId: number | null = null;
  // Total number of currently-held touches. Includes the primary steering
  // touch plus any secondary touches. Used to detect the "second finger
  // held" boost gesture.
  private touchCount = 0;
  private currentDirX = 0;
  private currentDirY = 0;
  private hasInput = false;
  private arrows: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private spaceKey: Phaser.Input.Keyboard.Key | null = null;
  private pointerDownHandler: (p: Phaser.Input.Pointer) => void;
  private pointerMoveHandler: (p: Phaser.Input.Pointer) => void;
  private pointerUpHandler: (p: Phaser.Input.Pointer) => void;
  private pointerCancelHandler: (p: Phaser.Input.Pointer) => void;
  private visibilityChangeHandler: () => void;
  private opts: PointerSteeringOpts;

  constructor(
    private scene: Phaser.Scene,
    private shouldIgnore: ((screenX: number, screenY: number) => boolean) | null = null,
    opts: PointerSteeringOpts = {},
  ) {
    this.opts = opts;
    this.pointerDownHandler = (p) => this.onPointerDown(p);
    this.pointerMoveHandler = (p) => this.onPointerMove(p);
    this.pointerUpHandler = (p) => this.onPointerUp(p);
    this.pointerCancelHandler = (p) => this.onPointerCancel(p);
    this.visibilityChangeHandler = () => this.onVisibilityChange();
    scene.input.on("pointerdown", this.pointerDownHandler);
    scene.input.on("pointermove", this.pointerMoveHandler);
    scene.input.on("pointerup", this.pointerUpHandler);
    scene.input.on("pointercancel", this.pointerCancelHandler);
    document.addEventListener("visibilitychange", this.visibilityChangeHandler);
    this.arrows = scene.input.keyboard?.createCursorKeys() ?? null;
    // Explicit Space key binding - do not rely on CursorKeys.space which
    // varies across Phaser versions.
    this.spaceKey = scene.input.keyboard?.addKey("SPACE") ?? null;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.shouldIgnore?.(p.x, p.y)) return;
    if (!p.wasTouch) {
      this.mouseLastWorldX = p.worldX;
      this.mouseLastWorldY = p.worldY;
      this.hasMousePointer = true;
    } else {
      // Increment touchCount BEFORE the early-return guard so secondary
      // touches are always counted even when the primary joystick is active.
      this.touchCount++;
      // Only honor the FIRST touch for joystick steering. Secondary touches
      // are counted (for boost detection) but ignored for direction.
      if (this.activeTouchId !== null) return;
      this.activeTouchId = p.id;
      this.touchAnchorX = p.x;
      this.touchAnchorY = p.y;
      this.touchCurrentX = p.x;
      this.touchCurrentY = p.y;
      this.touchDragging = true;
      this.opts.onTouchStart?.(p.x, p.y);
    }
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!p.wasTouch) {
      if (this.shouldIgnore?.(p.x, p.y)) return;
      this.mouseLastWorldX = p.worldX;
      this.mouseLastWorldY = p.worldY;
      this.hasMousePointer = true;
    } else {
      // Ignore moves from any pointer other than the active one.
      if (p.id !== this.activeTouchId) return;
      if (!this.touchDragging) return;
      this.touchCurrentX = p.x;
      this.touchCurrentY = p.y;
      this.opts.onTouchMove?.(p.x, p.y);
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (!p.wasTouch) return;
    // Decrement touchCount BEFORE the early-return guard so secondary
    // touches are always counted down, not just the primary.
    this.touchCount = Math.max(0, this.touchCount - 1);
    // Only the ACTIVE touch lifting releases the joystick. Lifting a
    // secondary finger does not stop steering with the primary thumb.
    if (p.id !== this.activeTouchId) return;
    this.activeTouchId = null;
    this.touchDragging = false;
    this.opts.onTouchEnd?.();
  }

  private onPointerCancel(p: Phaser.Input.Pointer): void {
    // pointercancel fires on iOS Safari when focus is stolen (address bar,
    // share sheet, context menu). Mirror pointerup: decrement count and
    // release the active touch if this was the primary pointer.
    if (!p.wasTouch) return;
    this.touchCount = Math.max(0, this.touchCount - 1);
    if (p.id !== this.activeTouchId) return;
    this.activeTouchId = null;
    this.touchDragging = false;
    this.opts.onTouchEnd?.();
  }

  private onVisibilityChange(): void {
    // Page hidden (user switched apps, locked screen, etc.) - release all
    // touch state so the snake doesn't fly off when the user returns.
    if (typeof document !== "undefined" && document.hidden) {
      this.touchCount = 0;
      this.activeTouchId = null;
      this.touchDragging = false;
      this.opts.onTouchEnd?.();
    }
  }

  /**
   * Returns true when boost should be active: second touch held OR Space bar.
   * Does NOT return true for only one touch (the joystick touch itself).
   */
  getBoostHeld(): boolean {
    return this.touchCount > 1 || !!this.spaceKey?.isDown;
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
    } else if (this.touchDragging) {
      const dx = this.touchCurrentX - this.touchAnchorX;
      const dy = this.touchCurrentY - this.touchAnchorY;
      const len = Math.hypot(dx, dy);
      if (len > tuning.joystick.minDragPx) {
        targetDirX = dx / len;
        targetDirY = dy / len;
        gotTarget = true;
      }
    } else if (this.hasMousePointer) {
      const dx = this.mouseLastWorldX - headX;
      const dy = this.mouseLastWorldY - headY;
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
    this.scene.input.off("pointerup", this.pointerUpHandler);
    this.scene.input.off("pointercancel", this.pointerCancelHandler);
    document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
  }
}
