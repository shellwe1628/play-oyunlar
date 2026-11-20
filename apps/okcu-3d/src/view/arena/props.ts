/**
 * Stage objects in 3D (the 2D game's scenes/props.ts): cover walls, the rails of sliding ledges,
 * the ropes of swinging ones (they whip away when cut), barrels, hanging rocks, the boss's shield
 * plates, bonus-round targets and the floating apples. Everything sits exactly on the
 * simulation's rectangles and circles; pooled by array index, geometries and materials shared.
 */
import * as THREE from 'three';
import type { Theme } from '@okcu/anim/themes';
import { TUNING } from '@sim/tuning';
import type { World } from '@sim/world';
import { m, sx, sy } from '../../coords';
import { EYE_LIFT, REST_DIST } from '../stage';
import { ROPE_Z, solidMat } from './ledges';
import { INK, PINK, ROPE, easeOutBack, glowTexture, jitter, merge, mixHex, roundedBox, shadeHex, solid, tintHex } from './util';

const IRON = 0x57506a;
/** hanging rocks and their ropes ride just in front of the islands, so the rope (a target) and the rock never hide inside one */
const ROCK_Z = 0.9;
const UP = new THREE.Vector3(0, 1, 0);
const A = new THREE.Vector3();
const B = new THREE.Vector3();

const ropeMat = new THREE.MeshStandardMaterial({ color: ROPE, roughness: 0.95 });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x746c8a, roughness: 0.55, metalness: 0.1 });
const glossMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0 });
const goldMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.45 });
const sparkMat = new THREE.SpriteMaterial({ color: 0xffa23a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const dustMat = new THREE.SpriteMaterial({ color: 0xe8d3b0, depthWrite: false, transparent: true, opacity: 0.4 });

// ---------------------------------------------------------------- shared geometry (built once)

let ropeGeo: THREE.BufferGeometry | null = null;
function ropeGeometry(): THREE.BufferGeometry {
  // unit length along +y from the origin; scaled to the rope's length
  ropeGeo ??= new THREE.CylinderGeometry(0.042, 0.042, 1, 6, 1, true).translate(0, 0.5, 0);
  return ropeGeo;
}

/** scene x / y of a logical point drawn at depth z so that it still projects onto its place in the gameplay plane */
const frontK = (z: number): number => (REST_DIST - z) / REST_DIST;
const frontY = (y: number, k: number): number => EYE_LIFT + (sy(y) - EYE_LIFT) * k;

function placeRope(mesh: THREE.Mesh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, exact = false): void {
  const k0 = exact ? frontK(z0) : 1;
  const k1 = exact ? frontK(z1) : 1;
  A.set(sx(x0) * k0, frontY(y0, k0), z0);
  B.set(sx(x1) * k1, frontY(y1, k1), z1).sub(A);
  const len = B.length();
  mesh.position.copy(A);
  mesh.scale.set(1, Math.max(0.0001, len), 1);
  mesh.quaternion.setFromUnitVectors(UP, B.multiplyScalar(1 / Math.max(0.0001, len)));
}

let barrelGeo: THREE.BufferGeometry | null = null;
function barrelGeometry(): THREE.BufferGeometry {
  if (barrelGeo) return barrelGeo;
  const h = m(46);
  const r = m(18);
  const red = new THREE.Color(0xd8402f);
  const redDark = new THREE.Color(0xa52a1f);
  const profile = [
    new THREE.Vector2(0, -h / 2),
    new THREE.Vector2(r * 0.8, -h / 2),
    new THREE.Vector2(r * 0.93, -h * 0.3),
    new THREE.Vector2(r, 0),
    new THREE.Vector2(r * 0.93, h * 0.3),
    new THREE.Vector2(r * 0.8, h / 2),
    new THREE.Vector2(0, h / 2),
  ];
  const parts: THREE.BufferGeometry[] = [];
  const lathe = new THREE.LatheGeometry(profile, 16);
  lathe.computeVertexNormals();
  parts.push(solid(lathe, (out, p, n) => {
    // staves: alternate planks a touch darker; the lid darker still
    const a = Math.atan2(p.z, p.x);
    const stave = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2;
    out.copy(red).lerp(redDark, Math.abs(n.y) > 0.9 ? 0.75 : stave ? 0.22 : 0);
  }));
  for (const y of [h * 0.26, -h * 0.24]) {
    parts.push(solid(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.062, 16, 1, true).translate(0, y, 0), 0x3b2a4a));
  }
  // hazard sign on the front
  const tri = new THREE.BufferGeometry();
  const z = r + 0.006;
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.14, z - 0.012, -0.12, -0.065, z, 0.12, -0.065, z], 3));
  tri.computeVertexNormals();
  parts.push(solid(tri, 0xffe066));
  parts.push(solid(new THREE.BoxGeometry(0.03, 0.075, 0.01).translate(0, 0.035, z + 0.004), INK));
  parts.push(solid(new THREE.SphereGeometry(0.019, 6, 4).translate(0, -0.035, z + 0.004), INK));
  // fuse cap
  parts.push(solid(new THREE.CylinderGeometry(0.035, 0.045, 0.05, 8).translate(-r * 0.4, h / 2 + 0.02, 0), 0x3b2a4a));
  parts.push(solid(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 5).translate(-r * 0.4, h / 2 + 0.07, 0), 0xe9d9b0));
  barrelGeo = merge(parts);
  return barrelGeo;
}

