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
  death: {
    fadeMs: number;
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
    widthPx: 4000,
    heightPx: 4000,
    spatialBucketPx: 80,
    bgFillColor: 0x111118,
    bgGridColor: 0x2a2a35,
  },
  death: {
    fadeMs: 500,
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
};
