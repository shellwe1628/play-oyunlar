import { describe, expect, it } from 'vitest';
import {
  attemptForge,
  baseChance,
  BOW_MAX,
  bowCost,
  bowDamage,
  bowGlow,
  bowLevelForOldDamage,
  bowTier,
  forgeChance,
  forgeRoll,
  freshBow,
  HEAT_STEP,
  maxFailStreak,
} from '../../src/sim/bow';
import { freshSave, newBank } from '../../src/sim/meta';
import {
  bankDailyChallenge,
  bankRecords,
  dailyChallenge,
  FEATS,
  liveStreak,
  previousDay,
  progressScore,
  RANKS,
  rankOf,
  SCORE,
  scoreSubmission,
  toNextRank,
  unlockFeats,
  type RunSummary,
} from '../../src/sim/progress';

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  reached: 1,
  kos: 0,
  headChain: 0,
  streak: 0,
  multi: 0,
  focusUses: 0,
  bossKills: [],
  chapterStage: [0, 0, 0, 0],
  bonusGold: 0,
  barrelBest: 0,
  ropeDrops: 0,
  endless: 0,
  daily: false,
  ...over,
});

describe('the bow: levels, damage, cost, looks', () => {
  it('+0 … +20, damage +8 % a level to +10 then +10 %, cost rising every level', () => {
    expect(BOW_MAX).toBe(20);
    expect([0, 1, 5, 10, 11, 15, 20].map(bowDamage)).toEqual([1, 1.08, 1.4, 1.8, 1.9, 2.3, 2.8]);
    expect([0, 1, 2, 5, 10, 15, 19].map((l) => bowCost(l))).toEqual([40, 55, 76, 200, 1002, 5015, 18187]);
    expect(bowCost(20)).toBeNull();
    for (let l = 1; l < BOW_MAX; l++) expect(bowCost(l)!).toBeGreaterThan(bowCost(l - 1)!);
  });
  it('six tiers change the look: wood, horn, steel, gilded, crystal, mythic', () => {
    expect([0, 2, 3, 6, 9, 12, 15, 20].map(bowTier)).toEqual(['wood', 'wood', 'horn', 'steel', 'gilded', 'crystal', 'mythic', 'mythic']);
  });
  it('the glow grows with the level: none, a sheen, an aura that strengthens, motes, a string trail', () => {
    expect(bowGlow(0)).toMatchObject({ sheen: 0, aura: 0, particles: false, stringTrail: false });
    expect(bowGlow(3).sheen).toBeGreaterThan(0);
    expect(bowGlow(3).aura).toBe(0);
    let prev = 0;
    for (let l = 6; l <= 20; l++) {
      expect(bowGlow(l).aura, `+${l}`).toBeGreaterThanOrEqual(prev);
      prev = bowGlow(l).aura;
    }
    expect(bowGlow(11).particles).toBe(false);
    expect(bowGlow(12).particles).toBe(true);
    expect(bowGlow(14).stringTrail).toBe(false);
    expect(bowGlow(15).stringTrail).toBe(true);
    expect(new Set([6, 9, 12, 15].map((l) => bowGlow(l).color)).size).toBe(4);
  });
});

