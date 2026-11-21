import type Phaser from 'phaser';
import type { Audio } from './audio/synth';
import type { I18n, Lang, Params } from './i18n';
import type { Platform } from './platform';
import type { Rng } from './rng';
import type { StorageAdapter } from './storage';
import type { TestHook } from './testhook';
import type { Insets, Orientation } from './ui/layout';
import type { Theme } from './ui/theme';

export interface ResolvedGameInfo {
  id: string;
  title: string;
  orientation: Orientation;
  /** Logical canvas size: 720×1280 portrait, 1280×720 landscape. */
  width: number;
  height: number;
  /** Key of the first scene after boot. */
  start: string;
  /** Key of the menu scene; the pause menu's Quit goes here. */
  menu: string;
}

/** Services shared by every scene. Reach it with `this.oyun` inside an OyunScene. */
export interface OyunContext {
  readonly game: Phaser.Game;
  readonly info: ResolvedGameInfo;
  readonly lang: Lang;
  readonly i18n: I18n;
  t(key: string, params?: Params): string;
  readonly audio: Audio;
  readonly platform: Platform;
  /** Use this adapter (with an `oyun:<id>:` key prefix) for every createSaveStore. */
  readonly storage: StorageAdapter;
  /** Session seed: `?seed=N` in test mode, else random. */
  readonly seed: number;
  /** Root RNG for the session. Fork per round: `this.oyun.rng.fork('round-' + n)` or pass to sim. */
  readonly rng: Rng;
  readonly test: { readonly enabled: boolean; readonly hook: TestHook };
  readonly theme: Theme;
  /** prefers-reduced-motion → shake strength 0.3 and no big flashes. */
  readonly reducedMotion: boolean;
  /** Safe-area insets in logical px (notch, home bar). Updated on resize. */
  safeArea(): Insets;
}

const contexts = new WeakMap<Phaser.Game, OyunContext>();

export function setContext(game: Phaser.Game, ctx: OyunContext): void {
  contexts.set(game, ctx);
}

export function getContext(game: Phaser.Game): OyunContext {
  const ctx = contexts.get(game);
  if (!ctx) throw new Error('@oyun/core: no context on this game. Was it created with createGame()?');
  return ctx;
}
