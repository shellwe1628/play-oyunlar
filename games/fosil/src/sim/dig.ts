/**
 * The dig (pure, deterministic per seed). Scenes call tap / tapGlint / tick / buy / travel /
 * claimOffline and draw what comes back; every rule of the game lives here or in data.ts.
 */
import { createRng, type Rng } from '@oyun/core/pure';
import {
  ACHIEVEMENTS,
  BOSS,
  CAVEIN,
  CHAIN,
  COMBO,
  DAILY,
  ECHO,
  EXPEDITION,
  FEVER,
  FOSSILS,
  GOLDEN,
  METEOR,
  PITY,
  PRESSURE,
  RELIC,
  RUSH,
  SCORE,
  TWIN,
  UNSTABLE,
  VEIN,
  WEAK,
  rankOf,
  type Achievement,
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
import { cooldown } from './clock';
import { effectiveLuck, layerFossils, LUCKY_TIER, rollFossil, rollRare } from './loot';

/** A weak spot on the block face (0..1 of its width and height) and the seconds it stays. */
export interface WeakSpot {
  x: number;
  y: number;
  life: number;
}

/** Weak spots: damage only, on their own rng stream (nothing here ever touches a roll). */
export interface WeakState {
  /** Seconds until the next spot may appear (-1 = not scheduled yet). */
  in: number;
  /** The wait after the spot showing now, drawn together with it (every spot costs the same draws). */
  gap: number;
  spot: WeakSpot | null;
  /** Cell (0..8) of the last spot: the next one is never in the same place. */
  cell: number;
  /** Precise hits in a row (the "sharp eye" count); a spot left to expire ends it. */
  streak: number;
  /** Precise hits ever made. */
  hits: number;
  /** State of the weak-spot rng stream; 0 = not seeded yet. */
  rng: number;
}

/** Dig Rush: the event in progress, the personal best and the wall-clock cooldown. */
export interface RushState {
  /** Seconds left of the rush in progress (0 = none). */
  left: number;
  /** This rush so far. */
  blocks: number;
  dust: number;
  rolls: number;
  /** fossil id → copies found in this rush. */
  found: Record<string, number>;
  /** Species first found in this rush. */
  fresh: string[];
  /** The block (and the damage on it) that was being dug when the rush started; it comes back after. */
  held: { block: BlockState; damage: number } | null;
  /** Most blocks ever broken in one rush, and rushes played. */
  best: number;
  count: number;
  /** Wall-clock ms from which the next rush may start (0 = no cooldown running). */
  readyAt: number;
  /** Latest wall-clock ms this save has ever seen: only moves forward (see clock.ts). */
  seen: number;
  /** State of the rush rng stream; 0 = not seeded yet. */
  rng: number;
}

/** What one rush brought, for its result card. */
export interface RushResult {
  layer: number;
  blocks: number;
  dust: number;
  rolls: number;
  /** Rarest first. */
  finds: { fossil: Fossil; n: number; isNew: boolean }[];
  /** The personal best before this rush, and whether this rush beat it. */
  best: number;
  record: boolean;
  /** Why it ended: the clock ran out, the app was left for RUSH.away seconds or more, or the dig screen was left. */
  ended: 'time' | 'away' | 'left';
}

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
  /** cores: star-core hits (Star Crater); echoes: echo blocks broken (Time Rift). */
  stats: { taps: number; rolls: number; bestOdds: number; bestId: string; playSeconds: number; cores: number; echoes: number };
  /** One-time tips already shown. */
  tips: string[];
  lastFind: { id: string; grade: number; luck: number; source: FindSource } | null;
  /** Wall-clock ms of the last save (written by the scene, read for the offline haul). */
  lastSeen: number;
  /** Species ever found (kept through expeditions: the museum). */
  discovered: string[];
  /** Best grade ever held per species. */
  best: Record<string, number>;
  /** The block being dug. */
  block: BlockState;
  /** Rolls since the last find at 1 in 100 or rarer (the lucky streak). */
  dry: number;
  /** Seconds of combo fever left. */
  fever: number;
  /** Fever meter (0..FEVER.charge). */
  feverCharge: number;
  /** Blocks broken in a chain and the play time of the last break. */
  chain: { n: number; last: number };
  /** Relic fragments collected (every 5 make a relic, up to 3 relics). */
  fragments: number;
  expedition: { count: number; runStart: number; best: number };
  /** Deepest layer index ever reached (any run). */
  deepest: number;
  /** Achievements earned. */
  quests: string[];
  /** Gold-grade fusions made. */
  golds: number;
  daily: { day: number; streak: number };
  records: { rare: RareRecord[]; sets: Record<string, number>; layerStart: number[] };
  /** Highest rank already celebrated. */
  rank: number;
  /** Wall-clock ms most recently injected by the scene (for record dates). */
  clock: number;
  weak: WeakState;
  rush: RushState;
}

export type BlockKind = 'normal' | 'vein' | 'unstable' | 'twin' | 'golden' | 'cavein' | 'boss' | 'pressure' | 'meteor' | 'echo';
export const BLOCK_KINDS: readonly BlockKind[] = ['normal', 'vein', 'unstable', 'twin', 'golden', 'cavein', 'boss', 'pressure', 'meteor', 'echo'];
export interface BlockState {
  kind: BlockKind;
  /** Unstable: seconds left in the bonus window (-1 = not started). */
  timer: number;
  /** Meteor: where the star core sits on the block face (0..1 of its width / height). */
  x?: number;
  y?: number;
  /** Echo: the earlier layer whose table the extra roll uses. */
  echo?: number;
}
export interface RareRecord {
  id: string;
  odds: number;
  /** Wall-clock ms when found (0 = unknown, e.g. from an old save). */
  at: number;
}

export function defaultSave(): DigSave {
  return {
    counts: {},
    dust: 0,
    levels: { pick: 0, luck: 0, assistant: 0, offline: 0 },
    layer: 0,
    unlocked: 0,
    broken: LAYERS.map(() => 0),
    damage: 0,
    combo: 0,
    idle: 0,
    glintIn: -1,
    glint: null,
    boost: 0,
    assistantAcc: 0,
    rng: 0,
    sets: [],
    stats: { taps: 0, rolls: 0, bestOdds: 0, bestId: '', playSeconds: 0, cores: 0, echoes: 0 },
    // a new dig meets the three deep layers in order; only saves from before them get the news
    tips: [NEWS_TIP],
    lastFind: null,
    lastSeen: 0,
    discovered: [],
    best: {},
    block: { kind: 'normal', timer: -1 },
    dry: 0,
    fever: 0,
    feverCharge: 0,
    chain: { n: 0, last: -99 },
    fragments: 0,
    expedition: { count: 0, runStart: 0, best: 0 },
    deepest: 0,
    quests: [],
    golds: 0,
    daily: { day: 0, streak: 0 },
    records: { rare: [], sets: {}, layerStart: [0] },
    rank: 0,
    clock: 0,
    weak: { in: -1, gap: WEAK.minGap, spot: null, cell: -1, streak: 0, hits: 0, rng: 0 },
    rush: { left: 0, blocks: 0, dust: 0, rolls: 0, found: {}, fresh: [], held: null, best: 0, count: 0, readyAt: 0, seen: 0, rng: 0 },
  };
}

export type FindSource = 'tap' | 'assistant' | 'glint' | 'offline';

/** One-time "three new layers below the First Seas" note for saves made before the depth round. */
export const NEWS_TIP = 'news-depth';

