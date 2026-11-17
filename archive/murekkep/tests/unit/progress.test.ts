import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN, dailyLevel, dateKey, starFlags, starsFor } from '../../src/sim/campaign';
import {
  applyCampaignResult,
  applyDailyResult,
  blotUnlocked,
  freshSave,
  isUnlocked,
  liveStreak,
  normalizeSave,
  totalStars,
} from '../../src/sim/progress';
import { loadGameSave, saveOptions } from '../../src/save';

describe('stars', () => {
  it('one for the win, one under par, one for never dropping below half the peak', () => {
    expect(starsFor({ won: false, ticks: 100, droppedBelowHalfPeak: false }, 60)).toBe(0);
    expect(starsFor({ won: true, ticks: 1200, droppedBelowHalfPeak: true }, 60)).toBe(1);
    expect(starsFor({ won: true, ticks: 600, droppedBelowHalfPeak: true }, 60)).toBe(2);
    expect(starsFor({ won: true, ticks: 1200, droppedBelowHalfPeak: false }, 60)).toBe(2);
    expect(starsFor({ won: true, ticks: 600, droppedBelowHalfPeak: false }, 60)).toBe(3);
    expect(starFlags({ won: true, ticks: 600, droppedBelowHalfPeak: true }, 60)).toEqual([true, true, false]);
  });
});

describe('campaign progress', () => {
  it('first sheet open, the next one unlocks on a win', () => {
    const d = freshSave();
    expect(isUnlocked(d, 0)).toBe(true);
    expect(isUnlocked(d, 1)).toBe(false);
    applyCampaignResult(d, 0, { won: false, ticks: 900, droppedBelowHalfPeak: false });
    expect(isUnlocked(d, 1)).toBe(false);
    applyCampaignResult(d, 0, { won: true, ticks: 900, droppedBelowHalfPeak: true });
    expect(isUnlocked(d, 1)).toBe(true);
  });

  it('keeps the best stars and best time, never lowers them', () => {
    const d = freshSave();
    const par = CAMPAIGN[0]!.parSeconds;
    const r1 = applyCampaignResult(d, 0, { won: true, ticks: par * 10 - 10, droppedBelowHalfPeak: false });
    expect(r1).toEqual({ stars: 3, bestStars: 3, newBest: true, bestSeconds: par - 1 });
    const r2 = applyCampaignResult(d, 0, { won: true, ticks: par * 20, droppedBelowHalfPeak: true });
    expect(r2.stars).toBe(1);
    expect(r2.bestStars).toBe(3);
    expect(r2.newBest).toBe(false);
    expect(d.bestSeconds[0]).toBe(par - 1);
    expect(totalStars(d)).toBe(3);
    expect(d.matches).toBe(2);
    expect(d.wins).toBe(2);
  });

  it('Blot unlocks once map 3 has been won', () => {
    const d = freshSave();
    expect(blotUnlocked(d)).toBe(false);
    for (const i of [0, 1, 2]) applyCampaignResult(d, i, { won: true, ticks: 900, droppedBelowHalfPeak: true });
    expect(blotUnlocked(d)).toBe(true);
  });
});

describe('daily sheet', () => {
  it('is seeded by the date', () => {
    expect(dailyLevel('2026-11-16')).toEqual(dailyLevel('2026-11-16'));
    expect(dailyLevel('2026-11-16').seed).not.toBe(dailyLevel('2026-11-17').seed);
    expect(dailyLevel('2026-11-16').bots.length).toBeGreaterThanOrEqual(3);
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('keeps the best winning time of the day and counts a day streak', () => {
    const d = freshSave();
    const win = (ticks: number) => ({ won: true, ticks, droppedBelowHalfPeak: false });
    expect(applyDailyResult(d, '2026-11-14', win(2000))).toMatchObject({ bestSeconds: 200, newBest: true, streak: 1 });
    expect(applyDailyResult(d, '2026-11-14', win(2500))).toMatchObject({ bestSeconds: 200, newBest: false, streak: 1 });
    expect(applyDailyResult(d, '2026-11-14', win(1500))).toMatchObject({ bestSeconds: 150, newBest: true, streak: 1 });
    expect(applyDailyResult(d, '2026-11-15', win(3000))).toMatchObject({ bestSeconds: 300, newBest: true, streak: 2 });
    // A loss does not break or extend the streak on its own…
    expect(applyDailyResult(d, '2026-11-16', { won: false, ticks: 900, droppedBelowHalfPeak: true }).streak).toBe(2);
    // …but skipping a day does.
    expect(applyDailyResult(d, '2026-11-18', win(2000)).streak).toBe(1);
  });
});

describe('game save', () => {
  it('round-trips through the versioned store', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    a.update((d) => void applyCampaignResult(d, 0, { won: true, ticks: 900, droppedBelowHalfPeak: false }));
    const b = createSaveStore(saveOptions(storage, 'test'));
    expect(b.data.stars[0]).toBe(3);
    expect(b.status).toBe('loaded');
  });

  it('rejects a save with a broken shape', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { stars: 'x' } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('reset');
    expect(s.data.stars).toHaveLength(CAMPAIGN.length);
  });

  it('fills fields missing from an older save of the same version', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { ...freshSave(), streak: undefined } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.data.streak).toBe(0);
  });
});

describe('progress details', () => {
  it('a loss lights no star at all', () => {
    expect(starFlags({ won: false, ticks: 10, droppedBelowHalfPeak: false }, 60)).toEqual([false, false, false]);
  });

  it('a one-star win is enough to unlock the next sheet', () => {
    const d = freshSave();
    const r = applyCampaignResult(d, 0, { won: true, ticks: 1e6, droppedBelowHalfPeak: true });
    expect(r.stars).toBe(1);
    expect(isUnlocked(d, 1)).toBe(true);
    expect(isUnlocked(d, 2)).toBe(false);
  });

  it('Blot unlocks with sheet 3 exactly, not with any other sheet', () => {
    const d = freshSave();
    for (const i of [0, 1, 3, 4, 5, 6, 7]) d.stars[i] = 3;
    expect(blotUnlocked(d)).toBe(false);
    d.stars[2] = 1;
    expect(blotUnlocked(d)).toBe(true);
  });

  it('the shown streak is broken once a day is skipped', () => {
    const d = freshSave();
    d.streak = 4;
    d.lastDailyWin = '2026-11-14';
    expect(liveStreak(d, '2026-11-14')).toBe(4);
    expect(liveStreak(d, '2026-11-15')).toBe(4);
    expect(liveStreak(d, '2026-11-16')).toBe(0);
  });

  it('normalizes saves from a build with a different number of sheets', () => {
    const d = { ...freshSave(), stars: [3, 9, -1, 2.5], bestSeconds: [100, 0] };
    normalizeSave(d);
    expect(d.stars).toHaveLength(CAMPAIGN.length);
    expect(d.stars.slice(0, 4)).toEqual([3, 3, 0, 2]);
    expect(d.bestSeconds).toHaveLength(CAMPAIGN.length);
    expect(d.bestSeconds[0]).toBe(100);
    const long = { ...freshSave(), stars: new Array(20).fill(1) as number[] };
    normalizeSave(long);
    expect(long.stars).toHaveLength(CAMPAIGN.length);
  });

  it('a save with a different sheet count is kept, not wiped', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { ...freshSave(), stars: [2, 1, 3] } }) });
    const s = loadGameSave(storage, 'test');
    expect(s.status).not.toBe('reset');
    expect(s.data.stars.slice(0, 3)).toEqual([2, 1, 3]);
    expect(s.data.stars).toHaveLength(CAMPAIGN.length);
  });
});
