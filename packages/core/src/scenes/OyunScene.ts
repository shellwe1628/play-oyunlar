import Phaser from 'phaser';
import { getContext, type OyunContext } from '../context';
import type { Params } from '../i18n';
import { Juice } from '../juice/juice';
import type { LifecycleEvent, PauseReason } from '../platform';
import type { JsonObject } from '../testhook';
import type { Insets } from '../ui/layout';

/** Safe layout rectangle in logical px. */
export interface Layout {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Safe-area insets (notch, home indicator). */
  safe: Insets;
  /** Edges of the safe area: put critical UI inside top..bottom / left..right. */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const PAUSE_SCENE = 'pause';

/**
 * Base class for every game scene. Write `create()` as usual (no super call needed); core wraps
 * it to set up `this.juice`, the test hook registration, platform pause handling and a fade-in.
 *
 * Override:
 * - `testState()`   JSON snapshot for `__OYUN__.state().data`
 * - `testActions()` named actions for `__OYUN__.act(name)`; call the SAME handlers real input calls
 * - `autoPause = true` to open the pause menu when the tab/app is hidden or an ad starts
 */
export abstract class OyunScene extends Phaser.Scene {
  /** Screen shake, hit-stop, pops, floating text, particle bursts. Ready inside create(). */
  juice!: Juice;
  /** Open the pause menu automatically on platform pause (tab hidden, ad). */
  protected autoPause = false;
  private transitioning = false;

  constructor(config: string | Phaser.Types.Scenes.SettingsConfig) {
    super(config);
    const self = this as unknown as { create?: (data: object) => void };
    const userCreate = self.create;
    self.create = (data: object) => {
      this.beforeCreate();
      userCreate?.call(this, data);
      this.afterCreate();
    };
  }

  abstract create(data?: object): void;

  /** Shared services: audio, i18n, platform, rng, storage, theme, test flags. */
  get oyun(): OyunContext {
    return getContext(this.game);
  }

  /** Translate a string key (game table first, then core shell strings). */
  t(key: string, params?: Params): string {
    return this.oyun.t(key, params);
  }

  /** Logical size and safe-area edges. Recompute after resize if you cache it. */
  get layout(): Layout {
    const { width, height } = this.oyun.info;
    const safe = this.oyun.safeArea();
    return {
      width,
      height,
      cx: width / 2,
      cy: height / 2,
      safe,
      top: safe.top,
      bottom: height - safe.bottom,
      left: safe.left,
      right: width - safe.right,
    };
  }

  /** JSON state for the smoke test. Keep it small and stable. */
  protected testState(): JsonObject {
    return {};
  }

  /** Named test actions. Each must call the same function the real input calls. */
  protected testActions(): Record<string, (payload: unknown) => void> {
    return {};
  }

  /** Platform pause (tab hidden, ad). Default: open the pause menu when autoPause is set. */
  protected onPlatformPause(_reason: PauseReason): void {
    if (this.autoPause) this.openPauseMenu();
  }

  protected onPlatformResume(_reason: PauseReason): void {
    /* the pause menu waits for the player to tap Resume */
  }

  /** Pause this scene and show core's pause menu over it (moved to the top of the draw order). */
  openPauseMenu(): void {
    if (!this.scene.isActive() || this.scene.isActive(PAUSE_SCENE)) return;
    this.scene.pause();
    this.scene.launch(PAUSE_SCENE, { from: this.scene.key });
    // A game may have launched or reordered its own scenes (HUD, overlays) above the end of the
    // list; the menu must still be drawn on top of everything.
    this.scene.bringToTop(PAUSE_SCENE);
  }

  /** Fade out, then start another scene. Ignores repeated calls during the fade. */
  goTo(key: string, data?: object): void {
    if (this.transitioning) return;
    this.transitioning = true;
    const cam = this.cameras.main;
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(key, data));
    cam.fadeOut(140, 0, 0, 0);
  }

  private beforeCreate(): void {
    this.transitioning = false;
    this.juice = new Juice(this);
  }

  private afterCreate(): void {
    const ctx = this.oyun;
    const unregister = ctx.test.hook.register(this.scene.key, {
      state: () => this.testState(),
      actions: this.testActions(),
    });
    const offLifecycle = ctx.platform.onLifecycle((e: LifecycleEvent) => {
      if (!this.scene.isActive() && !this.scene.isPaused()) return;
      if (e.type === 'pause') this.onPlatformPause(e.reason);
      else this.onPlatformResume(e.reason);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unregister();
      offLifecycle();
    });
    this.cameras.main.fadeIn(140, 0, 0, 0);
    if (this.scene.key !== PAUSE_SCENE) ctx.test.hook.setReady();
    // A platform pause that happened before this scene existed (e.g. started hidden).
    if (ctx.platform.paused && this.autoPause) this.openPauseMenu();
  }
}
