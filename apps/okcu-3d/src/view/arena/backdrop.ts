/**
 * The world behind the action, per theme: a gradient sky, sun or moon, stars, far ranges, near
 * hills with their trees / pines / cacti / lantern strings, a foreground rise, mist between the
 * layers, distant floating islands, drifting clouds and the ambient weather (pollen, snow, sand,
 * fireflies; the 2D game's worlds.ts in depth).
 *
 * Every layer is a group at its own depth, scaled so that it is authored in the gameplay plane's
 * logical px (like the 2D art) yet sits far behind it: the camera's sway, kick, zoom and shake
 * then give real parallax. The backdrop is unlit: shading is baked into vertex colours and the
 * whole of it draws with a handful of cheap materials. A theme change sinks the old world's
 * layers and raises the new one while sky, sun, clouds and lights blend.
 */
import * as THREE from 'three';
import { THEMES, type Theme } from '@okcu/anim/themes';
import { LOGICAL_H, LOGICAL_W, m, sx, sy } from '../../coords';
import { EYE_LIFT, HEMI_NAME, REST_DIST, SUN_NAME } from '../stage';
import { INK, LANTERN, PINK, baked, dotTexture, easeInOut, glowTexture, jitter, merge, mixHex, shadeHex, tintHex } from './util';

const W = LOGICAL_W;
const H = LOGICAL_H;
/** authored margins around the frame, px (parallax, kick, zoom and shake never show an edge) */
const X0 = -260;
const X1 = W + 260;
const BOTTOM = H + 320;
/** how far a world's layers sink when it leaves, plane metres */
const DROP = 19;

const backMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const mistMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });

interface Layer {
  group: THREE.Group;
  s: number;
  baseY: number;
  /** 0 nearest … 1 farthest: far layers move a beat later */
  order: number;
}

function makeLayer(parent: THREE.Object3D, Z: number): Layer {
  const s = (REST_DIST + Z) / REST_DIST;
  const group = new THREE.Group();
  group.scale.setScalar(s);
  const baseY = EYE_LIFT * (1 - s);
  group.position.set(0, baseY, -Z);
  parent.add(group);
  return { group, s, baseY, order: Math.min(1, Z / 300) };
}

// ---------------------------------------------------------------- geometry helpers (plane px in, metres out)

const flatC = (geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry => baked(geo, color, color, false);

/** A filled silhouette from a crest line down to the bottom, with a vertical colour ramp. */
function ridge(yAt: (x: number) => number, top: number, mid: number, bottom: number, band = 130, step = 24): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const cT = new THREE.Color(top);
  const cM = new THREE.Color(mid);
  const cB = new THREE.Color(bottom);
  const quad = (xa: number, ya0: number, ya1: number, xb: number, yb0: number, yb1: number, c0: THREE.Color, c1: THREE.Color): void => {
    pos.push(sx(xa), sy(ya0), 0, sx(xa), sy(ya1), 0, sx(xb), sy(yb0), 0, sx(xb), sy(yb0), 0, sx(xa), sy(ya1), 0, sx(xb), sy(yb1), 0);
    col.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c0.r, c0.g, c0.b, c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b);
  };
  for (let x = X0; x < X1; x += step) {
    const ya = yAt(x);
    const yb = yAt(x + step);
    quad(x, ya, ya + band, x + step, yb, yb + band, cT, cM);
    quad(x, ya + band, BOTTOM, x + step, yb + band, BOTTOM, cM, cB);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** A band of haze: clear at the top and bottom, `alpha` in the middle. */
function mist(yTop: number, yMid: number, yBot: number, color: number, alpha: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const xs = [sx(X0), sx(X1)];
  const ys = [sy(yTop), sy(yMid), sy(yBot)];
  const as = [0, alpha, 0];
  const pos: number[] = [];
  const col: number[] = [];
  for (let r = 0; r < 2; r++) {
    const v = [
      [0, r],
      [0, r + 1],
      [1, r],
      [1, r],
      [0, r + 1],
      [1, r + 1],
    ];
    for (const [xi, yi] of v) {
      pos.push(xs[xi!]!, ys[yi!]!, 0);
      col.push(c.r, c.g, c.b, as[yi!]!);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  return g;
}

function blob(x: number, y: number, r: number, lit: number, shade: number, sqY = 1, z = 0): THREE.BufferGeometry {
  return baked(new THREE.SphereGeometry(m(r), 9, 7).scale(1, sqY, 0.7).translate(sx(x), sy(y), z), lit, shade, false);
}

/** A cone standing on (x, y): pines, peaks. */
function cone(x: number, y: number, r: number, h: number, sides: number, lit: number, shade: number, extra?: (out: THREE.Color, p: THREE.Vector3) => void, seed = 0): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.ConeGeometry(m(r), m(h), sides, extra ? 3 : 1);
  if (seed) g = jitter(g.translate(0, m(h) * 0.5, 0), 0.07, seed).translate(0, -m(h) * 0.5, 0);
  g.rotateY(0.4 + seed).scale(1, 1, 0.6).translate(sx(x), sy(y) + m(h) / 2, 0);
  return baked(g, lit, shade, true, extra ? (out, p) => extra(out, p) : undefined);
}

function box(x: number, y: number, w: number, h: number, d: number, lit: number, shade: number, z = 0): THREE.BufferGeometry {
  return baked(new THREE.BoxGeometry(m(w), m(h), m(d)).translate(sx(x), sy(y), z), lit, shade, true);
}

/** A thin bar between two px points (lantern strings). */
function bar(x0: number, y0: number, x1: number, y1: number, t: number, color: number): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const g = new THREE.BoxGeometry(m(len), m(t), m(t)).rotateZ(Math.atan2(-(y1 - y0), x1 - x0)).translate(sx((x0 + x1) / 2), sy((y0 + y1) / 2), 0);
  return flatC(g, color);
}

/** A small floating island far off, already hazed toward the sky. */
function farIsland(r: number, capLit: number, capShade: number, rockLit: number, rockShade: number, seed: number): THREE.BufferGeometry {
  const R = m(r);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(baked(new THREE.SphereGeometry(R, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.3, 0.7), capLit, capShade, false));
  parts.push(baked(new THREE.CylinderGeometry(R, R * 0.96, R * 0.16, 12).scale(1, 1, 0.7).translate(0, -R * 0.08, 0), capShade, shadeHex(capShade, 0.9), false));
  const rock = jitter(new THREE.ConeGeometry(R * 0.94, R * 1.5, 8, 2).rotateX(Math.PI), 0.1, seed).scale(1, 1, 0.7).translate(0, -R * 0.9, 0);
  parts.push(baked(rock, rockLit, rockShade, true));
  return merge(parts);
}

// ---------------------------------------------------------------- the four worlds

interface Bob {
  obj: THREE.Object3D;
  y: number;
  amp: number;
  speed: number;
  phase: number;
}

interface WorldSet {
  root: THREE.Group;
  layers: Layer[];
  bobs: Bob[];
  /** glow sprites that pulse (lanterns) */
  glows: THREE.Sprite[];
  /** 0 hidden … 1 fully risen */
  presence: number;
  animate: ((time: number) => void) | null;
}

function addMesh(layer: Layer, geo: THREE.BufferGeometry, mat: THREE.Material = backMat): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = true;
  layer.group.add(mesh);
  return mesh;
}

