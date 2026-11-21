import { type TextureRecipe } from '@oyun/core';
import type Phaser from 'phaser';

/** One visual identity per level: two-colour gradients that shift with progress, dark walls, neon edges. */
export interface Palette {
  /** Gradient top/bottom at the start of the level ... */
  top: number;
  bottom: number;
  /** ... and at the finish. */
  top2: number;
  bottom2: number;
  wall: number;
  wallDeep: number;
  edge: number;
}

export const PALETTES: readonly Palette[] = [
  { top: 0xff2d95, bottom: 0xffa53b, top2: 0x9b2dff, bottom2: 0xff4f6d, wall: 0x3a0a5e, wallDeep: 0x16032b, edge: 0x3ff6ff },
  { top: 0x00b4ff, bottom: 0x6dff8a, top2: 0x3d4bff, bottom2: 0x00e6b8, wall: 0x0c2470, wallDeep: 0x050c33, edge: 0xfff35c },
  { top: 0x8a3bff, bottom: 0xff6ad5, top2: 0x2e2aff, bottom2: 0xff3d7f, wall: 0x22075a, wallDeep: 0x0d0226, edge: 0x6bffb8 },
  { top: 0xff5a1f, bottom: 0xffd93d, top2: 0xff1f66, bottom2: 0xffa000, wall: 0x5a0d22, wallDeep: 0x26040e, edge: 0x4dffea },
  { top: 0x00d9c0, bottom: 0x2a7bff, top2: 0x00ff9c, bottom2: 0x7a3dff, wall: 0x062a4d, wallDeep: 0x020f1f, edge: 0xff6be1 },
  { top: 0xff3355, bottom: 0xff7ae0, top2: 0xc0179e, bottom2: 0xff9a3d, wall: 0x45042f, wallDeep: 0x1d0114, edge: 0x9dff3a },
  { top: 0x9cff2e, bottom: 0x00cdb0, top2: 0x2affc8, bottom2: 0x0074ff, wall: 0x0a3a35, wallDeep: 0x031614, edge: 0xff4fa3 },
  { top: 0x3a6bff, bottom: 0xc84dff, top2: 0x00c8ff, bottom2: 0xff4fd8, wall: 0x170e5c, wallDeep: 0x070426, edge: 0xffd23d },
  { top: 0xff4fd8, bottom: 0x3de8ff, top2: 0xff7a3d, bottom2: 0x7a5cff, wall: 0x3d0a5a, wallDeep: 0x170224, edge: 0xfffb7a },
  { top: 0xffc531, bottom: 0xff2e4d, top2: 0xff6b00, bottom2: 0xc2005b, wall: 0x4a0716, wallDeep: 0x1f0208, edge: 0x58f7ff },
];

/** Endless and daily palettes cycle through these as the height grows. */
export const ENDLESS_THEMES = [4, 0, 7, 3, 8, 1, 5, 9, 2, 6] as const;

/** Fixed colours used across scenes. */
export const PALETTE = {
  ink: 0x14062b,
  white: 0xffffff,
  gem: 0x5ff9ff,
  gemDeep: 0x1a7fe0,
  gold: 0xffe14d,
  danger: 0xff3d5a,
  ui: 0x2a1263,
  uiLight: 0x4b2ba6,
} as const;

/** Gate colours by kind. */
export const GATE_COLORS = {
  fast: 0xff7a1a,
  slow: 0x2ea8ff,
  normal: 0xffffff,
  mini: 0x3dff8b,
  big: 0x3dff8b,
  flip: 0xc35bff,
  unflip: 0x7dffb0,
} as const;

type G = Phaser.GameObjects.Graphics;

function poly(g: G, pts: number[][]): void {
  g.beginPath();
  g.moveTo(pts[0]![0]!, pts[0]![1]!);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0]!, pts[i]![1]!);
  g.closePath();
}

function star(cx: number, cy: number, r: number, inner: number, n: number, rot = -Math.PI / 2): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = rot + (i * Math.PI) / n;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

