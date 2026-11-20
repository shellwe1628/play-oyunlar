/**
 * Chapters 5 (Ember Caldera) and 6 (Sky Citadel): their stages, mechanics, bosses, the
 * difficulty curve across them, the longer progression they brought, and old saves.
 */
import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { createRng } from '@oyun/core/pure';
import { repairSave, saveOptions } from '../../src/save';
import { CAREFUL, planShot, playRun } from '../../src/sim/aimbot';
import { BOW_MAX, bowCost, bowDamage } from '../../src/sim/bow';
import { HARD_BOW_POW } from '../../src/sim/cards';
import { CHAPTER_DEFS, CHAPTERS, chapterStart, ENDLESS_WAVE, levelOf, stageOf } from '../../src/sim/chapters';
import { cosmeticById, freshSave, isUnlocked, NO_META, UPGRADES } from '../../src/sim/meta';
import { bankRecords, FEATS, progressScore, RANKS, rankOf, unlockFeats, type RunSummary } from '../../src/sim/progress';
import { PT } from '../../src/sim/ragdoll';
import { PLAYER_X } from '../../src/sim/tuning';
import { enemyDamageMul, enemyHp, HARD_LATE_LEVEL } from '../../src/sim/waves';
import { advance, BOSS_KINDS, canShoot, createWorld, shoot, ERUPTION_PHASE1, jumpToWave, takeEvents, type GameEvent, type World } from '../../src/sim/world';

function run(w: World, seconds: number): GameEvent[] {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    advance(w, 1 / 60);
    all.push(...takeEvents(w));
  }
  return all;
}
const of = <T extends GameEvent['t']>(ev: GameEvent[], t: T) => ev.filter((e) => e.t === t) as Extract<GameEvent, { t: T }>[];

/** Nobody shoots (the boss's specials still run) and the player cannot die. */
function hold(w: World): void {
  for (const e of w.enemies) e.timer = 999;
  w.player.hp = w.player.maxHp = 1e9;
}

const summary = (over: Partial<RunSummary> = {}): RunSummary => ({
  reached: 1,
  kos: 0,
  headChain: 0,
  streak: 0,
  multi: 0,
  focusUses: 0,
  bossKills: [],
  chapterStage: Array<number>(CHAPTERS).fill(0),
  bonusGold: 0,
  barrelBest: 0,
  ropeDrops: 0,
  endless: 0,
  daily: false,
  ...over,
});

