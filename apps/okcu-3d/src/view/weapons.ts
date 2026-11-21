/**
 * The five new weapons as code-drawn models (three.js primitives merged into one vertex-coloured
 * geometry each, no textures): what the player holds (gear.ts) and what flies (arrows.ts).
 *
 * Authored in simulation px at scale 1, +x where the shot leaves; held models in the bow's own
 * frame (the hand holds the origin, +y up the limbs), projectiles with their point at the origin
 * the simulation tracks. arrows.ts scales them to metres.
 *
 * The celestial look (`arsenal.celestial`) is a shader patch on any lit material: the model's
 * own shading recoloured night-blue to violet, a soft inner glow and twinkling stars fixed to the
 * model (`celestial`). It is driven by a uniform, so switching it never recompiles.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '@okcu/textures';

// ---------------------------------------------------------------------------- celestial

/** the celestial shimmer's clock (seconds), shared by every patched material */
export const celestialTime = { value: 0 };

/**
 * Patch a lit material (Lambert, Phong, Standard) with the celestial look. `on` is the material's
 * own switch (0 … 1); `scale` is star cells per geometry unit (1/5 for px models, 16 for metres).
 */
export function celestial<M extends THREE.Material>(mat: M, on: { value: number }, scale: number): M {
  const before = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.uCel = on;
    shader.uniforms.uCelTime = celestialTime;
    shader.uniforms.uCelScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vCelP;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCelP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uCel;\nuniform float uCelTime;\nuniform float uCelScale;\nvarying vec3 vCelP;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  float celL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  vec3 celBase = mix(vec3(0.06, 0.05, 0.2), vec3(0.4, 0.34, 0.98), smoothstep(0.12, 0.85, celL));
  celBase = mix(celBase, vec3(1.0, 0.85, 0.42), smoothstep(0.86, 1.0, celL) * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, celBase, uCel);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  if (uCel > 0.001) {
    vec3 celQ = vCelP * uCelScale;
    vec3 celC = floor(celQ);
    vec3 celF = fract(celQ) - 0.5;
    float celH = fract(sin(dot(celC, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float celS = smoothstep(0.34, 0.0, length(celF)) * step(0.62, celH);
    float celT = 0.5 + 0.5 * sin(uCelTime * (2.0 + 3.0 * celH) + celH * 40.0);
    float celG = 0.3 + 0.14 * sin(uCelTime * 1.6 + (vCelP.x + vCelP.y) * uCelScale * 0.35);
    float body = smoothstep(0.12, 0.3, celL);
    totalEmissiveRadiance += uCel * (vec3(0.32, 0.25, 0.9) * celG * body + vec3(1.0, 0.94, 0.72) * celS * celT * 1.7 * (0.35 + 0.65 * body));
  }`,
      );
  };
  mat.customProgramCacheKey = () => `${key()}|okcu-celestial`;
  return mat;
}

// ---------------------------------------------------------------------------- geometry helpers

const AROUND = 8;

/** A tube swept along a curve in the xy plane with an elliptical section (a across, b in depth). */
export function sweep(n: number, at: (t: number) => readonly [number, number], radii: (t: number) => readonly [number, number], color?: (t: number) => THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = at(t);
    const [x0, y0] = at(Math.max(0, t - 0.01));
    const [x1, y1] = at(Math.min(1, t + 0.01));
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / l;
    const ny = (x1 - x0) / l;
    const [a, b] = radii(t);
    const c = color?.(t);
    for (let k = 0; k < AROUND; k++) {
      const th = (k / AROUND) * Math.PI * 2;
      pos.push(x + nx * a * Math.cos(th), y + ny * a * Math.cos(th), b * Math.sin(th));
      if (c) col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < AROUND; k++) {
      const a = i * AROUND + k;
      const b = i * AROUND + ((k + 1) % AROUND);
      idx.push(a, b, a + AROUND, b, b + AROUND, a + AROUND);
    }
  }
  // caps
  const first = pos.length / 3;
  const [sx0, sy0] = at(0);
  const [sx1, sy1] = at(1);
  pos.push(sx0, sy0, 0, sx1, sy1, 0);
  if (color) {
    const c0 = color(0);
    const c1 = color(1);
    col.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
  }
  for (let k = 0; k < AROUND; k++) {
    idx.push(first, (k + 1) % AROUND, k);
    idx.push(first + 1, n * AROUND + k, n * AROUND + ((k + 1) % AROUND));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}


/** Give a geometry one vertex colour (indexed, no uvs, so everything merges). */
export function paint(geo: THREE.BufferGeometry, hex: number | THREE.Color): THREE.BufferGeometry {
  const g = geo;
  const c = hex instanceof THREE.Color ? hex : new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Colour every vertex by a function of its position. */
function paintBy(geo: THREE.BufferGeometry, f: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  paint(geo, 0xffffff);
  const p = geo.getAttribute('position');
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.setHex(f(p.getX(i), p.getY(i), p.getZ(i)));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return geo;
}

/**
 * An ink outline: the shape pushed out along its normals by `t` and wound inside out, so only
 * its far side draws around the model (the arrows' look).
 */
export function inkHull(geo: THREE.BufferGeometry, t: number): THREE.BufferGeometry {
  const g = geo.clone();
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * t, p.getY(i) + n.getY(i) * t, p.getZ(i) + n.getZ(i) * t);
  const idx = g.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
  }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return paint(g, PALETTE.ink);
}

/** a cylinder lying along +x from x0 to x1 */
const rod = (x0: number, x1: number, r0: number, r1: number, seg = 8): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(r1, r0, x1 - x0, seg, 1).rotateZ(-Math.PI / 2).translate((x0 + x1) / 2, 0, 0);
/** a cone along +x, base at x0, point at x1 */
const cone = (x0: number, x1: number, r: number, seg = 8): THREE.BufferGeometry => new THREE.ConeGeometry(r, x1 - x0, seg, 1).rotateZ(-Math.PI / 2).translate((x0 + x1) / 2, 0, 0);
const box = (x0: number, x1: number, y0: number, y1: number, d: number): THREE.BufferGeometry =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, d).translate((x0 + x1) / 2, (y0 + y1) / 2, 0);

/** Merge painted parts, each with an ink hull of thickness `ink` (0 = none). */
function build(parts: THREE.BufferGeometry[], ink: number): THREE.BufferGeometry {
  const all: THREE.BufferGeometry[] = [];
  for (const p of parts) {
    // every part indexed, with the same attributes, so they merge
    if (!p.index) p.setIndex([...Array(p.getAttribute('position').count).keys()]);
    for (const name of Object.keys(p.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') p.deleteAttribute(name);
    all.push(p);
    if (ink > 0) all.push(inkHull(p, ink));
  }
  const g = mergeGeometries(all);
  return g;
}

// palette for the weapons (cartoon, readable at phone size)
const WOOD = 0xb5793f;
const WOOD_DARK = 0x7a4a26;
const STEEL = 0xdfe6f2;
const STEEL_DARK = 0x8d98ab;
const BRASS = 0xf0b43c;
const LEATHER = 0x6e3b26;
const RED = 0xd8262e;
const CREAM = 0xfff3dc;
const TEAL = 0x2fb8c2;

// ---------------------------------------------------------------------------- projectiles (px)

/** Crossbow bolt: short and stocky, a steel pyramid head and two stiff red vanes. Point at +14. */
export function boltGeometry(): THREE.BufferGeometry {
  const vane = (sign: number): THREE.BufferGeometry => {
    const g = box(-36, -20, 0, 7.5 * sign, 1.4);
    const p = g.getAttribute('position');
    // swept back: the outer edge leans to the tail
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i)) > 1) p.setX(i, p.getX(i) - 5);
    g.computeVertexNormals();
    return paint(g, RED);
  };
  return build(
    [
      paint(rod(-38, 0, 3.2, 3.2), WOOD_DARK),
      paint(rod(-4, 1, 3.8, 3.8), BRASS),
      paint(cone(0, 14, 6.2, 4).scale(1, 1, 0.7), STEEL),
      vane(1),
      vane(-1),
    ],
    1.6,
  );
}

/** Spear: an ash shaft, a leather grip, a bronze socket and a broad leaf-shaped head. Point at +34. */
export function spearGeometry(): THREE.BufferGeometry {
  const leaf = mergeGeometries([cone(-8, 34, 9, 6), cone(-8, -16, 9, 6)]).scale(1, 1, 0.36);
  return build(
    [
      paint(rod(-112, -10, 2.8, 2.8), WOOD),
      paint(rod(-76, -56, 3.7, 3.7), LEATHER),
      paint(rod(-16, -6, 3.8, 4.4), BRASS),
      paint(leaf, STEEL),
      paint(new THREE.SphereGeometry(3.6, 8, 6).translate(-112, 0, 0), BRASS),
      // a red tassel under the head
      paint(box(-22, -12, -9, -2, 2).rotateZ(0.25), RED),
    ],
    1.6,
  );
}

/** Boomerang: a flat curved V of painted wood, spun about its middle (the origin). */
export function boomerangGeometry(): THREE.BufferGeometry {
  const A = [-28, -24] as const;
  const C = [48, 0] as const;
  const B = [-28, 24] as const;
  const body = sweep(
    24,
    (t) => {
      const u = 1 - t;
      return [u * u * A[0] + 2 * u * t * C[0] + t * t * B[0] + 6, u * u * A[1] + 2 * u * t * C[1] + t * t * B[1]] as const;
    },
    (t) => {
      const e = Math.abs(t * 2 - 1);
      return [6.2 - 2 * e * e, 2.2 - 0.6 * e] as const;
    },
    (t) => {
      const e = Math.abs(t * 2 - 1);
      return new THREE.Color(e > 0.72 ? RED : e > 0.6 ? CREAM : e < 0.1 ? TEAL : WOOD);
    },
  );
  return build([body], 1.5);
}

/** Sling pebble: a lumpy round stone. */
export function pebbleGeometry(): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(10, 1);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  // shared corners welded: smooth normals, and an ink hull without cracks
  const g = mergeVertices(ico);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // a fixed lumpiness from the direction (the same at shared corners, so no cracks)
    const k = 1 + 0.12 * Math.sin(x * 1.3 + y * 0.7) * Math.cos(z * 1.1 - y * 0.4);
    p.setXYZ(i, x * k, y * k * 0.86, z * k * 0.92);
  }
  g.computeVertexNormals();
  const stone = paintBy(g, (x, y) => (y > 3 ? 0xc2bcb0 : x + y < -6 ? 0x7d776d : 0xa39d92));
  return build([stone], 1.7);
}

/** Firework rocket: a striped red body, a gold nose, teal fins and a guide stick. Point at +24. */
export function rocketGeometry(): THREE.BufferGeometry {
  const body = paintBy(new THREE.CylinderGeometry(6.2, 6.2, 32, 10, 8).rotateZ(-Math.PI / 2).translate(-6, 0, 0), (x) => (Math.floor((x + 22) / 8) % 2 === 0 ? RED : CREAM));
  const fins: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const g = box(-24, -12, 4, 13, 1.6);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 8) p.setX(i, p.getX(i) - 6);
    g.computeVertexNormals();
    fins.push(paint(g.rotateX((k / 3) * Math.PI * 2 + 0.4), TEAL));
  }
  return build([body, paint(cone(10, 24, 6.4, 10), BRASS), ...fins, paint(rod(-60, -22, 1.4, 1.4, 6).translate(0, -3, 0), WOOD)], 1.6);
}

// ---------------------------------------------------------------------------- held models (px)

/** Crossbow: stock and prod (the prod tilted toward the camera so it reads side-on). */
export interface CrossbowParts {
  body: THREE.BufferGeometry;
  /** the prod's tips (where the string is tied), bow frame px */
  tips: [THREE.Vector3, THREE.Vector3];
  /** where the spanned string is caught (the nut), bow frame px */
  nut: THREE.Vector3;
}

const PROD_TILT = 0.95;

export function crossbowGeometry(): CrossbowParts {
  const prod = sweep(
    20,
    (t) => {
      const y = (t * 2 - 1) * 27;
      const u = Math.abs(y) / 27;
      return [22 - 9 * u * u, y] as const;
    },
    (t) => {
      const u = Math.abs(t * 2 - 1);
      return [3.4 - 1.4 * u, 2.6 - 0.8 * u] as const;
    },
  ).rotateX(PROD_TILT);
  paint(prod, STEEL_DARK);
  // the stock: a fore-end through the fist, a body and a butt that drops to the shoulder
  const butt = box(-52, -34, -12, 5, 7);
  {
    const p = butt.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getX(i) < -45 && p.getY(i) < 0) p.setY(i, p.getY(i) - 3);
    butt.computeVertexNormals();
  }
  const body = build(
    [
      paint(box(-36, 26, -1, 6.5, 6.5), WOOD),
      paint(butt, WOOD_DARK),
      paint(box(-20, -14, -9, -1, 2.6), STEEL_DARK),
      paint(box(18, 26, -2.5, 8, 7.4), BRASS),
      paint(box(-10, -2, 5.5, 8.5, 4), BRASS),
      prod,
    ],
    1.4,
  );
  const tip = (s: number): THREE.Vector3 => new THREE.Vector3(13, s * 27, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), PROD_TILT);
  return { body, tips: [tip(1), tip(-1)], nut: new THREE.Vector3(-6, 7, 0) };
}

/** Slingshot: a forked stick (the fork turned toward the camera so the Y reads) and a pouch. */
export interface SlingParts {
  body: THREE.BufferGeometry;
  tips: [THREE.Vector3, THREE.Vector3];
  pouch: THREE.BufferGeometry;
}

const FORK_TURN = -0.95;
/** the slingshot is drawn a little smaller than modelled (it held up to the face reads big) */
const SLING_K = 0.78;

export function slingGeometry(): SlingParts {
  const prong = (s: number): THREE.BufferGeometry =>
    sweep(
      10,
      (t) => [0, 2 + t * 22] as const,
      () => [2.6, 2.6] as const,
    )
      .rotateX(-s * 0.5)
      .translate(0, 0, 0);
  const handle = sweep(
    8,
    (t) => [0, -22 + t * 25] as const,
    () => [3.4, 3.4] as const,
  );
  const wrap = rod(-3.8, 3.8, 3.8, 3.8).rotateZ(Math.PI / 2).translate(0, -14, 0);
  const parts = [paint(handle, WOOD), paint(prong(1), WOOD), paint(prong(-1), WOOD), paint(wrap.scale(1, 2.2, 1), LEATHER)];
  for (const p of parts) p.rotateY(FORK_TURN).scale(SLING_K, SLING_K, SLING_K);
  const body = build(parts, 1.3);
  const tip = (s: number): THREE.Vector3 =>
    new THREE.Vector3(0, 24, 0)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), -s * 0.5)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), FORK_TURN)
      .multiplyScalar(SLING_K);
  const pouch = build([paint(new THREE.SphereGeometry(4.5, 8, 6).scale(1, 1.5, 1), LEATHER)], 1.2);
  return { body, tips: [tip(1), tip(-1)], pouch };
}

/** Firework tube: a striped cardboard tube with gold rims and a fuse, held in the middle. */
export function tubeGeometry(): THREE.BufferGeometry {
  const tube = paintBy(rod(-40, 28, 8.6, 8.6, 14).translate(0, 7, 0), (x) => (Math.floor((x + 40) / 9) % 2 === 0 ? RED : CREAM));
  const rim = (x: number): THREE.BufferGeometry => paint(rod(x - 2.5, x + 2.5, 10, 10, 14).translate(0, 7, 0), BRASS);
  const fuse = sweep(
    10,
    (t) => [-38 - t * 6, 14 + t * 9 + Math.sin(t * 7) * 2] as const,
    () => [1.3, 1.3] as const,
  );
  // the dark mouth at the front, so it reads as a tube from any angle
  const mouth = paint(new THREE.CircleGeometry(7.2, 14).rotateY(Math.PI / 2).translate(30.6, 7, 0), 0x241a2c);
  return build([tube, rim(-40), rim(28), paint(box(-10, 6, -6, 1, 5), LEATHER), paint(fuse, 0x5a4636), mouth], 1.5);
}

/** what's poking out of the tube when it is loaded: the rocket's nose */
export function tubeLoadGeometry(): THREE.BufferGeometry {
  return build([paint(cone(28, 40, 6.2, 10), BRASS).translate(0, 7, 0), paint(rod(22, 29, 6.2, 6.2, 10).translate(0, 7, 0), RED)], 1.2);
}
