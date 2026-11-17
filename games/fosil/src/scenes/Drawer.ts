import { button, cssColor, iconButton, label, type Button, type IconButton, type OyunScene } from '@oyun/core';
import Phaser from 'phaser';
import { UPGRADES, UPGRADE_ORDER, type UpgradeId } from '../sim/data';
import type { DigSim } from '../sim/dig';
import { helperTier, pickTier } from '../fx/model';
import { PALETTE } from '../textures';
import { big, fitText, mult } from './ui';

const ROW_H = 92;

interface Row {
  id: UpgradeId;
  icon: Phaser.GameObjects.Image;
  iconGlow: Phaser.GameObjects.Image;
  afford: boolean;
  spin: number;
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
    this.add(label(scene0, L.left + 40, 48, scene0.t('dig.upgrades'), { size: 42, color: PALETTE.sand }).setOrigin(0, 0.5));
    this.close = iconButton(scene0, L.right - 66, 44, 'close', () => this.toggle(false));
    this.add(this.close);
    UPGRADE_ORDER.forEach((id, i) => {
      const y = 138 + i * ROW_H;
      const rowBg = scene0.add.graphics();
      rowBg.fillStyle(PALETTE.dirt, 0.8).fillRoundedRect(L.left + 24, y - ROW_H / 2 + 6, L.right - L.left - 48, ROW_H - 12, 20);
      const iconGlow = scene0.add.image(L.left + 72, y, 'glow').setTint(PALETTE.ochreLight).setScale(0.7).setAlpha(0);
      const icon = scene0.add.image(L.left + 72, y, 'ico-luck');
      const title = label(scene0, L.left + 116, y - 18, '', { size: 34, color: 0xffffff }).setOrigin(0, 0.5);
      const fx = label(scene0, L.left + 116, y + 20, '', { size: 28, color: PALETTE.sand }).setOrigin(0, 0.5);
      const buy = button(scene0, L.right - 146, y - 2, '', () => this.onBuy(id), { width: 210, height: 80, fontSize: 36, sfx: null });
      // unaffordable look: a dark veil over the face and light text (core's 45 % fade is unreadable)
      const veil = scene0.add.graphics();
      veil.fillStyle(PALETTE.dirtDark, 0.72).fillRoundedRect(-105, -40, 210, 80, 28);
      buy.addAt(veil, 1);
      const ico = scene0.add.image(-74, -2, 'ico-dust').setScale(0.8);
      buy.add(ico);
      this.add([rowBg, iconGlow, icon, title, fx, buy]);
      this.rows.push({ id, icon, iconGlow, afford: false, spin: 0, title, fx, buy, key: '' });
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
      r.afford = afford;
      this.setIcon(r, lvl);
      r.title.setText(`${s.t(`up.${r.id}`)}  ·  ${s.t('up.level', { n: lvl })}`);
      fitText(r.title, 330);
      const now = u.effect(lvl);
      const nxt = u.effect(Math.min(u.maxLevel, lvl + 1));
      const fmt = (v: number): string =>
        r.id === 'offline' ? String(Math.round(this.sim.offlineCapWith(v) / 60)) : r.id === 'assistant' ? mult(s, v * this.sim.assistantBonus) : mult(s, v);
      r.fx.setText(s.t(`up.${r.id}.fx`, { a: fmt(now), b: cost === null ? fmt(now) : fmt(nxt) }));
      fitText(r.fx, 330);
      r.buy.setLabel(cost === null ? s.t('up.max') : `   ${big(s, cost)}`);
      r.buy.setEnabled(afford);
      r.buy.setAlpha(1);
      const veil = r.buy.list[1] as Phaser.GameObjects.Graphics;
      veil.setVisible(!afford);
      const text = r.buy.list.find((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text);
      text?.setColor(cssColor(afford ? PALETTE.ink : PALETTE.sand));
      const ico = r.buy.list[r.buy.list.length - 1] as Phaser.GameObjects.Image;
      ico.setVisible(cost !== null);
    }
  }

  /** The row's icon shows what it upgrades, at its current look. */
  private setIcon(r: Row, lvl: number): void {
    if (r.id === 'pick') r.icon.setTexture(`pick-${pickTier(lvl)}`).setScale(0.5).setData('base', 0.5);
    else if (r.id === 'assistant') r.icon.setTexture(`helper-head-${Math.max(1, helperTier(lvl))}`).setScale(1.25).setData('base', 1.25);
    else r.icon.setTexture(r.id === 'luck' ? 'ico-luck' : 'ico-moon').setScale(1.3).setData('base', 1.3);
  }

  /** Bought: the icon spins and pops. */
  celebrate(id: UpgradeId): void {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.spin = 0.55;
  }

  /** Affordable icons bob and glow; a bought one spins. Called every frame (no allocation). */
  animate(dt: number, clock: number): void {
    if (!this.isOpen) return;
    for (const r of this.rows) {
      const base = (r.icon.getData('base') as number | undefined) ?? 1;
      if (r.spin > 0) {
        r.spin = Math.max(0, r.spin - dt);
        const p = 1 - r.spin / 0.55;
        r.icon.setRotation(p * Math.PI * 2).setScale(base * (1 + 0.5 * Math.sin(p * Math.PI)));
        r.iconGlow.setAlpha(0.9 * (1 - p));
      } else if (r.afford) {
        const b = Math.sin(clock * 5 + r.title.y);
        r.icon.setRotation(b * 0.12).setScale(base * (1 + 0.07 * b));
        r.iconGlow.setAlpha(0.35 + 0.25 * b);
      } else {
        r.icon.setRotation(0).setScale(base);
        r.iconGlow.setAlpha(0);
      }
      r.icon.setAlpha(r.afford || r.spin > 0 ? 1 : 0.6);
    }
  }
}
