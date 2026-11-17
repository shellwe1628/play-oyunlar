import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { at, FOSSILS, LAYERS, TIERS, TOTAL_WEIGHT, tierOf } from '../../src/sim/data';
import { effectiveLuck, layerFossils, LUCKY_TIER, rollFossil, rollProbabilities } from '../../src/sim/loot';

describe('loot tables', () => {
  it('has 10 layers of 12 fossils with unique ids, each layer with its own twist from layer 5 on', () => {
    expect(LAYERS).toHaveLength(10);
    expect(FOSSILS).toHaveLength(120);
    expect(new Set(FOSSILS.map((f) => f.id)).size).toBe(120);
    for (let l = 0; l < LAYERS.length; l++) expect(layerFossils(l)).toHaveLength(12);
    expect(LAYERS.map((l) => l.twist)).toEqual(['none', 'none', 'none', 'none', 'vein', 'unstable', 'twin', 'relic', 'cavein', 'boss']);
    // no two layers share a table
    const tables = LAYERS.map((_, l) => layerFossils(l).map((f) => f.odds).join(','));
    expect(new Set(tables).size).toBe(LAYERS.length);
  });

  it('integer weights sum to exactly the total in every layer, so 1/odds is exact', () => {
    for (let l = 0; l < LAYERS.length; l++) {
      const fs = layerFossils(l);
      expect(fs.reduce((s, f) => s + f.weight, 0)).toBe(TOTAL_WEIGHT);
      for (const f of fs) {
        expect(Number.isInteger(f.weight)).toBe(true);
        expect(f.weight * f.odds).toBe(TOTAL_WEIGHT);
      }
    }
  });

  it('spans seven tiers from 1 in 2 to 1 in 1,000,000; the deepest tiers appear from layer 2 on', () => {
    expect(TIERS).toHaveLength(7);
    const odds = FOSSILS.map((f) => f.odds);
    expect(Math.min(...odds)).toBe(2);
    expect(Math.max(...odds)).toBe(1_000_000);
    expect(new Set(FOSSILS.map((f) => f.tier)).size).toBe(7);
    expect(Math.max(...layerFossils(0).map((f) => f.tier))).toBeLessThanOrEqual(3); // legendary+ never in Topsoil
    for (let l = 1; l < LAYERS.length; l++) expect(Math.max(...layerFossils(l).map((f) => f.tier))).toBeGreaterThanOrEqual(4);
    expect(tierOf(2)).toBe(0);
    expect(tierOf(99)).toBe(1);
    expect(tierOf(100)).toBe(2);
    expect(tierOf(10_000)).toBe(4);
    expect(tierOf(1_000_000)).toBe(6);
  });
});

describe('honesty: printed odds are the true base odds', () => {
  it('base-luck probabilities equal 1/odds exactly', () => {
    for (let l = 0; l < LAYERS.length; l++) {
      const p = rollProbabilities(l, 1);
      layerFossils(l).forEach((f, i) => expect(p[i]).toBeCloseTo(1 / f.odds, 14));
    }
  });

  it('empirical frequencies over 1.2M seeded rolls per layer match the printed odds', () => {
    const N = 1_200_000;
    for (let l = 0; l < LAYERS.length; l++) {
      const fs = layerFossils(l);
      const rng = createRng(1000 + l);
      const counts = new Map<string, number>(fs.map((f) => [f.id, 0]));
      for (let i = 0; i < N; i++) {
        const f = rollFossil(l, 1, rng);
        counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
      }
      let chi2 = 0;
      for (const f of fs) {
        const p = 1 / f.odds;
        const exp = N * p;
        const obs = counts.get(f.id) ?? 0;
        if (exp >= 20) {
          const sigma = Math.sqrt(N * p * (1 - p));
          expect(Math.abs(obs - exp), `${f.id} 1 in ${f.odds}: ${obs} vs ${exp}`).toBeLessThan(5 * sigma);
          chi2 += (obs - exp) ** 2 / exp;
        } else {
          // Very rare: only check it is not wildly off (Poisson tail).
          expect(obs, f.id).toBeLessThanOrEqual(Math.max(8, exp * 6));
        }
      }
      // chi-square with dof-1 degrees of freedom; 40 is far beyond the 99.99th percentile for <= 11.
      expect(chi2, `layer ${l} chi2`).toBeLessThan(40);
    }
  }, 240_000); // 12 M rolls: give it room on a loaded machine
});

describe('luck', () => {
  it('multiplies every fossil at 1 in 100 or rarer by the luck value; commons give way', () => {
    for (let l = 0; l < LAYERS.length; l++) {
      const base = rollProbabilities(l, 1);
      const lucky = rollProbabilities(l, 3);
      expect(lucky.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      layerFossils(l).forEach((f, i) => {
        if (f.tier >= LUCKY_TIER) expect(lucky[i]).toBeCloseTo(at(base, i) * 3, 12);
        else {
          expect(lucky[i]).toBeLessThan(at(base, i));
          expect(lucky[i]).toBeGreaterThan(0);
        }
      });
    }
  });

  it('shifts the empirical distribution toward rarer tiers', () => {
    const N = 300_000;
    const rng = createRng(77);
    let rareBase = 0;
    let rareLucky = 0;
    for (let i = 0; i < N; i++) if (rollFossil(1, 1, rng).tier >= LUCKY_TIER) rareBase++;
    for (let i = 0; i < N; i++) if (rollFossil(1, 4, rng).tier >= LUCKY_TIER) rareLucky++;
    expect(rareLucky / rareBase).toBeGreaterThan(3.6);
    expect(rareLucky / rareBase).toBeLessThan(4.4);
  }, 60_000);

  it('never makes any printed fossil impossible, even at absurd luck', () => {
    for (let l = 0; l < LAYERS.length; l++) {
      const p = rollProbabilities(l, 1e9);
      for (const x of p) expect(x).toBeGreaterThan(0);
      const commonShare = layerFossils(l).reduce((s, f, i) => s + (f.tier < LUCKY_TIER ? at(p, i) : 0), 0);
      expect(commonShare).toBeGreaterThanOrEqual(0.1 - 1e-12);
      expect(effectiveLuck(l, 1e9)).toBeLessThan(1e9);
      expect(effectiveLuck(l, 2)).toBe(2);
    }
  });

  it('is deterministic per seed', () => {
    const a = createRng(5);
    const b = createRng(5);
    for (let i = 0; i < 200; i++) expect(rollFossil(2, 2, a).id).toBe(rollFossil(2, 2, b).id);
  });
});
