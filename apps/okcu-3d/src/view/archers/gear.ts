/**
 * What the archer holds: a chunky recurve bow that bends as the string is drawn, the string and
 * the nocked arrow; or the player's selected weapon (weapons.ts models): a crossbow that kicks
 * on the shot, a spear or boomerang in the throwing hand, a slingshot whose bands stretch to the
 * fingers and snap, a firework tube that kicks muzzle-up. The Mixamo bow and arrow are true to life, which at phone size means a hair:
 * these are modelled at the 2D game's proportions instead (bow 80 px tall, 7 px limbs).
 *
 * Authored in simulation px at scale 1, in the bow's own frame: +x is where the arrow leaves,
 * +y runs up the limbs, the hand holds the origin.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '@okcu/textures';
import type { WeaponId } from '@sim/weapons';
import { PX_PER_M } from '../../coords';
import {
  boltGeometry,
  boomerangGeometry,
  celestial,
  sweep,
  crossbowGeometry,
  pebbleGeometry,
  slingGeometry,
  spearGeometry,
  tubeGeometry,
  tubeLoadGeometry,
  type CrossbowParts,
  type SlingParts,
} from '../weapons';

const HALF = 40; // limb tip height above the hand
const PIVOT = 7; // where a limb starts to bend
const TIP_X = -10;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function bowGeometry(): THREE.BufferGeometry {
  const limb = new THREE.Color(1, 1, 1);
  const wrap = new THREE.Color(0.28, 0.2, 0.24);
  const tip = new THREE.Color(1.25, 1.2, 1.1);
  const g = sweep(
    36,
    (t) => {
      const y = (t * 2 - 1) * HALF;
      const u = Math.abs(y) / HALF;
      return [5 - 19 * Math.pow(u, 1.5) + 4 * smooth(0.8, 1, u), y] as const;
    },
    (t) => {
      const u = Math.abs(t * 2 - 1);
      const grip = 1 - smooth(0.1, 0.2, u);
      const end = smooth(0.9, 1, u);
      return [3.3 - 1.5 * u + grip * 0.9 + end * 0.9, 4.4 - 2.2 * u + grip * 0.4 + end * 0.6] as const;
    },
    (t) => {
      const u = Math.abs(t * 2 - 1);
      return u < 0.17 ? wrap : u > 0.9 ? tip : limb;
    },
  );
  // limbs bend about a pivot near the grip: weight ramps from the grip bone to the limb bone
  const pos = g.getAttribute('position');
  const si: number[] = [];
  const sw: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const w = smooth(PIVOT - 3, PIVOT + 16, Math.abs(y));
    si.push(0, y > 0 ? 1 : 2, 0, 0);
    sw.push(1 - w, w, 0, 0);
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

function arrowGeometry(shaft: number, fletch: number): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
    const c = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const L = 50;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(new THREE.CylinderGeometry(1.7, 1.7, L - 8, 6).rotateZ(-Math.PI / 2).translate((L - 8) / 2, 0, 0), shaft));
  parts.push(paint(new THREE.ConeGeometry(4.6, 12, 4).rotateZ(-Math.PI / 2).translate(L - 4, 0, 0), PALETTE.arrowHead));
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.BoxGeometry(13, 5.5, 0.9).translate(8.5, 3.4, 0);
    // swept back like a feather
    const p = fin.getAttribute('position');
    for (let k = 0; k < p.count; k++) if (p.getY(k) > 3) p.setX(k, p.getX(k) - 3.5);
    parts.push(paint(fin.rotateX((i * Math.PI * 2) / 3 + 0.5), fletch));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

interface Shared {
  bow: THREE.BufferGeometry;
  arrowPlayer: THREE.BufferGeometry;
  arrowEnemy: THREE.BufferGeometry;
  string: THREE.BufferGeometry;
  stringMat: THREE.Material;
  bandMat: THREE.Material;
  arrowMat: THREE.Material;
  arrowMatCelestial: THREE.Material;
  identity: THREE.Matrix4[];
}
let shared: Shared | null = null;
function assets(): Shared {
  shared ??= {
    bow: bowGeometry(),
    arrowPlayer: arrowGeometry(PALETTE.shaftLight, PALETTE.fletch),
    arrowEnemy: arrowGeometry(0x9a6a40, 0xb48cff),
    string: new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).rotateZ(-Math.PI / 2).translate(0.5, 0, 0),
    stringMat: new THREE.MeshBasicMaterial({ color: PALETTE.string }),
    bandMat: new THREE.MeshLambertMaterial({ color: 0xc8463a, emissive: 0x3a1010 }),
    arrowMat: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2018 }),
    arrowMatCelestial: celestial(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2018 }), { value: 1 }, 1 / 5),
    identity: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()],
  };
  return shared;
}

/** The held models of the five new weapons (built on first use, shared by every archer). */
interface Held {
  crossbow: CrossbowParts;
  spear: THREE.BufferGeometry;
  boomerang: THREE.BufferGeometry;
  sling: SlingParts;
  tube: THREE.BufferGeometry;
  tubeLoad: THREE.BufferGeometry;
  bolt: THREE.BufferGeometry;
  pebble: THREE.BufferGeometry;
}
let held: Held | null = null;
function heldModels(): Held {
  held ??= {
    crossbow: crossbowGeometry(),
    spear: spearGeometry(),
    boomerang: boomerangGeometry(),
    sling: slingGeometry(),
    tube: tubeGeometry(),
    tubeLoad: tubeLoadGeometry(),
    bolt: boltGeometry(),
    pebble: pebbleGeometry(),
  };
  return held;
}