function addIslands(set: WorldSet, th: Theme, defs: [number, number, number, number][], capHex: number): void {
  defs.forEach(([x, y, r, Z], i) => {
    const haze = 0.3 + Math.min(0.35, Z / 700);
    const hz = (c: number): number => mixHex(c, th.skyBottom, haze);
    const layer = makeLayer(set.root, Z);
    set.layers.push(layer);
    const mesh = addMesh(layer, farIsland(r, hz(tintHex(capHex, 0.15)), hz(shadeHex(capHex, 0.85)), hz(th.under), hz(th.underDark), i + 3));
    mesh.position.set(sx(x), sy(y), 0);
    set.bobs.push({ obj: mesh, y: sy(y), amp: m(5 + i * 2), speed: 0.35 + i * 0.09, phase: i * 2.1 });
  });
}

function buildMeadow(set: WorldSet, th: Theme): void {
  const sky = th.skyBottom;
  const far2 = makeLayer(set.root, 290);
  addMesh(far2, ridge((x) => H * 0.565 - Math.abs(Math.sin(x * 0.0045 + 0.8)) * 90 - Math.sin(x * 0.013) * 14, mixHex(th.far, sky, 0.55), mixHex(th.far, sky, 0.7), mixHex(th.far, sky, 0.8), 160));
  const far = makeLayer(set.root, 190);
  addMesh(far, ridge((x) => H * 0.6 - Math.abs(Math.sin(x * 0.006)) * 70 - Math.sin(x * 0.021) * 10, tintHex(th.far, 0.12), th.far, th.farShade, 110));
  addMesh(makeLayer(set.root, 150), mist(H * 0.56, H * 0.66, H * 0.8, sky, 0.5), mistMat);

  const near = makeLayer(set.root, 80);
  const yNear = (x: number): number => H * 0.74 - Math.abs(Math.sin(x * 0.009 + 1)) * 52 - Math.sin(x * 0.021) * 10;
  const parts: THREE.BufferGeometry[] = [ridge(yNear, tintHex(th.near, 0.16), th.near, mixHex(th.nearShade, 0x3f8f76, 0.5), 90)];
  const crownLit = mixHex(th.nearShade, th.near, 0.55);
  const crownShade = shadeHex(th.nearShade, 0.86);
  for (let i = -2; i < 9; i++) {
    const x = 40 + i * 128 + (((i % 2) + 2) % 2) * 30;
    const y = yNear(x) + 10;
    const k = 1 + (((i * 7) % 5) + 5) % 5 * 0.09;
    parts.push(box(x, y - 8, 7 * k, 30 * k, 7, shadeHex(th.nearShade, 0.8), shadeHex(th.nearShade, 0.62)));
    parts.push(blob(x, y - 30 * k, 22 * k, crownLit, crownShade, 1.05));
    parts.push(blob(x - 13 * k, y - 20 * k, 14 * k, crownLit, crownShade));
    parts.push(blob(x + 14 * k, y - 22 * k, 13 * k, crownLit, crownShade));
  }
  addMesh(near, merge(parts));
  set.layers.push(far2, far, near);
  addMesh(makeLayer(set.root, 52), mist(H * 0.72, H * 0.82, H * 0.95, sky, 0.38), mistMat);

  const fore = makeLayer(set.root, 30);
  const yFore = (x: number): number => H * 0.9 - Math.abs(Math.sin(x * 0.0062 + 2.2)) * 46 - Math.sin(x * 0.017) * 9;
  const foreTop = mixHex(th.nearShade, 0x4f9a7c, 0.5);
  const fp: THREE.BufferGeometry[] = [ridge(yFore, tintHex(foreTop, 0.1), foreTop, shadeHex(foreTop, 0.72), 80)];
  const bushLit = mixHex(foreTop, th.near, 0.35);
  const bushShade = shadeHex(foreTop, 0.8);
  for (let i = 0; i < 7; i++) {
    const x = -90 + i * 150 + ((i * 53) % 40);
    const y = yFore(x) + 6;
    fp.push(blob(x, y - 9, 20, bushLit, bushShade, 0.8));
    fp.push(blob(x + 20, y - 5, 14, bushLit, bushShade, 0.8));
    fp.push(blob(x - 18, y - 4, 12, bushLit, bushShade, 0.8));
  }
  addMesh(fore, merge(fp));
  set.layers.push(fore);

  addIslands(set, th, [
    [110, 330, 44, 130],
    [262, 590, 26, 165],
    [640, 205, 32, 150],
  ], th.cap);

  // two far balloons drifting across and a flock of birds now and then
  const balloons: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const layer = makeLayer(set.root, 110 + i * 45);
    set.layers.push(layer);
    const a = new THREE.Color(mixHex(i === 0 ? PINK : 0xffd23f, sky, 0.35));
    const b = new THREE.Color(mixHex(0xfff3d6, sky, 0.3));
    const env = baked(new THREE.SphereGeometry(m(17), 12, 9).scale(1, 1.12, 1), 0xffffff, 0xc9c9d6, false, (out, p) => {
      const stripe = Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 8) % 2;
      out.multiply(stripe ? a : b);
    });
    const neck = baked(new THREE.ConeGeometry(m(13), m(16), 10).rotateX(Math.PI).translate(0, -m(20), 0), mixHex(i === 0 ? PINK : 0xffd23f, sky, 0.45), mixHex(shadeHex(PINK, 0.7), sky, 0.4), false);
    const basket = baked(new THREE.BoxGeometry(m(9), m(7), m(9)).translate(0, -m(33), 0), mixHex(0x9a6a3c, sky, 0.3), mixHex(0x6e4526, sky, 0.3), true);
    balloons.push(addMesh(layer, merge([env, neck, basket])));
  }
  const birdLayer = makeLayer(set.root, 100);
  set.layers.push(birdLayer);
  const birdGeo = new THREE.BufferGeometry();
  const birdPos = new Float32Array(4 * 2 * 9);
  birdGeo.setAttribute('position', new THREE.BufferAttribute(birdPos, 3));
  const birds = new THREE.Mesh(birdGeo, new THREE.MeshBasicMaterial({ color: mixHex(th.nearShade, INK, 0.35), side: THREE.DoubleSide, toneMapped: false }));
  birds.frustumCulled = false;
  birdLayer.group.add(birds);

  set.animate = (t) => {
    for (let i = 0; i < 2; i++) {
      const x = ((t * (6 + i * 3) + i * 380 + 200) % (W + 240)) - 120;
      const y = 170 + i * 120 + Math.sin(t * 0.6 + i * 2) * 14;
      balloons[i]!.position.set(sx(x), sy(y), 0);
    }
    const k = (t % 26) / 26;
    birds.visible = k < 0.55;
    if (k < 0.55) {
      const bx = -90 + (k / 0.55) * (W + 220);
      for (let i = 0; i < 4; i++) {
        const x = bx - i * 26;
        const y = 250 + i * 9 + Math.sin(t * 2 + i) * 6;
        const f = Math.sin(t * 12 + i * 1.7) * 7;
        for (let s = 0; s < 2; s++) {
          const o = (i * 2 + s) * 9;
          const dir = s ? 1 : -1;
          birdPos[o] = sx(x);
          birdPos[o + 1] = sy(y);
          birdPos[o + 3] = sx(x + dir * 11);
          birdPos[o + 4] = sy(y - f);
          birdPos[o + 6] = sx(x + dir * 3);
          birdPos[o + 7] = sy(y + 4);
        }
      }
      birdGeo.getAttribute('position').needsUpdate = true;
    }
  };
}

