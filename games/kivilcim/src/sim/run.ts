/**
 * One attempt at a track (pure, fixed tick). step(held) advances exactly one tick of DT:
 *   1. direction from input: held XOR flipped → right, else left (no inertia)
 *   2. move 45°: x += dir·v·DT, y += v·DT
 *   3. gates crossed this tick apply (speed, size, flip)
 *   4. gems by overlap, then collision (signed distance minus radius < 0 → death)
 *   5. near-miss / edge bookkeeping, finish at y ≥ length (progress exactly 1)
 * The vertical motion never depends on input, so the solver can precompute it (kinematics()).
 */
import { DT, EDGE_WINDOW_S, GEM_R, MINI_R, NEAR_PX, NEAR_RELEASE_PX, SPARK_R, SPEED_MULT } from './constants';
import { baseSpeed, sdf, windAt, type Gate, type GateKind, type HazardKind, type Portal, type SdfOut, type SpeedProfile, type Track } from './track';

/** Input-independent part of the run state. */
export interface Kin {
  tick: number;
  y: number;
  mult: number;
  mini: boolean;
  flipped: boolean;
  gateIdx: number;
}

export function kinStart(): Kin {
  return { tick: 0, y: 0, mult: 1, mini: false, flipped: false, gateIdx: 0 };
}

/** Anything with a speed profile and an ascending gate list (a Track, or a builder in progress). */
export interface KinSource {
  speed: SpeedProfile;
  gates: readonly Gate[];
}

export function kinSpeed(src: KinSource, k: Kin): number {
  return baseSpeed(src.speed, k.y) * k.mult;
}

/** Advance the vertical state one tick at speed v; returns the last gate crossed, if any. */
export function kinAdvance(src: KinSource, k: Kin, v: number): GateKind | null {
  k.y += v * DT;
  k.tick += 1;
  let crossed: GateKind | null = null;
  const gates = src.gates;
  while (k.gateIdx < gates.length && gates[k.gateIdx]!.y <= k.y) {
    const kind = gates[k.gateIdx]!.kind;
    k.gateIdx += 1;
    crossed = kind;
    switch (kind) {
      case 'fast':
        k.mult = SPEED_MULT.fast;
        break;
      case 'slow':
        k.mult = SPEED_MULT.slow;
        break;
      case 'normal':
        k.mult = SPEED_MULT.normal;
        break;
      case 'mini':
        k.mini = true;
        break;
      case 'big':
        k.mini = false;
        break;
      case 'flip':
        k.flipped = true;
        break;
      case 'unflip':
        k.flipped = false;
        break;
    }
  }
  return crossed;
}

/** Events of one tick. The same object is reused every step (no allocation in the run loop). */
export interface StepEvents {
  gate: GateKind | null;
  /** Index of the gem taken this tick, or -1. */
  gem: number;
  nearMiss: boolean;
  /** Clearance at the closest point of the near miss just completed (px). */
  nearMin: number;
  died: boolean;
  finished: boolean;
  /** Index of the portal pair taken this tick, or -1. */
  portal: number;
}

/**
 * Portal crossing (pure, shared with the solver): x after passing the line of portal p, or x
 * unchanged when it passes outside both rings.
 */
export function teleport(p: Portal, x: number): number {
  if (Math.abs(x - p.xa) <= p.r) return x - p.xa + p.xb;
  if (Math.abs(x - p.xb) <= p.r) return x - p.xb + p.xa;
  return x;
}

export interface RunOptions {
  startX?: number;
}

export class RunSim {
  track: Track;
  x: number;
  dir: 1 | -1 = -1;
  alive = true;
  finished = false;
  deathCause: HazardKind | null = null;
  /** Clearance after the last step: distance from the spark's edge to the nearest hazard. */
  clearance: number;
  /** Gems taken, one flag per gem index (endless tracks have many). */
  taken: Uint8Array;
  gemsTaken = 0;
  nearMisses = 0;
  /** Edge combo: consecutive near misses within EDGE_WINDOW_S. */
  edge = 0;
  bestEdge = 0;
  style = 0;
  private readonly kin: Kin = kinStart();
  private inNear = false;
  private nearLow = Infinity;
  private lastNearT = -Infinity;
  private readonly ev: StepEvents = { gate: null, gem: -1, nearMiss: false, nearMin: 0, died: false, finished: false, portal: -1 };
  private portalIdx = 0;
  private readonly out: SdfOut = { cause: 'wall' };

  constructor(track: Track, opts: RunOptions = {}) {
    this.track = track;
    this.taken = new Uint8Array(track.gems.length);
    this.x = opts.startX ?? track.startX;
    this.clearance = sdf(track, this.x, 0, 0) - SPARK_R;
  }

