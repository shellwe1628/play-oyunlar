/**
 * Entry: owns the world, the clock and the drag → shot mapping (same numbers as the 2D game's
 * GameScene), builds the view modules and feeds them one Frame per animation frame.
 *
 * URL switches (for development and the screenshot tool):
 *   ?seed=N      fixed run seed            ?bow=N    old bow +0 … 25 (meta.bow, weapon level from it)
 *   ?wave=N      jump to wave N            ?chapter=N start chapter 0 … 6 (6 = endless)
 *   ?auto=1      the aim bot plays         ?off=a,b  skip modules (stage is never skipped):
 *                                                     arena, archers, arrows, fx, bowglow, ui
 *   ?speed=K     game speed multiplier         ?armor=N  health upgrade level 0 … 12 (meta.hp; shown as armour)
 *   ?calm=1      reduced motion (also on with the system's prefers-reduced-motion): softer shake and zoom
 *   ?difficulty=classic  the 2D game's difficulty (the 3D build plays 'hard')
 *
 * Without switches every run is set up from the save (ui/save.ts) the way the 2D game does it:
 * `metaOf3d(save)` (shop upgrades + the selected weapon at its level), the chapter select, the daily run. ?bow, ?armor,
 * ?chapter and ?wave override the save for testing, and such a test run never writes to it.
 * ?bow=N (debug only) sets the bow-derived weapon level (levelForBow(N)) on whatever weapon the
 * arsenal has selected, not only the bow.
 *
 * The platform (rewarded ads, haptics) is chosen like core's createGame does it for the Phaser
 * games: VITE_OYUN_PLATFORM at build time (the Play / App Store builds pass "capacitor": AdMob
 * rewarded ads), else the native shell, ?platform=, else web (?test=1 always web).
 */
import {
  capacitorBridge,
  createCapacitorPlatform,
  createCrazyGamesPlatform,
  createRng,
  createWebPlatform,
  detectPlatform,
  hashSeed,
  pickLanguage,
  webStorage,
  type Platform,
  type PlatformName,
} from '@oyun/core/pure';
import { CAREFUL, planShot } from '@sim/aimbot';
import { BOW_MAX } from '@sim/bow';
import { levelForBow } from '@sim/weapons';
import { metaOf3d, newBank, NO_META, UPGRADES } from '@sim/meta';
import { dailyChallenge } from '@sim/progress';
import type { Difficulty } from '@sim/waves';
import {
  advance,
  aimAt,
  canShoot,
  createWorld,
  jumpToWave,
  pickCard,
  addExtraCard,
  reroll,
  revive,
  shoot,
  takeEvents,
  unleash,
  type GameEvent,
  type World,
} from '@sim/world';
import { DRAG_DEAD, DRAG_FULL } from '@okcu/scenes/keys';
import { loadAssets } from './assets';
import type { AimState, ArchersView, Frame, FxView, Game, Module, RunOptions } from './contract';
import { createHud } from './ui/hud';
import { startOnline, syncOnline } from './ui/online';
import { openSave, todayKey } from './ui/save';
import { createArchers } from './view/archers';
import { createArena } from './view/arena';
import { createArrows } from './view/arrows';
import { createBowGlow } from './view/bowglow';
import { createFx } from './view/fx';
import { createStage } from './view/stage';

const params = new URLSearchParams(location.search);
// One language for every module (the HUD's i18n and the fx module, which reads <html lang>): the
// device's, or ?lang=tr|en. index.html ships lang="tr" only as the pre-boot default.
document.documentElement.lang = pickLanguage(navigator.languages, params.get('lang'));
const num = (key: string, fallback: number): number => {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? v : fallback;
};
const off = new Set((params.get('off') ?? '').split(',').filter(Boolean));
const speed = num('speed', 1);
const auto = params.get('auto') === '1';

const root = document.getElementById('stage')!;
const stage = createStage(root);

const save = openSave(webStorage());

/** core's createGame/makePlatform, without Phaser */
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
const platform = makePlatform(
  detectPlatform({
    search: location.search,
    hostname: location.hostname,
    forced: import.meta.env.VITE_OYUN_PLATFORM as string | undefined,
    capacitorNative: capacitorBridge()?.isNativePlatform?.() ?? false,
  }),
);
// never rejects in practice; the game starts while the ad SDK warms up
void platform.init().catch(() => undefined);
/** the platform is paused (an ad is on screen, or the app is hidden): the world does not advance */
let held = platform.paused;
platform.onLifecycle(() => {
  held = platform.paused;
});
let adShowing = false;
const testRun = ['bow', 'armor', 'chapter', 'wave'].some((k) => params.has(k));
/** the 3D build plays the harder setting; ?difficulty=classic for comparison */
const difficulty: Difficulty = params.get('difficulty') === 'classic' ? 'classic' : 'hard';
// Online board (Play Games, adults only): real play only, never test runs or the classic setting.
if (!testRun && difficulty === 'hard') startOnline(webStorage(), save);
const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

