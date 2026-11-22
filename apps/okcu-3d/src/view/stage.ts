/**
 * Stage: renderer, lights and shadows, and the camera.
 *
 * The camera is an off-axis ("lens shift") perspective camera. Its frustum is rebuilt every frame
 * so that a window of the gameplay plane z = 0 fills the stage element exactly; at rest that
 * window is the logical 720 × 1280 frame, so logical px ↔ CSS px stay exact for the DOM overlay
 * and pointer input. The eye sits above the frame centre (ledge tops are seen from above) and
 * sways slowly: the z = 0 plane does not move on screen, everything with depth gets parallax.
 *
 * Camera feel mirrors the 2D game's GameScene.updateCamera: a kick against each shot, a small
 * punch, a zoom toward headshots / boss knockouts / the player's fall that holds through the slow
 * motion, and trauma shake with the same numbers as `@oyun/core` juice (trauma², decay 2.4 / s here, capped at 0.75, one per frame,
 * 22 px, 0.035 rad). `toScreen` / `toLogical` go through the camera matrices, so they stay right
 * during all of it.
 *
 * On top of the 2D game's camera: a boss's entrance (the camera eases in on the boss as it lands
 * and holds, then glides back), the wave's finishing knockout (a slow push-in on the last enemy
 * that falls), a nudge with each gust and a small punch at a stage clear. Reduced motion (the
 * system's prefers-reduced-motion, or ?calm=1) keeps a quarter of the shake and half the zooms.
 * All of it reads the frame's events and the world; none of it feeds back into the simulation.
 *
 * A grown field (hard: from chapter 2, the sim's `w.span`, chapters.ts `fieldSpan`) widens the resting
 * window to `span` times the frame, anchored at the bottom left where the player stands, so the
 * farthest island still fits a portrait phone; the camera glides out to it as the wave drops in.
 * Every effect above works on top of that base view, in its screen space.
 *
 * Camera angles (view/angles.ts): Side, Angled and Low are eye offsets on top of all of the above.
 * The plane z = 0 does not move on screen for any of them (the lens shift), so aiming, the pointer
 * and the DOM overlay are the same on every angle; only things with depth are seen from another
 * side. The offset scales with the eye's distance, so the direction holds through the zooms and
 * the grown field. The player's choice glides in over ANGLE_GLIDE (reduced motion: a cut) and is
 * remembered (localStorage, not the game save; ?angle=side|angled|low overrides it for a test).
 * A boss's entrance and a boss's knockout swing the eye from Low to Side under their zoom and end
 * on the player's angle: never while a shot is being aimed, never with reduced motion.
 * The backdrop is authored for the Side eye with narrow margins, so it is sheared by the same
 * offset (backdropShear): it looks exactly as it does from the Side and never shows an edge.
 */
import * as THREE from 'three';
import { PLAYER_LEDGE } from '@sim/tuning';
import type { Frame, Stage } from '../contract';
import { FRAME_H, FRAME_W, LOGICAL_H, LOGICAL_W, PX_PER_M } from '../coords';
import { ANGLE_GLIDE, ANGLES, backdropShear, CINE_ENTRANCE, CINE_KNOCKOUT, cineEye, lensShift, mixEye, parseAngle, type CameraAngle, type Eye, type Lens } from './angles';

/** vertical field of view of the resting frame, degrees (gentle perspective) */
export const FOV = 22;
/** eye height above the frame centre, metres */
export const EYE_LIFT = 4.2;
/**
 * The main menu's framing (`Stage.menu`): the player's archer (its middle, MENU_LIFT logical px
 * over the ledge) lands at MENU_AT on the logical frame, MENU_ZOOM times closer, in the free band
 * between the chapter card and PLAY, right of the side buttons. Checked with tools/menu-shots.mjs.
 */
