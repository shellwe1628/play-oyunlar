/**
 * One night shift. PURE: no Phaser, no DOM, no Math.random — only the seeded Rng.
 * The scene calls tick / switchCamera / report / hitTest and draws objects(i) / intruders(i).
 */
import { createRng, type Rng } from '@oyun/core/pure';
import { nightParams, SHIFT, SHIFT_SECONDS, type NightParams } from './night';
import { logKey, STATION, VIEW, type AnomalyType, type CameraDef, type IntruderSpot, type ObjectDef } from './station';

export type Phase = 'grace' | 'running' | 'brink' | 'won' | 'lost';

export interface ObjState {
  id: string;
  kind: ObjectDef['kind'];
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  on: boolean;
  scale: number;
  visible: boolean;
  /** Duplicate ("extra") position, or null. */
  copy: { x: number; y: number } | null;
}

export interface IntruderState extends IntruderSpot {
  visible: boolean;
}

export interface Anomaly {
  /** Running number within the shift. */
  id: number;
  camera: number;
  objectId: string;
  type: AnomalyType;
  /** Shift time (s) it appeared. */
  at: number;
}

export type ShiftEvent =
  | { kind: 'spawn'; anomaly: Anomaly }
  | { kind: 'hour'; hour: number }
  | { kind: 'running' }
  | { kind: 'static-end' }
  | { kind: 'brink' }
  | { kind: 'won'; bonus: number }
  | { kind: 'lost' };

export type ReportResult =
  | { kind: 'correct'; anomaly: Anomaly; typeCorrect: boolean; points: number }
  | { kind: 'false' }
  | { kind: 'blind' }
  | { kind: 'ignored' };

