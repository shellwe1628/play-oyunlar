/** Between-run progress: permanent upgrades, the bow, coins, cosmetics (pure). Stored by src/save.ts. */
import { freshArsenal, type Arsenal, type ChestKind } from './arsenal';
import { freshBow, type BowState } from './bow';
import { CHAPTERS } from './chapters';
import { bowEquivalent, type WeaponId } from './weapons';

/** Shop upgrades. Damage is not one of them any more: the forged bow is the one damage track. */
export const UPGRADE_IDS = ['hp', 'coins', 'reroll', 'starter'] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];
/**
 * What a run is created with: shop levels, the old bow's enhancement level (classic only) and the
 * selected weapon with its level (hard, the 3D build).
 */
export type MetaLevels = Record<UpgradeId, number> & { bow: number; weapon: WeaponId; wlevel: number };

export const NO_META: MetaLevels = { hp: 0, coins: 0, reroll: 0, starter: 0, bow: 0, weapon: 'bow', wlevel: 1 };

/** cost(level) = round(base × growth^level) until max. */
export const UPGRADES: Record<UpgradeId, { max: number; base: number; growth: number }> = {
  // levels 9 … 12 (and coins 7, 8) came with chapters 5 and 6: 7 339 + 1 526 more coins to spend
  hp: { max: 12, base: 25, growth: 1.55 }, // +15 max health per level
  coins: { max: 8, base: 35, growth: 1.6 }, // +20 % coins per level
  reroll: { max: 1, base: 60, growth: 1 }, // a second card reroll per run
  starter: { max: 1, base: 90, growth: 1 }, // start every run holding one random card
};

export const UPGRADE_EFFECT = { hp: 15, coins: 0.2 } as const;

export function upgradeCost(id: UpgradeId, level: number): number | null {
  const u = UPGRADES[id];
  if (level >= u.max) return null;
  return Math.round(u.base * u.growth ** level);
}

export type Hat = 'none' | 'beanie' | 'feather' | 'crown' | 'tophat' | 'horns' | 'flower' | 'party' | 'bandana' | 'wizard' | 'beret' | 'laurel' | 'ember' | 'halo';
export type BowSkin = 'wood' | 'leaf' | 'candy' | 'dark' | 'ice' | 'gold';

export interface Cosmetic {
  id: string;
  /** unlocked at this best wave … */
  wave: number;
  /** … or after this many runs played (0 = by wave only) */
  runs: number;
  /** … or (when set) once this chapter's boss has been beaten (index into `save.bosses`) */
  boss?: number;
  hat: Hat;
  scarf: number;
  bow: BowSkin;
}

/** Looks only: unlocked by milestones the save already tracks (best wave, runs played). */
export const COSMETICS: readonly Cosmetic[] = [
  { id: 'classic', wave: 0, runs: 0, hat: 'none', scarf: 0xff4d5e, bow: 'wood' },
  { id: 'beanie', wave: 5, runs: 0, hat: 'beanie', scarf: 0x2ec4f0, bow: 'wood' },
  { id: 'feather', wave: 10, runs: 0, hat: 'feather', scarf: 0x7ee05a, bow: 'wood' },
  { id: 'tophat', wave: 15, runs: 0, hat: 'tophat', scarf: 0xb06bff, bow: 'dark' },
  { id: 'horns', wave: 20, runs: 0, hat: 'horns', scarf: 0xff9a3c, bow: 'wood' },
  { id: 'crown', wave: 25, runs: 0, hat: 'crown', scarf: 0xffd23f, bow: 'gold' },
  { id: 'flower', wave: 0, runs: 3, hat: 'flower', scarf: 0x7ee05a, bow: 'leaf' },
  { id: 'party', wave: 0, runs: 6, hat: 'party', scarf: 0xff7ac0, bow: 'candy' },
  { id: 'bandana', wave: 0, runs: 10, hat: 'bandana', scarf: 0xff4d5e, bow: 'dark' },
  { id: 'wizard', wave: 0, runs: 15, hat: 'wizard', scarf: 0x6b4ca8, bow: 'ice' },
  { id: 'beret', wave: 0, runs: 25, hat: 'beret', scarf: 0x2ec4f0, bow: 'wood' },
  { id: 'laurel', wave: 30, runs: 0, hat: 'laurel', scarf: 0xfff3d6, bow: 'gold' },
  // chapters 5 and 6: two looks for their bosses, one deep in the citadel, one for old hands
  { id: 'ember', wave: 0, runs: 0, boss: 4, hat: 'ember', scarf: 0xff6a1a, bow: 'dark' },
  { id: 'halo', wave: 0, runs: 0, boss: 5, hat: 'halo', scarf: 0xfff6c8, bow: 'gold' },
  { id: 'storm', wave: 40, runs: 0, hat: 'wizard', scarf: 0x58d0ff, bow: 'ice' },
  { id: 'veteran', wave: 0, runs: 40, hat: 'beret', scarf: 0xffd23f, bow: 'gold' },
];

