/** Between-run progress: permanent upgrades, coins, cosmetics (pure). Stored by src/save.ts. */

export const UPGRADE_IDS = ['hp', 'dmg', 'coins', 'reroll', 'starter'] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];
export type MetaLevels = Record<UpgradeId, number>;

export const NO_META: MetaLevels = { hp: 0, dmg: 0, coins: 0, reroll: 0, starter: 0 };

/** cost(level) = round(base × growth^level) until max. */
export const UPGRADES: Record<UpgradeId, { max: number; base: number; growth: number }> = {
  hp: { max: 8, base: 25, growth: 1.55 }, // +15 max health per level
  dmg: { max: 8, base: 30, growth: 1.6 }, // +10 % arrow damage per level
  coins: { max: 6, base: 35, growth: 1.6 }, // +20 % coins per level
  reroll: { max: 1, base: 60, growth: 1 }, // a second card reroll per run
  starter: { max: 1, base: 90, growth: 1 }, // start every run holding one random card
};

export const UPGRADE_EFFECT = { hp: 15, dmg: 0.1, coins: 0.2 } as const;

export function upgradeCost(id: UpgradeId, level: number): number | null {
  const u = UPGRADES[id];
  if (level >= u.max) return null;
  return Math.round(u.base * u.growth ** level);
}

export interface Cosmetic {
  id: string;
  /** best wave needed */
  wave: number;
  hat: 'none' | 'beanie' | 'feather' | 'crown' | 'tophat' | 'horns';
  scarf: number;
}

export const COSMETICS: readonly Cosmetic[] = [
  { id: 'classic', wave: 0, hat: 'none', scarf: 0xff4d5e },
  { id: 'beanie', wave: 5, hat: 'beanie', scarf: 0x2ec4f0 },
  { id: 'feather', wave: 10, hat: 'feather', scarf: 0x7ee05a },
  { id: 'tophat', wave: 15, hat: 'tophat', scarf: 0xb06bff },
  { id: 'horns', wave: 20, hat: 'horns', scarf: 0xff9a3c },
  { id: 'crown', wave: 25, hat: 'crown', scarf: 0xffd23f },
];

export function unlockedCosmetics(best: number): Cosmetic[] {
  return COSMETICS.filter((c) => best >= c.wave);
}

export function cosmeticById(id: string): Cosmetic {
  return COSMETICS.find((c) => c.id === id) ?? COSMETICS[0]!;
}

export interface SaveData {
  best: number;
  coins: number;
  runs: number;
  upgrades: MetaLevels;
  cosmetic: string;
  /** daily run: date key 'YYYY-MM-DD' and best wave that day */
  dailyDate: string;
  dailyBest: number;
}

export function freshSave(): SaveData {
  return { best: 0, coins: 0, runs: 0, upgrades: { ...NO_META }, cosmetic: 'classic', dailyDate: '', dailyBest: 0 };
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
}

export function newBank(save: SaveData): RunBank {
  return { coins: 0, startBest: save.best, started: false };
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
