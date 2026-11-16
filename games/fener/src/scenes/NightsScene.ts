import { button, iconButton, label, OyunScene, type Button, type IconButton } from '@oyun/core';
import { gameSave } from '../save';
import { SHIFT } from '../sim/night';
import { PALETTE } from '../textures';
import { drawBackdrop } from './Background';
import { SCENES } from './keys';

/** Campaign night select. Test actions: night n, back. */
export class NightsScene extends OyunScene {
  private nights: Button[] = [];
  private back!: IconButton;

  constructor() {
    super(SCENES.nights);
  }

  create(): void {
    const L = this.layout;
    drawBackdrop(this);
    const d = gameSave(this.oyun).data;
    this.back = iconButton(this, L.left + 64, L.top + 70, 'home', () => this.goTo(SCENES.menu));
    label(this, L.cx, L.top + 70, this.t('nights.title'), { size: 56 });
    label(this, L.cx, L.top + 150, this.t('nights.hint'), { size: 34, color: PALETTE.textDim, wrap: L.width - 80 });
    this.nights = [];
    const top = L.top + 270;
    const step = Math.min(140, (L.bottom - 110 - top) / (SHIFT.nights - 1));
    for (let n = 1; n <= SHIFT.nights; n++) {
      const locked = n > d.unlocked;
      const best = d.nightBest[n - 1] ?? 0;
      const status = locked ? this.t('nights.locked') : best > 0 ? this.t('nights.best', { n: best }) : this.t('nights.new');
      const b = button(this, L.cx, top + (n - 1) * step, `${this.t('nights.night', { n })} · ${status}`, () => this.play(n), {
        variant: n === d.unlocked ? 'primary' : 'secondary',
        width: 600,
        height: 108,
        fontSize: 38,
      });
      if (locked) b.setEnabled(false);
      this.nights.push(b);
    }
  }

  private play(n: number): void {
    this.oyun.audio.unlock();
    this.goTo(SCENES.game, { mode: 'campaign', night: n });
  }

  protected override testState() {
    const d = gameSave(this.oyun).data;
    return { unlocked: d.unlocked, nightBest: d.nightBest };
  }

  protected override testActions() {
    return {
      night: (n: unknown) => this.nights[Number(n) - 1]?.fire(),
      back: () => this.back.fire(),
    };
  }
}
