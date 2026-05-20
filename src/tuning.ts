export interface Tuning {
  net: {
    serverTickHz: number;
    viewRadiusPx: number;
    maxHumansPerRoom: number;
    minSnakesPerRoom: number;
    totalSnakesPerRoom: number;
    resumeTokenTtlSec: number;
    maxInputsPerSecPerClient: number;
    maxClientLogPerSecPerSocket: number;
    nicknameMaxLen: number;
    interpolationDelayMs: number;
    snapshotBufferSize: number;
    interpolationDelayMinMs: number;
    interpolationDelayMaxMs: number;
    jitterSampleWindow: number;
    ownSnakeSmoothHalfLifeMs: number;
    ownSnakeSmoothSnapThresholdPx: number;
  };
  snake: {
    speedPxPerSec: number;
    spacingPx: number;
    turnRateRadPerSec: number;
    selfCollisionSkip: number;
    initialLength: number;
    headColor: number;
    bodyColor: number;
    deadColor: number;
    headRadiusPx: number;
    bodyRadiusPx: number;
    maxBodyScale: number;
    scaleDivisor: number;
    boostSpeedMultiplier: number;
    boostDrainPerSec: number;
    boostMinLength: number;
    boostOutlineColor: number;
  };
  food: {
    targetCount: number;
    radiusPx: number;
    color: number;
    growthPerPellet: number;
  };
  world: {
    widthPx: number;
    heightPx: number;
    spatialBucketPx: number;
    bgFillColor: number;
    bgGridColor: number;
  };
  bot: {
    targetCount: number;
    viewRadiusPx: number;
    fleeRadiusPx: number;
    seekRadiusPx: number;
    wanderResampleMs: number;
    respawnDelayMs: number;
    minRespawnDistFromPlayerPx: number;
    minLength: number;
    maxLength: number;
    palette: number[];
    playerOutlineExtraPx: number;
    playerOutlineColor: number;
    playerOutlineAlpha: number;
    minimapDotAlpha: number;
    driftAngleRad: number;
    driftFrequency: number;
    turnRateRadPerSec: number;
    personalityRange: {
      aggression: { min: number; max: number };
      caution: { min: number; max: number };
      greed: { min: number; max: number };
      attention: { min: number; max: number };
    };
    cautionFleeRadiusBonus: number;
    greedClusterWeight: number;
    attentionCacheFrames: number;
    wanderCandidates: number;
    densityRadiusPx: number;
    huntThresholdLength: number;
    huntAggressionThreshold: number;
    preyLengthRatio: number;
    leadTimeMs: number;
    curlPerpBias: number;
    curlActivationThreatRange: number;
  };
  death: {
    fadeMs: number;
    pelletsPerSegment: number;
    pelletJitterPx: number;
    pelletColor: number;
    pelletRadiusPx: number;
    pelletGrowthMultiplier: number;
  };
  camera: {
    lerp: number;
  };
  edge: {
    borderPx: number;
    borderColor: number;
    vignettePx: number;
    vignetteColor: number;
    vignetteAlpha: number;
  };
  minimap: {
    sizePx: number;
    insetPx: number;
    dotRadiusPx: number;
    bgColor: number;
    bgAlpha: number;
    borderColor: number;
  };
  joystick: {
    anchorRadiusPx: number;
    stickRadiusPx: number;
    minDragPx: number;
    color: number;
    alpha: number;
  };
  hud: {
    safeInsetPx: number;
    leaderboardCount: number;
    textColor: number;
    playerHighlightColor: number;
    muteButtonSizePx: number;
    alwaysShowPlayerRow: boolean;
  };
  killfeed: {
    maxRows: number;
    entryTtlMs: number;
    fontSize: number;
    insetTopPx: number;
    rowHeightPx: number;
  };
}