describe('the forge: printed chances, no losses, pity', () => {
  it('levels +0 … +5 always succeed; then the printed chances fall', () => {
    for (let l = 0; l < 6; l++) expect(baseChance(l)).toBe(1);
    expect([6, 7, 8, 9, 10, 15, 19].map(baseChance)).toEqual([0.9, 0.8, 0.7, 0.6, 0.5, 0.25, 0.15]);
  });
  it('the printed chance is the chance the roll uses: an attempt succeeds exactly when roll < chance', () => {
    for (const level of [6, 10, 15, 19]) {
      for (const heat of [0, 0.1, 0.3]) {
        const chance = forgeChance(level, heat);
        for (const roll of [0, chance - 1e-9, chance, chance + 1e-9, 0.999]) {
          const bow = { level, heat, tries: 0 };
          const r = attemptForge(bow, { coins: 1e9 }, roll);
          expect(r.ok && r.chance).toBe(chance);
          expect(r.ok && r.success, `+${level} heat ${heat} roll ${roll}`).toBe(roll < chance);
        }
      }
    }
  });
  it('the seeded rolls are uniform: success rates over many attempts match the printed chance', () => {
    for (const level of [6, 10, 15]) {
      let ok = 0;
      const n = 6000;
      for (let t = 0; t < n; t++) {
        const bow = { level, heat: 0, tries: t };
        const r = attemptForge(bow, { coins: 1e9 });
        if (r.ok && r.success) ok += 1;
      }
      expect(Math.abs(ok / n - baseChance(level)), `+${level}`).toBeLessThan(0.025);
    }
    expect(forgeRoll(5)).toBe(forgeRoll(5));
  });
  it('a failure only costs coins: the level stays and the heat rises by the shown step', () => {
    const bow = { level: 12, heat: 0, tries: 0 };
    const wallet = { coins: 10_000 };
    const r = attemptForge(bow, wallet, 0.99);
    expect(r).toMatchObject({ ok: true, success: false, cost: bowCost(12) });
    expect(bow.level).toBe(12);
    expect(bow.heat).toBeCloseTo(HEAT_STEP);
    expect(wallet.coins).toBe(10_000 - bowCost(12)!);
    expect(forgeChance(12, bow.heat)).toBeCloseTo(baseChance(12) + HEAT_STEP);
  });
  it('pity: a streak of failures always ends (the chance reaches 100 %), and success resets the heat', () => {
    for (let level = 6; level < BOW_MAX; level++) {
      const bow = { level, heat: 0, tries: 0 };
      const wallet = { coins: 1e9 };
      let fails = 0;
      for (;;) {
        const r = attemptForge(bow, wallet, 0.999999);
        if (r.ok && r.success) break;
        fails += 1;
        expect(fails).toBeLessThanOrEqual(maxFailStreak(level));
      }
      expect(fails).toBe(maxFailStreak(level));
      expect(bow.level).toBe(level + 1);
      expect(bow.heat).toBe(0);
    }
    expect(maxFailStreak(19)).toBe(9);
    expect(maxFailStreak(6)).toBe(1);
  });
  it('refuses when poor or maxed, spending nothing', () => {
    const wallet = { coins: 10 };
    expect(attemptForge(freshBow(), wallet)).toEqual({ ok: false, reason: 'poor' });
    expect(wallet.coins).toBe(10);
    expect(attemptForge({ level: BOW_MAX, heat: 0, tries: 0 }, { coins: 1e9 })).toEqual({ ok: false, reason: 'max' });
  });
  it('the old damage upgrade converts to at least the same damage', () => {
    for (let d = 0; d <= 8; d++) {
      const l = bowLevelForOldDamage(d);
      expect(bowDamage(l)).toBeGreaterThanOrEqual(1 + 0.1 * d - 1e-9);
      if (l > 0) expect(bowDamage(l - 1)).toBeLessThan(1 + 0.1 * d - 1e-9);
    }
    expect([0, 1, 4, 8].map(bowLevelForOldDamage)).toEqual([0, 2, 5, 10]);
  });
});

describe('progress score and ranks', () => {
  it('the score is the stated sum of its parts', () => {
    const s = freshSave();
    expect(progressScore(s).total).toBe(0);
    s.bosses = [2, 1, 0, 0];
    s.bow.level = 7;
    s.best = 16;
    s.feats = ['firstKo', 'boss1', 'boss2'];
    const p = progressScore(s);
    expect(p).toEqual({ chapters: 2 * SCORE.chapter, bosses: 3 * SCORE.boss, bow: 7 * SCORE.bow, wave: 16 * SCORE.wave, feats: 3 * SCORE.feat, total: 1200 + 120 + 560 + 240 + 300 });
    s.best = 500;
    s.bosses = [100, 0, 0, 0];
    expect(progressScore(s).wave).toBe(SCORE.waveCap * SCORE.wave);
    expect(progressScore(s).bosses).toBe(SCORE.bossCap * SCORE.boss);
  });
  it('twelve ranks with rising thresholds; the next rank shows what it needs', () => {
    expect(RANKS.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i]!.at).toBeGreaterThan(RANKS[i - 1]!.at);
    expect(rankOf(0)).toBe(0);
    expect(rankOf(199)).toBe(0);
    expect(rankOf(200)).toBe(1);
    expect(rankOf(9000)).toBe(RANKS.length - 1);
    expect(toNextRank(150)).toBe(50);
    expect(toNextRank(1e6)).toBeNull();
  });
  it('the score is deterministic and what a platform submitScore would send', () => {
    const s = freshSave();
    s.best = 9;
    s.bosses = [1, 0, 0, 0];
    expect(scoreSubmission(s)).toEqual({ board: 'okcu-progress', value: progressScore(s).total, rank: RANKS[rankOf(progressScore(s).total)]!.id, meta: { best: 9, bow: 0, chapters: 1 } });
    expect(scoreSubmission(s)).toEqual(scoreSubmission(structuredClone(s)));
  });
});

