import { describe, expect, it, vi } from "vitest";
import { SpatialHash } from "../../shared/spatialHash";
import type { FoodItem } from "../food/foodSpawner";
import { FoodSpawner } from "../food/foodSpawner";
import { Snake } from "../snake/snake";
import { tuning } from "../tuning";
import { BotManager } from "./botManager";
import { World } from "./world";

function createSceneStub() {
  const graphics = {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillCircle: vi.fn(),
    destroy: vi.fn(),
  };
  return { add: { graphics: () => graphics } };
}

function makeSetup() {
  const events = { onSnakeDied: vi.fn() };
  const world = new World(events);
  const hash = new SpatialHash<FoodItem>(80);
  const scene = createSceneStub();
  const foodSpawner = new FoodSpawner(scene as unknown as Phaser.Scene, hash);
  // Add player snake.
  const player = new Snake(tuning.world.widthPx / 2, tuning.world.heightPx / 2, {
    id: "player",
    ownerType: "player",
  });
  world.addSnake(player);
  const manager = new BotManager(world, foodSpawner);
  return { world, foodSpawner, manager, player };
}

describe("BotManager", () => {
  it("fills world with targetCount bots on first update", () => {
    const { world, manager, player } = makeSetup();
    const head = player.segments[0];
    manager.update(1 / 60, head.x, head.y);

    let botCount = 0;
    for (const s of world.snakes.values()) {
      if (s.ownerType === "bot") botCount++;
    }
    expect(botCount).toBe(tuning.bot.targetCount);
  });

  it("spawns a replacement bot after respawnDelayMs", () => {
    const { world, manager, player } = makeSetup();
    const head = player.segments[0];
    manager.update(1 / 60, head.x, head.y);

    // Kill one bot.
    const botSnake = Array.from(world.snakes.values()).find((s) => s.ownerType === "bot");
    if (!botSnake) throw new Error("expected a bot snake to exist");
    manager.handleSnakeDeath(botSnake.id);

    let botCount = 0;
    for (const s of world.snakes.values()) {
      if (s.ownerType === "bot") botCount++;
    }
    expect(botCount).toBe(tuning.bot.targetCount - 1);

    // Advance time past respawn delay.
    const dtToRespawn = (tuning.bot.respawnDelayMs + 100) / 1000;
    manager.update(dtToRespawn, head.x, head.y);

    botCount = 0;
    for (const s of world.snakes.values()) {
      if (s.ownerType === "bot") botCount++;
    }
    expect(botCount).toBe(tuning.bot.targetCount);
  });

  it("handleSnakeDeath ignores non-bot snakes", () => {
    const { world, manager, player } = makeSetup();
    const head = player.segments[0];
    manager.update(1 / 60, head.x, head.y);

    const botCountBefore = Array.from(world.snakes.values()).filter(
      (s) => s.ownerType === "bot",
    ).length;

    // Calling handleSnakeDeath on player should be a no-op.
    manager.handleSnakeDeath("player");

    const botCountAfter = Array.from(world.snakes.values()).filter(
      (s) => s.ownerType === "bot",
    ).length;
    expect(botCountAfter).toBe(botCountBefore);
    expect(world.snakes.has("player")).toBe(true);
  });
});
