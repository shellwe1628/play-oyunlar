import { button, MenuScene as MenuShell, type Button } from '@oyun/core';
import { gameSave } from '../save';
import { dailyStreak, logbookProgress } from '../sim/progress';
import { drawBackdrop } from './Background';
import { SCENES, today } from './keys';

/** Core menu shell: Start shift → night select; plus Daily shift and Logbook. Test actions: play, daily, logbook. */
export class MenuScene extends MenuShell {
  protected readonly playScene = SCENES.nights;
  private dailyButton!: Button;
  private logButton!: Button;

  constructor() {
    super(SCENES.menu);
  }

  protected override title(): string {
    return this.t('menu.title');
  }

  protected override drawBackground(): void {
    drawBackdrop(this, this.layout.height * 0.5);
  }

  protected override subtitle(): string {
    const streak = dailyStreak(gameSave(this.oyun).data, today());
    return streak > 0 ? this.t('menu.streak', { n: streak }) : this.t('menu.tagline');
  }

  protected override decorate(): void {
    const { cx, height } = this.layout;
    const y = height * 0.62;
    this.dailyButton = button(this, cx, y + 160, this.t('menu.daily'), () => this.openDaily(), { variant: 'secondary', width: 420 });
    const pct = logbookProgress(gameSave(this.oyun).data).percent;
    this.logButton = button(this, cx, y + 300, `${this.t('menu.logbook')} · ${pct}%`, () => this.goTo(SCENES.logbook), {
      variant: 'secondary',
      width: 420,
    });
    this.playButton.setDepth(2);
  }

  private openDaily(): void {
    this.oyun.audio.unlock();
    this.goTo(SCENES.game, { mode: 'daily', night: 0, day: today() });
  }

  protected override testState() {
    const d = gameSave(this.oyun).data;
    return { unlocked: d.unlocked, nightBest: d.nightBest, log: d.log.length, daily: { ...d.daily } };
  }

  protected override testActions() {
    return { ...super.testActions(), daily: () => this.dailyButton.fire(), logbook: () => this.logButton.fire() };
  }
}
