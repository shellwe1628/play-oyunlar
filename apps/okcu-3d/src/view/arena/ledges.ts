/**
 * Ledges as floating islands, in each world's materials (the 2D game's drawThemeLedge in 3D):
 * a soft cap (grass / snow / sand / moss) with lumps along its rim, a bevelled body with pebbles
 * or strata, and a faceted rock tapering to a point underneath, plus the world's own detail
 * (grass tufts and flowers, icicles, a cactus, a hanging lantern). The player's island carries a
 * banner and an arrow crate; sliding islands wear an iron clamp, swinging ones rope rings.
 *
 * Geometry is exact where it matters: the cap's top face is at `ledge.y`, the body spans
 * `ledge.x … x + w` and `y … y + h`. One merged, vertex-coloured mesh per island.
 */
import * as THREE from 'three';
import type { Theme } from '@okcu/anim/themes';
import type { World } from '@sim/world';
import { m, sx, sy } from '../../coords';
import { INK, LANTERN, easeOutBack, glowTexture, jitter, merge, mixHex, roundedBox, seeded, shadeHex, solid, tintHex } from './util';

export type LedgeKind = 'player' | 'static' | 'slide' | 'swing';

/** island depth, metres, centred on the gameplay plane */
export const LEDGE_DEPTH = 1.5;
const PLAYER_DEPTH = 1.7;
/** swing ropes tie on at ± this z */
export const ROPE_Z = 0.52;

