import { button, cssColor, iconButton, label, OyunScene, panel, progressBar, toast, type Button, type IconButton, type ProgressBar } from '@oyun/core';
import type { PauseReason } from '@oyun/core/pure';
import Phaser from 'phaser';
import { backgroundAware, session, type Session } from '../session';
import { SFX } from '../sfx';
import { ACHIEVEMENTS, at, BOSS, FEVER, FOSSIL_BY_ID, GRADE_COLORS, LAYERS, LUCK_BOOST, PITY, RANKS, RELIC, TIERS, UPGRADE_ORDER, VEIN, type UpgradeId } from '../sim/data';
import type { DigSim, Find, OfflineHaul, SimEvent, TapResult } from '../sim/dig';
import { badgeKey } from '../art/badges';
import { questText, today } from './progress';
import { fossilKey, PALETTE } from '../textures';
import { shade } from '../art/fossils';
import { addCardLife } from '../fx/CardLife';
import { Helper } from '../fx/Helper';
import { Particles } from '../fx/Particles';
import { Pickaxe } from '../fx/Pickaxe';
import { Scenery } from '../fx/Scenery';
import { StratumBlock } from './Block';
import { Drawer } from './Drawer';
import { SCENES } from './keys';
import { Reveal } from './Reveal';
import { big, counted, fitText, fossilName, hitZone, luckLine, mult, oddsText, outlined } from './ui';

const BLOCK_W = 460;
/** `?fx=0` switches the presentation layer off (for on/off comparisons); gameplay is identical. */
const FX_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('fx') !== '0';
const HEADER = 266;
const FOOTER = 362;

interface Chip {
  value: Phaser.GameObjects.Text;
  caption: Phaser.GameObjects.Text;
  last: string;
}

/**
 * The dig: tappable site with the stratum block, combo meter, glints, HUD readouts, the upgrade
 * drawer, the reveal ceremony, one-time tips and the offline-haul popup. Draws sim state and
 * forwards input. Test actions: tap {n}, glint, buy {id}, advance {seconds}, travel {layer},
 * museum, drawer, dismiss, boost, claim, double, pause, tip.
 */
export class DigScene extends OyunScene {
  protected override autoPause = true;
  private ses!: Session;
  private sim!: DigSim;
  private block!: StratumBlock;
  private blockY = 0;
  private hpY = 0;
  private hpBar!: ProgressBar;
  private hpText!: Phaser.GameObjects.Text;
  private site = { top: 0, bottom: 0 };
  private chips!: Record<'power' | 'dust' | 'luck', Chip>;
  private comboBar!: ProgressBar;
  private comboText!: Phaser.GameObjects.Text;
  private layerTitle!: Phaser.GameObjects.Text;
  private arrows!: { left: Phaser.GameObjects.Graphics; right: Phaser.GameObjects.Graphics; lock: Phaser.GameObjects.Image; nudge: Phaser.GameObjects.Arc };
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
  private scenery!: Scenery;
  private fx!: Particles;
  private rubble!: Particles;
  private pick!: Pickaxe;
  private helper!: Helper;
  private glintSparks: Phaser.GameObjects.Image[] = [];
  private fxClock = 0;
  private travelling = false;
  private blockH = 0;
  private napUntil = 0;
  /** JS time spent in this scene's own frame update and tap handler (test state). */
  private perf = { frameMs: 0, frames: 0, tapMs: 0, taps: 0 };
  private hint: Phaser.GameObjects.Text | null = null;
  private popup: { box: Phaser.GameObjects.Container; haul: OfflineHaul; claim: Button; double: Button; doubled: boolean } | null = null;
  private tip: { box: Phaser.GameObjects.Container; id: string; until: number } | null = null;
  private tipQueue: { id: string; text: string }[] = [];
  private fuseBusy = false;
  private slowmo = 1;
  private hudKey = '';
  private lastBaseLuck = 0;
  private lastPower = 0;
  private comboShown = -1;
  private statusText!: Phaser.GameObjects.Text;
  private statusKey = '';
  private feverBar!: ProgressBar;
  private feverFx: { frame: Phaser.GameObjects.Graphics; title: Phaser.GameObjects.Text } | null = null;
  private rankBadge!: Phaser.GameObjects.Image;
  private rankRing!: Phaser.GameObjects.Arc;
  private rankShown = -1;
  private streak!: { g: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; x: number; y: number; shown: number };
  private dailyButton!: Button;
  private holdState: { x: number; y: number; t0: number; ring: Phaser.GameObjects.Arc; text: Phaser.GameObjects.Text } | null = null;
  private ceremony: Phaser.GameObjects.Container | null = null;
  private dailyBox: Phaser.GameObjects.Container | null = null;

  constructor() {
    super(SCENES.dig);
  }

  create(): void {
    this.ses = session(this.oyun);
    this.sim = this.ses.sim;
    this.travelling = false;
    this.fxClock = 0;
    this.napUntil = 0;
    this.perf = { frameMs: 0, frames: 0, tapMs: 0, taps: 0 };
    this.popup = null;
    this.tip = null;
    this.tipQueue = [];
    this.fuseBusy = false;
    this.hint = null;
    this.slowmo = 1;
    this.hudKey = '';
    this.stripKey = '';
    this.lastBaseLuck = this.sim.baseLuck;
    this.lastPower = this.sim.digPower;
    this.comboShown = -1;
    this.statusKey = '';
    this.feverFx = null;
    this.rankShown = -1;
    this.holdState = null;
    this.ceremony = null;
    this.dailyBox = null;
    this.sim.setClock(Date.now());
    const L = this.layout;
    // header (title, chips, combo) | dig site (block, HP bar, glints) | footer (last find, buttons)
    this.site = { top: L.top + HEADER, bottom: Math.max(L.top + HEADER + 420, L.bottom - FOOTER) };
    const siteH = this.site.bottom - this.site.top;
    const blockH = Math.max(260, Math.min(400, siteH - 140));
    this.blockY = this.site.top + 48 + blockH / 2; // room above for the block's status line

    this.blockH = blockH;
    this.scenery = new Scenery(this, { top: this.site.top, bottom: this.site.bottom, left: L.left, right: L.right });
    this.scenery.setLayer(this.sim.layer);
    this.rubble = new Particles(this, 36, 45);
    this.fx = new Particles(this, 120, 250);

    this.block = new StratumBlock(this, L.cx, this.blockY, BLOCK_W, blockH).setLayer(this.sim.layer).setKind(this.sim.block.kind);
    this.statusText = outlined(this, L.cx, this.site.top + 22, '', 28, 0xffffff, 6).setDepth(62);
    this.hpY = this.blockY + blockH / 2 + 42;
    this.hpBar = progressBar(this, L.cx, this.hpY, 400, 30, { color: PALETTE.ochre }).setDepth(60); // above rubble
    this.hpText = outlined(this, L.cx, this.hpY, '', 24, 0xffffff, 5).setDepth(61);

    this.pick = new Pickaxe(this, 255);
    this.pick.setTier(this.sim.level('pick'));
    this.pick.setRest(L.cx + BLOCK_W / 2 + 64, this.blockY + blockH / 2 - 10);
    this.helper = new Helper(this, L.left + 64, this.hpY + 6, 1, this.fx, { x: L.cx - BLOCK_W / 2 + 6, y: this.hpY - 60 });
    this.buildHeader();
    this.buildGlint();
    this.buildFooter();
    this.drawer = new Drawer(this, this.sim, this.hpY + 32, (id) => this.onBuy(id));
    this.reveal = new Reveal({
      scene: this,
      origin: () => ({ x: this.block.x, y: this.block.y }),
      slot: () => ({ x: this.strip.x - 240, y: this.strip.y }),
      landed: (f) => this.onLanded(f),
      setSlowMo: (f) => (this.slowmo = f),
    });

    if (this.sim.stats.taps === 0) {
      this.hint = outlined(this, L.cx, this.blockY, this.t('dig.hint'), 44, PALETTE.ochreLight, 8).setDepth(50);
      fitText(this.hint, BLOCK_W + 120);
      this.tweens.add({ targets: this.hint, scale: this.hint.scale * 1.06, yoyo: true, repeat: -1, duration: 600 });
    }

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // buttons, glint, drawer, tips and overlays handle their own taps
      if (p.worldY < this.site.top || p.worldY > this.site.bottom) return;
      // a hard vein is struck on release: holding charges the blow
      if (this.sim.block.kind === 'vein' && !this.reveal.blocking && !this.popup && !this.ceremony) this.startHold(p.worldX, p.worldY);
      else this.onDigTap(p.worldX, p.worldY);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.releaseHold());

