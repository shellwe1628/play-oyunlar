/**
 * Scripted player for the pacing test (GAME.md): tap 5 times per second, tap every glint after a
 * 0.6 s reaction, buy the cheapest useful upgrade whenever it is affordable, and dig the shallowest
 * layer that still misses a fossil at 1 in 2,000 or more common (otherwise the deepest unlocked),
 * giving up on a set 4 minutes after the next layer has opened.
 * "Useful" = changes active play: pick, luck, assistant (the offline cap is not useful here).
 */
import { at, UPGRADE_ORDER, type UpgradeId } from '../../src/sim/data';
import { DigSim } from '../../src/sim/dig';
import { layerFossils } from '../../src/sim/loot';

export interface PacingMetrics {
  seed: number;
  l1SetAt: number | null;
  unlockAt: [number | null, number | null, number | null, number | null];
  first10kAt: number | null;
  first10kOdds: number | null;
  /** Longest stretch in the first 20 minutes without a new fossil, a fusion or a purchase. */
  maxGap: number;
  maxGapAt: number;
  powerAt: Record<number, number>;
  levelsAt20: Record<UpgradeId, number>;
  rollsAt20: number;
  timeline: string[];
}

const TAPS_PER_SECOND = 5;
const USEFUL: readonly UpgradeId[] = UPGRADE_ORDER.filter((id) => id !== 'offline');

/** Seconds a player keeps finishing a set after the next layer has opened. */
const SET_PATIENCE = 240;

function targetLayer(sim: DigSim, t: number, unlockAt: readonly (number | null)[]): number {
  for (let l = 0; l <= sim.unlocked; l++) {
    const deeperOpenFor = l < sim.unlocked ? t - (unlockAt[l + 1] ?? t) : 0;
    if (deeperOpenFor > SET_PATIENCE) continue;
    if (layerFossils(l).some((f) => f.odds <= 2000 && !sim.discovered(f.id))) return l;
  }
  return sim.unlocked;
}

export function runPolicy(seed: number, minutes = 40): PacingMetrics {
  const sim = new DigSim(seed);
  const dt = 1 / TAPS_PER_SECOND;
  const m: PacingMetrics = {
    seed,
    l1SetAt: null,
    unlockAt: [0, null, null, null],
    first10kAt: null,
    first10kOdds: null,
    maxGap: 0,
    maxGapAt: 0,
    powerAt: {},
    levelsAt20: { pick: 0, luck: 0, assistant: 0, offline: 0 },
    rollsAt20: 0,
    timeline: [],
  };
  let lastEvent = 0;
  let glintSeenAt = -1;
  const steps = Math.round(minutes * 60 * TAPS_PER_SECOND);
  for (let i = 1; i <= steps; i++) {
    const t = i * dt;
    const finds = [];
    const r = sim.tap();
    if (r.find) finds.push(r.find);
    const tk = sim.tick(dt);
    finds.push(...tk.finds);
    if (sim.glint) {
      if (glintSeenAt < 0) glintSeenAt = t;
      if (t - glintSeenAt >= 0.6) {
        const g = sim.tapGlint();
        if (g) finds.push(g);
        glintSeenAt = -1;
      }
    } else glintSeenAt = -1;

    let event = false;
    for (const f of finds) {
      if (f.isNew || f.fusions > 0) event = true;
      if (f.setCompleted === 0 && m.l1SetAt === null) m.l1SetAt = t;
      if (f.fossil.odds >= 10_000 && m.first10kAt === null) {
        m.first10kAt = t;
        m.first10kOdds = f.fossil.odds;
      }
    }
    for (let l = 1; l < 4; l++) if (m.unlockAt[l] === null && sim.unlocked >= l) {
      m.unlockAt[l] = t;
      m.timeline.push(`${(t / 60).toFixed(1)}m unlock L${l + 1} power ${Math.round(sim.digPower)}`);
    }
    // buy the cheapest useful upgrade while affordable
    for (;;) {
      let best: UpgradeId | null = null;
      for (const id of USEFUL) {
        const c = sim.upgradeCost(id);
        if (c === null) continue;
        if (best === null || c < (sim.upgradeCost(best) ?? Infinity)) best = id;
      }
      if (best === null || !sim.buy(best)) break;
      event = true;
    }
    const want = targetLayer(sim, t, m.unlockAt);
    if (want !== sim.layer) {
      sim.travel(want);
      m.timeline.push(`${(t / 60).toFixed(1)}m travel L${want + 1}`);
    }
    if (event) lastEvent = t;
    if (t <= 20 * 60 && t - lastEvent > m.maxGap) {
      m.maxGap = t - lastEvent;
      m.maxGapAt = t;
    }
    if (i % (60 * TAPS_PER_SECOND) === 0) {
      m.powerAt[Math.round(t / 60)] = Math.round(sim.digPower);
      m.timeline.push(
        `${Math.round(t / 60)}m L${sim.layer + 1} P ${sim.digPower.toExponential(2)} hp ${sim.blockHp.toExponential(2)} taps/blk ${(sim.blockHp / sim.digPower).toFixed(1)} luck ${sim.baseLuck.toFixed(2)} dust ${Math.round(sim.dust)} rolls ${sim.stats.rolls} lv ${sim.level('pick')}/${sim.level('luck')}/${sim.level('assistant')}`,
      );
    }
    if (Math.abs(t - 20 * 60) < dt / 2) {
      m.levelsAt20 = { pick: sim.level('pick'), luck: sim.level('luck'), assistant: sim.level('assistant'), offline: sim.level('offline') };
      m.rollsAt20 = sim.stats.rolls;
    }
  }
  return m;
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? at(s, (n - 1) / 2) : (at(s, n / 2 - 1) + at(s, n / 2)) / 2;
}
