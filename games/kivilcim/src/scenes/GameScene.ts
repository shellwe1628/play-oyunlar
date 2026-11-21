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
import { EdgeFx } from '../render/EdgeFx';
import { World } from '../render/World';
import { ensureWorldArt } from '../render/worldArt';
import { ensureCanvasArt } from '../render/canvasArt';
import { ShaftView } from '../render/Shaft';
import { ensureBadges } from '../render/badges';
import { Boss } from '../render/Boss';
import { MechView } from '../render/MechView';
import { hue, Trail, TRAIL_LEN } from '../render/Trail';
import { gameOnline } from '../online';
import { gameSave } from '../save';
import { BEAT_PX, DT, MINI_R, SHAFT_W, SPARK_R, START_X } from '../sim/constants';
import { EdgeQueue } from '../sim/input';
import { buildEndless, dailyKey, dailySeed } from '../sim/endless';
import { buildLevel, isBoss, LEVEL_COUNT, levelInfo, worldOf } from '../sim/levels';
import { ACHIEVEMENTS, FLOW_MAX, progressScore, RANKS, rankOf, settle, totalStars, type MetaGain } from '../sim/meta';
import { MECHANICS, type Mechanic } from '../sim/patterns';
import { endlessUnlocked, levelOpen, levelToPlay, recordDaily, recordEndless, recordLevelRun, recordStats, shouldShowInterstitial } from '../sim/progress';
import { RunSim } from '../sim/run';
import { COLOR_SHIFT_STYLES, TRAILS } from '../sim/skins';
import { K_REF, prepare, solve } from '../sim/solver';
import { sdf, segmentAt, wallXAt, type GateKind, type Track } from '../sim/track';
import { ENDLESS_THEMES, GATE_COLORS, PALETTE, PALETTES, type Palette } from '../textures';
import { bigText, fitText, IconTile, MenuCard, NeonButton, type MenuHit } from '../ui';
import { SCENES } from './keys';
import { TRIAL_KEY } from './SkinsScene';

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
/** Title: height of the neon sign (logo) under the safe top edge. */
const SIGN_Y = 272;
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
/** Endless milestones (m). */
const MILESTONE_M = 250;

