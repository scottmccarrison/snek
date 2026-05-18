import { describe, expect, it, vi } from "vitest";
import { World } from "../sim/world";
import { tuning } from "../tuning";
import { BotBrain } from "./botBrain";
import { Snake } from "./snake";

function makeWorld() {
  const events = { onSnakeDied: vi.fn() };
  return new World(events);
}

describe("BotBrain", () => {
  it("returns a unit vector direction (len ~= 1)", () => {
    const brain = new BotBrain();
    const snake = new Snake(500, 500, { id: "bot1", ownerType: "bot" });
    const world = makeWorld();
    world.addSnake(snake);

    const { dirX, dirY } = brain.update(snake, world, [], 1 / 60);
    const len = Math.hypot(dirX, dirY);
    expect(len).toBeCloseTo(1, 5);
  });

  it("flees from a larger snake within fleeRadiusPx", () => {
    const brain = new BotBrain();
    const bot = new Snake(500, 500, { id: "bot", ownerType: "bot", initialLength: 5 });
    const bigSnake = new Snake(500 + tuning.bot.fleeRadiusPx - 10, 500, {
      id: "big",
      ownerType: "bot",
      initialLength: 30,
    });
    const world = makeWorld();
    world.addSnake(bot);
    world.addSnake(bigSnake);

    const { dirX } = brain.update(bot, world, [], 1 / 60);
    // Should flee left (away from big snake which is to the right).
    expect(dirX).toBeLessThan(0);
  });

  it("seeks nearest food within seekRadiusPx when no threat", () => {
    const brain = new BotBrain();
    const bot = new Snake(500, 500, { id: "bot", ownerType: "bot" });
    const world = makeWorld();
    world.addSnake(bot);

    // Place food to the right within seekRadiusPx.
    const foods = [{ x: 500 + tuning.bot.seekRadiusPx - 10, y: 500, isPellet: false }];
    const { dirX, dirY } = brain.update(bot, world, foods, 1 / 60);
    // Should seek right.
    expect(dirX).toBeGreaterThan(0);
    expect(Math.abs(dirY)).toBeLessThan(0.01);
  });

  it("wanders when no threat and no food in range", () => {
    const brain = new BotBrain();
    const bot = new Snake(500, 500, { id: "bot", ownerType: "bot" });
    const world = makeWorld();
    world.addSnake(bot);

    // Food outside seekRadiusPx.
    const farFoods = [{ x: 500 + tuning.bot.seekRadiusPx + 100, y: 500, isPellet: false }];
    const result = brain.update(bot, world, farFoods, 1 / 60);
    // Direction is non-zero (heading somewhere).
    const len = Math.hypot(result.dirX, result.dirY);
    expect(len).toBeGreaterThan(0.9);
  });
});
