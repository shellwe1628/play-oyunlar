import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-ext-800.css';
import Phaser from 'phaser';
import { createAudio } from './audio/synth';
import { setContext, type OyunContext, type ResolvedGameInfo } from './context';
import { createI18n, pickLanguage, type StringTable } from './i18n';
import {
  capacitorBridge,
  createCapacitorPlatform,
  createCrazyGamesPlatform,
  createWebPlatform,
  detectPlatform,
  type Platform,
  type PlatformName,
  type WebPlatform,
} from './platform';
import { createRng } from './rng';
import { BootScene } from './scenes/BootScene';
import { PauseScene } from './scenes/PauseScene';
import { webStorage, type StorageAdapter } from './storage';
import { CORE_STRINGS } from './strings';
import { createTestHook, installTestHook, parseTestParams, type JsonValue } from './testhook';
import { followsRealTime, realTimeDelta } from './time';
import type { TextureRecipe } from './textures';
import { logicalSize, safeInsetsToLogical, type Insets, type Orientation } from './ui/layout';
import { cssColor, resolveTheme, type ThemeOverrides } from './ui/theme';

export interface OyunGameConfig {
  /** Slug, e.g. 'ornek'. Used in storage keys (`oyun:<id>:…`). */
  id: string;
  /** Display title (already localised or brand name). */
  title: string;
  orientation: Orientation;
  /** Game string table (tr + en). Core shell strings are merged underneath. */
  strings: StringTable;
  /** Scene classes. Core adds BootScene first and PauseScene last (drawn above every game scene). */
  scenes: Phaser.Types.Scenes.SceneType[];
  /** Key of the first scene after boot. */
  start: string;
  /** Key of the menu scene (Quit from the pause menu goes there). Default: `start`. */
  menu?: string;
  /** Textures drawn with code at boot. */
  textures?: readonly TextureRecipe[];
  theme?: ThemeOverrides;
  /** DOM element id for the canvas. Default 'game'. */
  parent?: string;
  /** Override platform detection (else VITE_OYUN_PLATFORM / auto-detect). */
  platform?: PlatformName | Platform;
  /** Override storage (tests). Default localStorage with memory fallback. */
  storage?: StorageAdapter;
}

export interface OyunGame {
  game: Phaser.Game;
  ctx: OyunContext;
}

function makePlatform(name: PlatformName): Platform {
  switch (name) {
    case 'crazygames':
      return createCrazyGamesPlatform();
    case 'capacitor':
      return createCapacitorPlatform();
    default:
      return createWebPlatform();
  }
}

/** Read env(safe-area-inset-*) through a hidden probe element (CSS px). */
function readCssInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

async function loadFonts(family: string): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const first = family.split(',')[0]?.trim() ?? family;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
  await Promise.race([
    Promise.all([document.fonts.load(`800 40px ${first}`, 'Aa'), document.fonts.load(`800 40px ${first}`, 'ğşıİçöü')]).then(() => undefined),
    timeout,
  ]).catch(() => undefined);
}

/**
 * Boot a game: platform init, fonts, i18n, audio, test hook, then Phaser with
 * BootScene → `start`. Resolves once Phaser is constructed.
 */
export async function createGame(config: OyunGameConfig): Promise<OyunGame> {
  const search = location.search;
  const params = new URLSearchParams(search);
  const test = parseTestParams(search);
  const storage = config.storage ?? webStorage();
  const theme = resolveTheme(config.theme);
  const size = logicalSize(config.orientation);
  const info: ResolvedGameInfo = {
    id: config.id,
    title: config.title,
    orientation: config.orientation,
    width: size.width,
    height: size.height,
    start: config.start,
    menu: config.menu ?? config.start,
  };

  const platform =
    typeof config.platform === 'object'
      ? config.platform
      : makePlatform(
          config.platform ??
            detectPlatform({
              search,
              hostname: location.hostname,
              forced: import.meta.env.VITE_OYUN_PLATFORM as string | undefined,
              capacitorNative: capacitorBridge()?.isNativePlatform?.() ?? false,
            }),
        );
  await platform.init().catch(() => undefined);

  const lang = pickLanguage(navigator.languages, params.get('lang'));
  document.documentElement.lang = lang;
  const i18n = createI18n(config.strings, lang, {
    base: CORE_STRINGS,
    onMissing: (key) => console.error(`[oyun] missing string "${key}"`),
  });
  const audio = createAudio({ storage, key: `oyun:${config.id}:audio` });
  const seed = test.enabled ? (test.seed ?? 1) : test.seed ?? (Math.floor(Math.random() * 2 ** 32) >>> 0);
  const hook = createTestHook();
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  await loadFonts(theme.fontFamily);

  document.body.style.backgroundColor = cssColor(theme.colors.background);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: config.parent ?? 'game',
    width: size.width,
    height: size.height,
    backgroundColor: cssColor(theme.colors.background),
    banner: false,
    audio: { noAudio: true },
    input: { activePointers: 3 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // Phaser draws scenes in list order and launch() does not reorder, so the pause menu goes
    // LAST: listed before the game's scenes, an opaque game scene covered it.
    scene: [new BootScene(config.textures ?? []), ...config.scenes, PauseScene],
  });

  // Under automation (or ?test=1) game time follows the wall clock: Phaser's smoothDelta clamps
  // each frame to 16.7 ms while the window is unfocused (always, headless) and for 120 frames
  // after start/focus/visible, so a 12 fps headless run played at 1/5 speed. Real players keep
  // Phaser's smoothing. Scenes still never get more than MAX_FRAME_MS (200) in one frame.
  const realTime = followsRealTime({ webdriver: navigator.webdriver, test: test.enabled });
  if (realTime) game.loop.smoothDelta = (delta: number): number => realTimeDelta(delta);

  let insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const updateInsets = (): void => {
    const rect = game.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    insets = safeInsetsToLogical(
      readCssInsets(),
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      size,
    );
  };

  const ctx: OyunContext = {
    game,
    info,
    lang,
    i18n,
    t: (key, p) => i18n.t(key, p),
    audio,
    platform,
    storage,
    seed,
    rng: createRng(seed),
    test: { enabled: test.enabled, hook },
    theme,
    reducedMotion,
    safeArea: () => insets,
  };
  setContext(game, ctx);
  game.events.once(Phaser.Core.Events.READY, () => {
    updateInsets();
    game.scale.on(Phaser.Scale.Events.RESIZE, updateInsets);
  });

  // Audio unlocks on the first gesture anywhere (iOS/Chrome autoplay rules).
  const unlock = (): void => audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  platform.onLifecycle((e) => (e.type === 'pause' ? audio.suspend() : audio.resume()));

  hook.setMeta(() => {
    const meta: Record<string, JsonValue> = {
      seed,
      lang,
      platform: platform.name,
      muted: audio.muted,
      orientation: info.orientation,
      paused: platform.paused,
      realTime,
    };
    if (platform.name === 'web' && 'history' in platform) {
      meta.platformCalls = (platform as WebPlatform).history.map((h) => h.call);
    }
    return meta;
  });
  if (test.enabled) {
    // Reads what the renderer really drew at logical (x, y) on the next frame.
    hook.setPixelReader(
      (x, y) =>
        new Promise((resolve) => {
          game.renderer.snapshotPixel(x, y, (c) => {
            const color = c as Phaser.Display.Color;
            resolve({ r: color.red, g: color.green, b: color.blue, a: color.alpha });
          });
        }),
    );
  }
  installTestHook(window, hook, test.enabled);
  return { game, ctx };
}
