/**
 * Scripted players for the Dig Rush balance guard. They tap and shop the way the pacing profiles
 * do (tests/unit/policy.ts, which stays as it is and never rushes or aims at weak spots):
 *
 * fast:   5 taps/s without pause, every glint after 0.6 s, the cheapest of pick/luck/assistant the
 *         moment it is affordable, a 0.8 s hold on hard veins, every star core.
 * casual: 2.5 taps/s in 7 s bursts with 3 s pauses, glints only while tapping (1.2 s), the
 *         leftmost affordable upgrade every 5 s, a 0.6 s hold on veins, every other star core.
 *
 * Here they stay on one layer (no travel, no expedition) so that a rush and normal play can be
 * compared from the same save. `aim` adds what the pacing profiles never do: tapping the weak
 * spot whenever one is up (a player at their best).
 */
import { at, LAYERS, RUSH, UPGRADE_ORDER, type UpgradeId } from '../../src/sim/data';
import { DigSim, defaultSave, type DigSave } from '../../src/sim/dig';
import { layerFossils } from '../../src/sim/loot';
import type { Profile } from './policy';

export interface Played {
  /** Blocks broken by anyone: rush blocks by your taps, normal blocks by taps and by the assistant. */
  blocks: number;
  dust: number;
  rolls: number;
  taps: number;
  seconds: number;
}

export interface PlayOptions {
  /** Tap the weak spot whenever one is up. */
  aim?: boolean;
  /** false = never shops (a player with no assistant stays without one). */
  buy?: boolean;
  /** Stop when the rush in progress ends (for measuring one rush). */
  untilRushEnds?: boolean;
  /** Clock offset for the casual bursts. */
  t0?: number;
  /** Called every step (travel decisions of the caller). */
  each?: (sim: DigSim, t: number) => void;
}

const DT = 0.1;

export function play(sim: DigSim, profile: Profile, seconds: number, opts: PlayOptions = {}): Played {
  const casual = profile === 'casual';
  const rate = casual ? 2.5 : 5;
  const reaction = casual ? 1.2 : 0.6;
  const holdFor = casual ? 0.6 : 0.8;
  const out: Played = { blocks: 0, dust: 0, rolls: 0, taps: 0, seconds: 0 };
  const dust0 = sim.dust;
  const rolls0 = sim.stats.rolls;
  // normal blocks (taps or the assistant) harden the stratum and are counted there; rush blocks are not
  const hardened = (): number => LAYERS.reduce((n, _, l) => n + sim.blocksBroken(l), 0);
  const hardened0 = hardened();
  let rushBreaks = 0;
  let spent = 0;
  let tapAcc = 0;
  let hold = 0;
  let aimed = 0;
  let glintSeenAt = -1;
  let nextShop = 0;
  const steps = Math.round(seconds / DT);
  for (let i = 1; i <= steps; i++) {
    const t = (opts.t0 ?? 0) + i * DT;
    const active = !casual || t % 10 < 7;
    if (active && sim.block.kind === 'vein') {
      hold += DT;
      if (hold >= holdFor - 1e-9) {
        const r = sim.charge(hold, opts.aim ? (sim.weakSpot ?? undefined) : undefined);
        hold = 0;
        out.taps++;
        void r;
      }
    } else if (active) {
      hold = 0;
      tapAcc += rate * DT;
      while (tapAcc >= 1) {
        tapAcc -= 1;
        aimed += 1;
        const core = !casual || aimed % 2 === 0 ? (sim.meteorCore ?? undefined) : undefined;
        const inRush = sim.rushActive;
        const r = sim.tap(opts.aim && sim.weakSpot ? sim.weakSpot : core);
        out.taps++;
        if (r.broke && inRush) rushBreaks++;
        if (sim.block.kind === 'vein') break;
      }
    }
    sim.tick(DT);
    if (sim.glint && active) {
      if (glintSeenAt < 0) glintSeenAt = t;
      if (t - glintSeenAt >= reaction) {
        sim.tapGlint();
        glintSeenAt = -1;
      }
    } else glintSeenAt = -1;
    if (opts.buy === false) {
      // no shopping
    } else if (casual) {
      if (t >= nextShop) {
        nextShop = t + 5;
        const pick = UPGRADE_ORDER.find((id) => sim.canBuy(id));
        const cost = pick ? (sim.upgradeCost(pick) ?? 0) : 0;
        if (pick && sim.buy(pick)) spent += cost;
      }
    } else {
      for (;;) {
        let best: UpgradeId | null = null;
        for (const id of UPGRADE_ORDER) {
          if (id === 'offline') continue;
          const c = sim.upgradeCost(id);
          if (c === null) continue;
          if (best === null || c < (sim.upgradeCost(best) ?? Infinity)) best = id;
        }
        const cost = best ? (sim.upgradeCost(best) ?? 0) : 0;
        if (best === null || !sim.buy(best)) break;
        spent += cost;
      }
    }
    opts.each?.(sim, t);
    out.seconds = i * DT;
    if (opts.untilRushEnds && !sim.rushActive) break;
  }
  out.blocks = hardened() - hardened0 + rushBreaks;
  out.dust = sim.dust - dust0 + spent;
  out.rolls = sim.stats.rolls - rolls0;
  return out;
}

