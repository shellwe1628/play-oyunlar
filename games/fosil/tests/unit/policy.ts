/**
 * Scripted players for the pacing test (GAME.md).
 *
 * fast:   taps 5/s without pause, taps every glint after 0.6 s, buys the cheapest of
 *         pick/luck/assistant the moment it is affordable, finishes a layer's set up to 1 in 2,000
 *         but goes deeper 4 minutes after the next layer opens.
 * casual: taps 2.5/s in 7 s bursts with 3 s pauses (30 % idle), notices glints only while tapping
 *         (1.2 s reaction), looks at the upgrades every 5 s and buys the leftmost affordable one
 *         (not the best one), and travels to a new layer as soon as it opens.
 */
import { at, UPGRADE_ORDER, type UpgradeId } from '../../src/sim/data';
import { DigSim, type Find } from '../../src/sim/dig';
import { layerFossils } from '../../src/sim/loot';

export type Profile = 'fast' | 'casual';

export interface PacingMetrics {
  seed: number;
  profile: Profile;
  l1SetAt: number | null;
  unlockAt: [number | null, number | null, number | null, number | null];
  first10kAt: number | null;
  first10kOdds: number | null;
  /** Longest stretch in the first 20 minutes without a new fossil, a fusion or a purchase. */
  maxGap: number;
  maxGapAt: number;
  powerAt: Record<number, number>;
  levelsAt: Record<number, string>;
  rollsAt20: number;
  timeline: string[];
}

const DT = 0.1;
const SET_PATIENCE = 240;

function fastTarget(sim: DigSim, t: number, unlockAt: readonly (number | null)[]): number {
  for (let l = 0; l <= sim.unlocked; l++) {
    const deeperOpenFor = l < sim.unlocked ? t - (unlockAt[l + 1] ?? t) : 0;
    if (deeperOpenFor > SET_PATIENCE) continue;
    if (layerFossils(l).some((f) => f.odds <= 2000 && !sim.discovered(f.id))) return l;
  }
  return sim.unlocked;
}

export interface PolicyOptions {
  /** Override taps per second while active. */
  rate?: number;
  /** Casual only: false = never notices a new layer (stays where it is). */
  travel?: boolean;
}

export function runPolicy(seed: number, minutes = 40, profile: Profile = 'fast', opts: PolicyOptions = {}): PacingMetrics {
  const sim = new DigSim(seed);
  const casual = profile === 'casual';
  const rate = opts.rate ?? (casual ? 2.5 : 5);
  const reaction = casual ? 1.2 : 0.6;
  const m: PacingMetrics = {
    seed,
    profile,
    l1SetAt: null,
    unlockAt: [0, null, null, null],
    first10kAt: null,
    first10kOdds: null,
    maxGap: 0,
    maxGapAt: 0,
    powerAt: {},
    levelsAt: {},
    rollsAt20: 0,
    timeline: [],
  };
  let lastEvent = 0;
  let glintSeenAt = -1;
  let tapAcc = 0;
  let nextShop = 0;
  const steps = Math.round((minutes * 60) / DT);
  for (let i = 1; i <= steps; i++) {
    const t = i * DT;
    const active = !casual || t % 10 < 7;
    const finds: Find[] = [];
    if (active) {
      tapAcc += rate * DT;
      while (tapAcc >= 1) {
        tapAcc -= 1;
        const r = sim.tap();
        if (r.find) finds.push(r.find);
      }
    }
    finds.push(...sim.tick(DT).finds);
    if (sim.glint && active) {
      if (glintSeenAt < 0) glintSeenAt = t;
      if (t - glintSeenAt >= reaction) {
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
    for (let l = 1; l < 4; l++)
      if (m.unlockAt[l] === null && sim.unlocked >= l) {
        m.unlockAt[l] = t;
        m.timeline.push(`${(t / 60).toFixed(1)}m unlock L${l + 1} power ${Math.round(sim.digPower)}`);
      }
    if (casual) {
      if (t >= nextShop) {
        nextShop = t + 5;
        const pick = UPGRADE_ORDER.find((id) => sim.canBuy(id));
        if (pick && sim.buy(pick)) event = true;
      }
    } else {
      for (;;) {
        let best: UpgradeId | null = null;
        for (const id of UPGRADE_ORDER) {
          if (id === 'offline') continue;
          const c = sim.upgradeCost(id);
          if (c === null) continue;
          if (best === null || c < (sim.upgradeCost(best) ?? Infinity)) best = id;
        }
        if (best === null || !sim.buy(best)) break;
        event = true;
      }
    }
    const want = casual ? (opts.travel === false ? sim.layer : sim.unlocked) : fastTarget(sim, t, m.unlockAt);
    if (want !== sim.layer) {
      sim.travel(want);
      m.timeline.push(`${(t / 60).toFixed(1)}m travel L${want + 1}`);
    }
    if (event) lastEvent = t;
    if (t <= 20 * 60 && t - lastEvent > m.maxGap) {
      m.maxGap = t - lastEvent;
      m.maxGapAt = t;
    }
    if (i % Math.round(60 / DT) === 0) {
      const minute = Math.round(t / 60);
      m.powerAt[minute] = Math.round(sim.digPower);
      m.levelsAt[minute] = `${sim.level('pick')}/${sim.level('luck')}/${sim.level('assistant')}/${sim.level('offline')}`;
      m.timeline.push(
        `${minute}m L${sim.layer + 1} P ${sim.digPower.toExponential(2)} hp ${sim.blockHp.toExponential(2)} taps/blk ${(sim.blockHp / sim.digPower).toFixed(1)} luck ${sim.baseLuck.toFixed(2)} dust ${Math.round(sim.dust)} rolls ${sim.stats.rolls} found ${[0, 1, 2, 3].map((l) => sim.setProgress(l).found).join('/')} lv ${m.levelsAt[minute]}`,
      );
    }
    if (Math.abs(t - 20 * 60) < DT / 2) m.rollsAt20 = sim.stats.rolls;
  }
  return m;
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? at(s, (n - 1) / 2) : (at(s, n / 2 - 1) + at(s, n / 2)) / 2;
}
