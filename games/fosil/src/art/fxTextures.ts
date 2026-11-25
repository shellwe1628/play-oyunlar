/**
 * Code-drawn art for the presentation layer: pickaxes by tier, rubble chunks, the helper, ambient
 * scenery pieces, glows and sheens. Baked once at boot like every other texture.
 */
import type { TextureRecipe } from '@oyun/core';
import Phaser from 'phaser';
import { shade } from './fossils';

type G = Phaser.GameObjects.Graphics;
const V = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);

/** Pickaxe tiers: wood, iron, steel, gold, crystal (head colour, handle colour, edge colour). */
export const PICK_LOOKS = [
  { head: 0x8b8378, handle: 0x8a5a35, edge: 0xb9b1a4, glow: 0 },
  { head: 0x6f7880, handle: 0x7a4b2a, edge: 0xc9d1d9, glow: 0 },
  { head: 0x9fb8c8, handle: 0x3e3530, edge: 0xeaf6ff, glow: 0 },
  { head: 0xf2b632, handle: 0x5a2e1a, edge: 0xfff1b0, glow: 0xffd23f },
  { head: 0x5fe3f0, handle: 0x2b2f4a, edge: 0xe8ffff, glow: 0x7ff6ff },
] as const;

/** Pickaxe drawn pointing up-left from the handle end at the bottom-right (pivot there). */
function drawPick(g: G, tier: number): void {
  const look = PICK_LOOKS[tier] ?? PICK_LOOKS[0];
  if (look.glow) for (const [r, a] of [[46, 0.12], [34, 0.18]] as const) g.fillStyle(look.glow, a).fillCircle(46, 30, r);
  // handle
  g.lineStyle(13, 0x000000, 0.25).lineBetween(112, 116, 50, 40);
  g.lineStyle(11, look.handle, 1).lineBetween(110, 112, 48, 36);
  g.lineStyle(3, shade(look.handle, 0.3), 1).lineBetween(106, 106, 50, 40);
  g.fillStyle(shade(look.handle, -0.3), 1).fillCircle(110, 112, 7);
  // head: a curved crescent across the handle top
  const head = [V(4, 46), V(18, 26), V(40, 16), V(62, 14), V(86, 22), V(98, 36), V(84, 32), V(62, 28), V(44, 30), V(24, 40)];
  g.fillStyle(0x000000, 0.25).fillPoints(head.map((p) => V(p.x + 2, p.y + 4)), true);
  g.fillStyle(look.head, 1).fillPoints(head, true);
  g.lineStyle(3, look.edge, 1).strokePoints([V(6, 44), V(20, 28), V(40, 19)], false);
  g.lineStyle(3, look.edge, 1).strokePoints([V(62, 16), V(84, 24), V(96, 34)], false);
  g.fillStyle(shade(look.head, -0.35), 1).fillRoundedRect(42, 22, 18, 16, 4);
  if (tier >= 4) {
    g.fillStyle(0xffffff, 0.8).fillTriangle(30, 24, 36, 20, 34, 28);
    g.fillStyle(0xffffff, 0.6).fillTriangle(74, 20, 80, 22, 76, 26);
  }
}

function chunk(key: string, pts: [number, number][]): TextureRecipe {
  return {
    key,
    width: 44,
    height: 40,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillPoints(pts.map(([x, y]) => V(x, y)), true);
      g.fillStyle(0x000000, 0.22).fillPoints(pts.slice(Math.floor(pts.length / 2)).map(([x, y]) => V(x, y)).concat([V(22, 20)]), true);
      g.fillStyle(0xffffff, 0.35).fillTriangle(pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1], 22, 20);
    },
  };
}