const rockGeos = new Map<string, THREE.BufferGeometry>();
/** A faceted boulder of radius 1 with a rope sling (scaled to the simulation's radius). */
function rockGeometry(th: Theme, sling: boolean): THREE.BufferGeometry {
  const key = `${th.id}${sling ? 's' : ''}`;
  const hit = rockGeos.get(key);
  if (hit) return hit;
  // a little lighter than the islands' earth so it reads when it hangs in front of one
  const main = new THREE.Color(th.ambient === 'snow' ? 0xcfe8ff : tintHex(th.body, 0.3));
  const dark = new THREE.Color(th.ambient === 'snow' ? 0x8fb8e8 : tintHex(th.bodyDark, 0.12));
  const parts: THREE.BufferGeometry[] = [];
  parts.push(solid(jitter(new THREE.IcosahedronGeometry(0.97, 1), 0.07, 5), (out, _p, n) => {
    out.copy(main).lerp(dark, THREE.MathUtils.clamp(0.3 + n.x * 0.4 - n.y * 0.45, 0, 1));
  }, true));
  if (sling) {
    parts.push(solid(new THREE.TorusGeometry(1.0, 0.085, 6, 20).rotateY(Math.PI / 2), ROPE));
    parts.push(solid(new THREE.TorusGeometry(1.0, 0.085, 6, 20), ROPE));
    parts.push(solid(new THREE.SphereGeometry(0.19, 8, 6).translate(0, 1.04, 0), shadeHex(ROPE, 0.85)));
  }
  const g = merge(parts);
  rockGeos.set(key, g);
  return g;
}

const wallGeos = new Map<string, THREE.BufferGeometry>();
const WALL_W = m(26);
const WALL_H = m(118);
/** A cover wall of stacked stones at the simulation's wall size (26 × 118 px), 1 m deep, centred. */
function wallGeometry(th: Theme): THREE.BufferGeometry {
  const hit = wallGeos.get(th.id);
  if (hit) return hit;
  const W = WALL_W;
  const H = WALL_H;
  const D = 1.0;
  const parts: THREE.BufferGeometry[] = [];
  const courses = 4;
  const ch = H / courses;
  for (let c = 0; c < courses; c++) {
    const split = c % 2 ? 0.42 : 0.58;
    const y = -H / 2 + ch * (c + 0.5);
    const a = D * split;
    const b = D - a;
    // paler than the islands' earth, so the wall reads as stacked stone against them
    const stoneC = tintHex(mixHex(th.body, th.under, 0.35), 0.28);
    const tone = [stoneC, mixHex(stoneC, th.bodyDark, 0.3), tintHex(stoneC, 0.14), mixHex(stoneC, th.bodyDark, 0.16)];
    const stone = (len: number, zc: number, color: number): void => {
      const top = new THREE.Color(tintHex(color, 0.16));
      const base = new THREE.Color(color);
      const shadeC = new THREE.Color(mixHex(color, th.bodyDark, 0.55));
      parts.push(solid(roundedBox(W, ch - 0.012, len - 0.014, 0.07, 2).translate(0, y, zc), (out, _p, n) => {
        out.copy(base);
        if (n.y > 0.4) out.lerp(top, n.y);
        if (n.x > 0.4) out.lerp(shadeC, n.x * 0.8);
      }));
    };
    stone(a, D / 2 - a / 2, tone[c % 4]!);
    stone(b, -D / 2 + b / 2, tone[(c + 2) % 4]!);
  }
  const g = merge(parts);
  wallGeos.set(th.id, g);
  return g;
}

