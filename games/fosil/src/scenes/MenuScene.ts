import { label, MenuScene as MenuShell } from '@oyun/core';
import Phaser from 'phaser';
import { session } from '../session';
import { FOSSIL_BY_ID, FOSSILS } from '../sim/data';
import { fossilKey, PALETTE } from '../textures';
import { SCENES } from './keys';
import { fossilName, oddsText } from './ui';

/** Title screen: core menu shell, sediment backdrop, a slow parade of fossils. Test action: play. */
export class MenuScene extends MenuShell {
  protected readonly playScene = SCENES.dig;

  constructor() {
    super(SCENES.menu);
  }

  protected override title(): string {
    return this.t('menu.title');
  }

  protected override subtitle(): string {
    const sim = session(this.oyun).sim;
    const found = FOSSILS.filter((f) => sim.discovered(f.id)).length;
    return found > 0 ? this.t('menu.progress', { a: found, b: FOSSILS.length }) : this.t('menu.tagline');
  }

  protected override drawBackground(): void {
    const { width, height } = this.layout;
    this.cameras.main.setBackgroundColor(PALETTE.dirtDark);
    const g = this.add.graphics().setDepth(-10);
    const bands = [0x3a2618, 0x4a3020, 0x5a3b24, 0x6d4123, 0x84552f, 0x9b6a3f];
    bands.forEach((c, i) => {
      const top = height * (0.45 + i * 0.09);
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 12; k++) pts.push(new Phaser.Math.Vector2((width * k) / 12, top + Math.sin(k * 0.9 + i) * 14));
      pts.push(new Phaser.Math.Vector2(width, height), new Phaser.Math.Vector2(0, height));
      g.fillStyle(c, 1).fillPoints(pts, true);
    });
  }

  protected override decorate(): void {
    const { width, height, cx } = this.layout;
    // a few fossils half-buried in the strata
    const picks = ['topsoil-01', 'iceage-09', 'cretaceous-02', 'deepsea-02', 'cretaceous-06', 'topsoil-02'];
    picks.forEach((id, i) => {
      const x = (width / (picks.length + 1)) * (i + 1);
      const y = height * (0.8 + (i % 2) * 0.07);
      const img = this.add.image(x, y, fossilKey(id)).setScale(0.62).setAngle(-20 + i * 9).setAlpha(0.85);
      this.tweens.add({ targets: img, y: y - 10, yoyo: true, repeat: -1, duration: 1400 + i * 170, ease: 'Sine.easeInOut' });
    });
    const sim = session(this.oyun).sim;
    const best = sim.stats.bestId ? FOSSIL_BY_ID.get(sim.stats.bestId) : undefined;
    if (best) {
      label(this, cx, height * 0.3 + 170, this.t('menu.rarest', { name: fossilName(this, best), odds: oddsText(this, best.odds) }), {
        size: 34,
        color: PALETTE.ochreLight,
        wrap: width - 100,
      });
    }
  }

  protected override testState() {
    return { found: FOSSILS.filter((f) => session(this.oyun).sim.discovered(f.id)).length };
  }
}
