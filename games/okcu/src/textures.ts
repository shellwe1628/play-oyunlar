import type { TextureRecipe } from '@oyun/core';

/** Game palette. Every colour lives here so the game keeps one bright, chunky identity. */
export const PALETTE = {
  ink: 0x2a1838,
  inkSoft: 0x4a2c5c,
  white: 0xffffff,
  cream: 0xfff3d6,
  // the player
  player: 0xffb233,
  playerShade: 0xe58a1a,
  // enemies: one silhouette + colour each
  archer: 0xa46be8,
  archerShade: 0x7a45c0,
  shield: 0x4d8ff0,
  shieldShade: 0x2f62c4,
  shieldWood: 0xc9813f,
  shieldRim: 0xd8dde6,
  jumper: 0x52d27a,
  jumperShade: 0x2ea356,
  bomber: 0x55566e,
  bomberShade: 0x3a3a4c,
  bomberGoggle: 0xff8c2e,
  boss: 0xe84e5e,
  bossShade: 0xb12d3f,
  bossPlate: 0xf2c14a,
  bossPlateShade: 0xc8902a,
  bossEye: 0xfff36a,
  skin: 0xffe0bd,
  skinShade: 0xf3c493,
  blush: 0xff8f9e,
  bow: 0x8a4f22,
  bowLight: 0xc47e3e,
  string: 0xfff8e8,
  shaft: 0x6b3f1f,
  shaftLight: 0xd99a5b,
  arrowHead: 0xd8dde6,
  fletch: 0xff4d5e,
  enemyFletch: 0x7a45c0,
  fire: 0xff8a1f,
  fireCore: 0xffe14d,
  bomb: 0x2d2d3c,
  // world
  grass: 0x6fdc4f,
  grassLight: 0xa6f06e,
  grassDark: 0x3fae3a,
  soil: 0xa8683a,
  soilDark: 0x7b4626,
  rock: 0x8d7b9c,
  rockDark: 0x5f4f70,
  coin: 0xffd23f,
  coinShade: 0xe0a21b,
  apple: 0xff4a4a,
  leaf: 0x58c947,
  hp: 0xff4d6d,
  hpBack: 0x3b1f3f,
  heal: 0x7cf29c,
  danger: 0xff3b55,
  aim: 0xffffff,
  card: 0xfff3d6,
  cardEdge: 0xff9f43,
  gold: 0xffc93c,
  lantern: 0xffb84a,
  firefly: 0xe8ff7a,
  powerLow: 0x7cf29c,
  powerMid: 0xffd23f,
  bubble: 0x8fe3ff,
  locked: 0x9a8aa8,
  pipOff: 0x6b5a7a,
  hair: 0x6b3a1f,
  sky2: 0x3fa9f5,
  cardIcon: 0xffe2b0,
  pink: 0xff6fb5,
  powerHigh: 0xff6b4a,
  dust: 0xe8d3b0,
  metalLight: 0xdddddd,
  helm: 0xb8c0cc,
  smoke: 0x8a7a8a,
  weight: 0x8892a6,
  bossScarf: 0x7a1424,
  archerScarf: 0x5b2c9a,
  skyDay: 0x3fb4ff,
  capGreen: 0x3f7e3a,
  topHat: 0x2b2b3a,
  shieldScarf: 0x2a4fa0,
} as const;


/** Textures are drawn with code at boot, at the size they are shown (logical px). */
export const TEXTURES: readonly TextureRecipe[] = [
  {
    // soft edge glow for the damage vignette (tinted and faded by the scene): nested frames
    // whose alpha falls off toward the middle
    key: 'okcu-vignette',
    width: 360,
    height: 640,
    draw(g) {
      const bands = 26;
      for (let i = 0; i < bands; i++) {
        const k = 1 - i / bands;
        g.lineStyle(8, 0xffffff, k * k * 0.5).strokeRoundedRect(4 + i * 6, 4 + i * 6, 352 - i * 12, 632 - i * 12, 40);
      }
    },
  },
  {
    key: 'feather',
    width: 40,
    height: 18,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillEllipse(22, 9, 34, 14);
      g.fillStyle(0xdddddd, 1).fillTriangle(4, 9, 14, 4, 14, 14);
      g.lineStyle(2, 0xbbbbbb, 1).lineBetween(3, 9, 38, 9);
    },
  },
  {
    key: 'coin',
    width: 40,
    height: 40,
    draw(g) {
      g.fillStyle(PALETTE.ink, 1).fillCircle(20, 21, 19);
      g.fillStyle(PALETTE.coinShade, 1).fillCircle(20, 20, 16);
      g.fillStyle(PALETTE.coin, 1).fillCircle(20, 18, 14);
      g.fillStyle(PALETTE.coinShade, 1).fillRect(17, 10, 6, 16);
      g.fillStyle(0xffffff, 0.7).fillCircle(14, 12, 4);
    },
  },
  {
    key: 'apple',
    width: 64,
    height: 64,
    draw(g) {
      g.fillStyle(PALETTE.ink, 1).fillCircle(24, 38, 21).fillCircle(40, 38, 21);
      g.fillStyle(PALETTE.apple, 1).fillCircle(24, 37, 17).fillCircle(40, 37, 17);
      g.fillStyle(0xffffff, 0.55).fillCircle(22, 29, 6);
      g.fillStyle(PALETTE.ink, 1).fillRect(30, 8, 5, 16);
      g.fillStyle(PALETTE.ink, 1).fillEllipse(44, 14, 22, 13);
      g.fillStyle(PALETTE.leaf, 1).fillEllipse(44, 14, 17, 8);
    },
  },
  {
    key: 'cloud',
    width: 260,
    height: 110,
    draw(g) {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(70, 66, 40).fillCircle(120, 46, 46).fillCircle(175, 60, 38).fillCircle(214, 76, 28).fillCircle(40, 82, 26);
      g.fillRect(40, 70, 180, 36);
    },
  },
  {
    key: 'ring',
    width: 96,
    height: 96,
    draw(g) {
      g.lineStyle(10, 0xffffff, 1).strokeCircle(48, 48, 40);
    },
  },
  {
    key: 'puff',
    width: 64,
    height: 64,
    draw(g) {
      g.fillStyle(0xffffff, 0.35).fillCircle(32, 32, 31);
      g.fillStyle(0xffffff, 0.7).fillCircle(32, 32, 24);
      g.fillStyle(0xffffff, 1).fillCircle(32, 32, 16);
    },
  },
  {
    key: 'shard',
    width: 18,
    height: 10,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillTriangle(0, 5, 18, 0, 14, 10);
    },
  },
  {
    key: 'heart',
    width: 52,
    height: 48,
    draw(g) {
      g.fillStyle(PALETTE.ink, 1).fillCircle(15, 17, 15).fillCircle(37, 17, 15).fillTriangle(1, 22, 51, 22, 26, 47);
      g.fillStyle(PALETTE.hp, 1).fillCircle(15, 17, 11).fillCircle(37, 17, 11).fillTriangle(5, 21, 47, 21, 26, 41);
      g.fillStyle(0xffffff, 0.6).fillCircle(12, 13, 4);
    },
  },
];
