/**
 * The dig (pure, deterministic per seed). Scenes call tap / tapGlint / tick / buy / travel /
 * claimOffline and draw what comes back; every rule of the game lives here or in data.ts.
 */
import { createRng, type Rng } from '@oyun/core/pure';
import {
  COMBO,
  FOSSILS,
  FOSSIL_BY_ID,
  FUSE_AT,
  GLINT,
  GRADE_COUNT,
  LAYERS,
  LUCK_BOOST,
  OFFLINE,
  UPGRADES,
  UPGRADE_ORDER,
  fossilPower,
  upgradeCost,
  type Fossil,
  type SetBonusKind,
  type UpgradeId, at } from './data';
import { effectiveLuck, layerFossils, rollFossil } from './loot';

export interface GlintState {
  /** Position inside the dig site, 0..1. */
  x: number;
  y: number;
  /** Seconds left. */
  life: number;
  /** Luck of the glint roll, fixed when it appears (before the layer cap). Shown on its label. */
  luck: number;
}

/** Everything that persists. Plain JSON. */
export interface DigSave {
  /** fossil id → copies per grade [plain, bronze, silver, gold] */
  counts: Record<string, number[]>;
  dust: number;
  levels: Record<UpgradeId, number>;
  layer: number;
  /** Highest unlocked layer index. */
  unlocked: number;
  /** Blocks broken per layer. */
  broken: number[];
  /** Damage dealt to the current block. */
  damage: number;
  combo: number;
  /** Seconds since the last tap (combo grace). */
  idle: number;
  /** Seconds until the next glint appears. */
  glintIn: number;
  glint: GlintState | null;
  /** Seconds of rewarded 2x luck left. */
  boost: number;
  /** Fractional assistant hits carried between ticks. */
  assistantAcc: number;
  /** Rng state; 0 = not seeded yet (use the constructor seed). */
  rng: number;
  /** Layer indices whose set bonus has been granted. */
  sets: number[];
  stats: { taps: number; rolls: number; bestOdds: number; bestId: string; playSeconds: number };
  /** One-time tips already shown. */
  tips: string[];
  lastFind: { id: string; grade: number; luck: number; source: FindSource } | null;
  /** Wall-clock ms of the last save (written by the scene, read for the offline haul). */
  lastSeen: number;
}

export function defaultSave(): DigSave {
  return {
    counts: {},
    dust: 0,
    levels: { pick: 0, luck: 0, assistant: 0, offline: 0 },
    layer: 0,
    unlocked: 0,
    broken: [0, 0, 0, 0],
    damage: 0,
    combo: 0,
    idle: 0,
    glintIn: -1,
    glint: null,
    boost: 0,
    assistantAcc: 0,
    rng: 0,
    sets: [],
    stats: { taps: 0, rolls: 0, bestOdds: 0, bestId: '', playSeconds: 0 },
    tips: [],
    lastFind: null,
    lastSeen: 0,
  };
}

export type FindSource = 'tap' | 'assistant' | 'glint' | 'offline';

export interface Find {
  fossil: Fossil;
  /** Grade of the copy after any fusion it triggered. */
  grade: number;
  fusions: number;
  isNew: boolean;
  source: FindSource;
  /** Luck multiplier that applied to this roll (after the layer cap). */
  luck: number;
  dust: number;
  /** Layer whose set this find completed, or null. */
  setCompleted: number | null;
  /** Layer this find unlocked (dig power crossed its threshold), or null. */
  unlocked: number | null;
  /** Dig power added by this find (including any fusion it triggered). */
  powerGain: number;
}

export interface TapResult {
  damage: number;
  find: Find | null;
}

export interface TickResult {
  finds: Find[];
  /** Assistant hits this tick (read-only, for the helper's animation). */
  assistantHits: number;
  glintAppeared: boolean;
  glintExpired: boolean;
}

