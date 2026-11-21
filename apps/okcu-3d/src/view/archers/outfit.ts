/**
 * What an archer wears and carries besides the bow: the player's armour (one piece per level of
 * the health upgrade), veterans' steel caps, per-type headgear, boss plating and weak-spot ring,
 * the shield-bearer's planted pavise, the healer's and the wizard's staffs and the lantern
 * knight's ward.
 *
 * Worn pieces are authored around the T-pose in the model's own space (cm; x = the character's
 * left, y = up, z = forward) and hung on a bone with `rig.attach`, so they move, stretch and
 * mirror with the body exactly like its skin. Carried / floating things live in world space.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PT } from '@sim/ragdoll';
import type { Archer, World } from '@sim/world';
import { PALETTE } from '@okcu/textures';
import { PX_PER_M, sx, sy } from '../../coords';
import type { ArcherRig, BoneName } from '../rig';
import type { Hat, Look } from './looks';

// T-pose landmarks of the Mixamo character (cm)
const HEAD = new THREE.Vector3(0, 166.5, 0.5);
const HOOD = 12.7; // radius of the hooded head
const ARM_Y = 144;
const ARM_Z = -5.5;
const LEG_X = 8.2;

interface Kit {
  steel: THREE.Material;
  gold: THREE.Material;
  dark: THREE.Material;
  cloth: THREE.Material;
  wood: THREE.Material;
  glow: THREE.MeshBasicMaterial;
  bone: THREE.Material;
  leaf: THREE.Material;
  geo: Map<string, THREE.BufferGeometry>;
}
let kit: Kit | null = null;

function getKit(renderer: THREE.WebGLRenderer): Kit {
  if (kit) return kit;
  // metal needs something to reflect: a small studio environment of its own, whatever the stage does
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const metal = (color: number, rough: number): THREE.Material => new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: rough, envMap: env, envMapIntensity: 0.85 });
  kit = {
    steel: metal(0xb4bfd2, 0.34),
    gold: metal(0xffc24a, 0.32),
    dark: metal(0x59606e, 0.45),
    cloth: new THREE.MeshLambertMaterial({ color: 0xd8343f, side: THREE.DoubleSide, emissive: 0x2a0508 }),
    wood: new THREE.MeshLambertMaterial({ color: PALETTE.shieldWood, emissive: 0x24140a }),
    glow: new THREE.MeshBasicMaterial({ color: PALETTE.bossEye, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    bone: new THREE.MeshLambertMaterial({ color: PALETTE.cream, emissive: 0x2a2418 }),
    leaf: new THREE.MeshLambertMaterial({ color: PALETTE.leaf, emissive: 0x0c2408 }),
    geo: new Map(),
  };
  return kit;
}

function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const k = kit!;
  let g = k.geo.get(key);
  if (!g) {
    g = make();
    k.geo.set(key, g);
  }
  return g;
}

/** A surface of revolution about +y from (radius, height) pairs; optionally only an arc of it. */
function lathe(profile: readonly (readonly [number, number])[], segments = 14, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
    phiStart,
    phiLength,
  );
}

/** A shell with thickness: outer profile out and back in, so the rims read as plate, not paper. */
function shell(outer: readonly (readonly [number, number])[], thick: number, segments = 14, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const inner = outer.map(([r, y]) => [Math.max(0, r - thick), y] as const).reverse();
  return lathe([...outer, ...inner], segments, phiStart, phiLength);
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  return o;
};

// ---------------------------------------------------------------- armour pieces (left side)

function bracer(k: Kit): THREE.Object3D {
  // vambrace along the forearm with rolled rims and a raised elbow cop
  const g = geo('bracer', () =>
    shell(
      [
        [6.9, 0],
        [7.6, 0.8],
        [6.8, 1.8],
        [6.5, 9],
        [6.0, 17],
        [6.7, 18.2],
        [6.2, 19.2],
      ],
      0.9,
    )
      .rotateZ(-Math.PI / 2)
      .translate(46.5, ARM_Y, ARM_Z),
  );
  const o = new THREE.Group();
  o.add(mesh(g, k.steel));
  const band = geo('bracerBand', () => new THREE.TorusGeometry(6.9, 0.8, 6, 14).rotateY(Math.PI / 2).translate(56, ARM_Y, ARM_Z));
  o.add(mesh(band, k.gold));
  return o;
}

