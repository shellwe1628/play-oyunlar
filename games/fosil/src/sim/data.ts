/**
 * All game numbers as data (pure). Loot tables, power, block HP, dust, upgrades, set bonuses,
 * glint, combo and offline rules. Scenes and the sim read this; nothing else defines numbers.
 *
 * Honesty: each fossil's `weight` is an integer and every layer's weights sum to exactly
 * TOTAL_WEIGHT, so the printed "1 in {odds}" is the exact base probability (weight / total).
 */

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
  for (let t = TIERS.length - 1; t >= 0; t--) if (odds >= TIERS[t].minOdds) return t;
  return 0;
}

/** Grades a fossil reaches by fusing three copies: plain → bronze → silver → gold. */
export const GRADE_COUNT = 4;
export const GRADE_MULT: readonly number[] = [1, 4, 16, 64];
export const GRADE_COLORS: readonly number[] = [0xd8cbb4, 0xcd7f32, 0xc9d1d9, 0xffd23f];
export const FUSE_AT = 3;

export type SetBonusKind = 'luck' | 'assistant' | 'offlineCap' | 'power';

export interface Layer {
  id: 'topsoil' | 'iceage' | 'cretaceous' | 'deepsea';
  /** Block HP = hp × hpGrowth^(blocks already broken in this layer). The stratum gets denser. */
  hp: number;
  hpGrowth: number;
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
    hp: 4,
    hpGrowth: 1.022,
    powerScale: 1,
    dust: 2,
    dustCurve: 0.85,
    unlockPower: 0,
    setBonus: { kind: 'luck', value: 1.25 },
    bands: [0x8a5a35, 0x7a4b2a, 0x9b6a3f, 0x6d4123, 0x84552f],
    sky: 0x3a2618,
  },
  {
    id: 'iceage',
    hp: 120,
    hpGrowth: 1.012,
    powerScale: 12,
    dust: 30,
    dustCurve: 0.85,
    unlockPower: 60,
    setBonus: { kind: 'assistant', value: 1.5 },
    bands: [0x9fb4bd, 0x7f97a3, 0xb7c6cc, 0x6e8591, 0x8ea4ae],
    sky: 0x22303a,
  },
  {
    id: 'cretaceous',
    hp: 3_000,
    hpGrowth: 1.009,
    powerScale: 160,
    dust: 600,
    dustCurve: 0.85,
    unlockPower: 2_500,
    setBonus: { kind: 'offlineCap', value: 30 * 60 },
    bands: [0xc0703a, 0xa85c2e, 0xd08a4f, 0x924d25, 0xb86a37],
    sky: 0x3b1f14,
  },
  {
    id: 'deepsea',
    hp: 80_000,
    hpGrowth: 1.007,
    powerScale: 2_400,
    dust: 12_000,
    dustCurve: 0.85,
    unlockPower: 60_000,
    setBonus: { kind: 'power', value: 2 },
    bands: [0x3b5f73, 0x2e4d61, 0x46708a, 0x253f52, 0x355a6e],
    sky: 0x0f1c26,
  },
];

export type Archetype = 'shell' | 'trilobite' | 'bone' | 'tooth' | 'leaf' | 'footprint' | 'skull' | 'claw';
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
    [25, 'trilobite', 0x7b8690, 0x4b555e, 'bands', 0],
    [50, 'skull', 0xd9a066, 0x8c5a2b, 'rim', 0],
    [60, 'leaf', 0x5f8f4a, 0x2f5a2a, 'veins', 2],
    [100, 'shell', 0xe3a33c, 0xa8641c, 'glow', 2],
    [300, 'footprint', 0x9b6b43, 0xe8c79a, 'dots', 2],
    [600, 'skull', 0xf1ede4, 0x6b5d50, 'speckle', 2],
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
];

export const FOSSILS: readonly Fossil[] = TABLE.flatMap((rows, layer) =>
  rows.map(([odds, arch, body, accent, pattern, variant], index) => ({
    id: `${LAYERS[layer].id}-${String(index + 1).padStart(2, '0')}`,
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
  return TIERS[fossil.tier].power * LAYERS[fossil.layer].powerScale * GRADE_MULT[grade];
}

export type UpgradeId = 'pick' | 'luck' | 'assistant' | 'offline';

export interface Upgrade {
  id: UpgradeId;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  /** Effect at a level: pick = power multiplier, luck = luck multiplier, assistant = hits/s, offline = cap seconds. */
  effect(level: number): number;
}

export const UPGRADES: Readonly<Record<UpgradeId, Upgrade>> = {
  pick: { id: 'pick', baseCost: 8, costGrowth: 1.55, maxLevel: 60, effect: (l) => 1 + 0.5 * l },
  luck: { id: 'luck', baseCost: 40, costGrowth: 2.1, maxLevel: 12, effect: (l) => 1 + 0.25 * l },
  assistant: { id: 'assistant', baseCost: 25, costGrowth: 1.7, maxLevel: 40, effect: (l) => 0.4 * l },
  offline: { id: 'offline', baseCost: 150, costGrowth: 3, maxLevel: 4, effect: (l) => 30 * 60 + 15 * 60 * l },
};

export const UPGRADE_ORDER: readonly UpgradeId[] = ['pick', 'luck', 'assistant', 'offline'];

export function upgradeCost(id: UpgradeId, level: number): number | null {
  const u = UPGRADES[id];
  if (level >= u.maxLevel) return null;
  return Math.floor(u.baseCost * u.costGrowth ** level);
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
