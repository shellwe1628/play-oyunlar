import { button, cssColor, hashSeed, iconButton, label, muteButton, OyunScene, toast, type Button, type IconButton } from '@oyun/core';
import Phaser from 'phaser';
import { gameSave } from '../save';
import { planShot, solveShot, CAREFUL, type Profile } from '../sim/aimbot';
import { bowGlow, bowTier } from '../sim/bow';
import { countCards, statsFor, synergyFor, type CardId } from '../sim/cards';
import { CHAPTERS, stageOf, STAGES, type BonusKind } from '../sim/chapters';
import type { EnemyType } from '../sim/combat';
import { bankProgress, bankStart, cosmeticById, dailyKey, metaOf, newBank, NO_META, runOutcome } from '../sim/meta';
import { bankDailyChallenge, bankRecords, dailyChallenge, FEATS, liveStreak, progressScore, RANKS, rankOf, unlockFeats } from '../sim/progress';
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
  jumpToWave,
  pickCard,
  playerOrigin,
  reachedWave,
  reroll,
  revive,
  shoot,
  startBonusNow,
  summarize,
  takeEvents,
  targetPoint,
  twitch,
  unleash,
  type Archer,
  type GameEvent,
  type World,
} from '../sim/world';
import { SFX } from '../sfx';
import { PALETTE } from '../textures';
import { themeIndex } from '../anim/themes';
import { animate, newAnimOut, posePoint, posePoints, type AnimInput, type AnimOut, type Kind } from '../anim/anim';
import { Arena } from './arena';
import { Trails } from './trails';
import { bowGeomOf, createScarf, drawArcher, drawArrow, drawShield, lookFor, stepScarf, type Scarf } from './art';
import { BowAura } from './aura';
import { Fx } from './fx';
import { auraColor, drawBadge, newBowGeom } from './gear';
import { HitNumbers } from './numbers';
import { drawCardIcon } from './icons';
import { DRAG_DEAD, DRAG_FULL, SCENES } from './keys';
import { drawBarrel, drawOrb, drawPlate, drawRock, drawSwingRopes, drawTarget, drawWall, drawWind } from './props';

/** The world of a run that just ended, kept so the result screen can offer a revive. */
let pendingWorld: World | null = null;
/** Finished runs this session (interstitial pacing). */
export const session = { finishedRuns: 0, chapter: 0 };

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
  /** chapter select: start at this chapter (0 … 4) */
  chapter?: number;
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
  /** chapter (0 … 3, 4 endless) and stage reached */
  chapter: number;
  stage: number;
  /** achievements unlocked this run, records beaten, daily challenge coins (0 = not done) */
  feats: string[];
  records: string[];
  dailyCoins: number;
  dailyStreak: number;
  /** rank when the run started (the result plays the ceremony if it rose) */
  startRank: number;
}

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
  armored: PALETTE.archer,
};

const W = 720;
const H = 1280;
const BEAMS = 8;

/** Fit a core button's label inside its face. */
export function fitButton<T extends Phaser.GameObjects.Container>(b: T, width: number): T {
  const t = b.list[1] as Phaser.GameObjects.Text | undefined;
  if (t && t.width > width - 30) t.setScale((width - 30) / t.width);
  return b;
}

/**
 * The whole run: title (which IS the first shot), chapters, bonus rounds, card picks and
 * death. Draws the sim and forwards input to it; every rule lives in src/sim.
 * Test actions: shoot {angle, power}, aimbot {error?}, pick-card index, advance seconds,
 * reroll, extra, pause, shop, daily, unleash, forge, ranks, chapter n.
 */
export class GameScene extends OyunScene {
  protected override autoPause = true;
  private w!: World;
  private data0: GameData = {};
  private daily = false;
  private layer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private arena!: Arena;
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
  /** the field's size as shown (eases to the sim's w.span: the camera pulls back on a grown field) */
  private span = 1;
  private pushX = 0;
  private pushY = 0;
  private hurtFlash = 0;
  /** white headshot flash (screen) */
  private flash!: Phaser.GameObjects.Rectangle;
  private flashA = 0;
  private punch = 0;
  private bannerUntil = 0;
  private banners = new Set<Phaser.GameObjects.Container>();
  private floats = new Set<Phaser.GameObjects.GameObject>();
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
  private objText!: Phaser.GameObjects.Text;
  private bowText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private coinShown = 0;
  private coinIcon!: Phaser.GameObjects.Image;
  private coinPop = 0;
  private pauseBtn!: IconButton;
  private vignette!: Phaser.GameObjects.Image;
  private focusG!: Phaser.GameObjects.Graphics;
  private focusZone!: Phaser.GameObjects.Zone;
  private focusText!: Phaser.GameObjects.Text;
  private focusShown = 0;
  private bonusText!: Phaser.GameObjects.Text;
  // title + cards
  private titleUi: Phaser.GameObjects.Container | null = null;
  private shopBtn: Button | null = null;
  private dailyBtn: Button | null = null;
  private forgeBtn: Button | null = null;
  private ranksBtn: Button | null = null;
  private chapterBtn: Button | null = null;
  private cardUi: Phaser.GameObjects.Container | null = null;
  private cardHits: Phaser.GameObjects.Zone[] = [];
  private cardRects: Record<string, number[]> = {};
  private picking = false;
  private treasurePick = false;
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
  private trails = new Trails(88);
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
  /** heal beams and chain sparks: x0, y0, x1, y1, age, kind (0 heal, 1 zap) — a fixed ring */
  private beams = new Float64Array(BEAMS * 6);
  private beamNext = 0;
  /** blast rings: x, y, radius, age */
  private toasts: { title: string; sub: string; color: number }[] = [];
  private toastBusy = false;
  private bowLevel = 0;
  private recordsBeaten = new Set<string>();
  private dailyCoins = 0;
  private dailyStreak = 0;
  private moverSkip: number[] = [];
  private aura!: BowAura;
  private glowG!: Phaser.GameObjects.Graphics;
  private bowGeom = newBowGeom();
  private realDt = 0;

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
    // the world is made further down: start at the normal frame, update() eases to w.span
    this.span = 1;
    this.frameMs = [];
    this.stepMs = [];
    this.shotFx = 0;
    this.waveFx = 0;
    this.bannerUntil = 0;
    this.banners.clear();
    this.floats.clear();
    this.flashA = 0;
    this.punch = 0;
    this.toasts = [];
    this.toastBusy = false;
    this.beams.fill(0);
    for (let i = 0; i < BEAMS; i++) this.beams[i * 6 + 4] = 9;
    this.recordsBeaten.clear();
    this.dailyCoins = 0;
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
    if (d.chapter !== undefined) session.chapter = Math.max(0, Math.min(save.data.chapter, d.chapter));
    if (session.chapter > save.data.chapter) session.chapter = save.data.chapter;
    if (d.revive && pendingWorld && revive(pendingWorld)) {
      this.w = pendingWorld;
      this.daily = d.daily ?? false;
    } else {
      this.daily = d.daily ?? false;
      const key = this.todayKey();
      const seed = this.daily ? hashSeed(`okcu-daily-${key}`) : this.oyun.rng.int(0, 2 ** 31 - 1);
      // the daily run is the same for everyone: permanent upgrades and the bow do not apply
      this.w = createWorld({
        seed,
        meta: this.daily ? NO_META : metaOf(save.data),
        startChapter: this.daily ? 0 : session.chapter,
        mod: this.daily ? dailyChallenge(key).mod : null,
      });
      this.w.bank = newBank(save.data);
    }
    this.bowLevel = this.w.meta.bow;
    pendingWorld = null;
    this.coinShown = this.w.run.coins;
    for (const e of this.w.enemies) this.seen.add(e.type);

