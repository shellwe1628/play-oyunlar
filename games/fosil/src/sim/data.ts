/**
 * All game numbers as data (pure). Loot tables, power, block HP, dust, upgrades, set bonuses,
 * glint, combo and offline rules. Scenes and the sim read this; nothing else defines numbers.
 *
 * Honesty: each fossil's `weight` is an integer and every layer's weights sum to exactly
 * TOTAL_WEIGHT, so the printed "1 in {odds}" is the exact base probability (weight / total).
 */

/** Checked index into a table: a bad index is a bug, so it throws instead of yielding undefined. */
export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`index ${i} out of range (${arr.length})`);
  return v;
}

/** Every layer's weights sum to this. 12,000,000 = 2^7·3·5^6, so 1 in 2…1,000,000 divide it. */
export const TOTAL_WEIGHT = 12_000_000;

export interface Tier {
  id: 'common' | 'uncommon' | 'rare' | 'prized' | 'legendary' | 'mythic' | 'singular';
  /** Smallest "1 in N" that belongs to this tier. */
  minOdds: number;
  /** Frame colour (saturated colours are reserved for rarity frames). */
  color: number;
  /** Power of one plain copy before the layer multiplier. */
  power: number;
}

export const TIERS: readonly Tier[] = [
  { id: 'common', minOdds: 2, color: 0x9a8f80, power: 1 },
  { id: 'uncommon', minOdds: 10, color: 0x4fbf6a, power: 2 },
  { id: 'rare', minOdds: 100, color: 0x3d8bf0, power: 5 },
  { id: 'prized', minOdds: 1_000, color: 0xa257f2, power: 12 },
  { id: 'legendary', minOdds: 10_000, color: 0xf2a81d, power: 40 },
  { id: 'mythic', minOdds: 100_000, color: 0xf0445f, power: 150 },
  { id: 'singular', minOdds: 1_000_000, color: 0x3fe3e0, power: 800 },
];

export function tierOf(odds: number): number {
  for (let t = TIERS.length - 1; t >= 0; t--) if (odds >= at(TIERS, t).minOdds) return t;
  return 0;
}

/** Grades a fossil reaches by fusing three copies: plain → bronze → silver → gold. */
export const GRADE_COUNT = 4;
export const GRADE_MULT: readonly number[] = [1, 4, 16, 64];
export const GRADE_COLORS: readonly number[] = [0xd8cbb4, 0xcd7f32, 0xc9d1d9, 0xffd23f];
export const FUSE_AT = 3;

export type SetBonusKind = 'luck' | 'assistant' | 'offlineCap' | 'power';

/** What makes a layer play differently (introduced one per layer, each with a one-time tip). */
export type Twist = 'none' | 'vein' | 'unstable' | 'twin' | 'relic' | 'cavein' | 'boss' | 'pressure' | 'meteor' | 'echo';

export interface Layer {
  id: 'topsoil' | 'iceage' | 'cretaceous' | 'deepsea' | 'coalswamp' | 'amberforest' | 'saltcaves' | 'geode' | 'magma' | 'firstseas' | 'trench' | 'crater' | 'rift';
  twist: Twist;
  /**
   * Block HP = hp × (1 + hpRamp × k)², k = blocks already broken in this layer: the stratum gets
   * denser as you dig. Quadratic, so taps per block stay roughly level while power grows.
   */
  hp: number;
  hpRamp: number;
  /** Multiplier on the power of fossils found here. */
  powerScale: number;
  /** Dust per block = dust × (current hp / base hp)^dustCurve, rounded up. */
  dust: number;
  dustCurve: number;
  /** Dig Power needed to unlock (layer 0 is always open). */
  unlockPower: number;
  setBonus: { kind: SetBonusKind; value: number };
  /** Sediment colours of the stratum block, top band to bottom band. */
  bands: readonly number[];
  sky: number;
}