export interface OfflineHaul {
  /** Seconds credited (after the cap). */
  seconds: number;
  hits: number;
  blocks: number;
  dust: number;
  /** fossil id → copies found */
  found: Record<string, number>;
  newSpecies: string[];
  fusions: number;
  best: Fossil | null;
  unlocked: number | null;
  /**
   * Distinct lucks this haul's rolls used (no combo, no boost). One claim rolls everything at the
   * luck it captured at the start, so a set completed during the haul only counts after it.
   */
  lucks: number[];
  /** Finds at 1 in 1,000 or rarer, to be revealed properly when the player is back. */
  notable: Find[];
}

export interface CollectResult {
  grade: number;
  fusions: number;
  isNew: boolean;
  setCompleted: number | null;
}

const num = (v: unknown, min = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : min);
const int = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number => Math.min(max, Math.floor(num(v, min)));

/** Repair a loaded save: unknown ids dropped, NaN/negative numbers zeroed, levels clamped. */
export function sanitizeSave(raw: Partial<DigSave> | undefined): DigSave {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  for (const [id, grades] of Object.entries(raw.counts ?? {})) {
    if (!FOSSIL_BY_ID.has(id) || !Array.isArray(grades)) continue;
    const g = Array.from({ length: GRADE_COUNT }, (_, i) => int(grades[i]));
    if (g.some((x) => x > 0)) d.counts[id] = g;
  }
  d.dust = num(raw.dust);
  for (const id of UPGRADE_ORDER) d.levels[id] = int(raw.levels?.[id], 0, UPGRADES[id].maxLevel);
  d.unlocked = int(raw.unlocked, 0, LAYERS.length - 1);
  d.layer = Math.min(int(raw.layer, 0, LAYERS.length - 1), d.unlocked);
  d.broken = LAYERS.map((_, i) => int(raw.broken?.[i]));
  d.damage = num(raw.damage);
  d.combo = Math.min(1, num(raw.combo));
  d.idle = num(raw.idle);
  d.glintIn = typeof raw.glintIn === 'number' && Number.isFinite(raw.glintIn) ? raw.glintIn : -1;
  const g = raw.glint;
  d.glint = g && typeof g === 'object' && Number.isFinite(g.x) && Number.isFinite(g.y) && num(g.life) > 0 ? { x: g.x, y: g.y, life: num(g.life), luck: Math.max(1, num(g.luck, 1)) } : null;
  d.boost = num(raw.boost);
  d.assistantAcc = Math.min(1, num(raw.assistantAcc));
  d.rng = typeof raw.rng === 'number' && Number.isInteger(raw.rng) ? raw.rng >>> 0 : 0;
  // Set bonuses follow from the collection itself, so a hand-edited or older save stays consistent.
  d.sets = LAYERS.map((_, l) => l).filter((l) => layerFossils(l).every((f) => d.counts[f.id] !== undefined));
  const s = raw.stats;
  d.stats = {
    taps: int(s?.taps),
    rolls: int(s?.rolls),
    bestOdds: int(s?.bestOdds),
    bestId: typeof s?.bestId === 'string' && FOSSIL_BY_ID.has(s.bestId) ? s.bestId : '',
    playSeconds: num(s?.playSeconds),
  };
  d.tips = Array.isArray(raw.tips) ? raw.tips.filter((t): t is string => typeof t === 'string') : [];
  const lf = raw.lastFind;
  const sources: readonly FindSource[] = ['tap', 'assistant', 'glint', 'offline'];
  d.lastFind =
    lf && FOSSIL_BY_ID.has(lf.id)
      ? { id: lf.id, grade: int(lf.grade, 0, GRADE_COUNT - 1), luck: Math.max(1, num(lf.luck, 1)), source: sources.includes(lf.source) ? lf.source : 'tap' }
      : null;
  d.lastSeen = num(raw.lastSeen);
  return d;
}

export class DigSim {
  private readonly s: DigSave;
  private readonly rng: Rng;
  private pendingOfflineDust = 0;

