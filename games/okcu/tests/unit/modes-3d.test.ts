/**
 * The 3D build's run tracker (apps/okcu-3d/src/ui/progress.ts) with a mode run: what the app
 * really writes to the save when a Blitz or a Boss Rush is played from the Events tab. The rules
 * are sim/modes.ts (tests/unit/modes.test.ts); this is the wiring.
 */
import { createRng, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import type { Game } from '../../../../apps/okcu-3d/src/contract';
import { createTracker } from '../../../../apps/okcu-3d/src/ui/progress';
import { openSave, todayKey } from '../../../../apps/okcu-3d/src/ui/save';
import { CAREFUL, playRun } from '../../src/sim/aimbot';
import { metaOf3d, newBank, type SaveData } from '../../src/sim/meta';
import type { Mode } from '../../src/sim/modes';
import { progressScore } from '../../src/sim/progress';
import type { World } from '../../src/sim/world';

/** the app's save store with a player who has things to lose, and the little of `Game` the tracker reads */
function setup(edit: (d: SaveData) => void = () => undefined) {
  const save = openSave(memoryStorage());
  save.update((d) => {
    d.runs = 12;
    d.best = 9;
    d.coins = 1000;
    d.chapter = 1;
    d.bosses[0] = 2;
    d.dailyStreak = 3;
    d.dailyDone = '2026-11-21';
    d.arsenal.weapons.bow.level = 20;
    edit(d);
  });
  const feats: string[] = [];
  const game = { save, daily: false } as unknown as Game;
  const tracker = createTracker(game, (id) => feats.push(id));
  return { save, tracker, feats };
}

/** play a whole run through the tracker the way the HUD drives it: frame, bank at clears, finish */
function playThrough(s: ReturnType<typeof setup>, mode: Mode | undefined, seed: number) {
  let world: World | null = null;
  playRun(seed, createRng(900 + seed), CAREFUL, {
    difficulty: 'hard',
    meta: metaOf3d(s.save.data),
    ...(mode ? { mode } : { untilWave: 9 }),
    maxTime: 900,
    events: (events, w) => {
      if (!w.bank) {
        w.bank = newBank(s.save.data);
        s.tracker.reset(w);
      }
      world = w;
      s.tracker.frame(w);
      for (const e of events) if (e.t === 'waveClear') s.tracker.bank(w, e.wave + 1);
    },
  });
  return world!;
}

const snapshot = (d: SaveData): SaveData => JSON.parse(JSON.stringify(d)) as SaveData;

describe('3D tracker: mode runs', { timeout: 300_000 }, () => {
  it('a Boss Rush through bosses never beaten before: coins, a wooden chest, the best, and nothing else', () => {
    const s = setup();
    const before = snapshot(s.save.data);
    const score = progressScore(s.save.data).total;
    const w = playThrough(s, 'bossrush', 3);
    expect(w.phase).toBe('over');
    expect(w.rush!.beaten).toBeGreaterThanOrEqual(3);
    const r = s.tracker.finish(w);
    const d = s.save.data;
    expect(r.mode!.result).toMatchObject({ mode: 'bossrush', score: w.rush!.beaten, over: true });
    expect(r.newBest).toBe(true);
    expect(r.chest).toBe('wood');
    expect(r.coins).toBe(w.run.coins);
    expect([r.feats, r.records, r.dailyChest, r.wave]).toEqual([[], [], false, 0]);
    // the save: these and only these
    expect(d.coins).toBe(before.coins + w.run.coins);
    expect(d.arsenal.chests).toEqual([...before.arsenal.chests, 'wood']);
    expect(d.arsenal.modes).toEqual({ blitz: 0, rush: w.rush!.beaten, rushTime: r.mode!.result.time, chestDay: todayKey(), chestsUsed: 1 });
    const rest = (x: SaveData) => ({ ...x, coins: 0, arsenal: { ...x.arsenal, chests: [], runChest: 0, modes: null } });
    expect(rest(d)).toEqual(rest(before));
    expect(d.runs).toBe(12);
    expect(d.best).toBe(9);
    expect(d.bosses).toEqual(before.bosses);
    expect(d.chapter).toBe(1);
    expect(d.feats).toEqual(before.feats);
    expect(d.arsenal.reveals).toEqual([]);
    expect(Object.values(d.arsenal.weapons).filter((x) => x.owned).length).toBe(1);
    expect(d.dailyStreak).toBe(3);
    expect(progressScore(d).total).toBe(score);
    expect(s.feats).toEqual([]);
    // banking again after the end (the page hidden under the result card) changes nothing
    const after = JSON.stringify(d);
    s.tracker.bank(w);
    expect(JSON.stringify(s.save.data)).toBe(after);
  });

  it('a Blitz: the same; a quit (banked, never finished) earns its coins and no chest or best', () => {
    const s = setup();
    const before = snapshot(s.save.data);
    const w = playThrough(s, 'blitz', 4);
    const r = s.tracker.finish(w);
    expect(r.mode!.result).toEqual({ mode: 'blitz', score: w.blitz!.score, time: 0, over: true });
    expect(r.headshots).toBe(w.blitz!.heads);
    expect(r.chest).toBe('wood');
    const d = s.save.data;
    expect(d.coins).toBe(before.coins + w.run.coins);
    expect(d.arsenal.modes.blitz).toBe(w.blitz!.score);
    expect([d.runs, d.best, d.chapter, d.dailyStreak]).toEqual([12, 9, 1, 3]);
    expect(d.records).toEqual(before.records);
    expect(d.feats).toEqual(before.feats);

    // a quit: the pause menu banks and leaves
    const q = setup();
    let seen: World | null = null;
    playRun(5, createRng(905), CAREFUL, {
      difficulty: 'hard',
      meta: metaOf3d(q.save.data),
      mode: 'blitz',
      maxTime: 25,
      each: (x) => {
        if (!x.bank) {
          x.bank = newBank(q.save.data);
          q.tracker.reset(x);
        }
        seen = x;
        q.tracker.frame(x);
      },
    });
    const half = seen as World | null;
    expect(half!.phase).toBe('play');
    expect(half!.run.coins).toBeGreaterThan(0);
    q.tracker.bank(half!);
    expect(q.save.data.coins).toBe(1000 + half!.run.coins);
    expect(q.save.data.arsenal.chests).toEqual([]);
    expect(q.save.data.arsenal.modes).toEqual({ blitz: 0, rush: 0, rushTime: 0, chestDay: '', chestsUsed: 0 });
    expect(q.save.data.runs).toBe(12);
  });

  it('an ordinary run through the same tracker still counts: a run, the best wave, the first boss reward', () => {
    const s = setup((d) => {
      d.bosses[0] = 0;
    });
    const w = playThrough(s, undefined, 6);
    expect(w.mode).toBeNull();
    s.tracker.bank(w);
    const d = s.save.data;
    expect(d.runs).toBe(13);
    expect(d.best).toBeGreaterThanOrEqual(9);
    expect(d.bosses[0]).toBe(1);
    expect(d.arsenal.chests).toContain('boss');
    expect(d.arsenal.modes).toEqual({ blitz: 0, rush: 0, rushTime: 0, chestDay: '', chestsUsed: 0 });
  });
});
