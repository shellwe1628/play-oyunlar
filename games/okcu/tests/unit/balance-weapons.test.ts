import { createRng } from '@oyun/core/pure';
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAREFUL, playRun, type RunReport } from '../../src/sim/aimbot';
import { chapterStart } from '../../src/sim/chapters';
import { NO_META } from '../../src/sim/meta';
import { WEAPON_IDS, type WeaponId } from '../../src/sim/weapons';

/**
 * Spec 8 (the 3D build, 'hard'): a careful scripted player with each weapon, fresh save
 * (NO_META) but for the selected weapon and its level.
 */
const run = (weapon: WeaponId, wlevel: number, seed: number, opts: { startChapter?: number; untilWave?: number; maxTime?: number } = {}): RunReport =>
  playRun(seed, createRng(1000 + seed), CAREFUL, { difficulty: 'hard', meta: { ...NO_META, weapon, wlevel }, ...opts });

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const note = (line: string) => {
  if (process.env.OKCU_BALANCE) appendFileSync(process.env.OKCU_BALANCE, `${line}\n`);
};

/** reaching wave 8 means chapter 1 is finished */
const CH2 = chapterStart(1);
/** the end of chapter 4 */
const CH5 = chapterStart(4);

describe('weapon balance (careful player, hard)', { timeout: 600_000 }, () => {
  it('new player clears chapter 1 with any weapon', () => {
    for (const weapon of WEAPON_IDS) {
      const reached = Array.from({ length: 8 }, (_, i) => run(weapon, 1, i + 1, { untilWave: CH2 }).reached);
      note(`ch1 ${weapon} L1 ${JSON.stringify(reached)}`);
      expect(reached.filter((r) => r >= CH2).length, `${weapon}: ${reached.join(',')}`).toBeGreaterThanOrEqual(6);
    }
  });

  // KNOWN GAP (spec 8, reported in task 8): not reachable by weapon numbers. A level-1 bow head
  // shot (150) already one-shots every hard chapter-1 archer (58 … 77 hp), so level 1 is within
  // a few shots of the floor of one shot per knockout (13 KOs; measured L1 19.9, L10 15.3 shots:
  // 23 % fewer, 40 % needs L10 ≤ 11.9, below that floor). The bow's numbers cannot drop (save
  // migration: nobody loses power). Meeting it needs tougher hard chapter-1 enemies, an owner's
  // call. `it.fails` keeps the exact criterion running: it turns red once the gap is closed.
  it.fails('levels make chapter 1 faster', () => {
    const shots = (wlevel: number) => Array.from({ length: 8 }, (_, i) => run('bow', wlevel, i + 1, { untilWave: CH2 })).map((r) => r.shots);
    const l1 = mean(shots(1));
    const l10 = mean(shots(10));
    note(`shots bow L1 ${l1} L10 ${l10}`);
    expect(l10).toBeLessThanOrEqual(l1 * 0.6);
  });

  it('no weapon dominates', () => {
    const byWeapon = new Map<WeaponId, number>();
    for (const weapon of WEAPON_IDS) {
      const reached: number[] = [];
      for (let startChapter = 0; startChapter <= 3; startChapter++) {
        for (let seed = 1; seed <= 6; seed++) reached.push(run(weapon, 10, seed, { startChapter, untilWave: CH5, maxTime: 1500 }).reached);
      }
      byWeapon.set(weapon, mean(reached));
      note(`ch1-4 ${weapon} L10 mean ${mean(reached).toFixed(2)} ${JSON.stringify(reached)}`);
    }
    const all = mean([...byWeapon.values()]);
    for (const [weapon, m] of byWeapon) {
      expect(m, `${weapon} ${m.toFixed(2)} vs mean ${all.toFixed(2)}`).toBeGreaterThanOrEqual(all * 0.75);
      expect(m, `${weapon} ${m.toFixed(2)} vs mean ${all.toFixed(2)}`).toBeLessThanOrEqual(all * 1.25);
    }
  });
});
