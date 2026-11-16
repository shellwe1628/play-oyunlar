import { button, cssColor, iconButton, label, OyunScene, toast, type Button, type IconButton } from '@oyun/core';
import Phaser from 'phaser';
import { gameSave } from '../save';
import {
  BLOT_UNLOCK_AFTER,
  CAMPAIGN,
  dailyLevel,
  dateKey,
  levelMap,
  levelOptions,
  levelSpecs,
  starFlags,
  type LevelDef,
  type MatchOutcome,
} from '../sim/campaign';
import { MatchSim, type EndReason, type MatchEvent } from '../sim/match';
import { applyCampaignResult, applyDailyResult, blotUnlocked } from '../sim/progress';
import { RULES, growthPerTick } from '../sim/rules';
import { SFX } from '../sounds';
import { PALETTE } from '../textures';
import { BlotButton, CommitSlider, ReserveBar, ShareStrip } from '../view/hud';
import { InkMap } from '../view/inkmap';
import { drawDesk } from './Background';
import { SCENES } from './keys';

export interface GameData {
  /** 'c1'..'c8' or 'daily'. */
  level?: string;
  /** Daily sheet: the date it was opened for (a match crossing midnight still counts for it). */
  date?: string;
}

export interface ResultPayload {
  score: number;
  best: number;
  newBest: boolean;
  won: boolean;
  lines: string[];
  level: string;
  date?: string;
  stars: number;
  flags: [boolean, boolean, boolean];
  next: string | null;
  reason: EndReason;
  winner: number | null;
}

type TipKey = 'tap' | 'empty' | 'full' | 'attacked';

const TICK_S = 1 / RULES.tickHz;
/** Sim ticks the "You" ring and the start hint stay up (game time, so fast-forward clears them). */
const INTRO_TICKS = 40;
const HINT_TICKS = 120;

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function resolveLevel(id: string | undefined, date: string): LevelDef {
  if (id === 'daily') return dailyLevel(date);
  return CAMPAIGN.find((c) => c.id === id) ?? CAMPAIGN[0]!;
}

/**
 * One match. Draws the sim and forwards input; every rule lives in src/sim.
 * Test actions: attack {cell, percent}, tap {x, y}, auto-play {ticks, policy?}, fast-forward ticks,
 * commit {percent}, pause, speed, blot {cell}.
 */
export class GameScene extends OyunScene {
  protected override autoPause = true;
  private sim!: MatchSim;
  private view!: InkMap;
  private def!: LevelDef;
  private levelId = 'c1';
  private dailyDate = '';
  private strip!: ShareStrip;
  private bar!: ReserveBar;
  private slider!: CommitSlider;
  private blotBtn: BlotButton | null = null;
  private pauseButton!: IconButton;
  private speedButton!: Button;
  private hint: Phaser.GameObjects.Text | null = null;
  private you: Phaser.GameObjects.Text | null = null;
  private tipBox: Phaser.GameObjects.Container | null = null;
  private tipQueue: { key: TipKey; text: string }[] = [];
  private tipsShown = new Set<string>();
  private fx!: Phaser.GameObjects.Graphics;
  private acc = 0;
  private speed = 1;
  private finished = false;
  private live = false;
  private blotArmed = false;
  private adUsed = false;
  private lastHurt = 0;
  private lostSeen = 0;
  private attacked = false;
  private ripples: { x: number; y: number; t: number; color: number; r: number }[] = [];
  private crosses: { x: number; y: number; t: number }[] = [];
  private frameMs: number[] = [];

  constructor() {
    super(SCENES.game);
  }

  create(data: GameData = {}): void {
    const L = this.layout;
    const save = gameSave(this.oyun);
    this.levelId = data.level === 'daily' ? 'daily' : (data.level ?? 'c1');
    this.dailyDate = data.date ?? dateKey(new Date());
    this.def = resolveLevel(this.levelId, this.dailyDate);
    this.finished = false;
    this.live = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (this.live = false));
    this.acc = 0;
    this.blotArmed = false;
    this.adUsed = false;
    this.lostSeen = 0;
    this.attacked = false;
    this.ripples = [];
    this.crosses = [];
    this.frameMs = [];
    this.tipBox = null;
    this.tipQueue = [];
    this.tipsShown = new Set(save.data.tips);
    this.speed = save.data.speed === 2 ? 2 : 1;
    drawDesk(this);

