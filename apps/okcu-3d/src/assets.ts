/**
 * Loads the Mixamo character (Erika Archer With Bow/Arrow) and its animation clips once.
 * `archer.fbx` carries the skinned model plus the "Standing Aim Idle 01" clip; the other files
 * are animation-only exports on the same skeleton.
 */
import type * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export interface Assets {
  /** the skinned character, in centimetres, facing +z, origin between the feet; clone with SkeletonUtils.clone */
  archer: THREE.Group;
  clips: {
    /** Standing Aim Idle 01: bow up, string drawn */
    aim: THREE.AnimationClip;
    /** Standing Idle 01: relaxed, bow lowered */
    idle: THREE.AnimationClip;
    /** Standing Draw Arrow: reaches back for an arrow and nocks it */
    draw: THREE.AnimationClip;
    /** Standing Aim Recoil: the release */
    release: THREE.AnimationClip;
    /** Standing Death Backward 01 */
    death: THREE.AnimationClip;
  };
}

export async function loadAssets(): Promise<Assets> {
  const loader = new FBXLoader();
  const base = `${import.meta.env.BASE_URL}assets/`;
  const load = (name: string) => loader.loadAsync(`${base}${name}.fbx`);
  const [archer, idle, draw, release, death] = await Promise.all([load('archer'), load('idle'), load('draw'), load('release'), load('death')]);
  const clip = (g: THREE.Group, name: string): THREE.AnimationClip => {
    const c = g.animations[0];
    if (!c) throw new Error(`${name}.fbx has no animation`);
    c.name = name;
    return c;
  };
  return { archer, clips: { aim: clip(archer, 'aim'), idle: clip(idle, 'idle'), draw: clip(draw, 'draw'), release: clip(release, 'release'), death: clip(death, 'death') } };
}