/**
 * The save of a player who has just settled on `layer`: played from a new dig, going deeper as
 * soon as a layer opens, then `settle` seconds on `layer` (for layer 0: until the rush is first
 * offered). Null if the layer was not reached within `maxMinutes`.
 */
export function saveOn(seed: number, profile: Profile, layer: number, settle = 120, maxMinutes = 600): DigSave | null {
  const sim = new DigSim(seed);
  let t = 0;
  const each = (s: DigSim): void => {
    if (s.layer < Math.min(layer, s.unlocked)) s.travel(Math.min(layer, s.unlocked));
  };
  while (t < maxMinutes * 60) {
    if (layer === 0 ? sim.rushOpen : sim.layer === layer) break;
    play(sim, profile, 1, { t0: t, each });
    t += 1;
  }
  if (layer === 0 ? !sim.rushOpen : sim.layer !== layer) return null;
  if (layer > 0) play(sim, profile, settle, { t0: t });
  return sim.toSave();
}

/**
 * A save with no assistant and no upgrades, parked on `layer`, where a normal block takes
 * exactly `taps` taps (the rush is on offer; golden blocks may appear).
 */
export function flatSave(layer: number, taps: number): DigSave {
  const s = defaultSave();
  for (const f of layerFossils(0).slice(0, RUSH.species)) s.counts[f.id] = [1, 0, 0, 0];
  const base = new DigSim(1, structuredClone(s)).digPower; // bare hands + those four
  const need = Math.max(0, Math.ceil(at(LAYERS, layer).hp / taps) - base);
  // topsoil-01: a plain copy is worth 1 dig power, a gold one 64
  const id = at(layerFossils(0), 0).id;
  const have = s.counts[id] ?? [0, 0, 0, 0];
  s.counts[id] = [(have[0] ?? 0) + (need % 64), 0, 0, Math.floor(need / 64)];
  s.unlocked = layer;
  s.layer = layer;
  s.stats.rolls = 400;
  s.stats.taps = 400;
  return s;
}

export interface RushMeasure {
  layer: number;
  profile: Profile;
  /** One rush, four minutes of normal play, and normal play for as long as the rush took: all from the same save. */
  rush: Played;
  normal: Played;
  same: Played;
  /** Finds of the rush against finds of the same seconds of normal play (1 = no better than not rushing). */
  gain: number;
  /** One rush in minutes of normal play: by blocks broken, by dust, by finds. */
  minutesByBlocks: number;
  minutesByDust: number;
  minutesByRolls: number;
}

export function measureRush(save: DigSave, profile: Profile, aim = false, seed = 1, buy = true): RushMeasure {
  const a = new DigSim(seed, structuredClone(save));
  const normal = play(a, profile, 240, { aim, buy });
  const b = new DigSim(seed, structuredClone(save));
  if (!b.startRush()) throw new Error('rush not ready');
  const rush = play(b, profile, 600, { aim, buy, untilRushEnds: true });
  const c = new DigSim(seed, structuredClone(save));
  const same = play(c, profile, rush.seconds, { aim, buy });
  const per = (x: number, y: number): number => (y > 0 ? x / (y / 4) : Infinity);
  return {
    layer: save.layer,
    profile,
    rush,
    normal,
    same,
    gain: same.rolls > 0 ? rush.rolls / same.rolls : Infinity,
    minutesByBlocks: per(rush.blocks, normal.blocks),
    minutesByDust: per(rush.dust, normal.dust),
    minutesByRolls: per(rush.rolls, normal.rolls),
  };
}
