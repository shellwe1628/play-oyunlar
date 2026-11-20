/**
 * Arrows, bombs and orbs. Every arrow is a real little model (shaft, head, three fletching
 * vanes, an ink hull so it reads at phone size) drawn with instancing: five InstancedMeshes
 * cover every arrow of every kind. In flight an arrow points nose-first along `a.angle`, rolls,
 * flexes for a moment off the string and drags a trail coloured by its card, exactly like the
 * 2D game's trails.ts (fire embers, piercing glow, bouncy dots, heavy smoke). A glowing bow
 * passes its glow to its arrows; focus shots fly golden. When an arrow lands it stays where the
 * simulation puts it (ledge, body, shield), quivers, and dissolves when its `life` runs out.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { THEMES, themeIndex } from '@okcu/anim/themes';
import { PALETTE } from '@okcu/textures';
import { bowGlow } from '@sim/bow';
import { TUNING } from '@sim/tuning';
import { type Arrow } from '@sim/world';
import { type Module, type Stage } from '../contract';
import { m, sx, sy } from '../coords';
import { hueColor, TILE } from './fx/atlas';
import { SpriteBatch } from './fx/batch';
import { Ribbons } from './fx/ribbons';

const CAP = 96;
const SPRITES = 320;
const ORB = 0xb08bff;
/** flying things sit just behind the play plane's sprites; trails a hair behind the arrows */
const TRAIL_Z = -0.04;
const TRAIL_N = 9;
const TRAIL_T = 0.13;

function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/** An ink hull: the same shape a little fatter, wound inside out so only its far side draws. */
function hull(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = geo.getIndex()!;
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, b);
  }
  return paint(geo, PALETTE.ink);
}

const alongX = (geo: THREE.BufferGeometry, cx: number): THREE.BufferGeometry => geo.rotateZ(-Math.PI / 2).translate(m(cx), 0, 0);

function shaftGeo(): THREE.BufferGeometry {
  // from 50 px behind the tip to 4 px past it (the 2D arrow's shaft)
  const body = alongX(new THREE.CylinderGeometry(m(2.7), m(2.7), m(54), 8, 1), -23);
  const ink = alongX(new THREE.CylinderGeometry(m(4.3), m(4.3), m(57), 8, 1), -23);
  return mergeGeometries([paint(body, 0xffffff), hull(ink)]);
}

function headGeo(): THREE.BufferGeometry {
  // a broadhead: four-sided, flattened, tip 17 px past the arrow's point
  const body = alongX(new THREE.ConeGeometry(m(7.2), m(17), 4, 1), 9).scale(1, 1, 0.55);
  const ink = alongX(new THREE.ConeGeometry(m(10.6), m(23), 4, 1), 9.2).scale(1, 1, 0.62);
  return mergeGeometries([paint(body, PALETTE.arrowHead), hull(ink)]);
}

function ballGeo(): THREE.BufferGeometry {
  // bouncy card: a rubber ball tip
  const body = new THREE.SphereGeometry(m(7), 12, 9).translate(m(8), 0, 0);
  const ink = new THREE.SphereGeometry(m(10), 12, 9).translate(m(8), 0, 0);
  return mergeGeometries([paint(body, PALETTE.leaf), hull(ink)]);
}

function needleGeo(): THREE.BufferGeometry {
  // piercing card: a long needle
  const body = alongX(new THREE.ConeGeometry(m(4.8), m(25), 6, 1), 12.5);
  const ink = alongX(new THREE.ConeGeometry(m(8), m(33), 6, 1), 13);
  return mergeGeometries([paint(body, PALETTE.bubble), hull(ink)]);
}

