import { createRng } from '@oyun/core/pure';
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAREFUL, playRun, SLOW_HUMAN, STARTER, type Profile, type RunReport } from '../../src/sim/aimbot';
import { POWER_BASE } from '../../src/sim/arsenal';
import { statsFor, type CardId } from '../../src/sim/cards';
import { chapterStart, CHAPTERS, RECOMMENDED_POWER, STAGES } from '../../src/sim/chapters';
import { NO_META } from '../../src/sim/meta';
import { WEAPON_IDS, WEAPON_MAX, weaponDamage, type WeaponId } from '../../src/sim/weapons';

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

  it("chapter 1's boss falls to the starting weapon, though not to everyone", () => {
    // fresh save, level-1 bow, healed up to the boss (wave 7) so only the boss fight counts
    const wins = (p: Profile) => {
      let n = 0;
      for (let seed = 1; seed <= 16; seed++) {
        const r = playRun(seed, createRng(3000 + seed), p, { difficulty: 'hard', meta: { ...NO_META, weapon: 'bow', wlevel: 1 }, untilWave: CH2, maxTime: 1200, each: (w) => { if (w.wave < 7) w.player.hp = w.player.maxHp; } });
        if (r.reached > 7) n++;
      }
      return n;
    };
    const starter = wins(STARTER);
    const slow = wins(SLOW_HUMAN);
    note(`ch1 boss L1 wins starter ${starter}/16 slow ${slow}/16`);
    // a new player usually wins, a clumsy one sometimes: hard, but not a wall and not a formality
    expect(starter).toBeGreaterThanOrEqual(9);
    expect(starter).toBeLessThanOrEqual(15);
    expect(slow).toBeGreaterThanOrEqual(3);
    expect(slow).toBeLessThanOrEqual(12);
  });

  it('later bosses need the recommended power: the starting weapon loses, the recommended level wins', () => {
    // each chapter from its own start (drafted hand), healed until its boss begins; only runs that
    // reach the boss count
    const levelFor = (power: number) => {
      for (let L = 1; L <= WEAPON_MAX; L++) if (Math.round(POWER_BASE * weaponDamage(L)) >= power) return L;
      return WEAPON_MAX;
    };
    const fight = (p: Profile, c: number, wlevel: number, seed: number): 'win' | 'lose' | 'none' => {
      const boss = chapterStart(c) + STAGES - 1;
      let started = false;
      const r = playRun(seed, createRng(2000 + seed), p, {
        difficulty: 'hard',
        meta: { ...NO_META, weapon: 'bow', wlevel },
        startChapter: c,
        untilWave: boss + 1,
        maxTime: 1200,
        each: (w) => {
          if (w.wave === boss && w.phase === 'play') started = true;
          if (!started) w.player.hp = w.player.maxHp;
        },
      });
      return r.reached > boss ? 'win' : started ? 'lose' : 'none';
    };
    let lowWins = 0;
    let lowFights = 0;
    let recWins = 0;
    let recFights = 0;
    for (let c = 1; c < CHAPTERS; c++) {
      const rec = levelFor(RECOMMENDED_POWER[c]!);
      for (let seed = 1; seed <= 8; seed++) {
        const low = fight(STARTER, c, 1, seed);
        if (low !== 'none') lowFights++;
        if (low === 'win') lowWins++;
        const at = fight(STARTER, c, rec, seed);
        if (at !== 'none') recFights++;
        if (at === 'win') recWins++;
        // a careful player at the recommended level never loses a boss fight it reaches
        expect(fight(CAREFUL, c, rec, seed), `careful at the recommended level ${rec}, chapter ${c + 1} seed ${seed}`).not.toBe('lose');
      }
    }
    note(`ch2-6 bosses starter L1 ${lowWins}/${lowFights}, at recommended ${recWins}/${recFights}`);
    expect(lowFights).toBeGreaterThanOrEqual(15);
    expect(lowWins / lowFights).toBeLessThanOrEqual(0.15);
    expect(recWins / recFights).toBeGreaterThanOrEqual(0.75);
  });

  it('a multi-arrow barrage does not stun-lock archers: they still loose their shots', () => {
    // the strongest stack (double ×2 + split ×2) against chapter 2 (god, level 4). Counted: archers
    // that lived 2.5 s past the start of their first draw; nearly all of them must have shot,
    // and about as often as without the cards
    const measure = (stack: CardId[]) => {
      let lived = 0;
      let fired = 0;
      let shots = 0;
      let life = 0;
      for (let seed = 1; seed <= 6; seed++) {
        let injected = false;
        const seen = new Map<object, { t0: number; t1: number; shots: number }>();
        playRun(seed, createRng(4000 + seed), { ...CAREFUL, prefer: ['vitality'] }, {
          difficulty: 'hard',
          meta: { ...NO_META, weapon: 'bow', wlevel: 4 },
          startChapter: 1,
          god: true,
          maxTime: 150,
          each: (w) => {
            if (!injected) {
              injected = true;
              w.cards.length = 0;
              w.cards.push(...stack);
              w.stats = statsFor(w.cards, w.meta);
            }
            for (const e of w.enemies) {
              if (e.brain !== 'draw' && !seen.has(e)) continue;
              let s = seen.get(e);
              if (!s) seen.set(e, (s = { t0: w.time, t1: w.time, shots: 0 }));
              if (e.alive) s.t1 = w.time;
              s.shots = e.shotsFired;
            }
          },
        });
        for (const s of seen.values()) {
          if (s.t1 - s.t0 < 2.5) continue;
          lived++;
          if (s.shots > 0) fired++;
          shots += s.shots;
          life += s.t1 - s.t0;
        }
      }
      return { lived, fired, rate: shots / life };
    };
    const none = measure([]);
    const barrage = measure(['double', 'double', 'split', 'split']);
    note(`barrage fired ${barrage.fired}/${barrage.lived} rate ${barrage.rate.toFixed(2)} vs none ${none.fired}/${none.lived} ${none.rate.toFixed(2)}`);
    expect(barrage.lived).toBeGreaterThanOrEqual(15);
    expect(barrage.fired / barrage.lived).toBeGreaterThanOrEqual(0.9);
    expect(barrage.rate).toBeGreaterThanOrEqual(none.rate * 0.75);
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
