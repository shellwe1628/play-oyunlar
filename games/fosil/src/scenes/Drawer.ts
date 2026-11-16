import { button, iconButton, label, type Button, type IconButton, type OyunScene } from '@oyun/core';
import Phaser from 'phaser';
import { UPGRADES, UPGRADE_ORDER, type UpgradeId } from '../sim/data';
import type { DigSim } from '../sim/dig';
import { PALETTE } from '../textures';
import { big, fitText, mult } from './ui';

const ROW_H = 94;

interface Row {
  id: UpgradeId;
  title: Phaser.GameObjects.Text;
  fx: Phaser.GameObjects.Text;
  buy: Button;
  key: string;
}

/**
 * Upgrade drawer: slides up from the bottom and stops below the stratum block, so the dig site
 * stays visible and tappable while it is open.
 */
export class Drawer extends Phaser.GameObjects.Container {
  readonly panelH: number;
  private rows: Row[] = [];
  private isOpen = false;
  readonly close: IconButton;

  constructor(
    private readonly scene0: OyunScene,
    private readonly sim: DigSim,
    private readonly topY: number,
    private readonly onBuy: (id: UpgradeId) => void,
  ) {
    super(scene0, 0, 0);
    const L = scene0.layout;
    this.panelH = L.height - topY;
    const g = scene0.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.5).fillRoundedRect(L.left + 8, -14, L.right - L.left - 16, this.panelH + 40, 34);
    g.fillStyle(PALETTE.dirtLight, 1).fillRoundedRect(L.left + 8, 0, L.right - L.left - 16, this.panelH + 40, 34);
    g.fillStyle(PALETTE.ochre, 1).fillRoundedRect(L.cx - 50, 12, 100, 10, 5);
    // swallow taps on the panel so they never count as digs
    const blocker = scene0.add.zone(L.cx, this.panelH / 2, L.width, this.panelH).setInteractive();
    this.add([blocker, g]);
    this.add(label(scene0, L.left + 40, 50, scene0.t('dig.upgrades'), { size: 42, color: PALETTE.sand }).setOrigin(0, 0.5));
    this.close = iconButton(scene0, L.right - 70, 50, 'close', () => this.toggle(false));
    this.add(this.close);
    UPGRADE_ORDER.forEach((id, i) => {
      const y = 116 + i * ROW_H;
      const rowBg = scene0.add.graphics();
      rowBg.fillStyle(PALETTE.dirt, 0.8).fillRoundedRect(L.left + 24, y - ROW_H / 2 + 6, L.right - L.left - 48, ROW_H - 12, 20);
      const title = label(scene0, L.left + 48, y - 18, '', { size: 34, color: 0xffffff }).setOrigin(0, 0.5);
      const fx = label(scene0, L.left + 48, y + 20, '', { size: 28, color: PALETTE.sand }).setOrigin(0, 0.5);
      const buy = button(scene0, L.right - 146, y - 2, '', () => this.onBuy(id), { width: 210, height: 80, fontSize: 36, sfx: null });
      const ico = scene0.add.image(-74, -2, 'ico-dust').setScale(0.8);
      buy.add(ico);
      this.add([rowBg, title, fx, buy]);
      this.rows.push({ id, title, fx, buy, key: '' });
    });
    this.setDepth(500).setY(L.height + 20);
    this.setVisible(false);
    scene0.add.existing(this);
  }

  get open(): boolean {
    return this.isOpen;
  }

  toggle(open = !this.isOpen): void {
    if (open === this.isOpen) return;
    this.isOpen = open;
    const s = this.scene0;
    s.tweens.killTweensOf(this);
    if (open) {
      this.setVisible(true);
      this.refresh();
      s.tweens.add({ targets: this, y: this.topY, duration: 260, ease: 'Back.easeOut' });
    } else {
      s.tweens.add({ targets: this, y: s.layout.height + 20, duration: 200, ease: 'Cubic.easeIn', onComplete: () => this.setVisible(false) });
    }
  }

  buyButton(id: UpgradeId): Button {
    return this.rows.find((r) => r.id === id)!.buy;
  }

  /** Redraw rows whose numbers changed. Cheap enough to call every frame. */
  refresh(): void {
    if (!this.isOpen) return;
    const s = this.scene0;
    for (const r of this.rows) {
      const lvl = this.sim.level(r.id);
      const cost = this.sim.upgradeCost(r.id);
      const afford = cost !== null && cost <= this.sim.dust;
      const key = `${lvl}|${cost}|${afford}`;
      if (key === r.key) continue;
      r.key = key;
      const u = UPGRADES[r.id];
      r.title.setText(`${s.t(`up.${r.id}`)}  ·  ${s.t('up.level', { n: lvl })}`);
      fitText(r.title, 400);
      const now = u.effect(lvl);
      const nxt = u.effect(Math.min(u.maxLevel, lvl + 1));
      const fmt = (v: number): string =>
        r.id === 'offline' ? String(Math.round(this.sim.offlineCapWith(v) / 60)) : r.id === 'assistant' ? mult(s, v * this.sim.assistantBonus) : mult(s, v);
      r.fx.setText(s.t(`up.${r.id}.fx`, { a: fmt(now), b: cost === null ? fmt(now) : fmt(nxt) }));
      fitText(r.fx, 400);
      r.buy.setLabel(cost === null ? s.t('up.max') : `   ${big(s, cost)}`);
      r.buy.setEnabled(afford);
      const ico = r.buy.list[r.buy.list.length - 1] as Phaser.GameObjects.Image;
      ico.setVisible(cost !== null);
    }
  }
}