function fletchGeo(): THREE.BufferGeometry {
  const vane = (len: number, tall: number, thick: number, lift: number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(m(len), m(tall), m(thick));
    const p = g.getAttribute('position');
    // swept back: the top edge leans toward the tail
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) - p.getY(i) * 0.5);
    return g.translate(m(-41), m(lift), 0);
  };
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    parts.push(paint(vane(15, 7.5, 1.3, 6).rotateX(a), 0xffffff));
    parts.push(hull(vane(18, 9.6, 2.6, 6.1).rotateX(a)));
  }
  parts.push(paint(new THREE.SphereGeometry(m(3.1), 8, 6).translate(m(-50.5), 0, 0), 0xffffff));
  parts.push(hull(new THREE.SphereGeometry(m(4.7), 8, 6).translate(m(-50.5), 0, 0)));
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** Arrows that are about to vanish dissolve through a screen-door pattern (no sorting needed). */
function dissolving(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aFade;\nvarying float vFade;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vFade;\nvoid main() {\n  if (vFade < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > vFade) discard;');
  };
  mat.customProgramCacheKey = () => 'okcu-arrow-dissolve';
  return mat;
}

interface Part {
  mesh: THREE.InstancedMesh;
  fade: THREE.InstancedBufferAttribute;
  n: number;
}

