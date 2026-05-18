import * as Phaser from "phaser";
import { SpatialHash } from "../../shared/spatialHash";
import { type FoodItem, FoodSpawner } from "../food/foodSpawner";
import { PointerSteering } from "../input/pointer";
import { Snake } from "../snake/snake";
import { SnakeView } from "../snake/snakeView";
import { tuning } from "../tuning";
import { Minimap } from "../ui/minimap";

export class GameScene extends Phaser.Scene {
  private snake!: Snake;
  private snakeView!: SnakeView;
  private steering!: PointerSteering;
  private foodHash!: SpatialHash<FoodItem>;
  private foodSpawner!: FoodSpawner;
  private minimap!: Minimap;
  private restartPrompt: Phaser.GameObjects.Text | null = null;
  private waitingForRestart = false;
  private worldChromeCreated = false;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.createWorldChrome();
    this.startGame();
  }

  // Static world dressing - background grid, edges, vignette. Created once.
  private createWorldChrome(): void {
    if (this.worldChromeCreated) return;
    this.worldChromeCreated = true;

    // Procedural grid texture.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(tuning.world.bgFillColor, 1);
    g.fillRect(0, 0, 32, 32);
    g.lineStyle(1, tuning.world.bgGridColor, 0.5);
    g.lineBetween(0, 0, 32, 0);
    g.lineBetween(0, 0, 0, 32);
    g.generateTexture("snek-grid", 32, 32);
    g.destroy();

    // Tiled background filling the world.
    const bg = this.add.tileSprite(
      tuning.world.widthPx / 2,
      tuning.world.heightPx / 2,
      tuning.world.widthPx,
      tuning.world.heightPx,
      "snek-grid",
    );
    bg.setDepth(-100);

    // Edge vignette (semi-transparent rects, one per edge).
    const v = this.add.graphics();
    v.fillStyle(tuning.edge.vignetteColor, tuning.edge.vignetteAlpha);
    v.fillRect(0, 0, tuning.world.widthPx, tuning.edge.vignettePx);
    v.fillRect(
      0,
      tuning.world.heightPx - tuning.edge.vignettePx,
      tuning.world.widthPx,
      tuning.edge.vignettePx,
    );
    v.fillRect(0, 0, tuning.edge.vignettePx, tuning.world.heightPx);
    v.fillRect(
      tuning.world.widthPx - tuning.edge.vignettePx,
      0,
      tuning.edge.vignettePx,
      tuning.world.heightPx,
    );
    v.setDepth(-95);

    // World boundary stroke.
    const border = this.add.graphics();
    border.lineStyle(tuning.edge.borderPx, tuning.edge.borderColor, 1);
    border.strokeRect(0, 0, tuning.world.widthPx, tuning.world.heightPx);
    border.setDepth(-90);

    // Camera bounds.
    this.cameras.main.setBounds(0, 0, tuning.world.widthPx, tuning.world.heightPx);
  }

  private startGame(): void {
    const cx = tuning.world.widthPx / 2;
    const cy = tuning.world.heightPx / 2;
    this.snake = new Snake(cx, cy);
    this.snakeView = new SnakeView(this, this.snake);

    // Construct minimap first so the steering callback can reference it.
    this.minimap = new Minimap(this);

    this.steering = new PointerSteering(this, (screenX, screenY) =>
      this.minimap.hitsMinimap(screenX, screenY),
    );

    this.foodHash = new SpatialHash<FoodItem>(tuning.world.spatialBucketPx);
    this.foodSpawner = new FoodSpawner(this, this.foodHash);
    this.foodSpawner.update(this.snake);

    // Camera follows the snake head. Phaser.Camera.startFollow's signature
    // accepts `GameObject | object` and reads `.x`/`.y` each frame, so the
    // plain segments[0] works directly with no cast. Re-call after every
    // Snake construction OR Snake.reset() - segments[0] object identity
    // changes on reset.
    this.cameras.main.startFollow(
      this.snake.segments[0],
      true,
      tuning.camera.lerp,
      tuning.camera.lerp,
    );

    if (this.restartPrompt) {
      this.restartPrompt.destroy();
      this.restartPrompt = null;
    }
    this.waitingForRestart = false;
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    if (this.waitingForRestart) return;
    if (this.snake.dead) return;

    const head = this.snake.segments[0];
    const { dirX, dirY } = this.steering.update(dt, head.x, head.y);
    this.snake.update(dt, dirX, dirY);

    this.foodSpawner.checkEat(this.snake);
    this.foodSpawner.update(this.snake);

    if (this.snake.checkSelfCollision() || this.isOutOfBounds(this.snake.segments[0])) {
      void this.handleDeath();
      return;
    }

    this.snakeView.render();
    this.minimap.render(head.x, head.y);
  }

  private isOutOfBounds(head: { x: number; y: number }): boolean {
    return (
      head.x < 0 || head.x > tuning.world.widthPx || head.y < 0 || head.y > tuning.world.heightPx
    );
  }

  private async handleDeath(): Promise<void> {
    this.snake.die();
    await this.snakeView.playDeathAnimation();
    this.showRestartPrompt();
  }

  private showRestartPrompt(): void {
    this.waitingForRestart = true;
    const cam = this.cameras.main;
    // Place prompt in viewport screen-space (independent of world scroll).
    this.restartPrompt = this.add
      .text(cam.width / 2, cam.height / 2, "tap to play again", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "32px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2500);
    let consumed = false;
    const doRestart = () => {
      if (consumed) return;
      consumed = true;
      this.restart();
    };
    this.input.once("pointerdown", doRestart);
    this.input.keyboard?.once("keydown-SPACE", doRestart);
  }

  private restart(): void {
    this.snakeView.destroy();
    this.steering.destroy();
    this.foodSpawner.destroy();
    this.foodHash.clear();
    this.minimap.destroy();
    this.startGame();
  }
}
