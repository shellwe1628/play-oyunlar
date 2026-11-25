/** Simulation pixels ↔ scene metres. See contract.ts for the conventions. */
import * as THREE from 'three';

export const LOGICAL_W = 720;
export const LOGICAL_H = 1280;
export const PX_PER_M = 80;

/** scene x for a logical x */
export const sx = (x: number): number => (x - LOGICAL_W / 2) / PX_PER_M;
/** scene y for a logical y (flipped) */
export const sy = (y: number): number => (LOGICAL_H / 2 - y) / PX_PER_M;
/** a length in px → metres */
export const m = (px: number): number => px / PX_PER_M;
/** a simulation angle (y down) → scene angle around +z (y up) */
export const ang = (a: number): number => -a;

export function toScene(x: number, y: number, z = 0, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(sx(x), sy(y), z);
}

/** Scene size of the logical frame, metres. */
export const FRAME_W = LOGICAL_W / PX_PER_M;
export const FRAME_H = LOGICAL_H / PX_PER_M;
