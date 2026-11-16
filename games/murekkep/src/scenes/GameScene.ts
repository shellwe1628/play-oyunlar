import { button, iconButton, label, OyunScene, toast, type Button, type IconButton } from '@oyun/core';
import Phaser from 'phaser';
import { gameSave } from '../save';
import { BLOT_UNLOCK_AFTER, CAMPAIGN, dailyLevel, dateKey, levelMap, levelSpecs, starFlags, type LevelDef, type MatchOutcome } from '../sim/campaign';
import { MatchSim, type MatchEvent } from '../sim/match';
import { applyCampaignResult, applyDailyResult, blotUnlocked } from '../sim/progress';
import { RULES, clampCommit } from '../sim/rules';
import { SFX } from '../sounds';
import { PALETTE } from '../textures';
import { BlotButton, CommitSlider, ReserveBar, ShareStrip } from '../view/hud';
import { InkMap } from '../view/inkmap';
import { drawDesk } from './Background';
import { SCENES } from './keys';

export interface GameData {
  /** 'c1'..'c8' or 'daily'. */
  level?: string;
}

export interface ResultPayload {
  score: number;
  best: number;
  newBest: boolean;
  won: boolean;
  lines: string[];
  level: string;
  stars: number;
  flags: [boolean, boolean, boolean];
  next: string | null;
}

const TICK_S = 1 / RULES.tickHz;

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function resolveLevel(id: string | undefined): LevelDef {
  if (id === 'daily') return dailyLevel(dateKey(new Date()));
  return CAMPAIGN.find((c) => c.id === id) ?? CAMPAIGN[0]!;
}

/**
 * One match. Draws the sim and forwards input; every rule lives in src/sim.
 * Test actions: attack {cell, percent}, auto-play {ticks}, fast-forward ticks, pause, speed,
 * blot {cell}, commit {percent}.
 */
export class GameScene extends OyunScene {
  protected override autoPause = true;
  private sim!: MatchSim;
  private view!: InkMap;
  private def!: LevelDef;
  private levelId = 'c1';
  private strip!: ShareStrip;
  private bar!: ReserveBar;
  private slider!: CommitSlider;
  private blotBtn: BlotButton | null = null;
  private pauseButton!: IconButton;
  private speedButton!: Button;
  private hint: Phaser.GameObjects.Text | null = null;
  private fx!: Phaser.GameObjects.Graphics;
  private acc = 0;
  private speed = 1;
  private finished = false;
  private blotArmed = false;
  private adUsed = false;
  private lastHurt = 0;
  private lostSeen = 0;
  private ripples: { x: number; y: number; t: number; color: number; r: number }[] = [];
  private frameMs: number[] = [];

  constructor() {
    super(SCENES.game);
  }