/** Shatter per spark shape: piece texture, speed range, gravity. */
const SHATTER: readonly { tex: string; speed: [number, number]; gravity: number; count: number }[] = [
  { tex: 'oyun-dot', speed: [200, 760], gravity: 900, count: 30 },
  { tex: 'shard-diamond', speed: [260, 820], gravity: 900, count: 26 },
  { tex: 'oyun-star', speed: [220, 700], gravity: 600, count: 24 },
  { tex: 'shard', speed: [300, 900], gravity: 1000, count: 26 },
  { tex: 'shard-hex', speed: [200, 700], gravity: 800, count: 26 },
  { tex: 'shard-plus', speed: [260, 760], gravity: 900, count: 24 },
  { tex: 'shard-arc', speed: [430, 470], gravity: 250, count: 28 },
  { tex: 'shard-streak', speed: [500, 1000], gravity: 0, count: 26 },
];

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
  /** Presentation on (?fx=0 turns the new animated layers off; the sim never depends on it). */
  private fx = true;
  /** Running hash of the sim state, tick by tick (test: presentation cannot change the sim). */
  private simHash = 2166136261;
  private speedK = 1;
  private lastMilestone = 0;
  private shapeIdx = 0;
  private demoX = 360;
  private demoY = 0;
  private demoDir = 1;
  /** Flow meter (presentation): points from gems and perfect sections; level = points / 2. */
  private flowPts = 0;
  private flow = 0;
  private bestFlowRun = 0;
  private sectionIdx = 0;
  private sectionNear = 0;
  private pctMark = 0;
  /** A trail being tried for one run (shop), or -1. */
  private trial = -1;
  private trialRun = false;
  private colorShift = false;
  /** First y of each mechanic in this track, for the one-time cue. */
  private mechAt: { m: Mechanic; y: number }[] = [];
  private mechCueIdx = 0;
  private bossSections = 1;
  private rankUp: Phaser.GameObjects.Container | null = null;

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
  private soClose = false;
  private bestDelta = 0;

  // view
  private world!: Phaser.GameObjects.Container;
  private worldFx!: World;
  private edgeFx!: EdgeFx;
  private demoTrail!: Trail;
  private charge!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fallSparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private milestones: Phaser.GameObjects.Text[] = [];
  private milestoneBands: Phaser.GameObjects.TileSprite[] = [];
  private logoLetters: Phaser.GameObjects.Text[] = [];
  private finishRays!: Phaser.GameObjects.Image;
  private logoShine!: Phaser.GameObjects.Image;
  private shaft!: ShaftView;
  private mech!: MechView;
  private boss!: Boss;
  private dark!: Phaser.GameObjects.Image;
  private twin!: Phaser.GameObjects.Image;
  private twinGlow!: Phaser.GameObjects.Image;
  private flowPips!: Phaser.GameObjects.Graphics;
  private flowText!: Phaser.GameObjects.Text;
  private titleRank!: Phaser.GameObjects.Image;
  private titleRankText!: Phaser.GameObjects.Text;
  private titleRankScore!: Phaser.GameObjects.Text;
  private rankChip!: NeonButton;
  private rankChipX = 0;
  private logoGroup!: Phaser.GameObjects.Container;
  private signTubes!: Phaser.GameObjects.Graphics;
  private signRunners: Phaser.GameObjects.Image[] = [];
  private titlePlate!: Phaser.GameObjects.Container;
  private levelPlate!: Phaser.GameObjects.Graphics;
  private playBtn!: Phaser.GameObjects.Container;
  private playW = 0;
  private playH = 0;
  private fuse!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fuseGlow!: Phaser.GameObjects.Image;
  private ringA!: Phaser.GameObjects.Graphics;
  private ringB!: Phaser.GameObjects.Graphics;
  private deck!: Phaser.GameObjects.Container;
  private deckTop = 0;
  private deckRunner!: Phaser.GameObjects.Image;
  private titleCards: MenuCard[] = [];
  private deadStars!: Phaser.GameObjects.Text;
  private finishStars: Phaser.GameObjects.Image[] = [];
  private finishBonus!: Phaser.GameObjects.Text;
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
  private hudShade!: Phaser.GameObjects.Image;
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
  /** Title menu targets, in test-hook order: levels, endless, daily, skins, ranks. */
  private titleTiles: MenuHit[] = [];
  private homeTile!: IconTile;
  private endlessTile!: MenuCard;
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
    // Title and after every run: Play Games starts (adults only) and new bests go up.
    void gameOnline(this.oyun).sync();
    ensureCanvasArt(this);
    ensureWorldArt(this);
    ensureBadges(this);
    const save = gameSave(this.oyun).data;
    this.trial = (this.registry.get(TRIAL_KEY) as number | undefined) ?? -1;
    this.trialRun = false;
    this.finishStars = [];
    this.rankUp = null;
    this.fx = new URLSearchParams(location.search).get('fx') !== '0';
    this.simHash = 2166136261;
    this.speedK = 1;
    this.milestones = [];
    this.milestoneBands = [];
    this.logoLetters = [];
    this.mode = data.mode ?? 'level';
    this.level = data.level ?? levelToPlay(save);
    this.phase = data.phase ?? 'title';
    this.autopilot = false;
    this.plan = null;
    this.held = false;
    this.titleTiles = [];
    this.titleCards = [];
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
    this.worldFx = new World(this, width, height);
    this.worldFx.setVisible(this.fx);
    this.world = this.add.container(0, SPARK_Y).setDepth(0);
    this.shaft = new ShaftView(this, this.world);
    this.shaft.fx = this.fx;
    this.edgeFx = new EdgeFx(this, this.world);
    this.mech = new MechView(this, this.world);
    this.mech.fx = this.fx;
    for (let i = 0; i < 2; i++) {
      const band = this.add.tileSprite(0, 0, 400, 24, 'gate-band-plain').setVisible(false).setAlpha(0.6);
      const text = bigText(this, 0, 0, '', 40, PALETTE.gold).setVisible(false);
      this.world.add([band, text]);
      this.milestoneBands.push(band);
      this.milestones.push(text);
    }
    this.shaft.gateLabel = (k: GateKind) => this.t(`gate.${k}`);
    this.shaft.finishLabel = this.t('gate.finish');
    this.trail = new Trail(this.add.graphics());
    this.world.add(this.trail.g);
    this.demoTrail = new Trail(this.add.graphics().setDepth(9));
    this.demoTrail.length = 260;

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
    this.fallSparks = this.add.particles(0, 0, 'oyun-dot', {
      lifespan: { min: 400, max: 800 },
      speed: { min: 40, max: 160 },
      angle: { min: 60, max: 120 },
      gravityY: -900,
      scale: { start: 0.45, end: 0 },
      alpha: { start: 1, end: 0 },
      frequency: 12,
      quantity: 2,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.world.add([this.embers, this.fallSparks, this.sparks, this.shards, this.stars]);
    // Charge-up in the start chamber: motes drawn into the waiting spark.
    this.charge = this.add
      .particles(0, SPARK_Y, 'oyun-dot', {
        lifespan: 520,
        emitZone: { type: 'edge', source: new Phaser.Geom.Circle(0, 0, 130), quantity: 24 },
        moveToX: 0,
        moveToY: 0,
        scale: { start: 0.2, end: 0.7 },
        alpha: { start: 0, end: 1 },
        frequency: 45,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(10);

    // Dark sections: darkness with a hole of light around (and ahead of) the spark.
    this.dark = this.add.image(0, 0, 'dark-hole').setDepth(9.5).setDisplaySize(1700, 2400).setVisible(false);
    // Mirror sections: the twin flies mirrored.
    this.twinGlow = this.add.image(0, SPARK_Y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(10).setVisible(false).setTint(0xc8b8ff);
    this.twin = this.add.image(0, SPARK_Y, 'spark-0').setDepth(11).setVisible(false).setAlpha(0.85).setTint(0xd8ccff);
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
    // A dark gradient behind the HUD band keeps it readable over bars and labels; hazards
    // passing under it stay visible (dimmed), and world labels fade out before reaching it.
    this.hudShade = this.add.image(0, 0, 'hud-shade').setOrigin(0, 0).setDisplaySize(L.width, L.top + 300).setDepth(95);
    this.shaft.sparkScreenY = SPARK_Y;
    this.shaft.hudBottom = L.top + 230;
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
    // Flow meter: five pips under the level chip.
    this.flowPips = this.add.graphics();
    this.flowText = bigText(this, L.left + 88, top + 150, '', 22, PALETTE.gold);
    // Boss health (boss levels only), in place of the attempt line.
    const bossLabel = bigText(this, cx, top + 200, '', 24, 0xff8aa0);
    this.boss = new Boss(this, L.cx, L.top + 470, bossLabel);
    this.hud.add([pill, this.chip, this.barBg, this.barFill, this.barBest, this.pctText, this.attemptText, ...this.gemSlots, this.edgeText, this.gateText, this.gateSub, this.flipTag, this.cue, this.flowPips, this.flowText, this.boss.bar, bossLabel]);
    this.pauseBtn = iconButton(this, L.right - 70, top + 70, 'pause', () => this.openPauseMenu());
    this.pauseBtn.setDepth(101);
  }

  /**
   * The title is a launch bay built over the live shaft:
   *   a neon sign bolted across the shaft (logo, tagline) · your rank chip, top left
   *   the level plate and a big PLAY capsule with a fuse spark running round it
   *   the ignition ring around the waiting spark (a press anywhere outside the menu starts the run)
   *   a glass control deck at the bottom: Levels, Shop, Endless, Daily, each with a live status.
   */
  private buildTitle(): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(200);
    this.titleUi = c;
    const CYAN = 0x3ff6ff;

    // ── The sign: a dark band across the shaft with two cyan tubes, the logo riding on it.
    const sign = this.add.container(L.cx, L.top + SIGN_Y);
    this.logoGroup = sign;
    const bw = L.width + 60;
    const bh = 176;
    const band = this.add.graphics().setAngle(-5);
    band.fillStyle(PALETTE.ink, 0.66).fillRect(-bw / 2, -bh / 2, bw, bh);
    band.fillStyle(0xff2d95, 0.14).fillRect(-bw / 2, -bh / 2, bw, bh * 0.45);
    band.fillStyle(0x000000, 0.18).fillRect(-bw / 2, bh * 0.2, bw, bh * 0.3);
    const tubes = this.add.graphics().setAngle(-5);
    for (const sy of [-bh / 2, bh / 2]) {
      tubes.lineStyle(18, CYAN, 0.2).lineBetween(-bw / 2, sy, bw / 2, sy);
      tubes.lineStyle(6, CYAN, 1).lineBetween(-bw / 2, sy, bw / 2, sy);
      tubes.lineStyle(2, 0xffffff, 0.9).lineBetween(-bw / 2, sy, bw / 2, sy);
    }
    this.signTubes = tubes;
    // light running along the tubes
    const runners = this.add.container(0, 0).setAngle(-5);
    this.signRunners = [-bh / 2, bh / 2].map((sy) => this.add.image(0, sy, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xbffcff).setDisplaySize(150, 46));
    runners.add(this.signRunners);
    const logoGlow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(720, 260).setAlpha(0.45).setTint(0xffb03b);
    const logo = bigText(this, 0, -4, this.t('title.logo'), 112, PALETTE.white).setAngle(-5);
    logo.setStroke('#14062b', 22);
    fitText(logo, L.width - 80, 112);
    const grad = logo.context.createLinearGradient(0, 20, 0, logo.height - 20);
    grad.addColorStop(0, '#fffbe0');
    grad.addColorStop(0.45, '#ffe14d');
    grad.addColorStop(1, '#ff7a1a');
    logo.setFill(grad);
    this.logoLetters = [logo];
    this.logoShine = this.add.image(0, 0, 'w-beam').setBlendMode(Phaser.BlendModes.ADD).setScale(2.2, 0.7).setAngle(20).setAlpha(0.8);
    const tag = fitText(bigText(this, 0, bh / 2 + 62, this.t('title.tagline'), 34), L.width - 120);
    sign.add([band, logoGlow, tubes, runners, logo, this.logoShine, tag]);

    // ── Rank chip (top left; opens the rank ladder).
    this.titleRank = this.add.image(0, 0, 'badge-0').setScale(0.36);
    this.titleRankText = bigText(this, 0, -14, '', 30, PALETTE.gold).setOrigin(0, 0.5);
    this.titleRankScore = bigText(this, 0, 20, '', 22).setOrigin(0, 0.5);
    this.rankChipX = L.left + 24 + 140;
    this.rankChip = new NeonButton(this, this.rankChipX, L.top + 70, 280, 84, 0xc35bff, () => this.menuGo(() => this.leave(SCENES.ranks)));
    this.rankChip.add([this.titleRank, this.titleRankText, this.titleRankScore]);

    // ── Launch: level plate, the PLAY capsule, the ignition ring round the spark.
    const playY = SPARK_Y - 226;
    this.levelPlate = this.add.graphics();
    this.titleLevel = bigText(this, L.cx, playY - 112, '', 34, PALETTE.gold).setOrigin(0, 0.5);
    this.titleBest = bigText(this, L.cx, playY - 112, '', 28).setOrigin(0, 0.5);
    this.titlePlate = this.add.container(0, 0, [this.levelPlate, this.titleLevel, this.titleBest]);

    const pw = 404;
    const ph = 124;
    this.playW = pw;
    this.playH = ph;
    const play = this.add.container(L.cx, playY);
    this.playBtn = play;
    const halo = this.add.image(0, 6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb03b).setDisplaySize(pw + 260, ph + 170).setAlpha(0.7);
    const pg = this.add.graphics();
    pg.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(-pw / 2, -ph / 2 + 12, pw, ph, ph / 2);
    pg.fillStyle(0xff7a1a, 1).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
    pg.fillStyle(0xffd23d, 1).fillRoundedRect(-pw / 2, -ph / 2, pw, ph - 14, (ph - 14) / 2);
    pg.fillStyle(0xfff6b0, 0.55).fillRoundedRect(-pw / 2 + 26, -ph / 2 + 10, pw - 52, ph * 0.3, ph * 0.15);
    pg.lineStyle(7, PALETTE.ink, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
    const label = fitText(bigText(this, 0, -4, this.t('menu.play'), 76), pw - 150, 76);
    const tri = this.add.graphics();
    const lw = label.displayWidth;
    const total = 46 + 16 + lw;
    const tx = -total / 2 + 20;
    tri.fillStyle(PALETTE.ink, 1).fillTriangle(tx - 22, -34, tx - 22, 26, tx + 30, -4);
    tri.fillStyle(0xffffff, 1).fillTriangle(tx - 15, -24, tx - 15, 16, tx + 18, -4);
    label.setX(-total / 2 + 46 + 16 + lw / 2);
    this.fuse = this.add.particles(0, 0, 'oyun-dot', {
      lifespan: { min: 260, max: 520 },
      speed: { min: 20, max: 110 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffe14d, 0xff8a1a],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.fuseGlow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff1a8).setScale(0.5);
    play.add([halo, pg, tri, label, this.fuse, this.fuseGlow]);

    const ringA = this.add.graphics({ x: L.cx, y: SPARK_Y });
    const R = 128;
    ringA.lineStyle(2, 0xffffff, 0.35).strokeCircle(0, 0, R);
    for (let k = 0; k < 3; k++) {
      const a0 = (k * 120 * Math.PI) / 180;
      const a1 = a0 + (74 * Math.PI) / 180;
      ringA.lineStyle(16, PALETTE.gold, 0.22).beginPath().arc(0, 0, R, a0, a1).strokePath();
      ringA.lineStyle(6, PALETTE.gold, 1).beginPath().arc(0, 0, R, a0, a1).strokePath();
      // a bright head on each arc
      ringA.fillStyle(0xffffff, 1).fillCircle(Math.cos(a1) * R, Math.sin(a1) * R, 5);
    }
    const ringB = this.add.graphics({ x: L.cx, y: SPARK_Y });
    for (let k = 0; k < 36; k++) {
      const a0 = (k * 10 * Math.PI) / 180;
      ringB.lineStyle(4, CYAN, k % 9 === 0 ? 1 : 0.55).beginPath().arc(0, 0, R - 18, a0, a0 + (4.5 * Math.PI) / 180).strokePath();
    }
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const x = Math.cos(a);
      const y = Math.sin(a);
      ringB.lineStyle(4, CYAN, 0.9).lineBetween(x * (R + 10), y * (R + 10), x * (R + 26), y * (R + 26));
    }
    this.ringA = ringA;
    this.ringB = ringB;

    // ── Control deck.
    const cw = Math.min(326, (L.width - 72) / 2);
    const ch = 82;
    const rowB = L.bottom - 64;
    const rowA = rowB - 94;
    this.deckTop = rowA - ch / 2 - 22;
    const deck = this.add.container(0, 0);
    this.deck = deck;
    const dg = this.add.graphics();
    const top = this.deckTop;
    const chamfer = 40;
    const V = Phaser.Math.Vector2;
    const pts = [new V(0, top + chamfer), new V(chamfer, top), new V(L.width - chamfer, top), new V(L.width, top + chamfer), new V(L.width, L.height + 40), new V(0, L.height + 40)];
    dg.fillStyle(PALETTE.ink, 0.8).fillPoints(pts, true);
    dg.fillStyle(0x6a3dff, 0.12).fillRect(0, top + chamfer, L.width, 60);
    const edge = pts.slice(0, 4);
    dg.lineStyle(16, 0xff4fd8, 0.2).strokePoints(edge, false);
    dg.lineStyle(5, 0xff4fd8, 1).strokePoints(edge, false);
    dg.lineStyle(1.5, 0xffffff, 0.85).strokePoints(edge, false);
    this.deckRunner = this.add.image(0, top, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc8f4).setDisplaySize(170, 50);
    deck.add([dg, this.deckRunner]);
    const xl = L.cx - cw / 2 - 10;
    const xr = L.cx + cw / 2 + 10;
    const go = (fn: () => void) => () => this.menuGo(fn);
    const levels = new MenuCard(this, xl, rowA, cw, ch, 'ic-levels', this.t('title.levels'), 0x5aa8ff, 0x2a6bff, go(() => this.leave(SCENES.levels)));
    const skins = new MenuCard(this, xr, rowA, cw, ch, 'ic-skins', this.t('title.skins'), 0x3dffb0, 0x16b886, go(() => this.leave(SCENES.skins)));
    this.endlessTile = new MenuCard(this, xl, rowB, cw, ch, 'ic-endless', this.t('title.endless'), 0xff6fb5, 0xff3d8b, go(() => this.openEndless()));
    const daily = new MenuCard(this, xr, rowB, cw, ch, 'ic-daily', this.t('title.daily'), 0xffaa4a, 0xff8a1a, go(() => this.openDaily()));
    this.titleCards = [levels, skins, this.endlessTile, daily];
    deck.add(this.titleCards);
    // Order kept for the test hooks: levels, endless, daily, skins, ranks.
    this.titleTiles = [levels, this.endlessTile, daily, skins, this.rankChip];

    c.add([ringA, ringB, sign, this.titlePlate, play, deck, this.rankChip]);
    this.muteBtn = muteButton(this, L.right - 70, L.top + 70);
    this.muteBtn.setDepth(201);
    this.homeTile = new IconTile(this, L.left + 70, L.top + 70, 'ic-back', null, () => this.goHome(), { radius: 46, color: PALETTE.ui });
    this.homeTile.setDepth(201);
  }

  /** Menu actions only while the title is up (not during its exit, once a run has started). */
  private menuGo(fn: () => void): void {
    if (this.phase !== 'title' || this.leaving) return;
    fn();
  }

  /** Entrance: the sign drops in and flickers on, the deck slides up, the launch pops in. */
  private enterTitle(): void {
    const L = this.layout;
    const tw = this.tweens;
    for (const p of [this.logoGroup, this.signTubes, this.rankChip, this.titlePlate, this.playBtn, this.ringA, this.ringB, this.deck, ...this.titleCards]) tw.killTweensOf(p);
    this.titleUi.setVisible(true).setAlpha(1);
    const flicker = (k: number): number => (k < 0.25 ? 0 : k < 0.32 ? 1 : k < 0.42 ? 0.15 : k < 0.55 ? 1 : k < 0.6 ? 0.4 : 1);
    this.logoGroup.setPosition(L.cx, L.top + SIGN_Y - 240).setAlpha(1);
    tw.add({ targets: this.logoGroup, y: L.top + SIGN_Y, duration: 640, ease: 'Back.easeOut' });
    this.signTubes.setAlpha(0);
    tw.add({ targets: this.signTubes, alpha: 1, duration: 900, delay: 200, ease: flicker });
    this.rankChip.setX(-260).setScale(1);
    tw.add({ targets: this.rankChip, x: this.rankChipX, duration: 520, delay: 260, ease: 'Cubic.easeOut' });
    this.titlePlate.setAlpha(0).setY(-20);
    tw.add({ targets: this.titlePlate, alpha: 1, y: 0, duration: 360, delay: 420, ease: 'Cubic.easeOut' });
    this.playBtn.setScale(0.2).setAlpha(0);
    tw.add({ targets: this.playBtn, scale: 1, alpha: 1, duration: 560, delay: 320, ease: 'Back.easeOut' });
    for (const r of [this.ringA, this.ringB]) {
      r.setScale(2).setAlpha(0);
      tw.add({ targets: r, scale: 1, alpha: 1, duration: 520, delay: 160, ease: 'Cubic.easeOut' });
    }
    this.deck.setY(L.height - this.deckTop + 40);
    tw.add({ targets: this.deck, y: 0, duration: 520, delay: 80, ease: 'Cubic.easeOut' });
    this.titleCards.forEach((card, i) => {
      card.setScale(0.6).setAlpha(0);
      tw.add({ targets: card, scale: 1, alpha: 1, duration: 420, delay: 300 + i * 70, ease: 'Back.easeOut' });
    });
  }

  /** Exit when a run (or a mode's ready screen) takes over: everything flies off, the ring blows out. */
  private exitTitle(): void {
    const L = this.layout;
    const tw = this.tweens;
    for (const p of [this.logoGroup, this.signTubes, this.rankChip, this.titlePlate, this.playBtn, this.ringA, this.ringB, this.deck, ...this.titleCards]) tw.killTweensOf(p);
    for (const card of this.titleCards) card.setScale(1).setAlpha(1);
    this.signTubes.setAlpha(1);
    tw.add({ targets: this.logoGroup, y: this.logoGroup.y - 220, duration: 240, ease: 'Quad.easeIn' });
    tw.add({ targets: this.logoGroup, alpha: 0, duration: 220 });
    tw.add({ targets: this.rankChip, x: -260, duration: 220, ease: 'Cubic.easeIn' });
    tw.add({ targets: this.titlePlate, alpha: 0, duration: 120 });
    tw.add({ targets: this.playBtn, scale: 1.4, alpha: 0, duration: 200, ease: 'Cubic.easeOut' });
    tw.add({ targets: [this.ringA, this.ringB], scale: 2.4, alpha: 0, duration: 260, ease: 'Cubic.easeOut' });
    tw.add({
      targets: this.deck,
      y: L.height - this.deckTop + 40,
      duration: 260,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        if (this.phase !== 'title') this.titleUi.setVisible(false);
      },
    });
  }

  /** Idle life of the title (drawing only). */
  private animateTitle(now: number, pulse: number): void {
    if (!this.titleUi.visible || !this.fx) return;
    const logo = this.logoLetters[0]!;
    logo.setScale(1 + 0.06 * pulse).setAngle(-5 + Math.sin(now / 700) * 2);
    const sweep = (now / 2400) % 1;
    this.logoShine.setX(-420 + sweep * 840).setAlpha(sweep < 0.75 ? 0.85 : 0);
    const bw = this.layout.width + 60;
    const run = (now / 2200) % 1;
    this.signRunners[0]!.setX(-bw / 2 + run * bw);
    this.signRunners[1]!.setX(bw / 2 - run * bw);
    if (!this.tweens.isTweening(this.signTubes)) {
      const f = now % 5300;
      this.signTubes.setAlpha(f < 70 ? 0.3 : f < 140 ? 1 : f < 190 ? 0.55 : 1);
    }
    if (this.phase === 'title' && !this.tweens.isTweening(this.playBtn)) this.playBtn.setScale(1 + 0.03 * Math.sin(now / 280) + 0.035 * pulse);
    // the fuse: a spark running round the PLAY capsule, shedding embers
    const r = this.playH / 2;
    const s = this.playW - this.playH;
    let d = ((now / 2600) % 1) * (2 * s + 2 * Math.PI * r);
    let x: number;
    let y: number;
    if (d < s) {
      x = -s / 2 + d;
      y = -r;
    } else if ((d -= s) < Math.PI * r) {
      const a = -Math.PI / 2 + d / r;
      x = s / 2 + Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else if ((d -= Math.PI * r) < s) {
      x = s / 2 - d;
      y = r;
    } else {
      const a = Math.PI / 2 + (d - s) / r;
      x = -s / 2 + Math.cos(a) * r;
      y = Math.sin(a) * r;
    }
    this.fuseGlow.setPosition(x, y).setScale(0.42 + 0.12 * Math.sin(now / 45));
    if (this.phase === 'title') this.fuse.emitParticleAt(x, y, 2);
    if (!this.tweens.isTweening(this.ringA)) {
      const k = 1 + 0.05 * pulse;
      this.ringA.setRotation(now * 0.0007).setScale(k);
      this.ringB.setRotation(-now * 0.0011).setScale(k);
    }
    this.deckRunner.setX(((now / 1900) % 1) * (this.layout.width + 200) - 100);
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
    this.continueBtn = button(this, L.cx, L.bottom - 150, this.t('dead.continue'), () => void this.continueRun(), { width: 380, height: 104, fontSize: 40, variant: 'secondary', ad: true });
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
    this.finishRays = this.add.image(L.cx, L.cy - 250, 'w-rays').setBlendMode(Phaser.BlendModes.ADD).setScale(1.2).setTint(PALETTE.gold).setAlpha(0.9);
    const pct = bigText(this, L.cx, L.cy - 262, '100%', 150);
    this.finishGems = bigText(this, L.cx + 30, L.cy - 56, '', 56, PALETTE.gem);
    const gemIcon = this.add.image(L.cx - 60, L.cy - 56, 'gem').setScale(0.9);
    this.finishStyle = bigText(this, L.cx, L.cy + 2, '', 30, PALETTE.gold);
    this.finishBonus = bigText(this, L.cx, L.cy + 40, '', 28, PALETTE.white);
    for (let k = 0; k < 3; k++) this.finishStars.push(this.add.image(L.cx + (k - 1) * 96, L.cy - 138, 'star-off').setScale(1.5));
    this.finishNext = fitText(bigText(this, L.cx, L.cy + 170, this.t('finish.next'), 56), L.width - 120);
    this.tweens.add({ targets: this.finishNext, scale: 1.08, alpha: 0.8, yoyo: true, repeat: -1, duration: 400, ease: 'Sine.easeInOut' });
    this.doubleBtn = button(this, L.cx, L.bottom - 170, this.t('finish.double'), () => void this.doubleGems(), { width: 440, height: 104, fontSize: 40, ad: true });
    const adIcon = this.add.image(-180, 0, 'ic-ad').setScale(0.6).setTint(PALETTE.ink);
    this.doubleBtn.add(adIcon);
    c.add([band, this.finishRays, this.finishTitle, pct, gemIcon, this.finishGems, this.finishStyle, this.finishBonus, ...this.finishStars, this.finishNext, this.doubleBtn]);
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
    this.worldFx.setTheme(this.mode === 'level' ? levelInfo(this.level).theme : ENDLESS_THEMES[0], this.pal);
    this.edgeFx.color = this.pal.edge;
    this.shaft.setTrack(this.track, this.pal);
    this.mech.setTrack(this.track, this.pal);
    this.shaft.showFinish = this.mode === 'level';
    const boss = this.mode === 'level' && isBoss(this.level);
    this.boss.setLevel(worldOf(this.level), boss);
    if (boss) fitText(this.boss.label.setText(`${this.t('boss.fight')} · ${this.t(`boss.${worldOf(this.level)}` as 'boss.1')}`), 420, 24);
    this.bossSections = Math.max(1, this.track.sections.filter((x) => x.scored).length);
    // Where each mechanic first shows up in this track (one-time cues).
    const tr = this.track;
    const firstY: Record<Mechanic, number> = {
      split: tr.pills.find((p) => p.amp === 0)?.y ?? Infinity,
      piston: tr.pills.find((p) => p.amp > 0)?.y ?? Infinity,
      laser: tr.lasers.find((l) => l.duty < 1)?.y ?? Infinity,
      spin: tr.spinners[0]?.y ?? Infinity,
      wind: tr.winds[0]?.y0 ?? Infinity,
      dark: tr.darks[0]?.y0 ?? Infinity,
      portal: tr.portals[0]?.y ?? Infinity,
      mirror: tr.mirrors[0]?.y0 ?? Infinity,
    };
    this.mechAt = MECHANICS.map((m) => ({ m, y: firstY[m] })).filter((e) => Number.isFinite(e.y)).sort((a, b) => a.y - b.y);
    this.music.theme = this.mode === 'level' ? levelInfo(this.level).theme : 4;
    const save = gameSave(this.oyun).data;
    this.attempts = this.mode === 'level' ? save.levels[this.level - 1]!.attempts : 0;
  }

  private applySkin(): void {
    const s = gameSave(this.oyun).data.skin;
    this.spark.setTexture(`spark-${s.shape}`);
    this.twin.setTexture(`spark-${s.shape}`);
    // A trail on trial (from the shop) is worn for one run.
    const tr = TRAILS[this.trial >= 0 ? this.trial : s.trail] ?? TRAILS[0]!;
    this.trail.head0 = tr.head;
    this.trail.tail0 = tr.tail;
    this.trail.rainbow = false;
    this.trail.style = this.fx ? tr.style : 'ribbon';
    this.colorShift = this.fx && COLOR_SHIFT_STYLES.includes(tr.style);
    this.demoTrail.head0 = tr.head;
    this.demoTrail.tail0 = tr.tail;
    this.demoTrail.rainbow = this.trail.rainbow;
    this.demoTrail.style = this.trail.style;
    this.fallSparks.setParticleTint(tr.head);
    this.shapeIdx = s.shape;
    this.sparkGlow.setTint(tr.tail);
    this.embers.setParticleTint(tr.tail);
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
    this.edgeFx.clear();
    this.lastMilestone = 0;
    this.speedK = 1;
    this.flowPts = 0;
    this.setFlow(0);
    this.bestFlowRun = 0;
    this.sectionIdx = 0;
    this.sectionNear = 0;
    this.pctMark = 0;
    this.mechCueIdx = 0;
    this.boss.reset();
    this.twin.setVisible(false);
    this.twinGlow.setVisible(false);
    this.applySkin();
  }

  /** Flow level 0..FLOW_MAX: the world escalates with it (music layers, colours, the trail). */
  private setFlow(level: number): void {
    const prev = this.flow;
    this.flow = level;
    if (level > this.bestFlowRun) this.bestFlowRun = level;
    const L = this.layout;
    const g = this.flowPips;
    g.clear();
    const x0 = L.left + 36;
    const y = L.top + 122;
    for (let k = 0; k < FLOW_MAX; k++) {
      const on = k < level;
      const x = x0 + k * 26;
      g.fillStyle(PALETTE.ink, 0.6).fillTriangle(x, y - 11, x + 11, y, x, y + 11).fillTriangle(x, y - 11, x - 11, y, x, y + 11);
      g.fillStyle(on ? (level >= FLOW_MAX ? PALETTE.gold : this.pal.edge) : 0xffffff, on ? 1 : 0.25).fillTriangle(x, y - 8, x + 8, y, x, y + 8).fillTriangle(x, y - 8, x - 8, y, x, y + 8);
    }
    this.flowText.setText(level > 0 ? this.t('hud.flow', { n: level }) : '');
    this.trail.length = TRAIL_LEN * (1 + 0.12 * level);
    this.worldFx.boost = 1 + 0.14 * level;
    if (level > prev && this.phase === 'playing') {
      this.juice.pop(this.flowText, 1.5);
      this.oyun.audio.play('coin', { pitch: 4 + level * 2, volume: 0.6 });
      if (level >= FLOW_MAX) this.callout(this.t('call.flowMax'), PALETTE.gold);
    }
  }

  /** A short callout in the top band, unless a gate banner is showing. */
  private callout(text: string, color: number): void {
    if (this.gateText.alpha > 0.15) return;
    this.flashGateText(text, '', color, 52);
  }

  // ───────────────────────────────────────────────────────────── phases

  private showPhase(p: Phase): void {
    const from = this.phase;
    this.phase = p;
    const playingish = p === 'playing' || p === 'dead' || p === 'finishing' || p === 'finished';
    if (p === 'title') {
      this.refreshTitle();
      this.enterTitle();
    } else if (from === 'title' && this.titleUi.visible) this.exitTitle();
    else this.titleUi.setVisible(false);
    this.muteBtn.setVisible(p === 'title' || p === 'ready' || p === 'dead' || p === 'finished');
    this.homeTile.setVisible(p === 'ready' || p === 'dead' || p === 'finished');
    this.readyUi.setVisible(p === 'ready');
    this.resumeUi.setVisible(p === 'resume');
    this.deadUi.setVisible(p === 'dead');
    this.finishUi.setVisible(p === 'finished');
    this.hud.setVisible(p === 'playing' || p === 'finishing' || p === 'resume');
    this.hudShade.setVisible(this.hud.visible);
    void playingish;
    this.setLetterbox();
    this.pauseBtn.setVisible(p === 'playing');
    if (p !== 'playing') {
      this.tweens.killTweensOf(this.hint);
      this.hint.setAlpha(0);
    }
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
    const L = this.layout;
    const save = gameSave(this.oyun).data;
    // Level plate: "LEVEL n · Best x%" on a dark pill above the PLAY capsule.
    this.titleLevel.setText(this.t('title.level', { n: this.level }));
    const best = save.levels[this.level - 1]!.best;
    this.titleBest.setText(best > 0 ? this.t('dead.best', { n: best }) : '');
    const gap = best > 0 ? 18 : 0;
    const pw = this.titleLevel.displayWidth + gap + this.titleBest.displayWidth;
    const px = L.cx - pw / 2;
    this.titleLevel.setX(px);
    this.titleBest.setX(px + this.titleLevel.displayWidth + gap);
    const py = this.titleLevel.y;
    this.levelPlate
      .clear()
      .fillStyle(PALETTE.ink, 0.62)
      .fillRoundedRect(px - 28, py - 30, pw + 56, 60, 30)
      .lineStyle(2, PALETTE.gold, 0.6)
      .strokeRoundedRect(px - 28, py - 30, pw + 56, 60, 30);
    // Deck cards: a live line under each.
    const [levels, skins, endless, daily] = this.titleCards as [MenuCard, MenuCard, MenuCard, MenuCard];
    levels.setSub(this.t('menu.stars', { n: totalStars(save) }));
    skins.setSub(this.t('menu.gems', { n: save.gems }));
    const unlocked = endlessUnlocked(save);
    endless.setIcon(unlocked ? 'ic-endless' : 'ic-lock').setSub(unlocked ? (save.endlessBest > 0 ? this.t('dead.height', { n: save.endlessBest }) : this.t('menu.new')) : this.t('menu.locked'));
    const today = save.daily.date === dailyKey(new Date());
    daily.setSub(!today ? this.t('menu.dailyNew') : save.daily.streak > 1 ? this.t('menu.streak', { n: save.daily.streak }) : this.t('daily.best', { n: save.daily.best }));
    // Rank chip: badge, rank name in its colour, points; sized to its text, clear of the mute button.
    const score = progressScore(save);
    const r = rankOf(score);
    const col = RANKS[r]!.color;
    this.titleRank.setTexture(`badge-${r}`);
    this.titleRankText.setText(this.t(`rank.${RANKS[r]!.id}` as 'rank.ember')).setColor(`#${col.toString(16).padStart(6, '0')}`);
    this.titleRankScore.setText(this.t('rank.score', { n: score }));
    const bw = this.titleRank.displayWidth;
    const maxText = L.right - 150 - (L.left + 24) - (16 + bw + 12 + 24);
    fitText(this.titleRankText, maxText, 30);
    fitText(this.titleRankScore, maxText, 22);
    const w = Math.max(220, 16 + bw + 12 + Math.max(this.titleRankText.displayWidth, this.titleRankScore.displayWidth) + 24);
    this.rankChip.reshape(w, 84, mix(col, 0xffffff, 0.15));
    this.rankChipX = L.left + 24 + w / 2;
    this.rankChip.setX(this.rankChipX);
    this.titleRank.setX(-w / 2 + 16 + bw / 2);
    this.titleRankText.setX(-w / 2 + 16 + bw + 12);
    this.titleRankScore.setX(-w / 2 + 16 + bw + 12);
  }

  /** Award achievements, earned trails and rank-ups after a save change; show what was gained. */
  private settleMeta(rankBefore: number): void {
    let gain: MetaGain | null = null;
    gameSave(this.oyun).update((d) => void (gain = settle(d, rankBefore)));
    const g = gain as MetaGain | null;
    if (!g) return;
    const msgs: string[] = [];
    for (const i of g.achievements) msgs.push(this.t('ach.got', { name: this.t(`ach.${ACHIEVEMENTS[i]!.id}` as 'ach.first'), n: ACHIEVEMENTS[i]!.gems }));
    for (const i of g.trails) msgs.push(this.t('trail.new', { name: this.t(`trail.${TRAILS[i]!.id}` as 'trail.white') }));
    if (msgs.length) {
      toast(this, msgs.slice(0, 3).join('\n'), { position: 'bottom' });
      this.oyun.audio.play('win', { volume: 0.5, pitch: 5 });
    }
    if (g.rankTo > g.rankFrom) this.showRankUp(g.rankTo);
  }

  /** Rank-up ceremony across the top of the screen (never blocks the retry or the next tap). */
  private showRankUp(rank: number): void {
    const L = this.layout;
    this.rankUp?.destroy();
    const col = RANKS[rank]!.color;
    const rays = this.add.image(0, 0, 'w-rays').setBlendMode(Phaser.BlendModes.ADD).setTint(col).setScale(0.6).setAlpha(0.9);
    const glow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(col).setScale(2.4);
    const badge = this.add.image(0, 0, `badge-${rank}`).setScale(0.62);
    const title = bigText(this, 70, -22, this.t('rank.up'), 40, PALETTE.gold).setOrigin(0, 0.5);
    const name = bigText(this, 70, 22, this.t(`rank.${RANKS[rank]!.id}` as 'rank.ember'), 36, col).setOrigin(0, 0.5);
    fitText(title, L.width - 360, 40);
    fitText(name, L.width - 360, 36);
    const c = this.add.container(L.cx - 110, L.top + 88, [rays, glow, badge, title, name]).setDepth(260);
    this.rankUp = c;
    c.setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: rays, angle: 360, duration: 6000, repeat: -1 });
    this.tweens.add({ targets: c, alpha: 0, delay: 3200, duration: 400, onComplete: () => c.destroy() });
    this.confetti.explode(60, L.cx, L.top + 120);
    this.oyun.audio.playPreset(
      [
        { wave: 'triangle', freq: 523, freqEnd: 1046, duration: 0.25, gain: 0.3 },
        { wave: 'triangle', freq: 784, freqEnd: 1568, duration: 0.35, gain: 0.25 },
      ],
      { jitter: 0 },
    );
    this.oyun.platform.haptic('success');
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
    if (this.phase === 'title') {
      for (const t of this.titleTiles) if (t.hits(x, y)) return true;
      // the control deck is all menu: a press on its glass never starts a run
      if (y >= this.deckTop && this.deck.y < 40) return true;
    }
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
    this.simHash = 2166136261;
    // The attract-mode spark hands over to the real one.
    this.demoTrail.g.clear();
    this.charge.emitting = false;
    this.prevX = this.rx = this.sim.x;
    this.prevY = this.ry = this.sim.y;
    const save = gameSave(this.oyun);
    if (!save.data.played) save.update((d) => void (d.played = true));
    this.hintShown = this.mode === 'level' && this.level === 1 && this.attempts < 3;
    this.attempts += 1;
    this.runBest = this.mode === 'level' ? gameSave(this.oyun).data.levels[this.level - 1]!.best : -1;
    this.trialRun = this.trial >= 0;
    this.showPhase('playing');
    if (this.boss.active) this.flashGateText(this.t('boss.fight'), this.t(`boss.${worldOf(this.level)}` as 'boss.1'), 0xff5a7a, 64);
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

  /** A trail tried from the shop lasts one run. */
  private endTrial(): void {
    if (!this.trialRun) return;
    this.trialRun = false;
    this.trial = -1;
    this.registry.remove(TRIAL_KEY);
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
    const rankSeen = save.data.rankSeen;
    const date = dailyKey(new Date());
    let best = 0;
    let prevBest = 0;
    if (this.mode === 'level') {
      save.update((d) => {
        prevBest = d.levels[this.level - 1]!.best;
        this.newBest = recordLevelRun(d, this.level, { percent: pct, gemMask: sim.gemMask, finished: false, nearMisses: sim.nearMisses, date }).newBest;
        best = d.levels[this.level - 1]!.best;
      });
    } else if (this.mode === 'endless') {
      const h = Math.floor(sim.y / 10);
      save.update((d) => {
        prevBest = d.endlessBest;
        this.newBest = recordEndless(d, h, sim.gemsTaken, date).newBest;
        best = d.endlessBest;
      });
    } else {
      // Daily: its own best (never the endless record); each gem of the day's shaft pays once.
      const h = Math.floor(sim.y / 10);
      const taken: number[] = [];
      for (let i = 0; i < sim.taken.length; i++) if (sim.taken[i]) taken.push(i);
      let streakGems = 0;
      let streak = 0;
      save.update((d) => {
        prevBest = d.daily.date === this.dailyDate ? d.daily.best : 0;
        const r = recordDaily(d, this.dailyDate, h, taken);
        this.newBest = r.newBest;
        streakGems = r.streakGems;
        streak = r.streak;
        best = d.daily.best;
      });
      if (streakGems > 0) toast(this, this.t('daily.reward', { n: streak, g: streakGems }), { position: 'bottom' });
    }
    save.update((d) => recordStats(d, sim.bestEdge, this.bestFlowRun));
    this.endTrial();
    this.settleMeta(rankSeen);
    this.soClose = this.mode === 'level' && pct >= 85;
    this.bestDelta = this.newBest ? (this.mode === 'level' ? pct - prevBest : best - prevBest) : 0;
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
    // The badge: "so close" near the finish; otherwise a new best, sized by the improvement.
    if (this.soClose) this.deadBadge.setText(this.t('dead.soClose')).setVisible(true);
    else if (this.newBest && prevBest > 0 && this.mode === 'level') this.deadBadge.setText(this.t(this.bestDelta >= 30 ? 'dead.huge' : 'dead.better', { n: this.bestDelta })).setVisible(true);
    else this.deadBadge.setText(this.t('dead.newBest')).setVisible(this.newBest && prevBest > 0);
    fitText(this.deadBadge, this.layout.width - 60, 46);
    const canContinue = this.mode === 'level' && !this.continueUsed && this.gateSnap !== null;
    this.continueBtn.setVisible(canContinue).setEnabled(true);
  }

  private shatter(): void {
    this.shattered = true;
    // A twin that hits something shatters where the twin is.
    const x = this.sim.deathCause === 'twin' ? SHAFT_W - this.rx : this.rx;
    const y = -this.ry;
    this.spark.setVisible(false).clearTint().setScale(1);
    this.sparkGlow.setVisible(false);
    const tr = TRAILS[gameSave(this.oyun).data.skin.trail] ?? TRAILS[0]!;
    this.twin.setVisible(false);
    this.twinGlow.setVisible(false);
    // Each shape breaks its own way.
    const sh = SHATTER[this.fx ? this.shapeIdx : 3] ?? SHATTER[3]!;
    this.shards.setTexture(sh.tex);
    this.shards.setParticleSpeed(sh.speed[0], sh.speed[1]);
    this.shards.setParticleGravity(0, sh.gravity);
    this.shards.setParticleTint(0xffffff);
    this.shards.explode(Math.floor(sh.count * 0.45), x, y);
    this.shards.setParticleTint(tr.tail);
    this.shards.explode(Math.ceil(sh.count * 0.55), x, y);
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
    // Death overlay slams in: the card slides, the number counts up, the bar fills. Purely
    // visual; the retry is accepted from RETRY_LOCK_MS whatever is still animating.
    this.showPhase('dead');
    this.deadUi.setX(-80);
    this.tweens.add({ targets: this.deadUi, x: 0, duration: 160, ease: 'Cubic.easeOut' });
    this.deadPct.setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: this.deadPct, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    const finalText = this.deadPct.text;
    const target = parseInt(finalText, 10);
    if (Number.isFinite(target) && target > 0) {
      const counter = { v: 0 };
      this.tweens.add({
        targets: counter,
        v: target,
        duration: 240,
        ease: 'Cubic.easeOut',
        onUpdate: () => this.deadPct.setText(finalText.replace(String(target), String(Math.round(counter.v)))),
        onComplete: () => this.deadPct.setText(finalText),
      });
    }
    const barW = this.deadBarNow.displayWidth;
    this.deadBarNow.setDisplaySize(2, 32);
    this.tweens.add({ targets: this.deadBarNow, displayWidth: barW, duration: 300, delay: 60, ease: 'Cubic.easeOut' });
    if (this.newBest) {
      // Bigger improvements get bigger fanfares.
      const big = this.mode === 'level' ? this.bestDelta >= 30 : this.bestDelta >= 200;
      const mid = this.mode === 'level' ? this.bestDelta >= 10 : this.bestDelta >= 60;
      this.stars.setParticleTint(PALETTE.gold);
      this.stars.explode(big ? 40 : mid ? 28 : 18, this.rx, -this.ry);
      if (mid) this.oyun.audio.play('coin', { pitch: 9 });
      if (big) {
        this.confetti.explode(70, this.layout.cx, this.layout.cy - 300);
        this.oyun.audio.play('win', { volume: 0.7 });
      }
      this.juice.pop(this.deadBadge, big ? 1.8 : 1.3);
    }
    if (this.soClose) {
      // So close: the percentage slams in harder.
      this.deadPct.setScale(3.2);
      this.juice.shake(0.35);
      this.juice.pop(this.deadBadge, 1.6);
    }
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
    let stars = 0;
    let newStars = 0;
    let bonus = 0;
    let worldGems = 0;
    const rankSeen = save.data.rankSeen;
    save.update((d) => {
      const r = recordLevelRun(d, this.level, { percent: 100, gemMask: sim.gemMask, finished: true, nearMisses: sim.nearMisses, date: dailyKey(new Date()) });
      gained = r.gemsGained;
      newStars = r.newStars;
      bonus = r.starGems;
      worldGems = r.worldGems;
      stars = d.levels[this.level - 1]!.stars;
      all = d.levels.every((l) => l.done);
      recordStats(d, sim.bestEdge, this.bestFlowRun);
    });
    this.endTrial();
    this.settleMeta(rankSeen);
    this.gemsGainedThisFinish = gained;
    // Stars: earned ones lit; new ones pop in one after another.
    this.finishStars.forEach((img, k) => {
      const on = (stars & (1 << k)) !== 0;
      const fresh = (newStars & (1 << k)) !== 0;
      img.setTexture(on ? 'star-on' : 'star-off').setScale(1.5).setAngle(0);
      if (fresh) {
        img.setScale(0.1);
        this.tweens.add({ targets: img, scale: 1.5, angle: 360, delay: FINISH_SLOWMO_MS + 120 + k * 160, duration: 380, ease: 'Back.easeOut' });
        this.time.delayedCall(FINISH_SLOWMO_MS + 120 + k * 160, () => this.oyun.audio.play('coin', { pitch: 6 + k * 3 }));
      }
    });
    const bonusParts: string[] = [];
    if (bonus > 0) bonusParts.push(`${this.t('finish.newStars', { n: bonus / 2 })}  +${bonus} ◆`);
    if (worldGems > 0) bonusParts.push(this.t('finish.world', { n: worldGems }));
    fitText(this.finishBonus.setText(bonusParts.join('   ')), this.layout.width - 80, 28);
    if (this.boss.active) {
      this.boss.defeat();
      this.flashGateText(this.t('boss.down'), '', PALETTE.gold, 72);
      this.juice.shake(0.8);
    }
    this.doubled = false;
    this.oyun.platform.track('level_complete', { level: this.level, attempts: this.attempts, gems: sim.gemsTaken });
    // Burst through the ring.
    const x = this.rx;
    this.shaft.burstFinishLabel();
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
    fitText(this.finishTitle.setText(all && this.level === LEVEL_COUNT ? this.t('finish.all') : this.boss.active ? this.t('boss.down') : this.t('finish.title')), this.layout.width - 60);
    this.finishGems.setText(`+${gained + bonus + worldGems}`);
    this.finishStyle.setText(sim.style > 0 ? this.t('dead.style', { n: sim.style }) : '');
    fitText(this.finishNext.setText(this.level < LEVEL_COUNT && levelOpen(gameSave(this.oyun).data, this.level + 1) ? this.t('finish.next') : this.t('finish.again')), this.layout.width - 120);
    this.doubleBtn.setVisible(gained > 0).setEnabled(true);
  }

  private nextAfterFinish(time: number): void {
    if (this.advancing) return;
    this.advancing = true;
    const save = gameSave(this.oyun).data;
    // The next level, unless its world is still behind a star gate (then replay this one).
    const next = this.level < LEVEL_COUNT && levelOpen(save, this.level + 1) ? this.level + 1 : this.level;
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
      if (!stale) {
        this.continueBtn.setEnabled(true);
        if (outcome === 'unavailable') toast(this, this.t('core.noAd'), { position: 'bottom' });
      }
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
      if (this.finishId === finishId && this.phase === 'finished' && !this.leaving) {
        this.doubleBtn.setEnabled(true);
        if (outcome === 'unavailable') toast(this, this.t('core.noAd'), { position: 'bottom' });
      }
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
    this.stars.explode(10, this.sim.x, -this.sim.y);
    if (this.fx) {
      // The gate bursts along its whole width as you pass through it.
      const tr = this.track;
      const gy = this.sim.y;
      const si = segmentAt(tr.wy, gy);
      const l = wallXAt(tr.wy, tr.lx, si, gy);
      const r = wallXAt(tr.wy, tr.rx, si, gy);
      for (let k = 0; k <= 4; k++) this.sparks.explode(5, l + ((r - l) * k) / 4, -gy);
    }
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
    this.addFlow(1);
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

  private addFlow(pts: number): void {
    this.flowPts += pts;
    const lv = Math.min(FLOW_MAX, Math.floor(this.flowPts / 2));
    if (lv !== this.flow) this.setFlow(lv);
  }

  private onPortal(idx: number): void {
    const p = this.track.portals[idx]!;
    const sim = this.sim;
    // No interpolation across the jump; the trail starts again at the exit.
    this.prevX = this.rx = sim.x;
    this.trail.reset(sim.x, sim.y);
    const from = Math.abs(sim.x - p.xa) < Math.abs(sim.x - p.xb) ? p.xb : p.xa;
    this.sparks.setParticleTint(0x3ff6ff);
    this.sparks.explode(14, from, -p.y);
    this.sparks.explode(18, sim.x, -sim.y);
    this.ringBurst.setVisible(true).setPosition(sim.x, SPARK_Y).setScale(0.2).setAlpha(0.9).setTint(0x3ff6ff);
    this.tweens.killTweensOf(this.ringBurst);
    this.tweens.add({ targets: this.ringBurst, scale: 0.8, alpha: 0, duration: 260, ease: 'Cubic.easeOut' });
    this.oyun.audio.playPreset([{ wave: 'sine', freq: 300, freqEnd: 1400, duration: 0.18, gain: 0.25 }], { jitter: 0 });
    this.oyun.platform.haptic('light');
  }

  /** Sections passed: perfect callouts, flow, boss damage; percentage milestones; mechanic cues. */
  private onProgress(): void {
    const sim = this.sim;
    const secs = this.track.sections;
    while (this.sectionIdx < secs.length && sim.y >= secs[this.sectionIdx]!.y) {
      const sec = secs[this.sectionIdx]!;
      if (sec.scored && sim.nearMisses === this.sectionNear) {
        this.addFlow(1);
        this.callout(this.t('call.perfect'), 0x7dffb0);
      }
      this.sectionNear = sim.nearMisses;
      this.sectionIdx++;
      if (this.boss.active && sec.scored) {
        const done = secs.slice(0, this.sectionIdx).filter((x) => x.scored).length;
        this.boss.damage(1 - done / this.bossSections);
      }
    }
    if (this.mode === 'level') {
      const mark = Math.floor(sim.progress * 4);
      if (mark > this.pctMark && mark < 4) {
        this.pctMark = mark;
        // 25 / 50 / 75 %: the percentage swells, a chime, a ring on the bar.
        this.juice.pop(this.pctText, 1.6);
        this.oyun.audio.play('coin', { pitch: 3 + mark * 3, volume: 0.7 });
        const L = this.layout;
        this.stars.setParticleTint(PALETTE.gold);
        this.stars.explode(8 + mark * 4, sim.x, -sim.y);
        this.juice.floatText(L.cx - this.barW / 2 + (this.barW * mark) / 4, L.top + 150, this.t('call.pct', { n: mark * 25 }), { color: PALETTE.gold, size: 34 });
      }
    }
    // One-time cue when a mechanic first comes into view.
    while (this.mechCueIdx < this.mechAt.length && this.mechAt[this.mechCueIdx]!.y < sim.y + 760) {
      const m = this.mechAt[this.mechCueIdx]!.m;
      this.mechCueIdx++;
      const bit = 1 << MECHANICS.indexOf(m);
      const save = gameSave(this.oyun);
      if (save.data.cues & bit) continue;
      save.update((d) => void (d.cues |= bit));
      this.tweens.killTweensOf([this.gateText, this.gateSub]);
      this.gateText.setAlpha(0);
      this.flashGateText(this.t(`mech.${m}` as 'mech.split'), this.t(`mech.${m}Hint` as 'mech.splitHint'), 0x7dffff, 60);
      this.tweens.killTweensOf(this.gateSub);
      this.gateSub.setAlpha(1);
      this.tweens.add({ targets: this.gateSub, alpha: 0, delay: 2200, duration: 300 });
      this.tweens.killTweensOf(this.gateText);
      this.tweens.add({ targets: this.gateText, alpha: 0, delay: 1800, duration: 300 });
      this.oyun.audio.play('pop');
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
    if (this.fx) this.edgeFx.ripple(cy, cx < sim.x ? -1 : 1);
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

    // Title / ready: an attract-mode spark zigzags in place, drawing a short trail.
    const idlePhase = this.phase === 'title' || this.phase === 'ready';
    if (idlePhase && this.fx) {
      const v = 170;
      const ox = this.demoX;
      const oy = this.demoY;
      this.demoX += this.demoDir * v * realDt;
      this.demoY += v * realDt;
      let corner = false;
      if (Math.abs(this.demoX - 360) > 105) {
        this.demoDir = this.demoX > 360 ? -1 : 1;
        corner = true;
      }
      this.demoTrail.sample(ox, oy, corner);
      this.demoTrail.g.setPosition(0, SPARK_Y + this.demoY);
      this.demoTrail.draw(this.demoX, this.demoY, 0.85);
      this.rx = this.demoX;
    }
    this.charge.emitting = idlePhase && this.fx;
    this.charge.setPosition(this.rx, SPARK_Y);

    // Speed gates make the world run faster or calmer (smoothed).
    const targetK = this.phase === 'playing' || this.phase === 'resume' ? sim.speedMult : 1;
    this.speedK += (targetK - this.speedK) * Math.min(1, realDt * 3);
    this.shaft.sparkX = this.rx;
    this.shaft.gatesPassed = sim.gateIndex;

    // World scroll and the shaft.
    this.world.y = SPARK_Y + this.ry;
    if (this.mode !== 'level') this.updateEndlessTheme();
    // Bars at the same interpolated moment as the spark (one tick behind + alpha).
    const drawT = this.phase === 'playing' ? Math.max(0, sim.tick - 1 + alpha) * DT : sim.t;
    this.shaft.update(this.ry, drawT, sim.taken, pulse);
    const trailAlpha = this.phase === 'dead' ? Math.max(0, 1 - (now - this.deathAt) / 500) : 1;
    this.trail.boost = 1 + Math.min(0.6, sim.edge * 0.12) + this.flow * 0.07;
    this.trail.pulse = pulse;
    this.trail.draw(this.rx, this.ry, trailAlpha);
    this.mech.update(this.ry, this.rx, drawT, speed, pulse, now);
    // Dark sections: the light travels with the spark (and reaches well ahead of it).
    const dk = this.mech.darkness(this.ry);
    this.dark.setVisible(dk > 0.01).setAlpha(dk).setPosition(this.rx, SPARK_Y - 170);
    // Mirror sections: the twin.
    const twinOn = (this.phase === 'playing' || this.phase === 'resume' || (this.phase === 'dead' && !this.shattered)) && this.mech.inMirror(this.ry);
    this.twin.setVisible(twinOn);
    this.twinGlow.setVisible(twinOn);
    if (this.fx) this.edgeFx.update(this.track, this.ry, this.ry - 380, this.ry + 1000, pulse, realDt, this.speedK);
    this.updateMilestones();

    // Spark.
    const idle = this.phase === 'title' || this.phase === 'ready';
    const bob = idle ? Math.sin(now / 240) * 8 : 0;
    const r = sim.radius;
    const base = (r / SPARK_R) * 0.78;
    this.squash *= Math.pow(0.0005, realDt);
    const sx = base * (1 + this.squash * 0.6);
    const sy = base * (1 - this.squash * 0.4);
    if (this.phase !== 'dead') {
      // Each shape has its own idle life (drawing only).
      let ang = idle ? 0 : sim.dir * 30;
      let k = 1;
      let a = 1;
      if (this.fx) {
        switch (this.shapeIdx) {
          case 0:
            k = 1 + 0.07 * Math.sin(now / 110);
            break;
          case 1:
            ang += now * 0.09;
            break;
          case 2:
            ang += now * 0.2;
            break;
          case 3:
            ang += Math.sin(now / 55) * 7;
            break;
          case 4:
            ang = Math.floor(beatY / BEAT_PX) * 60;
            break;
          case 5:
            ang += now * 0.13;
            break;
          case 6:
            k = 1 + 0.16 * pulse;
            break;
          case 7:
            a = 0.82 + 0.18 * Math.sin(now / 37);
            break;
        }
      }
      this.spark.setPosition(this.rx, SPARK_Y + bob).setScale(sx * k, sy * k).setAngle(ang).setAlpha(a);
      if (sim.flipped) this.spark.setTint(GATE_COLORS.flip);
      else if (this.colorShift) this.spark.setTint(hue((now / 1400) % 1));
      else this.spark.clearTint();
      if (this.twin.visible) {
        this.twin.setPosition(SHAFT_W - this.rx, SPARK_Y).setScale(sx * k, sy * k).setAngle(-ang);
        this.twinGlow.setPosition(SHAFT_W - this.rx, SPARK_Y).setScale((r / SPARK_R) * (1.1 + pulse * 0.3));
      }
    } else if (!this.shattered) {
      this.spark.setPosition(this.rx, SPARK_Y);
    }
    this.sparkGlow.setPosition(this.rx, SPARK_Y + bob).setScale((r / SPARK_R) * (1.25 + pulse * 0.35 + Math.min(0.8, sim.edge * 0.15)));
    // Charge-up: rings keep closing in on the waiting spark; during the launch ramp the glow builds.
    const charge = idle ? 1 - ((now / 650) % 1) : 0;
    this.sparkHalo.setPosition(this.rx, SPARK_Y + bob).setAlpha(idle ? (0.3 + 0.6 * (1 - charge)) * (0.7 + pulse * 0.3) : 0).setScale(0.12 + charge * 0.3);
    this.edgeText.setX(Math.min(this.layout.width - 150, Math.max(150, this.rx)));
    this.flipTag.setVisible(sim.flipped && (this.phase === 'playing' || this.phase === 'resume')).setX(Math.min(this.layout.width - 90, Math.max(90, this.rx)));
    if (this.phase === 'playing') {
      this.embers.emitting = true;
      this.embers.setPosition(this.rx, -this.ry);
    }
    this.fallSparks.emitting = this.phase === 'playing' && this.trail.style === 'sparks';
    this.fallSparks.setPosition(this.rx, -this.ry);

    // Backdrop and music.
    const dyScreen = this.ry - this.lastRy + (idle ? speed * 0.3 * realDt : 0);
    this.lastRy = this.ry;
    const prog = this.mode === 'level' ? sim.progress : (this.ry % 6000) / 6000;
    this.backdrop.update(prog, dyScreen, pulse, speed, realDt);
    if (this.fx) this.worldFx.update(realDt, dyScreen, pulse, this.speedK);
    this.animateTitle(now, pulse);
    if (this.phase === 'finished') this.finishRays.rotation += realDt * 0.6;
    this.boss.update(this.rx, pulse, now, realDt, this.layout.cx - 200, this.layout.top + 220, 400);
    this.attemptText.setVisible(!this.boss.active);
    if (this.phase === 'playing') {
      this.music.intensity = this.mode === 'level' ? (sim.progress < 0.06 ? 1 : sim.progress < 0.3 ? 2 : 3) : Math.min(3, 1 + Math.floor(sim.y / 4000));
      if (sim.edge >= 2) this.music.intensity = 3;
      // Flow brings in extra layers.
      if (this.flow >= 2) this.music.intensity = Math.max(this.music.intensity, 3);
      if (this.flow >= 3) this.music.intensity = 4;
      if (this.flow >= FLOW_MAX) this.music.intensity = 5;
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
    this.simHash = Math.imul(this.simHash ^ Math.round(sim.x * 1000) ^ (sim.tick << 8) ^ (sim.alive ? 0 : 0x55555), 16777619) >>> 0;
    this.prevX = px;
    this.prevY = py;
    if (sim.dir !== pdir) {
      this.trail.sample(px, py, true);
      this.squash = Math.max(this.squash, 0.35);
    } else this.trail.sample(px, py, false);
    if (ev.portal >= 0 && !ev.died) this.onPortal(ev.portal);
    if (ev.gate) this.onGate(ev.gate);
    if (ev.gem >= 0) this.onGem(ev.gem);
    if (!ev.died) this.onProgress();
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

  /** Endless milestone markers across the shaft every MILESTONE_M metres, and a banner on passing. */
  private updateMilestones(): void {
    const on = this.mode !== 'level' && this.fx;
    const step = MILESTONE_M * 10;
    const first = Math.max(1, Math.ceil((this.ry - 380) / step));
    for (let i = 0; i < this.milestones.length; i++) {
      const k = first + i;
      const y = k * step;
      const text = this.milestones[i]!;
      const band = this.milestoneBands[i]!;
      const vis = on && y < this.ry + 1000;
      text.setVisible(vis);
      band.setVisible(vis);
      if (!vis) continue;
      const tr = this.track;
      const si = segmentAt(tr.wy, y);
      const l = wallXAt(tr.wy, tr.lx, si, y);
      const r = wallXAt(tr.wy, tr.rx, si, y);
      band.setPosition((l + r) / 2, -y).setSize(r - l, 24).setTint(PALETTE.gold);
      band.tilePositionX = this.time.now / 12;
      const label = this.t('hud.height', { n: k * MILESTONE_M });
      if (text.text !== label) text.setText(label);
      text.setPosition(r - 70, -y - 34);
    }
    if (this.mode !== 'level' && this.phase === 'playing') {
      const m = Math.floor(this.sim.y / step);
      if (m > this.lastMilestone) {
        this.lastMilestone = m;
        this.flashGateText(this.t('hud.height', { n: m * MILESTONE_M }), '', PALETTE.gold, 58);
        this.oyun.audio.play('coin', { pitch: 7 });
        this.oyun.platform.haptic('light');
      }
    }
  }

  private updateEndlessTheme(): void {
    const idx = Math.floor(this.ry / 6000) % ENDLESS_THEMES.length;
    if (idx === this.endlessThemeIdx) return;
    this.endlessThemeIdx = idx;
    this.pal = PALETTES[ENDLESS_THEMES[idx]!]!;
    this.backdrop.setPalette(this.pal);
    this.worldFx.setTheme(ENDLESS_THEMES[idx]!, this.pal);
    this.edgeFx.color = this.pal.edge;
    this.shaft.setPalette(this.pal);
    this.mech.setPalette(this.pal);
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
      simHash: this.simHash,
      fx: this.fx,
      motif: this.worldFx.motif,
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
      flow: this.flow,
      stars: this.mode === 'level' ? save.levels[this.level - 1]!.stars : 0,
      score: progressScore(save),
      rank: rankOf(progressScore(save)),
      achievements: save.achievements,
      boss: this.boss.active,
      bossHp: Math.round(this.boss.hp * 100) / 100,
      dark: Math.round(this.mech.darkness(this.ry) * 100) / 100,
      twin: this.twin.visible,
      trail: TRAILS[this.trial >= 0 ? this.trial : save.skin.trail]?.id ?? '',
      trial: this.trial,
      world: worldOf(this.level),
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
      ranks: () => this.titleTiles[4]?.fire(),
    };
  }
}