function greave(k: Kit): THREE.Object3D {
  const o = new THREE.Group();
  const g = geo('greave', () =>
    shell(
      [
        [8.6, 0],
        [9.4, 1],
        [8.7, 2.2],
        [9.4, 18],
        [9.9, 33],
        [10.6, 37],
        [9.6, 39],
      ],
      1,
    ).translate(LEG_X, 12, -3),
  );
  o.add(mesh(g, k.steel));
  // knee cop: a flattened dome in front of the knee with a gold stud
  const cop = geo('kneeCop', () => new THREE.SphereGeometry(8.6, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(Math.PI / 2).scale(1, 1.1, 0.62).translate(LEG_X, 54, 6.5));
  o.add(mesh(cop, k.steel));
  const stud = geo('kneeStud', () => new THREE.SphereGeometry(1.9, 8, 6).translate(LEG_X, 54, 11.9));
  o.add(mesh(stud, k.gold));
  return o;
}

function pauldron(k: Kit, m: THREE.Material): THREE.Object3D {
  const o = new THREE.Group();
  // three overlapping lames over the shoulder, widest on top
  for (let i = 0; i < 3; i++) {
    const g = geo(`pauldron${i}`, () => {
      const r = 12.4 - i * 0.8;
      return new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)
        .scale(1.12, 0.62, 1.05)
        .rotateZ(-0.5 - i * 0.28)
        .translate(17 + i * 4, 148 - i * 3.8, ARM_Z);
    });
    o.add(mesh(g, m));
  }
  const rim = geo('pauldronRim', () => new THREE.TorusGeometry(11.2, 0.9, 6, 16).rotateX(Math.PI / 2).scale(1.12, 1, 1.05).rotateZ(-0.5).translate(17, 147.7, ARM_Z));
  o.add(mesh(rim, k.gold));
  return o;
}

function cuirass(k: Kit, m: THREE.Material): THREE.Object3D {
  const o = new THREE.Group();
  const g = geo('cuirass', () =>
    shell(
      [
        [19.0, 108],
        [20.2, 109.4],
        [19.0, 111.5],
        [18.8, 120],
        [20.6, 130],
        [20.8, 137],
        [18.2, 143.5],
        [13.5, 147.5],
      ],
      1.2,
      18,
    )
      .scale(1, 1, 0.9)
      .translate(0, 0, -1),
  );
  o.add(mesh(g, m));
  // a keel down the breastplate and a gold waist band
  const keel = geo('cuirassKeel', () => new THREE.CylinderGeometry(1, 1.5, 27, 6).translate(0, 127, 17.3));
  o.add(mesh(keel, k.gold));
  const belt = geo('cuirassBelt', () => new THREE.TorusGeometry(19.8, 1.2, 6, 20).rotateX(Math.PI / 2).scale(1, 1, 0.9).translate(0, 109.6, -1));
  o.add(mesh(belt, k.gold));
  return o;
}

function tassets(k: Kit): THREE.Object3D {
  const o = new THREE.Group();
  // four hanging plates around the hips with gaps between them, each with a gold hem
  for (let i = 0; i < 4; i++) {
    const g = geo(`tasset${i}`, () => {
      const start = -Math.PI / 4 + (i * Math.PI) / 2 + 0.12;
      return shell(
        [
          [24.0, 84],
          [24.9, 85.2],
          [23, 96],
          [19.8, 108.5],
        ],
        1,
        6,
        start,
        Math.PI / 2 - 0.24,
      )
        .scale(1, 1, 0.76)
        .translate(0, 0, 0.5);
    });
    o.add(mesh(g, k.steel));
    const hem = geo(`tassetHem${i}`, () => {
      const start = -Math.PI / 4 + (i * Math.PI) / 2 + 0.12;
      return new THREE.TorusGeometry(24.5, 0.9, 5, 8, Math.PI / 2 - 0.24)
        .rotateX(-Math.PI / 2)
        .rotateY(start - Math.PI / 2 + (Math.PI / 2 - 0.24))
        .scale(1, 1, 0.76)
        .translate(0, 84.6, 0.5);
    });
    o.add(mesh(hem, k.gold));
  }
  return o;
}

