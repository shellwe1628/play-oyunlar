/**
 * Bot decisions (pure). A bot looks at its border every `reaction` ticks and may launch one wave
 * through the same `sim.attack()` the player uses: no extra ink, no hidden information beyond
 * what the HUD shows (reserves → densities, land shares).
 *
 *   turtle       blank paper only; sits high; retaliates hard against whoever hit it.
 *   rusher       hits the thinnest neighbour early and often.
 *   opportunist  piles onto whoever is losing ground or thinly inked.
 */
import type { Rng } from '@oyun/core/pure';
import type { MatchSim, Personality } from './match';

export interface BotMemory {
  readonly rng: Rng;
  lastDecision: number;
}

/** Ticks between decisions per difficulty 0..3 (10 ticks = 1 s). */
export const BOT_REACTION = [26, 18, 12, 8] as const;
/** Commit multiplier per difficulty. */
export const BOT_COMMIT = [0.75, 0.88, 1, 1.1] as const;
/**
 * Patience per difficulty: fill thresholds are scaled by this, so easy bots fire before they
 * reach the sweet spot (wasting growth, like a new player) and hard bots wait for it.
 */
export const BOT_PATIENCE = [0.5, 0.8, 1, 1] as const;
/** A neighbour holding at least this share (per difficulty) is a leader to be checked. */
export const LEADER_SHARE = [1, 0.42, 0.3, 0.22] as const;
/** A wave against a colony must be worth at least this many cells. */
const MIN_CELLS = 6;

type Target = { owner: number; cells: number[] };

export function botDecide(sim: MatchSim, id: number, personality: Personality, difficulty: number, mem: BotMemory): void {
  const d = Math.max(0, Math.min(3, Math.round(difficulty)));
  // The rusher attacks "early and often": it looks at its border 30 % more often.
  const reaction = personality === 'rusher' ? Math.round(BOT_REACTION[d]! * 0.7) : BOT_REACTION[d]!;
  if (sim.tickCount - mem.lastDecision < reaction) return;
  mem.lastDecision = sim.tickCount + mem.rng.int(-2, 2);
  const me = sim.colonies[id]!;
  if (sim.activeWaves(id) >= 3) return;
  const x = me.reserve / sim.cap(id) / BOT_PATIENCE[d]!;
  const targets = sim.borderTargets(id);
  const blank = targets.find((t) => t.owner === -1);
  const enemies = targets.filter((t) => t.owner >= 0);
  const mul = BOT_COMMIT[d]!;

  const go = (t: Target, pct: number): boolean => sim.attack(id, mem.rng.pick(t.cells), Math.round(pct * mul)).ok;
  const worth = (t: Target, pct: number): boolean => {
    const ink = (me.reserve * pct * mul) / 100;
    return ink / sim.captureCost(id, t.cells[0]!) >= MIN_CELLS;
  };
  const thinnest = (): Target | undefined => {
    let best: Target | undefined;
    let bestD = Infinity;
    for (const t of enemies) {
      const dens = sim.density(t.owner);
      if (dens < bestD) {
        bestD = dens;
        best = t;
      }
    }
    return best;
  };

  // Every bot above easy pushes back on a runaway leader (the same rule against anyone).
  let leader: Target | undefined;
  for (const t of enemies) if (!leader || sim.share(t.owner) > sim.share(leader.owner)) leader = t;
  const pressLeader = (): boolean => {
    if (!leader || x < 0.4) return false;
    const ls = sim.share(leader.owner);
    if (ls < LEADER_SHARE[d]! || ls < sim.share(id) * 1.1 || !worth(leader, 55)) return false;
    return go(leader, 55);
  };
  // Sweet-spot discipline (difficulty ≥ 2): on blank paper spend only the ink above ~45 % fill,
  // in frequent small waves, so growth stays near its peak.
  const fill = me.reserve / sim.cap(id);
  const grab = (t: Target, base: number, threshold: number): boolean => {
    if (d < 2) return x >= threshold && go(t, base);
    if (fill < 0.52) return false;
    const pct = Math.max(10, Math.min(base, (100 * (fill - 0.45)) / fill));
    return sim.attack(id, mem.rng.pick(t.cells), Math.round(pct)).ok;
  };
  const cheap = (t: Target | undefined): boolean => !!t && sim.captureCost(id, t.cells[0]!) <= 2.6;

  switch (personality) {
    case 'turtle': {
      const hitBy = enemies.find((t) => t.owner === me.lastAttackedBy);
      if (hitBy && sim.tickCount - me.lastAttackedTick < 40 && x >= 0.3 && worth(hitBy, 70)) {
        go(hitBy, 70);
        return;
      }
      if (blank) {
        grab(blank, 30, 0.55);
        return;
      }
      if (!blank && pressLeader()) return;
      if (!blank && x >= 0.7) {
        const t = thinnest();
        if (t && worth(t, 55)) go(t, 55);
      }
      return;
    }
    case 'rusher': {
      if (pressLeader()) return;
      const t = thinnest();
      if (t && sim.tickCount >= 100 && x >= 0.35 && (cheap(t) || !blank || sim.density(t.owner) < sim.density(id) * 0.7) && worth(t, 50)) {
        go(t, 50);
        return;
      }
      if (blank) {
        grab(blank, 40, 0.4);
        if (d < 2 || fill >= 0.52) return;
      }
      if (t && x >= 0.55 && worth(t, 60)) go(t, 60);
      return;
    }
    case 'opportunist': {
      const old = sim.areaHistory[0];
      let prey: Target | undefined;
      let bestScore = 0;
      const myDens = sim.density(id);
      for (const t of enemies) {
        const now = sim.colonies[t.owner]!.area;
        const was = old?.[t.owner] ?? now;
        const loss = was > 0 ? (was - now) / was : 0;
        const thin = sim.density(t.owner) < myDens * 0.6 ? 0.1 : 0;
        const score = loss + thin;
        if (score >= 0.08 && score > bestScore) {
          bestScore = score;
          prey = t;
        }
      }
      if (pressLeader()) return;
      if (prey && x >= 0.45 && worth(prey, 45)) {
        go(prey, 45);
        return;
      }
      if (blank) {
        grab(blank, 35, 0.45);
        return;
      }
      const t = thinnest();
      if (t && x >= 0.65 && worth(t, 50)) go(t, 50);
      return;
    }
  }
}
