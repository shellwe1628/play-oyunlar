/**
 * The forged bow's glow, by level (`bowGlow(level)`, seven bands). A port of the 2D game's
 * scenes/aura.ts onto the real 3D bow, component by component:
 *
 * - sheen: a bright band sliding along the limbs, drawn by the bow's own material (patched with
 *   `onBeforeCompile`), plus a small glint riding it;
 * - aura: the bow's surface lights up in the band's colour (emissive + rim light in the same
 *   shader patch) and a soft ribbon hugs the limbs from tip through grip to tip;
 * - flame: tongues licking up and back off the limbs;
 * - motes: wisps and embers peeling off the tips and limbs, trailing behind a moving bow;
 * - core: a white-hot line along the limbs;
 * - light: a real point light in the band's colour on the archer and the ledge;
 * - cycle: at the top band the colour runs through the rainbow, along the limbs and in time.
 *
 * It flares on every shot and surges on headshots, multi-kills, streaks and focus, as in
 * GameScene. Only the player's bow glows (enemies and bosses never do in the 2D game either).
 * Everything follows `archers.bowOf(player)`: the limb tips and the grip, every frame.
 */
import * as THREE from 'three';
import { PALETTE } from '@okcu/textures';
import { bowGlow, type BowGlow } from '@sim/bow';
import { type ArchersView, type BowHandle, type Game, type Module, type Stage } from '../contract';
import { PX_PER_M } from '../coords';
import { hueColor, mixWhite, TILE } from './fx/atlas';
import { SpriteBatch } from './fx/batch';
import { Ribbons } from './fx/ribbons';

/** samples along the bow */
const N = 25;
const TONGUES = 9;
const INNER = 8;
const MOTES = 56;
/** how additive the coloured layers are: partly normal blend, so the band's colour survives a bright sky */
const ADD = 0.6;

// sprite slots
const S_LIGHT = 0;
const S_TONGUE = 1;
const S_INNER = S_TONGUE + TONGUES;
const S_SHEEN = S_INNER + INNER;
const S_TIP = S_SHEEN + 2;
const S_MOTE = S_TIP + 4;
const SPRITES = S_MOTE + MOTES;

const FRAG_DECL = /* glsl */ `
uniform vec3 uGlowColor;
uniform vec3 uGlowAmt;
uniform vec3 uGlowSheen;
uniform vec3 uGlowA;
uniform vec3 uGlowAxis;
uniform vec2 uGlowHue;
varying vec3 vGlowW;
float okcuHue(float n, float h) {
  float k = mod(n + h * 6.0, 6.0);
  return 1.0 - 0.65 * max(0.0, min(min(k, 4.0 - k), 1.0));
}
`;

const fragBody = (lit: boolean): string => /* glsl */ `
{
  float gS = clamp(dot(vGlowW - uGlowA, uGlowAxis), 0.0, 1.0);
  float gSheen = exp(-pow((gS - uGlowSheen.x) * 10.0, 2.0)) * uGlowSheen.y;
  float gFlow = 0.5 + 0.5 * sin(gS * 22.0 - uGlowSheen.z * 6.0);
  float gRim = ${lit ? 'pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 1.5)' : '0.5'};
  vec3 gCol = uGlowColor;
  if (uGlowHue.x > 0.5) {
    float h = fract(uGlowHue.y + gS * 0.45);
    gCol = pow(vec3(okcuHue(5.0, h), okcuHue(3.0, h), okcuHue(1.0, h)), vec3(2.2));
  }
  outgoingLight += gCol * (uGlowAmt.x * (0.6 + 0.4 * gFlow) + uGlowAmt.y * gRim) + vec3(1.0) * (gSheen + uGlowAmt.z * (0.3 + 0.7 * gRim));
}
`;