export interface GearInput {
  /** +1 / −1: the frame below is mirrored in x for −1 */
  facing: number;
  /** the archer's scale (px at scale 1 → px) */
  scale: number;
  /** bow hand, metres, in the archer's own (facing +x) frame */
  gx: number;
  gy: number;
  gz: number;
  /** direction of the bow arm in that frame */
  angle: number;
  /** 0 … 1 */
  draw: number;
  /** the string is held: it goes to (nx, ny) */
  nocked: boolean;
  nx: number;
  ny: number;
  /** loaded: the arrow (bolt, pebble, rocket nose; the spear or boomerang in the hand) shows */
  arrow: boolean;
  visible: boolean;
  /** what is held (enemies: always the bow) */
  weapon: WeaponId;
  /** seconds since the last shot (recoil, the sling's snap) */
  since: number;
  /** the celestial look */
  celestial: boolean;
}

const m1 = new THREE.Matrix4();
const m2 = new THREE.Matrix4();
const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const q = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);
const TIP_TOP = new THREE.Vector3(TIP_X, HALF - 1, 0);
const TIP_BOTTOM = new THREE.Vector3(TIP_X, -HALF + 1, 0);
/** the sling's pouch at rest, between the fork's tips and a little behind (bow frame px) */
const POUCH_REST = new THREE.Vector3(-5, 16, 0);

/** Recoil envelope after a shot: a sharp kick (≈35 ms) that settles over a quarter second. */
export function recoil(since: number): number {
  if (since < 0 || since > 0.5) return 0;
  return Math.sin(Math.min(1, since / 0.035) * (Math.PI / 2)) * Math.exp(-since * 13);
}

export class Gear {
  readonly group = new THREE.Group();
  readonly bow: THREE.SkinnedMesh;
  readonly tips: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly bones: THREE.Bone[] = [];
  private readonly skeleton: THREE.Skeleton;
  private readonly strings: THREE.Mesh[] = [];
  private readonly arrow: THREE.Mesh;
  private readonly bowMat: THREE.MeshPhongMaterial;
  /** this archer's celestial switch (bow and weapon materials) */
  private readonly cel = { value: 0 };
  /** a new weapon's model, its load (bolt, pebble, rocket nose) and the sling's pouch */
  private weaponMat: THREE.MeshPhongMaterial | null = null;
  private body: THREE.Mesh | null = null;
  private load: THREE.Mesh | null = null;
  private pouch: THREE.Mesh | null = null;

