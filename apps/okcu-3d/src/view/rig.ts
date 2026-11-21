/**
 * The Mixamo archer as a puppet of the simulation's ragdoll.
 *
 * Everything the simulation does lies in the view plane, so the character is posed without any
 * joint solver: a reference pose is sampled once from the "aim" clip (character turned sideways,
 * chest to the camera, bow arm along +x) and every frame each limb SEGMENT gets one affine map
 * that carries its reference joints onto the ragdoll points: a rotation about the view axis, a
 * stretch along the limb so the segment spans exactly point to point (the noodle archer's
 * proportions differ from the rig's) and a thickness. A bone's world matrix is simply
 * `segmentMap × referenceWorldMatrix`, so the clip's roll, finger curls, shoulder and hip depth
 * all survive, joints stay welded (neighbouring maps agree at the shared joint) and a hit, a
 * tumble or a heap look exactly like the physics: nothing is keyframed on top.
 *
 * The bones are a flat list whose world matrices are written directly (no hierarchy, no mixer).
 * An archer facing −1 is the same pose mirrored in x, so the bow arm is always the F side.
 */
import * as THREE from 'three';
import { PT } from '@sim/ragdoll';
import type { Assets } from '../assets';
import { PX_PER_M, sx, sy } from '../coords';
import { bodyMaterial, newBodyUniforms, type BodyUniforms } from './archers/looks';

/** Tunables. Lengths in "px at scale 1 per rig centimetre" unless noted. */
export const RIG = {
  /** size of the unstretched rig: sim px (at scale 1) per rig cm; sets how chunky everything is */
  unit: 0.78,
  thickTorso: 1.15,
  thickNeck: 1.3,
  thickArm: 1.25,
  thickLeg: 1.15,
  head: 2.2,
  hand: 1.15,
  foot: 1.15,
  /** how far the chest is turned from "square to the camera" toward the aim, radians */
  chestTwist: 0.85,
  hipTwist: 0.2,
  /** the head turns back toward the camera by this much (it looks along the aim in the clip) */
  headTurn: 0.5,
  /**
   * The bow, both hands and the arrow live in the gameplay plane z = 0; the neck stands this far
   * (rig cm) behind it, so the string is drawn in front of the chest, not into it.
   */
  bowPlane: 12,
  /** how far the string arm's elbow is swung from "at the camera" to "straight back", radians */
  elbowBack: 0.75,
};

const SEG = {
  torso: 0,
  neck: 1,
  head: 2,
  armF: 3,
  foreF: 4,
  handF: 5,
  armB: 6,
  foreB: 7,
  handB: 8,
  thighF: 9,
  shinF: 10,
  footF: 11,
  thighB: 12,
  shinB: 13,
  footB: 14,
  count: 15,
} as const;

/** Which bone an accessory rides on (see `ArcherRig.bone`). */
export type BoneName =
  | 'Hips'
  | 'Spine'
  | 'Spine1'
  | 'Spine2'
  | 'Neck'
  | 'Head'
  | 'LeftShoulder'
  | 'LeftArm'
  | 'LeftForeArm'
  | 'LeftHand'
  | 'RightShoulder'
  | 'RightArm'
  | 'RightForeArm'
  | 'RightHand'
  | 'LeftUpLeg'
  | 'LeftLeg'
  | 'LeftFoot'
  | 'RightUpLeg'
  | 'RightLeg'
  | 'RightFoot';

const PREFIX = 'mixamorig';

function segOf(name: string): number {
  if (name === 'Neck') return SEG.neck;
  if (name === 'Head' || name === 'HeadTop_End' || name.endsWith('Eye')) return SEG.head;
  if (name === 'LeftArm') return SEG.armF;
  if (name === 'LeftForeArm') return SEG.foreF;
  if (name.startsWith('LeftHand')) return SEG.handF;
  if (name === 'RightArm') return SEG.armB;
  if (name === 'RightForeArm') return SEG.foreB;
  if (name.startsWith('RightHand')) return SEG.handB;
  if (name === 'LeftUpLeg') return SEG.thighF;
  if (name === 'LeftLeg') return SEG.shinF;
  if (name.startsWith('LeftFoot') || name.startsWith('LeftToe')) return SEG.footF;
  if (name === 'RightUpLeg') return SEG.thighB;
  if (name === 'RightLeg') return SEG.shinB;
  if (name.startsWith('RightFoot') || name.startsWith('RightToe')) return SEG.footB;
  return SEG.torso; // Hips, Spine*, shoulders (clavicles)
}

