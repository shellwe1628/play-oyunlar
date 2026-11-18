/** Small building blocks shared by the arena parts: colours, seeded noise, geometry baking. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** the 2D game's outline colour (PALETTE.ink) and a few of its other palette entries */
export const INK = 0x2a1838;
export const ROPE = 0xd9b27a;
export const LANTERN = 0xffb84a;
export const PINK = 0xff6fb5;

export function mixHex(a: number, b: number, k: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const r = ar + (((b >> 16) & 0xff) - ar) * k;
  const g = ag + (((b >> 8) & 0xff) - ag) * k;
  const bl = ab + ((b & 0xff) - ab) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export const shadeHex = (c: number, k: number): number => mixHex(0x000000, c, k);
export const tintHex = (c: number, k: number): number => mixHex(c, 0xffffff, k);

/** mulberry32: a tiny seeded generator for decoration (never touches the simulation's rng) */
export function seeded(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ColorFn = (out: THREE.Color, p: THREE.Vector3, n: THREE.Vector3, face: number) => void;

const P = new THREE.Vector3();
const N = new THREE.Vector3();
const C = new THREE.Color();

/**
 * Turn any geometry into a mergeable part: non-indexed, position + normal + colour only.
 * `flat` recomputes face normals (faceted rock); `color` is a hex or a per-vertex function.
 */
export function solid(geo: THREE.BufferGeometry, color: number | ColorFn, flat = false): THREE.BufferGeometry {
  let g = geo;
  if (geo.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  g.deleteAttribute('uv');
  if (flat || !g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const arr = new Float32Array(pos.count * 3);
  if (typeof color === 'number') C.setHex(color);
  for (let i = 0; i < pos.count; i++) {
    if (typeof color !== 'number') {
      P.fromBufferAttribute(pos, i);
      N.fromBufferAttribute(nor, i);
      color(C, P, N, Math.floor(i / 3));
    }
    arr[i * 3] = C.r;
    arr[i * 3 + 1] = C.g;
    arr[i * 3 + 2] = C.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const SUN_DIR = new THREE.Vector3(-0.45, 0.75, 0.5).normalize();

/**
 * A part for the unlit backdrop: shading is baked into vertex colours (lit ↔ shade by the face's
 * angle to a fixed sun), so the whole backdrop draws with one cheap unlit material.
 */
export function baked(geo: THREE.BufferGeometry, lit: number, shade: number, flat = true, extra?: ColorFn): THREE.BufferGeometry {
  const a = new THREE.Color(lit);
  const b = new THREE.Color(shade);
  const g = solid(geo, (out, p, n, f) => {
    const k = THREE.MathUtils.clamp(n.dot(SUN_DIR) * 0.6 + 0.5, 0, 1);
    out.copy(b).lerp(a, k);
    if (extra) extra(out, p, n, f);
  }, flat);
  g.deleteAttribute('normal');
  return g;
}

/** Merge parts made by `solid` / `baked` into one geometry (and free the parts). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts, false);
  if (!out) throw new Error('arena: could not merge geometry parts');
  for (const p of parts) p.dispose();
  return out;
}

export function roundedBox(w: number, h: number, d: number, r: number, seg = 3): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
}

/** Push every vertex of a (still indexed) geometry in or out a little, consistently per position. */
export function jitter(geo: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    P.fromBufferAttribute(pos, i);
    // hash the position so duplicated seam vertices move together
    const h = Math.sin(P.x * 127.1 + P.y * 311.7 + P.z * 74.7 + seed * 13.37) * 43758.5453;
    const k = 1 + (h - Math.floor(h) - 0.5) * 2 * amount;
    pos.setXYZ(i, P.x * k, P.y * k, P.z * k);
  }
  pos.needsUpdate = true;
  return geo;
}

let glowTex: THREE.Texture | null = null;
/** A soft round glow (white, alpha falls off), for sun halos, lanterns, sparks and fireflies. */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let dotTex: THREE.Texture | null = null;
/** A crisp round dot with a soft edge (snow flakes, pollen, stars). */
export function dotTexture(): THREE.Texture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  dotTex = new THREE.CanvasTexture(c);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}

export const easeOutBack = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
};
export const easeInOut = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