    this.refreshHud(true);
    this.refreshStrip();
    this.syncGlint();
    this.refreshProgress(true);
    this.oyun.platform.gameplayStart();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.oyun.platform.gameplayStop();
      this.ses.flush();
    });

    // Away time since the last save (first scene after boot); then anything found off-screen.
    this.ses.boot();
    this.time.delayedCall(250, () => this.replayPending());
  }

  // ------------------------------------------------------------------ layout

  private buildHeader(): void {
    const L = this.layout;
    const hy = L.top + 60;
    this.pauseButton = iconButton(this, L.left + 60, hy, 'pause', () => this.openPauseMenu());
    this.layerTitle = outlined(this, L.cx, hy, '', 46, PALETTE.sand, 8);
    // arrows sit between the pause button (left edge) and the screen edge, clear of both
    const ax = 172;
    const arrow = (dir: -1 | 1): Phaser.GameObjects.Graphics => {
      const g = this.add.graphics({ x: L.cx + dir * ax, y: hy });
      g.fillStyle(PALETTE.shadow, 0.5).fillCircle(0, 4, 34);
      g.fillStyle(PALETTE.ochre, 1).fillCircle(0, 0, 34);
      g.fillStyle(PALETTE.ink, 1).fillTriangle(dir * 14, 0, -dir * 9, -15, -dir * 9, 15);
      hitZone(this, g.x, g.y, 92, 92, () => this.onTravel(this.sim.layer + dir));
      return g;
    };
    const nudge = this.add.circle(L.cx + ax, hy, 40).setStrokeStyle(6, PALETTE.glint, 1).setVisible(false);
    this.tweens.add({ targets: nudge, scale: 1.45, alpha: 0, duration: 900, repeat: -1 });
    this.arrows = { left: arrow(-1), right: arrow(1), lock: this.add.image(L.cx + ax, hy, 'lock').setScale(0.7), nudge };
    // rank badge (top right): opens the ladder; a ring pulses when the expedition is open
    const rx = L.right - 54;
    this.rankRing = this.add.circle(rx, hy, 40).setStrokeStyle(6, PALETTE.glint, 1).setVisible(false);
    this.tweens.add({ targets: this.rankRing, scale: 1.4, alpha: 0, duration: 900, repeat: -1 });
    this.rankBadge = this.add.image(rx, hy, badgeKey(this, this.sim.rank)).setScale(0.55);
    hitZone(this, rx, hy, 96, 96, () => this.goTo(SCENES.ranks));

    const cy = L.top + 152;
    const mk = (x: number, icon: string, color: number): Chip => {
      const bg = this.add.graphics({ x, y: cy });
      bg.fillStyle(PALETTE.shadow, 0.5).fillRoundedRect(-104, -44, 208, 96, 22);
      bg.fillStyle(PALETTE.dirt, 1).fillRoundedRect(-104, -48, 208, 96, 22);
      this.add.image(x - 72, cy + 10, icon).setScale(0.9);
      const caption = label(this, x + 14, cy - 24, '', { size: 24, color: PALETTE.sand });
      const value = label(this, x + 14, cy + 14, '', { size: 40, color });
      return { value, caption, last: '' };
    };
    this.chips = {
      power: mk(L.cx - 226, 'ico-power', PALETTE.power),
      dust: mk(L.cx, 'ico-dust', PALETTE.dust),
      luck: mk(L.cx + 226, 'ico-luck', PALETTE.luck),
    };
    this.chips.power.caption.setText(this.t('hud.power'));
    this.chips.dust.caption.setText(this.t('hud.dust'));
    fitText(this.chips.power.caption, 150);
    hitZone(this, L.cx - 226, cy, 208, 96, () => this.showTip('power', this.t('tip.power'), true));
    hitZone(this, L.cx, cy, 208, 96, () => this.showTip('dust', this.t('tip.dust'), true));
    hitZone(this, L.cx + 226, cy, 208, 96, () => this.showTip('luck', this.t('dig.luckRule'), true));

    // combo: label on the left, bar on the right (the label never straddles the fill)
    this.comboText = outlined(this, L.left + 36, L.top + 236, '', 28, 0xffffff, 6).setOrigin(0, 0.5);
    const barLeft = L.left + 250;
    const barW = L.right - 36 - barLeft;
    this.comboBar = progressBar(this, barLeft + barW / 2, L.top + 236, barW, 36, { color: PALETTE.luck });
    // fever meter: a thin bar under the combo, filled by your taps; full = FEVER
    this.feverBar = progressBar(this, barLeft + barW / 2, L.top + 262, barW, 12, { color: 0xff6a20 });
    hitZone(this, barLeft + barW / 2, L.top + 248, barW, 56, () => this.showTip('fever', this.t('tip.fever'), true));
  }

  private buildFooter(): void {
    const L = this.layout;
    this.strip = this.add.container(L.cx + 20, L.bottom - 300);
    this.museumButton = button(this, L.cx - 168, L.bottom - 76, this.t('dig.museum'), () => this.goTo(SCENES.museum), { width: 300, height: 104, fontSize: 40, variant: 'secondary' });
    this.upgradesButton = button(this, L.cx + 168, L.bottom - 76, this.t('dig.upgrades'), () => this.drawer.toggle(), { width: 300, height: 104, fontSize: 40 });
    this.boostButton = button(this, L.cx, L.bottom - 190, this.t('dig.boost'), () => void this.onBoost(), { width: 360, height: 88, fontSize: 34, variant: 'secondary' });
    this.museumButton.setDepth(400);
    this.upgradesButton.setDepth(400);
    // lucky-streak gauge left of the boost button; the daily dig right of it
    const sx = L.left + 84;
    const sy = L.bottom - 190;
    this.streak = { g: this.add.graphics({ x: sx, y: sy }), text: outlined(this, sx, sy, '', 26, 0xffffff, 5), x: sx, y: sy, shown: -1 };
    outlined(this, sx, sy - 60, this.t('hud.streakShort'), 22, PALETTE.sand, 5);
    hitZone(this, sx, sy, 110, 110, () => this.showTip('pity', this.t('tip.pity'), true));
    this.dailyButton = button(this, L.right - 84, sy, this.t('dig.daily'), () => this.openDaily(), { width: 140, height: 88, fontSize: 28 });
    this.tweens.add({ targets: this.dailyButton, scale: 1.06, yoyo: true, repeat: -1, duration: 700 });
  }

  private buildGlint(): void {
    // something glittering in the rock: a soft glow, a main star and a ring of tiny twinkles
    const c = this.add.container(0, 0).setDepth(300).setVisible(false);
    const halo = this.add.image(0, 0, 'glow').setTint(PALETTE.glint).setScale(1.3).setAlpha(0.55);
    const star = this.add.image(0, 0, 'spark').setScale(2.6).setTint(PALETTE.glint);
    const star2 = this.add.image(0, 0, 'spark').setScale(1.5).setTint(0xffffff).setAngle(45);
    this.glintSparks = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const a = (i / 7) * Math.PI * 2;
      const r = 26 + (i % 3) * 12;
      return this.add.image(Math.cos(a) * r, Math.sin(a) * r * 0.8, 'spark').setTint(i % 2 ? 0xffffff : PALETTE.glint).setScale(0.6);
    });
    this.glintLabel = outlined(this, 0, -82, '', 30, PALETTE.glint, 6); // above the glint, clear of the HP bar
    c.add([halo, ...this.glintSparks, star, star2, this.glintLabel]);
    this.tweens.add({ targets: [star, star2], angle: '+=360', duration: 2400, repeat: -1 });
    this.tweens.add({ targets: halo, scale: 1.7, alpha: 0.25, yoyo: true, repeat: -1, duration: 520 });
    this.glint = c;
    this.glintZone = hitZone(this, 0, 0, 140, 140, () => this.onGlintTap());
    this.glintZone.setDepth(301);
    this.glintZone.disableInteractive();
  }

  // ------------------------------------------------------------------ input

  /** The one dig handler: pointer taps on the site and the test hook both call it. */
  private onDigTap(x: number, y: number, hold?: number): void {
    const t0 = performance.now();
    this.digTap(x, y, hold);
    this.perf.tapMs += performance.now() - t0;
    this.perf.taps += 1;
  }

  private digTap(x: number, y: number, hold?: number): void {
    if (this.reveal.blocking) {
      this.reveal.dismiss();
      return;
    }
    if (this.popup || this.ceremony) return;
    if (this.hint) {
      const h = this.hint;
      this.hint = null;
      this.tweens.killTweensOf(h);
      this.tweens.add({ targets: h, alpha: 0, duration: 200, onComplete: () => h.destroy() });
    }
    const charged = hold !== undefined ? this.sim.chargeMult(hold) : 1;
    const r = hold !== undefined ? this.sim.charge(hold) : this.sim.tap();
    const layer = at(LAYERS, this.sim.layer);
    this.oyun.audio.playPreset(SFX.dig, { pitch: Math.round(this.sim.combo * 7), volume: 0.8 });
    if (charged >= VEIN.maxCharge - 0.01) {
      this.oyun.audio.playPreset(SFX.clang);
      this.oyun.platform.haptic('heavy');
      this.juice.shake(0.25);
    } else if (charged > 1) this.oyun.audio.playPreset(SFX.clang, { volume: 0.5, pitch: -4 });
    // the strike lands where you tapped (on the block face): pick swing, chips, dust, cracks from there
    const bx = Phaser.Math.Clamp(x, this.block.x - BLOCK_W / 2 + 20, this.block.x + BLOCK_W / 2 - 20);
    const by = Phaser.Math.Clamp(y, this.block.y - this.blockH / 2 + 20, this.block.y + this.blockH / 2 - 20);
    this.block.hit(bx - this.block.x, by - this.block.y);
    if (FX_ON) this.pick.strike(bx, by);
    if (FX_ON) this.fx.emit(bx, by, 4, { texture: 'chip', tint: at(layer.bands, 2), speed: [160, 340], angle: -Math.PI / 2, spread: 2.6, gravity: 1500, life: [0.35, 0.6], scale: [0.6, 1.1], endScale: 0.6, spin: 14 });
    if (FX_ON) this.fx.emit(bx, by, 2, { tint: PALETTE.sand, speed: [20, 70], life: [0.5, 0.8], scale: [1, 1.8], endScale: 2.2, alpha: 0.3 });
    this.present(r);
    if (this.sim.combo >= 0.4) this.showTip('combo', this.t('tip.combo'));
    this.ses.markDirty();
  }

  /** Everything one hit did: the break, its finds (twin, golden, boss phases), its events. */
  private present(r: TapResult): void {
    for (const f of r.extra) if (!r.broke) this.onFind(f); // boss phase rolls before the break
    if (r.broke) {
      const layer = at(LAYERS, this.sim.layer);
      this.oyun.audio.playPreset(SFX.crack);
      this.juice.shake(0.15);
      this.oyun.platform.haptic('light');
      this.breakBlock(at(layer.bands, 1), at(layer.bands, 3));
      if (r.find) this.onFind(r.find);
      else this.juice.floatText(this.block.x, this.block.y - 40, `+${big(this, r.dust)}`, { color: PALETTE.dust, size: 40 });
      for (const f of r.extra) this.onFind(f);
    } else {
      this.juice.squash(this.block, 0.035, 140);
      this.block.setDamage(this.sim.blockDamage / this.sim.blockHp);
    }
    this.onEvents(r.events);
  }

  /** Sim events: fever, chains, special blocks, relics, goals and rank-ups. */
  private onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'fever':
          this.startFever();
          break;
        case 'feverEnd':
          this.endFever();
          break;
        case 'chain':
          this.juice.floatText(this.block.x + 150, this.block.y - this.blockH / 2 + 30, this.t('hud.chain', { n: mult(this, this.sim.chainMult) }), { color: 0xffd23f, size: 30 + Math.min(16, e.n * 2) });
          if (e.n >= 3) this.showTip('chain', this.t('tip.chain'));
          break;
        case 'fragment':
          this.oyun.audio.playPreset(SFX.relic, { pitch: e.fragments });
          this.juice.burst(this.block.x, this.block.y, { count: 10, color: 0xb07aff, texture: 'spark', distance: 160 });
          this.note(this.t('dig.fragment', { a: e.fragments - (e.relics * RELIC.fragments), b: RELIC.fragments }), { color: 0xb07aff });
          this.showTip('relic', this.t('tip.relic'));
          break;
        case 'relic':
          this.oyun.audio.playPreset(SFX.rankUp, { pitch: 4 });
          tierPattern(this, ['heavy', 'medium', 'success']);
          this.flash(0xb07aff, 300);
          this.juice.burst(this.layout.cx, this.block.y, { count: 30, color: 0xd8b8ff, texture: 'spark', distance: 360 });
          this.note(this.t('dig.relic', { n: mult(this, RELIC.power) }), { duration: 2600, color: 0xd8b8ff });
          break;
        case 'cavein':
          this.oyun.audio.playPreset(SFX.rumble);
          this.juice.shake(0.5);
          this.oyun.platform.haptic('heavy');
          this.note(this.t('dig.cavein'), { color: 0xd0c8c0 });
          this.showTip('cavein', this.t('tip.cavein'));
          break;
        case 'boss':
          this.oyun.audio.playPreset(SFX.gong);
          this.juice.shake(0.6);
          tierPattern(this, ['heavy', 'heavy']);
          this.note(this.t('dig.boss'), { duration: 2400, color: 0x3fe3e0 });
          this.showTip('boss', this.t('tip.boss'));
          break;
        case 'phase':
          this.oyun.audio.playPreset(SFX.gong, { pitch: e.phase * 3 });
          this.flash(0x3fe3e0, 200);
          this.juice.shake(0.4);
          this.oyun.platform.haptic('heavy');
          this.juice.floatText(this.layout.cx, this.block.y - this.blockH / 2 - 10, this.t('dig.phase', { n: e.phase }), { color: 0x3fe3e0, size: 40 });
          break;
        case 'golden':
          this.oyun.audio.playPreset(SFX.glint, { pitch: 7 });
          this.juice.burst(this.block.x, this.block.y, { count: 18, color: 0xffd23f, texture: 'spark', distance: 260 });
          this.showTip('golden', this.t('tip.golden'));
          break;
        case 'settled':
          this.note(this.t('dig.settled'));
          break;
        case 'pity':
          this.note(this.t('dig.pity'), { color: PALETTE.luck });
          this.showTip('pity', this.t('tip.pity'));
          break;
        case 'quest': {
          const a = ACHIEVEMENTS.find((q) => q.id === e.id);
          if (a) this.note(this.t('dig.quest', { name: questText(this, a), n: big(this, e.dust) }), { duration: 2400, color: 0xffd23f });
          this.oyun.audio.playPreset(SFX.buy, { pitch: 8 });
          this.oyun.platform.track('goal_reached', { id: e.id });
          break;
        }
        case 'rank':
          // after any goal notes from the same moment have had their say
          this.time.delayedCall(events.some((x) => x.kind === 'quest') ? 2600 : 700, () => this.rankUp(e.rank));
          break;
      }
    }
    if (events.length) this.syncBlockKind();
  }

  private flash(color: number, ms: number): void {
    const L = this.layout;
    const r = this.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, color, this.oyun.reducedMotion ? 0.2 : 0.45).setDepth(940);
    this.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
  }

  private syncBlockKind(): void {
    const k = this.sim.block.kind;
    if (this.block.blockKind === k) return;
    this.block.setKind(k);
    if (k === 'vein') this.showTip('vein', this.t('tip.vein'));
    if (k === 'unstable') this.showTip('unstable', this.t('tip.unstable'));
    if (k === 'twin') this.showTip('twin', this.t('tip.twin'));
  }

  // ------------------------------------------------------------------ hard vein: hold to charge

  private startHold(x: number, y: number): void {
    this.holdState?.ring.destroy();
    this.holdState?.text.destroy();
    const ring = this.add.circle(x, y, 30).setStrokeStyle(8, 0x8a9cb0, 1).setDepth(320);
    const text = outlined(this, x, y - 70, this.t('hud.charge', { n: mult(this, this.sim.chargeMult(0)) }), 30, 0xe8f4ff, 6).setDepth(321);
    this.holdState = { x, y, t0: this.fxClock, ring, text };
  }

  private releaseHold(): void {
    const h = this.holdState;
    if (!h) return;
    this.holdState = null;
    const held = this.fxClock - h.t0;
    h.ring.destroy();
    h.text.destroy();
    this.onDigTap(h.x, h.y, held);
  }

  private updateHold(): void {
    const h = this.holdState;
    if (!h) return;
    const held = this.fxClock - h.t0;
    const t = Math.min(1, held / VEIN.fullHold);
    h.ring.setRadius(30 + t * 60).setStrokeStyle(8 + t * 6, t >= 1 ? 0xffd23f : 0x8a9cb0, 1);
    h.text.setText(this.t('hud.charge', { n: mult(this, this.sim.chargeMult(held)) }));
    if (t >= 1 && h.ring.getData('full') !== true) {
      h.ring.setData('full', true);
      this.oyun.audio.playPreset(SFX.charge, { pitch: 7 });
      this.oyun.platform.haptic('medium');
      this.juice.pop(h.text, 1.3, 200);
    }
  }

  // ------------------------------------------------------------------ fever

  private startFever(): void {
    const L = this.layout;
    this.oyun.audio.playPreset(SFX.fever);
    tierPattern(this, ['medium', 'heavy']);
    this.flash(0xff6a20, 220);
    this.feverFx?.frame.destroy();
    this.feverFx?.title.destroy();
    const frame = this.add.graphics().setDepth(250);
    for (let i = 0; i < 6; i++) frame.lineStyle(26 - i * 4, i % 2 ? 0xffd23f : 0xff6a20, 0.16 + i * 0.05).strokeRect(L.left + i * 4, this.site.top + i * 4, L.right - L.left - i * 8, this.site.bottom - this.site.top - i * 8);
    const title = outlined(this, L.cx, this.site.top + 70, this.t('dig.fever'), 64, 0xffd23f, 12).setDepth(330);
    this.juice.pop(title, 0.3, 360);
    this.tweens.add({ targets: title, alpha: 0, delay: 900, duration: 400 });
    this.tweens.add({ targets: frame, alpha: 0.5, yoyo: true, repeat: -1, duration: 260 });
    this.feverFx = { frame, title };
    this.showTip('fever', this.t('tip.fever'));
  }

  private endFever(): void {
    const f = this.feverFx;
    if (!f) return;
    this.feverFx = null;
    this.tweens.killTweensOf(f.frame);
    this.tweens.add({ targets: [f.frame, f.title], alpha: 0, duration: 300, onComplete: () => {
      f.frame.destroy();
      f.title.destroy();
    } });
  }

  // ------------------------------------------------------------------ rank-up ceremony

  /** A rank-up: everything pauses for the new badge, its name and what comes next. */
  private rankUp(rank: number): void {
    if (this.ceremony) return;
    const L = this.layout;
    const r = at(RANKS, rank);
    const box = this.add.container(0, 0).setDepth(960);
    const shadeRect = this.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, 0x000000, 0.8).setInteractive();
    box.add(shadeRect);
    const cy = L.cy - 60;
    const rays = this.add.container(L.cx, cy);
    for (let i = 0; i < 16; i++) rays.add(this.add.image(0, 0, 'ray').setOrigin(0.5, 0).setAngle(i * 22.5).setTint(r.color).setScale(1, 0.9).setAlpha(0.8));
    this.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
    const prev = this.add.image(L.cx, cy, badgeKey(this, Math.max(0, rank - 1))).setScale(1.6);
    const badge = this.add.image(L.cx, cy, badgeKey(this, rank)).setScale(0.2).setAlpha(0);
    const title = outlined(this, L.cx, cy - 230, this.t('rankup.title'), 60, 0xffd23f, 10);
    const name = outlined(this, L.cx, cy + 190, this.t(`rank.${r.id}`), 52, r.color, 10).setAlpha(0);
    fitText(name, L.width - 60);
    const score = this.sim.score.total;
    const next = RANKS[rank + 1];
    const sub = label(this, L.cx, cy + 260, `${this.t('rankup.score', { n: big(this, score) })}${next ? `\n${this.t('rankup.next', { name: this.t(`rank.${next.id}`), n: big(this, next.score) })}` : ''}`, { size: 30, color: PALETTE.sand, wrap: 600 }).setOrigin(0.5, 0).setAlpha(0);
    const tap = outlined(this, L.cx, L.bottom - 70, this.t('reveal.tap'), 36, 0xffffff, 6).setAlpha(0);
    box.add([rays, prev, badge, title, name, sub, tap]);
    this.ceremony = box;
    this.oyun.audio.playPreset(SFX.rankUp);
    this.juice.pop(title, 0.3, 400);
    // the old badge shatters, the new one lands
    this.tweens.add({ targets: prev, scale: 2, alpha: 0, delay: 350, duration: 300, onComplete: () => {
      this.juice.burst(L.cx, cy, { count: 30, color: r.color, texture: 'spark', distance: 340 });
      this.juice.shake(0.5);
      tierPattern(this, ['heavy', 'medium', 'success']);
    } });
    this.tweens.add({ targets: badge, scale: 1.7, alpha: 1, delay: 600, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [name, sub], alpha: 1, delay: 900, duration: 300 });
    for (let i = 0; i < 40; i++) {
      const star = this.add.image(Math.random() * L.width, L.top - 40 - Math.random() * 300, 'spark').setTint(i % 3 ? r.color : 0xffffff).setScale(0.6 + Math.random());
      box.add(star);
      this.tweens.add({ targets: star, y: L.height + 60, angle: 360, delay: 600, duration: 2200 + Math.random() * 1800, ease: 'Sine.easeIn' });
    }
    this.time.delayedCall(1300, () => {
      tap.setAlpha(1);
      this.tweens.add({ targets: tap, alpha: 0.35, yoyo: true, repeat: -1, duration: 600 });
      shadeRect.once(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.closeCeremony());
    });
    this.oyun.platform.track('rank_up', { rank: r.id, score });
    this.refreshProgress(true);
    this.ses.flush();
  }

  private closeCeremony(): void {
    const c = this.ceremony;
    if (!c) return;
    this.ceremony = null;
    for (const o of c.list) this.tweens.killTweensOf(o);
    this.tweens.add({ targets: c, alpha: 0, duration: 220, onComplete: () => c.destroy(true) });
    this.showTip('rank', this.t('tip.rank'));
  }

  // ------------------------------------------------------------------ daily dig

  private openDaily(): void {
    if (this.dailyBox || this.popup || this.ceremony || this.reveal.blocking) return;
    const day = today();
    const got = this.sim.claimDaily(day);
    if (!got) return;
    const L = this.layout;
    const box = this.add.container(0, 0).setDepth(955);
    const shadeRect = this.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, 0x000000, 0.75).setInteractive();
    const card = panel(this, L.cx, L.cy, 620, 560, { color: PALETTE.dirtLight });
    const lines = [
      label(this, 0, -210, this.t('daily.title'), { size: 52, color: PALETTE.ochreLight }),
      label(this, 0, -130, this.t('daily.streak', { n: got.streak }), { size: 36, color: 0xffffff }),
      label(this, 0, -30, this.t('daily.reward', { n: big(this, got.dust), m: Math.round(got.boost / 60) }), { size: 34, color: PALETTE.dust, wrap: 540 }),
      label(this, 0, 60, this.t('daily.rule'), { size: 26, color: PALETTE.sand, wrap: 540 }),
    ];
    // seven day pips, filled up to the streak
    const pips = this.add.graphics();
    for (let i = 0; i < 7; i++) {
      const x = -180 + i * 60;
      pips.fillStyle(i < got.streak ? 0xffd23f : PALETTE.dirt, 1).fillCircle(x, 140, 20);
      pips.lineStyle(3, PALETTE.ink, 0.6).strokeCircle(x, 140, 20);
    }
    card.add([...lines, pips]);
    const claim = button(this, L.cx, L.cy + 230, this.t('daily.claim'), () => this.closeDaily(), { width: 400, height: 100 });
    box.add([shadeRect, card, claim]);
    this.dailyBox = box;
    this.juice.pop(card, 0.5, 320);
    this.oyun.audio.play('coin');
    tierPattern(this, ['medium', 'success']);
    this.oyun.platform.track('daily_claimed', { streak: got.streak });
    this.refreshHud(true);
    this.refreshProgress(true);
    this.ses.flush();
  }

  private closeDaily(): void {
    const b = this.dailyBox;
    if (!b) return;
    this.dailyBox = null;
    this.tweens.add({ targets: b, alpha: 0, duration: 180, onComplete: () => b.destroy(true) });
    this.showTip('daily', this.t('daily.rule'));
  }

  /** Rank badge, lucky-streak gauge, daily button and the expedition nudge. */
  private refreshProgress(force = false): void {
    const s = this.sim;
    const rank = s.rank;
    if (rank !== this.rankShown || force) {
      this.rankShown = rank;
      this.rankBadge.setTexture(badgeKey(this, rank));
    }
    this.rankRing.setVisible(s.canExpedition);
    if (s.canExpedition) this.showTip('expedition', this.t('tip.expedition'));
    const dry = s.dry;
    if (dry !== this.streak.shown || force) {
      this.streak.shown = dry;
      const f = Math.min(1, dry / PITY);
      const g = this.streak.g.clear();
      g.fillStyle(PALETTE.shadow, 0.5).fillCircle(0, 4, 46);
      g.fillStyle(PALETTE.dirt, 1).fillCircle(0, 0, 46);
      g.lineStyle(10, 0x000000, 0.35).strokeCircle(0, 0, 36);
      if (f > 0) g.lineStyle(10, f >= 0.8 ? 0xffd23f : PALETTE.luck, 1).beginPath().arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2).strokePath();
      this.streak.text.setText(String(PITY - dry));
    }
    this.dailyButton.setVisible(s.dailyOpen(today()));
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
    this.onEvents(this.sim.lastEvents);
  }

  private onTravel(layer: number): void {
    if (this.reveal.blocking || this.popup) return;
    if (layer < 0 || layer >= LAYERS.length) return;
    if (layer > this.sim.unlocked) {
      this.oyun.audio.play('hit', { volume: 0.4 });
      this.showTip('locked', `${this.t('dig.locked', { n: big(this, this.sim.unlockPowerOf(layer)) })}. ${this.t('tip.power')}`, true);
      this.juice.shake(0.12);
      return;
    }
    if (this.travelling) return;
    const from = this.sim.layer;
    if (!this.sim.travel(layer)) return;
    this.oyun.audio.playPreset(SFX.flip);
    this.oyun.platform.haptic('light');
    this.travelFx(layer > from ? 1 : -1, () => {
      this.scenery.setLayer(layer);
      this.block.setLayer(layer).setKind(this.sim.block.kind);
      this.rubble.clear();
      this.fx.clear();
    });
    this.refreshHud(true);
    this.refreshStrip();
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
    this.drawer.celebrate(id);
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
      this.note(this.t('dig.boostOn'));
      this.oyun.audio.play('win');
      this.oyun.platform.track('reward_claimed', { placement: 'luck_boost' });
      this.ses.flush();
    }
    this.refreshHud(true);
  }

  // ------------------------------------------------------------------ finds

  private onFind(find: Find, from?: { x: number; y: number }): void {
    this.reveal.show(find, from);
    if (find.fossil.odds >= 100) this.helper.cheer();
    else if (find.source === 'assistant') this.helper.found();
    if (find.fusions > 0) this.showFusion(find);
    if (find.source === 'assistant') this.showTip('assistant', this.t('tip.assistant', { n: mult(this, find.luck) }));
    if (find.setCompleted !== null) {
      const name = this.t(`layer.${at(LAYERS, find.setCompleted).id}`);
      this.time.delayedCall(900, () => {
        for (let k = 0; k < 5; k++) this.fx.emit(this.layout.left + 80 + k * 140, this.site.top + 20, 6, { texture: k % 2 ? 'spark' : 'chip', tint: [0xffd23f, 0xf0445f, 0x3d8bf0, 0x4fbf6a, 0xa257f2][k]!, speed: [100, 320], angle: Math.PI / 2, spread: 1.4, gravity: 600, life: [1.2, 1.8], scale: [0.6, 1.1], spin: 8, fadeTail: 0.4 });
        this.note(this.t('dig.setDone', { name }), { duration: 2400, color: at(TIERS, 3).color });
        this.oyun.audio.playPreset(SFX.fanfare);
        this.oyun.platform.haptic('success');
      });
      this.oyun.platform.track('set_complete', { layer: find.setCompleted });
    }
    if (find.unlocked !== null) {
      const name = this.t(`layer.${at(LAYERS, find.unlocked).id}`);
      this.time.delayedCall(500, () => {
        this.oyun.audio.playPreset(SFX.fanfare, { pitch: 3 });
        this.oyun.platform.haptic('success');
        this.juice.pop(this.arrows.right, 1.6, 500);
        this.showTip(`deeper-${find.unlocked}`, this.t('tip.deeper', { name }), true);
      });
      this.oyun.platform.track('layer_unlocked', { layer: find.unlocked });
    }
    this.ses.markDirty();
    if (find.isNew || find.fossil.tier >= 2 || find.setCompleted !== null || find.unlocked !== null) this.ses.flush();
  }

  private onLanded(find: Find): void {
    this.refreshStrip();
    this.juice.pop(this.strip, 1.12, 180);
    this.showTip('odds', this.t('tip.odds', { odds: oddsText(this, find.fossil.odds) }));
  }

  /**
   * The block splits into chunks that tumble, bounce and settle at its foot, in a puff of dust,
   * while the next block rises into place. Pooled: rapid breaks reuse the oldest chunks.
   */
  private breakBlock(c1: number, c2: number, chunks = 7): void {
    if (!FX_ON) {
      this.block.renew(this.sim.block.kind);
      return;
    }
    const bx = this.block.x;
    const by = this.block.y;
    const floor = by + this.blockH / 2 + 4;
    for (let k = 0; k < 4; k++) {
      this.rubble.emit(bx + (k - 1.5) * 70, by + this.blockH * 0.25, Math.ceil(chunks / 4), {
        texture: `chunk-${k}`,
        tint: shade(k % 2 ? c1 : c2, 0.22),
        speed: [140, 360],
        angle: -Math.PI / 2 + (k - 1.5) * 0.35,
        spread: 1.6,
        gravity: 1900,
        floor,
        bounce: 0.35,
        life: [0.9, 1.3],
        scale: [0.8, 1.4],
        endScale: 0.8,
        fadeTail: 0.35,
        spin: 9,
      });
    }
    this.fx.emit(bx, floor - 30, 8, { tint: PALETTE.sand, speed: [40, 160], angle: -Math.PI / 2, spread: 2.8, life: [0.6, 1], scale: [1.4, 2.6], endScale: 1.8, alpha: 0.28, drag: 1.5 });
    this.block.renew(this.sim.block.kind);
    this.tweens.killTweensOf(this.block);
    this.block.setAlpha(0.2).setY(by + 36).setScale(0.92);
    this.tweens.add({ targets: this.block, y: by, alpha: 1, scale: 1, duration: 170, ease: 'Back.easeOut', onComplete: () => this.block.setY(this.blockY).setScale(1) });
  }

  /** Short descent (deeper) or ascent between layers: strata rush past, the new place appears. */
  private travelFx(dir: 1 | -1, swap: () => void): void {
    const L = this.layout;
    this.travelling = true;
    const g = this.add.graphics().setDepth(1400);
    const from = at(LAYERS, Math.max(0, this.sim.layer - Math.max(0, dir)));
    const to = at(LAYERS, this.sim.layer);
    const h = L.height;
    for (let i = 0; i < 18; i++) {
      const src = i < 9 ? (dir > 0 ? from : to) : dir > 0 ? to : from;
      g.fillStyle(at(src.bands, i % src.bands.length), 1).fillRect(-20, i * (h / 6), L.width + 40, h / 6 + 2);
      g.fillStyle(0x000000, 0.15).fillRect(-20, i * (h / 6) + h / 6 - 10, L.width + 40, 10);
    }
    // bands enter from the bottom when going down, from the top when going up
    g.setY(dir > 0 ? h : -3 * h);
    this.oyun.audio.playPreset(SFX.flip, { pitch: dir > 0 ? -5 : 5 });
    this.tweens.add({
      targets: g,
      y: dir > 0 ? -2 * h : 0,
      duration: 260,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        swap();
        this.tweens.add({
          targets: g,
          y: dir > 0 ? -3 * h : h,
          duration: 280,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            g.destroy();
            this.travelling = false;
            this.juice.pop(this.block, 0.7, 260);
          },
        });
      },
    });
  }

  /** Three copies merge into one of the next grade, with the power it adds. */
  private showFusion(find: Find): void {
    this.oyun.audio.playPreset(SFX.fuse, { pitch: find.grade * 3 });
    const gradeName = this.t(`grade.${find.grade}`);
    const gainText = this.t('reveal.fusedGain', { grade: gradeName, n: big(this, find.powerGain) });
    const cy = (this.hpY + this.strip.y) / 2 + 6;
    const cx = this.layout.cx;
    if (this.fuseBusy || this.reveal.blocking) {
      this.juice.floatText(cx, cy, gainText, { color: at(GRADE_COLORS, find.grade), size: 32 });
      return;
    }
    this.fuseBusy = true;
    this.showTip('fuse', this.t('tip.fuse'));
    const prev = find.grade - 1;
    const color = at(GRADE_COLORS, find.grade);
    const parts = [-120, 0, 120].map((dx, i) => {
      const c = this.add.container(cx + dx, cy).setDepth(650);
      c.add(this.add.circle(0, 0, 40, at(GRADE_COLORS, prev), 1).setStrokeStyle(4, PALETTE.ink, 0.6));
      c.add(this.add.image(0, 0, fossilKey(find.fossil.id)).setScale(0.42));
      c.setScale(0.2);
      this.tweens.add({ targets: c, scale: 1, duration: 160, delay: i * 60, ease: 'Back.easeOut' });
      return c;
    });
    // the three are pulled together, spinning, with sparks trailing
    this.tweens.add({
      targets: parts,
      x: cx,
      angle: 360,
      delay: 320,
      duration: 260,
      ease: 'Back.easeIn',
      onUpdate: () => {
        for (const p of parts) this.fx.emit(p.x, p.y, 1, { texture: 'spark', tint: color, speed: [10, 40], life: [0.25, 0.4], scale: [0.4, 0.7] });
      },
      onComplete: () => {
        for (const p of parts) p.destroy();
        const merged = this.add.container(cx, cy).setDepth(651);
        merged.add(this.add.image(0, 0, 'glow').setTint(color).setScale(1.8).setAlpha(0.8));
        merged.add(this.add.circle(0, 0, 50, color, 1).setStrokeStyle(5, PALETTE.ink, 0.6));
        merged.add(this.add.image(0, 0, fossilKey(find.fossil.id)).setScale(0.55));
        this.juice.pop(merged, 1.7, 300);
        // shockwave ring + sparks + a thump
        const ring = this.add.circle(cx, cy, 50).setStrokeStyle(8, color, 1).setDepth(649);
        this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
        this.fx.emit(cx, cy, 16, { texture: 'spark', tint: color, speed: [120, 300], life: [0.4, 0.7], scale: [0.6, 1.1] });
        this.juice.shake(0.22);
        this.oyun.platform.haptic('medium');
        this.oyun.audio.playPreset(SFX.fuse, { pitch: find.grade * 3 + 5 });
        this.oyun.audio.play('hit', { volume: 0.35 });
        // the power gain counts up
        const t = outlined(this, cx, cy - 78, gainText, 34, color, 7).setDepth(652);
        fitText(t, this.layout.width - 60);
        const target = find.powerGain;
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 420,
          onUpdate: (tw) => {
            const v = target * (tw.getValue() ?? 1);
            t.setText(this.t('reveal.fusedGain', { grade: gradeName, n: big(this, Math.round(v)) }));
          },
          onComplete: () => t.setText(gainText),
        });
        this.tweens.add({
          targets: [merged, t],
          alpha: 0,
          delay: 1100,
          duration: 260,
          onComplete: () => {
            merged.destroy();
            t.destroy();
            this.fuseBusy = false;
          },
        });
      },
    });
  }

  /** Finds made off this screen (museum) get their reveal now; a haul from time away gets its popup. */
  private replayPending(): void {
    const finds = this.ses.pendingFinds.splice(0);
    const quiet = this.ses.pendingQuiet;
    this.ses.pendingQuiet = 0;
    if (finds.length + quiet > 0) this.note(this.t('dig.awayFinds', { finds: counted(this, 'n.finds', finds.length + quiet) }));
    finds.forEach((f, i) => this.time.delayedCall(i * 350, () => this.onFind(f)));
    const events = this.ses.pendingEvents.splice(0);
    if (events.length) this.time.delayedCall(finds.length * 350 + 200, () => this.onEvents(events));
  }

  /**
   * Short messages sit in the empty band between the HP bar and the last-find strip: core's centre
   * would cover the block, the top would cover the luck readout, the bottom the main buttons.
   */
  private note(text: string, opts: { duration?: number; color?: number } = {}): void {
    toast(this, text, { ...opts, position: Math.round((this.hpY + this.strip.y) / 2) });
  }

    // ------------------------------------------------------------------ tips

  /** A one-line tip, shown once per id (forced ones on request, e.g. tapping a HUD chip). */
  private showTip(id: string, text: string, force = false): void {
    if (!force && !this.sim.markTip(id)) return;
    if (force) this.sim.markTip(id);
    if (this.tip?.id === id || this.tipQueue.some((q) => q.id === id)) return;
    this.tipQueue.push({ id, text });
    this.ses.markDirty();
    if (!this.tip) this.nextTip();
  }

  private nextTip(): void {
    const next = this.tipQueue.shift();
    if (!next) return;
    const L = this.layout;
    const box = this.add.container(L.cx, this.strip.y).setDepth(460);
    const t = label(this, 0, 0, next.text, { size: 28, color: 0xffffff, wrap: 600 });
    const h = Math.max(96, t.height + 30);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.5).fillRoundedRect(-330, -h / 2 + 6, 660, h, 22);
    g.fillStyle(0x4a6a3a, 1).fillRoundedRect(-330, -h / 2, 660, h, 22);
    g.lineStyle(4, PALETTE.luck, 1).strokeRoundedRect(-330, -h / 2, 660, h, 22);
    const zone = this.add.zone(0, 0, 660, Math.max(88, h)).setInteractive();
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.closeTip());
    box.add([g, t, zone]);
    box.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
    this.tip = { box, id: next.id, until: this.time.now + 6500 };
  }

  private closeTip(): void {
    const tip = this.tip;
    if (!tip) return;
    this.tip = null;
    this.tweens.add({ targets: tip.box, alpha: 0, duration: 160, onComplete: () => tip.box.destroy() });
    this.time.delayedCall(220, () => this.nextTip());
  }

  // ------------------------------------------------------------------ offline

  private showOfflinePopup(haul: OfflineHaul): void {
    this.popup?.box.destroy();
    this.oyun.platform.track('offline_haul', { blocks: haul.blocks, dust: haul.dust });
    const L = this.layout;
    const box = this.add.container(0, 0).setDepth(950);
    const shade = this.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, 0x000000, 0.75).setInteractive();
    box.add(shade);
    const lines: [string, number, number][] = [
      [this.t('offline.title'), 50, PALETTE.ochreLight],
      [this.t('offline.body', { blocks: counted(this, 'n.blocks', haul.blocks), min: Math.round(haul.seconds / 60) }), 32, 0xffffff],
      [this.t('offline.dust', { n: big(this, haul.dust) }), 50, PALETTE.dust],
      [this.t('offline.found', { fossils: counted(this, 'n.fossils', haul.blocks), k: haul.newSpecies.length }), 32, PALETTE.sand],
      [this.t('offline.luck', { n: haul.lucks.map((l) => mult(this, l)).join(' / ×') }), 26, PALETTE.sand],
    ];
    if (haul.best) lines.push([this.t('offline.best', { name: fossilName(this, haul.best), odds: oddsText(this, haul.best.odds) }), 30, at(TIERS, haul.best.tier).color]);
    if (haul.seconds >= this.sim.offlineCap - 1) lines.push([this.t('offline.cap', { min: Math.round(this.sim.offlineCap / 60) }), 26, PALETTE.sand]);
    const texts = lines.map(([text, size, color]) => label(this, 0, 0, text, { size, color, wrap: 560 }).setOrigin(0.5, 0));
    const gap = 16;
    const textH = texts.reduce((s, t) => s + t.height, 0) + gap * (texts.length - 1);
    const buttonsH = 100 + 18 + 92;
    const cardH = 60 + textH + 40 + buttonsH + 50;
    const top = L.cy - cardH / 2;
    const card = panel(this, L.cx, L.cy, 640, cardH, { color: PALETTE.dirtLight });
    box.add(card);
    let y = -cardH / 2 + 60;
    for (const t of texts) {
      t.setY(y);
      card.add(t);
      y += t.height + gap;
    }
    const by = top + 60 + textH + 40 + 50;
    const claim = button(this, L.cx, by, this.t('offline.claim'), () => this.closePopup(), { width: 440, height: 100 });
    const double = button(this, L.cx, by + 118, this.t('offline.double'), () => void this.doubleOffline(), { width: 500, height: 92, fontSize: 34, variant: 'secondary' });
    box.add([claim, double]);
    this.juice.pop(card, 0.5, 320);
    this.oyun.audio.play('coin');
    this.popup = { box, haul, claim, double, doubled: false };
    this.refreshHud(true);
  }

  private async doubleOffline(): Promise<void> {
    const p = this.popup;
    if (!p || p.doubled) return;
    p.double.setEnabled(false);
    const r = await this.oyun.platform.showRewarded('double_offline');
    if (r === 'granted' && this.sim.doubleOfflineDust()) {
      p.doubled = true;
      this.oyun.platform.track('reward_claimed', { placement: 'double_offline' });
      this.note(this.t('offline.doubled'));
      this.oyun.audio.play('win');
      this.ses.flush();
      this.closePopup();
    } else p.double.setEnabled(true);
  }

  private closePopup(): void {
    const p = this.popup;
    if (!p) return;
    this.popup = null;
    if (!p.doubled) this.sim.clearOfflineBonus();
    this.napUntil = this.fxClock + 2.5;
    this.tweens.add({ targets: p.box, alpha: 0, duration: 180, onComplete: () => p.box.destroy() });
    this.refreshHud(true);
    this.refreshStrip();
    // rare finds made while away get a real reveal now, never a silent arrival
    p.haul.notable.forEach((f, i) => this.time.delayedCall(300 + i * 400, () => this.reveal.show(f)));
  }

  protected override onPlatformPause(reason: PauseReason): void {
    if (backgroundAware(reason)) this.ses.background();
    else this.ses.flush();
    super.onPlatformPause(reason);
  }

  protected override onPlatformResume(reason: PauseReason): void {
    if (backgroundAware(reason)) this.ses.foreground();
    super.onPlatformResume(reason);
  }

  // ------------------------------------------------------------------ frame

  override update(_time: number, delta: number): void {
    const t0 = performance.now();
    this.frame(delta);
    this.perf.frameMs += performance.now() - t0;
    this.perf.frames += 1;
  }

  private frame(delta: number): void {
    const real = Math.min(delta, 250) / 1000;
    this.fxClock += real;
    if (FX_ON) {
      this.scenery.update(real, this.slowmo);
      this.fx.update(real * this.slowmo);
      this.rubble.update(real * this.slowmo);
      this.pick.update(real);
    }
    // the helper sleeps through the away time, and a little after you come back, then stretches
    if (FX_ON) this.helper.update(real, this.sim.level('assistant'), this.popup !== null || this.fxClock < this.napUntil);
    if (this.glint.visible) {
      this.glintSparks.forEach((sp, i) => {
        const tw = Math.max(0, Math.sin(this.fxClock * 7 + i * 1.9));
        sp.setScale(0.15 + tw * 0.75).setAlpha(0.3 + tw * 0.7);
      });
    }
    if (!this.reveal.blocking && !this.popup && !this.ceremony && !this.dailyBox) {
      this.step(this.juice.scaledDelta(Math.min(delta, 250)) / 1000);
      const haul = this.ses.takeHaul();
      if (haul) this.showOfflinePopup(haul);
    }
    if (this.tip && this.time.now > this.tip.until) this.closeTip();
    const b = this.sim.block;
    this.block.animate(real, b.kind === 'unstable' && b.timer > 0 ? 1 - b.timer / 6 : 0);
    this.updateHold();
    this.sim.setClock(Date.now());
    this.refreshStatus();
    this.refreshProgress();
    this.refreshHud();
    this.drawer.refresh();
    if (FX_ON) this.drawer.animate(real, this.fxClock);
    this.ses.autosave();
  }

  /** Advance the sim by dt seconds and present what happened. */
  private step(dt: number): void {
    if (dt <= 0) return;
    const r = this.sim.tick(dt);
    this.helper.hits(r.assistantHits);
    const layer = at(LAYERS, this.sim.layer);
    for (let i = 0; i < Math.min(3, r.breaks); i++) this.breakBlock(at(layer.bands, 1), at(layer.bands, 3), 5);
    for (const f of r.finds) this.onFind(f);
    if (r.finds.length || r.breaks) this.ses.markDirty();
    this.onEvents(r.events);
    if (r.glintAppeared) {
      this.oyun.audio.playPreset(SFX.glint);
      this.oyun.platform.haptic('light');
      this.showTip('glint', this.t('tip.glint'));
    }
    if (r.glintAppeared || r.glintExpired) this.syncGlint();
    if (this.sim.glint) {
      const life = this.sim.glint.life;
      this.glint.setAlpha(life < 1 ? 0.4 + 0.6 * Math.abs(Math.sin(life * 12)) : 1);
      this.syncGlintLabel();
    }
    if (r.breaks === 0) this.block.setDamage(this.sim.blockDamage / this.sim.blockHp);
  }

  private glintPos(): { x: number; y: number } | null {
    const g = this.sim.glint;
    if (!g) return null;
    const L = this.layout;
    // the glint (and its label above it) stays between the header and the HP bar
    const top = this.site.top + 110;
    const bottom = this.hpY - 80;
    return { x: L.left + 80 + g.x * (L.right - L.left - 160), y: top + g.y * (bottom - top) };
  }

  private syncGlint(): void {
    const pos = this.glintPos();
    if (!pos) {
      this.glint.setVisible(false);
      this.glintZone.disableInteractive();
      return;
    }
    this.glint.setPosition(pos.x, pos.y).setVisible(true).setAlpha(1);
    this.syncGlintLabel();
    this.glintZone.setPosition(pos.x, pos.y).setInteractive({ useHandCursor: true });
    this.juice.pop(this.glint, 0.3, 300);
  }

  /** The label always shows exactly the luck the glint will roll at. */
  private syncGlintLabel(): void {
    const text = this.t('dig.glint', { n: mult(this, this.sim.glintLuck) });
    if (this.glintLabel.text !== text) this.glintLabel.setText(text);
  }

  private refreshHud(force = false): void {
    const s = this.sim;
    const luck = s.luck;
    const boost = Math.ceil(s.boostSeconds);
    if (Math.abs(this.comboShown - s.combo) > 0.004) {
      this.comboShown = s.combo;
      this.comboBar.setValue(s.combo);
    }
    this.feverBar.setValue(s.feverFill);
    if (s.feverSeconds <= 0 && this.feverFx) this.endFever();
    const key = `${s.layer}|${s.unlocked}|${Math.round(s.digPower)}|${Math.floor(s.dust)}|${luck.toFixed(2)}|${s.comboMult.toFixed(1)}|${boost}|${s.blockHp}|${Math.round(s.blockDamage)}|${this.popup ? 1 : 0}|${Math.ceil(s.feverSeconds)}`;
    if (!force && key === this.hudKey) return;
    this.hudKey = key;
    const setChip = (c: Chip, text: string, pop: boolean): void => {
      if (c.last === text) return;
      c.last = text;
      c.value.setText(text);
      fitText(c.value, 140);
      if (pop) this.juice.pop(c.value, 1.12, 160);
    };
    const power = s.digPower;
    if (power > this.lastPower && this.lastPower > 1) this.showTip('power', this.t('tip.power'));
    setChip(this.chips.power, big(this, power), power > this.lastPower);
    this.lastPower = power;
    setChip(this.chips.dust, big(this, s.dust), true);
    // luck moves every frame while the combo drains: update quietly, pop only when base luck rises
    const baseUp = s.baseLuck > this.lastBaseLuck;
    this.lastBaseLuck = s.baseLuck;
    setChip(this.chips.luck, this.t('hud.mult', { n: mult(this, luck) }), baseUp);
    this.chips.luck.caption.setText(boost > 0 ? this.t('hud.boost', { s: boost }) : this.t('hud.luck'));
    fitText(this.chips.luck.caption, 150);
    this.chips.luck.caption.setColor(cssColor(boost > 0 ? PALETTE.glint : PALETTE.sand));
    const fever = Math.ceil(s.feverSeconds);
    this.comboText.setText(fever > 0 ? this.t('hud.fever', { s: fever }) : this.t('hud.combo', { n: mult(this, Math.round(s.comboMult * 10) / 10) }));
    this.comboText.setColor(cssColor(fever > 0 ? 0xffd23f : 0xffffff));
    fitText(this.comboText, 200);
    this.layerTitle.setText(this.t(`layer.${at(LAYERS, s.layer).id}`));
    fitText(this.layerTitle, 250);
    this.arrows.left.setVisible(s.layer > 0);
    const deeper = s.layer < LAYERS.length - 1;
    this.arrows.right.setVisible(deeper);
    this.arrows.right.setAlpha(s.layer < s.unlocked ? 1 : 0.45);
    this.arrows.lock.setVisible(deeper && s.layer >= s.unlocked);
    // keep nudging towards an open layer the player has not dug in yet
    this.arrows.nudge.setVisible(s.layer < s.unlocked && s.setProgress(s.layer + 1).found === 0);
    this.pick.setTier(s.level('pick'));
    const hp = s.blockHp;
    this.hpBar.setValue(1 - s.blockDamage / hp);
    const left = Math.max(1, Math.ceil((hp - s.blockDamage) / (s.digPower * (s.block.kind === 'vein' ? VEIN.weak : 1) * (s.feverSeconds > 0 ? FEVER.damage : 1))));
    this.hpText.setText(this.t('hud.taps', { taps: counted(this, 'n.taps', left) }));
    const affordable = UPGRADE_ORDER.filter((id) => s.canBuy(id)).length;
    this.upgradesButton.setLabel(affordable > 0 ? `${this.t('dig.upgrades')} (${affordable})` : this.t('dig.upgrades'));
    if (affordable > 0 && !this.popup) this.showTip('dust', this.t('tip.dust'));
    this.boostButton.setEnabled(boost <= 0);
    this.boostButton.setLabel(boost > 0 ? this.t('hud.boost', { s: boost }) : this.t('dig.boost'));
  }

  /** One line above the block: what is special about it right now. */
  private refreshStatus(): void {
    const s = this.sim;
    const b = s.block;
    const twist = at(LAYERS, s.layer).twist;
    let text = '';
    let color = 0xffffff;
    switch (b.kind) {
      case 'vein':
        text = this.t('hud.hold');
        color = 0xc8d8e8;
        break;
      case 'unstable':
        text = b.timer > 0 ? this.t('hud.unstable', { s: Math.ceil(b.timer) }) : this.t('tip.unstableShort');
        color = 0xffa040;
        break;
      case 'twin':
        text = this.t('hud.twin');
        break;
      case 'golden':
        text = this.t('hud.golden');
        color = 0xffd23f;
        break;
      case 'cavein':
        text = this.t('hud.cavein');
        color = 0xd0c8c0;
        break;
      case 'boss': {
        const phase = Math.min(BOSS.phases, 1 + Math.floor((s.blockDamage / s.blockHp) * BOSS.phases));
        text = `${this.t('hud.boss', { a: phase, b: BOSS.phases })} · ${this.t('hud.bossLuck', { n: mult(this, BOSS.luck) })}`;
        color = 0x3fe3e0;
        break;
      }
      default:
        if (twist === 'relic') {
          text = this.t('hud.relic', { a: s.relics >= RELIC.max ? RELIC.fragments : s.fragments - s.relics * RELIC.fragments, b: RELIC.fragments }) + ` · ${s.relics}/${RELIC.max}`;
          color = 0xd8b8ff;
        } else if (twist === 'boss') {
          const left = BOSS.every - 1 - (s.blocksBroken(s.layer) % BOSS.every);
          text = this.t('hud.bossIn', { n: left });
          color = 0x3fe3e0;
        }
    }
    const key = `${text}|${color}`;
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.statusText.setText(text).setColor(cssColor(color));
    fitText(this.statusText, this.layout.width - 60);
  }

  private refreshStrip(): void {
    const last = this.sim.lastFind;
    const key = `${last?.id}|${last?.grade}|${last?.luck}|${last?.source}`;
    if (key === this.stripKey) return;
    this.stripKey = key;
    this.strip.removeAll(true);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.45).fillRoundedRect(-320, -46, 600, 100, 24);
    g.fillStyle(PALETTE.dirt, 1).fillRoundedRect(-320, -52, 600, 100, 24);
    this.strip.add(g);
    if (!last) {
      this.strip.add(label(this, -20, -2, this.t('dig.last'), { size: 30, color: PALETTE.sand }));
      return;
    }
    const f = FOSSIL_BY_ID.get(last.id)!;
    const tier = at(TIERS, f.tier);
    g.lineStyle(6, tier.color, 1).strokeRoundedRect(-320, -52, 600, 100, 24);
    g.fillStyle(at(GRADE_COLORS, last.grade), 1).fillCircle(-252, 30, 11);
    const icon = this.add.container(-262, -2, [this.add.image(0, 0, fossilKey(f.id)).setScale(0.52)]);
    addCardLife(this, icon, f.tier, 90, 90);
    this.strip.add(icon);
    const name = label(this, -196, -24, fossilName(this, f), { size: 30, color: 0xffffff }).setOrigin(0, 0.5);
    fitText(name, 460, 0.8);
    const odds = label(this, -196, 18, `${oddsText(this, f.odds)}  ·  ${luckLine(this, last.source, last.luck)}`, { size: 26, color: f.tier === 0 ? PALETTE.sand : tier.color }).setOrigin(0, 0.5);
    fitText(odds, 460, 0.8);
    this.strip.add([name, odds]);
  }

  // ------------------------------------------------------------------ test hook

  /** A tap on the block centre, exactly as a finger would land there. */
  private tapBlock(): void {
    if (this.ceremony) this.closeCeremony();
    else if (this.dailyBox) this.closeDaily();
    else if (this.reveal.blocking) this.reveal.dismiss();
    else if (!this.popup) this.onDigTap(this.block.x, this.block.y);
  }

  protected override testState() {
    const s = this.sim;
    const perLayer = LAYERS.map((_, l) => s.setProgress(l).found);
    const last = s.lastFind ? FOSSIL_BY_ID.get(s.lastFind.id)! : null;
    const glint = this.glintPos();
    const pos = (o: { x: number; y: number }, dy = 0) => ({ x: Math.round(o.x), y: Math.round(o.y + dy) });
    return {
      layer: s.layer,
      unlocked: s.unlocked,
      digPower: Math.round(s.digPower),
      luck: Math.round(s.luck * 100) / 100,
      assistantLuck: Math.round(s.assistantLuck * 100) / 100,
      baseLuck: Math.round(s.baseLuck * 100) / 100,
      dust: Math.floor(s.dust),
      combo: Math.round(s.combo * 100) / 100,
      blockHp: s.blockHp,
      blockDamage: Math.round(s.blockDamage),
      museum: { found: perLayer.reduce((a, b) => a + b, 0), total: LAYERS.length * 12, perLayer },
      score: s.score.total,
      scoreParts: { ...s.score },
      rank: s.rank,
      rankId: at(RANKS, s.rank).id,
      block: s.block.kind,
      blockTimer: Math.round(s.block.timer * 10) / 10,
      fever: Math.round(s.feverSeconds * 10) / 10,
      feverFill: Math.round(s.feverFill * 1000) / 1000,
      dry: s.dry,
      chain: s.chainCount,
      relics: s.relics,
      fragments: s.fragments,
      expeditions: s.expeditions,
      canExpedition: s.canExpedition,
      quests: [...s.quests],
      dailyOpen: s.dailyOpen(today()),
      dailyStreak: s.dailyStreak,
      ceremony2: this.ceremony ? 'rank' : this.dailyBox ? 'daily' : null,
      status: this.statusText.text,
      lastFind: last && s.lastFind ? { id: last.id, odds: last.odds, grade: s.lastFind.grade, luck: Math.round(s.lastFind.luck * 100) / 100, source: s.lastFind.source } : null,
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
      tip: this.tip?.id ?? null,
      perf: { frameMs: Math.round(this.perf.frameMs * 100) / 100, frames: this.perf.frames, tapMs: Math.round(this.perf.tapMs * 100) / 100, taps: this.perf.taps },
      fusing: this.fuseBusy,
      ui: {
        block: pos(this.block),
        upgrades: pos(this.upgradesButton),
        museum: pos(this.museumButton),
        glint: glint ? pos(glint) : null,
        buy: Object.fromEntries(UPGRADE_ORDER.map((id) => [id, pos(this.drawer.buyButton(id), this.drawer.y)])),
        tip: this.tip ? pos(this.tip.box) : null,
        drawerClose: pos(this.drawer.close, this.drawer.y),
        rank: pos(this.rankBadge),
        daily: this.dailyButton.visible ? pos(this.dailyButton) : null,
        streak: pos(this.streak),
        pick: this.pick.state,
      },
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
      tip: () => this.closeTip(),
      /** Hold on the block for `seconds`, then release (a charged strike on a hard vein). */
      hold: (p: unknown) => {
        if (this.reveal.blocking) this.reveal.dismiss();
        else if (!this.popup && !this.ceremony) this.onDigTap(this.block.x, this.block.y, typeof p === 'number' ? p : VEIN.fullHold);
      },
      ranks: () => this.goTo(SCENES.ranks),
      daily: () => this.dailyButton.fire(),
      close: () => {
        this.closeCeremony();
        this.closeDaily();
      },
    };
  }
}

/** Plays a short haptic sequence (rank-ups, relics, bosses, fever). */
function tierPattern(scene: DigScene, kinds: readonly ('light' | 'medium' | 'heavy' | 'success')[]): void {
  kinds.forEach((k, i) => scene.time.delayedCall(i * 110, () => scene.oyun.platform.haptic(k)));
}
