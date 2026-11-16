/**
 * One match (pure, deterministic per seed). Fixed 10 Hz `tick()`: growth → waves → elimination →
 * bot decisions → end check. Scenes read `owner`, drain `dirty` (changed cells) and `events`,
 * and call `attack()` / `blot()` for the player.
 */
import { createRng, type Rng } from '@oyun/core/pure';
import { botDecide, type BotMemory } from './bots';
import { landDistance, neighbours4, type GameMap } from './mapgen';
import { naivePolicy } from './policy';
import { RULES, clampCommit, growthPerTick, inkCap } from './rules';

export type Personality = 'turtle' | 'rusher' | 'opportunist';
export const PERSONALITIES: readonly Personality[] = ['turtle', 'rusher', 'opportunist'];

export type ColonySpec =
  | { kind: 'player' }
  /** Does nothing (tests). */
  | { kind: 'idle' }
  /** difficulty 0 (easy) .. 3 (hard). */
  | { kind: 'bot'; personality: Personality; difficulty: number };

export interface ColonyState {
  readonly id: number;
  readonly spec: ColonySpec;
  reserve: number;
  area: number;
  alive: boolean;
  eliminatedAt: number | null;
  /** Last colony that took a cell from us, and when. */
  lastAttackedBy: number;
  lastAttackedTick: number;
  /** Tick from which Blot can be used again (player only). */
  blotReadyAt: number;
}

export interface ColonyStats {
  inkSpent: number;
  captured: number;
  lost: number;
  peakArea: number;
  /** Ever fell below half of the peak territory. */
  droppedBelowHalfPeak: boolean;
}

export interface Wave {
  readonly id: number;
  readonly owner: number;
  /** -1 = blank paper, else the defending colony. */
  readonly target: number;
  ink: number;
  readonly origin: number;
  captured: number;
  /** BFS frontier from the tapped cell, restricted to target-owned cells. */
  readonly queue: number[];
  head: number;
  readonly seen: Set<number>;
}

export type MatchEvent =
  | { type: 'wave'; colony: number; target: number; cell: number; ink: number }
  | { type: 'wave-end'; colony: number; target: number; captured: number; cell: number }
  | { type: 'eliminated'; colony: number; by: number; cell: number }
  | { type: 'blot'; colony: number; cell: number; captured: number }
  | { type: 'end'; winner: number | null };

export type Phase = 'playing' | 'won' | 'lost' | 'ended';

export type AttackResult =
  | { ok: true; wave: number; ink: number }
  | { ok: false; reason: 'ended' | 'dead' | 'gap' | 'own' | 'not-touching' | 'no-ink' | 'busy' };

export interface MatchOptions {
  /** false: no ink growth (exact-maths tests). */
  growth?: boolean;
  /** Whether the player may use Blot this match. */
  blot?: boolean;
}

const MAX_WAVES = 8;
const AREA_SNAPSHOT_EVERY = 20;

export class MatchSim {
  readonly map: GameMap;
  readonly rng: Rng;
  /** Owner per cell: -1 blank (or gap; check map.land), else colony id. */
  readonly owner: Int8Array;
  /** Tick each cell last changed owner (for the renderer's fresh-ink shading). */
  readonly changedAt: Int32Array;
  readonly colonies: ColonyState[];
  readonly stats: ColonyStats[];
  readonly bots: (BotMemory | null)[];
  waves: Wave[] = [];
  /** Cells whose owner changed since the last drain. */
  dirty: number[] = [];
  events: MatchEvent[] = [];
  tickCount = 0;
  phase: Phase = 'playing';
  winner: number | null = null;
  readonly playerId: number | null;
  /** Start cell per colony this match. */
  readonly startCells: number[];
  /** Remaining ticks the built-in player policy plays for the player (test hook / demo). */
  autoPlayTicks = 0;
  /** Area per colony, sampled every AREA_SNAPSHOT_EVERY ticks (oldest first, max 5). */
  readonly areaHistory: number[][] = [];
  private readonly growth: boolean;
  readonly blotEnabled: boolean;
  private nextWaveId = 1;
  private readonly stamp: Int32Array;
  private stampGen = 0;