describe('chapters 5 and 6', () => {
  it('six chapters, endless after the last; the bosses are in chapter order', () => {
    expect(CHAPTERS).toBe(6);
    expect(ENDLESS_WAVE).toBe(43);
    expect(chapterStart(4)).toBe(29);
    expect(chapterStart(5)).toBe(36);
    expect(chapterStart(6)).toBe(ENDLESS_WAVE);
    expect(BOSS_KINDS).toEqual(CHAPTER_DEFS.map((c) => c.boss));
  });

  it('caldera ledges rise and sink and carry their archers with them', () => {
    const w = createWorld({ seed: 4, difficulty: 'hard' });
    jumpToWave(w, 29);
    hold(w);
    const m = w.movers.find((q) => q.kind === 'bob')!;
    expect(m).toBeDefined();
    const L = w.ledges[m.index]!;
    const rider = w.enemies.find((e) => e.ledge === m.index)!;
    const ys: number[] = [];
    for (let i = 0; i < 240; i++) {
      run(w, 1 / 60);
      ys.push(L.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(m.amp);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(2 * m.amp + 1e-6);
    // the rider stands on it the whole time (feet within a few px of the ledge top)
    const feet = Math.max(rider.body.y[PT.footB]!, rider.body.y[PT.footF]!);
    expect(Math.abs(feet - L.y)).toBeLessThan(12);
    expect(rider.alive).toBe(true);
  });

  it('citadel gusts turn the wind around on time, and only while the wave is played', () => {
    const w = createWorld({ seed: 9, difficulty: 'hard' });
    jumpToWave(w, 36);
    hold(w);
    expect(w.wind).not.toBe(0);
    expect(w.gustEvery).toBe(6);
    const before = Math.sign(w.wind);
    const ev = run(w, 6.2);
    const gusts = of(ev, 'gust');
    expect(gusts.length).toBe(1);
    expect(Math.sign(w.wind)).toBe(-before);
    expect(gusts[0]!.by).toBe(-1);
    expect(of(run(w, 12.1), 'gust').length).toBe(2);
  });

  it('the cinder king erupts: lava rocks fall in a row over the player, one right on top', () => {
    const w = createWorld({ seed: 2, difficulty: 'hard' });
    jumpToWave(w, 35);
    hold(w);
    const boss = w.enemies.find((e) => e.type === 'boss')!;
    expect(boss.bossKind).toBe('magma');
    const ev = run(w, 4.7);
    const rocks = of(ev, 'eruption');
    expect(rocks.length).toBe(ERUPTION_PHASE1.length);
    expect(rocks.some((r) => Math.abs(r.x - PLAYER_X) < 30)).toBe(true);
    const bombs = w.arrows.filter((a) => a.active && a.kind === 'bomb' && a.owner === 'enemy');
    expect(bombs.length).toBe(ERUPTION_PHASE1.length);
    for (const b of bombs) expect(b.by).toBe(boss.id);
    // they land: on the player or the player's ledge (no rock is left hanging)
    const hp = w.player.hp;
    const later = run(w, 2.5);
    expect(of(later, 'bomb').length).toBeGreaterThanOrEqual(2);
    expect(w.player.hp).toBeLessThan(hp);
  });

  it('a lava rock can be shot out of the air', () => {
    const w = createWorld({ seed: 2, difficulty: 'hard' });
    jumpToWave(w, 35);
    hold(w);
    run(w, 4.7);
    const rng = createRng(5);
    let popped = 0;
    for (let i = 0; i < 150; i++) {
      // the careful bot leads the rock that falls on the player and shoots it
      if (canShoot(w)) {
        const plan = planShot(w, rng, CAREFUL);
        if (plan) shoot(w, plan.angle, plan.power);
      }
      popped += of(run(w, 1 / 60), 'bomb').filter((b) => b.popped).length;
    }
    expect(popped).toBeGreaterThanOrEqual(1);
  });

  it('the storm caller turns the wind every 6 s, harder in phase 2', () => {
    const w = createWorld({ seed: 3, difficulty: 'hard' });
    jumpToWave(w, 42);
    hold(w);
    const boss = w.enemies.find((e) => e.type === 'boss')!;
    expect(boss.bossKind).toBe('tempest');
    const w0 = Math.abs(w.wind);
    const g1 = of(run(w, 4.2), 'gust');
    expect(g1.length).toBe(1);
    expect(g1[0]!.by).toBe(boss.id);
    expect(Math.abs(w.wind)).toBe(w0);
    boss.bossPhase = 2;
    // the timer set after the first turn (6 s) runs out; the next one is set to 4 s
    const g2 = of(run(w, 6.0), 'gust');
    expect(g2.length).toBe(1);
    expect(Math.abs(w.wind)).toBeCloseTo(Math.min(320, w0 * 1.25), 6);
  });

  it('every stage of the new chapters spawns its enemies on distinct ledges, with no NaN after a while', () => {
    for (let wave = 29; wave <= 42; wave++) {
      const w = createWorld({ seed: wave, difficulty: 'hard' });
      jumpToWave(w, wave);
      hold(w);
      expect(new Set(w.enemies.map((e) => e.ledge)).size).toBe(w.enemies.length);
      run(w, 3);
      for (const e of w.enemies) expect(Number.isFinite(e.body.x[0]!) && Number.isFinite(e.body.y[0]!)).toBe(true);
      expect(stageOf(wave).chapter).toBe(wave < 36 ? 4 : 5);
    }
  });
});

describe("the 3D build's setting plays through", () => {
  it('hard: a careful scripted player kept alive clears chapters 5 and 6, bosses and bonus rounds included', () => {
    for (const chapter of [4, 5]) {
      const start = chapterStart(chapter);
      const r = playRun(21 + chapter, createRng(99 + chapter), CAREFUL, { startChapter: chapter, god: true, untilWave: start + 8, maxTime: 900, difficulty: 'hard', meta: { ...NO_META, bow: 15, hp: 8 } });
      expect(r.reached, `chapter ${chapter}`).toBeGreaterThanOrEqual(start + 8);
      expect(r.bosses).toBeGreaterThanOrEqual(1);
    }
  }, 300_000);
});

describe('the difficulty curve carries on smoothly', () => {
  it('levels rise every stage; the steps into and through chapters 5, 6 and endless are no bigger than a stage of chapter 4', () => {
    for (let w = 2; w <= 60; w++) {
      const d = levelOf(w) - levelOf(w - 1);
      expect(d).toBeGreaterThan(0);
      if (w >= 29) expect(d).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('hard: chapter 4 is unchanged, chapters 5 and 6 are tougher but not a wall', () => {
    // up to HARD_LATE_LEVEL the old ×1.2 growth
    expect(enemyHp('archer', 23, 'hard')).toBe(Math.round(40 * 1.3 * 1.2 ** 22));
    const ch4End = enemyHp('archer', levelOf(28), 'hard');
    const ch5End = enemyHp('archer', levelOf(35), 'hard');
    const ch6End = enemyHp('archer', levelOf(42), 'hard');
    expect(ch5End).toBeGreaterThan(ch4End);
    expect(ch6End).toBeGreaterThan(ch5End);
    expect(ch6End / ch4End).toBeLessThan(3);
    expect(enemyDamageMul(levelOf(42), 'hard') / enemyDamageMul(levelOf(28), 'hard')).toBeLessThan(1.5);
    // a +25 bow hits 1.3× as hard as a +20 one in hard
    expect((bowDamage(25) / bowDamage(20)) ** HARD_BOW_POW).toBeGreaterThan(1.29);
    expect(HARD_LATE_LEVEL).toBe(23);
  });
});

describe('longer progression', () => {
  it('more to buy: bow +25, health 12, coins 8', () => {
    expect(BOW_MAX).toBe(25);
    expect(UPGRADES.hp.max).toBe(12);
    expect(UPGRADES.coins.max).toBe(8);
    let total = 0;
    for (let l = 20; l < 25; l++) total += bowCost(l)!;
    expect(total).toBe(129406);
  });

  it('new achievements for the new bosses, all six, the forge and long streaks', () => {
    const ids = FEATS.map((f) => f.id);
    for (const id of ['boss5', 'boss6', 'allBosses', 'forge20', 'forge25', 'chain10', 'streak20']) expect(ids).toContain(id);
    const s = freshSave();
    s.bosses = [1, 1, 1, 1, 1, 0];
    expect(unlockFeats(s, null)).toEqual(expect.arrayContaining(['boss5']));
    expect(s.feats).not.toContain('allBosses');
    s.bosses[5] = 1;
    expect(unlockFeats(s, null)).toEqual(expect.arrayContaining(['boss6', 'allBosses']));
  });

  it('the ranks reach further: the top needs the new chapters', () => {
    const s = freshSave();
    s.bosses = [50, 1, 1, 1, 0, 0];
    s.bow.level = 20;
    s.best = 100;
    s.feats = FEATS.map((f) => f.id).filter((id) => !['boss5', 'boss6', 'allBosses', 'forge25'].includes(id));
    const old = progressScore(s).total;
    expect(rankOf(old)).toBeLessThan(RANKS.length - 1);
    s.bosses = [50, 1, 1, 1, 1, 1];
    s.bow.level = 25;
    s.feats = FEATS.map((f) => f.id);
    expect(progressScore(s).total).toBe(11700);
    expect(rankOf(progressScore(s).total)).toBe(RANKS.length - 1);
  });

  it('beating the new bosses is banked per chapter and opens their looks', () => {
    const s = freshSave();
    const bank = { coins: 0, startBest: 0, started: true, bosses: 0, feats: [], startRank: 0 };
    bankRecords(s, bank, summary({ reached: 43, bossKills: [{ kind: 4, time: 40 }, { kind: 5, time: 55 }], chapterStage: [0, 0, 0, 0, 8, 8] }), '2026-11-20');
    expect(s.bosses).toEqual([0, 0, 0, 0, 1, 1]);
    expect(s.chapter).toBe(6);
    expect(s.records.chapter[5]!.n).toBe(8);
    expect(s.records.bossTime[4]!.n).toBe(40);
    expect(isUnlocked(cosmeticById('ember'), s.best, s.runs, s.bosses)).toBe(true);
    expect(isUnlocked(cosmeticById('halo'), s.best, s.runs, s.bosses)).toBe(true);
  });
});

describe('old saves', () => {
  it('a save that had endless unlocked keeps everything and opens chapter 5 as its next step', () => {
    // a v3 save from the four-chapter build: endless reached, four-entry boss and record lists
    const rec = (n: number) => ({ n, date: '2026-11-01' });
    const old = {
      best: 37,
      coins: 1234,
      runs: 60,
      upgrades: { hp: 8, coins: 6, reroll: 1, starter: 1 },
      bow: { level: 14, heat: 0.3, tries: 40 },
      cosmetic: 'laurel',
      dailyDate: '',
      dailyBest: 0,
      dailyStreak: 0,
      dailyDone: '',
      chapter: 4,
      bosses: [9, 5, 3, 2],
      records: { chapter: [rec(8), rec(8), rec(8), rec(8)], bossTime: [rec(20), rec(30), rec(40), rec(50)], headChain: rec(6), streak: rec(12), runKos: rec(40), endless: rec(9) },
      feats: ['firstKo', 'boss1', 'boss2', 'boss3', 'boss4', 'endless'],
      rank: 8,
    };
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 3, data: old }) });
    const store = createSaveStore(saveOptions(storage, 'test'));
    // what the games do on open (games/okcu/src/save.ts gameSave, apps/okcu-3d/src/ui/save.ts openSave)
    const d = store.data;
    expect(store.status).not.toBe('reset');
    Object.assign(d, repairSave(d));
    expect([d.best, d.coins, d.runs, d.cosmetic, d.rank]).toEqual([37, 1234, 60, 'laurel', 8]);
    expect(d.upgrades).toEqual({ hp: 8, coins: 6, reroll: 1, starter: 1 });
    expect(d.bow).toEqual({ level: 14, heat: 0.3, tries: 40 });
    expect(d.bosses).toEqual([9, 5, 3, 2, 0, 0]);
    expect(d.records.chapter.map((r) => r.n)).toEqual([8, 8, 8, 8, 0, 0]);
    expect(d.records.bossTime.map((r) => r.n)).toEqual([20, 30, 40, 50, 0, 0]);
    expect(d.feats).toContain('endless');
    // the chapter select now offers chapters 1 … 5; chapter 5 starts at wave 29
    expect(d.chapter).toBe(4);
    expect(chapterStart(d.chapter)).toBe(29);
    expect(stageOf(chapterStart(d.chapter)).endless).toBe(false);
    // its old looks stay unlocked; the new ones wait for the new bosses (or upgrades left to buy)
    expect(isUnlocked(cosmeticById('laurel'), d.best, d.runs, d.bosses)).toBe(true);
    expect(isUnlocked(cosmeticById('ember'), d.best, d.runs, d.bosses)).toBe(false);
    expect(UPGRADES.hp.max - d.upgrades.hp).toBe(4);
  });
});