let plateGeo: THREE.BufferGeometry | null = null;
let emblemGeo: THREE.BufferGeometry | null = null;
function plateGeometry(): THREE.BufferGeometry {
  if (plateGeo) return plateGeo;
  const gold = 0xf2c14a;
  const shade = 0xc8902a;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(solid(new THREE.CylinderGeometry(0.93, 1, 0.26, 28).rotateX(Math.PI / 2), (out, p) => {
    out.setHex(Math.hypot(p.x - 0.2, p.y + 0.2) < 0.6 && p.z > 0.1 ? mixHex(gold, shade, 0.55) : gold);
  }));
  parts.push(solid(new THREE.TorusGeometry(0.93, 0.09, 8, 28).translate(0, 0, 0.1), shade));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    parts.push(solid(new THREE.SphereGeometry(0.07, 6, 4).translate(Math.cos(a) * 0.93, Math.sin(a) * 0.93, 0.16), tintHex(gold, 0.35)));
  }
  plateGeo = merge(parts);
  return plateGeo;
}
function emblemGeometry(): THREE.BufferGeometry {
  if (emblemGeo) return emblemGeo;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3;
    parts.push(solid(roundedBox(0.7, 0.13, 0.08, 0.03, 1).translate(0.35, 0, 0).rotateZ(a), INK));
    parts.push(solid(new THREE.ConeGeometry(0.09, 0.2, 4).rotateZ(-Math.PI / 2).translate(0.72, 0, 0).rotateZ(a), INK));
  }
  parts.push(solid(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 1, 0.5), INK));
  emblemGeo = merge(parts);
  return emblemGeo;
}

let targetGeo: THREE.BufferGeometry | null = null;
let balloonGeo: THREE.BufferGeometry | null = null;
function targetGeometry(): THREE.BufferGeometry {
  if (targetGeo) return targetGeo;
  const rings = [0xffffff, 0xff3b55, 0xffffff, 0xff3b55, 0xffc93c];
  const parts: THREE.BufferGeometry[] = [];
  // a straw boss, face toward the camera
  parts.push(solid(new THREE.CylinderGeometry(1, 1, 0.3, 28, 1, true).rotateX(Math.PI / 2), (out, p) => {
    out.setHex(Math.sin(Math.atan2(p.y, p.x) * 14) > 0 ? 0xd9a860 : 0xc08a45);
  }));
  parts.push(solid(new THREE.CircleGeometry(1, 28).rotateY(Math.PI).translate(0, 0, -0.15), 0xb07a3c));
  rings.forEach((c, i) => {
    const outer = 1 - i * 0.2;
    const inner = outer - 0.2;
    const g = inner > 0.01 ? new THREE.RingGeometry(inner, outer, 28) : new THREE.CircleGeometry(outer, 20);
    parts.push(solid(g.translate(0, 0, 0.15), c));
  });
  parts.push(solid(new THREE.TorusGeometry(1, 0.055, 6, 28).translate(0, 0, 0.15), 0x8a5a2c));
  // the string up to its balloon
  parts.push(solid(new THREE.CylinderGeometry(0.02, 0.02, 1.05, 5).translate(0, 1.5, 0), INK));
  targetGeo = merge(parts);
  return targetGeo;
}
function balloonGeometry(): THREE.BufferGeometry {
  if (balloonGeo) return balloonGeo;
  const parts: THREE.BufferGeometry[] = [];
  const pink = new THREE.Color(PINK);
  const deep = new THREE.Color(shadeHex(PINK, 0.78));
  parts.push(solid(new THREE.SphereGeometry(1, 16, 12).scale(0.42, 0.52, 0.42).translate(0, 2.5, 0), (out, _p, n) => {
    out.copy(pink).lerp(deep, THREE.MathUtils.clamp(0.4 - n.y * 0.5, 0, 1));
  }));
  parts.push(solid(new THREE.ConeGeometry(0.09, 0.12, 6).translate(0, 1.97, 0), shadeHex(PINK, 0.7)));
  balloonGeo = merge(parts);
  return balloonGeo;
}