export const LAYERS: readonly Layer[] = [
  {
    id: 'topsoil',
    twist: 'none',
    hp: 4,
    hpRamp: 0.28,
    powerScale: 1,
    dust: 1,
    dustCurve: 0.5,
    unlockPower: 0,
    setBonus: { kind: 'luck', value: 1.25 },
    bands: [0x8a5a35, 0x7a4b2a, 0x9b6a3f, 0x6d4123, 0x84552f],
    sky: 0x3a2618,
  },
  {
    id: 'iceage',
    twist: 'none',
    hp: 6000,
    hpRamp: 0.009,
    powerScale: 6,
    dust: 30,
    dustCurve: 0.5,
    unlockPower: 300,
    setBonus: { kind: 'assistant', value: 1.5 },
    bands: [0x9fb4bd, 0x7f97a3, 0xb7c6cc, 0x6e8591, 0x8ea4ae],
    sky: 0x22303a,
  },
  {
    id: 'cretaceous',
    twist: 'none',
    hp: 150000,
    hpRamp: 0.004,
    powerScale: 40,
    dust: 1000,
    dustCurve: 0.5,
    unlockPower: 20000,
    setBonus: { kind: 'offlineCap', value: 30 * 60 },
    bands: [0xc0703a, 0xa85c2e, 0xd08a4f, 0x924d25, 0xb86a37],
    sky: 0x3b1f14,
  },
  {
    id: 'deepsea',
    twist: 'none',
    hp: 4500000,
    hpRamp: 0.003,
    powerScale: 250,
    dust: 30000,
    dustCurve: 0.5,
    unlockPower: 1400000,
    setBonus: { kind: 'power', value: 2 },
    bands: [0x3b5f73, 0x2e4d61, 0x46708a, 0x253f52, 0x355a6e],
    sky: 0x0f1c26,
  },
  {
    id: 'coalswamp',
    twist: 'vein',
    hp: 2.6e7,
    hpRamp: 0.003,
    powerScale: 1500,
    dust: 1.7e5,
    dustCurve: 0.5,
    unlockPower: 1.3e7,
    setBonus: { kind: 'luck', value: 1.25 },
    bands: [0x2e3a24, 0x23301c, 0x3a4a2c, 0x1c2416, 0x2a3620],
    sky: 0x0e140a,
  },
  {
    id: 'amberforest',
    twist: 'unstable',
    hp: 2.2e8,
    hpRamp: 0.003,
    powerScale: 9000,
    dust: 1.5e6,
    dustCurve: 0.5,
    unlockPower: 1.1e8,
    setBonus: { kind: 'power', value: 1.5 },
    bands: [0xc0782a, 0xa8641c, 0xd8923a, 0x8a4e16, 0xb87026],
    sky: 0x2a1404,
  },
  {
    id: 'saltcaves',
    twist: 'twin',
    hp: 2.2e9,
    hpRamp: 0.003,
    powerScale: 54_000,
    dust: 1.5e7,
    dustCurve: 0.5,
    unlockPower: 1.1e9,
    setBonus: { kind: 'assistant', value: 1.5 },
    bands: [0xe8dcd8, 0xd8c4c4, 0xf2eaea, 0xc8b0b4, 0xe0d0d0],
    sky: 0x2a2228,
  },
  {
    id: 'geode',
    twist: 'relic',
    hp: 1.5e10,
    hpRamp: 0.003,
    powerScale: 3.2e5,
    dust: 1e8,
    dustCurve: 0.5,
    unlockPower: 7.5e9,
    setBonus: { kind: 'luck', value: 1.25 },
    bands: [0x6a4a8a, 0x553a74, 0x7e5aa0, 0x452e60, 0x5e4280],
    sky: 0x140a20,
  },
  {
    id: 'magma',
    twist: 'cavein',
    hp: 1.4e11,
    hpRamp: 0.003,
    powerScale: 1.9e6,
    dust: 9e8,
    dustCurve: 0.5,
    unlockPower: 7e10,
    setBonus: { kind: 'power', value: 1.5 },
    bands: [0x3a1a14, 0x5a2014, 0x2a1210, 0x7a2a12, 0x401812],
    sky: 0x120404,
  },
  {
    id: 'firstseas',
    twist: 'boss',
    hp: 6e11,
    hpRamp: 0.003,
    powerScale: 1.1e7,
    dust: 4e9,
    dustCurve: 0.5,
    unlockPower: 3e11,
    setBonus: { kind: 'power', value: 2 },
    bands: [0x1f5a5a, 0x184a4a, 0x2a6e6a, 0x123c3c, 0x206060],
    sky: 0x041414,
  },
  // Below the First Seas: three deeper places (GAME.md "Depth round").
  {
    id: 'trench',
    twist: 'pressure',
    hp: 3.5e12,
    hpRamp: 0.003,
    powerScale: 6.5e7,
    dust: 2.4e10,
    dustCurve: 0.5,
    unlockPower: 2.6e12,
    setBonus: { kind: 'luck', value: 1.25 },
    bands: [0x1a2a4a, 0x14223e, 0x243a5e, 0x0e1830, 0x1c2e52],
    sky: 0x02060f,
  },
  {
    id: 'crater',
    twist: 'meteor',
    hp: 2.4e13,
    hpRamp: 0.003,
    powerScale: 4e8,
    dust: 1.5e11,
    dustCurve: 0.5,
    unlockPower: 1.9e13,
    setBonus: { kind: 'power', value: 1.5 },
    bands: [0x4a4250, 0x3a3444, 0x5a5262, 0x2c2836, 0x463e4e],
    sky: 0x0a0814,
  },
  {
    id: 'rift',
    twist: 'echo',
    hp: 1.6e14,
    hpRamp: 0.003,
    powerScale: 2.5e9,
    dust: 1e12,
    dustCurve: 0.5,
    unlockPower: 1.35e14,
    setBonus: { kind: 'power', value: 2 },
    bands: [0x2a1a4a, 0x3a1e5a, 0x1e1438, 0x46246a, 0x2e1a52],
    sky: 0x06020e,
  },
];