  constructor(seed: number, save?: Partial<DigSave>) {
    this.s = sanitizeSave(save);
    this.rng = createRng(seed);
    if (this.s.rng !== 0) this.rng.setState(this.s.rng);
    // A brand-new dig shows its first glint early so players meet it; later ones come every 20-40 s.
    if (this.s.glintIn < 0 && !this.s.glint) this.s.glintIn = this.s.stats.rolls === 0 && this.s.stats.taps === 0 ? GLINT.first : this.nextGlintGap();
    this.checkUnlocks();
  }

  // ---------------------------------------------------------------- derived values

  get layer(): number {
    return this.s.layer;
  }
  get unlocked(): number {
    return this.s.unlocked;
  }
  get dust(): number {
    return this.s.dust;
  }
  get combo(): number {
    return this.s.combo;
  }
  get glint(): Readonly<GlintState> | null {
    return this.s.glint;
  }
  get boostSeconds(): number {
    return this.s.boost;
  }
  get lastFind(): Readonly<{ id: string; grade: number; luck: number; source: FindSource }> | null {
    return this.s.lastFind;
  }
  get stats(): Readonly<DigSave['stats']> {
    return this.s.stats;
  }

  level(id: UpgradeId): number {
    return this.s.levels[id];
  }

  grades(id: string): number[] {
    return [...(this.s.counts[id] ?? [0, 0, 0, 0])];
  }

  /** Total copies ever kept (a fused copy counts as the copies that made it). */
  count(id: string): number {
    return (this.s.counts[id] ?? []).reduce((sum, n, g) => sum + n * FUSE_AT ** g, 0);
  }

  discovered(id: string): boolean {
    return this.s.counts[id] !== undefined;
  }

  /** Highest grade held of a fossil, or -1 if undiscovered. */
  topGrade(id: string): number {
    const g = this.s.counts[id];
    if (!g) return -1;
    for (let i = GRADE_COUNT - 1; i >= 0; i--) if ((g[i] ?? 0) > 0) return i;
    return -1;
  }

  blocksBroken(layer: number): number {
    return this.s.broken[layer] ?? 0;
  }

  setProgress(layer: number): { found: number; total: number } {
    const fs = layerFossils(layer);
    return { found: fs.filter((f) => this.discovered(f.id)).length, total: fs.length };
  }

  setComplete(layer: number): boolean {
    return this.s.sets.includes(layer);
  }

  private bonus(kind: SetBonusKind): number {
    let v = kind === 'offlineCap' ? 0 : 1;
    for (const l of this.s.sets) {
      const b = at(LAYERS, l).setBonus;
      if (b.kind !== kind) continue;
      v = kind === 'offlineCap' ? v + b.value : v * b.value;
    }
    return v;
  }

  get collectionPower(): number {
    let sum = 0;
    for (const [id, grades] of Object.entries(this.s.counts)) {
      const f = FOSSIL_BY_ID.get(id)!;
      grades.forEach((n, g) => {
        if (n) sum += n * fossilPower(f, g);
      });
    }
    return sum;
  }

  get pickMult(): number {
    return UPGRADES.pick.effect(this.s.levels.pick) * this.bonus('power');
  }

  /** Damage per tap: (bare hands 1 + collection power) × pick multiplier. */
  get digPower(): number {
    return (1 + this.collectionPower) * this.pickMult;
  }

  /** Luck before combo: upgrade × set bonuses × rewarded boost. */
  get baseLuck(): number {
    return this.luckNoBoost * (this.s.boost > 0 ? LUCK_BOOST.mult : 1);
  }

  private get luckNoBoost(): number {
    return UPGRADES.luck.effect(this.s.levels.luck) * this.bonus('luck');
  }

  get comboMult(): number {
    return 1 + (COMBO.maxMult - 1) * this.s.combo;
  }

