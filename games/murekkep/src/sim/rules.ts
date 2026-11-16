/**
 * Every tuning number of a match, in one place (pure). Values chosen by the seeded batch test
 * in tests/unit/balance.test.ts; see GAME.md "Built" for the evidence.
 */
export const RULES = {
  /** Simulation rate. */
  tickHz: 10,
  /** Start blot: land within this BFS distance of the start cell. */
  startRadius: 2,
  startReserve: 18,
  /** Ink cap = capBase + capPerCell × area. */
  capBase: 20,
  capPerCell: 2.4,
  /** Growth per tick at the sweet spot = growthBase + growthPerCell × area. */
  growthBase: 0.12,
  growthPerCell: 0.0042,
  /** Growth factor when the reserve is empty (fraction of peak). */
  growthAtEmpty: 0.3,
  /** Ink per blank cell. */
  blankCost: 1,
  /** Ink per enemy cell = enemyBaseCost + densityCost × defender density (reserve ÷ area). */
  enemyBaseCost: 1.6,
  densityCost: 1,
  /** Defender loses defenderLoss × its density for every cell it loses. */
  defenderLoss: 1,
  /** Cells a wave can take per tick: waveSpeedBase + ink / waveSpeedInk, capped. */
  waveSpeedBase: 2,
  waveSpeedInk: 40,
  waveSpeedMax: 7,
  /** Commit slider range, %. */
  minCommit: 10,
  maxCommit: 100,
  defaultCommit: 30,
  /** Share of all land that wins outright. */
  winShare: 0.7,
  /** Hard stop (ticks): largest colony wins. 8 minutes of game time. */
  maxTicks: 4800,
  /** Blot power: radius in cells and cooldown in ticks. */
  blotRadius: 2.6,
  blotCooldown: 300,
  /** A single wave capturing this many cells is a "big capture" (soak + camera pulse). */
  bigCapture: 40,
} as const;

/**
 * Growth multiplier for fill x = reserve ÷ cap. Rises from growthAtEmpty at 0 to 1 at x = 0.5,
 * then falls to exactly 0 at the cap (sitting full wastes growth).
 */
export function growthFactor(x: number): number {
  if (x >= 1) return 0;
  const s = (t: number): number => t * t * (3 - 2 * t);
  if (x <= 0) return RULES.growthAtEmpty;
  if (x <= 0.5) return RULES.growthAtEmpty + (1 - RULES.growthAtEmpty) * s(x / 0.5);
  return 1 - s((x - 0.5) / 0.5);
}

export function inkCap(area: number): number {
  return area <= 0 ? 0 : RULES.capBase + RULES.capPerCell * area;
}

/** Ink gained this tick by a colony of `area` cells holding `reserve`. */
export function growthPerTick(area: number, reserve: number): number {
  if (area <= 0) return 0;
  const cap = inkCap(area);
  return (RULES.growthBase + RULES.growthPerCell * area) * growthFactor(reserve / cap);
}

/** Clamp a commit percentage into the slider range. */
export function clampCommit(percent: number): number {
  if (!Number.isFinite(percent)) return RULES.defaultCommit;
  return Math.min(RULES.maxCommit, Math.max(RULES.minCommit, Math.round(percent)));
}