export type Archetype = 'shell' | 'trilobite' | 'bone' | 'tooth' | 'leaf' | 'footprint' | 'skull' | 'claw' | 'fish' | 'star';
export type Pattern = 'plain' | 'bands' | 'dots' | 'speckle' | 'rim' | 'veins' | 'glow' | 'stripes';

export interface FossilArt {
  arch: Archetype;
  body: number;
  accent: number;
  pattern: Pattern;
  /** 0..2: per-archetype shape variant (spiral turns, segment count, proportions). */
  variant: number;
}

export interface Fossil {
  id: string;
  layer: number;
  index: number;
  odds: number;
  weight: number;
  tier: number;
  art: FossilArt;
}

type Row = [odds: number, arch: Archetype, body: number, accent: number, pattern: Pattern, variant: number];

/** Per layer, rarest last. Names live in strings.ts under `fossil.<id>`. */
const TABLE: readonly (readonly Row[])[] = [
  // Topsoil: earthy browns and greys
  [
    [4, 'shell', 0xb59b7a, 0x7d6448, 'bands', 0],
    [5, 'leaf', 0x8f8a58, 0x5e5a36, 'veins', 0],
    [6, 'bone', 0xe0d3b8, 0xa8977a, 'plain', 0],
    [8, 'tooth', 0xefe6d0, 0xb7a684, 'rim', 1],
    [10, 'footprint', 0x6f5a49, 0x3f3128, 'plain', 0],
    [15, 'claw', 0x5b4b40, 0xc8b8a0, 'stripes', 0],
    [30, 'trilobite', 0x7b8690, 0x4b555e, 'bands', 0],
    [40, 'skull', 0xd9a066, 0x8c5a2b, 'rim', 0],
    [50, 'leaf', 0x5f8f4a, 0x2f5a2a, 'veins', 2],
    [100, 'shell', 0xe3a33c, 0xa8641c, 'glow', 2],
    [400, 'footprint', 0x9b6b43, 0xe8c79a, 'dots', 2],
    [1_200, 'skull', 0xf1ede4, 0x6b5d50, 'speckle', 2],
  ],
  // Ice Age: frost blues, ivory and bone
  [
    [2, 'bone', 0xcfd8dc, 0x90a4ae, 'plain', 1],
    [5, 'tooth', 0xf5f0e1, 0x9aa7ad, 'rim', 0],
    [6, 'shell', 0x9ec9e0, 0x4f86a6, 'bands', 1],
    [12, 'footprint', 0x5d4e44, 0xb0a090, 'dots', 1],
    [50, 'leaf', 0xd6c25a, 0x8a7a2a, 'veins', 1],
    [60, 'claw', 0x3e3530, 0xe7dccb, 'plain', 1],
    [150, 'bone', 0x8d6e4f, 0xdcc6a6, 'stripes', 2],
    [250, 'skull', 0xc9b79c, 0x6c5c4a, 'speckle', 1],
    [600, 'tooth', 0xa1887f, 0xe8ded3, 'bands', 2],
    [1_500, 'trilobite', 0x7fd6f0, 0x2a7fa8, 'glow', 1],
    [4_000, 'claw', 0xe8b04a, 0x7a4f12, 'stripes', 2],
    [12_000, 'skull', 0xe6f4f7, 0x3c9bbf, 'glow', 0],
  ],
  // Cretaceous: rust, amber and jungle greens
  [
    [2, 'leaf', 0x4e7d3a, 0x2c4a20, 'veins', 0],
    [4, 'shell', 0xc98b4e, 0x7a4a22, 'bands', 2],
    [6, 'tooth', 0xe9dcc0, 0x8a6a3a, 'stripes', 0],
    [25, 'footprint', 0x7a4a2a, 0xd9a877, 'plain', 2],
    [50, 'bone', 0xb98d5e, 0x6e4a2a, 'speckle', 0],
    [64, 'claw', 0x2e2a26, 0xc94f3a, 'rim', 0],
    [200, 'trilobite', 0x8a5a3a, 0xe0a060, 'stripes', 2],
    [500, 'shell', 0xf0c040, 0x9a5a10, 'glow', 0],
    [2_500, 'skull', 0x9a7a5a, 0x3a2a1a, 'bands', 1],
    [4_000, 'tooth', 0xfff1c2, 0xc0392b, 'glow', 2],
    [20_000, 'claw', 0xd94c2a, 0xfff0d0, 'glow', 2],
    [120_000, 'skull', 0x5ad08a, 0x0f5a3a, 'speckle', 0],
  ],
  // Deep Sea: teal, violet and bioluminescent accents
  [
    [2, 'shell', 0x8fb8b0, 0x3f6e66, 'speckle', 1],
    [3, 'trilobite', 0x5e6e7a, 0x2c3a44, 'plain', 0],
    [12, 'leaf', 0xc06a8a, 0x6a2a4a, 'bands', 2],
    [16, 'tooth', 0x6a7a80, 0xdfe8ea, 'rim', 2],
    [64, 'bone', 0xdbe9e4, 0x5f8f86, 'stripes', 0],
    [300, 'claw', 0x8a3a5a, 0xf0a0c0, 'bands', 1],
    [800, 'footprint', 0x2f4a5a, 0x7fe0d0, 'glow', 1],
    [2_500, 'shell', 0xf2e3c6, 0xb5552a, 'stripes', 2],
    [5_000, 'skull', 0x4a5a6a, 0xa0c8d8, 'rim', 1],
    [50_000, 'tooth', 0x2a2a3a, 0x8f7cff, 'glow', 1],
    [250_000, 'trilobite', 0xbfefff, 0x3fa8d8, 'glow', 2],
    [1_000_000, 'skull', 0xfff6d6, 0x30e0d0, 'glow', 2],
  ],
  // Coal Swamp: dark greens and coal
  [
    [2, 'leaf', 0x3a5a2a, 0x1a2a12, 'veins', 2],
    [5, 'bone', 0x6a6a5a, 0x2a2a22, 'stripes', 1],
    [6, 'trilobite', 0x4a3a2a, 0xb08a5a, 'bands', 1],
    [10, 'footprint', 0x2a2a2a, 0x8a8a7a, 'plain', 0],
    [64, 'shell', 0x5a7a4a, 0x2a3a1a, 'rim', 1],
    [80, 'claw', 0x1a1a1a, 0x6aaa5a, 'stripes', 1],
    [300, 'leaf', 0x2f6a3a, 0xd0e08a, 'dots', 1],
    [800, 'tooth', 0x3a3a4a, 0x9a9aba, 'rim', 0],
    [2_500, 'trilobite', 0x6a8a3a, 0xe0f08a, 'glow', 2],
    [5_000, 'skull', 0x4a5a3a, 0xd0d0a0, 'bands', 1],
    [50_000, 'claw', 0x2a4a2a, 0x9aff7a, 'glow', 2],
    [200_000, 'shell', 0x1a1a1a, 0x7affd0, 'glow', 2],
  ],
  // Amber Forest: amber, gold and orange
  [
    [2, 'leaf', 0xb07a2a, 0x6a3a10, 'veins', 0],
    [3, 'shell', 0xd09a4a, 0x8a5a1a, 'bands', 0],
    [10, 'trilobite', 0xe0a040, 0x7a4010, 'stripes', 0],
    [25, 'bone', 0xc0a070, 0x6a4a20, 'speckle', 2],
    [48, 'footprint', 0x8a5a2a, 0xf0c070, 'plain', 1],
    [250, 'claw', 0x6a3a10, 0xffc060, 'rim', 0],
    [800, 'leaf', 0xffb030, 0x8a4a00, 'glow', 1],
    [2_500, 'tooth', 0xfff0c0, 0xd08a20, 'bands', 1],
    [8_000, 'skull', 0xe8b060, 0x7a3a10, 'glow', 1],
    [25_000, 'trilobite', 0xffd060, 0xffffff, 'glow', 1],
    [60_000, 'shell', 0xff9a20, 0xfff0a0, 'dots', 2],
    [600_000, 'skull', 0xffe08a, 0xff6a00, 'glow', 0],
  ],
  // Salt Caves: white, rose and pale blue
  [
    [2, 'shell', 0xf0e8e0, 0xb0a0a0, 'bands', 0],
    [3, 'bone', 0xe8e0d8, 0xa09080, 'plain', 2],
    [12, 'leaf', 0xe0c0c8, 0x9a6a7a, 'veins', 2],
    [25, 'tooth', 0xf8f0f0, 0xc08090, 'stripes', 2],
    [32, 'trilobite', 0xd8d0e8, 0x7a6a9a, 'bands', 0],
    [120, 'footprint', 0xc0b0b0, 0xffffff, 'dots', 0],
    [300, 'claw', 0xf0d0d8, 0x8a3a5a, 'rim', 2],
    [5_000, 'skull', 0xffffff, 0xc06a8a, 'speckle', 1],
    [8_000, 'shell', 0xffe0f0, 0xd04a8a, 'glow', 1],
    [20_000, 'tooth', 0xe8f8ff, 0x6ab0ff, 'glow', 0],
    [30_000, 'bone', 0xfff8ff, 0xff8ac0, 'glow', 1],
    [120_000, 'skull', 0xf0f0ff, 0x9a7aff, 'glow', 2],
  ],
  // Crystal Geode: violet and clear crystal
  [
    [2, 'shell', 0x8a6aaa, 0x4a2a6a, 'bands', 1],
    [3, 'leaf', 0x6a4a8a, 0xc0a0ff, 'veins', 0],
    [10, 'bone', 0xb0a0c8, 0x5a4a7a, 'stripes', 0],
    [30, 'trilobite', 0x5a3a7a, 0xd0b0ff, 'dots', 2],
    [40, 'footprint', 0x4a3a5a, 0xe0c0ff, 'plain', 2],
    [250, 'tooth', 0xe0d0ff, 0x7a5aaa, 'rim', 2],
    [300, 'claw', 0x7a4aaa, 0xffffff, 'stripes', 2],
    [1_500, 'skull', 0xc8b0f0, 0x4a2a7a, 'bands', 2],
    [4_000, 'shell', 0xd0a0ff, 0xffffff, 'glow', 0],
    [15_000, 'leaf', 0xa070ff, 0xffe0ff, 'glow', 2],
    [100_000, 'trilobite', 0xf0e0ff, 0xa040ff, 'glow', 2],
    [150_000, 'claw', 0xffffff, 0xc080ff, 'glow', 1],
  ],
  // Magma Vents: ash, basalt and fire
  [
    [2, 'bone', 0x3a2a2a, 0xff6a30, 'stripes', 0],
    [3, 'shell', 0x5a2a1a, 0xff8a40, 'bands', 2],
    [10, 'footprint', 0x2a1a1a, 0xff4a20, 'dots', 1],
    [25, 'tooth', 0x4a3a3a, 0xffa060, 'rim', 1],
    [40, 'leaf', 0x6a2a1a, 0xffb070, 'veins', 1],
    [800, 'trilobite', 0x8a2a10, 0xffd080, 'stripes', 1],
    [5_000, 'claw', 0xc03a10, 0xffe0a0, 'glow', 0],
    [8_000, 'skull', 0x3a2a2a, 0xff5a20, 'glow', 0],
    [15_000, 'shell', 0xff5a20, 0xffe060, 'glow', 2],
    [50_000, 'tooth', 0x1a1010, 0xff3000, 'glow', 0],
    [250_000, 'bone', 0xffd0a0, 0xff2000, 'glow', 1],
    [1_000_000, 'skull', 0xff8a30, 0xfff0a0, 'glow', 1],
  ],
  // First Seas: the oldest water, teal and glow
  [
    [2, 'leaf', 0x3a8a8a, 0x1a4a4a, 'bands', 1],
    [3, 'shell', 0x6ab0a0, 0x2a6a5a, 'dots', 0],
    [10, 'trilobite', 0x4a7a8a, 0x9af0e0, 'stripes', 1],
    [16, 'footprint', 0x2a4a4a, 0x7ae0d0, 'glow', 2],
    [500, 'bone', 0x9ad0c0, 0x2a6a6a, 'speckle', 1],
    [800, 'claw', 0x2a6a6a, 0xb0fff0, 'rim', 1],
    [1_500, 'tooth', 0xc0fff0, 0x2a8a8a, 'stripes', 0],
    [8_000, 'skull', 0x5ac0b0, 0x0a3a3a, 'rim', 2],
    [10_000, 'shell', 0x8afff0, 0x0a5a5a, 'glow', 1],
    [50_000, 'trilobite', 0x2af0d0, 0xffffff, 'glow', 0],
    [250_000, 'leaf', 0xb0fff8, 0x00a0a0, 'glow', 2],
    [1_000_000, 'skull', 0xffffff, 0x00ffd0, 'glow', 2],
  ],
  // Abyssal Trench: ink blue, pale bone and lantern lights
  [
    [2, 'fish', 0x6a7a90, 0x2a3a50, 'stripes', 0],
    [3, 'shell', 0x8a9ab0, 0x3a4a64, 'bands', 1],
    [10, 'tooth', 0xd8e0ea, 0x4a5a7a, 'rim', 0],
    [25, 'star', 0x9aa8c0, 0x3a4868, 'dots', 0],
    [60, 'trilobite', 0x4a5a7a, 0xa0c0ff, 'bands', 1],
    [160, 'fish', 0x2a3450, 0x7ad0ff, 'glow', 2],
    [320, 'claw', 0x3a4a6a, 0xd0e0ff, 'stripes', 2],
    [2_400, 'skull', 0xc8d4e8, 0x2a3a5a, 'speckle', 0],
    [6_400, 'star', 0x5a6aff, 0xe0f0ff, 'glow', 1],
    [30_000, 'fish', 0x101828, 0x60ffe0, 'glow', 1],
    [60_000, 'leaf', 0x7ab8ff, 0xffffff, 'glow', 2],
    [480_000, 'skull', 0x0a1020, 0x8af0ff, 'glow', 1],
  ],
  // Star Crater: scorched grey, star iron and comet blue
  [
    [2, 'bone', 0x8a8494, 0x4a4454, 'speckle', 2],
    [3, 'star', 0x9a90a8, 0x5a5068, 'plain', 2],
    [8, 'shell', 0x7a7088, 0xc0b8d0, 'bands', 2],
    [60, 'footprint', 0x4a4458, 0xffb060, 'dots', 0],
    [64, 'leaf', 0x6a6080, 0xd8d0f0, 'veins', 1],
    [160, 'tooth', 0xb0a8c0, 0x3a3050, 'stripes', 1],
    [400, 'star', 0xffa040, 0xfff0c0, 'rim', 0],
    [2_500, 'trilobite', 0x5a5270, 0xffc080, 'glow', 0],
    [6_000, 'claw', 0x9ad0ff, 0x2a3a6a, 'glow', 0],
    [25_000, 'fish', 0xc0c8ff, 0x5a3aff, 'speckle', 0],
    [60_000, 'skull', 0x2a2438, 0xffd060, 'glow', 2],
    [600_000, 'star', 0xffffff, 0x60a0ff, 'glow', 2],
  ],
  // Time Rift: every age at once, in violet and gold
  [
    [2, 'shell', 0x7a5aa0, 0x3a2a5a, 'speckle', 0],
    [3, 'footprint', 0x5a4a7a, 0xd0b0ff, 'plain', 1],
    [8, 'fish', 0x8a6ab0, 0xffe0a0, 'bands', 0],
    [40, 'bone', 0xc0a8e0, 0x4a2a6a, 'stripes', 0],
    [100, 'leaf', 0x9a60d0, 0xffd080, 'veins', 0],
    [200, 'trilobite', 0x6a3aa0, 0xfff0c0, 'dots', 0],
    [750, 'star', 0xd0a0ff, 0x6a2aa0, 'rim', 1],
    [4_800, 'tooth', 0xffe0a0, 0x8a40d0, 'glow', 0],
    [10_000, 'claw', 0xb070ff, 0xfff0d0, 'glow', 1],
    [50_000, 'shell', 0xffd060, 0xa040ff, 'glow', 2],
    [250_000, 'fish', 0xf0e0ff, 0xff60d0, 'glow', 2],
    [1_000_000, 'skull', 0xfff0ff, 0xb060ff, 'glow', 0],
  ],
];