function buildSnow(set: WorldSet, th: Theme): void {
  const sky = th.skyBottom;
  const far2 = makeLayer(set.root, 300);
  const pale = mixHex(th.far, sky, 0.6);
  const p2: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const x = -200 + i * 165 + ((i * 37) % 50);
    const h = 300 + ((i * 71) % 150);
    p2.push(cone(x, H * 0.6, 200, h, 5, tintHex(pale, 0.25), pale, undefined, i + 11));
  }
  p2.push(ridge(() => H * 0.6 - 4, pale, pale, mixHex(pale, sky, 0.5), 200, 300));
  addMesh(far2, merge(p2));

  const far = makeLayer(set.root, 185);
  const parts: THREE.BufferGeometry[] = [];
  const peaks = [-150, 0, 120, 230, 360, 470, 600, 720, 870];
  const white = new THREE.Color(0xffffff);
  const whiteShade = new THREE.Color(0xd4e3f7);
  const shadeC = new THREE.Color(th.farShade);
  const col = new THREE.Color();
  peaks.forEach((px, i) => {
    const h = 240 + ((i * 53) % 120);
    const base = H * 0.62;
    const topY = sy(base - h);
    parts.push(
      cone(px, base, 172, h, 6, tintHex(th.far, 0.08), th.farShade, (out, p) => {
        // a jagged snow line: white above it, keeping the baked light and shade
        const down = (topY - p.y) / m(h);
        const line = 0.3 + 0.06 * Math.sin(p.x * 3.1 + i);
        if (down < line) {
          const lum = (out.r + out.g + out.b) / 3;
          const litK = THREE.MathUtils.clamp((lum - (shadeC.r + shadeC.g + shadeC.b) / 3) * 6, 0, 1);
          out.copy(col.copy(whiteShade).lerp(white, litK));
        }
      }, i + 1),
    );
  });
  parts.push(ridge(() => H * 0.62 - 3, th.far, mixHex(th.far, th.farShade, 0.5), mixHex(th.farShade, sky, 0.3), 150, 300));
  addMesh(far, merge(parts));
  addMesh(makeLayer(set.root, 140), mist(H * 0.55, H * 0.66, H * 0.8, sky, 0.6), mistMat);

  const near = makeLayer(set.root, 80);
  const yNear = (x: number): number => H * 0.74 - Math.abs(Math.sin(x * 0.009 + 1)) * 52 - Math.sin(x * 0.021) * 10;
  const np: THREE.BufferGeometry[] = [ridge(yNear, 0xf4faff, mixHex(th.near, 0xdcecff, 0.35), th.nearShade, 46)];
  const pineLit = mixHex(th.nearShade, th.near, 0.45);
  const pineShade = shadeHex(th.nearShade, 0.82);
  for (let i = -3; i < 12; i++) {
    const x = 20 + i * 86;
    const y = yNear(x) + 14;
    const k = 1 + ((((i * 5) % 4) + 4) % 4) * 0.12;
    np.push(cone(x, y, 19 * k, 50 * k, 7, pineLit, pineShade));
    np.push(cone(x, y - 24 * k, 15 * k, 42 * k, 7, pineLit, pineShade));
    np.push(cone(x, y - 48 * k, 9.5 * k, 26 * k, 7, 0xffffff, 0xd4e3f7));
    np.push(box(x, y + 2, 5 * k, 10, 5, pineShade, shadeHex(pineShade, 0.8)));
  }
  addMesh(near, merge(np));
  set.layers.push(far2, far, near);
  addMesh(makeLayer(set.root, 52), mist(H * 0.72, H * 0.82, H * 0.95, sky, 0.45), mistMat);

  const fore = makeLayer(set.root, 30);
  const yFore = (x: number): number => H * 0.905 - Math.abs(Math.sin(x * 0.0058 + 0.4)) * 44 - Math.sin(x * 0.019) * 8;
  const fp: THREE.BufferGeometry[] = [ridge(yFore, 0xffffff, mixHex(0xdcecff, th.near, 0.3), mixHex(th.near, th.nearShade, 0.6), 60)];
  const fLit = mixHex(th.nearShade, th.near, 0.25);
  const fShade = shadeHex(th.nearShade, 0.7);
  for (let i = 0; i < 6; i++) {
    const x = -120 + i * 190 + ((i * 61) % 60);
    const y = yFore(x) + 16;
    const k = 1.5 + (i % 3) * 0.22;
    fp.push(cone(x, y, 19 * k, 50 * k, 7, fLit, fShade));
    fp.push(cone(x, y - 24 * k, 15 * k, 42 * k, 7, fLit, fShade));
    fp.push(cone(x, y - 48 * k, 9.5 * k, 26 * k, 7, 0xffffff, 0xd4e3f7));
  }
  addMesh(fore, merge(fp));
  set.layers.push(fore);

  addIslands(set, th, [
    [120, 300, 40, 130],
    [250, 600, 26, 165],
    [655, 190, 30, 150],
  ], 0xf4fbff);
}