  create(data: GameData = {}): void {
    const L = this.layout;
    const save = gameSave(this.oyun);
    this.levelId = data.level === 'daily' ? 'daily' : (data.level ?? 'c1');
    this.def = resolveLevel(this.levelId);
    this.finished = false;
    this.acc = 0;
    this.blotArmed = false;
    this.adUsed = false;
    this.lostSeen = 0;
    this.ripples = [];
    this.frameMs = [];
    this.speed = save.data.speed === 2 ? 2 : 1;
    drawDesk(this);

    const map = levelMap(this.def);
    const seed = this.oyun.rng.int(0, 2 ** 31 - 1);
    const blot = blotUnlocked(save.data) && (this.def.index < 0 || this.def.index > BLOT_UNLOCK_AFTER);
    this.sim = new MatchSim(map, seed, levelSpecs(this.def), { blot });

    // Sheet between the top HUD and the thumb zone.
    const top = L.top + 176;
    const bottom = L.bottom - 218;
    this.view = new InkMap(this, map, { x: L.left + 10, y: top, width: L.right - L.left - 20, height: bottom - top }, seed & 0xffff);
    this.view.fullRedraw(this.sim);
    this.fx = this.add.graphics().setDepth(5);

    // Top HUD: pause · land shares · speed; reserve bar under it.
    const rowA = L.top + 58;
    this.pauseButton = iconButton(this, L.left + 60, rowA, 'pause', () => this.openPauseMenu());
    this.strip = new ShareStrip(this, L.left + 128, rowA - 15, L.right - L.left - 128 - 150, 30);
    this.speedButton = button(this, L.right - 70, rowA, this.speedLabel(), () => this.toggleSpeed(), {
      variant: 'secondary',
      width: 112,
      height: 88,
      fontSize: 40,
    });
    this.bar = new ReserveBar(this, L.left + 24, L.top + 130, L.right - L.left - 48, 34, (k, p) => this.t(k, p));

    // Thumb zone: commit slider (+ Blot).
    const sliderRight = blot ? L.right - 210 : L.right - 70;
    this.slider = new CommitSlider(this, L.left + 70, L.bottom - 96, sliderRight - (L.left + 70), (v) => this.onCommit(v), (k, p) => this.t(k, p));
    this.slider.set(clampCommit(save.data.commit));
    if (blot) this.blotBtn = new BlotButton(this, L.right - 100, L.bottom - 104, 74, () => this.onBlotButton(), this.t('game.blot'));
    else this.blotBtn = null;

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.onMapTap(p.worldX, p.worldY);
    });

    this.intro();
    this.updateHud(0);
    this.oyun.platform.gameplayStart();
    this.oyun.platform.track('match_start', { level: this.levelId });
  }

  private intro(): void {
    const start = this.view.cellCenter(this.sim.startCells[0]!);
    const ring = this.add.graphics().setDepth(6);
    const you = label(this, start.x, start.y - 64, this.t('game.you'), { size: 34, color: PALETTE.text }).setDepth(7);
    you.setStroke('#1c1712', 8);
    let t = 0;
    const tick = (): void => {
      t += 1;
      ring.clear();
      const k = (t % 40) / 40;
      ring.lineStyle(5, PALETTE.inks[0]!, 1 - k).strokeCircle(start.x, start.y, 20 + k * 46);
    };
    const ev = this.time.addEvent({ delay: 30, loop: true, callback: tick });
    this.time.delayedCall(3200, () => {
      ev.remove();
      this.tweens.add({ targets: [ring, you], alpha: 0, duration: 400, onComplete: () => (ring.destroy(), you.destroy()) });
    });
    const r = this.view.rect;
    this.hint = label(this, this.layout.cx, r.y + r.height - 40, `${this.t('game.hint')}\n${this.t('game.goal')}`, {
      size: 30,
      color: PALETTE.text,
      wrap: r.width - 40,
    }).setDepth(8);
    this.hint.setStroke('#1c1712', 8);
    this.time.delayedCall(5000, () => this.dropHint());
  }

  private dropHint(): void {
    const h = this.hint;
    if (!h) return;
    this.hint = null;
    this.tweens.add({ targets: h, alpha: 0, duration: 400, onComplete: () => h.destroy() });
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

  private onCommit(v: number): void {
    gameSave(this.oyun).update((d) => {
      d.commit = v;
    });
  }

  // ---------------------------------------------------------------- input

  /** The one map handler: real taps and the test hook both end up in tryCell. */
  private onMapTap(x: number, y: number): void {
    if (this.finished) return;
    const r = this.view.rect;
    if (x < r.x - 20 || y < r.y - 20 || x > r.x + r.width + 20 || y > r.y + r.height + 20) return;
    const cell = this.resolveCell(x, y);
    if (cell < 0) {
      this.reject(x, y, this.t('game.notTouching'));
      return;
    }
    this.tryCell(cell);
  }

  /** Nearest valid cell to a finger within ~one fingertip (touch forgiveness). */
  private resolveCell(x: number, y: number): number {
    const sim = this.sim;
    const want = (c: number): boolean => (this.blotArmed ? sim.map.land[c] === 1 && (sim.owner[c] === 0 || sim.touches(0, c)) : sim.canAttack(0, c));
    const direct = this.view.cellAt(x, y);
    if (direct >= 0 && want(direct)) return direct;
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
        if (want(c)) {
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
      } else this.reject(at.x, at.y, this.t('game.notTouching'));
      return;
    }
    const res = this.sim.attack(0, cell, this.slider.current);
    if (!res.ok) {
      this.reject(at.x, at.y, this.t(res.reason === 'no-ink' || res.reason === 'busy' ? 'game.noInk' : 'game.notTouching'));
      return;
    }
    this.dropHint();
    const pitch = (this.slider.current - 30) / 12;
    this.oyun.audio.playPreset(SFX.drip, { pitch, volume: 0.6 + this.slider.current / 250 });
    this.oyun.platform.haptic('light');
    this.ripples.push({ x: at.x, y: at.y, t: 0, color: PALETTE.inks[0]!, r: 14 + this.slider.current * 0.5 });
  }

  private reject(x: number, y: number, text: string): void {
    this.oyun.audio.playPreset(SFX.nope);
    this.juice.floatText(x, y - 20, text, { color: PALETTE.text, size: 30, rise: 50 });
  }

  private onBlotButton(): void {
    if (this.finished || !this.blotBtn) return;
    if (this.sim.blotReady(0)) {
      this.blotArmed = !this.blotArmed;
      if (this.blotArmed) toast(this, this.t('game.blotArmed'), { duration: 1400 });
      return;
    }
    if (this.adUsed) return;
    // Rewarded: one extra charge per match, granted only on 'granted'.
    this.adUsed = true;
    void this.oyun.platform.showRewarded('extra_blot').then((r) => {
      if (r !== 'granted' || this.finished) {
        if (r !== 'granted') this.adUsed = false;
        return;
      }
      this.sim.grantBlot(0);
      this.oyun.platform.track('reward_claimed', { placement: 'extra_blot' });
      toast(this, this.t('game.blotGranted'));
    });
  }

  // ---------------------------------------------------------------- frame

  override update(_time: number, delta: number): void {
    const t0 = performance.now();
    const dt = Math.min(this.juice.scaledDelta(delta), 100) / 1000;
    if (!this.finished) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= TICK_S && steps < 6) {
        this.sim.tick();
        this.acc -= TICK_S;
        steps++;
      }
      if (this.acc > TICK_S * 3) this.acc = 0;
    }
    this.handleEvents();
    this.view.sync(this.sim);
    this.updateHud(delta / 1000);
    this.drawFx(delta / 1000);
    if (!this.finished && this.sim.phase !== 'playing') this.finish();
    this.frameMs.push(performance.now() - t0);
    if (this.frameMs.length > 240) this.frameMs.shift();
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
    const lost = this.sim.stats[0]!.lost;
    if (lost > this.lostSeen) {
      if (this.time.now - this.lastHurt > 900) {
        this.lastHurt = this.time.now;
        this.oyun.audio.playPreset(SFX.hurt, { volume: 0.8 });
        this.oyun.platform.haptic('light');
      }
      this.lostSeen = lost;
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
      toast(this, this.t('game.washed', { name: this.t(`colony.${colony}`) }), { color: 0x3a332c });
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
  }

  private updateHud(dt: number): void {
    const sim = this.sim;
    this.strip.set(sim.colonies.map((c) => sim.share(c.id)));
    const me = sim.colonies[0]!;
    this.bar.set(me.reserve, sim.cap(0), dt || 1);
    this.slider.redraw(me.reserve);
    if (this.blotBtn) {
      const left = sim.blotCooldownLeft(0) / RULES.blotCooldown;
      this.blotBtn.set(left, this.blotArmed, !this.adUsed);
    }
  }

  // ---------------------------------------------------------------- end

  private finish(): void {
    this.finished = true;
    const sim = this.sim;
    const won = sim.phase === 'won';
    const outcome: MatchOutcome = { won, ticks: sim.tickCount, droppedBelowHalfPeak: sim.stats[0]!.droppedBelowHalfPeak };
    this.oyun.platform.gameplayStop();
    this.oyun.platform.track('match_end', { level: this.levelId, won, seconds: Math.round(sim.tickCount / RULES.tickHz) });
    const flags = starFlags(outcome, this.def.parSeconds);
    const seconds = sim.tickCount / RULES.tickHz;
    const lines: string[] = [this.t('result.time', { t: formatTime(seconds) })];
    let payload: ResultPayload;
    const save = gameSave(this.oyun);
    if (this.def.index >= 0) {
      let rec = { stars: 0, bestStars: 0, newBest: false, bestSeconds: 0 };
      save.update((d) => {
        rec = applyCampaignResult(d, this.def.index, outcome);
      });
      const nextDef = CAMPAIGN[this.def.index + 1];
      payload = {
        score: Math.round(sim.share(0) * 100),
        best: rec.bestStars,
        newBest: rec.newBest,
        won,
        lines,
        level: this.levelId,
        stars: rec.stars,
        flags,
        next: won && nextDef ? nextDef.id : null,
      };
    } else {
      let rec = { won, bestSeconds: 0, newBest: false, streak: 0 };
      save.update((d) => {
        rec = applyDailyResult(d, dateKey(new Date()), outcome);
      });
      if (rec.bestSeconds > 0) lines.push(this.t('result.dailyBest', { t: formatTime(rec.bestSeconds) }));
      lines.push(this.t('result.streak', { n: rec.streak }));
      payload = {
        score: Math.round(sim.share(0) * 100),
        best: flags.filter(Boolean).length,
        newBest: rec.newBest,
        won,
        lines,
        level: 'daily',
        stars: flags.filter(Boolean).length,
        flags,
        next: null,
      };
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
      commit: (p: unknown) => this.slider.set((p as { percent: number }).percent, true),
      'auto-play': (p: unknown) => {
        this.sim.autoPlayTicks = Math.max(0, Math.floor((p as { ticks?: number } | undefined)?.ticks ?? 600));
      },
      'fast-forward': (p: unknown) => {
        const n = Math.max(0, Math.floor(typeof p === 'number' ? p : ((p as { ticks?: number } | undefined)?.ticks ?? 0)));
        for (let i = 0; i < n && this.sim.phase === 'playing'; i++) this.sim.tick();
      },
      pause: () => this.pauseButton.fire(),
      speed: () => this.speedButton.fire(),
      /** Same sequence as a player: tap the Blot button (arms it, or offers the rewarded charge on
       * cooldown), then, if armed, tap the cell. */
      blot: (p: unknown) => {
        if (!this.blotBtn) return;
        if (!this.blotArmed) this.blotBtn.fire();
        const cell = (p as { cell?: number } | undefined)?.cell;
        if (this.blotArmed && cell !== undefined) this.tryCell(cell);
      },
    };
  }
}
