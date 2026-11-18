/**
 * What the archer holds: a chunky recurve bow that bends as the string is drawn, the string and
 * the nocked arrow. The Mixamo bow and arrow are true to life, which at phone size means a hair:
 * these are modelled at the 2D game's proportions instead (bow 80 px tall, 7 px limbs).
 *
 * Authored in simulation px at scale 1, in the bow's own frame: +x is where the arrow leaves,
 * +y runs up the limbs, the hand holds the origin.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '@okcu/textures';
import { PX_PER_M } from '../../coords';

const HALF = 40; // limb tip height above the hand
const PIVOT = 7; // where a limb starts to bend
const TIP_X = -10;
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
  arrowMat: THREE.Material;
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
    arrowMat: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2018 }),
    identity: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()],
  };
  return shared;
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
  arrow: boolean;
  visible: boolean;
}

const m1 = new THREE.Matrix4();
const m2 = new THREE.Matrix4();
const v = new THREE.Vector3();
const TIP_TOP = new THREE.Vector3(TIP_X, HALF - 1, 0);
const TIP_BOTTOM = new THREE.Vector3(TIP_X, -HALF + 1, 0);

export class Gear {
  readonly group = new THREE.Group();
  readonly bow: THREE.SkinnedMesh;
  readonly tips: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly bones: THREE.Bone[] = [];
  private readonly skeleton: THREE.Skeleton;
  private readonly strings: THREE.Mesh[] = [];
  private readonly arrow: THREE.Mesh;
  private readonly bowMat: THREE.MeshPhongMaterial;

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
    this.bowMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 30, specular: 0x554433 });
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
  }

  update(g: GearInput): void {
    this.group.visible = g.visible;
    if (!g.visible) return;
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
}

function flipX(w: THREE.Matrix4): void {
  const e = w.elements;
  e[0] = -e[0];
  e[4] = -e[4];
  e[8] = -e[8];
  e[12] = -e[12];
}