    const map = levelMap(this.def);
    const seed = this.oyun.rng.int(0, 2 ** 31 - 1);
    const blot = blotUnlocked(save.data) && (this.def.index < 0 || this.def.index > BLOT_UNLOCK_AFTER);
    const specs = levelSpecs(this.def);
    this.sim = new MatchSim(map, seed, specs, levelOptions(this.def, blot));

    // Sheet between the top HUD and the thumb zone.
    const top = L.top + 192;
    const bottom = L.bottom - 218;
    this.view = new InkMap(this, map, { x: L.left + 10, y: top, width: L.right - L.left - 20, height: bottom - top }, specs.length);
    this.view.fullRedraw(this.sim);
    this.fx = this.add.graphics().setDepth(5);

    // Top HUD: pause · land shares (+ goal label) · speed; reserve bar with count and rate.
    const rowA = L.top + 60;
    this.pauseButton = iconButton(this, L.left + 72, rowA, 'pause', () => this.openPauseMenu());
    this.strip = new ShareStrip(this, L.left + 140, rowA - 15, L.right - L.left - 140 - 150, 30, (k, p) => this.t(k, p));
    this.speedButton = button(this, L.right - 72, rowA, this.speedLabel(), () => this.toggleSpeed(), {
      variant: 'secondary',
      width: 112,
      height: 88,
      fontSize: 40,
    });
    this.bar = new ReserveBar(this, L.left + 24, L.top + 146, L.right - L.left - 48, 32, (k, p) => this.t(k, p));

