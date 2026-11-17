import { button, iconButton, ResultScene as ResultShell, toast, type Button, type ResultData } from '@oyun/core';
import { gameSave } from '../save';
import { PALETTE, SKIES } from '../textures';
import { drawHills, drawSky } from './art';
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
  private run: RunResult = { wave: 1, coins: 0, kos: 0, headshots: 0, best: 0, newBest: false, daily: false };
  private doubled = false;
  private reviveBtn: Button | null = null;
  private doubleBtn: Button | null = null;
  private shownAt = 0;

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
    };
    this.doubled = data.doubled ?? false;
    super.init({
      score: this.run.wave,
      best: this.run.best,
      newBest: this.run.newBest,
      won: this.run.newBest,
      lines: [this.t('result.coins', { n: this.doubled ? this.run.coins * 2 : this.run.coins }), this.t('result.kos', { k: this.run.kos, h: this.run.headshots })],
    });
  }

  protected override drawBackground(): void {
    const sky = Math.floor((Math.max(1, this.run.wave) - 1) / 5) % SKIES.length;
    this.cameras.main.setBackgroundColor(SKIES[sky]!.top);
    const g = this.add.graphics();
    drawSky(g, sky, 720, 1280);
    drawHills(g, sky, 720, 1280, 0);
    drawHills(g, sky, 720, 1280, 1);
    // a few feathers drifting down
    for (let i = 0; i < 10; i++) {
      const f = this.add.image(Math.random() * 720, -40 - Math.random() * 600, 'feather').setTint(i % 2 ? PALETTE.archer : 0xffffff).setScale(1.2);
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
    super.create();
    this.shownAt = this.time.now;
    // second button: upgrades (one tap from the result screen); home icon for the title
    this.menuButton.setLabel(this.t('result.shop'));
    iconButton(this, this.layout.left + 70, this.layout.top + 70, 'home', () => this.goTo(this.gameScene, {}), 96);
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

  private async revive(): Promise<void> {
    this.reviveBtn?.setEnabled(false);
    const r = await this.oyun.platform.showRewarded('revive');
    if (r !== 'granted') {
      this.reviveBtn?.setEnabled(true);
      return;
    }
    this.oyun.platform.track('reward_claimed', { placement: 'revive' });
    // the run's coins were banked at death; a revived run banks only what it earns afterwards
    gameSave(this.oyun).update((d) => {
      d.coins = Math.max(0, d.coins - this.run.coins);
      d.runs -= 1;
    });
    this.goTo(SCENES.game, { revive: true, daily: this.run.daily });
  }

  private async double(): Promise<void> {
    this.doubleBtn?.setEnabled(false);
    const r = await this.oyun.platform.showRewarded('double_coins');
    if (r !== 'granted') {
      this.doubleBtn?.setEnabled(true);
      return;
    }
    gameSave(this.oyun).update((d) => {
      d.coins += this.run.coins;
    });
    this.oyun.platform.track('reward_claimed', { placement: 'double_coins' });
    this.scene.restart({ ...this.run, doubled: true });
  }

  protected override onReplay(): void {
    const go = (): void => this.goTo(this.gameScene, { quick: true, daily: this.run.daily });
    if (session.finishedRuns % INTERSTITIAL_EVERY !== 0) {
      go();
      return;
    }
    void this.oyun.platform.showInterstitial('between_runs').then(go);
  }

  /** The second button is Upgrades. */
  protected override onMenu(): void {
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
