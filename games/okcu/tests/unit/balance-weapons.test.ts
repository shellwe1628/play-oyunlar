import { createRng } from '@oyun/core/pure';
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAREFUL, playRun, type Profile, type RunReport } from '../../src/sim/aimbot';
import { chapterStart } from '../../src/sim/chapters';
import { NO_META } from '../../src/sim/meta';
import { WEAPON_IDS, type WeaponId } from '../../src/sim/weapons';

/**
 * Spec 8 (the 3D build, 'hard'): a careful scripted player with each weapon, fresh save
 * (NO_META) but for the selected weapon and its level.
 */
const run = (weapon: WeaponId, wlevel: number, seed: number, opts: { startChapter?: number; untilWave?: number; maxTime?: number; god?: boolean } = {}): RunReport =>
  playRun(seed, createRng(1000 + seed), CAREFUL, { difficulty: 'hard', meta: { ...NO_META, weapon, wlevel }, ...opts });

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const note = (line: string) => {
  if (process.env.OKCU_BALANCE) appendFileSync(process.env.OKCU_BALANCE, `${line}\n`);
};

/** reaching wave 8 means chapter 1 is finished */
const CH2 = chapterStart(1);
/** reaching wave 15 means chapter 2 is finished */
const CH3 = chapterStart(2);

describe('weapon balance (careful player, hard)', { timeout: 600_000 }, () => {
  it('new player clears chapter 1 with any weapon', () => {
    for (const weapon of WEAPON_IDS) {
      const reached = Array.from({ length: 8 }, (_, i) => run(weapon, 1, i + 1, { untilWave: CH2 }).reached);
      note(`ch1 ${weapon} L1 ${JSON.stringify(reached)}`);
      expect(reached.filter((r) => r >= CH2).length, `${weapon}: ${reached.join(',')}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('levels make chapter 2 faster for a body-shooting player', () => {
    // In chapter 1 a level-1 head shot already one-shots every archer (150 vs 58 … 77 hp), so
    // levels show where hits take more than one: a careful player aiming at chests, through
    // chapter 2 (startChapter 1, to wave 15 = its boss beaten). Kept alive (god) so every run
    // clears the chapter and the count is shots needed, not shots until a knockout.
    const BODY: Profile = { ...CAREFUL, heads: false };
    const shots = (wlevel: number) =>
      Array.from({ length: 8 }, (_, i) => playRun(i + 1, createRng(1000 + i + 1), BODY, { difficulty: 'hard', meta: { ...NO_META, weapon: 'bow', wlevel }, startChapter: 1, untilWave: CH3, god: true, maxTime: 900 }));
    const l1 = shots(1);
    const l10 = shots(10);
    for (const r of [...l1, ...l10]) expect(r.reached).toBeGreaterThanOrEqual(CH3);
    const m1 = mean(l1.map((r) => r.shots));
    const m10 = mean(l10.map((r) => r.shots));
    note(`ch2 body bow shots L1 ${m1} L10 ${m10}`);
    expect(m10).toBeLessThanOrEqual(m1 * 0.6);
  });

  it('no weapon dominates', () => {
    // how fast each weapon clears chapters 1 … 4 (each from its own start, level 10, kept alive
    // so every run finishes): the mean sim time per chapter, within ±25 % of all weapons' mean
    // either way (a stage a weapon cannot clear shows up as a run hitting maxTime)
    const byWeapon = new Map<WeaponId, number>();
    for (const weapon of WEAPON_IDS) {
      const times: number[] = [];
      for (let startChapter = 0; startChapter <= 3; startChapter++) {
        for (let seed = 1; seed <= 6; seed++) {
          const r = run(weapon, 10, seed, { startChapter, untilWave: chapterStart(startChapter + 1), god: true, maxTime: 600 });
          expect(r.reached, `${weapon} chapter ${startChapter + 1} seed ${seed}`).toBeGreaterThanOrEqual(chapterStart(startChapter + 1));
          times.push(r.time);
        }
      }
      byWeapon.set(weapon, mean(times));
      note(`ch1-4 ${weapon} L10 mean time ${mean(times).toFixed(1)} ${JSON.stringify(times.map((t) => Math.round(t)))}`);
    }
    const all = mean([...byWeapon.values()]);
    for (const [weapon, m] of byWeapon) {
      expect(m, `${weapon} ${m.toFixed(1)} s vs mean ${all.toFixed(1)} s`).toBeGreaterThanOrEqual(all * 0.75);
      expect(m, `${weapon} ${m.toFixed(1)} s vs mean ${all.toFixed(1)} s`).toBeLessThanOrEqual(all * 1.25);
    }
  });
});
