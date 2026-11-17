/**
 * The whole game loop in one scene, so nothing ever stands between the player and a run:
 *   title (live shaft behind the logo) → press anywhere → playing (same frame)
 *   death → freeze 80 ms → shatter → press (from 260 ms) → playing again (same frame)
 *   finish → slow-motion burst → press → next level
 * The sim (src/sim) runs at a fixed 120 Hz; this scene feeds it the hold state, draws the
 * interpolated result and fires the juice. Test actions: hold, autopilot, start, tap, pause,
 * home, continue, double, levels, skins, endless, daily.
 */
import { button, followsRealTime, iconButton, MAX_FRAME_MS, muteButton, OyunScene, realTimeDelta, toast, type Button, type IconButton } from '@oyun/core';
import Phaser from 'phaser';
import { Music } from '../audio/Music';
import { HoldInput } from '../input/HoldInput';
import { fixTouchCancel } from '../input/touchCancelFix';
import { Backdrop } from '../render/Backdrop';
import { ensureCanvasArt } from '../render/canvasArt';
import { ShaftView } from '../render/Shaft';
import { Trail } from '../render/Trail';
import { gameSave } from '../save';
import { BEAT_PX, DT, MINI_R, SPARK_R, START_X } from '../sim/constants';
import { EdgeQueue } from '../sim/input';
import { buildEndless, dailyKey, dailySeed } from '../sim/endless';
import { buildLevel, LEVEL_COUNT, levelInfo } from '../sim/levels';
import { endlessUnlocked, levelToPlay, recordDaily, recordEndless, recordLevelRun, shouldShowInterstitial } from '../sim/progress';
import { RunSim } from '../sim/run';
import { SHAPES, TRAILS } from '../sim/skins';
import { K_REF, prepare, solve } from '../sim/solver';
import { sdf, segmentAt, wallXAt, type GateKind, type Track } from '../sim/track';
import { ENDLESS_THEMES, GATE_COLORS, PALETTE, PALETTES, type Palette } from '../textures';
import { bigText, fitText, IconTile } from '../ui';
import { SCENES } from './keys';

export type Mode = 'level' | 'endless' | 'daily';
type Phase = 'title' | 'ready' | 'playing' | 'resume' | 'dead' | 'finishing' | 'finished';

export interface GameStart {
  mode?: Mode;
  level?: number;
  /** 'title' shows the logo over the live shaft; 'ready' waits for the first press. */
  phase?: 'title' | 'ready';
}

/** Screen y of the spark (it climbs; the shaft scrolls down past it). */
const SPARK_Y = 930;
const DT_MS = DT * 1000;
const FREEZE_MS = 80;
const RETRY_LOCK_MS = 260;
const FINISH_SLOWMO_MS = 1200;
const NEXT_LOCK_MS = 700;
/**
 * Longest stretch of real time one frame may advance the run (ms). A hitch or a return from the
 * background never fast-forwards the spark further than this. Under automation core's 200 ms
 * cap is used, because the build machine renders at ~5 fps and game time must follow the clock.
 */
const PLAYER_FRAME_CAP_MS = 100;

function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Rolling frame-time statistics (fixed buffer). */
class FrameStats {
  private readonly buf = new Float32Array(240);
  private n = 0;
  private i = 0;
  add(ms: number): void {
    this.buf[this.i] = ms;
    this.i = (this.i + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;
  }
  summary(): { avg: number; p95: number; max: number; n: number } {
    if (!this.n) return { avg: 0, p95: 0, max: 0, n: 0 };
    const a = Array.from(this.buf.subarray(0, this.n)).sort((x, y) => x - y);
    const avg = a.reduce((s, v) => s + v, 0) / a.length;
    const r = (v: number): number => Math.round(v * 100) / 100;
    return { avg: r(avg), p95: r(a[Math.floor(a.length * 0.95)] ?? 0), max: r(a[a.length - 1] ?? 0), n: this.n };
  }
}

export class GameScene extends OyunScene {
  protected override autoPause = true;

  private mode: Mode = 'level';
  private level = 1;
  private track!: Track;
  private pal!: Palette;
  private sim!: RunSim;
  private phase: Phase = 'title';
  private attempts = 0;
  private acc = 0;
  private prevX = START_X;
  private prevY = 0;
  private rx = START_X;
  private ry = 0;
  private lastRy = 0;
  private held = false;
  /** Press/release edges with their event times, applied per tick. */
  private readonly edges = new EdgeQueue();
  /** performance.now() of the last frame the run advanced to (or of the press that started it). */
  private lastFrameAt = 0;
  private frameCapMs = PLAYER_FRAME_CAP_MS;
  /** Ticks this run that ran with the input held (diagnostics / tests). */
  private heldTicks = 0;
  /** Ring log of the last ticks: end time and input (test hook: proves when an edge applied). */
  private readonly tickTimes = new Float64Array(32);
  private readonly tickHeld = new Uint8Array(32);
  private readonly tickIds = new Int32Array(32);
  private tickLogAt = 0;
  /** Bumped on every run start and death, so async ad callbacks can tell they are stale. */
  private attemptId = 0;
  private finishId = 0;
  private advancing = false;
  private leaving = false;
  private autopilot = false;
  private plan: Uint8Array | null = null;
  private dailyDate = '';
  private endlessSeed = 1;
  private endlessSegments = 160;
  /** First-run cues ("let go!", "hold!"): 0 none yet, 1 let-go shown, 2 hold shown (done). */
  private tutorialStep = -1;
  private planEnd = 0;
  private lastAutoSwitch = 0;

  // timing (performance.now)
  private deathAt = 0;
  private shattered = false;
  private finishAt = 0;
  private retryLatency = -1;
  private pressAt = 0;
  private idleY = 0;
  private squash = 0;
  private flashA = 0;
  private continueUsed = false;
  private gateSnap: RunSim | null = null;
  private runGems = 0;
  private newBest = false;
  private lastPct = -1;
  private lastEdge = 0;
  private hintShown = false;
  private endlessThemeIdx = -1;
  private doubled = false;
  private gemsGainedThisFinish = 0;
  /** Best percentage when this attempt started (to celebrate passing it), -1 once passed. */
  private runBest = -1;

  // view
  private world!: Phaser.GameObjects.Container;
  private shaft!: ShaftView;
  private backdrop!: Backdrop;
  private trail!: Trail;
  private sparkGlow!: Phaser.GameObjects.Image;
  private spark!: Phaser.GameObjects.Image;
  private sparkHalo!: Phaser.GameObjects.Image;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flash!: Phaser.GameObjects.Image;
  private ringBurst!: Phaser.GameObjects.Image;

  // HUD
  private hud!: Phaser.GameObjects.Container;
  private pctText!: Phaser.GameObjects.Text;
  private barBg!: Phaser.GameObjects.Graphics;
  private barFill!: Phaser.GameObjects.Image;
  private barBest!: Phaser.GameObjects.Rectangle;
  private barW = 420;
  private chip!: Phaser.GameObjects.Text;
  private attemptText!: Phaser.GameObjects.Text;
  private gemSlots: Phaser.GameObjects.Image[] = [];
  private edgeText!: Phaser.GameObjects.Text;
  private gateText!: Phaser.GameObjects.Text;
  private gateSub!: Phaser.GameObjects.Text;
  private flipTag!: Phaser.GameObjects.Text;
  private cue!: Phaser.GameObjects.Text;
  private pauseBtn!: IconButton;

  // overlays
  private titleUi!: Phaser.GameObjects.Container;
  private readyUi!: Phaser.GameObjects.Container;
  private resumeUi!: Phaser.GameObjects.Container;
  private readyTitle!: Phaser.GameObjects.Text;
  private readySub!: Phaser.GameObjects.Text;
  private deadUi!: Phaser.GameObjects.Container;
  private deadPct!: Phaser.GameObjects.Text;
  private deadBest!: Phaser.GameObjects.Text;
  private deadBadge!: Phaser.GameObjects.Text;
  private deadAttempt!: Phaser.GameObjects.Text;
  private deadBarBg!: Phaser.GameObjects.Graphics;
  private deadBarBest!: Phaser.GameObjects.Image;
  private deadBarNow!: Phaser.GameObjects.Image;
  private deadBarMark!: Phaser.GameObjects.Text;
  private deadBarW = 560;
  private deadRetry!: Phaser.GameObjects.Text;
  private continueBtn!: Button;
  private finishUi!: Phaser.GameObjects.Container;
  private finishTitle!: Phaser.GameObjects.Text;
  private finishGems!: Phaser.GameObjects.Text;
  private finishNext!: Phaser.GameObjects.Text;
  private finishStyle!: Phaser.GameObjects.Text;
  private doubleBtn!: Button;
  private hint!: Phaser.GameObjects.Container;
  private titleTiles: IconTile[] = [];
  private homeTile!: IconTile;
  private endlessTile!: IconTile;
  private titleLevel!: Phaser.GameObjects.Text;
  private titleBest!: Phaser.GameObjects.Text;
  private muteBtn!: IconButton;

