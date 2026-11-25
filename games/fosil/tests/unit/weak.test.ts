/**
 * Weak spots: an aiming element in the tap loop from the first block. Damage only: every test
 * here that touches a roll checks that luck and the tables are exactly what they were.
 */
import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { saveOptions, SAVE_VERSION } from '../../src/save';
import { at, FEVER, LAYERS, METEOR, VEIN, WEAK } from '../../src/sim/data';
import { DigSim, defaultSave, type BlockKind, type DigSave } from '../../src/sim/dig';
import { layerFossils, rollProbabilities } from '../../src/sim/loot';

const saveWith = (mut: (s: DigSave) => void): DigSave => {
  const s = defaultSave();
  mut(s);
  return s;
};

/** A sim parked on `layer` with the given block, strong enough to break it in about `taps` taps. */
function on(layer: number, kind: BlockKind = 'normal', mut: (s: DigSave) => void = () => {}, taps = 40): DigSim {
  return new DigSim(
    3,
    saveWith((s) => {
      s.unlocked = layer;
      s.layer = layer;
      s.block = { kind, timer: -1 };
      if (kind === 'meteor') Object.assign(s.block, { x: 0.5, y: 0.5 });
      s.stats.rolls = 100;
      s.counts['topsoil-01'] = [0, 0, 0, Math.ceil(at(LAYERS, layer).hp / 64 / taps)];
      s.glintIn = 1e6; // no glint in the way unless a test wants one
      mut(s);
    }),
  );
}

/** Tick in small steps until a weak spot shows; returns the seconds it took. */
function waitSpot(sim: DigSim, max = 60): number {
  let t = 0;
  while (!sim.weakSpot && t < max) {
    sim.tick(0.05);
    t += 0.05;
  }
  if (!sim.weakSpot) throw new Error('no weak spot');
  return t;
}

describe(`weak spots: every ${WEAK.minGap}-${WEAK.maxGap} s, visible ${WEAK.life} s`, () => {
  it(`a new dig shows its first one after ${WEAK.first} s; it stays ${WEAK.life} s; later gaps are ${WEAK.minGap}-${WEAK.maxGap} s`, () => {
    const sim = new DigSim(9, saveWith((s) => (s.glintIn = 1e6)));
    // (a save with a glint timer is not "brand new" for the glint, but taps and rolls are 0)
    sim.tick(WEAK.first - 0.1);
    expect(sim.weakSpot).toBeNull();
    expect(sim.tick(0.2).weakAppeared).toBe(true);
    expect(sim.weakSpot).not.toBeNull();
    sim.tick(WEAK.life - 0.1);
    expect(sim.weakSpot).not.toBeNull();
    expect(sim.tick(0.2).weakExpired).toBe(true);
    expect(sim.weakSpot).toBeNull();
    for (let n = 0; n < 12; n++) {
      const t = waitSpot(sim);
      expect(t).toBeGreaterThanOrEqual(WEAK.minGap - 0.1);
      expect(t).toBeLessThanOrEqual(WEAK.maxGap + 0.1);
      let up = 0;
      while (sim.weakSpot) {
        sim.tick(0.05);
        up += 0.05;
      }
      expect(up).toBeGreaterThan(WEAK.life - 0.1);
      expect(up).toBeLessThan(WEAK.life + 0.1);
    }
  });

  it('is inside the block face and never in the same place twice in a row', () => {
    const sim = on(0);
    let last: { x: number; y: number } | null = null;
    for (let n = 0; n < 300; n++) {
      waitSpot(sim);
      const s = { x: sim.weakSpot!.x, y: sim.weakSpot!.y };
      for (const v of [s.x, s.y]) {
        expect(v).toBeGreaterThanOrEqual(0.2);
        expect(v).toBeLessThanOrEqual(0.8);
      }
      // clear of the last one by more than the hit radius: a finger resting there misses
      if (last) expect(Math.hypot(s.x - last.x, s.y - last.y)).toBeGreaterThan(WEAK.radius);
      last = s;
      // alternate between hitting it and letting it go: both ways the next one moves
      if (n % 2) sim.tap(s);
      else while (sim.weakSpot) sim.tick(0.05);
    }
  });

  it('never appears while a glint is up, and makes way when one appears (the sharp eye is kept)', () => {
    const sim = new DigSim(4); // glints as usual
    let both = 0;
    let yielded = 0;
    for (let i = 0; i < 60_000; i++) {
      const hadSpot = sim.weakSpot !== null;
      const streak = sim.sharpEye;
      const r = sim.tick(0.05);
      if (sim.glint && sim.weakSpot) both++;
      if (r.weakAppeared) expect(sim.glint).toBeNull();
      if (hadSpot && r.glintAppeared) {
        yielded++;
        expect(r.weakExpired).toBe(true);
        expect(sim.sharpEye).toBe(streak);
      }
      // keep a streak going so a broken one would show
      if (sim.weakSpot && sim.weakSpot.life < 1) sim.tap(sim.weakSpot);
    }
    expect(both).toBe(0);
    expect(yielded).toBeGreaterThan(0); // the case really happened in this sample
    expect(sim.sharpEye).toBeGreaterThan(5);
  });

  it('a meteor block has its star core instead: no weak spot there', () => {
    const crater = LAYERS.findIndex((l) => l.id === 'crater');
    const sim = on(crater, 'meteor');
    for (let i = 0; i < 600; i++) expect(sim.tick(0.05).weakAppeared).toBe(false);
    expect(sim.weakSpot).toBeNull();
    const hit = sim.tap(sim.meteorCore!);
    expect(hit.core).toBe(true);
    expect(hit.precise).toBe(false);
    expect(hit.damage).toBe(sim.digPower * METEOR.core);
  });
});

