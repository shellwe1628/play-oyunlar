/**
 * The depth map and the small presentation models of this round (pure, src/fx/model.ts): what
 * the map prints is read off the sim and reading it changes nothing.
 */
import { describe, expect, it } from 'vitest';
import { mapBands, rushClock, rushHaptic, sharpPips, travelDir, waitParts, weakRing, type SimView } from '../../src/fx/model';
import { at, LAYERS, RUSH, WEAK } from '../../src/sim/data';
import { DigSim, defaultSave, type DigSave } from '../../src/sim/dig';
import { layerFossils } from '../../src/sim/loot';
import { STRINGS } from '../../src/strings';

/** A dig some way down: Topsoil complete, a few finds below, layer 3 open, digging in layer 2. */
function midway(mut: (s: DigSave) => void = () => {}): DigSim {
  const s = defaultSave();
  for (const f of layerFossils(0)) s.counts[f.id] = [1, 0, 0, 0];
  for (const f of layerFossils(1).slice(0, 5)) s.counts[f.id] = [2, 0, 0, 0];
  s.counts[at(layerFossils(2), 8).id] = [1, 0, 0, 0];
  s.counts[at(layerFossils(2), 2).id] = [1, 0, 0, 0];
  s.unlocked = 3;
  s.layer = 2;
  mut(s);
  return new DigSim(5, s);
}

