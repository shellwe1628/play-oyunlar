/**
 * Track builder (pure): a cursor climbs the shaft and emits corridor vertices (centre c,
 * half-width h), hazards, gates and gems. Every pattern starts and ends at the cursor's current
 * centre, so patterns chain; level and endless generators keep segments port-to-port.
 */
import { BEAT_PX, DT, SHAFT_W, START_X } from './constants';
import { kinAdvance, kinSpeed, kinStart, type Kin, type KinSource } from './run';
import type { Bar, Block, Gate, GateKind, Gem, Laser, Pill, Portal, Section, Spinner, Track, Twist, Wind, Zone } from './track';

export interface BuilderOptions {
  speed: number;
  creep?: number;
  maxSpeed?: number;
  /** Corridor half-width at the start. */
  startH?: number;
  /** Launch ramp (see RAMP_PX). */
  ramp?: boolean;
}

/** Walls never come closer than this to the screen edge (px), so a wall is always visible. */
export const EDGE_MIN = 26;

export class TrackBuilder {
  y = 0;
  c = START_X;
  h: number;
  private readonly vy: number[] = [];
  private readonly vc: number[] = [];
  private readonly vh: number[] = [];
  private readonly blockList: Block[] = [];
  private readonly barList: Bar[] = [];
  private readonly gates: Gate[] = [];
  private readonly gems: Gem[] = [];
  readonly pills: Pill[] = [];
  readonly lasers: Laser[] = [];
  readonly spinners: Spinner[] = [];
  readonly winds: Wind[] = [];
  readonly portals: Portal[] = [];
  readonly mirrors: Zone[] = [];
  readonly darks: Zone[] = [];
  /** View twists (presentation only). */
  readonly twists: Twist[] = [];
  readonly sections: Section[] = [];

  private readonly kin: Kin = kinStart();
  private readonly src: KinSource;

  constructor(private readonly opts: BuilderOptions) {
    this.h = opts.startH ?? 200;
    this.src = { speed: this.profile(), gates: this.gates };
    // Below the start, so the screen under the spark shows walls too.
    this.push(-900, this.c, this.h);
    this.push(0, this.c, this.h);
  }

  /** The fastest the speed profile gets without gates (px/s). */
  get topSpeed(): number {
    return this.opts.maxSpeed ?? this.opts.speed;
  }

  private profile(): Track['speed'] {
    const o = this.opts;
    return { base: o.speed, creep: o.creep ?? 0, max: o.maxSpeed ?? o.speed, ...(o.ramp ? { ramp: true } : {}) };
  }

  private push(y: number, c: number, h: number): void {
    const n = this.vy.length;
    if (n > 0 && y <= this.vy[n - 1]! + 1e-9) {
      // Same y: replace (keeps y strictly ascending).
      this.vc[n - 1] = c;
      this.vh[n - 1] = h;
      return;
    }
    this.vy.push(y);
    this.vc.push(c);
    this.vh.push(h);
  }

  /** Move the cursor dy up, linearly to centre c2 and half-width h2. */
  to(dy: number, c2: number, h2: number = this.h): this {
    if (dy <= 0) return this;
    this.y += dy;
    this.c = c2;
    this.h = h2;
    this.push(this.y, c2, h2);
    return this;
  }

  /** Width change over a short taper (slope ≤ 0.6 per wall), without moving the centre. */
  taper(h: number): this {
    const dh = Math.abs(h - this.h);
    if (dh < 1e-9) return this;
    return this.to(Math.max(30, dh / 0.6), this.c, h);
  }

  /** Vertical corridor of half-width h for len px (a taper, if needed, takes up to half of it). */
  straight(len: number, h: number = this.h): this {
    const dh = Math.abs(h - this.h);
    if (dh > 1e-9) {
      const t = Math.min(len * 0.5, Math.max(30, dh / 0.6));
      this.to(t, this.c, h);
      return this.to(len - t, this.c, h);
    }
    return this.to(len, this.c, h);
  }

  /** Slanted corridor: the centre moves dir·slope px sideways per px climbed. */
  diag(len: number, dir: 1 | -1, slope = 1): this {
    return this.to(len, this.c + dir * slope * len, this.h);
  }

  /** Corridor that moves sideways by dx, at the given slope. */
  shift(dx: number, slope = 1): this {
    if (dx === 0) return this;
    return this.to(Math.abs(dx) / slope, this.c + dx, this.h);
  }

  /**
   * Zigzag: legs of horizontal travel `leg` at 45° (slope 1) or gentler; the centre swings
   * between c - leg/2 and c + leg/2 and comes back to c. Forces one direction change per leg.
   * Returns the corner points (for gem placement).
   */
  zig(legs: number, leg: number, h: number, first: 1 | -1 = -1, slope = 1, funnel = false): this {
    // A funnel narrows along the first half-leg (already on the 45° line) and widens back along
    // the last one, instead of a vertical taper that would force a wiggle before the run.
    const hEnd = this.h;
    if (!funnel) this.taper(h);
    const c0 = this.c;
    let dir = first;
    this.corners = [];
    this.to(leg / 2 / slope, c0 + (dir * leg) / 2, h);
    this.corners.push({ x: this.c, y: this.y, side: dir });
    for (let i = 0; i < legs; i++) {
      dir = dir === 1 ? -1 : 1;
      this.to(leg / slope, c0 + (dir * leg) / 2);
      this.corners.push({ x: this.c, y: this.y, side: dir });
    }
    this.to(leg / 2 / slope, c0, funnel ? hEnd : h);
    return this;
  }