function gorget(k: Kit): THREE.Object3D {
  const g = geo('gorget', () =>
    shell(
      [
        [16, 143],
        [14.6, 146.5],
        [11, 151.5],
        [10.2, 155],
        [11, 156],
      ],
      1,
      16,
    )
      .scale(1, 1, 0.92)
      .translate(0, 0, -2),
  );
  const o = new THREE.Group();
  o.add(mesh(g, k.steel));
  return o;
}

/** Open-faced helmet over the hood: skull, brim, nasal, cheek plates; a crest when `crest`. */
function helmet(k: Kit, m: THREE.Material, crest: boolean): THREE.Object3D {
  const o = new THREE.Group();
  const R = HOOD + 1.6;
  const skull = geo('helmSkull', () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 0.6;
      pts.push([Math.sin(a) * R, Math.cos(a) * R * 1.04]);
    }
    return shell(pts, 1, 18).translate(HEAD.x, HEAD.y + 1, HEAD.z - 0.5);
  });
  o.add(mesh(skull, m));
  const brim = geo('helmBrim', () => new THREE.TorusGeometry(R * 0.985, 1.15, 6, 22).rotateX(Math.PI / 2).translate(HEAD.x, HEAD.y + 1 + Math.cos(Math.PI * 0.6) * R * 1.04, HEAD.z - 0.5));
  o.add(mesh(brim, k.gold));
  const nasal = geo('helmNasal', () => new THREE.BoxGeometry(2, 9, 1.4).translate(0, HEAD.y - 5.5, HEAD.z + R - 0.9));
  o.add(mesh(nasal, m));
  for (const side of [-1, 1]) {
    const cheek = geo(`helmCheek${side}`, () => shell([[R, -9.5], [R + 0.2, -3], [R, 0]], 1, 5, side > 0 ? 0.55 : Math.PI - 0.55 - 0.9, 0.9).translate(HEAD.x, HEAD.y - 1, HEAD.z - 0.5));
    o.add(mesh(cheek, m));
  }
  if (crest) {
    const ridge = geo('helmCrest', () => new THREE.TorusGeometry(R + 1.6, 1.5, 5, 14, Math.PI * 0.8).scale(1, 1, 0.5).rotateY(Math.PI / 2).rotateX(-0.35).translate(HEAD.x, HEAD.y + 1, HEAD.z - 0.5));
    o.add(mesh(ridge, k.cloth));
  }
  return o;
}

function cape(k: Kit): THREE.Object3D {
  const o = new THREE.Group();
  const g = geo('cape', () => {
    const p = new THREE.PlaneGeometry(34, 62, 6, 8);
    const pos = p.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i); // +31 at the shoulders, −31 at the hem
      const down = (31 - y) / 62;
      // wraps the shoulders, flares and billows toward the hem
      pos.setXYZ(i, x * (0.82 + down * 0.5), y, -Math.cos((x / 17) * 1.1) * 4 - down * down * 13 + Math.sin(x * 0.5 + down * 5) * down * 1.6);
    }
    p.computeVertexNormals();
    return p.translate(0, 115, -11.5);
  });
  o.add(mesh(g, k.cloth));
  const clasp = geo('capeClasp', () => new THREE.TorusGeometry(10.5, 1, 5, 14, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI).scale(1.3, 1, 1).translate(0, 146.5, -4));
  o.add(mesh(clasp, k.gold));
  return o;
}

// ---------------------------------------------------------------- headgear per type

function horn(len: number, base: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(base, len, 8, 4).translate(0, len / 2, 0);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / len;
    pos.setX(i, pos.getX(i) + t * t * len * 0.45); // curl outward
  }
  g.computeVertexNormals();
  return g;
}