describe('depth map: a read-only picture of the dig', () => {
  it('has one band per layer, top to bottom, with what each one prints', () => {
    const sim = midway();
    const bands = mapBands(sim);
    expect(bands.map((b) => b.id)).toEqual(LAYERS.map((l) => l.id));
    expect(bands.map((b) => b.twist)).toEqual(LAYERS.map((l) => l.twist));
    // open down to the deepest unlocked layer; exactly one current, exactly one "next"
    expect(bands.map((b) => b.open)).toEqual(LAYERS.map((_, i) => i <= 3));
    expect(bands.filter((b) => b.current).map((b) => b.layer)).toEqual([2]);
    expect(bands.filter((b) => b.next).map((b) => b.layer)).toEqual([4]);
    // set progress and the tick
    expect(bands.slice(0, 4).map((b) => `${b.found}/${b.total}`)).toEqual(['12/12', '5/12', '2/12', '0/12']);
    expect(bands.map((b) => b.complete)).toEqual(LAYERS.map((_, i) => i === 0));
    // the rarest species found in each layer (never one from another layer)
    expect(at(bands, 0).rarest).toBe(at(layerFossils(0), 11)); // 1 in 1,200
    expect(at(bands, 1).rarest).toBe([...layerFossils(1).slice(0, 5)].sort((a, b) => b.odds - a.odds)[0]);
    expect(at(bands, 2).rarest).toBe(at(layerFossils(2), 8));
    expect(at(bands, 3).rarest).toBeNull();
    for (const b of bands) if (b.rarest) expect(b.rarest.layer).toBe(b.layer);
  });

  it('a locked band shows the dig power that opens it, and the next one how far you are', () => {
    const sim = midway();
    const bands = mapBands(sim);
    for (const b of bands) expect(b.unlockPower).toBe(sim.unlockPowerOf(b.layer));
    for (const b of bands.filter((x) => x.open)) expect(b.progress).toBe(1);
    const next = at(bands, 4);
    expect(next.open).toBe(false);
    expect(next.progress).toBeCloseTo(sim.digPower / at(LAYERS, 4).unlockPower, 12);
    expect(next.progress).toBeGreaterThan(0);
    expect(next.progress).toBeLessThan(1);
  });

  it('after an expedition the thresholds are the deeper stratum, as the sim itself uses them', () => {
    const sim = midway((s) => (s.expedition = { count: 2, runStart: 0, best: 100 }));
    expect(sim.strataMult).toBe(2.2);
    expect(at(mapBands(sim), 4).unlockPower).toBe(at(LAYERS, 4).unlockPower * 2.2);
  });

  it('the museum is kept through an expedition: a locked band can still show its set count', () => {
    const sim = midway((s) => {
      s.unlocked = 0;
      s.layer = 0;
      s.discovered = Object.keys(s.counts);
      s.counts = {};
    });
    const bands = mapBands(sim);
    expect(at(bands, 1).open).toBe(false);
    expect(at(bands, 1).found).toBe(5);
    expect(at(bands, 0).complete).toBe(true);
  });

  it('reading the map changes nothing: same save before and after, and the view has no way to act', () => {
    const sim = midway();
    for (let i = 0; i < 50; i++) {
      sim.tap();
      sim.tick(0.1);
    }
    const before = sim.toSave();
    const view: SimView = sim;
    for (let i = 0; i < 20; i++) mapBands(view);
    expect(sim.toSave()).toEqual(before);
    // the view is getters and pure queries only: nothing on it starts a rush, taps or travels
    const members: (keyof SimView)[] = ['unlockPowerOf', 'expeditions', 'strataMult', 'weakSpot', 'weakMult', 'sharpEye', 'rushOpen', 'rushReady', 'rushActive', 'rushLeft', 'rushBlocks', 'rushFinds', 'rushBest', 'rushWait'];
    for (const m of members) expect(['tap', 'travel', 'startRush', 'stopRush', 'tick', 'buy', 'charge']).not.toContain(m);
    for (const m of members) void view[m];
    expect(sim.toSave()).toEqual(before);
  });

  it('every twist and every map text has a name in both languages', () => {
    const en = STRINGS.en as Record<string, string>;
    const tr = STRINGS.tr as Record<string, string>;
    for (const L of LAYERS) {
      if (L.twist === 'none') continue;
      expect(en[`twist.${L.twist}`], L.twist).toBeTruthy();
      expect(tr[`twist.${L.twist}`], L.twist).toBeTruthy();
    }
    for (const key of ['map.title', 'map.here', 'map.locked', 'map.progress', 'map.rarest', 'map.none', 'map.stratum', 'tip.weak', 'tip.sharp', 'tip.rush', 'rush.luck', 'rush.status']) {
      expect(en[key], key).toBeTruthy();
      expect(tr[key], key).toBeTruthy();
    }
    // the rule texts say the numbers the sim uses
    expect(en['tip.weak']).toContain(`×${WEAK.mult}`);
    expect(en['tip.sharp']).toContain(`×${WEAK.maxMult}`);
    expect(en['tip.rush']).toContain(`${RUSH.seconds} seconds`);
    expect(en['rush.cool']).toContain(`${RUSH.cooldown / 3600} hours`);
    expect(tr['tip.weak']).toContain(`×${WEAK.mult}`);
    expect(tr['tip.rush']).toContain(`${RUSH.seconds} saniye`);
    // what rests during a rush is said where the player decides: the tip and the start card
    for (const key of ['tip.rush', 'rush.ask.rest']) {
      expect(en[key], key).toMatch(/relic/i);
      expect(en[key], key).toMatch(/boss/i);
      expect(en[key], key).toMatch(/special blocks/i);
      expect(tr[key], key).toMatch(/kalıntı/i);
      expect(tr[key], key).toMatch(/patron/i);
    }
    expect(en['rush.ask.rest']).toMatch(/minute/);
    expect(tr['rush.ask.rest']).toMatch(/dakika/);
    expect(en['rush.ask.time']).toContain('{s} seconds');
    expect(en['rush.ask.luck']).toContain('×{n}');
    expect(en['rush.away']).toBeTruthy();
    expect(tr['rush.away']).toBeTruthy();
  });

  it('travel direction: down to a deeper band, up to a shallower one', () => {
    expect(travelDir(2, 5)).toBe(1);
    expect(travelDir(5, 2)).toBe(-1);
  });
});

