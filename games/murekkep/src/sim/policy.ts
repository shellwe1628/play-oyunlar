/**
 * Built-in player policies (pure). Used by the `auto-play` test action and the balance test.
 *
 *   impatient  a new player: taps whenever it can afford a few cells, 30–45 % commit, never waits
 *              for the sweet spot; blank paper first, else the thinnest neighbour.
 *   patient    knows the sweet spot: waits until the reserve is above ~55 % of the cap, then sends
 *              only the ink above ~40 %; blank paper first, else the thinnest neighbour.
 */
import type { MatchSim } from './match';

type Target = { owner: number; cells: number[] };

function pickTarget(sim: MatchSim, id: number): Target | undefined {
  const targets = sim.borderTargets(id);
  const blank = targets.find((t) => t.owner === -1);
  if (blank) return blank;
  let pick: Target | undefined;
  let best = Infinity;
  for (const t of targets) {
    const d = sim.density(t.owner);
    if (d < best) {
      best = d;
      pick = t;
    }
  }
  return pick;
}

function tapMiddle(sim: MatchSim, id: number, t: Target, percent: number): boolean {
  return sim.attack(id, t.cells[Math.floor(t.cells.length / 2)]!, percent).ok;
}

export function impatientPolicy(sim: MatchSim, id: number): void {
  const c = sim.colonies[id];
  if (!c || !c.alive || sim.phase !== 'playing' || sim.activeWaves(id) >= 3) return;
  const t = pickTarget(sim, id);
  if (!t) return;
  // 30, 35, 40, 45 % in turn: a player who never touches the slider deliberately.
  const percent = 30 + 5 * (Math.floor(sim.tickCount / 8) % 4);
  // "Has ink": the wave buys at least three cells.
  if ((c.reserve * percent) / 100 < 3 * sim.captureCost(id, t.cells[0]!)) return;
  tapMiddle(sim, id, t, percent);
}

export function patientPolicy(sim: MatchSim, id: number): void {
  const c = sim.colonies[id];
  if (!c || !c.alive || sim.phase !== 'playing' || sim.activeWaves(id) >= 2) return;
  const fill = c.reserve / sim.cap(id);
  if (fill < 0.55) return;
  const t = pickTarget(sim, id);
  if (!t) return;
  const percent = Math.max(10, Math.min(100, Math.round((100 * (fill - 0.4)) / fill)));
  tapMiddle(sim, id, t, percent);
}
