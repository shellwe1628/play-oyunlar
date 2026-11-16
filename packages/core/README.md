# @oyun/core

The shared foundation every oyun game is built on: boot, scene shells, save, seeded RNG,
synthesized audio, juice, UI widgets, tr/en strings, a platform interface (ads, haptics,
analytics, pause/resume) and a test hook that lets the quality gate play the game.

This file is the whole contract for game builders. Every `ts` block below is type-checked by
`npm run gate` (stage `core readme`), so the snippets match the code.

- Phaser **4.2.1**, TypeScript strict, Vite 8, Vitest 5, Playwright 1.63.0.
- Logical canvas **720×1280** portrait or **1280×720** landscape, `Scale.FIT`, centred.
- Art is drawn with code; sound is synthesized; the only binary asset is the bundled OFL font
  (Nunito 800, `@fontsource/nunito`, latin + latin-ext, so Turkish letters render).

## Start a game

```text
npm run new-game -- <slug> "<Title>" [portrait|landscape]   # writes games/<slug>, runs npm install
npm run gate -- <slug>                                       # must be green before you say "done"
npm run dev -w games/<slug>                                   # local dev server (stop it when done)
```

Run `new-game` from one agent at a time (it runs `npm install`, which rewrites
`package-lock.json`). The scaffold is a complete tiny game ("tap the moving target"): read
`games/ornek` — an unedited render of `templates/game` — as the reference for how each module
is meant to be used, then replace its rules, art and strings with yours.

```text
games/<slug>/
  GAME.md               one-page design (fill it in)
  oyun.config.json      id, title, orientation, appId (read by main.ts, Capacitor and the gate)
  index.html            viewport-fit=cover, no favicon request, #game container
  src/main.ts           createGame({...})
  src/strings.ts        tr + en strings (defineStrings)
  src/textures.ts       PALETTE + code-drawn texture recipes
  src/save.ts           the game's versioned save store
  src/sim/              PURE rules: no Phaser, no DOM, no Math.random (lint-enforced)
  src/scenes/           Phaser scenes: draw state, forward input to sim
  tests/unit/           vitest, node, test-first for everything in src/sim
  tests/e2e/smoke.spec.ts   the gate's browser session
  capacitor.config.ts   native wrapper config (unverified here, see below)
```

## Imports: two entry points

| Import | Contains | Use from |
|---|---|---|
| `@oyun/core/pure` | rng, save, storage, i18n, platform, testhook, juice maths, layout maths, game-time maths, theme, audio presets/synth, core strings | `src/sim`, unit tests, anything that must run in node |
| `@oyun/core` | everything in `pure` **plus** Phaser parts: `createGame`, scenes, `Juice`, widgets, texture helpers | `src/main.ts`, `src/scenes` |
| `@oyun/core/e2e` | Playwright helpers and `smokeConfig` | `tests/e2e`, `playwright.config.ts` only |

Importing `@oyun/core` in node fails (Phaser touches `window` at import). Type-only imports
(`import type { OyunContext } from '@oyun/core'`) are fine anywhere.

## Boot: `createGame`

```ts
import { createGame, OyunScene, defineStrings, circleTexture } from '@oyun/core';

class PlayScene extends OyunScene {
  constructor() {
    super('game');
  }
  create(): void {
    this.add.image(this.layout.cx, this.layout.cy, 'ball');
  }
}

const STRINGS = defineStrings({ en: { 'game.hint': 'Tap!' }, tr: { 'game.hint': 'Dokun!' } });

void createGame({
  id: 'mygame', // storage keys become oyun:mygame:*
  title: 'My Game',
  orientation: 'portrait', // 720×1280; 'landscape' = 1280×720
  strings: STRINGS,
  textures: [circleTexture('ball', 40, 0xffc93c)],
  scenes: [PlayScene], // core adds BootScene first and PauseScene last (drawn on top)
  start: 'game', // first scene after boot
  menu: 'game', // where Quit in the pause menu goes (default: start)
  theme: { colors: { primary: 0x7cf29c } }, // optional overrides of DEFAULT_THEME
});
```