export const FOSSILS: readonly Fossil[] = TABLE.flatMap((rows, layer) =>
  rows.map(([odds, arch, body, accent, pattern, variant], index) => ({
    id: `${at(LAYERS, layer).id}-${String(index + 1).padStart(2, '0')}`,
    layer,
    index,
    odds,
    weight: TOTAL_WEIGHT / odds,
    tier: tierOf(odds),
    art: { arch, body, accent, pattern, variant },
  })),
);

export const FOSSIL_BY_ID: ReadonlyMap<string, Fossil> = new Map(FOSSILS.map((f) => [f.id, f]));

/** Power of one copy of `fossil` at `grade`. */
export function fossilPower(fossil: Fossil, grade: number): number {
  return at(TIERS, fossil.tier).power * at(LAYERS, fossil.layer).powerScale * at(GRADE_MULT, grade);
}

export type UpgradeId = 'pick' | 'luck' | 'assistant' | 'offline';

export interface Upgrade {
  id: UpgradeId;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  /**
   * Deep levels (depth round): from level `from` on every level costs ×`mult` more, so the extra
   * levels are goals for the three new layers and never speed up the first hours.
   */
  late?: { from: number; mult: number };
  /** Effect at a level: pick = power multiplier, luck = luck multiplier, assistant = hits/s, offline = cap seconds. */
  effect(level: number): number;
}

