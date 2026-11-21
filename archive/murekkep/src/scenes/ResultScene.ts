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
 * Core result shell + a title that says how the match ended and who won, three stars each with
 * its reason, and Next sheet. Test actions: replay, menu, next. Test state adds won, stars,
 * starsLit, level, title.
 */
export class ResultScene extends ResultShell {
  protected readonly gameScene = SCENES.game;
  private payload: ResultPayload | null = null;
  private nextButton: Button | null = null;
  private leaving = false;
  private titleText = '';
  private lit = 0;

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

  /** How it ended, naming the winner's colour when it was not us. */
  private title(p: ResultPayload): string {
    const name = p.winner !== null ? this.t(`colony.${p.winner}`) : '';
    if (p.won) return this.t(p.reason === 'time' ? 'result.wonTime' : 'result.won');
    if (p.reason === 'time' && p.winner !== null) return this.t('result.lostTime', { name });
    if (p.reason === 'share' && p.winner !== null) return this.t('result.lostShare', { name });
    if (p.reason === 'last' && p.winner !== null) return this.t('result.lostLast', { name });
    return this.t('result.lostOut');
  }

  override create(): void {
    super.create();
    this.leaving = false;
    this.nextButton = null;
    this.lit = 0;
    const p = this.payload;
    if (!p) return;
    const L = this.layout;
    const cardTop = this.cardPosition().y - 280;
    this.titleText = this.title(p);
    const winnerColor = !p.won && p.winner !== null ? PALETTE.inks[p.winner % PALETTE.inks.length]! : null;
    const title = label(this, L.cx, Math.max(L.top + 120, cardTop - 190), this.titleText, {
      size: 50,
      color: p.won ? PALETTE.sweet : PALETTE.text,
      wrap: L.width - 80,
    });
    this.juice.pop(title, 1.2, 380);
    if (winnerColor !== null) {
      // A drop of the winner's ink next to its name.
      this.add.image(L.cx, title.y - title.height / 2 - 34, 'drop-big').setTint(winnerColor).setScale(0.8);
    }
    const def = CAMPAIGN.find((c) => c.id === p.level);
    const reasons = [this.t('result.starWin'), this.t('result.par', { t: formatTime(def?.parSeconds ?? 200) }), this.t('result.starSteady')];
    p.flags.forEach((on, i) => {
      // Final look is set at once (lit or not); the pop is decoration only.
      const star = this.add.image(L.cx + (i - 1) * 200, cardTop - 100, 'star').setTint(on ? PALETTE.starOn : PALETTE.starOff).setScale(on ? 1.2 : 1);
      if (on) {
        this.lit++;
        this.time.delayedCall(250 + i * 200, () => {
          this.juice.pop(star, 1.35, 260);
          this.oyun.audio.play('coin', { pitch: i * 3 });
        });
      }
      label(this, L.cx + (i - 1) * 200, cardTop - 36, reasons[i]!, { size: 26, color: on ? PALETTE.text : PALETTE.textDim, wrap: 190 });
    });
    if (p.next) {
      const at = this.buttonPosition(2);
      this.nextButton = button(this, at.x, at.y, this.t('result.next'), () => this.go({ level: p.next! }), { width: 440, height: 104, fontSize: 42 });
    }
  }

  /** Leave for another match once: repeated taps and a failed ad never start two or get stuck. */
  private go(data: { level: string; date?: string }): void {
    if (this.leaving) return;
    this.leaving = true;
    between += 1;
    if (between % INTERSTITIAL_EVERY !== 0) {
      this.goTo(this.gameScene, data);
      return;
    }
    const proceed = (): void => {
      if (this.scene.isActive()) this.goTo(this.gameScene, data);
    };
    this.oyun.platform.showInterstitial('between_matches').then(proceed, proceed);
  }

  protected override onReplay(): void {
    const p = this.payload;
    this.go(p?.level === 'daily' ? { level: 'daily', ...(p.date ? { date: p.date } : {}) } : { level: p?.level ?? 'c1' });
  }

  protected override onMenu(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.goTo(SCENES.maps);
  }

  protected override testState() {
    return {
      ...super.testState(),
      won: this.payload?.won ?? false,
      stars: this.payload?.stars ?? 0,
      starsLit: this.lit,
      level: this.payload?.level ?? '',
      title: this.titleText,
      canNext: this.nextButton !== null,
    };
  }

  protected override testActions() {
    return { ...super.testActions(), next: () => this.nextButton?.fire() };
  }
}
