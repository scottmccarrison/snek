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
  };
  death: {
    fadeMs: number;
  };
}

export const tuning: Tuning = {
  snake: {
    speedPxPerSec: 180,
    spacingPx: 8,
    turnRateRadPerSec: 6,
    selfCollisionSkip: 6,
    initialLength: 8,
    headColor: 0x4caf50,
    bodyColor: 0x388e3c,
    deadColor: 0xc62828,
    headRadiusPx: 9,
    bodyRadiusPx: 7,
  },
  food: {
    targetCount: 50,
    radiusPx: 5,
    color: 0xffc107,
    growthPerPellet: 4,
  },
  world: {
    widthPx: 1280,
    heightPx: 720,
    spatialBucketPx: 80,
  },
  death: {
    fadeMs: 500,
  },
};
