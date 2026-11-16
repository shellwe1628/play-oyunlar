import { circleTexture, type TextureRecipe } from '@oyun/core';

/** Game palette. Keep every colour here so the game has one visual identity. */
export const PALETTE = {
  target: 0xff5d73,
  targetRing: 0xffffff,
  targetCore: 0xffc93c,
  spark: 0xffc93c,
  miss: 0xaab0e0,
  bgDot: 0x2b3160,
} as const;

/** Textures are drawn with code at boot. Draw at the size you display (logical px). */
export const TEXTURES: readonly TextureRecipe[] = [
  {
    // Bullseye drawn at the largest target size; the scene scales it down as targets shrink.
    key: 'target',
    width: 168,
    height: 168,
    draw(g) {
      const c = 84;
      g.fillStyle(0x000000, 0.25).fillCircle(c, c + 6, 78);
      g.fillStyle(PALETTE.target, 1).fillCircle(c, c, 78);
      g.fillStyle(PALETTE.targetRing, 1).fillCircle(c, c, 54);
      g.fillStyle(PALETTE.target, 1).fillCircle(c, c, 38);
      g.fillStyle(PALETTE.targetCore, 1).fillCircle(c, c, 18);
      g.fillStyle(0xffffff, 0.35).fillCircle(c - 30, c - 34, 14);
    },
  },
  circleTexture('bg-dot', 6, PALETTE.bgDot),
];