/** the one lit, vertex-coloured material every solid arena object shares */
export const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
const lanternMat = new THREE.MeshBasicMaterial({ color: LANTERN, toneMapped: false });
const lanternGlowMat = new THREE.SpriteMaterial({ map: null, color: LANTERN, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
const pennantMat = new THREE.MeshStandardMaterial({ color: 0x3f8cff, roughness: 0.7, side: THREE.DoubleSide });
let lanternCore: THREE.BufferGeometry | null = null;
let pennantGeo: THREE.BufferGeometry | null = null;

const IRON = 0x57506a;
const WOOD = 0x9a6a3c;
const WOOD_DARK = 0x6e4526;

function underRock(W: number, D: number, U: number, topY: number, th: Theme, rand: () => number): THREE.BufferGeometry {
  const SEG = 12;
  const levels: [number, number][] = [
    [0, 1],
    [0.26, 0.86],
    [0.58, 0.54],
    [0.84, 0.24],
  ];
  const ax = W / 2 - 0.04;
  // only the back half: arrows, rocks and falling bodies in the gameplay plane pass in front of it
  const az = D / 4 - 0.06;
  const zc = -D / 4 - 0.04;
  const lean = (rand() - 0.5) * 0.14 * W + 0.02 * W;
  const pts: number[] = [];
  for (let li = 0; li < levels.length; li++) {
    const [t, s] = levels[li]!;
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      // a superellipse: close to the body's rounded rectangle at the top
      const e = li === 0 ? 0.45 : 0.75;
      const j = li === 0 ? 1 : 0.86 + rand() * 0.28;
      const x = Math.sign(c) * Math.abs(c) ** e * ax * s * j + lean * t;
      const z = zc + Math.sign(sn) * Math.abs(sn) ** e * az * s * j;
      const y = topY - U * t + (li === 0 ? 0 : (rand() - 0.5) * 0.12 * U);
      pts.push(x, y, z);
    }
  }
  const tip = pts.length / 3;
  pts.push(lean, topY - U, zc);
  const idx: number[] = [];
  for (let li = 0; li < levels.length - 1; li++) {
    for (let k = 0; k < SEG; k++) {
      const a = li * SEG + k;
      const b = li * SEG + ((k + 1) % SEG);
      const c = a + SEG;
      const d = b + SEG;
      idx.push(a, b, c, b, d, c);
    }
  }
  const last = (levels.length - 1) * SEG;
  for (let k = 0; k < SEG; k++) idx.push(last + k, last + ((k + 1) % SEG), tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(idx);
  const light = new THREE.Color(tintHex(th.under, 0.08));
  const dark = new THREE.Color(th.underDark);
  const shades: number[] = [];
  return solid(g, (out, _p, n, f) => {
    if (shades[f] === undefined) shades[f] = rand();
    // darker toward the right and the back, as the 2D ledge's shaded facet
    const k = THREE.MathUtils.clamp(0.35 + n.x * 0.45 - n.z * 0.2 + (shades[f] - 0.5) * 0.5, 0, 1);
    // it sits in the island's own shadow: brightened past its albedo to stand in for bounce light
    out.copy(light).lerp(dark, k).multiplyScalar(1.55);
  }, true);
}

function lump(r: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  return solid(new THREE.SphereGeometry(r, 7, 5).scale(1, 1.15, 1).translate(x, y, z), color);
}

function tuft(x: number, z: number, color: number, rand: () => number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 3; b++) {
    const h = 0.12 + rand() * 0.07;
    const g = new THREE.ConeGeometry(0.032, h, 4).translate(0, h / 2, 0).rotateZ((b - 1) * 0.32 + (rand() - 0.5) * 0.2).translate(x + (b - 1) * 0.035, -0.01, z + (rand() - 0.5) * 0.05);
    out.push(solid(g, b === 1 ? color : shadeHex(color, 0.88), true));
  }
  return out;
}

export interface LedgeBuild {
  geometry: THREE.BufferGeometry;
  /** separately lit / animated bits (lantern light, pennant); null when the island has none */
  extras: THREE.Group | null;
  glow: THREE.Sprite | null;
  pennant: THREE.Mesh | null;
}

export function buildLedge(wPx: number, hPx: number, th: Theme, seed: number, kind: LedgeKind): LedgeBuild {
  const rand = seeded(seed * 97 + wPx * 3 + hPx);
  const W = m(wPx);
  const H = m(hPx);
  const D = kind === 'player' ? PLAYER_DEPTH : LEDGE_DEPTH;
  const parts: THREE.BufferGeometry[] = [];
  const capH = th.id === 'snow' ? 0.3 : 0.26;
  const o = 0.065;

  // ---- cap: top face exactly at y = 0 (the collision top)
  const cap = new THREE.Color(th.cap);
  const capLight = new THREE.Color(mixHex(th.cap, th.capLight, 0.75));
  const capSide = new THREE.Color(shadeHex(th.cap, 0.93));
  parts.push(
    solid(roundedBox(W + o * 2, capH, D + o * 2, 0.115, 4).translate(0, -capH / 2, 0), (out, p, n) => {
      const top = THREE.MathUtils.clamp(n.y, 0, 1);
      out.copy(capSide).lerp(cap, 0.5 + 0.5 * Math.sin(p.x * 9 + p.z * 5)).lerp(capLight, top * (0.75 + 0.25 * Math.sin(p.x * 6.3 + p.z * 11)));
    }),
  );
  // lumps along the rim: grass hanging over, snow pillows, sand drifts
  const lumpC = shadeHex(th.cap, 0.96);
  const zf = D / 2 + o - 0.07;
  for (let x = -W / 2 + 0.11; x <= W / 2 - 0.1; x += 0.225) {
    const r = (th.id === 'snow' ? 0.1 : 0.082) + rand() * 0.03;
    parts.push(lump(r, x + (rand() - 0.5) * 0.04, -capH + 0.035, zf, lumpC));
    parts.push(lump(r, x + 0.1, -capH + 0.04, -zf, lumpC));
  }
  for (let z = -D / 2 + 0.2; z <= D / 2 - 0.22; z += 0.25) {
    const r = 0.08 + rand() * 0.03;
    parts.push(lump(r, -W / 2 - o + 0.07, -capH + 0.035, z, lumpC));
    parts.push(lump(r, W / 2 + o - 0.07, -capH + 0.035, z, lumpC));
  }

  // ---- body: spans the collision rectangle
  const body = new THREE.Color(th.body);
  const bodyLow = new THREE.Color(mixHex(th.body, th.bodyDark, 0.55));
  parts.push(
    solid(roundedBox(W, H - 0.1, D, 0.15, 3).translate(0, -(H + 0.1) / 2, 0), (out, p) => {
      const t = THREE.MathUtils.clamp(-p.y / H, 0, 1);
      out.copy(body).lerp(bodyLow, t * 0.8 + 0.12 * Math.sin(p.x * 7 + p.z * 4 + p.y * 9));
    }),
  );
  if (th.id === 'desert') {
    // sandstone strata
    for (let y = -0.36, i = 0; y > -H + 0.14; y -= i === 0 ? 0.2 : 0.24, i++) {
      parts.push(solid(roundedBox(W + 0.05, i % 2 ? 0.06 : 0.08, D + 0.05, 0.028, 1).translate(0, y, 0), th.bodyDark));
    }
  } else {
    // pebbles set in the earth
    const n = kind === 'player' ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const r = 0.05 + rand() * 0.035;
      const x = (rand() - 0.5) * (W - 0.4);
      const y = -0.34 - rand() * Math.max(0.05, H - 0.56);
      parts.push(solid(new THREE.SphereGeometry(r, 7, 5).scale(1, 0.85, 0.55).translate(x, y, D / 2 - 0.005), i % 3 === 0 ? mixHex(th.bodyDark, th.body, 0.3) : th.bodyDark));
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const r = 0.05 + rand() * 0.03;
        parts.push(solid(new THREE.SphereGeometry(r, 7, 5).scale(0.55, 0.85, 1).translate(side * (W / 2 - 0.005), -0.36 - rand() * Math.max(0.05, H - 0.6), (rand() - 0.5) * (D - 0.5)), th.bodyDark));
      }
    }
  }

  // ---- the rock underneath
  const U = m(hPx * 1.1 + wPx * 0.18);
  parts.push(underRock(W, D, U, -H + 0.13, th, rand));
  // a couple of loose stones drifting below
  const stones = kind === 'player' ? 3 : 2;
  for (let i = 0; i < stones; i++) {
    const r = 0.06 + rand() * 0.07;
    const side = i % 2 ? 1 : -1;
    const g = jitter(new THREE.IcosahedronGeometry(r, 0), 0.18, seed + i).translate(side * W * (0.2 + rand() * 0.16), -H - U * (0.55 + rand() * 0.35), -0.25 - rand() * 0.4);
    parts.push(solid(g, i % 2 ? mixHex(th.under, th.underDark, 0.35) : tintHex(th.under, 0.1), true));
  }

  // ---- the world's own detail
  if (th.id === 'meadow' || th.id === 'night') {
    const tc = shadeHex(th.cap, 0.74);
    const nT = kind === 'player' ? 5 : 3;
    for (let i = 0; i < nT; i++) {
      const x = -W / 2 + 0.18 + rand() * (W - 0.36);
      parts.push(...tuft(x, D / 2 - 0.1 - rand() * 0.08, tc, rand));
      parts.push(...tuft(-x * 0.8, -D / 2 + 0.14 + rand() * 0.1, tc, rand));
    }
  }
  if (th.id === 'meadow') {
    const petals = [0xffffff, 0xffe45c, 0xff8fc7];
    const nF = kind === 'player' ? 6 : 3;
    for (let i = 0; i < nF; i++) {
      const x = -W / 2 + 0.16 + rand() * (W - 0.32);
      const z = (i % 2 ? -1 : 1) * (D / 2 - 0.13 - rand() * 0.1);
      parts.push(solid(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 4).translate(x, 0.04, z), 0x3f9a3a));
      parts.push(solid(new THREE.SphereGeometry(0.04, 6, 4).scale(1, 0.6, 1).translate(x, 0.095, z), petals[i % 3]!));
    }
  }
  if (th.id === 'snow') {
    const ice = new THREE.Color(0xffffff);
    const iceTip = new THREE.Color(0xa9d6f5);
    const nI = Math.max(4, Math.round(W / 0.42));
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < nI; i++) {
        const len = m(22 + (i % 2) * 12 + rand() * 8) * (row ? 0.75 : 1);
        const x = -W / 2 + 0.22 + i * ((W - 0.44) / (nI - 1)) + (row ? 0.1 : 0);
        const z = row ? -0.1 - rand() * 0.3 : D / 2 - 0.16;
        const top = -H + 0.06;
        parts.push(
          solid(new THREE.ConeGeometry(0.06, len, 6).rotateX(Math.PI).translate(x, top - len / 2, z), (out, p) => {
            out.copy(ice).lerp(iceTip, THREE.MathUtils.clamp((top - p.y) / len, 0, 1));
          }),
        );
      }
    }
  }
  if (th.id === 'desert' && (seed % 2 === 0 || kind === 'player')) {
    const cx = kind === 'player' ? -W / 2 + 0.4 : W * 0.3;
    const cz = -D / 2 + 0.3;
    const green = 0x5aa85a;
    const paint = (g: THREE.BufferGeometry): THREE.BufferGeometry => solid(g, (out, _p, n) => {
      out.setHex(green).multiplyScalar(0.8 + 0.2 * THREE.MathUtils.clamp(n.y + n.z * 0.5 - n.x * 0.3, -1, 1));
    });
    parts.push(paint(new THREE.CapsuleGeometry(0.07, 0.26, 3, 8).translate(cx, 0.19, cz)));
    parts.push(paint(new THREE.CapsuleGeometry(0.045, 0.1, 3, 6).rotateZ(Math.PI / 2).translate(cx - 0.11, 0.2, cz)));
    parts.push(paint(new THREE.CapsuleGeometry(0.045, 0.1, 3, 6).translate(cx - 0.17, 0.29, cz)));
    parts.push(paint(new THREE.CapsuleGeometry(0.045, 0.08, 3, 6).rotateZ(Math.PI / 2).translate(cx + 0.1, 0.27, cz)));
    parts.push(paint(new THREE.CapsuleGeometry(0.04, 0.08, 3, 6).translate(cx + 0.15, 0.34, cz)));
  }

  // ---- how it moves
  if (kind === 'slide') {
    parts.push(solid(roundedBox(W + 0.07, 0.2, D + 0.07, 0.035, 1).translate(0, -H / 2 - 0.02, 0), (out, _p, n) => {
      out.setHex(n.y > 0.5 ? tintHex(IRON, 0.25) : IRON);
    }));
    for (const side of [-1, 1]) {
      parts.push(solid(roundedBox(0.16, 0.32, 0.32, 0.04, 1).translate(side * (W / 2 + 0.05), -H / 2 - 0.02, 0), shadeHex(IRON, 0.8)));
      for (const zz of [-1, 1]) parts.push(solid(new THREE.SphereGeometry(0.035, 6, 4).translate(side * (W / 2 + 0.04), -H / 2 - 0.02, zz * (D / 2 - 0.2)), tintHex(IRON, 0.35)));
    }
  }
  if (kind === 'swing') {
    for (const side of [-1, 1]) {
      for (const zz of [-1, 1]) {
        parts.push(solid(new THREE.TorusGeometry(0.07, 0.026, 6, 12).rotateY(Math.PI / 2).translate(side * (W / 2 - 0.125), 0.05, zz * ROPE_Z), IRON));
        parts.push(solid(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 8).translate(side * (W / 2 - 0.125), 0.005, zz * ROPE_Z), shadeHex(IRON, 0.8)));
      }
    }
  }

  let extras: THREE.Group | null = null;
  let glow: THREE.Sprite | null = null;
  let pennant: THREE.Mesh | null = null;

  if (th.id === 'night') {
    // a lantern on a chain off the front edge
    const lx = -W * 0.3;
    const lz = D / 2 + 0.07;
    const top = -H + 0.1;
    parts.push(solid(roundedBox(0.09, 0.07, 0.2, 0.02, 1).translate(lx, top, lz - 0.07), IRON));
    parts.push(solid(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 5).translate(lx, top - 0.17, lz), INK));
    parts.push(solid(roundedBox(0.24, 0.05, 0.24, 0.02, 1).translate(lx, top - 0.35, lz), INK));
    parts.push(solid(roundedBox(0.24, 0.05, 0.24, 0.02, 1).translate(lx, top - 0.66, lz), INK));
    for (const ax of [-1, 1]) for (const az of [-1, 1]) parts.push(solid(new THREE.BoxGeometry(0.03, 0.3, 0.03).translate(lx + ax * 0.1, top - 0.505, lz + az * 0.1), INK));
    lanternCore ??= roundedBox(0.17, 0.27, 0.17, 0.04, 2);
    extras = new THREE.Group();
    const core = new THREE.Mesh(lanternCore, lanternMat);
    core.position.set(lx, top - 0.505, lz);
    lanternGlowMat.map ??= glowTexture();
    glow = new THREE.Sprite(lanternGlowMat);
    glow.position.set(lx, top - 0.505, lz + 0.2);
    glow.scale.setScalar(1.25);
    extras.add(core, glow);
  }

  if (kind === 'player') {
    // a banner at the back corner and a crate of spare arrows
    const px = -W / 2 + 0.28;
    const pz = -D / 2 + 0.3;
    parts.push(solid(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 7).translate(px, 0.95, pz), (out, p) => {
      out.setHex(p.y > 1.2 ? WOOD : mixHex(WOOD_DARK, WOOD, p.y / 1.2));
    }));
    parts.push(solid(new THREE.SphereGeometry(0.065, 8, 6).translate(px, 1.93, pz), 0xffc93c));
    parts.push(solid(new THREE.CylinderGeometry(0.07, 0.085, 0.09, 8).translate(px, 0.045, pz), WOOD_DARK));
    const cx = W / 2 - 0.42;
    const cz = -D / 2 + 0.36;
    parts.push(solid(roundedBox(0.44, 0.36, 0.44, 0.03, 1).translate(cx, 0.18, cz), (out, p, n) => {
      const plank = Math.abs(n.y) < 0.5 && Math.floor((p.y / 0.36) * 3) % 2 === 0;
      out.setHex(n.y > 0.5 ? WOOD_DARK : plank ? WOOD : tintHex(WOOD, 0.12));
    }));
    for (let i = 0; i < 4; i++) {
      const ax = cx + (i - 1.5) * 0.08;
      const lean = (i - 1.5) * 0.12;
      parts.push(solid(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5).translate(0, 0.31, 0).rotateZ(-lean).translate(ax, 0.2, cz + (i % 2) * 0.08 - 0.04), 0xf2e3c4));
      parts.push(solid(new THREE.BoxGeometry(0.075, 0.13, 0.012).translate(0, 0.56, 0).rotateZ(-lean).translate(ax, 0.2, cz + (i % 2) * 0.08 - 0.04), i % 2 ? 0x3f8cff : 0xff5a6e));
    }
    if (!pennantGeo) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.2);
      shape.lineTo(0.78, 0.13);
      shape.lineTo(0.56, 0);
      shape.lineTo(0.78, -0.13);
      shape.lineTo(0, -0.2);
      shape.closePath();
      pennantGeo = new THREE.ShapeGeometry(shape);
    }
    extras ??= new THREE.Group();
    pennant = new THREE.Mesh(pennantGeo, pennantMat);
    pennant.position.set(px + 0.03, 1.62, pz);
    pennant.castShadow = true;
    extras.add(pennant);
  }

  return { geometry: merge(parts), extras, glow, pennant };
}