function hat(k: Kit, kind: Hat, accent: number): THREE.Object3D | null {
  const o = new THREE.Group();
  const R = HOOD;
  const tint = (hex: number): THREE.Material => {
    const key = `tint${hex}`;
    let m = tints.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: hex, emissive: new THREE.Color(hex).multiplyScalar(0.18) });
      tints.set(key, m);
    }
    return m;
  };
  switch (kind) {
    case 'none':
      return null;
    case 'band': {
      o.add(mesh(geo('band', () => new THREE.TorusGeometry(R - 0.3, 0.9, 6, 20).rotateX(Math.PI / 2).scale(1, 2.6, 1).translate(HEAD.x, HEAD.y + 4, HEAD.z)), tint(accent)));
      o.add(mesh(geo('bandTail', () => new THREE.BoxGeometry(2.6, 3, 15).rotateX(0.45).translate(3, HEAD.y + 1, HEAD.z - R - 6)), tint(accent)));
      break;
    }
    case 'goggles': {
      for (const side of [-1, 1]) {
        o.add(mesh(geo(`goggle${side}`, () => new THREE.CylinderGeometry(3.6, 3.9, 3, 10).rotateX(Math.PI / 2).translate(side * 4.2, HEAD.y + 1.5, HEAD.z + R - 1.2)), k.dark));
        o.add(mesh(geo(`lens${side}`, () => new THREE.CylinderGeometry(2.7, 2.7, 3.4, 10).rotateX(Math.PI / 2).translate(side * 4.2, HEAD.y + 1.5, HEAD.z + R - 0.9)), tint(accent)));
      }
      o.add(mesh(geo('goggleStrap', () => new THREE.TorusGeometry(R + 0.4, 1.1, 5, 18).rotateX(Math.PI / 2).translate(HEAD.x, HEAD.y + 1.5, HEAD.z)), k.dark));
      break;
    }
    case 'horns':
    case 'imp': {
      const big = kind === 'horns';
      for (const side of [-1, 1]) {
        const g = geo(`horn${kind}`, () => horn(big ? 17 : 9, big ? 4.2 : 2.8));
        const h = mesh(g, big ? k.bone : tint(accent));
        h.scale.x = side;
        h.rotation.z = -side * 0.5;
        h.position.set(side * R * 0.72, HEAD.y + R * 0.62, HEAD.z);
        o.add(h);
      }
      break;
    }
    case 'leafcrown': {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const leaf = mesh(geo('leaf', () => new THREE.SphereGeometry(3, 6, 4).scale(1, 0.45, 0.55)), k.leaf);
        leaf.position.set(Math.sin(a) * (R + 0.6), HEAD.y + 5 + (i % 2) * 1.2, HEAD.z + Math.cos(a) * (R + 0.6));
        leaf.rotation.y = a + Math.PI / 2;
        leaf.rotation.z = 0.5;
        o.add(leaf);
      }
      break;
    }
    case 'turban': {
      for (let i = 0; i < 3; i++) {
        o.add(mesh(geo(`turban${i}`, () => new THREE.TorusGeometry(R - 0.5 - i * 2.6, 3.7 - i * 0.3, 6, 18).rotateX(Math.PI / 2).rotateZ(i % 2 ? 0.14 : -0.14).translate(HEAD.x, HEAD.y + 5.5 + i * 3.6, HEAD.z)), tint(accent)));
      }
      o.add(mesh(geo('turbanJewel', () => new THREE.SphereGeometry(2, 8, 6).translate(0, HEAD.y + 7.5, HEAD.z + R + 2.4)), tint(PALETTE.danger)));
      break;
    }
    case 'cap': {
      o.add(mesh(geo('cap', () => new THREE.SphereGeometry(R + 1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45).translate(HEAD.x, HEAD.y + 1.5, HEAD.z)), tint(accent)));
      o.add(mesh(geo('capPeak', () => new THREE.CylinderGeometry(R * 0.85, R * 0.85, 1, 12, 1, false, -0.9, 1.8).translate(HEAD.x, HEAD.y + 3.5, HEAD.z + 6)), tint(accent)));
      break;
    }
    case 'lantern': {
      o.add(helmet(k, k.dark, false));
      o.add(mesh(geo('lanternCage', () => new THREE.BoxGeometry(5.5, 7, 5.5).translate(HEAD.x, HEAD.y + R + 6.5, HEAD.z)), k.dark));
      const lamp = new THREE.Mesh(
        geo('lanternLight', () => new THREE.BoxGeometry(4, 5, 6.4).translate(HEAD.x, HEAD.y + R + 6.5, HEAD.z)),
        lanternMat ?? (lanternMat = new THREE.MeshBasicMaterial({ color: PALETTE.lantern })),
      );
      o.add(lamp);
      break;
    }
    case 'plume': {
      o.add(helmet(k, k.gold, true));
      break;
    }
    case 'ember': {
      // the cinder king: a basalt band crowned with five unlit-by-light (self-glowing) flames
      o.add(mesh(geo('emberBand', () => new THREE.CylinderGeometry(R + 0.8, R + 1.4, 5, 16, 1, true).translate(HEAD.x, HEAD.y + 6, HEAD.z)), k.dark));
      flameMat ??= new THREE.MeshBasicMaterial({ color: 0xff7a22 });
      flameCore ??= new THREE.MeshBasicMaterial({ color: PALETTE.fireCore });
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        const h = i === 2 ? 15 : i % 2 ? 11 : 8;
        const f = mesh(geo(`emberFlame${h}`, () => new THREE.ConeGeometry(2.6, h, 6).translate(0, h / 2, 0)), flameMat);
        f.position.set(HEAD.x + Math.sin(a) * (R + 0.4), HEAD.y + 8, HEAD.z + Math.cos(a) * (R + 0.4));
        f.rotation.z = -Math.sin(a) * 0.25;
        o.add(f);
        const c = mesh(geo(`emberCore${h}`, () => new THREE.ConeGeometry(1.2, h * 0.6, 5).translate(0, h * 0.3, 0)), flameCore);
        c.position.copy(f.position).setZ(f.position.z + 0.8);
        c.rotation.z = f.rotation.z;
        o.add(c);
      }
      break;
    }
    case 'wizard': {
      // the wizard: a tall, slightly crooked cone over a wide brim, with a gold star band
      o.add(mesh(geo('wizBrim', () => new THREE.CylinderGeometry(R * 1.75, R * 1.85, 1.6, 22).translate(HEAD.x, HEAD.y + 6, HEAD.z)), tint(PALETTE.mageShade)));
      const cone = geo('wizCone', () => {
        const g = new THREE.ConeGeometry(R * 1.02, 34, 16, 6).translate(0, 17, 0);
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          const t = pos.getY(i) / 34;
          pos.setZ(i, pos.getZ(i) - t * t * 9); // the tip droops back
        }
        g.computeVertexNormals();
        return g.translate(HEAD.x, HEAD.y + 6.5, HEAD.z);
      });
      o.add(mesh(cone, tint(PALETTE.mage)));
      o.add(mesh(geo('wizBand', () => new THREE.CylinderGeometry(R * 0.98, R * 1.02, 3.2, 16, 1, true).translate(HEAD.x, HEAD.y + 9, HEAD.z)), k.gold));
      for (let i = 0; i < 3; i++) {
        const star = mesh(geo('wizStar', () => new THREE.OctahedronGeometry(1.8, 0)), tint(accent));
        star.position.set(HEAD.x + (i - 1) * 4.2, HEAD.y + 15 + i * 5, HEAD.z + R * 0.75 - i * 2.4);
        o.add(star);
      }
      break;
    }
    case 'halo': {
      // the storm caller: a gold ring floating over the head, ringed with cloud puffs
      o.add(mesh(geo('haloRing', () => new THREE.TorusGeometry(R * 1.1, 2.2, 6, 28).rotateX(Math.PI / 2).translate(HEAD.x, HEAD.y + R + 8, HEAD.z)), k.gold));
      cloudMat ??= new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0xdde8ff).multiplyScalar(0.35) });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = mesh(geo(`haloPuff${i % 2}`, () => new THREE.SphereGeometry(i % 2 ? 4 : 5, 8, 6)), cloudMat);
        p.position.set(HEAD.x + Math.cos(a) * R * 1.1, HEAD.y + R + 8 + (i % 2) * 2, HEAD.z + Math.sin(a) * R * 1.1);
        o.add(p);
      }
      break;
    }
  }
  return o;
}
const tints = new Map<string, THREE.Material>();
let lanternMat: THREE.Material | null = null;
let flameMat: THREE.Material | null = null;
let flameCore: THREE.Material | null = null;
let cloudMat: THREE.Material | null = null;