interface MeshTemplate {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  bindMatrix: THREE.Matrix4;
  skel: number;
  /** the outfit takes the type's dye; skin and eyes do not */
  cloth: boolean;
}

interface SkelDef {
  order: number[];
  inverses: THREE.Matrix4[];
}

/** Reference joints, in the reference frame (cm, x = aim, y = up, z = toward the camera). */
interface RefPoints {
  pelvis: THREE.Vector3;
  neck: THREE.Vector3;
  /** where the neck bone ends / where the head bone sits (they are turned by different amounts) */
  neckEnd: THREE.Vector3;
  headBone: THREE.Vector3;
  headCentre: THREE.Vector3;
  /** shoulder and hip joints as the twisted torso carries them (the limb maps use the plain ones) */
  armFT: THREE.Vector3;
  armBT: THREE.Vector3;
  hipFT: THREE.Vector3;
  hipBT: THREE.Vector3;
  armF: THREE.Vector3;
  elbowF: THREE.Vector3;
  wristF: THREE.Vector3;
  grip: THREE.Vector3;
  armB: THREE.Vector3;
  elbowB: THREE.Vector3;
  /** the string arm's elbow as its (re-aimed) upper arm bone sees it */
  elbowBU: THREE.Vector3;
  wristB: THREE.Vector3;
  /** what of the string hand sits on the hand point, and where its fingers hold the string */
  palm: THREE.Vector3;
  pinch: THREE.Vector3;
  hipF: THREE.Vector3;
  kneeF: THREE.Vector3;
  ankleF: THREE.Vector3;
  soleF: THREE.Vector3;
  hipB: THREE.Vector3;
  kneeB: THREE.Vector3;
  ankleB: THREE.Vector3;
  soleB: THREE.Vector3;
  /** angle of the Mixamo bow's limb axis (bottom → top) in the view plane: how the fist is turned */
  bowAxis: number;
}

export interface RigKit {
  names: string[];
  index: Map<string, number>;
  seg: Int8Array;
  /** reference world matrix per bone, torso twist and head turn already applied */
  pre: THREE.Matrix4[];
  p: RefPoints;
  meshes: MeshTemplate[];
  skels: SkelDef[];
  /** T-pose world → bone space, per bone: accessories are authored around the T-pose */
  bindInv: THREE.Matrix4[];
}

const tmpV = new THREE.Vector3();

function about(point: THREE.Vector3, axis: THREE.Vector3, angle: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeTranslation(point.x, point.y, point.z);
  m.multiply(new THREE.Matrix4().makeRotationAxis(axis, angle));
  m.multiply(new THREE.Matrix4().makeTranslation(-point.x, -point.y, -point.z));
  return m;
}

/**
 * Which cloth takes the type's colour: 1 on the torso, hood and sleeves, 0 on what is skinned to
 * the shins, feet, forearms and hands (trousers below the knee, boots, bracers, gloves).
 */
function dyeMask(mesh: THREE.SkinnedMesh): THREE.BufferAttribute {
  const leather = mesh.skeleton.bones.map((b) => (/(Leg|Foot|Toe|ForeArm|Hand)/.test(b.name) && !/UpLeg/.test(b.name) ? 1 : /UpLeg/.test(b.name) ? 0.75 : 0));
  const si = mesh.geometry.getAttribute('skinIndex');
  const sw = mesh.geometry.getAttribute('skinWeight');
  const out = new Float32Array(si.count);
  for (let i = 0; i < si.count; i++) {
    let l = 0;
    for (let k = 0; k < 4; k++) l += sw.getComponent(i, k) * leather[si.getComponent(i, k)]!;
    out[i] = 1 - Math.min(1, l);
  }
  return new THREE.BufferAttribute(out, 1);
}

