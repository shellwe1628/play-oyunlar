/**
 * The run-end chest's rule against a quick loss: a silver or gold run chest needs at least
 * RUN_CHEST_MIN_STAGES stages cleared in that run; with fewer the chest is wooden. Before it,
 * "start at chapter 4, loose one arrow, fall" queued a gold chest every few seconds. The rule is
 * `runChest(reached, cleared)` (sim/chests.ts); the 3D build's tracker and the economy model both
 * use it. "No shots, no chest" and ruling T (none on quit) stay as they were.
 */
import { createRng, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import type { Game } from '../../../../apps/okcu-3d/src/contract';
import { createTracker } from '../../../../apps/okcu-3d/src/ui/progress';
import { openSave } from '../../../../apps/okcu-3d/src/ui/save';
import { CAREFUL, playRun } from '../../src/sim/aimbot';
import { chapterStart } from '../../src/sim/chapters';
import { CHEST_ODDS, RUN_CHEST_MIN_STAGES, runChest } from '../../src/sim/chests';
import { simulateEconomy, type EconomyRun } from '../../src/sim/economy';
import { freshSave, newBank, NO_META, type MetaLevels } from '../../src/sim/meta';
import { grantRunChest } from '../../src/sim/rewards';
import { advance, createWorld, pickCard, shoot, stagesCleared, takeEvents, type World } from '../../src/sim/world';

describe('run chest: silver and gold need stages cleared', () => {
  it('fewer than three stages cleared in the run: wooden, whatever wave was reached', () => {
    expect(RUN_CHEST_MIN_STAGES).toBe(3);
    for (const reached of [1, 8, 22, 43, 99]) {
      for (const cleared of [0, 1, 2]) expect(runChest(reached, cleared), `wave ${reached}, ${cleared} cleared`).toBe('wood');
    }
    // three or more: the tier of the wave reached, as before
    expect(runChest(7, 6)).toBe('wood');
    expect(runChest(8, 3)).toBe('silver');
    expect(runChest(21, 20)).toBe('silver');
    expect(runChest(22, 3)).toBe('gold');
    expect(runChest(25, 3)).toBe('gold');
    expect(runChest(99, 57)).toBe('gold');
  });

  it('grantRunChest takes the stages cleared; a revived run that then clears enough upgrades its wooden chest', () => {
    const s = freshSave();
    const bank = newBank(s);
    expect(grantRunChest(s, bank, 22, 0)).toBe('wood');
    expect(s.arsenal.chests).toEqual(['wood']);
    // revived, still short of three stages: nothing changes
    expect(grantRunChest(s, bank, 24, 2)).toBeNull();
    expect(s.arsenal.chests).toEqual(['wood']);
    // revived and three stages cleared: that chest becomes the gold one, no second chest
    expect(grantRunChest(s, bank, 25, 3)).toBe('gold');
    expect(s.arsenal.chests).toEqual(['gold']);
  });

  it('stagesCleared counts the stages cleared since the run started, from any chapter', () => {
    const a = createWorld({ seed: 3, difficulty: 'hard', startChapter: 3 });
    expect(a.wave).toBe(chapterStart(3));
    expect(stagesCleared(a)).toBe(0);
    a.wave = chapterStart(3) + 2;
    expect(stagesCleared(a)).toBe(2);
    a.phase = 'clear';
    expect(stagesCleared(a)).toBe(3);
    const b = createWorld({ seed: 3, difficulty: 'hard' });
    b.wave = 9;
    b.phase = 'over';
    expect(stagesCleared(b)).toBe(8);
    // a mode world clears no stage of any chapter
    const m = createWorld({ seed: 3, difficulty: 'hard', mode: 'bossrush' });
    expect(stagesCleared(m)).toBe(0);
  });
});

describe('run chest through the 3D tracker', { timeout: 300_000 }, () => {
  const setup = () => {
    const save = openSave(memoryStorage());
    save.update((d) => {
      d.chapter = 5;
      d.runs = 20;
    });
    const game = { save, daily: false } as unknown as Game;
    return { save, tracker: createTracker(game, () => undefined) };
  };
  const weak: MetaLevels = { ...NO_META, weapon: 'bow', wlevel: 1 };
  const strong: MetaLevels = { ...NO_META, weapon: 'bow', wlevel: 20, hp: 12 };
  /** let the archers finish a player who has stopped shooting */
  const fall = (w: World): void => {
    for (let t = 0; t < 600 && w.phase !== 'over'; t += 1 / 30) {
      advance(w, 1 / 30);
      takeEvents(w);
    }
    expect(w.phase).toBe('over');
  };

  it('a chapter-4 start, one arrow, a fall: a wooden chest (it was gold)', () => {
    const s = setup();
    const w = createWorld({ seed: 11, meta: weak, difficulty: 'hard', startChapter: 3 });
    w.bank = newBank(s.save.data);
    s.tracker.reset(w);
    expect(shoot(w, -1.4, 0.2)).toBe(true);
    s.tracker.frame(w);
    fall(w);
    expect(w.wave).toBe(chapterStart(3));
    expect(w.run.shots).toBe(1);
    const r = s.tracker.finish(w);
    expect(r.chest).toBe('wood');
    expect(s.save.data.arsenal.chests).toEqual(['wood']);
    // the tier that wave alone would give, to show what the rule stops
    expect(runChest(w.wave)).toBe('gold');
  });

  it('no arrow at all: still no chest', () => {
    const s = setup();
    const w = createWorld({ seed: 12, meta: weak, difficulty: 'hard', startChapter: 3 });
    w.bank = newBank(s.save.data);
    s.tracker.reset(w);
    w.phase = 'play';
    fall(w);
    expect(w.run.shots).toBe(0);
    expect(s.tracker.finish(w).chest).toBeNull();
    expect(s.save.data.arsenal.chests).toEqual([]);
  });

  it('three stages cleared from a chapter-4 start: gold, as before; two: wooden', () => {
    for (const [stages, want] of [[3, 'gold'], [2, 'wood']] as const) {
      const s = setup();
      let world: World | null = null;
      playRun(21, createRng(921), CAREFUL, {
        difficulty: 'hard',
        meta: strong,
        startChapter: 3,
        untilWave: chapterStart(3) + stages,
        god: true,
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
      const w = world as World | null;
      expect(w, `${stages} stages`).not.toBeNull();
      expect(stagesCleared(w!)).toBe(stages);
      // the run ends there: the player (no longer kept alive) falls on the next stage
      w!.player.maxHp = w!.stats.maxHp;
      w!.player.hp = 1;
      for (let t = 0; t < 900 && w!.phase !== 'over'; t += 1 / 30) {
        if (w!.phase === 'cards') pickCard(w!, 0);
        w!.player.hp = Math.min(w!.player.hp, 1);
        advance(w!, 1 / 30);
        takeEvents(w!);
      }
      expect(w!.phase).toBe('over');
      expect(stagesCleared(w!)).toBe(stages);
      expect(s.tracker.finish(w!).chest, `${stages} stages cleared`).toBe(want);
      expect(s.save.data.arsenal.chests).toContain(want);
    }
  });
});

describe('run chest in the economy model', () => {
  /** one run with nothing but its chest: what the chests of the whole simulation paid */
  const chestIncome = (run: EconomyRun): number =>
    simulateEconomy({ ads: false, targetLevel: 20, maxHours: 0.001, play: () => run }).income.chests;

  it('a run that cleared fewer than three stages earns a wooden chest in the model too', () => {
    // (chapter 0: no boss chests in the way; no coins: nothing to buy more chests with)
    const far = { reached: 22, chapter: 0, coins: 0, time: 10 };
    const free = CHEST_ODDS.wood.coins[1];
    // by default a run is taken to have started at wave 1 (the economy's runs do): gold
    expect(chestIncome(far)).toBeGreaterThanOrEqual(CHEST_ODDS.gold.coins[0]);
    expect(chestIncome({ ...far, cleared: 3 })).toBeGreaterThanOrEqual(CHEST_ODDS.gold.coins[0]);
    // the quick loss from a late chapter: the free chest and a wooden run chest, no more
    expect(chestIncome({ ...far, cleared: 0 })).toBeLessThanOrEqual(free + CHEST_ODDS.wood.coins[1]);
    expect(chestIncome({ ...far, cleared: 2 })).toBeLessThanOrEqual(free + CHEST_ODDS.wood.coins[1]);
  });
});