// ---------------------------------------------------------------- the outfit of one archer

const LEFT_RIGHT: readonly (readonly [BoneName, BoneName])[] = [
  ['LeftForeArm', 'RightForeArm'],
  ['LeftLeg', 'RightLeg'],
  ['LeftShoulder', 'RightShoulder'],
];

export class Outfit {
  /** world-space things: shield, staff, weak-spot ring, ward */
  readonly group = new THREE.Group();
  private readonly k: Kit;
  private worn: THREE.Object3D[] = [];
  private cap: THREE.Object3D | null = null;
  private shield: THREE.Group | null = null;
  private ring: THREE.Mesh | null = null;
  private staff: THREE.Group | null = null;
  private ward: THREE.Mesh | null = null;

  constructor(
    private readonly rig: ArcherRig,
    renderer: THREE.WebGLRenderer,
  ) {
    this.k = getKit(renderer);
  }

  private wear(bone: BoneName, obj: THREE.Object3D, mirror = false): THREE.Object3D {
    let o = obj;
    if (mirror) {
      o = new THREE.Group();
      o.add(obj);
      o.scale.x = -1;
    }
    this.rig.attach(bone, o);
    this.worn.push(o);
    return o;
  }

  private pair(i: number, make: () => THREE.Object3D): void {
    const [l, r] = LEFT_RIGHT[i]!;
    this.wear(l, make());
    this.wear(r, make(), true);
  }