function buildDesert(set: WorldSet, th: Theme): void {
  const sky = th.skyBottom;
  const far2 = makeLayer(set.root, 310);
  const pale = mixHex(th.far, sky, 0.5);
  addMesh(far2, ridge((x) => H * 0.615 - Math.max(0, Math.sin(x * 0.011 + 2)) * 46 - Math.max(0, Math.sin(x * 0.0043)) * 60, tintHex(pale, 0.1), pale, mixHex(pale, sky, 0.4), 140));

  const far = makeLayer(set.root, 200);
  const parts: THREE.BufferGeometry[] = [];
  const mesas: [number, number, number][] = [
    [-250, 200, 230],
    [-20, 190, 250],
    [200, 140, 300],
    [420, 230, 220],
    [610, 170, 280],
    [830, 190, 240],
  ];
  const base = H * 0.64;
  const band = new THREE.Color(th.farShade);
  mesas.forEach(([x, w, h], i) => {
    const g = jitter(new THREE.CylinderGeometry(m(w / 2 - 24), m(w / 2), m(h), 9, 6), 0.035, i + 2).rotateY(i).scale(1, 1, 0.5).translate(sx(x + w / 2), sy(base) + m(h) / 2, 0);
    const y0 = sy(base);
    parts.push(
      baked(g, tintHex(th.far, 0.1), mixHex(th.farShade, 0x5a2d4a, 0.25), true, (out, p) => {
        // strata bands, as the 2D mesas
        const t = (p.y - y0) / m(h);
        if ((t > 0.5 && t < 0.56) || (t > 0.27 && t < 0.31) || (t > 0.78 && t < 0.81)) out.lerp(band, 0.7);
      }),
    );
  });
  parts.push(ridge(() => base - 3, th.far, mixHex(th.far, th.farShade, 0.4), th.farShade, 150, 300));
  addMesh(far, merge(parts));
  addMesh(makeLayer(set.root, 150), mist(H * 0.56, H * 0.67, H * 0.8, mixHex(sky, 0xffd0a0, 0.4), 0.5), mistMat);

  const near = makeLayer(set.root, 80);
  const yNear = (x: number): number => H * 0.74 - Math.abs(Math.sin(x * 0.005 + 1)) * 34 - Math.sin(x * 0.021) * 10;
  const np: THREE.BufferGeometry[] = [ridge(yNear, tintHex(th.near, 0.3), th.near, th.nearShade, 70)];
  const cactLit = mixHex(th.nearShade, 0x7a8a4a, 0.45);
  const cactShade = mixHex(shadeHex(th.nearShade, 0.72), 0x4a5a3a, 0.4);
  const cactus = (x: number, y: number, k: number, lit: number, shade: number): void => {
    const cap = (cx: number, cy: number, r: number, len: number, horiz = false): THREE.BufferGeometry => {
      const g = new THREE.CapsuleGeometry(m(r * k), m(len * k), 3, 8);
      if (horiz) g.rotateZ(Math.PI / 2);
      return baked(g.translate(sx(x + cx * k), sy(y + cy * k), 0), lit, shade, false);
    };
    np.push(cap(0, -28, 7, 42));
    np.push(cap(-13, -22, 4.5, 10, true), cap(-21, -30, 5, 14));
    np.push(cap(12, -30, 4.5, 8, true), cap(21, -38, 5, 15));
  };
  for (let i = -1; i < 6; i++) {
    const x = 70 + i * 190;
    cactus(x, yNear(x) + 12, 1 + (((i % 3) + 3) % 3) * 0.14, cactLit, cactShade);
  }
  addMesh(near, merge(np));
  set.layers.push(far2, far, near);
  addMesh(makeLayer(set.root, 52), mist(H * 0.73, H * 0.83, H * 0.96, mixHex(sky, th.near, 0.3), 0.4), mistMat);

  const fore = makeLayer(set.root, 30);
  const yFore = (x: number): number => H * 0.905 - Math.abs(Math.sin(x * 0.0046 + 2.6)) * 40 - Math.sin(x * 0.015) * 8;
  const foreC = mixHex(th.nearShade, th.farShade, 0.45);
  const fp: THREE.BufferGeometry[] = [ridge(yFore, tintHex(th.nearShade, 0.25), foreC, shadeHex(foreC, 0.66), 70)];
  for (let i = 0; i < 6; i++) {
    const x = -100 + i * 170 + ((i * 47) % 50);
    const y = yFore(x) + 8;
    const g = jitter(new THREE.IcosahedronGeometry(m(16 + (i % 3) * 7), 0), 0.2, i + 4).scale(1.3, 0.8, 0.8).translate(sx(x), sy(y), 0);
    fp.push(baked(g, tintHex(foreC, 0.12), shadeHex(foreC, 0.7), true));
  }
  addMesh(fore, merge(fp));
  set.layers.push(fore);

  addIslands(set, th, [
    [105, 310, 42, 130],
    [255, 585, 26, 165],
    [650, 215, 30, 150],
  ], th.cap);
}