/** Helper body: little miner in overalls, 64×70, feet at the bottom centre. */
function drawHelperBody(g: G): void {
  g.fillStyle(0x000000, 0.25).fillEllipse(32, 66, 50, 10);
  g.fillStyle(0x3a2a20, 1).fillRoundedRect(16, 50, 12, 16, 4).fillRoundedRect(36, 50, 12, 16, 4); // boots
  g.fillStyle(0x3f6fa8, 1).fillRoundedRect(12, 18, 40, 38, 12); // overalls
  g.fillStyle(0xd96b3a, 1).fillRoundedRect(14, 16, 36, 16, 8); // shirt
  g.fillStyle(0x3f6fa8, 1).fillRect(20, 26, 24, 14);
  g.fillStyle(0xf2c46d, 1).fillCircle(24, 30, 2.5).fillCircle(40, 30, 2.5);
  g.fillStyle(0x2f5a8a, 1).fillRect(29, 34, 6, 8);
}

/** Helper head by tier (1 cap, 2 cap, 3 hard hat with lamp, 4 hard hat with lamp and goggles). */
function drawHelperHead(g: G, tier: number): void {
  g.fillStyle(0xf0c59a, 1).fillCircle(24, 28, 16);
  g.fillStyle(0xd99a6a, 1).fillCircle(24, 34, 5); // nose shadow
  g.fillStyle(0x2b2118, 1).fillCircle(18, 27, 2.6).fillCircle(30, 27, 2.6);
  g.fillStyle(0x2b2118, 1).fillRect(19, 37, 10, 2);
  if (tier <= 2) {
    g.fillStyle(tier === 1 ? 0x8a5a35 : 0x4fbf6a, 1).fillEllipse(24, 15, 34, 14);
    g.fillRect(24, 14, 20, 5);
  } else {
    g.fillStyle(0xf2b632, 1).fillEllipse(24, 16, 38, 20).fillRect(4, 16, 40, 4);
    g.fillStyle(0xfff6c0, 1).fillCircle(24, 12, 5);
    g.fillStyle(0xffffff, 0.6).fillCircle(22, 10, 2);
    if (tier >= 4) {
      g.lineStyle(3, 0x2b2118, 1).strokeCircle(18, 27, 5).strokeCircle(30, 27, 5);
    }
  }
}

function drawTool(g: G, tier: number): void {
  // drawn pointing right from the grip at (6, 20)
  if (tier <= 1) {
    g.lineStyle(5, 0x8a5a35, 1).lineBetween(6, 20, 30, 20);
    g.fillStyle(0x9aa3a8, 1).fillTriangle(28, 12, 46, 20, 28, 28);
  } else if (tier <= 3) {
    g.lineStyle(5, tier === 3 ? 0x3e3530 : 0x8a5a35, 1).lineBetween(6, 20, 38, 20);
    g.fillStyle(tier === 3 ? 0x9fb8c8 : 0x6f7880, 1).fillPoints([V(34, 4), V(44, 12), V(46, 20), V(44, 28), V(34, 36), V(40, 20)], true);
  } else {
    g.fillStyle(0xd94c2a, 1).fillRoundedRect(4, 12, 24, 16, 5);
    g.fillStyle(0x9fb8c8, 1).fillTriangle(28, 13, 48, 20, 28, 27);
    g.lineStyle(2, 0x6f7880, 1).lineBetween(32, 15, 36, 25).lineBetween(38, 16, 42, 23);
  }
}

