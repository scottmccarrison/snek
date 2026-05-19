/**
 * SnakeView - renders a Snake's segment chain as overlapping circles via
 * Phaser Graphics. Head draws on top of body. playDeathAnimation tweens
 * the entire chain toward tuning.snake.deadColor over tuning.death.fadeMs.
 *
 * Accepts a RenderableSnake interface so both the local Snake class and
 * MP-mode SnakeRenderState DTOs from the server can be rendered without
 * duplication. Call applyState() each frame in MP mode to feed the latest
 * snapshot; in solo mode the Snake instance is the same identity reference
 * so applyState() is called once at construction.
 */

import { tuning } from "../tuning";

export interface RenderableSnake {
  id: string;
  color: number;
  segments: ReadonlyArray<{ x: number; y: number }>;
  scale: number;
  boostActive: boolean;
  dead: boolean;
  headRadius: number;
  bodyRadius: number;
}

export interface SnakeViewOptions {
  outlineExtraPx?: number;
  outlineColor?: number;
  outlineAlpha?: number;
}

export class SnakeView {
  private graphics: Phaser.GameObjects.Graphics;
  private snake: RenderableSnake;
  private scene: Phaser.Scene;
  private fadeFraction: number;
  private options: SnakeViewOptions | undefined;

  constructor(scene: Phaser.Scene, snake: RenderableSnake, options?: SnakeViewOptions) {
    this.scene = scene;
    this.snake = snake;
    this.options = options;
    this.fadeFraction = 0;
    this.graphics = scene.add.graphics();
  }

  /**
   * Update the cached RenderableSnake reference. In MP mode the GameScene
   * reconciler calls this every snapshot. In solo mode the live Snake
   * instance is already the same reference so this is effectively a no-op.
   */
  applyState(s: RenderableSnake): void {
    this.snake = s;
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
    // While boosting, override the outline color with a hot yellow glow.
    const outlineColor = this.snake.boostActive
      ? tuning.snake.boostOutlineColor
      : (this.options?.outlineColor ?? 0xffffff);
    const outlineAlpha = this.options?.outlineAlpha ?? 0.3;
    // Boost glow uses a wider outline ring for visual clarity.
    const boostGlowExtra = this.snake.boostActive ? 3 : 0;
    const segs = this.snake.segments;
    const headR = this.snake.headRadius;
    const bodyR = this.snake.bodyRadius;
    // Outline grows proportionally with body scale so it stays visible
    // on bigger snakes.
    const outlineScaled = (outlineExtra + boostGlowExtra) * this.snake.scale;
    const hasOutline = outlineExtra > 0 || this.snake.boostActive;
    // Draw from tail to head so head renders on top.
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      const isHead = i === 0;
      const radius = isHead ? headR : bodyR;
      if (hasOutline) {
        this.graphics.fillStyle(outlineColor, outlineAlpha);
        this.graphics.fillCircle(s.x, s.y, radius + outlineScaled);
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