    // Thumb zone: commit slider (always starts at 30 %; it is a per-tap choice) + Blot.
    const sliderRight = blot ? L.right - 210 : L.right - 70;
    this.slider = new CommitSlider(this, L.left + 70, L.bottom - 96, sliderRight - (L.left + 70), () => undefined, (k, p) => this.t(k, p));
    this.slider.set(RULES.defaultCommit);
    this.blotBtn = blot ? new BlotButton(this, L.right - 100, L.bottom - 104, 74, () => this.onBlotButton(), this.t('game.blot')) : null;

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.onMapTap(p.worldX, p.worldY);
    });

    this.intro();
    this.updateHud(0);
    this.oyun.platform.gameplayStart();
    this.oyun.platform.track('match_start', { level: this.levelId });
  }

  private outlined(t: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
    return t.setStroke(cssColor(PALETTE.outline), 8);
  }

  private intro(): void {
    const start = this.view.cellCenter(this.sim.startCells[0]!);
    this.you = this.outlined(label(this, start.x, start.y - 64, this.t('game.you'), { size: 34, color: PALETTE.text }).setDepth(7));
    const r = this.view.rect;
    this.hint = this.outlined(
      label(this, this.layout.cx, r.y + r.height - 34, this.t('game.hint'), { size: 30, color: PALETTE.text, wrap: r.width - 40 }).setDepth(8),
    );
  }

  private fade(obj: Phaser.GameObjects.Text | Phaser.GameObjects.Container | null): void {
    if (!obj) return;
    this.tweens.add({ targets: obj, alpha: 0, duration: 400, onComplete: () => obj.destroy() });
  }

  private dropHint(): void {
    this.fade(this.hint);
    this.hint = null;
  }

  private speedLabel(): string {
    return `${this.speed}×`;
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
    this.speedButton.setLabel(this.speedLabel());
    gameSave(this.oyun).update((d) => {
      d.speed = this.speed;
    });
  }

  // ---------------------------------------------------------------- tips (shown once each, ever)

  private tip(key: TipKey, params?: Record<string, number | string>): void {
    if (this.tipsShown.has(key)) return;
    this.tipsShown.add(key);
    gameSave(this.oyun).update((d) => {
      if (!d.tips.includes(key)) d.tips.push(key);
    });
    this.tipQueue.push({ key, text: this.t(`tip.${key}`, params) });
    this.nextTip();
  }

  private nextTip(): void {
    if (this.tipBox || this.tipQueue.length === 0 || this.finished) return;
    const { text } = this.tipQueue.shift()!;
    const r = this.view.rect;
    const t = label(this, 0, 0, text, { size: 30, color: PALETTE.text, wrap: r.width - 80 });
    const w = Math.min(r.width - 20, t.width + 56);
    const h = t.height + 36;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.outline, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    g.lineStyle(3, PALETTE.sweet, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
    const box = this.add.container(this.layout.cx, r.y + h / 2 + 10, [g, t]).setDepth(30);
    this.tipBox = box;
    this.juice.pop(box, 0.6, 240);
    this.time.delayedCall(4600, () => {
      this.fade(box);
      this.tipBox = null;
      this.time.delayedCall(450, () => this.nextTip());
    });
  }

  // ---------------------------------------------------------------- input

  /**
   * The one map handler. Only paper that is not ours, within a fingertip of our border, can be
   * attacked; own ink, gaps and the desk are refused with a reason (nothing is spent).
   */
  private onMapTap(x: number, y: number): void {
    if (this.finished) return;
    const r = this.view.rect;
    const pad = 40;
    if (x < r.x - pad || y < r.y - pad || x > r.x + r.width + pad || y > r.y + r.height + pad) return;
    const sim = this.sim;
    const direct = this.view.cellAt(x, y);
    if (direct < 0 || sim.map.land[direct] !== 1) {
      this.reject(x, y, 'game.gap');
      return;
    }
    if (this.blotArmed) {
      if (sim.owner[direct] === 0 || sim.touches(0, direct)) this.tryCell(direct);
      else this.reject(x, y, 'game.notTouching');
      return;
    }
    if (sim.owner[direct] === 0) {
      this.reject(x, y, 'game.ownInk');
      return;
    }
    const cell = sim.canAttack(0, direct) ? direct : this.nearestAttackable(x, y);
    if (cell < 0) {
      this.reject(x, y, 'game.notTouching');
      return;
    }
    this.tryCell(cell);
  }

  /** Nearest attackable cell to a finger on someone else's paper (touch forgiveness ~34 px). */
  private nearestAttackable(x: number, y: number): number {
    const sim = this.sim;
    const cs = this.view.cellSize;
    const reach = Math.max(1, Math.ceil(34 / cs));
    const w = sim.map.width;
    const h = sim.map.height;
    const cx = Math.floor((x - this.view.rect.x) / cs);
    const cy = Math.floor((y - this.view.rect.y) / cs);
    let best = -1;
    let bestD = Infinity;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const d = dx * dx + dy * dy;
        if (d > reach * reach || d >= bestD) continue;
        const c = ny * w + nx;
        if (sim.canAttack(0, c)) {
          best = c;
          bestD = d;
        }
      }
    }
    return best;
  }

  private tryCell(cell: number): void {
    if (this.finished) return;
    const at = this.view.cellCenter(cell);
    if (this.blotArmed) {
      const taken = this.sim.blot(0, cell);
      if (taken > 0) {
        this.blotArmed = false;
        this.dropHint();
      } else this.reject(at.x, at.y, 'game.notTouching');
      return;
    }
    const res = this.sim.attack(0, cell, this.slider.current);
    if (!res.ok) {
      const key = res.reason === 'no-ink' ? 'game.noInk' : res.reason === 'busy' ? 'game.busy' : res.reason === 'own' ? 'game.ownInk' : res.reason === 'gap' ? 'game.gap' : 'game.notTouching';
      this.reject(at.x, at.y, key);
      return;
    }
    this.dropHint();
    const pitch = (this.slider.current - 30) / 12;
    this.oyun.audio.playPreset(SFX.drip, { pitch, volume: 0.6 + this.slider.current / 250 });
    this.oyun.platform.haptic('light');
    this.ripples.push({ x: at.x, y: at.y, t: 0, color: PALETTE.inks[0]!, r: 14 + this.slider.current * 0.5 });
    this.tip('tap', { n: this.slider.current });
  }

  private lastReject = '';
  private reject(x: number, y: number, key: string): void {
    this.oyun.audio.playPreset(SFX.nope);
    this.oyun.platform.haptic('error');
    this.lastReject = key;
    // A red cross where the finger was, and the reason in outlined text (readable on paper).
    this.crosses.push({ x, y, t: 0 });
    const text = this.outlined(label(this, x, y - 44, this.t(key), { size: 32, color: PALETTE.text }).setDepth(31));
    text.x = Phaser.Math.Clamp(x, this.layout.left + text.width / 2 + 10, this.layout.right - text.width / 2 - 10);
    this.tweens.add({ targets: text, y: text.y - 40, alpha: 0, delay: 500, duration: 600, onComplete: () => text.destroy() });
  }

  private onBlotButton(): void {
    if (this.finished || !this.blotBtn) return;
    if (this.sim.blotReady(0)) {
      this.blotArmed = !this.blotArmed;
      if (this.blotArmed) toast(this, this.t('game.blotArmed'), { duration: 1400 });
      return;
    }
    if (this.adUsed) return;
    // Rewarded: one extra charge per match, granted only on 'granted', ignored after quitting.
    this.adUsed = true;
    this.oyun.platform.showRewarded('extra_blot').then(
      (r) => {
        if (!this.live || this.finished) return;
        if (r !== 'granted') {
          this.adUsed = false;
          return;
        }
        this.sim.grantBlot(0);
        this.oyun.platform.track('reward_claimed', { placement: 'extra_blot' });
        toast(this, this.t('game.blotGranted'));
      },
      () => {
        if (this.live) this.adUsed = false;
      },
    );
  }

  // ---------------------------------------------------------------- frame

  override update(_time: number, delta: number): void {
    const t0 = performance.now();
    // Up to 200 ms per frame (core's cap); steps the 10 Hz sim without throwing time away.
    const dt = Math.min(this.juice.scaledDelta(delta), 200) / 1000;
    if (!this.finished) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= TICK_S && steps < 8) {
        this.sim.tick();
        this.acc -= TICK_S;
        steps++;
      }
    }
    this.handleEvents();
    this.view.sync(this.sim);
    this.updateHud(delta / 1000);
    this.updateIntro();
    this.drawFx(delta / 1000);
    if (!this.finished && this.sim.phase !== 'playing') this.finish();
    this.frameMs.push(performance.now() - t0);
    if (this.frameMs.length > 240) this.frameMs.shift();
  }

  private updateIntro(): void {
    const tick = this.sim.tickCount;
    if (this.you && (tick > INTRO_TICKS || this.finished)) {
      this.fade(this.you);
      this.you = null;
    }
    if (this.hint && (tick > HINT_TICKS || this.finished)) this.dropHint();
  }

  private handleEvents(): void {
    const events: MatchEvent[] = this.sim.events;
    this.sim.events = [];
    for (const e of events) {
      if (e.type === 'wave-end' && e.captured >= RULES.bigCapture && e.colony === 0) {
        const at = this.view.cellCenter(e.cell);
        this.oyun.audio.playPreset(SFX.soak, { volume: Math.min(1, 0.5 + e.captured / 200) });
        this.juice.feedback('small', at.x, at.y, PALETTE.inks[0]);
        this.cameraPulse(1.012);
      } else if (e.type === 'eliminated') {
        this.onEliminated(e.colony, e.cell);
      } else if (e.type === 'blot') {
        const at = this.view.cellCenter(e.cell);
        this.oyun.audio.playPreset(SFX.blot);
        this.juice.feedback('medium', at.x, at.y, PALETTE.inks[0]);
        this.ripples.push({ x: at.x, y: at.y, t: 0, color: PALETTE.inks[0]!, r: this.view.cellSize * RULES.blotRadius * 2.2 });
      }
    }
    const me = this.sim.colonies[0]!;
    const lost = this.sim.stats[0]!.lost;
    if (lost > this.lostSeen) {
      if (!this.attacked && me.lastAttackedBy >= 0) {
        this.attacked = true;
        this.tip('attacked');
      }
      if (this.time.now - this.lastHurt > 900) {
        this.lastHurt = this.time.now;
        this.oyun.audio.playPreset(SFX.hurt, { volume: 0.8 });
        this.oyun.platform.haptic('light');
      }
      this.lostSeen = lost;
    }
    if (me.alive && this.sim.phase === 'playing') {
      const fill = me.reserve / this.sim.cap(0);
      if (fill >= 0.97) this.tip('full');
      else if (fill < 0.08 && this.sim.stats[0]!.inkSpent > 0) this.tip('empty');
    }
  }

  private onEliminated(colony: number, cell: number): void {
    const at = this.view.cellCenter(cell);
    const color = PALETTE.inks[colony % PALETTE.inks.length]!;
    this.oyun.audio.playPreset(SFX.splash);
    this.juice.feedback(colony === 0 ? 'large' : 'medium', at.x, at.y, color);
    this.juice.burst(at.x, at.y, { count: 16, color, texture: 'drop', distance: 160 });
    // Desaturating wash spreading from where it fell.
    const wash = this.add.circle(at.x, at.y, 30, PALETTE.grey, 0.45).setDepth(4);
    this.tweens.add({ targets: wash, radius: 260, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => wash.destroy() });
    if (colony !== 0 && this.sim.phase === 'playing') {
      toast(this, this.t('game.washed', { name: this.t(`colony.${colony}`) }), { color: PALETTE.toastDark });
    }
  }

  private cameraPulse(zoom: number): void {
    if (this.oyun.reducedMotion) return;
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    cam.setZoom(1);
    this.tweens.add({ targets: cam, zoom, duration: 110, yoyo: true, ease: 'Sine.easeOut', onComplete: () => cam.setZoom(1) });
  }

  private drawFx(dt: number): void {
    const g = this.fx;
    g.clear();
    this.ripples = this.ripples.filter((r) => (r.t += dt) < 0.6);
    for (const r of this.ripples) {
      const k = r.t / 0.6;
      g.lineStyle(4 * (1 - k) + 1, r.color, 0.8 * (1 - k)).strokeCircle(r.x, r.y, r.r * (0.4 + k));
    }
    this.crosses = this.crosses.filter((c) => (c.t += dt) < 0.7);
    for (const c of this.crosses) {
      const a = 1 - c.t / 0.7;
      g.lineStyle(9, PALETTE.outline, a).lineBetween(c.x - 16, c.y - 16, c.x + 16, c.y + 16).lineBetween(c.x - 16, c.y + 16, c.x + 16, c.y - 16);
      g.lineStyle(5, PALETTE.danger, a).lineBetween(c.x - 15, c.y - 15, c.x + 15, c.y + 15).lineBetween(c.x - 15, c.y + 15, c.x + 15, c.y - 15);
    }
    if (this.you) {
      // Pulsing ring around our start while the intro lasts (sim time, not scene timers).
      const start = this.view.cellCenter(this.sim.startCells[0]!);
      const k = (this.time.now % 1200) / 1200;
      g.lineStyle(5, PALETTE.inks[0]!, 1 - k).strokeCircle(start.x, start.y, 20 + k * 46);
    }
  }

  private updateHud(dt: number): void {
    const sim = this.sim;
    this.strip.set(sim.colonies.map((c) => sim.share(c.id)));
    const me = sim.colonies[0]!;
    const perSecond = me.alive ? growthPerTick(me.area, me.reserve) * RULES.tickHz : 0;
    this.bar.set(me.reserve, sim.cap(0), perSecond, dt || 1);
    this.slider.redraw(me.reserve);
    for (const c of sim.colonies) if (c.alive) this.view.setInk(c.id, c.reserve / Math.max(1, sim.cap(c.id)));
    if (this.blotBtn) this.blotBtn.set(sim.blotCooldownLeft(0) / RULES.blotCooldown, this.blotArmed, !this.adUsed);
  }

  // ---------------------------------------------------------------- end

  private finish(): void {
    this.finished = true;
    const sim = this.sim;
    const won = sim.phase === 'won';
    const outcome: MatchOutcome = { won, ticks: sim.tickCount, droppedBelowHalfPeak: sim.stats[0]!.droppedBelowHalfPeak };
    this.oyun.platform.gameplayStop();
    this.oyun.platform.track('match_end', { level: this.levelId, won, seconds: Math.round(sim.tickCount / RULES.tickHz) });
    this.fade(this.tipBox);
    this.tipBox = null;
    const flags = starFlags(outcome, this.def.parSeconds);
    const seconds = sim.tickCount / RULES.tickHz;
    const lines: string[] = [this.t('result.time', { t: formatTime(seconds) })];
    const save = gameSave(this.oyun);
    const common = { score: Math.round(sim.share(0) * 100), won, flags, reason: sim.endReason ?? 'share', winner: sim.winner };
    let payload: ResultPayload;
    if (this.def.index >= 0) {
      let rec = { stars: 0, bestStars: 0, newBest: false, bestSeconds: 0 };
      save.update((d) => {
        rec = applyCampaignResult(d, this.def.index, outcome);
      });
      const nextDef = CAMPAIGN[this.def.index + 1];
      payload = { ...common, best: rec.bestStars, newBest: rec.newBest, lines, level: this.levelId, stars: rec.stars, next: won && nextDef ? nextDef.id : null };
    } else {
      let rec = { won, bestSeconds: 0, newBest: false, streak: 0 };
      save.update((d) => {
        rec = applyDailyResult(d, this.dailyDate, outcome);
      });
      if (rec.bestSeconds > 0) lines.push(this.t('result.dailyBest', { t: formatTime(rec.bestSeconds) }));
      lines.push(this.t('result.streak', { n: rec.streak }));
      const stars = flags.filter(Boolean).length;
      payload = { ...common, best: stars, newBest: rec.newBest, lines, level: 'daily', date: this.dailyDate, stars, next: null };
    }
    if (won) this.cameraPulse(1.03);
    this.time.delayedCall(1100, () => this.goTo(SCENES.result, payload));
  }

  // ---------------------------------------------------------------- test hook

  protected override testState() {
    const sim = this.sim;
    const me = sim.colonies[0]!;
    const targets = sim
      .attackableCells(0)
      .filter((_, i) => i % 7 === 0)
      .slice(0, 6)
      .map((cell) => {
        const p = this.view.cellCenter(cell);
        return { cell, x: Math.round(p.x), y: Math.round(p.y) };
      });
    const own = this.view.cellCenter(sim.startCells[0]!);
    const sorted = [...this.frameMs].sort((a, b) => a - b);
    return {
      tick: sim.tickCount,
      mapId: this.def.id,
      phase: sim.phase,
      shares: sim.colonies.map((c) => Math.round(sim.share(c.id) * 1000) / 1000),
      alive: sim.colonies.filter((c) => c.alive).length,
      reserve: Math.round(me.reserve * 10) / 10,
      cap: Math.round(sim.cap(0) * 10) / 10,
      commit: this.slider.current,
      speed: this.speed,
      blot: this.blotBtn !== null,
      blotReady: sim.blotReady(0),
      autoPlay: sim.autoPlayTicks,
      targets,
      ownCell: { x: Math.round(own.x), y: Math.round(own.y) },
      lastReject: this.lastReject,
      intro: this.you !== null,
      hint: this.hint !== null,
      tip: this.tipBox !== null,
      slider: { x0: Math.round(this.slider.xFor(RULES.minCommit)), x1: Math.round(this.slider.xFor(RULES.maxCommit)), y: this.layout.bottom - 96 },
      speedButton: { x: Math.round(this.speedButton.x), y: Math.round(this.speedButton.y) },
      updateMs: sorted.length ? Math.round(sorted[Math.floor(sorted.length * 0.95)]! * 100) / 100 : 0,
    };
  }

  protected override testActions() {
    return {
      attack: (p: unknown) => {
        const { cell, percent } = p as { cell: number; percent?: number };
        if (percent !== undefined) this.slider.set(percent, true);
        this.tryCell(cell);
      },
      /** A tap at logical (x, y): exactly the pointer path. */
      tap: (p: unknown) => {
        const { x, y } = p as { x: number; y: number };
        this.onMapTap(x, y);
      },
      commit: (p: unknown) => this.slider.set((p as { percent: number }).percent, true),
      'auto-play': (p: unknown) => {
        const o = p as { ticks?: number; policy?: 'patient' | 'impatient' } | undefined;
        if (o?.policy) this.sim.autoPolicy = o.policy;
        this.sim.autoPlayTicks = Math.max(0, Math.floor(o?.ticks ?? 600));
      },
      'fast-forward': (p: unknown) => {
        const n = Math.max(0, Math.floor(typeof p === 'number' ? p : ((p as { ticks?: number } | undefined)?.ticks ?? 0)));
        for (let i = 0; i < n && this.sim.phase === 'playing'; i++) this.sim.tick();
      },
      pause: () => this.pauseButton.fire(),
      speed: () => this.speedButton.fire(),
      /** Same sequence as a player: tap the Blot button, then (if armed) the cell. */
      blot: (p: unknown) => {
        if (!this.blotBtn) return;
        if (!this.blotArmed) this.blotBtn.fire();
        const cell = (p as { cell?: number } | undefined)?.cell;
        if (this.blotArmed && cell !== undefined) this.tryCell(cell);
      },
    };
  }
}