export const UPGRADES: Readonly<Record<UpgradeId, Upgrade>> = {
  pick: { id: 'pick', baseCost: 15, costGrowth: 1.6, maxLevel: 80, effect: (l) => 1 + 0.25 * l },
  luck: { id: 'luck', baseCost: 60, costGrowth: 2.4, maxLevel: 16, late: { from: 12, mult: 1e4 }, effect: (l) => 1 + 0.25 * l },
  assistant: { id: 'assistant', baseCost: 30, costGrowth: 1.8, maxLevel: 35, late: { from: 25, mult: 1e4 }, effect: (l) => 0.1 * l },
  offline: { id: 'offline', baseCost: 150, costGrowth: 3, maxLevel: 6, effect: (l) => 30 * 60 + 15 * 60 * l },
};

export const UPGRADE_ORDER: readonly UpgradeId[] = ['pick', 'luck', 'assistant', 'offline'];

export function upgradeCost(id: UpgradeId, level: number): number | null {
  const u = UPGRADES[id];
  if (level >= u.maxLevel) return null;
  const late = u.late && level >= u.late.from ? u.late.mult : 1;
  return Math.floor(u.baseCost * u.costGrowth ** level * late);
}

export const COMBO = {
  /** Combo gained per tap (0..1 meter). */
  perTap: 0.05,
  /** Seconds without a tap before the meter drains. */
  grace: 0.45,
  /** Meter lost per second while draining. */
  drain: 0.4,
  /** Luck multiplier at a full meter. */
  maxMult: 2,
} as const;

