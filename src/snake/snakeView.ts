/**
 * SnakeView - renders a Snake's segment chain as overlapping circles via
 * Phaser Graphics. Head draws on top of body. playDeathAnimation tweens
 * the entire chain toward tuning.snake.deadColor over tuning.death.fadeMs.
 */

import { tuning } from "../tuning";
import type { Snake } from "./snake";

export interface SnakeViewOptions {
  outlineExtraPx?: number;
  outlineColor?: number;
  outlineAlpha?: number;
}

export class SnakeView {
  private graphics: Phaser.GameObjects.Graphics;
  private snake: Snake;
  private scene: Phaser.Scene;
  private fadeFraction: number;
  private options: SnakeViewOptions | undefined;

  constructor(scene: Phaser.Scene, snake: Snake, options?: SnakeViewOptions) {
    this.scene = scene;
    this.snake = snake;
    this.options = options;
    this.fadeFraction = 0;
    this.graphics = scene.add.graphics();
  }

  private darken(color: number, factor: number): number {
    const r = ((color >> 16) & 0xff) * factor;
    const g = ((color >> 8) & 0xff) * factor;
    const b = (color & 0xff) * factor;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  render(): void {
    this.graphics.clear();
    const headColor = this.lerpColor(this.snake.color, tuning.snake.deadColor, this.fadeFraction);
    const bodyColor = this.lerpColor(
      this.darken(this.snake.color, 0.7),
      tuning.snake.deadColor,
      this.fadeFraction,
    );
    const outlineExtra = this.options?.outlineExtraPx ?? 0;
    const outlineColor = this.options?.outlineColor ?? 0xffffff;
    const outlineAlpha = this.options?.outlineAlpha ?? 0.3;
    const segs = this.snake.segments;
    // Draw from tail to head so head renders on top.
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      const isHead = i === 0;
      const radius = isHead ? tuning.snake.headRadiusPx : tuning.snake.bodyRadiusPx;
      if (outlineExtra > 0) {
        this.graphics.fillStyle(outlineColor, outlineAlpha);
        this.graphics.fillCircle(s.x, s.y, radius + outlineExtra);
      }
      this.graphics.fillStyle(isHead ? headColor : bodyColor, 1);
      this.graphics.fillCircle(s.x, s.y, radius);
    }
  }

  playDeathAnimation(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.scene.scene.isActive()) {
        resolve();
        return;
      }
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: tuning.death.fadeMs,
        onUpdate: (tween) => {
          this.fadeFraction = tween.getValue() ?? 0;
          this.render();
        },
        onComplete: () => resolve(),
      });
    });
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private lerpColor(from: number, to: number, t: number): number {
    const fr = (from >> 16) & 0xff;
    const fg = (from >> 8) & 0xff;
    const fb = from & 0xff;
    const tr = (to >> 16) & 0xff;
    const tg = (to >> 8) & 0xff;
    const tb = to & 0xff;
    const r = Math.round(fr + (tr - fr) * t);
    const g = Math.round(fg + (tg - fg) * t);
    const b = Math.round(fb + (tb - fb) * t);
    return (r << 16) | (g << 8) | b;
  }
}