export interface ShiftStats {
  correct: number;
  typed: number;
  falseReports: number;
  switches: number;
  secondWind: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Half of the smallest touch target in view px (88 logical px; the view is drawn 1:1). */
const TOUCH_HALF = 44;

export function colorDistance(a: number, b: number): number {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
  const db = (a & 255) - (b & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

function fromDef(d: ObjectDef): ObjState {
  return { id: d.id, kind: d.kind, x: d.x, y: d.y, w: d.w, h: d.h, color: d.color, on: d.on ?? false, scale: 1, visible: true, copy: null };
}

export class ShiftSim {
  readonly params: NightParams;
  readonly station: readonly CameraDef[];
  phase: Phase = 'grace';
  /** Shift time in seconds (0 → SHIFT_SECONDS). Frozen at the brink and after the end. */
  elapsed = 0;
  camera = 0;
  score = 0;
  active: Anomaly[] = [];
  staticLeft = 0;
  brinkLeft = 0;
  /** Logbook keys earned this shift (correct object + correct type). */
  logged: string[] = [];
  stats: ShiftStats = { correct: 0, typed: 0, falseReports: 0, switches: 0, secondWind: false };
  /** Bumps on every visible change, so the renderer redraws only when needed. */
  version = 0;

  private readonly rng: Rng;
  private readonly objs: ObjState[][];
  private readonly ghosts: IntruderState[][];
  private nextSpawn: number;
  private nextId = 1;

  constructor(seed: number, night: number, station: readonly CameraDef[] = STATION) {
    this.params = nightParams(night);
    this.station = station;
    this.rng = createRng(seed).fork('shift');
    this.objs = station.map((c) => c.objects.map(fromDef));
    this.ghosts = station.map((c) => c.intruders.map((s) => ({ ...s, visible: false })));
    this.nextSpawn = SHIFT.grace + this.rng.range(1, 4);
  }

  get night(): number {
    return this.params.night;
  }

  get over(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  objects(camera: number): readonly ObjState[] {
    return this.objs[camera] ?? [];
  }

  intruders(camera: number): readonly IntruderState[] {
    return this.ghosts[camera] ?? [];
  }

  /** In-game clock, 00:00 → 06:00. */
  clock(): { hour: number; minute: number } {
    const total = Math.floor((this.elapsed / SHIFT.hourSeconds) * 60 + 1e-6);
    return { hour: Math.floor(total / 60), minute: total % 60 };
  }

  /** Advance by dt seconds; returns what happened. */
  tick(dt: number): ShiftEvent[] {
    const events: ShiftEvent[] = [];
    if (this.over || dt <= 0) return events;
    if (this.phase === 'brink') {
      this.brinkLeft = Math.max(0, this.brinkLeft - dt);
      if (this.brinkLeft === 0) this.lose(events);
      return events;
    }
    if (this.staticLeft > 0) {
      this.staticLeft = Math.max(0, this.staticLeft - dt);
      if (this.staticLeft === 0) {
        events.push({ kind: 'static-end' });
        this.version++;
      }
    }
    const before = this.elapsed;
    this.elapsed = Math.min(SHIFT_SECONDS, this.elapsed + dt);
    const h0 = Math.floor(before / SHIFT.hourSeconds + 1e-9);
    const h1 = Math.floor(this.elapsed / SHIFT.hourSeconds + 1e-9);
    for (let h = h0 + 1; h <= h1; h++) events.push({ kind: 'hour', hour: h });
    if (this.phase === 'grace' && this.elapsed >= SHIFT.grace) {
      this.phase = 'running';
      events.push({ kind: 'running' });
    }
    if (this.elapsed >= SHIFT_SECONDS) {
      this.phase = 'won';
      this.score += SHIFT.points.dawn;
      events.push({ kind: 'won', bonus: SHIFT.points.dawn });
      return events;
    }
    while (this.phase === 'running' && this.elapsed >= this.nextSpawn) {
      const a = this.spawn();
      if (!a) {
        this.nextSpawn = this.elapsed + 1;
        break;
      }
      events.push({ kind: 'spawn', anomaly: a });
      this.nextSpawn += this.rng.range(this.params.spawnMin, this.params.spawnMax);
      if (this.active.length >= SHIFT.maxActive) {
        if (!this.stats.secondWind) {
          this.phase = 'brink';
          this.brinkLeft = SHIFT.brinkSeconds;
          events.push({ kind: 'brink' });
        } else {
          this.lose(events);
        }
      }
    }
    return events;
  }

  /** Show camera i. Returns false for an invalid or already-shown camera. */
  switchCamera(i: number): boolean {
    if (!Number.isInteger(i) || i < 0 || i >= this.station.length || i === this.camera) return false;
    this.camera = i;
    this.stats.switches++;
    return true;
  }

  /** The player says `objectId` on camera `camera` changed in way `type`. */
  report(camera: number, objectId: string, type: AnomalyType): ReportResult {
    if (this.phase !== 'grace' && this.phase !== 'running') return { kind: 'ignored' };
    if (camera !== this.camera) return { kind: 'ignored' };
    if (this.staticLeft > 0) return { kind: 'blind' };
    const known = this.objs[camera]?.some((o) => o.id === objectId) || this.ghosts[camera]?.some((g) => g.id === objectId);
    if (!known) return { kind: 'ignored' };
    const idx = this.active.findIndex((a) => a.camera === camera && a.objectId === objectId);
    if (idx < 0) {
      this.staticLeft = SHIFT.staticSeconds;
      this.stats.falseReports++;
      this.version++;
      return { kind: 'false' };
    }
    const anomaly = this.active[idx]!;
    this.active.splice(idx, 1);
    this.restore(anomaly);
    const typeCorrect = anomaly.type === type;
    const P = SHIFT.points;
    const age = this.elapsed - anomaly.at;
    const speed = Math.round(P.speed * Math.max(0, 1 - age / P.speedWindow));
    const points = P.object + (typeCorrect ? P.type : 0) + speed;
    this.score += points;
    this.stats.correct++;
    if (typeCorrect) {
      this.stats.typed++;
      this.logged.push(logKey(this.station[camera]!.id, objectId, anomaly.type));
    }
    return { kind: 'correct', anomaly, typeCorrect, points };
  }

  /** Rewarded "second wind": once per shift, at the brink, clears the two oldest anomalies. */
  useSecondWind(): boolean {
    if (this.phase !== 'brink' || this.stats.secondWind) return false;
    this.stats.secondWind = true;
    for (const a of this.active.splice(0, 2)) this.restore(a);
    this.phase = 'running';
    return true;
  }

  declineSecondWind(): void {
    if (this.phase === 'brink') this.lose([]);
  }

  /**
   * What is under view point (x, y) on a camera: an object id (also where a moved or missing
   * object used to be, and on its duplicate), a visible intruder id, or null.
   * Hit boxes are at least one touch target; of the real boxes under the point, the one whose
   * centre is relatively closest wins (a mug on a table, a duplicate over a calendar).
   */
  hitTest(camera: number, x: number, y: number): string | null {
    let best: { id: string; inside: boolean; score: number } | null = null;
    const consider = (id: string, r: Rect): void => {
      const hw = Math.max(r.w / 2, TOUCH_HALF);
      const hh = Math.max(r.h / 2, TOUCH_HALF);
      if (Math.abs(x - r.x) > hw || Math.abs(y - r.y) > hh) return;
      const inside = Math.abs(x - r.x) <= r.w / 2 && Math.abs(y - r.y) <= r.h / 2;
      // 0 at the box centre, 1 at its edge: the box you aimed at wins over one you grazed.
      const score = inside ? Math.max(Math.abs(x - r.x) / (r.w / 2), Math.abs(y - r.y) / (r.h / 2)) : dist(x, y, r.x, r.y);
      if (!best || (inside && !best.inside) || (inside === best.inside && score < best.score)) best = { id, inside, score };
    };
    const defs = this.station[camera]?.objects ?? [];
    (this.objs[camera] ?? []).forEach((o, i) => {
      const d = defs[i]!;
      consider(o.id, { x: d.x, y: d.y, w: d.w, h: d.h });
      if (o.visible) consider(o.id, { x: o.x, y: o.y, w: o.w * o.scale, h: o.h * o.scale });
      if (o.copy) consider(o.id, { x: o.copy.x, y: o.copy.y, w: o.w, h: o.h });
    });
    for (const g of this.ghosts[camera] ?? []) if (g.visible) consider(g.id, g);
    return (best as { id: string } | null)?.id ?? null;
  }

  /** Base definition of an object (for magnitude checks and drawing). */
  baseline(camera: number, objectId: string): ObjectDef | undefined {
    return this.station[camera]?.objects.find((o) => o.id === objectId);
  }

  // ---------------------------------------------------------------- internals

  private lose(events: ShiftEvent[]): void {
    this.phase = 'lost';
    events.push({ kind: 'lost' });
  }

  private spawn(): Anomaly | null {
    const cams = this.rng.shuffle(this.station.map((_, i) => i).filter((i) => i !== this.camera));
    for (const cam of cams) {
      const busy = new Set(this.active.filter((a) => a.camera === cam).map((a) => a.objectId));
      const pairs: { id: string; type: AnomalyType }[] = [];
      for (const d of this.station[cam]!.objects) {
        if (busy.has(d.id)) continue;
        for (const t of d.types) if (t !== 'state' || d.on !== undefined) pairs.push({ id: d.id, type: t });
      }
      const intruderActive = this.active.some((a) => a.camera === cam && a.type === 'intruder');
      if (this.params.intruders && !intruderActive) {
        // one pair per camera so intruders are about as common as one object's anomaly
        const free = this.station[cam]!.intruders.filter((s) => !busy.has(s.id));
        if (free.length) pairs.push({ id: this.rng.pick(free).id, type: 'intruder' });
      }
      if (!pairs.length) continue;
      const pick = this.rng.pick(pairs);
      const anomaly: Anomaly = { id: this.nextId++, camera: cam, objectId: pick.id, type: pick.type, at: this.elapsed };
      this.apply(anomaly);
      this.active.push(anomaly);
      this.version++;
      return anomaly;
    }
    return null;
  }

  private apply(a: Anomaly): void {
    const p = this.params;
    if (a.type === 'intruder') {
      const g = this.ghosts[a.camera]!.find((s) => s.id === a.objectId)!;
      g.visible = true;
      return;
    }
    const o = this.objs[a.camera]!.find((s) => s.id === a.objectId)!;
    switch (a.type) {
      case 'moved': {
        const at = this.offsetInside(o, p.moveMin, p.moveMin * 1.6);
        o.x = at.x;
        o.y = at.y;
        break;
      }
      case 'extra': {
        const min = Math.max(p.moveMin, Math.max(o.w, o.h) * 1.05);
        o.copy = this.offsetInside(o, min, min + 60);
        break;
      }
      case 'recolor':
        o.color = this.newColor(o.color, p.colorMin);
        break;
      case 'resized': {
        const s = this.rng.range(p.scaleMin, p.scaleMin * 1.5);
        o.scale = this.rng.chance(0.5) ? 1 + s : 1 / (1 + s);
        break;
      }
      case 'missing':
        o.visible = false;
        break;
      case 'state':
        o.on = !o.on;
        break;
    }
  }

  private restore(a: Anomaly): void {
    this.version++;
    if (a.type === 'intruder') {
      const g = this.ghosts[a.camera]!.find((s) => s.id === a.objectId);
      if (g) g.visible = false;
      return;
    }
    const list = this.objs[a.camera]!;
    const i = list.findIndex((s) => s.id === a.objectId);
    list[i] = fromDef(this.station[a.camera]!.objects[i]!);
  }

  /** A point min..max px from o, keeping o's whole box inside the view. */
  private offsetInside(o: ObjState, min: number, max: number): { x: number; y: number } {
    const fits = (x: number, y: number): boolean => x - o.w / 2 >= 0 && x + o.w / 2 <= VIEW && y - o.h / 2 >= 0 && y + o.h / 2 <= VIEW;
    const others = this.objs.find((list) => list.includes(o))!.filter((s) => s !== o && s.visible);
    // Overlap with other objects' boxes (view px²): prefer a clear spot so taps stay unambiguous.
    const overlap = (x: number, y: number): number =>
      others.reduce((sum, s) => {
        const ox = Math.min(x + o.w / 2, s.x + (s.w * s.scale) / 2) - Math.max(x - o.w / 2, s.x - (s.w * s.scale) / 2);
        const oy = Math.min(y + o.h / 2, s.y + (s.h * s.scale) / 2) - Math.max(y - o.h / 2, s.y - (s.h * s.scale) / 2);
        return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
      }, 0);
    let best: { x: number; y: number; cost: number } | null = null;
    for (let i = 0; i < 40; i++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(min, max);
      const x = o.x + Math.cos(ang) * d;
      const y = o.y + Math.sin(ang) * d;
      if (!fits(x, y)) continue;
      const cost = overlap(x, y);
      if (!best || cost < best.cost) best = { x, y, cost };
      if (cost === 0) break;
    }
    if (best) return { x: best.x, y: best.y };
    // Fallback: straight towards the middle of the view.
    const ang = Math.atan2(VIEW / 2 - o.y, VIEW / 2 - o.x);
    return { x: o.x + Math.cos(ang) * min, y: o.y + Math.sin(ang) * min };
  }

  private newColor(base: number, min: number): number {
    for (let i = 0; i < 80; i++) {
      const c = (this.rng.int(24, 240) << 16) | (this.rng.int(24, 240) << 8) | this.rng.int(24, 240);
      const d = colorDistance(c, base);
      if (d >= min && d <= min + 130) return c;
    }
    const extremes = [0x181818, 0xf0f0f0, 0xf0e020, 0x20d0f0, 0xe060f0, 0x30f060];
    return extremes.reduce((a, b) => (colorDistance(b, base) > colorDistance(a, base) ? b : a));
  }
}

/** How far an anomaly's object currently is from its baseline (0 when restored). */
export function anomalyMagnitude(sim: ShiftSim, a: Anomaly): number {
  if (a.type === 'intruder') return sim.intruders(a.camera).find((g) => g.id === a.objectId)?.visible ? 1 : 0;
  const o = sim.objects(a.camera).find((s) => s.id === a.objectId)!;
  const b = sim.baseline(a.camera, a.objectId)!;
  switch (a.type) {
    case 'moved':
      return dist(o.x, o.y, b.x, b.y);
    case 'extra':
      return o.copy ? dist(o.copy.x, o.copy.y, b.x, b.y) : 0;
    case 'recolor':
      return colorDistance(o.color, b.color);
    case 'resized':
      return Math.max(o.scale, 1 / o.scale) - 1;
    case 'missing':
      return o.visible ? 0 : 1;
    case 'state':
      return o.on !== (b.on ?? false) ? 1 : 0;
  }
}
