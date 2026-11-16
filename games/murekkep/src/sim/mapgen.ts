/**
 * Paper-sheet generation (pure, seeded). The sheet is a grid of cells; `land[i] = 1` is paper,
 * 0 is a gap (torn hole / desk showing through). One 4-connected landmass, colony starts placed
 * by farthest-point sampling over BFS distance so nobody starts boxed in.
 */
import { createRng, type Rng } from '@oyun/core/pure';

export interface MapSize {
  width: number;
  height: number;
}

export interface GameMap {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** 1 = paper (playable), 0 = gap. */
  readonly land: Uint8Array;
  readonly landCount: number;
  /** Start cell per colony, index = colony id. */
  readonly starts: number[];
}

/** Radius (cells) of fully-paper disc required around every start. */
export const START_ROOM = 3;
/** Minimum Manhattan distance between two starts. */
const MIN_START_GAP = 10;

/** 4-neighbours of cell c inside a w×h grid. */
export function neighbours4(c: number, w: number, h: number): number[] {
  const x = c % w;
  const y = (c - x) / w;
  const out: number[] = [];
  if (x > 0) out.push(c - 1);
  if (x < w - 1) out.push(c + 1);
  if (y > 0) out.push(c - w);
  if (y < h - 1) out.push(c + w);
  return out;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise in [0,1] on a lattice with `step` cells between lattice points. */
function valueNoise(rng: Rng, w: number, h: number, step: number): Float32Array {
  const gw = Math.ceil(w / step) + 2;
  const gh = Math.ceil(h / step) + 2;
  const lattice = new Float32Array(gw * gh);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const out = new Float32Array(w * h);
  const ox = rng.range(0, 1);
  const oy = rng.range(0, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / step + ox;
      const fy = y / step + oy;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = smooth(fx - ix);
      const ty = smooth(fy - iy);
      const a = lattice[iy * gw + ix]!;
      const b = lattice[iy * gw + ix + 1]!;
      const c = lattice[(iy + 1) * gw + ix]!;
      const d = lattice[(iy + 1) * gw + ix + 1]!;
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/** Keep only the largest 4-connected component of land. */
function keepLargest(land: Uint8Array, w: number, h: number): void {
  const label = new Int32Array(land.length).fill(-1);
  let best = -1;
  let bestSize = 0;
  let next = 0;
  for (let i = 0; i < land.length; i++) {
    if (!land[i] || label[i]! >= 0) continue;
    const stack = [i];
    label[i] = next;
    let size = 0;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const d of neighbours4(c, w, h)) {
        if (land[d] && label[d]! < 0) {
          label[d] = next;
          stack.push(d);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
    next++;
  }
  for (let i = 0; i < land.length; i++) if (land[i] && label[i] !== best) land[i] = 0;
}

/** BFS distance over land from a set of sources (-1 = unreachable / gap). */
export function landDistance(land: Uint8Array, w: number, h: number, sources: readonly number[]): Int32Array {
  const dist = new Int32Array(land.length).fill(-1);
  const queue: number[] = [];
  for (const s of sources) {
    dist[s] = 0;
    queue.push(s);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi]!;
    for (const d of neighbours4(c, w, h)) {
      if (land[d] && dist[d] === -1) {
        dist[d] = dist[c]! + 1;
        queue.push(d);
      }
    }
  }
  return dist;
}

function hasRoom(land: Uint8Array, w: number, h: number, c: number): boolean {
  const x = c % w;
  const y = (c - x) / w;
  const r = START_ROOM;
  if (x - r < 0 || y - r < 0 || x + r >= w || y + r >= h) return false;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      if (!land[(y + dy) * w + x + dx]) return false;
    }
  }
  return true;
}

function manhattan(a: number, b: number, w: number): number {
  return Math.abs((a % w) - (b % w)) + Math.abs(Math.floor(a / w) - Math.floor(b / w));
}

function tryGenerate(rng: Rng, w: number, h: number, colonies: number): { land: Uint8Array; starts: number[] } | null {
  const coarse = valueNoise(rng.fork('coarse'), w, h, 9);
  const fine = valueNoise(rng.fork('fine'), w, h, 4);
  const holes = valueNoise(rng.fork('holes'), w, h, 6);
  const field = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Elliptical falloff keeps paper away from the sheet edges (torn border).
      const nx = (x + 0.5) / w - 0.5;
      const ny = (y + 0.5) / h - 0.5;
      const edge = Math.max(Math.abs(nx) * 2, Math.abs(ny) * 2);
      const fall = edge > 0.6 ? (edge - 0.6) * 1.6 : 0;
      field[i] = coarse[i]! * 0.6 + fine[i]! * 0.4 - fall - (edge > 0.94 ? 1 : 0);
    }
  }
  // Threshold at a quantile so land fraction is stable across seeds.
  const sorted = Array.from(field).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.3)]!;
  const land = new Uint8Array(w * h);
  for (let i = 0; i < land.length; i++) {
    // Interior gaps: a few lakes where the hole noise peaks.
    const lake = holes[i]! > 0.77;
    land[i] = field[i]! > threshold && !lake ? 1 : 0;
  }
  keepLargest(land, w, h);

  const candidates: number[] = [];
  for (let i = 0; i < land.length; i++) if (land[i] && hasRoom(land, w, h, i)) candidates.push(i);
  if (candidates.length < colonies) return null;

  const starts: number[] = [rng.pick(candidates)];
  // Re-anchor the first start to the candidate farthest from it, then farthest-point sample.
  let dist = landDistance(land, w, h, starts);
  let far = starts[0]!;
  for (const c of candidates) if (dist[c]! > dist[far]!) far = c;
  starts[0] = far;
  while (starts.length < colonies) {
    dist = landDistance(land, w, h, starts);
    let best = -1;
    let bestScore = -1;
    for (const c of candidates) {
      const d = dist[c]!;
      if (d < 0) continue;
      // Small jitter so different seeds do not always pick the same corners.
      const score = d + rng.next() * 2;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best < 0) return null;
    starts.push(best);
  }
  for (let a = 0; a < starts.length; a++) {
    for (let b = a + 1; b < starts.length; b++) {
      if (manhattan(starts[a]!, starts[b]!, w) < MIN_START_GAP) return null;
    }
  }
  return { land, starts };
}

/** Generate a sheet. Deterministic for (seed, size, colonies). */
export function generateMap(seed: number, size: MapSize, colonies: number, id = `map-${seed}`): GameMap {
  const { width: w, height: h } = size;
  const root = createRng(seed);
  for (let attempt = 0; attempt < 40; attempt++) {
    const got = tryGenerate(root.fork(`attempt-${attempt}`), w, h, colonies);
    if (!got) continue;
    let landCount = 0;
    for (let i = 0; i < got.land.length; i++) landCount += got.land[i]!;
    return { id, width: w, height: h, land: got.land, landCount, starts: got.starts };
  }
  throw new Error(`generateMap: no valid sheet for seed ${seed} (${w}x${h}, ${colonies} colonies)`);
}
