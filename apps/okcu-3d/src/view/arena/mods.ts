/**
 * Stage modifiers in 3D (hard only, chapters.ts StageMod): the rock ceiling of a lowCeiling stage
 * (a slab of the world's rock with icicle-like teeth along its edge, exactly at `w.ceiling`, where
 * projectiles stop), the fog of a fog stage (mist that thickens away from the player; archers
 * still hidden in it are not drawn at all, see archers.ts) and the rail under a sliding base.
 * Each one eases in and out with its stage; nothing here feeds back into the simulation.
 */
import * as THREE from 'three';
import type { ArenaTheme as Theme } from './themes';
import { fieldRight, fieldTop } from '@sim/chapters';
import { PLAYER_LEDGE } from '@sim/tuning';
import { BASE_SLIDE, type World } from '@sim/world';
import { m, sx, sy } from '../../coords';
import { solidMat } from './ledges';
import { jitter, merge, seeded, shadeHex, solid } from './util';

/** the ceiling's slab reaches this far above the top of the view (px), and past both sides */
const CEIL_OVER = 420;
/** mist layers: depth (m), drift speed, peak opacity */
const MIST = [
  { z: -1.4, speed: 0.05, alpha: 0.5 },
  { z: 0.35, speed: -0.08, alpha: 0.42 },
  { z: 1.2, speed: 0.11, alpha: 0.3 },
] as const;
/** fog: mist starts this many px right of the player and is at its thickest by `full` */
const FOG_NEAR = 300;
const FOG_FULL = 620;

export interface ModsView {
  update(w: World, th: Theme, real: number, time: number): void;
}

/** Rock slab whose underside sits at y = 0 (scene metres), `width` m wide, with teeth hanging below. */
function ceilingGeometry(width: number, th: Theme, seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  const h = m(CEIL_OVER + 400);
  const slab = jitter(new THREE.BoxGeometry(width, h, 3.2, Math.ceil(width * 1.2), 6, 3), 0.012, seed).translate(0, h / 2, 0);
  parts.push(
    solid(slab, (out, p) => {
      // darker toward the edge it is seen by, a little banding up the face
      const k = THREE.MathUtils.clamp(p.y / 1.4, 0, 1);
      out.setHex(th.bodyDark).lerp(new THREE.Color(th.body), 0.3 + 0.4 * k * (0.75 + 0.25 * Math.sin(p.y * 7 + p.x)));
    }, true),
  );
  // teeth: stalactites of the same rock along the underside, in two rows
  for (let x = -width / 2 + 0.2; x < width / 2; x += 0.32 + rnd() * 0.3) {
    const len = 0.18 + rnd() * 0.42;
    const r = 0.07 + rnd() * 0.08;
    const z = (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 1.1);
    const cone = new THREE.ConeGeometry(r, len, 5).rotateX(Math.PI).translate(x, -len / 2 + 0.02, z);
    parts.push(solid(cone, shadeHex(th.bodyDark, 0.85), true));
  }
  // a dark lip line right at the stopping height, so the edge reads at phone size
  parts.push(solid(new THREE.BoxGeometry(width, 0.07, 3.3).translate(0, 0.02, 0), shadeHex(th.underDark, 0.6)));
  return merge(parts);
}

let mistTex: THREE.Texture | null = null;
/** A soft cloudy strip (tiles horizontally): white blobs, alpha only. */
function mistTexture(): THREE.Texture {
  if (mistTex) return mistTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const rnd = seeded(77);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * 256;
    const y = 20 + rnd() * 88;
    const r = 18 + rnd() * 34;
    for (const dx of [-256, 0, 256]) {
      const grad = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.32)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  mistTex = new THREE.CanvasTexture(c);
  mistTex.wrapS = THREE.RepeatWrapping;
  mistTex.colorSpace = THREE.SRGBColorSpace;
  return mistTex;
}

