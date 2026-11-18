/**
 * Entry: owns the world, the clock and the drag → shot mapping (same numbers as the 2D game's
 * GameScene), builds the view modules and feeds them one Frame per animation frame.
 *
 * URL switches (for development and the screenshot tool):
 *   ?seed=N      fixed run seed            ?bow=N    bow level 0 … 20 (meta.bow)
 *   ?wave=N      jump to wave N            ?chapter=N start chapter 0 … 4
 *   ?auto=1      the aim bot plays         ?off=a,b  skip modules (stage is never skipped):
 *                                                     arena, archers, arrows, fx, bowglow, ui
 *   ?speed=K     game speed multiplier         ?armor=N  health upgrade level 0 … 8 (meta.hp; shown as armour)
 */
import { createRng } from '@oyun/core/pure';
import { CAREFUL, planShot } from '@sim/aimbot';
import { NO_META } from '@sim/meta';
import {
  advance,
  aimAt,
  canShoot,
  createWorld,
  jumpToWave,
  pickCard,
  reroll,
  shoot,
  takeEvents,
  unleash,
  type GameEvent,
  type World,
} from '@sim/world';
import { DRAG_DEAD, DRAG_FULL } from '@okcu/scenes/keys';
import { loadAssets } from './assets';
import type { AimState, ArchersView, Frame, FxView, Game, Module } from './contract';
import { createHud } from './ui/hud';
import { createArchers } from './view/archers';
import { createArena } from './view/arena';
import { createArrows } from './view/arrows';
import { createBowGlow } from './view/bowglow';
import { createFx } from './view/fx';
import { createStage } from './view/stage';

const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number): number => {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? v : fallback;
};
const off = new Set((params.get('off') ?? '').split(',').filter(Boolean));
const speed = num('speed', 1);
const auto = params.get('auto') === '1';

const root = document.getElementById('stage')!;
const stage = createStage(root);

function newWorld(seed: number): World {
  const w = createWorld({ seed, meta: { ...NO_META, bow: Math.max(0, Math.min(20, Math.round(num('bow', 0)))), hp: Math.max(0, Math.min(8, Math.round(num('armor', 0)))) }, startChapter: Math.round(num('chapter', 0)) });
  if (params.has('wave')) jumpToWave(w, Math.round(num('wave', 1)));
  return w;
}

let world = newWorld(Math.round(num('seed', Math.floor(Math.random() * 2 ** 31))));
let aim: AimState | null = null;
let buffered: { angle: number; power: number } | null = null;

function dragShot(a: AimState): { angle: number; power: number } | null {
  const dx = a.x0 - a.x;
  const dy = a.y0 - a.y;
  const len = Math.hypot(dx, dy);
  if (len < DRAG_DEAD) return null;
  return { angle: Math.atan2(dy, dx), power: Math.min(1, (len - DRAG_DEAD) / (DRAG_FULL - DRAG_DEAD)) };
}

function release(angle: number, power: number): boolean {
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
  dragStart(x, y) {
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
  unleash() {
    unleash(world);
  },
  restart(seed) {
    aim = null;
    buffered = null;
    world = newWorld(seed ?? Math.floor(Math.random() * 2 ** 31));
  },
};

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