export const GLINT = {
  /** Seconds until the first glint of a brand-new dig. */
  first: 8,
  minGap: 20,
  maxGap: 40,
  /** Seconds a glint stays tappable. */
  life: 3,
  /** Luck multiplier of the glint roll. */
  luck: 10,
} as const;

export const OFFLINE = {
  /** Offline assistant digs at this fraction of its active rate. */
  efficiency: 0.5,
  baseCap: 30 * 60,
  /** Hard cap whatever the upgrades and bonuses: 2 hours. */
  maxCap: 2 * 60 * 60,
} as const;

/** Rewarded ad: 2x luck for 60 s. */
export const LUCK_BOOST = { mult: 2, seconds: 60 } as const;

/** Lucky streak: after this many rolls without a find at 1 in 100 or rarer, the next roll is one. */
export const PITY = 150;

/**
 * Combo fever: every tap fills the fever meter by your combo (a full combo fills it fastest);
 * at `charge` the frenzy starts: `seconds` of ×2 tap damage and ×2 dust, combo frozen full.
 */
export const FEVER = { charge: 240, seconds: 8, damage: 2, dust: 2 } as const;

/** Blocks broken within `window` seconds of each other chain: +10 % dust per link, up to ×2. */
export const CHAIN = { window: 1.5, step: 0.1, max: 2 } as const;