/**
 * `bosses`: the save's boss knockouts per chapter (boss looks stay locked without it);
 * `bought`: `arsenal.boughtLooks`, looks paid for in the coin shop (always unlocked).
 */
export function isUnlocked(c: Cosmetic, best: number, runs: number, bosses: readonly number[] = [], bought: readonly string[] = []): boolean {
  if (bought.includes(c.id)) return true;
  if (c.boss !== undefined) return (bosses[c.boss] ?? 0) > 0;
  return c.runs > 0 ? runs >= c.runs : best >= c.wave;
}

export function unlockedCosmetics(best: number, runs = 0, bosses: readonly number[] = [], bought: readonly string[] = []): Cosmetic[] {
  return COSMETICS.filter((c) => isUnlocked(c, best, runs, bosses, bought));
}

export function cosmeticById(id: string): Cosmetic {
  return COSMETICS.find((c) => c.id === id) ?? COSMETICS[0]!;
}

export interface DatedRecord {
  n: number;
  date: string;
}

/** The records board: the player's own bests, with the day each was set. */
export interface Records {
  /** furthest stage reached in each chapter (8 = chapter cleared) */
  chapter: DatedRecord[];
  /** fastest boss knockout per chapter, seconds (0 = not beaten yet) */
  bossTime: DatedRecord[];
  /** longest headshot chain */
  headChain: DatedRecord;
  /** longest knockout streak without being hit */
  streak: DatedRecord;
  /** most knockouts in one run */
  runKos: DatedRecord;
  /** furthest endless wave (counted from the first endless wave) */
  endless: DatedRecord;
}

export function freshRecords(): Records {
  const d = (): DatedRecord => ({ n: 0, date: '' });
  return { chapter: Array.from({ length: CHAPTERS }, d), bossTime: Array.from({ length: CHAPTERS }, d), headChain: d(), streak: d(), runKos: d(), endless: d() };
}

export interface SaveData {
  best: number;
  coins: number;
  runs: number;
  upgrades: Record<UpgradeId, number>;
  /** the forged bow */
  bow: BowState;
  cosmetic: string;
  /** daily run: date key 'YYYY-MM-DD' and best wave that day */
  dailyDate: string;
  dailyBest: number;
  /** daily challenge: consecutive days with the goal met, and the last such day */
  dailyStreak: number;
  dailyDone: string;
  /** furthest chapter reached (0 … CHAPTERS − 1, CHAPTERS = endless unlocked): the chapter select offers 0 … this */
  chapter: number;
  /** chapter bosses beaten, per chapter (endless bosses count for their kind) */
  bosses: number[];
  records: Records;
  /** achievement ids unlocked */
  feats: string[];
  /** rank index last celebrated (a higher rank than this plays the rank-up ceremony) */
  rank: number;
  /** the 3D build's weapons, chests and daily offers (src/sim/arsenal.ts) */
  arsenal: Arsenal;
}