  constructor() {
    const s = assets();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Bone();
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
      this.bones.push(b);
      this.group.add(b);
    }
    this.skeleton = new THREE.Skeleton(this.bones, s.identity);
    this.bowMat = celestial(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 30, specular: 0x554433 }), this.cel, 1 / 5);
    this.bow = new THREE.SkinnedMesh(s.bow, this.bowMat);
    this.bow.bind(this.skeleton, s.identity[0]);
    this.bow.frustumCulled = false;
    this.bow.castShadow = true;
    this.group.add(this.bow);
    for (let i = 0; i < 2; i++) {
      const line = new THREE.Mesh(s.string, s.stringMat);
      line.matrixAutoUpdate = false;
      line.frustumCulled = false;
      this.strings.push(line);
      this.group.add(line);
    }
    this.arrow = new THREE.Mesh(s.arrowPlayer, s.arrowMat);
    this.arrow.matrixAutoUpdate = false;
    this.arrow.frustumCulled = false;
    this.arrow.castShadow = true;
    this.group.add(this.arrow);
  }

  style(bowColor: number, player: boolean): void {
    const s = assets();
    this.bowMat.color.setHex(bowColor);
    this.bowMat.emissive.setHex(bowColor).multiplyScalar(0.18);
    this.arrow.geometry = player ? s.arrowPlayer : s.arrowEnemy;
  }

  dispose(): void {
    this.skeleton.dispose();
    this.bowMat.dispose();
    this.weaponMat?.dispose();
  }

  private part(): THREE.Mesh {
    this.weaponMat ??= celestial(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: 0x444444, emissive: 0x1c140e }), this.cel, 1 / 5);
    const mesh = new THREE.Mesh(undefined, this.weaponMat);
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  update(g: GearInput): void {
    this.group.visible = g.visible;
    if (!g.visible) return;
    const s = assets();
    this.cel.value = g.celestial ? 1 : 0;
    this.arrow.material = g.celestial ? s.arrowMatCelestial : s.arrowMat;
    const k = g.scale / PX_PER_M;
    const f = g.facing >= 0 ? 1 : -1;
    // bow frame → world (mirrored for facing −1)
    const base = this.bones[0]!.matrixWorld;
    base.makeRotationZ(g.angle).scale(v.set(k, k, k)).setPosition(g.gx, g.gy, g.gz);
    if (f < 0) flipX(base);
    this.bow.scale.x = f; // tells the renderer the winding is flipped
    const bend = 0.27 * Math.min(1, Math.max(0, g.draw));
    for (let i = 1; i <= 2; i++) {
      const sign = i === 1 ? 1 : -1;
      const py = sign * PIVOT;
      m1.makeTranslation(3, py, 0).multiply(m2.makeRotationZ(sign * bend)).multiply(m2.makeTranslation(-3, -py, 0));
      this.bones[i]!.matrixWorld.multiplyMatrices(base, m1);
    }
    this.tips[0].copy(TIP_TOP).applyMatrix4(this.bones[1]!.matrixWorld);
    this.tips[1].copy(TIP_BOTTOM).applyMatrix4(this.bones[2]!.matrixWorld);

    const bow = g.weapon === 'bow';
    this.bow.visible = bow;
    for (const line of this.strings) {
      line.visible = true;
      line.material = g.weapon === 'sling' ? s.bandMat : s.stringMat;
    }
    if (!bow) {
      this.arrow.visible = false;
      this.weapon(g, base, k, f);
      return;
    }
    if (this.body) this.body.visible = false;
    if (this.load) this.load.visible = false;
    if (this.pouch) this.pouch.visible = false;

    // the string meets at the fingers, or rests straight between the tips
    let nx: number;
    let ny: number;
    const nz = this.tips[0].z;
    if (g.nocked) {
      nx = f * g.nx;
      ny = g.ny;
    } else {
      nx = (this.tips[0].x + this.tips[1].x) / 2;
      ny = (this.tips[0].y + this.tips[1].y) / 2;
    }
    const thick = k * 0.85;
    for (let i = 0; i < 2; i++) {
      const tip = this.tips[i]!;
      const dx = nx - tip.x;
      const dy = ny - tip.y;
      this.strings[i]!.matrix.makeRotationZ(Math.atan2(dy, dx)).scale(v.set(Math.hypot(dx, dy), thick, thick)).setPosition(tip.x, tip.y, nz);
    }
    this.arrow.visible = g.arrow;
    if (g.arrow) {
      // along the bow's own direction, from the string (world frame, so un-mirror the angle)
      const a = f < 0 ? Math.PI - g.angle : g.angle;
      // beside the grip, on the camera's side, not through the fist
      this.arrow.matrix.makeRotationZ(a).scale(v.set(k, k, k)).setPosition(nx, ny, nz + k * 4);
    }
  }

  /** The five new weapons: the model in the bow hand (thrown ones in the string hand). */
  private weapon(g: GearInput, base: THREE.Matrix4, k: number, f: number): void {
    const h = heldModels();
    this.body ??= this.part();
    this.load ??= this.part();
    const body = this.body;
    const load = this.load;
    body.visible = true;
    load.visible = false;
    if (this.pouch) this.pouch.visible = false;
    const r = recoil(g.since);
    // the frame the model sits in
    const F = body.matrix;
    if (g.weapon === 'crossbow' || g.weapon === 'firework' || g.weapon === 'sling') {
      // the bow hand's, kicked back and muzzle-up by the recoil
      const kickRot = g.weapon === 'crossbow' ? 0.24 : g.weapon === 'firework' ? 0.34 : 0;
      const kickBack = g.weapon === 'crossbow' ? 7 : g.weapon === 'firework' ? 10 : 0;
      F.copy(base).multiply(m1.makeRotationZ(kickRot * r)).multiply(m2.makeTranslation(-kickBack * r, 0, 0));
    } else {
      // thrown weapons ride the string hand, along the aim, a little toward the camera
      // (the boomerang cocked up over the shoulder, a touch smaller than in flight)
      const boom = g.weapon === 'boomerang';
      const kk = boom ? k * 0.82 : k;
      F.makeRotationZ(g.angle + (boom ? 2.75 : -0.1))
        .scale(v.set(kk, kk, kk))
        .setPosition(g.nx, g.ny, g.gz + k * 12);
      if (f < 0) flipX(F);
      // the spear's grip, the boomerang's near arm in the fist
      F.multiply(boom ? m1.makeTranslation(22, 22, 0) : m1.makeTranslation(66, 0, 0));
    }
    const strings = this.strings;
    switch (g.weapon) {
      case 'crossbow': {
        body.geometry = h.crossbow.body;
        // spanned back to the nut while loaded; slack straight across the prod once loosed
        const t0 = v.copy(h.crossbow.tips[0]).applyMatrix4(F);
        const t1 = v2.copy(h.crossbow.tips[1]).applyMatrix4(F);
        if (g.arrow) v3.copy(h.crossbow.nut).applyMatrix4(F);
        else v3.copy(t0).add(t1).multiplyScalar(0.5);
        segment(strings[0]!, t0, v3, k * 0.9);
        segment(strings[1]!, t1, v3, k * 0.9);
        if (g.arrow) {
          load.visible = true;
          load.geometry = h.bolt;
          load.matrix.copy(F).multiply(m1.makeTranslation(16, 9.5, 0));
        }
        break;
      }
      case 'firework': {
        body.geometry = h.tube;
        for (const line of strings) line.visible = false;
        if (g.arrow) {
          load.visible = true;
          load.geometry = h.tubeLoad;
          load.matrix.copy(F);
        }
        break;
      }
      case 'sling': {
        body.geometry = h.sling.body;
        this.pouch ??= this.part();
        const pouch = this.pouch;
        pouch.visible = true;
        pouch.geometry = h.sling.pouch;
        const t0 = v.copy(h.sling.tips[0]).applyMatrix4(F);
        const t1 = v2.copy(h.sling.tips[1]).applyMatrix4(F);
        if (g.nocked) v3.set(f * g.nx, g.ny, (t0.z + t1.z) / 2);
        else {
          // let go: the pouch snaps through the fork and wobbles back to rest
          const snap = g.since >= 0 && g.since < 0.45 ? Math.cos(g.since * 34) * Math.exp(-g.since * 10) : 0;
          v3.copy(POUCH_REST).setX(POUCH_REST.x + 16 * snap).applyMatrix4(F);
        }
        segment(strings[0]!, t0, v3, k * 1.6);
        segment(strings[1]!, t1, v3, k * 1.6);
        pouch.matrix.makeRotationZ(f < 0 ? Math.PI - g.angle : g.angle).scale(v.set(k, k, k)).setPosition(v3.x, v3.y, v3.z);
        if (g.arrow) {
          load.visible = true;
          load.geometry = h.pebble;
          load.matrix.copy(pouch.matrix).multiply(m1.makeTranslation(2, 0, 3));
        }
        break;
      }
      case 'spear':
      case 'boomerang':
        for (const line of strings) line.visible = false;
        body.geometry = g.weapon === 'spear' ? h.spear : h.boomerang;
        // in the hand only while one is ready
        body.visible = g.arrow;
        break;
      default:
        break;
    }
  }
}

/** A string mesh (a unit cylinder along +x) stretched from a to b, `thick` across. */
function segment(line: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thick: number): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  if (len < 1e-6) {
    line.visible = false;
    return;
  }
  line.visible = true;
  q.setFromUnitVectors(AX, d.divideScalar(len));
  line.matrix.compose(a, q, d.set(len, thick, thick));
}

function flipX(w: THREE.Matrix4): void {
  const e = w.elements;
  e[0] = -e[0];
  e[4] = -e[4];
  e[8] = -e[8];
  e[12] = -e[12];
}
