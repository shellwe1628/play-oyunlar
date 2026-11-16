import { button, label, ResultScene as ResultShell, type Button } from '@oyun/core';
import { CAMPAIGN } from '../sim/campaign';
import { PALETTE } from '../textures';
import { drawDesk } from './Background';
import { formatTime, type ResultPayload } from './GameScene';
import { SCENES } from './keys';

/** Interstitial before every Nth replay/next (natural break between matches only). */
const INTERSTITIAL_EVERY = 3;
let between = 0;

/**
 * Core result shell + win/lose title, three stars with their reasons, and Next sheet.
 * Test actions: replay, menu, next. Test state adds won, stars, level.
 */
export class ResultScene extends ResultShell {
  protected readonly gameScene = SCENES.game;
  private payload: ResultPayload | null = null;
  private nextButton: Button | null = null;

  constructor() {
    super(SCENES.result);
  }

  override init(data: Partial<ResultPayload>): void {
    super.init(data);
    this.payload = data.level ? (data as ResultPayload) : null;
  }

  protected override drawBackground(): void {
    drawDesk(this);
  }

  protected override cardPosition(): { x: number; y: number } {
    return { x: this.layout.cx, y: this.layout.cy - 20 };
  }

  protected override buttonPosition(index: number): { x: number; y: number } {
    const { cx, cy, bottom } = this.layout;
    // Three stacked buttons; keep the lowest clear of the home indicator.
    return { x: cx, y: Math.min(cy + 330, bottom - 66 - 2 * 118) + index * 118 };
  }

  override create(): void {
    super.create();
    const p = this.payload;
    this.nextButton = null;
    if (!p) return;
    const L = this.layout;
    const cardTop = this.cardPosition().y - 280;
    // Below core's new-best toast slot (safe top + 90).
    const title = label(this, L.cx, Math.max(L.top + 175, cardTop - 160), this.t(p.won ? 'result.won' : 'result.lost'), {
      size: 60,
      color: p.won ? PALETTE.sweet : PALETTE.text,
      wrap: L.width - 80,
    });
    this.juice.pop(title, 1.2, 380);
    const def = CAMPAIGN.find((c) => c.id === p.level);
    p.flags.forEach((on, i) => {
      const star = this.add.image(L.cx + (i - 1) * 200, cardTop - 70, 'star').setTint(on ? PALETTE.starOn : PALETTE.starOff);
      if (on) {
        star.setScale(0);
        this.tweens.add({ targets: star, scale: 1.25, delay: 350 + i * 220, duration: 260, ease: 'Back.easeOut' });
        this.time.delayedCall(350 + i * 220, () => this.oyun.audio.play('coin', { pitch: i * 3 }));
      } else star.setScale(1.05);
    });
    // Short reason under each star, so the stars teach the goals.
    const reasons = [this.t('result.starWin'), this.t('result.par', { t: formatTime(def?.parSeconds ?? 200) }), this.t('result.starSteady')];
    reasons.forEach((r, i) => {
      label(this, L.cx + (i - 1) * 200, cardTop - 18, r, { size: 24, color: p.flags[i] ? PALETTE.text : PALETTE.textDim });
    });
    if (p.next) {
      const at = this.buttonPosition(2);
      this.nextButton = button(this, at.x, at.y, this.t('result.next'), () => this.go({ level: p.next! }), {
        width: 440,
        height: 104,
        fontSize: 42,
      });
    }
  }

  private go(data: { level: string }): void {
    between += 1;
    if (between % INTERSTITIAL_EVERY !== 0) {
      this.goTo(this.gameScene, data);
      return;
    }
    void this.oyun.platform.showInterstitial('between_matches').then(() => this.goTo(this.gameScene, data));
  }

  protected override onReplay(): void {
    this.go({ level: this.payload?.level ?? 'c1' });
  }

  protected override onMenu(): void {
    this.goTo(SCENES.maps);
  }

  protected override testState() {
    return {
      ...super.testState(),
      won: this.payload?.won ?? false,
      stars: this.payload?.stars ?? 0,
      level: this.payload?.level ?? '',
      canNext: this.nextButton !== null,
    };
  }

  protected override testActions() {
    return { ...super.testActions(), next: () => this.nextButton?.fire() };
  }
}
