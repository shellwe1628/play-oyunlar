import { describe, expect, it } from 'vitest';
import { bowDamage } from '../../src/sim/bow';
import { ENEMY_DAMAGE, HARD_HEAD_MUL } from '../../src/sim/combat';
import { HARD_BOW_POW, statsFor } from '../../src/sim/cards';
import { NO_META } from '../../src/sim/meta';
import { velX } from '../../src/sim/body';
import { TUNING } from '../../src/sim/tuning';
import { arrowSpeed, createWorld, playerOrigin, shoot, advance, jumpToWave, takeEvents, targetPoint } from '../../src/sim/world';
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

describe('bolt and spear behaviour', () => {
  const hard = (weapon: 'bow' | 'crossbow' | 'spear', seed = 3) => createWorld({ seed, difficulty: 'hard', meta: { ...NO_META, weapon, wlevel: 1 } });

  it('bolt flies flatter: after 0.3 s it has dropped less than half as much as an arrow', () => {
    const drop = (weapon: 'bow' | 'crossbow'): number => {
      const w = hard(weapon);
      expect(shoot(w, -1.2, 0.6)).toBe(true);
      const a = w.arrows.find((x) => x.active && x.owner === 'player')!;
      const [y0, vy0] = [a.y, a.vy];
      for (let i = 0; i < 18; i++) advance(w, 1 / 60);
      expect(a.active && a.state === 0).toBe(true);
      return a.y - (y0 + vy0 * 0.3);
    };
    const d = drop('crossbow');
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.5 * drop('bow'));
  });

  it('spear is thrown with pierce, a hard shove and a 1.2 s life', () => {
    const ws = hard('spear');
    const wa = hard('bow');
    expect(shoot(ws, -0.3, 1)).toBe(true);
    expect(shoot(wa, -0.3, 1)).toBe(true);
    const s = ws.arrows.find((x) => x.active && x.owner === 'player')!;
    const a = wa.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(s.kind).toBe('spear');
    expect(s.pierce).toBe(1);
    expect(s.impulseMul).toBeGreaterThanOrEqual(2 * a.impulseMul);
    expect(s.life).toBe(1.2);
    expect(a.life).toBe(5);
  });

  it('one spear damages two archers in line; an arrow stops at the first', () => {
    const POWER = 0.5;
    const throwAt = (weapon: 'bow' | 'spear') => {
      const w = hard(weapon);
      jumpToWave(w, 6);
      const [a, b] = w.enemies.filter((e) => e.alive);
      expect(a && b).toBeTruthy();
      // B stands on A's ledge, 30 px further from the player
      b!.ledge = a!.ledge;
      b!.anchorY = a!.anchorY;
      b!.anchorX = b!.stanceX = a!.anchorX + 30;
      for (let i = 0; i < 90; i++) {
        for (const e of w.enemies) {
          e.timer = 999;
          e.hp = e.maxHp = 1e6;
          e.shield = null; // nothing but flesh in the way
        }
        advance(w, 1 / 60);
      }
      takeEvents(w);
      // the throw whose flight (this weapon's speed and gravity, wind included) crosses A's chest while descending
      const c = targetPoint(a!, 'chest');
      const speed = arrowSpeed(POWER) * w.stats.speedMul;
      const g = TUNING.gravity * (weapon === 'spear' ? WEAPONS.spear.gravityMul : 1);
      let best = { err: Infinity, angle: -1 };
      for (let ang = -1.4; ang < 0; ang += 0.0005) {
        const o = playerOrigin(w, ang);
        const vx = Math.cos(ang) * speed;
        const vy = Math.sin(ang) * speed;
        // time to reach x = c.x (wind ignored in the root, then corrected below)
        let t = (c.x - o.x) / vx;
        for (let k = 0; k < 4; k++) t = (c.x - o.x - 0.5 * w.wind * WEAPONS[weapon].windMul * t * t) / vx;
        const y = o.y + vy * t + 0.5 * g * t * t;
        const err = Math.abs(y - c.y) + (vy + g * t < 0 ? 1e3 : 0);
        if (err < best.err) best = { err, angle: ang };
      }
      w.reload = 0;
      expect(shoot(w, best.angle, POWER)).toBe(true);
      const hits = new Set<number>();
      const meanVx = () => a!.body.x.reduce((acc, _x, k) => acc + velX(a!.body, k, 1 / 60), 0) / a!.body.n;
      let shove = 0;
      for (let i = 0; i < 90; i++) {
        for (const e of w.enemies) {
          e.hp = e.maxHp = 1e6;
          e.shield = null; // nothing but flesh in the way
        }
        const before = meanVx();
        advance(w, 1 / 60);
        for (const ev of takeEvents(w)) {
          if (ev.t !== 'hit') continue;
          if (ev.id === a!.id && shove === 0) shove = meanVx() - before;
          hits.add(ev.id);
        }
      }
      return { ids: [a!.id, b!.id], hits, shove };
    };
    const sp = throwAt('spear');
    expect(sp.hits.has(sp.ids[0]!)).toBe(true);
    expect(sp.hits.has(sp.ids[1]!)).toBe(true);
    const bw = throwAt('bow');
    expect(bw.hits.has(bw.ids[0]!)).toBe(true);
    expect(bw.hits.has(bw.ids[1]!)).toBe(false);
    // the measured shove: A's mean body velocity change on the hit frame, same seed, setup and aim point
    expect(bw.shove).toBeGreaterThan(0);
    // measured 1.63x: the spear's 2.2 impulseMul is partly eaten by its 0.8 speed (the shove scales with arrow velocity)
    expect(sp.shove).toBeGreaterThanOrEqual(1.5 * bw.shove);
  });
});
