import { button, ResultScene as ResultShell, toast, type Button, type ResultData } from '@oyun/core';
import { gameSave } from '../save';
import { applyRoundResult } from '../sim/progress';
import { drawBackdrop } from './Background';
import { SCENES } from './keys';

/** Show an interstitial before every Nth replay (natural break; never mid-round). */
const INTERSTITIAL_EVERY = 3;
let replays = 0;

/**
 * Core result shell + a rewarded "double score" button and interstitial pacing.
 * Test actions: replay, menu, double.
 */
export class ResultScene extends ResultShell {
  protected readonly gameScene = SCENES.game;
  private doubled = false;
  private doubleButton: Button | null = null;

  constructor() {
    super(SCENES.result);
  }

  override init(data: Partial<ResultData> & { doubled?: boolean }): void {
    super.init(data);
    this.doubled = data.doubled ?? false;
  }

  protected override drawBackground(): void {
    drawBackdrop(this, this.oyun.theme.colors.background);
  }

  override create(): void {
    super.create();
    this.doubleButton = null;
    if (this.doubled) toast(this, this.t('result.doubled'));
    if (this.result.score > 0 && !this.doubled) {
      const at = this.buttonPosition(2);
      this.doubleButton = button(this, at.x, at.y, this.t('result.double'), () => void this.double(), {
        variant: 'secondary',
        width: 440,
        height: 96,
        fontSize: 38,
      });
    }
  }

  private async double(): Promise<void> {
    this.doubleButton?.setEnabled(false);
    const outcome = await this.oyun.platform.showRewarded('double_score');
    if (outcome !== 'granted') {
      this.doubleButton?.setEnabled(true);
      return;
    }
    const score = this.result.score * 2;
    const save = gameSave(this.oyun);
    let best = save.data.best;
    let newBest = false;
    save.update((d) => {
      d.rounds -= 1; // the round was already counted; only the score changes
      ({ best, newBest } = applyRoundResult(d, score));
    });
    this.oyun.platform.track('reward_claimed', { placement: 'double_score' });
    this.scene.restart({ ...this.result, score, best, newBest: newBest || this.result.newBest, doubled: true });
  }

  protected override onReplay(): void {
    replays += 1;
    if (replays % INTERSTITIAL_EVERY !== 0) {
      this.goTo(this.gameScene);
      return;
    }
    void this.oyun.platform.showInterstitial('between_rounds').then(() => this.goTo(this.gameScene));
  }

  protected override testState() {
    return { ...super.testState(), doubled: this.doubled, canDouble: this.doubleButton !== null };
  }

  protected override testActions() {
    return {
      ...super.testActions(),
      double: () => this.doubleButton?.fire(),
    };
  }
}