/** the run being played: daily or not, the quick title; and the chapter select's choice (the 2D `session.chapter`) */
let mode: { daily: boolean; quick: boolean } = { daily: false, quick: false };
let chapterPick = 0;

/** GameScene.create: the daily run is the same for everyone, so upgrades and the bow do not apply. */
function newWorld(seed: number): World {
  const d = save.data;
  const daily = mode.daily;
  const key = todayKey();
  const meta = daily ? { ...NO_META } : metaOf3d(d);
  if (params.has('bow')) {
    meta.bow = Math.max(0, Math.min(BOW_MAX, Math.round(num('bow', 0))));
    meta.wlevel = levelForBow(meta.bow); // hard reads the weapon level, not the old bow
  }
  if (params.has('armor')) meta.hp = Math.max(0, Math.min(UPGRADES.hp.max, Math.round(num('armor', 0))));
  chapterPick = Math.max(0, Math.min(d.chapter, chapterPick));
  const startChapter = params.has('chapter') ? Math.round(num('chapter', 0)) : daily ? 0 : chapterPick;
  const w = createWorld({ seed: daily ? hashSeed(`okcu-daily-${key}`) : seed, meta, startChapter, mod: daily ? dailyChallenge(key).mod : null, difficulty });
  if (params.has('wave')) jumpToWave(w, Math.round(num('wave', 1)));
  // what this run has written to the save (banked by the UI as the run goes)
  w.bank = testRun ? null : newBank(d);
  return w;
}

let world = newWorld(Math.round(num('seed', randomSeed())));
let aim: AimState | null = null;
let buffered: { angle: number; power: number } | null = null;
let paused = false;

function dragShot(a: AimState): { angle: number; power: number } | null {
  const dx = a.x0 - a.x;
  const dy = a.y0 - a.y;
  const len = Math.hypot(dx, dy);
  if (len < DRAG_DEAD) return null;
  return { angle: Math.atan2(dy, dx), power: Math.min(1, (len - DRAG_DEAD) / (DRAG_FULL - DRAG_DEAD)) };
}

function release(angle: number, power: number): boolean {
  if (paused) return false;
  if (!canShoot(world)) {
    // let go a moment early: fire as soon as the arrow is nocked
    if (world.reload > 0 && world.reload < 0.3 && world.player.alive) buffered = { angle, power };
    world.player.draw = 0;
    return false;
  }
  const ok = shoot(world, angle, power);
  if (!ok) world.player.draw = 0;
  return ok;
}

const game: Game = {
  get w() {
    return world;
  },
  get bowLevel() {
    return world.meta.bow;
  },
  get save() {
    return save;
  },
  get daily() {
    return mode.daily;
  },
  get chapter() {
    return chapterPick;
  },
  get quick() {
    return mode.quick;
  },
  testRun,
  platform,
  get adShowing() {
    return adShowing;
  },
  async rewarded(placement) {
    if (adShowing) return 'unavailable';
    adShowing = true;
    // no half-drawn string under the ad
    aim = null;
    buffered = null;
    world.player.draw = 0;
    try {
      return await platform.showRewarded(placement);
    } catch {
      return 'error';
    } finally {
      adShowing = false;
    }
  },
  get paused() {
    return paused;
  },
  setPaused(on) {
    if (on === paused) return;
    paused = on;
    // no half-drawn string under the menu, no shot fired on resume
    aim = null;
    buffered = null;
    world.player.draw = 0;
  },
  startRun(opts: RunOptions = {}) {
    mode = { daily: opts.daily ?? false, quick: opts.quick ?? false };
    if (opts.chapter !== undefined) chapterPick = opts.chapter;
    paused = false;
    aim = null;
    buffered = null;
    world = newWorld(opts.seed ?? randomSeed());
  },
  toTitle() {
    syncOnline();
    game.startRun({});
  },
  dragStart(x, y) {
    if (paused) return;
    aim = { x0: x, y0: y, x, y, shot: null };
  },
  dragMove(x, y) {
    if (!aim) return;
    aim.x = x;
    aim.y = y;
    aim.shot = dragShot(aim);
  },
  dragEnd() {
    if (!aim) return;
    const shot = dragShot(aim);
    aim = null;
    if (shot) release(shot.angle, shot.power);
    else world.player.draw = 0;
  },
  dragCancel() {
    aim = null;
    world.player.draw = 0;
  },
  pickCard(index) {
    pickCard(world, index);
  },
  reroll() {
    reroll(world);
  },
  extraCard() {
    return addExtraCard(world);
  },
  get canRevive() {
    return world.phase === 'over' && !world.revived;
  },
  revive() {
    if (!revive(world)) return false;
    paused = false;
    aim = null;
    buffered = null;
    return true;
  },
  unleash() {
    unleash(world);
  },
  restart(seed) {
    game.startRun({ daily: mode.daily, quick: true, ...(seed !== undefined ? { seed } : {}) });
  },
};