/** Things that happened, for the presentation (and tips) to react to. */
export type SimEvent =
  | { kind: 'fever' }
  | { kind: 'feverEnd' }
  | { kind: 'chain'; n: number }
  | { kind: 'fragment'; fragments: number; relics: number }
  | { kind: 'relic'; relics: number }
  | { kind: 'cavein' }
  | { kind: 'boss' }
  | { kind: 'phase'; phase: number }
  | { kind: 'golden' }
  | { kind: 'meteor' }
  | { kind: 'echo'; layer: number }
  | { kind: 'settled' }
  | { kind: 'pity' }
  | { kind: 'quest'; id: string; dust: number }
  | { kind: 'rank'; rank: number };

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
  /** A lucky-streak roll: guaranteed 1 in 100 or rarer, in printed proportions (not luck-scaled). */
  pity: boolean;
  /** Block this came from. */
  block: BlockKind;
  /** Found in a Dig Rush (set only then). Rolled at the tap luck on screen, like any tap find. */
  rush?: true;
}

export interface TapResult {
  damage: number;
  find: Find | null;
  /** Further rolls from the same hit: twin, golden, unstable bonus, boss phases. */
  extra: Find[];
  events: SimEvent[];
  /** The block broke on this hit (cave-in rubble breaks without a find). */
  broke: boolean;
  /** This tap struck a meteor block's star core (×METEOR.core damage). */
  core: boolean;
  /** Dust paid by the break (0 if it did not break). */
  dust: number;
  /** This tap landed on the weak spot (×WEAK.mult damage and up; luck is untouched). */
  precise: boolean;
  /** Precise hits in a row including this one (0 when it was not precise). */
  sharp: number;
}

export interface TickResult {
  finds: Find[];
  /** Assistant hits this tick (read-only, for the helper's animation). */
  assistantHits: number;
  glintAppeared: boolean;
  glintExpired: boolean;
  /** A weak spot appeared / went away un-hit (expired, or made way for a glint). */
  weakAppeared: boolean;
  weakExpired: boolean;
  events: SimEvent[];
  /** Blocks the assistant broke (cave-in rubble breaks without a find). */
  breaks: number;
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
  /** Fossils rolled (twin, golden and boss blocks roll more than once). */
  rolls: number;
  /** Achievements earned during the haul and their dust (not part of `dust`, never doubled). */
  quests: string[];
  questDust: number;
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
    cores: int(s?.cores),
    echoes: int(s?.echoes),
  };
  d.tips = Array.isArray(raw.tips) ? raw.tips.filter((t): t is string => typeof t === 'string') : [];
  const lf = raw.lastFind;
  const sources: readonly FindSource[] = ['tap', 'assistant', 'glint', 'offline'];
  d.lastFind =
    lf && FOSSIL_BY_ID.has(lf.id)
      ? { id: lf.id, grade: int(lf.grade, 0, GRADE_COUNT - 1), luck: Math.max(1, num(lf.luck, 1)), source: sources.includes(lf.source) ? lf.source : 'tap' }
      : null;
  d.lastSeen = num(raw.lastSeen);
  const disc = Array.isArray(raw.discovered) ? raw.discovered : Object.keys(d.counts);
  d.discovered = [...new Set([...disc.filter((x): x is string => typeof x === 'string' && FOSSIL_BY_ID.has(x)), ...Object.keys(d.counts)])];
  for (const id of d.discovered) {
    const top = (d.counts[id] ?? []).reduce((m, n, g) => (n > 0 ? g : m), 0);
    d.best[id] = Math.max(top, int(raw.best?.[id], 0, GRADE_COUNT - 1));
  }
  // Set bonuses follow from the museum, so a hand-edited or older save stays consistent.
  d.sets = LAYERS.map((_, l) => l).filter((l) => layerFossils(l).every((f) => d.discovered.includes(f.id)));
  d.block = sanitizeBlock(raw.block, d.layer);
  d.dry = int(raw.dry);
  d.fever = num(raw.fever);
  d.feverCharge = Math.min(FEVER.charge, num(raw.feverCharge));
  d.chain = { n: int(raw.chain?.n), last: typeof raw.chain?.last === 'number' && Number.isFinite(raw.chain.last) ? raw.chain.last : -99 };
  d.fragments = int(raw.fragments, 0, RELIC.fragments * RELIC.max);
  d.expedition = { count: int(raw.expedition?.count), runStart: num(raw.expedition?.runStart), best: num(raw.expedition?.best) };
  d.deepest = Math.max(d.unlocked, int(raw.deepest, 0, LAYERS.length - 1));
  d.quests = Array.isArray(raw.quests) ? raw.quests.filter((q): q is string => typeof q === 'string' && ACHIEVEMENTS.some((a) => a.id === q)) : [];
  d.golds = int(raw.golds);
  d.daily = { day: int(raw.daily?.day), streak: int(raw.daily?.streak, 0, DAILY.maxStreak) };
  const rec = raw.records;
  d.records = {
    rare: (Array.isArray(rec?.rare) ? rec.rare : [])
      .filter((r): r is RareRecord => !!r && FOSSIL_BY_ID.has(r.id))
      .map((r) => ({ id: r.id, odds: FOSSIL_BY_ID.get(r.id)!.odds, at: num(r.at) }))
      .slice(0, 5),
    sets: Object.fromEntries(Object.entries(rec?.sets ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0)),
    layerStart: LAYERS.map((_, i) => (i === 0 ? num(rec?.layerStart?.[0]) : typeof rec?.layerStart?.[i] === 'number' ? num(rec.layerStart[i]) : -1)).filter((_, i) => i <= d.unlocked),
  };
  if (d.records.rare.length === 0 && d.stats.bestId) d.records.rare = [{ id: d.stats.bestId, odds: d.stats.bestOdds, at: 0 }];
  d.rank = int(raw.rank, 0, 99);
  d.clock = num(raw.clock);
  const state = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) ? v >>> 0 : 0);
  // Weak spots (saves from before them start with none and the first one scheduled on load).
  const w = raw.weak;
  const face = (v: number): number => Math.min(0.85, Math.max(0.15, v));
  const sp = w?.spot;
  d.weak = {
    in: typeof w?.in === 'number' && Number.isFinite(w.in) && w.in >= 0 ? Math.min(w.in, WEAK.maxGap) : -1,
    gap: Math.min(WEAK.maxGap, num(w?.gap, WEAK.minGap)),
    spot: sp && typeof sp === 'object' && Number.isFinite(sp.x) && Number.isFinite(sp.y) && num(sp.life) > 0 ? { x: face(sp.x), y: face(sp.y), life: Math.min(WEAK.life, num(sp.life)) } : null,
    cell: int(w?.cell, -1, 8),
    streak: int(w?.streak),
    hits: int(w?.hits),
    rng: state(w?.rng),
  };
  // Dig Rush: the best and the cooldown are kept; a rush that was running when the app closed is
  // over (what it broke counts for the best) and the block that was being dug comes back.
  const r = raw.rush;
  // The latest time ever seen is the stored last-seen when there is one (every real save has
  // seen <= lastSeen); the wait can never be longer than one cooldown from it, whatever a
  // damaged save or a once-wrong device clock left in `readyAt`.
  const seen = d.lastSeen > 0 ? d.lastSeen : num(r?.seen);
  d.rush = { ...d.rush, best: int(r?.best), count: int(r?.count), readyAt: Math.min(num(r?.readyAt), seen + RUSH.cooldown * 1000), seen, rng: state(r?.rng) };
  if (num(r?.left) > 0) {
    d.rush.best = Math.max(d.rush.best, int(r?.blocks));
    d.rush.count += 1;
    d.block = sanitizeBlock(r?.held?.block, d.layer);
    d.damage = num(r?.held?.damage);
  }
  // a meteor block shows its star core, never a weak spot (as when one is drawn in play)
  if (d.block.kind === 'meteor' && d.weak.spot) {
    d.weak.spot = null;
    d.weak.in = 0;
  }
  return d;
}

