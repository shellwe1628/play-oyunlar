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
import type { Platform, RewardedResult, SaveStore } from '@oyun/core/pure';
import type { SaveData } from '@sim/meta';
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
  /**
   * the main menu is up (true) or away: the camera eases in on the player's archer so it stands in
   * the menu's free middle band, clear of the side buttons and PLAY, and eases back for play
   */
  menu(on: boolean): void;
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
  /** the meshes of the weapon in hand: the bow, or the selected weapon's model (their materials are this archer's own) */
  meshes: THREE.Mesh[];
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

/** How a run is set up (the 2D GameScene's `GameData`). */
export interface RunOptions {
  /** the daily run: today's seed and modifier, no upgrades, no bow */
  daily?: boolean;
  /** chapter select: start at this chapter (clamped to the chapters reached) */
  chapter?: number;
  /** straight back from the result screen: the small title */
  quick?: boolean;
  seed?: number;
}

/** The only way UI code acts on the game. */
export interface Game {
  readonly w: World;
  /** glow level of the player's weapon (the run's meta.bow: in the 3D build the selected weapon's level as old bow +N, `bowEquivalent`) */
  readonly bowLevel: number;
  /** the persistent progress (coins, upgrades, bow, records, …); mutate only through `update` */
  readonly save: SaveStore<SaveData>;
  /** the celestial weapon look (`arsenal.celestial`, or ?celestial=1|0) */
  readonly celestial: boolean;
  /** the current run is the daily run */
  readonly daily: boolean;
  /** the chapter the chapter select starts runs at */
  readonly chapter: number;
  /** the current title was opened straight from the result screen */
  readonly quick: boolean;
  /** this run does not touch the save (URL test switches ?wave ?bow ?armor ?chapter) */
  readonly testRun: boolean;
  /** the distribution platform (main.ts detects it like core's createGame: VITE_OYUN_PLATFORM, native shell, ?platform=) */
  readonly platform: Platform;
  /** a rewarded ad is on screen (the world is frozen, audio suspended) */
  readonly adShowing: boolean;
  /**
   * Show a rewarded ad (placements: extra_card, revive, double_coins). While it shows the platform
   * pauses with reason 'ad': the world freezes and the HUD suspends audio. Grant only on 'granted'.
   */
  rewarded(placement: string): Promise<RewardedResult>;
  readonly paused: boolean;
  /** paused: the world does not advance and the view modules get dt = real = 0 (they keep drawing) */
  setPaused(on: boolean): void;
  /** a fresh world at the title, set up from the save (unpauses) */
  startRun(opts?: RunOptions): void;
  /** a fresh normal run at the full title */
  toTitle(): void;
  /** begin / continue a drag from the pointer, logical px */
  dragStart(x: number, y: number): void;
  dragMove(x: number, y: number): void;
  /** release: fires when outside the dead zone and the bow is ready */
  dragEnd(): void;
  dragCancel(): void;
  pickCard(index: number): void;
  reroll(): void;
  /** rewarded: one more card in the current offer (once per pick); false when not possible */
  extraCard(): boolean;
  /** the run that just ended can still be revived (once per run) */
  readonly canRevive: boolean;
  /** rewarded: continue the ended run from the same wave with half health; false when not possible */
  revive(): boolean;
  unleash(): void;
  /** a fresh run of the same kind (new seed unless given), at the quick title */
  restart(seed?: number): void;
}
