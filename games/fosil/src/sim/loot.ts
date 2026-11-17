/**
 * Rolling a fossil from a layer's loot table (pure).
 *
 * Luck rule (shown in the UI): luck ×L makes every fossil at 1 in 100 or rarer exactly L times
 * as likely; commons and uncommons give way in proportion. L is capped per layer so commons and
 * uncommons always keep at least 10 % between them, so no printed fossil ever becomes impossible.
 */
import type { Rng } from '@oyun/core/pure';
import { at, FOSSILS, LAYERS, TOTAL_WEIGHT, type Fossil } from './data';

/** Tiers at or above this index are boosted by luck ("1 in 100 or rarer"). */
export const LUCKY_TIER = 2;
/** Share of the table that commons + uncommons always keep. */
export const MIN_COMMON_SHARE = 0.1;

const BY_LAYER: readonly (readonly Fossil[])[] = LAYERS.map((_, l) => FOSSILS.filter((f) => f.layer === l));
const RARE_MASS: readonly number[] = BY_LAYER.map((fs) => fs.reduce((s, f) => s + (f.tier >= LUCKY_TIER ? f.weight : 0), 0) / TOTAL_WEIGHT);

export function layerFossils(layer: number): readonly Fossil[] {
  return at(BY_LAYER, layer);
}

/** Highest luck that still leaves commons and uncommons MIN_COMMON_SHARE of the table. */
export function luckCap(layer: number): number {
  return (1 - MIN_COMMON_SHARE) / at(RARE_MASS, layer);
}

/** The luck multiplier that actually applies in this layer (requested luck, capped, never below 1). */
export function effectiveLuck(layer: number, luck: number): number {
  if (!(luck > 1)) return 1; // NaN, below 1 → no luck
  return Math.min(luck, luckCap(layer));
}

/** Probability of each fossil of the layer (layer order) at the given luck. Sums to 1. */
export function rollProbabilities(layer: number, luck: number): number[] {
  const m = effectiveLuck(layer, luck);
  const rare = at(RARE_MASS, layer);
  const commonScale = (1 - m * rare) / (1 - rare);
  return at(BY_LAYER, layer).map((f) => (f.weight / TOTAL_WEIGHT) * (f.tier >= LUCKY_TIER ? m : commonScale));
}

/** Roll one fossil. At luck 1 this walks the integer weights, so it is exactly the printed odds. */
export function rollFossil(layer: number, luck: number, rng: Rng): Fossil {
  const fs = at(BY_LAYER, layer);
  const u = rng.next();
  if (effectiveLuck(layer, luck) === 1) {
    let r = Math.floor(u * TOTAL_WEIGHT);
    for (const f of fs) {
      if (r < f.weight) return f;
      r -= f.weight;
    }
    return at(fs, fs.length - 1);
  }
  const p = rollProbabilities(layer, luck);
  let acc = 0;
  for (let i = 0; i < fs.length; i++) {
    acc += at(p, i);
    if (u < acc) return at(fs, i);
  }
  return at(fs, 0); // float rounding at the very top: give the most common one
}

/**
 * The lucky-streak roll (shown on screen with its rule): one fossil among the layer's fossils at
 * 1 in 100 or rarer, in proportion to their printed odds (exact integer weights). Luck multiplies
 * all of these equally, so it does not change the proportions.
 */
export function rollRare(layer: number, rng: Rng): Fossil {
  const rare = at(BY_LAYER, layer).filter((f) => f.tier >= LUCKY_TIER);
  const total = rare.reduce((s, f) => s + f.weight, 0);
  let r = Math.floor(rng.next() * total);
  for (const f of rare) {
    if (r < f.weight) return f;
    r -= f.weight;
  }
  return at(rare, rare.length - 1);
}

/** Total weight of the rare-or-rarer fossils of a layer (for the streak-roll odds shown). */
export function rareWeight(layer: number): number {
  return at(BY_LAYER, layer).reduce((s, f) => s + (f.tier >= LUCKY_TIER ? f.weight : 0), 0);
}
