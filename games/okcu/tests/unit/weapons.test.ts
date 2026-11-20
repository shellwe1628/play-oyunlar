import { describe, expect, it } from 'vitest';
import { bowDamage } from '../../src/sim/bow';
import { ENEMY_DAMAGE, HARD_HEAD_MUL } from '../../src/sim/combat';
import { WEAPON_IDS, WEAPONS, bowEquivalent, levelForBow, weaponDamage, weaponPerks } from '../../src/sim/weapons';

describe('weapons', () => {
  it('weapon damage runs 1.00 → 3.30 over levels 1…20, monotonic', () => {
    expect(weaponDamage(1)).toBe(1);
    expect(weaponDamage(20)).toBeCloseTo(3.3, 2);
    for (let l = 2; l <= 20; l++) expect(weaponDamage(l)).toBeGreaterThan(weaponDamage(l - 1));
  });
  it('old bow levels map to a level with at least the same damage', () => {
    for (let n = 0; n <= 25; n++) expect(weaponDamage(levelForBow(n))).toBeGreaterThanOrEqual(bowDamage(n) - 1e-9);
    expect(levelForBow(0)).toBe(1);
    expect(levelForBow(25)).toBe(20);
    expect(bowEquivalent(20)).toBe(25);
    for (let n = 0; n <= 25; n++) expect(bowEquivalent(levelForBow(n))).toBeGreaterThanOrEqual(n);
  });
  it('every weapon except the bow is unlocked by a different boss', () => {
    const bosses = WEAPON_IDS.filter((id) => id !== 'bow').map((id) => WEAPONS[id].unlockBoss);
    expect(new Set(bosses).size).toBe(5);
  });
  it('sling head hit equals a chest hit under the hard rules; others keep the head bonus', () => {
    expect(WEAPONS.sling.headMul * ENEMY_DAMAGE.head * HARD_HEAD_MUL).toBeCloseTo(ENEMY_DAMAGE.body, 9);
    for (const id of WEAPON_IDS) if (id !== 'sling') expect(WEAPONS[id].headMul).toBe(1);
    expect(WEAPONS.crossbow.windMul).toBe(0.4);
  });
  it('perks are neutral at level 1 and never decrease', () => {
    for (const id of WEAPON_IDS) {
      const p1 = weaponPerks(id, 1);
      expect(p1.pierce).toBe(WEAPONS[id].pierce);
      expect(p1.bounces).toBe(WEAPONS[id].bounces);
      expect(p1.reloadMul).toBe(1);
      expect(p1.returnSpeedMul).toBe(1);
      expect(p1.blastRadiusMul).toBe(1);
      for (let l = 2; l <= 20; l++) {
        const a = weaponPerks(id, l - 1);
        const b = weaponPerks(id, l);
        expect(b.pierce).toBeGreaterThanOrEqual(a.pierce);
        expect(b.bounces).toBeGreaterThanOrEqual(a.bounces);
        expect(b.reloadMul).toBeLessThanOrEqual(a.reloadMul);
        expect(b.returnSpeedMul).toBeGreaterThanOrEqual(a.returnSpeedMul);
        expect(b.blastRadiusMul).toBeGreaterThanOrEqual(a.blastRadiusMul);
      }
    }
  });
});
