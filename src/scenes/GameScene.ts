import * as Phaser from "phaser";
import { SpatialHash } from "../../shared/spatialHash";
import { type FoodItem, FoodSpawner } from "../food/foodSpawner";
import { PointerSteering } from "../input/pointer";
import { Snake } from "../snake/snake";
import { SnakeView } from "../snake/snakeView";
import { tuning } from "../tuning";

export class GameScene extends Phaser.Scene {
  private snake!: Snake;
  private snakeView!: SnakeView;
  private steering!: PointerSteering;
  private foodHash!: SpatialHash<FoodItem>;
  private foodSpawner!: FoodSpawner;
  private restartPrompt: Phaser.GameObjects.Text | null = null;
  private waitingForRestart = false;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.startGame();
  }

  private startGame(): void {
    const cx = tuning.world.widthPx / 2;
    const cy = tuning.world.heightPx / 2;
    this.snake = new Snake(cx, cy);
    this.snakeView = new SnakeView(this, this.snake);
    this.steering = new PointerSteering(this);
    this.foodHash = new SpatialHash<FoodItem>(tuning.world.spatialBucketPx);
    this.foodSpawner = new FoodSpawner(this, this.foodHash);
    this.foodSpawner.update(this.snake);
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
    this.restartPrompt = this.add
      .text(tuning.world.widthPx / 2, tuning.world.heightPx / 2, "tap to play again", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "32px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.input.once("pointerdown", () => this.restart());
    this.input.keyboard?.once("keydown-SPACE", () => this.restart());
  }

  private restart(): void {
    this.snakeView.destroy();
    this.steering.destroy();
    this.foodSpawner.destroy();
    this.foodHash.clear();
    this.startGame();
  }
}