export const MENU_ZOOM = 1.32;
export const MENU_LIFT = 92;
export const MENU_AT = { x: 330, y: 760 } as const;
/** distance from the resting eye to the gameplay plane, metres */
export const REST_DIST = FRAME_H / 2 / Math.tan((FOV / 2) * (Math.PI / 180));
const NEAR = 2;
const FAR = 600;
/** names other modules of this renderer can look the lights up by (the arena tints them per world) */
export const SUN_NAME = 'okcu-sun';
export const HEMI_NAME = 'okcu-hemi';
/** the backdrop's root group (arena/backdrop.ts names it); the stage shears it against the camera angle */
const BACKDROP_NAME = 'okcu-backdrop';
/** where the chosen camera angle is kept (a presentation setting, not part of the game save) */
const ANGLE_KEY = 'oyun:okcu-3d:angle';

/** reduced motion: the system setting, or ?calm=1 */
export const CALM =
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || new URLSearchParams(location.search).get('calm') === '1';

/** trauma fades this much a second (the 2D game's 1.6 kept a barrage shaking non-stop) */
const SHAKE_DECAY = 2.4;
/** the most trauma there can be (a quarter less than juice's 1) */
const TRAUMA_MAX = 0.75;
const SHAKE_OFFSET = 22;
const SHAKE_ROLL = 0.035;