describe('weak spot, sharp eye and rush clock (what the screen shows)', () => {
  it('the target ring closes in as the spot runs out and blinks at the end', () => {
    expect(weakRing(WEAK.life)).toEqual({ open: 1, blink: false });
    expect(weakRing(WEAK.life / 2).open).toBeCloseTo(0.5, 9);
    expect(weakRing(WEAK.life * 0.2).blink).toBe(true);
    expect(weakRing(0)).toEqual({ open: 0, blink: true });
    expect(weakRing(99).open).toBe(1);
  });

  it('five pips: one per step from ×4 to ×6', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 40].map(sharpPips)).toEqual([0, 1, 2, 3, 4, 5, 5, 5]);
    // the pips are the steps of the sim's own multiplier
    const s = defaultSave();
    s.counts['topsoil-01'] = [0, 0, 0, 1];
    s.glintIn = 1e6;
    const sim = new DigSim(3, s);
    const mults: number[] = [];
    for (let n = 0; n < 6; n++) {
      while (!sim.weakSpot) sim.tick(0.1);
      mults.push(sim.weakMult);
      sim.tap(sim.weakSpot);
      expect(sharpPips(sim.sharpEye)).toBe(Math.min(5, n + 1));
    }
    expect(mults).toEqual([4, 4.5, 5, 5.5, 6, 6]);
  });

  it('the rush clock shows whole seconds, drains its ring and pulses in the last 10 s', () => {
    expect(rushClock(RUSH.seconds)).toEqual({ seconds: RUSH.seconds, share: 1, last: false });
    expect(rushClock(10.4)).toEqual({ seconds: 11, share: 10.4 / RUSH.seconds, last: false });
    expect(rushClock(10).last).toBe(true);
    expect(rushClock(0.2)).toEqual({ seconds: 1, share: 0.2 / RUSH.seconds, last: true });
    expect(rushClock(0)).toEqual({ seconds: 0, share: 0, last: false });
  });

  it('the cooldown reads as hours and minutes, then minutes, then seconds (never 0 while waiting, never "60 min")', () => {
    expect(waitParts(RUSH.cooldown)).toEqual({ unit: 'h', h: 3, m: 0, s: 0 });
    expect(waitParts(2 * 3600 + 58 * 60 + 2)).toMatchObject({ unit: 'h', h: 2, m: 59 }); // minutes round up
    expect(waitParts(3600)).toMatchObject({ unit: 'h', h: 1, m: 0 });
    expect(waitParts(3599)).toMatchObject({ unit: 'h', h: 1, m: 0 }); // not "60 min"
    expect(waitParts(3541)).toMatchObject({ unit: 'h', h: 1, m: 0 });
    expect(waitParts(3540)).toMatchObject({ unit: 'm', m: 59 });
    expect(waitParts(61)).toMatchObject({ unit: 'm', m: 2 });
    expect(waitParts(60)).toMatchObject({ unit: 'm', m: 1 });
    expect(waitParts(59.2)).toMatchObject({ unit: 'm', m: 1 });
    expect(waitParts(58.9)).toMatchObject({ unit: 's', s: 59 });
    expect(waitParts(0.4)).toMatchObject({ unit: 's', s: 1 });
    expect(waitParts(0)).toMatchObject({ unit: 's', s: 0 });
    for (let t = 0; t <= RUSH.cooldown; t += 7) expect(waitParts(t).m).toBeLessThan(60);
  });

  it('haptics in a rush: a tick on every fifth block at most', () => {
    expect([0, 1, 2, 4, 5, 6, 9, 10, 225].map(rushHaptic)).toEqual([false, false, false, false, true, false, false, true, true]);
    let ticks = 0;
    for (let n = 1; n <= 225; n++) if (rushHaptic(n)) ticks++;
    expect(ticks).toBe(45); // a rush of 225 blocks: 45 ticks in 45 s, where normal play would give 225
  });
});
