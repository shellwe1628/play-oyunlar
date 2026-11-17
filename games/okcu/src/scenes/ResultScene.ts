import { button, iconButton, ResultScene as ResultShell, toast, type Button, type ResultData } from '@oyun/core';
import { gameSave } from '../save';
import { PALETTE } from '../textures';
import { dailyThemeOffset, themeIndex, THEMES } from '../anim/themes';
import { cosmeticById } from '../sim/meta';
import { drawThemeBack, drawThemeNear } from './worlds';
import { Puppet } from './puppet';
import type Phaser from 'phaser';
import { hasRevive, session, type RunResult } from './GameScene';
import { SCENES } from './keys';

/** At most one interstitial every two finished runs, only between runs. */
const INTERSTITIAL_EVERY = 2;

type Data = Partial<ResultData> & Partial<RunResult> & { doubled?: boolean };

/**
 * Core result shell: wave reached, best wave, coins and knockouts; one tap on Replay starts the
 * next run. Extras: upgrades, revive once (rewarded), double coins (rewarded), home.
 * Test actions: replay, menu (= upgrades), shop, revive, double, home.
 */
export class ResultScene extends ResultShell {
  protected readonly gameScene = SCENES.game;
  private run: RunResult = { wave: 1, coins: 0, kos: 0, headshots: 0, best: 0, newBest: false, daily: false, dailyKey: '' };
  /** a rewarded ad is showing: every button waits */
  private adPending = false;
  private doubled = false;
  private reviveBtn: Button | null = null;
  private doubleBtn: Button | null = null;
  private shownAt = 0;
  private puppet: Puppet | null = null;
  private puppetG: Phaser.GameObjects.Graphics | null = null;
  /** bumped on every create: an ad answer from an earlier visit is ignored */
  private visits = 0;

  constructor() {
    super(SCENES.result);
  }

  override init(data: Data): void {
    this.run = {
      wave: data.wave ?? data.score ?? 1,
      coins: data.coins ?? 0,
      kos: data.kos ?? 0,
      headshots: data.headshots ?? 0,
      best: data.best ?? 0,
      newBest: data.newBest ?? false,
      daily: data.daily ?? false,
      dailyKey: data.dailyKey ?? '',
    };
    this.doubled = data.doubled ?? false;
    super.init({
      score: this.run.wave,
      best: this.run.best,
      newBest: this.run.newBest,
      won: this.run.newBest,
      lines: [
        ...(this.run.daily ? [this.t('result.daily', { d: this.run.dailyKey })] : []),
        this.t('result.coins', { n: this.doubled ? this.run.coins * 2 : this.run.coins }),
        this.t('result.kos', { k: this.run.kos, h: this.run.headshots }),
      ],
    });
  }

  protected override drawBackground(): void {
    // the arena the run ended in
    const th = THEMES[themeIndex(this.run.wave, this.run.daily ? dailyThemeOffset(this.run.dailyKey) : 0)]!;
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
    return { x: cx, y: Math.max(top + 300, 400) };
  }

  protected override buttonPosition(index: number): { x: number; y: number } {
    const { cx, bottom } = this.layout;
    const base = Math.min(780, bottom - 470);
    return { x: cx, y: base + index * 118 };
  }

  override create(): void {
    this.visits += 1;
    this.adPending = false;
    super.create();
    this.shownAt = this.time.now;
    // second button: upgrades (one tap from the result screen); home icon for the title
    this.menuButton.setLabel(this.t('result.shop'));
    iconButton(this, this.layout.left + 70, this.layout.top + 70, 'home', () => {
      if (!this.adPending) this.goTo(this.gameScene, {});
    }, 96);
    // the archer stands on the score card and reacts to the run
    const at = this.cardPosition();
    this.puppet = new Puppet('player', at.x + 200, at.y - 280, -1, 1);
    this.puppet.setMood(this.run.newBest ? 1 : this.run.wave <= 2 ? -1 : 0);
    this.puppetG = this.add.graphics().setDepth(5);
    const p2 = this.buttonPosition(2);
    const p3 = this.buttonPosition(3);
    const canRevive = hasRevive();
    const canDouble = this.run.coins > 0 && !this.doubled;
    this.reviveBtn = null;
    this.doubleBtn = null;
    const slots = [p2, p3];
    if (canRevive) {
      const at = slots.shift()!;
      this.reviveBtn = button(this, at.x, at.y, this.t('result.revive'), () => void this.revive(), { width: 440, height: 100, fontSize: 40 });
    }
    if (canDouble) {
      const at = slots.shift()!;
      this.doubleBtn = button(this, at.x, at.y, this.t('result.double'), () => void this.double(), { width: 440, height: 100, fontSize: 40, variant: 'secondary' });
    }
    if (this.doubled) toast(this, this.t('result.doubled'), { position: (slots[0] ?? p3).y });
  }

  override update(_time: number, delta: number): void {
    if (!this.puppet || !this.puppetG) return;
    this.puppet.step(Math.min(delta, 100) / 1000);
    this.puppetG.clear();
    this.puppet.draw(this.puppetG, cosmeticById(gameSave(this.oyun).data.cosmetic));
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
    return {
      ...super.testState(),
      coins: this.run.coins,
      savedCoins: gameSave(this.oyun).data.coins,
      canRevive: this.reviveBtn !== null,
      canDouble: this.doubleBtn !== null,
      doubled: this.doubled,
      shownMs: Math.round(this.time.now - this.shownAt),
    };
  }

  protected override testActions() {
    return {
      ...super.testActions(),
      revive: () => this.reviveBtn?.fire(),
      double: () => this.doubleBtn?.fire(),
      shop: () => this.menuButton.fire(),
      home: () => this.goTo(this.gameScene, {}),
    };
  }
}