/** Golden blocks (any layer, shown before you break them): ×5 dust and two rolls. */
export const GOLDEN = { chance: 1 / 20, hp: 1.5, dust: 5, rolls: 2, after: 150 } as const;

/** Layer twists. */
export const VEIN = { chance: 0.35, weak: 0.25, maxCharge: 5, fullHold: 0.8 } as const;
export const UNSTABLE = { chance: 0.35, window: 6 } as const;
export const TWIN = { chance: 0.4, hp: 1.7, rolls: 2 } as const;
export const RELIC = { chance: 1 / 6, fragments: 5, max: 3, power: 1.15 } as const;
export const CAVEIN = { chance: 1 / 8, hp: 0.4, dust: 3 } as const;
export const BOSS = { every: 20, hp: 6, phases: 3, luck: 3, dust: 5 } as const;
/**
 * Abyssal Trench: pressure blocks. Your tap damage is ×min at no combo rising to ×max at a full
 * combo (the combo before the tap, as shown); the assistant and time away always strike at ×min.
 */
export const PRESSURE = { chance: 0.4, min: 0.3, max: 2.5 } as const;
/**
 * Star Crater: star-iron blocks with a glowing core (shown before you strike). A tap within
 * `radius` of the core (block-relative 0..1 units) deals ×core and knocks the core elsewhere.
 */
export const METEOR = { chance: 0.4, core: 3, radius: 0.17 } as const;
/**
 * Time Rift: echo blocks. Each echoes one earlier layer, named on the block before you break it;
 * breaking it rolls this layer as usual plus one extra fossil from the echoed layer's own table.
 */
export const ECHO = { chance: 0.35 } as const;

/**
 * Expedition (prestige): open the deepest layer, then restart from Topsoil keeping the museum,
 * set bonuses, relics and records; every expedition adds a permanent dig power and dust bonus.
 * The deepest layer is the Time Rift since the depth round (it was the First Seas, index 9).
 */
export const EXPEDITION = { power: 0.6, dust: 0.6, hard: 0.6, needLayer: 12 } as const;

/** Daily dig: one bonus per calendar day; the streak grows the reward up to 7 days. */
export const DAILY = { maxStreak: 7, boostSeconds: 180, dustBlocks: 15 } as const;

