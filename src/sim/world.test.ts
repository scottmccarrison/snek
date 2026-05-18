import { describe, expect, it, vi } from "vitest";
import { Snake } from "../snake/snake";
import { World } from "./world";

function makeWorld() {
  const events = { onSnakeDied: vi.fn() };
  const world = new World(events);
  return { world, events };
}

describe("World", () => {
  it("addSnake/removeSnake manages snakes map", () => {
    const { world } = makeWorld();
    const snake = new Snake(100, 100, { id: "a" });
    world.addSnake(snake);
    expect(world.snakes.has("a")).toBe(true);
    world.removeSnake("a");
    expect(world.snakes.has("a")).toBe(false);
  });

  it("update advances live snakes and skips dead ones", () => {
    const { world } = makeWorld();
    const alive = new Snake(100, 100, { id: "alive" });
    const dead = new Snake(200, 200, { id: "dead" });
    dead.die();
    world.addSnake(alive);
    world.addSnake(dead);

    const beforeAliveX = alive.segments[0].x;
    const beforeDeadX = dead.segments[0].x;

    // Give alive snake a direction via pendingDir
    alive.pendingDirX = 1;
    alive.pendingDirY = 0;
    world.update(1 / 60);

    expect(alive.segments[0].x).toBeGreaterThan(beforeAliveX);
    expect(dead.segments[0].x).toBe(beforeDeadX);
  });

  it("head-vs-body collision kills the attacking snake and fires onSnakeDied", () => {
    const { world, events } = makeWorld();
    // attacker at (500, 100), defender at (500, 200) - different Y so bodies don't overlap.
    // defender has 20 segments going left from (500, 200).
    // Place attacker head at defender.segments[5] = (500 - 5*8, 200) = (460, 200).
    const attacker = new Snake(500, 100, { id: "attacker" });
    const defender = new Snake(500, 200, { id: "defender", initialLength: 20 });
    world.addSnake(attacker);
    world.addSnake(defender);

    // Rig attacker head to sit directly on defender body segment[5] (no kinematics yet).
    attacker.segments[0].x = defender.segments[5].x;
    attacker.segments[0].y = defender.segments[5].y;

    world.checkCollisionsNow();

    expect(attacker.dead).toBe(true);
    expect(attacker.killedBy).toBe("defender");
    expect(events.onSnakeDied).toHaveBeenCalledWith("attacker", "defender");
  });

  it("mutual kill: both snakes can die in the same frame", () => {
    const { world, events } = makeWorld();
    // Snake A at (500, 100), 20 segments going left.
    // Snake B at (460, 200), 20 segments going left.
    // Rig: A.head -> B.segments[5], B.head -> A.segments[5].
    const a = new Snake(500, 100, { id: "a", initialLength: 20 });
    const b = new Snake(460, 200, { id: "b", initialLength: 20 });
    world.addSnake(a);
    world.addSnake(b);

    // Snapshot body[5] positions before rigging heads.
    const aBody5x = a.segments[5].x; // 500 - 5*8 = 460
    const aBody5y = a.segments[5].y; // 100
    const bBody5x = b.segments[5].x; // 460 - 5*8 = 420
    const bBody5y = b.segments[5].y; // 200

    // Place each head on the other's body segment[5].
    a.segments[0].x = bBody5x;
    a.segments[0].y = bBody5y;
    b.segments[0].x = aBody5x;
    b.segments[0].y = aBody5y;

    // Use checkCollisionsNow to skip kinematics (which would warp body positions).
    world.checkCollisionsNow();

    expect(a.dead).toBe(true);
    expect(b.dead).toBe(true);
    expect(events.onSnakeDied).toHaveBeenCalledTimes(2);
  });

  it("no collision when head touches own body (self-collision is handled by GameScene)", () => {
    const { world, events } = makeWorld();
    const snake = new Snake(100, 100, { id: "s", initialLength: 20 });
    world.addSnake(snake);

    // Place head on segment[5] - World does NOT check self-collision.
    snake.segments[0].x = snake.segments[5].x;
    snake.segments[0].y = snake.segments[5].y;

    world.checkCollisionsNow();

    expect(snake.dead).toBe(false);
    expect(events.onSnakeDied).not.toHaveBeenCalled();
  });
});