/**
 * Save v1 (four layers, no expeditions) → v2. Everything a player had is kept: the collection
 * becomes the museum, best grades and the rarest find become records; new systems start fresh.
 */
export function migrateV1(old: unknown): unknown {
  if (!old || typeof old !== 'object') return old;
  const o = old as Partial<DigSave>;
  const counts = o.counts ?? {};
  const best: Record<string, number> = {};
  for (const [id, g] of Object.entries(counts)) best[id] = Array.isArray(g) ? g.reduce((m: number, n: number, i: number) => (n > 0 ? i : m), 0) : 0;
  const broken = Array.isArray(o.broken) ? [...o.broken] : [];
  while (broken.length < LAYERS.length) broken.push(0);
  return {
    ...o,
    broken,
    discovered: Object.keys(counts),
    best,
    deepest: typeof o.unlocked === 'number' ? o.unlocked : 0,
    records: { rare: o.stats?.bestId ? [{ id: o.stats.bestId, odds: o.stats.bestOdds ?? 0, at: 0 }] : [], sets: {}, layerStart: [0] },
  };
}

/** A loaded block: unknown kinds become normal; a meteor keeps a core on its face, an echo an earlier layer. */
function sanitizeBlock(b: Partial<BlockState> | undefined, layer: number): BlockState {
  if (!b || typeof b !== 'object' || !BLOCK_KINDS.includes(b.kind as BlockKind)) return { kind: 'normal', timer: -1 };
  const out: BlockState = { kind: b.kind as BlockKind, timer: typeof b.timer === 'number' && Number.isFinite(b.timer) ? b.timer : -1 };
  const unit = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(0.85, Math.max(0.15, v)) : 0.5);
  if (out.kind === 'meteor') {
    out.x = unit(b.x);
    out.y = unit(b.y);
  }
  if (out.kind === 'echo') {
    if (layer < 1) return { kind: 'normal', timer: -1 };
    out.echo = Math.min(layer - 1, int(b.echo));
  }
  return out;
}

/**
 * Save v2 (ten layers) → v3 (thirteen: Abyssal Trench, Star Crater, Time Rift). Nothing is lost:
 * per-layer arrays grow, new counters start at zero, and the save does not get the "news-depth"
 * tip marked, so a player who has reached the First Seas is told that three layers wait below.
 */
export function migrateV2(old: unknown): unknown {
  if (!old || typeof old !== 'object') return old;
  const o = old as Partial<DigSave>;
  const broken = Array.isArray(o.broken) ? [...o.broken] : [];
  while (broken.length < LAYERS.length) broken.push(0);
  const stats = { ...(o.stats ?? {}), cores: 0, echoes: 0 };
  return { ...o, broken, stats, tips: Array.isArray(o.tips) ? o.tips.filter((t) => t !== NEWS_TIP) : [] };
}

/** Score breakdown (pure): what each part of your progress is worth on the ladder. */
export interface ScoreBreakdown {
  species: number;
  grades: number;
  sets: number;
  depth: number;
  relics: number;
  expeditions: number;
  total: number;
}

export function scoreOf(s: Pick<DigSave, 'discovered' | 'best' | 'sets' | 'deepest' | 'fragments' | 'expedition'>): ScoreBreakdown {
  let species = 0;
  let grades = 0;
  for (const id of s.discovered) {
    const f = FOSSIL_BY_ID.get(id);
    if (!f) continue;
    species += at(SCORE.species, f.tier);
    grades += (s.best[id] ?? 0) * SCORE.grade;
  }
  const sets = s.sets.length * SCORE.set;
  const depth = s.deepest * SCORE.depth;
  const relics = Math.min(RELIC.max, Math.floor(s.fragments / RELIC.fragments)) * SCORE.relic;
  const expeditions = s.expedition.count * SCORE.expedition;
  return { species, grades, sets, depth, relics, expeditions, total: species + grades + sets + depth + relics + expeditions };
}

export class DigSim {
  private readonly s: DigSave;
  private readonly rng: Rng;
  /**
   * Weak spots and the Dig Rush draw from their own streams (forked from the seed by label, which
   * consumes nothing), so the main stream gives exactly what it gave before they existed.
   */
  private readonly weakRng: Rng;
  private readonly rushRng: Rng;
  /** The result of a rush that just ended, until the scene takes it. */
  private rushDone: RushResult | null = null;
  /** True while a hit is applied to the block set aside by a rush (the assistant, time away). */
  private onAside = false;
  /** False while the dig screen is not showing: weak spots wait (see setWatching). */
  private watching = true;
  private pendingOfflineDust = 0;
  /** Cached collection power (invalidated on every change to the collection). */
  private powerCache = -1;
  /** Events from the last glint tap (tapGlint returns only the find). */
  lastEvents: SimEvent[] = [];

  constructor(seed: number, save?: Partial<DigSave>) {
    this.s = sanitizeSave(save);
    this.rng = createRng(seed);
    this.weakRng = this.rng.fork('weak');
    this.rushRng = this.rng.fork('rush');
    if (this.s.rng !== 0) this.rng.setState(this.s.rng);
    if (this.s.weak.rng !== 0) this.weakRng.setState(this.s.weak.rng);
    if (this.s.rush.rng !== 0) this.rushRng.setState(this.s.rush.rng);
    // A brand-new dig shows its first glint early so players meet it; later ones come every 20-40 s.
    const fresh = this.s.stats.rolls === 0 && this.s.stats.taps === 0;
    if (this.s.glintIn < 0 && !this.s.glint) this.s.glintIn = fresh ? GLINT.first : this.nextGlintGap();
    // ...and its first weak spot earlier still (own stream: the glint draw above is untouched).
    if (this.s.weak.in < 0 && !this.s.weak.spot) this.s.weak.in = fresh ? WEAK.first : this.nextWeakGap();
    this.checkUnlocks();
  }

  // ---------------------------------------------------------------- weak spots and the rush (read)

  /** The weak spot showing on the block now, or null. */
  get weakSpot(): Readonly<WeakSpot> | null {
    return this.s.weak.spot;
  }
  /** Damage multiplier a precise hit deals right now (×4, +0.5 per precise hit in a row, up to ×6). */
  get weakMult(): number {
    return Math.min(WEAK.maxMult, WEAK.mult + WEAK.step * this.s.weak.streak);
  }
  /** Precise hits in a row (no spot left to expire between them). */
  get sharpEye(): number {
    return this.s.weak.streak;
  }
  get preciseHits(): number {
    return this.s.weak.hits;
  }
  /** Whether a tap at `at` (0..1 block face) would land on the weak spot. */
  onWeak(at?: { x: number; y: number }): boolean {
    const w = this.s.weak.spot;
    if (!w || !at || !Number.isFinite(at.x) || !Number.isFinite(at.y) || this.s.block.kind === 'meteor') return false;
    return (at.x - w.x) ** 2 + (at.y - w.y) ** 2 <= WEAK.radius ** 2;
  }

