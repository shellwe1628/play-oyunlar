import { button, label, MenuScene as MenuShell } from '@oyun/core';
import type { PauseReason } from '@oyun/core/pure';
import Phaser from 'phaser';
import { addCardLife } from '../fx/CardLife';
import { Helper } from '../fx/Helper';
import { Particles } from '../fx/Particles';
import { backgroundAware, session } from '../session';
import { at, FOSSIL_BY_ID, FOSSILS, RANKS } from '../sim/data';
import { badgeKey } from '../art/badges';
import { fossilKey, PALETTE } from '../textures';
import { StratumBlock } from './Block';
import { SCENES } from './keys';
import { big, fitText, fossilName, hitZone, oddsText } from './ui';

/**
 * Title screen: core menu shell over a dig site in miniature, with the helper working at a
 * small block of your current layer and your rarest find on a lit pedestal. Test action: play.
 */
export class MenuScene extends MenuShell {
  protected readonly playScene = SCENES.dig;
  private helper: Helper | null = null;
  private chips: Particles | null = null;
  private block: StratumBlock | null = null;
  private beat = 0;

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
      const top = height * (0.68 + i * 0.055);
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 12; k++) pts.push(new Phaser.Math.Vector2((width * k) / 12, top + Math.sin(k * 0.9 + i) * 12));
      pts.push(new Phaser.Math.Vector2(width, height), new Phaser.Math.Vector2(0, height));
      g.fillStyle(c, 1).fillPoints(pts, true);
    });
  }

  protected override decorate(): void {
    session(this.oyun).boot(); // away time since the last save, shown on the dig screen
    const { width, height, cx } = this.layout;
    const sim = session(this.oyun).sim;
    // the dig site in miniature
    const floorY = height * 0.88;
    this.block = new StratumBlock(this, cx - 30, floorY - 92, 230, 170).setLayer(sim.layer).setDepth(5);
    this.chips = new Particles(this, 30, 50);
    this.helper = new Helper(this, cx - 200, floorY + 6, 1, this.chips, { x: cx - 145, y: floorY - 60 }, 40);
    this.beat = 0;
    // your rarest find on a pedestal, under a spotlight
    const px = cx + 210;
    const best = sim.stats.bestId ? FOSSIL_BY_ID.get(sim.stats.bestId) : undefined;
    this.add.image(px, floorY - 330, 'ray').setOrigin(0.5, 0).setTint(0xfff3c0).setAlpha(0.22).setScale(2.4, 0.95);
    const ped = this.add.graphics();
    ped.fillStyle(0x000000, 0.3).fillEllipse(px, floorY + 4, 170, 26);
    ped.fillStyle(0xd8cbb4, 1).fillRect(px - 60, floorY - 70, 120, 74);
    ped.fillStyle(0xf4ecdc, 1).fillRect(px - 72, floorY - 82, 144, 16).fillRect(px - 72, floorY - 4, 144, 12);
    const show = this.add.container(px, floorY - 150);
    show.add(this.add.image(0, 0, best ? fossilKey(best.id) : fossilKey('topsoil-01')).setScale(0.62));
    if (best) addCardLife(this, show, best.tier, 120, 120);
    else {
      (show.list[0] as Phaser.GameObjects.Image).setVisible(false);
      const q = label(this, 0, 0, '?', { size: 72, color: PALETTE.sand });
      q.setAlpha(0.8);
      show.add(q);
    }
    this.tweens.add({ targets: show, y: floorY - 160, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.easeInOut' });
    // your rank: badge and score (tap for the ladder)
    const rank = sim.rank;
    const ry = height * 0.3 + 250;
    const badge = this.add.image(cx - 200, ry, badgeKey(this, rank)).setScale(0.6);
    const rt = label(this, cx - 140, ry, this.t('menu.rank', { name: this.t(`rank.${at(RANKS, rank).id}`), n: big(this, sim.score.total) }), { size: 32, color: at(RANKS, rank).color }).setOrigin(0, 0.5);
    rt.setStroke('#1a0f08', 6);
    fitText(rt, width - (cx - 140) - 40);
    hitZone(this, cx, ry, width - 80, 110, () => this.goTo(SCENES.ranks));
    this.tweens.add({ targets: badge, scale: 0.66, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
    // the two other places, one tap from the title: the museum and the ranks ladder
    this.playButton.y -= 44;
    const row = height * 0.62 + 74;
    button(this, cx - 112, row, this.t('museum.title'), () => this.goTo(SCENES.museum), { width: 200, height: 80, fontSize: 32, variant: 'secondary' });
    button(this, cx + 112, row, this.t('menu.ranks'), () => this.goTo(SCENES.ranks), { width: 200, height: 80, fontSize: 32, variant: 'secondary' });
    if (best) {
      label(this, cx, height * 0.3 + 170, this.t('menu.rarest', { name: fossilName(this, best), odds: oddsText(this, best.odds) }), {
        size: 34,
        color: PALETTE.ochreLight,
        wrap: width - 100,
      });
    }
  }

  override update(_t: number, delta: number): void {
    const dt = Math.min(delta, 250) / 1000;
    if (!this.helper || !this.chips) return;
    // the helper always works on the menu, at its own rhythm
    this.beat += dt;
    if (this.beat > 0.9) {
      this.beat = 0;
      this.helper.hits(1);
    }
    const level = Math.max(1, session(this.oyun).sim.level('assistant'));
    this.helper.update(dt, level, false);
    this.chips.update(dt);
  }

  protected override onPlatformPause(reason: PauseReason): void {
    if (backgroundAware(reason)) session(this.oyun).background();
    super.onPlatformPause(reason);
  }

  protected override onPlatformResume(reason: PauseReason): void {
    if (backgroundAware(reason)) session(this.oyun).foreground();
    super.onPlatformResume(reason);
  }

  protected override testState() {
    const sim = session(this.oyun).sim;
    return { found: FOSSILS.filter((f) => sim.discovered(f.id)).length, score: sim.score.total, rank: sim.rank };
  }
}
