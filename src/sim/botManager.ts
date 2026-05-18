import type { FoodSpawner } from "../food/foodSpawner";
import { BotBrain } from "../snake/botBrain";
import type { Snake } from "../snake/snake";
import { Snake as SnakeClass } from "../snake/snake";
import { tuning } from "../tuning";
import type { World } from "./world";

export class BotManager {
  private brains: Map<string, BotBrain> = new Map();
  private deathTimers: Map<string, { at: number }> = new Map();
  private elapsedMs = 0;
  private nextBotId = 0;
  onBotSpawned?: (snake: Snake) => void;

  constructor(
    private world: World,
    private foodSpawner: FoodSpawner,
  ) {}

  // Called by GameScene wiring from World.onSnakeDied.
  handleSnakeDeath(snakeId: string): void {
    const snake = this.world.snakes.get(snakeId);
    if (!snake) return;
    if (snake.ownerType !== "bot") return;
    // Spawn pellet burst from snake's body.
    this.foodSpawner.spawnPelletBurst(snake.segments.map((s) => ({ x: s.x, y: s.y })));
    // Schedule respawn.
    this.deathTimers.set(snakeId, { at: this.elapsedMs + tuning.bot.respawnDelayMs });
    this.brains.delete(snakeId);
    this.world.removeSnake(snakeId);
  }

  update(dt: number, playerHeadX: number, playerHeadY: number): void {
    this.elapsedMs += dt * 1000;
    // Handle respawn timers.
    for (const [id, timer] of this.deathTimers) {
      if (this.elapsedMs >= timer.at) {
        this.spawnBot(playerHeadX, playerHeadY);
        this.deathTimers.delete(id);
      }
    }
    // Top up to targetCount.
    let botCount = 0;
    for (const s of this.world.snakes.values()) {
      if (s.ownerType === "bot" && !s.dead) botCount++;
    }
    while (botCount < tuning.bot.targetCount && this.deathTimers.size === 0) {
      if (!this.spawnBot(playerHeadX, playerHeadY)) break;
      botCount++;
    }
    // Drive bot brains.
    const foods = this.foodSpawner.getFoods();
    for (const snake of this.world.snakes.values()) {
      if (snake.ownerType !== "bot") continue;
      if (snake.dead) continue;
      const brain = this.brains.get(snake.id);
      if (!brain) continue;
      const { dirX, dirY } = brain.update(snake, this.world, foods, dt);
      snake.pendingDirX = dirX;
      snake.pendingDirY = dirY;
    }
  }

  private spawnBot(playerHeadX: number, playerHeadY: number): boolean {
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = Math.random() * tuning.world.widthPx;
      const y = Math.random() * tuning.world.heightPx;
      const dx = x - playerHeadX;
      const dy = y - playerHeadY;
      if (Math.hypot(dx, dy) < tuning.bot.minRespawnDistFromPlayerPx) continue;
      const id = `bot-${this.nextBotId++}`;
      const colorIdx = this.nextBotId % tuning.bot.palette.length;
      const color = tuning.bot.palette[colorIdx];
      const len =
        tuning.bot.minLength +
        Math.floor(Math.random() * (tuning.bot.maxLength - tuning.bot.minLength + 1));
      const snake = new SnakeClass(x, y, { id, ownerType: "bot", color, initialLength: len });
      this.world.addSnake(snake);
      this.brains.set(id, new BotBrain());
      this.onBotSpawned?.(snake);
      return true;
    }
    return false;
  }

  destroy(): void {
    this.brains.clear();
    this.deathTimers.clear();
  }
}