export function createBowGlow(stage: Stage, archers: ArchersView, game: Game): Module {
  const group = new THREE.Group();
  group.name = 'bowglow';
  stage.scene.add(group);
  /** the colour underlay sits behind the bow (depth-tested); the light of the glow draws on top */
  const halo = new Ribbons(N * 2 + 8, 3, true);
  const rib = new Ribbons(N * 6 + 16, 11);
  const spr = new SpriteBatch(SPRITES, 12);
  group.add(halo.mesh, rib.mesh, spr.mesh);

  // always in the scene (intensity 0 when unused), so the lit materials never recompile
  const light = new THREE.PointLight(0xffffff, 0, 4.5, 1.6);
  light.castShadow = false;
  group.add(light);

  const U = {
    uGlowColor: { value: new THREE.Color(0xffffff) },
    /** surface emissive, rim light, white-hot core */
    uGlowAmt: { value: new THREE.Vector3() },
    /** sheen position 0 … 1 along the bow, strength, time */
    uGlowSheen: { value: new THREE.Vector3() },
    uGlowA: { value: new THREE.Vector3() },
    /** (tipB − tipA) / |tipB − tipA|²: projects a world point to 0 … 1 along the bow */
    uGlowAxis: { value: new THREE.Vector3(0, 1, 0) },
    /** rainbow on / off, hue offset */
    uGlowHue: { value: new THREE.Vector2() },
  };
  const patched = new WeakSet<THREE.Material>();
  function patch(mat: THREE.Material): void {
    if (patched.has(mat)) return;
    patched.add(mat);
    const before = mat.onBeforeCompile.bind(mat);
    const key = mat.customProgramCacheKey.bind(mat);
    const lit = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    mat.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vGlowW;\nvoid main() {')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vGlowW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${FRAG_DECL}\nvoid main() {`)
        .replace('#include <opaque_fragment>', `${fragBody(lit)}\n#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => `${key()}|okcu-bowglow`;
    mat.needsUpdate = true;
  }

  // the bow's centre line this frame, scene metres
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pz = new Float32Array(N);
  const mx = new Float32Array(MOTES);
  const my = new Float32Array(MOTES);
  const mz = new Float32Array(MOTES);
  const mvx = new Float32Array(MOTES);
  const mvy = new Float32Array(MOTES);
  const mlife = new Float32Array(MOTES);
  const mmax = new Float32Array(MOTES);
  const msize = new Float32Array(MOTES);
  const grip = new THREE.Vector3();
  let next = 0;
  let emit = 0;
  let flareK = 0;
  let pendingFlare = 0;
  let lastX = 0;
  let lastY = 0;
  let hadBow = false;
  let time = 0;
  let level = -1;
  let glow: BowGlow = bowGlow(0);
  let facing = 1;
  /** metres per 2D pixel of bow (the 2D bow is 80 px tip to tip at size 1) */
  let s = 1 / PX_PER_M;
  let wasShown = false;

  function spawn(at: number, speed: number): void {
    const i = next;
    next = (next + 1) % MOTES;
    mx[i] = px[at]! + (Math.random() - 0.5) * 8 * s;
    my[i] = py[at]! + (Math.random() - 0.5) * 8 * s;
    mz[i] = pz[at]!;
    const a = Math.PI / 2 + (Math.random() - 0.5) * 1.4 + facing * 0.35;
    const v = (30 + Math.random() * 60) * s * speed;
    mvx[i] = Math.cos(a) * v;
    mvy[i] = Math.sin(a) * v;
    mmax[i] = mlife[i] = 0.5 + Math.random() * 0.7;
    msize[i] = (2.5 + Math.random() * 3) * (glow.band >= 4 ? 1.2 : 1);
  }

  function hideAll(): void {
    if (!wasShown) return;
    wasShown = false;
    spr.hideRange(0, SPRITES);
    spr.commit();
    halo.begin();
    halo.commit();
    rib.begin();
    rib.commit();
    mlife.fill(0);
    light.intensity = 0;
    U.uGlowAmt.value.set(0, 0, 0);
    U.uGlowSheen.value.y = 0;
    U.uGlowHue.value.x = 0;
    hadBow = false;
    flareK = 0;
    pendingFlare = 0;
  }

  return {
    update({ w, real, events }) {
      // a shot (≈ 1) or a headshot / streak / focus (≈ 2): the aura flares and throws off sparks
      for (const e of events) {
        if (e.t === 'shot') pendingFlare = Math.max(pendingFlare, e.over ? 1.4 : 1);
        else if (e.t === 'hit' && e.slowmo) pendingFlare = Math.max(pendingFlare, 2);
        else if (e.t === 'multi') pendingFlare = Math.max(pendingFlare, 2);
        else if (e.t === 'streak') pendingFlare = Math.max(pendingFlare, 2.2);
        else if (e.t === 'focus' && e.on) pendingFlare = Math.max(pendingFlare, 2.5);
      }
      if (game.bowLevel !== level) {
        level = game.bowLevel;
        glow = bowGlow(level);
      }
      const gl = glow;
      const p = w.player;
      const h: BowHandle | null = gl.band > 0 && p.alive && !p.gone ? archers.bowOf(p.id) : null;
      const mesh = h?.meshes[0];
      if (!h || !mesh || !mesh.visible) {
        hideAll();
        return;
      }
      wasShown = true;
      for (const bm of h.meshes) {
        if (Array.isArray(bm.material)) for (const one of bm.material) patch(one);
        else patch(bm.material);
      }

      const dt = real;
      time += dt;
      const t = time;
      facing = p.facing >= 0 ? 1 : -1;

      // ---------------------------------------------------------------- the bow's shape
      const t1 = h.tips[0];
      const t2 = h.tips[1];
      h.grip.getWorldPosition(grip);
      const span = t1.distanceTo(t2) || 1;
      s = span / 80;
      // the same quadratic the 2D limbs are drawn with: through both tips and the grip
      const cx = 2 * grip.x - (t1.x + t2.x) / 2;
      const cy = 2 * grip.y - (t1.y + t2.y) / 2;
      const cz = 2 * grip.z - (t1.z + t2.z) / 2;
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        const u = 1 - k;
        px[i] = u * u * t1.x + 2 * u * k * cx + k * k * t2.x;
        py[i] = u * u * t1.y + 2 * u * k * cy + k * k * t2.y;
        pz[i] = u * u * t1.z + 2 * u * k * cz + k * k * t2.z;
      }
      // the bow's back (away from the string): tongues lick outward and up from it
      let nx = grip.x - (t1.x + t2.x) / 2;
      let ny = grip.y - (t1.y + t2.y) / 2;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;

      if (pendingFlare > 0) {
        flareK = Math.max(flareK, pendingFlare);
        for (let i = 0; i < Math.round(6 * pendingFlare + gl.motes / 4); i++) spawn(i % 2 === 0 ? 0 : N - 1, 1.6 * pendingFlare);
        pendingFlare = 0;
      }
      flareK = Math.max(0, flareK - dt * 2.2);
      const flare = flareK;
      const drawn = p.draw;
      const hue = (t * 0.25) % 1;
      const col = gl.cycle ? hueColor(hue) : gl.color;
      const breathe = 0.85 + Math.sin(t * 3.1) * 0.1 + Math.sin(t * 7.3) * 0.05;
      const power = gl.aura * breathe * (1 + 0.25 * drawn + 0.6 * flare);
      const colAt = (i: number): number => (gl.cycle ? hueColor((hue + (i / (N - 1)) * 0.45) % 1) : col);

      // ---------------------------------------------------------------- the bow's own surface
      U.uGlowColor.value.setHex(col);
      U.uGlowAmt.value.set((0.05 + 0.5 * gl.aura) * breathe * (1 + 0.8 * flare), (0.35 + 1.5 * gl.aura) * breathe * (1 + 0.6 * flare), 0.28 * gl.core * breathe * (1 + flare));
      U.uGlowSheen.value.set((Math.sin(t * 2.2) + 1) / 2, 0.9 * gl.sheen * (gl.core > 0 ? 0.5 : 1), t);
      U.uGlowA.value.copy(t1);
      U.uGlowAxis.value.subVectors(t2, t1).divideScalar(span * span);
      U.uGlowHue.value.set(gl.cycle ? 1 : 0, hue);

      // ---------------------------------------------------------------- ribbons along the limbs
      halo.begin();
      rib.begin();
      // underlay: the band's colour, softly, so it shows on a white sky as well as a dark one
      halo.strip();
      const underA = Math.min(0.5, 0.12 + 0.25 * gl.aura);
      for (let i = 0; i < N; i++) {
        const end = Math.sin((i / (N - 1)) * Math.PI) ** 0.35;
        halo.point(px[i]!, py[i]!, pz[i]! - 0.06, (14 + 18 * gl.aura) * s * (0.55 + 0.45 * end), colAt(i), underA * 1.25, 0, 1);
      }
      // the aura hugging the limbs
      rib.strip();
      const auraA = Math.min(0.55, 0.2 + 0.3 * power) * (gl.band === 1 ? 0.85 : 1) * (gl.cycle ? 0.8 : 1);
      for (let i = 0; i < N; i++) {
        const end = Math.sin((i / (N - 1)) * Math.PI) ** 0.3;
        const flick = 1 + Math.sin(t * 11 + i * 0.85) * 0.12;
        const r = (8 + 11 * gl.aura) * s * (0.5 + 0.5 * end) * flick * (1 + 0.3 * flare);
        rib.point(px[i]!, py[i]!, pz[i]!, r, colAt(i), auraA, ADD, 1);
      }
      if (gl.core > 0) {
        // a white-hot core along the bow's edge
        rib.strip();
        const coreA = Math.min(0.9, 0.55 * gl.core * breathe * (1 + flare));
        for (let i = 0; i < N; i++) {
          const end = Math.sin((i / (N - 1)) * Math.PI) ** 0.3;
          const r = (2 + 1.8 * gl.core) * s * end * (1 + Math.sin(t * 13 + i * 1.2) * 0.15);
          rib.point(px[i]!, py[i]!, pz[i]!, r, gl.cycle ? mixWhite(colAt(i), 0.8) : mixWhite(col, 0.75), coreA, 1, 0.6);
        }
      }
      if (gl.band >= 4) {
        // two strands of energy winding round the limbs
        const amp = (3 + 3.5 * gl.aura) * s;
        for (let strand = 0; strand < 2; strand++) {
          rib.strip();
          for (let i = 0; i < N; i++) {
            const k = i / (N - 1);
            const ph = k * 15 - t * 4.2 + strand * Math.PI;
            const off = Math.sin(ph) * amp * Math.sin(k * Math.PI) ** 0.5;
            // only the half of the turn that is "in front" shines, so it reads as a helix
            const front = 0.35 + 0.65 * Math.max(0, Math.cos(ph));
            rib.point(px[i]! + nx * off, py[i]! + ny * off, pz[i]!, 1.2 * s * (0.4 + front), gl.cycle ? colAt((i + 8) % N) : mixWhite(col, 0.45), 0.55 * front * Math.min(1, power), 1, 0.4);
          }
        }
      }
      halo.commit();
      rib.commit();

      // ---------------------------------------------------------------- sprites
      // flame tongues rising along the limbs
      const lean = Math.atan2(-(nx * 0.55 - facing * 0.2), ny * 0.55 + 0.75);
      for (let i = 0; i < TONGUES; i++) {
        if (gl.flame <= 0) {
          spr.hide(S_TONGUE + i);
          continue;
        }
        const k = (i + 0.5) / TONGUES;
        const at = Math.min(N - 1, Math.round(k * (N - 1)));
        const ph = (t * 1.7 + i * 0.37) % 1;
        const hgt = (0.45 + 0.55 * Math.sin(ph * Math.PI)) * gl.flame * (1 + 0.5 * flare);
        const rot = lean + Math.sin(t * 6 + i * 2.3) * 0.25;
        const wdt = 32 * (0.5 + 0.3 * gl.flame) * s * 0.8;
        const len = 96 * hgt * 0.72 * (0.8 + 0.4 * gl.aura) * s;
        const bx = px[at]! + nx * 3 * s;
        const by = py[at]! + ny * 3 * s;
        spr.put(S_TONGUE + i, bx - Math.sin(rot) * len * 0.3, by + Math.cos(rot) * len * 0.3, pz[at]!, wdt, len, rot, colAt(at), Math.min(0.55, 0.22 + 0.3 * power) * (1 - ph * 0.5) * (gl.cycle ? 0.8 : 1), TILE.tongue, ADD);
      }
      // a hotter, quicker inner flame from the azure band up
      for (let i = 0; i < INNER; i++) {
        if (gl.flame < 0.8) {
          spr.hide(S_INNER + i);
          continue;
        }
        const k = (i + 0.5) / INNER;
        const at = Math.min(N - 1, Math.round(k * (N - 1)));
        const ph = (t * 2.9 + i * 0.61) % 1;
        const hgt = (0.3 + 0.5 * Math.sin(ph * Math.PI)) * gl.flame * (1 + 0.5 * flare);
        const rot = lean + Math.sin(t * 9 + i * 1.7) * 0.3;
        const len = 96 * hgt * 0.45 * s;
        spr.put(S_INNER + i, px[at]! - Math.sin(rot) * len * 0.3, py[at]! + Math.cos(rot) * len * 0.3, pz[at]!, 9 * s, len, rot, mixWhite(colAt(at), 0.35), 0.3 * (1 - ph * 0.6) * Math.min(1, power), TILE.tongue, 0.8);
      }
      // the sheen's glint, sliding up and down the limbs (the lower bands' signature)
      for (let i = 0; i < 2; i++) {
        if (gl.sheen <= 0 || gl.core > 0) {
          spr.hide(S_SHEEN + i);
          continue;
        }
        const k = i === 0 ? (Math.sin(t * 2.2) + 1) / 2 : (Math.sin(t * 2.2 + Math.PI) + 1) / 2;
        const f = k * (N - 1);
        const a0 = Math.min(N - 2, Math.floor(f));
        const fr = f - a0;
        const x = px[a0]! + (px[a0 + 1]! - px[a0]!) * fr;
        const y = py[a0]! + (py[a0 + 1]! - py[a0]!) * fr;
        const strength = 0.85 * gl.sheen;
        const size = (i === 0 ? 22 : 11) * s;
        spr.put(S_SHEEN + i, x, y, pz[a0]!, size, size, t * (i === 0 ? 1.3 : -1.7), PALETTE.white, strength * (i === 0 ? 1 : 0.7), i === 0 ? TILE.glint : TILE.blob, 1);
      }
      // the tips burn brightest: a star on each from the golden band up
      for (let i = 0; i < 2; i++) {
        const at = i === 0 ? 0 : N - 1;
        if (gl.core <= 0) {
          spr.hide(S_TIP + i);
          spr.hide(S_TIP + 2 + i);
          continue;
        }
        const tw = 1 + Math.sin(t * 8 + i * 2) * 0.2;
        const size = (12 + 9 * gl.core) * s * tw;
        // a glint only while the bow flares (a shot, a headshot, a streak)
        spr.put(S_TIP + i, px[at]!, py[at]!, pz[at]!, size * 2.2 * Math.min(1.3, flare), size * 2.2 * Math.min(1.3, flare), t * (i === 0 ? 0.9 : -0.9), mixWhite(colAt(at), 0.6), Math.min(1, flare), TILE.glint, 1);
        spr.put(S_TIP + 2 + i, px[at]!, py[at]!, pz[at]!, size, size, 0, mixWhite(colAt(at), 0.4), 0.45, TILE.blob, 1);
      }
      // light cast on the archer and the ledge
      if (gl.light > 0) {
        const lk = gl.light * breathe * (1 + 0.5 * flare);
        const r = 150 * s * 2.2;
        spr.put(S_LIGHT, grip.x, grip.y - 20 * s, grip.z, r, r, 0, col, lk * 0.16, TILE.blob, 1);
        light.color.setHex(col);
        light.intensity = lk * 9;
        light.position.set(grip.x + nx * 0.15, grip.y, grip.z + 0.7);
      } else {
        spr.hide(S_LIGHT);
        light.intensity = 0;
      }

      // wisps and embers: peel off the tips and limbs, and stream behind a moving bow
      const vx = hadBow && dt > 0 ? (grip.x - lastX) / dt : 0;
      const vy = hadBow && dt > 0 ? (grip.y - lastY) / dt : 0;
      const moving = Math.min(1, Math.hypot(vx, vy) / (300 * s));
      lastX = grip.x;
      lastY = grip.y;
      hadBow = true;
      emit += dt * gl.motes * (1 + 2 * moving + 2 * flare);
      let budget = 12;
      while (emit >= 1 && budget-- > 0) {
        emit -= 1;
        const r = Math.random();
        spawn(r < 0.3 ? 0 : r < 0.6 ? N - 1 : Math.floor(Math.random() * N), 1);
      }
      if (emit > 1) emit = 1;
      const drag = Math.exp(-dt * 1.5);
      for (let i = 0; i < MOTES; i++) {
        if (mlife[i]! <= 0) {
          spr.hide(S_MOTE + i);
          continue;
        }
        mlife[i] = mlife[i]! - dt;
        mvx[i] = mvx[i]! * drag - vx * 0.02 * dt * 60;
        mvy[i] = (mvy[i]! + 20 * s * dt) * drag - vy * 0.02 * dt * 60;
        mx[i] = mx[i]! + mvx[i]! * dt + Math.sin(t * 5 + i) * 10 * s * dt;
        my[i] = my[i]! + mvy[i]! * dt;
        const k = Math.max(0, mlife[i]! / mmax[i]!);
        const size = msize[i]! * (0.5 + 0.5 * k) * 4.2 * s;
        const c = gl.cycle ? hueColor((hue + i / MOTES) % 1) : k > 0.6 && gl.core > 0 ? mixWhite(col, 0.5) : col;
        // every third ember is a sparkle from the golden band up
        const star = gl.core > 0 && i % 5 === 0;
        spr.put(S_MOTE + i, mx[i]!, my[i]!, mz[i]!, star ? size * 1.35 : size, star ? size * 1.35 : size, star ? t * 3 + i : 0, c, Math.min(1, k * 1.3), star ? TILE.glint : TILE.blob, star ? 1 : 0.8);
      }
      spr.commit();
    },
  };
}