  /** The rush is offered at all: Topsoil has enough species in the museum. */
  get rushOpen(): boolean {
    return this.setProgress(0).found >= RUSH.species;
  }
  get rushActive(): boolean {
    return this.s.rush.left > 0;
  }
  /** Seconds left of the rush in progress. */
  get rushLeft(): number {
    return this.s.rush.left;
  }
  get rushBlocks(): number {
    return this.s.rush.blocks;
  }
  get rushDust(): number {
    return this.s.rush.dust;
  }
  get rushFinds(): number {
    return this.s.rush.rolls;
  }
  /** Most blocks ever broken in one rush. */
  get rushBest(): number {
    return this.s.rush.best;
  }
  get rushCount(): number {
    return this.s.rush.count;
  }
  /** Seconds of wall-clock time until the next rush may start (0 = now). */
  get rushWait(): number {
    return cooldown(this.s.rush.readyAt, this.s.rush.seen, 0).seconds;
  }
  /** A rush can start right now. */
  get rushReady(): boolean {
    return this.rushOpen && !this.rushActive && this.rushWait <= 0;
  }
  /** Health of a plain rush block on this layer right now (for the start card: taps it will take). */
  get rushHp(): number {
    return Math.max(1, Math.ceil(this.hpOf(this.s.layer) * RUSH.hp));
  }
  /**
   * The dig screen is showing (true) or another screen is (false). Weak spots only come and go
   * while it shows: a spot never expires, and the sharp eye is never lost, behind the museum.
   * Nothing else depends on it, and no rng stream is touched.
   */
  setWatching(on: boolean): void {
    this.watching = on;
  }
  /** Hits on rush blocks, as opposed to hits on the block a rush has set aside. */
  private get rushing(): boolean {
    return this.s.rush.left > 0 && !this.onAside;
  }

  // ---------------------------------------------------------------- new systems (read)

