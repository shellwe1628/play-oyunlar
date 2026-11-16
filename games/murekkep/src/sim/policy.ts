/**
 * The naive built-in player policy (pure). Used by the `auto-play` test action and the balance
 * test as "a player who knows the rules but not the tactics": wait until half full, then pour
 * 30 % into blank paper, else into the thinnest-inked neighbour.
 */
import type { MatchSim } from './match';
import { RULES } from './rules';

export function naivePolicy(sim: MatchSim, id: number): void {
  const c = sim.colonies[id];
  if (!c || !c.alive || sim.phase !== 'playing') return;
  if (c.reserve < sim.cap(id) * 0.5) return;
  if (sim.activeWaves(id) >= 2) return;
  const targets = sim.borderTargets(id);
  const blank = targets.find((t) => t.owner === -1);
  let pick = blank;
  if (!pick) {
    let best = Infinity;
    for (const t of targets) {
      if (t.owner < 0) continue;
      const d = sim.density(t.owner);
      if (d < best) {
        best = d;
        pick = t;
      }
    }
  }
  if (!pick) return;
  const cell = pick.cells[Math.floor(pick.cells.length / 2)]!;
  sim.attack(id, cell, RULES.defaultCommit);
}