function buildNight(set: WorldSet, th: Theme): void {
  const sky = th.skyBottom;
  const far2 = makeLayer(set.root, 290);
  addMesh(far2, ridge((x) => H * 0.565 - Math.abs(Math.sin(x * 0.0045 + 0.8)) * 90 - Math.sin(x * 0.013) * 14, mixHex(th.far, sky, 0.6), mixHex(th.far, sky, 0.5), mixHex(th.far, sky, 0.3), 170));
  const far = makeLayer(set.root, 190);
  addMesh(far, ridge((x) => H * 0.6 - Math.abs(Math.sin(x * 0.006)) * 70 - Math.sin(x * 0.021) * 10, tintHex(th.far, 0.12), th.far, th.farShade, 100));
  addMesh(makeLayer(set.root, 150), mist(H * 0.55, H * 0.66, H * 0.8, mixHex(sky, 0x7c86d8, 0.4), 0.34), mistMat);

  const near = makeLayer(set.root, 80);
  const yNear = (x: number): number => H * 0.74 - Math.abs(Math.sin(x * 0.009 + 1)) * 52 - Math.sin(x * 0.021) * 10;
  const np: THREE.BufferGeometry[] = [ridge(yNear, tintHex(th.near, 0.14), th.near, th.nearShade, 80)];
  const LY = 868;
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: LANTERN, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const lamps: THREE.BufferGeometry[] = [];
  for (let i = -2; i < 6; i++) {
    const x0 = 60 + i * 200;
    np.push(box(x0, yNear(x0) - 31, 6, 78, 6, tintHex(th.nearShade, 0.12), th.nearShade));
    let px = x0;
    let py = LY;
    for (let k = 1; k <= 8; k++) {
      const u = k / 8;
      const x = x0 + 200 * u;
      const y = LY + Math.sin(u * Math.PI) * 34;
      np.push(bar(px, py, x, y, 2.4, INK));
      px = x;
      py = y;
      if (k % 2 === 0 && k < 8) {
        np.push(flatC(new THREE.BoxGeometry(m(16), m(19), m(12)).translate(sx(x), sy(y + 9.5), 0), INK));
        lamps.push(flatC(new THREE.BoxGeometry(m(12), m(14), m(13)).translate(sx(x), sy(y + 9.5), 0), k % 4 === 0 ? LANTERN : PINK));
        const s = new THREE.Sprite(glowMat);
        s.position.set(sx(x), sy(y + 10), 0.05);
        s.scale.setScalar(m(52));
        near.group.add(s);
        set.glows.push(s);
      }
    }
  }
  addMesh(near, merge(np));
  addMesh(near, merge(lamps), lampMat);
  set.layers.push(far2, far, near);
  addMesh(makeLayer(set.root, 52), mist(H * 0.73, H * 0.83, H * 0.96, mixHex(sky, th.near, 0.5), 0.36), mistMat);

  const fore = makeLayer(set.root, 30);
  const yFore = (x: number): number => H * 0.9 - Math.abs(Math.sin(x * 0.0062 + 2.2)) * 46 - Math.sin(x * 0.017) * 9;
  const foreC = mixHex(th.nearShade, 0x0c0f2a, 0.35);
  const fp: THREE.BufferGeometry[] = [ridge(yFore, tintHex(foreC, 0.12), foreC, shadeHex(foreC, 0.6), 80)];
  const windows: THREE.BufferGeometry[] = [];
  const tLit = tintHex(foreC, 0.03);
  const tShade = shadeHex(foreC, 0.7);
  for (let i = 0; i < 7; i++) {
    const x = -110 + i * 160 + ((i * 59) % 50);
    const y = yFore(x) + 8;
    if (i === 2 || i === 5) {
      // a cottage with lit windows
      fp.push(box(x, y - 16, 46, 34, 30, tLit, tShade));
      fp.push(baked(new THREE.ConeGeometry(m(36), m(24), 4).rotateY(Math.PI / 4).scale(1, 1, 0.7).translate(sx(x), sy(y - 45), 0), tintHex(foreC, 0.18), tShade, true));
      for (const dx of [-11, 11]) windows.push(flatC(new THREE.BoxGeometry(m(9), m(11), m(2)).translate(sx(x + dx), sy(y - 18), m(15.5)), LANTERN));
    } else {
      const k = 1.2 + (i % 3) * 0.2;
      fp.push(box(x, y - 8, 7 * k, 30 * k, 7, tShade, shadeHex(tShade, 0.8)));
      fp.push(blob(x, y - 34 * k, 24 * k, tLit, tShade, 1.1));
      fp.push(blob(x - 14 * k, y - 22 * k, 15 * k, tLit, tShade));
      fp.push(blob(x + 15 * k, y - 24 * k, 14 * k, tLit, tShade));
    }
  }
  addMesh(fore, merge(fp));
  addMesh(fore, merge(windows), lampMat);
  set.layers.push(fore);

  addIslands(set, th, [
    [110, 330, 44, 130],
    [262, 590, 26, 165],
    [640, 230, 32, 150],
  ], th.cap);

  set.animate = (t) => {
    for (let i = 0; i < set.glows.length; i++) set.glows[i]!.scale.setScalar(m(46 + Math.sin(t * 3 + i * 1.9) * 12));
  };
}

const BUILDERS = [buildMeadow, buildSnow, buildDesert, buildNight] as const;

// ---------------------------------------------------------------- lighting per world

interface LightPreset {
  sun: number;
  sunI: number;
  sky: number;
  ground: number;
  hemiI: number;
}
const LIGHTS: readonly LightPreset[] = [
  { sun: 0xfff1d6, sunI: 2.7, sky: 0xd8eeff, ground: 0xa9a890, hemiI: 1.35 },
  { sun: 0xffffff, sunI: 2.45, sky: 0xe6f2ff, ground: 0xb4c4de, hemiI: 1.45 },
  { sun: 0xffc892, sunI: 2.8, sky: 0xffbfa0, ground: 0xa8686a, hemiI: 1.15 },
  { sun: 0xe4e9ff, sunI: 2.2, sky: 0xcdd2f0, ground: 0x8a88aa, hemiI: 1.5 },
];

// ---------------------------------------------------------------- the backdrop

export interface Backdrop {
  /** `wind` is the stage's wind in px/s² (drifts clouds, snow and sand) */
  update(themeIndex: number, real: number, wind: number): void;
}

const N_AMBIENT = 56;
const N_SAND = 30;
const N_CLOUDS = 6;