interface Slot {
  group: THREE.Group;
  mesh: THREE.Mesh;
  extras: THREE.Group | null;
  glow: THREE.Sprite | null;
  pennant: THREE.Mesh | null;
  w: number;
  h: number;
  theme: number;
  kind: LedgeKind;
  /** −delay … 1: the pop-in when a ledge appears */
  appear: number;
  /** 1 … 0 while a ledge that left the world shrinks away */
  leave: number;
  live: boolean;
}

export interface LedgesView {
  update(w: World, th: Theme, themeIndex: number, real: number, time: number): void;
}

function kindOf(w: World, i: number): LedgeKind {
  if (i === 0) return 'player';
  for (const mv of w.movers) if (mv.index === i) return mv.kind;
  return 'static';
}

export function createLedges(scene: THREE.Scene): LedgesView {
  const slots: Slot[] = [];
  let lastWave = -1;
  let lastSeed = -1;

  function slot(i: number): Slot {
    let s = slots[i];
    if (!s) {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), solidMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      group.visible = false;
      scene.add(group);
      s = { group, mesh, extras: null, glow: null, pennant: null, w: -1, h: -1, theme: -1, kind: 'static', appear: 1, leave: 0, live: false };
      slots[i] = s;
    }
    return s;
  }

  return {
    update(w, th, themeIndex, real, time) {
      const fresh = w.wave !== lastWave || w.seed !== lastSeed;
      lastWave = w.wave;
      lastSeed = w.seed;
      const n = w.ledges.length;
      for (let i = 0; i < Math.max(n, slots.length); i++) {
        const L = w.ledges[i];
        const s = slot(i);
        if (!L) {
          // left the world: shrink away
          if (s.live) {
            s.live = false;
            s.leave = 1;
          }
          if (s.leave > 0) {
            s.leave = Math.max(0, s.leave - real / 0.22);
            s.group.scale.setScalar(Math.max(0.001, s.leave));
            s.group.visible = s.leave > 0;
          }
          continue;
        }
        const kind = kindOf(w, i);
        const rebuilt = s.w !== L.w || s.h !== L.h || s.theme !== themeIndex || s.kind !== kind;
        if (rebuilt) {
          const b = buildLedge(L.w, L.h, th, i + (i === 0 ? 0 : w.wave), kind);
          s.mesh.geometry.dispose();
          s.mesh.geometry = b.geometry;
          if (s.extras) s.group.remove(s.extras);
          s.extras = b.extras;
          s.glow = b.glow;
          s.pennant = b.pennant;
          if (b.extras) s.group.add(b.extras);
          s.w = L.w;
          s.h = L.h;
          s.theme = themeIndex;
          s.kind = kind;
        }
        if (!s.live || (i > 0 && (fresh || rebuilt))) s.appear = s.live || i > 0 ? -0.05 * i : 1;
        s.live = true;
        s.leave = 0;
        let k = 1;
        if (s.appear < 1) {
          s.appear = Math.min(1, s.appear + real / 0.34);
          k = s.appear <= 0 ? 0 : easeOutBack(s.appear);
        }
        s.group.visible = k > 0;
        s.group.scale.setScalar(Math.max(0.001, 0.55 + 0.45 * k));
        s.group.position.set(sx(L.x + L.w / 2), sy(L.y) - (1 - k) * 0.35, 0);
        if (s.glow) s.glow.scale.setScalar(1.15 + Math.sin(time * 3 + i * 2) * 0.2);
        if (s.pennant) {
          s.pennant.rotation.y = Math.sin(time * 2.1) * 0.35 - 0.15;
          s.pennant.rotation.z = Math.sin(time * 3.3 + 1) * 0.06;
        }
      }
    },
  };
}
