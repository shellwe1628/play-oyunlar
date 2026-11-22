import { button, cssColor, iconButton, label, OyunScene, panel, progressBar, toast, type Button, type IconButton, type ProgressBar } from '@oyun/core';
import type { PauseReason } from '@oyun/core/pure';
import Phaser from 'phaser';
import { gameOnline } from '../online';
import { backgroundAware, session, type Session } from '../session';
import { SFX } from '../sfx';
import { ACHIEVEMENTS, at, BOSS, FOSSIL_BY_ID, FOSSILS, GRADE_COLORS, LAYERS, LUCK_BOOST, METEOR, PITY, RANKS, RELIC, RUSH, TIERS, UPGRADE_ORDER, VEIN, WEAK, type UpgradeId } from '../sim/data';
import { NEWS_TIP, type DigSim, type Find, type OfflineHaul, type RushResult, type SimEvent, type TapResult } from '../sim/dig';
import { badgeKey } from '../art/badges';
import { questText, today } from './progress';
import { fossilKey, PALETTE } from '../textures';
import { shade } from '../art/fossils';
import { addCardLife } from '../fx/CardLife';
import { Helper } from '../fx/Helper';
import { rushClock, sharpPips, travelDir, waitParts, weakRing } from '../fx/model';
import { calmShake, countTo, edgeFlash, Motes } from '../fx/Motion';
import { initSeen } from '../fx/seen';
import { cover, uncover } from '../fx/Travel';
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
/** Seconds without a touch before a rank-up ceremony may cover the screen. */
const QUIET_BEFORE_CEREMONY = 1;
const FOOTER = 362;
/** Dust coins in flight at most. */
const COINS = 10;

interface Chip {
  value: Phaser.GameObjects.Text;
  caption: Phaser.GameObjects.Text;
  last: string;
}

/** A round button at the side of the dig site (the depth map, the Dig Rush). */
interface SiteButton {
  box: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  x: number;
  y: number;
}

/** Find kinds listed on the rush result card (the rest is counted in one line). */
const RUSH_ROWS = 4;

