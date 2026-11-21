import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { saveOptions } from '../../src/save';
import {
  ACHIEVEMENTS,
  GEMS_PER_STAR,
  nextRank,
  progressScore,
  RANKS,
  rankOf,
  scoreParts,
  settle,
  STAR_CLEAN,
  STAR_FINISH,
  STAR_GEMS,
  streakReward,
  totalStars,
  WORLD_CLEAR_GEMS,
} from '../../src/sim/meta';
import { buySkin, defaults, levelOpen, recordDaily, recordEndless, recordLevelRun, recordStats, type SaveData } from '../../src/sim/progress';
import { TRAILS } from '../../src/sim/skins';

describe('stars', () => {
  it('finish, all gems in one finished run, and no near miss are three separate stars, each paid once', () => {
    const d = defaults();
    let r = recordLevelRun(d, 1, { percent: 100, gemMask: 0b011, finished: true, nearMisses: 2 });
    expect(r.newStars).toBe(STAR_FINISH);
    expect(r.starGems).toBe(GEMS_PER_STAR);
    // Gems found across runs do not make the gem star: it needs all three in one finished run.
    recordLevelRun(d, 1, { percent: 40, gemMask: 0b100, finished: false });
    expect(d.levels[0]!.gemMask).toBe(7);
    expect(d.levels[0]!.stars).toBe(STAR_FINISH);
    r = recordLevelRun(d, 1, { percent: 100, gemMask: 0b111, finished: true, nearMisses: 0 });
    expect(r.newStars).toBe(STAR_GEMS | STAR_CLEAN);
    expect(r.starGems).toBe(2 * GEMS_PER_STAR);
    r = recordLevelRun(d, 1, { percent: 100, gemMask: 0b111, finished: true, nearMisses: 0 });
    expect(r.newStars).toBe(0);
    expect(totalStars(d)).toBe(3);
  });

  it('a world boss pays its clear bonus once', () => {
    const d = defaults();
    expect(recordLevelRun(d, 10, { percent: 100, gemMask: 0, finished: true }).worldGems).toBe(WORLD_CLEAR_GEMS[0]);
    expect(recordLevelRun(d, 10, { percent: 100, gemMask: 0, finished: true }).worldGems).toBe(0);
  });
});

describe('progress score and ranks', () => {
  it('the score is the sum of its parts and is deterministic', () => {
    const d = defaults();
    expect(progressScore(d)).toBe(0);
    recordLevelRun(d, 1, { percent: 100, gemMask: 7, finished: true, nearMisses: 0 });
    recordEndless(d, 730, 0);
    recordDaily(d, '2026-11-16', 10);
    recordDaily(d, '2026-11-17', 10);
    const p = scoreParts(d);
    expect(p).toEqual({ stars: 30, levels: 15, endless: 73, daily: 2 * 10 + 2 * 4, collection: 0, achievements: 0 });
    expect(progressScore(d)).toBe(30 + 15 + 73 + 28);
    const copy = JSON.parse(JSON.stringify(d)) as SaveData;
    expect(progressScore(copy)).toBe(progressScore(d));
  });

  it('twelve named ranks with rising thresholds; next rank says how much is missing', () => {
    expect(RANKS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(RANKS.map((r) => r.id)).size).toBe(RANKS.length);
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i]!.min).toBeGreaterThan(RANKS[i - 1]!.min);
    expect(rankOf(0)).toBe(0);
    expect(rankOf(RANKS[3]!.min)).toBe(3);
    expect(rankOf(RANKS[3]!.min - 1)).toBe(2);
    expect(nextRank(RANKS[3]!.min - 1)).toEqual({ rank: 3, need: 1 });
    expect(nextRank(1e9)).toBeNull();
  });

  it('everything at its maximum reaches the top rank', () => {
    const d = defaults();
    for (let id = 1; id <= 40; id++) recordLevelRun(d, id, { percent: 100, gemMask: 7, finished: true, nearMisses: 0 });
    recordEndless(d, 5000, 0);
    for (let day = 1; day <= 30; day++) recordDaily(d, `2026-12-${String(day).padStart(2, '0')}`, 50);
    d.gems = 1e6;
    TRAILS.forEach((_, i) => buySkin(d, 'trail', i));
    recordStats(d, 9, 5);
    settle(d);
    expect(rankOf(progressScore(d))).toBe(RANKS.length - 1);
  });
});

