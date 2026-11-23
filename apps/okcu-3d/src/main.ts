/**
 * Entry: owns the world, the clock and the drag → shot mapping (same numbers as the 2D game's
 * GameScene), builds the view modules and feeds them one Frame per animation frame.
 *
 * URL switches (for development and the screenshot tool, never in a store build): dev.ts.
 *
 * Without switches every run is set up from the save (ui/save.ts) the way the 2D game does it:
 * `metaOf3d(save)` (shop upgrades + the selected weapon at its level), the chapter select, the daily run. ?bow, ?armor,
 * ?chapter and ?wave override the save for testing (web builds only), and such a test run never writes to it.
 * ?bow=N sets the bow-derived weapon level (levelForBow(N)) on whatever weapon the arsenal has
 * selected, not only the bow.
 *
 * The platform (rewarded ads, haptics) is chosen like core's createGame does it for the Phaser
 * games: VITE_OYUN_PLATFORM at build time (the Play / App Store builds pass "capacitor": AdMob
 * rewarded ads), else the native shell, else (web builds only) ?platform=, else web (?test=1 always web).
 */
import { capacitorBridge, createPlatform, createRng, detectPlatform, hashSeed, pageAddress, pickLanguage, STORE_BUILD, webStorage } from '@oyun/core/pure';
import { CAREFUL, planShot } from '@sim/aimbot';
import { BOW_MAX } from '@sim/bow';
import { bowEquivalent, levelForBow, WEAPON_IDS } from '@sim/weapons';
import { metaOf3d, newBank, NO_META, UPGRADES } from '@sim/meta';
import { allowedMode, MODES, type Mode } from '@sim/modes';
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
  rushJump,
  shoot,
  takeEvents,
  unleash,
  type GameEvent,
  type World,
} from '@sim/world';
import { DRAG_DEAD, DRAG_FULL } from '@okcu/scenes/keys';
import { loadAssets } from './assets';
import type { AimState, ArchersView, Frame, FxView, Game, Module, RunOptions } from './contract';
import {
  DEV_ARMOR,
  DEV_AUTO,
  DEV_BOSS,
  DEV_BOW,
  DEV_CELESTIAL,
  DEV_CHAPTER,
  DEV_CLASSIC,
  DEV_LANG,
  DEV_MODE,
  DEV_OFF,
  DEV_SEED,
  DEV_SPEED,
  DEV_TEST_RUN,
  DEV_WAVE,
  DEV_WEAPON,
} from './dev';
import { createHud } from './ui/hud';
import { startOnline, syncOnline } from './ui/online';
import { openSave, todayKey } from './ui/save';
import { createArchers } from './view/archers';
import { createArena } from './view/arena';
import { createArrows } from './view/arrows';
import { createBowGlow } from './view/bowglow';
import { createFx } from './view/fx';
import { createStage } from './view/stage';

// One language for every module (the HUD's i18n and the fx module, which reads <html lang>): the
// device's (web builds: or ?lang=tr|en). index.html ships lang="tr" only as the pre-boot default.
document.documentElement.lang = pickLanguage(navigator.languages, DEV_LANG);
/** the aim bot plays (web builds only: ?auto=1, or the dev hook's bot()) */
let auto = DEV_AUTO;

const root = document.getElementById('stage')!;
const stage = createStage(root);

const save = openSave(webStorage());