  /** Dress the rig for this archer (called when a puppet is assigned). `armour` = pieces 0 … 8. */
  dress(a: Archer, look: Look, armour: number): void {
    const k = this.k;
    for (const o of this.worn) o.removeFromParent();
    this.worn = [];
    this.group.clear();
    this.cap = this.shield = this.ring = this.staff = this.ward = null;

    // --- the player's armour, in the order it is earned
    if (armour >= 1) this.pair(0, () => bracer(k));
    if (armour >= 2) this.pair(1, () => greave(k));
    // Tough Noodle 10 … 12 (added with chapters 5 and 6) gilds the plate
    const metal = armour >= 10 ? k.gold : k.steel;
    if (armour >= 3) this.pair(2, () => pauldron(k, metal));
    if (armour >= 4) this.wear('Spine1', cuirass(k, metal));
    if (armour >= 5) this.wear('Hips', tassets(k));
    if (armour >= 6) this.wear('Spine2', gorget(k));
    if (armour >= 7) this.wear('Head', helmet(k, metal, true));
    if (armour >= 8) this.wear('Spine2', cape(k));

    // --- enemies
    const h = hat(k, look.hat, look.accent);
    if (h) this.wear('Head', h);
    if (look.armour) {
      // plate from head to shin, in steel: a crested helm, cuirass, pauldrons, tassets, greaves, bracers
      this.wear('Head', helmet(k, k.steel, true));
      this.wear('Spine1', cuirass(k, k.steel));
      this.wear('Spine2', gorget(k));
      this.pair(2, () => pauldron(k, k.steel));
      this.wear('Hips', tassets(k));
      this.pair(1, () => greave(k));
      this.pair(0, () => bracer(k));
    } else if (a.type !== 'player' && a.type !== 'boss' && look.hat !== 'lantern' && look.hat !== 'plume') {
      // veterans (and every shield-bearer, as in the 2D game) wear a steel cap
      this.cap = this.wear('Head', helmet(k, k.steel, false));
    }
    if (look.plate) {
      this.wear('Spine1', cuirass(k, k.gold));
      this.pair(2, () => pauldron(k, k.gold));
      this.wear('Hips', tassets(k));
      this.pair(0, () => bracer(k));
      // the bare head is the weak spot: a pulsing ring marks it
      this.ring = new THREE.Mesh(
        geo('weakRing', () => new THREE.RingGeometry(0.86, 1, 40)),
        k.glow.clone(),
      );
      this.ring.renderOrder = 5;
      this.group.add(this.ring);
    }
    if (look.sash) {
      this.wear('Spine1', mesh(geo('sash', () => new THREE.TorusGeometry(17.5, 1.9, 5, 20).scale(1, 1, 0.8).rotateZ(0.75).rotateX(Math.PI / 2 - 0.9).translate(0, 128, 0)), k.gold));
    }
    if (a.shield) {
      // a planted pavise: its length runs along local x (the two shield points); it is turned
      // about that axis so the camera sees some of its face, not only the edge
      const g = new THREE.Group();
      const face = new THREE.Group();
      face.rotation.x = -0.75;
      face.add(mesh(geo('pavise', () => new THREE.BoxGeometry(1, 12, 78).translate(0.5, 0, 0)), k.wood));
      for (const z of [-40, 40]) face.add(mesh(geo(`paviseRim${z}`, () => new THREE.BoxGeometry(1.04, 14, 5).translate(0.5, 0, z)), k.steel));
      for (const x of [0.02, 0.98]) face.add(mesh(geo(`paviseEnd${x}`, () => new THREE.BoxGeometry(0.05, 14, 85).translate(x, 0, 0)), k.steel));
      face.add(mesh(geo('paviseBoss', () => new THREE.SphereGeometry(13, 12, 8).scale(0.012, 0.9, 1).translate(0.5, 0, 0)), k.steel));
      g.add(face);
      this.shield = g;
      this.group.add(g);
    }
    if (a.type === 'healer' || a.type === 'mage') {
      // the sim casts from the staff's tip (world.ts staffTip)
      const mage = a.type === 'mage';
      const g = new THREE.Group();
      g.add(mesh(geo('staff', () => new THREE.CylinderGeometry(3.2, 3.8, 96, 7).translate(0, 4, 0)), mage ? k.dark : k.wood));
      const orb = mage ? (hexMat ??= new THREE.MeshBasicMaterial({ color: PALETTE.hex })) : (healMat ??= new THREE.MeshBasicMaterial({ color: PALETTE.heal }));
      g.add(mesh(geo('staffOrb', () => new THREE.SphereGeometry(10, 12, 9).translate(0, 56, 0)), orb));
      if (mage) {
        // a gold crescent cradling the hex
        g.add(mesh(geo('staffMoon', () => new THREE.TorusGeometry(13, 1.8, 6, 16, Math.PI * 1.2).rotateZ(Math.PI * 0.9).translate(0, 56, 0)), k.gold));
      }
      this.staff = g;
      this.group.add(g);
    }
    if (a.type === 'ward') {
      this.ward = new THREE.Mesh(
        geo('ward', () => new THREE.SphereGeometry(1, 20, 14)),
        wardMat ?? (wardMat = new THREE.MeshBasicMaterial({ color: PALETTE.wardGlow, transparent: true, opacity: 0.28, depthWrite: false })),
      );
      this.ward.renderOrder = 4;
      this.group.add(this.ward);
    }
  }