  /** Luck your next tap rolls at (base × combo, layer-capped). This is the HUD luck chip. */
  get luck(): number {
    return effectiveLuck(this.s.layer, this.baseLuck * this.comboMult);
  }

  /** Luck the assistant's digs roll at: base luck, no combo (it does not tap in rhythm). */
  get assistantLuck(): number {
    return effectiveLuck(this.s.layer, this.baseLuck);
  }

  /** Luck of rolls made while the app is closed: no combo and no rewarded boost. */
  get offlineLuck(): number {
    return effectiveLuck(this.s.layer, this.luckNoBoost);
  }

  /** Luck of the glint showing now (fixed at spawn), or what a glint would get right now. */
  get glintLuck(): number {
    return effectiveLuck(this.s.layer, this.s.glint ? this.s.glint.luck : this.baseLuck * this.comboMult * GLINT.luck);
  }

  get assistantRate(): number {
    return UPGRADES.assistant.effect(this.s.levels.assistant) * this.assistantBonus;
  }

  get offlineCap(): number {
    return this.offlineCapWith(UPGRADES.offline.effect(this.s.levels.offline));
  }

  /** Offline cap for a given upgrade base (seconds), with set bonuses and the 2 h hard cap. */
  offlineCapWith(base: number): number {
    return Math.min(OFFLINE.maxCap, base + this.bonus('offlineCap'));
  }

  /** Set-bonus multiplier on the assistant's speed. */
  get assistantBonus(): number {
    return this.bonus('assistant');
  }

  hpOf(layer: number): number {
    const L = at(LAYERS, layer);
    return Math.ceil(L.hp * (1 + L.hpRamp * this.blocksBroken(layer)) ** 2);
  }

  get blockHp(): number {
    return this.hpOf(this.s.layer);
  }

  get blockDamage(): number {
    return this.s.damage;
  }

  blockDust(layer: number): number {
    const L = at(LAYERS, layer);
    return Math.ceil(L.dust * (this.hpOf(layer) / L.hp) ** L.dustCurve);
  }

  upgradeCost(id: UpgradeId): number | null {
    return upgradeCost(id, this.s.levels[id]);
  }

  canBuy(id: UpgradeId): boolean {
    const c = this.upgradeCost(id);
    return c !== null && c <= this.s.dust;
  }

  // ---------------------------------------------------------------- actions

  /** A tap on the dig site. */
  tap(): TapResult {
    this.s.stats.taps += 1;
    // Roll with the luck that was on screen, then let this tap raise the combo.
    const r = this.hit('tap', this.baseLuck * this.comboMult);
    this.s.combo = Math.min(1, this.s.combo + COMBO.perTap);
    this.s.idle = 0;
    return r;
  }

  /** A tap on the glint: one extra roll at 10x luck. Null when no glint is showing. */
  tapGlint(): Find | null {
    const g = this.s.glint;
    if (!g) return null;
    this.s.glint = null;
    this.s.glintIn = this.nextGlintGap();
    return this.roll('glint', g.luck);
  }

  /** Advance time: combo drain, glint timer, boost timer, assistant digging. */
  tick(dt: number): TickResult {
    const out: TickResult = { finds: [], assistantHits: 0, glintAppeared: false, glintExpired: false };
    if (!(dt > 0)) return out;
    this.s.stats.playSeconds += dt;
    // combo
    const before = this.s.idle;
    this.s.idle += dt;
    const drainFor = Math.max(0, this.s.idle - Math.max(before, COMBO.grace));
    if (drainFor > 0) this.s.combo = Math.max(0, this.s.combo - COMBO.drain * drainFor);
    // boost
    if (this.s.boost > 0) this.s.boost = Math.max(0, this.s.boost - dt);
    // glint
    if (this.s.glint) {
      this.s.glint.life -= dt;
      if (this.s.glint.life <= 0) {
        this.s.glint = null;
        this.s.glintIn = this.nextGlintGap();
        out.glintExpired = true;
      }
    } else {
      this.s.glintIn -= dt;
      if (this.s.glintIn <= 0) {
        this.s.glint = { x: this.rng.range(0.15, 0.85), y: this.rng.range(0.15, 0.85), life: GLINT.life, luck: this.baseLuck * this.comboMult * GLINT.luck };
        out.glintAppeared = true;
      }
    }
    // assistant
    const rate = this.assistantRate;
    if (rate > 0) {
      this.s.assistantAcc += rate * dt;
      while (this.s.assistantAcc >= 1) {
        this.s.assistantAcc -= 1;
        out.assistantHits += 1;
        const r = this.hit('assistant', this.baseLuck);
        if (r.find) out.finds.push(r.find);
      }
    }
    this.saveRng();
    return out;
  }

