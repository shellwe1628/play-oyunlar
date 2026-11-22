/**
 * Code-drawn art for the depth map, the weak spot and the Dig Rush: one small icon per layer
 * twist, the map and rush buttons, the eye of the sharp-eye count, a tick. Baked once at boot
 * like every other texture (white where a tint is applied at runtime).
 */
import type { TextureRecipe } from '@oyun/core';
import Phaser from 'phaser';
import type { Twist } from '../sim/data';

type G = Phaser.GameObjects.Graphics;
const V = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);

export const twistKey = (t: Twist): string => `twist-${t}`;

/** 64×64 disc with the twist drawn on it. */
const TWIST_ART: Record<Exclude<Twist, 'none'>, { disc: number; draw: (g: G) => void }> = {
  // hard vein: a pale metal seam through dark rock
  vein: {
    disc: 0x2c3540,
    draw(g) {
      g.lineStyle(9, 0x8a9cb0, 1).strokePoints([V(14, 46), V(26, 30), V(36, 36), V(50, 18)], false);
      g.lineStyle(3, 0xe8f4ff, 1).strokePoints([V(15, 44), V(26, 28), V(36, 34), V(49, 17)], false);
    },
  },
  // unstable: a clock running out
  unstable: {
    disc: 0x7a3c10,
    draw(g) {
      g.fillStyle(0xfff0d0, 1).fillCircle(32, 33, 17);
      g.lineStyle(4, 0x5a2a08, 1).lineBetween(32, 33, 32, 21).lineBetween(32, 33, 41, 37);
      g.fillStyle(0xffa040, 1).fillRect(28, 9, 8, 6);
    },
  },
  // twin: two blocks side by side
  twin: {
    disc: 0x6a5a62,
    draw(g) {
      g.fillStyle(0xf2eaea, 1).fillRoundedRect(13, 22, 18, 22, 4).fillRoundedRect(33, 22, 18, 22, 4);
      g.fillStyle(0xc8b0b4, 1).fillRect(13, 36, 18, 4).fillRect(33, 36, 18, 4);
    },
  },
  // relic: a violet shard
  relic: {
    disc: 0x2e1c48,
    draw(g) {
      g.fillStyle(0xb07aff, 1).fillPoints([V(32, 10), V(46, 28), V(32, 54), V(18, 28)], true);
      g.fillStyle(0xe6d2ff, 0.9).fillPoints([V(32, 10), V(39, 28), V(32, 34), V(25, 28)], true);
    },
  },
  // cave-in: a pile of rubble
  cavein: {
    disc: 0x3a1a14,
    draw(g) {
      g.fillStyle(0x8a7a70, 1).fillTriangle(10, 48, 24, 26, 36, 48).fillTriangle(28, 48, 42, 22, 56, 48);
      g.fillStyle(0xd0c8c0, 1).fillTriangle(18, 48, 30, 34, 42, 48);
      g.fillStyle(0xff7a30, 1).fillCircle(32, 15, 4);
    },
  },
  // boss: a crown
  boss: {
    disc: 0x0e3a3a,
    draw(g) {
      g.fillStyle(0x3fe3e0, 1).fillPoints([V(12, 44), V(12, 22), V(23, 32), V(32, 16), V(41, 32), V(52, 22), V(52, 44)], true);
      g.fillStyle(0xffffff, 0.8).fillRect(12, 40, 40, 5);
    },
  },
  // pressure: a gauge with its needle
  pressure: {
    disc: 0x10203c,
    draw(g) {
      g.lineStyle(7, 0x5a8aff, 1).beginPath().arc(32, 40, 19, Math.PI, 0, false).strokePath();
      g.lineStyle(4, 0xffffff, 1).lineBetween(32, 40, 43, 25);
      g.fillStyle(0xffffff, 1).fillCircle(32, 40, 4);
    },
  },
  // meteor: a star core
  meteor: {
    disc: 0x2c2836,
    draw(g) {
      g.fillStyle(0xffb040, 0.35).fillCircle(32, 32, 20);
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 7 : 19;
        pts.push(V(32 + Math.cos(a) * r, 32 + Math.sin(a) * r));
      }
      g.fillStyle(0xfff0c0, 1).fillPoints(pts, true);
    },
  },
  // echo: rings of an older age
  echo: {
    disc: 0x241440,
    draw(g) {
      g.lineStyle(4, 0xd8a0ff, 1).strokeCircle(32, 32, 8);
      g.lineStyle(4, 0xd8a0ff, 0.65).strokeCircle(32, 32, 15);
      g.lineStyle(4, 0xd8a0ff, 0.35).strokeCircle(32, 32, 22);
    },
  },
};