describe('achievements, records and the daily challenge', () => {
  it('achievements unlock once, pay their coins and count in the score', () => {
    const s = freshSave();
    const got = unlockFeats(s, run({ kos: 3, headChain: 4, multi: 2 }));
    expect(got).toEqual(['firstKo', 'chain3', 'double']);
    expect(s.coins).toBe(20 + 40 + 30);
    expect(unlockFeats(s, run({ kos: 3, headChain: 4, multi: 2 }))).toEqual([]);
    s.bow.level = 10;
    expect(unlockFeats(s, null)).toEqual(['forge5', 'forge10']);
    expect(progressScore(s).feats).toBe(5 * SCORE.feat);
    expect(new Set(FEATS.map((f) => f.id)).size).toBe(FEATS.length);
  });
  it('records keep the bests with their dates; boss kills are banked once', () => {
    const s = freshSave();
    const bank = newBank(s);
    const r = run({ reached: 9, chapterStage: [8, 2, 0, 0], bossKills: [{ kind: 0, time: 41.2 }], headChain: 3, streak: 6, kos: 14 });
    expect(bankRecords(s, bank, r, '2026-11-17').sort()).toEqual(['bossTime0', 'chapter0', 'chapter1', 'headChain', 'runKos', 'streak']);
    expect(s.records.chapter[0]).toEqual({ n: 8, date: '2026-11-17' });
    expect(s.records.bossTime[0]).toEqual({ n: 41.2, date: '2026-11-17' });
    expect(s.bosses[0]).toBe(1);
    expect(s.chapter).toBe(1);
    // banking the same run again (quit, hide) changes nothing
    expect(bankRecords(s, bank, r, '2026-11-17')).toEqual([]);
    expect(s.bosses[0]).toBe(1);
    // a slower kill on another day is not a record; a faster one is
    const b2 = newBank(s);
    bankRecords(s, b2, run({ bossKills: [{ kind: 0, time: 50 }] }), '2026-11-18');
    expect(s.records.bossTime[0]!.n).toBe(41.2);
    const b3 = newBank(s);
    bankRecords(s, b3, run({ bossKills: [{ kind: 0, time: 30 }] }), '2026-11-19');
    expect(s.records.bossTime[0]).toEqual({ n: 30, date: '2026-11-19' });
    expect(s.bosses[0]).toBe(3);
  });
  it('a daily run never unlocks the chapter select', () => {
    const s = freshSave();
    bankRecords(s, newBank(s), run({ reached: 20, daily: true }), '2026-11-17');
    expect(s.chapter).toBe(0);
  });
  it('the daily challenge comes from the date; meeting the goal grows a streak that a missed day resets', () => {
    expect(dailyChallenge('2026-11-17')).toEqual(dailyChallenge('2026-11-17'));
    const goals = new Set<number>();
    for (let d = 1; d <= 28; d++) goals.add(dailyChallenge(`2026-02-${String(d).padStart(2, '0')}`).goal);
    expect(Math.min(...goals)).toBeGreaterThanOrEqual(5);
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
    const s = freshSave();
    const day = (k: string) => dailyChallenge(k).goal;
    expect(bankDailyChallenge(s, '2026-11-17', day('2026-11-17') - 1)).toBe(0);
    expect(s.dailyStreak).toBe(0);
    expect(bankDailyChallenge(s, '2026-11-17', day('2026-11-17'))).toBe(35);
    expect(bankDailyChallenge(s, '2026-11-17', 99)).toBe(0); // once a day
    expect(bankDailyChallenge(s, '2026-11-18', 99)).toBe(45);
    expect(s.dailyStreak).toBe(2);
    expect(liveStreak(s, '2026-11-19')).toBe(2);
    expect(liveStreak(s, '2026-11-20')).toBe(0);
    expect(bankDailyChallenge(s, '2026-11-21', 99)).toBe(35);
    expect(s.dailyStreak).toBe(1);
  });
});
