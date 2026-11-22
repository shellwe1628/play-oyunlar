/**
 * What a run writes to the save, exactly as the 2D GameScene does it (bank / finish): the run is
 * counted with its first arrow, coins and the best wave are banked as deltas at every wave clear,
 * on pause, on hide, on quit and at death; records, boss knockouts and achievements with them;
 * the daily challenge at the end. All rules are the game's (sim/meta, sim/progress). The 3D
 * build's rewards (sim/rewards): a run-end chest at death, a boss chest (and weapon) for each
 * chapter boss beaten the first time, a gold chest for the daily goal instead of its coins.
 *
 * A mode run (Blitz, Boss Rush: `w.mode`) writes only what sim/modes.ts allows: its knockout coins
 * as it goes (`bankMode`) and, when it ends by its own rule, a run chest and a personal best
 * (`finishMode`). It is never counted as a run and touches no wave, chapter, record, boss count,
 * achievement, rank or daily streak.
 */
import type { ChestKind } from '@sim/arsenal';
import { chapterStart, stageOf } from '@sim/chapters';
import { bankProgress, bankStart, runOutcome } from '@sim/meta';
import { bankMode, finishMode, modeChestsLeft, modeResult, type ModeOutcome } from '@sim/modes';
import { bankRecords, FEATS, unlockFeats } from '@sim/progress';
import { bankDailyChest, grantFirstBossRewards, grantRunChest } from '@sim/rewards';
import { BOSS_KINDS, reachedWave, summarize, type World } from '@sim/world';
import type { Game } from '../contract';
import { todayKey } from './save';

const FEAT_COINS = new Map(FEATS.map((f) => [f.id, f.coins]));

/** An achievement's toast line: its name and the coins it paid (the run's toasts and the menu's). */
export function featLine(t: (key: string, p?: Record<string, string | number>) => string, id: string): string {
  const coins = FEAT_COINS.get(id);
  return coins ? `${t(`feat.${id}.name`)} · +${coins}` : t(`feat.${id}.name`);
}

/** What the result screen shows (the 2D `RunResult`). */
export interface RunResult {
  wave: number;
  coins: number;
  kos: number;
  headshots: number;
  best: number;
  newBest: boolean;
  daily: boolean;
  dailyKey: string;
  chapter: number;
  stage: number;
  feats: string[];
  records: string[];
  /** the daily goal was met by this run: a gold chest was queued (the 3D build's daily reward) */
  dailyChest: boolean;
  dailyStreak: number;
  startRank: number;
  /** the bests of this run (the 3D result already showed them) */
  streakBest: number;
  chainBest: number;
  /** the run-end chest this run queued (the result card offers to open it), null for none */
  chest: ChestKind | null;
  /** a mode run (Blitz, Boss Rush): its score and best; null for a run of chapters */
  mode: ModeOutcome | null;
  /** Boss Rush lost to a boss: its name key (`boss.<kind>`); null otherwise */
  stoppedBy: string | null;
  /** a mode run that earned no chest because the day's mode chests are taken */
  chestsDone: boolean;
}

export interface Tracker {
  /** a new world: forget the old run's records */
  reset(w: World): void;
  /** every frame: count the run once it has left the title */
  frame(w: World): void;
  /** write what the run has earned so far */
  bank(w: World, reached?: number): void;
  /** the run is over: bank everything, the daily challenge, and build the result */
  finish(w: World): RunResult;
  /** the ended run was revived (rewarded): it banks again as it goes, keeping this run's records */
  revive(): void;
}