describe('the spot and the block, the spot and the other screens', () => {
  it('stays where it is when its block breaks: it rides on the next block', () => {
    const sim = on(0, 'normal', () => {}, 1); // every tap breaks a Topsoil block
    waitSpot(sim);
    const spot = { ...sim.weakSpot! };
    const far = { x: spot.x > 0.5 ? spot.x - 0.4 : spot.x + 0.4, y: spot.y };
    const broken = sim.blocksBroken(0);
    for (let i = 0; i < 3; i++) {
      const r = sim.tap(far);
      expect(r.broke).toBe(true);
      expect(r.precise).toBe(false);
      expect(sim.weakSpot).toEqual(spot); // same place, same time left
    }
    expect(sim.blocksBroken(0)).toBe(broken + 3);
    expect(sim.sharpEye).toBe(0);
    // and it can still be hit, on the block that is there now
    const hit = sim.tap(spot);
    expect(hit.precise).toBe(true);
    expect(hit.sharp).toBe(1);
  });

  it('waits while another screen is showing: nothing expires and the sharp eye is not lost behind the museum', () => {
    const sim = on(3, 'normal', (s) => (s.levels.assistant = 10), 400);
    for (let n = 0; n < 2; n++) {
      waitSpot(sim);
      sim.tap(sim.weakSpot!);
    }
    waitSpot(sim);
    sim.tick(0.5);
    const spot = { ...sim.weakSpot! };
    const weak = sim.toSave().weak;
    sim.setWatching(false); // the museum, the ranks
    let hits = 0;
    for (let i = 0; i < 600; i++) {
      const r = sim.tick(0.1);
      hits += r.assistantHits;
      expect(r.weakAppeared).toBe(false);
      expect(r.weakExpired).toBe(false);
    }
    expect(hits).toBeGreaterThan(50); // the rest of the dig went on
    expect(sim.weakSpot).toEqual(spot);
    expect(sim.sharpEye).toBe(2);
    expect(sim.toSave().weak).toEqual(weak); // not a draw, not a second
    // back on the dig screen it runs on from where it was
    sim.setWatching(true);
    sim.tick(spot.life - 0.1);
    expect(sim.weakSpot).not.toBeNull();
    expect(sim.tick(0.2).weakExpired).toBe(true);
    expect(sim.sharpEye).toBe(0);
    // a spot that was due does not appear unseen either
    const due = on(1, 'normal', (s) => (s.weak = { ...s.weak, in: 1 }));
    due.setWatching(false);
    for (let i = 0; i < 100; i++) expect(due.tick(0.1).weakAppeared).toBe(false);
    expect(due.toSave().weak.in).toBe(1);
    due.setWatching(true);
    due.tick(0.9);
    expect(due.weakSpot).toBeNull();
    expect(due.tick(0.2).weakAppeared).toBe(true);
  });

  it('pausing the weak spots touches no other stream: the dig behind the museum is the same dig', () => {
    const mk = (): DigSim => new DigSim(8, saveWith((s) => (s.levels.assistant = 15)));
    const seen = mk();
    const unseen = mk();
    unseen.setWatching(false);
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < 3000; i++) {
      for (const f of seen.tick(0.1).finds) a.push(f.fossil.id);
      for (const f of unseen.tick(0.1).finds) b.push(f.fossil.id);
    }
    expect(a.length).toBeGreaterThan(50);
    expect(b).toEqual(a);
    expect(unseen.toSave().rng).toBe(seen.toSave().rng);
    expect(unseen.dust).toBe(seen.dust);
    expect(unseen.glint).toEqual(seen.glint);
  });
});