export type AchievementKind = 'finds' | 'tier' | 'sets' | 'depth' | 'gold' | 'expeditions' | 'relics' | 'species' | 'cores' | 'echoes';
export interface Achievement {
  id: string;
  kind: AchievementKind;
  /** For 'tier': the tier index; otherwise unused. */
  tier?: number;
  target: number;
  /** Reward in blocks' worth of dust at your deepest layer. */
  reward: number;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'finds-10', kind: 'finds', target: 10, reward: 5 },
  { id: 'finds-100', kind: 'finds', target: 100, reward: 10 },
  { id: 'finds-1000', kind: 'finds', target: 1000, reward: 20 },
  { id: 'finds-10000', kind: 'finds', target: 10000, reward: 40 },
  { id: 'species-12', kind: 'species', target: 12, reward: 10 },
  { id: 'species-48', kind: 'species', target: 48, reward: 25 },
  { id: 'species-96', kind: 'species', target: 96, reward: 50 },
  { id: 'tier-2', kind: 'tier', tier: 2, target: 1, reward: 5 },
  { id: 'tier-3', kind: 'tier', tier: 3, target: 1, reward: 10 },
  { id: 'tier-4', kind: 'tier', tier: 4, target: 1, reward: 20 },
  { id: 'tier-5', kind: 'tier', tier: 5, target: 1, reward: 40 },
  { id: 'tier-6', kind: 'tier', tier: 6, target: 1, reward: 80 },
  { id: 'sets-1', kind: 'sets', target: 1, reward: 10 },
  { id: 'sets-3', kind: 'sets', target: 3, reward: 20 },
  { id: 'sets-6', kind: 'sets', target: 6, reward: 40 },
  { id: 'depth-3', kind: 'depth', target: 3, reward: 10 },
  { id: 'depth-5', kind: 'depth', target: 5, reward: 20 },
  { id: 'depth-7', kind: 'depth', target: 7, reward: 30 },
  { id: 'depth-10', kind: 'depth', target: 10, reward: 50 },
  { id: 'gold-1', kind: 'gold', target: 1, reward: 10 },
  { id: 'gold-10', kind: 'gold', target: 10, reward: 30 },
  { id: 'relics-1', kind: 'relics', target: 1, reward: 20 },
  { id: 'relics-3', kind: 'relics', target: 3, reward: 50 },
  { id: 'expeditions-1', kind: 'expeditions', target: 1, reward: 50 },
  { id: 'expeditions-3', kind: 'expeditions', target: 3, reward: 100 },
  // depth round: the three new layers and the long tail
  { id: 'depth-11', kind: 'depth', target: 11, reward: 60 },
  { id: 'depth-12', kind: 'depth', target: 12, reward: 70 },
  { id: 'depth-13', kind: 'depth', target: 13, reward: 90 },
  { id: 'cores-100', kind: 'cores', target: 100, reward: 40 },
  { id: 'echoes-25', kind: 'echoes', target: 25, reward: 40 },
  { id: 'species-120', kind: 'species', target: 120, reward: 70 },
  { id: 'species-156', kind: 'species', target: 156, reward: 120 },
  { id: 'sets-10', kind: 'sets', target: 10, reward: 70 },
  { id: 'sets-13', kind: 'sets', target: 13, reward: 120 },
  { id: 'gold-50', kind: 'gold', target: 50, reward: 60 },
  { id: 'finds-100000', kind: 'finds', target: 100000, reward: 80 },
  { id: 'expeditions-5', kind: 'expeditions', target: 5, reward: 150 },
  { id: 'expeditions-10', kind: 'expeditions', target: 10, reward: 250 },
];

/**
 * Progress score (personal ladder). Every discovered species is worth its tier's points, every
 * species' best grade adds, completed sets, the deepest layer ever reached and expeditions add.
 */
export const SCORE = {
  species: [10, 20, 40, 80, 150, 300, 600] as readonly number[],
  grade: 15,
  set: 150,
  depth: 100,
  expedition: 1500,
  relic: 200,
} as const;

export interface Rank {
  id: string;
  score: number;
  color: number;
}

/** Fifteen ranks from first dig to keeper of every age (names live in strings.ts: rank.<id>). */
export const RANKS: readonly Rank[] = [
  { id: 'pebble', score: 0, color: 0x9a8f80 },
  { id: 'sifter', score: 100, color: 0xb07a4a },
  { id: 'digger', score: 400, color: 0x6aa84f },
  { id: 'finder', score: 1000, color: 0x4fbf6a },
  { id: 'reader', score: 2200, color: 0x3d8bf0 },
  { id: 'scout', score: 4000, color: 0x2fc0d0 },
  { id: 'hunter', score: 6500, color: 0xa257f2 },
  { id: 'curator', score: 10000, color: 0xd05ad0 },
  { id: 'delver', score: 15000, color: 0xf2a81d },
  { id: 'master', score: 22000, color: 0xf06a2a },
  { id: 'grand', score: 32000, color: 0xf0445f },
  { id: 'legend', score: 46000, color: 0x3fe3e0 },
  // depth round: three ranks above the old top, for the long expedition tail
  { id: 'abyssal', score: 60000, color: 0x5a8aff },
  { id: 'starborn', score: 78000, color: 0xffb040 },
  { id: 'timeless', score: 100000, color: 0xd070ff },
];

export function rankOf(score: number): number {
  let r = 0;
  RANKS.forEach((k, i) => {
    if (score >= k.score) r = i;
  });
  return r;
}