export function createTracker(game: Game, onFeat: (id: string, coins: number) => void): Tracker {
  const records = new Set<string>();
  let finished = false;

  function bank(w: World, reached = reachedWave(w)): void {
    const b = w.bank;
    if (b && w.mode) {
      // a mode run: its coins, nothing else (and no write when nothing was earned since the last one)
      if (w.run.coins > b.coins) game.save.update((d) => bankMode(d, b, w));
      return;
    }
    if (!b || !b.started) return;
    const coins = w.run.coins;
    const sum = summarize(w, game.daily);
    let fresh: string[] = [];
    game.save.update((d) => {
      bankProgress(d, b, reached, coins);
      const before = [...d.bosses];
      for (const r of bankRecords(d, b, sum, todayKey())) records.add(r);
      // the first knockout of a chapter's boss: a boss chest, its weapon, the sky boss's celestial look
      grantFirstBossRewards(d, before);
      fresh = unlockFeats(d, sum, b);
    });
    for (const id of fresh) onFeat(id, FEATS.find((f) => f.id === id)?.coins ?? 0);
  }

  /** A mode run ended by its own rule: its coins, its chest, its best (sim/modes.ts `finishMode`). */
  function finishModeRun(w: World): RunResult {
    const b = w.bank;
    const key = todayKey();
    const done: { out: ModeOutcome | null; chestsDone: boolean } = { out: null, chestsDone: false };
    if (b) {
      game.save.update((d) => {
        done.out = finishMode(d, b, w, key);
        done.chestsDone = b.chest === null && w.run.shots > 0 && modeChestsLeft(d, key) === 0;
      });
    }
    const save = game.save.data;
    const r = modeResult(w);
    // a test run (no bank) shows its score against the saved best, and writes nothing
    const m = save.arsenal.modes;
    const shown: ModeOutcome | null = done.out ?? (r ? { result: r, best: r.mode === 'blitz' ? m.blitz : m.rush, bestTime: r.mode === 'blitz' ? 0 : m.rushTime, newBest: false, chest: null } : null);
    const lost = w.rush && !w.player.alive ? BOSS_KINDS[w.rush.boss] : undefined;
    return {
      wave: 0,
      coins: w.run.coins,
      kos: w.run.kos,
      headshots: w.blitz ? w.blitz.heads : w.run.headshots,
      best: shown?.best ?? 0,
      newBest: shown?.newBest ?? false,
      daily: false,
      dailyKey: key,
      chapter: 0,
      stage: 0,
      feats: [],
      records: [],
      dailyChest: false,
      dailyStreak: 0,
      startRank: b?.startRank ?? save.rank,
      streakBest: w.run.streakBest,
      chainBest: w.run.chainBest,
      chest: b?.chest ?? null,
      mode: shown,
      stoppedBy: lost ? `boss.${lost}` : null,
      chestsDone: done.chestsDone,
    };
  }

  return {
    reset() {
      records.clear();
      finished = false;
    },
    frame(w) {
      const b = w.bank;
      // (a mode run is not counted as a run)
      if (b && !b.started && w.phase !== 'title' && !w.mode) game.save.update((d) => bankStart(d, b));
    },
    bank(w, reached) {
      if (!finished) bank(w, reached);
    },
    revive() {
      finished = false;
    },
    finish(w) {
      finished = true;
      if (w.mode) return finishModeRun(w);
      bank(w, w.wave);
      const key = todayKey();
      let dailyChest = false;
      let dailyStreak = 0;
      const b = w.bank;
      if (b) {
        game.save.update((d) => {
          // the run-end chest: once per run (a revived run that gets further upgrades it, RunBank.chest),
          // and only for a run that played: an arrow fired or a wave cleared
          if (w.run.shots > 0 || w.wave > chapterStart(w.startChapter)) grantRunChest(d, b, w.wave);
          if (!game.daily) return;
          dailyChest = bankDailyChest(d, key, w.wave);
          dailyStreak = d.dailyStreak;
          if (dailyChest) unlockFeats(d, null, b);
        });
      }
      const save = game.save.data;
      const outcome = b ? runOutcome(save, b, w.wave) : { best: save.best, newBest: false };
      const p = stageOf(w.wave);
      return {
        wave: w.wave,
        coins: w.run.coins,
        kos: w.run.kos,
        headshots: w.run.headshots,
        best: outcome.best,
        newBest: outcome.newBest,
        daily: game.daily,
        dailyKey: key,
        chapter: p.chapter,
        stage: p.stage,
        feats: [...(b?.feats ?? [])],
        records: [...records],
        dailyChest,
        dailyStreak,
        startRank: b?.startRank ?? save.rank,
        streakBest: w.run.streakBest,
        chainBest: w.run.chainBest,
        chest: b?.chest ?? null,
        mode: null,
        stoppedBy: null,
        chestsDone: false,
      };
    },
  };
}