// the app may be killed while hidden: pause a run in progress (the UI banks and shows the menu)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  // an ad's own activity may hide the page: that is not the player leaving (no pause menu after it)
  if (adShowing) return;
  const phase = world.phase;
  if (phase !== 'title' && phase !== 'over') game.setPaused(true);
});

const failures = new Map<string, string>();
function guard<T>(name: string, make: () => T, fallback: T): T {
  if (off.has(name)) return fallback;
  try {
    return make();
  } catch (err) {
    failures.set(name, String(err));
    console.error(`[okcu-3d] ${name} failed to start`, err);
    return fallback;
  }
}
function run(name: string, mod: Module, frame: Frame): void {
  if (failures.has(name)) return;
  try {
    mod.update(frame);
  } catch (err) {
    failures.set(name, String(err));
    console.error(`[okcu-3d] ${name} threw in update; it is disabled until reload`, err);
  }
}

const NOOP: Module = { update() {} };

async function start(): Promise<void> {
  const assets = await loadAssets();
  const arena = guard('arena', () => createArena(stage), NOOP);
  const archers = guard<ArchersView>('archers', () => createArchers(stage, assets, game), { update() {}, bowOf: () => null });
  const arrows = guard('arrows', () => createArrows(stage), NOOP);
  const fx = guard<FxView>('fx', () => createFx(stage), { update() {}, timeScale: () => 1 });
  const bowglow = guard('bowglow', () => createBowGlow(stage, archers, game), NOOP);
  const hud = guard('ui', () => createHud(stage, game), NOOP);

  const botRng = createRng(7);
  let botWait = 1.2;
  let time = 0;
  let last = performance.now();
  let frames = 0;

  const hook = {
    ready: true,
    get w() {
      return world;
    },
    game,
    stage,
    failures,
    get frames() {
      return frames;
    },
    /** fire a shot directly (sim angle, power 0 … 1) */
    shoot: (angle: number, power: number) => release(angle, power),
    /** step the game without waiting for real time (seconds of game time) */
    skip(seconds: number) {
      for (let t = 0; t < seconds; t += 1 / 60) {
        advance(world, 1 / 60);
        takeEvents(world);
      }
    },
  };
  (window as unknown as { __okcu3d: typeof hook }).__okcu3d = hook;

  function tick(now: number): void {
    const real = Math.min(0.2, (now - last) / 1000);
    last = now;
    if (paused || held || adShowing) {
      // nothing advances; the view modules redraw a frozen frame, the UI keeps its own clock (menus animate)
      const still: Frame = { w: world, dt: 0, real: 0, time, events: [], aim: null };
      run('arena', arena, still);
      run('archers', archers, still);
      run('arrows', arrows, still);
      run('fx', fx, still);
      run('bowglow', bowglow, still);
      run('ui', hud, { ...still, real });
      stage.render(still);
      frames++;
      requestAnimationFrame(tick);
      return;
    }
    const dt = real * fx.timeScale() * speed;

    if (aim) {
      aim.shot = dragShot(aim);
      if (aim.shot) aimAt(world, aim.shot.angle, aim.shot.power);
      else world.player.draw = 0;
    }
    if (buffered && canShoot(world)) {
      const b = buffered;
      buffered = null;
      release(b.angle, b.power);
    }
    if (auto) {
      botWait -= dt;
      if (world.phase === 'cards') {
        if (botWait <= 0) {
          pickCard(world, 0);
          botWait = 0.8;
        }
      } else if (world.phase === 'over') {
        if (botWait <= -3) {
          game.restart();
          botWait = 1.2;
        }
      } else if (botWait <= 0 && canShoot(world)) {
        const plan = planShot(world, botRng, CAREFUL);
        if (plan) {
          release(plan.angle, plan.power);
          botWait = 0.9;
        } else if (world.phase === 'title') {
          release(-0.5, 0.6);
          botWait = 0.9;
        }
      }
    }

    advance(world, dt);
    time += dt;
    const events: GameEvent[] = takeEvents(world).slice();
    const frame: Frame = { w: world, dt, real, time, events, aim };

    run('arena', arena, frame);
    run('archers', archers, frame);
    run('arrows', arrows, frame);
    run('fx', fx, frame);
    run('bowglow', bowglow, frame);
    run('ui', hud, frame);
    stage.render(frame);
    frames++;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

start().catch((err: unknown) => {
  console.error('[okcu-3d] could not start', err);
  const p = document.createElement('p');
  p.textContent = `Başlatılamadı: ${String(err)}`;
  p.style.cssText = 'position:absolute;inset:auto 0 40% 0;color:#fff;font:16px system-ui;text-align:center;padding:0 16px';
  root.appendChild(p);
});
