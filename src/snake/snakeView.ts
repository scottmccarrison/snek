/**
 * SnakeView - renders a Snake's segment chain as overlapping circles via
 * Phaser Graphics. Head draws on top of body. playDeathAnimation tweens
 * the entire chain toward tuning.snake.deadColor over tuning.death.fadeMs.
 */

import { tuning } from "../tuning";
import type { Snake } from "./snake";

export class SnakeView {
  private graphics: Phaser.GameObjects.Graphics;
  private snake: Snake;
  private scene: Phaser.Scene;
  private fadeFraction: number;

  constructor(scene: Phaser.Scene, snake: Snake) {
    this.scene = scene;
    this.snake = snake;
    this.fadeFraction = 0;
    this.graphics = scene.add.graphics();
  }

  render(): void {
    this.graphics.clear();
    const segs = this.snake.segments;
    // Draw from tail to head so head renders on top.
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      if (i === 0) {
        // Head segment.
        const color = this.lerpColor(
          tuning.snake.headColor,
          tuning.snake.deadColor,
          this.fadeFraction,
        );
        this.graphics.fillStyle(color);
        this.graphics.fillCircle(s.x, s.y, tuning.snake.headRadiusPx);
      } else {
        // Body segment.
        const color = this.lerpColor(
          tuning.snake.bodyColor,
          tuning.snake.deadColor,
          this.fadeFraction,
        );
        this.graphics.fillStyle(color);
        this.graphics.fillCircle(s.x, s.y, tuning.snake.bodyRadiusPx);
      }
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
