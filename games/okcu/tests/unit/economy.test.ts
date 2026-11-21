import { createRng } from '@oyun/core/pure';
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAREFUL, playRun } from '../../src/sim/aimbot';
import { simulateEconomy, type EconomyRun } from '../../src/sim/economy';
import { metaOf3d, type SaveData } from '../../src/sim/meta';

/**
 * Spec 7 (economy): a careful player on the 3D build's hard curves, from a fresh save, plays
 * with the bow and spends on it greedily (policy in src/sim/economy.ts). Without ads the bow
 * reaches level 10 after 3–4 h of summed run time (mean of two careers); watching every ad gets
 * there 20–40 % sooner.
 *
 * Cost control: the j-th run played at weapon level L is the same run (seed from L and j) in
 * both simulations, so the ads simulation mostly reuses the runs the no-ads one already played.
 */
const note = (line: string) => {
  if (process.env.OKCU_BALANCE) appendFileSync(process.env.OKCU_BALANCE, `${line}\n`);
};

const cache = new Map<string, EconomyRun>();

/**
 * A player (career `k`): plays CAREFUL hard runs with the save's selected weapon and level; the
 * j-th run at a level is cached per (career, weapon, level, j).
 */
function player(k: number): (save: SaveData) => EconomyRun {
  const playedAt = new Map<number, number>();
  return (save) => {
    const meta = metaOf3d(save);
    const j = playedAt.get(meta.wlevel) ?? 0;
    playedAt.set(meta.wlevel, j + 1);
    const key = `${k}:${meta.weapon}:${meta.wlevel}:${j}`;
    let r = cache.get(key);
    if (!r) {
      const seed = k * 100_000 + meta.wlevel * 1000 + j + 1;
      const rep = playRun(seed, createRng(77_000 + seed), CAREFUL, { difficulty: 'hard', meta });
      r = { reached: rep.reached, chapter: rep.chapter, coins: rep.coins, time: rep.time };
      cache.set(key, r);
    }
    return r;
  };
}

/** Two careers (different runs), so one lucky or unlucky streak does not decide the pace. */
const CAREERS = [1, 2] as const;

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (h: readonly number[]) => h.map((x) => x.toFixed(2)).join(' ');

describe('economy (careful player, hard)', { timeout: 300_000 }, () => {
  it('level 10 in 3–4 h without ads, ~30 % faster with ads', () => {
    const noAds: number[] = [];
    const ads: number[] = [];
    for (const k of CAREERS) {
      const n = simulateEconomy({ ads: false, targetLevel: 10, maxHours: 6, play: player(k) });
      const a = simulateEconomy({ ads: true, targetLevel: 10, maxHours: 6, play: player(k) });
      note(`economy career ${k} no ads: L10 ${n.hours?.toFixed(2)} h, ${n.runs} runs, levels ${fmt(n.levelAt)}`);
      note(`economy career ${k} ads: L10 ${a.hours?.toFixed(2)} h, ${a.runs} runs, levels ${fmt(a.levelAt)}`);
      expect(n.hours, `career ${k} no ads: levels at ${fmt(n.levelAt)} h`).not.toBeNull();
      expect(a.hours, `career ${k} ads: levels at ${fmt(a.levelAt)} h`).not.toBeNull();
      // ads speed things up in every career, never slow them down
      expect(a.hours!).toBeLessThan(n.hours!);
      noAds.push(n.hours!);
      ads.push(a.hours!);
    }
    const n = mean(noAds);
    const a = mean(ads);
    note(`economy mean: no ads ${n.toFixed(2)} h, ads ${a.toFixed(2)} h (${((1 - a / n) * 100).toFixed(0)} % sooner)`);
    expect(n, `no ads ${fmt(noAds)} h`).toBeGreaterThanOrEqual(3);
    expect(n, `no ads ${fmt(noAds)} h`).toBeLessThanOrEqual(4);
    // 20–40 % sooner
    expect(a, `ads ${fmt(ads)} h vs no ads ${fmt(noAds)} h`).toBeGreaterThanOrEqual(n * 0.6);
    expect(a, `ads ${fmt(ads)} h vs no ads ${fmt(noAds)} h`).toBeLessThanOrEqual(n * 0.8);
  });
});
