import { button, cssColor, hashSeed, iconButton, label, muteButton, OyunScene, type Button, type IconButton } from '@oyun/core';
import Phaser from 'phaser';
import { gameSave } from '../save';
import { planShot, solveShot, CAREFUL, type Profile } from '../sim/aimbot';
import { countCards, statsFor, type CardId } from '../sim/cards';
import type { EnemyType } from '../sim/combat';
import { bankDaily, bankProgress, bankStart, cosmeticById, dailyKey, newBank, NO_META, runOutcome } from '../sim/meta';
import { PT } from '../sim/ragdoll';
import { TUNING } from '../sim/tuning';
import {
  addExtraCard,
  advance,
  aimAt,
  aliveEnemies,
  arrowSpeed,
  canShoot,
  createWorld,
  effectiveAngle,
  pickCard,
  playerOrigin,
  reroll,
  revive,
  jumpToWave,
  shoot,
  takeEvents,
  targetPoint,
  twitch,
  type Archer,
  type GameEvent,
  type World,
} from '../sim/world';
import { SFX } from '../sfx';
import { PALETTE } from '../textures';
import { dailyThemeOffset, themeIndex } from '../anim/themes';
import { animate, newAnimOut, posePoint, posePoints, type AnimInput, type AnimOut } from '../anim/anim';
import { Arena } from './arena';
import { Trails } from './trails';
import { createScarf, drawArcher, drawArrow, drawShield, lookFor, stepScarf, type Scarf } from './art';
import { Fx } from './fx';
import { HitNumbers } from './numbers';
import { drawCardIcon } from './icons';
import { DRAG_DEAD, DRAG_FULL, SCENES } from './keys';

/** The world of a run that just ended, kept so the result screen can offer a revive. */
let pendingWorld: World | null = null;
/** Finished runs this session (interstitial pacing). */
export const session = { finishedRuns: 0 };

export function hasRevive(): boolean {
  return pendingWorld !== null && !pendingWorld.revived;
}

interface Track {
  vx: Float64Array;
  vy: Float64Array;
  /** same arrays, for the renderer's view shape */
  x: Float64Array;
  y: Float64Array;
  out: AnimOut;
  /** the archer drawn with this track last frame */
  archer: Archer | null;
  release: number;
  land: number;
  cheer: number;
  taunt: number;
  brain: string;
}

export interface GameData {
  revive?: boolean;
  daily?: boolean;
  /** straight back into play from the result screen: smaller title */
  quick?: boolean;
}

export interface RunResult {
  wave: number;
  coins: number;
  kos: number;
  headshots: number;
  best: number;
  newBest: boolean;
  daily: boolean;
  dailyKey: string;
}

const ENEMY_TINT: Record<EnemyType, number> = {
  archer: PALETTE.archer,
  shield: PALETTE.shield,
  jumper: PALETTE.jumper,
  bomber: PALETTE.bomber,
  boss: PALETTE.boss,
};

const W = 720;
const H = 1280;

/**
 * The whole run: title (which IS the first shot), waves, card picks and death. Draws the sim
 * and forwards input to it; every rule lives in src/sim.
 * Test actions: shoot {angle, power}, aimbot {error?}, pick-card index, advance seconds,
 * reroll, extra, pause, shop, daily.
 */
export class GameScene extends OyunScene {
  protected override autoPause = true;
  private w!: World;
  private data0: GameData = {};
  private daily = false;
  private layer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private arena!: Arena;
  /** theme offset: 0 for normal runs, picked from the date for the daily */
  private themeOffset = 0;
  private sky!: Phaser.GameObjects.Graphics;
  private dyn!: Phaser.GameObjects.Graphics;
  private aimG!: Phaser.GameObjects.Graphics;
  private pullG!: Phaser.GameObjects.Graphics;
  private appleImgs: Phaser.GameObjects.Image[] = [];
  private fx!: Fx;
  private scarves = new Map<number, Scarf>();
  // input
  private dragId = -1;
  private dragX0 = 0;
  private dragY0 = 0;
  private dragX = 0;
  private dragY = 0;
  private buffered: { angle: number; power: number } | null = null;
  private lastCreak = 0;
  // time + camera effects
  private slowT = 0;
  private zoom = 0;
  private zoomFx = 360;
  private zoomFy = 640;
  private pushX = 0;
  private pushY = 0;
  private hurtFlash = 0;
  /** white headshot flash (screen) */
  private flash!: Phaser.GameObjects.Rectangle;
  private flashA = 0;
  private punch = 0;
  private bannerUntil = 0;
  private banners = new Set<Phaser.GameObjects.Container>();
  private floats = new Set<Phaser.GameObjects.Text>();
  /** shot events whose feedback played (test state: must equal shots) */
  private shotFx = 0;
  /** wave-start events handled */
  private waveFx = 0;
  private skyT = 0;
  // hud
  private hud!: Phaser.GameObjects.Container;
  private hpG!: Phaser.GameObjects.Graphics;
  private hpShown = 1;
  private hpPop = 0;
  private waveText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private coinShown = 0;
  private coinIcon!: Phaser.GameObjects.Image;
  private coinPop = 0;
  private pauseBtn!: IconButton;
  private vignette!: Phaser.GameObjects.Image;
  // title + cards
  private titleUi: Phaser.GameObjects.Container | null = null;
  private shopBtn: Button | null = null;
  private dailyBtn: Button | null = null;
  private cardUi: Phaser.GameObjects.Container | null = null;
  private cardHits: Phaser.GameObjects.Zone[] = [];
  private cardRects: Record<string, number[]> = {};
  private picking = false;
  private rerollBtn: Button | null = null;
  private extraBtn: Button | null = null;
  private seen = new Set<string>();
  /** per-archer animation tracks (by archer id) */
  private tracks = new Map<number, Track>();
  private animIn: AnimInput = { kind: 'player', id: 0, alive: true, t: 0, scale: 1, facing: 1, draw: 0, brain: '', sinceHit: 99, sinceRelease: 99, sinceLand: 99, sinceCheer: 99, sinceTaunt: 99, hp: 1, lookX: 0, lookY: 0, title: false, mood: 0 };
  private animT = 0;
  /** measurement aid (test action `anim`): draw without the animation layer, ambient and trails */
  private animOff = false;
  private lastStomp = 0;
  private tmpPt = { x: 0, y: 0 };
  private trails = new Trails(80);
  private numbers!: HitNumbers;
  private hintText: Phaser.GameObjects.Text | null = null;
  private lastTeach = 0;
  private finished = false;
  private frameMs: number[] = [];
  /** whole Phaser step (update + render submission) in JS ms, measured prestep → postrender */
  private stepMs: number[] = [];
  private stepT0 = 0;
  /** visual-capture aid only (test action `timescale`): slows game time so screenshots catch a hit */
  private debugScale = 1;

  constructor() {
    super(SCENES.game);
  }

  init(data: GameData): void {
    this.data0 = data ?? {};
  }