    // ---- world layer (zoomable)
    this.layer = this.add.container(0, 0);
    this.arena = new Arena(this, this.layer);
    this.dyn = this.add.graphics();
    this.aimG = this.add.graphics();
    // the bow's glow (additive): arrow glows below, the aura on top of the archer
    this.glowG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add([this.dyn, this.glowG, this.aimG]);
    this.aura = new BowAura(this, this.layer);
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
    this.arena.setTheme(themeIndex(this.w.wave), true);
    this.syncLedges();

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
      this.showBanner(this.waveLabel(), null);
    }
    this.syncHud(true);
  }

  private syncLedges(): void {
    const skip = this.moverSkip;
    skip.length = 0;
    for (const m of this.w.movers) skip.push(m.index);
    this.arena.setLedges(this.w.ledges, this.w.wave, skip);
    this.arena.wind = this.w.wind;
  }

  private bowName(level = this.bowLevel): string {
    return this.t('bow.name', { name: this.t(`bow.${bowTier(level)}`), n: level });
  }

  private chapterName(c: number): string {
    return this.t(`chapter.${Math.min(CHAPTERS, c)}`);
  }

  private waveLabel(): string {
    const p = stageOf(this.w.wave);
    if (p.endless) return this.t('hud.endlessWave', { n: this.w.wave - CHAPTERS * STAGES });
    return `${this.t('hud.chapterNo', { n: p.chapter + 1 })} · ${this.t('hud.stage', { s: p.stage })}`;
  }

  // ------------------------------------------------------------------ HUD

  private buildHud(): void {
    const L = this.layout;
    const top = L.top + 64;
    this.hud = this.add.container(0, 0).setDepth(60);
    this.hpG = this.add.graphics();
    this.hud.add(this.hpG);
    this.waveText = label(this, L.cx, top + 78, '', { size: 38 }).setStroke(cssColor(PALETTE.ink), 10);
    this.objText = label(this, L.cx, top + 124, '', { size: 28, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 8);
    this.bowText = label(this, L.left + 24, top + 46, '', { size: 24, color: PALETTE.cream }).setOrigin(0, 0.5).setStroke(cssColor(PALETTE.ink), 7);
    this.bonusText = label(this, L.cx, top + 170, '', { size: 40, color: PALETTE.gold }).setStroke(cssColor(PALETTE.ink), 10);
    const coinG = this.add.image(L.right - 216, top, 'coin').setScale(1.15);
    this.coinIcon = coinG;
    this.coinText = label(this, L.right - 128, top, '0', { size: 44, color: PALETTE.coin }).setOrigin(1, 0.5).setStroke(cssColor(PALETTE.ink), 10);
    this.pauseBtn = iconButton(this, L.right - 62, top, 'pause', () => this.openPauseMenu(), 96);
    // the focus meter: a gauge in the bottom-right corner, tapped to unleash when full
    const fx = L.right - 92;
    const fy = L.bottom - 120;
    this.focusG = this.add.graphics();
    this.focusText = label(this, fx, fy - 92, '', { size: 30, color: PALETTE.focus }).setStroke(cssColor(PALETTE.ink), 8);
    this.focusZone = this.add.zone(fx, fy, 150, 150).setInteractive({ useHandCursor: true });
    this.focusZone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onUnleash());
    this.hud.add([this.waveText, this.objText, this.bowText, this.bonusText, coinG, this.coinText, this.pauseBtn, this.focusG, this.focusText, this.focusZone]);
  }

  private onUnleash(): void {
    if (unleash(this.w)) this.oyun.platform.haptic('heavy');
  }

  private coinTarget(): { x: number; y: number } {
    return { x: this.coinIcon.x, y: this.coinIcon.y };
  }

  private syncHud(force = false): void {
    const w = this.w;
    const p = w.player;
    const L = this.layout;
    const top = L.top + 64;
    const k = Math.max(0, p.hp / p.maxHp);
    this.hpShown += (k - this.hpShown) * (force ? 1 : 0.18);
    const g = this.hpG;
    g.clear();
    const x = L.left + 84;
    const bw = 210 + Math.min(80, (p.maxHp - 100) * 0.5);
    const pop = 1 + this.hpPop * 0.12;
    const h = 34 * pop;
    g.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 8, top - h / 2 - 7, bw + 16, h + 14, (h + 14) / 2);
    g.fillStyle(PALETTE.hpBack, 1).fillRoundedRect(x, top - h / 2, bw, h, h / 2);
    // white trail then the real bar
    if (this.hpShown > k + 0.005) g.fillStyle(PALETTE.white, 0.9).fillRoundedRect(x, top - h / 2, Math.max(h, bw * this.hpShown), h, h / 2);
    if (k > 0) g.fillStyle(k > 0.3 ? PALETTE.hp : PALETTE.danger, 1).fillRoundedRect(x, top - h / 2, Math.max(h, bw * k), h, h / 2);
    g.fillStyle(PALETTE.white, 0.35).fillRoundedRect(x + 8, top - h / 2 + 5, Math.max(10, bw * k - 16), h * 0.28, 4);
    // heart
    const hs = 1 + this.hpPop * 0.3 + (k < 0.3 && p.alive ? Math.abs(Math.sin(this.time.now / 160)) * 0.15 : 0);
    drawHeartAt(g, x - 18, top, hs);
    // shield bubbles left this wave
    for (let i = 0; i < w.shieldLeft; i++) {
      g.fillStyle(PALETTE.ink, 1).fillCircle(x + bw + 30 + i * 30, top, 14);
      g.fillStyle(PALETTE.bubble, 1).fillCircle(x + bw + 30 + i * 30, top, 10);
    }
    const showWave = w.phase !== 'title' && w.phase !== 'cards' && w.phase !== 'bonus';
    this.waveText.setText(showWave ? this.waveLabel() : '');
    this.waveText.setVisible(performance.now() >= this.bannerUntil);
    this.objText.setText(w.objective && showWave ? this.objectiveText(w.objective.kind, w.objective.limit) : '');
    this.objText.setVisible(performance.now() >= this.bannerUntil);
    this.bowText.setText(this.bowLevel > 0 ? this.bowName() : '');
    // wind sock under the coins
    if (w.wind !== 0 && w.phase !== 'title') drawWind(g, L.right - 120, top + 150, w.wind, this.skyT);
    // bonus round: time left and hits
    const b = w.bonus;
    if (b && b.t >= 0 && b.grade === null) {
      const left = Math.max(0, b.dur - b.t);
      const bx = L.cx - 200;
      const by = top + 128;
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(bx - 6, by - 14, 412, 28, 14);
      g.fillStyle(PALETTE.gold, 1).fillRoundedRect(bx, by - 8, 400 * (left / b.dur), 16, 8);
      this.bonusText.setText(this.t('bonus.hits', { n: b.hits, c: b.coins }));
    } else this.bonusText.setText('');
    this.coinText.setText(String(this.coinShown));
    this.coinText.setScale(1 + this.coinPop * 0.35);
    this.coinIcon.setX(this.coinText.x - this.coinText.width - 30).setScale(1.15 + this.coinPop * 0.3);
    this.drawFocusGauge();
    this.hud.setAlpha(w.phase === 'title' ? 0 : 1);
    this.pauseBtn.setVisible(w.phase !== 'title');
  }

  private drawFocusGauge(): void {
    const w = this.w;
    const g = this.focusG;
    g.clear();
    const L = this.layout;
    const x = L.right - 92;
    const y = L.bottom - 120;
    const live = w.phase !== 'title' && w.phase !== 'cards' && w.player.alive;
    this.focusZone.setVisible(live);
    if (!live) {
      this.focusText.setText('');
      return;
    }
    this.focusShown += (w.focus - this.focusShown) * 0.2;
    const ready = w.focus >= 1 && w.focusT <= 0;
    const t = this.skyT;
    const R = 48 + (ready ? Math.sin(t * 8) * 4 : 0);
    if (ready) g.fillStyle(PALETTE.focus, 0.25 + Math.sin(t * 8) * 0.1).fillCircle(x, y, R + 22);
    g.fillStyle(PALETTE.ink, 0.85).fillCircle(x, y, R + 8);
    g.fillStyle(PALETTE.hpBack, 1).fillCircle(x, y, R);
    const k = w.focusT > 0 ? w.focusT / w.stats.focusTime : this.focusShown;
    if (k > 0.01) g.fillStyle(PALETTE.focus, 1).slice(x, y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k), false).fillPath();
    g.fillStyle(PALETTE.ink, 1).fillCircle(x, y, R * 0.55);
    // an eye: focus
    g.fillStyle(ready || w.focusT > 0 ? PALETTE.white : PALETTE.locked, 1).fillEllipse(x, y, R * 0.8, R * 0.46);
    g.fillStyle(PALETTE.ink, 1).fillCircle(x, y, R * 0.16);
    this.focusText.setText(ready ? this.t('hud.focusTap') : w.focusT > 0 ? this.t('hud.focus') : '');
    this.focusText.setScale(ready ? 1 + Math.sin(t * 8) * 0.08 : 1);
  }

  private objectiveText(kind: string, limit: number): string {
    return this.t(`obj.${kind}`, { n: limit });
  }

  // ------------------------------------------------------------------ title

  private buildTitle(quick: boolean): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(70);
    const save = gameSave(this.oyun).data;
    const logoY = L.top + (quick ? 230 : 262);
    if (!quick) {
      const box = this.add.container(L.cx, logoY);
      const logo = label(this, 0, 0, this.t('title.name'), { size: 68, color: PALETTE.cream, wrap: 690 }).setStroke(cssColor(PALETTE.ink), 18);
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
    const subY = logoY + (quick ? 0 : 96);
    if (this.daily) {
      // the daily state is spelled out: whose seed, that upgrades are off, today's goal
      const ch = dailyChallenge(this.todayKey());
      const panel = this.add.graphics();
      panel.fillStyle(PALETTE.ink, 0.72).fillRoundedRect(L.cx - 330, subY - 34, 660, 178, 26);
      c.add(panel);
      c.add(label(this, L.cx, subY, this.t('title.dailyOn', { d: this.todayKey() }), { size: 36, color: PALETTE.gold }));
      c.add(label(this, L.cx, subY + 50, this.t('title.dailyGoal', { n: ch.goal, m: this.t(`mod.${ch.mod}`) }), { size: 30, color: PALETTE.cream, wrap: 620 }));
      c.add(label(this, L.cx, subY + 100, `${this.t('title.dailyInfo')} · ${this.t('title.dailyStreak', { n: liveStreak(save, this.todayKey()) })}`, { size: 26, color: PALETTE.cream, wrap: 620 }));
    } else {
      // rank badge + rank and bow, the player's standing at a glance
      const score = progressScore(save).total;
      const r = rankOf(score);
      const badge = this.add.graphics();
      const txt = `${this.t(`rank.${RANKS[r]!.id}`)} · ${this.bowName()}`;
      const tl = label(this, L.cx + 28, subY, txt, { size: 34, color: PALETTE.gold }).setStroke(cssColor(PALETTE.ink), 10);
      drawBadge(badge, L.cx - tl.width / 2 - 14, subY, 22, r, 0);
      c.add([badge, tl]);
      if (save.best > 0) c.add(label(this, L.cx, subY + 46, this.t('title.best', { n: save.best }), { size: 30, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 8));
      if (this.w.startChapter > 0) c.add(label(this, L.cx, subY + 84, this.t('title.hand', { n: this.w.cards.length }), { size: 28, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 8));
    }
    // the hint: a ghost thumb pulling back from open sky (never over the archers)
    // kept above the highest spot the first archer can stand (its head is never above y ≈ 520)
    const hintY = Math.min(subY + (this.daily ? 200 : this.w.startChapter > 0 ? 136 : 100), L.top + 500);
    const hint = label(this, L.cx, hintY, this.t('title.drag'), { size: 50, color: PALETTE.white, wrap: 640 }).setStroke(cssColor(PALETTE.ink), 14);
    this.hintText = hint;
    c.add(hint);
    this.tweens.add({ targets: hint, scale: 1.07, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
    const thumb = this.add.graphics();
    const draw = (t: number): void => {
      thumb.clear();
      const x0 = 300;
      const y0 = 600;
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
    // top row: upgrades, forge, ranks, sound; second row: daily and the chapter select
    const row = L.top + 64;
    const bw = 182;
    this.shopBtn = fitButton(button(this, L.left + 110, row, this.t('title.shop'), () => this.openShop(), { width: bw, height: 92, fontSize: 34, variant: 'secondary' }), bw);
    this.forgeBtn = fitButton(button(this, L.left + 302, row, this.t('title.forge'), () => this.goTo(SCENES.forge, { from: 'game' }), { width: bw, height: 92, fontSize: 34 }), bw);
    this.ranksBtn = fitButton(button(this, L.left + 494, row, this.t('title.ranks'), () => this.goTo(SCENES.ranks, { from: 'game' }), { width: bw, height: 92, fontSize: 34, variant: 'secondary' }), bw);
    const row2 = L.top + 160;
    this.dailyBtn = fitButton(button(this, L.left + 110, row2, this.daily ? this.t('title.dailyExit') : this.t('title.daily'), () => this.goTo(SCENES.game, { daily: !this.daily }), { width: bw, height: 84, fontSize: 34, variant: 'secondary' }), bw);
    c.add([this.shopBtn, this.forgeBtn, this.ranksBtn, this.dailyBtn, muteButton(this, L.right - 60, row)]);
    if (!this.daily && save.chapter > 0) {
      const cw = 430;
      this.chapterBtn = fitButton(
        button(this, L.right - cw / 2 - 18, row2, this.t('title.chapterPick', { c: this.chapterName(session.chapter) }), () => this.nextChapter(), { width: cw, height: 84, fontSize: 32, variant: 'secondary' }),
        cw,
      );
      c.add(this.chapterBtn);
    }
    this.titleUi = c;
  }

  /** Chapter select: cycle through the chapters reached (and endless once unlocked). */
  private nextChapter(): void {
    const max = gameSave(this.oyun).data.chapter;
    const next = session.chapter >= max ? 0 : session.chapter + 1;
    this.goTo(SCENES.game, { chapter: next });
  }

  private hideTitle(): void {
    const c = this.titleUi;
    if (!c) return;
    this.titleUi = null;
    for (const b of [this.shopBtn, this.dailyBtn, this.forgeBtn, this.ranksBtn, this.chapterBtn]) b?.setEnabled(false);
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
      this.oyun.platform.track('run_start', { daily: this.daily, chapter: this.w.startChapter });
      const bank = this.w.bank;
      if (bank) gameSave(this.oyun).update((d) => bankStart(d, bank));
    }
    return true;
  }

  /** Write what this run has earned so far: coins, best wave, records, achievements. */
  private bank(reached = reachedWave(this.w)): void {
    const bank = this.w.bank;
    if (!bank || !bank.started) return;
    const coins = this.w.run.coins;
    const sum = summarize(this.w, this.daily);
    let fresh: string[] = [];
    gameSave(this.oyun).update((d) => {
      bankProgress(d, bank, reached, coins);
      for (const r of bankRecords(d, bank, sum, this.todayKey())) this.recordsBeaten.add(r);
      fresh = unlockFeats(d, sum, bank);
    });
    for (const id of fresh) {
      const f = FEATS.find((x) => x.id === id);
      this.queueToast(this.t('feat.title'), `${this.t(`feat.${id}.name`)} · +${f?.coins ?? 0}`, PALETTE.gold);
    }
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
    for (let i = 0; i < BEAMS; i++) this.beams[i * 6 + 4] = this.beams[i * 6 + 4]! + real;
    this.updateCamera(real);
    this.arena.setTheme(themeIndex(this.w.wave), false);
    this.syncLedges();
    this.realDt = real;
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
    // a grown field: the base view shows `span` times the frame, anchored at the bottom left
    // (the player's corner), so the whole field fits a portrait screen; the effects below work
    // on top of it in screen space
    this.span += (this.w.span - this.span) * Math.min(1, real * 1.8);
    if (Math.abs(this.w.span - this.span) < 1e-3) this.span = this.w.span;
    const base = 1 / this.span;
    const baseY = H * (1 - base);
    const fx = this.zoomFx * base;
    const fy = baseY + this.zoomFy * base;
    // keep the focus point where it is, drifting it a little toward the centre
    const k = this.zoom * 1.2;
    this.layer.setScale(z * base);
    this.layer.setPosition(fx * (1 - z) + (360 - fx) * k + this.pushX, fy * (1 - z) + (640 - fy) * k + this.pushY + z * baseY);
    // parallax: hills shift opposite to the push
    this.arena.setSpan(this.span);
    this.arena.update(real, this.pushX, this.pushY);
    // red vignette on damage; a golden one while focus is up; white flash on a headshot
    if (this.hurtFlash > 0.02) this.vignette.setTint(PALETTE.danger).setAlpha(this.hurtFlash * 0.85);
    else if (this.w.focusT > 0) this.vignette.setTint(PALETTE.focus).setAlpha(0.35 + Math.sin(this.skyT * 6) * 0.08);
    else this.vignette.setAlpha(0);
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
    const th = this.arena.theme;
    const cos = cosmeticById(gameSave(this.oyun).data.cosmetic);
    // moving ledges (and the ropes of swinging ones) are drawn live; the rest are baked
    this.arena.moveLedges(w.ledges);
    for (const m of w.movers) {
      const L = w.ledges[m.index]!;
      if (m.kind === 'swing' && L.y < 1450) drawSwingRopes(g, m, L);
    }
    for (const L of w.walls) drawWall(g, L, th);
    for (const p of w.props) {
      if (!p.active) continue;
      if (p.kind === 'barrel') drawBarrel(g, p, time);
      else drawRock(g, p, th);
    }
    // arrows in ledges sit behind bodies
    const multi = w.stats.volleys > 1 || w.stats.splitPairs > 0;
    const halo = th.dark;
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
      const wind = (a.type === 'player' ? -520 : 520) + w.wind * 2;
      stepScarf(scarf, tr.vx[PT.neck]! - a.facing * 4, tr.vy[PT.neck]! + 4, wind, Math.max(1 / 240, Math.min(dt, 1 / 30)), time, tr.out.scarfLift);
      const shield = a.shield;
      if (shield && a.shieldOn) drawShield(g, shield.x[0]!, shield.y[0]!, shield.x[1]!, shield.y[1]!, TUNING.shieldHits - a.shieldHp, a.hurt < 0.06 ? 0.6 : 0);
      if (a.type === 'player' && w.focusT > 0 && a.alive) {
        // focus: a golden aura around the player
        const cx = (tr.vx[PT.neck]! + tr.vx[PT.pelvis]!) / 2;
        const cy = (tr.vy[PT.neck]! + tr.vy[PT.pelvis]!) / 2 - 20;
        const r = 110 + Math.sin(this.skyT * 9) * 6;
        g.fillStyle(PALETTE.focus, 0.18).fillCircle(cx, cy, r);
        g.lineStyle(5, PALETTE.focus, 0.6).strokeCircle(cx, cy, r);
      }
      drawArcher(g, a, lookFor(a, cos), {
        time,
        scarf: a.type === 'player' || a.type === 'jumper' || a.type === 'boss' || a.type === 'elite' ? scarf : null,
        flash: a.hurt < 0.07 ? 0.85 : 0,
        hpBar: a.type !== 'player' && a.hp < a.maxHp,
        telegraph: a.alive && a.type !== 'player' && a.brain === 'draw' && a.draw > 0.15,
        weakHint: a.type === 'boss',
        view: tr,
        face: tr.out,
        ...(a.type === 'player' ? { bowLevel: this.bowLevel } : {}),
      });
      if (a.type === 'player') {
        // the glow follows the bow as drawn this frame (bend, draw, release)
        this.aura.facing = a.facing;
        this.aura.update(this.realDt, this.bowLevel, bowGeomOf(a, { view: tr, face: tr.out }, this.bowGeom), a.draw, a.alive && !this.animOff);
      }
      if (shield && !a.shieldOn) drawShield(g, shield.x[0]!, shield.y[0]!, shield.x[1]!, shield.y[1]!, 3, 0);
    }
    for (let i = 0; i < w.plates.length; i++) if (w.plates[i]!.active) drawPlate(g, w.plates[i]!, time, i);
    // arrows loosed from a glowing bow carry its glow and a matching trail
    const glow = bowGlow(this.bowLevel);
    const gg = this.glowG;
    gg.clear();
    if (glow.band >= 2 && !this.animOff) {
      const col = auraColor(this.bowLevel, this.skyT);
      for (const a of w.arrows) {
        if (!a.active || a.state !== 0 || a.owner !== 'player') continue;
        const dx = Math.cos(a.angle);
        const dy = Math.sin(a.angle);
        const len = 60 + 50 * glow.aura;
        gg.lineStyle(22 * glow.aura, col, 0.22).lineBetween(a.x - dx * len, a.y - dy * len, a.x, a.y);
        gg.lineStyle(10, col, 0.45).lineBetween(a.x - dx * len * 0.8, a.y - dy * len * 0.8, a.x, a.y);
        if (glow.core > 0) gg.lineStyle(4, PALETTE.white, 0.7 * glow.core).lineBetween(a.x - dx * 40, a.y - dy * 40, a.x, a.y);
        gg.fillStyle(col, 0.35).fillCircle(a.x, a.y, 10 + 8 * glow.aura);
      }
    }
    for (const a of w.arrows) {
      if (!a.active || a.state === 1) continue;
      if (a.kind === 'orb') {
        // a staff-carrier's hex is smaller and magenta; the warden's orbs stay violet
        if (a.hex) drawOrb(g, a.x, a.y, 16, time, PALETTE.hex);
        else drawOrb(g, a.x, a.y, 20, time);
        continue;
      }
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
      if (a.focus && a.state === 0) g.lineStyle(16, PALETTE.focus, 0.35).lineBetween(a.x - Math.cos(a.angle) * 50, a.y - Math.sin(a.angle) * 50, a.x, a.y);
      drawArrow(g, a, time, multi, halo);
    }
    // bonus round targets
    for (const t of w.targets) if (t.active) drawTarget(g, t, time, th);
    // heal beams and chain sparks
    for (let i = 0; i < BEAMS; i++) {
      const b = i * 6;
      const age = this.beams[b + 4]!;
      if (age > 0.45) continue;
      const k = 1 - age / 0.45;
      const x0 = this.beams[b]!;
      const y0 = this.beams[b + 1]!;
      const x1 = this.beams[b + 2]!;
      const y1 = this.beams[b + 3]!;
      if (this.beams[b + 5] === 0) {
        g.lineStyle(14 * k, PALETTE.heal, 0.35 * k).lineBetween(x0, y0, x1, y1);
        g.lineStyle(5 * k, PALETTE.white, 0.8 * k).lineBetween(x0, y0, x1, y1);
      } else {
        // a jagged spark
        const mx = (x0 + x1) / 2 + Math.sin(age * 90) * 18;
        const my = (y0 + y1) / 2 + Math.cos(age * 70) * 18;
        g.lineStyle(9 * k, PALETTE.bubble, 0.5 * k).lineBetween(x0, y0, mx, my).lineBetween(mx, my, x1, y1);
        g.lineStyle(3.5, PALETTE.white, k).lineBetween(x0, y0, mx, my).lineBetween(mx, my, x1, y1);
      }
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
      const k = 1 - w.reload / (w.stats.reload * (w.focusT > 0 ? 0.6 : 1));
      const hx = p.body.x[PT.handF]!;
      const hy = p.body.y[PT.handF]!;
      g.lineStyle(8, PALETTE.ink, 0.6).beginPath().arc(hx, hy, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).strokePath();
      g.lineStyle(4, w.focusT > 0 ? PALETTE.focus : PALETTE.white, 1).beginPath().arc(hx, hy, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).strokePath();
    }
    this.drawBubble();
    this.renderAim();
  }

  private beam(x0: number, y0: number, x1: number, y1: number, kind: number): void {
    const b = this.beamNext * 6;
    this.beamNext = (this.beamNext + 1) % BEAMS;
    this.beams[b] = x0;
    this.beams[b + 1] = y0;
    this.beams[b + 2] = x1;
    this.beams[b + 3] = y1;
    this.beams[b + 4] = 0;
    this.beams[b + 5] = kind;
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
    inp.kind = animKind(a.type);
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

  /** Dotted arc preview (world layer, wind included) + the rubber band under the thumb (screen). */
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
    const w = this.w;
    const over = aim.power >= 0.92 && w.stats.overdraw > 1;
    const col = over ? PALETTE.focus : aim.power < 0.5 ? PALETTE.heal : aim.power < 0.85 ? PALETTE.coin : PALETTE.powerHigh;
    pg.lineStyle(12, PALETTE.ink, 0.45).lineBetween(this.dragX0, this.dragY0, this.dragX, this.dragY);
    pg.lineStyle(over ? 9 : 6, col, 0.9).lineBetween(this.dragX0, this.dragY0, this.dragX, this.dragY);
    pg.fillStyle(col, 0.9).fillCircle(this.dragX, this.dragY, over ? 16 : 12);
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
      const x = o.x + vx * t + 0.5 * w.wind * t * t;
      const y = o.y + vy * t + 0.5 * g * t * t;
      const r = 8 - (i / steps) * 4;
      const a = ready ? 1 - (i / steps) * 0.6 : 0.35;
      ag.fillStyle(PALETTE.ink, a * 0.8).fillCircle(x, y, r + 3);
      ag.fillStyle(over ? PALETTE.focus : PALETTE.white, a).fillCircle(x, y, r);
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
          this.pushX = -Math.cos(e.angle) * (e.over ? 40 : 26);
          this.pushY = -Math.sin(e.angle) * (e.over ? 40 : 26);
          this.punch = e.over ? 0.06 : 0.035;
          if (this.zoom < 0.02) {
            this.zoomFx = e.x;
            this.zoomFy = e.y;
          }
          // muzzle puff fanning forward + a few string sparks (the forged bow's colour from steel up)
          for (let i = 0; i < 5; i++) {
            const a = e.angle + (Math.random() - 0.5) * 1.1;
            const sp = 120 + Math.random() * 160;
            this.fx.spawn('puff', e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, { life: 0.35, drag: 5, scale: 0.35, scaleEnd: 1.0, alpha: 0.9 });
          }
          const glow = bowGlow(this.bowLevel);
          this.fx.sparks(e.x, e.y, 3 + (glow.aura > 0 ? 4 : 0), glow.aura > 0 ? auraColor(this.bowLevel, this.skyT) : PALETTE.gold, 160 + glow.aura * 120);
          if (e.over) this.fx.ring(e.x, e.y, PALETTE.focus, 1.2, 0.25);
          this.aura.flare(e.over ? 1.4 : 1);
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
          this.numbers.damage(e.id, s.x, s.y, e.dmg, e.crit ? PALETTE.crit : e.slowmo ? PALETTE.gold : PALETTE.white, e.slowmo || e.crit);
          if (e.crit) {
            // a crit: a yellow star burst and its own crunch
            audio.playPreset(SFX.crit);
            this.fx.ring(e.x, e.y, PALETTE.crit, 2, 0.3);
            this.fx.sparks(e.x, e.y, 12, PALETTE.crit, 460);
            if (!e.slowmo) this.numbers.word(e.id, s.x, s.y, this.t('hud.crit'), PALETTE.crit, 54);
          }
          if (e.slowmo) {
            this.aura.flare(2);
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
            this.juice.shake(e.ko ? 0.3 : e.crit ? 0.28 : 0.18);
            this.juice.hitStop(e.ko ? 70 : e.crit ? 60 : 40);
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
          const word = e.cause === 'fall' ? this.t('hud.fell') : e.cause === 'burn' ? this.t('hud.burned') : e.cause === 'crush' ? this.t('hud.crushed') : e.cause === 'head' ? null : this.t('hud.ko');
          if (word) this.numbers.word(e.id, s.x, s.y, word, PALETTE.cream, 60);
          this.flyCoins(s.x, s.y, e.coins);
          if (e.enemy === 'boss') {
            this.juice.feedback('large', s.x, s.y, PALETTE.gold);
            this.slowT = 0.3;
            this.zoom = 0.14;
            this.zoomFx = e.x;
            this.zoomFy = e.y;
          }
          break;
        }
        case 'loot': {
          const s = this.toScreen(e.x, e.y);
          audio.playPreset(SFX.loot);
          if (e.kind === 'boss') this.treasure(e.x, e.y, s.x, s.y, e.coins);
          else {
            // an elite's chest pops open
            this.fx.ring(e.x, e.y, PALETTE.gold, 1.8, 0.35);
            const colors = [PALETTE.gold, PALETTE.bubble, PALETTE.pink];
            for (let i = 0; i < 3; i++) this.fx.shards(e.x, e.y - 10, -Math.PI / 2, colors[i]!, 5, 460);
            this.flyCoins(s.x, s.y, e.coins);
            this.callout(this.t('hud.loot'), PALETTE.gold, 64);
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
        case 'plate':
          audio.playPreset(SFX.clang, { pitch: 4 });
          this.fx.sparks(e.x, e.y, 8, PALETTE.bossPlate, 360);
          this.fx.ring(e.x, e.y, PALETTE.bossPlate, 1, 0.2);
          break;
        case 'bomb':
        case 'barrel': {
          audio.playPreset(SFX.boom, { volume: e.t === 'bomb' && e.popped ? 0.7 : 1 });
          // shockwave, fireball, smoke and debris
          const big = e.t === 'barrel' ? 1.5 : 1;
          this.fx.ring(e.x, e.y, PALETTE.fire, 2.6 * big, 0.35);
          this.fx.ring(e.x, e.y, PALETTE.white, 1.6 * big, 0.2);
          this.fx.spawn('puff', e.x, e.y, 0, -30, { life: 0.35, scale: 1.6 * big, scaleEnd: 3.2 * big, tint: PALETTE.fireCore, alpha: 0.95 });
          this.fx.sparks(e.x, e.y, 16, PALETTE.fire, 520);
          this.fx.puffs(e.x, e.y, 8, PALETTE.smoke, 220);
          this.fx.shards(e.x, e.y, -Math.PI / 2, e.t === 'barrel' ? 0xa52a1f : PALETTE.bomb, 8, 420);
          this.juice.shake(e.t === 'barrel' ? 0.7 : e.hurt ? 0.7 : 0.35);
          if (e.t === 'barrel') {
            this.flashA = Math.max(this.flashA, 0.3);
            this.callout(this.t('hud.boom'), PALETTE.fire, e.kills >= 2 ? 84 : 66);
          } else if (e.popped) {
            const s = this.toScreen(e.x, e.y);
            this.float(s.x, s.y - 50, this.t('hud.popped'), { size: 42, color: PALETTE.fireCore });
          }
          break;
        }
        case 'blast':
          audio.playPreset(SFX.boom, { volume: 0.6, pitch: 4 });
          this.fx.ring(e.x, e.y, e.fire ? PALETTE.fire : PALETTE.white, (e.r / 70) * 1.2, 0.3);
          this.fx.sparks(e.x, e.y, 10, e.fire ? PALETTE.fire : PALETTE.cream, 380);
          break;
        case 'orbPop':
          audio.playPreset(SFX.plink);
          this.fx.ring(e.x, e.y, 0xb08bff, 1, 0.2);
          this.fx.sparks(e.x, e.y, 6, 0xd8c8ff, 260);
          break;
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
        case 'healBeam': {
          audio.playPreset(SFX.heal);
          this.beam(e.x0, e.y0, e.x1, e.y1, 0);
          this.fx.sparks(e.x1, e.y1, 6, PALETTE.heal, 160);
          const s = this.toScreen(e.x1, e.y1);
          this.numbers.word(e.to, s.x, s.y - 40, `+${e.amount}`, PALETTE.heal, 44);
          break;
        }
        case 'zap': {
          audio.playPreset(SFX.zap);
          this.beam(e.x0, e.y0, e.x1, e.y1, 1);
          this.fx.sparks(e.x1, e.y1, 6, PALETTE.bubble, 300);
          break;
        }
        case 'caught': {
          audio.playPreset(SFX.caught);
          const s = this.toScreen(e.x, e.y);
          this.numbers.word(e.id, s.x, s.y - 30, this.t('hud.caught'), PALETTE.catcher, 52);
          this.fx.ring(e.x, e.y, PALETTE.white, 0.9, 0.18);
          this.track(e.id).taunt = this.animT;
          this.teach('catcher-caught', this.t('hud.new.catcher'));
          break;
        }
        case 'ward': {
          audio.playPreset(SFX.ward, { pitch: e.up ? 5 : 0 });
          this.fx.ring(e.x, e.y, PALETTE.wardGlow, e.up ? 1.2 : 2, 0.3);
          if (!e.up) {
            this.fx.shards(e.x, e.y, -Math.PI / 2, PALETTE.wardGlow, 10, 360);
            const s = this.toScreen(e.x, e.y);
            this.numbers.word(e.id, s.x, s.y - 40, this.t('hud.wardPop'), PALETTE.wardGlow, 46);
          }
          break;
        }
        case 'bossPhase': {
          audio.playPreset(SFX.roar);
          this.juice.shake(0.7);
          this.flashA = 0.35;
          this.fx.ring(e.x, e.y, PALETTE.danger, 3, 0.45);
          this.track(e.id).land = this.animT;
          this.showBanner(this.t('hud.phase2'), null);
          break;
        }
        case 'summon': {
          audio.playPreset(SFX.summon);
          this.fx.ring(e.x, e.y, PALETTE.imp, 1.8, 0.4);
          this.fx.sparks(e.x, e.y, 12, PALETTE.imp, 300);
          break;
        }
        case 'blink': {
          // the wizard pops out in a puff of stars and back in on its new ledge
          audio.playPreset(SFX.summon, { pitch: 9, volume: 0.7 });
          this.fx.ring(e.x0, e.y0, PALETTE.mage, 1.4, 0.3);
          this.fx.sparks(e.x0, e.y0, 10, PALETTE.mageStar, 280);
          this.fx.ring(e.x1, e.y1, PALETTE.hex, 1.6, 0.35);
          this.fx.sparks(e.x1, e.y1, 8, PALETTE.hex, 220);
          this.track(e.id).land = this.animT;
          break;
        }
        case 'chill':
          audio.playPreset(SFX.plink, { pitch: 8, volume: 0.6 });
          this.fx.ring(e.x, e.y, PALETTE.frost, 1.1, 0.25);
          this.fx.sparks(e.x, e.y, 8, PALETTE.frost, 200);
          break;
        case 'rope': {
          audio.playPreset(SFX.snapRope);
          this.fx.shards(e.x, e.y, -Math.PI / 2, 0xd9b27a, 6, 260);
          if (e.riders > 0) this.callout(this.t('hud.dropped'), PALETTE.cream, 70);
          break;
        }
        case 'rockHit':
          audio.playPreset(SFX.crumble);
          this.juice.shake(0.5);
          this.fx.puffs(e.x, e.y, 6, PALETTE.dust, 200);
          break;
        case 'rockBreak':
          audio.playPreset(SFX.crumble, { volume: 0.8 });
          this.juice.shake(0.3);
          this.fx.shards(e.x, e.y, -Math.PI / 2, this.arena.theme.debris, 12, 420);
          this.fx.puffs(e.x, e.y, 8, PALETTE.dust, 220);
          break;
        case 'multi': {
          this.aura.flare(2);
          audio.playPreset(SFX.stinger, { pitch: e.n * 2 });
          const key = e.n >= 4 ? 'hud.multi4' : e.n === 3 ? 'hud.multi3' : 'hud.multi2';
          this.callout(this.t(key), e.n >= 3 ? PALETTE.pink : PALETTE.gold, 70 + Math.min(3, e.n) * 8);
          this.juice.shake(0.2 + e.n * 0.08);
          break;
        }
        case 'streak':
          this.aura.flare(2.2);
          audio.playPreset(SFX.stinger, { pitch: Math.min(12, e.n / 2) });
          this.callout(this.t('hud.streak', { n: e.n }), PALETTE.heal, 62 + Math.min(20, e.n));
          break;
        case 'chain': {
          // an escalating payoff: higher pitch, bigger text, a golden coin pop
          audio.playPreset(SFX.ping, { pitch: Math.min(12, e.n * 2) });
          const s = this.toScreen(e.x, e.y);
          this.callout(this.t('hud.chain', { n: e.n }), PALETTE.gold, 60 + Math.min(30, e.n * 6));
          this.flyCoins(s.x, s.y, e.coins);
          if (e.n >= 4) this.flashA = Math.max(this.flashA, 0.25);
          break;
        }
        case 'focusReady':
          audio.playPreset(SFX.ready);
          this.callout(this.t('hud.focusReady'), PALETTE.focus, 60);
          break;
        case 'focus':
          if (e.on) {
            this.aura.flare(2.5);
            audio.playPreset(SFX.focus);
            this.flashA = 0.4;
            this.juice.shake(0.3);
            this.slowT = Math.max(this.slowT, 0.18);
            this.callout(this.t('hud.focus'), PALETTE.focus, 90);
          }
          break;
        case 'enemyDraw':
          audio.playPreset(SFX.enemyDraw, { volume: 0.8 });
          break;
        case 'enemyShot':
          this.track(e.id).release = this.animT;
          audio.playPreset(SFX.enemySnap);
          if (e.kind === 'bomb') audio.playPreset(SFX.fuse);
          if (e.kind === 'orb') audio.playPreset(SFX.summon, { pitch: 6, volume: 0.6 });
          break;
        case 'waveStart':
          this.waveFx += 1;
          this.onWaveStart(e);
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
        case 'objective': {
          const msg = e.ok ? this.t('obj.done', { n: e.coins }) : this.t('obj.fail');
          this.time.delayedCall(e.ok ? 1300 : 1200, () => {
            if (this.finished || this.cardUi) return;
            if (e.ok) {
              audio.playPreset(SFX.loot);
              this.callout(msg, PALETTE.heal, 50);
              this.flyCoins(360, 600, e.coins);
            } else this.callout(msg, PALETTE.locked, 40);
          });
          break;
        }
        case 'bonusStart': {
          this.clearTransients();
          audio.play('win', { volume: 0.6 });
          this.showBanner(this.t(`bonus.${e.kind}`), this.t(`bonus.tip.${e.kind}`));
          break;
        }
        case 'bonusHit': {
          const s = this.toScreen(e.x, e.y);
          audio.playPreset(e.bull ? SFX.ping : SFX.tick, { pitch: e.bull ? 4 : 6 });
          this.fx.ring(e.x, e.y, e.kind === 'apple' ? PALETTE.apple : PALETTE.gold, e.bull ? 1.8 : 1.1, 0.22);
          this.fx.shards(e.x, e.y, 0, e.kind === 'apple' ? PALETTE.apple : e.kind === 'rock' ? this.arena.theme.debris : PALETTE.cream, 8, 300);
          if (e.bull) this.numbers.word(-2, s.x, s.y - 30, this.t('bonus.bull'), PALETTE.gold, 50);
          this.flyCoins(s.x, s.y, e.coins);
          break;
        }
        case 'bonusEnd': {
          const col = e.grade === 'gold' ? PALETTE.gold : e.grade === 'silver' ? PALETTE.metalLight : e.grade === 'bronze' ? 0xc98a4b : PALETTE.locked;
          if (e.grade !== 'none') {
            audio.playPreset(SFX.fanfare);
            this.juice.feedback('large', 360, 560, col);
          }
          this.showBanner(this.t(`bonus.${e.grade}`), this.t('bonus.hits', { n: e.hits, c: e.coins }));
          if (e.grade !== 'none') this.flyCoins(360, 560, Math.max(3, Math.round(e.coins / 3)));
          break;
        }
        case 'cards':
          this.treasurePick = e.treasure;
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
  private treasure(x: number, y: number, sx: number, sy: number, coins: number): void {
    const rays = this.add.graphics().setDepth(48);
    rays.setPosition(sx, sy);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays.fillStyle(i % 2 ? PALETTE.gold : PALETTE.cream, 0.5).fillTriangle(0, 0, Math.cos(a - 0.12) * 260, Math.sin(a - 0.12) * 260, Math.cos(a + 0.12) * 260, Math.sin(a + 0.12) * 260);
    }
    rays.setScale(0.2).setAlpha(0.9);
    this.floats.add(rays);
    rays.once(Phaser.GameObjects.Events.DESTROY, () => this.floats.delete(rays));
    this.tweens.add({ targets: rays, scale: 1.2, angle: 70, duration: 1500, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: rays, alpha: 0, delay: 900, duration: 700, onComplete: () => rays.destroy() });
    const colors = [PALETTE.gold, PALETTE.pink, PALETTE.bubble, PALETTE.leaf, PALETTE.white];
    for (let i = 0; i < 5; i++) this.fx.shards(x, y - 20, -Math.PI / 2, colors[i]!, 6, 560);
    this.oyun.audio.play('win');
    this.flyCoins(sx, sy, coins);
    this.callout(this.t('hud.loot'), PALETTE.gold, 80);
  }

  private flyCoins(x: number, y: number, amount: number): void {
    if (amount <= 0) return;
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

  /** A one-time tip the first time something new shows up in this run. */
  private teach(key: string, text: string): void {
    if (this.seen.has(`tip-${key}`)) return;
    this.seen.add(`tip-${key}`);
    const L = this.layout;
    this.float(L.cx, L.top + 420, text, { size: 34, color: PALETTE.cream, rise: 30, duration: 2600 });
  }

  private onWaveStart(e: Extract<GameEvent, { t: 'waveStart' }>): void {
    const audio = this.oyun.audio;
    const wave = e.wave;
    const types = new Set(this.w.enemies.map((x) => x.type));
    let intro: string | null = null;
    for (const t of types) {
      if (t === 'imp' || t === 'boss') continue;
      if (!this.seen.has(t) || (wave > 1 && t !== 'archer' && !this.seen.has(`intro-${t}`) && this.hasIntro(t))) {
        if (this.hasIntro(t)) intro = this.t(`hud.new.${t}`);
        this.seen.add(`intro-${t}`);
      }
      this.seen.add(t);
    }
    // field tips, once a run each: wind, ropes, barrels, rocks
    if (!intro && this.w.wind !== 0 && !this.seen.has('tip-wind')) {
      intro = this.t('hud.windTip');
      this.seen.add('tip-wind');
    }
    if (!intro && this.w.movers.some((m) => m.kind === 'swing') && !this.seen.has('tip-rope')) {
      intro = this.t('hud.ropeTip');
      this.seen.add('tip-rope');
    }
    if (!intro && this.w.props.some((p) => p.active && p.kind === 'barrel') && !this.seen.has('tip-barrel')) {
      intro = this.t('hud.barrelTip');
      this.seen.add('tip-barrel');
    }
    if (!intro && this.w.props.some((p) => p.active && p.kind === 'rock') && !this.seen.has('tip-rock')) {
      intro = this.t('hud.rockTip');
      this.seen.add('tip-rock');
    }
    const obj = e.objective ? this.objectiveText(e.objective, e.limit) : null;
    // a grown field (chapter 4, and again chapter 6): said once a run, after the banner
    if (this.w.span > 1) {
      const key = `grow-${this.w.span}`;
      this.time.delayedCall(1700, () => {
        if (!this.finished) this.teach(key, this.t('hud.fieldGrows'));
      });
    }
    if (e.boss) {
      this.showBanner(this.t(`boss.${e.boss}`), this.t(`boss.tip.${e.boss}`));
    } else if (e.stage === 1 && wave > 1 && !stageOf(wave).endless) {
      // a new chapter: its name over the cross-fade into the new world
      audio.play('win', { volume: 0.5 });
      this.showBanner(this.chapterName(e.chapter), this.t('hud.chapterNo', { n: e.chapter + 1 }));
    } else {
      audio.playPreset(SFX.drum);
      if (wave > 1 || this.data0.revive || this.w.startChapter > 0) this.showBanner(e.elite ? this.t('hud.elite') : this.waveLabel(), intro ?? obj);
    }
    // landing thumps for archers dropping in (the first wave's archers were already standing at the title)
    if (wave > 1) this.time.delayedCall(560, () => {
      if (this.finished) return;
      for (const x of this.w.enemies) {
        if (x.type === 'boss' || x.type === 'elite') this.juice.shake(0.35);
        this.fx.puffs(x.anchorX, x.anchorY + 52 * x.scale, 4, PALETTE.white, 140);
      }
      if (this.w.enemies.length) audio.playPreset(SFX.slam, { volume: 0.6 });
    });
    this.oyun.platform.track('wave_start', { wave, chapter: e.chapter, stage: e.stage });
  }

  private hasIntro(t: string): boolean {
    return t === 'shield' || t === 'jumper' || t === 'bomber' || t === 'healer' || t === 'cover' || t === 'catcher' || t === 'ward' || t === 'elite' || t === 'volley' || t === 'mage';
  }

  /** Rising text that is tracked, so clearTransients can remove it before an overlay opens. */
  private float(x: number, y: number, text: string, opts: Parameters<OyunScene['juice']['floatText']>[3]): void {
    const t = this.juice.floatText(x, y, text, opts);
    this.floats.add(t);
    t.once(Phaser.GameObjects.Events.DESTROY, () => this.floats.delete(t));
  }

  /** A big punchy callout in the upper sky (multi-kills, streaks, chains, focus). */
  private callout(text: string, color: number, size: number): void {
    if (this.cardUi || this.finished) return;
    const L = this.layout;
    const t = label(this, L.cx, L.top + 450, text, { size, color, wrap: 660 }).setStroke(cssColor(PALETTE.ink), Math.round(size / 5)).setDepth(82);
    this.floats.add(t);
    t.once(Phaser.GameObjects.Events.DESTROY, () => this.floats.delete(t));
    t.setScale(2.4).setAngle(-6 + Math.random() * 12);
    this.tweens.add({ targets: t, scale: 1, angle: 0, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 70, delay: 700, duration: 380, onComplete: () => t.destroy() });
  }

  /** Achievements and other good news: a toast at the top, one at a time. */
  private queueToast(title: string, sub: string, color: number): void {
    this.toasts.push({ title, sub, color });
    if (!this.toastBusy) this.nextToast();
  }

  private nextToast(): void {
    const n = this.toasts.shift();
    if (!n || this.finished) {
      this.toastBusy = false;
      return;
    }
    this.toastBusy = true;
    const L = this.layout;
    const c = this.add.container(L.cx, L.top - 80).setDepth(95);
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.ink, 0.92).fillRoundedRect(-300, -48, 600, 96, 28);
    bg.lineStyle(4, n.color, 1).strokeRoundedRect(-300, -48, 600, 96, 28);
    const t1 = label(this, 0, -18, n.title, { size: 30, color: n.color });
    const t2 = label(this, 0, 20, n.sub, { size: 28, color: PALETTE.cream, wrap: 560 });
    c.add([bg, t1, t2]);
    this.floats.add(c);
    c.once(Phaser.GameObjects.Events.DESTROY, () => this.floats.delete(c));
    this.oyun.audio.playPreset(SFX.fanfare, { volume: 0.6 });
    this.tweens.add({ targets: c, y: L.top + 62, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: c,
      y: L.top - 80,
      delay: 1900,
      duration: 260,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        c.destroy();
        this.nextToast();
      },
    });
  }

  /**
   * Remove every transient text (wave banners, damage numbers, hit words, floating labels,
   * callouts, toasts) at once. Called before the card pick, the pause menu and the result
   * screen, so nothing half-faded can sit behind them.
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
    this.toastBusy = false;
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
    const size = text.length > 13 ? 56 : 76;
    const t = label(this, 0, 0, text, { size, color: PALETTE.cream, wrap: 680 }).setStroke(cssColor(PALETTE.ink), size > 60 ? 18 : 14);
    c.add(t);
    if (sub) {
      const st = label(this, 0, 0, sub, { size: 34, color: PALETTE.white, wrap: 600 });
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
    this.bannerUntil = performance.now() + (sub ? 2900 : 1550);
    this.tweens.add({ targets: c, alpha: 0, y: c.y - 60, delay: sub ? 2300 : 950, duration: 300, onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ cards

  private openCards(): void {
    if (this.cardUi) return;
    this.clearTransients();
    this.picking = false;
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(90);
    const scrim = this.add.rectangle(L.cx, L.cy, W, H * 2, PALETTE.ink, 0.62).setInteractive();
    c.add(scrim);
    const title = label(this, L.cx, L.top + 170, this.treasurePick ? this.t('cards.treasure') : this.t('cards.title'), { size: 64, color: this.treasurePick ? PALETTE.gold : PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 14);
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
    const ch = n > 4 ? 150 : n > 3 ? 168 : 196;
    const gap = n > 3 ? 14 : 22;
    const startY = L.top + 280 + ch / 2;
    this.cardRects = {};
    offer.forEach((id, i) => {
      const y = startY + i * (ch + gap);
      const card = this.add.container(L.cx, y);
      card.setData('card', true);
      const g = this.add.graphics();
      const cw = 620;
      const syn = synergyFor(this.w.cards, id);
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(-cw / 2 - 6, -ch / 2 - 6 + 8, cw + 12, ch + 12, 30);
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(-cw / 2 - 6, -ch / 2 - 6, cw + 12, ch + 12, 30);
      g.fillStyle(syn ? PALETTE.focus : PALETTE.cardEdge, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 26);
      g.fillStyle(PALETTE.card, 1).fillRoundedRect(-cw / 2 + 8, -ch / 2 + 8, cw - 16, ch - 16, 20);
      g.fillStyle(PALETTE.cardIcon, 1).fillCircle(-cw / 2 + 96, 0, Math.min(70, ch / 2 - 14));
      // the icon lives in its own graphics so it can sway, squash on press and spin on pick
      const icon = this.add.graphics().setPosition(-cw / 2 + 96, 0);
      drawCardIcon(icon, id, 0, 0);
      if (ch < 180) icon.setScale(0.85);
      card.setData('icon', icon);
      const held = countCards(this.w.cards, id);
      // name and description measured and stacked as one block, centred in the card
      const name = label(this, -cw / 2 + 190, 0, this.t(`card.${id}.name`), { size: 44, color: PALETTE.ink }).setOrigin(0, 0);
      const descText = syn ? `${this.t(`card.${id}.desc`)}\n${this.t('cards.synergy', { s: this.t(`syn.${syn}`) })}` : this.t(`card.${id}.desc`);
      const desc = label(this, -cw / 2 + 190, 0, descText, { size: 32, color: PALETTE.inkSoft, wrap: 400, align: 'left' }).setOrigin(0, 0);
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
    this.extraBtn = button(this, L.cx + 165, by, this.t('cards.extra'), () => void this.onExtra(), { width: 300, height: 100, fontSize: 38, ad: true });
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
    const syn = synergyFor(this.w.cards, this.w.offer[i]);
    if (syn) this.oyun.audio.playPreset(SFX.fanfare, { volume: 0.7 });
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
      if (syn) this.callout(this.t('cards.synergy', { s: this.t(`syn.${syn}`) }), PALETTE.focus, 56);
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
      if (r === 'unavailable' && this.extraBtn) toast(this, this.t('core.noAd'), { position: 'bottom' });
      return;
    }
    this.oyun.platform.track('reward_claimed', { placement: 'extra_card' });
    this.buildCardFaces();
  }

  // ------------------------------------------------------------------ end of run

  private finish(): void {
    if (this.finished) return;
    this.clearTransients();
    this.toasts = [];
    this.finished = true;
    const w = this.w;
    this.oyun.platform.gameplayStop();
    this.oyun.platform.track('run_end', { wave: w.wave, coins: w.run.coins, kos: w.run.kos, daily: this.daily, chapter: w.chapter });
    this.bank(w.wave);
    if (this.daily) {
      const key = this.todayKey();
      gameSave(this.oyun).update((d) => {
        this.dailyCoins = bankDailyChallenge(d, key, w.wave);
        this.dailyStreak = d.dailyStreak;
        if (this.dailyCoins > 0 && w.bank) unlockFeats(d, null, w.bank);
      });
    }
    const save = gameSave(this.oyun).data;
    const outcome = w.bank ? runOutcome(save, w.bank, w.wave) : { best: save.best, newBest: false };
    session.finishedRuns += 1;
    pendingWorld = w;
    const p = stageOf(w.wave);
    const result: RunResult = {
      wave: w.wave,
      coins: w.run.coins,
      kos: w.run.kos,
      headshots: w.run.headshots,
      best: outcome.best,
      newBest: outcome.newBest,
      daily: this.daily,
      dailyKey: this.todayKey(),
      chapter: p.chapter,
      stage: p.stage,
      feats: [...(w.bank?.feats ?? [])],
      records: [...this.recordsBeaten],
      dailyCoins: this.dailyCoins,
      dailyStreak: this.dailyStreak,
      startRank: w.bank?.startRank ?? save.rank,
    };
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
    const save = gameSave(this.oyun).data;
    const score = progressScore(save);
    return {
      phase: w.phase,
      wave: w.wave,
      chapter: w.chapter,
      stage: w.stage,
      level: r(w.level),
      wind: r(w.wind),
      health: r(w.player.hp),
      maxHealth: w.player.maxHp,
      coins: w.run.coins,
      savedCoins: save.coins,
      best: save.best,
      bow: { level: save.bow.level, heat: save.bow.heat, inRun: this.bowLevel },
      score: score.total,
      scoreParts: { ...score },
      rank: RANKS[rankOf(score.total)]!.id,
      feats: [...save.feats],
      /** coins paid by achievements (they are banked on top of run coins) */
      featCoins: save.feats.reduce((n, id) => n + (FEATS.find((f) => f.id === id)?.coins ?? 0), 0),
      focus: r(w.focus),
      focusT: r(w.focusT),
      bonus: w.bonus ? { kind: w.bonus.kind, t: r(w.bonus.t), hits: w.bonus.hits, grade: w.bonus.grade } : null,
      objective: w.objective?.kind ?? null,
      bannerUp: performance.now() < this.bannerUntil,
      banner: [...this.banners].map((c) => (c.list[0] as Phaser.GameObjects.Text).text).join('|'),
      waveLabel: this.waveText.visible ? this.waveText.text : '',
      movers: w.movers.length,
      props: w.props.filter((p) => p.active).length,
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
      forge: () => this.forgeBtn?.fire(),
      ranks: () => this.ranksBtn?.fire(),
      chapter: () => this.chapterBtn?.fire(),
      unleash: () => this.onUnleash(),
      'perf-reset': () => {
        this.frameMs = [];
        this.stepMs = [];
      },
      // capture aids (screenshots of later waves, bonus rounds and card looks); never used by the gate
      'jump-wave': (p: unknown) => {
        if (this.w.phase === 'title') this.release(-1.45, 0.2);
        const n = typeof p === 'object' && p !== null ? (p as { wave: number; drop?: boolean }) : { wave: Number(p) || 1 };
        jumpToWave(this.w, Math.max(1, n.wave), n.drop === true);
        this.tracks.clear();
      },
      bonus: (p: unknown) => {
        if (this.w.phase === 'title') this.release(-1.45, 0.2);
        startBonusNow(this.w, (String(p) as BonusKind) || 'gallery');
      },
      'fill-focus': () => {
        this.w.focus = 1;
      },
      'bow-level': (p: unknown) => {
        this.bowLevel = Number(p) || 0;
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
      toast: () => this.queueToast(this.t('feat.title'), `${this.t('feat.chain3.name')} · +40`, PALETTE.gold),
      aim: (p: unknown) => {
        const { angle, power } = p as { angle: number; power: number };
        aimAt(this.w, angle, power);
      },
      'show-result': (p: unknown) => {
        const save = gameSave(this.oyun).data;
        const extra = (p ?? {}) as Partial<RunResult>;
        this.goTo(SCENES.result, { wave: this.w.wave, coins: 42, kos: 9, headshots: 3, best: save.best, newBest: false, daily: false, dailyKey: this.todayKey(), chapter: this.w.chapter, stage: this.w.stage, feats: [], records: [], dailyCoins: 0, dailyStreak: 0, startRank: save.rank, ...extra });
      },
    };
  }
}

/** The animation layer knows six body languages; new enemy types borrow the nearest one. */
function animKind(t: Archer['type']): Kind {
  switch (t) {
    case 'healer':
    case 'ward':
    case 'mage':
      return 'shield';
    case 'cover':
    case 'catcher':
    case 'imp':
    case 'volley':
    case 'armored':
      return 'archer';
    case 'elite':
      return 'boss';
    default:
      return t;
  }
}

function drawHeartAt(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
  g.fillStyle(PALETTE.ink, 1).fillCircle(x - 11 * s, y - 6 * s, 14 * s).fillCircle(x + 11 * s, y - 6 * s, 14 * s).fillTriangle(x - 24 * s, y, x + 24 * s, y, x, y + 25 * s);
  g.fillStyle(PALETTE.hp, 1).fillCircle(x - 11 * s, y - 6 * s, 10 * s).fillCircle(x + 11 * s, y - 6 * s, 10 * s).fillTriangle(x - 19 * s, y - 2 * s, x + 19 * s, y - 2 * s, x, y + 19 * s);
  g.fillStyle(PALETTE.white, 0.6).fillCircle(x - 14 * s, y - 10 * s, 3.5 * s);
}
