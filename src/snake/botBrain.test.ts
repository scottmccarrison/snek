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
    // Should seek roughly right. Drift up to driftAngleRad can swing dirY
    // within sin(drift) of zero - allow that band.
    expect(dirX).toBeGreaterThan(Math.cos(tuning.bot.driftAngleRad) - 0.01);
    expect(Math.abs(dirY)).toBeLessThan(Math.sin(tuning.bot.driftAngleRad) + 0.01);
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

  it("personality stats are within configured ranges", () => {
    for (let i = 0; i < 50; i++) {
      const brain = new BotBrain();
      expect(brain.personality.aggression).toBeGreaterThanOrEqual(
        tuning.bot.personalityRange.aggression.min,
      );
      expect(brain.personality.aggression).toBeLessThanOrEqual(
        tuning.bot.personalityRange.aggression.max,
      );
      expect(brain.personality.caution).toBeGreaterThanOrEqual(
        tuning.bot.personalityRange.caution.min,
      );
      expect(brain.personality.caution).toBeLessThanOrEqual(
        tuning.bot.personalityRange.caution.max,
      );
      expect(brain.personality.greed).toBeGreaterThanOrEqual(tuning.bot.personalityRange.greed.min);
      expect(brain.personality.greed).toBeLessThanOrEqual(tuning.bot.personalityRange.greed.max);
      expect(brain.personality.attention).toBeGreaterThanOrEqual(
        tuning.bot.personalityRange.attention.min,
      );
      expect(brain.personality.attention).toBeLessThanOrEqual(
        tuning.bot.personalityRange.attention.max,
      );
    }
  });

  it("constructor accepts a deterministic personality", () => {
    const p = { aggression: 0.7, caution: 0.3, greed: 0.5, attention: 1.0 };
    const brain = new BotBrain(p);
    expect(brain.personality).toEqual(p);
  });

  it("higher caution makes the effective flee radius larger", () => {
    // Use initialLength:1 so the threat snake has only one segment (its head),
    // keeping the geometry exact and segment-spread-free.
    //
    // fleeRadiusPx = 250.
    // Low-caution (caution=0.2): effective = 250 * (1 + 0.5*0.2) = 275px.
    // High-caution (caution=1.0): effective = 250 * (1 + 0.5*1.0) = 375px.
    // Threat placed at 325px - outside low-caution (275) but inside high-caution (375).
    const threatOffset = Math.floor(tuning.bot.fleeRadiusPx * 1.3); // 325

    // High-caution brain: threat at 325px is within its 375px radius - should flee.
    const brainHigh = new BotBrain({ aggression: 0.5, caution: 1.0, greed: 0.5, attention: 1.0 });
    const botHigh = new Snake(500, 500, { id: "high", ownerType: "bot" });
    const worldHigh = makeWorld();
    worldHigh.addSnake(botHigh);
    const threatHigh = new Snake(500 + threatOffset, 500, {
      id: "threat-high",
      ownerType: "bot",
      initialLength: 1,
    });
    worldHigh.addSnake(threatHigh);
    brainHigh.update(botHigh, worldHigh, [], 1 / 60);
    expect(brainHigh.debugCachedState).toBe("flee");

    // Low-caution brain: threat at 325px is outside its 275px radius - should NOT flee.
    const brainLow = new BotBrain({ aggression: 0.5, caution: 0.2, greed: 0.5, attention: 1.0 });
    const botLow = new Snake(500, 500, { id: "low", ownerType: "bot" });
    const worldLow = makeWorld();
    worldLow.addSnake(botLow);
    const threatLow = new Snake(500 + threatOffset, 500, {
      id: "threat-low",
      ownerType: "bot",
      initialLength: 1,
    });
    worldLow.addSnake(threatLow);
    brainLow.update(botLow, worldLow, [], 1 / 60);
    expect(brainLow.debugCachedState).not.toBe("flee");
  });

  it("wander target is biased toward world center", () => {
    // Without seek/avoid, bots wander. Sample 200 wander targets across many
    // BotBrains and check the mean distance from center is well below uniform
    // random. For K=4 candidates scored by centrality, expected mean distance
    // is ~0.38 * halfDiag (vs ~0.52 for uniform random). Assert mean < 0.45.
    const cx = tuning.world.widthPx / 2;
    const cy = tuning.world.heightPx / 2;
    const halfDiag = Math.hypot(cx, cy);

    let totalNormDist = 0;
    const samples = 200;
    for (let i = 0; i < samples; i++) {
      const brain = new BotBrain();
      const target = brain.debugWanderTarget;
      const dist = Math.hypot(target.x - cx, target.y - cy);
      totalNormDist += dist / halfDiag;
    }
    const meanNormDist = totalNormDist / samples;
    // K=4 picks the most central - mean should be well below 0.45.
    expect(meanNormDist).toBeLessThan(0.45);
  });

  it("pellet cluster scoring prefers denser food for greedy bots", () => {
    // Geometry: lone food straight-right (close), cluster up-right (far but
    // denser). The differentiating axis is dirY:
    //   - greedy bot should head up-right toward cluster (dirY < 0 in screen coords)
    //   - low-greed bot should head straight-right toward lone food (dirY near 0)
    //
    // Math (seekRadiusPx=200, greedClusterWeight=2, densityRadiusPx=80):
    //   lone dist=50 -> distScore=0.75, density=0 -> score=0.75 for all greed
    //   cluster pair dist~143 -> distScore~0.285, density=1 -> densityScore=0.2
    //     stingy (greed=0.1): greedFactor=1.2 -> score=0.285+0.2*1.2=0.525 < 0.75
    //     greedy (greed=1.0): greedFactor=3.0 -> score=0.285+0.2*3.0=0.885 > 0.75
    //
    // Two-pellet cluster separated by 15px (< densityRadiusPx=80) ensures density=1.
    // The test asserts on debugCachedDir (pre-drift raw decision) to avoid flakiness
    // from the random driftPhase applied in update().
    const headX = 500;
    const headY = 500;
    const loneFood = { x: headX + 50, y: headY };
    const clusterA = { x: headX + 130, y: headY - 60 };
    const clusterB = { x: headX + 145, y: headY - 60 };
    const allFoods = [loneFood, clusterA, clusterB];

    const makeBrainAndBot = (greed: number) => {
      const brain = new BotBrain({
        aggression: 0.5,
        caution: 0.5,
        greed,
        attention: 1.0,
      });
      const bot = new Snake(headX, headY, { id: `bot-${greed}`, ownerType: "bot" });
      const world = makeWorld();
      world.addSnake(bot);
      // First update: hasHeading=false, all foods are candidates, heading snaps.
      // Second update: heading exists, forward-hemisphere filter applies.
      brain.update(bot, world, allFoods, 1 / 60);
      brain.update(bot, world, allFoods, 1 / 60);
      return { brain };
    };

    const greedy = makeBrainAndBot(1.0);
    const stingy = makeBrainAndBot(0.1);

    expect(greedy.brain.debugCachedState).toBe("seek_food");
    expect(stingy.brain.debugCachedState).toBe("seek_food");

    // debugCachedDir is the raw evaluateState direction (no drift, no smoothing).
    // Greedy picks cluster A (up-right): dirY meaningfully negative.
    expect(greedy.brain.debugCachedDir.dirY).toBeLessThan(-0.2);

    // Stingy picks lone food (straight-right): dirY close to zero.
    expect(stingy.brain.debugCachedDir.dirY).toBeGreaterThan(-0.1);

    // Sanity: greedy bot's dirY is more negative than stingy's.
    expect(greedy.brain.debugCachedDir.dirY).toBeLessThan(stingy.brain.debugCachedDir.dirY);
  });

  it("low-attention bot keeps the same cached decision for several frames", () => {
    // attention=0.4 (min of range) -> cache = round(10 * (1-0.4)) = 6 frames.
    // The bot should keep the same state for 6 frames after the first eval.
    const brain = new BotBrain({
      aggression: 0.5,
      caution: 0.5,
      greed: 0.5,
      attention: 0.4,
    });
    const bot = new Snake(500, 500, { id: "slow", ownerType: "bot" });
    const world = makeWorld();
    world.addSnake(bot);

    // Place food in seek range so we get a deterministic seek_food state.
    const foods = [{ x: 500 + tuning.bot.seekRadiusPx - 20, y: 500 }];

    // First call: evaluates state and caches it. Cache = 6.
    brain.update(bot, world, foods, 1 / 60);
    const initialState = brain.debugCachedState;
    expect(initialState).toBe("seek_food");

    // Frames 2-7: cache should still be active (same state) even if food is removed.
    const noFoods: { x: number; y: number }[] = [];
    for (let frame = 0; frame < 6; frame++) {
      brain.update(bot, world, noFoods, 1 / 60);
      expect(brain.debugCachedState).toBe("seek_food");
    }

    // Frame 8: cache expired - should re-evaluate with no food and become wander.
    brain.update(bot, world, noFoods, 1 / 60);
    expect(brain.debugCachedState).toBe("wander");
  });

  it("hunt state triggers when bot is long enough and aggressive enough", () => {
    // Long hunter (length >= 25) with aggression >= 0.6 should hunt nearby prey.
    // Prey placed at x=950 (distance 450) so it's within huntR (fleeRadiusPx*2=500)
    // but all prey segments are outside flee radius (effectiveFleeR=312.5 for caution=0.5).
    const hunterBrain = new BotBrain({
      aggression: 1.0,
      caution: 0.5,
      greed: 0.5,
      attention: 1.0,
    });
    const hunter = new Snake(500, 500, { id: "hunter", ownerType: "bot", initialLength: 50 });
    const prey = new Snake(950, 500, { id: "prey", ownerType: "bot", initialLength: 15 });
    const world = makeWorld();
    world.addSnake(hunter);
    world.addSnake(prey);

    hunterBrain.update(hunter, world, [], 1 / 60);
    expect(hunterBrain.debugCachedState).toBe("hunt");
  });

  it("hunt state does NOT trigger if bot is too short", () => {
    // Bot length=10 < huntThresholdLength=25 - hunt branch is never entered.
    const brain = new BotBrain({
      aggression: 1.0,
      caution: 0.5,
      greed: 0.5,
      attention: 1.0,
    });
    const shortHunter = new Snake(500, 500, { id: "h", ownerType: "bot", initialLength: 10 });
    // Prey nearby (may trigger flee, that's fine - just must not be "hunt").
    const prey = new Snake(900, 500, { id: "p", ownerType: "bot", initialLength: 5 });
    const world = makeWorld();
    world.addSnake(shortHunter);
    world.addSnake(prey);

    brain.update(shortHunter, world, [], 1 / 60);
    expect(brain.debugCachedState).not.toBe("hunt");
  });

  it("hunt state does NOT trigger if bot is timid", () => {
    // Aggression=0.1 < huntAggressionThreshold=0.6 - hunt branch is skipped.
    const timidBrain = new BotBrain({
      aggression: 0.1,
      caution: 0.5,
      greed: 0.5,
      attention: 1.0,
    });
    const longTimid = new Snake(500, 500, { id: "t", ownerType: "bot", initialLength: 50 });
    // Prey nearby (may trigger flee, that's fine - just must not be "hunt").
    const prey = new Snake(900, 500, { id: "p", ownerType: "bot", initialLength: 15 });
    const world = makeWorld();
    world.addSnake(longTimid);
    world.addSnake(prey);

    timidBrain.update(longTimid, world, [], 1 / 60);
    expect(timidBrain.debugCachedState).not.toBe("hunt");
  });

  it("lead-the-target aims ahead of moving prey", () => {
    // Hunter at (500,500); prey starts at (950,500), within huntR (500) but outside
    // flee radius so the hunt branch fires (not flee).
    // After two updates (so velocity is sampled), the hunt direction should
    // aim with a non-trivial dirX component pointing toward prey (to the right).
    const hunterBrain = new BotBrain({
      aggression: 1.0,
      caution: 0.5,
      greed: 0.5,
      attention: 1.0,
    });
    const hunter = new Snake(500, 500, { id: "h", ownerType: "bot", initialLength: 50 });
    const prey = new Snake(950, 500, { id: "p", ownerType: "bot", initialLength: 15 });
    const world = makeWorld();
    world.addSnake(hunter);
    world.addSnake(prey);

    // Frame 1: velocity sample empty (lastTargetPos=null), leadPosition returns prey head.
    hunterBrain.update(hunter, world, [], 1 / 60);
    const dirAfterFirst = hunterBrain.debugCachedDir;
    expect(hunterBrain.debugCachedState).toBe("hunt");

    // Move prey head +30px right (simulating rightward motion).
    prey.segments[0].x += 30;

    // Frame 2: velocity sample is fresh, lead is computed ahead of prey.
    hunterBrain.update(hunter, world, [], 1 / 60);
    const dirAfterSecond = hunterBrain.debugCachedDir;
    expect(hunterBrain.debugCachedState).toBe("hunt");

    // Both frames: bot aimed rightward (toward prey). dirX strongly positive.
    expect(dirAfterFirst?.dirX).toBeGreaterThan(0.9);
    expect(dirAfterSecond?.dirX).toBeGreaterThan(0.9);
  });

  it("defensive curl rotates the flee vector when threat is closing", () => {
    // Two-threat geometry to work with the forward-hemisphere filter.
    //
    // Frame 1: threat1 at (300,500) to the LEFT (dist=200). No heading yet on first call.
    //   Flee fires to the RIGHT (+x). lastThreatDist=200. dirY=0 (straight flee).
    //
    // Frame 2: bot heading is RIGHT. threat1 is now BEHIND (to left of rightward heading).
    //   threat2 appears at (640,500) to the RIGHT of bot (dist=140). Alignment with
    //   rightward heading: dx=+140, headingX=+1 -> alignment=+140 > 0. IN FRONT. Flee fires.
    //   dist=140 < lastThreatDist=200 (closing). 140 < curlActivationThreatRange=150. Curl fires!
    const brain = new BotBrain({
      aggression: 0.5,
      caution: 0.2, // low caution -> harder curl
      greed: 0.5,
      attention: 1.0,
    });
    const bot = new Snake(500, 500, { id: "b", ownerType: "bot", initialLength: 5 });
    // threat1: to the LEFT, fires first flee rightward.
    const threat1 = new Snake(300, 500, { id: "t1", ownerType: "bot", initialLength: 1 });
    // threat2: to the RIGHT, closes in on frame 2 while bot is heading right.
    const threat2 = new Snake(640, 500, { id: "t2", ownerType: "bot", initialLength: 1 });
    const world = makeWorld();
    world.addSnake(bot);
    world.addSnake(threat1);

    // Frame 1: only threat1 in world. No heading -> flee from threat1 at left -> flee RIGHT.
    // lastThreatDist = 200. dirY = 0 (straight flee, no curl on first flee call).
    brain.update(bot, world, [], 1 / 60);
    expect(brain.debugCachedState).toBe("flee");
    const dirAfterFirst = brain.debugCachedDir;
    // First flee: no prior threatDist -> no curl. Straight flee.
    expect(Math.abs(dirAfterFirst?.dirY ?? 0)).toBeLessThan(0.1);

    // Frame 2: add threat2 to the right at distance 140.
    // threat1 is now behind (left, heading is right). threat2 is in front (right).
    // dist=140 < lastThreatDist=200 AND < curlActivationThreatRange=150 -> curl fires.
    world.addSnake(threat2);
    brain.update(bot, world, [], 1 / 60);
    expect(brain.debugCachedState).toBe("flee");
    const dirAfterSecond = brain.debugCachedDir;
    // Curl fires: direction has a perpendicular (Y) component.
    expect(Math.abs(dirAfterSecond?.dirY ?? 0)).toBeGreaterThan(0.1);
  });
});