  /** Corners of the last zig (corridor centre, and the side the leg was heading to). */
  corners: { x: number; y: number; side: 1 | -1 }[] = [];

  /**
   * Slalom: a vertical corridor of half-width H with spike blocks growing out of alternate walls,
   * leaving a gap g between each block tip and the opposite wall.
   */
  slalom(n: number, spacing: number, H: number, g: number, first: 1 | -1 = -1, s = 44): this {
    this.straight(Math.max(60, spacing * 0.5), H);
    let side = first;
    const y0 = this.y;
    for (let k = 0; k < n; k++) {
      const y = y0 + spacing * k;
      const bx = side === -1 ? this.c + H - g - s : this.c - H + g + s;
      this.blockList.push({ x: bx, y, s });
      side = side === 1 ? -1 : 1;
    }
    return this.straight(spacing * (n - 1) + Math.max(120, spacing * 0.6), H);
  }

  /**
   * Sim time (s) of the first tick at which the spark reaches height y. Exact: the climb does not
   * depend on input, and this runs the same kinematics as RunSim. Gates must already be placed.
   */
  arrivalTime(y: number): number {
    const k = this.kin;
    while (k.y < y) kinAdvance(this.src, k, kinSpeed(this.src, k));
    return k.tick * DT;
  }

  /**
   * Moving bars across a vertical corridor of half-width H. Each bar's capsule touches the walls
   * at the ends of its swing. Phases are set from the exact crossing time so that, when the spark
   * reaches a bar, the bar is swinging out to alternate sides (first, -first, ...): a rhythm the
   * player reads from the swing, not luck.
   */
  bars(n: number, spacing: number, H: number, period: number, half: number, thick = 12, first: 1 | -1 = 1, reach = 0.92): this {
    this.straight(Math.max(80, spacing * 0.6), H);
    const y0 = this.y;
    const amp = Math.max(0, H - half - thick);
    let side = first;
    for (let k = 0; k < n; k++) {
      const y = y0 + spacing * k;
      const tk = this.arrivalTime(y);
      const phase = Math.asin(reach * side) - (2 * Math.PI * tk) / period;
      this.barList.push({ y, x0: this.c, amp, period, phase, half, thick });
      side = side === 1 ? -1 : 1;
    }
    return this.straight(spacing * (n - 1) + Math.max(140, spacing * 0.6), H);
  }

  /** Narrow to hMin and back to the current width. */
  pinch(hMin: number, len: number): this {
    const h0 = this.h;
    const t = Math.max(40, Math.abs(h0 - hMin) / 0.6);
    this.to(t, this.c, hMin);
    this.to(len, this.c, hMin);
    return this.to(t, this.c, h0);
  }

  /** Gate across the corridor on the next beat line (extends the corridor straight to it). */
  gate(kind: GateKind): this {
    const gy = Math.ceil(this.y / BEAT_PX - 1e-9) * BEAT_PX;
    if (gy > this.y) this.to(gy - this.y, this.c, this.h);
    this.gates.push({ y: gy, kind });
    return this;
  }

  addBlock(x: number, y: number, s: number): this {
    this.blockList.push({ x, y, s });
    return this;
  }

  addBar(bar: Bar): this {
    this.barList.push(bar);
    return this;
  }

  addGem(x: number, y: number): this {
    this.gems.push({ x, y });
    return this;
  }

  /** Close the track: the finish ring is at the cursor; an outro corridor follows it. */
  finish(outro = 1800): Track {
    const length = this.y;
    this.to(outro, this.c, this.h);
    const n = this.vy.length;
    const wy = new Float64Array(n);
    const lx = new Float64Array(n);
    const rx = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      wy[i] = this.vy[i]!;
      lx[i] = this.vc[i]! - this.vh[i]!;
      rx[i] = this.vc[i]! + this.vh[i]!;
    }
    const byY = <T extends { y: number }>(a: T[]): T[] => [...a].sort((p, q) => p.y - q.y);
    return {
      length,
      wy,
      lx,
      rx,
      blocks: byY(this.blockList),
      bars: byY(this.barList),
      gates: byY(this.gates),
      gems: byY(this.gems),
      pills: byY(this.pills),
      lasers: byY(this.lasers),
      spinners: byY(this.spinners),
      winds: [...this.winds].sort((p, q) => p.y0 - q.y0),
      portals: byY(this.portals),
      mirrors: [...this.mirrors].sort((p, q) => p.y0 - q.y0),
      darks: [...this.darks].sort((p, q) => p.y0 - q.y0),
      twists: [...this.twists].sort((p, q) => p.y0 - q.y0),
      sections: byY(this.sections),
      speed: this.profile(),
      startX: START_X,
    };
  }
}

/** Walls stay on screen: every vertex has EDGE_MIN ≤ left < right ≤ SHAFT_W - EDGE_MIN. */
export function wallsInBounds(track: Track): boolean {
  for (let i = 0; i < track.wy.length; i++) {
    if (track.lx[i]! < EDGE_MIN - 1e-6 || track.rx[i]! > SHAFT_W - EDGE_MIN + 1e-6) return false;
    if (track.rx[i]! - track.lx[i]! < 20) return false;
  }
  return true;
}