export function createBackdrop(scene: THREE.Scene): Backdrop {
  const root = new THREE.Group();
  root.name = 'okcu-backdrop';
  scene.add(root);

  // ---- blended state (what a theme change eases)
  const cur = {
    skyTop: new THREE.Color(),
    skyBottom: new THREE.Color(),
    sun: new THREE.Color(),
    cloud: new THREE.Color(),
    cloudAlpha: 0,
    sunX: 0,
    sunY: 0,
    sunR: 0,
    moon: 0,
    stars: 0,
    lSun: new THREE.Color(),
    lSunI: 0,
    lSky: new THREE.Color(),
    lGround: new THREE.Color(),
    lHemiI: 0,
  };
  const from = { ...cur, skyTop: new THREE.Color(), skyBottom: new THREE.Color(), sun: new THREE.Color(), cloud: new THREE.Color(), lSun: new THREE.Color(), lSky: new THREE.Color(), lGround: new THREE.Color() };
  const tmp = new THREE.Color();
  let themeNow = -1;
  let blend = 1;
  let clock = 0;

  const sunPos = (th: Theme): [number, number, number] => (th.id === 'desert' ? [W * 0.5, H * 0.5, 110] : [W * 0.74, H * 0.17, 56]);

  function blendTo(i: number, k: number): void {
    const th = THEMES[i]!;
    const lp = LIGHTS[i]!;
    const [x, y, r] = sunPos(th);
    cur.skyTop.copy(from.skyTop).lerp(tmp.setHex(th.skyTop), k);
    cur.skyBottom.copy(from.skyBottom).lerp(tmp.setHex(th.skyBottom), k);
    cur.sun.copy(from.sun).lerp(tmp.setHex(th.sun), k);
    cur.cloud.copy(from.cloud).lerp(tmp.setHex(th.cloud), k);
    cur.cloudAlpha = from.cloudAlpha + (th.cloudAlpha - from.cloudAlpha) * k;
    cur.sunX = from.sunX + (x - from.sunX) * k;
    cur.sunY = from.sunY + (y - from.sunY) * k;
    cur.sunR = from.sunR + (r - from.sunR) * k;
    cur.moon = from.moon + ((th.moon ? 1 : 0) - from.moon) * k;
    cur.stars = from.stars + ((th.stars ? 1 : 0) - from.stars) * k;
    cur.lSun.copy(from.lSun).lerp(tmp.setHex(lp.sun), k);
    cur.lSunI = from.lSunI + (lp.sunI - from.lSunI) * k;
    cur.lSky.copy(from.lSky).lerp(tmp.setHex(lp.sky), k);
    cur.lGround.copy(from.lGround).lerp(tmp.setHex(lp.ground), k);
    cur.lHemiI = from.lHemiI + (lp.hemiI - from.lHemiI) * k;
  }
  function snapshot(): void {
    from.skyTop.copy(cur.skyTop);
    from.skyBottom.copy(cur.skyBottom);
    from.sun.copy(cur.sun);
    from.cloud.copy(cur.cloud);
    from.cloudAlpha = cur.cloudAlpha;
    from.sunX = cur.sunX;
    from.sunY = cur.sunY;
    from.sunR = cur.sunR;
    from.moon = cur.moon;
    from.stars = cur.stars;
    from.lSun.copy(cur.lSun);
    from.lSunI = cur.lSunI;
    from.lSky.copy(cur.lSky);
    from.lGround.copy(cur.lGround);
    from.lHemiI = cur.lHemiI;
  }

  // ---- sky: four rows of vertices, recoloured while themes blend
  const skyLayer = makeLayer(root, 430);
  const skyGeo = new THREE.BufferGeometry();
  const skyYs = [-320, 0, H * 0.55, H, BOTTOM];
  const skyPos: number[] = [];
  const skyIdx: number[] = [];
  skyYs.forEach((y, r) => {
    skyPos.push(sx(X0 - 60), sy(y), 0, sx(X1 + 60), sy(y), 0);
    if (r > 0) skyIdx.push((r - 1) * 2, r * 2, (r - 1) * 2 + 1, (r - 1) * 2 + 1, r * 2, r * 2 + 1);
  });
  skyGeo.setAttribute('position', new THREE.Float32BufferAttribute(skyPos, 3));
  const skyCol = new THREE.BufferAttribute(new Float32Array(skyYs.length * 6), 3);
  skyGeo.setAttribute('color', skyCol);
  skyGeo.setIndex(skyIdx);
  const skyMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, depthWrite: false }));
  skyMesh.renderOrder = -10;
  skyMesh.frustumCulled = false;
  skyLayer.group.add(skyMesh);
  /** the sky's colour at a logical y (clouds are opaque and tinted toward it instead of blended) */
  const skyAt = (y: number, out: THREE.Color): THREE.Color => out.copy(cur.skyTop).lerp(cur.skyBottom, THREE.MathUtils.clamp(y / H, 0, 1));

  // ---- stars
  const starLayer = makeLayer(root, 410);
  const starMats: THREE.PointsMaterial[] = [];
  for (let g = 0; g < 3; g++) {
    const pts: number[] = [];
    for (let i = g; i < 150; i += 3) {
      const x = X0 + ((i * 157 + (i % 7) * 31) % (X1 - X0));
      const y = ((i * 97) % (H * 0.62)) - 40;
      pts.push(sx(x), sy(y), 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.PointsMaterial({ map: dotTexture(), color: 0xffffff, size: (m(3.2 + g * 1.5) * starLayer.s * REST_DIST) / 8, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
    starMats.push(mat);
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    starLayer.group.add(p);
  }

  // ---- sun and moon
  const sunLayer = makeLayer(root, 400);
  const sunGroup = new THREE.Group();
  sunLayer.group.add(sunGroup);
  const disc = new THREE.CircleGeometry(1, 48);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
  const sunDisc = new THREE.Mesh(disc, sunMat);
  sunDisc.renderOrder = -8;
  const haloMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, toneMapped: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), haloMat);
  halo.renderOrder = -9;
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 128;
  const mg = moonCanvas.getContext('2d')!;
  mg.fillStyle = '#fff';
  mg.beginPath();
  mg.arc(64, 64, 60, 0, Math.PI * 2);
  mg.fill();
  mg.globalCompositeOperation = 'destination-out';
  mg.beginPath();
  mg.arc(64 + 60 * 0.45, 64 - 60 * 0.25, 60 * 0.82, 0, Math.PI * 2);
  mg.fill();
  const moonTex = new THREE.CanvasTexture(moonCanvas);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(2 * (64 / 60), 2 * (64 / 60)), moonMat);
  moon.renderOrder = -8;
  sunGroup.add(halo, sunDisc, moon);

  // ---- clouds: three puffy shapes, opaque, tinted toward the sky behind them
  const cloudGeos: THREE.BufferGeometry[] = [];
  const puffs: [number, number, number][][] = [
    [[-58, 6, 30], [-22, -10, 40], [20, -4, 36], [56, 8, 26], [0, 12, 34]],
    [[-70, 8, 26], [-36, -6, 36], [4, -14, 44], [44, -2, 34], [76, 10, 24], [10, 12, 36], [-28, 14, 30]],
    [[-34, 4, 28], [0, -8, 36], [36, 6, 26]],
  ];
  for (const set of puffs) {
    cloudGeos.push(merge(set.map(([x, y, r]) => baked(new THREE.SphereGeometry(m(r), 12, 8).scale(1, 0.72, 0.8).translate(m(x), -m(y), 0), 0xffffff, 0xb9c6de, false, (out, p) => {
      // a flat-ish, slightly darker belly
      if (p.y < -m(y) - m(r) * 0.25) out.multiplyScalar(0.93);
    }))));
  }
  interface Cloud {
    layer: Layer;
    mesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
    x: number;
    y: number;
    v: number;
  }
  const clouds: Cloud[] = [];
  for (let i = 0; i < N_CLOUDS; i++) {
    const layer = makeLayer(root, 96 + ((i * 3) % N_CLOUDS) * 16);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const mesh = new THREE.Mesh(cloudGeos[i % 3], mat);
    mesh.scale.setScalar(0.75 + ((i * 5) % 4) * 0.2);
    layer.group.add(mesh);
    clouds.push({ layer, mesh, mat, x: ((i * 263) % (W + 320)) - 160, y: 110 + i * 118 + ((i * 37) % 50), v: 8 + ((i * 7) % 5) * 4 });
  }

  // ---- ambient weather
  const ax = new Float32Array(N_AMBIENT);
  const ay = new Float32Array(N_AMBIENT);
  const av = new Float32Array(N_AMBIENT);
  const ap = new Float32Array(N_AMBIENT);
  const az = new Float32Array(N_AMBIENT);
  for (let i = 0; i < N_AMBIENT; i++) {
    ax[i] = Math.random() * W;
    ay[i] = Math.random() * H;
    av[i] = 0.5 + Math.random();
    ap[i] = Math.random() * 6.28;
    az[i] = 1.6 + Math.random() * 7;
  }
  const ambGeo = new THREE.BufferGeometry();
  const ambPos = new THREE.BufferAttribute(new Float32Array(N_AMBIENT * 3), 3);
  const ambCol = new THREE.BufferAttribute(new Float32Array(N_AMBIENT * 3), 3);
  ambGeo.setAttribute('position', ambPos);
  ambGeo.setAttribute('color', ambCol);
  const ptSize = (px: number): number => (m(px) * REST_DIST) / 8;
  const ambMat = new THREE.PointsMaterial({ map: dotTexture(), size: ptSize(6), sizeAttenuation: true, transparent: true, depthWrite: false, vertexColors: true, toneMapped: false });
  const ambient = new THREE.Points(ambGeo, ambMat);
  ambient.frustumCulled = false;
  ambient.renderOrder = 2;
  root.add(ambient);
  const sandMat = new THREE.MeshBasicMaterial({ color: 0xffe2a6, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
  const sand = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), sandMat, N_SAND);
  sand.frustumCulled = false;
  sand.visible = false;
  root.add(sand);
  const mat4 = new THREE.Matrix4();
  let ambientKind: Theme['ambient'] | null = null;

  function setAmbient(th: Theme): void {
    ambientKind = th.ambient;
    sand.visible = th.ambient === 'sand';
    ambient.visible = th.ambient !== 'sand';
    sandMat.color.setHex(th.capLight);
    ambMat.blending = th.ambient === 'fireflies' ? THREE.AdditiveBlending : THREE.NormalBlending;
    ambMat.map = th.ambient === 'fireflies' ? glowTexture() : dotTexture();
    ambMat.size = ptSize(th.ambient === 'fireflies' ? 26 : th.ambient === 'snow' ? 7 : 4.5);
    ambMat.opacity = th.ambient === 'snow' ? 0.8 : th.ambient === 'fireflies' ? 1 : 0.55;
    ambMat.needsUpdate = true;
    ambient.geometry.setDrawRange(0, th.ambient === 'fireflies' ? 18 : th.ambient === 'meadow' ? 16 : N_AMBIENT);
    const c = th.ambient === 'fireflies' ? tmp.setHex(0xe8ff7a) : tmp.setHex(0xffffff);
    for (let i = 0; i < N_AMBIENT; i++) ambCol.setXYZ(i, c.r, c.g, c.b);
    ambCol.needsUpdate = true;
  }

  function updateAmbient(th: Theme, dt: number, wind: number): void {
    const t = clock;
    for (let i = 0; i < N_AMBIENT; i++) {
      switch (th.ambient) {
        case 'snow':
          ay[i] = ay[i]! + (40 + av[i]! * 50) * dt;
          ax[i] = ax[i]! + Math.sin(t * 1.3 + ap[i]!) * 22 * dt - 12 * dt + wind * (0.45 + av[i]! * 0.3) * dt;
          break;
        case 'sand':
          ax[i] = ax[i]! + (160 + av[i]! * 180 + wind * 0.8) * dt;
          ay[i] = ay[i]! + Math.sin(t * 2 + ap[i]!) * 10 * dt;
          break;
        case 'fireflies':
          ax[i] = ax[i]! + Math.sin(t * 0.7 + ap[i]!) * 18 * dt;
          ay[i] = ay[i]! + Math.cos(t * 0.9 + ap[i]! * 1.3) * 14 * dt;
          break;
        default:
          ay[i] = ay[i]! - (8 + av[i]! * 10) * dt;
          ax[i] = ax[i]! + Math.sin(t + ap[i]!) * 10 * dt;
      }
      if (ay[i]! > H + 10) ay[i] = -10;
      if (ay[i]! < -10) ay[i] = H + 10;
      if (ax[i]! > W + 20) ax[i] = -20;
      if (ax[i]! < -20) ax[i] = W + 20;
    }
    if (th.ambient === 'sand') {
      for (let i = 0; i < N_SAND; i++) {
        const s = (REST_DIST + az[i]!) / REST_DIST;
        const len = m(18 + av[i]! * 14) * s;
        mat4.makeScale(len, m(2.2) * s, 1);
        mat4.setPosition(sx(ax[i]!) * s * 1.15 - len / 2, EYE_LIFT + (sy(ay[i]! * 0.7 + 260) - EYE_LIFT) * s, -az[i]!);
        sand.setMatrixAt(i, mat4);
      }
      sand.instanceMatrix.needsUpdate = true;
      return;
    }
    const fire = th.ambient === 'fireflies';
    const n = fire ? 18 : th.ambient === 'meadow' ? 16 : N_AMBIENT;
    for (let i = 0; i < n; i++) {
      const s = (REST_DIST + az[i]!) / REST_DIST;
      const y = fire ? ay[i]! * 0.55 + 380 : th.ambient === 'meadow' ? ay[i]! * 0.6 + 300 : ay[i]!;
      ambPos.setXYZ(i, sx(ax[i]!) * s * 1.15, EYE_LIFT + (sy(y) - EYE_LIFT) * s, -az[i]!);
      if (fire) {
        const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.4 + ap[i]! * 3));
        ambCol.setXYZ(i, 0.82 * a, 1 * a, 0.2 * a);
      }
    }
    ambPos.needsUpdate = true;
    if (fire) ambCol.needsUpdate = true;
  }

  // ---- the worlds (built the first time each is needed)
  const sets: (WorldSet | null)[] = [null, null, null, null];
  function worldSet(i: number): WorldSet {
    let s = sets[i];
    if (!s) {
      s = { root: new THREE.Group(), layers: [], bobs: [], glows: [], presence: 0, animate: null };
      s.root.visible = false;
      root.add(s.root);
      BUILDERS[i]!(s, THEMES[i]!);
      // mist and other unlisted layers ride along with the listed ones
      for (const child of s.root.children) {
        if (!s.layers.some((l) => l.group === child)) {
          const sc = child.scale.x;
          s.layers.push({ group: child as THREE.Group, s: sc, baseY: child.position.y, order: Math.min(1, -child.position.z / 300) });
        }
      }
      sets[i] = s;
    }
    return s;
  }

  const sunLight = scene.getObjectByName(SUN_NAME) as THREE.DirectionalLight | undefined;
  const hemiLight = scene.getObjectByName(HEMI_NAME) as THREE.HemisphereLight | undefined;
  const bg = scene.background instanceof THREE.Color ? scene.background : (scene.background = new THREE.Color());

  return {
    update(themeIndex, real, wind) {
      clock += real;
      const idx = Math.max(0, Math.min(THEMES.length - 1, themeIndex));
      const th = THEMES[idx]!;
      if (idx !== themeNow) {
        const first = themeNow < 0;
        themeNow = idx;
        worldSet(idx);
        if (first) {
          blendTo(idx, 1);
          snapshot();
          blend = 1;
          worldSet(idx).presence = 1;
          setAmbient(th);
        } else {
          snapshot();
          blend = 0;
        }
      }
      if (blend < 1) {
        blend = Math.min(1, blend + real / 1.15);
        blendTo(idx, easeInOut(blend));
        if (blend > 0.5 && ambientKind !== th.ambient) setAmbient(th);
      }

      // worlds rise and sink
      for (let i = 0; i < sets.length; i++) {
        const s = sets[i];
        if (!s) continue;
        const target = i === idx ? 1 : 0;
        if (s.presence !== target) s.presence = THREE.MathUtils.clamp(s.presence + (target ? 1 : -1) * (real / 1.15), 0, 1);
        s.root.visible = s.presence > 0;
        if (!s.root.visible) continue;
        const moving = s.presence < 1;
        for (let k = 0; k < s.layers.length; k++) {
          const l = s.layers[k]!;
          const p = moving ? easeInOut(THREE.MathUtils.clamp(s.presence * 1.35 - 0.35 * l.order, 0, 1)) : 1;
          l.group.position.y = l.baseY - (1 - p) * DROP * l.s;
        }
        for (let k = 0; k < s.bobs.length; k++) {
          const b = s.bobs[k]!;
          b.obj.position.y = b.y + Math.sin(clock * b.speed + b.phase) * b.amp;
        }
        if (s.animate) s.animate(clock);
      }

      // sky
      for (let r = 0; r < skyYs.length; r++) {
        skyAt(skyYs[r]!, tmp);
        skyCol.setXYZ(r * 2, tmp.r, tmp.g, tmp.b);
        skyCol.setXYZ(r * 2 + 1, tmp.r, tmp.g, tmp.b);
      }
      skyCol.needsUpdate = true;
      bg.copy(cur.skyTop);

      // sun / moon / stars
      sunGroup.position.set(sx(cur.sunX), sy(cur.sunY), 0);
      sunGroup.scale.setScalar(m(cur.sunR));
      sunMat.color.copy(cur.sun);
      sunMat.opacity = 1 - cur.moon;
      sunDisc.visible = cur.moon < 0.99;
      moonMat.color.copy(cur.sun);
      moonMat.opacity = cur.moon;
      moon.visible = cur.moon > 0.01;
      haloMat.color.copy(cur.sun);
      haloMat.opacity = 0.62 - 0.3 * cur.moon;
      for (let g = 0; g < starMats.length; g++) {
        const mat = starMats[g]!;
        mat.opacity = cur.stars * (0.55 + 0.4 * Math.sin(clock * (0.9 + g * 0.5) + g * 2));
        mat.visible = cur.stars > 0.01;
      }

      // clouds drift with the wind
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i]!;
        c.x += (c.v + wind * 0.12) * real;
        if (c.x > W + 260) c.x = -260;
        if (c.x < -260) c.x = W + 260;
        c.mesh.position.set(sx(c.x), sy(c.y), 0);
        skyAt(c.y, tmp);
        c.mat.color.copy(tmp).lerp(cur.cloud, cur.cloudAlpha);
      }

      updateAmbient(th, real, wind);

      // the key and fill lights take the world's mood
      if (sunLight) {
        sunLight.color.copy(cur.lSun);
        sunLight.intensity = cur.lSunI;
      }
      if (hemiLight) {
        hemiLight.color.copy(cur.lSky);
        hemiLight.groundColor.copy(cur.lGround);
        hemiLight.intensity = cur.lHemiI;
      }
    },
  };
}