/** Sample the reference pose and collect what every archer shares. */
export function createRigKit(assets: Assets): RigKit {
  const root = assets.archer;
  // FBXLoader nests one copy of every bone per skinned mesh; the outermost carries the transform
  const first = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && !first.has(o.name)) first.set(o.name, o as THREE.Bone);
  });
  // the aim clip's first key is the pose: bow up, string hand at the chin
  for (const track of assets.clips.aim.tracks) {
    const dot = track.name.lastIndexOf('.');
    const bone = first.get(track.name.slice(0, dot));
    if (!bone) continue;
    const prop = track.name.slice(dot + 1);
    if (prop === 'quaternion') bone.quaternion.fromArray(track.values, 0);
    else if (prop === 'position') bone.position.fromArray(track.values, 0);
  }
  root.updateMatrixWorld(true);

  const names: string[] = [];
  const index = new Map<string, number>();
  const ref: THREE.Matrix4[] = [];
  const yaw = new THREE.Matrix4().makeRotationY(Math.PI / 2); // she aims along +z in the clip
  for (const [full, bone] of first) {
    const name = full.startsWith(PREFIX) ? full.slice(PREFIX.length) : full;
    index.set(name, names.length);
    names.push(name);
    ref.push(new THREE.Matrix4().multiplyMatrices(yaw, bone.matrixWorld));
  }
  const seg = new Int8Array(names.length);
  names.forEach((n, i) => (seg[i] = segOf(n)));
  const at = (name: string): THREE.Vector3 => {
    const i = index.get(name);
    if (i === undefined) throw new Error(`rig: bone ${name} is missing`);
    return new THREE.Vector3().setFromMatrixPosition(ref[i]!);
  };

  // --- meshes, their skeleton layouts and the bow / arrow landmarks
  const meshes: MeshTemplate[] = [];
  const skels: SkelDef[] = [];
  let bowMesh: THREE.SkinnedMesh | null = null;
  let bowSkel = 0;
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    const order = mesh.skeleton.bones.map((b) => {
      const i = index.get(b.name.startsWith(PREFIX) ? b.name.slice(PREFIX.length) : b.name);
      if (i === undefined) throw new Error(`rig: unknown bone ${b.name}`);
      return i;
    });
    const inverses = mesh.skeleton.boneInverses;
    let skel = skels.findIndex((s) => s.order.length === order.length && s.order.every((v, i) => v === order[i]) && s.inverses.every((m, i) => m.elements.every((e, k) => Math.abs(e - inverses[i]!.elements[k]!) < 1e-4)));
    if (skel < 0) {
      skel = skels.length;
      skels.push({ order, inverses: inverses.map((m) => m.clone()) });
    }
    if (material.name === 'Bow_MAT') {
      bowMesh = mesh;
      bowSkel = skel;
    }
    // the model's own bow and arrow are a hair wide at phone size (gear.ts models chunky ones);
    // the eyelash cards are not worth a transparent draw call
    if (material.name === 'Bow_MAT' || material.name === 'Arrow_MAT' || material.name === 'phong1') return;
    const cloth = material.name === 'Akai_MAT1';
    if (cloth) mesh.geometry.setAttribute('aDye', dyeMask(mesh));
    meshes.push({ geometry: mesh.geometry, material, bindMatrix: mesh.bindMatrix.clone(), skel, cloth });
  });
  if (!bowMesh) throw new Error('rig: bow mesh not found');
  const bow: THREE.SkinnedMesh = bowMesh;

  // the Mixamo bow's limb axis tells how the bow hand is turned in the clip
  const iBow = index.get('Left_arch1')!;
  const bowDef = skels[bowSkel]!;
  const slotBow = bowDef.order.indexOf(iBow);
  const toRef = new THREE.Matrix4().multiplyMatrices(ref[iBow]!, bowDef.inverses[slotBow]!).multiply(bow.bindMatrix);
  const pos = bow.geometry.getAttribute('position');
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
  const lo = new THREE.Vector3();
  const hi = new THREE.Vector3();
  let loV = Infinity;
  let hiV = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    tmpV.fromBufferAttribute(pos, i);
    const v = tmpV[axis];
    if (v < loV) {
      loV = v;
      lo.copy(tmpV);
    }
    if (v > hiV) {
      hiV = v;
      hi.copy(tmpV);
    }
  }
  lo.applyMatrix4(toRef);
  hi.applyMatrix4(toRef);
  const tipTop = lo.y > hi.y ? lo : hi;
  const tipBottom = lo.y > hi.y ? hi : lo;

  const hipF = at('LeftUpLeg');
  const hipB = at('RightUpLeg');
  const headBone = at('Head');
  const headTop = at('HeadTop_End');
  const eyes = at('LeftEye').add(at('RightEye')).multiplyScalar(0.5);
  const sole = (ankle: THREE.Vector3, toe: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(ankle.x + (toe.x - ankle.x) * 0.35, 0, ankle.z + (toe.z - ankle.z) * 0.35);
  const p: RefPoints = {
    pelvis: hipF.clone().add(hipB).multiplyScalar(0.5),
    neck: at('Neck'),
    neckEnd: headBone.clone(),
    headBone,
    armFT: at('LeftArm'),
    armBT: at('RightArm'),
    hipFT: hipF.clone(),
    hipBT: hipB.clone(),
    // the middle of the skull: halfway up, a little toward the face
    headCentre: headBone.clone().lerp(headTop, 0.5).lerp(eyes, 0.25),
    armF: at('LeftArm'),
    elbowF: at('LeftForeArm'),
    wristF: at('LeftHand'),
    grip: at('Left_arch1'),
    armB: at('RightArm'),
    elbowB: at('RightForeArm'),
    elbowBU: at('RightForeArm'),
    wristB: at('RightHand'),
    palm: at('RightHand').lerp(at('RightHandIndex1').lerp(at('RightHandMiddle1'), 0.5), 0.55),
    pinch: at('RightHandIndex2').lerp(at('RightHandMiddle2'), 0.5),
    hipF,
    kneeF: at('LeftLeg'),
    ankleF: at('LeftFoot'),
    soleF: sole(at('LeftFoot'), at('LeftToeBase')),
    hipB,
    kneeB: at('RightLeg'),
    ankleB: at('RightFoot'),
    soleB: sole(at('RightFoot'), at('RightToeBase')),
    bowAxis: Math.atan2(tipTop.y - tipBottom.y, tipTop.x - tipBottom.x),
  };

  // --- twist the torso toward the aim (three-quarter view) and turn the head to the camera
  const spineAxis = p.neck.clone().sub(p.pelvis).normalize();
  const twist = (k: number) => about(p.pelvis, spineAxis, RIG.hipTwist + (RIG.chestTwist - RIG.hipTwist) * k);
  const twists: Record<string, THREE.Matrix4> = {
    Hips: twist(0),
    Spine: twist(0.35),
    Spine1: twist(0.7),
    Spine2: twist(1),
    LeftShoulder: twist(1),
    RightShoulder: twist(1),
  };
  // in the clip the string elbow points at the camera; the ragdoll's points back along the arrow,
  // so the upper arm is re-aimed about the shoulder to lie nearer the view plane
  twists.RightArm = about(p.armB, new THREE.Vector3(0, 1, 0), -RIG.elbowBack);
  p.elbowBU.applyMatrix4(twists.RightArm);
  const up = new THREE.Vector3(0, 1, 0);
  const headTurn = about(p.headCentre, up, -RIG.headTurn);
  const neckTurn = about(p.neck, up, -RIG.headTurn * 0.5);
  const pre = ref.map((m, i) => {
    const name = names[i]!;
    const t = seg[i] === SEG.head ? headTurn : seg[i] === SEG.neck ? neckTurn : twists[name];
    return t ? new THREE.Matrix4().multiplyMatrices(t, m) : m.clone();
  });
  // joints that hang off the twisted torso move with it
  p.armFT.applyMatrix4(twists.LeftShoulder!);
  p.armBT.applyMatrix4(twists.RightShoulder!);
  p.hipFT.applyMatrix4(twists.Hips!);
  p.hipBT.applyMatrix4(twists.Hips!);
  p.neckEnd.applyMatrix4(neckTurn);
  p.headBone.applyMatrix4(headTurn);
  const bindInv = names.map((_, i) => skels[0]!.inverses[skels[0]!.order.indexOf(i)]!);
  return { names, index, seg, pre, p, meshes, skels, bindInv };
}

