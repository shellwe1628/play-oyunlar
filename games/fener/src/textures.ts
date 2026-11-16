import type { TextureRecipe } from '@oyun/core';

/**
 * Game palette: deep navy night, warm lamp yellow, sea teal, static white. Red (`danger`) is
 * used only for danger: the active-anomaly counter at 3 and the screen-edge pulse.
 */
export const PALETTE = {
  night: 0x0d1226,
  navy: 0x161d3a,
  panel: 0x1f2848,
  panelLine: 0x34406e,
  lamp: 0xffd36b,
  lampDim: 0xb89648,
  teal: 0x3ee0c4,
  tealDim: 0x2a8f86,
  static: 0xf2f4ff,
  text: 0xf2f4ff,
  textDim: 0xa9b3d9,
  danger: 0xff4f5e,
  ghostEye: 0xe8f0a0,
  lockedText: 0x6d78a6,
} as const;

/** Feed size in logical px (the camera view is drawn 1:1). */
export const FEED = 640;

/** Cosmetic noise for the static texture only (never gameplay). */
const noise = (): number => Math.random();

export const TEXTURES: readonly TextureRecipe[] = [
  {
    key: 'scanlines',
    width: FEED,
    height: FEED,
    draw(g) {
      for (let y = 0; y < FEED; y += 4) g.fillStyle(0x000000, 0.16).fillRect(0, y, FEED, 2);
    },
  },
  {
    key: 'vignette',
    width: FEED,
    height: FEED,
    draw(g) {
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const inset = i * 5;
        g.lineStyle(6, 0x000000, 0.06 * (1 - i / steps) * 2.4);
        g.strokeRect(inset, inset, FEED - inset * 2, FEED - inset * 2);
      }
    },
  },
  {
    key: 'static',
    width: 160,
    height: 160,
    draw(g) {
      for (let y = 0; y < 160; y += 4) {
        for (let x = 0; x < 160; x += 4) {
          const v = noise();
          g.fillStyle(v > 0.5 ? PALETTE.static : 0x30344a, 0.35 + v * 0.65).fillRect(x, y, 4, 4);
        }
      }
    },
  },
  {
    key: 'rec-dot',
    width: 24,
    height: 24,
    draw(g) {
      g.fillStyle(PALETTE.lamp, 1).fillCircle(12, 12, 9);
    },
  },
  {
    key: 'edge-glow',
    width: 720,
    height: 1280,
    draw(g) {
      for (let i = 0; i < 14; i++) {
        g.lineStyle(10, PALETTE.danger, 0.11 * (1 - i / 14));
        g.strokeRect(5 + i * 9, 5 + i * 9, 710 - i * 18, 1270 - i * 18);
      }
    },
  },
];