/**
 * The dig: tappable site with the stratum block, combo meter, glints, HUD readouts, the upgrade
 * drawer, the reveal ceremony, one-time tips and the offline-haul popup; the weak spot and the
 * sharp-eye count, the depth-map and Dig Rush buttons, the rush itself and its result card.
 * Draws sim state and forwards input. Test actions: tap {n}, glint, buy {id}, advance {seconds},
 * travel {layer}, museum, drawer, dismiss, boost, claim, double, pause, tip, map, rush,
 * waitWeak {seconds}, tapWeak, close.
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
  private ceremonyReady = false;
  /** A rank-up waiting for a quiet moment (never pops up under a finger that is still tapping). */
  private pendingRank = -1;
  private rankNotBefore = 0;
  /** fxClock of the last pointer press or dig tap. */
  private lastInput = -99;
  private dailyBox: Phaser.GameObjects.Container | null = null;
  /** Taps the block needed when this hit landed (heavier blocks break with more weight). */
  private heft = 1;
  /** Dust flying to the dust chip: pooled, at most COINS in the air. */
  private coins: { img: Phaser.GameObjects.Image; t: number; dur: number; x0: number; y0: number; cx: number; cy: number }[] = [];
  /** Combo milestone celebrated (0 none, 1 = ×1.5, 2 = ×2). */
  private comboStep = 0;
  /** HP bar: where the fill is drawn and where it is heading (it eases instead of jumping). */
  private hpShown = 1;
  private hpTarget = 1;
  /** Dust and dig power as displayed: they count towards the real value in a few quick steps. */
  private dustShown = 0;
  private powerShown = 0;
  private countClock = 0;
  /** One more hit breaks the block: the HP line glows and beats. */
  private lastHit = false;
  private affordable = 0;
  private hop: Phaser.Tweens.Tween | null = null;
  /** Species found but not yet looked at in the museum: a count on the Museum button. */
  private unseen = 0;
  private museumBadge!: { box: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text };
  private mapButton!: SiteButton;
  private rushButton!: SiteButton & { ring: Phaser.GameObjects.Graphics; num: Phaser.GameObjects.Text; nudge: Phaser.GameObjects.Arc; key: string; share: number };
  /** The weak spot on the block: the hit area, a mark, a target ring that closes in, the ×N it deals. */
  private weak!: { box: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Arc; mark: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; shown: boolean; mult: number; r0: number };
  /** The sharp-eye count: an eye, the multiplier of the next precise hit and five pips. */
  private sharp!: { box: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; pips: Phaser.GameObjects.Graphics; shown: number };
  /** While a rush runs: its own light on the site, a frame, the two counters. */
  private rushFx: {
    light: Phaser.GameObjects.Container;
    frame: Phaser.GameObjects.Graphics;
    motes: Motes;
    counters: Phaser.GameObjects.Container;
    blocks: Phaser.GameObjects.Text;
    finds: Phaser.GameObjects.Text;
    shown: string;
    second: number;
  } | null = null;
  /** A finished rush waiting for its card (it never opens over another popup). */
  private rushResult: RushResult | null = null;
  private rushCard: { box: Phaser.GameObjects.Container; claim: Button; result: RushResult } | null = null;

  constructor() {
    super(SCENES.dig);
  }

  create(data?: object): void {
    // Arriving from the depth map: the descent that started there finishes here.
    const arrival = data as { arrive?: number; from?: number } | undefined;
    const arriving = arrival?.arrive === 1 || arrival?.arrive === -1;
    // Every return to the dig: Play Games starts (adults only) and a higher score goes up.
    void gameOnline(this.oyun).sync();
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
    this.ceremonyReady = false;
    this.pendingRank = -1;
    this.rankNotBefore = 0;
    this.lastInput = -99;
    this.dailyBox = null;
    this.heft = 1;
    this.comboStep = 0;
    this.hpShown = this.hpTarget = 1 - this.sim.blockDamage / this.sim.blockHp;
    this.dustShown = Math.floor(this.sim.dust);
    this.powerShown = this.sim.digPower;
    this.countClock = 0;
    this.lastHit = false;
    this.affordable = -1;
    this.hop = null;
    this.rushFx = null;
    this.rushResult = null;
    this.rushCard = null;
    // one calm camera: shakes are capped and never add up (a break + a find + a fusion at once)
    calmShake(this);
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

    this.block = new StratumBlock(this, L.cx, this.blockY, BLOCK_W, blockH).setLayer(this.sim.layer).setKind(this.sim.block.kind, this.sim.echoLayer);
    this.block.reducedMotion = this.oyun.reducedMotion;
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
    this.buildSite();
    this.coins = Array.from({ length: COINS }, () => ({ img: this.add.image(0, 0, 'ico-dust').setDepth(990).setVisible(false), t: 1, dur: 1, x0: 0, y0: 0, cx: 0, cy: 0 }));
    this.drawer = new Drawer(this, this.sim, this.hpY + 32, (id) => this.onBuy(id));
    this.reveal = new Reveal({
      scene: this,
      // the block's resting place, not where a break or a landing has it this frame
      origin: () => ({ x: this.block.x, y: this.blockY }),
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
      this.lastInput = this.fxClock;
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
    this.syncUnseen();
    if (arriving) this.arrive(arrival?.arrive === 1 ? 1 : -1, arrival?.from ?? this.sim.layer);
    else this.enter();
    if (this.sim.rushActive) this.enterRush(false);
    this.oyun.platform.gameplayStart();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // leaving the dig ends a rush (what it broke counts for the best)
      this.sim.stopRush();
      // a rank-up not yet celebrated waits for the next visit
      if (this.pendingRank >= 0) this.ses.pendingEvents.push({ kind: 'rank', rank: this.pendingRank });
      this.oyun.platform.gameplayStop();
      this.ses.flush();
    });

    // Saves from before the depth round: three new layers wait below the First Seas.
    if (this.sim.deepest >= LAYERS.findIndex((l) => l.id === 'firstseas')) this.time.delayedCall(1200, () => this.showTip(NEWS_TIP, this.t('tip.news')));
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
    // the layer name opens the depth map (between the two arrows, which stay as a shortcut)
    hitZone(this, L.cx, hy, 240, 88, () => this.openMap());
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
    hitZone(this, rx, hy, 96, 96, () => this.leave(SCENES.ranks));

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
    this.museumButton = button(this, L.cx - 168, L.bottom - 76, this.t('dig.museum'), () => this.leave(SCENES.museum), { width: 300, height: 104, fontSize: 40, variant: 'secondary' });
    this.upgradesButton = button(this, L.cx + 168, L.bottom - 76, this.t('dig.upgrades'), () => (this.sim.rushActive ? this.note(this.t('rush.busy')) : this.drawer.toggle()), { width: 300, height: 104, fontSize: 40 });
    this.boostButton = button(this, L.cx, L.bottom - 190, this.t('dig.boost'), () => void this.onBoost(), { width: 360, height: 88, fontSize: 34, variant: 'secondary', ad: true });
    this.museumButton.setDepth(400);
    this.upgradesButton.setDepth(400);
    // a small count on the Museum button: species waiting there that you have not looked at yet
    const badge = this.add.container(132, -46);
    const badgeText = label(this, 0, -1, '', { size: 26, color: 0xffffff });
    badge.add([this.add.circle(0, 0, 23, 0xe2553a).setStrokeStyle(4, 0xffffff, 1), badgeText]);
    this.museumButton.add(badge);
    this.museumBadge = { box: badge, text: badgeText };
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
    this.lastInput = this.fxClock;
    if (this.reveal.blocking) {
      this.reveal.dismiss();
      return;
    }
    if (this.popup || this.ceremony || this.rushCard) return;
    if (this.hint) {
      const h = this.hint;
      this.hint = null;
      this.tweens.killTweensOf(h);
      this.tweens.add({ targets: h, alpha: 0, duration: 200, onComplete: () => h.destroy() });
    }
    const charged = hold !== undefined ? this.sim.chargeMult(hold) : 1;
    // where the finger landed on the block face (0..1): a meteor's star core cares
    const face = { x: (x - (this.block.x - BLOCK_W / 2)) / BLOCK_W, y: (y - (this.block.y - this.blockH / 2)) / this.blockH };
    const corePos = this.block.corePos;
    const weakPos = this.weakPos();
    const weakMult = this.sim.weakMult;
    this.heft = this.sim.blockHp / Math.max(1e-9, this.sim.digPower * this.sim.tapMult);
    const r = hold !== undefined ? this.sim.charge(hold, face) : this.sim.tap(face);
    const layer = at(LAYERS, this.sim.layer);
    if (r.core && corePos) this.coreHit(corePos.x, corePos.y);
    if (r.precise && weakPos) this.preciseHit(weakPos.x, weakPos.y, weakMult, r.sharp);
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
    if (FX_ON) {
      const power = r.core || r.precise ? 2 : charged > 1 ? 1.6 : 1;
      this.block.impact(bx - this.block.x, power);
      this.pick.strike(bx, by);
      // the pick swings in from the right: most chips are thrown up and away to the left, a
      // couple glance back; dust puffs where it bit, and a quick bright star marks the contact
      // (lighter than the rock they came from, or they vanish against the block)
      const flake = shade(at(layer.bands, 2), 0.42);
      this.fx.emit(bx, by, power > 1 ? 6 : 3, { texture: 'chip', tint: flake, speed: [190, 400], angle: -Math.PI / 2 - 0.6, spread: 1.5, gravity: 1500, life: [0.35, 0.6], scale: [0.7, 1.25], endScale: 0.6, spin: 14 });
      this.fx.emit(bx, by, 1, { texture: 'chip', tint: flake, speed: [120, 260], angle: -0.75, spread: 0.9, gravity: 1500, life: [0.3, 0.5], scale: [0.5, 0.9], endScale: 0.6, spin: 14 });
      this.fx.emit(bx, by, 2, { tint: PALETTE.sand, speed: [20, 70], life: [0.5, 0.8], scale: [1, 1.8], endScale: 2.2, alpha: 0.3 });
      if (!this.oyun.reducedMotion) this.fx.emit(bx, by, 1, { texture: 'spark', tint: 0xfff3d0, speed: [0, 0], life: [0.12, 0.12], scale: [1.3 * power, 1.3 * power], endScale: 0.2, alpha: 0.9 });
    }
    this.present(r);
    if (this.sim.combo >= 0.4) this.showTip('combo', this.t('tip.combo'));
    this.ses.markDirty();
  }

  /** Everything one hit did: the break, its finds (twin, golden, boss phases), its events. */
  private present(r: TapResult): void {
    for (const f of r.extra) if (!r.broke) this.onFind(f); // boss phase rolls before the break
    if (r.broke) {
      const layer = at(LAYERS, this.sim.layer);
      this.oyun.audio.playPreset(SFX.crack, { pitch: this.heft > 20 ? -3 : 0 });
      // heavier blocks break with more weight: bigger shake, a short freeze, more rubble
      // (a rush breaks several blocks a second: no shake and no freeze there at all)
      const rush = this.sim.rushActive || r.find?.rush === true;
      const w = rush ? 0 : Math.min(1, Math.log10(Math.max(1, this.heft)) / 1.6);
      if (!rush) this.juice.shake(0.12 + 0.28 * w);
      if (FX_ON && !this.oyun.reducedMotion && w > 0.5) this.juice.hitStop(Math.round(30 + 50 * w));
      this.oyun.platform.haptic(w > 0.7 ? 'medium' : 'light');
      this.breakBlock(at(layer.bands, 1), at(layer.bands, 3), 7 + Math.round(5 * w));
      if (FX_ON && r.dust > 0) this.flyDust(this.block.x, this.block.y, 2 + Math.round(4 * w));
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
        case 'meteor':
          this.note(this.t('dig.meteor'), { color: 0xffc060 });
          if (FX_ON) this.juice.burst(this.block.x, this.block.y, { count: 12, color: 0xffa040, texture: 'spark', distance: 220 });
          this.showTip('meteor', this.t('tip.meteor'));
          break;
        case 'echo': {
          const name = this.t(`layer.${at(LAYERS, e.layer).id}`);
          this.note(this.t('dig.echo', { name }), { color: 0xd8a0ff });
          if (FX_ON) {
            const ring = this.add.circle(this.block.x, this.block.y, 60).setStrokeStyle(6, 0xd8a0ff, 1).setDepth(330);
            this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 700, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });
          }
          this.showTip('echo', this.t('tip.echo'));
          break;
        }
        case 'boss':
          this.bossIntro();
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
          // shown at the next quiet moment, after any goal notes from the same moment
          this.pendingRank = Math.max(this.pendingRank, e.rank);
          this.rankNotBefore = Math.max(this.rankNotBefore, this.fxClock + (events.some((x) => x.kind === 'quest') ? 2.6 : 0.7));
          break;
      }
    }
    if (events.length) this.syncBlockKind();
  }

  /** A strike on a meteor's star core: hot sparks, a ring, a short freeze and the ×3 floating up. */
  private coreHit(x: number, y: number): void {
    this.oyun.audio.playPreset(SFX.clang, { pitch: 6, volume: 0.8 });
    this.oyun.platform.haptic('medium');
    if (FX_ON) {
      this.fx.emit(x, y, 14, { texture: 'spark', tint: 0xffc060, speed: [180, 420], life: [0.25, 0.5], scale: [0.5, 1], drag: 2 });
      const ring = this.add.circle(x, y, 30).setStrokeStyle(8, 0xfff0c0, 1).setDepth(330);
      this.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      if (!this.oyun.reducedMotion) this.juice.hitStop(45);
    }
    this.juice.shake(0.18);
    this.juice.floatText(x, y - 50, this.t('dig.core', { n: mult(this, METEOR.core) }), { color: 0xffc060, size: 36, rise: 70, duration: 520 });
    this.showTip('meteor', this.t('tip.meteor'));
  }

  /** Dust coins arc from the block into the dust chip, which pops as they land. */
  private flyDust(x: number, y: number, n: number): void {
    const L = this.layout;
    const tx = L.cx - 72;
    const ty = L.top + 162;
    let k = 0;
    for (const c of this.coins) {
      if (k >= n) break;
      if (c.t < 1) continue;
      c.t = -k * 0.05; // a short stagger
      c.dur = 0.5 + Math.random() * 0.18;
      c.x0 = x + (Math.random() - 0.5) * 160;
      c.y0 = y + (Math.random() - 0.5) * 80;
      c.cx = (c.x0 + tx) / 2 + (Math.random() - 0.5) * 220;
      c.cy = Math.min(c.y0, ty) - 120 - Math.random() * 80;
      c.img.setPosition(c.x0, c.y0).setScale(0.55).setAlpha(0).setVisible(true);
      k++;
    }
  }

  private updateCoins(dt: number): void {
    const L = this.layout;
    const tx = L.cx - 72;
    const ty = L.top + 162;
    let landed = false;
    for (const c of this.coins) {
      if (c.t >= 1) continue;
      c.t += dt / c.dur;
      if (c.t < 0) continue;
      if (c.t >= 1) {
        c.t = 1;
        c.img.setVisible(false);
        landed = true;
        continue;
      }
      // ease-in along a curve: the coin pops up, then is sucked into the counter
      const u = c.t * c.t * (3 - 2 * c.t);
      const e = u * u;
      const ix = (1 - e) * (1 - e) * c.x0 + 2 * (1 - e) * e * c.cx + e * e * tx;
      const iy = (1 - e) * (1 - e) * c.y0 + 2 * (1 - e) * e * c.cy + e * e * ty;
      // it swells as it lifts off and shrinks into the icon as it arrives
      c.img.setPosition(ix, iy).setAlpha(Math.min(1, c.t * 6)).setScale((0.55 + 0.25 * Math.sin(c.t * Math.PI)) * (1 - 0.45 * e)).setRotation(c.t * 6);
    }
    if (landed) {
      this.popFit(this.chips.dust.value, 1.18, 140);
      if (!this.oyun.reducedMotion) this.fx.emit(tx, ty, 2, { texture: 'spark', tint: PALETTE.dust, speed: [40, 110], life: [0.2, 0.32], scale: [0.4, 0.7] });
    }
  }

  /** Combo milestones (×1.5 and ×2) pop the combo label with a burst. */
  private checkCombo(): void {
    const m = this.sim.comboMult;
    const step = m >= 1.999 ? 2 : m >= 1.5 ? 1 : 0;
    if (m < 1.2) this.comboStep = 0;
    if (step <= this.comboStep) return;
    this.comboStep = step;
    this.juice.pop(this.comboText, step === 2 ? 1.5 : 1.3, 260);
    const L = this.layout;
    if (FX_ON) this.fx.emit(L.right - 40, L.top + 236, step === 2 ? 14 : 8, { texture: 'spark', tint: step === 2 ? 0xffd23f : PALETTE.luck, speed: [120, 300], life: [0.3, 0.6], scale: [0.5, 1], drag: 2 });
    this.juice.floatText(L.left + 140, L.top + 210, this.t('hud.combo', { n: mult(this, step === 2 ? 2 : 1.5) }) + '!', { color: step === 2 ? 0xffd23f : PALETTE.luck, size: step === 2 ? 40 : 32, rise: 50, duration: 600 });
    this.oyun.audio.playPreset(SFX.tick, { pitch: step * 5, volume: 0.6 });
  }

  /** A boss surfaces: the slab drops in from above and slams down with a ring of dust. */
  private bossIntro(): void {
    if (!FX_ON) return;
    const b = this.block;
    const L = this.layout;
    this.tweens.killTweensOf(b);
    const reduced = this.oyun.reducedMotion;
    b.setY(this.blockY - (reduced ? 40 : 260)).setScale(1.2).setAlpha(0.3);
    this.tweens.add({
      targets: b,
      y: this.blockY,
      scale: 1,
      alpha: 1,
      duration: reduced ? 200 : 360,
      ease: 'Quad.easeIn',
      onComplete: () => {
        b.setY(this.blockY).setScale(1);
        this.juice.shake(0.7);
        this.oyun.audio.play('hit', { volume: 0.8 });
        const floor = this.blockY + this.blockH / 2;
        this.fx.emit(b.x, floor, 18, { tint: PALETTE.sand, speed: [120, 380], angle: -Math.PI / 2, spread: 3, life: [0.5, 0.9], scale: [1.2, 2.4], endScale: 2, alpha: 0.35, drag: 2 });
        const ring = this.add.circle(b.x, b.y, 120).setStrokeStyle(10, 0x3fe3e0, 1).setDepth(330);
        this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
        const title = outlined(this, L.cx, b.y, this.t('dig.boss'), 54, 0x3fe3e0, 10).setDepth(340);
        fitText(title, L.width - 60);
        this.juice.pop(title, 0.3, 320);
        this.tweens.add({ targets: title, alpha: 0, y: b.y - 60, delay: 900, duration: 400, onComplete: () => title.destroy() });
      },
    });
  }

  /** A new layer opened: a banner of its strata slides in with the name, then slides away. */
  private unlockBanner(layer: number): void {
    const L = this.layout;
    const Ly = at(LAYERS, layer);
    const y = this.site.top + 120;
    const box = this.add.container(L.cx, y).setDepth(720);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55).fillRoundedRect(-330, -76, 660, 160, 28);
    Ly.bands.forEach((c, i) => g.fillStyle(c, 1).fillRect(-310, -58 + i * 24, 620, 24));
    g.lineStyle(6, PALETTE.glint, 1).strokeRoundedRect(-322, -68, 644, 144, 24);
    const t1 = outlined(this, 0, -26, this.t('dig.newLayer'), 34, PALETTE.glint, 7);
    const t2 = outlined(this, 0, 26, this.t(`layer.${Ly.id}`), 54, 0xffffff, 10);
    fitText(t2, 600);
    box.add([g, t1, t2]);
    box.setScale(0.6, 0).setAlpha(0);
    this.tweens.add({ targets: box, scaleX: 1, scaleY: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    if (FX_ON) this.fx.emit(L.cx, y, 22, { texture: 'spark', tint: PALETTE.glint, speed: [160, 420], life: [0.5, 0.9], scale: [0.5, 1.1], drag: 1.5 });
    this.tweens.add({ targets: box, y: y - 40, alpha: 0, delay: 2200, duration: 420, ease: 'Cubic.easeIn', onComplete: () => box.destroy(true) });
  }

  /** A colour moment (fever, relic, boss phase): a glow at the screen edges, never over the dig. */
  private flash(color: number, ms: number): void {
    edgeFlash(this, color, ms + 160);
  }

  /** Arriving at the dig: the block drops into place and settles in a puff of dust. */
  private enter(): void {
    if (!FX_ON || this.oyun.reducedMotion) return;
    const b = this.block;
    b.setY(this.blockY - 70).setAlpha(0);
    this.tweens.add({ targets: b, alpha: 1, duration: 120, delay: 80 });
    this.tweens.add({
      targets: b,
      y: this.blockY,
      duration: 190,
      delay: 80,
      ease: 'Quad.easeIn',
      onComplete: () => {
        b.setY(this.blockY).setAlpha(1);
        this.juice.squash(b, 0.05, 260);
        const floor = this.blockY + this.blockH / 2;
        const tint = at(at(LAYERS, this.sim.layer).bands, 2);
        this.fx.emit(b.x - 150, floor, 5, { tint, speed: [60, 200], angle: Math.PI + 0.5, spread: 1, life: [0.4, 0.8], scale: [1, 2], endScale: 1.8, alpha: 0.35, drag: 2 });
        this.fx.emit(b.x + 150, floor, 5, { tint, speed: [60, 200], angle: -0.5, spread: 1, life: [0.4, 0.8], scale: [1, 2], endScale: 1.8, alpha: 0.35, drag: 2 });
      },
    });
  }

  private syncBlockKind(): void {
    const k = this.sim.block.kind;
    this.block.setKind(k, this.sim.echoLayer);
    if (k === 'vein') this.showTip('vein', this.t('tip.vein'));
    if (k === 'pressure') this.showTip('pressure', this.t('tip.pressure'));
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

  // ------------------------------------------------------------------ side buttons, depth map

  /** A round button beside the block: icon on a disc, a short caption under it. */
  private siteButton(x: number, y: number, icon: string, caption: string, onTap: () => void): SiteButton {
    const box = this.add.container(x, y).setDepth(240);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.5).fillCircle(0, 5, 44);
    g.fillStyle(PALETTE.dirt, 1).fillCircle(0, 0, 44);
    g.lineStyle(4, PALETTE.ochre, 1).strokeCircle(0, 0, 42);
    const img = this.add.image(0, -1, icon).setScale(0.95);
    const text = outlined(this, 0, 62, caption, 24, PALETTE.sand, 6);
    fitText(text, 118);
    box.add([g, img, text]);
    // below the glint (depth 301): a glint that lands here is still the thing a tap takes
    const zone = hitZone(this, x, y + 12, 100, 124, onTap).setDepth(241);
    return { box, img, text, zone, x, y };
  }

  /** The depth map (left of the block), the Dig Rush (right), the weak spot and the sharp-eye count. */
  private buildSite(): void {
    const L = this.layout;
    const y = this.site.top + 118;
    this.mapButton = this.siteButton(L.left + 62, y, 'ico-map', this.t('map.menu'), () => this.openMap());
    const rx = L.right - 62;
    const nudge = this.add.circle(rx, y, 46).setStrokeStyle(6, 0xffd23f, 1).setDepth(239).setVisible(false);
    this.tweens.add({ targets: nudge, scale: 1.45, alpha: 0, duration: 900, repeat: -1 });
    const rush = this.siteButton(rx, y, 'ico-rush', this.t('dig.rush'), () => this.onRush());
    const ring = this.add.graphics();
    const num = outlined(this, 0, 0, '', 44, 0xffffff, 8).setVisible(false);
    rush.box.add([ring, num]);
    this.rushButton = { ...rush, ring, num, nudge, key: '', share: -1 };

    // weak spot: drawn over the block face, under the HP bar and the status line
    const r0 = Math.min(84, this.blockH * 0.21);
    const box = this.add.container(0, 0).setDepth(58).setVisible(false);
    const area = this.add.ellipse(0, 0, WEAK.radius * 2 * BLOCK_W, WEAK.radius * 2 * this.blockH, 0xffe27a, 0.16);
    const glow = this.add.image(0, 0, 'glow').setTint(0xffd27a).setScale(1.1).setAlpha(0.6);
    const mark = this.add.image(0, 0, 'weak-mark').setTint(0xfff0b8);
    const closing = this.add.circle(0, 0, r0).setStrokeStyle(5, 0xffffff, 0.95);
    const times = outlined(this, 0, 0, '', 28, 0xffd23f, 6);
    box.add([area, glow, mark, closing, times]);
    this.weak = { box, ring: closing, mark, label: times, shown: false, mult: 0, r0 };

    // sharp eye: under the rush button, only while a streak is alive
    const sx = rx;
    const sy = this.site.top + 276;
    const sbox = this.add.container(sx, sy).setDepth(240).setVisible(false);
    const stext = outlined(this, 0, 30, '', 28, 0xffd23f, 6);
    const pips = this.add.graphics();
    sbox.add([this.add.image(0, -4, 'ico-eye'), stext, pips]);
    hitZone(this, sx, sy + 20, 100, 100, () => {
      if (this.sim.sharpEye > 0) this.showTip('sharp', this.t('tip.sharp'), true);
    }).setDepth(241);
    this.sharp = { box: sbox, text: stext, pips, shown: -1 };
  }

  /** Leave the dig for another screen: not in the middle of a rush. */
  private leave(key: string, data?: object): void {
    if (this.sim.rushActive) {
      this.note(this.t('rush.busy'));
      return;
    }
    if (this.rushCard || this.travelling) return;
    this.goTo(key, data);
  }

  private openMap(): void {
    if (this.reveal.blocking || this.popup || this.ceremony || this.dailyBox) return;
    this.leave(SCENES.map, { from: 'dig' });
  }

  /** Arriving from the depth map: the sheet of strata that covered the map runs off here. */
  private arrive(dir: 1 | -1, from: number): void {
    this.travelling = true;
    uncover(this, null, from, this.sim.layer, dir, () => {
      this.travelling = false;
      this.juice.pop(this.block, 0.7, 260);
      if (FX_ON) this.fx.emit(this.block.x, this.blockY + this.blockH / 2, 12, { tint: at(at(LAYERS, this.sim.layer).bands, 2), speed: [80, 260], angle: -Math.PI / 2, spread: 2.6, life: [0.4, 0.8], scale: [1, 2], endScale: 1.6, alpha: 0.4, drag: 2 });
    });
  }

  // ------------------------------------------------------------------ weak spot

  /** Where the weak spot is on screen (it rides on the block), or null. */
  private weakPos(): { x: number; y: number } | null {
    const w = this.sim.weakSpot;
    if (!w || this.sim.block.kind === 'meteor') return null;
    return { x: this.block.x + (w.x - 0.5) * BLOCK_W, y: this.block.y + (w.y - 0.5) * this.blockH };
  }

  /** The target: a mark with a ring that closes in as the spot runs out, and the ×N it deals. */
  private updateWeak(): void {
    const pos = this.weakPos();
    const w = this.weak;
    const spot = this.sim.weakSpot;
    if (!pos || !spot) {
      if (w.shown) {
        w.shown = false;
        w.box.setVisible(false);
      }
    } else {
      const reduced = this.oyun.reducedMotion;
      if (!w.shown) {
        w.shown = true;
        w.box.setVisible(true).setScale(reduced ? 1 : 0.4).setAlpha(1);
        if (!reduced) this.tweens.add({ targets: w.box, scale: 1, duration: 140, ease: 'Back.easeOut' });
      }
      const ring = weakRing(spot.life);
      w.box.setPosition(pos.x, pos.y);
      w.ring.setRadius(34 + (w.r0 - 34) * ring.open);
      w.ring.setStrokeStyle(5, ring.blink ? 0xffd23f : 0xffffff, 0.95);
      if (!reduced && FX_ON) {
        w.mark.setRotation(this.fxClock * 1.4);
        w.box.setAlpha(ring.blink ? 0.55 + 0.45 * Math.abs(Math.sin(this.fxClock * 14)) : 1);
      }
      const m = this.sim.weakMult;
      if (m !== w.mult) {
        w.mult = m;
        w.label.setText(this.t('hud.weak', { n: mult(this, m) }));
      }
      // the number sits on the side of the mark that is clear of the block edge
      w.label.setPosition(spot.x > 0.6 ? -52 : 52, spot.y < 0.4 ? 30 : -30);
    }
    // sharp eye
    const n = this.sim.sharpEye;
    const sh = this.sharp;
    if (n !== sh.shown) {
      const rose = n > sh.shown && sh.shown >= 0;
      sh.shown = n;
      sh.box.setVisible(n > 0);
      if (n > 0) {
        sh.text.setText(this.t('hud.weak', { n: mult(this, this.sim.weakMult) }));
        const lit = sharpPips(n);
        const g = sh.pips.clear();
        for (let i = 0; i < 5; i++) g.fillStyle(i < lit ? 0xffd23f : 0x000000, i < lit ? 1 : 0.45).fillCircle(-32 + i * 16, 56, 6);
        if (rose && FX_ON && !this.oyun.reducedMotion) this.juice.pop(sh.box, 1.3, 220);
      }
    }
  }

  /** A precise hit: a crisp star where it bit, chips, a ring, the ×N floating up, a rising tick. */
  private preciseHit(x: number, y: number, m: number, sharp: number): void {
    // each step of the sharp eye rings a little higher
    this.oyun.audio.playPreset(SFX.clang, { pitch: 9, volume: 0.45 });
    this.oyun.audio.playPreset(SFX.tick, { pitch: 3 + Math.min(5, sharp) * 2 });
    this.oyun.platform.haptic('medium');
    if (FX_ON) {
      const reduced = this.oyun.reducedMotion;
      const flake = shade(at(at(LAYERS, this.sim.layer).bands, 2), 0.5);
      this.fx.emit(x, y, 8, { texture: 'chip', tint: flake, speed: [220, 460], life: [0.3, 0.55], scale: [0.6, 1.1], endScale: 0.5, gravity: 1300, spin: 14 });
      this.fx.emit(x, y, 6, { texture: 'spark', tint: 0xffe27a, speed: [140, 320], life: [0.2, 0.4], scale: [0.4, 0.8], drag: 2 });
      if (!reduced) {
        const star = this.add.image(x, y, 'spark').setTint(0xffffff).setScale(3.4).setDepth(330);
        this.tweens.add({ targets: star, scale: 0.6, angle: 60, alpha: 0, duration: 220, ease: 'Cubic.easeOut', onComplete: () => star.destroy() });
      }
      const ring = this.add.circle(x, y, 30).setStrokeStyle(7, 0xffe27a, 1).setDepth(330);
      this.tweens.add({ targets: ring, scale: reduced ? 1.6 : 2.6, alpha: 0, duration: 280, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    }
    // named at the foot of the block: a find pops out of its upper half, and its odds stay readable
    const tx = Phaser.Math.Clamp(x, this.block.x - 130, this.block.x + 130);
    this.juice.floatText(tx, this.blockY + this.blockH / 2 - 50, this.t('dig.precise', { n: mult(this, m) }), { color: 0xffd23f, size: 34 + Math.min(4, sharp - 1) * 2, rise: 46, duration: 620 });
    if (sharp >= 2) this.showTip('sharp', this.t('tip.sharp'));
  }

  // ------------------------------------------------------------------ Dig Rush

  /** "2 h 14 min" / "14 min" / "40 s". */
  private waitText(seconds: number): string {
    const p = waitParts(seconds);
    return p.unit === 'h' ? this.t('rush.wait.h', { h: p.h, m: p.m }) : p.unit === 'm' ? this.t('rush.wait.m', { m: p.m }) : this.t('rush.wait.s', { s: p.s });
  }

  /** The rush button: start it, or say when the next one comes. */
  private onRush(): void {
    const s = this.sim;
    if (s.rushActive || !s.rushOpen || this.rushCard) return;
    if (this.reveal.blocking || this.popup || this.ceremony || this.dailyBox || this.travelling) return;
    if (!s.rushReady) {
      this.note(this.t('rush.cool', { t: this.waitText(s.rushWait) }), { duration: 2200 });
      return;
    }
    s.setClock(Date.now());
    if (!s.startRush()) return;
    this.oyun.platform.track('rush_start', { layer: s.layer });
    this.enterRush(true);
    this.ses.flush();
  }

  /** The site in rush light: a warm sky, slow rays, rising sparks, a frame; the two counters. */
  private enterRush(banner: boolean): void {
    if (this.rushFx) return;
    const L = this.layout;
    const top = this.site.top;
    const bottom = this.site.bottom;
    const w = L.right - L.left;
    const light = this.add.container(0, 0).setDepth(-4).setAlpha(0);
    const g = this.add.graphics();
    const n = 12;
    for (let i = 0; i < n; i++) g.fillStyle(i < n / 2 ? 0xffb347 : 0xff7a2a, 0.27 - 0.13 * (i / (n - 1))).fillRect(L.left, top + ((bottom - top) * i) / n, w, (bottom - top) / n + 1);
    const rays = ([-1, 1] as const).map((d) => this.add.image(L.cx + d * 250, top - 30, 'ray').setOrigin(0.5, 0).setScale(3.2, (bottom - top + 60) / 360).setTint(0xffe2a0).setAlpha(0.3).setRotation(-d * 0.32).setBlendMode(Phaser.BlendModes.ADD));
    light.add([g, ...rays]);
    const motes = new Motes(this, { x: L.left + 20, y: top + 10, w: w - 40, h: bottom - top - 20, count: FX_ON ? 16 : 0, colors: [0xffd27a, 0xffffff, 0xff9a40], alpha: 0.8, texture: 'spark', scale: [0.3, 0.7], rise: -46, depth: -3, additive: true });
    const frame = this.add.graphics().setDepth(249).setAlpha(0);
    for (let i = 0; i < 4; i++) frame.lineStyle(14 - i * 3, i % 2 ? 0xfff0b8 : 0xffb347, 0.16 + i * 0.07).strokeRect(L.left + i * 3, top + i * 3, w - i * 6, bottom - top - i * 6);
    this.tweens.add({ targets: [light, frame], alpha: 1, duration: 350 });
    // blocks and finds, where the map button was (the map is closed during a rush)
    const counters = this.add.container(L.left + 62, top + 104).setDepth(240);
    const plaque = this.add.graphics();
    const texts: Phaser.GameObjects.Text[] = [];
    ([['rush.blocks', 0], ['rush.finds', 96]] as const).forEach(([key, dy]) => {
      plaque.fillStyle(PALETTE.shadow, 0.5).fillRoundedRect(-56, dy - 38, 112, 84, 16);
      plaque.fillStyle(PALETTE.dirt, 1).fillRoundedRect(-56, dy - 42, 112, 84, 16);
      plaque.lineStyle(3, 0xffb347, 1).strokeRoundedRect(-56, dy - 42, 112, 84, 16);
      const cap = label(this, 0, dy - 22, this.t(key), { size: 22, color: PALETTE.sand });
      fitText(cap, 100);
      const num = outlined(this, 0, dy + 12, '0', 38, 0xffffff, 6);
      counters.add(cap);
      texts.push(num);
    });
    counters.addAt(plaque, 0);
    counters.add(texts);
    this.rushFx = { light, frame, motes, counters, blocks: at(texts, 0), finds: at(texts, 1), shown: '', second: -1 };
    this.mapButton.box.setVisible(false);
    this.mapButton.zone.disableInteractive();
    if (this.drawer.open) this.drawer.toggle(false);
    this.museumButton.setEnabled(false);
    this.upgradesButton.setEnabled(false);
    // the assistant stands back for the rush, and cheers you on
    if (banner) this.helper.cheer();
    // the rush block replaces the one being dug (it comes back afterwards)
    this.block.renew(this.sim.block.kind, this.sim.echoLayer);
    this.block.setDamage(0);
    this.refreshHud(true);
    if (banner) {
      this.oyun.audio.playPreset(SFX.fanfare, { pitch: 5 });
      tierPattern(this, ['medium', 'heavy']);
      const title = outlined(this, L.cx, top + 86, this.t('rush.title'), 64, 0xffd23f, 12).setDepth(332);
      fitText(title, L.width - 60);
      const sub = outlined(this, L.cx, top + 142, this.t('rush.sub', { s: RUSH.seconds }), 28, 0xffffff, 6).setDepth(332);
      fitText(sub, BLOCK_W - 10);
      this.juice.pop(title, 0.3, 360);
      this.tweens.add({ targets: [title, sub], alpha: 0, delay: 1200, duration: 400, onComplete: () => {
        title.destroy();
        sub.destroy();
      } });
      if (FX_ON) this.fx.emit(L.cx, top + 86, 18, { texture: 'spark', tint: 0xffd27a, speed: [160, 420], life: [0.5, 0.9], scale: [0.5, 1.1], drag: 1.5 });
    }
  }

  /** The rush button doubles as the rush clock; the counters follow the sim. */
  private refreshRush(real: number): void {
    const s = this.sim;
    const b = this.rushButton;
    const active = s.rushActive;
    const clock = rushClock(s.rushLeft);
    const wait = active || !s.rushOpen || s.rushReady ? '' : this.waitText(s.rushWait);
    const key = `${s.rushOpen}|${active}|${s.rushReady}|${clock.seconds}|${wait}`;
    if (key !== b.key) {
      b.key = key;
      b.box.setVisible(s.rushOpen);
      if (s.rushOpen) b.zone.setInteractive({ useHandCursor: true });
      else b.zone.disableInteractive();
      b.nudge.setVisible(s.rushOpen && s.rushReady && !active);
      b.img.setVisible(!active).setAlpha(s.rushReady ? 1 : 0.45);
      b.num.setVisible(active).setText(String(clock.seconds)).setColor(cssColor(clock.last ? 0xff6a4a : 0xffffff));
      b.text.setText(active ? '' : wait || this.t('dig.rush')).setColor(cssColor(wait ? PALETTE.sand : 0xffd23f));
      fitText(b.text, 106);
      if (!active) b.ring.clear();
      if (s.rushOpen && s.rushReady) this.showTip('rush', this.t('tip.rush'));
    }
    const fx = this.rushFx;
    if (!active || !fx) return;
    // the ring drains with the clock
    if (Math.abs(clock.share - b.share) > 0.003) {
      b.share = clock.share;
      b.ring.clear();
      b.ring.lineStyle(9, 0x000000, 0.45).strokeCircle(0, 0, 40);
      b.ring.lineStyle(9, clock.last ? 0xff6a4a : 0xffd23f, 1).beginPath().arc(0, 0, 40, -Math.PI / 2, -Math.PI / 2 + clock.share * Math.PI * 2, false).strokePath();
    }
    const shown = `${s.rushBlocks}|${s.rushFinds}`;
    if (shown !== fx.shown) {
      fx.shown = shown;
      fx.blocks.setText(big(this, s.rushBlocks));
      fx.finds.setText(big(this, s.rushFinds));
      fitText(fx.blocks, 100);
      fitText(fx.finds, 100);
    }
    fx.motes.update(real);
    // the last 10 s pulse: the clock beats and ticks each second, the frame breathes (no shake)
    if (clock.last) {
      if (clock.seconds !== fx.second) {
        fx.second = clock.seconds;
        this.oyun.audio.playPreset(SFX.tick, { pitch: 10 - clock.seconds, volume: 0.7 });
      }
      if (FX_ON && !this.oyun.reducedMotion) {
        const beat = Math.abs(Math.sin(this.fxClock * Math.PI * 2));
        b.num.setScale(1 + 0.14 * beat);
        fx.frame.setAlpha(0.55 + 0.45 * beat);
      }
    }
  }

  /** The rush is over: the site goes back to normal and the result waits for its card. */
  private exitRush(result: RushResult | null): void {
    const fx = this.rushFx;
    if (fx) {
      this.rushFx = null;
      for (const m of fx.motes.list) m.destroy();
      fx.counters.destroy(true);
      this.tweens.add({ targets: [fx.light, fx.frame], alpha: 0, duration: 300, onComplete: () => {
        fx.light.destroy(true);
        fx.frame.destroy();
      } });
    }
    this.rushButton.num.setScale(1);
    this.rushButton.share = -1;
    this.mapButton.box.setVisible(true);
    this.mapButton.zone.setInteractive({ useHandCursor: true });
    this.museumButton.setEnabled(true);
    this.upgradesButton.setEnabled(true);
    // the block that was being dug before the rush is back, with the damage it had
    this.block.renew(this.sim.block.kind, this.sim.echoLayer);
    this.block.setDamage(this.sim.blockDamage / this.sim.blockHp);
    this.hpShown = this.hpTarget = 1 - this.sim.blockDamage / this.sim.blockHp;
    this.hpBar.setValue(this.hpShown);
    this.refreshHud(true);
    if (result) {
      this.rushResult = result;
      this.oyun.platform.track('rush_end', { layer: result.layer, blocks: result.blocks, record: result.record });
    }
    this.ses.flush();
  }

  /** Result card: blocks (and the personal best), dust, finds rarest first; everything counts up. */
  private showRushCard(res: RushResult): void {
    const L = this.layout;
    const box = this.add.container(0, 0).setDepth(955);
    const shadeRect = this.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, 0x000000, 0.75).setInteractive();
    shadeRect.setAlpha(0);
    this.tweens.add({ targets: shadeRect, alpha: 1, duration: 200 });
    const record = res.record && res.best > 0;
    const rows = res.finds.slice(0, RUSH_ROWS);
    const more = res.finds.length - rows.length;
    const fresh = res.finds.filter((f) => f.isNew).length;
    const rowH = 62;
    const cardH = 120 + 70 + 50 + 62 + 48 + rows.length * rowH + (more > 0 ? 40 : 0) + 96 + 150;
    const card = panel(this, L.cx, L.cy, 640, cardH, { color: PALETTE.dirtLight });
    let y = -cardH / 2 + 64;
    const title = label(this, 0, y, this.t('rush.over'), { size: 52, color: PALETTE.ochreLight });
    y += 78;
    const blocks = label(this, 0, y, '', { size: 50, color: 0xffffff });
    y += 56;
    const bestLine = label(this, 0, y, record ? `${this.t('rush.record')}  ${this.t('rush.best', { n: big(this, res.blocks) })}` : this.t('rush.best', { n: big(this, Math.max(res.best, res.blocks)) }), { size: 30, color: record ? 0xffd23f : PALETTE.sand });
    y += 60;
    const dust = label(this, 0, y, '', { size: 44, color: PALETTE.dust });
    y += 54;
    const found = label(this, 0, y, this.t('rush.found', { finds: counted(this, 'n.finds', res.rolls), k: fresh }), { size: 28, color: PALETTE.sand });
    fitText(found, 580);
    card.add([title, blocks, bestLine, dust, found]);
    y += 54;
    rows.forEach((f, i) => {
      const tier = at(TIERS, f.fossil.tier);
      const ry = y + i * rowH;
      const g = this.add.graphics();
      g.fillStyle(PALETTE.dirt, 1).fillRoundedRect(-290, ry - 27, 580, 54, 14);
      if (f.fossil.tier > 0) g.lineStyle(3, tier.color, 1).strokeRoundedRect(-290, ry - 27, 580, 54, 14);
      const icon = this.add.image(-258, ry, fossilKey(f.fossil.id)).setScale(0.3);
      const name = label(this, -226, ry, this.t('rush.row', { name: fossilName(this, f.fossil), n: f.n }) + (f.isNew ? `  ${this.t('reveal.new')}` : ''), { size: 26, color: f.isNew ? PALETTE.ochreLight : 0xffffff }).setOrigin(0, 0.5);
      fitText(name, 330, 0.7);
      const odds = label(this, 276, ry, oddsText(this, f.fossil.odds), { size: 26, color: f.fossil.tier === 0 ? PALETTE.sand : tier.color }).setOrigin(1, 0.5);
      fitText(odds, 170, 0.7);
      const row = [g, icon, name, odds];
      card.add(row);
      if (FX_ON && !this.oyun.reducedMotion) {
        for (const o of row) o.setAlpha(0);
        this.tweens.add({ targets: row, alpha: 1, delay: 420 + i * 110, duration: 160 });
      }
    });
    y += rows.length * rowH;
    if (more > 0) {
      card.add(label(this, 0, y - 6, this.t('rush.more', { n: more }), { size: 24, color: PALETTE.sand }));
      y += 40;
    }
    const luck = label(this, 0, y + 6, this.t('rush.luck'), { size: 24, color: PALETTE.luck });
    fitText(luck, 580);
    const next = label(this, 0, y + 42, this.t('rush.next', { t: this.waitText(this.sim.rushWait) }), { size: 24, color: PALETTE.sand });
    fitText(next, 580);
    card.add([luck, next]);
    const claim = button(this, L.cx, L.cy + cardH / 2 - 84, this.t('offline.claim'), () => this.closeRushCard(), { width: 400, height: 100 });
    box.add([shadeRect, card, claim]);
    this.rushCard = { box, claim, result: res };
    this.juice.pop(card, 0.5, 320);
    // the numbers count up (the card was laid out for the final ones, so nothing shifts)
    countTo(this, 0, res.blocks, 650, (v) => blocks.setText(this.t('rush.broke', { blocks: counted(this, 'n.blocks', Math.round(v)) })), 16, 200);
    countTo(this, 0, res.dust, 700, (v) => dust.setText(this.t('rush.dust', { n: big(this, Math.round(v)) })), 14, 420);
    if (record) {
      this.oyun.audio.playPreset(SFX.fanfare);
      tierPattern(this, ['medium', 'success']);
      this.time.delayedCall(700, () => {
        if (this.rushCard?.box !== box) return;
        this.juice.pop(bestLine, 1.25, 260);
        if (FX_ON) this.fx.emit(L.cx, L.cy + bestLine.y, 16, { texture: 'spark', tint: 0xffd23f, speed: [140, 360], life: [0.4, 0.8], scale: [0.5, 1], drag: 1.5 });
      });
    } else this.oyun.audio.play('coin');
    this.syncUnseen();
    this.refreshHud(true);
    this.refreshStrip();
  }

  private closeRushCard(): void {
    const c = this.rushCard;
    if (!c) return;
    this.rushCard = null;
    if (FX_ON && c.result.dust > 0) this.flyDust(this.layout.cx, this.layout.cy, 8);
    this.tweens.add({ targets: c.box, alpha: 0, duration: 180, onComplete: () => c.box.destroy(true) });
    this.refreshHud(true);
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
  /** The ceremony starts only when nothing else is up and the player has not touched for 1 s. */
  private maybeRankUp(): void {
    if (this.pendingRank < 0 || this.ceremony || this.reveal.busy || this.popup || this.dailyBox || this.travelling || this.sim.rushActive || this.rushCard || this.rushResult) return;
    if (this.fxClock < this.rankNotBefore || this.fxClock - this.lastInput < QUIET_BEFORE_CEREMONY) return;
    // never an older rank than the one already held (see afterBuy: not every rise arrives as an event)
    const r = Math.max(this.pendingRank, this.sim.rank);
    this.pendingRank = -1;
    this.rankUp(r);
  }

  private rankUp(rank: number): void {
    if (this.ceremony) return;
    this.ceremonyReady = false;
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
      this.ceremonyReady = true;
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
    if (this.dailyBox || this.popup || this.ceremony || this.reveal.blocking || this.sim.rushActive || this.rushCard) return;
    const day = today();
    const got = this.sim.claimDaily(day);
    if (!got) return;
    const L = this.layout;
    const box = this.add.container(0, 0).setDepth(955);
    const shadeRect = this.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, 0x000000, 0.75).setInteractive();
    shadeRect.setAlpha(0);
    this.tweens.add({ targets: shadeRect, alpha: 1, duration: 200 });
    const card = panel(this, L.cx, L.cy, 620, 560, { color: PALETTE.dirtLight });
    const lines = [
      label(this, 0, -210, this.t('daily.title'), { size: 52, color: PALETTE.ochreLight }),
      label(this, 0, -130, this.t('daily.streak', { n: got.streak }), { size: 36, color: 0xffffff }),
      label(this, 0, -30, this.t('daily.reward', { n: big(this, got.dust), m: Math.round(got.boost / 60) }), { size: 34, color: PALETTE.dust, wrap: 540 }),
      label(this, 0, 60, this.t('daily.rule'), { size: 26, color: PALETTE.sand, wrap: 540 }),
    ];
    // seven day pips, filled up to the streak
    const pips = this.add.graphics();
    const stamp = FX_ON && !this.oyun.reducedMotion;
    const todayPip = Math.min(7, got.streak) - 1;
    for (let i = 0; i < 7; i++) {
      const x = -180 + i * 60;
      pips.fillStyle(i < got.streak && !(stamp && i === todayPip) ? 0xffd23f : PALETTE.dirt, 1).fillCircle(x, 140, 20);
      pips.lineStyle(3, PALETTE.ink, 0.6).strokeCircle(x, 140, 20);
    }
    card.add([...lines, pips]);
    if (stamp && todayPip >= 0) {
      // today's pip is stamped in after the card has landed
      const pip = this.add.circle(-180 + todayPip * 60, 140, 20, 0xffd23f).setStrokeStyle(3, PALETTE.ink, 0.6).setScale(0);
      card.add(pip);
      this.tweens.add({
        targets: pip,
        scale: { from: 2.2, to: 1 },
        delay: 380,
        duration: 220,
        ease: 'Back.easeOut',
        onComplete: () => {
          if (this.dailyBox !== box) return;
          const ring = this.add.circle(pip.x, pip.y, 22).setStrokeStyle(5, 0xffd23f, 1);
          card.add(ring);
          this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
          this.oyun.audio.playPreset(SFX.tick, { pitch: 7, volume: 0.6 });
        },
      });
    }
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
    if (FX_ON) this.flyDust(this.layout.cx, this.layout.cy, 8);
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
    this.dailyButton.setVisible(s.dailyOpen(today()) && !s.rushActive);
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
    if (this.reveal.blocking || this.popup || this.rushCard) return;
    if (layer < 0 || layer >= LAYERS.length) return;
    if (this.sim.rushActive) {
      this.note(this.t('rush.busy'));
      return;
    }
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
    this.travelFx(from, () => {
      this.scenery.setLayer(layer);
      this.block.setLayer(layer).setKind(this.sim.block.kind, this.sim.echoLayer);
      this.rubble.clear();
      this.fx.clear();
    });
    this.refreshHud(true);
    this.refreshStrip();
    this.ses.flush();
  }

  private onBuy(id: UpgradeId): void {
    const before = { unlocked: this.sim.unlocked, rank: this.sim.rank, quests: this.sim.quests.length };
    if (!this.sim.buy(id)) {
      this.oyun.audio.play('hit', { volume: 0.3 });
      return;
    }
    this.afterBuy(before);
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

  /**
   * A purchase can open a layer, and with it finish goals and raise the rank. The sim applies all
   * of that but reports no events for a purchase, so they are read off its state here and get the
   * same moment as when a find sets them off: the goal message, the rank-up, the new-layer banner.
   */
  private afterBuy(before: { unlocked: number; rank: number; quests: number }): void {
    const s = this.sim;
    const events: SimEvent[] = [];
    for (const id of s.quests.slice(before.quests)) {
      const a = ACHIEVEMENTS.find((q) => q.id === id);
      if (a) events.push({ kind: 'quest', id, dust: a.reward * s.blockDust(s.unlocked) });
    }
    if (s.rank > before.rank) events.push({ kind: 'rank', rank: s.rank });
    if (events.length) this.onEvents(events);
    if (s.unlocked > before.unlocked) this.layerOpened(s.unlocked);
  }

  /** A deeper layer opened: fanfare, the arrow hops, the banner of its strata, a one-time tip. */
  private layerOpened(layer: number): void {
    const name = this.t(`layer.${at(LAYERS, layer).id}`);
    this.time.delayedCall(500, () => {
      this.oyun.audio.playPreset(SFX.fanfare, { pitch: 3 });
      this.oyun.platform.haptic('success');
      this.juice.pop(this.arrows.right, 1.6, 500);
      this.unlockBanner(layer);
      this.showTip(`deeper-${layer}`, this.t('tip.deeper', { name }), true);
    });
    this.oyun.platform.track('layer_unlocked', { layer });
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
    } else if (r === 'unavailable') toast(this, this.t('core.noAd'));
    this.refreshHud(true);
  }

  // ------------------------------------------------------------------ finds

  /** Recount the species the museum has not shown yet (from its own presentation memory). */
  private syncUnseen(): void {
    const found = FOSSILS.filter((f) => this.sim.discovered(f.id)).map((f) => f.id);
    const seen = initSeen(this.oyun, found);
    this.setUnseen(found.filter((id) => !seen.has(id)).length);
  }

  private setUnseen(n: number): void {
    const grew = n > this.unseen;
    this.unseen = n;
    this.museumBadge.box.setVisible(n > 0);
    this.museumBadge.text.setText(n > 99 ? '99+' : String(n));
    fitText(this.museumBadge.text, 36);
    if (grew && FX_ON && !this.oyun.reducedMotion) this.juice.pop(this.museumBadge.box, 1.5, 260);
  }

  private onFind(find: Find, from?: { x: number; y: number }): void {
    this.reveal.show(find, from);
    // recounted, not added: a find replayed from the museum may already have been looked at there
    if (find.isNew) this.syncUnseen();
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
    if (find.unlocked !== null) this.layerOpened(find.unlocked);
    this.ses.markDirty();
    if (find.isNew || find.fossil.tier >= 2 || find.setCompleted !== null || find.unlocked !== null) this.ses.flush();
  }

  private onLanded(find: Find): void {
    this.refreshStrip();
    this.juice.pop(this.strip, 1.12, 180);
    // a rare card arriving in the strip leaves a few sparks of its tier colour
    if (FX_ON && !this.oyun.reducedMotion && find.fossil.tier >= 2) this.fx.emit(this.strip.x - 262, this.strip.y, 5 + find.fossil.tier, { texture: 'spark', tint: at(TIERS, find.fossil.tier).color, speed: [80, 220], life: [0.3, 0.55], scale: [0.4, 0.9], drag: 2 });
    this.showTip('odds', this.t('tip.odds', { odds: oddsText(this, find.fossil.odds) }));
  }

  /**
   * The block splits into chunks that tumble, bounce and settle at its foot, in a puff of dust,
   * while the next block rises into place. Pooled: rapid breaks reuse the oldest chunks.
   */
  private breakBlock(c1: number, c2: number, chunks = 7): void {
    if (!FX_ON) {
      this.block.renew(this.sim.block.kind, this.sim.echoLayer);
      return;
    }
    const bx = this.block.x;
    const by = this.blockY; // its resting place: several breaks in one frame must not walk it down
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
    // dust that settles: two low clouds roll out along the floor and thin away
    if (!this.oyun.reducedMotion) {
      this.fx.emit(bx - 60, floor - 10, 2, { tint: PALETTE.sand, speed: [50, 120], angle: Math.PI, spread: 0.5, life: [1, 1.5], scale: [2, 3], endScale: 1.6, alpha: 0.16, drag: 1.4 });
      this.fx.emit(bx + 60, floor - 10, 2, { tint: PALETTE.sand, speed: [50, 120], angle: 0, spread: 0.5, life: [1, 1.5], scale: [2, 3], endScale: 1.6, alpha: 0.16, drag: 1.4 });
    }
    // a quick white pop where the block was, sparks thrown outward
    this.fx.emit(bx, by, 6, { texture: 'spark', tint: 0xffffff, speed: [200, 420], life: [0.2, 0.35], scale: [0.5, 0.9], drag: 3 });
    this.block.renew(this.sim.block.kind, this.sim.echoLayer);
    this.tweens.killTweensOf(this.block);
    this.block.setAlpha(0.2).setY(by + 36).setScale(0.92);
    this.tweens.add({ targets: this.block, y: by, alpha: 1, scale: 1, duration: 170, ease: 'Back.easeOut', onComplete: () => this.block.setY(this.blockY).setScale(1) });
  }

  /** Short descent (deeper) or ascent between layers: strata rush past, the new place appears. */
  private travelFx(from: number, swap: () => void): void {
    const to = this.sim.layer;
    const dir = travelDir(from, to);
    this.travelling = true;
    // bands enter from the bottom when going down, from the top when going up (fx/Travel.ts)
    cover(this, from, to, dir, (sheet) => {
      swap();
      uncover(this, sheet, from, to, dir, () => {
        this.travelling = false;
        this.juice.pop(this.block, 0.7, 260);
        // landing: a thump and a puff of the new layer's dust
        this.juice.shake(0.2);
        if (FX_ON) this.fx.emit(this.block.x, this.blockY + this.blockH / 2, 12, { tint: at(at(LAYERS, to).bands, 2), speed: [80, 260], angle: -Math.PI / 2, spread: 2.6, life: [0.4, 0.8], scale: [1, 2], endScale: 1.6, alpha: 0.4, drag: 2 });
      });
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
    shade.setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 200 });
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
    const double = button(this, L.cx, by + 118, this.t('offline.double'), () => void this.doubleOffline(), { width: 500, height: 92, fontSize: 34, variant: 'secondary', ad: true });
    box.add([claim, double]);
    this.juice.pop(card, 0.5, 320);
    // the haul counts up (the card was laid out for the full number, so nothing shifts)
    const dustLine = at(texts, 2);
    countTo(this, 0, haul.dust, 700, (v) => dustLine.setText(this.t('offline.dust', { n: big(this, Math.round(v)) })), 14, 260);
    this.oyun.audio.play('coin');
    this.popup = { box, haul, claim, double, doubled: false };
    this.syncUnseen();
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
    } else {
      if (r === 'unavailable' && this.popup === p) toast(this, this.t('core.noAd'));
      p.double.setEnabled(true);
    }
  }

  private closePopup(): void {
    const p = this.popup;
    if (!p) return;
    this.popup = null;
    if (!p.doubled) this.sim.clearOfflineBonus();
    this.napUntil = this.fxClock + 2.5;
    // the haul is already yours; closing the popup sends a few coins to the dust counter
    if (FX_ON && p.haul.dust > 0) this.flyDust(this.layout.cx, this.layout.cy, 8);
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
    if (!this.reveal.blocking && !this.popup && !this.ceremony && !this.dailyBox && !this.rushCard) {
      this.step(this.juice.scaledDelta(Math.min(delta, 250)) / 1000);
      const haul = this.ses.takeHaul();
      if (haul) this.showOfflinePopup(haul);
    }
    // a rush that ended (the clock ran out, or the app was left): back to normal, then its card
    const ended = this.sim.takeRushResult();
    if (ended || (this.rushFx && !this.sim.rushActive)) this.exitRush(ended);
    if (this.rushResult && !this.rushCard && !this.popup && !this.ceremony && !this.dailyBox && !this.reveal.blocking) {
      const res = this.rushResult;
      this.rushResult = null;
      this.showRushCard(res);
    }
    this.updateWeak();
    this.refreshRush(real);
    if (this.tip && this.time.now > this.tip.until) this.closeTip();
    const b = this.sim.block;
    this.block.animate(real, b.kind === 'unstable' && b.timer > 0 ? 1 - b.timer / 6 : 0, this.sim.combo);
    this.block.setCore(this.sim.meteorCore);
    if (FX_ON) this.updateCoins(real);
    this.updateHpBar(real);
    this.updateCounters(real);
    this.checkCombo();
    this.updateHold();
    this.maybeRankUp();
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
    if (r.weakAppeared) {
      this.oyun.audio.playPreset(SFX.tick, { pitch: -4, volume: 0.5 });
      this.showTip('weak', this.t('tip.weak'));
    }
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

  /** Write a chip's value (refit to the chip); false when the text is already showing. */
  private setChipText(c: Chip, text: string): boolean {
    if (c.last === text) return false;
    c.last = text;
    c.value.setText(text);
    fitText(c.value, 140);
    return true;
  }

  /** Pop a text from the scale it was just fitted to (core's pop would return to an older size). */
  private popFit(t: Phaser.GameObjects.Text, amount: number, ms: number): void {
    fitText(t, 140);
    t.setData('oyunRestScaleX', t.scaleX).setData('oyunRestScaleY', t.scaleY);
    this.juice.pop(t, amount, ms);
  }

  /** The HP bar eases to its value: it drains quickly on a hit and fills up for a fresh block. */
  private updateHpBar(dt: number): void {
    if (this.lastHit && FX_ON && !this.oyun.reducedMotion) this.hpText.setScale(1 + 0.07 * Math.abs(Math.sin(this.fxClock * 7)));
    const d = this.hpTarget - this.hpShown;
    if (d === 0) return;
    const snap = !FX_ON || this.oyun.reducedMotion || Math.abs(d) < 0.004;
    this.hpShown = snap ? this.hpTarget : this.hpShown + d * Math.min(1, dt * (d < 0 ? 24 : 11));
    this.hpBar.setValue(this.hpShown);
  }

  /**
   * Dust and dig power count towards their real values in steps ~25 times a second (a text is
   * re-rendered only when its formatted value changes). `snap` shows the exact values at once.
   */
  private updateCounters(dt: number, snap = false): void {
    const dust = Math.floor(this.sim.dust);
    const power = this.sim.digPower;
    if (!snap && dust === this.dustShown && power === this.powerShown) return;
    this.countClock -= dt;
    if (!snap && this.countClock > 0) return;
    this.countClock = 0.04;
    const still = snap || !FX_ON || this.oyun.reducedMotion;
    const next = (shown: number, target: number): number => {
      const d = target - shown;
      if (still || Math.abs(d) <= Math.max(1, Math.abs(target) * 0.004)) return target;
      const n = Math.round(shown + d * 0.42);
      return n === shown ? target : n;
    };
    const spent = dust < this.dustShown;
    this.dustShown = next(this.dustShown, dust);
    this.powerShown = next(this.powerShown, power);
    const changed = this.setChipText(this.chips.dust, big(this, this.dustShown));
    // spending pops the counter once; income pops as the coins land
    if (changed && (spent || !FX_ON) && this.dustShown === dust) this.popFit(this.chips.dust.value, 1.12, 160);
    this.setChipText(this.chips.power, big(this, this.powerShown));
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
      if (!this.setChipText(c, text)) return;
      if (pop) this.popFit(c.value, 1.12, 160);
    };
    const power = s.digPower;
    if (power > this.lastPower && this.lastPower > 1) this.showTip('power', this.t('tip.power'));
    // dust and dig power count up to their new value (updateCounters); a rise in power still pops
    if (power > this.lastPower) this.popFit(this.chips.power.value, 1.12, 160);
    this.lastPower = power;
    if (force) this.updateCounters(0, true);
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
    this.hpTarget = 1 - s.blockDamage / hp;
    const left = Math.max(1, Math.ceil((hp - s.blockDamage) / (s.digPower * s.tapMult)));
    this.hpText.setText(this.t('hud.taps', { taps: counted(this, 'n.taps', left) }));
    // the hit that breaks it: the line turns gold (and beats, see updateHpBar)
    const lastHit = left === 1 && s.blockDamage > 0;
    if (lastHit !== this.lastHit) {
      this.lastHit = lastHit;
      this.hpText.setColor(cssColor(lastHit ? 0xffd23f : 0xffffff));
      if (!lastHit) this.hpText.setScale(1);
    }
    const affordable = UPGRADE_ORDER.filter((id) => s.canBuy(id)).length;
    this.upgradesButton.setLabel(affordable > 0 ? `${this.t('dig.upgrades')} (${affordable})` : this.t('dig.upgrades'));
    // something new can be bought: the button hops once
    if (affordable > this.affordable && this.affordable >= 0 && FX_ON && !this.oyun.reducedMotion && !this.drawer.open) {
      const restY = this.layout.bottom - 76;
      this.hop?.remove();
      this.upgradesButton.setY(restY);
      this.hop = this.tweens.add({ targets: this.upgradesButton, y: restY - 14, duration: 110, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.upgradesButton.setY(restY) });
    }
    this.affordable = affordable;
    if (affordable > 0 && !this.popup) this.showTip('dust', this.t('tip.dust'));
    this.boostButton.setEnabled(boost <= 0 && !s.rushActive);
    this.boostButton.setLabel(boost > 0 ? this.t('hud.boost', { s: boost }) : this.t('dig.boost'));
  }

  /** One line above the block: what is special about it right now. */
  private refreshStatus(): void {
    const s = this.sim;
    const b = s.block;
    const twist = at(LAYERS, s.layer).twist;
    let text = '';
    let color = 0xffffff;
    // a rush says what its finds roll at: the tap luck on screen, nothing else
    // (it makes way for the luck caption of a card being revealed; the luck chip always shows it)
    if (s.rushActive && b.kind !== 'golden') {
      text = this.reveal.busy ? '' : this.t('rush.status', { n: mult(this, s.luck) });
      color = 0xffd27a;
    } else switch (b.kind) {
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
      case 'pressure':
        text = this.t('hud.pressure', { n: mult(this, Math.round(s.pressureMult * 10) / 10) });
        color = s.pressureMult >= 1.5 ? 0x7fe08a : s.pressureMult >= 1 ? 0xffd23f : 0xf07a7a;
        break;
      case 'meteor':
        text = this.t('hud.meteor', { n: mult(this, METEOR.core) });
        color = 0xffc060;
        break;
      case 'echo':
        text = this.t('hud.echo', { name: this.t(`layer.${at(LAYERS, Math.max(0, s.echoLayer)).id}`), n: mult(this, s.echoLuck) });
        color = 0xd8a0ff;
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
    else if (!this.popup && !this.rushCard) this.onDigTap(this.block.x, this.block.y);
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
      echoLayer: s.echoLayer,
      tapMult: Math.round(s.tapMult * 100) / 100,
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
      /** Anything covering the dig that a tap would close or that swallows taps. */
      overlay: this.ceremony ? 'rank' : this.dailyBox ? 'daily' : this.popup ? 'offline' : this.rushCard ? 'rush' : this.reveal.blocking ? 'grand' : null,
      overlayReady: this.ceremony ? this.ceremonyReady : this.reveal.blocking ? this.reveal.canDismiss : this.dailyBox !== null || this.popup !== null || this.rushCard !== null,
      weak: s.weakSpot ? { x: Math.round(this.weakPos()?.x ?? 0), y: Math.round(this.weakPos()?.y ?? 0), life: Math.round(s.weakSpot.life * 100) / 100, mult: s.weakMult } : null,
      sharp: s.sharpEye,
      precise: s.preciseHits,
      rush: {
        open: s.rushOpen,
        ready: s.rushReady,
        active: s.rushActive,
        left: Math.round(s.rushLeft * 10) / 10,
        blocks: s.rushBlocks,
        finds: s.rushFinds,
        best: s.rushBest,
        count: s.rushCount,
        wait: Math.ceil(s.rushWait),
      },
      rushCard: this.rushCard ? { blocks: this.rushCard.result.blocks, dust: this.rushCard.result.dust, rolls: this.rushCard.result.rolls, kinds: this.rushCard.result.finds.length, record: this.rushCard.result.record, best: this.rushCard.result.best } : null,
      travelling: this.travelling,
      rankPending: this.pendingRank >= 0,
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
        core: this.block.corePos ? pos(this.block.corePos) : null,
        map: { x: Math.round(this.mapButton.x), y: Math.round(this.mapButton.y) },
        rush: { x: Math.round(this.rushButton.x), y: Math.round(this.rushButton.y) },
        rushClaim: this.rushCard ? pos(this.rushCard.claim) : null,
        title: pos(this.layerTitle),
        hp: pos(this.hpBar),
        statusLine: pos(this.statusText),
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
      /** A tap right on the meteor's star core (a plain tap when there is none). */
      tapCore: () => {
        const c = this.block.corePos;
        if (this.reveal.blocking) this.reveal.dismiss();
        else if (!this.popup && !this.ceremony) this.onDigTap(c?.x ?? this.block.x, c?.y ?? this.block.y);
      },
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
      ranks: () => this.leave(SCENES.ranks),
      daily: () => this.dailyButton.fire(),
      /** The depth map button / the rush button, as a finger would press them. */
      map: () => this.openMap(),
      rush: () => this.onRush(),
      /** Let time pass (in steps, like `advance`) until a weak spot shows; at most `p` seconds (default 20). */
      waitWeak: (p: unknown) => {
        let left = typeof p === 'number' ? p : 20;
        while (left > 0 && !this.sim.weakSpot && !this.reveal.blocking && !this.popup && !this.rushCard) {
          this.step(0.1);
          left -= 0.1;
        }
        this.updateWeak();
        this.refreshHud(true);
      },
      /** A tap right on the weak spot (a plain tap on the block centre when there is none). */
      tapWeak: () => {
        const w = this.weakPos();
        if (this.reveal.blocking) this.reveal.dismiss();
        else if (!this.popup && !this.ceremony && !this.rushCard) this.onDigTap(w?.x ?? this.block.x, w?.y ?? this.block.y);
      },
      /**
       * Look at a ceremony without earning it (screenshots of the presentation): plays the reveal
       * of the most common fossil at `odds` or rarer, the rank-up of the current rank, or a
       * fusion. Presentation only: nothing is rolled, added or saved.
       */
      fxPreview: (p: unknown) => {
        const o = (p ?? {}) as { kind?: string; odds?: number };
        const fossil = [...FOSSILS].filter((f) => f.odds >= (o.odds ?? 100)).sort((a, b) => a.odds - b.odds)[0] ?? at(FOSSILS, 0);
        const find: Find = { fossil, grade: 0, fusions: 0, isNew: true, source: 'tap', luck: this.sim.luck, dust: 0, setCompleted: null, unlocked: null, powerGain: 0, pity: false, block: 'normal' };
        if (o.kind === 'rank') this.rankUp(this.sim.rank);
        else if (o.kind === 'fusion') this.showFusion({ ...find, grade: 1, fusions: 1, powerGain: 120 });
        else this.reveal.show(find);
      },
      close: () => {
        this.closeCeremony();
        this.closeDaily();
        this.closeRushCard();
      },
    };
  }
}

/** Plays a short haptic sequence (rank-ups, relics, bosses, fever). */
function tierPattern(scene: DigScene, kinds: readonly ('light' | 'medium' | 'heavy' | 'success')[]): void {
  kinds.forEach((k, i) => scene.time.delayedCall(i * 110, () => scene.oyun.platform.haptic(k)));
}
