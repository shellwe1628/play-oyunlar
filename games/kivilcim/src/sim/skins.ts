/**
 * Cosmetic skins (pure data): spark shapes and the trail collection, bought with gems or earned.
 * Cosmetic only: nothing here reaches the sim (hitboxes never change). Indices are stable forever
 * (saves store ownership as bit masks): append, never reorder.
 */

export interface ShapeSkin {
  id: string;
  price: number;
}

export type TrailTier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'earned';

export type TrailStyleId =
  | 'ribbon'
  | 'sparks'
  | 'pixels'
  | 'comet'
  | 'dots'
  | 'lightning'
  | 'helix'
  | 'rainbow'
  | 'cycle'
  | 'glitter'
  | 'neon'
  | 'flame'
  | 'aurora'
  | 'galaxy'
  | 'fork'
  | 'bars'
  | 'prism'
  | 'nova';

/** How an earned trail is unlocked (never sold). */
export type TrailUnlock = { rank: number } | { achievement: string };

export interface TrailSkin {
  id: string;
  tier: TrailTier;
  /** Gems; 0 for the free one and for earned trails. */
  price: number;
  style: TrailStyleId;
  /** Colours: head and tail of the trail. */
  head: number;
  tail: number;
  unlock?: TrailUnlock;
}

export const SHAPES: readonly ShapeSkin[] = [
  { id: 'orb', price: 0 },
  { id: 'diamond', price: 6 },
  { id: 'star', price: 9 },
  { id: 'dart', price: 12 },
  { id: 'hex', price: 16 },
  { id: 'cross', price: 20 },
  { id: 'ring', price: 25 },
  { id: 'comet', price: 32 },
];

export const TIERS: readonly TrailTier[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'earned'];
/** Badge colour per tier. */
export const TIER_COLOR: Readonly<Record<TrailTier, number>> = {
  common: 0xb8c4ff,
  rare: 0x4dd8ff,
  epic: 0xc45bff,
  legendary: 0xffb02e,
  mythic: 0xff4d8d,
  earned: 0x7dffb0,
};

export const TRAILS: readonly TrailSkin[] = [
  // The original eight keep their indices (and their owners).
  { id: 'white', tier: 'common', price: 0, style: 'ribbon', head: 0xffffff, tail: 0x7ff9ff },
  { id: 'lava', tier: 'common', price: 3, style: 'sparks', head: 0xffe14d, tail: 0xff3d2e },
  { id: 'mint', tier: 'common', price: 6, style: 'pixels', head: 0xb8fff0, tail: 0x18e6a5 },
  { id: 'sky', tier: 'common', price: 10, style: 'comet', head: 0xd6f4ff, tail: 0x2e9bff },
  { id: 'candy', tier: 'rare', price: 15, style: 'dots', head: 0xffd1f0, tail: 0xff3fae },
  { id: 'lime', tier: 'rare', price: 20, style: 'lightning', head: 0xf4ffb0, tail: 0x8cff2e },
  { id: 'violet', tier: 'rare', price: 26, style: 'helix', head: 0xeadcff, tail: 0x9b4dff },
  { id: 'rainbow', tier: 'rare', price: 32, style: 'rainbow', head: 0xffffff, tail: 0xff5ad1 },
  // The collection.
  { id: 'sunset', tier: 'epic', price: 40, style: 'cycle', head: 0xffe66b, tail: 0xff3d7a },
  { id: 'glitter', tier: 'epic', price: 48, style: 'glitter', head: 0xfff6d6, tail: 0xffc94d },
  { id: 'neon', tier: 'epic', price: 56, style: 'neon', head: 0xffffff, tail: 0x2effe0 },
  { id: 'flame', tier: 'epic', price: 64, style: 'flame', head: 0xfff2a8, tail: 0xff4a12 },
  { id: 'aurora', tier: 'legendary', price: 80, style: 'aurora', head: 0x8dffcf, tail: 0x8a5bff },
  { id: 'galaxy', tier: 'legendary', price: 95, style: 'galaxy', head: 0xf0d8ff, tail: 0x5b3dff },
  { id: 'storm', tier: 'legendary', price: 110, style: 'fork', head: 0xffffff, tail: 0x6fd0ff },
  { id: 'equalizer', tier: 'legendary', price: 125, style: 'bars', head: 0xb4ff4d, tail: 0xff3dd0 },
  { id: 'prism', tier: 'mythic', price: 160, style: 'prism', head: 0xffffff, tail: 0xff5ad1 },
  { id: 'supernova', tier: 'mythic', price: 200, style: 'nova', head: 0xfff8e0, tail: 0xff6a00 },
  // Earned only.
  { id: 'champion', tier: 'earned', price: 0, style: 'neon', head: 0xfff3b0, tail: 0xffb000, unlock: { rank: 8 } },
  { id: 'devotion', tier: 'earned', price: 0, style: 'aurora', head: 0xfff0b8, tail: 0xff8a3d, unlock: { achievement: 'daily7' } },
  { id: 'flawless', tier: 'earned', price: 0, style: 'glitter', head: 0xffffff, tail: 0xb8f0ff, unlock: { achievement: 'clean5' } },
  { id: 'voidwalker', tier: 'earned', price: 0, style: 'galaxy', head: 0xd0b8ff, tail: 0x24124f, unlock: { achievement: 'world4' } },
];

/** Trails a style animates its spark colour with (top tier). */
export const COLOR_SHIFT_STYLES: readonly TrailStyleId[] = ['prism', 'nova'];