export const tuning: Tuning = {
  net: {
    serverTickHz: 20,
    viewRadiusPx: 800,
    maxHumansPerRoom: 8,
    minSnakesPerRoom: 6,
    totalSnakesPerRoom: 10,
    resumeTokenTtlSec: 60,
    maxInputsPerSecPerClient: 60,
    maxClientLogPerSecPerSocket: 30,
    nicknameMaxLen: 3,
    // Render remote snakes at this delay behind the newest snapshot so the
    // interpolation buffer always has bracketing frames even under jitter.
    // ~1.5 server ticks. Tradeoff: more delay = smoother but laggier remotes.
    interpolationDelayMs: 75,
    // Snapshots to keep in the client buffer. Covers interpDelay + margin.
    snapshotBufferSize: 8,
    // Phase 6.2 adaptive interp: per-user delay = clamp(min, max, expectedGap + p95 jitter).
    // Static interpolationDelayMs above is the fallback before the monitor warms up.
    interpolationDelayMinMs: 50, // one server tick
    interpolationDelayMaxMs: 200, // ceiling for very flaky connections
    jitterSampleWindow: 30, // ~1.5s of arrivals at 20Hz
    // Own-snake smoothing half-life. Lerp the local snake's rendered segments
    // toward the latest server snapshot every frame so the 20Hz step doesn't
    // show as choppy. 60ms keeps alpha around 0.32 at the dt-clamp (33ms).
    ownSnakeSmoothHalfLifeMs: 60,
    // Snap-reset the smoothed snake if the target head jumps more than this
    // in one snapshot. Catches respawn / teleport so we don't lerp across
    // the world.
    ownSnakeSmoothSnapThresholdPx: 100,
  },
  snake: {
    speedPxPerSec: 180,
    spacingPx: 8,
    turnRateRadPerSec: 14,
    selfCollisionSkip: 6,
    initialLength: 20,
    headColor: 0x4caf50,
    bodyColor: 0x388e3c,
    deadColor: 0xc62828,
    headRadiusPx: 9,
    bodyRadiusPx: 7,
    // Body scaling. Formula:
    //   scale = min(maxBodyScale, 1 + sqrt(max(0, length - initialLength) / scaleDivisor))
    // At initialLength scale=1.0. sqrt gives gradual growth (mass-radius
    // motivated): scale rises quickly at first then tapers. At divisor=300:
    // length 80 -> 1.45, length 320 -> 2.0, length 1280 -> 3.0, length 5120 -> 5.0.
    maxBodyScale: 5,
    scaleDivisor: 300,
    // Boost mechanic (Phase 4).
    boostSpeedMultiplier: 1.7, // speed multiplier while boost is active
    boostDrainPerSec: 1.2, // segments shed per second of boost
    boostMinLength: 8, // must exceed this to engage boost; drops out when reached
    boostOutlineColor: 0xffeb3b, // hot yellow outline tint while boosting
  },
  food: {
    targetCount: 2000,
    radiusPx: 5,
    color: 0xffc107,
    growthPerPellet: 1,
  },
  world: {
    widthPx: 4000,
    heightPx: 4000,
    spatialBucketPx: 80,
    bgFillColor: 0x111118,
    bgGridColor: 0x2a2a35,
  },
  bot: {
    targetCount: 10,
    viewRadiusPx: 300,
    fleeRadiusPx: 250,
    seekRadiusPx: 200,
    wanderResampleMs: 3000,
    respawnDelayMs: 2000,
    minRespawnDistFromPlayerPx: 600,
    minLength: 8,
    maxLength: 30,
    palette: [0xe53935, 0x1976d2, 0xf57c00, 0x7b1fa2, 0xfbc02d, 0x00838f, 0xe91e63, 0x5d4037],
    playerOutlineExtraPx: 2,
    playerOutlineColor: 0xffffff,
    playerOutlineAlpha: 0.3,
    minimapDotAlpha: 0.7,
    // Smooth sine drift applied to seek_food and wander headings so bots
    // don't head laser-straight at every pellet. 0.8rad = ~46deg max sway,
    // 0.003 rad/ms = ~2.1s per oscillation cycle.
    driftAngleRad: 0.8,
    driftFrequency: 0.003,
    // Bot turn rate is SEPARATE from (and slower than) the player's
    // tuning.snake.turnRateRadPerSec. Player's value smooths their joystick
    // input; bots smooth their FSM-target heading via this value so target
    // changes (e.g., switching to a closer pellet) play out as gradual
    // turns rather than instant body kinks.
    //
    // 8 rad/s = ~458 deg/s. Turning radius = speed/turnRate = 180/8 = 22.5px.
    // Lower values produced visible orbits around close-but-off-axis pellets
    // (turn circle larger than the bot's eat radius).
    turnRateRadPerSec: 8,
    personalityRange: {
      aggression: { min: 0, max: 1 },
      caution: { min: 0.2, max: 1 },
      greed: { min: 0.1, max: 1 },
      attention: { min: 0.4, max: 1 },
    },
    cautionFleeRadiusBonus: 0.5,
    greedClusterWeight: 2,
    attentionCacheFrames: 10,
    wanderCandidates: 4,
    densityRadiusPx: 80,
    huntThresholdLength: 25,
    huntAggressionThreshold: 0.6,
    preyLengthRatio: 0.7,
    leadTimeMs: 500,
    curlPerpBias: 0.6,
    curlActivationThreatRange: 150,
  },
  death: {
    fadeMs: 500,
    pelletsPerSegment: 0.5,
    pelletJitterPx: 8,
    pelletColor: 0xffeb3b,
    pelletRadiusPx: 7,
    pelletGrowthMultiplier: 2,
  },
  camera: {
    lerp: 0.12,
  },
  edge: {
    borderPx: 4,
    borderColor: 0xc62828,
    vignettePx: 100,
    vignetteColor: 0xc62828,
    vignetteAlpha: 0.18,
  },
  minimap: {
    sizePx: 80,
    insetPx: 16,
    dotRadiusPx: 3,
    bgColor: 0x0b0b0f,
    bgAlpha: 0.55,
    borderColor: 0x88ddff,
  },
  joystick: {
    anchorRadiusPx: 50,
    stickRadiusPx: 12,
    minDragPx: 8,
    color: 0xffffff,
    alpha: 0.4,
  },
  hud: {
    safeInsetPx: 24,
    leaderboardCount: 10,
    textColor: 0xffffff,
    playerHighlightColor: 0xffeb3b,
    muteButtonSizePx: 44,
    alwaysShowPlayerRow: true,
  },
  killfeed: {
    maxRows: 5,
    entryTtlMs: 5000,
    fontSize: 14,
    insetTopPx: 200, // below the HUD leaderboard which occupies the top-right
    rowHeightPx: 18,
  },
};