  get block(): Readonly<BlockState> {
    return this.s.block;
  }
  get dry(): number {
    return this.s.dry;
  }
  get feverSeconds(): number {
    return this.s.fever;
  }
  /** Fever meter fill, 0..1. */
  get feverFill(): number {
    return this.s.fever > 0 ? this.s.fever / FEVER.seconds : this.s.feverCharge / FEVER.charge;
  }
  get chainCount(): number {
    return this.s.chain.n;
  }
  get fragments(): number {
    return this.s.fragments;
  }
  get relics(): number {
    return Math.min(RELIC.max, Math.floor(this.s.fragments / RELIC.fragments));
  }
  get expeditions(): number {
    return this.s.expedition.count;
  }
  get deepest(): number {
    return this.s.deepest;
  }
  get quests(): readonly string[] {
    return this.s.quests;
  }
  get records(): Readonly<DigSave['records']> {
    return this.s.records;
  }
  get bestExpedition(): number {
    return this.s.expedition.best;
  }
  get dailyStreak(): number {
    return this.s.daily.streak;
  }
  get discoveredCount(): number {
    return this.s.discovered.length;
  }
  get score(): ScoreBreakdown {
    return scoreOf(this.s);
  }
  get rank(): number {
    return rankOf(this.score.total);
  }
  /** The expedition is open once the deepest layer has been reached in this run. */
  get canExpedition(): boolean {
    return this.s.unlocked >= EXPEDITION.needLayer;
  }
  /**
   * Each expedition digs a deeper stratum: block hp and the power needed to open each layer are
   * ×(1 + expeditions) there, while your expedition bonus grows by +60 % power and dust each time.
   */
  get strataMult(): number {
    return 1 + EXPEDITION.hard * this.s.expedition.count;
  }
  /** Dig power needed to open `layer` in this stratum. */
  unlockPowerOf(layer: number): number {
    return at(LAYERS, layer).unlockPower * this.strataMult;
  }
  /** Permanent multiplier from expeditions (dig power and dust). */
  get expeditionMult(): number {
    return 1 + EXPEDITION.power * this.s.expedition.count;
  }
  /** Pressure block: the damage multiplier your next tap gets at the combo shown now. */
  get pressureMult(): number {
    return PRESSURE.min + (PRESSURE.max - PRESSURE.min) * this.s.combo;
  }
  /**
   * Multiplier of your next plain tap on this block (hard vein ×0.25, pressure by combo, fever ×2),
   * before a meteor core hit. For the "N taps left" readout.
   */
  get tapMult(): number {
    const k = this.s.block.kind;
    const m = k === 'vein' ? VEIN.weak : k === 'pressure' ? this.pressureMult : 1;
    return m * (this.s.fever > 0 ? FEVER.damage : 1);
  }
  /** Meteor block: its star core (0..1 of the block face), or null. */
  get meteorCore(): { x: number; y: number } | null {
    const b = this.s.block;
    return b.kind === 'meteor' && b.x !== undefined && b.y !== undefined ? { x: b.x, y: b.y } : null;
  }
  /** Echo block: the earlier layer it echoes, or -1. */
  get echoLayer(): number {
    const b = this.s.block;
    return b.kind === 'echo' && b.echo !== undefined ? b.echo : -1;
  }
  /** Luck of the echo roll from your next tap: your tap luck, capped by the echoed layer. */
  get echoLuck(): number {
    const e = this.echoLayer;
    return e < 0 ? 1 : effectiveLuck(e, this.baseLuck * this.comboMult);
  }
  /** Luck of a boss-phase roll from your next tap. */
  get bossLuck(): number {
    return effectiveLuck(this.s.layer, this.baseLuck * this.comboMult * BOSS.luck);
  }
  /** Progress of an achievement towards its target. */
  questProgress(a: Achievement): number {
    switch (a.kind) {
      case 'finds':
        return this.s.stats.rolls;
      case 'species':
        return this.s.discovered.length;
      case 'tier':
        return this.s.discovered.filter((id) => (FOSSIL_BY_ID.get(id)?.tier ?? -1) >= (a.tier ?? 0)).length;
      case 'sets':
        return this.s.sets.length;
      case 'depth':
        return this.s.deepest + 1;
      case 'gold':
        return this.s.golds;
      case 'relics':
        return this.relics;
      case 'expeditions':
        return this.s.expedition.count;
      case 'cores':
        return this.s.stats.cores;
      case 'echoes':
        return this.s.stats.echoes;
    }
  }
  /** Inject the wall clock (ms) so records can carry dates; pure otherwise. */
  setClock(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.s.clock = ms;
    // the rush cooldown counts from the latest time ever seen: a clock wound back changes nothing
    this.s.rush.seen = cooldown(this.s.rush.readyAt, this.s.rush.seen, ms).seen;
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

  /** In the museum (found in any run). */
  discovered(id: string): boolean {
    return this.s.discovered.includes(id);
  }

  /** Best grade ever held (museum), or -1 if never found. */
  bestGrade(id: string): number {
    return this.discovered(id) ? (this.s.best[id] ?? 0) : -1;
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
    if (this.powerCache >= 0) return this.powerCache;
    let sum = 0;
    for (const [id, grades] of Object.entries(this.s.counts)) {
      const f = FOSSIL_BY_ID.get(id)!;
      grades.forEach((n, g) => {
        if (n) sum += n * fossilPower(f, g);
      });
    }
    this.powerCache = sum;
    return sum;
  }

  get pickMult(): number {
    return UPGRADES.pick.effect(this.s.levels.pick) * this.bonus('power') * this.expeditionMult * RELIC.power ** this.relics;
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
    return Math.ceil(L.hp * (1 + L.hpRamp * this.blocksBroken(layer)) ** 2 * this.strataMult);
  }

  get blockHp(): number {
    const k = this.s.block.kind;
    const m = k === 'twin' ? TWIN.hp : k === 'golden' ? GOLDEN.hp : k === 'cavein' ? CAVEIN.hp : k === 'boss' ? BOSS.hp : 1;
    // a rush block: a fixed share of the layer's normal health
    if (this.rushing) return Math.max(1, Math.ceil(this.hpOf(this.s.layer) * m * RUSH.hp));
    return Math.ceil(this.hpOf(this.s.layer) * m);
  }

  get blockDamage(): number {
    return this.s.damage;
  }

  blockDust(layer: number): number {
    const L = at(LAYERS, layer);
    return Math.ceil(L.dust * (this.hpOf(layer) / (L.hp * this.strataMult)) ** L.dustCurve * (1 + EXPEDITION.dust * this.s.expedition.count));
  }

  upgradeCost(id: UpgradeId): number | null {
    return upgradeCost(id, this.s.levels[id]);
  }

  canBuy(id: UpgradeId): boolean {
    const c = this.upgradeCost(id);
    return c !== null && c <= this.s.dust;
  }

  // ---------------------------------------------------------------- actions

  /**
   * A tap on the dig site. `at` is where it landed on the block face (0..1 of its width and
   * height): a meteor block's star core and the weak spot care. Without it a tap hits neither.
   */
  tap(at?: { x: number; y: number }): TapResult {
    return this.strike(1, false, at);
  }

  /** Whether a tap at `at` (0..1 block face) would strike the meteor core. */
  onCore(at?: { x: number; y: number }): boolean {
    const c = this.meteorCore;
    if (!c || !at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return false;
    return (at.x - c.x) ** 2 + (at.y - c.y) ** 2 <= METEOR.radius ** 2;
  }

  /**
   * A charged strike (hold, then release). On a hard vein the damage grows with the hold, from
   * ×0.25 (an instant tap) to ×5 dig power at a 0.8 s hold; on any other block it is a normal tap.
   */
  charge(holdSeconds: number, at?: { x: number; y: number }): TapResult {
    return this.strike(this.chargeMult(holdSeconds), true, this.s.block.kind === 'vein' ? at : undefined);
  }

  /** Damage multiplier a release after `holdSeconds` would deal on the current block. */
  chargeMult(holdSeconds: number): number {
    if (this.s.block.kind !== 'vein') return 1;
    const t = Math.min(1, Math.max(0, holdSeconds) / VEIN.fullHold);
    return VEIN.weak + (VEIN.maxCharge - VEIN.weak) * t;
  }

  private strike(mult: number, charged = false, at?: { x: number; y: number }): TapResult {
    this.s.stats.taps += 1;
    // Roll with the luck that was on screen, then let this tap raise the combo.
    const kind = this.s.block.kind;
    const veinWeak = kind === 'vein' && !charged ? VEIN.weak : 1;
    const pressure = kind === 'pressure' ? this.pressureMult : 1;
    const fever = this.s.fever > 0 ? FEVER.damage : 1;
    const core = this.onCore(at);
    if (core) {
      // the core is knocked to a new spot on the face (the block may also break on this hit)
      this.s.stats.cores += 1;
      this.s.block.x = this.rng.range(0.22, 0.78);
      this.s.block.y = this.rng.range(0.25, 0.75);
    }
    // The weak spot: this tap alone deals more. Nothing about the roll changes (same luck, same
    // stream); the spot is used up and the next one is scheduled from the weak-spot stream.
    const precise = this.onWeak(at);
    let weak = 1;
    if (precise) {
      const w = this.s.weak;
      weak = this.weakMult;
      w.spot = null;
      w.in = w.gap;
      w.streak += 1;
      w.hits += 1;
    }
    const r = this.hit('tap', this.baseLuck * this.comboMult, mult * veinWeak * pressure * fever * (core ? METEOR.core : 1) * weak);
    r.core = core;
    r.precise = precise;
    r.sharp = precise ? this.s.weak.streak : 0;
    this.s.combo = Math.min(1, this.s.combo + COMBO.perTap);
    this.s.idle = 0;
    if (this.s.fever <= 0) {
      this.s.feverCharge = Math.min(FEVER.charge, this.s.feverCharge + this.s.combo);
      if (this.s.feverCharge >= FEVER.charge) {
        this.s.feverCharge = 0;
        this.s.fever = FEVER.seconds;
        r.events.push({ kind: 'fever' });
      }
    }
    return r;
  }

  /** A tap on the glint: one extra roll at 10x luck. Null when no glint is showing. */
  tapGlint(): Find | null {
    const g = this.s.glint;
    if (!g) return null;
    this.s.glint = null;
    this.s.glintIn = this.nextGlintGap();
    const events: SimEvent[] = [];
    const f = this.roll('glint', g.luck, 0, events);
    this.checkQuests(events);
    this.lastEvents = events;
    return f;
  }

  /** Advance time: combo drain, glint timer, boost timer, assistant digging. */
  tick(dt: number): TickResult {
    const out: TickResult = { finds: [], assistantHits: 0, glintAppeared: false, glintExpired: false, weakAppeared: false, weakExpired: false, events: [], breaks: 0 };
    if (!(dt > 0)) return out;
    // during a rush the glint timer holds; the assistant works on the block that was set aside
    const rushing = this.s.rush.left > 0;
    this.s.stats.playSeconds += dt;
    // fever: when it ends the combo drops back
    if (this.s.fever > 0) {
      this.s.fever = Math.max(0, this.s.fever - dt);
      if (this.s.fever === 0) out.events.push({ kind: 'feverEnd' });
    }
    // unstable block: the bonus window runs out and the block settles (in a rush this is the
    // block set aside: its window runs as in normal play, a rush does not freeze it)
    const held = rushing ? this.s.rush.held : null;
    const live = held ? held.block : this.s.block;
    if (live.kind === 'unstable' && live.timer > 0) {
      live.timer = Math.max(0, live.timer - dt);
      if (live.timer === 0) {
        if (held) held.block = { kind: 'normal', timer: -1 };
        else {
          this.s.block = { kind: 'normal', timer: -1 };
          out.events.push({ kind: 'settled' });
        }
      }
    }
    // combo
    const before = this.s.idle;
    this.s.idle += dt;
    const drainFor = Math.max(0, this.s.idle - Math.max(before, COMBO.grace));
    if (drainFor > 0 && this.s.fever <= 0) this.s.combo = Math.max(0, this.s.combo - COMBO.drain * drainFor);
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
    } else if (!rushing) {
      this.s.glintIn -= dt;
      if (this.s.glintIn <= 0) {
        this.s.glint = { x: this.rng.range(0.15, 0.85), y: this.rng.range(0.15, 0.85), life: GLINT.life, luck: this.baseLuck * this.comboMult * GLINT.luck };
        out.glintAppeared = true;
      }
    }
    // weak spot (own stream): shows for WEAK.life, never appears while a glint is up or on a
    // meteor block (its core is the target there), and makes way if a glint appears
    const w = this.s.weak;
    if (!this.watching) {
      // another screen is showing: the spot and its timer wait
    } else if (w.spot) {
      if (this.s.glint) {
        w.spot = null;
        w.in = 0; // back as soon as the glint is gone; the sharp eye is not broken
        out.weakExpired = true;
      } else {
        w.spot.life -= dt;
        if (w.spot.life <= 0) {
          w.spot = null;
          w.streak = 0;
          w.in = w.gap;
          out.weakExpired = true;
        }
      }
    } else {
      w.in = Math.max(0, w.in - dt);
      if (w.in <= 0 && !this.s.glint && this.s.block.kind !== 'meteor') {
        this.spawnWeak();
        out.weakAppeared = true;
      }
    }
    // the rush clock
    if (rushing) {
      this.s.rush.left = Math.max(0, this.s.rush.left - dt);
      if (this.s.rush.left === 0) this.rushDone = this.finishRush('time');
    }
    // assistant: in a rush it keeps digging the block that was set aside, exactly as it would
    // without the rush (normal health, main stream, assistant luck); rush blocks are yours alone
    const rate = this.assistantRate;
    if (rate > 0) {
      this.s.assistantAcc += rate * dt;
      while (this.s.assistantAcc >= 1) {
        this.s.assistantAcc -= 1;
        out.assistantHits += 1;
        const aside = this.s.rush.left > 0;
        const r = aside ? this.aside(() => this.hit('assistant', this.baseLuck, this.passiveMult)) : this.hit('assistant', this.baseLuck, this.passiveMult);
        if (r.find) out.finds.push(r.find);
        out.finds.push(...r.extra);
        if (aside) {
          // the block on screen did not break, and what the next set-aside block is stays unannounced
          for (const e of r.events) if (e.kind === 'quest' || e.kind === 'rank' || e.kind === 'pity' || e.kind === 'fragment' || e.kind === 'relic') out.events.push(e);
        } else {
          if (r.broke) out.breaks += 1;
          out.events.push(...r.events);
        }
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
    this.checkQuests([]);
    return true;
  }

  travel(layer: number): boolean {
    if (!Number.isInteger(layer) || layer < 0 || layer > this.s.unlocked || layer === this.s.layer) return false;
    if (this.s.rush.left > 0) return false; // a rush stays on its layer
    this.s.layer = layer;
    this.s.damage = 0;
    this.newBlock();
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
    const haul: OfflineHaul = { seconds: 0, hits: 0, blocks: 0, dust: 0, found: {}, newSpecies: [], fusions: 0, best: null, unlocked: null, lucks: [], notable: [], rolls: 0, quests: [], questDust: 0 };
    // The rewarded boost is a wall-clock 60 s: time away uses it up, and offline rolls never get it.
    if (elapsedSeconds > 0) this.s.boost = Math.max(0, this.s.boost - elapsedSeconds);
    // A rush survives a short absence (its clock simply did not run); RUSH.away seconds or more
    // end it (what it broke counts). Either way time away never digs rush blocks: until the rush
    // is over its hits go to the block that was set aside.
    if (this.s.rush.left > 0 && elapsedSeconds >= RUSH.away) this.rushDone = this.finishRush('away');
    const rate = this.assistantRate;
    if (!(elapsedSeconds > 0) || rate <= 0) return haul;
    haul.seconds = Math.min(elapsedSeconds, this.offlineCap);
    haul.hits = Math.floor(haul.seconds * rate * OFFLINE.efficiency);
    const haulLuck = this.luckNoBoost; // fixed for the whole haul
    for (let i = 0; i < haul.hits; i++) {
      const r = this.s.rush.left > 0 ? this.aside(() => this.hit('offline', haulLuck, this.passiveMult)) : this.hit('offline', haulLuck, this.passiveMult);
      if (r.broke) haul.blocks += 1;
      haul.dust += r.dust;
      for (const e of r.events)
        if (e.kind === 'quest') {
          haul.quests.push(e.id);
          haul.questDust += e.dust;
        }
      for (const f of r.find ? [r.find, ...r.extra] : r.extra) {
      haul.rolls += 1;
      haul.fusions += f.fusions;
      haul.found[f.fossil.id] = (haul.found[f.fossil.id] ?? 0) + 1;
      if (!haul.lucks.includes(f.luck)) haul.lucks.push(f.luck);
      if (f.isNew) haul.newSpecies.push(f.fossil.id);
      if (f.fossil.odds >= 1000) haul.notable.push(f);
      if (!haul.best || f.fossil.odds > haul.best.odds) haul.best = f.fossil;
      if (f.unlocked !== null) haul.unlocked = f.unlocked;
      }
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
    if (isNew) this.s.discovered.push(id);
    this.powerCache = -1;
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
      if (grade === GRADE_COUNT - 1) this.s.golds += 1;
    }
    this.s.best[id] = Math.max(this.s.best[id] ?? 0, grade);
    let setCompleted: number | null = null;
    if (isNew && !this.s.sets.includes(f.layer) && layerFossils(f.layer).every((x) => this.discovered(x.id))) {
      this.s.sets.push(f.layer);
      setCompleted = f.layer;
      const start = this.s.records.layerStart[f.layer];
      if (start !== undefined && start >= 0 && this.s.records.sets[String(f.layer)] === undefined) this.s.records.sets[String(f.layer)] = this.s.stats.playSeconds - start;
    }
    return { grade, fusions, isNew, setCompleted };
  }

  toSave(): DigSave {
    this.saveRng();
    return structuredClone(this.s);
  }

  // ---------------------------------------------------------------- internals

  /** Damage multiplier of the assistant's and time-away hits: hard veins ×0.25, pressure ×min. */
  private get passiveMult(): number {
    const k = this.s.block.kind;
    return k === 'vein' ? VEIN.weak : k === 'pressure' ? PRESSURE.min : 1;
  }

  private hit(source: FindSource, luck: number, mult = 1): TapResult {
    const out: TapResult = { damage: 0, find: null, extra: [], events: [], broke: false, dust: 0, core: false, precise: false, sharp: 0 };
    const rushing = this.rushing;
    const b = this.s.block;
    const damage = this.digPower * mult;
    out.damage = damage;
    const hp = this.blockHp;
    const before = this.s.damage;
    this.s.damage += damage;
    if (b.kind === 'unstable' && b.timer < 0) b.timer = UNSTABLE.window;
    if (b.kind === 'boss') {
      // phases: each third of the boss's hp rolls once at boss luck
      const step = hp / BOSS.phases;
      const from = Math.floor(before / step);
      const to = Math.min(BOSS.phases - 1, Math.floor(Math.min(this.s.damage, hp - 1e-9) / step));
      for (let ph = from + 1; ph <= to; ph++) {
        out.events.push({ kind: 'phase', phase: ph });
        out.extra.push(this.roll(source, luck * BOSS.luck, 0, out.events));
      }
    }
    if (this.s.damage < hp) {
      if (out.extra.length) this.checkQuests(out.events);
      this.saveRng();
      return out;
    }
    // Break: at most one block per hit, overkill is discarded.
    out.broke = true;
    const layer = this.s.layer;
    const baseDust = this.blockDust(layer); // priced before the hp ramp moves on
    // rush blocks are counted on their own: they never harden the stratum or move the boss on
    if (rushing) this.s.rush.blocks += 1;
    else this.s.broken[layer] = this.blocksBroken(layer) + 1;
    this.s.damage = 0;
    let dustMult = b.kind === 'golden' ? GOLDEN.dust : b.kind === 'cavein' ? CAVEIN.dust : b.kind === 'boss' ? BOSS.dust : 1;
    if (rushing) dustMult *= RUSH.dust;
    if (source !== 'offline' && this.s.fever > 0) dustMult *= FEVER.dust;
    if (source === 'tap') {
      const t = this.s.stats.playSeconds;
      this.s.chain.n = t - this.s.chain.last <= CHAIN.window ? this.s.chain.n + 1 : 1;
      this.s.chain.last = t;
      if (this.s.chain.n >= 2) {
        dustMult *= this.chainMult;
        out.events.push({ kind: 'chain', n: this.s.chain.n });
      }
    }
    const dust = Math.ceil(baseDust * dustMult);
    this.s.dust += dust;
    out.dust = dust;
    if (rushing) this.s.rush.dust += dust;
    if (b.kind === 'cavein') {
      // rubble: no fossil, just dust
      this.newBlock(out.events);
      this.checkQuests(out.events);
      this.saveRng();
      return out;
    }
    const bossLuck = b.kind === 'boss' ? BOSS.luck : 1;
    out.find = this.roll(source, luck * bossLuck, dust, out.events);
    const rolls = b.kind === 'twin' ? TWIN.rolls : b.kind === 'golden' ? GOLDEN.rolls : b.kind === 'unstable' && b.timer > 0 ? 2 : 1;
    for (let i = 1; i < rolls; i++) out.extra.push(this.roll(source, luck, 0, out.events));
    if (b.kind === 'echo' && b.echo !== undefined) {
      // the echoed age: one more roll, from that layer's own table, at your luck capped there
      this.s.stats.echoes += 1;
      out.extra.push(this.roll(source, luck, 0, out.events, b.echo));
    }
    if (!rushing && LAYERS[layer]?.twist === 'relic' && this.relics < RELIC.max && this.rng.next() < RELIC.chance) {
      const had = this.relics;
      this.s.fragments += 1;
      this.powerCache = -1;
      out.events.push({ kind: 'fragment', fragments: this.s.fragments, relics: this.relics });
      if (this.relics > had) {
        out.events.push({ kind: 'relic', relics: this.relics });
        const u = this.checkUnlocks();
        if (u !== null) out.find.unlocked = u;
      }
    }
    this.newBlock(out.events);
    this.checkQuests(out.events);
    this.saveRng();
    return out;
  }

  /** Dust multiplier of the current tap chain (1 when not chaining). */
  get chainMult(): number {
    const n = this.s.chain.n;
    return n >= 2 ? Math.min(CHAIN.max, 1 + CHAIN.step * (n - 1)) : 1;
  }

  /** Choose the next block: golden anywhere (after the first 40 finds), else the layer's twist. */
  private newBlock(events?: SimEvent[]): void {
    const layer = this.s.layer;
    if (this.rushing) {
      // a rush block: plain, or golden at the usual chance (drawn from the rush stream)
      const golden = this.s.stats.rolls >= GOLDEN.after && this.rushRng.next() < GOLDEN.chance;
      this.s.block = { kind: golden ? 'golden' : 'normal', timer: -1 };
      if (golden && events) events.push({ kind: 'golden' });
      return;
    }
    const twist = LAYERS[layer]?.twist ?? 'none';
    let kind: BlockKind = 'normal';
    const broken = this.blocksBroken(layer);
    if (twist === 'boss' && broken % BOSS.every === BOSS.every - 1) kind = 'boss';
    else if (this.s.stats.rolls >= GOLDEN.after && this.rng.next() < GOLDEN.chance) kind = 'golden';
    else if (twist === 'vein' && this.rng.next() < VEIN.chance) kind = 'vein';
    else if (twist === 'unstable' && this.rng.next() < UNSTABLE.chance) kind = 'unstable';
    else if (twist === 'twin' && this.rng.next() < TWIN.chance) kind = 'twin';
    else if (twist === 'cavein' && this.rng.next() < CAVEIN.chance) kind = 'cavein';
    else if (twist === 'pressure' && this.rng.next() < PRESSURE.chance) kind = 'pressure';
    else if (twist === 'meteor' && this.rng.next() < METEOR.chance) kind = 'meteor';
    else if (twist === 'echo' && layer > 0 && this.rng.next() < ECHO.chance) kind = 'echo';
    this.s.block = { kind, timer: -1 };
    if (kind === 'meteor') {
      this.s.block.x = this.rng.range(0.22, 0.78);
      this.s.block.y = this.rng.range(0.25, 0.75);
    }
    if (kind === 'echo') this.s.block.echo = Math.min(layer - 1, Math.floor(this.rng.next() * layer));
    // a star core is the target on a meteor block: a weak spot showing makes way (sharp eye kept);
    // not for a block set aside by a rush (the spot is on the rush block: see finishRush)
    if (kind === 'meteor' && this.s.weak.spot && !this.onAside) {
      this.s.weak.spot = null;
      this.s.weak.in = 0;
    }
    if (events) {
      if (kind === 'golden') events.push({ kind: 'golden' });
      if (kind === 'cavein') events.push({ kind: 'cavein' });
      if (kind === 'boss') events.push({ kind: 'boss' });
      if (kind === 'meteor') events.push({ kind: 'meteor' });
      if (kind === 'echo') events.push({ kind: 'echo', layer: this.s.block.echo ?? 0 });
    }
  }

  /**
   * One fossil roll. After PITY rolls in a row without a 1-in-100-or-rarer find, the next roll is
   * the lucky streak: guaranteed tier 2+, chosen in the printed proportions among those fossils.
   */
  private roll(source: FindSource, luck: number, dust = 0, events: SimEvent[] = [], layer = this.s.layer): Find {
    const applied = effectiveLuck(layer, luck);
    const pity = this.s.dry >= PITY;
    // a rush find is a tap find from the same table at the same luck; only its stream differs
    const rush = this.rushing && source === 'tap';
    const rng = rush ? this.rushRng : this.rng;
    const fossil = pity ? rollRare(layer, rng) : rollFossil(layer, applied, rng);
    this.s.dry = fossil.tier >= LUCKY_TIER ? 0 : this.s.dry + 1;
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
    this.recordRare(fossil);
    this.s.lastFind = { id: fossil.id, grade: c.grade, luck: applied, source };
    const unlocked = this.checkUnlocks();
    this.saveRng();
    if (pity) events.push({ kind: 'pity' });
    const find: Find = { fossil, grade: c.grade, fusions: c.fusions, isNew: c.isNew, source, luck: applied, dust, setCompleted: c.setCompleted, unlocked, powerGain: this.digPower - powerBefore, pity, block: this.s.block.kind };
    if (rush) {
      const r = this.s.rush;
      r.rolls += 1;
      r.found[fossil.id] = (r.found[fossil.id] ?? 0) + 1;
      if (c.isNew) r.fresh.push(fossil.id);
      find.rush = true;
    }
    return find;
  }

  // ---------------------------------------------------------------- Dig Rush

  /**
   * Start a rush on the current layer: RUSH.seconds of blocks at RUSH.hp of the normal health.
   * The block being dug is set aside and comes back afterwards. False when it is not ready.
   */
  startRush(): boolean {
    if (!this.rushReady) return false;
    const r = this.s.rush;
    r.held = { block: { ...this.s.block }, damage: this.s.damage };
    r.left = RUSH.seconds;
    r.blocks = 0;
    r.dust = 0;
    r.rolls = 0;
    r.found = {};
    r.fresh = [];
    r.readyAt = r.seen + RUSH.cooldown * 1000;
    this.rushDone = null;
    this.s.damage = 0;
    this.newBlock();
    this.saveRng();
    return true;
  }

  /** End the rush now (the dig screen is being left). Returns its result, or null if none ran. */
  stopRush(): RushResult | null {
    return this.s.rush.left > 0 ? this.finishRush('left') : null;
  }

  /**
   * Run `fn` against the block a rush has set aside (the assistant, time away): for its length
   * that block is the one being dug, by the normal rules, and the rush block waits untouched.
   */
  private aside<T>(fn: () => T): T {
    const r = this.s.rush;
    const held = (r.held ??= { block: { kind: 'normal', timer: -1 }, damage: 0 });
    const rushBlock = this.s.block;
    const rushDamage = this.s.damage;
    this.s.block = held.block;
    this.s.damage = held.damage;
    this.onAside = true;
    try {
      return fn();
    } finally {
      held.block = this.s.block;
      held.damage = this.s.damage;
      this.s.block = rushBlock;
      this.s.damage = rushDamage;
      this.onAside = false;
    }
  }

  /** The result of a rush that ended since the last call (time ran out, or the app was left). */
  takeRushResult(): RushResult | null {
    const r = this.rushDone;
    this.rushDone = null;
    return r;
  }

  private finishRush(ended: RushResult['ended']): RushResult {
    const r = this.s.rush;
    const finds = Object.entries(r.found)
      .map(([id, n]) => ({ fossil: FOSSIL_BY_ID.get(id)!, n, isNew: r.fresh.includes(id) }))
      .sort((a, b) => b.fossil.odds - a.fossil.odds || (a.fossil.id < b.fossil.id ? -1 : 1));
    const result: RushResult = { layer: this.s.layer, blocks: r.blocks, dust: r.dust, rolls: r.rolls, finds, best: r.best, record: r.blocks > r.best, ended };
    r.best = Math.max(r.best, r.blocks);
    r.count += 1;
    r.left = 0;
    // the block that was being dug before the rush comes back as it was
    this.s.block = r.held ? r.held.block : { kind: 'normal', timer: -1 };
    this.s.damage = r.held ? r.held.damage : 0;
    r.held = null;
    // a meteor block is back: its star core is the target, a weak spot showing makes way as it
    // does when a meteor block is drawn (the sharp eye is kept, the spot returns on the next block)
    if (this.s.block.kind === 'meteor' && this.s.weak.spot) {
      this.s.weak.spot = null;
      this.s.weak.in = 0;
    }
    r.blocks = 0;
    r.dust = 0;
    r.rolls = 0;
    r.found = {};
    r.fresh = [];
    this.saveRng();
    return result;
  }

  /** A new weak spot: one of nine cells of the block face, never the cell of the one before. */
  private spawnWeak(): void {
    const w = this.s.weak;
    const cell = w.cell < 0 ? this.weakRng.int(0, 8) : (w.cell + 1 + this.weakRng.int(0, 7)) % 9;
    w.cell = cell;
    w.spot = { x: 0.25 + (cell % 3) * 0.25 + this.weakRng.range(-0.03, 0.03), y: 0.25 + Math.floor(cell / 3) * 0.25 + this.weakRng.range(-0.03, 0.03), life: WEAK.life };
    // the wait after this spot is drawn now, so the stream advances the same however the spot ends
    w.gap = this.nextWeakGap();
  }

  private nextWeakGap(): number {
    return this.weakRng.range(WEAK.minGap, WEAK.maxGap);
  }

  /** Keep the five rarest species ever found, each with the date of its first find. */
  private recordRare(f: Fossil): void {
    const r = this.s.records.rare;
    if (r.some((x) => x.id === f.id)) return;
    if (r.length >= 5 && f.odds <= (r[r.length - 1]?.odds ?? 0)) return;
    r.push({ id: f.id, odds: f.odds, at: this.s.clock });
    r.sort((a, b) => b.odds - a.odds);
    r.length = Math.min(r.length, 5);
  }

  /** Grant newly met achievements (dust reward) and note a rank-up. */
  private checkQuests(events: SimEvent[]): void {
    for (const a of ACHIEVEMENTS) {
      if (this.s.quests.includes(a.id) || this.questProgress(a) < a.target) continue;
      this.s.quests.push(a.id);
      const dust = a.reward * this.blockDust(this.s.unlocked);
      this.s.dust += dust;
      events.push({ kind: 'quest', id: a.id, dust });
    }
    const r = this.rank;
    if (r > this.s.rank) {
      this.s.rank = r;
      events.push({ kind: 'rank', rank: r });
    }
  }

  /**
   * Expedition: once the deepest layer is open, restart from Topsoil. Kept: the museum, set
   * bonuses, relics, records, achievements, daily streak. Gained: +60% dig power and dust, forever.
   */
  expedition(): boolean {
    if (!this.canExpedition) return false;
    if (this.s.rush.left > 0) this.finishRush('left');
    const t = this.s.stats.playSeconds - this.s.expedition.runStart;
    this.s.expedition.best = this.s.expedition.best > 0 ? Math.min(this.s.expedition.best, t) : t;
    this.s.expedition.count += 1;
    this.s.expedition.runStart = this.s.stats.playSeconds;
    this.s.counts = {};
    this.s.dust = 0;
    this.s.levels = defaultSave().levels;
    this.s.layer = 0;
    this.s.unlocked = 0;
    this.s.broken = LAYERS.map(() => 0);
    this.s.damage = 0;
    this.s.combo = 0;
    this.s.fever = 0;
    this.s.feverCharge = 0;
    this.s.chain = { n: 0, last: -99 };
    this.s.assistantAcc = 0;
    this.s.block = { kind: 'normal', timer: -1 };
    this.powerCache = -1;
    const ev: SimEvent[] = [];
    this.checkQuests(ev);
    this.lastEvents = ev;
    this.checkUnlocks();
    return true;
  }

  /**
   * Daily dig bonus for calendar day `day` (days since epoch, local, from the scene). Once per day;
   * consecutive days grow the streak up to 7. Reward: streak x 15 blocks of dust at your deepest
   * open layer and 3 minutes of x2 luck. Null if already claimed today.
   */
  claimDaily(day: number): { streak: number; dust: number; boost: number } | null {
    if (!Number.isInteger(day) || day <= this.s.daily.day) return null;
    const streak = day === this.s.daily.day + 1 ? Math.min(DAILY.maxStreak, this.s.daily.streak + 1) : 1;
    this.s.daily = { day, streak };
    const dust = DAILY.dustBlocks * streak * this.blockDust(this.s.unlocked);
    this.s.dust += dust;
    this.grantLuckBoost(DAILY.boostSeconds);
    return { streak, dust, boost: DAILY.boostSeconds };
  }

  /** Whether today's daily bonus is still unclaimed. */
  dailyOpen(day: number): boolean {
    return Number.isInteger(day) && day > this.s.daily.day;
  }

  /** Unlock every layer whose threshold dig power has reached. Returns the deepest newly unlocked. */
  private checkUnlocks(): number | null {
    let newly: number | null = null;
    const p = this.digPower;
    while (this.s.unlocked < LAYERS.length - 1 && p >= this.unlockPowerOf(this.s.unlocked + 1)) {
      this.s.unlocked += 1;
      newly = this.s.unlocked;
      this.s.deepest = Math.max(this.s.deepest, this.s.unlocked);
      if (this.s.records.layerStart[this.s.unlocked] === undefined) this.s.records.layerStart[this.s.unlocked] = this.s.stats.playSeconds;
    }
    return newly;
  }

  private nextGlintGap(): number {
    return this.rng.range(GLINT.minGap, GLINT.maxGap);
  }

  private saveRng(): void {
    this.s.rng = this.rng.getState();
    this.s.weak.rng = this.weakRng.getState();
    this.s.rush.rng = this.rushRng.getState();
  }
}

/** All fossil ids, for UI iteration. */
export const ALL_FOSSIL_IDS: readonly string[] = FOSSILS.map((f) => f.id);