  constructor(map: GameMap, seed: number, specs: readonly ColonySpec[], opts: MatchOptions = {}) {
    if (specs.length > map.starts.length) throw new Error('more colonies than starts');
    this.map = map;
    this.rng = createRng(seed);
    this.growth = opts.growth ?? true;
    this.blotEnabled = opts.blot ?? false;
    const n = map.width * map.height;
    this.owner = new Int8Array(n).fill(-1);
    this.changedAt = new Int32Array(n).fill(-1000);
    this.stamp = new Int32Array(n);
    this.playerId = specs.findIndex((s) => s.kind === 'player');
    if (this.playerId < 0) this.playerId = null;
    this.colonies = specs.map((spec, id) => ({
      id,
      spec,
      reserve: RULES.startReserve,
      area: 0,
      alive: true,
      eliminatedAt: null,
      lastAttackedBy: -1,
      lastAttackedTick: -1000,
      blotReadyAt: Math.round(RULES.blotCooldown / 3),
    }));
    this.stats = specs.map(() => ({ inkSpent: 0, captured: 0, lost: 0, peakArea: 0, droppedBelowHalfPeak: false }));
    const botRng = this.rng.fork('bots');
    this.bots = specs.map((s, id) => (s.kind === 'bot' ? { rng: botRng.fork(`bot-${id}`), lastDecision: -1000 } : null));
    // Which colony gets which start is shuffled per match seed: farthest-point sampling puts the
    // first start in an extreme corner, and colony 0 (the player) must not always get it.
    this.startCells = this.rng.fork('starts').shuffle(map.starts).slice(0, specs.length);
    // Start blots: land within startRadius (BFS) of each start; nearest start wins ties.
    specs.forEach((_, id) => {
      const dist = landDistance(map.land, map.width, map.height, [this.startCells[id]!]);
      for (let i = 0; i < n; i++) {
        if (dist[i]! >= 0 && dist[i]! <= RULES.startRadius && this.owner[i] === -1) this.setOwner(i, id);
      }
    });
    this.colonies.forEach((c, id) => (this.stats[id]!.peakArea = c.area));
  }

  // ---------------------------------------------------------------- queries

  cap(id: number): number {
    return inkCap(this.colonies[id]!.area);
  }

  density(id: number): number {
    const c = this.colonies[id]!;
    return c.area > 0 ? c.reserve / c.area : 0;
  }

  /** Share of all land held by colony id (0..1). */
  share(id: number): number {
    return this.colonies[id]!.area / this.map.landCount;
  }

  blankArea(): number {
    let sum = 0;
    for (const c of this.colonies) sum += c.area;
    return this.map.landCount - sum;
  }

  /** Ink colony `by` pays to take cell. */
  captureCost(by: number, cell: number): number {
    void by;
    const o = this.owner[cell]!;
    if (o < 0) return RULES.blankCost;
    return RULES.enemyBaseCost + RULES.densityCost * this.density(o);
  }

  touches(id: number, cell: number): boolean {
    for (const d of neighbours4(cell, this.map.width, this.map.height)) if (this.owner[d] === id) return true;
    return false;
  }

  canAttack(id: number, cell: number): boolean {
    return cell >= 0 && cell < this.owner.length && this.map.land[cell] === 1 && this.owner[cell] !== id && this.touches(id, cell);
  }

  /** Every cell colony id could tap right now. */
  attackableCells(id: number): number[] {
    const out: number[] = [];
    for (const b of this.borderTargets(id)) out.push(...b.cells);
    return out;
  }

