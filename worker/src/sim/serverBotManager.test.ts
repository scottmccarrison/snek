// @vitest-environment node
import { describe, expect, it } from "vitest";
import { tuning } from "../../../src/tuning";
import { ServerBotManager } from "./serverBotManager";
import { SnakeSim } from "./snakeSim";

describe("ServerBotManager", () => {
  it("spawns bots to fill totalSnakesPerRoom when no humans", () => {
    const sim = new SnakeSim(1);
    const mgr = new ServerBotManager(2);
    mgr.update(sim, 0, 1 / 20);
    expect(sim.world.snakes.size).toBe(tuning.net.totalSnakesPerRoom);
  });

  it("leaves room for human snakes", () => {
    const sim = new SnakeSim(1);
    sim.addPlayer("p_a", { color: 0, nickname: "AAA" });
    sim.addPlayer("p_b", { color: 0, nickname: "BBB" });
    const mgr = new ServerBotManager(2);
    mgr.update(sim, 2, 1 / 20);
    expect(sim.world.snakes.size).toBe(tuning.net.totalSnakesPerRoom);
    // 2 humans + 8 bots
    let humans = 0;
    let bots = 0;
    for (const s of sim.world.snakes.values()) {
      if (s.ownerType === "player") humans++;
      else bots++;
    }
    expect(humans).toBe(2);
    expect(bots).toBe(tuning.net.totalSnakesPerRoom - 2);
  });

  it("despawns excess bots when humans join", () => {
    const sim = new SnakeSim(1);
    const mgr = new ServerBotManager(2);
    mgr.update(sim, 0, 1 / 20); // 10 bots
    sim.addPlayer("p_a", { color: 0, nickname: "AAA" });
    sim.addPlayer("p_b", { color: 0, nickname: "BBB" });
    sim.addPlayer("p_c", { color: 0, nickname: "CCC" });
    mgr.update(sim, 3, 1 / 20); // re-balance
    expect(sim.world.snakes.size).toBe(tuning.net.totalSnakesPerRoom);
    let bots = 0;
    for (const s of sim.world.snakes.values()) if (s.ownerType === "bot") bots++;
    expect(bots).toBe(tuning.net.totalSnakesPerRoom - 3);
  });

  it("bot AI drives pendingDir each tick", () => {
    const sim = new SnakeSim(1);
    const mgr = new ServerBotManager(2);
    mgr.update(sim, 0, 1 / 20);
    // After update, every bot should have non-zero pendingDir set
    let withDir = 0;
    for (const s of sim.world.snakes.values()) {
      if (s.ownerType !== "bot") continue;
      if (s.pendingDirX !== 0 || s.pendingDirY !== 0) withDir++;
    }
    expect(withDir).toBeGreaterThan(0);
  });

  it("serialize then restore preserves nextBotId", () => {
    const sim = new SnakeSim(1);
    const mgr = new ServerBotManager(2);
    mgr.update(sim, 0, 1 / 20);
    const data = mgr.serialize();
    const restored = ServerBotManager.restore(data, sim);
    expect(restored.serialize().nextBotId).toBe(data.nextBotId);
  });
});
