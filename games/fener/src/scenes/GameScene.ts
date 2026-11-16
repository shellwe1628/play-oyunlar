import { button, iconButton, label, OyunScene, PAUSE_SCENE, panel, type Button, type IconButton } from '@oyun/core';
import Phaser from 'phaser';
import { Ambience, sfx } from '../audio';
import { gameSave } from '../save';
import { nightParams, SHIFT } from '../sim/night';
import { applyDailyResult, applyLog, applyNightResult, dailySeed } from '../sim/progress';
import { evidencePoint, ShiftSim, type ReportResult, type ShiftEvent } from '../sim/shift';
import { ANOMALY_TYPES, STATION, type AnomalyType } from '../sim/station';
import { FEED, PALETTE } from '../textures';
import { drawTypeIcon } from './art';
import { drawRoomIcon, Feed } from './Feed';
import { SCENES, type ShiftData } from './keys';
import { Chip } from './widgets';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Real seconds per simulation step for fast-forward (matches a 60 fps frame budget). */
const FF_STEP = 0.1;

/**
 * One night shift. Draws ShiftSim state and forwards input; every rule lives in src/sim.
 * Test actions: switch i, select {x,y}, chip type, report {camera, objectId, type},
 * fast-forward seconds, pause, secondWind, letGo.
 */
export class GameScene extends OyunScene {
  protected override autoPause = true;
  private sim!: ShiftSim;
  private data0!: ShiftData;
  private feed!: Feed;
  private ambience: Ambience | null = null;
  private clockText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private askText!: Phaser.GameObjects.Text;
  private pips!: Phaser.GameObjects.Graphics;
  private pipLabel!: Phaser.GameObjects.Text;
  private edge!: Phaser.GameObjects.Image;
  private pauseButton!: IconButton;
  private tabs: Chip[] = [];
  private chips: Chip[] = [];
  private cancelChip!: Chip;
  private selected: { id: string; tap: { x: number; y: number } } | null = null;
  private modal: Phaser.GameObjects.Container | null = null;
  private windButton: Button | null = null;
  private giveButton: Button | null = null;
  private finished = false;
  /** The rewarded ad is showing: the brink countdown is held until it resolves. */
  private adPending = false;
  private shownActive = 0;
  private baseHint = '';
  private hintTimer: Phaser.Time.TimerEvent | null = null;
  private sessionLogs = new Set<string>();

  constructor() {
    super(SCENES.game);
  }

  init(data: Partial<ShiftData>): void {
    this.data0 = {
      mode: data.mode ?? 'campaign',
      night: data.night ?? 1,
      ...(data.day ? { day: data.day } : {}),
    };
  }