  /** Border cells of colony id grouped by their owner (-1 = blank). Deterministic order. */
  borderTargets(id: number): { owner: number; cells: number[] }[] {
    const { width: w, height: h, land } = this.map;
    const gen = ++this.stampGen;
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < this.owner.length; i++) {
      if (this.owner[i] !== id) continue;
      for (const d of neighbours4(i, w, h)) {
        const o = this.owner[d]!;
        if (o === id || !land[d] || this.stamp[d] === gen) continue;
        this.stamp[d] = gen;
        let list = buckets.get(o);
        if (!list) buckets.set(o, (list = []));
        list.push(d);
      }
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([owner, cells]) => ({ owner, cells }));
  }

  activeWaves(id: number): number {
    let n = 0;
    for (const w of this.waves) if (w.owner === id) n++;
    return n;
  }

  // ---------------------------------------------------------------- actions

  /** Commit `percent` (10..100) of colony id's reserve as a wave starting at cell. */
  attack(id: number, cell: number, percent: number): AttackResult {
    if (this.phase !== 'playing') return { ok: false, reason: 'ended' };
    const c = this.colonies[id];
    if (!c || !c.alive) return { ok: false, reason: 'dead' };
    if (!this.map.land[cell]) return { ok: false, reason: 'gap' };
    if (this.owner[cell] === id) return { ok: false, reason: 'own' };
    if (!this.touches(id, cell)) return { ok: false, reason: 'not-touching' };
    if (this.activeWaves(id) >= MAX_WAVES) return { ok: false, reason: 'busy' };
    const ink = (c.reserve * clampCommit(percent)) / 100;
    if (ink < Math.min(RULES.blankCost, 0.5)) return { ok: false, reason: 'no-ink' };
    c.reserve -= ink;
    const wave: Wave = {
      id: this.nextWaveId++,
      owner: id,
      target: this.owner[cell]!,
      ink,
      origin: cell,
      captured: 0,
      queue: [cell],
      head: 0,
      seen: new Set([cell]),
    };
    this.waves.push(wave);
    this.events.push({ type: 'wave', colony: id, target: wave.target, cell, ink });
    return { ok: true, wave: wave.id, ink };
  }

  blotReady(id: number): boolean {
    const c = this.colonies[id];
    return !!c && c.alive && this.blotEnabled && id === this.playerId && this.tickCount >= c.blotReadyAt;
  }

  /** Ticks until Blot is ready (0 = ready). */
  blotCooldownLeft(id: number): number {
    const c = this.colonies[id];
    return c ? Math.max(0, c.blotReadyAt - this.tickCount) : 0;
  }

  /** Rewarded extra charge: Blot is ready immediately. */
  grantBlot(id: number): void {
    const c = this.colonies[id];
    if (c) c.blotReadyAt = this.tickCount;
  }

  /** Ink a free disc centred on a cell inside or touching our territory. Returns cells taken. */
  blot(id: number, cell: number): number {
    if (this.phase !== 'playing' || !this.blotReady(id)) return 0;
    if (!this.map.land[cell] || (this.owner[cell] !== id && !this.touches(id, cell))) return 0;
    const { width: w, height: h, land } = this.map;
    const cx = cell % w;
    const cy = (cell - cx) / w;
    const r = RULES.blotRadius;
    const ri = Math.ceil(r);
    let taken = 0;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h || dx * dx + dy * dy > r * r) continue;
        const i = y * w + x;
        if (!land[i] || this.owner[i] === id) continue;
        this.capture(id, i);
        taken++;
      }
    }
    this.colonies[id]!.blotReadyAt = this.tickCount + RULES.blotCooldown;
    this.events.push({ type: 'blot', colony: id, cell, captured: taken });
    this.afterChanges();
    return taken;
  }

  /** Direct ownership change (start blots, tests). Keeps area counts and dirty list correct. */
  setOwner(cell: number, id: number): void {
    const prev = this.owner[cell]!;
    if (prev === id) return;
    if (prev >= 0) this.colonies[prev]!.area -= 1;
    if (id >= 0) this.colonies[id]!.area += 1;
    this.owner[cell] = id;
    this.changedAt[cell] = this.tickCount;
    this.dirty.push(cell);
  }

  // ---------------------------------------------------------------- tick

  tick(): void {
    if (this.phase !== 'playing') return;
    this.tickCount++;
    if (this.growth) {
      for (const c of this.colonies) if (c.alive) c.reserve += growthPerTick(c.area, c.reserve);
    }
    this.stepWaves();
    this.afterChanges();
    if (this.phase !== 'playing') return;
    if (this.tickCount % AREA_SNAPSHOT_EVERY === 0) {
      this.areaHistory.push(this.colonies.map((c) => c.area));
      if (this.areaHistory.length > 5) this.areaHistory.shift();
    }
    for (const c of this.colonies) {
      if (!c.alive) continue;
      const mem = this.bots[c.id];
      if (mem && c.spec.kind === 'bot') botDecide(this, c.id, c.spec.personality, c.spec.difficulty, mem);
    }
    if (this.playerId !== null && this.autoPlayTicks > 0) {
      this.autoPlayTicks--;
      if (this.tickCount % 8 === 0) naivePolicy(this, this.playerId);
    }
    if (this.tickCount >= RULES.maxTicks) this.finishByTime();
  }

  private capture(by: number, cell: number): void {
    const prev = this.owner[cell]!;
    if (prev >= 0) {
      const d = this.density(prev);
      const def = this.colonies[prev]!;
      def.reserve = Math.max(0, def.reserve - d * RULES.defenderLoss);
      def.lastAttackedBy = by;
      def.lastAttackedTick = this.tickCount;
      this.stats[prev]!.lost++;
    }
    this.setOwner(cell, by);
    this.stats[by]!.captured++;
  }

  private stepWaves(): void {
    const { width: w, height: h } = this.map;
    const done: Wave[] = [];
    for (const wave of this.waves) {
      let budget = Math.min(RULES.waveSpeedMax, Math.floor(RULES.waveSpeedBase + wave.ink / RULES.waveSpeedInk));
      let out = false;
      while (budget > 0) {
        if (wave.head >= wave.queue.length) {
          out = true;
          break;
        }
        const cell = wave.queue[wave.head]!;
        if (this.owner[cell] !== wave.target || !this.touches(wave.owner, cell)) {
          wave.head++;
          continue;
        }
        const cost = this.captureCost(wave.owner, cell);
        if (wave.ink < cost) {
          out = true;
          break;
        }
        wave.head++;
        wave.ink -= cost;
        this.stats[wave.owner]!.inkSpent += cost;
        this.capture(wave.owner, cell);
        wave.captured++;
        budget--;
        for (const d of neighbours4(cell, w, h)) {
          if (this.owner[d] === wave.target && this.map.land[d] && !wave.seen.has(d)) {
            wave.seen.add(d);
            wave.queue.push(d);
          }
        }
      }
      if (out) done.push(wave);
    }
    for (const wave of done) this.endWave(wave);
  }

  private endWave(wave: Wave): void {
    const i = this.waves.indexOf(wave);
    if (i < 0) return;
    this.waves.splice(i, 1);
    const owner = this.colonies[wave.owner]!;
    if (owner.alive) owner.reserve += wave.ink; // unspent ink soaks back
    this.events.push({ type: 'wave-end', colony: wave.owner, target: wave.target, captured: wave.captured, cell: wave.origin });
  }

  /** Elimination, peak tracking and win checks after any ownership change. */
  private afterChanges(): void {
    for (const c of this.colonies) {
      const st = this.stats[c.id]!;
      if (c.area > st.peakArea) st.peakArea = c.area;
      if (c.area < st.peakArea * 0.5) st.droppedBelowHalfPeak = true;
      if (c.alive && c.area <= 0) {
        c.alive = false;
        c.eliminatedAt = this.tickCount;
        c.reserve = 0;
        this.waves = this.waves.filter((wv) => wv.owner !== c.id);
        // The splash goes where the last cell fell: the newest dirty cell.
        const cell = this.dirty.length ? this.dirty[this.dirty.length - 1]! : this.startCells[c.id]!;
        this.events.push({ type: 'eliminated', colony: c.id, by: c.lastAttackedBy, cell });
      }
    }
    const alive = this.colonies.filter((c) => c.alive);
    if (this.playerId !== null && !this.colonies[this.playerId]!.alive) {
      this.end(alive.length === 1 ? alive[0]!.id : null);
      return;
    }
    if (alive.length <= 1) {
      this.end(alive[0]?.id ?? null);
      return;
    }
    for (const c of alive) {
      if (this.share(c.id) >= RULES.winShare) {
        this.end(c.id);
        return;
      }
    }
  }

  private finishByTime(): void {
    let best = -1;
    for (const c of this.colonies) if (c.alive && (best < 0 || c.area > this.colonies[best]!.area)) best = c.id;
    this.end(best >= 0 ? best : null);
  }

  private end(winner: number | null): void {
    if (this.phase !== 'playing') return;
    this.winner = winner;
    if (this.playerId === null) this.phase = 'ended';
    else this.phase = winner === this.playerId ? 'won' : 'lost';
    this.events.push({ type: 'end', winner });
  }
}