let appleGeo: THREE.BufferGeometry | null = null;
/** An apple of radius 1: dimpled red body, stem and leaf. */
function appleGeometry(): THREE.BufferGeometry {
  if (appleGeo) return appleGeo;
  const red = new THREE.Color(0xff4a4a);
  const deep = new THREE.Color(0xc92436);
  const blush = new THREE.Color(0xff8a5c);
  const body = new THREE.SphereGeometry(1, 20, 14);
  const pos = body.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z);
    // pull the poles in (dimples) and widen the shoulders
    const dimple = Math.exp(-(r * r) / 0.09);
    v.y = v.y * 0.94 - Math.sign(v.y) * dimple * 0.26;
    const wide = 1 + 0.07 * Math.max(0, v.y);
    pos.setXYZ(i, v.x * wide, v.y, v.z * wide);
  }
  body.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [];
  parts.push(solid(body, (out, p, n) => {
    out.copy(red).lerp(deep, THREE.MathUtils.clamp(0.35 - n.y * 0.5 + n.x * 0.25, 0, 1)).lerp(blush, THREE.MathUtils.clamp(p.y * 0.5 - p.x * 0.35, 0, 0.5));
  }));
  parts.push(solid(new THREE.CylinderGeometry(0.05, 0.065, 0.5, 6).translate(0, 0.25, 0).rotateZ(-0.3).translate(0, 0.66, 0), 0x6e4526));
  parts.push(solid(new THREE.SphereGeometry(0.3, 8, 6).scale(1, 0.28, 0.55).rotateZ(0.5).translate(0.36, 1.0, 0), (out, _p, n) => {
    out.setHex(n.y > 0 ? 0x6fdc4f : 0x58c947);
  }));
  appleGeo = merge(parts);
  return appleGeo;
}

let railGeo: THREE.BufferGeometry | null = null;
let stopGeo: THREE.BufferGeometry | null = null;

// ---------------------------------------------------------------- pools

function grow<T>(pool: T[], n: number, make: (i: number) => T): void {
  while (pool.length < n) pool.push(make(pool.length));
}

interface SwingView {
  ropes: THREE.Mesh[];
  /** seconds since the rope was cut (−1: whole) and where it was tied then (logical px) */
  cutT: number;
  lx: number;
  rx: number;
  y: number;
}
interface RailView {
  group: THREE.Group;
  bar: THREE.Mesh;
  stops: [THREE.Mesh, THREE.Mesh];
}
interface PropView {
  group: THREE.Group;
  barrel: THREE.Mesh;
  spark: THREE.Sprite;
  rock: THREE.Mesh;
  rope: THREE.Mesh;
  cutT: number;
  cutY: number;
  theme: number;
  pop: number;
  on: boolean;
}
interface WallView {
  mesh: THREE.Mesh;
  theme: number;
  pop: number;
}
interface PlateView {
  group: THREE.Group;
  emblem: THREE.Mesh;
  pop: number;
}
interface TargetView {
  group: THREE.Group;
  target: THREE.Group | null;
  apple: THREE.Mesh | null;
  rock: THREE.Mesh | null;
  dust: THREE.Sprite[];
  rockTheme: number;
  pop: number;
}
interface AppleView {
  mesh: THREE.Mesh;
  pop: number;
}

export interface PropsView {
  update(w: World, th: Theme, themeIndex: number, real: number, time: number): void;
}

