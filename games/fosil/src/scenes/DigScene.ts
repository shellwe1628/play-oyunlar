import { button, cssColor, iconButton, label, OyunScene, panel, progressBar, toast, type Button, type IconButton, type ProgressBar } from '@oyun/core';
import type { PauseReason } from '@oyun/core/pure';
import Phaser from 'phaser';
import { OFFLINE_MIN_SECONDS, session, type Session } from '../session';
import { SFX } from '../sfx';
import { GRADE_COLORS, LAYERS, LUCK_BOOST, TIERS, type UpgradeId, at } from '../sim/data';
import type { DigSim, Find, OfflineHaul } from '../sim/dig';
import { FOSSIL_BY_ID } from '../sim/data';
import { layerFossils } from '../sim/loot';
import { fossilKey, PALETTE } from '../textures';
import { StratumBlock } from './Block';
import { Drawer } from './Drawer';
import { SCENES } from './keys';
import { Reveal } from './Reveal';
import { big, fitText, fossilName, hitZone, mult, oddsText, outlined } from './ui';

const BLOCK_W = 460;
const HEADER = 266;
const FOOTER = 362;

interface Chip {
  value: Phaser.GameObjects.Text;
  caption: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Graphics;
  last: string;
}

/**
 * The dig: tappable site with the stratum block, combo meter, glints, HUD readouts, the upgrade
 * drawer, the reveal ceremony and the offline-haul popup. Draws sim state and forwards input.
 * Test actions: tap {n}, glint, buy {id}, advance {seconds}, travel {layer}, museum, drawer,
 * dismiss, boost, claim, double, pause.
 */
export class DigScene extends OyunScene {
  protected override autoPause = true;
  private ses!: Session;
  private sim!: DigSim;
  private block!: StratumBlock;
  private blockY = 0;
  private hpBar!: ProgressBar;
  private hpText!: Phaser.GameObjects.Text;
  private site = { top: 0, bottom: 0 };
  private chips!: Record<'power' | 'dust' | 'luck', Chip>;
  private comboBar!: ProgressBar;
  private comboText!: Phaser.GameObjects.Text;
  private layerTitle!: Phaser.GameObjects.Text;
  private arrows!: { left: Phaser.GameObjects.Graphics; right: Phaser.GameObjects.Graphics; lock: Phaser.GameObjects.Image };
  private glint!: Phaser.GameObjects.Container;
  private glintLabel!: Phaser.GameObjects.Text;
  private glintZone!: Phaser.GameObjects.Zone;
  private strip!: Phaser.GameObjects.Container;
  private stripKey = '';
  private reveal!: Reveal;
  private drawer!: Drawer;
  private pauseButton!: IconButton;
  private museumButton!: Button;
  private upgradesButton!: Button;
  private boostButton!: Button;
  private bg!: Phaser.GameObjects.Graphics;
  private motes: { o: Phaser.GameObjects.Image; vy: number }[] = [];
  private hint: Phaser.GameObjects.Text | null = null;
  private popup: { box: Phaser.GameObjects.Container; haul: OfflineHaul; claim: Button; double: Button } | null = null;
  private slowmo = 1;
  private hudKey = '';
  private stripCount = 0;
  private lastBaseLuck = 0;
  private comboShown = -1;

  constructor() {
    super(SCENES.dig);
  }

