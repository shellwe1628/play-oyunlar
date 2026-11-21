/**
 * Economy simulation (pure, deterministic): a fresh save that plays run after run with the
 * selected weapon, banks what each run earns and spends greedily on that weapon, to measure how
 * many hours of play the economy asks for a level (the spec: level 10 in about 3–4 h without ads,
 * about 30 % sooner with them). Runs come from a `play` callback (the economy test plays CAREFUL
 * hard runs with `playRun`), so this module never touches the combat sim and stays cheap to test.
 *
 * Model (what the game banks, Tasks 11–15):
 * - play time is the summed run time; nothing else passes on the clock;
 * - a "day" is DAY_PLAY_MIN minutes of play time: each day brings new shop offers and (with ads)
 *   three ad-coin grants, all taken at the start of the day;
 * - the free chest is claimed whenever ready (play time drives its 4 h timer; the first is ready
 *   at once): wooden, or silver when the ad is watched;
 * - after every run: its coins, its `runChest(reached)`, and for every chapter boss beaten for the
 *   first time a boss chest and that chapter's weapon (Task 15); chests are opened at once.
 *
 * Spending policy (after each run and at each day start), for the selected weapon only:
 * 1. upgrade while it can;
 * 2. short of shards: buy today's offers for that weapon (largest first) while affordable, then
 *    the chest with the most expected shards per coin (silver or gold, by the mean of
 *    `CHEST_ODDS` over `CHEST_PRICE`) as long as the coins for the upgrade itself stay in hand;
 * 3. short of coins only: wait for the next run.
 * The rest of the shop (looks, the 2D upgrades) is never bought.
 */
import { upgradeCost, upgradeWeapon } from './arsenal';
import { CHAPTERS } from './chapters';
import { CHEST_ODDS, claimFreeChest, openQueuedChest, runChest } from './chests';
import { dailyKey, freshSave, type SaveData } from './meta';
import { boughtToday, buyChest, buyOffer, CHEST_PRICE, dailyOffers, grantAdCoins } from './shop';
import { WEAPON_IDS, WEAPONS } from './weapons';

/** Play minutes that make one in-game day (offers refresh, three more ad coins). */
export const DAY_PLAY_MIN = 30;

/** What the economy needs from one run. */
export interface EconomyRun {
  reached: number;
  /** 0 … CHAPTERS − 1 chapter reached, CHAPTERS endless */
  chapter: number;
  coins: number;
  /** seconds */
  time: number;
}

export interface EconomyOptions {
  /** watches every rewarded ad on offer (free chest upgrade, three ad coins a day) */
  ads: boolean;
  /** stop once the selected weapon reaches this level */
  targetLevel: number;
  /** give up after this many hours of play */
  maxHours: number;
  /** plays run number `index` (0, 1, …) with the save as it stands (its selected weapon and level) */
  play: (save: SaveData, index: number) => EconomyRun;
}

export interface EconomyResult {
  /** play hours when each level was reached (`levelAt[l]`, level 1 at 0) */
  levelAt: number[];
  /** hours to `targetLevel`, null if not reached within `maxHours` */
  hours: number | null;
  runs: number;
  save: SaveData;
}

/** In-game day d (0, 1, …) as a day key (28-day months from 2026-01-01; d < 336). */
const dayKeyOf = (d: number): string => dailyKey(2026 + Math.floor(d / 336), 1 + (Math.floor(d / 28) % 12), 1 + (d % 28));

const meanOf = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

/** The bought chest with the most expected shards per coin (ties: gold). */
function bestChest(): 'silver' | 'gold' {
  return meanOf(CHEST_ODDS.silver.shards) / CHEST_PRICE.silver > meanOf(CHEST_ODDS.gold.shards) / CHEST_PRICE.gold ? 'silver' : 'gold';
}

function openAll(save: SaveData): void {
  while (openQueuedChest(save) !== null);
}

/** The spending policy (see the module comment). */
function spend(save: SaveData, dayKey: string): void {
  const id = save.arsenal.selected;
  const w = save.arsenal.weapons[id];
  const chest = bestChest();
  for (;;) {
    if (upgradeWeapon(save, id)) continue;
    const cost = upgradeCost(w.level);
    if (cost === null || w.shards >= cost.shards) return;
    const bought = boughtToday(save, dayKey);
    const offers = dailyOffers(dayKey, save)
      .map((o, i) => ({ ...o, i }))
      .filter((o) => o.weapon === id && !bought.includes(o.i) && o.coins <= save.coins)
      .sort((a, b) => b.shards - a.shards);
    if (offers.length > 0 && buyOffer(save, dayKey, offers[0]!.i)) continue;
    if (save.coins >= CHEST_PRICE[chest] + cost.coins && buyChest(save, chest)) {
      openAll(save);
      continue;
    }
    return;
  }
}

export function simulateEconomy(o: EconomyOptions): EconomyResult {
  const save = freshSave();
  const id = save.arsenal.selected;
  const levelAt = [0, 0];
  const dayMs = DAY_PLAY_MIN * 60_000;
  const maxMs = o.maxHours * 3600_000;
  let t = 0;
  let runs = 0;
  const hours = () => t / 3600_000;
  for (;;) {
    const dayKey = dayKeyOf(Math.floor(t / dayMs));
    if (o.ads) while (grantAdCoins(save, dayKey));
    const free = claimFreeChest(save, t, o.ads);
    if (free) {
      save.arsenal.chests.push(free);
      openAll(save);
    }
    const before = save.arsenal.weapons[id].level;
    spend(save, dayKey);
    for (let l = before + 1; l <= save.arsenal.weapons[id].level; l++) levelAt[l] = hours();
    if (save.arsenal.weapons[id].level >= o.targetLevel) return { levelAt, hours: levelAt[o.targetLevel]!, runs, save };
    if (t >= maxMs) return { levelAt, hours: null, runs, save };
    const r = o.play(save, runs);
    runs += 1;
    t += r.time * 1000;
    save.runs += 1;
    save.coins += r.coins;
    save.best = Math.max(save.best, r.reached);
    save.chapter = Math.max(save.chapter, Math.min(CHAPTERS, r.chapter));
    // every chapter before the one reached had its boss beaten
    for (let c = 0; c < Math.min(CHAPTERS, r.chapter); c++) {
      if ((save.bosses[c] ?? 0) > 0) continue;
      save.bosses[c] = 1;
      for (const wid of WEAPON_IDS) if (WEAPONS[wid].unlockBoss === c) save.arsenal.weapons[wid].owned = true;
      save.arsenal.chests.push('boss');
    }
    save.arsenal.chests.push(runChest(r.reached));
    openAll(save);
  }
}
