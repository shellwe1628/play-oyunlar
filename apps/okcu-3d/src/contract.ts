/**
 * The seams between the 3D renderer's parts. Every module is built by `main.ts`, receives the
 * shared `Stage`, and is called once per frame with a `Frame`. Modules draw the simulation; they
 * never change its rules (only `Game` methods touch the world).
 *
 * Units: the simulation works in logical pixels, portrait 720 × 1280, y DOWN, angles in that
 * frame (aim "up and right" is a negative angle). The 3D scene is in metres, y UP, 80 px = 1 m,
 * with the logical frame centred on the origin in the z = 0 plane. Use `coords.ts` to convert;
 * never hand-roll the conversion.
 */
import type * as THREE from 'three';
import type { GameEvent, World } from '@sim/world';

export interface AimState {
  /** pointer went down here / is here now, in LOGICAL px (720 × 1280 frame) */
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** null while the pull is inside the dead zone (a release would cancel) */
  shot: { angle: number; power: number } | null;
}

export interface Frame {
  /** the live world; a restart swaps it, so never cache it across frames */
  w: World;
  /** game seconds advanced this frame (already slowed by slow motion) */
  dt: number;
  /** real seconds this frame (UI pops, camera shake decay, slow-motion timers) */
  real: number;
  /** game clock, seconds */
  time: number;
  /** every simulation event since the previous frame, in order */
  events: readonly GameEvent[];
  /** the drag in progress, or null */
  aim: AimState | null;
}

export interface Stage {
  readonly root: HTMLElement;
  /** DOM layer above the canvas for HUD and menus (pointer-events: none; opt back in per element) */
  readonly overlay: HTMLElement;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** logical px → CSS px inside `root` (for DOM elements that follow world things) */
  toScreen(x: number, y: number): { x: number; y: number };
  /** CSS client coordinates → logical px */
  toLogical(clientX: number, clientY: number): { x: number; y: number };
  /** trauma-style shake, 0 … 1 (same strengths the 2D game passes to juice.shake) */
  shake(strength: number): void;
  /** per-frame housekeeping (shake decay, theme fades) then draw */
  render(frame: Frame): void;
}

export interface Module {
  update(frame: Frame): void;
}

/** What other modules may ask of the archers module. */
export interface ArchersView extends Module {
  /** The bow of a living, visible archer: its meshes and a node that follows the grip. */
  bowOf(id: number): BowHandle | null;
}

export interface BowHandle {
  /** skinned meshes that make up the bow (their materials are this archer's own clones) */
  meshes: THREE.SkinnedMesh[];
  /** follows the bow hand; children added here ride the bow */
  grip: THREE.Object3D;
  /** bow limb tips in world space (top, bottom), refreshed every frame, for glow and trails */
  tips: [THREE.Vector3, THREE.Vector3];
}

/** The effects module also decides slow motion. */
export interface FxView extends Module {
  /** multiplier for game time this frame (1 normally, < 1 during headshot slow motion) */
  timeScale(): number;
}

/** The only way UI code acts on the game. */
export interface Game {
  readonly w: World;
  /** bow level shown on the player's bow (the 2D game reads it from the save; here it is meta.bow) */
  readonly bowLevel: number;
  /** begin / continue a drag from the pointer, logical px */
  dragStart(x: number, y: number): void;
  dragMove(x: number, y: number): void;
  /** release: fires when outside the dead zone and the bow is ready */
  dragEnd(): void;
  dragCancel(): void;
  pickCard(index: number): void;
  reroll(): void;
  unleash(): void;
  /** a fresh run (new seed unless given) */
  restart(seed?: number): void;
}
