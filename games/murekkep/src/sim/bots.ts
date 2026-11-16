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
  lastRetaliation: number;
  /** Cells lost already answered (difficulty 1). */
  lostSeen: number;
}

/** Ticks between decisions per difficulty 0..3 (10 ticks = 1 s). */
export const BOT_REACTION = [26, 18, 12, 8] as const;
/** Commit multiplier per difficulty. */
export const BOT_COMMIT = [1.2, 0.95, 1, 1.1] as const;
/**
 * Patience per difficulty: fill thresholds are scaled by this, so easy bots fire before they
 * reach the sweet spot (wasting growth, like a new player) and hard bots wait for it.
 */
export const BOT_PATIENCE = [0.5, 0.8, 1, 1] as const;
/** A neighbour holding at least this share (per difficulty) is a leader to be checked. */
export const LEADER_SHARE = [1, 1, 0.3, 0.22] as const;
/** A wave against a colony must be worth at least this many cells. */
const MIN_CELLS = 6;

type Target = { owner: number; cells: number[] };

export function botDecide(sim: MatchSim, id: number, personality: Personality, difficulty: number, mem: BotMemory): void {
  const d = Math.max(0, Math.min(3, Math.round(difficulty)));
  // The rusher attacks "early and often" (looks 30 % more often); the opportunist waits and
  // watches (30 % less often).
  const tempo = personality === 'rusher' ? 0.7 : personality === 'opportunist' ? 1 : 1;
  const reaction = Math.round(BOT_REACTION[d]! * tempo);
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
  // Not strictly the thinnest: a seeded pick weighted by cheapness² and border length, so a
  // colony that just spent ink is likelier, not certain, to be hit (no deterministic dog-pile).
  const thinnest = (finish = false): Target | undefined => {
    if (enemies.length === 0) return undefined;
    // In the endgame (`finish`) small colonies weigh more: eliminations end matches.
    const weights = enemies.map(
      (t) => (Math.sqrt(t.cells.length) / sim.captureCost(id, t.cells[0]!) ** 2) * (finish ? 1 / Math.max(1, sim.colonies[t.owner]!.area) : 1),
    );
    let roll = mem.rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < enemies.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return enemies[i];
    }
    return enemies[enemies.length - 1];
  };

  // Every bot above easy pushes back on a runaway leader (the same rule against anyone).
  let leader: Target | undefined;
  for (const t of enemies) if (!leader || sim.share(t.owner) > sim.share(leader.owner)) leader = t;
  const pressLeader = (): boolean => {
    if (!leader || x < 0.4) return false;
    const ls = sim.share(leader.owner);
    // With three or fewer left, balancing only stalls the match: press only a near-winner.
    const few = sim.colonies.filter((c) => c.alive).length <= 3;
    if (ls < (few ? Math.max(0.5, LEADER_SHARE[d]!) : LEADER_SHARE[d]!) || ls < sim.share(id) * 1.1 || sim.density(leader.owner) > sim.density(id) * 1.5 || !worth(leader, 55)) return false;
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
  // Shared endgame: once nothing else applies, spend down from 60 % fill on the thinnest neighbour.
  const endgame = (): void => {
    const t = thinnest(true);
    if (t && x >= 0.6 && worth(t, 55)) go(t, 55);
  };
  const cheap = (t: Target | undefined): boolean => !!t && sim.captureCost(id, t.cells[0]!) <= 1.9;

  // Difficulty 0 is a passive rival for first sheets: it only ever inks blank paper.
  if (d === 0) {
    if (blank) grab(blank, 30, 0.45);
    return;
  }
  // Difficulty 1 is defensive: blank paper, and a small hit back at whoever just hit it; it never
  // starts a fight.
  if (d === 1) {
    // Proportionate: send about twice the cells it just lost, never a share of a big reserve.
    const lost = sim.stats[id]!.lost - mem.lostSeen;
    const hitBy = enemies.find((t) => t.owner === me.lastAttackedBy);
    if (hitBy && lost > 0 && sim.tickCount - me.lastAttackedTick < 40 && sim.tickCount - mem.lastRetaliation >= 60) {
      const ink = 2 * lost * sim.captureCost(id, hitBy.cells[0]!);
      const pct = Math.round((100 * ink) / Math.max(1, me.reserve));
      if (pct >= 10 && pct <= 100 && sim.attack(id, mem.rng.pick(hitBy.cells), pct).ok) {
        mem.lastRetaliation = sim.tickCount;
        mem.lostSeen = sim.stats[id]!.lost;
        return;
      }
    }
    if (sim.tickCount - me.lastAttackedTick >= 40) mem.lostSeen = sim.stats[id]!.lost;
    if (blank) grab(blank, 30, 0.45);
    return;
  }

  switch (personality) {
    case 'turtle': {
      const hitBy = enemies.find((t) => t.owner === me.lastAttackedBy);
      // Hit back hard, but only when it pays: the attacker just spent ink and is thinner.
      const fresh = sim.tickCount - me.lastAttackedTick < 40 && sim.tickCount - mem.lastRetaliation >= 60;
      if (hitBy && fresh && x >= 0.3 && sim.density(hitBy.owner) < sim.density(id) && worth(hitBy, 45)) {
        if (go(hitBy, 45)) mem.lastRetaliation = sim.tickCount;
        return;
      }
      if (blank) {
        grab(blank, 30, 0.55);
        return;
      }
      if (!blank && pressLeader()) return;
      if (!blank) endgame();
      return;
    }
    case 'rusher': {
      if (pressLeader()) return;
      const t = thinnest();
      if (t && sim.tickCount >= 100 && x >= 0.45 && (cheap(t) || sim.density(t.owner) < sim.density(id) * 0.6) && worth(t, 50)) {
        go(t, 50);
        return;
      }
      if (blank) {
        grab(blank, 40, 0.4);
        if (d < 2 || fill >= 0.52) return;
      }
      endgame();
      return;
    }
    case 'opportunist': {
      const old = sim.areaHistory[0];
      let prey: Target | undefined;
      let bestScore = 0;
      const myDens = sim.density(id);
      for (const t of enemies) {
        // "Joins" attacks: the prey must be under attack by someone else right now.
        const victim = sim.colonies[t.owner]!;
        if (victim.lastAttackedBy === id || victim.lastAttackedBy < 0 || sim.tickCount - victim.lastAttackedTick > 30) continue;
        const now = victim.area;
        const was = old?.[t.owner] ?? now;
        const loss = was > 0 ? (was - now) / was : 0;
        const thin = sim.density(t.owner) < myDens * 0.6 ? 0.1 : 0;
        const score = loss + thin;
        if (score >= 0.15 && score > bestScore) {
          bestScore = score;
          prey = t;
        }
      }
      if (pressLeader()) return;
      if (prey && x >= 0.5 && worth(prey, 35)) {
        go(prey, 35);
        return;
      }
      if (blank) {
        grab(blank, 35, 0.45);
        return;
      }
      endgame();
      return;
    }
  }
}
