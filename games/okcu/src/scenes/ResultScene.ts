import { button, cssColor, iconButton, label, ResultScene as ResultShell, toast, type Button, type ResultData } from '@oyun/core';
import Phaser from 'phaser';
import { gameSave } from '../save';
import { PALETTE } from '../textures';
import { themeIndex, THEMES, type Theme } from '../anim/themes';
import { bowTier } from '../sim/bow';
import { cosmeticById } from '../sim/meta';
import { FEATS, progressScore, RANKS, rankOf } from '../sim/progress';
import { SFX } from '../sfx';
import { drawThemeBack, drawThemeLedge, drawThemeNear } from './worlds';
import { drawBadge, newBowGeom } from './gear';
import { BowAura } from './aura';
import { Puppet } from './puppet';
import { hasRevive, session, type RunResult } from './GameScene';
import { SCENES } from './keys';

/** At most one interstitial every two finished runs, only between runs. */
const INTERSTITIAL_EVERY = 2;

type Data = Partial<ResultData> & Partial<RunResult> & { doubled?: boolean };

const EMPTY: RunResult = { wave: 1, coins: 0, kos: 0, headshots: 0, best: 0, newBest: false, daily: false, dailyKey: '', chapter: 0, stage: 1, feats: [], records: [], dailyCoins: 0, dailyStreak: 0, startRank: 0 };

/**
 * Core result shell: wave reached, best wave, coins and knockouts; one tap on Replay starts the
 * next run. Extras: the chapter reached, new records and achievements, the daily goal, the rank
 * (with a rank-up ceremony), upgrades, revive once (rewarded), double coins (rewarded), home.
 * Test actions: replay, menu (= upgrades), shop, revive, double, home, ranks, dismiss.
 */
export class ResultScene extends ResultShell {
  protected readonly gameScene = SCENES.game;
  private run: RunResult = { ...EMPTY };
  /** a rewarded ad is showing: every button waits */
  private adPending = false;
  private doubled = false;
  private reviveBtn: Button | null = null;
  private doubleBtn: Button | null = null;
  private shownAt = 0;
  private puppet: Puppet | null = null;
  private theme: Theme = THEMES[0]!;
  private puppetG: Phaser.GameObjects.Graphics | null = null;
  private badgeG: Phaser.GameObjects.Graphics | null = null;
  private ceremony: Phaser.GameObjects.Container | null = null;
  private rankUp = false;
  private aura: BowAura | null = null;
  private geom = newBowGeom();
  private rank = 0;
  /** bumped on every create: an ad answer from an earlier visit is ignored */
  private visits = 0;

  constructor() {
    super(SCENES.result);
  }

  override init(data: Data): void {
    this.run = {
      ...EMPTY,
      ...data,
      wave: data.wave ?? data.score ?? 1,
      feats: data.feats ?? [],
      records: data.records ?? [],
    };
    this.doubled = data.doubled ?? false;
    const r = this.run;
    const where = r.chapter >= 4 ? this.t('chapter.4') : this.t('result.chapter', { c: this.t(`chapter.${r.chapter}`), s: r.stage });
    super.init({
      score: r.wave,
      best: r.best,
      newBest: r.newBest,
      won: r.newBest,
      lines: [
        ...(r.daily ? [this.t('result.daily', { d: r.dailyKey })] : []),
        where,
        this.t('result.coins', { n: this.doubled ? r.coins * 2 : r.coins }),
        this.t('result.kos', { k: r.kos, h: r.headshots }),
        ...(r.dailyCoins > 0 ? [this.t('result.dailyDone', { n: r.dailyStreak, c: r.dailyCoins })] : []),
        ...(r.records.length > 0 ? [this.t('result.records')] : []),
        ...r.feats.slice(0, 2).map((id) => `★ ${this.t(`feat.${id}.name`)}`),
      ],
    });
  }

  protected override drawBackground(): void {
    // the world the run ended in
    const th = THEMES[themeIndex(this.run.wave)]!;
    this.theme = th;
    this.cameras.main.setBackgroundColor(th.skyTop);
    const g = this.add.graphics();
    drawThemeBack(g, th, 720, 1280);
    drawThemeNear(g, th, 720, 1280);
    // a few feathers drifting down
    for (let i = 0; i < 10; i++) {
      const f = this.add.image(Math.random() * 720, -40 - Math.random() * 600, 'feather').setTint(i % 2 ? PALETTE.archer : PALETTE.white).setScale(1.2);
      this.tweens.add({ targets: f, y: 1340, duration: 6000 + Math.random() * 5000, repeat: -1, delay: Math.random() * 3000 });
      this.tweens.add({ targets: f, x: f.x + 60, angle: 40, yoyo: true, repeat: -1, duration: 900 + Math.random() * 500, ease: 'Sine.easeInOut' });
    }
  }