/** core's createGame platform choice, without Phaser */
const platform = createPlatform(
  detectPlatform({
    ...pageAddress(),
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
const forcedWeapon = WEAPON_IDS.find((id) => id === DEV_WEAPON) ?? null;
/** the 3D build plays the harder setting; ?difficulty=classic for comparison (web builds only) */
const difficulty: Difficulty = DEV_CLASSIC ? 'classic' : 'hard';
// Online board (Play Games, adults only): real play only, never test runs or the classic setting.
if (!DEV_TEST_RUN && difficulty === 'hard') startOnline(webStorage(), save);
const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

/** the run being played: daily or not, the quick title; and the chapter select's choice (the 2D `session.chapter`) */
let mode: { daily: boolean; quick: boolean } = { daily: false, quick: false };
let chapterPick = 0;
/** the mode being played (the Events tab's Blitz or Boss Rush; ?mode= opens one), null for a run of chapters */
let play: Mode | null = MODES.find((id) => id === DEV_MODE) ?? null;

/** GameScene.create: the daily run is the same for everyone, so upgrades and the bow do not apply. */
function newWorld(seed: number): World {
  const d = save.data;
  const daily = mode.daily;
  const key = todayKey();
  const meta = daily ? { ...NO_META } : metaOf3d(d);
  if (forcedWeapon) {
    meta.weapon = forcedWeapon;
    meta.wlevel = d.arsenal.weapons[forcedWeapon].level;
    meta.bow = bowEquivalent(meta.wlevel); // the glow follows the weapon in hand
  }
  if (DEV_BOW !== null) {
    meta.bow = Math.max(0, Math.min(BOW_MAX, Math.round(DEV_BOW)));
    meta.wlevel = levelForBow(meta.bow); // hard reads the weapon level, not the old bow
  }
  if (DEV_ARMOR !== null) meta.hp = Math.max(0, Math.min(UPGRADES.hp.max, Math.round(DEV_ARMOR)));
  chapterPick = Math.max(0, Math.min(d.chapter, chapterPick));
  const startChapter = DEV_CHAPTER !== null ? Math.round(DEV_CHAPTER) : daily ? 0 : chapterPick;
  const w = createWorld({ seed: daily ? hashSeed(`okcu-daily-${key}`) : seed, meta, startChapter, mod: daily ? dailyChallenge(key).mod : null, difficulty, mode: play });
  if (play === 'bossrush' && DEV_BOSS !== null) rushJump(w, Math.round(DEV_BOSS) - 1);
  else if (DEV_WAVE !== null && !play) jumpToWave(w, Math.round(DEV_WAVE));
  // what this run has written to the save (banked by the UI as the run goes)
  w.bank = DEV_TEST_RUN ? null : newBank(d);
  return w;
}

let world = newWorld(Math.round(DEV_SEED ?? randomSeed()));
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
  get celestial() {
    return DEV_CELESTIAL ?? save.data.arsenal.celestial;
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
  get mode() {
    return play;
  },
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
    // a mode is its own kind of run: never the daily; one still locked on this save is refused
    // (a run of chapters starts instead)
    play = allowedMode(save.data, opts.mode, DEV_TEST_RUN);
    mode = { daily: play ? false : (opts.daily ?? false), quick: opts.quick ?? false };
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
    // (a mode run ends for good)
    return world.phase === 'over' && !world.revived && !world.mode;
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
    game.startRun({ daily: mode.daily, mode: play, quick: true, ...(seed !== undefined ? { seed } : {}) });
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
  if (DEV_OFF.has(name)) return fallback;
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
  const arrows = guard('arrows', () => createArrows(stage, game), NOOP);
  const fx = guard<FxView>('fx', () => createFx(stage), { update() {}, timeScale: () => 1 });
  const bowglow = guard('bowglow', () => createBowGlow(stage, archers, game), NOOP);
  const hud = guard('ui', () => createHud(stage, game), NOOP);

  const botRng = createRng(7);
  let botWait = 1.2;
  let time = 0;
  let last = performance.now();
  let frames = 0;

  // the dev hook for the e2e and screenshot tools (web builds only, never in a store build)
  if (!STORE_BUILD) {
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
      /** turn the aim bot on or off (as ?auto=1), for tools that first tap their way somewhere (a mode) */
      bot(on: boolean) {
        auto = on;
      },
    };
    (window as unknown as { __okcu3d: typeof hook }).__okcu3d = hook;
  }

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
    const dt = real * fx.timeScale() * DEV_SPEED;

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
    if (!STORE_BUILD && auto) {
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