export function freshSave(): SaveData {
  return {
    best: 0,
    coins: 0,
    runs: 0,
    upgrades: { hp: 0, coins: 0, reroll: 0, starter: 0 },
    bow: freshBow(),
    cosmetic: 'classic',
    dailyDate: '',
    dailyBest: 0,
    dailyStreak: 0,
    dailyDone: '',
    chapter: 0,
    bosses: Array<number>(CHAPTERS).fill(0),
    records: freshRecords(),
    feats: [],
    rank: 0,
    arsenal: freshArsenal(),
  };
}

/** The levels a normal run is created with (the daily ignores all of them). */
export function metaOf(save: SaveData): MetaLevels {
  return { ...save.upgrades, bow: save.bow.level, weapon: 'bow', wlevel: 1 };
}

/**
 * The 3D build's run levels: `metaOf` plus the selected weapon at its level. `bow` (hard never
 * reads it for damage, only the 2D classic rules do) is the old bow +N that weapon level matches
 * (`bowEquivalent`), so the glow follows the weapon in hand, not the retired forge.
 */
export function metaOf3d(save: SaveData): MetaLevels {
  const id = save.arsenal.selected;
  const wlevel = save.arsenal.weapons[id].level;
  return { ...metaOf(save), bow: bowEquivalent(wlevel), weapon: id, wlevel };
}

export function buyUpgrade(save: SaveData, id: UpgradeId): boolean {
  const cost = upgradeCost(id, save.upgrades[id]);
  if (cost === null || save.coins < cost) return false;
  save.coins -= cost;
  save.upgrades[id] += 1;
  return true;
}

/**
 * What one run has already written to the save. Progress is banked at every wave clear, on
 * quit/hide and at death, always as a delta from this record, so nothing earned is lost when
 * the app is killed mid-run and nothing is ever counted twice.
 */
export interface RunBank {
  /** run coins already added to the save */
  coins: number;
  /** best wave in the save when the run started (for the "new best" badge) */
  startBest: number;
  /** the run was counted in `runs` */
  started: boolean;
  /** boss knockouts of this run already added to `save.bosses` */
  bosses: number;
  /** achievements unlocked during this run (shown on the result screen) */
  feats: string[];
  /** rank index when the run started */
  startRank: number;
  /** the run-end chest this run queued (3D build, `grantRunChest`), null until it ends */
  chest: ChestKind | null;
}

export function newBank(save: SaveData): RunBank {
  return { coins: 0, startBest: save.best, started: false, bosses: 0, feats: [], startRank: save.rank, chest: null };
}

/** Count the run once, when its first arrow flies. */
export function bankStart(save: SaveData, bank: RunBank): void {
  if (bank.started) return;
  bank.started = true;
  save.runs += 1;
}

/** Write what the run has earned so far: coins as a delta, best wave as a maximum. */
export function bankProgress(save: SaveData, bank: RunBank, reached: number, runCoins: number): void {
  const delta = runCoins - bank.coins;
  if (delta > 0) {
    save.coins += delta;
    bank.coins = runCoins;
  }
  if (reached > save.best) save.best = reached;
}

/** The daily run's best for today (a new day starts from zero). */
export function bankDaily(save: SaveData, key: string, reached: number): void {
  if (save.dailyDate !== key) {
    save.dailyDate = key;
    save.dailyBest = 0;
  }
  save.dailyBest = Math.max(save.dailyBest, reached);
}

/** Result of a run against the best it started with. Dying on wave 1 earns no badge. */
export function runOutcome(save: SaveData, bank: RunBank, reached: number): { best: number; newBest: boolean } {
  return { best: save.best, newBest: reached > bank.startBest && reached > 1 };
}

/** Record a finished run in one go (start, bank, outcome). */
export function applyRunResult(save: SaveData, wave: number, coins: number): { best: number; newBest: boolean } {
  const bank = newBank(save);
  bankStart(save, bank);
  bankProgress(save, bank, wave, coins);
  return runOutcome(save, bank, wave);
}

/** Calendar key for the daily run (local date). */
export function dailyKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
