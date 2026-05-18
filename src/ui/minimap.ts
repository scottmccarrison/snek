/**
 * Minimap - screen-space Graphics overlay rendering the world frame plus a
 * dot for the snake head at scaled coordinates. Bottom-right corner with a
 * small inset for iOS safe areas. setScrollFactor(0) pins it to the
 * viewport rather than the world.
 *
 * Pointer events landing inside the minimap rect are filtered out of the
 * steering pipeline via the `hitsMinimap` predicate. GameScene wires this
 * to PointerSteering's shouldIgnore callback so taps on the minimap do not
 * steer the snake.
 */

import type * as Phaser from "phaser";
import { tuning } from "../tuning";

export class Minimap {
  private graphics: Phaser.GameObjects.Graphics;
  private screenX: number;
  private screenY: number;

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    this.screenX = cam.width - tuning.minimap.sizePx - tuning.minimap.insetPx;
    this.screenY = cam.height - tuning.minimap.sizePx - tuning.minimap.insetPx;
    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(0).setDepth(2000);
  }

  render(headX: number, headY: number): void {
    const s = tuning.minimap.sizePx;
    const sx = this.screenX;
    const sy = this.screenY;
    this.graphics.clear();
    // Frame background.
    this.graphics.fillStyle(tuning.minimap.bgColor, tuning.minimap.bgAlpha);
    this.graphics.fillRect(sx, sy, s, s);
    // Border.
    this.graphics.lineStyle(2, tuning.minimap.borderColor, 1);
    this.graphics.strokeRect(sx, sy, s, s);
    // Snake head dot, scaled. Clamp to minimap rect to avoid drawing
    // outside the frame during the 1-frame out-of-bounds window.
    const dotX = Math.max(sx, Math.min(sx + s, sx + (headX / tuning.world.widthPx) * s));
    const dotY = Math.max(sy, Math.min(sy + s, sy + (headY / tuning.world.heightPx) * s));
    this.graphics.fillStyle(tuning.snake.headColor, 1);
    this.graphics.fillCircle(dotX, dotY, tuning.minimap.dotRadiusPx);
  }

  hitsMinimap(screenX: number, screenY: number): boolean {
    const s = tuning.minimap.sizePx;
    return (
      screenX >= this.screenX &&
      screenX < this.screenX + s &&
      screenY >= this.screenY &&
      screenY < this.screenY + s
    );
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
