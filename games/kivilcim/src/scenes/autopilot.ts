import type { Mode } from './GameScene';
import type { RunSim } from '../sim/run';
import { K_REF, prepare, solve } from '../sim/solver';
import type { Track } from '../sim/track';

/**
 * The test hook's autopilot (`__OYUN__.act('autopilot', true)`, for the e2e tests and the
 * screenshot tools): it feeds the solver's plan to the run as the hold input. Web builds only:
 * GameScene creates it only when STORE_BUILD is false, so this module (and the solver) is not
 * in the App Store / Google Play bundles. Players never reach it.
 */
export class Autopilot {
  on = false;
  private plan: Uint8Array | null = null;
  private planEnd = 0;
  private lastSwitch = 0;

  /** A new track: forget every plan. */
  newTrack(): void {
    this.plan = null;
    this.planEnd = 0;
    this.lastSwitch = 0;
  }

  /** A new run on the same track: a level keeps its one plan, endless plans again. */
  newRun(mode: Mode): void {
    if (mode !== 'level') {
      this.plan = null;
      this.planEnd = 0;
    }
    this.lastSwitch = 0;
  }

  /** Forget the plan (endless and daily plan again from where the spark is). */
  drop(): void {
    this.plan = null;
  }

  /** The hold state for this tick. */
  held(sim: RunSim, track: Track, mode: Mode): boolean {
    this.ensure(sim, track, mode);
    const held = this.plan ? this.plan[sim.tick] === 1 : false;
    if (sim.tick > 0 && this.plan && this.plan[sim.tick] !== this.plan[sim.tick - 1]) this.lastSwitch = sim.tick;
    return held;
  }

  /**
   * Levels: one plan for the whole level (with its gems). Endless and daily: plan 6 s ahead from
   * where the spark is, and re-plan every 3 s.
   */
  ensure(sim: RunSim, track: Track, mode: Mode): void {
    if (mode === 'level') {
      if (!this.plan) {
        const p = prepare(track);
        const plan = solve(p, { minClear: 6, minHoldTicks: K_REF, gems: true }) ?? solve(p, { minClear: 0, minHoldTicks: K_REF });
        this.plan = plan ? plan.held : null;
      }
      return;
    }
    if (this.plan && sim.tick < this.planEnd - 360) return;
    const from = sim.tick;
    const held: 0 | 1 = (sim.dir === 1) !== sim.flipped ? 1 : 0;
    const p = prepare(track, { fromTick: from, toTick: from + 720 });
    const since = from === 0 ? K_REF : Math.max(1, from - this.lastSwitch);
    const opts = { minHoldTicks: K_REF, from: { tick: from, x: sim.x, held, since } };
    const plan = solve(p, { ...opts, minClear: 4 }) ?? solve(p, { ...opts, minClear: 0 });
    if (plan) {
      this.plan = plan.held;
      this.planEnd = p.tl.n;
    } else {
      this.plan = null;
      this.planEnd = from + 1;
    }
  }
}