const twistTextures: TextureRecipe[] = (Object.keys(TWIST_ART) as (keyof typeof TWIST_ART)[]).map((t) => ({
  key: twistKey(t),
  width: 64,
  height: 64,
  draw(g) {
    const a = TWIST_ART[t];
    g.fillStyle(0x000000, 0.35).fillCircle(32, 34, 30);
    g.fillStyle(a.disc, 1).fillCircle(32, 32, 30);
    g.lineStyle(3, 0xffffff, 0.35).strokeCircle(32, 32, 28.5);
    a.draw(g);
  },
}));

export const MAP_TEXTURES: readonly TextureRecipe[] = [
  ...twistTextures,
  {
    // the depth map: a cut through the ground, three strata and a pin
    key: 'ico-map',
    width: 64,
    height: 64,
    draw(g) {
      g.fillStyle(0x7fb0d8, 1).fillRoundedRect(8, 8, 48, 14, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.fillStyle(0x4a6a2a, 1).fillRect(8, 20, 48, 5);
      g.fillStyle(0x9b6a3f, 1).fillRect(8, 25, 48, 10);
      g.fillStyle(0x7f97a3, 1).fillRect(8, 35, 48, 10);
      g.fillStyle(0xc0703a, 1).fillRoundedRect(8, 45, 48, 11, { tl: 0, tr: 0, bl: 8, br: 8 });
      g.lineStyle(3, 0x2b2118, 1).strokeRoundedRect(8, 8, 48, 48, 8);
      // the shaft going down and where you are
      g.fillStyle(0x2b2118, 1).fillRect(29, 20, 6, 22);
      g.fillStyle(0xffd23f, 1).fillCircle(32, 43, 6);
      g.lineStyle(2, 0x2b2118, 1).strokeCircle(32, 43, 6);
    },
  },
  {
    // the rush: a stopwatch struck by a bolt
    key: 'ico-rush',
    width: 64,
    height: 64,
    draw(g) {
      g.fillStyle(0x2b2118, 1).fillRoundedRect(27, 4, 10, 9, 3).fillCircle(32, 36, 24);
      g.fillStyle(0xfff3d0, 1).fillCircle(32, 36, 19);
      g.fillStyle(0xff7a20, 1).fillPoints([V(36, 20), V(24, 38), V(31, 38), V(27, 53), V(41, 33), V(33, 33)], true);
    },
  },
  {
    // sharp eye
    key: 'ico-eye',
    width: 44,
    height: 32,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillEllipse(22, 16, 40, 24);
      g.fillStyle(0x2b2118, 1).fillCircle(22, 16, 9);
      g.fillStyle(0xffd23f, 1).fillCircle(22, 16, 5);
      g.fillStyle(0xffffff, 1).fillCircle(25, 13, 2);
    },
  },
  {
    // a tick for a finished set
    key: 'ico-tick',
    width: 44,
    height: 44,
    draw(g) {
      g.fillStyle(0x3e8a46, 1).fillCircle(22, 22, 20);
      g.lineStyle(6, 0xffffff, 1).strokePoints([V(12, 23), V(19, 30), V(32, 15)], false);
    },
  },
  {
    // the weak spot: a four-point reticle (white, tinted at runtime)
    key: 'weak-mark',
    width: 72,
    height: 72,
    draw(g) {
      g.lineStyle(5, 0xffffff, 1);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        g.lineBetween(36 + Math.cos(a) * 12, 36 + Math.sin(a) * 12, 36 + Math.cos(a) * 30, 36 + Math.sin(a) * 30);
      }
      g.fillStyle(0xffffff, 1).fillCircle(36, 36, 6);
    },
  },
];
