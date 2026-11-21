/**
 * Event effects: everything GameScene.handleEvents answers a simulation event with, in 3D.
 * Same triggers, counts, colours, shake strengths and timings as the 2D game: impact rings,
 * splinters thrown back along the arrow, star sparks, the KO poof into feathers, explosions,
 * heal beams and chain lightning, shield hits, loot bursts, damage numbers and words, call-outs,
 * the white flash, the hurt and focus vignettes, hit-stop and the headshot slow motion.
 * The 3D view adds light to them (additive flashes, hot streaks) but no new rules.
 *
 * Added in 3D (looks only, never fed back into the simulation): the wave's finishing knockout
 * (a deep slow motion that eases back, a gold burst and a "FINISHER!" call), the stage-clear
 * celebration (confetti and a ring around the player; fireworks after a chapter's boss), the
 * cinder king's eruption warning, gust streaks across the sky, and ember / cloud debris in the
 * new worlds. Reduced motion (see stage.ts CALM) also softens the white flash.
 *
 * Left to the HUD module, which owns those pieces: flying coins and the coin counter, banners
 * (wave, boss, "Phase 2!"), the objective result line and the one-time tips.
 */
import * as THREE from 'three';
import { THEMES, themeIndex } from '@okcu/anim/themes';
import { STRINGS } from '@okcu/strings';
import { PALETTE } from '@okcu/textures';
import { bowGlow } from '@sim/bow';
import { WEAPONS } from '@sim/weapons';
import { PT } from '@sim/ragdoll';
import { type EnemyType } from '@sim/combat';
import { type GameEvent, type World } from '@sim/world';
import { type Frame, type FxView, type Stage } from '../contract';
import { m, sx, sy } from '../coords';
import { CALM } from './stage';
import { hueColor, mixWhite, TILE } from './fx/atlas';
import { SpriteBatch } from './fx/batch';
import { Particles } from './fx/particles';
import { Ribbons } from './fx/ribbons';
import { TextFx } from './fx/text';

const ENEMY_TINT: Record<EnemyType, number> = {
  archer: PALETTE.archer,
  shield: PALETTE.shield,
  jumper: PALETTE.jumper,
  bomber: PALETTE.bomber,
  boss: PALETTE.boss,
  healer: PALETTE.healer,
  cover: PALETTE.cover,
  catcher: PALETTE.catcher,
  ward: PALETTE.ward,
  elite: PALETTE.elite,
  imp: PALETTE.imp,
  volley: PALETTE.volley,
  mage: PALETTE.mage,
  armored: 0x8a94a8,
};

const BEAMS = 8;
const BEAM_LIFE = 0.45;
const MOTES = 18;

type StringKey = keyof typeof STRINGS.en;

const rgba = (c: number, a: number): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