/** The fog's ramp: clear near the player, thick far away (a horizontal alpha gradient). */
function rampTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 0);
  // (an alpha map reads the green channel: an opaque black → white ramp)
  grad.addColorStop(0, 'rgb(0,0,0)');
  grad.addColorStop(0.35, 'rgb(140,140,140)');
  grad.addColorStop(1, 'rgb(255,255,255)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createMods(scene: THREE.Scene): ModsView {
  // ---- the ceiling
  const ceiling = new THREE.Mesh(new THREE.BufferGeometry(), solidMat);
  ceiling.receiveShadow = true;
  ceiling.visible = false;
  scene.add(ceiling);
  let ceilKey = '';
  let ceilShow = 0;
  let ceilY = 0;

  // ---- the fog: a wash over the far field plus drifting mist layers
  const ramp = rampTexture();
  const mists = MIST.map((l) => {
    const mat = new THREE.MeshBasicMaterial({ map: mistTexture().clone(), alphaMap: ramp, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
    mat.map!.wrapS = THREE.RepeatWrapping;
    mat.map!.repeat.set(2.5, 1);
    mat.map!.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 6;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, layer: l };
  });
  const washMat = new THREE.MeshBasicMaterial({ alphaMap: ramp, color: 0xdfe6ee, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), washMat);
  wash.renderOrder = 5;
  wash.visible = false;
  scene.add(wash);
  let fogShow = 0;

  // ---- the sliding base's rail
  const railMat = new THREE.MeshStandardMaterial({ color: 0x746c8a, roughness: 0.55, metalness: 0.1 });
  const rail = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8).rotateZ(Math.PI / 2), railMat);
  const stops = [0, 1].map(() => new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), railMat));
  rail.add(bar, ...stops);
  rail.visible = false;
  scene.add(rail);

  return {
    update(w, th, real, time) {
      // ceiling: built per stage (its width and the world's rock), slides down into place
      const on = w.stageMod === 'lowCeiling' && Number.isFinite(w.ceiling);
      if (on) {
        const key = `${w.seed}:${w.wave}:${w.theme}:${w.span}`;
        if (key !== ceilKey) {
          ceilKey = key;
          const width = m(fieldRight(w.span) + 2 * CEIL_OVER);
          ceiling.geometry.dispose();
          ceiling.geometry = ceilingGeometry(width, th, w.wave * 31 + w.theme);
          ceilY = w.ceiling;
        }
      }
      ceilShow = on ? Math.min(1, ceilShow + real / 0.6) : Math.max(0, ceilShow - real / 0.4);
      ceiling.visible = ceilShow > 0;
      if (ceiling.visible) {
        const k = 1 - (1 - ceilShow) ** 3;
        // it comes down from above the view to its line
        const top = fieldTop(w.span) - 120;
        const y = top + (ceilY - top) * k;
        ceiling.position.set(sx(fieldRight(w.span) / 2), sy(y), 0);
      }

      // fog: eases in with the stage; thickest at the far side
      fogShow = w.stageMod === 'fog' ? Math.min(1, fogShow + real / 1.2) : Math.max(0, fogShow - real / 0.8);
      const fogOn = fogShow > 0;
      wash.visible = fogOn;
      for (const q of mists) q.mesh.visible = fogOn;
      if (fogOn) {
        const right = fieldRight(w.span) + 260;
        const x0 = FOG_NEAR - (FOG_FULL - FOG_NEAR) * 0.2;
        const wpx = right - x0;
        const top = fieldTop(w.span) - 100;
        const hpx = 1380 - top;
        const tint = th.dark ? 0x8f9ab8 : 0xd9e1ec;
        washMat.color.setHex(tint);
        washMat.opacity = 0.46 * fogShow;
        wash.position.set(sx(x0 + wpx / 2), sy(top + hpx / 2), 0.15);
        wash.scale.set(m(wpx), m(hpx), 1);
        for (const q of mists) {
          q.mat.color.setHex(tint);
          q.mat.opacity = q.layer.alpha * fogShow;
          q.mat.map!.offset.x = (time * q.layer.speed) % 1;
          q.mesh.position.set(sx(x0 + wpx / 2), sy(top + hpx / 2) + Math.sin(time * 0.3 + q.layer.z) * 0.08, q.layer.z);
          q.mesh.scale.set(m(wpx), m(hpx), 1);
        }
      }

      // the base's rail, under the player's ledge
      rail.visible = w.stageMod === 'movingBase' || w.baseX !== 0;
      if (rail.visible) {
        const half = m(BASE_SLIDE.amp + PLAYER_LEDGE.w / 2) + 0.3;
        rail.position.set(sx(PLAYER_LEDGE.x + PLAYER_LEDGE.w / 2), sy(PLAYER_LEDGE.y + PLAYER_LEDGE.h * 0.5), 0);
        bar.scale.x = half * 2;
        stops[0]!.position.x = -half;
        stops[1]!.position.x = half;
      }
    },
  };
}