describe('achievements and earned trails', () => {
  it('pay gems once, and unlock earned trails', () => {
    const d = defaults();
    recordLevelRun(d, 1, { percent: 100, gemMask: 0, finished: true });
    const before = d.gems;
    const g = settle(d, 0);
    expect(g.achievements).toContain(ACHIEVEMENTS.findIndex((a) => a.id === 'first'));
    expect(d.gems).toBe(before + g.gems);
    expect(settle(d).achievements).toEqual([]);
    // Five clean levels earn the "flawless" trail.
    for (let id = 1; id <= 5; id++) recordLevelRun(d, id, { percent: 100, gemMask: 0, finished: true, nearMisses: 0 });
    const g2 = settle(d);
    const flawless = TRAILS.findIndex((t) => t.id === 'flawless');
    expect(g2.trails).toContain(flawless);
    expect(d.skin.ownedTrails & (1 << flawless)).not.toBe(0);
  });

  it('reports a rank-up once', () => {
    const d = defaults();
    for (let id = 1; id <= 6; id++) recordLevelRun(d, id, { percent: 100, gemMask: 7, finished: true, nearMisses: 0 });
    const g = settle(d, 0);
    expect(g.rankTo).toBeGreaterThan(g.rankFrom);
    expect(settle(d).rankTo).toBe(settle(d).rankFrom);
  });

  it('daily streak reward ladder grows to day 7, then stays generous', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 30].map(streakReward)).toEqual([5, 6, 7, 8, 10, 12, 20, 12, 12]);
    const d = defaults();
    expect(recordDaily(d, '2026-11-16', 10).streakGems).toBe(5);
    expect(recordDaily(d, '2026-11-16', 20).streakGems).toBe(0); // once per date
    expect(recordDaily(d, '2026-11-17', 20).streakGems).toBe(6);
    expect(d.daily.history.map((h) => h.date)).toEqual(['2026-11-16', '2026-11-17']);
  });
});

describe('save migration v2 → v3 (existing players keep levels, gems and skins)', () => {
  // A real v2 save as the 10-level slice wrote it.
  const v2 = {
    unlocked: 10,
    levels: [
      ...Array.from({ length: 9 }, (_, i) => ({ best: 100, attempts: 3 + i, gemMask: i % 2 ? 7 : 3, done: true })),
      { best: 64, attempts: 21, gemMask: 1, done: false },
    ],
    gems: 37,
    skin: { shape: 2, trail: 5, ownedShapes: 0b101, ownedTrails: 0b100101 },
    endlessBest: 812,
    daily: { date: '2026-11-15', best: 41, streak: 4, lastDate: '2026-11-15', gems: [0, 2] },
    finishes: 14,
    played: true,
    tutorial: true,
  };

  it('keeps every level record, the wallet, the skins and the records', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: v2 }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('migrated');
    const d = s.data;
    expect(d.levels).toHaveLength(40);
    for (let i = 0; i < 10; i++) {
      const o = v2.levels[i]!;
      expect(d.levels[i], `level ${i + 1}`).toMatchObject({ best: o.best, attempts: o.attempts, gemMask: o.gemMask, done: o.done });
    }
    expect(d.levels.slice(10).every((l) => !l.done && l.attempts === 0)).toBe(true);
    expect([d.unlocked, d.gems, d.skin, d.endlessBest, d.finishes, d.played, d.tutorial]).toEqual([10, 37, v2.skin, 812, 14, true, true]);
    expect(d.daily).toMatchObject({ date: '2026-11-15', best: 41, streak: 4, bestStreak: 4, gems: [0, 2] });
    // Owned trails keep their meaning (same indices).
    expect(d.skin.ownedTrails & (1 << 5)).not.toBe(0);
  });

  it('derives stars it can prove: finish, and all gems when all three were found; never the clean star', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: v2 }) });
    const d = createSaveStore(saveOptions(storage, 'test')).data;
    expect(d.levels[0]!.stars).toBe(STAR_FINISH); // gemMask 3
    expect(d.levels[1]!.stars).toBe(STAR_FINISH | STAR_GEMS); // gemMask 7
    expect(d.levels[9]!.stars).toBe(0); // not finished
    expect(d.levels.some((l) => l.stars & STAR_CLEAN)).toBe(false);
    expect(totalStars(d)).toBe(9 + 4);
    expect(levelOpen(d, 10)).toBe(true);
  });

  it('a migrated save settles its achievements once (gems added, never taken)', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: v2 }) });
    const store = createSaveStore(saveOptions(storage, 'test'));
    let gained = 0;
    store.update((d) => void (gained = settle(d, 0).gems));
    expect(gained).toBeGreaterThan(0);
    expect(store.data.gems).toBe(37 + gained);
    const again = createSaveStore(saveOptions(storage, 'test'));
    expect(again.status).toBe('loaded');
    expect(again.data.gems).toBe(37 + gained);
  });
});