  private input2!: HoldInput;
  private music!: Music;
  private readonly frameJs = new FrameStats();
  private readonly frameUpdate = new FrameStats();
  private stepT0 = 0;

  constructor() {
    super(SCENES.game);
  }

  // ───────────────────────────────────────────────────────────── create

  create(data: GameStart = {}): void {
    ensureCanvasArt(this);
    const save = gameSave(this.oyun).data;
    this.mode = data.mode ?? 'level';
    this.level = data.level ?? levelToPlay(save);
    this.phase = data.phase ?? 'title';
    this.autopilot = false;
    this.plan = null;
    this.held = false;
    this.titleTiles = [];
    this.gemSlots = [];
    this.endlessThemeIdx = -1;
    this.advancing = false;
    this.leaving = false;
    this.edges.reset(false);
    this.lastFrameAt = performance.now();
    this.frameCapMs = followsRealTime({ webdriver: navigator.webdriver, test: this.oyun.test.enabled }) ? MAX_FRAME_MS : PLAYER_FRAME_CAP_MS;
    this.tutorialStep = save.tutorial ? -1 : 0;
    // Test mode only: tests read the loop (to emulate Phaser's unfocused clamp, sleep a frame).
    if (this.oyun.test.enabled) Object.assign(window, { __kivilcimGame: this.game });

    const { width, height } = this.layout;
    this.pal = PALETTES[0]!;
    this.backdrop = new Backdrop(this, this.pal, width, height);
    this.world = this.add.container(0, SPARK_Y).setDepth(0);
    this.shaft = new ShaftView(this, this.world);
    this.shaft.gateLabel = (k: GateKind) => this.t(`gate.${k}`);
    this.shaft.finishLabel = this.t('gate.finish');
    this.trail = new Trail(this.add.graphics());
    this.world.add(this.trail.g);

    this.embers = this.add.particles(0, 0, 'oyun-dot', {
      lifespan: { min: 260, max: 520 },
      speed: { min: 10, max: 70 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.9, end: 0 },
      frequency: 24,
      quantity: 1,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.sparks = this.add.particles(0, 0, 'oyun-dot', {
      lifespan: { min: 220, max: 460 },
      speed: { min: 180, max: 520 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      angle: { min: 0, max: 360 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.shards = this.add.particles(0, 0, 'shard', {
      lifespan: { min: 600, max: 1100 },
      speed: { min: 260, max: 820 },
      scale: { start: 1.3, end: 0.2 },
      alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 720 },
      angle: { min: 0, max: 360 },
      gravityY: 900,
      emitting: false,
    });
    this.stars = this.add.particles(0, 0, 'oyun-star', {
      lifespan: { min: 400, max: 800 },
      speed: { min: 120, max: 420 },
      scale: { start: 0.9, end: 0 },
      rotate: { start: 0, end: 360 },
      angle: { min: 0, max: 360 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.world.add([this.embers, this.sparks, this.shards, this.stars]);

    this.sparkGlow = this.add.image(0, SPARK_Y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(10);
    this.sparkHalo = this.add.image(0, SPARK_Y, 'bg-ring').setBlendMode(Phaser.BlendModes.ADD).setDepth(10).setScale(0.22).setAlpha(0);
    this.spark = this.add.image(0, SPARK_Y, 'spark-0').setDepth(11);
    this.ringBurst = this.add.image(0, 0, 'ring-burst').setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(12);
    this.confetti = this.add
      .particles(0, 0, 'confetti', {
        lifespan: { min: 900, max: 1600 },
        speed: { min: 300, max: 900 },
        angle: { min: 200, max: 340 },
        gravityY: 1100,
        rotate: { min: 0, max: 360 },
        scale: { min: 0.7, max: 1.4 },
        tint: [0xffe14d, 0x3ff6ff, 0xff4fd8, 0x9dff3a, 0xffffff],
        emitting: false,
      })
      .setDepth(150);
    this.flash = this.add.image(0, 0, 'flash').setOrigin(0, 0).setDisplaySize(width, height).setDepth(140).setAlpha(0);

    this.buildHud();
    this.buildTitle();
    this.buildReady();
    this.buildResume();
    this.buildDead();
    this.buildFinish();
    this.buildHint();

    fixTouchCancel(this.game);
    this.music = new Music(this.oyun.audio);
    this.input2 = new HoldInput(this.game.canvas, { width, height }, {
      onPress: (x, y, time) => this.onPress(x, y, time),
      onRelease: (time) => this.onRelease(time),
      isUi: (x, y) => this.isUi(x, y),
    });
    const onPre = (): void => {
      this.stepT0 = performance.now();
    };
    const onPost = (): void => {
      if (this.phase === 'playing') this.frameJs.add(performance.now() - this.stepT0);
    };
    this.game.events.on(Phaser.Core.Events.PRE_STEP, onPre);
    this.game.events.on(Phaser.Core.Events.POST_RENDER, onPost);
    const onResume = (): void => this.onSceneResume();
    const onPause = (): void => this.music.stop(false);
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input2.destroy();
      this.shaft.destroy();
      this.music.stop(false);
      this.game.events.off(Phaser.Core.Events.PRE_STEP, onPre);
      this.game.events.off(Phaser.Core.Events.POST_RENDER, onPost);
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.events.off(Phaser.Scenes.Events.PAUSE, onPause);
    });

    this.loadTrack();
    this.applySkin();
    this.resetRun();
    this.showPhase(this.phase);
  }

  // ───────────────────────────────────────────────────────────── building UI

  private buildHud(): void {
    const L = this.layout;
    this.hud = this.add.container(0, 0).setDepth(100);
    const cx = L.cx;
    const top = L.top;
    const pill = this.add.graphics();
    pill.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(L.left + 22, top + 34, 132, 60, 30);
    pill.lineStyle(4, 0xffffff, 0.85).strokeRoundedRect(L.left + 22, top + 34, 132, 60, 30);
    this.chip = bigText(this, L.left + 88, top + 63, '', 34).setOrigin(0.5);
    this.pctText = bigText(this, cx, top + 58, '0%', 62);
    this.barW = Math.min(440, L.width - 280);
    this.barBg = this.add.graphics();
    this.barBg.fillStyle(PALETTE.ink, 0.55).fillRoundedRect(cx - this.barW / 2 - 6, top + 104, this.barW + 12, 30, 15);
    this.barFill = this.add.image(cx - this.barW / 2, top + 119, 'flash').setOrigin(0, 0.5).setDisplaySize(1, 18);
    this.barBest = this.add.rectangle(cx - this.barW / 2, top + 119, 6, 30, 0xffffff).setOrigin(0.5);
    this.attemptText = bigText(this, cx, top + 210, '', 30);
    for (let i = 0; i < 3; i++) {
      this.gemSlots.push(this.add.image(cx + (i - 1) * 50, top + 164, 'gem-empty').setScale(0.62));
    }
    // Banners live in the top band under the HUD (out of the flight path), small and brief.
    this.edgeText = bigText(this, cx, SPARK_Y + 122, '', 34, PALETTE.gold).setAlpha(0);
    this.gateText = bigText(this, cx, top + 262, '', 58).setAlpha(0);
    this.gateSub = bigText(this, cx, top + 318, '', 30).setAlpha(0);
    // While controls are swapped, a tag rides under the spark.
    this.flipTag = bigText(this, cx, SPARK_Y + 58, this.t('hud.flipped'), 26, GATE_COLORS.flip).setVisible(false);
    this.cue = bigText(this, cx, SPARK_Y - 190, '', 84, PALETTE.gold).setAlpha(0);
    this.hud.add([pill, this.chip, this.barBg, this.barFill, this.barBest, this.pctText, this.attemptText, ...this.gemSlots, this.edgeText, this.gateText, this.gateSub, this.flipTag, this.cue]);
    this.pauseBtn = iconButton(this, L.right - 70, top + 70, 'pause', () => this.openPauseMenu());
    this.pauseBtn.setDepth(101);
  }

  private buildTitle(): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(200);
    const logo = bigText(this, L.cx, L.top + 250, this.t('title.logo'), 112, PALETTE.white).setAngle(-5);
    logo.setStroke('#14062b', 22);
    const grad = logo.context.createLinearGradient(0, 20, 0, logo.height - 20);
    grad.addColorStop(0, '#fffbe0');
    grad.addColorStop(0.45, '#ffe14d');
    grad.addColorStop(1, '#ff7a1a');
    logo.setFill(grad);
    const logoGlow = this.add.image(L.cx, L.top + 250, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(760, 300).setAlpha(0.55);
    this.tweens.add({ targets: logo, scale: 1.05, yoyo: true, repeat: -1, duration: 470, ease: 'Sine.easeInOut' });
    const tag = fitText(bigText(this, L.cx, L.top + 360, this.t('title.tagline'), 36), L.width - 140);
    this.titleLevel = bigText(this, L.cx, L.cy + 60, '', 48, PALETTE.gold);
    const tap = fitText(bigText(this, L.cx, L.cy + 150, this.t('title.tap'), 66), L.width - 170);
    this.tweens.add({ targets: tap, scale: 1.1, alpha: 0.75, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
    this.titleBest = bigText(this, L.cx, L.cy + 230, '', 32);
    c.add([logoGlow, logo, tag, this.titleLevel, tap, this.titleBest]);

    const y = L.bottom - 150;
    const xs = [-1.5, -0.5, 0.5, 1.5].map((k) => L.cx + k * 158);
    const levels = new IconTile(this, xs[0]!, y, 'ic-levels', this.t('title.levels'), () => this.leave(SCENES.levels), { color: 0x2a6bff });
    this.endlessTile = new IconTile(this, xs[1]!, y, 'ic-endless', this.t('title.endless'), () => this.openEndless(), { color: 0xff3d8b });
    const daily = new IconTile(this, xs[2]!, y, 'ic-daily', this.t('title.daily'), () => this.openDaily(), { color: 0xff8a1a });
    const skins = new IconTile(this, xs[3]!, y, 'ic-skins', this.t('title.skins'), () => this.leave(SCENES.skins), { color: 0x16b886 });
    this.titleTiles = [levels, this.endlessTile, daily, skins];
    c.add(this.titleTiles);
    this.titleUi = c;
    this.muteBtn = muteButton(this, L.right - 70, L.top + 70);
    this.muteBtn.setDepth(201);
    this.homeTile = new IconTile(this, L.left + 70, L.top + 70, 'ic-back', null, () => this.goHome(), { radius: 46, color: PALETTE.ui });
    this.homeTile.setDepth(201);
  }

  private buildReady(): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(200);
    this.readyTitle = bigText(this, L.cx, L.top + 300, '', 84);
    this.readySub = bigText(this, L.cx, L.top + 390, '', 38, PALETTE.gold);
    const tap = fitText(bigText(this, L.cx, L.cy + 40, this.t('ready.tap'), 62), L.width - 170);
    this.tweens.add({ targets: tap, scale: 1.1, alpha: 0.75, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
    const tag = fitText(bigText(this, L.cx, L.cy + 120, this.t('title.tagline'), 34), L.width - 140);
    c.add([this.readyTitle, this.readySub, tap, tag]);
    this.readyUi = c;
  }

  private buildResume(): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(200);
    const tap = fitText(bigText(this, L.cx, L.cy + 40, this.t('resume.tap'), 62), L.width - 170);
    this.tweens.add({ targets: tap, scale: 1.1, alpha: 0.75, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
    const sub = fitText(bigText(this, L.cx, L.cy + 120, this.t('resume.sub'), 34), L.width - 140);
    c.add([tap, sub]);
    this.resumeUi = c;
  }

  private buildDead(): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(200);
    const band = this.add.graphics();
    band.fillStyle(PALETTE.ink, 0.72).fillRect(0, L.cy - 480, L.width, 600);
    band.fillStyle(0xffffff, 0.95).fillRect(0, L.cy - 486, L.width, 8).fillRect(0, L.cy + 120, L.width, 8);
    this.deadBadge = bigText(this, L.cx, L.cy - 420, this.t('dead.newBest'), 46, PALETTE.gold);
    this.deadPct = bigText(this, L.cx, L.cy - 280, '0%', 170);
    // "You got further": this attempt against the best, on one bar.
    const bw = L.width - 160;
    this.deadBarBg = this.add.graphics();
    this.deadBarBg.fillStyle(0x000000, 0.45).fillRoundedRect(L.cx - bw / 2 - 6, L.cy - 140, bw + 12, 44, 22);
    this.deadBarBest = this.add.image(L.cx - bw / 2, L.cy - 118, 'flash').setOrigin(0, 0.5).setTint(0xffffff).setAlpha(0.35);
    this.deadBarNow = this.add.image(L.cx - bw / 2, L.cy - 118, 'flash').setOrigin(0, 0.5);
    this.deadBarMark = bigText(this, L.cx, L.cy - 70, '', 34);
    this.deadBarW = bw;
    this.deadBest = bigText(this, L.cx, L.cy - 20, '', 40);
    this.deadAttempt = bigText(this, L.cx, L.cy + 50, '', 32);
    this.deadRetry = fitText(bigText(this, L.cx, L.cy + 230, this.t('dead.retry'), 66), L.width - 120);
    this.tweens.add({ targets: this.deadRetry, scale: 1.1, yoyo: true, repeat: -1, duration: 380, ease: 'Sine.easeInOut' });
    this.continueBtn = button(this, L.cx, L.bottom - 150, this.t('dead.continue'), () => void this.continueRun(), { width: 380, height: 104, fontSize: 40, variant: 'secondary' });
    const adIcon = this.add.image(-150, 0, 'ic-ad').setScale(0.6);
    this.continueBtn.add(adIcon);
    c.add([band, this.deadBadge, this.deadPct, this.deadBarBg, this.deadBarBest, this.deadBarNow, this.deadBarMark, this.deadBest, this.deadAttempt, this.deadRetry, this.continueBtn]);
    this.deadUi = c;
  }

  private buildFinish(): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(200);
    const band = this.add.graphics();
    band.fillStyle(PALETTE.ink, 0.72).fillRect(0, L.cy - 470, L.width, 540);
    band.fillStyle(PALETTE.gold, 1).fillRect(0, L.cy - 478, L.width, 10).fillRect(0, L.cy + 66, L.width, 10);
    this.finishTitle = bigText(this, L.cx, L.cy - 390, this.t('finish.title'), 72, PALETTE.gold);
    const pct = bigText(this, L.cx, L.cy - 240, '100%', 170);
    this.finishGems = bigText(this, L.cx + 30, L.cy - 60, '', 56, PALETTE.gem);
    const gemIcon = this.add.image(L.cx - 60, L.cy - 60, 'gem').setScale(0.9);
    this.finishStyle = bigText(this, L.cx, L.cy + 10, '', 34, PALETTE.gold);
    this.finishNext = fitText(bigText(this, L.cx, L.cy + 170, this.t('finish.next'), 56), L.width - 120);
    this.tweens.add({ targets: this.finishNext, scale: 1.08, alpha: 0.8, yoyo: true, repeat: -1, duration: 400, ease: 'Sine.easeInOut' });
    this.doubleBtn = button(this, L.cx, L.bottom - 170, this.t('finish.double'), () => void this.doubleGems(), { width: 440, height: 104, fontSize: 40 });
    const adIcon = this.add.image(-180, 0, 'ic-ad').setScale(0.6).setTint(PALETTE.ink);
    this.doubleBtn.add(adIcon);
    c.add([band, this.finishTitle, pct, gemIcon, this.finishGems, this.finishStyle, this.finishNext, this.doubleBtn]);
    this.finishUi = c;
  }

  private buildHint(): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(190);
    const y = SPARK_Y + 150;
    const l1 = bigText(this, L.cx - 170, y - 22, this.t('hint.release'), 40, PALETTE.white);
    const l2 = bigText(this, L.cx - 170, y + 22, `← ${this.t('hint.left')}`, 28);
    const r1 = bigText(this, L.cx + 170, y - 22, this.t('hint.hold'), 40, PALETTE.gold);
    const r2 = bigText(this, L.cx + 170, y + 22, `${this.t('hint.right')} →`, 28);
    c.add([l1, l2, r1, r2]).setAlpha(0);
    this.hint = c;
  }

  // ───────────────────────────────────────────────────────────── track / skin

  private loadTrack(): void {
    if (this.mode === 'level') {
      this.track = buildLevel(this.level);
      this.pal = PALETTES[levelInfo(this.level).theme]!;
    } else {
      if (this.mode === 'daily') {
        this.dailyDate = dailyKey(new Date());
        this.endlessSeed = dailySeed(this.dailyDate);
      } else {
        this.endlessSeed = this.oyun.rng.int(1, 2 ** 31 - 1);
      }
      this.endlessSegments = 160;
      this.track = buildEndless(this.endlessSeed, { segments: this.endlessSegments }).track;
      this.pal = PALETTES[ENDLESS_THEMES[0]]!;
      this.endlessThemeIdx = 0;
    }
    this.plan = null;
    this.planEnd = 0;
    this.lastAutoSwitch = 0;
    this.backdrop.setPalette(this.pal);
    this.shaft.setTrack(this.track, this.pal);
    this.shaft.showFinish = this.mode === 'level';
    this.music.theme = this.mode === 'level' ? levelInfo(this.level).theme : 4;
    const save = gameSave(this.oyun).data;
    this.attempts = this.mode === 'level' ? save.levels[this.level - 1]!.attempts : 0;
  }

  private applySkin(): void {
    const s = gameSave(this.oyun).data.skin;
    this.spark.setTexture(`spark-${s.shape}`);
    const tr = TRAILS[s.trail] ?? TRAILS[0]!;
    this.trail.head0 = tr.head;
    this.trail.tail0 = tr.tail;
    this.trail.rainbow = tr.id === 'rainbow';
    this.sparkGlow.setTint(tr.tail);
    this.embers.setParticleTint(tr.tail);
    void SHAPES;
  }

  private resetRun(): void {
    this.sim = new RunSim(this.track);
    if (this.mode !== 'level') {
      this.plan = null;
      this.planEnd = 0;
    }
    this.lastAutoSwitch = 0;
    this.acc = 0;
    this.prevX = this.rx = this.sim.x;
    this.prevY = this.ry = this.lastRy = 0;
    this.trail.reset(this.sim.x, 0);
    this.shattered = false;
    this.squash = 0;
    this.runGems = 0;
    this.newBest = false;
    this.lastPct = -1;
    this.lastEdge = 0;
    this.continueUsed = false;
    this.gateSnap = null;
    this.spark.setVisible(true).setAlpha(1);
    this.sparkGlow.setVisible(true);
    this.embers.emitting = false;
    this.shards.killAll();
    this.ringBurst.setVisible(false);
    for (const g of this.gemSlots) g.setTexture('gem-empty').setScale(0.62);
    this.edgeText.setAlpha(0);
    this.cameras.main.setZoom(1);
  }

  // ───────────────────────────────────────────────────────────── phases

  private showPhase(p: Phase): void {
    this.phase = p;
    const playingish = p === 'playing' || p === 'dead' || p === 'finishing' || p === 'finished';
    this.titleUi.setVisible(p === 'title');
    this.muteBtn.setVisible(p === 'title' || p === 'ready' || p === 'dead' || p === 'finished');
    this.homeTile.setVisible(p === 'ready' || p === 'dead' || p === 'finished');
    this.readyUi.setVisible(p === 'ready');
    this.resumeUi.setVisible(p === 'resume');
    this.deadUi.setVisible(p === 'dead');
    this.finishUi.setVisible(p === 'finished');
    this.hud.setVisible(p === 'playing' || p === 'finishing' || p === 'resume');
    void playingish;
    this.setLetterbox();
    this.pauseBtn.setVisible(p === 'playing');
    if (p !== 'playing') {
      this.tweens.killTweensOf(this.hint);
      this.hint.setAlpha(0);
    }
    if (p === 'title') this.refreshTitle();
    if (p === 'ready') this.refreshReady();
    this.music.setMuffled(p !== 'playing');
    if (p !== 'playing') this.cue.setAlpha(0);
    this.refreshHud(true);
  }

  /** The page around the canvas (letterbox) wears the level's wall stripes instead of a flat bar. */
  private letterboxPal: Palette | null = null;
  private setLetterbox(): void {
    if (this.letterboxPal === this.pal || typeof document === 'undefined') return;
    this.letterboxPal = this.pal;
    const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
    const p = this.pal;
    document.body.style.background = `repeating-linear-gradient(135deg, ${hex(p.wallDeep)} 0 26px, ${hex(mix(p.wallDeep, p.wall, 0.55))} 26px 52px)`;
  }

  private refreshTitle(): void {
    const save = gameSave(this.oyun).data;
    this.titleLevel.setText(this.t('title.level', { n: this.level }));
    const best = save.levels[this.level - 1]!.best;
    this.titleBest.setText(best > 0 ? this.t('dead.best', { n: best }) : '');
    const unlocked = endlessUnlocked(save);
    this.endlessTile.setIcon(unlocked ? 'ic-endless' : 'ic-lock').setAlpha(unlocked ? 1 : 0.7);
  }

  private refreshReady(): void {
    this.fillReady();
    fitText(this.readyTitle, this.layout.width - 80);
    fitText(this.readySub, this.layout.width - 80);
  }

  private fillReady(): void {
    const save = gameSave(this.oyun).data;
    if (this.mode === 'endless') {
      this.readyTitle.setText(this.t('hud.endless'));
      this.readySub.setText(save.endlessBest > 0 ? this.t('dead.height', { n: save.endlessBest }) : '');
    } else if (this.mode === 'daily') {
      this.readyTitle.setText(this.t('daily.title'));
      const today = save.daily.date === this.dailyDate ? save.daily.best : 0;
      this.readySub.setText(save.daily.streak > 0 ? `${this.t('daily.best', { n: today })} · ${this.t('daily.streak', { n: save.daily.streak })}` : this.t('daily.best', { n: today }));
    } else {
      this.readyTitle.setText(this.t('title.level', { n: this.level }));
      const best = save.levels[this.level - 1]!.best;
      this.readySub.setText(best > 0 ? this.t('dead.best', { n: best }) : '');
    }
  }

  // ───────────────────────────────────────────────────────────── input

  private isUi(x: number, y: number): boolean {
    if (this.leaving || this.scene.isPaused() || !this.scene.isActive()) return true;
    if (this.phase === 'playing') return this.pauseBtn.visible && Math.abs(x - this.pauseBtn.x) < 60 && Math.abs(y - this.pauseBtn.y) < 60;
    const tiles = this.phase === 'title' ? this.titleTiles : [];
    for (const t of tiles) if (t.hits(x, y)) return true;
    if (this.homeTile.hits(x, y)) return true;
    if (this.muteBtn.visible && Math.abs(x - this.muteBtn.x) < 60 && Math.abs(y - this.muteBtn.y) < 60) return true;
    for (const b of [this.continueBtn, this.doubleBtn]) {
      if (!b.visible || !b.parentContainer?.visible) continue;
      if (Math.abs(x - b.x) < 230 && Math.abs(y - b.y) < 60) return true;
    }
    return false;
  }

  /**
   * The one press handler: real fingers (via HoldInput) and the test hook both land here.
   * `time` is the event time; during a run the press is queued as an edge and applied from the
   * first tick at or after it.
   */
  private onPress(_x: number, _y: number, time: number): void {
    if (this.leaving) return;
    this.held = true;
    this.pressAt = time;
    this.oyun.audio.unlock();
    switch (this.phase) {
      case 'playing':
        this.edges.push(true, time);
        break;
      case 'title':
      case 'ready':
        this.startRun(time);
        break;
      case 'resume':
        this.continueAfterPause(time);
        break;
      case 'dead':
        if (time - this.deathAt >= RETRY_LOCK_MS) this.retry(time);
        break;
      case 'finished':
        if (!this.advancing && time - this.finishAt >= FINISH_SLOWMO_MS + NEXT_LOCK_MS) this.nextAfterFinish(time);
        break;
      default:
        break;
    }
  }

  private onRelease(time: number): void {
    this.held = false;
    if (this.phase === 'playing') this.edges.push(false, time);
  }

  /** Leave for another scene: from now on nothing in this scene reacts to presses. */
  private leave(key: string, data?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    this.input2.clear();
    if (this.phase === 'playing') this.oyun.platform.gameplayStop();
    this.music.stop(false);
    this.goTo(key, data);
  }

  /** Back from the pause menu (or an ad): a run waits for the player's next press. */
  private onSceneResume(): void {
    this.input2.clear();
    this.lastFrameAt = performance.now();
    // Core's pause menu reports gameplay on when it closes; it is on only once the player presses.
    this.oyun.platform.gameplayStop();
    if (this.phase === 'playing') this.showPhase('resume');
  }

  private continueAfterPause(time: number): void {
    this.edges.reset(false);
    this.edges.push(true, time);
    this.lastFrameAt = time;
    this.acc = 0;
    this.showPhase('playing');
    this.music.start(this.sim.y);
    this.oyun.platform.gameplayStart();
  }

  // ───────────────────────────────────────────────────────────── run lifecycle

  /** Start the run at `time` (the press that starts it is its first edge). */
  private startRun(time: number = performance.now()): void {
    // No tick of this run may come from before the press: the clock starts at the press.
    this.acc = 0;
    this.lastFrameAt = time;
    this.edges.reset(false);
    if (this.held) this.edges.push(true, time);
    this.heldTicks = 0;
    this.tickLogAt = 0;
    this.attemptId++;
    const save = gameSave(this.oyun);
    if (!save.data.played) save.update((d) => void (d.played = true));
    this.hintShown = this.mode === 'level' && this.level === 1 && this.attempts < 3;
    this.attempts += 1;
    this.runBest = this.mode === 'level' ? gameSave(this.oyun).data.levels[this.level - 1]!.best : -1;
    this.showPhase('playing');
    // Respawn pop: the spark arrives with a ring, never blocking input.
    this.ringBurst.setVisible(true).setPosition(this.rx, SPARK_Y).setScale(0.15).setAlpha(0.9).setTint(this.pal.edge);
    this.tweens.killTweensOf(this.ringBurst);
    this.tweens.add({ targets: this.ringBurst, scale: 0.9, alpha: 0, duration: 320, ease: 'Cubic.easeOut' });
    this.squash = 0.6;
    this.music.start(this.sim.y);
    this.oyun.platform.gameplayStart();
    this.oyun.platform.track('run_start', { mode: this.mode, level: this.level });
    if (this.hintShown) {
      this.hint.setAlpha(1);
      this.tweens.add({ targets: this.hint, alpha: 0, delay: 2600, duration: 500 });
    }
  }

  private retry(time: number): void {
    this.retryLatency = performance.now() - this.deathAt;
    this.resetRun();
    this.startRun(time);
  }

  private goHome(): void {
    this.leave(SCENES.game, { mode: 'level', level: levelToPlay(gameSave(this.oyun).data), phase: 'title' } satisfies GameStart);
  }

  private openEndless(): void {
    if (!endlessUnlocked(gameSave(this.oyun).data)) {
      toast(this, this.t('title.unlockEndless'));
      this.juice.squash(this.endlessTile, 0.2);
      return;
    }
    this.switchMode('endless');
  }

  private openDaily(): void {
    this.switchMode('daily');
  }

  private switchMode(mode: Mode, level = this.level): void {
    this.mode = mode;
    this.level = level;
    this.loadTrack();
    this.resetRun();
    this.showPhase('ready');
  }

  private die(): void {
    const sim = this.sim;
    this.phase = 'dead';
    this.attemptId++;
    this.deathAt = performance.now();
    this.shattered = false;
    this.oyun.platform.gameplayStop();
    this.oyun.platform.haptic('heavy');
    this.music.stop(true);
    this.embers.emitting = false;
    this.juice.hitStop(FREEZE_MS);
    this.spark.setTint(0xffffff).setScale(1.5);
    this.flashA = 0.55;
    this.flash.setTint(0xffffff);
    // Record the attempt now (the overlay reads it).
    const pct = Math.floor(sim.progress * 100);
    const save = gameSave(this.oyun);
    let best = 0;
    let prevBest = 0;
    if (this.mode === 'level') {
      save.update((d) => {
        prevBest = d.levels[this.level - 1]!.best;
        this.newBest = recordLevelRun(d, this.level, { percent: pct, gemMask: sim.gemMask, finished: false }).newBest;
        best = d.levels[this.level - 1]!.best;
      });
    } else if (this.mode === 'endless') {
      const h = Math.floor(sim.y / 10);
      save.update((d) => {
        prevBest = d.endlessBest;
        this.newBest = recordEndless(d, h, sim.gemsTaken).newBest;
        best = d.endlessBest;
      });
    } else {
      // Daily: its own best (never the endless record); each gem of the day's shaft pays once.
      const h = Math.floor(sim.y / 10);
      const taken: number[] = [];
      for (let i = 0; i < sim.taken.length; i++) if (sim.taken[i]) taken.push(i);
      save.update((d) => {
        prevBest = d.daily.date === this.dailyDate ? d.daily.best : 0;
        this.newBest = recordDaily(d, this.dailyDate, h, taken).newBest;
        best = d.daily.best;
      });
    }
    // Bar: this attempt (bright) over the best so far (ghost); levels in %, endless in metres.
    const now = this.mode === 'level' ? pct / 100 : 1;
    const ref = this.mode === 'level' ? best / 100 : best > 0 ? Math.floor(sim.y / 10) / best : 1;
    this.deadBarBest.setDisplaySize(Math.max(2, this.deadBarW * (this.mode === 'level' ? ref : 1)), 32);
    this.deadBarNow.setDisplaySize(Math.max(2, this.deadBarW * (this.mode === 'level' ? now : Math.min(1, ref))), 32).setTint(this.newBest ? PALETTE.gold : this.pal.edge);
    this.deadBarMark.setText(this.mode === 'level' && !this.newBest && best > pct ? `▲ ${this.t('dead.best', { n: best })}` : '');
    const markX = this.layout.cx - this.deadBarW / 2 + this.deadBarW * ref;
    const half = this.deadBarMark.width / 2 + 20;
    this.deadBarMark.setX(Math.min(this.layout.width - half, Math.max(half, markX))).setVisible(this.deadBarMark.text !== '');
    this.oyun.platform.track('run_end', { mode: this.mode, level: this.level, percent: pct, cause: sim.deathCause ?? 'wall' });
    this.deadPct.setText(this.mode === 'level' ? `${pct}%` : this.t('hud.height', { n: Math.floor(sim.y / 10) }));
    this.deadBest.setText(this.mode === 'level' ? (this.deadBarMark.visible ? '' : this.t('dead.best', { n: best })) : this.t('dead.height', { n: best }));
    const style = sim.style > 0 ? this.t('dead.style', { n: sim.style }) : '';
    this.deadAttempt.setText([this.mode === 'level' ? this.t('hud.attempt', { n: this.attempts }) : '', style].filter(Boolean).join('  ·  '));
    this.deadBadge.setVisible(this.newBest && prevBest > 0);
    const canContinue = this.mode === 'level' && !this.continueUsed && this.gateSnap !== null;
    this.continueBtn.setVisible(canContinue).setEnabled(true);
  }

  private shatter(): void {
    this.shattered = true;
    const x = this.rx;
    const y = -this.ry;
    this.spark.setVisible(false).clearTint().setScale(1);
    this.sparkGlow.setVisible(false);
    const tr = TRAILS[gameSave(this.oyun).data.skin.trail] ?? TRAILS[0]!;
    this.shards.setParticleTint(0xffffff);
    this.shards.explode(14, x, y);
    this.shards.setParticleTint(tr.tail);
    this.shards.explode(18, x, y);
    this.sparks.setParticleTint(tr.head);
    this.sparks.explode(24, x, y);
    this.juice.shake(0.75);
    const cam = this.cameras.main;
    cam.setZoom(1.07);
    this.tweens.add({ targets: cam, zoom: 1, duration: 260, ease: 'Cubic.easeOut' });
    this.oyun.audio.playPreset(
      [
        { wave: 'sine', freq: 150, freqEnd: 32, duration: 0.42, gain: 0.6 },
        { wave: 'noise', freq: 900, duration: 0.3, gain: 0.45 },
        { wave: 'square', freq: 90, freqEnd: 40, duration: 0.18, gain: 0.12 },
      ],
      { jitter: 0 },
    );
    // Death overlay slams in.
    this.showPhase('dead');
    this.deadPct.setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: this.deadPct, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.deadRetry.setAlpha(0);
    this.tweens.add({ targets: this.deadRetry, alpha: 1, delay: RETRY_LOCK_MS - FREEZE_MS, duration: 120 });
  }

  private finish(): void {
    const sim = this.sim;
    this.phase = 'finishing';
    this.finishId++;
    this.finishAt = performance.now();
    this.oyun.platform.gameplayStop();
    this.oyun.platform.haptic('success');
    this.embers.emitting = false;
    const save = gameSave(this.oyun);
    let gained = 0;
    let all = false;
    save.update((d) => {
      gained = recordLevelRun(d, this.level, { percent: 100, gemMask: sim.gemMask, finished: true }).gemsGained;
      all = d.levels.every((l) => l.done);
    });
    this.gemsGainedThisFinish = gained;
    this.doubled = false;
    this.oyun.platform.track('level_complete', { level: this.level, attempts: this.attempts, gems: sim.gemsTaken });
    // Burst through the ring.
    const x = this.rx;
    this.ringBurst.setVisible(true).setPosition(x, SPARK_Y).setScale(0.3).setAlpha(1).setTint(PALETTE.gold);
    this.tweens.add({ targets: this.ringBurst, scale: 4.5, alpha: 0, duration: 900, ease: 'Cubic.easeOut' });
    this.confetti.explode(90, x, SPARK_Y);
    this.stars.setParticleTint(PALETTE.gold);
    this.stars.explode(30, x, -this.ry);
    this.flashA = 0.6;
    this.flash.setTint(PALETTE.gold);
    this.juice.shake(0.45);
    this.oyun.audio.play('win');
    this.pctText.setText('100%').setScale(1.8);
    this.tweens.add({ targets: this.pctText, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.gemSlots.forEach((g, i) => this.tweens.add({ targets: g, scale: 0.95, yoyo: true, delay: 200 + i * 120, duration: 160 }));
    fitText(this.finishTitle.setText(all && this.level === LEVEL_COUNT ? this.t('finish.all') : this.t('finish.title')), this.layout.width - 60);
    this.finishGems.setText(`+${gained}`);
    this.finishStyle.setText(sim.style > 0 ? this.t('dead.style', { n: sim.style }) : '');
    fitText(this.finishNext.setText(this.level < LEVEL_COUNT ? this.t('finish.next') : this.t('finish.again')), this.layout.width - 120);
    this.doubleBtn.setVisible(gained > 0).setEnabled(true);
  }

  private nextAfterFinish(time: number): void {
    if (this.advancing) return;
    this.advancing = true;
    const next = Math.min(LEVEL_COUNT, this.level + 1);
    const finishId = this.finishId;
    const go = (at: number): void => {
      this.advancing = false;
      if (this.leaving || this.phase !== 'finished' || this.finishId !== finishId) return;
      this.mode = 'level';
      this.level = next;
      this.loadTrack();
      this.resetRun();
      this.startRun(at);
    };
    if (shouldShowInterstitial(gameSave(this.oyun).data.finishes)) {
      // After an ad the run starts when it closes, not at the (long past) press.
      this.held = false;
      void this.oyun.platform.showInterstitial('between_levels').then(() => go(performance.now()));
    } else go(time);
  }

  private async continueRun(): Promise<void> {
    if (this.phase !== 'dead' || !this.gateSnap || this.continueUsed) return;
    const attempt = this.attemptId;
    this.continueBtn.setEnabled(false);
    const outcome = await this.oyun.platform.showRewarded('continue');
    // The world may have moved on while the ad played (retry, another death, leaving).
    const snap = this.gateSnap;
    const stale = this.leaving || this.phase !== 'dead' || this.attemptId !== attempt || !snap || this.continueUsed;
    if (outcome !== 'granted' || stale) {
      if (!stale) this.continueBtn.setEnabled(true);
      return;
    }
    this.oyun.platform.track('reward_claimed', { placement: 'continue' });
    // Resume from the snapshot taken at the last gate, parked in the corridor centre there.
    const sim = snap.clone();
    sim.x = this.corridorCentre(sim.y);
    this.sim = sim;
    this.continueUsed = true;
    this.prevX = this.rx = sim.x;
    this.prevY = this.ry = this.lastRy = sim.y;
    this.trail.reset(sim.x, sim.y);
    this.spark.setVisible(true).clearTint().setScale(1);
    this.sparkGlow.setVisible(true);
    this.showPhase('ready');
  }

  private corridorCentre(y: number): number {
    const tr = this.track;
    const i = segmentAt(tr.wy, y);
    return (wallXAt(tr.wy, tr.lx, i, y) + wallXAt(tr.wy, tr.rx, i, y)) / 2;
  }

  private async doubleGems(): Promise<void> {
    if (this.doubled || this.gemsGainedThisFinish <= 0 || this.phase !== 'finished') return;
    // Capture what is being doubled before the ad: the player may move on while it plays.
    const n = this.gemsGainedThisFinish;
    const finishId = this.finishId;
    this.doubled = true;
    this.doubleBtn.setEnabled(false);
    const outcome = await this.oyun.platform.showRewarded('double_gems');
    if (outcome !== 'granted') {
      this.doubled = false;
      if (this.finishId === finishId && this.phase === 'finished') this.doubleBtn.setEnabled(true);
      return;
    }
    gameSave(this.oyun).update((d) => void (d.gems += n));
    this.oyun.platform.track('reward_claimed', { placement: 'double_gems' });
    if (this.leaving || this.finishId !== finishId || this.phase !== 'finished') return;
    this.doubleBtn.setVisible(false);
    this.finishGems.setText(`+${n * 2}`);
    this.juice.pop(this.finishGems, 1.4);
    toast(this, this.t('finish.doubled'), { position: 'bottom' });
  }

  // ───────────────────────────────────────────────────────────── per-tick events

  private onGate(kind: GateKind): void {
    const color = GATE_COLORS[kind];
    this.flashA = 0.22;
    this.flash.setTint(color);
    this.oyun.platform.haptic('light');
    this.oyun.audio.playPreset(
      [
        { wave: 'noise', freq: 4000, duration: 0.22, gain: 0.25 },
        { wave: 'triangle', freq: kind === 'slow' ? 700 : 400, freqEnd: kind === 'slow' ? 300 : 1100, duration: 0.2, gain: 0.25 },
      ],
      { jitter: 0 },
    );
    this.flashGateText(this.t(`gate.${kind}`), kind === 'flip' ? this.t('gate.flipHint') : kind === 'unflip' ? this.t('gate.unflipHint') : '', color);
    const cam = this.cameras.main;
    cam.setZoom(kind === 'fast' ? 1.05 : kind === 'slow' ? 0.97 : 1.03);
    this.tweens.add({ targets: cam, zoom: 1, duration: 300, ease: 'Cubic.easeOut' });
    this.stars.setParticleTint(color);
    this.stars.explode(14, this.sim.x, -this.sim.y);
    if (kind === 'mini' || kind === 'big') this.squash = 0.5;
    if (this.mode === 'level') this.gateSnap = this.sim.clone();
  }

  /** A short banner in the top band (never across the corridor ahead). */
  private flashGateText(text: string, sub: string, color: number, size = 58): void {
    this.tweens.killTweensOf([this.gateText, this.gateSub]);
    this.gateText.setText(text).setColor(`#${color.toString(16).padStart(6, '0')}`).setAlpha(1).setScale(1.4);
    fitText(this.gateText, this.layout.width - 80, size);
    this.tweens.add({ targets: this.gateText, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.gateText, alpha: 0, delay: 420, duration: 220 });
    this.gateSub.setText(sub).setAlpha(sub ? 1 : 0);
    if (sub) {
      fitText(this.gateSub, this.layout.width - 80, 30);
      this.tweens.add({ targets: this.gateSub, alpha: 0, delay: 900, duration: 250 });
    }
  }

  private onGem(i: number): void {
    this.runGems += 1;
    const g = this.track.gems[i]!;
    this.oyun.audio.play('coin', { pitch: this.runGems * 3 });
    this.stars.setParticleTint(PALETTE.gem);
    this.stars.explode(16, g.x, -g.y);
    const slot = this.gemSlots[Math.min(2, this.runGems - 1)];
    if (this.mode === 'level' && slot) {
      // Fly the gem from the shaft into its HUD slot.
      const fly = this.add.image(g.x, SPARK_Y - (g.y - this.ry), 'gem').setDepth(160);
      this.tweens.add({
        targets: fly,
        x: slot.x,
        y: slot.y,
        scale: 0.62,
        duration: 420,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          fly.destroy();
          slot.setTexture('gem');
          this.juice.pop(slot, 1.6);
        },
      });
    } else {
      this.juice.floatText(g.x, SPARK_Y - (g.y - this.ry) - 40, '+1', { color: PALETTE.gem, size: 44 });
    }
  }

  private onNearMiss(): void {
    const sim = this.sim;
    // Contact point: step back along the gradient of the distance field.
    const e = 2;
    const d0 = sdf(this.track, sim.x, sim.y, sim.t);
    const gx = sdf(this.track, sim.x + e, sim.y, sim.t) - d0;
    const gy = sdf(this.track, sim.x, sim.y + e, sim.t) - d0;
    const len = Math.hypot(gx, gy) || 1;
    const cx = sim.x - (gx / len) * (d0 + 4);
    const cy = sim.y - (gy / len) * (d0 + 4);
    this.sparks.setParticleTint(this.pal.edge);
    this.sparks.explode(8 + Math.min(16, sim.edge * 3), cx, -cy);
    this.oyun.audio.playPreset([{ wave: 'square', freq: 1100, freqEnd: 1700, duration: 0.06, gain: 0.1 }], { pitch: Math.min(14, sim.edge * 2), jitter: 0 });
    if (sim.edge >= 2) {
      this.edgeText.setText(this.t('hud.edge', { n: sim.edge })).setAlpha(1).setScale(1.5);
      this.tweens.killTweensOf(this.edgeText);
      this.tweens.add({ targets: this.edgeText, scale: 1, duration: 200, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.edgeText, alpha: 0, delay: 550, duration: 200 });
      if (sim.edge >= 3) this.juice.shake(0.12);
    } else {
      this.edgeText.setText(this.t('hud.close')).setAlpha(1).setScale(1.2);
      this.tweens.killTweensOf(this.edgeText);
      this.tweens.add({ targets: this.edgeText, scale: 1, duration: 160, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.edgeText, alpha: 0, delay: 350, duration: 200 });
    }
  }

  // ───────────────────────────────────────────────────────────── frame

  override update(_time: number, delta: number): void {
    const t0 = performance.now();
    const realDt = Math.min(0.2, delta / 1000);
    const now = t0;

    if (this.phase === 'playing') {
      // Real elapsed time for every player (Phaser's smoothed delta clamps to 16.7 ms while the
      // window is unfocused and for 120 frames after load/refocus), capped against hitches.
      const elapsed = realTimeDelta(now - this.lastFrameAt, this.frameCapMs);
      this.lastFrameAt = now;
      if (this.juice.timeScale > 0) this.acc += elapsed;
      let guard = 0;
      while (this.acc >= DT_MS && this.phase === 'playing' && guard++ < 40) {
        this.acc -= DT_MS;
        // This tick ends at real time now - acc: input edges up to then apply to it.
        this.tickOnce(now - this.acc);
      }
      if (this.phase !== 'playing') this.acc = 0;
      this.updateCues();
    } else {
      this.lastFrameAt = now;
    }

    const sim = this.sim;
    const alpha = this.phase === 'playing' ? Math.min(1, this.acc / DT_MS) : 1;
    if (this.phase === 'finishing' || this.phase === 'finished') {
      // Slow-motion coast through the ring.
      const k = Math.max(0.12, 1 - (now - this.finishAt) / FINISH_SLOWMO_MS);
      // Straight up the middle of the outro corridor, easing to a crawl.
      this.ry += sim.speed * 0.35 * k * realDt;
      this.rx += (this.corridorCentre(this.ry) - this.rx) * Math.min(1, realDt * 4);
      if (this.phase === 'finishing' && now - this.finishAt >= FINISH_SLOWMO_MS) {
        this.showPhase('finished');
        this.finishUi.setAlpha(0);
        this.tweens.add({ targets: this.finishUi, alpha: 1, duration: 200 });
      }
    } else if (this.phase !== 'dead') {
      this.rx = this.prevX + (sim.x - this.prevX) * alpha;
      this.ry = this.prevY + (sim.y - this.prevY) * alpha;
    }
    if (this.phase === 'dead' && !this.shattered && now - this.deathAt >= FREEZE_MS) this.shatter();

    // Beat pulse: from the height the music is at (minus output latency).
    const speed = sim.speed;
    let beatY = this.ry;
    if (this.phase === 'title' || this.phase === 'ready') {
      this.idleY += speed * 0.5 * realDt;
      beatY = this.idleY;
    }
    const ph = ((beatY - speed * this.music.latency()) / BEAT_PX) % 1;
    const pulse = Math.pow(1 - (ph < 0 ? ph + 1 : ph), 3);

    // World scroll and the shaft.
    this.world.y = SPARK_Y + this.ry;
    if (this.mode !== 'level') this.updateEndlessTheme();
    // Bars at the same interpolated moment as the spark (one tick behind + alpha).
    const drawT = this.phase === 'playing' ? Math.max(0, sim.tick - 1 + alpha) * DT : sim.t;
    this.shaft.update(this.ry, drawT, sim.taken, pulse);
    const trailAlpha = this.phase === 'dead' ? Math.max(0, 1 - (now - this.deathAt) / 500) : 1;
    this.trail.boost = 1 + Math.min(0.6, sim.edge * 0.12);
    this.trail.draw(this.rx, this.ry, trailAlpha);

    // Spark.
    const idle = this.phase === 'title' || this.phase === 'ready';
    const bob = idle ? Math.sin(now / 240) * 8 : 0;
    const r = sim.radius;
    const base = (r / SPARK_R) * 0.78;
    this.squash *= Math.pow(0.0005, realDt);
    const sx = base * (1 + this.squash * 0.6);
    const sy = base * (1 - this.squash * 0.4);
    if (this.phase !== 'dead') {
      this.spark.setPosition(this.rx, SPARK_Y + bob).setScale(sx, sy).setAngle(idle ? 0 : sim.dir * 30);
      if (sim.flipped) this.spark.setTint(GATE_COLORS.flip);
      else this.spark.clearTint();
    } else if (!this.shattered) {
      this.spark.setPosition(this.rx, SPARK_Y);
    }
    this.sparkGlow.setPosition(this.rx, SPARK_Y + bob).setScale((r / SPARK_R) * (1.25 + pulse * 0.35 + Math.min(0.8, sim.edge * 0.15)));
    this.sparkHalo.setPosition(this.rx, SPARK_Y + bob).setAlpha(idle ? 0.5 + pulse * 0.4 : 0).setScale(0.22 + pulse * 0.06);
    this.edgeText.setX(Math.min(this.layout.width - 150, Math.max(150, this.rx)));
    this.flipTag.setVisible(sim.flipped && (this.phase === 'playing' || this.phase === 'resume')).setX(Math.min(this.layout.width - 90, Math.max(90, this.rx)));
    if (this.phase === 'playing') {
      this.embers.emitting = true;
      this.embers.setPosition(this.rx, -this.ry);
    }

    // Backdrop and music.
    const dyScreen = this.ry - this.lastRy + (idle ? speed * 0.3 * realDt : 0);
    this.lastRy = this.ry;
    const prog = this.mode === 'level' ? sim.progress : (this.ry % 6000) / 6000;
    this.backdrop.update(prog, dyScreen, pulse, speed, realDt);
    if (this.phase === 'playing') {
      this.music.intensity = this.mode === 'level' ? (sim.progress < 0.06 ? 1 : sim.progress < 0.3 ? 2 : 3) : Math.min(3, 1 + Math.floor(sim.y / 4000));
      if (sim.edge >= 2) this.music.intensity = 3;
      this.music.tick(sim.y, speed, realDt);
    }

    if (this.flashA > 0.001) {
      this.flash.setAlpha(this.flashA);
      this.flashA *= Math.pow(0.002, realDt);
    } else this.flash.setAlpha(0);

    this.refreshHud(false);
    if (this.phase === 'playing' && !this.tweens.isTweening(this.pctText)) this.pctText.setScale(1 + pulse * 0.06);
    if (this.phase === 'playing') this.frameUpdate.add(performance.now() - t0);
  }

  /** One fixed sim tick ending at real time `tickTime`, with the events it raises. */
  private tickOnce(tickTime: number): void {
    const sim = this.sim;
    let held: boolean;
    if (this.autopilot) {
      this.ensureAutoPlan();
      held = this.plan ? this.plan[sim.tick] === 1 : false;
      if (sim.tick > 0 && this.plan && this.plan[sim.tick] !== this.plan[sim.tick - 1]) this.lastAutoSwitch = sim.tick;
    } else held = this.edges.next(tickTime);
    if (held) this.heldTicks++;
    const li = this.tickLogAt++ % 32;
    this.tickTimes[li] = tickTime;
    this.tickHeld[li] = held ? 1 : 0;
    this.tickIds[li] = sim.tick;
    const px = sim.x;
    const py = sim.y;
    const pdir = sim.dir;
    const ev = sim.step(held);
    this.prevX = px;
    this.prevY = py;
    if (sim.dir !== pdir) {
      this.trail.sample(px, py, true);
      this.squash = Math.max(this.squash, 0.35);
    } else this.trail.sample(px, py, false);
    if (ev.gate) this.onGate(ev.gate);
    if (ev.gem >= 0) this.onGem(ev.gem);
    if (ev.nearMiss) this.onNearMiss();
    if (ev.died) {
      this.prevX = this.rx = sim.x;
      this.prevY = this.ry = sim.y;
      this.die();
    } else if (ev.finished && this.mode === 'level') {
      this.prevX = this.rx = sim.x;
      this.prevY = this.ry = sim.y;
      this.finish();
    }
    if (this.mode !== 'level') this.growEndless();
  }

  /** Endless never ends: well before the spark nears the end, swap in a longer build. */
  private growEndless(): void {
    if (this.sim.y < this.track.length - 25_000) return;
    this.endlessSegments += 160;
    const longer = buildEndless(this.endlessSeed, { segments: this.endlessSegments }).track;
    this.track = longer;
    this.sim.setTrack(longer);
    this.shaft.replaceTrack(longer);
    if (this.gateSnap) this.gateSnap.setTrack(longer);
  }

  /**
   * Autopilot input. Levels: one plan for the whole level (with its gems). Endless and daily:
   * plan 6 s ahead from where the spark is, and re-plan every 3 s.
   */
  private ensureAutoPlan(): void {
    const sim = this.sim;
    if (this.mode === 'level') {
      if (!this.plan) {
        const p = prepare(this.track);
        const plan = solve(p, { minClear: 6, minHoldTicks: K_REF, gems: true }) ?? solve(p, { minClear: 0, minHoldTicks: K_REF });
        this.plan = plan ? plan.held : null;
      }
      return;
    }
    if (this.plan && sim.tick < this.planEnd - 360) return;
    const from = sim.tick;
    const held: 0 | 1 = (sim.dir === 1) !== sim.flipped ? 1 : 0;
    const p = prepare(this.track, { fromTick: from, toTick: from + 720 });
    const since = from === 0 ? K_REF : Math.max(1, from - this.lastAutoSwitch);
    const opts = { minHoldTicks: K_REF, from: { tick: from, x: sim.x, held, since } };
    const plan = solve(p, { ...opts, minClear: 4 }) ?? solve(p, { ...opts, minClear: 0 });
    if (plan) {
      this.plan = plan.held;
      this.planEnd = p.tl.n;
    } else {
      this.plan = null;
      this.planEnd = from + 1;
    }
  }

  /**
   * First run ever: an unmissable "let go!" as the first wall approaches, then "hold!" for the
   * other side. Shown once each, then never again.
   */
  private updateCues(): void {
    if (this.tutorialStep < 0 || this.tutorialStep > 1 || this.autopilot) return;
    const sim = this.sim;
    const tr = this.track;
    const i = segmentAt(tr.wy, sim.y);
    const room = sim.dir === 1 ? wallXAt(tr.wy, tr.rx, i, sim.y) - sim.x - sim.radius : sim.x - wallXAt(tr.wy, tr.lx, i, sim.y) - sim.radius;
    const want = this.tutorialStep === 0 ? 1 : -1;
    if (this.cueDir === 0 && sim.dir === want && room < 190 && this.cue.alpha < 0.5) {
      const left = want === 1;
      this.cue.setText(left ? `← ${this.t('cue.letGo')}` : `${this.t('cue.hold')} →`).setColor(left ? '#ffffff' : '#ffe14d').setAlpha(1).setScale(1.5);
      fitText(this.cue, this.layout.width - 60, 84);
      this.cue.setX(this.layout.cx);
      this.tweens.killTweensOf(this.cue);
      this.tweens.add({ targets: this.cue, scale: 1, duration: 200, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.cue, scale: 1.12, yoyo: true, repeat: 3, delay: 200, duration: 160 });
      this.oyun.audio.play('pop');
      this.cueDir = want;
    } else if (this.cueDir !== 0 && sim.dir === -this.cueDir) {
      // The player reacted: the cue goes, and the next one (or none) is armed (once).
      this.cueDir = 0;
      this.tweens.killTweensOf(this.cue);
      this.tweens.add({ targets: this.cue, alpha: 0, scale: 0.8, duration: 180 });
      this.tutorialStep++;
      if (this.tutorialStep > 1) {
        this.tutorialStep = -1;
        gameSave(this.oyun).update((d) => void (d.tutorial = true));
      }
    }
  }

  private cueDir = 0;

  private updateEndlessTheme(): void {
    const idx = Math.floor(this.ry / 6000) % ENDLESS_THEMES.length;
    if (idx === this.endlessThemeIdx) return;
    this.endlessThemeIdx = idx;
    this.pal = PALETTES[ENDLESS_THEMES[idx]!]!;
    this.backdrop.setPalette(this.pal);
    this.shaft.setPalette(this.pal);
    this.setLetterbox();
  }

  private refreshHud(force: boolean): void {
    const sim = this.sim;
    if (!sim) return;
    const save = gameSave(this.oyun).data;
    const level = this.mode === 'level';
    const pct = level ? Math.floor(sim.progress * 100) : Math.floor(sim.y / 10);
    if (pct !== this.lastPct || force) {
      this.lastPct = pct;
      if (level && this.phase === 'playing' && this.runBest > 0 && this.runBest < 100 && pct > this.runBest) {
        this.runBest = -1;
        this.flashGateText(this.t('hud.passBest'), '', PALETTE.gold, 64);
        this.oyun.audio.play('win', { volume: 0.6 });
        this.oyun.platform.haptic('success');
        this.juice.pop(this.pctText, 1.5);
      }
      if (this.phase !== 'finishing' && this.phase !== 'finished') this.pctText.setText(level ? `${pct}%` : this.t('hud.height', { n: pct }));
      const frac = level ? sim.progress : Math.min(1, save.endlessBest > 0 ? sim.y / 10 / save.endlessBest : 0);
      this.barFill.setDisplaySize(Math.max(1, this.barW * frac), 18);
      const bestFrac = level ? save.levels[this.level - 1]!.best / 100 : 1;
      this.barBest.setX(this.layout.cx - this.barW / 2 + this.barW * bestFrac).setVisible(bestFrac > 0 && bestFrac < 1);
    }
    if (force) {
      this.chip.setText(level ? this.t('hud.level', { n: this.level }) : this.mode === 'daily' ? this.t('hud.daily') : this.t('hud.endless'));
      fitText(this.chip, 112, 34);
      this.attemptText.setText(level ? this.t('hud.attempt', { n: Math.max(1, this.attempts) }) : '');
      for (const g of this.gemSlots) g.setVisible(level);
    }
    this.barFill.setTint(mix(this.pal.edge, 0xffffff, 0.35));
    void this.lastEdge;
  }

  // ───────────────────────────────────────────────────────────── test hook

  protected override testState() {
    const sim = this.sim;
    const save = gameSave(this.oyun).data;
    const now = performance.now();
    return {
      mode: this.mode,
      level: this.level,
      phase: this.phase,
      progress: Math.round(sim.progress * 1000) / 10,
      alive: sim.alive && this.phase !== 'dead',
      playing: this.phase === 'playing',
      attempts: this.attempts,
      gems: sim.gemsTaken,
      wallet: save.gems,
      unlocked: save.unlocked,
      best: this.mode === 'level' ? save.levels[this.level - 1]!.best : save.endlessBest,
      speed: Math.round(sim.speed),
      size: sim.radius,
      mini: sim.radius === MINI_R,
      flipped: sim.flipped,
      held: this.held,
      dir: sim.dir,
      x: Math.round(sim.x * 10) / 10,
      y: Math.round(sim.y * 10) / 10,
      tick: sim.tick,
      t: Math.round(sim.t * 1000) / 1000,
      heldTicks: this.heldTicks,
      tickLog: Array.from({ length: Math.min(32, this.tickLogAt) }, (_, k) => {
        const i = (this.tickLogAt - Math.min(32, this.tickLogAt) + k) % 32;
        return [this.tickIds[i]!, Math.round(this.tickTimes[i]! * 1000) / 1000, this.tickHeld[i]!];
      }),
      pendingEdges: this.edges.pending,
      height: Math.floor(sim.y / 10),
      cue: this.cue.alpha > 0.5 ? this.cue.text : '',
      tutorialStep: this.tutorialStep,
      flipTag: this.flipTag.visible,
      trackLength: Math.round(this.track.length),
      edge: sim.edge,
      nearMisses: sim.nearMisses,
      deathCause: sim.deathCause ?? '',
      retryReady: this.phase === 'dead' && now - this.deathAt >= RETRY_LOCK_MS,
      msSinceDeath: this.phase === 'dead' ? Math.round(now - this.deathAt) : -1,
      retryLatencyMs: Math.round(this.retryLatency),
      nextGateIn: sim.gateIndex < this.track.gates.length ? Math.round(this.track.gates[sim.gateIndex]!.y - sim.y) : -1,
      nextGate: sim.gateIndex < this.track.gates.length ? this.track.gates[sim.gateIndex]!.kind : '',
      autopilot: this.autopilot,
      canContinue: this.continueBtn.visible && this.phase === 'dead',
      frameJs: this.frameJs.summary(),
      frameUpdate: this.frameUpdate.summary(),
    };
  }

  protected override testActions() {
    return {
      hold: (p: unknown) => (p === true ? this.input2.press('test') : this.input2.release('test')),
      tap: () => {
        this.input2.press('test');
        this.input2.release('test');
      },
      autopilot: (p: unknown) => {
        this.autopilot = p === true;
        if (this.autopilot) {
          if (this.mode === 'level') this.ensureAutoPlan();
          else this.plan = null;
          if (this.phase === 'title' || this.phase === 'ready' || this.phase === 'resume') {
            this.held = false;
            if (this.phase === 'resume') this.continueAfterPause(performance.now());
            else this.startRun(performance.now());
          }
        }
      },
      start: (p: unknown) => {
        const o = (p ?? {}) as { mode?: Mode; level?: number };
        this.switchMode(o.mode ?? 'level', o.level ?? this.level);
      },
      pause: () => this.pauseBtn.fire(),
      home: () => this.homeTile.fire(),
      continue: () => this.continueBtn.fire(),
      double: () => this.doubleBtn.fire(),
      levels: () => this.titleTiles[0]?.fire(),
      endless: () => this.titleTiles[1]?.fire(),
      daily: () => this.titleTiles[2]?.fire(),
      skins: () => this.titleTiles[3]?.fire(),
    };
  }
}
