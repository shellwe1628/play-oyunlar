import { starTexture, type TextureRecipe } from '@oyun/core';
import Phaser from 'phaser';
import { drawFossil, FOSSIL_SIZE } from './art/fossils';
import { FX_TEXTURES } from './art/fxTextures';
import { MAP_TEXTURES } from './art/mapTextures';
import { FOSSILS } from './sim/data';

/**
 * Game palette. Warm sediment browns and ochres for the dig, museum cream for the collection;
 * saturated colours are reserved for rarity frames (TIERS in sim/data.ts).
 */
export const PALETTE = {
  dirtDark: 0x24160e,
  dirt: 0x3a2618,
  dirtLight: 0x5a3b24,
  ochre: 0xd99a3e,
  ochreLight: 0xf2c46d,
  sand: 0xe9d2a8,
  cream: 0xf4ecdc,
  creamDark: 0xe2d6bf,
  ink: 0x2b2118,
  inkSoft: 0x6b5a48,
  crack: 0x1a0f08,
  glint: 0xfff3b0,
  luck: 0x7fe08a,
  dust: 0xf2c46d,
  power: 0xffb36b,
  silhouette: 0x4b3d30,
  cardFace: 0xfffaf0,
  shadow: 0x0d0805,
} as const;

export const fossilKey = (id: string): string => `fossil-${id}`;

const fossilTextures: TextureRecipe[] = FOSSILS.map((f) => ({
  key: fossilKey(f.id),
  width: FOSSIL_SIZE,
  height: FOSSIL_SIZE,
  draw: (g) => drawFossil(g, f.art),
}));

/** Textures are drawn with code at boot. Draw at the size you display (logical px). */
export const TEXTURES: readonly TextureRecipe[] = [
  ...fossilTextures,
  ...FX_TEXTURES,
  ...MAP_TEXTURES,
  starTexture('spark', 18, 4, 0xffffff, 0.28),
  {
    // rock chip debris
    key: 'chip',
    width: 22,
    height: 18,
    draw(g) {
      g.fillStyle(0xffffff, 1).fillPoints(
        [
          new Phaser.Math.Vector2(2, 8),
          new Phaser.Math.Vector2(9, 1),
          new Phaser.Math.Vector2(20, 5),
          new Phaser.Math.Vector2(17, 16),
          new Phaser.Math.Vector2(6, 17),
        ],
        true,
      );
    },
  },
  {
    // soft light ray for rare reveals (white, tinted at runtime)
    key: 'ray',
    width: 60,
    height: 360,
    draw(g) {
      for (let i = 0; i < 6; i++) {
        g.fillStyle(0xffffff, 0.05 + i * 0.03).fillTriangle(30 - (30 - i * 5), 0, 30 + (30 - i * 5), 0, 30, 360);
      }
    },
  },
  {
    key: 'ico-power',
    width: 44,
    height: 44,
    draw(g) {
      // pick head + handle
      g.lineStyle(7, 0x8a5a35, 1).lineBetween(10, 38, 32, 12);
      g.fillStyle(PALETTE.power, 1).fillTriangle(18, 6, 40, 4, 38, 26);
      g.fillStyle(0xffffff, 0.4).fillTriangle(22, 7, 36, 6, 35, 14);
    },
  },
  {
    key: 'ico-dust',
    width: 44,
    height: 44,
    draw(g) {
      g.fillStyle(PALETTE.dust, 1).fillPoints(
        [
          new Phaser.Math.Vector2(22, 3),
          new Phaser.Math.Vector2(38, 18),
          new Phaser.Math.Vector2(22, 41),
          new Phaser.Math.Vector2(6, 18),
        ],
        true,
      );
      g.fillStyle(0xffffff, 0.45).fillTriangle(22, 3, 30, 11, 14, 11);
    },
  },
  {
    key: 'ico-luck',
    width: 44,
    height: 44,
    draw(g) {
      g.fillStyle(PALETTE.luck, 1);
      for (const [x, y] of [
        [22, 12],
        [32, 22],
        [22, 32],
        [12, 22],
      ] as const)
        g.fillCircle(x, y, 9);
      g.fillStyle(0x3e8a46, 1).fillCircle(22, 22, 5);
    },
  },
  {
    key: 'lock',
    width: 48,
    height: 56,
    draw(g) {
      g.lineStyle(8, 0xcdbfa8, 1).strokeCircle(24, 22, 13);
      g.fillStyle(0xcdbfa8, 1).fillRoundedRect(6, 24, 36, 28, 6);
      g.fillStyle(0x6b5a48, 1).fillCircle(24, 36, 5);
    },
  },
];