  update(w: World, a: Archer, vx: Float64Array, vy: Float64Array, t: number): void {
    void w;
    const s = a.scale / PX_PER_M;
    if (this.cap) this.cap.visible = a.helmet || a.type === 'shield';
    if (this.shield && a.shield) {
      const b = a.shield;
      const dx = b.x[1]! - b.x[0]!;
      const dy = b.y[1]! - b.y[0]!;
      this.shield.position.set(sx(b.x[0]!), sy(b.y[0]!), 0);
      this.shield.rotation.z = Math.atan2(-dy, dx);
      this.shield.scale.set(Math.hypot(dx, dy) / PX_PER_M, 1 / PX_PER_M, 1 / PX_PER_M);
    }
    if (this.ring) {
      const k = (t * 1.3) % 1;
      this.ring.visible = a.alive;
      this.ring.position.set(sx(vx[PT.head]!), sy(vy[PT.head]!), 0.9 * a.scale);
      this.ring.scale.setScalar((30 + k * 26) * s);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }
    if (this.staff) {
      this.staff.position.set(sx(vx[PT.handF]!), sy(vy[PT.handF]!), 0);
      this.staff.rotation.z = a.alive ? -a.facing * 0.08 : Math.atan2(-(vy[PT.handF]! - vy[PT.elbowF]!), vx[PT.handF]! - vx[PT.elbowF]!) - Math.PI / 2;
      this.staff.scale.setScalar(s);
    }
    if (this.ward) {
      this.ward.visible = a.alive && a.wardUp;
      this.ward.position.set(sx((vx[PT.neck]! + vx[PT.pelvis]!) / 2), sy((vy[PT.neck]! + vy[PT.pelvis]!) / 2 - 22 * a.scale), 0);
      this.ward.scale.setScalar(70 * s * (1 + Math.sin(t * 3 + a.id) * 0.04));
    }
  }
}
let healMat: THREE.Material | null = null;
let hexMat: THREE.Material | null = null;
let wardMat: THREE.Material | null = null;