Boot order: platform `init()` → language pick → audio (context created lazily on first
gesture) → font load (≤ 2 s) → `new Phaser.Game` (`Scale.FIT`, `CENTER_BOTH`, Phaser audio
disabled; real-time game clock under automation, see [Game time](#game-time)) →
`window.__OYUN__` installed (test mode) → `BootScene` bakes `CORE_TEXTURES` + your
`textures` → `start` scene. Wrap the call in `.catch(e => console.error(...))` as the template
does: a logged boot error fails the smoke test.

URL parameters: `?test=1` installs the test hook (and forces the web platform), `&seed=N`
seeds the session RNG (test mode default 1), `&lang=tr|en` overrides the device language,
`?platform=crazygames` forces an adapter outside test mode.

## Scenes

### `OyunScene` — base for every scene

Write `create()` normally, **no `super.create()` call**: the base wraps it to set up
`this.juice`, register the scene with the test hook, subscribe to platform pause/resume and
fade the camera in. Declare `create` as a method, not an arrow property.

| Member | What |
|---|---|
| `this.oyun` | the `OyunContext`: `audio`, `platform`, `i18n`, `t()`, `lang`, `rng`, `seed`, `storage`, `theme`, `info` (id, title, orientation, width, height, start, menu), `test`, `reducedMotion`, `safeArea()` |
| `this.t(key, params?)` | translated string; game table first, then core `core.*` strings |
| `this.layout` | `{ width, height, cx, cy, safe, top, bottom, left, right }` in logical px; `top`…`right` are the safe-area edges |
| `this.juice` | per-scene juice (below) |
| `autoPause` | set `protected override autoPause = true` on gameplay scenes: tab/app hidden or an ad starts → pause menu |
| `openPauseMenu()` | pause this scene, launch core's pause menu (Resume / Quit / mute) and bring it to the top of the draw order |
| `goTo(key, data?)` | fade out, then `scene.start`; repeated calls during the fade are ignored |
| `testState()` / `testActions()` | override to expose JSON state and named actions to `window.__OYUN__` |
| `onPlatformPause(reason)` / `onPlatformResume(reason)` | override for custom lifecycle handling |

```ts
import { createRng, label, OyunScene } from '@oyun/core';
import type Phaser from 'phaser';

export class TapScene extends OyunScene {
  protected override autoPause = true;
  private taps = 0;
  private text!: Phaser.GameObjects.Text;

  constructor() {
    super('game');
  }

  create(): void {
    const rng = createRng(this.oyun.rng.int(0, 2 ** 31 - 1)); // per-round stream, seeded
    void rng;
    this.taps = 0; // reset run state in create/init, never in the constructor
    this.text = label(this, this.layout.cx, this.layout.top + 80, '0', { size: 64 });
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.onTap(); // taps on buttons are not gameplay taps
    });
  }

  override update(_time: number, delta: number): void {
    const dt = this.juice.scaledDelta(delta) / 1000; // 0 during hit-stop
    void dt; // step your sim with dt here
  }

  /** The ONE handler: real taps and the test hook both call it. */
  private onTap(): void {
    this.taps += 1;
    this.text.setText(String(this.taps));
    this.juice.pop(this.text);
    this.oyun.audio.play('tap');
  }

  protected override testState() {
    return { taps: this.taps };
  }

  protected override testActions() {
    return { tap: () => this.onTap() };
  }
}
```

### Shells: `MenuScene`, `ResultScene`, `PauseScene`

Subclass the shells instead of rebuilding menus. They work in both orientations: the menu
places items by fractions of the height; the result screen stacks its buttons under the card in
portrait and puts them right of the card in landscape.

```ts
import { MenuScene as MenuShell, ResultScene as ResultShell } from '@oyun/core';

export class MyMenu extends MenuShell {
  protected readonly playScene = 'game';
  constructor() {
    super('menu');
  }
  protected override subtitle(): string {
    return this.t('core.best', { n: 12 });
  }
  protected override decorate(): void {
    this.add.image(this.layout.cx, this.layout.height * 0.47, 'ball'); // your art
  }
}

export class MyResult extends ResultShell {
  protected readonly gameScene = 'game';
  constructor() {
    super('result');
  }
  protected override onReplay(): void {
    void this.oyun.platform.showInterstitial('between_rounds').then(() => this.goTo(this.gameScene));
  }
}
```

- `MenuScene` hooks: `title()`, `subtitle()`, `drawBackground()`, `decorate()`, `playData()`.
  Test action `play`.
- `ResultScene` receives `ResultData` `{ score, best, newBest, won?, lines? }` through
  `goTo('result', data)`; shows a count-up, best line, new-best toast + star burst, win/lose
  jingle, Replay and Menu buttons. Hooks: `drawBackground()`, `onReplay()`, `onMenu()`,
  `buttonPosition(i)` (slot 2+ for your own buttons), `cardPosition()`. Test actions `replay`,
  `menu`; test state `{ score, best, newBest }`.
- `PauseScene` (key `pause`, registered by core) — Resume (ESC), Quit (→ `menu`), mute. It calls
  `platform.gameplayStop()` on open and `gameplayStart()` on resume. Test actions `resume`, `quit`.
  Phaser draws scenes in scene-list order and `launch()` does not reorder, so core registers it
  **after** your scenes and `openPauseMenu()` also calls `scene.bringToTop('pause')`: the menu is
  drawn above an opaque game scene and above any scene you launched or moved to the top
  yourself. Do not override `openPauseMenu()` to fix the order; if you override it for another
  reason, call `super.openPauseMenu()`.

## Textures (code-drawn art)

`BootScene` bakes every `TextureRecipe` with `Graphics.generateTexture`. Draw at the size you
display, inside `(0,0)–(width,height)`. Keep colours in one `PALETTE` object per game.

```ts
import { circleTexture, ringTexture, roundRectTexture, starTexture, type TextureRecipe } from '@oyun/core';

const PALETTE = { gem: 0x3ee0c4, frame: 0xffffff } as const;

export const TEXTURES: readonly TextureRecipe[] = [
  circleTexture('ball', 40, PALETTE.gem, { width: 6, color: PALETTE.frame }),
  ringTexture('halo', 60, 8, PALETTE.frame),
  roundRectTexture('tile', 120, 120, 24, PALETTE.gem),
  starTexture('star', 30, 5, PALETTE.frame),
  {
    key: 'gem', // anything else: a custom draw function
    width: 100,
    height: 100,
    draw(g) {
      g.fillStyle(PALETTE.gem, 1).fillTriangle(50, 0, 100, 50, 0, 50);
      g.fillStyle(PALETTE.frame, 0.6).fillTriangle(0, 50, 100, 50, 50, 100);
    },
  },
];
```

Core always provides `oyun-dot` (white circle r 8) and `oyun-star` (white star) for particles;
tint them. Duplicate keys throw at boot.

## Save

Versioned JSON in `localStorage` (memory fallback when storage is blocked), with migrations,
a backup of the previous good save and corrupt-save recovery.

```ts
import { createSaveStore, memoryStorage, type SaveOptions, type StorageAdapter } from '@oyun/core/pure';

interface SaveData {
  best: number;
  coins: number;
}

export function saveOptions(storage: StorageAdapter, gameId: string): SaveOptions<SaveData> {
  return {
    key: `oyun:${gameId}:save`,
    version: 2, // bump when a field is renamed, removed or retyped
    defaults: () => ({ best: 0, coins: 0 }), // also fills fields missing from older saves
    migrations: {
      1: (old) => ({ best: (old as { highScore?: number }).highScore ?? 0 }), // v1 → v2
    },
    validate: (d): d is SaveData => Number.isFinite((d as SaveData).best),
    storage,
  };
}

const store = createSaveStore(saveOptions(memoryStorage(), 'demo')); // in a scene: this.oyun.storage
store.update((d) => {
  d.best = Math.max(d.best, 10);
}); // mutate + persist; returns false if the write failed
console.warn(store.data.best, store.status); // status: fresh | loaded | migrated | recovered | reset | newer
```

- Stored as `{ "v": version, "data": … }` at `key`; previous good save at `key.bak`; unreadable
  text copied to `key.corrupt` before a reset.
- Corrupt primary → backup (`recovered`) → defaults (`reset`). Never throws on load.
- A save from a **newer** build loads defaults in memory and becomes **read-only**
  (`status 'newer'`, `update()` returns false) so a downgrade never destroys progress.
- Keep every migration forever. Add a test that loads a fixture of each old version.
- Create the store once per game (see `games/ornek/src/save.ts`: `gameSave(this.oyun)` caches it).
- Settings that core owns (mute, bus volumes) live in `oyun:<id>:audio`; don't duplicate them.

## RNG

Mulberry32, deterministic per seed. All gameplay randomness goes through an `Rng`; cosmetic
randomness (particle spread, sfx pitch jitter) may use `Math.random` — but never in `src/sim`.

```ts
import { createRng, hashSeed } from '@oyun/core/pure';

const rng = createRng(1);
rng.next(); // [0, 1)
rng.int(1, 6); // inclusive
rng.range(-2, 2); // [min, max)
rng.chance(0.25);
rng.pick(['a', 'b', 'c'] as const);
rng.shuffle([1, 2, 3]); // copy
const spawns = rng.fork('spawns'); // independent child stream
const saved = rng.getState();
rng.setState(saved);
createRng(hashSeed('daily-2026-11-16')); // string seeds (daily challenges)
void spawns;
```

`this.oyun.rng` is the session root (seeded by `?seed=N` in tests). Give each round its own
stream (`createRng(this.oyun.rng.int(0, 2 ** 31 - 1))`) and pass it into the sim.

## Audio

WebAudio synth, no audio files. Buses: `master ← music, sfx`. The context is created on the
first pointer/key gesture (core wires that); mute and bus volumes persist.

```ts
import { getContext, type SfxPreset } from '@oyun/core';
import type Phaser from 'phaser';

const SWOOSH: SfxPreset = [{ wave: 'noise', freq: 3000, duration: 0.18, gain: 0.25 }];

export function sounds(scene: Phaser.Scene, combo: number): void {
  const { audio } = getContext(scene.game);
  audio.play('coin', { pitch: Math.min(combo, 12) }); // semitones up per combo step
  audio.play('hit', { volume: 0.5, jitter: 0 });
  audio.playPreset(SWOOSH);
  audio.setVolume('music', 0.6); // slider 0..1, squared to gain
  audio.toggleMute(); // persisted; muteButton(scene, x, y) does this for you
}
```

Presets (`SFX_PRESETS`): `tap`, `pop`, `coin`, `hit`, `win`, `lose`. Each play gets ±0.4
semitone random jitter unless `jitter: 0`. Max 16 simultaneous voices (extra plays are
dropped). Audio suspends on platform pause (tab hidden, ad) and resumes after. `audio.musicOutput`
is the music bus input if a game builds its own music nodes; core ships **no music player**.

## Juice

`this.juice` in every OyunScene. Shake moves only the camera; hit-stop scales this scene's
tweens and timers to 0 and makes `scaledDelta()` return 0 — your `update()` must step the sim
with `this.juice.scaledDelta(delta)`.

```ts
import { OyunScene } from '@oyun/core';

export class JuiceDemo extends OyunScene {
  constructor() {
    super('demo');
  }
  create(): void {
    const box = this.add.image(this.layout.cx, this.layout.cy, 'tile');
    this.juice.feedback('medium', box.x, box.y, 0xffc93c); // shake + hit-stop + burst + haptic
    this.juice.shake(0.3); // trauma 0..1, decays in real time
    this.juice.hitStop(60); // ms, max 150, overlapping stops keep the later end
    this.juice.pop(box, 1.25); // overshoot pop, always ends at rest scale
    this.juice.squash(box); // squash & stretch
    this.juice.floatText(box.x, box.y - 60, '+5', { color: 0xffc93c });
    this.juice.burst(box.x, box.y, { count: 12, color: 0x3ee0c4, texture: 'oyun-star' });
  }
}
```

Tiers (`FEEDBACK_TIERS`): `small` (trauma 0.15, no stop, 4 particles, light haptic) for
routine hits; `medium` (0.4, 50 ms, 10, medium) for notable events; `large` (0.8, 120 ms,
28, heavy) for big moments only. A spawn "appear" is `pop(obj, 0.3)` (tweens up from 30 %).
`prefers-reduced-motion` lowers shake strength to 0.3. Pure maths (`createTrauma`,
`createHitStop`, `easeOutBack`, `easeOutCubic`) is in `@oyun/core/pure` for sims and tests.

## UI widgets

All sizes are logical px. **Every touch target is ≥ 88×88** (`MIN_TOUCH`; ≈ 48 CSS px on a
390 px phone): the widgets enlarge the hit area automatically, and anything you make
interactive yourself must use `touchHitSize()`. Put critical UI between `this.layout.top` and
`this.layout.bottom` (safe area).

```ts
import { button, iconButton, label, muteButton, OyunScene, panel, progressBar, toast } from '@oyun/core';

export class UiDemo extends OyunScene {
  constructor() {
    super('ui');
  }
  create(): void {
    const L = this.layout;
    const title = label(this, L.cx, L.top + 120, this.t('core.paused'), { size: 64, wrap: L.width - 80 });
    const card = panel(this, L.cx, L.cy, 560, 400); // container: card.add(child)
    card.add(label(this, 0, 0, 'inside the card', { size: 36 }));
    const play = button(this, L.cx, L.bottom - 240, this.t('core.play'), () => this.goTo('game'), { hotkey: 'ENTER' });
    button(this, L.cx, L.bottom - 110, this.t('core.menu'), () => this.goTo('menu'), { variant: 'secondary' });
    iconButton(this, L.left + 70, L.top + 70, 'pause', () => this.openPauseMenu());
    muteButton(this, L.right - 70, L.top + 70);
    const bar = progressBar(this, L.cx, L.top + 220, L.width - 80, 30);
    bar.setValue(0.5, true);
    toast(this, this.t('core.newBest')); // default: middle of the safe area
    toast(this, this.t('core.newBest'), { position: 'top', duration: 2400 }); // or 'center' | 'bottom' | y
    play.setEnabled(true);
    void title;
  }
}
```

- `button` fires on release inside (drag off cancels), plays `tap` + light haptic, pops.
  Options: `width` (380), `height` (112), `variant`, `fontSize`, `sfx` (`null` = silent),
  `haptic`, `hotkey` (Phaser key name). `button.fire()` runs the same path as a tap — use it in
  `testActions()`.
- `toast(scene, text, { duration?, color?, position? })`: one at a time per scene (a new one
  replaces the old), depth 2000, fades in with a small rise. **Default position is the middle of
  the safe area** (`'center'`), because every game puts its HUD in the top band and its controls
  (sliders, drawers, button rows) in the bottom band. `position: 'top'` is the old slot (safe top
  + 90, over a top HUD), `'bottom'` the same distance above the safe bottom, a number is a centre
  y in logical px. Every position is clamped so the whole box stays inside the safe area
  (`toastY()` in `pure` does the maths). The result shell's new-best toast sits over the card's
  "Score" caption, below a title you put above the card.
- Icons: `pause`, `play`, `sound-on`, `sound-off`, `home`, `replay`, `close`.
- Theme colours: `DEFAULT_THEME` / `createGame({ theme })`; `cssColor(0xRRGGBB)` for text styles.
- Text renders into a 720 px-wide canvas scaled to the screen, so it is slightly soft on 3×
  phones. Keep body text ≥ 34 px and titles ≥ 56 px.

## Game time

What `update(time, delta)`, `this.time` timers and `delta`-driven code receive per frame:

| Where | Delta per frame |
|---|---|
| Real player (no `?test=1`, not automated) | Phaser 4.2.1 default, unchanged: clamped to 16.7 ms while the window is unfocused and for 120 frames after start, focus or tab-visible; any frame over 200 ms is replaced by an earlier delta; then averaged over the last 10 frames. On a 60 Hz focused window this is the real frame time. |
| Automated (`navigator.webdriver`) or `?test=1` | The real frame time, capped at **`MAX_FRAME_MS` = 200 ms** (`realTimeDelta()`). Game time follows the wall clock as long as frames are ≤ 200 ms (≥ 5 fps); a longer frame advances the game by 200 ms only. `__OYUN__.state().meta.realTime` is `true`. |

Tweens are not affected either way: Phaser's tween manager runs on `Date.now()` (with its own
lag smoothing: a gap over 500 ms counts as 33 ms). Hit-stop still applies through
`this.juice.scaledDelta(delta)`.

So **one frame can hand a scene up to 200 ms**. A sim that must not tunnel or overshoot on a
long frame steps in slices instead of clamping (clamping throws time away and slows the game
under load):

```ts
import { splitStep } from '@oyun/core/pure';

interface Sim {
  t: number;
  step(dt: number): boolean;
}

/** Call from update(): never more than 50 ms per sim step, never loses time. */
export function advance(sim: Sim, deltaMs: number): boolean {
  for (const dt of splitStep(deltaMs / 1000, 0.05)) if (sim.step(dt)) return true; // ended
  return false;
}
```

Why: Phaser's smoothing assumes a focused 60 Hz window. Headless Chromium is never focused and
on a loaded machine renders at ~12 fps, so every 80 ms frame counted as 16.7 ms and game time
ran at about a fifth of real time (a 3.5-minute round took ~6 minutes; a slowed reveal looked
like a hang). The template's smoke spec checks the round clock against the wall clock
(`clockRate()`).

## Strings (i18n)

English is the source and fallback; Turkish must have the same keys (compile error otherwise).
Language = `?lang=` → first supported entry of `navigator.languages` → `en`.

```ts
import { createI18n, defineStrings, pickLanguage } from '@oyun/core/pure';

export const STRINGS = defineStrings({
  en: { 'game.score': 'Score {n}', 'game.hint': 'Tap the circle!' },
  tr: { 'game.score': 'Puan {n}', 'game.hint': 'Daireye dokun!' },
});

const i18n = createI18n(STRINGS, pickLanguage(['tr-TR']));
i18n.t('game.score', { n: 3 }); // "Puan 3"
```

Adding a string: add the key to **both** `en` and `tr` in `src/strings.ts`, use it through
`this.t('key', params)`. Rules: every player-visible text goes through `t()` (no literals in
scenes, numbers excepted); key names are `area.thing`; `{name}` placeholders must match in both
languages (the template's `strings.test.ts` checks it); never upper-case in code
(`'i'.toUpperCase()` is wrong for Turkish) — write the text as displayed. Core shell keys
(`core.play`, `core.paused`, `core.resume`, `core.quit`, `core.menu`, `core.replay`,
`core.score`, `core.best` `{n}`, `core.newBest`, `core.soundOn`, `core.soundOff`) can be
overridden by putting the same key in your table. A missing key logs `console.error`, which
fails the smoke test.

## Platform

Game code calls `this.oyun.platform`; it never imports an SDK or checks which platform it is on.

```ts
import type { OyunContext } from '@oyun/core';

export async function betweenRounds(oyun: OyunContext, score: number): Promise<number> {
  oyun.platform.track('round_end', { score }); // snake_case event names
  oyun.platform.haptic('success');
  await oyun.platform.showInterstitial('between_rounds'); // only at natural breaks
  const reward = await oyun.platform.showRewarded('double_score');
  return reward === 'granted' ? score * 2 : score; // grant ONLY on 'granted'
}
```

| | web (default) | crazygames | capacitor |
|---|---|---|---|
| interstitial | `'unavailable'` | SDK `midgame` → `'shown'`/`'error'` | `'unavailable'` (no provider wired) |
| rewarded | **`'granted'`** (so reward flows are testable) | SDK `rewarded` → `'granted'`/`'error'` | `'unavailable'` |
| haptic | no-op (logged) | no-op | `Plugins.Haptics` if installed |
| track | no-op (logged) | no-op | no-op |
| gameplayStart/Stop | logged | SDK `game.gameplayStart/Stop` | no-op |
| pause/resume | `visibilitychange` | + around ads | `visibilitychange` |
| status | tested | **unverified stub** | **unverified stub** |

- Pick: `?test=1` → web; else `VITE_OYUN_PLATFORM` at build time; else native Capacitor shell;
  else `?platform=`; else a `*.crazygames.*` host; else web.
- Call `gameplayStart()` when a round starts and `gameplayStop()` when it ends (the pause menu
  does it for pauses).
- Lifecycle is reference-counted (`hidden`, `ad`, `system`): resume fires only when every
  reason has cleared. Core suspends audio on pause; scenes with `autoPause` open the pause menu.
- In test mode `__OYUN__.state().meta.platformCalls` lists the web adapter's recent calls.

## Test hook (`window.__OYUN__`)

Installed **only** with `?test=1`. Smoke tests drive the game through state, never pixels.

```text
__OYUN__.ready                 true once the first scene after boot has run create()
__OYUN__.state()               { ready, scene, scenes, meta, data }
                                 scene  = top registered scene key ('menu' | 'game' | 'pause' | 'result' …)
                                 scenes = all running/paused OyunScenes, bottom → top
                                 meta   = { seed, lang, platform, muted, orientation, paused, platformCalls }
                                 data   = top scene's testState()
__OYUN__.act(name, payload?)   runs the top-most scene's action `name`; throws on unknown names
__OYUN__.actions()             available action names
__OYUN__.pixel(x, y)           Promise<{ r, g, b, a }>: colour the renderer drew at logical (x, y)
                                 on the next frame. Proves something is VISIBLE (e.g. the pause
                                 menu over an opaque game scene), which state() cannot.
```

`meta` also has `realTime` (see [Game time](#game-time)).

Contract for game builders:

1. Every scene that takes input exposes its actions in `testActions()`, and each action calls
   **the same handler** real input calls (`onTap(x, y)`, `button.fire()`) — never set fields
   directly.
2. `testState()` returns small JSON: score, timers, positions needed to act (e.g. target x/y),
   flags. Round floats.
3. The smoke spec plays a full session: menu → game → (pause) → result, asserts something
   about the score, saves screenshots, and ends with `expect(errors).toEqual([])`.
4. Gameplay must be deterministic for a given `?seed=` (all gameplay randomness from the
   session RNG). If a session would take long, make the round short or expose an action that a
   real player could also perform (e.g. quit from the pause menu) — no test-only cheats.

E2E helpers (`@oyun/core/e2e`): `openGame(page, { seed, lang })`, `state(page)`,
`act(page, name, payload)`, `waitForScene(page, key)`, `setHidden(page, bool)` (real
`visibilitychange`), `shot(page, gameDir, name)` → `tests/artifacts/<name>.png`,
`collectErrors(page)`, `smokeConfig({ orientation, gameDir })`, `pixel(page, x, y)` +
`colorNear(rgba, 0xRRGGBB, tolerance = 6)`, `clockRate(page, key, ms = 3000)` (game seconds of
the `data[key]` timer per wall second, frames counted at most 200 ms; `rate` ≈ 1 when game
time follows real time). The template smoke spec asserts both: the pause card pixel is the
theme's `surface` colour, and the round clock runs at 0.85–1.15× real time.

## Rules for game builders

1. **Sim purity.** Rules live in `src/sim/` as plain TypeScript: no `phaser`, no `@oyun/core`
   (only `@oyun/core/pure`), no `window`/`document`/`localStorage`, no `Math.random`. Lint
   enforces it. Scenes draw sim state and forward input; they hold no rules.
2. **Test-first for the sim.** Write the vitest test, watch it fail, then implement.
3. **Test hook contract** as above; the smoke test must reach the result screen.
4. **No new dependencies** without recording the package, exact version and reason in the
   game's `GAME.md` (and here if it goes into core). Pin exact versions. No CDNs, no
   downloaded assets; art is code-drawn, sound is synthesized.
5. **Touch targets ≥ 88 logical px**; critical UI inside the safe area (`this.layout`).
6. **Strings** only through `t()`, both languages, see i18n rules.
7. **Textures** via `TextureRecipe`s in `src/textures.ts`, colours in `PALETTE`.
8. **Saves** through `createSaveStore` with a version; keep migrations forever.
9. **Juice is proportional**: one `feedback(tier, …)` per event; big tiers for big moments.
10. **Platform**: no SDK imports; interstitials only at natural breaks; reward only on
    `'granted'`; call `gameplayStart/Stop`.
11. **Never edit `games/ornek` by hand.** Change `templates/game`, then
    `npm run new-game -- ornek "Örnek" --force`; the gate fails if they drift.
12. **Do not touch core from a game branch** unless your task says so; propose the change.
13. `npm run gate -- <slug>` green before claiming done; read the screenshots.

## The gate

`npm run gate` (all games) or `npm run gate -- <slug>`; fails fast with a summary.

| Target | Stages |
|---|---|
| core | `template` (games/ornek ≡ fresh render of templates/game) → `readme` (this file's `ts` blocks type-check) → `typecheck` → `lint` → `unit` |
| each game | `typecheck` → `lint` → `unit` → `build` (vite) → `size` → `smoke` (Playwright, built game, `?test=1&seed=1`, 390×844 portrait / 844×390 landscape, touch, any console/page error fails, screenshots in `games/<slug>/tests/artifacts/`, git-ignored) |

Bundle budget: **≤ 550 KB gzip of JS** and **≤ 5 MB total `dist/`**. Phaser 4 is ~345 KB
gzip of that, the template game ~359 KB total; a game has ~190 KB gzip of headroom. Raising
the budget needs a recorded reason.

## Decisions (and why)

| Decision | Why |
|---|---|
| Core is consumed as TypeScript source (`exports` → `src/*.ts`), no build step | One less moving part; Vite and Vitest compile it; type errors show up in the game's typecheck. |
| Two entry points (`@oyun/core` vs `/pure`) | Phaser cannot load in node; sims and unit tests need a Phaser-free import. Lint forbids the full entry in `src/sim`. |
| `OyunScene` wraps `create()` instead of requiring `super.create()` | A forgotten super call would silently break the test hook and pause handling. |
| Phaser audio disabled; own WebAudio synth | No audio files at all; buses, mute persistence and lifecycle suspend in one place. |
| Logical 720×1280 + `Scale.FIT`, letterboxed, no DPR render scaling | Simple, matches the design doc. Cost: slightly soft text on 3× phones (see weak spots). |
| Safe area = CSS `env(safe-area-inset-*)` mapped onto the canvas; letterbox counts | Works in mobile browsers and Capacitor WebViews (`viewport-fit=cover` in index.html). |
| Storage is synchronous (localStorage, memory fallback) | Saves stay simple and synchronous. A Capacitor Preferences adapter must hydrate into memory before boot and write through. |
| Newer-version saves become read-only | Never overwrite progress from a newer build after a downgrade. |
| Web rewarded ads resolve `'granted'`, interstitials `'unavailable'` | Reward flows are playable and testable without a provider; no fake interstitial delay. |
| Test mode forces the web platform | Smoke tests are deterministic and never hit an SDK. |
| PauseScene registered last + `bringToTop` on open | Phaser draws in scene-list order and `launch()` does not reorder; registered before the game's scenes, the menu was drawn under any opaque game scene while its invisible buttons still took input (seen in two games). Registering last covers the common case; `bringToTop` covers scenes a game launches or reorders itself. |
| Toasts default to the middle of the safe area; `position` option | At the top they covered every game's HUD (clock and danger pips, title bar and resource readouts, a result title) exactly when it mattered; the bottom band holds sliders, drawers and button rows. The middle is the one band every layout keeps for content, and a toast is short. `'top'` stays available. |
| Game time follows the wall clock under automation / `?test=1` (`realTimeDelta`, cap 200 ms); real players keep Phaser's smoothing | Phaser clamps frames to 16.7 ms when the window is unfocused, which headless always is: on a loaded machine timers ran 3–5× slow and playtests/smoke tests measured the wrong game. 200 ms is Phaser's own per-frame ceiling (`fps.min` 5), so no scene sees a bigger step than before; real players' feel is unchanged. |
| Pause menu on tab hide waits for the player | Returning to a running game is unfair; the round clock stops (Phaser also sleeps its loop while hidden). |
| Buttons fire on release; gameplay taps on press | Release lets players cancel menu taps; press keeps gameplay responsive. |
| Mulberry32 RNG with `fork(label)` | Tiny, fast, good enough for games; forks keep streams independent. |
| Font: Nunito 800 only, latin + latin-ext subsets, bundled from npm (OFL-1.1) | Turkish glyphs, ~33 KB woff2, no CDN. One weight keeps the bundle small. |
| Playwright `@playwright/test` pinned to 1.63.0 | Matches the machine's preinstalled Chromium; never run `playwright install` locally. Browser lookup: `OYUN_CHROMIUM` if set; else `/opt/pw-browsers/chromium` when `PLAYWRIGHT_BROWSERS_PATH` is unset; else Playwright's default (CI installs the matching browser). Tracing, video and Playwright screenshots are off. |
| TypeScript **6.0.3**, not 7.0.2 | `typescript-eslint` 8.73.0 (latest) supports `typescript <6.1.0`; type-aware lint is required, so TS is held at the newest supported version. |
| No physics, music sequencer, gamepad focus, scene stack beyond pause | No game needs them yet; add when one does. |

## Known gaps and unverified parts

- **Android/iOS are unverified.** No Android SDK or Xcode here. For `games/ornek`,
  `npx cap config`, `npx cap add android` and `npx cap sync android` were run locally and
  succeed (the generated project wants JDK 21, compile/target SDK 36, min SDK 24), but no Gradle
  build has ever run and `.github/workflows/android.yml` has never run. iOS has no workflow
  (needs a Mac). `android/` and `ios/` are git-ignored; generate them, never commit them.
- **CrazyGames adapter is an unverified stub** written from the SDK v3 documented shape; the
  SDK script is injected only when building with `VITE_OYUN_PLATFORM=crazygames`.
- **Capacitor adapter** has no ads or analytics provider; haptics need `@capacitor/haptics`
  added to the native project.
- Text is rendered at 720 px canvas width, then scaled: soft on high-DPR phones.
- No gamepad/keyboard focus navigation (buttons accept an optional hotkey only).
- No music; only sfx presets.
- Deleting a game folder leaves an `extraneous` entry in `package-lock.json`; run `npm install`
  and check the lockfile diff.