  create(): void {
    this.ses = session(this.oyun);
    this.sim = this.ses.sim;
    this.motes = [];
    this.popup = null;
    this.hint = null;
    this.slowmo = 1;
    this.hudKey = '';
    this.stripKey = '';
    this.lastBaseLuck = this.sim.baseLuck;
    this.comboShown = -1;
    const L = this.layout;
    // header (title, chips, combo) | dig site (block, HP bar, glints) | footer (last find, buttons)
    this.site = { top: L.top + HEADER, bottom: Math.max(L.top + HEADER + 420, L.bottom - FOOTER) };
    const siteH = this.site.bottom - this.site.top;
    const blockH = Math.max(260, Math.min(420, siteH - 120));
    this.blockY = this.site.top + 24 + blockH / 2;

    this.bg = this.add.graphics().setDepth(-10);
    this.drawBackground();
    for (let i = 0; i < 22; i++) {
      const o = this.add.image(Math.random() * L.width, this.site.top + Math.random() * siteH, 'oyun-dot').setDepth(-5).setAlpha(0.12 + Math.random() * 0.15).setScale(0.3 + Math.random() * 0.5);
      this.motes.push({ o, vy: 6 + Math.random() * 14 });
    }

    this.block = new StratumBlock(this, L.cx, this.blockY, BLOCK_W, blockH).setLayer(this.sim.layer);
    const hpY = this.blockY + blockH / 2 + 42;
    this.hpBar = progressBar(this, L.cx, hpY, 400, 30, { color: PALETTE.ochre });
    this.hpText = outlined(this, L.cx, hpY, '', 24, 0xffffff, 5);

    this.buildHeader();
    this.buildGlint();
    this.buildFooter();
    this.drawer = new Drawer(this, this.sim, hpY + 32, (id) => this.onBuy(id));
    this.reveal = new Reveal({
      scene: this,
      origin: () => ({ x: this.block.x, y: this.block.y }),
      slot: () => ({ x: this.strip.x - 200, y: this.strip.y }),
      landed: (f) => this.onLanded(f),
      setSlowMo: (f) => (this.slowmo = f),
    });

    if (this.sim.stats.taps === 0) {
      this.hint = outlined(this, L.cx, this.blockY, this.t('dig.hint'), 44, PALETTE.ochreLight, 8).setDepth(50);
      fitText(this.hint, BLOCK_W + 120);
      this.tweens.add({ targets: this.hint, scale: this.hint.scale * 1.06, yoyo: true, repeat: -1, duration: 600 });
    }

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // buttons, glint, drawer and overlays handle their own taps
      if (p.worldY < this.site.top || p.worldY > this.site.bottom) return;
      this.onDigTap(p.worldX, p.worldY);
    });

    this.refreshHud(true);
    this.refreshStrip();
    this.syncGlint();
    this.oyun.platform.gameplayStart();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.oyun.platform.gameplayStop();
      this.ses.flush();
    });

    // Offline haul once per app start (the save remembers when we were last seen).
    if (!this.ses.bootOfflineDone) {
      this.ses.bootOfflineDone = true;
      const last = this.ses.lastSeen;
      if (last > 0) this.offerOffline((Date.now() - last) / 1000);
    }
  }

  // ------------------------------------------------------------------ layout

  private drawBackground(): void {
    const L = this.layout;
    const layer = at(LAYERS, this.sim.layer);
    const g = this.bg.clear();
    this.cameras.main.setBackgroundColor(layer.sky);
    g.fillStyle(layer.sky, 1).fillRect(0, 0, L.width, L.height);
    // dig-site pit: darker sediment with faint strata lines
    g.fillStyle(PALETTE.dirtDark, 0.55).fillRoundedRect(L.left + 14, this.site.top - 10, L.right - L.left - 28, this.site.bottom - this.site.top + 20, 30);
    for (let i = 0; i < 9; i++) {
      const y = this.site.top + 20 + i * ((this.site.bottom - this.site.top - 40) / 8);
      g.lineStyle(3, at(layer.bands, i % layer.bands.length), 0.18).lineBetween(L.left + 30, y, L.right - 30, y + Math.sin(i) * 8);
    }
  }

  private buildHeader(): void {
    const L = this.layout;
    const hy = L.top + 60;
    this.pauseButton = iconButton(this, L.left + 60, hy, 'pause', () => this.openPauseMenu());
    this.layerTitle = outlined(this, L.cx, hy, '', 46, PALETTE.sand, 8);
    const arrow = (dir: -1 | 1): Phaser.GameObjects.Graphics => {
      const g = this.add.graphics({ x: L.cx + dir * 232, y: hy });
      g.fillStyle(PALETTE.shadow, 0.5).fillCircle(0, 4, 34);
      g.fillStyle(PALETTE.ochre, 1).fillCircle(0, 0, 34);
      g.fillStyle(PALETTE.ink, 1).fillTriangle(dir * 14, 0, -dir * 9, -15, -dir * 9, 15);
      hitZone(this, g.x, g.y, 96, 96, () => this.onTravel(this.sim.layer + dir));
      return g;
    };
    this.arrows = { left: arrow(-1), right: arrow(1), lock: this.add.image(L.cx + 232, hy, 'lock').setScale(0.7) };

    const cy = L.top + 152;
    const mk = (x: number, icon: string, color: number): Chip => {
      const bg = this.add.graphics({ x, y: cy });
      bg.fillStyle(PALETTE.shadow, 0.5).fillRoundedRect(-104, -44, 208, 96, 22);
      bg.fillStyle(PALETTE.dirt, 1).fillRoundedRect(-104, -48, 208, 96, 22);
      this.add.image(x - 72, cy + 10, icon).setScale(0.9);
      const caption = label(this, x + 14, cy - 24, '', { size: 24, color: PALETTE.sand });
      const value = label(this, x + 14, cy + 14, '', { size: 40, color });
      return { value, caption, bg, last: '' };
    };
    this.chips = {
      power: mk(L.cx - 226, 'ico-power', PALETTE.power),
      dust: mk(L.cx, 'ico-dust', PALETTE.dust),
      luck: mk(L.cx + 226, 'ico-luck', PALETTE.luck),
    };
    this.chips.power.caption.setText(this.t('hud.power'));
    this.chips.dust.caption.setText(this.t('hud.dust'));
    fitText(this.chips.power.caption, 150);
    // tapping the luck chip explains the luck rule
    hitZone(this, L.cx + 226, cy, 208, 96, () => toast(this, this.t('dig.luckRule'), { duration: 3200 }));

    this.comboBar = progressBar(this, L.cx, L.top + 236, 560, 40, { color: PALETTE.luck });
    this.comboText = outlined(this, L.cx, L.top + 235, '', 28, 0xffffff, 6);
  }

  private buildFooter(): void {
    const L = this.layout;
    // last-find strip
    this.strip = this.add.container(L.cx + 40, L.bottom - 300);
    this.museumButton = button(this, L.cx - 168, L.bottom - 76, this.t('dig.museum'), () => this.goTo(SCENES.museum), { width: 300, height: 104, fontSize: 40, variant: 'secondary' });
    this.upgradesButton = button(this, L.cx + 168, L.bottom - 76, this.t('dig.upgrades'), () => this.drawer.toggle(), { width: 300, height: 104, fontSize: 40 });
    this.boostButton = button(this, L.cx, L.bottom - 190, this.t('dig.boost'), () => void this.onBoost(), { width: 360, height: 88, fontSize: 34, variant: 'secondary' });
    this.museumButton.setDepth(400);
    this.upgradesButton.setDepth(400);
  }

  private buildGlint(): void {
    const c = this.add.container(0, 0).setDepth(300).setVisible(false);
    const halo = this.add.circle(0, 0, 60, PALETTE.glint, 0.25);
    const star = this.add.image(0, 0, 'spark').setScale(3.2).setTint(PALETTE.glint);
    const star2 = this.add.image(0, 0, 'spark').setScale(1.8).setTint(0xffffff).setAngle(45);
    this.glintLabel = outlined(this, 0, 78, '', 30, PALETTE.glint, 6);
    c.add([halo, star, star2, this.glintLabel]);
    this.tweens.add({ targets: [star, star2], angle: '+=360', duration: 2400, repeat: -1 });
    this.tweens.add({ targets: halo, scale: 1.35, alpha: 0.08, yoyo: true, repeat: -1, duration: 420 });
    this.glint = c;
    this.glintZone = hitZone(this, 0, 0, 140, 140, () => this.onGlintTap());
    this.glintZone.setDepth(301);
    this.glintZone.disableInteractive();
  }

  // ------------------------------------------------------------------ input

  /** The one dig handler: pointer taps on the site and the test hook both call it. */
  private onDigTap(x: number, y: number): void {
    if (this.reveal.blocking) {
      this.reveal.dismiss();
      return;
    }
    if (this.popup) return;
    if (this.hint) {
      const h = this.hint;
      this.hint = null;
      this.tweens.killTweensOf(h);
      this.tweens.add({ targets: h, alpha: 0, duration: 200, onComplete: () => h.destroy() });
    }
    const r = this.sim.tap();
    const layer = at(LAYERS, this.sim.layer);
    this.oyun.audio.playPreset(SFX.dig, { pitch: Math.round(this.sim.combo * 7), volume: 0.8 });
    this.juice.burst(x, y, { count: 3, color: at(layer.bands, 2), texture: 'chip', distance: 70, duration: 300 });
    if (r.find) this.onBlockBroken(r.find);
    else {
      this.juice.squash(this.block, 0.035, 140);
      this.block.setDamage(this.sim.blockDamage / this.sim.blockHp);
    }
    this.ses.markDirty();
  }

  private onBlockBroken(find: Find): void {
    const layer = at(LAYERS, this.sim.layer);
    this.oyun.audio.playPreset(SFX.crack);
    this.juice.feedback('small', this.block.x, this.block.y, at(layer.bands, 1));
    this.juice.burst(this.block.x, this.block.y, { count: 12, color: at(layer.bands, 3), texture: 'chip', distance: 230, duration: 480 });
    this.block.regenerate();
    this.juice.pop(this.block, 0.82, 200);
    this.onFind(find);
  }

  private onGlintTap(): void {
    const g = this.sim.glint;
    if (!g || this.reveal.blocking || this.popup) return;
    const pos = { x: this.glint.x, y: this.glint.y };
    const f = this.sim.tapGlint();
    if (!f) return;
    this.oyun.audio.playPreset(SFX.glint, { pitch: 5 });
    this.oyun.platform.haptic('medium');
    this.juice.burst(pos.x, pos.y, { count: 16, color: PALETTE.glint, texture: 'spark', distance: 180 });
    this.syncGlint();
    this.onFind(f, pos);
  }

  private onTravel(layer: number): void {
    if (this.reveal.blocking || this.popup) return;
    if (layer < 0 || layer >= LAYERS.length) return;
    if (layer > this.sim.unlocked) {
      this.oyun.audio.play('hit', { volume: 0.4 });
      toast(this, this.t('dig.locked', { n: big(this, at(LAYERS, layer).unlockPower) }));
      this.juice.shake(0.12);
      return;
    }
    if (!this.sim.travel(layer)) return;
    this.oyun.audio.playPreset(SFX.flip);
    this.oyun.platform.haptic('light');
    this.drawBackground();
    this.block.setLayer(layer);
    this.juice.pop(this.block, 0.6, 280);
    this.cameras.main.flash(160, 0, 0, 0);
    this.refreshHud(true);
    this.ses.flush();
  }

  private onBuy(id: UpgradeId): void {
    if (!this.sim.buy(id)) {
      this.oyun.audio.play('hit', { volume: 0.3 });
      return;
    }
    this.oyun.audio.playPreset(SFX.buy, { pitch: Math.min(12, this.sim.level(id)) });
    this.oyun.platform.haptic('light');
    const btn = this.drawer.buyButton(id);
    this.juice.burst(btn.x, this.drawer.y + btn.y, { count: 8, color: PALETTE.dust, texture: 'spark', distance: 90 });
    this.oyun.platform.track('upgrade_bought', { id, level: this.sim.level(id) });
    this.refreshHud(true);
    this.drawer.refresh();
    this.ses.flush();
  }

  private async onBoost(): Promise<void> {
    if (this.sim.boostSeconds > 0) return;
    this.boostButton.setEnabled(false);
    const r = await this.oyun.platform.showRewarded('luck_boost');
    if (r === 'granted') {
      this.sim.grantLuckBoost(LUCK_BOOST.seconds);
      toast(this, this.t('dig.boostOn'));
      this.oyun.audio.play('win');
      this.oyun.platform.track('reward_claimed', { placement: 'luck_boost' });
      this.ses.flush();
    }
    this.refreshHud(true);
  }

  // ------------------------------------------------------------------ finds

  private onFind(find: Find, from?: { x: number; y: number }): void {
    this.reveal.show(find, from);
    if (find.fusions > 0) {
      this.oyun.audio.playPreset(SFX.fuse, { pitch: find.grade * 3 });
      const pos = this.reveal.blocking ? null : { x: this.strip.x - 200, y: this.strip.y - 70 };
      if (pos) this.juice.floatText(pos.x, pos.y, this.t('reveal.fused', { grade: this.t(`grade.${find.grade}`) }), { color: at(GRADE_COLORS, find.grade), size: 34 });
    }
    if (find.setCompleted !== null) {
      const name = this.t(`layer.${at(LAYERS, find.setCompleted).id}`);
      this.time.delayedCall(900, () => {
        toast(this, this.t('dig.setDone', { name }), { duration: 2400, color: at(TIERS, 3).color });
        this.oyun.audio.playPreset(SFX.fanfare);
        this.oyun.platform.haptic('success');
      });
      this.oyun.platform.track('set_complete', { layer: find.setCompleted });
    }
    if (find.unlocked !== null) {
      const name = this.t(`layer.${at(LAYERS, find.unlocked).id}`);
      this.time.delayedCall(500, () => {
        toast(this, this.t('dig.unlocked', { name }), { duration: 2400, color: PALETTE.dirtLight });
        this.oyun.audio.playPreset(SFX.fanfare, { pitch: 3 });
        this.oyun.platform.haptic('success');
        this.juice.pop(this.arrows.right, 1.6, 500);
      });
      this.oyun.platform.track('layer_unlocked', { layer: find.unlocked });
    }
    this.ses.markDirty();
    if (find.isNew || find.fossil.tier >= 2 || find.setCompleted !== null || find.unlocked !== null) this.ses.flush();
  }

  private onLanded(_find: Find): void {
    this.refreshStrip();
    this.juice.pop(this.strip, 1.12, 180);
  }

  // ------------------------------------------------------------------ offline

  private offerOffline(elapsed: number): void {
    if (!(elapsed >= OFFLINE_MIN_SECONDS)) return;
    const haul = this.sim.claimOffline(elapsed);
    this.ses.flush();
    if (haul.blocks <= 0) return;
    this.oyun.platform.track('offline_haul', { blocks: haul.blocks, dust: haul.dust });
    this.showOfflinePopup(haul);
  }

  private showOfflinePopup(haul: OfflineHaul): void {
    this.popup?.box.destroy();
    const L = this.layout;
    const box = this.add.container(0, 0).setDepth(950);
    const shade = this.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, 0x000000, 0.7).setInteractive();
    const card = panel(this, L.cx, L.cy, 640, 720, { color: PALETTE.dirtLight });
    box.add([shade, card]);
    const lines: [string, number, number][] = [
      [this.t('offline.title'), 50, PALETTE.ochreLight],
      [this.t('offline.body', { blocks: big(this, haul.blocks), min: Math.round(haul.seconds / 60) }), 32, 0xffffff],
      [this.t('offline.dust', { n: big(this, haul.dust) }), 52, PALETTE.dust],
      [this.t('offline.found', { n: big(this, haul.blocks), k: haul.newSpecies.length }), 32, PALETTE.sand],
    ];
    if (haul.best) lines.push([this.t('offline.best', { name: fossilName(this, haul.best), odds: oddsText(this, haul.best.odds) }), 30, at(TIERS, haul.best.tier).color]);
    if (haul.seconds >= this.sim.offlineCap - 1) lines.push([this.t('offline.cap', { min: Math.round(this.sim.offlineCap / 60) }), 26, PALETTE.sand]);
    let y = -310;
    for (const [text, size, color] of lines) {
      const t = label(this, 0, y, text, { size, color, wrap: 560 }).setOrigin(0.5, 0);
      card.add(t);
      y += t.height + 18;
    }
    const claim = button(this, L.cx, L.cy + 170, this.t('offline.claim'), () => this.closePopup(), { width: 440, height: 100 });
    const double = button(this, L.cx, L.cy + 286, this.t('offline.double'), () => void this.doubleOffline(), { width: 500, height: 92, fontSize: 34, variant: 'secondary' });
    box.add([claim, double]);
    this.juice.pop(card, 0.5, 320);
    this.oyun.audio.play('coin');
    this.popup = { box, haul, claim, double };
  }

  private async doubleOffline(): Promise<void> {
    const p = this.popup;
    if (!p) return;
    p.double.setEnabled(false);
    const r = await this.oyun.platform.showRewarded('double_offline');
    if (r === 'granted' && this.sim.doubleOfflineDust()) {
      this.oyun.platform.track('reward_claimed', { placement: 'double_offline' });
      toast(this, this.t('offline.doubled'));
      this.oyun.audio.play('win');
      this.ses.flush();
      this.closePopup();
    } else p.double.setEnabled(true);
  }

  private closePopup(): void {
    const p = this.popup;
    if (!p) return;
    this.popup = null;
    this.tweens.add({ targets: p.box, alpha: 0, duration: 180, onComplete: () => p.box.destroy() });
    this.refreshHud(true);
    this.refreshStrip();
  }

  protected override onPlatformPause(reason: PauseReason): void {
    this.ses.flush();
    if (reason === 'hidden') this.ses.hiddenAt = Date.now();
    super.onPlatformPause(reason);
  }

  protected override onPlatformResume(reason: PauseReason): void {
    if (reason === 'hidden' && this.ses.hiddenAt > 0) {
      const away = (Date.now() - this.ses.hiddenAt) / 1000;
      this.ses.hiddenAt = 0;
      if (!this.popup) this.offerOffline(away);
    }
    super.onPlatformResume(reason);
  }

  // ------------------------------------------------------------------ frame

  override update(_time: number, delta: number): void {
    const real = Math.min(delta, 250) / 1000;
    for (const m of this.motes) {
      m.o.y -= m.vy * real * this.slowmo;
      if (m.o.y < this.site.top) m.o.y = this.site.bottom;
    }
    if (!this.reveal.blocking && !this.popup) this.step(this.juice.scaledDelta(Math.min(delta, 250)) / 1000);
    this.refreshHud();
    this.drawer.refresh();
    this.ses.autosave();
  }

  /** Advance the sim by dt seconds and present what happened. */
  private step(dt: number): void {
    if (dt <= 0) return;
    const r = this.sim.tick(dt);
    for (const f of r.finds) {
      this.block.regenerate();
      this.onFind(f);
    }
    if (r.finds.length) this.ses.markDirty();
    if (r.glintAppeared) {
      this.oyun.audio.playPreset(SFX.glint);
      this.oyun.platform.haptic('light');
    }
    if (r.glintAppeared || r.glintExpired) this.syncGlint();
    if (this.sim.glint) {
      const life = this.sim.glint.life;
      this.glint.setAlpha(life < 1 ? 0.4 + 0.6 * Math.abs(Math.sin(life * 12)) : 1);
    }
    if (r.finds.length === 0) this.block.setDamage(this.sim.blockDamage / this.sim.blockHp);
  }

  private syncGlint(): void {
    const g = this.sim.glint;
    if (!g) {
      this.glint.setVisible(false);
      this.glintZone.disableInteractive();
      return;
    }
    const L = this.layout;
    const x = L.left + 70 + g.x * (L.right - L.left - 140);
    const y = this.site.top + 50 + g.y * (this.site.bottom - this.site.top - 100);
    this.glint.setPosition(x, y).setVisible(true).setAlpha(1);
    this.glintLabel.setText(this.t('dig.glint', { n: mult(this, this.sim.glintLuck) }));
    this.glintZone.setPosition(x, y).setInteractive({ useHandCursor: true });
    this.juice.pop(this.glint, 0.3, 300);
  }

  private refreshHud(force = false): void {
    const s = this.sim;
    const luck = s.luck;
    const boost = Math.ceil(s.boostSeconds);
    const key = `${s.layer}|${s.unlocked}|${Math.round(s.digPower)}|${Math.floor(s.dust)}|${luck.toFixed(2)}|${s.comboMult.toFixed(1)}|${boost}|${s.blockHp}|${Math.round(s.blockDamage)}`;
    if (Math.abs(this.comboShown - s.combo) > 0.004) {
      this.comboShown = s.combo;
      this.comboBar.setValue(s.combo);
    }
    if (!force && key === this.hudKey) return;
    this.hudKey = key;
    const setChip = (c: Chip, text: string, pop: boolean): void => {
      if (c.last === text) return;
      c.last = text;
      c.value.setText(text);
      fitText(c.value, 140);
      if (pop) this.juice.pop(c.value, 1.12, 160);
    };
    setChip(this.chips.power, big(this, s.digPower), true);
    setChip(this.chips.dust, big(this, s.dust), true);
    // luck moves every frame while the combo drains: update quietly, pop only when base luck rises
    const baseUp = s.baseLuck > this.lastBaseLuck;
    this.lastBaseLuck = s.baseLuck;
    setChip(this.chips.luck, this.t('hud.mult', { n: mult(this, luck) }), baseUp);
    this.chips.luck.caption.setText(boost > 0 ? this.t('hud.boost', { s: boost }) : this.t('hud.luck'));
    fitText(this.chips.luck.caption, 150);
    this.chips.luck.caption.setColor(cssColor(boost > 0 ? PALETTE.glint : PALETTE.sand));
    this.comboText.setText(this.t('hud.combo', { n: mult(this, Math.round(s.comboMult * 10) / 10) }));
    this.layerTitle.setText(this.t(`layer.${at(LAYERS, s.layer).id}`));
    fitText(this.layerTitle, 360);
    this.arrows.left.setVisible(s.layer > 0);
    const deeper = s.layer < LAYERS.length - 1;
    this.arrows.right.setVisible(deeper);
    this.arrows.right.setAlpha(s.layer < s.unlocked ? 1 : 0.45);
    this.arrows.lock.setVisible(deeper && s.layer >= s.unlocked);
    const hp = s.blockHp;
    this.hpBar.setValue(1 - s.blockDamage / hp);
    const left = Math.max(1, Math.ceil((hp - s.blockDamage) / s.digPower));
    this.hpText.setText(this.t('hud.taps', { n: big(this, left) }));
    const affordable = (['pick', 'luck', 'assistant', 'offline'] as const).filter((id) => s.canBuy(id)).length;
    this.upgradesButton.setLabel(affordable > 0 ? `${this.t('dig.upgrades')} (${affordable})` : this.t('dig.upgrades'));
    this.boostButton.setEnabled(boost <= 0);
    this.boostButton.setLabel(boost > 0 ? this.t('hud.boost', { s: boost }) : this.t('dig.boost'));
  }

  private refreshStrip(): void {
    const last = this.sim.lastFind;
    const counts = layerFossils(this.sim.layer).filter((f) => this.sim.discovered(f.id)).length;
    const key = `${last?.id}|${last?.grade}|${counts}|${this.stripCount}`;
    if (key === this.stripKey) return;
    this.stripKey = key;
    this.strip.removeAll(true);
    const L = this.layout;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.45).fillRoundedRect(-300, -46, 520, 100, 24);
    g.fillStyle(PALETTE.dirt, 1).fillRoundedRect(-300, -52, 520, 100, 24);
    this.strip.add(g);
    if (!last) {
      this.strip.add(label(this, -40, -2, this.t('dig.last'), { size: 30, color: PALETTE.sand }));
      return;
    }
    const f = FOSSIL_BY_ID.get(last.id)!;
    const tier = at(TIERS, f.tier);
    g.lineStyle(6, tier.color, 1).strokeRoundedRect(-300, -52, 520, 100, 24);
    g.fillStyle(at(GRADE_COLORS, last.grade), 1).fillCircle(-238, 30, 10);
    this.strip.add(this.add.image(-240, -2, fossilKey(f.id)).setScale(0.52));
    const name = label(this, -170, -20, fossilName(this, f), { size: 32, color: 0xffffff }).setOrigin(0, 0.5);
    fitText(name, 360);
    const odds = label(this, -170, 20, oddsText(this, f.odds), { size: 30, color: f.tier === 0 ? PALETTE.sand : tier.color }).setOrigin(0, 0.5);
    fitText(odds, 360);
    this.strip.add([name, odds]);
    void L;
  }

  // ------------------------------------------------------------------ test hook

  /** A tap on the block centre, exactly as a finger would land there. */
  private tapBlock(): void {
    if (this.reveal.blocking) this.reveal.dismiss();
    else if (!this.popup) this.onDigTap(this.block.x, this.block.y);
  }

  protected override testState() {
    const s = this.sim;
    const perLayer = LAYERS.map((_, l) => s.setProgress(l).found);
    const last = s.lastFind ? FOSSIL_BY_ID.get(s.lastFind.id)! : null;
    return {
      layer: s.layer,
      unlocked: s.unlocked,
      digPower: Math.round(s.digPower),
      luck: Math.round(s.luck * 100) / 100,
      baseLuck: Math.round(s.baseLuck * 100) / 100,
      dust: Math.floor(s.dust),
      combo: Math.round(s.combo * 100) / 100,
      blockHp: s.blockHp,
      blockDamage: Math.round(s.blockDamage),
      museum: { found: perLayer.reduce((a, b) => a + b, 0), total: 48, perLayer },
      lastFind: last && s.lastFind ? { id: last.id, odds: last.odds, grade: s.lastFind.grade } : null,
      taps: s.stats.taps,
      rolls: s.stats.rolls,
      glint: s.glint !== null,
      ceremony: this.reveal.busy,
      canDismiss: this.reveal.canDismiss,
      lastReveal: this.reveal.lastKind,
      drawerOpen: this.drawer.open,
      levels: { pick: s.level('pick'), luck: s.level('luck'), assistant: s.level('assistant'), offline: s.level('offline') },
      costs: { pick: s.upgradeCost('pick'), luck: s.upgradeCost('luck'), assistant: s.upgradeCost('assistant'), offline: s.upgradeCost('offline') },
      boost: Math.ceil(s.boostSeconds),
      offline: this.popup ? { blocks: this.popup.haul.blocks, dust: this.popup.haul.dust } : null,
    };
  }

  protected override testActions() {
    return {
      tap: (p: unknown) => {
        const n = typeof p === 'number' ? p : 1;
        for (let i = 0; i < n; i++) this.tapBlock();
      },
      glint: () => this.onGlintTap(),
      buy: (p: unknown) => this.drawer.buyButton(p as UpgradeId).fire(),
      advance: (p: unknown) => {
        let left = typeof p === 'number' ? p : 1;
        while (left > 0 && !this.reveal.blocking && !this.popup) {
          const dt = Math.min(0.1, left);
          this.step(dt);
          left -= dt;
        }
        this.refreshHud(true);
      },
      travel: (p: unknown) => this.onTravel(typeof p === 'number' ? p : this.sim.layer + 1),
      museum: () => this.museumButton.fire(),
      drawer: () => this.upgradesButton.fire(),
      dismiss: () => this.reveal.dismiss(),
      boost: () => this.boostButton.fire(),
      claim: () => this.popup?.claim.fire(),
      double: () => this.popup?.double.fire(),
      pause: () => this.pauseButton.fire(),
    };
  }
}
