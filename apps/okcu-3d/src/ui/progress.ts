/**
 * What a run writes to the save, exactly as the 2D GameScene does it (bank / finish): the run is
 * counted with its first arrow, coins and the best wave are banked as deltas at every wave clear,
 * on pause, on hide, on quit and at death; records, boss knockouts and achievements with them;
 * the daily challenge at the end. All rules are the game's (sim/meta, sim/progress).
 */
import { stageOf } from '@sim/chapters';
import { bankProgress, bankStart, runOutcome } from '@sim/meta';
import { bankDailyChallenge, bankRecords, FEATS, unlockFeats } from '@sim/progress';
import { reachedWave, summarize, type World } from '@sim/world';
import type { Game } from '../contract';
import { todayKey } from './save';

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
  dailyCoins: number;
  dailyStreak: number;
  startRank: number;
  /** the bests of this run (the 3D result already showed them) */
  streakBest: number;
  chainBest: number;
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
}

export function createTracker(game: Game, onFeat: (id: string, coins: number) => void): Tracker {
  const records = new Set<string>();
  let finished = false;

  function bank(w: World, reached = reachedWave(w)): void {
    const b = w.bank;
    if (!b || !b.started) return;
    const coins = w.run.coins;
    const sum = summarize(w, game.daily);
    let fresh: string[] = [];
    game.save.update((d) => {
      bankProgress(d, b, reached, coins);
      for (const r of bankRecords(d, b, sum, todayKey())) records.add(r);
      fresh = unlockFeats(d, sum, b);
    });
    for (const id of fresh) onFeat(id, FEATS.find((f) => f.id === id)?.coins ?? 0);
  }

  return {
    reset() {
      records.clear();
      finished = false;
    },
    frame(w) {
      const b = w.bank;
      if (b && !b.started && w.phase !== 'title') game.save.update((d) => bankStart(d, b));
    },
    bank(w, reached) {
      if (!finished) bank(w, reached);
    },
    finish(w) {
      finished = true;
      bank(w, w.wave);
      const key = todayKey();
      let dailyCoins = 0;
      let dailyStreak = 0;
      const b = w.bank;
      if (game.daily && b) {
        game.save.update((d) => {
          dailyCoins = bankDailyChallenge(d, key, w.wave);
          dailyStreak = d.dailyStreak;
          if (dailyCoins > 0) unlockFeats(d, null, b);
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
        dailyCoins,
        dailyStreak,
        startRank: b?.startRank ?? save.rank,
        streakBest: w.run.streakBest,
        chainBest: w.run.chainBest,
      };
    },
  };
}