export function createStage(root: HTMLElement): Stage {
  const overlay = root.querySelector<HTMLElement>('#overlay')!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3fb4ff);

  // one cheap sky/ground fill and one shadow-casting key light from the upper front left
  const hemi = new THREE.HemisphereLight(0xdff1ff, 0x8a7a66, 1.25);
  hemi.name = HEMI_NAME;
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.name = SUN_NAME;
  sun.position.set(-5.5, 13.5, 10);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 2048);
  const sc = sun.shadow.camera;
  sc.left = -7.2;
  sc.right = 7.2;
  sc.top = 9.4;
  sc.bottom = -9.4;
  sc.near = 4;
  sc.far = 46;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2.2;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(FOV, 9 / 16, NEAR, FAR);
  camera.matrixAutoUpdate = true;
  const dist0 = REST_DIST;

  // ---- the camera angle: ?angle= for a test, else the remembered choice, else Side
  const urlAngle = parseAngle(new URLSearchParams(location.search).get('angle'));
  let stored: CameraAngle | null = null;
  try {
    stored = parseAngle(localStorage.getItem(ANGLE_KEY));
  } catch {
    /* no storage: the choice lasts for the session */
  }
  let angle: CameraAngle = urlAngle ?? stored ?? 'side';
  /** the eye offset in use (metres at the resting distance), and the glide that leads to the chosen angle */
  const eye: Eye = { ...ANGLES[angle] };
  const glideFrom: Eye = { ...eye };
  let glideK = 1;
  /** the chosen angle's eye this frame (mid-glide: on its way) */
  const baseEye: Eye = { ...eye };
  /** a cinematic swing in progress: real seconds in, of how many (0: none) */
  let cineT = 0;
  let cineLen = 0;
  const lens: Lens = { l: 0, r: 0, t: 0, b: 0 };
  // the backdrop hangs in a sheared group, so it keeps its Side look whatever the eye does
  const shearGroup = new THREE.Group();
  shearGroup.name = 'okcu-backdrop-shear';
  shearGroup.matrixAutoUpdate = false;
  scene.add(shearGroup);
  let backdropIn = false;
  const shear: Eye = { x: 0, y: 0 };
  let shearX = 0;
  let shearY = 0;

  // ---- camera state (logical px, like the 2D game's world layer)
  let zoom = 0;
  let punch = 0;
  let focusX = LOGICAL_W / 2;
  let focusY = LOGICAL_H / 2;
  let pushX = 0;
  let pushY = 0;
  let slowT = 0;
  /** a camera move that eases IN to `introZoom` on (focusX, focusY) and holds while > 0 (real s) */
  let introT = 0;
  let introZoom = 0;
  let trauma = 0;
  /** the strongest shake asked for since the last frame */
  let shakeAsk = 0;
  let shakeT = 0;
  let clock = 0;
  let cssW = 1;
  let cssH = 1;
  /** the field's size as shown (eases to the world's span) */
  let span = 1;
  let spanWorld: unknown = null;
  /** the menu framing: wanted (Stage.menu) and how far in it is, 0 … 1 */
  let menuOn = false;
  let menuK = 0;

  /** Aim the frustum: the plane-z=0 window centred on logical (cx, cy), 1 / z of the frame in size. */
  function frameCamera(cx: number, cy: number, z: number, roll: number, swayX: number, swayY: number): void {
    const wx = (cx - LOGICAL_W / 2) / PX_PER_M;
    const wy = (LOGICAL_H / 2 - cy) / PX_PER_M;
    const hw = FRAME_W / 2 / z;
    const hh = FRAME_H / 2 / z;
    const d = dist0 / z;
    // the angle's offset grows with the distance: the same direction at every zoom
    const ex = wx + swayX + eye.x / z;
    const ey = wy + EYE_LIFT + swayY + eye.y / z;
    camera.position.set(ex, ey, d);
    camera.rotation.set(0, 0, roll);
    // the window's centre as the (rolled) camera sees it: the roll turns the view about the
    // window's centre, like the 2D camera, not about the lifted eye
    lensShift(wx, wy, hw, hh, ex, ey, d, roll, NEAR, lens);
    camera.projectionMatrix.makePerspective(lens.l, lens.r, lens.t, lens.b, NEAR, FAR);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld(true);
  }

  /** The eye for this frame: the glide to the chosen angle, or a cinematic swing over it. */
  function stepEye(frame: Frame): void {
    const real = frame.real;
    if (glideK < 1) glideK = CALM ? 1 : Math.min(1, glideK + real / ANGLE_GLIDE);
    mixEye(glideFrom, ANGLES[angle], glideK, baseEye);
    if (cineLen > 0 && (frame.aim || frame.w.phase === 'title')) {
      // a shot is being aimed (or the run is gone): let go of the swing, glide home from where the eye is
      cineLen = 0;
      glideFrom.x = eye.x;
      glideFrom.y = eye.y;
      glideK = 0;
      mixEye(glideFrom, ANGLES[angle], glideK, baseEye);
    }
    if (cineLen > 0) {
      cineT += real;
      if (cineT >= cineLen) cineLen = 0;
    }
    if (cineLen > 0) cineEye(cineT, cineLen, baseEye, eye);
    else {
      eye.x = baseEye.x;
      eye.y = baseEye.y;
    }
    // the backdrop: adopt it once the arena has made it, then lean it against the eye
    if (!backdropIn) {
      const root = scene.children.find((o) => o.name === BACKDROP_NAME);
      if (root) {
        shearGroup.add(root);
        backdropIn = true;
      }
    }
    backdropShear(eye, dist0, shear);
    if (shear.x !== shearX || shear.y !== shearY) {
      shearX = shear.x;
      shearY = shear.y;
      // x += shearX · z, y += shearY · z
      shearGroup.matrix.elements[8] = shearX;
      shearGroup.matrix.elements[9] = shearY;
      shearGroup.matrixWorldNeedsUpdate = true;
    }
  }

  /** A cinematic swing (Low to Side, home to the chosen angle): not with reduced motion, not while aiming. */
  function swing(frame: Frame, seconds: number): void {
    if (CALM || frame.aim) return;
    cineT = 0;
    cineLen = seconds;
  }

  function resize(): void {
    cssW = Math.max(1, root.clientWidth);
    cssH = Math.max(1, root.clientHeight);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
  }
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(root);
  resize();
  frameCamera(LOGICAL_W / 2, LOGICAL_H / 2, 1, 0, 0, 0);

  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function readEvents(frame: Frame): void {
    for (const e of frame.events) {
      switch (e.t) {
        case 'shot': {
          // the world kicks back against the shot and springs home
          const k = e.over ? 40 : 26;
          pushX = -Math.cos(e.angle) * k;
          pushY = -Math.sin(e.angle) * k;
          punch = e.over ? 0.06 : 0.035;
          if (zoom < 0.02) {
            focusX = e.x;
            focusY = e.y;
          }
          break;
        }
        case 'hit':
          if (e.slowmo && !e.extra) {
            slowT = 0.25;
            zoom = 0.26;
            focusX = e.x;
            focusY = e.y;
          }
          break;
        case 'ko':
          if (e.enemy === 'boss') {
            slowT = 0.3;
            zoom = 0.14;
            focusX = e.x;
            focusY = e.y;
            swing(frame, CINE_KNOCKOUT);
          } else if (frame.w.phase === 'play' || frame.w.phase === 'clear') {
            // the wave's finishing knockout: a slow push-in on the last one to fall
            if (frame.w.enemies.every((x) => !x.alive)) {
              introT = 0.55;
              introZoom = Math.max(zoom, 0.16);
              focusX = e.x;
              focusY = e.y;
            }
          }
          break;
        case 'waveStart': {
          // a boss's entrance: ease in on it as it lands, hold, then glide back (only a boss that
          // really drops in: a rush's first boss already stands when the first arrow flies)
          const boss = e.boss ? frame.w.enemies.find((x) => x.type === 'boss' && x.brain === 'spawn') : undefined;
          if (boss) {
            const L = frame.w.ledges[boss.ledge];
            introT = 1.35;
            introZoom = 0.2;
            focusX = boss.anchorX;
            focusY = (L ? L.y : boss.anchorY) - 110;
            swing(frame, CINE_ENTRANCE);
          }
          break;
        }
        case 'waveClear':
          punch = Math.max(punch, 0.045);
          break;
        case 'gust':
          // the whole view leans into the new wind for a moment
          pushX = Math.sign(e.wind) * 20;
          break;
        case 'eruption':
          pushY = -14;
          break;
        case 'focus':
          if (e.on) slowT = Math.max(slowT, 0.18);
          break;
        case 'dying':
          slowT = 0.35;
          zoom = 0.12;
          // (a sliding base carries the player: follow it)
          focusX = frame.w.player.anchorX;
          focusY = PLAYER_LEDGE.y - 150;
          break;
        default:
      }
    }
  }

  return {
    root,
    overlay,
    scene,
    camera,
    renderer,
    toScreen(x, y) {
      v.set((x - LOGICAL_W / 2) / PX_PER_M, (LOGICAL_H / 2 - y) / PX_PER_M, 0).project(camera);
      return { x: (v.x * 0.5 + 0.5) * cssW, y: (0.5 - v.y * 0.5) * cssH };
    },
    toLogical(clientX, clientY) {
      const r = root.getBoundingClientRect();
      const nx = ((clientX - r.left) / r.width) * 2 - 1;
      const ny = 1 - ((clientY - r.top) / r.height) * 2;
      // the ray through that pixel, met with the gameplay plane z = 0
      v.set(nx, ny, 0.5).unproject(camera);
      dir.copy(v).sub(camera.position);
      const t = -camera.position.z / dir.z;
      const px = camera.position.x + dir.x * t;
      const py = camera.position.y + dir.y * t;
      return { x: px * PX_PER_M + LOGICAL_W / 2, y: LOGICAL_H / 2 - py * PX_PER_M };
    },
    menu(on) {
      menuOn = on;
    },
    get angle() {
      return angle;
    },
    setAngle(next) {
      if (next === angle) return;
      angle = next;
      // glide from wherever the chosen-angle eye is now (a switch mid-glide does not jump)
      glideFrom.x = baseEye.x;
      glideFrom.y = baseEye.y;
      glideK = CALM ? 1 : 0;
      try {
        localStorage.setItem(ANGLE_KEY, next);
      } catch {
        /* no storage: the choice lasts for the session */
      }
    },
    shake(strength) {
      // shakes asked for in one frame do not stack: the strongest one counts (a barrage's dozen hits)
      shakeAsk = Math.max(shakeAsk, strength);
    },
    render(frame) {
      const real = frame.real;
      clock += real;
      readEvents(frame);
      stepEye(frame);
      if (shakeAsk > 0) {
        trauma = Math.min(TRAUMA_MAX, Math.max(0, trauma + shakeAsk * (CALM ? 0.25 : 1)));
        shakeAsk = 0;
      }

      // zoom holds through the slow motion (or eases in during a camera move), then eases back; the push springs back
      slowT = Math.max(0, slowT - real);
      if (introT > 0) {
        introT = Math.max(0, introT - real);
        zoom += (introZoom * (CALM ? 0.5 : 1) - zoom) * Math.min(1, real * 3.2);
      } else zoom += (0 - zoom) * Math.min(1, real * (slowT > 0 ? 0.3 : 2.6));
      pushX += (0 - pushX) * Math.min(1, real * 7);
      pushY += (0 - pushY) * Math.min(1, real * 7);
      const z = 1 + zoom + punch;
      punch = Math.max(0, punch - real * 0.25);
      // the base view: a new run starts at its own size, a grown field eases out
      const goal = frame.w.span;
      if (frame.w !== spanWorld) {
        spanWorld = frame.w;
        span = goal;
      } else span += (goal - span) * Math.min(1, real * 1.8);
      if (Math.abs(goal - span) < 1e-3) span = goal;
      const base = 1 / span;
      const baseY = LOGICAL_H * (1 - base);
      const fx = focusX * base;
      const fy = baseY + focusY * base;

      let offX = 0;
      let offY = 0;
      let roll = 0;
      if (trauma > 0) {
        trauma = Math.max(0, trauma - SHAKE_DECAY * real);
        shakeT += real * 30;
        const s = trauma * trauma;
        offX = SHAKE_OFFSET * s * Math.sin(shakeT * 1.7);
        offY = SHAKE_OFFSET * s * Math.sin(shakeT * 2.3 + 1.3);
        roll = SHAKE_ROLL * s * Math.sin(shakeT * 1.1 + 0.7);
      }

      // same layer transform as the 2D game: screen = layer + p · z (− shake scroll)
      const k = zoom * 1.2;
      const layerX = fx * (1 - z) + (LOGICAL_W / 2 - fx) * k + pushX;
      const layerY = fy * (1 - z) + (LOGICAL_H / 2 - fy) * k + pushY;
      // the window centre in the base view's screen space, then back to logical px
      const cx = ((LOGICAL_W / 2 - layerX + offX) / z) / base;
      const cy = ((LOGICAL_H / 2 - layerY + offY) / z - baseY) / base;
      // a slow idle sway of the eye: the gameplay plane stays put, depth gets parallax
      const swayX = Math.sin(clock * 0.23) * 0.5 + Math.sin(clock * 0.11 + 1.7) * 0.22;
      const swayY = Math.sin(clock * 0.17 + 0.6) * 0.16;
      // the menu's framing: ease in on the player's archer (reduced motion: a cut)
      const goalK = menuOn && frame.w.phase === 'title' ? 1 : 0;
      menuK = CALM ? goalK : menuK + (goalK - menuK) * Math.min(1, real * 2.6);
      if (Math.abs(goalK - menuK) < 1e-3) menuK = goalK;
      let mx = cx;
      let my = cy;
      let mz = z * base;
      if (menuK > 0) {
        const e = menuK * menuK * (3 - 2 * menuK);
        const zm = mz * MENU_ZOOM;
        const px = frame.w.player.anchorX;
        const py = PLAYER_LEDGE.y - MENU_LIFT;
        mx += (px - (MENU_AT.x - LOGICAL_W / 2) / zm - cx) * e;
        my += (py - (MENU_AT.y - LOGICAL_H / 2) / zm - cy) * e;
        mz += (zm - mz) * e;
      }
      frameCamera(mx, my, mz, roll, swayX, swayY);

      renderer.render(scene, camera);
    },
  };
}