describe(`precise hits: ×${WEAK.mult} damage for that tap, up to ×${WEAK.maxMult} with a sharp eye`, () => {
  it('a tap on the spot deals ×4 and uses it up; a tap elsewhere or without a position is a normal tap', () => {
    const sim = on(1);
    waitSpot(sim);
    const spot = { ...sim.weakSpot! };
    expect(sim.weakMult).toBe(WEAK.mult);
    // elsewhere: a normal tap, and missing costs nothing
    const far = { x: spot.x > 0.5 ? spot.x - 0.4 : spot.x + 0.4, y: spot.y };
    const miss = sim.tap(far);
    expect(miss.precise).toBe(false);
    expect(miss.damage).toBe(sim.digPower);
    const blind = sim.tap();
    expect(blind.precise).toBe(false);
    expect(blind.damage).toBe(sim.digPower);
    expect(sim.weakSpot).not.toBeNull();
    expect(sim.sharpEye).toBe(0);
    // on it
    const hit = sim.tap(spot);
    expect(hit.precise).toBe(true);
    expect(hit.sharp).toBe(1);
    expect(hit.damage).toBe(sim.digPower * WEAK.mult);
    expect(sim.weakSpot).toBeNull();
    expect(sim.preciseHits).toBe(1);
    // used up: the same place is a normal tap now
    expect(sim.tap(spot).precise).toBe(false);
  });

  it(`counts as on the spot within ${WEAK.radius} of it (block-relative), not beyond`, () => {
    const sim = on(1);
    waitSpot(sim);
    const s = sim.weakSpot!;
    expect(sim.onWeak({ x: s.x + WEAK.radius * 0.95, y: s.y })).toBe(true);
    expect(sim.onWeak({ x: s.x, y: s.y - WEAK.radius * 0.95 })).toBe(true);
    expect(sim.onWeak({ x: s.x + WEAK.radius * 1.05, y: s.y })).toBe(false);
    expect(sim.onWeak({ x: Number.NaN, y: s.y })).toBe(false);
    expect(sim.onWeak()).toBe(false);
  });

  it('sharp eye: precise hits in a row deal ×4, ×4.5, ×5, ×5.5, ×6 and stay at ×6; a spot left to expire ends it', () => {
    const sim = on(3, 'normal', () => {}, 400);
    const seen: number[] = [];
    for (let n = 0; n < 7; n++) {
      waitSpot(sim);
      const shown = sim.weakMult; // what the screen says before the tap
      const r = sim.tap(sim.weakSpot!);
      expect(r.precise).toBe(true);
      expect(r.sharp).toBe(n + 1);
      expect(r.damage).toBe(sim.digPower * shown);
      seen.push(shown);
    }
    expect(seen).toEqual([4, 4.5, 5, 5.5, 6, 6, 6]);
    expect(sim.sharpEye).toBe(7);
    // a normal tap in between does not break it
    sim.tap();
    expect(sim.sharpEye).toBe(7);
    // letting one expire does
    waitSpot(sim);
    while (sim.weakSpot) sim.tick(0.05);
    expect(sim.sharpEye).toBe(0);
    expect(sim.weakMult).toBe(WEAK.mult);
  });

  it('stacks with what the tap already had: fever ×2, and a charged strike on a hard vein', () => {
    const fever = on(1, 'normal', (s) => (s.fever = FEVER.seconds));
    waitSpot(fever);
    expect(fever.tap(fever.weakSpot!).damage).toBe(fever.digPower * FEVER.damage * WEAK.mult);
    const swamp = LAYERS.findIndex((l) => l.twist === 'vein');
    const vein = on(swamp, 'vein');
    waitSpot(vein);
    const spot = { ...vein.weakSpot! };
    expect(vein.charge(VEIN.fullHold).precise).toBe(false); // no position: a plain charged strike
    const r = vein.charge(VEIN.fullHold, spot);
    expect(r.precise).toBe(true);
    expect(r.damage).toBeCloseTo(vein.digPower * VEIN.maxCharge * WEAK.mult, 6);
  });

  it('the assistant and time away never use it', () => {
    const sim = on(1, 'normal', (s) => (s.levels.assistant = 20));
    waitSpot(sim);
    const before = sim.blockDamage;
    const power = sim.digPower;
    const r = sim.tick(0.5); // one assistant hit at 2/s
    expect(r.assistantHits).toBe(1);
    expect(sim.blockDamage - before).toBe(power);
    expect(sim.weakSpot).not.toBeNull();
    const haul = sim.claimOffline(600);
    expect(haul.hits).toBeGreaterThan(0);
    expect(sim.preciseHits).toBe(0);
    expect(sim.weakSpot).not.toBeNull();
  });
});