function ngon(cx: number, cy: number, r: number, n: number, rot = -Math.PI / 2): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Spark shapes: drawn white with a dark rim so they read on bright gradients. 80×80, centre 40. */
const SHAPE_DRAW: ((g: G, fill: boolean) => void)[] = [
  (g, f) => (f ? g.fillCircle(40, 40, 21) : g.strokeCircle(40, 40, 21)),
  (g, f) => {
    poly(g, [[40, 13], [66, 40], [40, 67], [14, 40]]);
    if (f) g.fillPath();
    else g.strokePath();
  },
  (g, f) => {
    poly(g, star(40, 42, 28, 0.48, 5));
    if (f) g.fillPath();
    else g.strokePath();
  },
  (g, f) => {
    poly(g, [[40, 10], [64, 64], [40, 52], [16, 64]]);
    if (f) g.fillPath();
    else g.strokePath();
  },
  (g, f) => {
    poly(g, ngon(40, 40, 24, 6, 0));
    if (f) g.fillPath();
    else g.strokePath();
  },
  (g, f) => {
    poly(g, [[33, 12], [47, 12], [47, 33], [68, 33], [68, 47], [47, 47], [47, 68], [33, 68], [33, 47], [12, 47], [12, 33], [33, 33]]);
    if (f) g.fillPath();
    else g.strokePath();
  },
  (g, f) => {
    if (f) {
      g.fillCircle(40, 40, 24);
    } else g.strokeCircle(40, 40, 24);
  },
  (g, f) => {
    poly(g, [[40, 12], [58, 38], [52, 60], [40, 68], [28, 60], [22, 38]]);
    if (f) g.fillPath();
    else g.strokePath();
  },
];

function sparkRecipe(i: number): TextureRecipe {
  return {
    key: `spark-${i}`,
    width: 80,
    height: 80,
    draw(g) {
      g.lineStyle(10, PALETTE.ink, 0.85);
      SHAPE_DRAW[i]!(g, false);
      g.fillStyle(0xffffff, 1);
      SHAPE_DRAW[i]!(g, true);
      if (i === 6) {
        // ring: punch a dark core
        g.fillStyle(PALETTE.ink, 0.9).fillCircle(40, 40, 11);
        g.fillStyle(0xffffff, 1).fillCircle(40, 40, 6);
      }
      g.fillStyle(0xffffff, 0.0);
    },
  };
}

