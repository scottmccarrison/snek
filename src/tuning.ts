export interface Tuning {
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
}

export const tuning: Tuning = {
  snake: {
    speedPxPerSec: 180,
    spacingPx: 8,
    turnRateRadPerSec: 6,
    selfCollisionSkip: 6,
    initialLength: 20,
    headColor: 0x4caf50,
    bodyColor: 0x388e3c,
    deadColor: 0xc62828,
    headRadiusPx: 9,
    bodyRadiusPx: 7,
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
    sizePx: 160,
    insetPx: 16,
    dotRadiusPx: 4,
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
};
