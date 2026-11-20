import { describe, expect, it } from 'vitest';
import { bowDamage } from '../../src/sim/bow';
import { ENEMY_DAMAGE, HARD_HEAD_MUL } from '../../src/sim/combat';
import { HARD_BOW_POW, statsFor } from '../../src/sim/cards';
import { NO_META } from '../../src/sim/meta';
import { createWorld, shoot, advance } from '../../src/sim/world';
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

describe('weapon stats', () => {
  it('hard stats follow the weapon', () => {
    const bow = statsFor([], NO_META, 'hard');
    const xbow = statsFor([], { ...NO_META, weapon: 'crossbow', wlevel: 1 }, 'hard');
    expect(xbow.reload).toBeCloseTo(bow.reload * 1.6, 9);
    expect(xbow.projectile).toBe('bolt');
    expect(xbow.speedMul).toBe(1.45);
    expect(xbow.gravityMul).toBe(0.35);
    const spear = statsFor([], { ...NO_META, weapon: 'spear', wlevel: 10 }, 'hard');
    expect(spear.dmgMul).toBeCloseTo(weaponDamage(10) ** HARD_BOW_POW * 1.35, 9);
    expect(spear.pierce).toBe(weaponPerks('spear', 10).pierce);
    expect(spear.pierce).toBe(2);
    const sling = statsFor(['bounce'], { ...NO_META, weapon: 'sling', wlevel: 10 }, 'hard');
    expect(sling.bounces).toBe(1 + 2 + 1);
    expect(sling.headMul).toBe(WEAPONS.sling.headMul);
    const ignored = statsFor([], { ...NO_META, bow: 25, weapon: 'bow', wlevel: 1 }, 'hard');
    expect(ignored.dmgMul).toBe(1);
    expect(ignored.weapon).toBe('bow');
  });
  it('crossbow perk and weapon reload multiply', () => {
    const x = statsFor([], { ...NO_META, weapon: 'crossbow', wlevel: 20 }, 'hard');
    expect(x.reload).toBeCloseTo(statsFor([], NO_META, 'hard').reload * 1.6 * weaponPerks('crossbow', 20).reloadMul, 9);
  });
  it('classic ignores weapons', () => {
    const base = statsFor(['heavy', 'pierce'], { ...NO_META, bow: 7 });
    const spear = statsFor(['heavy', 'pierce'], { ...NO_META, bow: 7, weapon: 'spear', wlevel: 15 });
    expect(spear).toEqual(base);
    expect(base.weapon).toBe('bow');
    expect(base.projectile).toBe('arrow');
    expect(base.speedMul).toBe(1);
    expect(base.gravityMul).toBe(1);
    expect(base.headMul).toBe(1);
  });
  it('hard shots spawn the weapon projectile with its speed, gravity and wind', () => {
    const w = createWorld({ seed: 3, meta: { ...NO_META, weapon: 'crossbow', wlevel: 1 }, difficulty: 'hard' });
    const wb = createWorld({ seed: 3, meta: NO_META, difficulty: 'hard' });
    expect(shoot(w, -0.3, 1)).toBe(true);
    expect(shoot(wb, -0.3, 1)).toBe(true);
    const a = w.arrows.find((x) => x.active && x.owner === 'player')!;
    const b = wb.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(a.kind).toBe('bolt');
    expect(a.gravityMul).toBe(0.35);
    expect(a.windMul).toBe(0.4);
    expect(Math.hypot(a.vx, a.vy)).toBeCloseTo(Math.hypot(b.vx, b.vy) * 1.45, 6);
    expect(b.kind).toBe('arrow');
    expect(b.gravityMul).toBe(1);
    expect(b.windMul).toBe(1);
    const [ay0, by0] = [a.vy, b.vy];
    advance(w, 0.03);
    advance(wb, 0.03);
    expect((a.vy - ay0) / (b.vy - by0)).toBeCloseTo(0.35, 3);
  });
});
