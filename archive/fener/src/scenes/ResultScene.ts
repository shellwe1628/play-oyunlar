import { button, ResultScene as ResultShell, type Button, type ResultData } from '@oyun/core';
import { SHIFT } from '../sim/night';
import { drawBackdrop } from './Background';
import { SCENES, today, type ShiftData } from './keys';

type ShiftResult = Partial<ResultData> & { shift?: ShiftData; unlocked?: boolean };

/**
 * Core result shell + "Next night" after a won campaign night. Interstitials only here,
 * between nights — never during a shift. Test actions: replay, menu, next.
 */
export class ResultScene extends ResultShell {
  protected readonly gameScene = SCENES.game;
  private shift: ShiftData = { mode: 'campaign', night: 1 };
  private nextButton: Button | null = null;

  constructor() {
    super(SCENES.result);
  }

  override init(data: ShiftResult): void {
    super.init(data);
    this.shift = data.shift ?? { mode: 'campaign', night: 1 };
  }

  protected override drawBackground(): void {
    drawBackdrop(this);
  }

  override create(): void {
    super.create();
    this.nextButton = null;
    const s = this.shift;
    if (this.result.won && s.mode === 'campaign' && s.night < SHIFT.nights) {
      const at = this.buttonPosition(2);
      this.nextButton = button(this, at.x, at.y, this.t('result.next'), () => this.onNext(), { width: 440 });
      // "Next" is the natural forward action after a win: it takes Replay's place and style,
      // Replay moves below as a secondary button (same handler, so the 'replay' action still works).
      const b0 = this.buttonPosition(0);
      this.nextButton.setPosition(b0.x, b0.y);
      this.replayButton.destroy();
      this.replayButton = button(this, at.x, at.y, this.t('core.replay'), () => this.onReplay(), { variant: 'secondary', width: 440 });
    }
  }

  protected override onReplay(): void {
    const s = this.shift.mode === 'daily' ? { ...this.shift, day: today() } : this.shift;
    this.goTo(this.gameScene, s);
  }

  private onNext(): void {
    const next: ShiftData = { mode: 'campaign', night: this.shift.night + 1 };
    void this.oyun.platform.showInterstitial('between_nights').then(() => this.goTo(this.gameScene, next));
  }

  protected override testState() {
    return { ...super.testState(), won: this.result.won ?? false, canNext: this.nextButton !== null, lines: this.result.lines ?? [] };
  }

  protected override testActions() {
    return { ...super.testActions(), next: () => this.nextButton?.fire() };
  }
}