export function createArrows(stage: Stage): Module {
  const group = new THREE.Group();
  group.name = 'arrows';
  stage.scene.add(group);

  const mat = dissolving(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 }));
  const part = (geo: THREE.BufferGeometry): Part => {
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1);
    fade.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFade', fade);
    const mesh = new THREE.InstancedMesh(geo, mat, CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.setColorAt(0, new THREE.Color(0xffffff));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return { mesh, fade, n: 0 };
  };
  const shafts = part(shaftGeo());
  const fletch = part(fletchGeo());
  const heads = part(headGeo());
  const balls = part(ballGeo());
  const needles = part(needleGeo());
  const parts = [shafts, fletch, heads, balls, needles];

  // bombs and orbs: a handful at most, plain meshes
  const bombGeo = mergeGeometries([
    paint(new THREE.SphereGeometry(m(15), 18, 12), PALETTE.bomb),
    hull(new THREE.SphereGeometry(m(19.5), 18, 12)),
    paint(new THREE.CylinderGeometry(m(5), m(6), m(5), 8).translate(m(4), m(14), 0).rotateZ(-0.3), 0x6b6f86),
    paint(new THREE.CylinderGeometry(m(1.8), m(1.8), m(9), 6).translate(m(4), m(19), 0).rotateZ(-0.3), PALETTE.shaftLight),
  ]);
  const bombMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25 });
  const orbGeo = mergeGeometries([paint(new THREE.SphereGeometry(m(20), 20, 14), 0xffffff), hull(new THREE.SphereGeometry(m(24), 20, 14))]);
  const orbMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: ORB, emissive: ORB, emissiveIntensity: 0.55, roughness: 0.3 });
  // a staff-carrier's hex (healer, wizard): smaller and magenta, so it never reads as a warden orb
  const hexMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: PALETTE.hex, emissive: PALETTE.hex, emissiveIntensity: 0.6, roughness: 0.3 });
  const bombs: THREE.Mesh[] = [];
  const orbs: THREE.Mesh[] = [];
  const pooled = (list: THREE.Mesh[], i: number, geo: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh => {
    let o = list[i];
    if (!o) {
      o = new THREE.Mesh(geo, material);
      o.castShadow = true;
      group.add(o);
      list.push(o);
    }
    o.visible = true;
    return o;
  };

  const trails = new Ribbons(CAP * (TRAIL_N + 8), 4, true);
  const sprites = new SpriteBatch(SPRITES, 6);
  group.add(trails.mesh, sprites.mesh);

  // per pool slot: what the arrow in it looked like last frame
  const seq = new Int32Array(CAP).fill(-1);
  const wasState = new Uint8Array(CAP);
  const stuckAt = new Float32Array(CAP);
  const roll = new Float32Array(CAP);
  const pvx = new Float32Array(CAP);
  const pvy = new Float32Array(CAP);
  /** seconds of clean ballistic flight behind the arrow (the trail may reach back this far) */
  const flown = new Float32Array(CAP);

  const C = {
    white: new THREE.Color(0xffffff),
    shaftMine: new THREE.Color(PALETTE.shaftLight),
    shaftFoe: new THREE.Color(PALETTE.shaft),
    shaftHeavy: new THREE.Color(PALETTE.weight),
    shaftFocus: new THREE.Color(0xffe9a0),
    fletchMine: new THREE.Color(PALETTE.fletch),
    fletchMulti: new THREE.Color(PALETTE.sky2),
    fletchFoe: new THREE.Color(PALETTE.enemyFletch),
    fletchFocus: new THREE.Color(PALETTE.focus),
    headHeavy: new THREE.Color(0xf4f6ff),
    headFrost: new THREE.Color(PALETTE.frost),
    headBlast: new THREE.Color(PALETTE.danger),
  };
  const mtx = new THREE.Matrix4();
  const mtx2 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);
  const AZ = new THREE.Vector3(0, 0, 1);

  const put = (p: Part, color: THREE.Color, alpha: number): void => {
    if (p.n >= CAP) return;
    p.mesh.setMatrixAt(p.n, mtx2);
    p.mesh.setColorAt(p.n, color);
    p.fade.setX(p.n, alpha);
    p.n++;
  };

  let clock = 0;
  let skyT = 0;
  let nSprites = 0;
  let lastSprites = 0;
  const spr = (x: number, y: number, w: number, h: number, rot: number, hex: number, alpha: number, tile: number, add: number): void => {
    if (nSprites < SPRITES) sprites.put(nSprites++, sx(x), sy(y), 0, m(w), m(h), rot, hex, alpha, tile, add);
  };

  return {
    update({ w, dt, real }) {
      clock += dt;
      skyT += real;
      for (const p of parts) p.n = 0;
      nSprites = 0;
      trails.begin();
      let nBombs = 0;
      let nOrbs = 0;

      const multi = w.stats.volleys > 1 || w.stats.splitPairs > 0;
      const dark = THEMES[themeIndex(w.wave)]?.dark ?? false;
      const glow = bowGlow(w.meta.bow);
      const glowCol = glow.cycle ? hueColor((skyT * 0.25) % 1) : glow.color;

      const n = Math.min(CAP, w.arrows.length);
      for (let i = 0; i < n; i++) {
        const a: Arrow = w.arrows[i]!;
        if (!a.active) {
          seq[i] = -1;
          continue;
        }
        if (seq[i] !== a.seq) {
          // a new arrow took this slot
          seq[i] = a.seq;
          wasState[i] = a.state;
          stuckAt[i] = a.state === 0 ? 0 : -10;
          flown[i] = 0;
          pvx[i] = a.vx;
          pvy[i] = a.vy;
          roll[i] = a.seq * 1.7;
        }
        if (a.state !== wasState[i]) {
          if (wasState[i] === 0) stuckAt[i] = clock;
          wasState[i] = a.state;
        }
        const flying = a.state === 0;
        const mine = a.owner === 'player';
        const ax = a.kind === 'orb' ? 0 : w.wind;
        const ay = a.kind === 'orb' ? 0 : TUNING.gravity;
        if (flying) {
          // a bounce, a pierce kick or a hard steer breaks the ballistic arc: restart the trail there
          const ex = a.vx - pvx[i]! - ax * dt;
          const ey = a.vy - pvy[i]! - ay * dt;
          flown[i] = Math.abs(ex) + Math.abs(ey) > 140 ? 0 : Math.min(1, flown[i]! + dt);
          pvx[i] = a.vx;
          pvy[i] = a.vy;
          roll[i] = roll[i]! + dt * 13;
        }

        const dx = Math.cos(a.angle);
        const dy = Math.sin(a.angle);

        // ---------------------------------------------------------------- bombs
        if (a.kind === 'bomb') {
          const b = pooled(bombs, nBombs++, bombGeo, bombMat);
          b.position.set(sx(a.x), sy(a.y), 0);
          const spin = -a.age * 5 * Math.sign(a.vx || 1);
          b.rotation.set(0, 0, spin);
          // the fuse end, following the spin: sparks and a flickering flame
          const fa = spin + Math.PI / 2 - 0.3;
          const fx = a.x + Math.cos(fa) * 24;
          const fy = a.y - Math.sin(fa) * 24;
          const fl = 5 + Math.sin(clock * 40) * 3;
          spr(fx, fy, fl * 7, fl * 7, 0, PALETTE.fire, 0.75, TILE.blob, 1);
          spr(fx, fy, fl * 3.2, fl * 3.2, clock * 9, PALETTE.fireCore, 1, TILE.star, 0.6);
          spr(fx, fy, fl * 5, fl * 5, clock * 3, PALETTE.white, 0.8, TILE.glint, 1);
          for (let k = 1; k <= 4; k++) {
            // smoke puffs left behind along the arc
            const t = k * 0.035 + ((clock * 3 + i * 0.37) % 0.035);
            if (t > flown[i]!) break;
            const f = 1 - t / 0.18;
            spr(a.x - a.vx * t + 0.5 * ax * t * t, a.y - a.vy * t + 0.5 * ay * t * t - 6, 14 + 26 * (1 - f), 14 + 26 * (1 - f), 0, PALETTE.smoke, 0.32 * f, TILE.puff, 0);
          }
          continue;
        }

        // ---------------------------------------------------------------- orbs
        if (a.kind === 'orb') {
          const o = pooled(orbs, nOrbs++, orbGeo, a.hex ? hexMat : orbMat);
          o.material = a.hex ? hexMat : orbMat;
          const col = a.hex ? PALETTE.hex : ORB;
          const r = a.hex ? 0.8 : 1;
          const k = 1 + Math.sin(clock * 18 + a.x * 0.05) * 0.12;
          o.position.set(sx(a.x), sy(a.y), 0);
          o.scale.setScalar((0.94 + (k - 1) * 0.5) * r);
          spr(a.x, a.y, 20 * 5.2 * k * r, 20 * 5.2 * k * r, 0, col, 0.55, TILE.blob, 1);
          spr(a.x - 6, a.y - 6, 22 * r, 22 * r, 0, PALETTE.white, 0.85, TILE.blob, 1);
          spr(a.x, a.y, 74 * r, 74 * r, clock * 2.4, a.hex ? PALETTE.mageStar : 0xd8c8ff, 0.5, TILE.glint, 1);
          if (flying && flown[i]! > 0.01) {
            const reach = Math.min(0.16, flown[i]!);
            trails.strip();
            for (let s = 0; s < TRAIL_N; s++) {
              const f = s / (TRAIL_N - 1);
              const t = f * reach;
              trails.point(sx(a.x - a.vx * t), sy(a.y - a.vy * t), TRAIL_Z, m(15 * (1 - f) + 2), col, 0.5 * (1 - f), 0.85, 1);
            }
          }
          continue;
        }

        // ---------------------------------------------------------------- arrows
        const heavy = mine && a.impulseMul > 1.01;
        // fading: an arrow in a ledge dissolves over its last 1.2 s (and whenever the sim says `fade`)
        let alpha = a.state === 1 ? Math.min(1, a.life / 1.2) : 1;
        if (a.fade > 0) alpha *= Math.max(0, 1 - a.fade);

        // a tiny per-arrow lean out of the play plane once stuck, so a quiver of them reads as 3D
        const h1 = ((a.seq * 9301 + 49297) % 233280) / 233280 - 0.5;
        const since = clock - stuckAt[i]!;
        let pitch = -a.angle;
        let yaw = 0;
        let z = 0;
        if (flying) {
          // off the string the shaft flexes for a moment
          pitch += Math.sin(a.age * 46) * 0.07 * Math.exp(-a.age * 7);
        } else {
          // thunk: it quivers about its point
          if (since < 0.7) pitch += Math.sin(since * 62) * 0.2 * Math.exp(-since * 8);
          yaw = h1 * (a.state === 1 ? 0.5 : 0.7);
          z = a.state === 1 ? h1 * 0.5 : a.state === 2 ? 0.1 + h1 * 0.12 : 0.06;
        }
        pos.set(sx(a.x), sy(a.y), z);
        quat.setFromAxisAngle(AZ, pitch);
        if (yaw !== 0) quat.multiply(q2.setFromAxisAngle(AY, yaw));
        quat.multiply(q2.setFromAxisAngle(AX, roll[i]!));

        const focus = mine && a.focus;
        const lenK = heavy ? 1.12 : 1;
        const fat = heavy ? 1.45 : 1;
        mtx2.compose(pos, quat, scl.set(lenK, fat, fat));
        put(shafts, mine ? (heavy ? C.shaftHeavy : focus ? C.shaftFocus : C.shaftMine) : C.shaftFoe, alpha);
        mtx2.compose(pos, quat, scl.set(lenK, 1, 1));
        put(fletch, mine ? (focus ? C.fletchFocus : multi ? C.fletchMulti : C.fletchMine) : C.fletchFoe, alpha);
        const hk = heavy ? 1.35 : 1;
        mtx.compose(pos, quat, scl.set(hk, hk, hk));
        mtx2.copy(mtx);
        // in a body or a shield the head is buried: only the shaft and feathers stick out
        if (a.state === 2 || a.state === 3) {
          // nothing to draw
        } else if (mine && a.bounces > 0) put(balls, C.white, alpha);
        else if (mine && a.pierce > 0) put(needles, C.white, alpha);
        else put(heads, mine && a.blast ? C.headBlast : mine && a.frost ? C.headFrost : heavy ? C.headHeavy : C.white, alpha);

        if (!flying) continue;

        // ---------------------------------------------------------------- flight dressing
        const reach = Math.min(TRAIL_T, flown[i]!);
        let color: number = PALETTE.white;
        let width = mine ? 8 : 5;
        let ta = mine ? 0.7 : 0.4;
        let add = 0.25;
        if (mine && a.fire) {
          color = PALETTE.fire;
          width = 8;
          ta = 0.7;
          add = 0.45;
        } else if (mine && a.pierce > 0) {
          color = PALETTE.bubble;
          width = 7;
          ta = 0.65;
          add = 0.5;
        } else if (mine && a.bounces > 0) {
          color = PALETTE.leaf;
        } else if (mine && a.frost) {
          color = PALETTE.frost;
          width = 8;
          add = 0.5;
        } else if (mine && a.blast) {
          color = PALETTE.powerHigh;
          width = 7;
          add = 0.4;
        } else if (heavy) {
          color = PALETTE.smoke;
          width = 9;
          add = 0;
        }
        if (reach > 0.008) {
          const dots = mine && a.bounces > 0;
          if (!dots) trails.strip();
          for (let s = 0; s < TRAIL_N; s++) {
            const f = 1 - s / (TRAIL_N - 1);
            const t = (s / (TRAIL_N - 1)) * reach;
            const x = a.x - a.vx * t + 0.5 * ax * t * t;
            const y = a.y - a.vy * t + 0.5 * ay * t * t;
            if (dots) {
              if (s % 2 === 0 && s > 0) spr(x, y, 8 + f * 8, 8 + f * 8, 0, color, ta * f * 1.6, TILE.disc, 0.2);
            } else {
              trails.point(sx(x), sy(y), TRAIL_Z, m((width * f + 1) * 0.5), color, ta * f, add, 0.25);
            }
            if (mine && a.blast && s === 1) {
              // the blast arrow's fuse spark rides just behind the head
              spr(x, y, 12 + Math.sin(clock * 40 + a.seq) * 4, 12, 0, PALETTE.fireCore, 0.9, TILE.blob, 1);
            }
            if (mine && a.fire && s % 2 === 1) {
              spr(x + Math.sin(clock * 30 + s) * 4, y + Math.cos(clock * 27 + s) * 4, 7 + f * 9, 7 + f * 9, 0, PALETTE.fireCore, f, TILE.blob, 1);
            }
          }
          const speed = Math.hypot(a.vx, a.vy);
          if (mine && !dots && speed > 700) {
            // two thin wind lines beside the wake: the faster the shot, the longer they run
            const k = Math.min(1, (speed - 700) / 800);
            const ox = (-a.vy / speed) * 7;
            const oy = (a.vx / speed) * 7;
            for (let side = -1; side <= 1; side += 2) {
              trails.strip();
              for (let s = 0; s < 5; s++) {
                const f = s / 4;
                const t = (0.18 + f * (0.45 + 0.4 * k)) * reach;
                trails.point(sx(a.x - a.vx * t + 0.5 * ax * t * t + ox * side), sy(a.y - a.vy * t + 0.5 * ay * t * t + oy * side), TRAIL_Z, m(1.1), PALETTE.white, Math.sin(f * Math.PI) * (0.25 + 0.3 * k), 0.3, 0.3);
              }
            }
          }
          if (dark) {
            // dark arenas: a soft light halo keeps every arrow readable
            trails.line(sx(a.x - dx * 50), sy(a.y - dy * 50), sx(a.x), sy(a.y), TRAIL_Z, m(9), m(9), PALETTE.white, 0.2, 0.2, 1, 1);
          }
        }
        if (mine && a.over && reach > 0.008) {
          // an overdrawn shot: a hot white wake
          trails.line(sx(a.x - a.vx * reach * 0.8), sy(a.y - a.vy * reach * 0.8), sx(a.x), sy(a.y), TRAIL_Z, m(1), m(7), PALETTE.cream, 0, 0.5, 0.8, 0.6);
        }
        if (mine && glow.band >= 2 && a.age > 0.012) {
          // arrows loosed from a glowing bow carry its glow
          const len = Math.min(60 + 50 * glow.aura, a.age * Math.hypot(a.vx, a.vy));
          const tx = sx(a.x - dx * len);
          const ty = sy(a.y - dy * len);
          trails.line(tx, ty, sx(a.x), sy(a.y), TRAIL_Z, m(3), m(15 * glow.aura), glowCol, 0, 0.3, 1, 1);
          trails.line(sx(a.x - dx * len * 0.8), sy(a.y - dy * len * 0.8), sx(a.x), sy(a.y), TRAIL_Z, m(1), m(6), glowCol, 0, 0.5, 1, 0.8);
          if (glow.core > 0) trails.line(sx(a.x - dx * 40), sy(a.y - dy * 40), sx(a.x), sy(a.y), TRAIL_Z, m(0.5), m(2.4), PALETTE.white, 0, 0.7 * glow.core, 1, 0.5);
          const r = (10 + 8 * glow.aura) * 4.4;
          spr(a.x + dx * 6, a.y + dy * 6, r, r, 0, glowCol, 0.42, TILE.blob, 1);
        }
        if (focus) {
          trails.line(sx(a.x - dx * 50), sy(a.y - dy * 50), sx(a.x), sy(a.y), TRAIL_Z, m(4), m(10), PALETTE.focus, 0, 0.45, 0.9, 0.9);
          spr(a.x + dx * 8, a.y + dy * 8, 46, 46, clock * 5, PALETTE.focus, 0.7, TILE.glint, 1);
        }
        if (mine && a.fire) {
          // a flame streaming back off the head
          const fl = 9 + Math.sin(clock * 50 + a.seq) * 3;
          spr(a.x - dx * 6, a.y - dy * 6, fl * 4.6, fl * 4.6, 0, PALETTE.fire, 0.8, TILE.blob, 0.8);
          spr(a.x - dx * 20, a.y - dy * 20, fl * 3, fl * 7, -a.angle + Math.PI / 2, PALETTE.fire, 0.9, TILE.tongue, 0.6);
          spr(a.x - dx * 4, a.y - dy * 4, fl * 2, fl * 2, 0, PALETTE.fireCore, 0.9, TILE.blob, 1);
        }
        if (mine && a.pierce > 0) spr(a.x + dx * 14, a.y + dy * 14, 52, 52, 0, PALETTE.bubble, 0.4, TILE.blob, 1);
      }
      for (let i = n; i < CAP; i++) seq[i] = -1;

      for (const p of parts) {
        p.mesh.count = p.n;
        p.mesh.instanceMatrix.needsUpdate = true;
        if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
        p.fade.needsUpdate = true;
      }
      for (let i = nBombs; i < bombs.length; i++) bombs[i]!.visible = false;
      for (let i = nOrbs; i < orbs.length; i++) orbs[i]!.visible = false;
      sprites.hideRange(nSprites, lastSprites);
      lastSprites = nSprites;
      sprites.commit();
      trails.commit();
    },
  };
}