describe('weak spots leave luck and odds alone (honesty)', () => {
  it('a precise hit that breaks the block rolls at the luck on screen before it', () => {
    const sim = on(1, 'normal', (s) => {
      s.levels.luck = 3;
      s.counts['topsoil-01'] = [0, 0, 0, 1e6]; // every hit breaks
    });
    let checked = 0;
    for (let i = 0; i < 4000 && checked < 25; i++) {
      sim.tap();
      sim.tick(0.1);
      if (!sim.weakSpot) continue;
      const shown = { luck: sim.luck, base: sim.baseLuck, glint: sim.glintLuck, assistant: sim.assistantLuck };
      const r = sim.tap(sim.weakSpot);
      expect(r.precise).toBe(true);
      expect(r.find!.luck).toBeCloseTo(shown.luck, 12);
      expect(r.find!.source).toBe('tap');
      // nothing a precise hit does moves any luck (the tap itself raises the combo, as always)
      expect(sim.baseLuck).toBe(shown.base);
      expect(sim.assistantLuck).toBe(shown.assistant);
      checked++;
    }
    expect(checked).toBe(25);
  });

  it('finds from precise hits follow the printed table (chi-square at the luck each find carries)', () => {
    const fs = layerFossils(1);
    const n = new Map(fs.map((f) => [f.id, 0]));
    const exp: number[] = [];
    let N = 0;
    const sim = on(1, 'normal', (s) => (s.counts['topsoil-01'] = [0, 0, 0, 1e6]));
    while (N < 2500) {
      sim.tick(0.5);
      if (!sim.weakSpot) continue;
      const f = sim.tap(sim.weakSpot).find!;
      if (f.pity) continue;
      rollProbabilities(1, f.luck).forEach((q, i) => (exp[i] = (exp[i] ?? 0) + q));
      n.set(f.fossil.id, (n.get(f.fossil.id) ?? 0) + 1);
      N++;
    }
    let chi = 0;
    fs.forEach((f, i) => {
      const e = at(exp, i);
      if (e < 5) return;
      chi += ((n.get(f.id) ?? 0) - e) ** 2 / e;
    });
    expect(chi).toBeLessThan(40);
  }, 60_000);
});

describe('weak spots in the save', () => {
  it('round-trips mid-spot and keeps showing the same spots', () => {
    const a = on(0);
    waitSpot(a);
    a.tap(a.weakSpot!);
    waitSpot(a);
    a.tick(0.4);
    const b = new DigSim(999, JSON.parse(JSON.stringify(a.toSave())) as DigSave);
    expect(b.toSave()).toEqual(a.toSave());
    expect(b.weakSpot).toEqual(a.weakSpot);
    expect(b.sharpEye).toBe(1);
    for (let i = 0; i < 400; i++) {
      a.tick(0.05);
      b.tick(0.05);
      expect(b.weakSpot).toEqual(a.weakSpot);
    }
  });

  it('a save from before weak spots loads with nothing lost and the first spot scheduled', () => {
    // exactly what the build before this round wrote: no `weak`, no `rush`
    const old = (() => {
      const sim = new DigSim(7);
      for (let i = 0; i < 300; i++) sim.tap();
      const d = sim.toSave() as unknown as Record<string, unknown>;
      delete d.weak;
      delete d.rush;
      return d;
    })();
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: SAVE_VERSION, data: old }) });
    const store = createSaveStore(saveOptions(storage, 'test'));
    expect(store.status).toBe('loaded'); // same version: no migration needed
    const sim = new DigSim(1, store.data);
    const s = sim.toSave();
    for (const key of Object.keys(old)) expect(s[key as keyof DigSave], key).toEqual(old[key]);
    expect(sim.weakSpot).toBeNull();
    expect(sim.sharpEye).toBe(0);
    expect(s.weak.in).toBeGreaterThanOrEqual(WEAK.minGap);
    expect(s.weak.in).toBeLessThanOrEqual(WEAK.maxGap);
    expect(waitSpot(sim)).toBeLessThanOrEqual(WEAK.maxGap + 0.1);
  });

  it('repairs junk instead of crashing', () => {
    const junk = { ...defaultSave(), weak: { in: Number.NaN, gap: -4, spot: { x: 9, y: 'no', life: 5 }, cell: 99, streak: -3, hits: 1.5, rng: 0.5 } } as unknown as DigSave;
    const sim = new DigSim(1, junk);
    const w = sim.toSave().weak;
    expect(sim.weakSpot).toBeNull();
    expect(w.cell).toBeLessThanOrEqual(8);
    expect(w.streak).toBe(0);
    expect(w.hits).toBe(1);
    expect(w.gap).toBeGreaterThanOrEqual(0);
    const far = new DigSim(1, { ...defaultSave(), weak: { in: 3, gap: 7, spot: { x: 5, y: -5, life: 99 }, cell: 2, streak: 2, hits: 4, rng: 77 } });
    expect(far.weakSpot).toEqual({ x: 0.85, y: 0.15, life: WEAK.life });
  });
});