export const TEXTURES: readonly TextureRecipe[] = [
  ...Array.from({ length: 8 }, (_, i) => sparkRecipe(i)),
  {
    key: 'shard',
    width: 28,
    height: 20,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillTriangle(0, 20, 28, 12, 9, 0);
    },
  },
  {
    key: 'gem',
    width: 64,
    height: 64,
    draw(g) {
      const pts = [[32, 4], [56, 24], [32, 60], [8, 24]];
      g.lineStyle(8, PALETTE.ink, 0.9);
      poly(g, pts);
      g.strokePath();
      g.fillStyle(PALETTE.gemDeep, 1);
      poly(g, pts);
      g.fillPath();
      g.fillStyle(PALETTE.gem, 1);
      poly(g, [[32, 4], [56, 24], [32, 30], [8, 24]]);
      g.fillPath();
      g.fillStyle(0xffffff, 0.85);
      poly(g, [[32, 4], [44, 14], [32, 24], [20, 14]]);
      g.fillPath();
      g.fillStyle(0xffffff, 0.35);
      poly(g, [[32, 30], [56, 24], [32, 60]]);
      g.fillPath();
    },
  },
  {
    key: 'gem-empty',
    width: 64,
    height: 64,
    draw(g) {
      const pts = [[32, 6], [54, 24], [32, 58], [10, 24]];
      g.fillStyle(PALETTE.ink, 0.45);
      poly(g, pts);
      g.fillPath();
      g.lineStyle(5, 0xffffff, 0.7);
      poly(g, pts);
      g.strokePath();
    },
  },
  {
    // Gate band: white chevrons on a translucent strip, tinted per gate kind.
    key: 'gate-band',
    width: 256,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 0.28).fillRect(0, 10, 256, 52);
      g.fillStyle(0xffffff, 1).fillRect(0, 8, 256, 6).fillRect(0, 58, 256, 6);
      for (let x = 0; x < 256; x += 64) {
        g.fillStyle(0xffffff, 0.8);
        poly(g, [[x + 14, 50], [x + 32, 22], [x + 50, 50], [x + 40, 50], [x + 32, 36], [x + 24, 50]]);
        g.fillPath();
      }
    },
  },
  {
    // Flip: chevrons both ways (controls swapped).
    key: 'gate-band-flip',
    width: 256,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 0.3).fillRect(0, 10, 256, 52);
      g.fillStyle(0xffffff, 1).fillRect(0, 8, 256, 6).fillRect(0, 58, 256, 6);
      for (let x = 0; x < 256; x += 64) {
        g.fillStyle(0xffffff, 0.85);
        poly(g, [[x + 8, 36], [x + 22, 22], [x + 22, 50]]);
        g.fillPath();
        poly(g, [[x + 56, 36], [x + 42, 22], [x + 42, 50]]);
        g.fillPath();
      }
    },
  },
  {
    // Back to normal controls: plain, calm bars (no arrows).
    key: 'gate-band-plain',
    width: 256,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 0.22).fillRect(0, 10, 256, 52);
      g.fillStyle(0xffffff, 1).fillRect(0, 8, 256, 6).fillRect(0, 58, 256, 6);
      for (let x = 0; x < 256; x += 32) g.fillStyle(0xffffff, 0.85).fillRect(x + 8, 28, 16, 16);
    },
  },
  {
    key: 'finish-band',
    width: 128,
    height: 64,
    draw(g) {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) g.fillStyle((x + y) % 2 ? 0xffffff : PALETTE.ink, 1).fillRect(x * 16, 16 + y * 16, 16, 16);
      g.fillStyle(0xffffff, 1).fillRect(0, 8, 128, 6).fillRect(0, 50, 128, 6);
    },
  },
  {
    key: 'bar-cap',
    width: 40,
    height: 40,
    draw(g) {
      g.fillStyle(PALETTE.ink, 1).fillCircle(20, 20, 18);
      g.lineStyle(5, 0xffffff, 1).strokeCircle(20, 20, 14);
    },
  },
  {
    key: 'bar-mid',
    width: 8,
    height: 40,
    draw(g) {
      g.fillStyle(PALETTE.ink, 1).fillRect(0, 2, 8, 36);
      g.fillStyle(0xffffff, 1).fillRect(0, 3.5, 8, 5).fillRect(0, 31.5, 8, 5);
    },
  },
  {
    key: 'bg-diamond',
    width: 300,
    height: 300,
    draw(g) {
      g.lineStyle(14, 0xffffff, 1);
      poly(g, [[150, 10], [290, 150], [150, 290], [10, 150]]);
      g.strokePath();
    },
  },
  {
    key: 'bg-ring',
    width: 300,
    height: 300,
    draw(g) {
      g.lineStyle(12, 0xffffff, 1).strokeCircle(150, 150, 138);
      g.lineStyle(5, 0xffffff, 1).strokeCircle(150, 150, 104);
    },
  },
  {
    key: 'ring-burst',
    width: 256,
    height: 256,
    draw(g) {
      g.lineStyle(18, 0xffffff, 1).strokeCircle(128, 128, 116);
    },
  },
  {
    key: 'confetti',
    width: 16,
    height: 10,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 16, 10);
    },
  },
  // Menu icons, 72×72, white (tinted by the button).
  {
    key: 'ic-levels',
    width: 72,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 1);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.fillRoundedRect(8 + c * 20, 8 + r * 20, 16, 16, 4);
    },
  },
  {
    key: 'ic-endless',
    width: 72,
    height: 72,
    draw(g) {
      g.lineStyle(9, 0xffffff, 1);
      g.strokeCircle(22, 36, 13);
      g.strokeCircle(50, 36, 13);
    },
  },
  {
    key: 'ic-daily',
    width: 72,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillRoundedRect(8, 14, 56, 50, 8);
      g.fillStyle(PALETTE.ink, 1).fillRect(14, 28, 44, 30);
      g.fillStyle(0xffffff, 1).fillRect(18, 6, 8, 16).fillRect(46, 6, 8, 16);
      poly(g, star(36, 44, 12, 0.45, 5));
      g.fillPath();
    },
  },
  {
    key: 'ic-skins',
    width: 72,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 1);
      poly(g, star(36, 38, 30, 0.45, 4, -Math.PI / 2));
      g.fillPath();
      g.fillCircle(60, 12, 6).fillCircle(12, 60, 5);
    },
  },
  {
    key: 'ic-rank',
    width: 72,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 1);
      poly(g, [[10, 30], [36, 12], [62, 30], [62, 42], [36, 24], [10, 42]]);
      g.fillPath();
      poly(g, [[10, 52], [36, 34], [62, 52], [62, 64], [36, 46], [10, 64]]);
      g.fillPath();
    },
  },
  {
    key: 'ic-crown',
    width: 72,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 1);
      poly(g, [[8, 58], [8, 22], [24, 38], [36, 12], [48, 38], [64, 22], [64, 58]]);
      g.fillPath();
    },
  },
  {
    key: 'star-on',
    width: 48,
    height: 48,
    draw(g) {
      g.fillStyle(PALETTE.ink, 1);
      poly(g, star(24, 26, 23, 0.5, 5));
      g.fillPath();
      g.fillStyle(PALETTE.gold, 1);
      poly(g, star(24, 25, 18, 0.5, 5));
      g.fillPath();
      g.fillStyle(0xffffff, 0.7);
      poly(g, star(21, 20, 6, 0.5, 5));
      g.fillPath();
    },
  },
  {
    key: 'star-off',
    width: 48,
    height: 48,
    draw(g) {
      g.fillStyle(PALETTE.ink, 0.7);
      poly(g, star(24, 26, 23, 0.5, 5));
      g.fillPath();
      g.lineStyle(3, 0xffffff, 0.45);
      poly(g, star(24, 25, 17, 0.5, 5));
      g.strokePath();
    },
  },
  {
    key: 'ic-lock',
    width: 72,
    height: 72,
    draw(g) {
      g.lineStyle(9, 0xffffff, 1);
      g.beginPath();
      g.arc(36, 30, 14, Math.PI, 0, false);
      g.strokePath();
      g.fillStyle(0xffffff, 1).fillRoundedRect(14, 30, 44, 34, 8);
      g.fillStyle(PALETTE.ink, 1).fillCircle(36, 46, 5);
    },
  },
  {
    key: 'ic-ad',
    width: 72,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillRoundedRect(4, 14, 64, 44, 10);
      g.fillStyle(PALETTE.ink, 1).fillTriangle(28, 24, 28, 48, 48, 36);
    },
  },
  {
    key: 'ic-back',
    width: 72,
    height: 72,
    draw(g) {
      g.fillStyle(0xffffff, 1);
      poly(g, [[12, 36], [38, 12], [38, 26], [62, 26], [62, 46], [38, 46], [38, 60]]);
      g.fillPath();
    },
  },
  {
    // online ranking: a globe
    key: 'ic-globe',
    width: 72,
    height: 72,
    draw(g) {
      g.lineStyle(6, 0xffffff, 1);
      g.strokeCircle(36, 36, 26);
      g.strokeEllipse(36, 36, 24, 52);
      g.lineBetween(10, 36, 62, 36);
      g.lineStyle(5, 0xffffff, 1);
      g.lineBetween(15, 22, 57, 22);
      g.lineBetween(15, 50, 57, 50);
    },
  },
  {
    key: 'finger',
    width: 120,
    height: 120,
    draw(g) {
      g.lineStyle(6, 0xffffff, 0.6).strokeCircle(60, 60, 54);
      g.fillStyle(0xffffff, 0.95).fillCircle(60, 60, 30);
      g.fillStyle(PALETTE.ink, 0.25).fillCircle(60, 60, 18);
    },
  },
];