export function createFx(stage: Stage): FxView {
  const lang: 'tr' | 'en' = (document.documentElement.lang || navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
  const t = (key: StringKey, vars?: Record<string, number | string>): string => {
    let s: string = STRINGS[lang][key] ?? STRINGS.en[key];
    if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, String(vars[k]));
    return s;
  };

  const group = new THREE.Group();
  group.name = 'fx';
  stage.scene.add(group);
  const under = new SpriteBatch(MOTES + 4, 7);
  const lines = new Ribbons(3200, 8);
  const fx = new Particles(9, lines);
  group.add(under.mesh, lines.mesh, fx.batch.mesh);

  // screen treatments: white flash, red hurt vignette, golden focus vignette
  const screen = (background: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;will-change:opacity;background:${background}`;
    stage.overlay.append(el);
    return el;
  };
  const vignette = (c: number): string => `radial-gradient(ellipse 78% 72% at 50% 50%, ${rgba(c, 0)} 52%, ${rgba(c, 0.45)} 82%, ${rgba(c, 0.9)} 100%)`;
  const hurtEl = screen(vignette(PALETTE.danger));
  const focusEl = screen(vignette(PALETTE.focus));
  const flashEl = screen('#fff');
  const text = new TextFx(stage);
  let shownFlash = -1;
  let shownHurt = -1;
  let shownFocus = -1;
  const setOpacity = (el: HTMLDivElement, v: number, prev: number): number => {
    const q = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
    if (q !== prev) el.style.opacity = String(q);
    return q;
  };

  // heal beams and chain sparks: x0, y0, x1, y1, age, kind (0 heal, 1 zap)
  const beams = new Float32Array(BEAMS * 6);
  for (let i = 0; i < BEAMS; i++) beams[i * 6 + 4] = 9;
  let beamNext = 0;
  const beam = (x0: number, y0: number, x1: number, y1: number, kind: number): void => {
    const b = beamNext * 6;
    beamNext = (beamNext + 1) % BEAMS;
    beams[b] = x0;
    beams[b + 1] = y0;
    beams[b + 2] = x1;
    beams[b + 3] = y1;
    beams[b + 4] = 0;
    beams[b + 5] = kind;
  };

  // things the 2D game does a moment after an event (real seconds)
  const later: { at: number; kind: 'land' | 'fireworks' }[] = [];
  let fireworkN = 0;

  let slowT = 0;
  /** the finishing knockout's slow motion: real seconds left of FINISH_T */
  let finishT = 0;
  const FINISH_T = 0.7;
  /** the last eruption call (several rocks arrive as one volley) */
  let lastEruption = -9;
  let stopT = 0;
  let flashA = 0;
  let hurtFlash = 0;
  let skyT = 0;
  let lastTick = 0;
  let lastWorldTime = -1;
  let focusK = 0;
  let overlayOpen = false;

  const shake = (s: number): void => stage.shake(s);
  /** freeze the game for `ms` (juice.hitStop: max 150, overlapping stops keep the later end) */
  const hitStop = (ms: number): void => {
    stopT = Math.max(stopT, Math.min(150, ms) / 1000);
  };
  const callout = (label: string, color: number, size: number): void => {
    if (!overlayOpen) text.callout(label, color, size);
  };

  /** The other weapons' shots: what leaves the hand decides the muzzle. */
  function shotOf(e: Extract<GameEvent, { t: 'shot' }>, w: World): void {
    const dir = e.angle;
    switch (WEAPONS[w.stats.weapon].projectile) {
      case 'bolt':
        // the prod snaps: a crack of sparks and fast streaks
        fx.sparks(e.x, e.y, 4, PALETTE.white, 220);
        fx.streaks(e.x, e.y, dir, 0.35, 5, PALETTE.cream, 1000 + e.power * 400);
        fx.flash(e.x, e.y, PALETTE.cream, 90, 0.1, 0.7);
        break;
      case 'rocket':
        // the tube kicks: smoke out of both ends, sparks and a flash at the muzzle
        for (let i = 0; i < 6; i++) {
          const back = i % 2 === 1;
          const a = dir + (back ? Math.PI : 0) + (Math.random() - 0.5) * 0.9;
          const sp = 140 + Math.random() * 140;
          fx.spawn('puff', e.x - (back ? Math.cos(dir) * 50 : 0), e.y - (back ? Math.sin(dir) * 50 : 0), Math.cos(a) * sp, Math.sin(a) * sp - 30, { life: 0.6, drag: 4, scale: 0.5, scaleEnd: 1.5, tint: PALETTE.smoke, alpha: 0.85 });
        }
        fx.sparks(e.x, e.y, 8, PALETTE.fire, 300);
        fx.flash(e.x, e.y, PALETTE.fire, 170, 0.14, 0.8);
        shake(0.12);
        break;
      case 'pebble':
        fx.puffs(e.x, e.y, 2, PALETTE.dust, 60);
        fx.streaks(e.x, e.y, dir, 0.5, 3, PALETTE.white, 600 + e.power * 300);
        break;
      default:
        // a throw (spear, boomerang): a whoosh off the hand
        fx.streaks(e.x, e.y, dir, 0.6, 4, PALETTE.white, 520 + e.power * 380);
        fx.puffs(e.x, e.y, 2, PALETTE.white, 50);
        break;
    }
    if (e.over) {
      fx.ring(e.x, e.y, PALETTE.focus, 1.2, 0.25);
      fx.flash(e.x, e.y, PALETTE.focus, 150, 0.16, 0.7);
    }
  }

  function handle(e: GameEvent, w: World): void {
    const theme = THEMES[themeIndex(w.wave)] ?? THEMES[0]!;
    switch (e.t) {
      case 'shot': {
        if (w.stats.weapon !== 'bow') {
          shotOf(e, w);
          break;
        }
        // muzzle puff fanning forward + a few string sparks (the forged bow's colour from steel up)
        for (let i = 0; i < 5; i++) {
          const a = e.angle + (Math.random() - 0.5) * 1.1;
          const sp = 120 + Math.random() * 160;
          fx.spawn('puff', e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, { life: 0.35, drag: 5, scale: 0.35, scaleEnd: 1.0, alpha: 0.9 });
        }
        const glow = bowGlow(w.meta.bow);
        const col = glow.aura > 0 ? (glow.cycle ? hueColor((skyT * 0.25) % 1) : glow.color) : PALETTE.gold;
        fx.sparks(e.x, e.y, 3 + (glow.aura > 0 ? 4 : 0), col, 160 + glow.aura * 120);
        fx.streaks(e.x, e.y, e.angle, 0.5, e.over ? 6 : 3, mixWhite(col, 0.5), 520 + e.power * 380);
        if (e.over) {
          fx.ring(e.x, e.y, PALETTE.focus, 1.2, 0.25);
          fx.flash(e.x, e.y, PALETTE.focus, 150, 0.16, 0.7);
        }
        break;
      }
      case 'hit': {
        const dir = Math.atan2(e.vy, e.vx);
        const tint = ENEMY_TINT[e.enemy];
        if (e.extra && !e.ko) {
          // a barrage's extra arrow: a small flash and its number, no ring, words, shake or freeze
          // (a dozen of them a shot hid the archer behind white and shook the screen non-stop)
          fx.sparks(e.x, e.y, 2, PALETTE.white, 260);
          fx.flash(e.x, e.y, mixWhite(tint, 0.65), 60, 0.08, 0.5);
          text.damage(e.id, e.x, e.y, e.dmg, e.crit ? PALETTE.crit : PALETTE.white, false);
          break;
        }
        fx.ring(e.x, e.y, PALETTE.white, e.slowmo ? 1.6 : 0.9);
        fx.shards(e.x, e.y, dir, tint, e.slowmo ? 10 : 6);
        fx.sparks(e.x, e.y, e.slowmo ? 8 : 3, PALETTE.white, 320);
        // the blow itself: a flash at the point and hot streaks kicked back off the arrow
        fx.flash(e.x, e.y, mixWhite(tint, 0.65), e.slowmo ? 170 : e.crit ? 150 : 110, 0.12, 0.75);
        fx.streaks(e.x, e.y, dir + Math.PI, 1.5, e.slowmo ? 9 : 5, mixWhite(tint, 0.55), e.slowmo ? 900 : 700);
        text.damage(e.id, e.x, e.y, e.dmg, e.crit ? PALETTE.crit : e.slowmo ? PALETTE.gold : PALETTE.white, e.slowmo || e.crit);
        // plate armour: steel sparks fly off it (a spear or a rocket goes through, so the clang is for the rest)
        if (e.enemy === 'armored') fx.sparks(e.x, e.y, 10, 0xe8f0ff, 380);
        if (e.crit) {
          // a crit: a yellow star burst
          fx.ring(e.x, e.y, PALETTE.crit, 2, 0.3);
          fx.sparks(e.x, e.y, 12, PALETTE.crit, 460);
          if (!e.slowmo) text.word(e.id, e.x, e.y, t('hud.crit'), PALETTE.crit, 54);
        }
        if (e.slowmo) {
          slowT = 0.25;
          flashA = 0.45;
          fx.ring(e.x, e.y, PALETTE.gold, 2.6, 0.5);
          fx.flash(e.x, e.y, PALETTE.gold, 300, 0.3, 0.45);
          shake(0.45);
          text.word(e.id, e.x, e.y, e.part === 'weak' ? t('hud.weak') : t('hud.headshot'), PALETTE.gold, 64);
        } else {
          shake(e.ko ? 0.3 : e.crit ? 0.28 : 0.18);
          hitStop(e.ko ? 70 : e.crit ? 60 : 40);
        }
        break;
      }
      case 'bodyThunk':
        fx.sparks(e.x, e.y, 3, PALETTE.white, 200);
        break;
      case 'playerHit': {
        const dir = Math.atan2(e.vy, e.vx);
        shake(0.5);
        hitStop(60);
        hurtFlash = 1;
        fx.shards(e.x, e.y, dir, PALETTE.player, 7);
        fx.ring(e.x, e.y, PALETTE.danger, 1.1);
        fx.flash(e.x, e.y, PALETTE.danger, 150, 0.14, 0.8);
        fx.streaks(e.x, e.y, dir + Math.PI, 1.5, 5, mixWhite(PALETTE.danger, 0.4), 700);
        text.damage(-1, e.x, e.y, e.dmg, PALETTE.danger, true);
        break;
      }
      case 'blocked':
        fx.ring(e.x, e.y, PALETTE.bubble, 1.8, 0.4);
        fx.sparks(e.x, e.y, 8, PALETTE.bubble, 260);
        fx.flash(e.x, e.y, PALETTE.bubble, 190, 0.2, 0.55);
        text.word(-1, e.x, e.y + 60, t('hud.blocked'), PALETTE.bubble, 44);
        break;
      case 'ko': {
        fx.feathers(e.x, e.y, ENEMY_TINT[e.enemy], e.enemy === 'boss' ? 10 : 4);
        if (e.enemy !== 'boss' && (w.phase === 'play' || w.phase === 'clear') && w.enemies.every((x) => !x.alive)) {
          // the wave's last knockout: time sags and eases back, a gold burst, a call
          finishT = FINISH_T;
          hitStop(80);
          shake(0.4);
          flashA = Math.max(flashA, 0.22);
          fx.ring(e.x, e.y, PALETTE.gold, 2.2, 0.45);
          fx.flash(e.x, e.y, PALETTE.gold, 260, 0.35, 0.6);
          fx.sparks(e.x, e.y, 16, PALETTE.gold, 420);
          fx.streaks(e.x, e.y, 0, 6.28, 10, PALETTE.fireCore, 820);
          callout(t('hud.lastKo'), PALETTE.gold, 66);
        }
        const word = e.cause === 'fall' ? t('hud.fell') : e.cause === 'burn' ? t('hud.burned') : e.cause === 'crush' ? t('hud.crushed') : e.cause === 'head' ? null : t('hud.ko');
        if (word) text.word(e.id, e.x, e.y, word, PALETTE.cream, 60);
        if (e.enemy === 'boss') {
          // juice.feedback('large'): heavy shake, a long freeze, a golden burst
          shake(0.8);
          hitStop(120);
          fx.sparks(e.x, e.y, 28, PALETTE.gold, 420);
          fx.flash(e.x, e.y, PALETTE.gold, 420, 0.4, 0.7);
          slowT = 0.3;
        }
        break;
      }
      case 'loot': {
        if (e.kind === 'boss') {
          // a boss falls: golden rays, confetti (the coin fountain is the HUD's)
          fx.spawn('rays', e.x, e.y, 0, 0, { life: 1.6, scale: 0.2, scaleEnd: 1.2, tint: PALETTE.gold, alpha: 0.9, rot: 0, vr: 0.76 });
          fx.spawn('rays', e.x, e.y, 0, 0, { life: 1.6, scale: 0.15, scaleEnd: 0.9, tint: PALETTE.cream, alpha: 0.7, rot: 0.26, vr: -0.5 });
          const colors = [PALETTE.gold, PALETTE.pink, PALETTE.bubble, PALETTE.leaf, PALETTE.white];
          for (let i = 0; i < 5; i++) fx.shards(e.x, e.y - 20, -Math.PI / 2, colors[i]!, 6, 560);
          fx.flash(e.x, e.y, PALETTE.gold, 380, 0.5, 0.6);
          callout(t('hud.loot'), PALETTE.gold, 80);
        } else {
          // an elite's chest pops open
          fx.ring(e.x, e.y, PALETTE.gold, 1.8, 0.35);
          const colors = [PALETTE.gold, PALETTE.bubble, PALETTE.pink];
          for (let i = 0; i < 3; i++) fx.shards(e.x, e.y - 10, -Math.PI / 2, colors[i]!, 5, 460);
          fx.flash(e.x, e.y, PALETTE.gold, 240, 0.3, 0.6);
          callout(t('hud.loot'), PALETTE.gold, 64);
        }
        break;
      }
      case 'poof':
        fx.poof(e.x, e.y, ENEMY_TINT[e.enemy], e.enemy === 'boss' ? 1.6 : 1);
        fx.feathers(e.x, e.y, ENEMY_TINT[e.enemy], e.enemy === 'boss' ? 30 : 16);
        break;
      case 'thunk':
        // the ledge throws up its own stuff: dirt, snow, sand or stone chips
        fx.shards(e.x, e.y, -Math.PI / 2, theme.debris, 6, 280);
        fx.puffs(e.x, e.y, 3, theme.ambient === 'snow' || theme.ambient === 'wisps' ? PALETTE.white : PALETTE.dust, 70);
        // the caldera's rock spits embers where an arrow bites
        if (theme.ambient === 'embers') fx.sparks(e.x, e.y, 5, PALETTE.fire, 220);
        break;
      case 'bounce':
        fx.sparks(e.x, e.y, 5, PALETTE.grassLight, 240);
        break;
      case 'shieldHit':
        fx.sparks(e.x, e.y, e.broke ? 14 : 6, PALETTE.gold, 380);
        fx.ring(e.x, e.y, PALETTE.metalLight, e.broke ? 1.8 : 1.1, 0.22);
        fx.shards(e.x, e.y, Math.PI, PALETTE.shieldWood, e.broke ? 12 : 4);
        fx.flash(e.x, e.y, PALETTE.gold, e.broke ? 220 : 120, 0.12, 0.8);
        fx.streaks(e.x, e.y, 0, 2.2, e.broke ? 10 : 5, PALETTE.fireCore, 760);
        shake(e.broke ? 0.4 : 0.15);
        break;
      case 'plate':
        fx.sparks(e.x, e.y, 8, PALETTE.bossPlate, 360);
        fx.ring(e.x, e.y, PALETTE.bossPlate, 1, 0.2);
        fx.streaks(e.x, e.y, Math.random() * 6.28, 6.28, 6, PALETTE.fireCore, 700);
        break;
      case 'bomb':
      case 'barrel': {
        // shockwave, fireball, smoke and debris
        const big = e.t === 'barrel' ? 1.5 : 1;
        fx.ring(e.x, e.y, PALETTE.fire, 2.6 * big, 0.35);
        fx.ring(e.x, e.y, PALETTE.white, 1.6 * big, 0.2);
        fx.puffs(e.x, e.y, 8, PALETTE.smoke, 220 * big);
        fx.spawn('puff', e.x, e.y, 0, -30, { life: 0.35, scale: 1.6 * big, scaleEnd: 3.2 * big, tint: PALETTE.fireCore, alpha: 0.95 });
        fx.flash(e.x, e.y, PALETTE.fire, 420 * big, 0.3, 0.9);
        fx.flash(e.x, e.y, PALETTE.white, 200 * big, 0.12, 1);
        fx.sparks(e.x, e.y, 16, PALETTE.fire, 520);
        fx.streaks(e.x, e.y, 0, 6.28, 14, PALETTE.fireCore, 1100 * big);
        fx.shards(e.x, e.y, -Math.PI / 2, e.t === 'barrel' ? 0xa52a1f : PALETTE.bomb, 8, 420);
        shake(e.t === 'barrel' ? 0.7 : e.hurt ? 0.7 : 0.35);
        if (e.t === 'barrel') {
          flashA = Math.max(flashA, 0.3);
          callout(t('hud.boom'), PALETTE.fire, e.kills >= 2 ? 84 : 66);
        } else if (e.popped) {
          text.float(e.x, e.y - 50, t('hud.popped'), PALETTE.fireCore, 42);
        }
        break;
      }
      case 'blast':
        if (e.rocket) {
          // the firework: sized from the simulation's own burst radius
          fx.firework(e.x, e.y, e.r, CALM);
          shake(0.4);
          break;
        }
        fx.ring(e.x, e.y, e.fire ? PALETTE.fire : PALETTE.white, (e.r / 70) * 1.2, 0.3);
        fx.sparks(e.x, e.y, 10, e.fire ? PALETTE.fire : PALETTE.cream, 380);
        fx.flash(e.x, e.y, e.fire ? PALETTE.fire : PALETTE.cream, e.r * 2.6, 0.2, 0.7);
        break;
      case 'boomCatch':
        // back in the hand: a snap of air and a few glints
        fx.ring(e.x, e.y, PALETTE.cream, 0.7, 0.18);
        fx.sparks(e.x, e.y, 5, PALETTE.cream, 200);
        fx.flash(e.x, e.y, PALETTE.white, 90, 0.12, 0.6);
        break;
      case 'orbPop':
        fx.ring(e.x, e.y, 0xb08bff, 1, 0.2);
        fx.sparks(e.x, e.y, 6, 0xd8c8ff, 260);
        fx.flash(e.x, e.y, 0xb08bff, 130, 0.16, 0.7);
        break;
      case 'apple':
        // juicy pop: a flash, red juice drops, a spinning leaf, green sparkles
        fx.ring(e.x, e.y, PALETTE.white, 1.3, 0.2);
        fx.shards(e.x, e.y, 0, PALETTE.apple, 14, 340);
        fx.shards(e.x, e.y, Math.PI / 2, PALETTE.leaf, 2, 200);
        fx.sparks(e.x, e.y, 8, PALETTE.heal, 220);
        fx.flash(e.x, e.y, PALETTE.heal, 170, 0.2, 0.6);
        text.float(e.x, e.y - 40, `+${e.heal}`, PALETTE.heal, 52);
        break;
      case 'burn':
        fx.sparks(e.x, e.y, 3, PALETTE.fire, 140);
        fx.spawn('puff', e.x, e.y, (Math.random() - 0.5) * 40, -90, { life: 0.4, drag: 2, scale: 0.25, scaleEnd: 0.6, tint: PALETTE.fire, alpha: 0.7 });
        break;
      case 'healBeam':
        beam(e.x0, e.y0, e.x1, e.y1, 0);
        fx.sparks(e.x1, e.y1, 6, PALETTE.heal, 160);
        fx.flash(e.x1, e.y1, PALETTE.heal, 150, 0.3, 0.55);
        text.word(e.to, e.x1, e.y1 - 40, `+${e.amount}`, PALETTE.heal, 44);
        break;
      case 'zap':
        beam(e.x0, e.y0, e.x1, e.y1, 1);
        fx.sparks(e.x1, e.y1, 6, PALETTE.bubble, 300);
        fx.flash(e.x1, e.y1, PALETTE.bubble, 140, 0.14, 0.8);
        break;
      case 'caught':
        text.word(e.id, e.x, e.y - 30, t('hud.caught'), PALETTE.catcher, 52);
        fx.ring(e.x, e.y, PALETTE.white, 0.9, 0.18);
        break;
      case 'ward':
        fx.ring(e.x, e.y, PALETTE.wardGlow, e.up ? 1.2 : 2, 0.3);
        if (!e.up) {
          fx.shards(e.x, e.y, -Math.PI / 2, PALETTE.wardGlow, 10, 360);
          fx.flash(e.x, e.y, PALETTE.wardGlow, 230, 0.2, 0.7);
          text.word(e.id, e.x, e.y - 40, t('hud.wardPop'), PALETTE.wardGlow, 46);
        }
        break;
      case 'bossPhase':
        shake(0.7);
        flashA = 0.35;
        fx.ring(e.x, e.y, PALETTE.danger, 3, 0.45);
        fx.flash(e.x, e.y, PALETTE.danger, 460, 0.45, 0.6);
        fx.streaks(e.x, e.y, 0, 6.28, 14, PALETTE.danger, 900);
        break;
      case 'eruption': {
        // a warning glint where each rock enters the sky, and one rumble per volley
        fx.ring(e.x, e.y + 30, PALETTE.fire, 1.4, 0.35);
        fx.flash(e.x, e.y + 30, PALETTE.fire, 200, 0.3, 0.7);
        fx.sparks(e.x, e.y + 30, 8, PALETTE.fireCore, 300);
        if (skyT - lastEruption > 0.4) {
          lastEruption = skyT;
          shake(0.35);
          const boss = w.enemies.find((x) => x.id === e.id);
          if (boss) {
            const hx = boss.body.x[PT.head]!;
            const hy = boss.body.y[PT.head]!;
            fx.ring(hx, hy, PALETTE.fire, 2.4, 0.5);
            fx.streaks(hx, hy, -Math.PI / 2, 1.4, 10, PALETTE.fire, 900);
            fx.puffs(hx, hy - 30, 5, PALETTE.smoke, 160);
          }
          callout(t('hud.eruption'), PALETTE.fire, 64);
        }
        break;
      }
      case 'gust': {
        // the wind turns: white streaks sweep across the sky the new way
        const dir = e.wind > 0 ? 0 : Math.PI;
        const x0 = e.wind > 0 ? 120 : 600;
        for (let i = 0; i < 5; i++) fx.streaks(x0, 220 + i * 170, dir, 0.18, 4, PALETTE.white, 900 + i * 60);
        if (e.by >= 0) {
          fx.ring(e.x, e.y, PALETTE.bubble, 2.4, 0.45);
          fx.flash(e.x, e.y, PALETTE.bubble, 260, 0.3, 0.6);
          fx.sparks(e.x, e.y, 12, PALETTE.white, 380);
          shake(0.3);
        }
        callout(t('hud.gust'), PALETTE.bubble, 56);
        break;
      }
      case 'waveClear': {
        // the player's little victory: confetti off the ledge and a ring; a boss stage gets fireworks
        const p = w.player.body;
        const cx = p.x[PT.neck]!;
        const cy = p.y[PT.neck]!;
        const colors = [PALETTE.gold, PALETTE.pink, PALETTE.bubble, PALETTE.leaf];
        for (let i = 0; i < colors.length; i++) fx.shards(cx, cy - 30, -Math.PI / 2, colors[i]!, 4, 420);
        fx.ring(cx, cy, PALETTE.gold, 1.6, 0.4);
        if (w.stage === 7) {
          later.push({ at: 0.35, kind: 'fireworks' }, { at: 0.75, kind: 'fireworks' }, { at: 1.15, kind: 'fireworks' });
        }
        break;
      }
      case 'summon':
        fx.ring(e.x, e.y, PALETTE.imp, 1.8, 0.4);
        fx.sparks(e.x, e.y, 12, PALETTE.imp, 300);
        fx.flash(e.x, e.y, PALETTE.imp, 200, 0.3, 0.55);
        break;
      case 'reveal':
        // fog: an archer steps out of it
        fx.puffs(e.x, e.y + 30, 5, PALETTE.white, 90);
        fx.ring(e.x, e.y, PALETTE.white, 1.3, 0.3);
        break;
      case 'blink':
        // the wizard pops out in a puff of stars and back in on its new ledge
        fx.ring(e.x0, e.y0, PALETTE.mage, 1.4, 0.3);
        fx.sparks(e.x0, e.y0, 10, PALETTE.mageStar, 280);
        fx.puffs(e.x0, e.y0, 3, PALETTE.mage, 70);
        fx.ring(e.x1, e.y1, PALETTE.hex, 1.6, 0.35);
        fx.sparks(e.x1, e.y1, 8, PALETTE.hex, 220);
        fx.flash(e.x1, e.y1, PALETTE.hex, 170, 0.22, 0.6);
        break;
      case 'chill':
        fx.ring(e.x, e.y, PALETTE.frost, 1.1, 0.25);
        fx.sparks(e.x, e.y, 8, PALETTE.frost, 200);
        break;
      case 'rope':
        fx.shards(e.x, e.y, -Math.PI / 2, 0xd9b27a, 6, 260);
        fx.puffs(e.x, e.y, 2, PALETTE.dust, 60);
        if (e.riders > 0) callout(t('hud.dropped'), PALETTE.cream, 70);
        break;
      case 'rockHit':
        shake(0.5);
        fx.puffs(e.x, e.y, 6, PALETTE.dust, 200);
        break;
      case 'rockBreak':
        shake(0.3);
        fx.shards(e.x, e.y, -Math.PI / 2, theme.debris, 12, 420);
        fx.puffs(e.x, e.y, 8, PALETTE.dust, 220);
        break;
      case 'multi': {
        const key: StringKey = e.n >= 4 ? 'hud.multi4' : e.n === 3 ? 'hud.multi3' : 'hud.multi2';
        callout(t(key), e.n >= 3 ? PALETTE.pink : PALETTE.gold, 70 + Math.min(3, e.n) * 8);
        shake(0.2 + e.n * 0.08);
        break;
      }
      case 'streak':
        callout(t('hud.streak', { n: e.n }), PALETTE.heal, 62 + Math.min(20, e.n));
        break;
      case 'chain':
        // an escalating payoff: bigger text each step, a flash from the fourth on
        callout(t('hud.chain', { n: e.n }), PALETTE.gold, 60 + Math.min(30, e.n * 6));
        if (e.n >= 4) flashA = Math.max(flashA, 0.25);
        break;
      case 'focusReady':
        callout(t('hud.focusReady'), PALETTE.focus, 60);
        break;
      case 'focus':
        if (e.on) {
          flashA = 0.4;
          shake(0.3);
          slowT = Math.max(slowT, 0.18);
          callout(t('hud.focus'), PALETTE.focus, 90);
          const p = w.player.body;
          const cx = (p.x[PT.neck]! + p.x[PT.pelvis]!) / 2;
          const cy = (p.y[PT.neck]! + p.y[PT.pelvis]!) / 2 - 20;
          fx.ring(cx, cy, PALETTE.focus, 3.2, 0.5);
          fx.flash(cx, cy, PALETTE.focus, 420, 0.4, 0.6);
          fx.streaks(cx, cy, -Math.PI / 2, 6.28, 12, PALETTE.focus, 700);
        }
        break;
      case 'waveStart':
        // landing thumps for archers dropping in (the first wave's were already standing)
        if (e.wave > 1) later.push({ at: 0.56, kind: 'land' });
        break;
      case 'bonusHit':
        fx.ring(e.x, e.y, e.kind === 'apple' ? PALETTE.apple : PALETTE.gold, e.bull ? 1.8 : 1.1, 0.22);
        fx.shards(e.x, e.y, 0, e.kind === 'apple' ? PALETTE.apple : e.kind === 'rock' ? theme.debris : PALETTE.cream, 8, 300);
        if (e.bull) {
          fx.flash(e.x, e.y, PALETTE.gold, 200, 0.2, 0.7);
          text.word(-2, e.x, e.y - 30, t('bonus.bull'), PALETTE.gold, 50);
        }
        break;
      case 'bonusEnd':
        if (e.grade !== 'none') {
          const col = e.grade === 'gold' ? PALETTE.gold : e.grade === 'silver' ? PALETTE.metalLight : 0xc98a4b;
          shake(0.8);
          hitStop(120);
          fx.sparks(360, 560, 28, col, 420);
        }
        break;
      case 'cards':
        text.clearCalls();
        break;
      case 'dying':
        slowT = 0.35;
        break;
      default:
        break;
    }
  }

  function runLater(kind: 'land' | 'fireworks', w: World): void {
    if (kind === 'fireworks') {
      // a chapter's boss is down: shells burst over the arena, each its own colour
      const colors = [PALETTE.gold, PALETTE.pink, PALETTE.bubble, PALETTE.heal];
      const col = colors[fireworkN++ % colors.length]!;
      const x = 200 + ((fireworkN * 211) % 360);
      const y = 260 + ((fireworkN * 97) % 220);
      fx.ring(x, y, col, 2.2, 0.5);
      fx.sparks(x, y, 22, col, 480);
      fx.streaks(x, y, 0, 6.28, 12, mixWhite(col, 0.5), 700);
      fx.flash(x, y, col, 260, 0.3, 0.6);
      return;
    }
    if (kind === 'land') {
      for (const x of w.enemies) {
        if (x.gone) continue;
        if (x.type === 'boss' || x.type === 'elite') shake(0.35);
        fx.puffs(x.anchorX, x.anchorY + 52 * x.scale, 4, PALETTE.white, 140);
      }
    }
  }

  function drawBeams(): void {
    for (let i = 0; i < BEAMS; i++) {
      const b = i * 6;
      const age = beams[b + 4]!;
      if (age > BEAM_LIFE) continue;
      const k = 1 - age / BEAM_LIFE;
      const x0 = beams[b]!;
      const y0 = beams[b + 1]!;
      const x1 = beams[b + 2]!;
      const y1 = beams[b + 3]!;
      if (beams[b + 5] === 0) {
        // heal: a soft green shaft with a white heart, pulsing along its length
        lines.line(sx(x0), sy(y0), sx(x1), sy(y1), 0, m(16 * k), m(16 * k), PALETTE.heal, 0.6 * k, 0.6 * k, 0.6, 1);
        lines.line(sx(x0), sy(y0), sx(x1), sy(y1), 0, m(2.5 * k), m(2.5 * k), PALETTE.white, 0.8 * k, 0.8 * k, 0.6, 0.2);
      } else {
        // chain lightning: a jagged spark that re-forks as it dies
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const step = Math.floor(age * 28);
        for (let pass = 0; pass < 2; pass++) {
          lines.strip();
          const half = pass === 0 ? 9 * k : 1.75;
          const col = pass === 0 ? PALETTE.bubble : PALETTE.white;
          const alpha = pass === 0 ? 0.65 * k : k;
          const segs = 7;
          for (let s = 0; s <= segs; s++) {
            const u = s / segs;
            const edge = Math.sin(u * Math.PI);
            const j = Math.sin(s * 12.9898 + step * 78.233 + i * 3.1) * 43758.5453;
            const off = ((j - Math.floor(j)) - 0.5) * 2 * Math.min(34, len * 0.16) * edge;
            lines.point(sx(x0 + dx * u + nx * off), sy(y0 + dy * u + ny * off), 0, m(half), col, alpha, pass === 0 ? 0.65 : 0.5, pass === 0 ? 1 : 0.2);
          }
        }
      }
    }
  }

  /** Focus: a golden aura around the player (the 2D game's disc and ring) with rising motes. */
  function drawFocus(w: World, real: number): void {
    const on = w.focusT > 0 && w.player.alive;
    focusK += ((on ? 1 : 0) - focusK) * Math.min(1, real * (on ? 10 : 6));
    if (focusK < 0.02) {
      under.hideRange(0, MOTES + 4);
      return;
    }
    const p = w.player.body;
    const cx = (p.x[PT.neck]! + p.x[PT.pelvis]!) / 2;
    const cy = (p.y[PT.neck]! + p.y[PT.pelvis]!) / 2 - 20;
    const r = (110 + Math.sin(skyT * 9) * 6) * (0.7 + 0.3 * focusK);
    under.put(0, sx(cx), sy(cy), 0, m(r * 2.05), m(r * 2.05), 0, PALETTE.focus, 0.16 * focusK, TILE.disc, 0.5);
    under.put(1, sx(cx), sy(cy), 0, m(r * 3.4), m(r * 3.4), 0, PALETTE.focus, 0.14 * focusK, TILE.blob, 1);
    under.hide(2);
    under.hide(3);
    lines.strip();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      lines.point(sx(cx + Math.cos(a) * r), sy(cy + Math.sin(a) * r), 0, m(3.2), PALETTE.focus, 0.7 * focusK, 0.5, 0.15);
    }
    lines.strip();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      lines.point(sx(cx + Math.cos(a) * r), sy(cy + Math.sin(a) * r), 0, m(11), PALETTE.focus, 0.3 * focusK, 1, 1);
    }
    for (let i = 0; i < MOTES; i++) {
      // motes placed from time alone: they rise inside the aura and fade at the top
      const ph = (skyT * (0.5 + (i % 5) * 0.09) + i * 0.618) % 1;
      const a = i * 2.399 + skyT * 0.6;
      const rad = r * (0.25 + 0.7 * ((i * 0.37) % 1));
      const x = cx + Math.cos(a) * rad;
      const y = cy + r * 0.8 - ph * r * 1.7;
      const s = (6 + (i % 4) * 3) * Math.sin(ph * Math.PI);
      under.put(4 + i, sx(x), sy(y), 0, m(s * 2.2), m(s * 2.2), skyT * 2 + i, PALETTE.focus, 0.85 * focusK * Math.sin(ph * Math.PI), i % 3 === 0 ? TILE.glint : TILE.blob, 1);
    }
  }

  return {
    timeScale() {
      // runs on real time, once per frame, before the simulation steps (as in GameScene.update)
      const now = performance.now();
      const real = lastTick === 0 ? 0 : Math.min(0.2, (now - lastTick) / 1000);
      lastTick = now;
      // headshot slow motion: deep slow, then a quick ramp back
      let scale = 1;
      if (slowT > 0) {
        slowT -= real;
        scale = slowT > 0.07 ? 0.12 : 0.45;
      }
      // the finishing knockout: down to 0.2 at once, easing back to full speed (quadratic)
      if (finishT > 0) {
        finishT = Math.max(0, finishT - real);
        const k = 1 - finishT / FINISH_T;
        scale = Math.min(scale, 0.2 + 0.8 * k * k);
      }
      // hit-stop: a short freeze on body hits
      if (stopT > 0) {
        stopT -= real;
        if (stopT > 0) scale = 0;
      }
      return scale;
    },

    update(frame: Frame) {
      const { w, dt, real, events } = frame;
      if (w.time < lastWorldTime) {
        // a fresh world (restart): nothing of the old run may linger
        lines.begin();
        fx.clear();
        text.clear();
        later.length = 0;
        for (let i = 0; i < BEAMS; i++) beams[i * 6 + 4] = 9;
        slowT = stopT = flashA = hurtFlash = finishT = 0;
      }
      lastWorldTime = w.time;
      skyT += real;
      flashA = Math.max(0, flashA - real * 3);
      hurtFlash = Math.max(0, hurtFlash - real * 2.5);
      overlayOpen = w.phase === 'cards' || w.phase === 'over';
      if (overlayOpen) text.clearCalls();

      for (const e of events) handle(e, w);
      for (let i = later.length - 1; i >= 0; i--) {
        const job = later[i]!;
        job.at -= real;
        if (job.at <= 0) {
          later.splice(i, 1);
          runLater(job.kind, w);
        }
      }

      lines.begin();
      fx.update(dt);
      text.update(real);
      for (let i = 0; i < BEAMS; i++) beams[i * 6 + 4] = beams[i * 6 + 4]! + real;
      drawBeams();
      drawFocus(w, real);
      lines.commit();
      under.commit();

      shownFlash = setOpacity(flashEl, CALM ? flashA * 0.4 : flashA, shownFlash);
      shownHurt = setOpacity(hurtEl, hurtFlash > 0.02 ? hurtFlash * 0.85 : 0, shownHurt);
      shownFocus = setOpacity(focusEl, hurtFlash <= 0.02 && w.focusT > 0 ? 0.35 + Math.sin(skyT * 6) * 0.08 : 0, shownFocus);
    },
  };
}