export interface PoseInput {
  /** the 11 ragdoll points to draw, simulation px (the animation layer's "view" points) */
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  facing: number;
  scale: number;
  /** 1 = soles flat on the ledge, 0 = feet follow the shins (limp, airborne) */
  flat: number;
  /** the simulation's aim angle and how much the bow obeys it (0 = it follows the forearm) */
  aim: number;
  aimed: number;
}

/** One archer's skinned meshes and flat bone list. */
export class ArcherRig {
  readonly group = new THREE.Group();
  readonly bones: THREE.Bone[];
  readonly meshes: THREE.SkinnedMesh[] = [];
  readonly uniforms: BodyUniforms = newBodyUniforms();
  /** results of the last `pose`, in the archer's own frame (metres, x mirrored so it faces +x) */
  readonly hand = { x: 0, y: 0, z: 0, angle: 0 };
  /** where the string hand's fingers are (the string and the arrow's nock go here) */
  readonly pinch = { x: 0, y: 0 };
  /** metres per rig centimetre in the last pose */
  unit = 0.01;
  private readonly skeletons: THREE.Skeleton[];
  private readonly materials: THREE.Material[] = [];
  private readonly m: THREE.Matrix4[] = [];

  constructor(private readonly kit: RigKit) {
    this.bones = kit.names.map((name) => {
      const b = new THREE.Bone();
      b.name = name;
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
      return b;
    });
    for (const b of this.bones) this.group.add(b);
    this.skeletons = kit.skels.map((d) => new THREE.Skeleton(d.order.map((i) => this.bones[i]!), d.inverses));
    for (const t of kit.meshes) {
      const material = bodyMaterial(t.material, this.uniforms, t.cloth);
      this.materials.push(material);
      const mesh = new THREE.SkinnedMesh(t.geometry, material);
      mesh.bind(this.skeletons[t.skel]!, t.bindMatrix);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    for (let i = 0; i < SEG.count; i++) this.m.push(new THREE.Matrix4());
  }

  /**
   * Hang an accessory on a bone. It is authored around the T-pose in the model's own space
   * (cm, x = the character's left, y = up, z = forward), exactly where it should sit on the
   * unposed character, and from then on moves and stretches with that bone like skin does.
   */
  attach(bone: BoneName, obj: THREE.Object3D): void {
    const i = this.kit.index.get(bone)!;
    obj.updateMatrix();
    obj.matrix.premultiply(this.kit.bindInv[i]!);
    obj.matrixAutoUpdate = false;
    this.bones[i]!.add(obj);
  }

  dispose(): void {
    for (const s of this.skeletons) s.dispose();
    for (const m of this.materials) m.dispose();
  }

  /** Put every bone where the ragdoll says. */
  pose(inp: PoseInput): void {
    const { kit, m } = this;
    const p = kit.p;
    const f = inp.facing >= 0 ? 1 : -1;
    const unit = (RIG.unit * inp.scale) / PX_PER_M; // metres per rig cm
    this.unit = unit;
    // points in the archer's own frame: metres, x mirrored so it always faces +x
    const X = (i: number): number => f * sx(inp.x[i]!);
    const Y = (i: number): number => sy(inp.y[i]!);

    // --- torso: pelvis → neck
    const tT = unit * RIG.thickTorso;
    const neckZ = -unit * RIG.bowPlane;
    two(m[SEG.torso]!, p.pelvis, p.neck, X(PT.pelvis), Y(PT.pelvis), neckZ - tT * (p.neck.z - p.pelvis.z), X(PT.neck), Y(PT.neck), neckZ, tT, tT);
    const torso = m[SEG.torso]!;

    // --- head (rigid, scaled, centred on the head point) and the neck up to it
    const hs = unit * RIG.head;
    const headTilt = Math.atan2(Y(PT.head) - Y(PT.neck), X(PT.head) - X(PT.neck)) - Math.atan2(p.headCentre.y - p.neck.y, p.headCentre.x - p.neck.x);
    rigid(m[SEG.head]!, p.headCentre, X(PT.head), Y(PT.head), neckZ + unit * RIG.thickNeck * (p.headCentre.z - p.neck.z), headTilt, hs);
    tmpV.copy(p.headBone).applyMatrix4(m[SEG.head]!);
    two(m[SEG.neck]!, p.neck, p.neckEnd, X(PT.neck), Y(PT.neck), neckZ, tmpV.x, tmpV.y, tmpV.z, unit * RIG.thickNeck, unit * RIG.thickNeck);

    // --- string arm: the palm sits on the hand point, in the bow's plane
    const tA = unit * RIG.thickArm;
    const hand = unit * RIG.hand;
    tmpV.copy(p.armFT).applyMatrix4(torso);
    const sFx = tmpV.x;
    const sFy = tmpV.y;
    const sFz = tmpV.z;
    // the bow arm reaches from the far shoulder into the bow's plane
    const gripZ = 0;
    const eFz = sFz * 0.45;
    tmpV.copy(p.armBT).applyMatrix4(torso);
    const sBx = tmpV.x;
    const sBy = tmpV.y;
    const sBz = tmpV.z;
    const eBz = sBz + tA * (p.elbowBU.z - p.armB.z);
    two(m[SEG.armB]!, p.armB, p.elbowBU, sBx, sBy, sBz, X(PT.elbowB), Y(PT.elbowB), eBz, tA, tA);
    const foreB = Math.atan2(Y(PT.handB) - Y(PT.elbowB), X(PT.handB) - X(PT.elbowB));
    rigid(m[SEG.handB]!, p.palm, X(PT.handB), Y(PT.handB), gripZ + unit * 2, foreB - Math.atan2(p.palm.y - p.elbowB.y, p.palm.x - p.elbowB.x), hand);
    tmpV.copy(p.wristB).applyMatrix4(m[SEG.handB]!);
    two(m[SEG.foreB]!, p.elbowB, p.wristB, X(PT.elbowB), Y(PT.elbowB), eBz, tmpV.x, tmpV.y, tmpV.z, tA, tA);
    tmpV.copy(p.pinch).applyMatrix4(m[SEG.handB]!);
    this.pinch.x = tmpV.x;
    this.pinch.y = tmpV.y;

    // --- bow arm: shoulder (on the torso) → elbow → wrist. The fist (and so the bow) is square
    // to the forearm, flopping with it; while the string is drawn it squares up to the true aim
    two(m[SEG.armF]!, p.armF, p.elbowF, sFx, sFy, sFz, X(PT.elbowF), Y(PT.elbowF), eFz, tA, tA);
    const foreF = Math.atan2(Y(PT.handF) - Y(PT.elbowF), X(PT.handF) - X(PT.elbowF));
    const aim = Math.atan2(-Math.sin(inp.aim), f * Math.cos(inp.aim));
    const bowAngle = foreF + wrap(aim - foreF) * inp.aimed;
    rigid(m[SEG.handF]!, p.grip, X(PT.handF), Y(PT.handF), gripZ, bowAngle + Math.PI / 2 - p.bowAxis, hand);
    tmpV.copy(p.wristF).applyMatrix4(m[SEG.handF]!);
    two(m[SEG.foreF]!, p.elbowF, p.wristF, X(PT.elbowF), Y(PT.elbowF), eFz, tmpV.x, tmpV.y, tmpV.z, tA, tA);
    this.hand.x = X(PT.handF);
    this.hand.y = Y(PT.handF);
    this.hand.z = gripZ;
    this.hand.angle = bowAngle;

    // --- legs: hip (on the torso) → knee → ankle; the foot is rigid on the foot point
    const tL = unit * RIG.thickLeg;
    this.leg(SEG.thighF, p.hipFT, p.hipF, p.kneeF, p.ankleF, p.soleF, X(PT.kneeF), Y(PT.kneeF), X(PT.footF), Y(PT.footF), tL, inp.flat, unit);
    this.leg(SEG.thighB, p.hipBT, p.hipB, p.kneeB, p.ankleB, p.soleB, X(PT.kneeB), Y(PT.kneeB), X(PT.footB), Y(PT.footB), tL, inp.flat, unit);

    // --- bones: segment map × reference matrix, mirrored for facing −1
    const seg = kit.seg;
    const pre = kit.pre;
    for (let i = 0; i < this.bones.length; i++) {
      const w = this.bones[i]!.matrixWorld;
      w.multiplyMatrices(m[seg[i]!]!, pre[i]!);
      if (f < 0) mirror(w);
    }
    this.group.scale.x = f; // tells the renderer the winding is flipped
  }

  private leg(thigh: number, hipT: THREE.Vector3, hip: THREE.Vector3, knee: THREE.Vector3, ankle: THREE.Vector3, sole: THREE.Vector3, kx: number, ky: number, fx: number, fy: number, tL: number, flat: number, unit: number): void {
    const m = this.m;
    tmpV.copy(hipT).applyMatrix4(m[SEG.torso]!);
    const hx = tmpV.x;
    const hy = tmpV.y;
    const hz = tmpV.z;
    const kz = hz + tL * (knee.z - hip.z);
    two(m[thigh]!, hip, knee, hx, hy, hz, kx, ky, kz, tL, tL);
    const limp = Math.atan2(fy - ky, fx - kx) - Math.atan2(sole.y - knee.y, sole.x - knee.x);
    rigid(m[thigh + 2]!, sole, fx, fy, kz + tL * (sole.z - knee.z), wrap(limp) * (1 - flat), unit * RIG.foot);
    tmpV.copy(ankle).applyMatrix4(m[thigh + 2]!);
    two(m[thigh + 1]!, knee, ankle, kx, ky, kz, tmpV.x, tmpV.y, tmpV.z, tL, tL);
  }
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function mirror(w: THREE.Matrix4): void {
  const e = w.elements;
  e[0] = -e[0];
  e[4] = -e[4];
  e[8] = -e[8];
  e[12] = -e[12];
}

/**
 * The map of a two-joint segment: reference joints a → b land exactly on A → B. In the view
 * plane it rotates and stretches along the bone; `t` is the thickness across it, `tz` in depth.
 */
function two(out: THREE.Matrix4, a: THREE.Vector3, b: THREE.Vector3, Ax: number, Ay: number, Az: number, Bx: number, By: number, Bz: number, t: number, tz: number): void {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const lr = Math.hypot(rx, ry) || 1e-6;
  const c0 = rx / lr;
  const s0 = ry / lr;
  const nx = Bx - Ax;
  const ny = By - Ay;
  const ln = Math.hypot(nx, ny);
  // a collapsed segment keeps its last sensible direction: straight on from the reference
  const c1 = ln > 1e-6 ? nx / ln : c0;
  const s1 = ln > 1e-6 ? ny / ln : s0;
  const k = Math.max(ln, 1e-4) / lr;
  const m00 = c1 * k * c0 + s1 * t * s0;
  const m01 = c1 * k * s0 - s1 * t * c0;
  const m10 = s1 * k * c0 - c1 * t * s0;
  const m11 = s1 * k * s0 + c1 * t * c0;
  // shear in depth so B's z is met exactly
  const sh = (Bz - Az - tz * (b.z - a.z)) / lr;
  const m20 = sh * c0;
  const m21 = sh * s0;
  out.set(
    m00, m01, 0, Ax - (m00 * a.x + m01 * a.y),
    m10, m11, 0, Ay - (m10 * a.x + m11 * a.y),
    m20, m21, tz, Az - (m20 * a.x + m21 * a.y + tz * a.z),
    0, 0, 0, 1,
  );
}

/** A rigid, uniformly scaled part: reference point `p` lands on P, turned by `angle` in the view plane. */
function rigid(out: THREE.Matrix4, p: THREE.Vector3, Px: number, Py: number, Pz: number, angle: number, s: number): void {
  const c = Math.cos(angle) * s;
  const sn = Math.sin(angle) * s;
  out.set(
    c, -sn, 0, Px - (c * p.x - sn * p.y),
    sn, c, 0, Py - (sn * p.x + c * p.y),
    0, 0, s, Pz - s * p.z,
    0, 0, 0, 1,
  );
}
