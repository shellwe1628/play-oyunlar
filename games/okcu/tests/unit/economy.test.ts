import { createRng } from '@oyun/core/pure';
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAREFUL, playRun } from '../../src/sim/aimbot';
import { simulateEconomy, type EconomyResult, type EconomyRun } from '../../src/sim/economy';
import { metaOf3d, type SaveData } from '../../src/sim/meta';

/**
 * Spec 7 (economy): a careful player on the 3D build's hard curves, from a fresh save, plays
 * with the bow and spends on it greedily (policy and model in src/sim/economy.ts, a day is
 * DAY_PLAY_MIN = 20 min of play). Without ads the bow reaches level 10 after 3–4 h of summed run
 * time; watching every ad gets there 20–40 % sooner; level 14 (chapters 4–6) needs no more than
 * 8 h; ads stay a booster, not the income (at most 35 % of the coins earned).
 *
 * Cost control: every weapon level has a pool of POOL real runs (CAREFUL, hard, the bow at that
 * level, fixed seeds), played once and shared; career k takes the j-th run at a level from slot
 * (j + 2k) mod POOL, so the careers see the same runs in different orders.
 */
const note = (line: string) => {
  if (process.env.OKCU_BALANCE) appendFileSync(process.env.OKCU_BALANCE, `${line}\n`);
};

const POOL = 6;
const CAREERS = [0, 1, 2] as const;

const pool = new Map<string, EconomyRun>();

function pooled(save: SaveData, slot: number): EconomyRun {
  const meta = metaOf3d(save);
  const key = `${meta.weapon}:${meta.wlevel}:${slot}`;
  let r = pool.get(key);
  if (!r) {
    const seed = meta.wlevel * 1000 + slot + 1;
    const rep = playRun(seed, createRng(77_000 + seed), CAREFUL, { difficulty: 'hard', meta });
    r = { reached: rep.reached, chapter: rep.chapter, coins: rep.coins, time: rep.time };
    pool.set(key, r);
  }
  return r;
}

/** Career k's player. */
function player(k: number): (save: SaveData) => EconomyRun {
  const playedAt = new Map<number, number>();
  return (save) => {
    const level = save.arsenal.weapons[save.arsenal.selected].level;
    const j = playedAt.get(level) ?? 0;
    playedAt.set(level, j + 1);
    return pooled(save, (j + 2 * k) % POOL);
  };
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (h: readonly number[]) => h.map((x) => x.toFixed(2)).join(' ');
const adShare = (r: EconomyResult) => r.income.ads / (r.income.runs + r.income.chests + r.income.ads);

describe('economy (careful player, hard)', { timeout: 300_000 }, () => {
  it('level 10 in 3–4 h without ads, ~30 % faster with ads, level 14 within 8 h, ads a booster', () => {
    const l10 = { noAds: [] as number[], ads: [] as number[] };
    for (const k of CAREERS) {
      const n = simulateEconomy({ ads: false, targetLevel: 14, maxHours: 10, play: player(k) });
      const a = simulateEconomy({ ads: true, targetLevel: 14, maxHours: 10, play: player(k) });
      note(`economy career ${k} no ads: L10 ${n.levelAt[10]?.toFixed(2)} h, L14 ${n.hours?.toFixed(2)} h, ${n.runs} runs, levels ${fmt(n.levelAt)}`);
      note(`economy career ${k} ads: L10 ${a.levelAt[10]?.toFixed(2)} h, L14 ${a.hours?.toFixed(2)} h, ${a.runs} runs, ad share ${(adShare(a) * 100).toFixed(0)} %, levels ${fmt(a.levelAt)}`);
      expect(n.levelAt[10], `career ${k} no ads: levels at ${fmt(n.levelAt)} h`).toBeDefined();
      expect(a.levelAt[10], `career ${k} ads: levels at ${fmt(a.levelAt)} h`).toBeDefined();
      // ads speed things up in every career, never slow them down
      expect(a.levelAt[10]!).toBeLessThan(n.levelAt[10]!);
      // no wall: chapters 4–6 (recommended power ≈ levels 14–16) stay within a day's worth of evenings
      expect(n.hours, `career ${k} no ads: levels at ${fmt(n.levelAt)} h`).not.toBeNull();
      expect(n.hours!, `career ${k} no ads L14`).toBeLessThanOrEqual(8);
      // the ads boost, they are not the income
      expect(adShare(a), `career ${k} ad share`).toBeLessThanOrEqual(0.35);
      l10.noAds.push(n.levelAt[10]!);
      l10.ads.push(a.levelAt[10]!);
    }
    const n = mean(l10.noAds);
    const a = mean(l10.ads);
    note(`economy L10 mean: no ads ${n.toFixed(2)} h, ads ${a.toFixed(2)} h (${((1 - a / n) * 100).toFixed(0)} % sooner); pool ${pool.size} runs`);
    expect(n, `no ads ${fmt(l10.noAds)} h`).toBeGreaterThanOrEqual(3);
    expect(n, `no ads ${fmt(l10.noAds)} h`).toBeLessThanOrEqual(4);
    // 20–40 % sooner
    expect(a, `ads ${fmt(l10.ads)} h vs no ads ${fmt(l10.noAds)} h`).toBeGreaterThanOrEqual(n * 0.6);
    expect(a, `ads ${fmt(l10.ads)} h vs no ads ${fmt(l10.noAds)} h`).toBeLessThanOrEqual(n * 0.8);
  });
});