  create(): void {
    const save = gameSave(this.oyun);
    this.finished = false;
    this.picking = false;
    this.cardUi = null;
    this.titleUi = null;
    this.scarves.clear();
    this.tracks.clear();
    this.animT = 0;
    this.seen.clear();
    this.dragId = -1;
    this.buffered = null;
    this.slowT = 0;
    this.zoom = 0;
    this.frameMs = [];
    this.stepMs = [];
    this.shotFx = 0;
    this.waveFx = 0;
    this.bannerUntil = 0;
    this.banners.clear();
    this.floats.clear();
    this.flashA = 0;
    this.punch = 0;
    const onPre = (): void => {
      this.stepT0 = performance.now();
    };
    const onPost = (): void => {
      if (this.stepT0 > 0) this.stepMs.push(performance.now() - this.stepT0);
      if (this.stepMs.length > 240) this.stepMs.shift();
    };
    this.game.events.on(Phaser.Core.Events.PRE_STEP, onPre);
    this.game.events.on(Phaser.Core.Events.POST_RENDER, onPost);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.PRE_STEP, onPre);
      this.game.events.off(Phaser.Core.Events.POST_RENDER, onPost);
    });
    const d = this.data0;
    if (d.revive && pendingWorld && revive(pendingWorld)) {
      this.w = pendingWorld;
      this.daily = d.daily ?? false;
    } else {
      this.daily = d.daily ?? false;
      const now = new Date();
      const seed = this.daily ? hashSeed(`okcu-daily-${dailyKey(now.getFullYear(), now.getMonth() + 1, now.getDate())}`) : this.oyun.rng.int(0, 2 ** 31 - 1);
      // the daily run is the same for everyone: permanent upgrades do not apply
      this.w = createWorld({ seed, meta: this.daily ? NO_META : save.data.upgrades });
      this.w.bank = newBank(save.data);
    }
    pendingWorld = null;
    this.coinShown = this.w.run.coins;
    for (const e of this.w.enemies) this.seen.add(e.type);

    // ---- world layer (zoomable)
    this.layer = this.add.container(0, 0);
    this.arena = new Arena(this, this.layer);
    this.themeOffset = this.daily ? dailyThemeOffset(this.todayKey()) : 0;
    this.dyn = this.add.graphics();
    this.aimG = this.add.graphics();
    this.layer.add([this.dyn, this.aimG]);
    this.appleImgs = this.w.apples.map(() => {
      const img = this.add.image(0, 0, 'apple').setVisible(false);
      this.layer.add(img);
      return img;
    });
    // ---- screen-space layers
    this.overlay = this.add.container(0, 0).setDepth(50);
    this.fx = new Fx(this, this.layer, this.overlay);
    this.numbers = new HitNumbers(this, this.oyun.theme.fontFamily);
    this.pullG = this.add.graphics().setDepth(40);
    this.vignette = this.add.image(W / 2, H / 2, 'okcu-vignette').setScale(2).setTint(PALETTE.danger).setAlpha(0).setDepth(45);
    this.flash = this.add.rectangle(W / 2, H / 2, W + 200, H + 200, PALETTE.white, 1).setAlpha(0).setDepth(46);
    this.buildHud();
    this.arena.setTheme(themeIndex(this.w.wave, this.themeOffset), true);
    this.arena.setLedges(this.w.ledges, this.w.wave);

    // ---- input: drag anywhere; buttons win
    this.input.addPointer(2);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => this.onDown(p, over));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.onCancelAll());
    const onBlur = (): void => this.onCancelAll();
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
    });
    // quitting from the pause menu (or any scene change) banks what the run earned so far
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.bank());
    // a pointer cancelled by the browser (system gesture, incoming call) never fires up
    const canvas = this.game.canvas;
    const cancel = (): void => this.onCancelAll();
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('touchcancel', cancel);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('touchcancel', cancel);
    });

    if (this.w.phase === 'title') this.buildTitle(d.quick ?? false);
    else {
      this.oyun.platform.gameplayStart();
      this.showBanner(this.t('hud.wave', { n: this.w.wave }), null);
    }
    this.syncHud(true);
  }

  // ------------------------------------------------------------------ HUD

  private buildHud(): void {
    const L = this.layout;
    const top = L.top + 64;
    this.hud = this.add.container(0, 0).setDepth(60);
    this.hpG = this.add.graphics();
    this.hud.add(this.hpG);
    this.waveText = label(this, L.cx, top + 78, '', { size: 44 }).setStroke(cssColor(PALETTE.ink), 10);
    const coinG = this.add.image(L.right - 216, top, 'coin').setScale(1.15);
    this.coinIcon = coinG;
    this.coinText = label(this, L.right - 128, top, '0', { size: 44, color: PALETTE.coin }).setOrigin(1, 0.5).setStroke(cssColor(PALETTE.ink), 10);
    this.pauseBtn = iconButton(this, L.right - 62, top, 'pause', () => this.openPauseMenu(), 96);
    this.hud.add([this.waveText, coinG, this.coinText, this.pauseBtn]);
  }

  private coinTarget(): { x: number; y: number } {
    return { x: this.coinIcon.x, y: this.coinIcon.y };
  }

  private syncHud(force = false): void {
    const p = this.w.player;
    const L = this.layout;
    const top = L.top + 64;
    const k = Math.max(0, p.hp / p.maxHp);
    this.hpShown += (k - this.hpShown) * (force ? 1 : 0.18);
    const g = this.hpG;
    g.clear();
    const x = L.left + 84;
    const w = 210 + Math.min(80, (p.maxHp - 100) * 0.5);
    const pop = 1 + this.hpPop * 0.12;
    const h = 34 * pop;
    g.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 8, top - h / 2 - 7, w + 16, h + 14, (h + 14) / 2);
    g.fillStyle(PALETTE.hpBack, 1).fillRoundedRect(x, top - h / 2, w, h, h / 2);
    // white trail then the real bar
    if (this.hpShown > k + 0.005) g.fillStyle(PALETTE.white, 0.9).fillRoundedRect(x, top - h / 2, Math.max(h, w * this.hpShown), h, h / 2);
    if (k > 0) g.fillStyle(k > 0.3 ? PALETTE.hp : PALETTE.danger, 1).fillRoundedRect(x, top - h / 2, Math.max(h, w * k), h, h / 2);
    g.fillStyle(PALETTE.white, 0.35).fillRoundedRect(x + 8, top - h / 2 + 5, Math.max(10, w * k - 16), h * 0.28, 4);
    // heart
    const hs = 1 + this.hpPop * 0.3 + (k < 0.3 && p.alive ? Math.abs(Math.sin(this.time.now / 160)) * 0.15 : 0);
    drawHeartAt(g, x - 18, top, hs);
    // shield bubbles left this wave
    for (let i = 0; i < this.w.shieldLeft; i++) {
      g.fillStyle(PALETTE.ink, 1).fillCircle(x + w + 30 + i * 30, top, 14);
      g.fillStyle(PALETTE.bubble, 1).fillCircle(x + w + 30 + i * 30, top, 10);
    }
    this.waveText.setText(this.w.phase === 'title' || this.w.phase === 'cards' ? '' : this.t('hud.wave', { n: this.w.wave }));
    this.waveText.setVisible(performance.now() >= this.bannerUntil);
    this.coinText.setText(String(this.coinShown));
    this.coinText.setScale(1 + this.coinPop * 0.35);
    this.coinIcon.setX(this.coinText.x - this.coinText.width - 30).setScale(1.15 + this.coinPop * 0.3);
    this.hud.setAlpha(this.w.phase === 'title' ? 0 : 1);
    this.pauseBtn.setVisible(this.w.phase !== 'title');
  }

  // ------------------------------------------------------------------ title

  private buildTitle(quick: boolean): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(70);
    const save = gameSave(this.oyun).data;
    if (!quick) {
      const box = this.add.container(L.cx, L.top + 190);
      const logo = label(this, 0, 0, this.t('title.name'), { size: 72, color: PALETTE.cream, wrap: 690 }).setStroke(cssColor(PALETTE.ink), 18);
      logo.setShadow(0, 10, cssColor(PALETTE.inkSoft), 0, true, true);
      // living detail: an arrow stuck in the last letter that boings every few seconds
      const arrow = this.add.graphics().setPosition(logo.width / 2 - 70, -logo.height / 2 + 22).setScale(1.3);
      arrow.lineStyle(9, PALETTE.ink, 1).lineBetween(0, 0, 54, -40);
      arrow.lineStyle(5, PALETTE.shaftLight, 1).lineBetween(0, 0, 54, -40);
      arrow.fillStyle(PALETTE.ink, 1).fillTriangle(42, -40, 60, -27, 64, -56);
      arrow.fillStyle(PALETTE.fletch, 1).fillTriangle(45, -39, 58, -30, 61, -51);
      box.add([logo, arrow]);
      c.add(box);
      this.tweens.add({ targets: box, angle: { from: -2.5, to: 2.5 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
      this.time.addEvent({
        delay: 3200,
        loop: true,
        callback: () => {
          arrow.setAngle(-14);
          this.tweens.add({ targets: arrow, angle: 0, duration: 700, ease: 'Elastic.easeOut', easeParams: [1.4, 0.25] });
        },
      });
      this.juice.pop(logo, 1.25, 500);
    }
    const subY = L.top + (quick ? 170 : 290);
    if (this.daily) {
      // the daily state is spelled out: whose seed, and that upgrades are off
      const panel = this.add.graphics();
      panel.fillStyle(PALETTE.ink, 0.72).fillRoundedRect(L.cx - 320, subY - 34, 640, 150, 26);
      c.add(panel);
      c.add(label(this, L.cx, subY, this.t('title.dailyOn', { d: this.todayKey() }), { size: 40, color: PALETTE.gold }));
      c.add(label(this, L.cx, subY + 62, this.t('title.dailyInfo'), { size: 34, color: PALETTE.cream, wrap: 600 }));
    } else if (save.best > 0) {
      c.add(label(this, L.cx, subY, this.t('title.best', { n: save.best }), { size: 40, color: PALETTE.gold }).setStroke(cssColor(PALETTE.ink), 10));
    }
    // the hint: a ghost thumb pulling back from open sky (never over the archers)
    // kept above the highest spot the first archer can stand (its head is never above y ≈ 520)
    const hintY = Math.min(subY + (this.daily ? 152 : 80), L.top + 488);
    const hint = label(this, L.cx, hintY, this.t('title.drag'), { size: 52, color: PALETTE.white, wrap: 640 }).setStroke(cssColor(PALETTE.ink), 14);
    this.hintText = hint;
    c.add(hint);
    this.tweens.add({ targets: hint, scale: 1.07, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
    const thumb = this.add.graphics();
    const draw = (t: number): void => {
      thumb.clear();
      // drawn in the open sky above the player, clear of every spot the first archer can take
      const x0 = 300;
      const y0 = 560;
      const x = x0 - 120 * t;
      const y = y0 + 110 * t;
      thumb.lineStyle(10, PALETTE.ink, 0.5).lineBetween(x0, y0, x, y);
      thumb.lineStyle(5, PALETTE.white, 0.8).lineBetween(x0, y0, x, y);
      thumb.fillStyle(PALETTE.ink, 0.5).fillCircle(x0, y0, 14);
      thumb.fillStyle(PALETTE.ink, 1).fillCircle(x, y, 30);
      thumb.fillStyle(PALETTE.white, 1).fillCircle(x, y, 24);
      thumb.fillStyle(PALETTE.skinShade, 1).fillCircle(x, y, 15);
    };
    const tw = { t: 0 };
    this.tweens.add({ targets: tw, t: 1, duration: 900, hold: 250, repeatDelay: 350, repeat: -1, ease: 'Cubic.easeOut', onUpdate: () => draw(tw.t) });
    draw(0);
    c.add(thumb);
    this.shopBtn = button(this, L.left + 150, L.top + 70, this.t('title.shop'), () => this.openShop(), { width: 260, height: 92, fontSize: 38, variant: 'secondary' });
    this.dailyBtn = button(this, L.right - 255, L.top + 70, this.daily ? this.t('title.dailyExit') : this.t('title.daily'), () => this.goTo(SCENES.game, { daily: !this.daily }), { width: 200, height: 92, fontSize: 38, variant: 'secondary' });
    c.add([this.shopBtn, this.dailyBtn, muteButton(this, L.right - 70, L.top + 70)]);
    this.titleUi = c;
  }

  private hideTitle(): void {
    const c = this.titleUi;
    if (!c) return;
    this.titleUi = null;
    this.shopBtn?.setEnabled(false);
    this.dailyBtn?.setEnabled(false);
    this.tweens.add({ targets: c, alpha: 0, y: -60, duration: 260, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
    this.tweens.add({ targets: this.hud, alpha: 1, duration: 300 });
  }

  private openShop(): void {
    this.goTo(SCENES.shop, { from: 'game' });
  }

  // ------------------------------------------------------------------ input

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length > 0 || this.dragId !== -1 || this.finished) return;
    if (this.w.phase === 'cards' || this.w.phase === 'dying' || this.w.phase === 'over') return;
    this.oyun.audio.unlock();
    this.dragId = p.id;
    this.dragX0 = this.dragX = p.x;
    this.dragY0 = this.dragY = p.y;
    this.lastCreak = 0;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId) return;
    this.dragX = p.x;
    this.dragY = p.y;
    const aim = this.dragAim();
    if (aim) {
      aimAt(this.w, aim.angle, aim.power);
      // string creak: a tick every 8 % of extra pull
      if (Math.abs(aim.power - this.lastCreak) > 0.08) {
        this.oyun.audio.playPreset(SFX.creak, { pitch: aim.power * 9, volume: 0.9 });
        this.lastCreak = aim.power;
      }
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId) return;
    this.dragX = p.x;
    this.dragY = p.y;
    const aim = this.dragAim();
    this.dragId = -1;
    this.pullG.clear();
    if (!aim) {
      // a tap or a tiny drag: no dud arrow, but show what to do instead
      this.w.player.draw = 0;
      this.oyun.audio.playPreset(SFX.cancel);
      if (this.w.phase === 'title' || this.w.phase === 'play') this.teachDrag(p.x, p.y);
      return;
    }
    this.release(aim.angle, aim.power);
  }

  /** A tap instead of a drag: the archer twitches, the hint pulses, a nudge appears at the finger. */
  private teachDrag(x: number, y: number): void {
    twitch(this.w);
    if (this.time.now - this.lastTeach < 900) return;
    this.lastTeach = this.time.now;
    if (this.hintText) {
      this.tweens.killTweensOf(this.hintText);
      this.hintText.setScale(1.35);
      this.tweens.add({ targets: this.hintText, scale: 1, duration: 420, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.hintText, scale: 1.07, yoyo: true, repeat: -1, delay: 420, duration: 520, ease: 'Sine.easeInOut' });
    }
    this.float(x, y - 70, this.t('title.tapHint'), { size: 40, color: PALETTE.cream, rise: 60, duration: 900 });
  }

  private onCancelAll(): void {
    if (this.dragId === -1) return;
    this.dragId = -1;
    this.pullG.clear();
    this.aimG.clear();
    this.w.player.draw = 0;
  }

  /** Pull vector → angle/power; null while inside the dead zone. */
  private dragAim(): { angle: number; power: number } | null {
    const dx = this.dragX0 - this.dragX;
    const dy = this.dragY0 - this.dragY;
    const len = Math.hypot(dx, dy);
    if (len < DRAG_DEAD) return null;
    return { angle: Math.atan2(dy, dx), power: Math.min(1, (len - DRAG_DEAD) / (DRAG_FULL - DRAG_DEAD)) };
  }

  /** The one shot handler: finger releases and test actions both come here. */
  private release(angle: number, power: number): boolean {
    if (this.finished) return false;
    if (!canShoot(this.w)) {
      // let go a moment early: fire as soon as the arrow is nocked
      if (this.w.reload > 0 && this.w.reload < 0.3 && this.w.player.alive) this.buffered = { angle, power };
      // never leave the string drawn with no finger on it
      this.w.player.draw = 0;
      return false;
    }
    const wasTitle = this.w.phase === 'title';
    const ok = shoot(this.w, angle, power);
    if (!ok) {
      this.w.player.draw = 0;
      return false;
    }
    if (wasTitle) {
      this.hideTitle();
      this.oyun.platform.gameplayStart();
      this.oyun.platform.track('run_start', { daily: this.daily });
      const bank = this.w.bank;
      if (bank) gameSave(this.oyun).update((d) => bankStart(d, bank));
    }
    return true;
  }

  /** Write what this run has earned so far (coins as a delta, best wave, daily best). */
  private bank(reached = this.reached()): void {
    const bank = this.w.bank;
    if (!bank || !bank.started) return;
    const coins = this.w.run.coins;
    gameSave(this.oyun).update((d) => {
      bankProgress(d, bank, reached, coins);
      if (this.daily) bankDaily(d, this.todayKey(), reached);
    });
  }

  /** Wave reached: the wave being played, or the next one once this one is cleared. */
  private reached(): number {
    const w = this.w;
    return w.phase === 'clear' || w.phase === 'cards' ? w.wave + 1 : w.wave;
  }

  private todayKey(): string {
    const now = new Date();
    return dailyKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  protected override onPlatformPause(reason: Parameters<OyunScene['onPlatformPause']>[0]): void {
    // the app may be killed while hidden: bank first
    if (!this.finished) this.bank();
    super.onPlatformPause(reason);
  }

  override openPauseMenu(): void {
    this.clearTransients();
    if (!this.finished) this.bank();
    super.openPauseMenu();
  }

  // ------------------------------------------------------------------ frame

  override update(_time: number, delta: number): void {
    const t0 = performance.now();
    // real-time effects (slow motion, zoom, shake-free pops) scale with the capture aid too
    const real = (Math.min(delta, 200) / 1000) * this.debugScale;
    if (this.debugScale !== 1) {
      // capture aid: tweens and timers slow down with everything else (juice set them this frame)
      this.tweens.timeScale *= this.debugScale;
      this.time.timeScale *= this.debugScale;
    }
    // headshot slow motion runs on real time: deep slow, then a quick ramp back
    let scale = 1;
    if (this.slowT > 0) {
      this.slowT -= real;
      scale = this.slowT > 0.07 ? 0.12 : 0.45;
    }
    const dt = (this.juice.scaledDelta(delta) / 1000) * scale * this.debugScale;
    this.flashA = Math.max(0, this.flashA - real * 3);
    this.skyT += real;
    if (this.dragId !== -1) {
      const aim = this.dragAim();
      if (aim) aimAt(this.w, aim.angle, aim.power);
      else this.w.player.draw = 0;
    }
    if (this.buffered && canShoot(this.w)) {
      const b = this.buffered;
      this.buffered = null;
      this.release(b.angle, b.power);
    }
    advance(this.w, dt);
    this.animT += dt;
    // every event since the last frame (including a shot fired before this step), exactly once
    this.handleEvents(takeEvents(this.w));
    this.fx.update(dt);
    this.numbers.update(real);
    this.hpPop = Math.max(0, this.hpPop - real * 4);
    this.coinPop = Math.max(0, this.coinPop - real * 5);
    this.hurtFlash = Math.max(0, this.hurtFlash - real * 2.5);
    this.updateCamera(real);
    this.arena.setTheme(themeIndex(this.w.wave, this.themeOffset), false);
    this.arena.setLedges(this.w.ledges, this.w.wave);
    this.render(dt);
    this.syncHud();
    this.frameMs.push(performance.now() - t0);
    if (this.frameMs.length > 240) this.frameMs.shift();
  }

  private updateCamera(real: number): void {
    // zoom holds through the slow motion, then eases back; the push springs back
    this.zoom += (0 - this.zoom) * Math.min(1, real * (this.slowT > 0 ? 0.3 : 4));
    this.pushX += (0 - this.pushX) * Math.min(1, real * 7);
    this.pushY += (0 - this.pushY) * Math.min(1, real * 7);
    const z = 1 + this.zoom + this.punch;
    this.punch = Math.max(0, this.punch - real * 0.25);
    const fx = this.zoomFx;
    const fy = this.zoomFy;
    // keep the focus point where it is, drifting it a little toward the centre
    const k = this.zoom * 1.2;
    this.layer.setScale(z);
    this.layer.setPosition(fx * (1 - z) + (360 - fx) * k + this.pushX, fy * (1 - z) + (640 - fy) * k + this.pushY);
    // parallax: hills shift opposite to the push
    this.arena.update(real, this.pushX, this.pushY);
    // red vignette on damage; white flash on a headshot
    this.vignette.setAlpha(this.hurtFlash * 0.85);
    this.flash.setAlpha(this.flashA);
  }

  private toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.layer.x + x * this.layer.scaleX, y: this.layer.y + y * this.layer.scaleY };
  }

  private render(dt: number): void {
    const w = this.w;
    const g = this.dyn;
    g.clear();
    const time = w.time;
    const cos = cosmeticById(gameSave(this.oyun).data.cosmetic);
    // arrows in ledges sit behind bodies
    const multi = w.stats.volleys > 1 || w.stats.splitPairs > 0;
    const halo = this.arena.theme.dark;
    for (const a of w.arrows) if (a.active && a.state === 1) drawArrow(g, a, time, multi, halo);
    if (!this.animOff) {
      this.trails.update(w.arrows);
      this.trails.draw(g, w.arrows, time);
    }
    for (let k = 0; k <= w.enemies.length; k++) {
      const a = k < w.enemies.length ? w.enemies[k]! : w.player;
      if (a.gone) continue;
      const tr = this.animate(a);
      let scarf = this.scarves.get(a.id);
      if (!scarf) {
        scarf = createScarf(tr.vx[PT.neck]!, tr.vy[PT.neck]!);
        this.scarves.set(a.id, scarf);
      }
      const wind = a.type === 'player' ? -520 : 520;
      stepScarf(scarf, tr.vx[PT.neck]! - a.facing * 4, tr.vy[PT.neck]! + 4, wind, Math.max(1 / 240, Math.min(dt, 1 / 30)), time, tr.out.scarfLift);
      const shield = a.shield;
      if (shield && a.shieldOn) drawShield(g, shield.x[0]!, shield.y[0]!, shield.x[1]!, shield.y[1]!, TUNING.shieldHits - a.shieldHp, a.hurt < 0.06 ? 0.6 : 0);
      drawArcher(g, a, lookFor(a, cos), {
        time,
        scarf: a.type === 'player' || a.type === 'jumper' || a.type === 'boss' ? scarf : null,
        flash: a.hurt < 0.07 ? 0.85 : 0,
        hpBar: a.type !== 'player' && a.hp < a.maxHp,
        telegraph: a.alive && a.type !== 'player' && a.brain === 'draw' && a.draw > 0.15,
        weakHint: a.type === 'boss',
        view: tr,
        face: tr.out,
      });
      if (shield && !a.shieldOn) drawShield(g, shield.x[0]!, shield.y[0]!, shield.x[1]!, shield.y[1]!, 3, 0);
    }
    for (const a of w.arrows) {
      if (!a.active || a.state === 1) continue;
      if (a.state === 2) {
        // stuck in a body: ride along with that archer's animation (drawn position only)
        const tr = this.tracks.get(a.host);
        const host = tr?.archer;
        if (tr && host && host.alive) {
          posePoint(host.body.x, host.body.y, tr.out, a.x, a.y, this.tmpPt);
          const ox = a.x;
          const oy = a.y;
          a.x = this.tmpPt.x;
          a.y = this.tmpPt.y;
          drawArrow(g, a, time, multi, halo);
          a.x = ox;
          a.y = oy;
          continue;
        }
      }
      drawArrow(g, a, time, multi, halo);
    }
    // apples
    w.apples.forEach((ap, i) => {
      const img = this.appleImgs[i]!;
      img.setVisible(ap.active);
      if (ap.active) {
        // a jelly wobble while it drifts
        const base = w.stats.appleRadiusMul > 1 ? 1.25 : 1;
        const wob = Math.sin(ap.t * 7) * 0.07;
        img.setPosition(ap.x, ap.y).setRotation(Math.sin(ap.t * 3) * 0.25).setScale(base * (1 + wob), base * (1 - wob));
      }
    });
    // reload ring around the bow hand
    const p = w.player;
    if (p.alive && w.reload > 0 && w.phase !== 'title') {
      const k = 1 - w.reload / w.stats.reload;
      const hx = p.body.x[PT.handF]!;
      const hy = p.body.y[PT.handF]!;
      g.lineStyle(8, PALETTE.ink, 0.6).beginPath().arc(hx, hy, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).strokePath();
      g.lineStyle(4, PALETTE.white, 1).beginPath().arc(hx, hy, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).strokePath();
    }
    this.drawBubble();
    this.renderAim();
  }

  /** Animation state for one archer this frame (pure layer in src/anim; never written back to the sim). */
  private animate(a: Archer): Track {
    let tr = this.tracks.get(a.id);
    if (!tr) {
      tr = { vx: new Float64Array(11), vy: new Float64Array(11), x: new Float64Array(0), y: new Float64Array(0), out: newAnimOut(), archer: a, release: -99, land: -99, cheer: -99, taunt: -99, brain: a.brain };
      tr.x = tr.vx;
      tr.y = tr.vy;
      this.tracks.set(a.id, tr);
    }
    // landing from a drop-in or a hop
    if ((tr.brain === 'spawn' || tr.brain === 'jump') && a.brain !== 'spawn' && a.brain !== 'jump') {
      tr.land = this.animT;
      if (a.type === 'boss' && tr.brain === 'spawn') {
        // the boss's entry beat: thud, roar, shake, dust
        this.oyun.audio.playPreset(SFX.roar);
        this.juice.shake(0.6);
        this.fx.puffs(a.body.x[PT.pelvis]!, a.body.y[PT.footF]!, 8, PALETTE.dust, 240);
      }
    }
    tr.brain = a.brain;
    tr.archer = a;
    const w = this.w;
    const inp = this.animIn;
    inp.kind = a.type;
    inp.id = a.id;
    inp.alive = a.alive;
    inp.t = this.animT;
    inp.scale = a.scale;
    inp.facing = a.facing;
    inp.draw = a.draw;
    inp.brain = a.type === 'player' ? 'player' : a.brain;
    inp.sinceHit = a.hurt < 9 ? a.hurt : 99;
    inp.sinceRelease = this.animT - tr.release;
    inp.sinceLand = this.animT - tr.land;
    inp.sinceCheer = this.animT - tr.cheer;
    inp.sinceTaunt = this.animT - tr.taunt;
    inp.hp = a.maxHp > 0 ? a.hp / a.maxHp : 1;
    inp.title = w.phase === 'title' && a.type === 'player';
    inp.mood = 0;
    this.lookFor(a, inp);
    if (this.animOff) {
      // measurement aid: the renderer without the animation layer (identity pose)
      inp.alive = false;
      animate(inp, tr.out);
      tr.out.eyes = 'open';
      tr.out.mouth = 'smile';
    } else animate(inp, tr.out);
    posePoints(a.body.x, a.body.y, a.body.n, tr.out, tr.vx, tr.vy);
    if (tr.out.stomp > 0 && this.animT - this.lastStomp > 0.5) {
      this.lastStomp = this.animT;
      this.juice.shake(0.12);
      this.fx.puffs(tr.vx[PT.footF]!, tr.vy[PT.footF]!, 3, PALETTE.dust, 90);
    }
    return tr;
  }

  private track(id: number): Track {
    let tr = this.tracks.get(id);
    if (!tr) {
      tr = { vx: new Float64Array(11), vy: new Float64Array(11), x: new Float64Array(0), y: new Float64Array(0), out: newAnimOut(), archer: null, release: -99, land: -99, cheer: -99, taunt: -99, brain: '' };
      tr.x = tr.vx;
      tr.y = tr.vy;
      this.tracks.set(id, tr);
    }
    return tr;
  }

  /** Eyes track the nearest threat: an incoming arrow, else the other side. */
  private lookFor(a: Archer, inp: AnimInput): void {
    const hx = a.body.x[PT.head]!;
    const hy = a.body.y[PT.head]!;
    let best = 600 * 600;
    let lx = 0;
    let ly = 0;
    const want = a.type === 'player' ? 'enemy' : 'player';
    for (const ar of this.w.arrows) {
      if (!ar.active || ar.state !== 0 || ar.owner !== want) continue;
      const dx = ar.x - hx;
      const dy = ar.y - hy;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        lx = dx;
        ly = dy;
      }
    }
    if (lx === 0 && ly === 0) {
      // nothing in the air: watch the other side (the player watches the nearest enemy)
      let tx = 0;
      let ty = 0;
      if (a.type === 'player') {
        let bd = Infinity;
        for (const e of this.w.enemies) {
          if (!e.alive) continue;
          const d = Math.abs(e.body.x[PT.head]! - hx) + Math.abs(e.body.y[PT.head]! - hy);
          if (d < bd) {
            bd = d;
            tx = e.body.x[PT.head]!;
            ty = e.body.y[PT.head]!;
          }
        }
        if (bd === Infinity) {
          tx = hx + 100;
          ty = hy;
        }
      } else {
        tx = this.w.player.body.x[PT.head]!;
        ty = this.w.player.body.y[PT.head]!;
      }
      lx = tx - hx;
      ly = ty - hy;
    }
    const l = Math.hypot(lx, ly) || 1;
    inp.lookX = lx / l;
    inp.lookY = ly / l;
  }

  /** The bubble card made visible: a wobbling soap bubble around the archer while a block is left. */
  private drawBubble(): void {
    const p = this.w.player;
    if (!p.alive || this.w.shieldLeft <= 0 || this.w.phase === 'title') return;
    const g = this.dyn;
    const cx = (p.body.x[PT.neck]! + p.body.x[PT.pelvis]!) / 2;
    const cy = (p.body.y[PT.neck]! + p.body.y[PT.pelvis]!) / 2 - 10;
    const r = 108 + Math.sin(this.skyT * 4) * 4;
    g.fillStyle(PALETTE.bubble, 0.24).fillCircle(cx, cy, r);
    g.lineStyle(9, PALETTE.ink, 0.35).strokeCircle(cx, cy, r + 2);
    g.lineStyle(6, PALETTE.bubble, 0.9).strokeCircle(cx, cy, r);
    g.fillStyle(PALETTE.white, 0.7).fillEllipse(cx - r * 0.45, cy - r * 0.5, r * 0.32, r * 0.16);
    if (this.w.shieldLeft > 1) g.lineStyle(3, PALETTE.white, 0.5).strokeCircle(cx, cy, r - 12);
  }

  /** Dotted arc preview (world layer) + the rubber band under the thumb (screen). */
  private renderAim(): void {
    this.aimG.clear();
    this.pullG.clear();
    if (this.dragId === -1) return;
    const aim = this.dragAim();
    const pg = this.pullG;
    // rubber band from where the thumb went down
    pg.fillStyle(PALETTE.ink, 0.35).fillCircle(this.dragX0, this.dragY0, 16);
    pg.fillStyle(PALETTE.white, 0.7).fillCircle(this.dragX0, this.dragY0, 10);
    if (!aim) {
      pg.lineStyle(3, PALETTE.white, 0.5).strokeCircle(this.dragX0, this.dragY0, DRAG_DEAD);
      return;
    }
    const col = aim.power < 0.5 ? PALETTE.heal : aim.power < 0.85 ? PALETTE.coin : PALETTE.powerHigh;
    pg.lineStyle(12, PALETTE.ink, 0.45).lineBetween(this.dragX0, this.dragY0, this.dragX, this.dragY);
    pg.lineStyle(6, col, 0.9).lineBetween(this.dragX0, this.dragY0, this.dragX, this.dragY);
    pg.fillStyle(col, 0.9).fillCircle(this.dragX, this.dragY, 12);
    const w = this.w;
    const ang = effectiveAngle(w, aim.angle);
    const speed = arrowSpeed(aim.power);
    const o = playerOrigin(w, ang);
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    const g = TUNING.gravity;
    const steps = Math.round(15 * w.stats.previewMul);
    const ag = this.aimG;
    const ready = canShoot(w) || w.reload < 0.3;
    for (let i = 1; i <= steps; i++) {
      const t = i * 0.032;
      const x = o.x + vx * t;
      const y = o.y + vy * t + 0.5 * g * t * t;
      const r = 8 - (i / steps) * 4;
      const a = ready ? 1 - (i / steps) * 0.6 : 0.35;
      ag.fillStyle(PALETTE.ink, a * 0.8).fillCircle(x, y, r + 3);
      ag.fillStyle(PALETTE.white, a).fillCircle(x, y, r);
    }
  }

  // ------------------------------------------------------------------ events → juice

  private handleEvents(events: readonly GameEvent[]): void {
    const audio = this.oyun.audio;
    for (const e of events) {
      switch (e.t) {
        case 'shot': {
          this.shotFx += 1;
          this.track(this.w.player.id).release = this.animT;
          audio.playPreset(SFX.snap, { pitch: e.power * 3 });
          audio.playPreset(SFX.whistle, { volume: 0.6 + e.power * 0.4, pitch: e.power * 2 });
          this.oyun.platform.haptic('light');
          // the camera pushes along the shot: the world kicks back 26 px and springs home
          this.pushX = -Math.cos(e.angle) * 26;
          this.pushY = -Math.sin(e.angle) * 26;
          this.punch = 0.035;
          if (this.zoom < 0.02) {
            this.zoomFx = e.x;
            this.zoomFy = e.y;
          }
          // muzzle puff fanning forward + a few string sparks
          for (let i = 0; i < 5; i++) {
            const a = e.angle + (Math.random() - 0.5) * 1.1;
            const sp = 120 + Math.random() * 160;
            this.fx.spawn('puff', e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, { life: 0.35, drag: 5, scale: 0.35, scaleEnd: 1.0, alpha: 0.9 });
          }
          this.fx.sparks(e.x, e.y, 3, PALETTE.gold, 160);
          break;
        }
        case 'hit': {
          const dir = Math.atan2(e.vy, e.vx);
          const tint = ENEMY_TINT[e.enemy];
          audio.playPreset(SFX.thunk, { pitch: e.part === 'head' ? 3 : 0 });
          this.fx.ring(e.x, e.y, PALETTE.white, e.slowmo ? 1.6 : 0.9);
          this.fx.shards(e.x, e.y, dir, tint, e.slowmo ? 10 : 6);
          this.fx.sparks(e.x, e.y, e.slowmo ? 8 : 3, PALETTE.white, 320);
          const s = this.toScreen(e.x, e.y);
          this.numbers.damage(e.id, s.x, s.y, e.dmg, e.slowmo ? PALETTE.gold : PALETTE.white, e.slowmo);
          if (e.slowmo) {
            audio.playPreset(SFX.ping);
            this.slowT = 0.25;
            this.zoom = 0.26;
            this.flashA = 0.45;
            this.fx.ring(e.x, e.y, PALETTE.gold, 2.6, 0.5);
            this.zoomFx = e.x;
            this.zoomFy = e.y;
            this.juice.shake(0.45);
            this.oyun.platform.haptic('heavy');
            const txt = e.part === 'weak' ? this.t('hud.weak') : this.t('hud.headshot');
            this.numbers.word(e.id, s.x, s.y, txt, PALETTE.gold, 64);
          } else {
            this.juice.shake(e.ko ? 0.3 : 0.18);
            this.juice.hitStop(e.ko ? 70 : 40);
            this.oyun.platform.haptic('medium');
          }
          break;
        }
        case 'bodyThunk':
          audio.playPreset(SFX.thunk, { volume: 0.6, pitch: -2 });
          this.fx.sparks(e.x, e.y, 3, PALETTE.white, 200);
          break;
        case 'playerHit': {
          if (e.by >= 0) this.track(e.by).taunt = this.animT;
          audio.playPreset(SFX.ouch);
          audio.playPreset(SFX.thunk, { volume: 0.7, pitch: -3 });
          this.juice.shake(0.5);
          this.juice.hitStop(60);
          this.hurtFlash = 1;
          this.hpPop = 1;
          this.oyun.platform.haptic('heavy');
          this.fx.shards(e.x, e.y, Math.atan2(e.vy, e.vx), PALETTE.player, 7);
          this.fx.ring(e.x, e.y, PALETTE.danger, 1.1);
          const s = this.toScreen(e.x, e.y);
          this.numbers.damage(-1, s.x, s.y, e.dmg, PALETTE.danger, true);
          break;
        }
        case 'blocked': {
          audio.playPreset(SFX.bubble);
          this.fx.ring(e.x, e.y, PALETTE.bubble, 1.8, 0.4);
          this.fx.sparks(e.x, e.y, 8, PALETTE.bubble, 260);
          const s = this.toScreen(e.x, e.y);
          this.numbers.word(-1, s.x, s.y + 60, this.t('hud.blocked'), PALETTE.bubble, 44);
          break;
        }
        case 'ko': {
          audio.playPreset(SFX.boing, { pitch: e.enemy === 'boss' ? -5 : 0 });
          this.oyun.platform.haptic('success');
          this.fx.feathers(e.x, e.y, ENEMY_TINT[e.enemy], e.enemy === 'boss' ? 10 : 4);
          const s = this.toScreen(e.x, e.y);
          const word = e.cause === 'fall' ? this.t('hud.fell') : e.cause === 'burn' ? this.t('hud.burned') : e.cause === 'head' ? null : this.t('hud.ko');
          if (word) this.numbers.word(e.id, s.x, s.y, word, PALETTE.cream, 60);
          this.flyCoins(s.x, s.y, e.coins);
          if (e.enemy === 'boss') {
            this.treasure(e.x, e.y, s.x, s.y);
            this.juice.feedback('large', s.x, s.y, PALETTE.gold);
            this.slowT = 0.3;
            this.zoom = 0.14;
            this.zoomFx = e.x;
            this.zoomFy = e.y;
          }
          break;
        }
        case 'poof': {
          audio.playPreset(SFX.poof);
          this.fx.poof(e.x, e.y, ENEMY_TINT[e.enemy], e.enemy === 'boss' ? 1.6 : 1);
          this.fx.feathers(e.x, e.y, ENEMY_TINT[e.enemy], e.enemy === 'boss' ? 30 : 16);
          this.scarves.delete(e.id);
          break;
        }
        case 'thunk':
          audio.playPreset(SFX.thock, { volume: e.owner === 'player' ? 1 : 0.5 });
          // the ledge throws up its own stuff: dirt, snow, sand or stone chips
          this.fx.shards(e.x, e.y, -Math.PI / 2, this.arena.theme.debris, 6, 280);
          this.fx.puffs(e.x, e.y, 3, this.arena.theme.ambient === 'snow' ? PALETTE.white : PALETTE.dust, 70);
          break;
        case 'bounce':
          audio.playPreset(SFX.thock, { pitch: 7 });
          this.fx.sparks(e.x, e.y, 5, PALETTE.grassLight, 240);
          break;
        case 'shieldHit': {
          audio.playPreset(SFX.clang, { pitch: e.broke ? -4 : 0 });
          this.fx.sparks(e.x, e.y, e.broke ? 14 : 6, PALETTE.gold, 380);
          this.fx.ring(e.x, e.y, PALETTE.metalLight, e.broke ? 1.8 : 1.1, 0.22);
          this.fx.shards(e.x, e.y, Math.PI, PALETTE.shieldWood, e.broke ? 12 : 4);
          this.juice.shake(e.broke ? 0.4 : 0.15);
          break;
        }
        case 'bomb': {
          audio.playPreset(SFX.boom, { volume: e.popped ? 0.7 : 1 });
          // shockwave, fireball, smoke and debris
          this.fx.ring(e.x, e.y, PALETTE.fire, 2.6, 0.35);
          this.fx.ring(e.x, e.y, PALETTE.white, 1.6, 0.2);
          this.fx.spawn('puff', e.x, e.y, 0, -30, { life: 0.35, scale: 1.6, scaleEnd: 3.2, tint: PALETTE.fireCore, alpha: 0.95 });
          this.fx.sparks(e.x, e.y, 16, PALETTE.fire, 520);
          this.fx.puffs(e.x, e.y, 8, PALETTE.smoke, 220);
          this.fx.shards(e.x, e.y, -Math.PI / 2, PALETTE.bomb, 8, 420);
          this.juice.shake(e.hurt ? 0.7 : 0.35);
          if (e.popped) {
            const s = this.toScreen(e.x, e.y);
            this.float(s.x, s.y - 50, this.t('hud.popped'), { size: 42, color: PALETTE.fireCore });
          }
          break;
        }
        case 'apple': {
          audio.playPreset(SFX.crunch);
          // juicy pop: a flash, red juice drops, a spinning leaf, green sparkles
          this.fx.ring(e.x, e.y, PALETTE.white, 1.3, 0.2);
          this.fx.shards(e.x, e.y, 0, PALETTE.apple, 14, 340);
          this.fx.shards(e.x, e.y, Math.PI / 2, PALETTE.leaf, 2, 200);
          this.fx.sparks(e.x, e.y, 8, PALETTE.heal, 220);
          const s = this.toScreen(e.x, e.y);
          this.float(s.x, s.y - 40, `+${e.heal}`, { size: 52, color: PALETTE.heal });
          break;
        }
        case 'burn':
          this.fx.sparks(e.x, e.y, 3, PALETTE.fire, 140);
          break;
        case 'heal':
          this.hpPop = 0.7;
          break;
        case 'enemyDraw':
          audio.playPreset(SFX.enemyDraw, { volume: 0.8 });
          break;
        case 'enemyShot':
          this.track(e.id).release = this.animT;
          audio.playPreset(SFX.enemySnap);
          if (e.kind === 'bomb') audio.playPreset(SFX.fuse);
          break;
        case 'waveStart':
          this.waveFx += 1;
          this.onWaveStart(e.wave);
          break;
        case 'waveClear': {
          this.track(this.w.player.id).cheer = this.animT;
          // bank at every wave clear: nothing earned is lost if the app dies at the card pick
          this.bank(e.wave + 1);
          // let the knockout land first
          this.time.delayedCall(900, () => {
            if (this.finished || this.cardUi || this.w.phase !== 'clear') return;
            audio.play('win', { volume: 0.7 });
            this.showBanner(this.t('hud.clear'), null);
            this.flyCoins(360, 520, e.coins);
          });
          break;
        }
        case 'cards':
          this.openCards();
          break;
        case 'dying':
          audio.play('lose');
          this.slowT = 0.35;
          this.zoom = 0.12;
          this.zoomFx = this.w.player.body.x[PT.head]!;
          this.zoomFy = this.w.player.body.y[PT.head]!;
          this.oyun.platform.haptic('error');
          break;
        case 'dead':
          this.finish();
          break;
        default:
          break;
      }
    }
  }

  /** A boss falls: golden rays, a coin fountain and confetti. */
  private treasure(x: number, y: number, sx: number, sy: number): void {
    const rays = this.add.graphics().setDepth(48);
    rays.setPosition(sx, sy);
    const draw = (): void => {
      rays.clear();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        rays.fillStyle(i % 2 ? PALETTE.gold : PALETTE.cream, 0.5).fillTriangle(0, 0, Math.cos(a - 0.12) * 260, Math.sin(a - 0.12) * 260, Math.cos(a + 0.12) * 260, Math.sin(a + 0.12) * 260);
      }
    };
    draw();
    rays.setScale(0.2).setAlpha(0.9);
    this.tweens.add({ targets: rays, scale: 1.2, angle: 70, duration: 1500, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: rays, alpha: 0, delay: 900, duration: 700, onComplete: () => rays.destroy() });
    const colors = [PALETTE.gold, PALETTE.pink, PALETTE.bubble, PALETTE.leaf, PALETTE.white];
    for (let i = 0; i < 5; i++) this.fx.shards(x, y - 20, -Math.PI / 2, colors[i]!, 6, 560);
    this.oyun.audio.play('win');
    this.flyCoins(sx, sy, 24);
  }

  private flyCoins(x: number, y: number, amount: number): void {
    const target = this.coinTarget();
    const n = Math.min(12, Math.max(3, Math.round(amount / 2)));
    let left = amount;
    let i = 0;
    this.fx.coins(x, y, n, target.x, target.y, () => {
      i += 1;
      const add = i === n ? left : Math.floor(amount / n);
      left -= add;
      this.coinShown += add;
      this.coinPop = 1;
      this.oyun.audio.playPreset(SFX.tick, { pitch: Math.min(12, i), jitter: 0 });
    });
  }

  private onWaveStart(wave: number): void {
    const audio = this.oyun.audio;
    const types = new Set(this.w.enemies.map((e) => e.type));
    let intro: string | null = null;
    for (const t of types) {
      if (!this.seen.has(t) || (wave > 1 && types.size === 1 && wave <= 6 && t !== 'archer' && !this.seen.has(`intro-${t}`))) {
        intro = this.t(`hud.new.${t}`);
        this.seen.add(`intro-${t}`);
      }
      this.seen.add(t);
    }
    if (types.has('boss')) {
      this.showBanner(this.t('hud.bossWave'), intro ?? this.t('hud.new.boss'));
    } else {
      audio.playPreset(SFX.drum);
      if (wave > 1 || this.data0.revive) this.showBanner(this.t('hud.wave', { n: wave }), intro);
    }
    // landing thumps for archers dropping in (wave 1's archer was already standing at the title)
    if (wave > 1) this.time.delayedCall(560, () => {
      if (this.finished) return;
      for (const e of this.w.enemies) {
        if (e.type === 'boss') this.juice.shake(0.35);
        this.fx.puffs(e.anchorX, e.anchorY + 52 * e.scale, 4, PALETTE.white, 140);
      }
      if (this.w.enemies.length) audio.playPreset(SFX.slam, { volume: 0.6 });
    });
    this.oyun.platform.track('wave_start', { wave });
  }

  /** Headline (+ optional subtitle on its own dark pill) high in the sky, clear of the HUD. */
  /** Rising text that is tracked, so clearTransients can remove it before an overlay opens. */
  private float(x: number, y: number, text: string, opts: Parameters<OyunScene['juice']['floatText']>[3]): void {
    const t = this.juice.floatText(x, y, text, opts);
    this.floats.add(t);
    t.once(Phaser.GameObjects.Events.DESTROY, () => this.floats.delete(t));
  }

  /**
   * Remove every transient text (wave banners, damage numbers, hit words, floating labels)
   * at once. Called before the card pick, the pause menu and the result screen, so nothing
   * half-faded can sit behind them.
   */
  private clearTransients(): void {
    for (const b of [...this.banners]) {
      this.tweens.killTweensOf(b);
      b.destroy();
    }
    this.banners.clear();
    for (const t of [...this.floats]) {
      this.tweens.killTweensOf(t);
      t.destroy();
    }
    this.floats.clear();
    this.numbers.clear();
    this.bannerUntil = 0;
  }

  private showBanner(text: string, sub: string | null): void {
    // never over an overlay: no banner while the cards are up or the run is over
    if (this.cardUi || this.finished || this.w.phase === 'cards' || this.w.phase === 'over') return;
    // one banner at a time: a new headline replaces whatever is still fading
    for (const b of [...this.banners]) {
      this.tweens.killTweensOf(b);
      b.destroy();
    }
    const L = this.layout;
    const c = this.add.container(L.cx, L.top + 230).setDepth(80);
    this.banners.add(c);
    c.once(Phaser.GameObjects.Events.DESTROY, () => this.banners.delete(c));
    const t = label(this, 0, 0, text, { size: 80, color: PALETTE.cream, wrap: 660 }).setStroke(cssColor(PALETTE.ink), 18);
    c.add(t);
    if (sub) {
      const st = label(this, 0, 0, sub, { size: 36, color: PALETTE.white, wrap: 600 });
      const h = st.height + 28;
      const y = t.height / 2 + 22 + h / 2;
      st.setY(y);
      const bg = this.add.graphics();
      bg.fillStyle(PALETTE.ink, 0.78).fillRoundedRect(-Math.min(330, st.width / 2 + 30), y - h / 2, Math.min(660, st.width + 60), h, 22);
      c.add([bg, st]);
    }
    c.setScale(2.2).setAlpha(0).setAngle(-8);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, angle: 0, duration: 260, ease: 'Back.easeOut' });
    // the banner stands in for the HUD's wave line while it is up
    this.bannerUntil = performance.now() + (sub ? 2600 : 1250);
    this.tweens.add({ targets: c, alpha: 0, y: c.y - 60, delay: sub ? 2300 : 950, duration: 300, onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ cards

  private openCards(): void {
    if (this.cardUi) return;
    this.clearTransients();
    this.picking = false;
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(90);
    const scrim = this.add.rectangle(L.cx, L.cy, W, H, PALETTE.ink, 0.62).setInteractive();
    c.add(scrim);
    const title = label(this, L.cx, L.top + 170, this.t('cards.title'), { size: 64, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 14);
    c.add(title);
    this.juice.pop(title, 1.3, 300);
    this.cardUi = c;
    this.buildCardFaces();
  }

  private buildCardFaces(): void {
    const c = this.cardUi;
    if (!c) return;
    for (const z of this.cardHits) z.destroy();
    this.cardHits = [];
    c.list.filter((o) => o.getData('card') === true).forEach((o) => o.destroy());
    this.rerollBtn?.destroy();
    this.extraBtn?.destroy();
    const L = this.layout;
    const offer = this.w.offer;
    const n = offer.length;
    const ch = n > 3 ? 168 : 196;
    const gap = n > 3 ? 14 : 22;
    const startY = L.top + 280 + ch / 2;
    this.cardRects = {};
    offer.forEach((id, i) => {
      const y = startY + i * (ch + gap);
      const card = this.add.container(L.cx, y);
      card.setData('card', true);
      const g = this.add.graphics();
      const cw = 620;
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(-cw / 2 - 6, -ch / 2 - 6 + 8, cw + 12, ch + 12, 30);
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(-cw / 2 - 6, -ch / 2 - 6, cw + 12, ch + 12, 30);
      g.fillStyle(PALETTE.cardEdge, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 26);
      g.fillStyle(PALETTE.card, 1).fillRoundedRect(-cw / 2 + 8, -ch / 2 + 8, cw - 16, ch - 16, 20);
      g.fillStyle(PALETTE.cardIcon, 1).fillCircle(-cw / 2 + 96, 0, 70);
      // the icon lives in its own graphics so it can sway, squash on press and spin on pick
      const icon = this.add.graphics().setPosition(-cw / 2 + 96, 0);
      drawCardIcon(icon, id, 0, 0);
      card.setData('icon', icon);
      const held = countCards(this.w.cards, id);
      // name and description measured and stacked as one block, centred in the card
      const name = label(this, -cw / 2 + 190, 0, this.t(`card.${id}.name`), { size: 44, color: PALETTE.ink }).setOrigin(0, 0);
      const desc = label(this, -cw / 2 + 190, 0, this.t(`card.${id}.desc`), { size: 34, color: PALETTE.inkSoft, wrap: 400, align: 'left' }).setOrigin(0, 0);
      const fitK = Math.min(1, (ch - 34) / (name.height + 8 + desc.height));
      name.setScale(fitK);
      desc.setScale(fitK);
      const blockH = (name.height + 8 + desc.height) * fitK;
      name.setY(-blockH / 2);
      desc.setY(-blockH / 2 + (name.height + 8) * fitK);
      card.add([g, icon, name, desc]);
      this.tweens.add({ targets: icon, angle: { from: -7, to: 7 }, y: { from: 3, to: -3 }, yoyo: true, repeat: -1, duration: 900 + i * 130, ease: 'Sine.easeInOut', delay: i * 160 });
      if (held > 0) {
        const badge = this.add.graphics();
        badge.fillStyle(PALETTE.ink, 1).fillCircle(cw / 2 - 44, -ch / 2 + 38, 36);
        badge.fillStyle(PALETTE.danger, 1).fillCircle(cw / 2 - 44, -ch / 2 + 38, 31);
        card.add([badge, label(this, cw / 2 - 40, -ch / 2 + 32, this.t('cards.stack', { n: held + 1 }), { size: 34 })]);
      }
      c.add(card);
      // slam in
      card.setScale(1.7).setAlpha(0).setAngle(i % 2 ? 7 : -7);
      card.y = y - 80;
      this.tweens.add({
        targets: card,
        scale: 1,
        alpha: 1,
        angle: 0,
        y,
        delay: 90 + i * 120,
        duration: 230,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          this.oyun.audio.playPreset(SFX.slam, { pitch: i * 2 });
          this.juice.shake(0.18);
          this.juice.squash(card, 0.12, 220);
        },
      });
      const zone = this.add.zone(L.cx, y, cw, ch).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onPickCard(i));
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        icon.setScale(0.78, 0.9);
        this.tweens.add({ targets: icon, scaleX: 1.15, scaleY: 1.15, duration: 160, ease: 'Back.easeOut' });
      });
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.tweens.add({ targets: icon, scaleX: 1, scaleY: 1, duration: 120 }));
      c.add(zone);
      this.cardHits.push(zone);
      this.cardRects[`card${i}`] = [L.cx - cw / 2, y - ch / 2, cw, ch];
    });
    const by = Math.min(L.bottom - 80, startY + n * (ch + gap) + 40);
    this.rerollBtn = button(this, L.cx - 165, by, this.t('cards.reroll', { n: this.w.rerollsLeft }), () => this.onReroll(), { width: 300, height: 100, fontSize: 38, variant: 'secondary' });
    this.rerollBtn.setEnabled(this.w.rerollsLeft > 0);
    this.extraBtn = button(this, L.cx + 165, by, this.t('cards.extra'), () => void this.onExtra(), { width: 300, height: 100, fontSize: 38 });
    this.extraBtn.setEnabled(!this.w.offerExtra);
    c.add([this.rerollBtn, this.extraBtn]);
    this.cardRects.reroll = [L.cx - 315, by - 50, 300, 100];
    this.cardRects.extra = [L.cx + 15, by - 50, 300, 100];
  }

  private onPickCard(i: number): void {
    if (this.picking || !this.cardUi || this.w.phase !== 'cards' || !this.w.offer[i]) return;
    this.picking = true;
    this.oyun.audio.playPreset(SFX.pick);
    this.oyun.platform.haptic('medium');
    const c = this.cardUi;
    const cards = c.list.filter((o) => o.getData('card') === true) as Phaser.GameObjects.Container[];
    cards.forEach((card, k) => {
      this.tweens.killTweensOf(card);
      if (k === i) {
        const icon = card.getData('icon') as Phaser.GameObjects.Graphics | undefined;
        if (icon) {
          this.tweens.killTweensOf(icon);
          this.tweens.add({ targets: icon, angle: 360, scaleX: 1.5, scaleY: 1.5, duration: 420, ease: 'Back.easeOut' });
        }
        this.tweens.add({ targets: card, scale: 1.12, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: card, y: this.layout.top + 40, scale: 0.2, alpha: 0, delay: 260, duration: 260, ease: 'Cubic.easeIn' });
      } else {
        this.tweens.add({ targets: card, y: card.y + 900, angle: k < i ? -25 : 25, duration: 420, ease: 'Cubic.easeIn' });
      }
    });
    this.time.delayedCall(540, () => {
      c.destroy();
      this.cardUi = null;
      this.cardHits = [];
      this.rerollBtn = null;
      this.extraBtn = null;
      this.cardRects = {};
      pickCard(this.w, i); // its events are handled with the next frame's
    });
  }

  private onReroll(): void {
    if (this.picking || reroll(this.w) === false) return;
    this.oyun.audio.play('pop');
    this.buildCardFaces();
  }

  private async onExtra(): Promise<void> {
    if (this.picking || this.w.offerExtra) return;
    this.extraBtn?.setEnabled(false);
    const r = await this.oyun.platform.showRewarded('extra_card');
    if (r !== 'granted' || !addExtraCard(this.w)) {
      this.extraBtn?.setEnabled(!this.w.offerExtra);
      return;
    }
    this.oyun.platform.track('reward_claimed', { placement: 'extra_card' });
    this.buildCardFaces();
  }

  // ------------------------------------------------------------------ end of run

  private finish(): void {
    if (this.finished) return;
    this.clearTransients();
    this.finished = true;
    const w = this.w;
    this.oyun.platform.gameplayStop();
    this.oyun.platform.track('run_end', { wave: w.wave, coins: w.run.coins, kos: w.run.kos, daily: this.daily });
    this.bank(w.wave);
    const save = gameSave(this.oyun).data;
    const outcome = w.bank ? runOutcome(save, w.bank, w.wave) : { best: save.best, newBest: false };
    session.finishedRuns += 1;
    pendingWorld = w;
    const result: RunResult = { wave: w.wave, coins: w.run.coins, kos: w.run.kos, headshots: w.run.headshots, best: outcome.best, newBest: outcome.newBest, daily: this.daily, dailyKey: this.todayKey() };
    this.time.delayedCall(350, () => this.goTo(SCENES.result, result));
  }

  // ------------------------------------------------------------------ test hook

  protected override testState() {
    const w = this.w;
    const r = (v: number) => Math.round(v * 10) / 10;
    const first = aliveEnemies(w).find((e) => e.brain !== 'spawn');
    let solution: { angle: number; power: number } | null = null;
    if (first) {
      const p = targetPoint(first, 'chest');
      const s = solveShot(w, p.x, p.y);
      solution = { angle: r(s.angle * 1000) / 1000, power: r(s.power * 1000) / 1000 };
    }
    const stats = (xs: number[]) => {
      const v = [...xs].sort((a, b) => a - b);
      return v.length ? { avg: r(v.reduce((a, b) => a + b, 0) / v.length), p95: r(v[Math.floor(v.length * 0.95)]!), max: r(v[v.length - 1]!), n: v.length } : null;
    };
    return {
      phase: w.phase,
      wave: w.wave,
      health: r(w.player.hp),
      maxHealth: w.player.maxHp,
      coins: w.run.coins,
      savedCoins: gameSave(this.oyun).data.coins,
      best: gameSave(this.oyun).data.best,
      enemies: w.enemies.map((e) => ({ id: e.id, type: e.type, alive: e.alive, x: r(e.body.x[PT.pelvis]!), y: r(e.body.y[PT.pelvis]!), hp: r(e.hp) })),
      cards: [...w.cards],
      offer: [...w.offer],
      reload: r(w.reload),
      shots: w.run.shots,
      shotFx: this.shotFx,
      waveFx: this.waveFx,
      kos: w.run.kos,
      firstKoShot: w.run.firstKoShot,
      time: r(w.time),
      aiming: this.dragId !== -1,
      draw: r(w.player.draw),
      solution,
      drag: { dead: DRAG_DEAD, full: DRAG_FULL },
      rects: this.cardRects,
      revivable: hasRevive(),
      /** JS ms in this scene's update (sim + drawing commands) */
      frameMs: stats(this.frameMs),
      /** JS ms for the whole Phaser step incl. render submission (software GL here) */
      stepMs: stats(this.stepMs),
      arrowsActive: w.arrows.filter((a) => a.active).length,
    };
  }

  protected override testActions() {
    return {
      shoot: (p: unknown) => {
        const { angle, power } = p as { angle: number; power: number };
        this.release(angle, power);
      },
      aimbot: (p: unknown) => {
        const error = (p as { error?: number } | undefined)?.error ?? CAREFUL.angleError;
        const prof: Profile = { ...CAREFUL, angleError: error, powerError: error };
        const s = planShot(this.w, this.w.rng.fork('aimbot'), prof);
        if (s) this.release(s.angle, s.power);
      },
      'pick-card': (p: unknown) => this.onPickCard(Number(p)),
      advance: (p: unknown) => {
        const seconds = Number(p);
        for (let t = 0; t < seconds && !this.finished; t += 1 / 60) {
          advance(this.w, 1 / 60);
          this.handleEvents(takeEvents(this.w));
        }
      },
      reroll: () => this.rerollBtn?.fire(),
      extra: () => this.extraBtn?.fire(),
      pause: () => this.pauseBtn.fire(),
      shop: () => this.shopBtn?.fire(),
      daily: () => this.dailyBtn?.fire(),
      'perf-reset': () => {
        this.frameMs = [];
        this.stepMs = [];
      },
      // capture aids (screenshots of later waves and card looks); never used by the gate
      'jump-wave': (p: unknown) => {
        if (this.w.phase === 'title') this.release(-1.45, 0.2);
        const n = typeof p === 'object' && p !== null ? (p as { wave: number; drop?: boolean }) : { wave: Number(p) || 1 };
        jumpToWave(this.w, Math.max(1, n.wave), n.drop === true);
        this.tracks.clear();
      },
      anim: (p: unknown) => {
        this.animOff = p === false;
        this.arena.ambientOn = !this.animOff;
      },
      god: () => {
        this.w.player.maxHp = this.w.player.hp = 1e6;
      },
      'give-cards': (p: unknown) => {
        this.w.cards.length = 0;
        for (const id of p as CardId[]) this.w.cards.push(id);
        this.w.stats = statsFor(this.w.cards, this.w.meta);
      },
      timescale: (p: unknown) => {
        this.debugScale = Number(p) || 1;
      },
    };
  }
}

function drawHeartAt(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
  g.fillStyle(PALETTE.ink, 1).fillCircle(x - 11 * s, y - 6 * s, 14 * s).fillCircle(x + 11 * s, y - 6 * s, 14 * s).fillTriangle(x - 24 * s, y, x + 24 * s, y, x, y + 25 * s);
  g.fillStyle(PALETTE.hp, 1).fillCircle(x - 11 * s, y - 6 * s, 10 * s).fillCircle(x + 11 * s, y - 6 * s, 10 * s).fillTriangle(x - 19 * s, y - 2 * s, x + 19 * s, y - 2 * s, x, y + 19 * s);
  g.fillStyle(PALETTE.white, 0.6).fillCircle(x - 14 * s, y - 10 * s, 3.5 * s);
}

