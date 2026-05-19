import { SeededRng } from "../../../shared/seededRng";
import { BotBrain } from "../../../src/snake/botBrain";
import { tuning } from "../../../src/tuning";
import type { SnakeSim } from "./snakeSim";

export interface SerializedServerBotManager {
  nicknames: Record<string, string>;
  nextBotId: number;
  rngState: number;
}

export class ServerBotManager {
  private brains = new Map<string, BotBrain>();
  private nicknames = new Map<string, string>();
  private rng: SeededRng;
  private nextBotId = 1;

  constructor(seed: number) {
    this.rng = new SeededRng(seed);
  }

  // Called each PLAYING-phase tick from Room.alarm(). Spawns bots to fill,
  // despawns excess when humans join, drives bot AI for the current frame.
  update(sim: SnakeSim, humanSnakeCount: number, dt: number): void {
    // Despawn excess. Iterate brains keys in insertion order (oldest first).
    while (this.brains.size + humanSnakeCount > tuning.net.totalSnakesPerRoom) {
      const oldest = this.brains.keys().next().value as string | undefined;
      if (!oldest) break;
      sim.world.removeSnake(oldest);
      this.brains.delete(oldest);
      this.nicknames.delete(oldest);
    }

    // Spawn fillers.
    while (this.brains.size + humanSnakeCount < tuning.net.totalSnakesPerRoom) {
      this.spawnOneBot(sim);
    }

    // Drive each bot's AI.
    for (const [snakeId, brain] of this.brains) {
      const snake = sim.world.snakes.get(snakeId);
      if (!snake || snake.dead) continue;
      const head = snake.segments[0];
      // BotBrain expects ReadonlyArray<{x, y}> of foods. Use the food state's
      // spatial-hash queryWithin so we only pass nearby pellets.
      const foods = sim.foodState.queryWithin(head.x, head.y, tuning.bot.viewRadiusPx);
      const dir = brain.update(snake, sim.world, foods, dt);
      // BotBrain returns a smoothed unit direction. Convert into pendingDir
      // which Snake.update reads.
      snake.pendingDirX = dir.dirX;
      snake.pendingDirY = dir.dirY;
    }
  }

  // Build a snakeId -> nickname map for the snapshot to include.
  getNicknames(): Map<string, string> {
    return this.nicknames;
  }

  // Wipes all bot state (used on idle teardown and on game_ended).
  clear(): void {
    this.brains.clear();
    this.nicknames.clear();
  }

  serialize(): SerializedServerBotManager {
    const ns: Record<string, string> = {};
    for (const [k, v] of this.nicknames) ns[k] = v;
    return {
      nicknames: ns,
      nextBotId: this.nextBotId,
      rngState: this.rng.getState(),
    };
  }

  // Restore. BotBrain instances are NOT persisted - they're rebuilt for any
  // bot snakes still in the sim. Their transient AI state (currentDir,
  // attentionCache, lastTargetPos, etc.) is reset which is an acceptable
  // visual glitch on cold-wake from hibernation.
  static restore(data: SerializedServerBotManager, sim: SnakeSim): ServerBotManager {
    const mgr = new ServerBotManager(1);
    mgr.rng.setState(data.rngState);
    mgr.nextBotId = data.nextBotId;
    for (const [k, v] of Object.entries(data.nicknames)) {
      mgr.nicknames.set(k, v);
    }
    for (const [id, snake] of sim.world.snakes) {
      if (snake.ownerType === "bot") {
        // BotBrain accepts an optional personality and an optional rng.
        // Pass undefined personality (random) and the manager's rng.
        mgr.brains.set(id, new BotBrain(undefined, mgr.rng));
      }
    }
    return mgr;
  }

  private spawnOneBot(sim: SnakeSim): void {
    const id = `bot${this.nextBotId++}`;
    // Random 3-letter initials so the leaderboard reads like a full lobby
    // rather than 'BO1, BO2, BO3'. Re-roll up to 8 times if the rolled
    // initials collide with an already-in-use bot nickname (26^3 = 17576
    // possible combos for 9 bots; collisions are rare).
    const used = new Set(this.nicknames.values());
    let nickname = this.randomInitials();
    for (let i = 0; i < 8 && used.has(nickname); i++) nickname = this.randomInitials();
    const palette = tuning.bot.palette;
    const colorIdx = this.rng.int(palette.length);
    const color = palette[colorIdx];
    // Pick a safe spawn point - avoid spawning on top of existing snake
    // bodies. Use rejection sampling similar to client-side BotManager.
    const { x, y } = this.pickSafeSpawnPoint(sim);
    sim.addBot(id, color, x, y);
    this.brains.set(id, new BotBrain(undefined, this.rng));
    this.nicknames.set(id, nickname);
  }

  private randomInitials(): string {
    const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return a[this.rng.int(26)] + a[this.rng.int(26)] + a[this.rng.int(26)];
  }

  private pickSafeSpawnPoint(sim: SnakeSim): { x: number; y: number } {
    const clearance = tuning.snake.headRadiusPx * 8;
    const c2 = clearance * clearance;
    for (let attempts = 0; attempts < 16; attempts++) {
      const x = this.rng.range(200, tuning.world.widthPx - 200);
      const y = this.rng.range(200, tuning.world.heightPx - 200);
      let safe = true;
      for (const other of sim.world.snakes.values()) {
        if (other.dead) continue;
        for (const s of other.segments) {
          const dx = s.x - x;
          const dy = s.y - y;
          if (dx * dx + dy * dy < c2) {
            safe = false;
            break;
          }
        }
        if (!safe) break;
      }
      if (safe) return { x, y };
    }
    return { x: tuning.world.widthPx / 2, y: tuning.world.heightPx / 2 };
  }
}
