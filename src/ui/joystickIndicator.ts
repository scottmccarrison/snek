/**
 * JoystickIndicator - faint translucent ring at touchdown anchor + dot at
 * current finger position. Used only on touch input; mouse input has no
 * visual indicator. setScrollFactor(0) pins it to the viewport.
 */

import type * as Phaser from "phaser";
import { tuning } from "../tuning";

export class JoystickIndicator {
  private anchorGraphics: Phaser.GameObjects.Graphics;
  private stickGraphics: Phaser.GameObjects.Graphics;
  private anchorX = 0;
  private anchorY = 0;
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.anchorGraphics = scene.add.graphics();
    this.anchorGraphics.setScrollFactor(0).setDepth(1900).setVisible(false);
    this.stickGraphics = scene.add.graphics();
    this.stickGraphics.setScrollFactor(0).setDepth(1910).setVisible(false);
  }

  show(anchorX: number, anchorY: number): void {
    this.visible = true;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.anchorGraphics.clear();
    this.anchorGraphics.lineStyle(2, tuning.joystick.color, tuning.joystick.alpha);
    this.anchorGraphics.strokeCircle(anchorX, anchorY, tuning.joystick.anchorRadiusPx);
    this.anchorGraphics.setVisible(true);
    this.updateStick(anchorX, anchorY);
  }

  updateStick(currentX: number, currentY: number): void {
    if (!this.visible) return;
    // Clamp the visible stick to the anchor ring radius so the dot doesn't
    // fly off-screen on long drags. PointerSteering reads the RAW drag delta
    // for direction so steering is unaffected - this clamp is visual only.
    const dx = currentX - this.anchorX;
    const dy = currentY - this.anchorY;
    const len = Math.hypot(dx, dy);
    let stickX = currentX;
    let stickY = currentY;
    if (len > tuning.joystick.anchorRadiusPx) {
      stickX = this.anchorX + (dx / len) * tuning.joystick.anchorRadiusPx;
      stickY = this.anchorY + (dy / len) * tuning.joystick.anchorRadiusPx;
    }
    this.stickGraphics.clear();
    this.stickGraphics.fillStyle(tuning.joystick.color, tuning.joystick.alpha);
    this.stickGraphics.fillCircle(stickX, stickY, tuning.joystick.stickRadiusPx);
    this.stickGraphics.setVisible(true);
  }

  hide(): void {
    this.visible = false;
    this.anchorGraphics.setVisible(false);
    this.stickGraphics.setVisible(false);
  }

  destroy(): void {
    this.anchorGraphics.destroy();
    this.stickGraphics.destroy();
  }
}
