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

  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(0).setDepth(2000);
  }

  // Read camera dimensions per call rather than caching. With Phaser.Scale.FIT
  // and the current game config, cam.width/height are static at the logical
  // 1280x720, but reading per-call keeps the minimap correct if the scale mode
  // ever changes (e.g., Scale.RESIZE) without an explicit resize handler.
  private origin(): { sx: number; sy: number } {
    const cam = this.scene.cameras.main;
    return {
      sx: cam.width - tuning.minimap.sizePx - tuning.minimap.insetPx,
      sy: cam.height - tuning.minimap.sizePx - tuning.minimap.insetPx,
    };
  }

  render(headX: number, headY: number): void {
    const s = tuning.minimap.sizePx;
    const { sx, sy } = this.origin();
    this.graphics.clear();
    // Frame background.
    this.graphics.fillStyle(tuning.minimap.bgColor, tuning.minimap.bgAlpha);
    this.graphics.fillRect(sx, sy, s, s);
    // Border.
    this.graphics.lineStyle(2, tuning.minimap.borderColor, 1);
    this.graphics.strokeRect(sx, sy, s, s);
    // Snake head dot, scaled. Clamp center to (sx+r, sx+s-r) so the dot's
    // edge stays inside the minimap rect during the 1-frame OOB window.
    const r = tuning.minimap.dotRadiusPx;
    const rawX = sx + (headX / tuning.world.widthPx) * s;
    const rawY = sy + (headY / tuning.world.heightPx) * s;
    const dotX = Math.max(sx + r, Math.min(sx + s - r, rawX));
    const dotY = Math.max(sy + r, Math.min(sy + s - r, rawY));
    this.graphics.fillStyle(tuning.snake.headColor, 1);
    this.graphics.fillCircle(dotX, dotY, r);
  }

  hitsMinimap(screenX: number, screenY: number): boolean {
    const s = tuning.minimap.sizePx;
    const { sx, sy } = this.origin();
    return screenX >= sx && screenX < sx + s && screenY >= sy && screenY < sy + s;
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