  protected override cardPosition(): { x: number; y: number } {
    const { cx, top } = this.layout;
    return { x: cx, y: Math.max(top + 330, 430) };
  }

  protected override buttonPosition(index: number): { x: number; y: number } {
    const { cx, bottom } = this.layout;
    const base = Math.min(820, bottom - 450);
    return { x: cx, y: base + index * 112 };
  }

  override create(): void {
    this.visits += 1;
    this.adPending = false;
    this.ceremony = null;
    super.create();
    this.shownAt = this.time.now;
    const L = this.layout;
    const save = gameSave(this.oyun);
    // second button: upgrades (one tap from the result screen); home icon for the title
    this.menuButton.setLabel(this.t('result.shop'));
    iconButton(this, L.left + 70, L.top + 70, 'home', () => {
      if (!this.adPending) this.goTo(this.gameScene, {});
    }, 96);
    // the rank, top right: badge and name (tap: the ranks screen)
    this.rank = rankOf(progressScore(save.data).total);
    this.badgeG = this.add.graphics().setDepth(6);
    label(this, L.right - 120, L.top + 134, this.t(`rank.${RANKS[this.rank]!.id}`), { size: 28, color: PALETTE.gold }).setStroke(cssColor(PALETTE.ink), 8).setDepth(6);
    label(this, L.right - 120, L.top + 166, this.t('bow.name', { name: this.t(`bow.${bowTier(save.data.bow.level)}`), n: save.data.bow.level }), { size: 22, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 6).setDepth(6);
    const zone = this.add.zone(L.right - 120, L.top + 84, 180, 150).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!this.adPending && !this.ceremony) this.goTo(SCENES.ranks, { from: 'result' });
    });
    // the archer stands beside the buttons on a little ledge and reacts to the run
    const footY = L.bottom - 40;
    const stand = this.add.graphics();
    drawThemeLedge(stand, { x: 600, y: footY, w: 110, h: 40 }, 1, this.theme);
    this.puppet = new Puppet('player', 655, footY, -1, 0.85);
    this.rankUp = this.rank > save.data.rank;
    this.puppet.setMood(this.run.newBest || this.rankUp ? 1 : this.run.wave <= 2 ? -1 : 0);
    this.puppetG = this.add.graphics().setDepth(5);
    this.aura = new BowAura(this, null, 0.85);
    this.aura.setDepth(5.5);
    this.aura.facing = -1;
    const p2 = this.buttonPosition(2);
    const p3 = this.buttonPosition(3);
    const canRevive = hasRevive();
    const canDouble = this.run.coins > 0 && !this.doubled;
    this.reviveBtn = null;
    this.doubleBtn = null;
    const slots = [p2, p3];
    if (canRevive) {
      const at = slots.shift()!;
      this.reviveBtn = button(this, at.x, at.y, this.t('result.revive'), () => void this.revive(), { width: 440, height: 96, fontSize: 40 });
    }
    if (canDouble) {
      const at = slots.shift()!;
      this.doubleBtn = button(this, at.x, at.y, this.t('result.double'), () => void this.double(), { width: 440, height: 96, fontSize: 40, variant: 'secondary' });
    }
    if (this.doubled) toast(this, this.t('result.doubled'), { position: (slots[0] ?? p3).y });
    if (this.rankUp) {
      save.update((d) => {
        d.rank = this.rank;
      });
      this.time.delayedCall(500, () => this.playRankUp());
    }
  }

  /** The rank-up ceremony: rays, the new badge slamming in, its name, a fanfare. Tap to close. */
  private playRankUp(): void {
    if (!this.sys.isActive()) return;
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(200);
    const scrim = this.add.rectangle(L.cx, L.cy, 900, 2000, PALETTE.ink, 0.7).setInteractive();
    scrim.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.closeCeremony());
    const rays = this.add.graphics().setPosition(L.cx, L.cy - 80);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      rays.fillStyle(i % 2 ? PALETTE.gold : PALETTE.cream, 0.45).fillTriangle(0, 0, Math.cos(a - 0.1) * 420, Math.sin(a - 0.1) * 420, Math.cos(a + 0.1) * 420, Math.sin(a + 0.1) * 420);
    }
    const badge = this.add.graphics().setPosition(L.cx, L.cy - 80);
    drawBadge(badge, 0, 0, 110, this.rank, 0);
    const title = label(this, L.cx, L.cy - 300, this.t('rankup.title'), { size: 80, color: PALETTE.gold }).setStroke(cssColor(PALETTE.ink), 18);
    const name = label(this, L.cx, L.cy + 110, this.t(`rank.${RANKS[this.rank]!.id}`), { size: 64, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 14);
    c.add([scrim, rays, badge, title, name]);
    this.ceremony = c;
    badge.setScale(3).setAlpha(0);
    title.setScale(0.2);
    name.setAlpha(0);
    rays.setScale(0.3);
    this.tweens.add({ targets: rays, scale: 1.1, angle: 120, duration: 2600, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: badge, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut', onComplete: () => {
      this.juice.shake(0.5);
      this.juice.feedback('large', L.cx, L.cy - 80, PALETTE.gold);
    } });
    this.tweens.add({ targets: title, scale: 1, duration: 360, delay: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: name, alpha: 1, y: name.y - 10, duration: 300, delay: 520 });
    this.oyun.audio.playPreset(SFX.fanfare);
    this.oyun.platform.haptic('success');
    this.time.delayedCall(3400, () => this.closeCeremony());
  }

  private closeCeremony(): void {
    const c = this.ceremony;
    if (!c) return;
    this.ceremony = null;
    this.tweens.add({ targets: c, alpha: 0, duration: 220, onComplete: () => c.destroy() });
  }

  override update(_time: number, delta: number): void {
    if (this.badgeG) {
      this.badgeG.clear();
      drawBadge(this.badgeG, this.layout.right - 120, this.layout.top + 78, 34, this.rank, this.time.now / 1000);
    }
    if (!this.puppet || !this.puppetG) return;
    this.puppet.step(Math.min(delta, 100) / 1000);
    this.puppetG.clear();
    const save = gameSave(this.oyun).data;
    this.puppet.draw(this.puppetG, cosmeticById(save.cosmetic), save.bow.level);
    this.aura?.update(Math.min(delta, 100) / 1000, save.bow.level, this.puppet.bowGeom(this.geom), this.puppet.archer.draw);
  }

  private setButtons(enabled: boolean): void {
    for (const b of [this.replayButton, this.menuButton, this.reviveBtn, this.doubleBtn]) b?.setEnabled(enabled);
  }

  /** Show a rewarded ad with every button disabled; the reward lands only if this screen is still up. */
  private async rewarded(placement: string): Promise<boolean> {
    if (this.adPending) return false;
    this.adPending = true;
    this.setButtons(false);
    const token = this.visits;
    const r = await this.oyun.platform.showRewarded(placement);
    this.adPending = false;
    // a late answer after the player left (or the scene restarted) grants nothing
    if (token !== this.visits || !this.sys.isActive()) return false;
    this.setButtons(true);
    if (r !== 'granted') return false;
    this.oyun.platform.track('reward_claimed', { placement });
    return true;
  }

  private async revive(): Promise<void> {
    if (!(await this.rewarded('revive'))) return;
    // coins and best were banked as the run went; the revived run banks only what it adds
    this.goTo(SCENES.game, { revive: true, daily: this.run.daily });
  }

  private async double(): Promise<void> {
    if (!(await this.rewarded('double_coins'))) return;
    gameSave(this.oyun).update((d) => {
      d.coins += this.run.coins;
    });
    this.scene.restart({ ...this.run, doubled: true });
  }

  protected override onReplay(): void {
    if (this.adPending) return;
    this.closeCeremony();
    const go = (): void => this.goTo(this.gameScene, { quick: true, daily: this.run.daily });
    if (session.finishedRuns % INTERSTITIAL_EVERY !== 0) {
      go();
      return;
    }
    void this.oyun.platform.showInterstitial('between_runs').then(go);
  }

  /** The second button is Upgrades. */
  protected override onMenu(): void {
    if (this.adPending) return;
    this.goTo(SCENES.shop, { from: 'result' });
  }

  protected override testState() {
    const save = gameSave(this.oyun).data;
    return {
      ...super.testState(),
      coins: this.run.coins,
      savedCoins: save.coins,
      canRevive: this.reviveBtn !== null,
      canDouble: this.doubleBtn !== null,
      doubled: this.doubled,
      shownMs: Math.round(this.time.now - this.shownAt),
      rank: RANKS[this.rank]!.id,
      rankUp: this.rankUp,
      ceremony: this.ceremony !== null,
      bow: `${bowTier(save.bow.level)}+${save.bow.level}`,
      feats: [...this.run.feats],
      records: [...this.run.records],
      featCoins: save.feats.reduce((n, id) => n + (FEATS.find((f) => f.id === id)?.coins ?? 0), 0),
    };
  }

  protected override testActions() {
    return {
      ...super.testActions(),
      revive: () => this.reviveBtn?.fire(),
      double: () => this.doubleBtn?.fire(),
      shop: () => this.menuButton.fire(),
      home: () => this.goTo(this.gameScene, {}),
      ranks: () => this.goTo(SCENES.ranks, { from: 'result' }),
      dismiss: () => this.closeCeremony(),
    };
  }
}
