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
 * motion, and trauma shake with the same numbers as `@oyun/core` juice (trauma², decay 1.6 / s,
 * 22 px, 0.035 rad). `toScreen` / `toLogical` go through the camera matrices, so they stay right
 * during all of it.
 */
import * as THREE from 'three';
import { PLAYER_LEDGE, PLAYER_X } from '@sim/tuning';
import type { Frame, Stage } from '../contract';
import { FRAME_H, FRAME_W, LOGICAL_H, LOGICAL_W, PX_PER_M } from '../coords';

/** vertical field of view of the resting frame, degrees (gentle perspective) */
export const FOV = 22;
/** eye height above the frame centre, metres */
export const EYE_LIFT = 4.2;
/** distance from the resting eye to the gameplay plane, metres */
export const REST_DIST = FRAME_H / 2 / Math.tan((FOV / 2) * (Math.PI / 180));
const NEAR = 2;
const FAR = 600;
/** names other modules of this renderer can look the lights up by (the arena tints them per world) */
export const SUN_NAME = 'okcu-sun';
export const HEMI_NAME = 'okcu-hemi';

const SHAKE_DECAY = 1.6;
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

  // ---- camera state (logical px, like the 2D game's world layer)
  let zoom = 0;
  let punch = 0;
  let focusX = LOGICAL_W / 2;
  let focusY = LOGICAL_H / 2;
  let pushX = 0;
  let pushY = 0;
  let slowT = 0;
  let trauma = 0;
  let shakeT = 0;
  let clock = 0;
  let cssW = 1;
  let cssH = 1;

  /** Aim the frustum: the plane-z=0 window centred on logical (cx, cy), 1 / z of the frame in size. */
  function frameCamera(cx: number, cy: number, z: number, roll: number, swayX: number, swayY: number): void {
    const wx = (cx - LOGICAL_W / 2) / PX_PER_M;
    const wy = (LOGICAL_H / 2 - cy) / PX_PER_M;
    const hw = FRAME_W / 2 / z;
    const hh = FRAME_H / 2 / z;
    const d = dist0 / z;
    const ex = wx + swayX;
    const ey = wy + EYE_LIFT + swayY;
    camera.position.set(ex, ey, d);
    camera.rotation.set(0, 0, roll);
    const k = NEAR / d;
    // the window's centre as the (rolled) camera sees it: the roll turns the view about the
    // window's centre, like the 2D camera, not about the lifted eye
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const lx = (wx - ex) * c + (wy - ey) * s;
    const ly = -(wx - ex) * s + (wy - ey) * c;
    camera.projectionMatrix.makePerspective((lx - hw) * k, (lx + hw) * k, (ly + hh) * k, (ly - hh) * k, NEAR, FAR);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld(true);
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
          if (e.slowmo) {
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
          }
          break;
        case 'focus':
          if (e.on) slowT = Math.max(slowT, 0.18);
          break;
        case 'dying':
          slowT = 0.35;
          zoom = 0.12;
          focusX = PLAYER_X;
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
    shake(strength) {
      trauma = Math.min(1, Math.max(0, trauma + strength));
    },
    render(frame) {
      const real = frame.real;
      clock += real;
      readEvents(frame);

      // zoom holds through the slow motion, then eases back; the push springs back
      slowT = Math.max(0, slowT - real);
      zoom += (0 - zoom) * Math.min(1, real * (slowT > 0 ? 0.3 : 4));
      pushX += (0 - pushX) * Math.min(1, real * 7);
      pushY += (0 - pushY) * Math.min(1, real * 7);
      const z = 1 + zoom + punch;
      punch = Math.max(0, punch - real * 0.25);

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
      const layerX = focusX * (1 - z) + (LOGICAL_W / 2 - focusX) * k + pushX;
      const layerY = focusY * (1 - z) + (LOGICAL_H / 2 - focusY) * k + pushY;
      const cx = (LOGICAL_W / 2 - layerX + offX) / z;
      const cy = (LOGICAL_H / 2 - layerY + offY) / z;
      // a slow idle sway of the eye: the gameplay plane stays put, depth gets parallax
      const swayX = Math.sin(clock * 0.23) * 0.5 + Math.sin(clock * 0.11 + 1.7) * 0.22;
      const swayY = Math.sin(clock * 0.17 + 0.6) * 0.16;
      frameCamera(cx, cy, z, roll, swayX, swayY);

      renderer.render(scene, camera);
    },
  };
}