export const FX_TEXTURES: readonly TextureRecipe[] = [
  ...[0, 1, 2, 3, 4].map((t): TextureRecipe => ({ key: `pick-${t}`, width: 124, height: 124, draw: (g) => drawPick(g, t) })),
  chunk('chunk-0', [[4, 14], [16, 4], [36, 8], [40, 26], [24, 36], [8, 30]]),
  chunk('chunk-1', [[2, 22], [12, 6], [30, 2], [42, 16], [34, 34], [12, 36]]),
  chunk('chunk-2', [[6, 8], [28, 4], [40, 20], [30, 36], [4, 30]]),
  chunk('chunk-3', [[10, 4], [34, 10], [42, 32], [18, 38], [2, 20]]),
  { key: 'helper-body', width: 64, height: 70, draw: drawHelperBody },
  ...[1, 2, 3, 4].map((t): TextureRecipe => ({ key: `helper-head-${t}`, width: 48, height: 48, draw: (g) => drawHelperHead(g, t) })),
  { key: 'helper-eyelids', width: 48, height: 48, draw: (g) => void g.fillStyle(0xf0c59a, 1).fillRect(13, 23, 22, 8).fillStyle(0x2b2118, 1).fillRect(14, 28, 8, 2).fillRect(26, 28, 8, 2) },
  ...[1, 2, 3, 4].map((t): TextureRecipe => ({ key: `tool-${t}`, width: 50, height: 40, draw: (g) => drawTool(g, t) })),
  { key: 'helper-arm', width: 28, height: 12, draw: (g) => void g.fillStyle(0xd96b3a, 1).fillRoundedRect(0, 1, 22, 10, 5).fillStyle(0xf0c59a, 1).fillCircle(22, 6, 6) },
  {
    key: 'glow',
    width: 128,
    height: 128,
    draw(g) {
      for (let i = 12; i > 0; i--) g.fillStyle(0xffffff, 0.035 * (13 - i) * 0.6).fillCircle(64, 64, i * 5.2);
    },
  },
  {
    // edge glow for celebrations: clear in the middle, coloured at the rim (tinted at runtime)
    key: 'vignette',
    width: 180,
    height: 320,
    draw(g) {
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = ((n - i) / n) ** 2 * 0.9;
        g.lineStyle(2, 0xffffff, a).strokeRect(i * 2 + 1, i * 2 + 1, 180 - i * 4 - 2, 320 - i * 4 - 2);
      }
    },
  },
  {
    key: 'sheen',
    width: 48,
    height: 420,
    draw(g) {
      for (let i = 0; i < 6; i++) g.fillStyle(0xffffff, 0.06 + i * 0.03).fillRect(4 * i, 0, 48 - 8 * i, 420);
    },
  },
  {
    key: 'bubble',
    width: 26,
    height: 26,
    draw(g) {
      g.lineStyle(2.5, 0xffffff, 0.8).strokeCircle(13, 13, 10);
      g.fillStyle(0xffffff, 0.8).fillCircle(9, 9, 2.5);
    },
  },
  {
    key: 'crystal',
    width: 22,
    height: 34,
    draw(g) {
      g.fillStyle(0xcff4ff, 0.85).fillPoints([V(11, 0), V(21, 12), V(11, 34), V(1, 12)], true);
      g.fillStyle(0xffffff, 0.9).fillTriangle(11, 0, 11, 34, 1, 12);
    },
  },
  {
    key: 'fern',
    width: 90,
    height: 180,
    draw(g) {
      g.lineStyle(5, 0xffffff, 1).lineBetween(45, 178, 48, 6);
      for (let i = 0; i < 11; i++) {
        const y = 20 + i * 14;
        const len = 8 + i * 3;
        g.fillStyle(0xffffff, 1).fillEllipse(45 - len / 2 - 2, y, len, 8).fillEllipse(49 + len / 2, y + 6, len, 8);
      }
    },
  },
  {
    key: 'leviathan',
    width: 360,
    height: 120,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillEllipse(170, 60, 290, 80);
      g.fillTriangle(300, 60, 360, 18, 350, 102);
      g.fillTriangle(140, 24, 190, 0, 200, 30);
      g.fillTriangle(150, 92, 200, 118, 190, 88);
    },
  },
  {
    key: 'ico-moon',
    width: 44,
    height: 44,
    draw(g) {
      g.fillStyle(0xcfd8ff, 1).fillCircle(22, 22, 17);
      g.fillStyle(0x24160e, 1).fillCircle(30, 16, 14);
      g.fillStyle(0xffffff, 0.9).fillCircle(9, 10, 2).fillCircle(38, 34, 1.5);
    },
  },
];