export function createProps(scene: THREE.Scene): PropsView {
  const swings: SwingView[] = [];
  const rails: RailView[] = [];
  const props: PropView[] = [];
  const walls: WallView[] = [];
  const plates: PlateView[] = [];
  const targets: TargetView[] = [];
  const apples: AppleView[] = [];
  sparkMat.map = glowTexture();
  dustMat.map = glowTexture();

  const shadowed = (mesh: THREE.Mesh): THREE.Mesh => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const newRope = (): THREE.Mesh => {
    const r = new THREE.Mesh(ropeGeometry(), ropeMat);
    r.castShadow = true;
    r.visible = false;
    scene.add(r);
    return r;
  };

  function makeSwing(): SwingView {
    return { ropes: [newRope(), newRope(), newRope(), newRope()], cutT: -1, lx: 0, rx: 0, y: 0 };
  }

  function makeRail(): RailView {
    railGeo ??= roundedBox(1, 0.12, 0.12, 0.03, 1);
    if (!stopGeo) {
      stopGeo = merge([
        solid(roundedBox(0.2, 0.36, 0.36, 0.05, 2), IRON),
        solid(new THREE.SphereGeometry(0.06, 8, 6).translate(0, 0, 0.2), tintHex(IRON, 0.4)),
        solid(new THREE.SphereGeometry(0.06, 8, 6).translate(0, 0, -0.2), tintHex(IRON, 0.4)),
      ]);
    }
    const group = new THREE.Group();
    const bar = shadowed(new THREE.Mesh(railGeo, ironMat));
    const stops: [THREE.Mesh, THREE.Mesh] = [shadowed(new THREE.Mesh(stopGeo, solidMat)), shadowed(new THREE.Mesh(stopGeo, solidMat))];
    group.add(bar, stops[0], stops[1]);
    group.visible = false;
    scene.add(group);
    return { group, bar, stops };
  }

  function makeProp(): PropView {
    const group = new THREE.Group();
    const barrel = shadowed(new THREE.Mesh(barrelGeometry(), solidMat));
    const spark = new THREE.Sprite(sparkMat);
    spark.position.set(-m(18) * 0.4, m(46) / 2 + 0.12, 0.02);
    barrel.add(spark);
    const rock = shadowed(new THREE.Mesh(new THREE.BufferGeometry(), solidMat));
    group.add(barrel, rock);
    group.visible = false;
    scene.add(group);
    return { group, barrel, spark, rock, rope: newRope(), cutT: -1, cutY: 0, theme: -1, pop: 0, on: false };
  }

  function makeWall(): WallView {
    const mesh = shadowed(new THREE.Mesh(new THREE.BufferGeometry(), solidMat));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, theme: -1, pop: 0 };
  }

  function makePlate(): PlateView {
    const group = new THREE.Group();
    const disc = shadowed(new THREE.Mesh(plateGeometry(), goldMat));
    const emblem = new THREE.Mesh(emblemGeometry(), solidMat);
    emblem.position.z = 0.15;
    group.add(disc, emblem);
    group.visible = false;
    scene.add(group);
    return { group, emblem, pop: 0 };
  }

  function makeTarget(): TargetView {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    return { group, target: null, apple: null, rock: null, dust: [], rockTheme: -1, pop: 0 };
  }

  function makeApple(): AppleView {
    const mesh = shadowed(new THREE.Mesh(appleGeometry(), glossMat));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, pop: 0 };
  }

  /** 0 → 1 with a little overshoot while `on`; drops to 0 at once when it goes */
  const popIn = (cur: number, on: boolean, real: number): number => (on ? Math.min(1, cur + real / 0.26) : 0);

  return {
    update(w, th, themeIndex, real, time) {
      // ---- moving ledges: rails and ropes
      let nSwing = 0;
      let nRail = 0;
      for (const mv of w.movers) {
        const L = w.ledges[mv.index];
        if (!L) continue;
        if (mv.kind === 'slide') {
          grow(rails, nRail + 1, makeRail);
          const r = rails[nRail++]!;
          const half = m(mv.amp + L.w / 2) + 0.34;
          r.group.visible = true;
          r.group.position.set(sx(mv.x0 + L.w / 2), sy(mv.y0 + L.h / 2) - 0.02, 0);
          r.bar.scale.x = half * 2;
          r.stops[0].position.x = -half;
          r.stops[1].position.x = half;
        } else if (mv.kind === 'swing') {
          grow(swings, nSwing + 1, makeSwing);
          const s = swings[nSwing++]!;
          if (!mv.cut) {
            s.cutT = -1;
            s.lx = L.x + 10;
            s.rx = L.x + L.w - 10;
            s.y = L.y;
          } else {
            // first frame after the cut: the ropes keep the place they were tied at, then whip up
            s.cutT = s.cutT < 0 ? 0 : s.cutT + real;
          }
          const k = s.cutT < 0 ? 0 : Math.min(1, s.cutT / 0.45);
          const show = k < 1;
          for (let q = 0; q < 4; q++) {
            const rope = s.ropes[q]!;
            rope.visible = show;
            if (!show) continue;
            const left = q < 2;
            const z = (q % 2 ? -1 : 1) * ROPE_Z;
            const ax = left ? s.lx : s.rx;
            // the loose end flies up toward the pivot and swings wide
            const e = k * k;
            const ex = ax + (mv.pivotX - ax) * e + (left ? -1 : 1) * Math.sin(k * Math.PI) * 46;
            const ey = s.y + (mv.pivotY - s.y) * e;
            placeRope(rope, mv.pivotX, mv.pivotY, 0, ex, ey + 4, z * (1 - e));
          }
        }
      }
      for (let i = nRail; i < rails.length; i++) rails[i]!.group.visible = false;
      for (let i = nSwing; i < swings.length; i++) {
        const s = swings[i]!;
        s.cutT = -1;
        for (const r of s.ropes) r.visible = false;
      }

      // ---- cover walls
      grow(walls, w.walls.length, makeWall);
      for (let i = 0; i < walls.length; i++) {
        const v = walls[i]!;
        const L = w.walls[i];
        v.pop = popIn(v.pop, !!L, real);
        v.mesh.visible = !!L;
        if (!L) continue;
        if (v.theme !== themeIndex) {
          v.mesh.geometry = wallGeometry(th);
          v.theme = themeIndex;
        }
        const k = easeOutBack(v.pop);
        // grows up out of its ledge; at rest it fills the wall rectangle exactly
        v.mesh.scale.set(m(L.w) / WALL_W, (m(L.h) / WALL_H) * Math.max(0.01, k), 1);
        v.mesh.position.set(sx(L.x + L.w / 2), sy(L.y + L.h) + (m(L.h) * Math.max(0.01, k)) / 2, 0);
      }

      // ---- barrels and rocks
      grow(props, w.props.length, makeProp);
      for (let i = 0; i < props.length; i++) {
        const v = props[i]!;
        const p = w.props[i];
        const on = !!p && p.active;
        if (!on) {
          v.group.visible = false;
          v.rope.visible = false;
          v.on = false;
          v.pop = 0;
          v.cutT = -1;
          continue;
        }
        v.pop = popIn(v.pop, true, real);
        const k = 0.5 + 0.5 * easeOutBack(v.pop);
        v.group.visible = true;
        v.on = true;
        if (p.kind === 'barrel') {
          v.barrel.visible = true;
          v.rock.visible = false;
          v.rope.visible = false;
          // scale from the base so it never sinks into its ledge
          v.group.scale.setScalar(k);
          v.group.position.set(sx(p.x + p.w / 2), sy(p.y + p.h) + (m(p.h) / 2) * k, 0);
          v.group.rotation.z = 0;
          v.spark.scale.setScalar(0.22 + Math.sin(time * 30 + p.x) * 0.07 + Math.sin(time * 47) * 0.03);
        } else {
          v.barrel.visible = false;
          v.rock.visible = true;
          if (v.theme !== themeIndex) {
            v.rock.geometry = rockGeometry(th, true);
            v.theme = themeIndex;
          }
          const r = m(p.w);
          const fk = frontK(ROCK_Z);
          v.group.scale.setScalar(r * k * fk);
          v.group.position.set(sx(p.x) * fk, frontY(p.y, fk), ROCK_Z);
          if (p.hanging) {
            v.cutT = -1;
            v.cutY = p.y;
            v.group.rotation.z = Math.sin(time * 1.3 + p.x) * 0.05;
            v.rope.visible = true;
            placeRope(v.rope, p.x, p.pivotY, ROCK_Z, p.x, p.y - p.w + 4, ROCK_Z, true);
          } else {
            v.cutT = v.cutT < 0 ? 0 : v.cutT + real;
            v.group.rotation.z += real * 2.2;
            const c = Math.min(1, v.cutT / 0.4);
            v.rope.visible = c < 1;
            if (c < 1) {
              const e = c * c;
              placeRope(v.rope, p.x, p.pivotY, ROCK_Z, p.x + Math.sin(c * Math.PI) * 30, v.cutY - p.w + (p.pivotY - v.cutY + p.w) * e, ROCK_Z, true);
            }
          }
        }
      }

      // ---- the boss's shield plates
      grow(plates, w.plates.length, makePlate);
      for (let i = 0; i < plates.length; i++) {
        const v = plates[i]!;
        const p = w.plates[i];
        const on = !!p && p.active;
        v.pop = popIn(v.pop, on, real);
        v.group.visible = on;
        if (!on || !p) continue;
        v.group.position.set(sx(p.x), sy(p.y), 0.3);
        v.group.scale.setScalar(m(p.r) * (0.4 + 0.6 * easeOutBack(v.pop)));
        v.group.rotation.y = Math.sin(time * 2 + i) * 0.18;
        v.emblem.rotation.z = -(time * 3 + i);
      }

      // ---- bonus-round targets
      grow(targets, w.targets.length, makeTarget);
      for (let i = 0; i < targets.length; i++) {
        const v = targets[i]!;
        const t = w.targets[i];
        const on = !!t && t.active;
        v.pop = popIn(v.pop, on, real);
        v.group.visible = on;
        if (!on || !t) continue;
        const r = m(t.r);
        const k = 0.5 + 0.5 * easeOutBack(v.pop);
        v.group.position.set(sx(t.x), sy(t.y), 0);
        if (v.target) v.target.visible = t.kind === 'target';
        if (v.apple) v.apple.visible = t.kind === 'apple';
        if (v.rock) v.rock.visible = t.kind === 'rock';
        for (const d of v.dust) d.visible = t.kind === 'rock';
        if (t.kind === 'target') {
          if (!v.target) {
            v.target = new THREE.Group();
            v.target.add(shadowed(new THREE.Mesh(targetGeometry(), solidMat)), shadowed(new THREE.Mesh(balloonGeometry(), glossMat)));
            v.group.add(v.target);
          }
          v.group.scale.setScalar(r * k);
          v.group.rotation.set(0, Math.sin(t.t * 1.7 + i) * 0.22, Math.sin(t.t * 2.3 + i * 1.3) * 0.06);
        } else if (t.kind === 'apple') {
          if (!v.apple) {
            v.apple = shadowed(new THREE.Mesh(appleGeometry(), glossMat));
            v.group.add(v.apple);
          }
          const wob = Math.sin(t.t * 9) * 0.08;
          v.group.scale.set(r * k * (1 + wob), r * k * (1 - wob), r * k * (1 + wob));
          v.group.rotation.set(0, t.t * 1.5 + i, Math.sin(t.t * 3 + i) * 0.2);
        } else {
          if (!v.rock) {
            v.rock = shadowed(new THREE.Mesh(new THREE.BufferGeometry(), solidMat));
            v.group.add(v.rock);
            for (let d = 0; d < 3; d++) {
              const s = new THREE.Sprite(dustMat);
              v.dust.push(s);
              scene.add(s);
            }
          }
          if (v.rockTheme !== themeIndex) {
            v.rock.geometry = rockGeometry(th, false);
            v.rockTheme = themeIndex;
          }
          v.group.scale.setScalar(r * k);
          v.group.rotation.set(0, 0, -t.t * 5);
          // a dust tail behind it
          const sp = Math.hypot(t.vx, t.vy) || 1;
          for (let d = 0; d < 3; d++) {
            const s = v.dust[d]!;
            s.position.set(sx(t.x - (t.vx / sp) * 18 * (d + 1)), sy(t.y - (t.vy / sp) * 18 * (d + 1)), -0.1);
            s.scale.setScalar(r * 3.2 * (1 - (d + 1) * 0.15));
          }
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const v = targets[i]!;
        if (!v.group.visible) for (const d of v.dust) d.visible = false;
      }

      // ---- floating apples
      grow(apples, w.apples.length, makeApple);
      const ar = m(TUNING.appleRadius) * (w.stats.appleRadiusMul > 1 ? 1.25 : 1);
      for (let i = 0; i < apples.length; i++) {
        const v = apples[i]!;
        const ap = w.apples[i];
        const on = !!ap && ap.active;
        v.pop = popIn(v.pop, on, real);
        v.mesh.visible = on;
        if (!on || !ap) continue;
        const k = (0.4 + 0.6 * easeOutBack(v.pop)) * ar;
        const wob = Math.sin(ap.t * 7) * 0.07;
        v.mesh.position.set(sx(ap.x), sy(ap.y), 0);
        v.mesh.scale.set(k * (1 + wob), k * (1 - wob), k * (1 + wob));
        v.mesh.rotation.set(0, ap.t * 1.2, Math.sin(ap.t * 3) * 0.25);
      }
    },
  };
}