  buy(id: UpgradeId): boolean {
    const cost = this.upgradeCost(id);
    if (cost === null || cost > this.s.dust) return false;
    this.s.dust -= cost;
    this.s.levels[id] += 1;
    this.checkUnlocks();
    return true;
  }

  travel(layer: number): boolean {
    if (!Number.isInteger(layer) || layer < 0 || layer > this.s.unlocked || layer === this.s.layer) return false;
    this.s.layer = layer;
    this.s.damage = 0;
    return true;
  }

  /** Rewarded ad: 2x luck for `seconds`. */
  grantLuckBoost(seconds: number = LUCK_BOOST.seconds): void {
    if (seconds > 0) this.s.boost = Math.max(this.s.boost, seconds);
  }

  /**
   * Credit the assistant's work while the app was closed: capped time, offline efficiency, base
   * luck (no combo), current layer. Applied immediately so closing the popup loses nothing.
   */
  claimOffline(elapsedSeconds: number): OfflineHaul {
    const haul: OfflineHaul = { seconds: 0, hits: 0, blocks: 0, dust: 0, found: {}, newSpecies: [], fusions: 0, best: null, unlocked: null, lucks: [], notable: [] };
    // The rewarded boost is a wall-clock 60 s: time away uses it up, and offline rolls never get it.
    if (elapsedSeconds > 0) this.s.boost = Math.max(0, this.s.boost - elapsedSeconds);
    const rate = this.assistantRate;
    if (!(elapsedSeconds > 0) || rate <= 0) return haul;
    haul.seconds = Math.min(elapsedSeconds, this.offlineCap);
    haul.hits = Math.floor(haul.seconds * rate * OFFLINE.efficiency);
    const haulLuck = this.luckNoBoost; // fixed for the whole haul
    for (let i = 0; i < haul.hits; i++) {
      const r = this.hit('offline', haulLuck);
      const f = r.find;
      if (!f) continue;
      haul.blocks += 1;
      haul.dust += f.dust;
      haul.fusions += f.fusions;
      haul.found[f.fossil.id] = (haul.found[f.fossil.id] ?? 0) + 1;
      if (!haul.lucks.includes(f.luck)) haul.lucks.push(f.luck);
      if (f.isNew) haul.newSpecies.push(f.fossil.id);
      if (f.fossil.odds >= 1000) haul.notable.push(f);
      if (!haul.best || f.fossil.odds > haul.best.odds) haul.best = f.fossil;
      if (f.unlocked !== null) haul.unlocked = f.unlocked;
    }
    // Hauls not yet shown add up; the rewarded double covers everything the popup shows.
    this.pendingOfflineDust += haul.dust;
    this.saveRng();
    return haul;
  }

  /** The offline popup closed without the rewarded double: the offer is gone. */
  clearOfflineBonus(): void {
    this.pendingOfflineDust = 0;
  }

  /** Rewarded ad on the offline popup: the haul's dust once more. Only once per haul. */
  doubleOfflineDust(): boolean {
    if (this.pendingOfflineDust <= 0) return false;
    this.s.dust += this.pendingOfflineDust;
    this.pendingOfflineDust = 0;
    return true;
  }

