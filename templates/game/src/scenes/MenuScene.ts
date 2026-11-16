import { MenuScene as MenuShell } from '@oyun/core';
import { gameSave } from '../save';
import { drawBackdrop } from './Background';
import { SCENES } from './keys';

/** Core menu shell + this game's backdrop, tagline and best score. Test action: play. */
export class MenuScene extends MenuShell {
  protected readonly playScene = SCENES.game;

  constructor() {
    super(SCENES.menu);
  }

  protected override drawBackground(): void {
    drawBackdrop(this, this.oyun.theme.colors.background);
  }

  protected override subtitle(): string {
    const best = gameSave(this.oyun).data.best;
    return best > 0 ? this.t('core.best', { n: best }) : this.t('menu.tagline');
  }

  protected override decorate(): void {
    const { cx, height } = this.layout;
    const target = this.add.image(cx, height * 0.47, 'target').setScale(0.9);
    this.tweens.add({ targets: target, angle: 360, duration: 8000, repeat: -1 });
  }

  protected override testState() {
    return { best: gameSave(this.oyun).data.best };
  }
}