  get tick(): number {
    return this.kin.tick;
  }
  get y(): number {
    return this.kin.y;
  }
  /** Sim time in seconds. */
  get t(): number {
    return this.kin.tick * DT;
  }
  get speed(): number {
    return kinSpeed(this.track, this.kin);
  }
  get radius(): number {
    return this.kin.mini ? MINI_R : SPARK_R;
  }
  get mini(): boolean {
    return this.kin.mini;
  }
  get flipped(): boolean {
    return this.kin.flipped;
  }
  get speedMult(): number {
    return this.kin.mult;
  }
  get gateIndex(): number {
    return this.kin.gateIdx;
  }
  get progress(): number {
    if (this.finished) return 1;
    return Math.min(1, Math.max(0, this.kin.y / this.track.length));
  }

  /** Bitmask of the first 31 gems (a level has three). */
  get gemMask(): number {
    let m = 0;
    for (let i = 0; i < Math.min(31, this.taken.length); i++) if (this.taken[i]) m |= 1 << i;
    return m;
  }

  isTaken(i: number): boolean {
    return this.taken[i] === 1;
  }

  /**
   * Swap in a longer version of the same track (endless grows ahead of the spark). The new track
   * must contain the old one as a prefix (same seed, more segments): state carries over as is.
   */
  setTrack(track: Track): void {
    const taken = new Uint8Array(track.gems.length);
    taken.set(this.taken.subarray(0, Math.min(this.taken.length, taken.length)));
    this.taken = taken;
    this.track = track;
  }

  /** Exact copy of this run's state (rewarded "continue" resumes from a snapshot at a gate). */
  clone(): RunSim {
    const c = new RunSim(this.track, { startX: this.x });
    c.dir = this.dir;
    c.alive = this.alive;
    c.finished = this.finished;
    c.deathCause = this.deathCause;
    c.clearance = this.clearance;
    c.taken = this.taken.slice();
    c.gemsTaken = this.gemsTaken;
    c.nearMisses = this.nearMisses;
    c.edge = this.edge;
    c.bestEdge = this.bestEdge;
    c.style = this.style;
    Object.assign(c.kin, this.kin);
    c.inNear = this.inNear;
    c.nearLow = this.nearLow;
    c.lastNearT = this.lastNearT;
    c.portalIdx = this.portalIdx;
    return c;
  }

  /** Direction a given input produces right now (for drawing an instant turn). */
  dirFor(held: boolean): 1 | -1 {
    return held !== this.kin.flipped ? 1 : -1;
  }

  step(held: boolean): StepEvents {
    const ev = this.ev;
    ev.gate = null;
    ev.gem = -1;
    ev.nearMiss = false;
    ev.died = false;
    ev.finished = false;
    ev.portal = -1;
    if (!this.alive || this.finished) return ev;
    const track = this.track;
    const k = this.kin;

    this.dir = held !== k.flipped ? 1 : -1;
    const v = kinSpeed(track, k);
    const w = track.winds.length ? windAt(track, k.y) : 0;
    const vd = v * DT;
    this.x = this.x + this.dir * vd + w * vd;
    ev.gate = kinAdvance(track, k, v);
    const y = k.y;
    const portals = track.portals;
    while (this.portalIdx < portals.length && portals[this.portalIdx]!.y <= y) {
      const p = portals[this.portalIdx]!;
      const x2 = teleport(p, this.x);
      if (x2 !== this.x) ev.portal = this.portalIdx;
      this.x = x2;
      this.portalIdx += 1;
    }
    const t = k.tick * DT;
    const r = k.mini ? MINI_R : SPARK_R;

    const gems = track.gems;
    for (let i = 0; i < gems.length; i++) {
      if (this.taken[i]) continue;
      const g = gems[i]!;
      const dy = g.y - y;
      if (dy > r + GEM_R || dy < -(r + GEM_R)) continue;
      const dx = g.x - this.x;
      if (dx * dx + dy * dy < (r + GEM_R) * (r + GEM_R)) {
        this.taken[i] = 1;
        this.gemsTaken += 1;
        ev.gem = i;
      }
    }

    const c = sdf(track, this.x, y, t, this.out) - r;
    this.clearance = c;
    if (c < 0) {
      this.alive = false;
      this.deathCause = this.out.cause;
      ev.died = true;
      return ev;
    }

    if (this.edge > 0 && t - this.lastNearT > EDGE_WINDOW_S) this.edge = 0;
    if (c < NEAR_PX) {
      this.inNear = true;
      if (c < this.nearLow) this.nearLow = c;
    } else if (this.inNear && c > NEAR_RELEASE_PX) {
      this.inNear = false;
      ev.nearMiss = true;
      ev.nearMin = this.nearLow;
      this.nearLow = Infinity;
      this.nearMisses += 1;
      this.edge = t - this.lastNearT <= EDGE_WINDOW_S ? this.edge + 1 : 1;
      if (this.edge > this.bestEdge) this.bestEdge = this.edge;
      this.lastNearT = t;
      this.style += 10 * this.edge;
    }

    if (y >= track.length) {
      this.finished = true;
      ev.finished = true;
    }
    return ev;
  }
}