  /** Mark a one-time tip as shown. True the first time only. */
  markTip(id: string): boolean {
    if (this.s.tips.includes(id)) return false;
    this.s.tips.push(id);
    return true;
  }

  tipSeen(id: string): boolean {
    return this.s.tips.includes(id);
  }

  /** Add one plain copy and fuse automatically on the third. */
  collect(id: string): CollectResult {
    const f = FOSSIL_BY_ID.get(id);
    if (!f) throw new Error(`unknown fossil ${id}`);
    const isNew = !this.discovered(id);
    const g = (this.s.counts[id] ??= [0, 0, 0, 0]);
    const get = (i: number): number => g[i] ?? 0;
    g[0] = get(0) + 1;
    let grade = 0;
    let fusions = 0;
    while (grade < GRADE_COUNT - 1 && get(grade) >= FUSE_AT) {
      g[grade] = get(grade) - FUSE_AT;
      g[grade + 1] = get(grade + 1) + 1;
      grade += 1;
      fusions += 1;
    }
    let setCompleted: number | null = null;
    if (isNew && !this.s.sets.includes(f.layer) && layerFossils(f.layer).every((x) => this.discovered(x.id))) {
      this.s.sets.push(f.layer);
      setCompleted = f.layer;
    }
    return { grade, fusions, isNew, setCompleted };
  }

  toSave(): DigSave {
    this.saveRng();
    return structuredClone(this.s);
  }

  // ---------------------------------------------------------------- internals

  private hit(source: FindSource, luck: number): TapResult {
    const damage = this.digPower;
    this.s.damage += damage;
    if (this.s.damage < this.blockHp) {
      this.saveRng();
      return { damage, find: null };
    }
    // Break: at most one block per hit, overkill is discarded.
    const layer = this.s.layer;
    const dust = this.blockDust(layer);
    this.s.broken[layer] = this.blocksBroken(layer) + 1;
    this.s.damage = 0;
    this.s.dust += dust;
    const find = this.roll(source, luck, dust);
    return { damage, find };
  }

  private roll(source: FindSource, luck: number, dust = 0): Find {
    const layer = this.s.layer;
    const applied = effectiveLuck(layer, luck);
    const fossil = rollFossil(layer, applied, this.rng);
    if (source === 'glint') {
      dust = this.blockDust(layer);
      this.s.dust += dust;
    }
    this.s.stats.rolls += 1;
    const powerBefore = this.digPower;
    const c = this.collect(fossil.id);
    if (fossil.odds > this.s.stats.bestOdds) {
      this.s.stats.bestOdds = fossil.odds;
      this.s.stats.bestId = fossil.id;
    }
    this.s.lastFind = { id: fossil.id, grade: c.grade, luck: applied, source };
    const unlocked = this.checkUnlocks();
    this.saveRng();
    return { fossil, grade: c.grade, fusions: c.fusions, isNew: c.isNew, source, luck: applied, dust, setCompleted: c.setCompleted, unlocked, powerGain: this.digPower - powerBefore };
  }

  /** Unlock every layer whose threshold dig power has reached. Returns the deepest newly unlocked. */
  private checkUnlocks(): number | null {
    let newly: number | null = null;
    const p = this.digPower;
    while (this.s.unlocked < LAYERS.length - 1 && p >= at(LAYERS, this.s.unlocked + 1).unlockPower) {
      this.s.unlocked += 1;
      newly = this.s.unlocked;
    }
    return newly;
  }

  private nextGlintGap(): number {
    return this.rng.range(GLINT.minGap, GLINT.maxGap);
  }

  private saveRng(): void {
    this.s.rng = this.rng.getState();
  }
}

/** All fossil ids, for UI iteration. */
export const ALL_FOSSIL_IDS: readonly string[] = FOSSILS.map((f) => f.id);
