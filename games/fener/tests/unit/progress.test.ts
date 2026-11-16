import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyDailyResult,
  applyLog,
  applyNightResult,
  dailySeed,
  dailyStreak,
  freshSave,
  logbookProgress,
} from '../../src/sim/progress';
import { saveOptions } from '../../src/save';
import { logbookKeys } from '../../src/sim/station';

describe('campaign', () => {
  it('starts with night 1 unlocked and no bests', () => {
    const d = freshSave();
    expect(d.unlocked).toBe(1);
    expect(d.nightBest).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
  it('winning a night unlocks the next one; losing does not', () => {
    const d = freshSave();
    expect(applyNightResult(d, 1, 400, false).unlocked).toBe(false);
    expect(d.unlocked).toBe(1);
    const r = applyNightResult(d, 1, 900, true);
    expect(r).toEqual({ best: 900, newBest: true, unlocked: true });
    expect(d.unlocked).toBe(2);
    // replaying an old night never re-locks or double-unlocks
    expect(applyNightResult(d, 1, 100, true)).toEqual({ best: 900, newBest: false, unlocked: false });
    expect(d.unlocked).toBe(2);
  });
  it('night 7 is the last; winning it unlocks nothing', () => {
    const d = { ...freshSave(), unlocked: 7 };
    expect(applyNightResult(d, 7, 10, true).unlocked).toBe(false);
    expect(d.unlocked).toBe(7);
  });
  it('counts shifts', () => {
    const d = freshSave();
    applyNightResult(d, 1, 1, false);
    applyNightResult(d, 1, 1, false);
    expect(d.shifts).toBe(2);
  });
});

describe('logbook', () => {
  it('records each pair once, ignores unknown keys and reports what is new', () => {
    const d = freshSave();
    const [a, b] = logbookKeys();
    expect(applyLog(d, [a!, a!, 'nope:x:moved'])).toEqual([a]);
    expect(applyLog(d, [a!, b!])).toEqual([b]);
    expect(d.log).toEqual([a, b]);
  });
  it('completion counts against every (object, type) pair', () => {
    const d = freshSave();
    const all = logbookKeys();
    expect(logbookProgress(d)).toEqual({ found: 0, total: all.length, percent: 0 });
    applyLog(d, all.slice(0, Math.ceil(all.length / 2)));
    expect(logbookProgress(d).percent).toBe(Math.floor((Math.ceil(all.length / 2) / all.length) * 100));
    applyLog(d, all);
    expect(logbookProgress(d).percent).toBe(100);
  });
});

describe('daily shift', () => {
  it('seed depends only on the date', () => {
    expect(dailySeed('2026-11-16')).toBe(dailySeed('2026-11-16'));
    expect(dailySeed('2026-11-16')).not.toBe(dailySeed('2026-11-17'));
  });
  it('addDays crosses months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('keeps the best score of the day and resets it on a new day', () => {
    const d = freshSave();
    expect(applyDailyResult(d, '2026-11-16', 500)).toMatchObject({ best: 500, newBest: true });
    expect(applyDailyResult(d, '2026-11-16', 300)).toMatchObject({ best: 500, newBest: false });
    expect(applyDailyResult(d, '2026-11-17', 200)).toMatchObject({ best: 200, newBest: true });
  });
  it('streak grows on consecutive days, holds within a day and resets after a gap', () => {
    const d = freshSave();
    expect(applyDailyResult(d, '2026-11-16', 1).streak).toBe(1);
    expect(applyDailyResult(d, '2026-11-16', 1).streak).toBe(1);
    expect(applyDailyResult(d, '2026-11-17', 1).streak).toBe(2);
    expect(applyDailyResult(d, '2026-11-18', 1).streak).toBe(3);
    expect(dailyStreak(d, '2026-11-19')).toBe(3); // still alive until you miss a whole day
    expect(dailyStreak(d, '2026-11-20')).toBe(0);
    expect(applyDailyResult(d, '2026-11-21', 1).streak).toBe(1);
  });
});

describe('game save', () => {
  it('persists campaign, logbook and daily through the versioned store', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    a.update((d) => {
      applyNightResult(d, 1, 700, true);
      applyLog(d, logbookKeys().slice(0, 3));
      applyDailyResult(d, '2026-11-16', 50);
    });
    const b = createSaveStore(saveOptions(storage, 'test')).data;
    expect(b.unlocked).toBe(2);
    expect(b.nightBest[0]).toBe(700);
    expect(b.log).toHaveLength(3);
    expect(b.daily.best).toBe(50);
  });
  it('rejects a save with a broken shape', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { unlocked: 'x', nightBest: 3 } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('reset');
    expect(s.data.unlocked).toBe(1);
  });
  it('fills fields missing from an older v1 save', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { unlocked: 3 } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.data.unlocked).toBe(3);
    expect(s.data.log).toEqual([]);
    expect(s.data.nightBest).toHaveLength(7);
    expect(s.data.briefed).toBe(false);
  });
});