  create(): void {
    const L = this.layout;
    const d = this.data0;
    this.finished = false;
    this.adPending = false;
    this.hintTimer = null;
    this.selected = null;
    this.modal = null;
    this.shownActive = 0;
    this.tabs = [];
    this.chips = [];
    this.sessionLogs = new Set(gameSave(this.oyun).data.log);
    this.cameras.main.setBackgroundColor(PALETTE.night);

    const seed = d.mode === 'daily' && d.day ? dailySeed(d.day) : this.oyun.rng.int(0, 2 ** 31 - 1);
    const night = d.mode === 'daily' ? SHIFT.dailyNight : d.night;
    this.sim = new ShiftSim(seed, night, undefined, { daily: d.mode === 'daily' });

    // --- HUD (main camera, inside the safe area)
    const top = L.top;
    const fx = (L.width - FEED) / 2;
    const fy = top + 184;
    this.pauseButton = iconButton(this, L.left + 64, top + 62, 'pause', () => this.openPauseMenu());
    this.clockText = label(this, L.cx, top + 58, '00:00', { size: 72, color: PALETTE.lamp });
    const sub = d.mode === 'daily' ? this.t('game.daily', { date: d.day ?? '' }) : this.t('game.night', { n: night });
    label(this, fx + 4, top + 136, sub, { size: 34, color: PALETTE.textDim }).setOrigin(0, 0.5);
    this.scoreText = label(this, fx + FEED - 4, top + 136, this.t('game.score', { n: 0 }), { size: 34 }).setOrigin(1, 0.5);
    this.pips = this.add.graphics();
    this.pipLabel = label(this, L.right - 118, top + 96, this.t('game.limit'), { size: 24, color: PALETTE.textDim });
    this.drawPips(0);

    // --- monitor frame + feed camera
    const frame = this.add.graphics();
    frame.fillStyle(0x000000, 0.5).fillRoundedRect(fx - 16, fy - 16 + 8, FEED + 32, FEED + 32, 22);
    frame.fillStyle(0x2a3156, 1).fillRoundedRect(fx - 16, fy - 16, FEED + 32, FEED + 32, 22);
    frame.fillStyle(0x0a0d1c, 1).fillRect(fx - 4, fy - 4, FEED + 8, FEED + 8);
    this.feed = new Feed(this, fx, fy, (k, p) => this.t(k, p));

    // --- camera tabs
    const rowY = fy + FEED + 92;
    const tw = (FEED - 3 * 14) / 4;
    STATION.forEach((def, i) => {
      const chip = new Chip(
        this,
        fx + tw / 2 + i * (tw + 14),
        rowY,
        { width: tw, height: 128, text: String(i + 1), fontSize: 36, layout: 'column', glyph: (g, x, y, s, c) => drawRoomIcon(g, def.style, x, y, s, c) },
        () => this.switchTo(i),
      );
      this.tabs.push(chip);
    });
    this.baseHint = this.t('game.memorise');
    this.hintText = label(this, L.cx, rowY + 118, this.baseHint, { size: 34, color: PALETTE.textDim, wrap: FEED });

    // --- report chips (hidden until something is selected), laid out up from the safe bottom
    // edge with a margin, so the last row never touches the screen edge on short phones.
    const cw = (FEED - 16) / 2;
    const ch = 82;
    const step = 90;
    const lastRow = L.bottom - 32 - ch / 2;
    const chipY = (row: number): number => lastRow - (3 - row) * step;
    this.askText = label(this, L.cx, Math.max(fy + FEED + 36, chipY(0) - 62), this.t('game.ask'), { size: 36, color: PALETTE.lamp }).setVisible(false);
    const kinds = [...ANOMALY_TYPES];
    kinds.forEach((type, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const chip = new Chip(
        this,
        fx + cw / 2 + col * (cw + 16),
        chipY(row),
        { width: cw, height: ch, text: this.t(`type.${type}`), fontSize: 34, glyph: (g, x, y, s, c) => drawTypeIcon(g, type, x, y, s, c) },
        () => this.onChip(type),
      );
      chip.setVisible(false);
      this.chips.push(chip);
    });
    this.cancelChip = new Chip(
      this,
      fx + cw / 2 + (cw + 16),
      chipY(3),
      { width: cw, height: ch, text: this.t('game.cancel'), fontSize: 34 },
      () => this.deselect(),
    ).setVisible(false);

    this.edge = this.add.image(0, 0, 'edge-glow').setOrigin(0).setDepth(900).setAlpha(0);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0 || this.modal) return;
      const v = this.feed.toView(p.x, p.y);
      if (v) this.onFeedTap(v.x, v.y);
      else if (this.selected) this.deselect();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    this.ambience = new Ambience(this.oyun.audio);
    this.ambience.start();
    this.feed.flicker(400);
    this.feed.sync(this.sim, this.stamp());
    this.tabs[0]!.setOn(true);
    this.oyun.platform.gameplayStart();
    this.oyun.platform.track('shift_start', { mode: d.mode, night });
  }

  override update(): void {
    if (this.finished) return;
    if (!this.adPending) {
      // Wall-clock time (unsmoothed, so a slow device does not stretch the shift), frozen by
      // hit-stop. A single frame counts at most 250 ms: that keeps 4+ fps devices on real time
      // and stops the frame after an app switch from carrying the time spent away.
      const dt = Math.min(this.juice.scaledDelta(this.game.loop.rawDelta), 250) / 1000;
      this.handle(this.sim.tick(dt));
    }
    this.refresh();
  }

  /**
   * Core registers its pause scene before the game's scenes, so it would render underneath this
   * (opaque) scene. Bring it to the top after core launches it. Candidate fix for core.
   */
  override openPauseMenu(): void {
    if (this.finished) return; // the shift is over: no pause during the hand-off to the result
    super.openPauseMenu();
    this.scene.bringToTop(PAUSE_SCENE);
  }

  // ------------------------------------------------------------------ input handlers

  /** Camera tab tap (and test action 'switch'). */
  private switchTo(i: number): void {
    if (this.finished || this.modal) return;
    if (!this.sim.switchCamera(i)) return;
    this.deselect(false);
    this.tabs.forEach((t, k) => t.setOn(k === i));
    sfx(this.oyun.audio, 'click');
    sfx(this.oyun.audio, 'flicker', 0.7);
    this.feed.flicker();
    this.refresh();
  }

  /** Tap on the monitor at view coords (and test action 'select'). */
  private onFeedTap(x: number, y: number): void {
    if (this.finished || this.modal || this.sim.over) return;
    if (this.sim.staticLeft > 0) {
      this.oyun.audio.play('tap', { volume: 0.4 });
      return;
    }
    if (this.sim.phase === 'grace') {
      // Nothing can have changed yet: no chooser, just a nudge to keep memorising.
      this.ripple(x, y);
      this.flashHint(this.t('game.tooEarly'), PALETTE.lamp);
      return;
    }
    const id = this.sim.hitTest(this.sim.camera, x, y);
    if (!id) {
      this.ripple(x, y);
      this.deselect(false);
      this.oyun.audio.play('tap', { volume: 0.25, jitter: 0 });
      return;
    }
    this.selected = { id, tap: { x, y } };
    this.feed.select(this.selectionRect(id, x, y));
    sfx(this.oyun.audio, 'select');
    this.oyun.platform.haptic('light');
    this.showChips(true);
  }

  private onChip(type: AnomalyType): void {
    if (!this.selected) return;
    this.submitReport(this.sim.camera, this.selected.id, type);
  }

  private deselect(withSound = true): void {
    if (!this.selected) return;
    this.selected = null;
    this.feed.select(null);
    this.showChips(false);
    if (withSound) this.oyun.audio.play('tap', { volume: 0.5 });
  }

  /** The one report path: chips and the test hook both end here. */
  private submitReport(camera: number, objectId: string, type: AnomalyType): ReportResult {
    const at = this.selected?.tap ?? this.objectCentre(camera, objectId);
    const r = this.sim.report(camera, objectId, type);
    this.selected = null;
    this.feed.select(null);
    this.showChips(false);
    const w = this.feed.world(at.x, at.y);
    switch (r.kind) {
      case 'correct': {
        sfx(this.oyun.audio, 'confirm');
        if (r.typeCorrect) sfx(this.oyun.audio, 'confirmBonus');
        this.oyun.platform.haptic('success');
        this.juice.shake(0.12);
        this.juice.burst(w.x, w.y, { count: 18, color: PALETTE.static, distance: 120 });
        this.juice.burst(w.x, w.y, { count: 8, color: PALETTE.teal, texture: 'oyun-star', distance: 90 });
        this.juice.floatText(w.x, w.y - 30, this.t('game.cleared', { n: r.points }), { color: PALETTE.teal, size: 44 });
        if (r.typeCorrect) this.juice.floatText(w.x, w.y + 30, this.t('game.typeBonus'), { color: PALETTE.lamp, size: 36, rise: 60 });
        this.feed.flicker(90);
        const key = this.sim.logged[this.sim.logged.length - 1];
        if (!r.typeCorrect) {
          this.juice.floatText(w.x, w.y + 34, this.t('game.wrongKind'), { color: PALETTE.static, size: 30, rise: 50, duration: 1100 });
          this.flashHint(this.t('game.wrongKind'), PALETTE.static);
        } else if (key && !this.sessionLogs.has(key)) {
          this.sessionLogs.add(key);
          this.flashHint(this.t('game.newLog'), PALETTE.teal);
        }
        this.scoreText.setText(this.t('game.score', { n: this.sim.score }));
        this.juice.pop(this.scoreText, 1.2);
        break;
      }
      case 'false':
        sfx(this.oyun.audio, 'falseReport');
        this.oyun.platform.haptic('error');
        this.juice.shake(0.35);
        this.feed.cam.shake(260, 0.012);
        this.juice.floatText(w.x, w.y, this.t('game.false'), { color: PALETTE.static, size: 36 });
        break;
      case 'blind':
        this.oyun.audio.play('tap', { volume: 0.4 });
        break;
      case 'ignored':
        break;
    }
    this.refresh();
    return r;
  }

  private fastForward(seconds: number): void {
    for (let t = 0; t < seconds && !this.finished && !this.adPending; t += FF_STEP) {
      this.handle(this.sim.tick(FF_STEP));
      if (this.sim.phase === 'brink' && !this.modal) break;
    }
    this.refresh();
  }

  // ------------------------------------------------------------------ sim events

  private handle(events: ShiftEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'spawn':
          if (this.sim.params.audioCue) sfx(this.oyun.audio, 'spawnCue');
          break;
        case 'hour':
          if (e.hour < SHIFT.hours) {
            sfx(this.oyun.audio, 'hour');
            this.juice.pop(this.clockText, 1.25);
          }
          break;
        case 'running':
          this.baseHint = this.t('game.tapHint');
          if (!this.hintTimer) this.hintText.setText(this.baseHint);
          break;
        case 'brink':
          this.showBrink();
          break;
        case 'won':
          this.finish(true);
          break;
        case 'lost':
          this.finish(false);
          break;
        case 'static-end':
          break;
      }
    }
  }

  // ------------------------------------------------------------------ drawing

  /** Monitor timestamp: in-game HH:MM with a colon that blinks once per real second. */
  private stamp(): string {
    const { hour, minute } = this.sim.clock();
    const colon = Math.floor(this.time.now / 500) % 2 === 0 ? ':' : ' ';
    return `${pad2(hour)}${colon}${pad2(minute)}`;
  }

  /** Neutral ring where the player tapped: the tap registered, nothing is there. */
  private ripple(x: number, y: number): void {
    const w = this.feed.world(x, y);
    const g = this.add.graphics({ x: w.x, y: w.y }).setDepth(4);
    g.lineStyle(4, PALETTE.static, 0.7).strokeCircle(0, 0, 18);
    this.tweens.add({ targets: g, scale: 2.4, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
  }

  /** Show a short message in the hint row (below the camera tabs), then go back to the hint. */
  private flashHint(text: string, color: number, ms = 1600): void {
    this.hintTimer?.remove();
    this.hintText.setText(text).setColor(`#${color.toString(16).padStart(6, '0')}`);
    this.juice.pop(this.hintText, 1.12);
    this.hintTimer = this.time.delayedCall(ms, () => {
      this.hintTimer = null;
      this.hintText.setText(this.baseHint).setColor(`#${PALETTE.textDim.toString(16).padStart(6, '0')}`);
    });
  }

  private refresh(): void {
    const { hour, minute } = this.sim.clock();
    this.clockText.setText(`${pad2(hour)}:${pad2(minute)}`);
    this.feed.sync(this.sim, this.stamp());
    const n = this.sim.active.length;
    if (n !== this.shownActive) {
      this.drawPips(n);
      if (n > this.shownActive && n === SHIFT.maxActive - 1) sfx(this.oyun.audio, 'warn');
      this.shownActive = n;
      this.setDanger(n >= SHIFT.maxActive - 1);
    }
    if (this.modal && this.giveButton) this.giveButton.setLabel(this.t('brink.give', { n: Math.ceil(this.sim.brinkLeft) }));
    if (this.selected && this.sim.staticLeft > 0) this.deselect(false);
  }

  private drawPips(n: number): void {
    const L = this.layout;
    const g = this.pips.clear();
    const danger = n >= SHIFT.maxActive - 1;
    const x0 = L.right - 112 - 1.5 * 40;
    const y = L.top + 52;
    for (let i = 0; i < SHIFT.maxActive; i++) {
      const filled = i < n;
      const c = danger ? PALETTE.danger : PALETTE.lamp;
      g.lineStyle(4, filled ? c : PALETTE.panelLine, 1).strokeCircle(x0 + i * 40, y, 14);
      if (filled) g.fillStyle(c, 1).fillCircle(x0 + i * 40, y, 10);
    }
    this.pipLabel.setColor(danger ? '#ff4f5e' : '#a9b3d9');
  }

  private setDanger(on: boolean): void {
    this.tweens.killTweensOf(this.edge);
    if (!on) {
      this.tweens.add({ targets: this.edge, alpha: 0, duration: 300 });
      return;
    }
    this.edge.setAlpha(0.3);
    this.tweens.add({ targets: this.edge, alpha: 1, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private showChips(on: boolean): void {
    this.chips.forEach((c) => c.setVisible(on));
    this.cancelChip.setVisible(on);
    this.askText.setVisible(on);
    this.tabs.forEach((t) => t.setVisible(!on));
    this.hintText.setVisible(!on);
  }

  private objectCentre(camera: number, id: string): { x: number; y: number } {
    const o = this.sim.objects(camera).find((s) => s.id === id) ?? this.sim.intruders(camera).find((s) => s.id === id);
    return o ? { x: o.x, y: o.y } : { x: FEED / 2, y: FEED / 2 };
  }

  /** The box around what the player tapped (the copy, the moved object or its old place). */
  private selectionRect(id: string, x: number, y: number): { x: number; y: number; w: number; h: number } {
    const cam = this.sim.camera;
    const ghost = this.sim.intruders(cam).find((s) => s.id === id);
    if (ghost) return ghost;
    const o = this.sim.objects(cam).find((s) => s.id === id)!;
    const b = this.sim.baseline(cam, id)!;
    const rects = [{ x: b.x, y: b.y, w: b.w, h: b.h }];
    if (o.visible) rects.push({ x: o.x, y: o.y, w: o.w * o.scale, h: o.h * o.scale });
    if (o.copy) rects.push({ x: o.copy.x, y: o.copy.y, w: o.w, h: o.h });
    return rects.reduce((a, r) => (Math.hypot(r.x - x, r.y - y) < Math.hypot(a.x - x, a.y - y) ? r : a));
  }

  // ------------------------------------------------------------------ brink / second wind

  private showBrink(): void {
    const L = this.layout;
    this.deselect(false);
    sfx(this.oyun.audio, 'brink');
    this.oyun.platform.haptic('error');
    this.juice.shake(0.5);
    this.feed.cam.setVisible(false);
    const shade = this.add.rectangle(0, 0, L.width, L.height, 0x000000, 0.6).setOrigin(0).setInteractive();
    const cy = L.cy - 40;
    const card = panel(this, L.cx, cy, 600, 620, { color: PALETTE.navy });
    card.add(label(this, 0, -220, this.t('brink.title'), { size: 48, color: PALETTE.danger, wrap: 540 }));
    card.add(label(this, 0, -118, this.t('brink.body'), { size: 36, color: PALETTE.textDim, wrap: 540 }));
    card.add(label(this, 0, 88, this.t('brink.windHint'), { size: 34, color: PALETTE.textDim, wrap: 540 }));
    this.modal = this.add.container(0, 0, [shade, card]).setDepth(1000);
    this.windButton = button(this, L.cx, cy, this.t('brink.wind'), () => void this.secondWind(), { width: 440 });
    this.giveButton = button(this, L.cx, cy + 208, this.t('brink.give', { n: SHIFT.brinkSeconds }), () => this.letGo(), {
      variant: 'secondary',
      width: 440,
    });
    this.modal.add([this.windButton, this.giveButton]);
    this.juice.pop(card, 1.08, 260);
  }

  private closeBrink(): void {
    this.modal?.destroy();
    this.modal = null;
    this.windButton = null;
    this.giveButton = null;
    this.feed.cam.setVisible(true);
  }

  private async secondWind(): Promise<void> {
    if (this.adPending) return;
    this.windButton?.setEnabled(false);
    this.giveButton?.setEnabled(false);
    this.adPending = true; // hold the brink countdown while the ad is up
    const outcome = await this.oyun.platform.showRewarded('second_wind');
    this.adPending = false;
    if (outcome !== 'granted' || !this.sim.useSecondWind()) {
      this.windButton?.setEnabled(true);
      this.giveButton?.setEnabled(true);
      return;
    }
    this.oyun.platform.track('reward_claimed', { placement: 'second_wind' });
    this.closeBrink();
    sfx(this.oyun.audio, 'confirm');
    this.feed.flicker(500);
    this.juice.feedback('medium', this.layout.cx, this.layout.top + 66, PALETTE.teal);
    this.refresh();
  }

  private letGo(): void {
    this.sim.declineSecondWind();
    if (this.sim.phase === 'lost') this.finish(false);
  }

  // ------------------------------------------------------------------ end of shift

  private finish(won: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.closeBrink();
    this.deselect(false);
    this.setDanger(false);
    const sim = this.sim;
    const d = this.data0;
    this.oyun.platform.gameplayStop();
    this.oyun.platform.track('shift_end', { mode: d.mode, night: sim.night, won, score: sim.score });
    let best = 0;
    let newBest = false;
    let added: string[] = [];
    let unlocked = false;
    let streak = 0;
    gameSave(this.oyun).update((s) => {
      added = applyLog(s, sim.logged);
      if (d.mode === 'daily' && d.day) {
        ({ best, newBest, streak } = applyDailyResult(s, d.day, sim.score));
      } else {
        ({ best, newBest, unlocked } = applyNightResult(s, d.night, sim.score, won));
      }
    });
    const { hour, minute } = sim.clock();
    const lines = [
      won ? this.t('result.won') : this.t('result.lost', { time: `${pad2(hour)}:${pad2(minute)}` }),
      this.t('result.stats', { ok: sim.stats.correct, typed: sim.stats.typed, bad: sim.stats.falseReports }),
    ];
    if (d.mode === 'daily') lines.push(this.t('result.streak', { n: streak }));
    else if (unlocked) lines.push(this.t('result.unlocked', { n: d.night + 1 }));
    else if (added.length) lines.push(this.t('result.newLogs', { n: added.length }));

    if (won) {
      sfx(this.oyun.audio, 'hour');
      this.juice.feedback('large', this.layout.cx, this.layout.top + 66, PALETTE.lamp);
      this.feed.cam.fadeOut(900, 255, 214, 140);
    } else {
      sfx(this.oyun.audio, 'falseReport');
      this.feed.blast();
      this.juice.feedback('large', this.layout.cx, this.layout.cy, PALETTE.danger);
    }
    this.ambience?.stop();
    this.time.delayedCall(won ? 1000 : 800, () => {
      this.feed.cam.fadeOut(140, 0, 0, 0);
      this.goTo(SCENES.result, { score: sim.score, best, newBest, won, lines, shift: d, unlocked });
    });
  }

  private teardown(): void {
    this.ambience?.stop();
    this.ambience = null;
    this.cameras.remove(this.feed.cam);
  }

  // ------------------------------------------------------------------ test hook

  /** Where on the monitor (view px) a player would tap to point at this anomaly. */
  private tapPoint(camera: number, id: string, type: AnomalyType): { x: number; y: number } {
    const p = evidencePoint(this.sim, { camera, objectId: id, type });
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  protected override testState() {
    const s = this.sim;
    const { hour, minute } = s.clock();
    return {
      mode: this.data0.mode,
      night: s.night,
      clock: `${pad2(hour)}:${pad2(minute)}`,
      elapsed: Math.round(s.elapsed * 10) / 10,
      camera: s.camera,
      phase: s.phase,
      score: s.score,
      active: s.active.map((a) => ({ id: a.id, camera: a.camera, objectId: a.objectId, type: a.type, at: this.tapPoint(a.camera, a.objectId, a.type) })),
      staticLeft: Math.round(s.staticLeft * 10) / 10,
      brinkLeft: Math.round(s.brinkLeft * 10) / 10,
      selected: this.selected?.id ?? null,
      chipsVisible: this.cancelChip.visible,
      feed: { x: this.feed.x, y: this.feed.y, size: FEED },
      ui: {
        tabs: this.tabs.map((t) => ({ x: Math.round(t.x), y: Math.round(t.y) })),
        chips: Object.fromEntries(ANOMALY_TYPES.map((t, i) => [t, { x: Math.round(this.chips[i]!.x), y: Math.round(this.chips[i]!.y) }])),
      },
      stats: { ...s.stats },
      audioCue: nightParams(s.night).audioCue,
      adPending: this.adPending,
      hint: this.hintText.text,
    };
  }

  protected override testActions() {
    return {
      switch: (i: unknown) => this.tabs[Number(i)]?.fire(),
      select: (p: unknown) => {
        const { x, y } = p as { x: number; y: number };
        this.onFeedTap(x, y);
      },
      chip: (type: unknown) => this.chips[ANOMALY_TYPES.indexOf(type as AnomalyType)]?.fire(),
      report: (p: unknown) => {
        const { camera, objectId, type } = p as { camera: number; objectId: string; type: AnomalyType };
        this.submitReport(camera, objectId, type);
      },
      'fast-forward': (sec: unknown) => this.fastForward(Number(sec)),
      pause: () => this.pauseButton.fire(),
      secondWind: () => this.windButton?.fire(),
      letGo: () => this.giveButton?.fire(),
    };
  }
}
