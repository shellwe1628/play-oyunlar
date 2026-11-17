import { button, cssColor, label, OyunScene, touchHitSize, type Button } from '@oyun/core';
import Phaser from 'phaser';
import { gameSave } from '../save';
import { buyUpgrade, COSMETICS, UPGRADE_IDS, UPGRADES, upgradeCost, type UpgradeId } from '../sim/meta';
import { SFX } from '../sfx';
import { PALETTE } from '../textures';
import { drawHills, drawSky } from './art';
import { drawCoin, drawUpgradeIcon } from './icons';
import { SCENES } from './keys';

/**
 * Permanent upgrades (coins) and cosmetics (best-wave milestones). One tap away from the title
 * and the result screen. Test actions: buy <id>, wear <index>, back.
 */
export class ShopScene extends OyunScene {
  private from: 'game' | 'result' = 'game';
  private buyBtns = new Map<UpgradeId, Button>();
  private coinText!: Phaser.GameObjects.Text;
  private rowG!: Phaser.GameObjects.Graphics;
  private cosG!: Phaser.GameObjects.Graphics;
  private backBtn!: Button;
  private maxLabels = new Map<UpgradeId, Phaser.GameObjects.Text>();

  constructor() {
    super(SCENES.shop);
  }

  init(data: { from?: 'game' | 'result' }): void {
    this.from = data?.from ?? 'game';
  }

  create(): void {
    const L = this.layout;
    this.cameras.main.setBackgroundColor(PALETTE.skyDay);
    const bg = this.add.graphics();
    drawSky(bg, 0, 720, 1280);
    drawHills(bg, 0, 720, 1280, 0);
    drawHills(bg, 0, 720, 1280, 1);
    this.add.rectangle(L.cx, L.cy, 720, 1280, PALETTE.ink, 0.35);
    label(this, L.cx, L.top + 80, this.t('shop.title'), { size: 64, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 14);
    const cg = this.add.graphics();
    drawCoin(cg, L.cx - 50, L.top + 160, 20);
    this.coinText = label(this, L.cx - 20, L.top + 160, '', { size: 46, color: PALETTE.coin }).setOrigin(0, 0.5).setStroke(cssColor(PALETTE.ink), 10);
    this.rowG = this.add.graphics();
    this.buyBtns.clear();
    this.maxLabels.clear();
    UPGRADE_IDS.forEach((id, i) => {
      const y = this.rowY(i);
      label(this, 158, y - 24, this.t(`up.${id}.name`), { size: 36, color: PALETTE.cream }).setOrigin(0, 0.5).setStroke(cssColor(PALETTE.ink), 8);
      label(this, 158, y + 20, this.t(`up.${id}.desc`), { size: 34, color: PALETTE.white, wrap: 380, align: 'left' }).setOrigin(0, 0.5);
      const b = button(this, 612, y, '', () => this.buy(id), { width: 150, height: 88, fontSize: 36 });
      this.buyBtns.set(id, b);
      this.maxLabels.set(id, label(this, 612, y, this.t('shop.max'), { size: 36, color: PALETTE.heal }).setStroke(cssColor(PALETTE.ink), 8).setVisible(false));
    });
    label(this, L.cx, this.cosPos(0).y - 92, this.t('shop.looks'), { size: 44, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 10);
    this.cosG = this.add.graphics();
    COSMETICS.forEach((_c, i) => {
      const { x, y } = this.cosPos(i);
      const zone = this.add.zone(x, y, 110, 110);
      const hit = touchHitSize(110, 110);
      zone.setSize(hit.width, hit.height).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.wear(i));
    });
    this.backBtn = button(this, L.cx, L.bottom - 70, this.t('shop.back'), () => this.back(), { width: 360, height: 100, variant: 'secondary', hotkey: 'ESC' });
    this.refresh();
  }

  /** Cosmetic tiles: two rows of three, anchored above the Back button. */
  private cosPos(i: number): { x: number; y: number } {
    const L = this.layout;
    const row = Math.floor(i / 3);
    return { x: 160 + (i % 3) * 200, y: L.bottom - 400 + row * 160 };
  }

  /** Upgrade rows fill the space between the coin line and the cosmetics. */
  private rowY(i: number): number {
    const L = this.layout;
    const top = L.top + 250;
    const bottom = this.cosPos(0).y - 92 - 90; // above the "Looks" heading
    return top + i * Math.min(118, (bottom - top) / (UPGRADE_IDS.length - 1));
  }

  private refresh(): void {
    const save = gameSave(this.oyun).data;
    this.coinText.setText(String(save.coins));
    const g = this.rowG;
    g.clear();
    UPGRADE_IDS.forEach((id, i) => {
      const y = this.rowY(i);
      g.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(20, y - 56, 680, 112, 24);
      g.fillStyle(PALETTE.cream, 1).fillCircle(84, y - 10, 36);
      drawUpgradeIcon(g, id, 84, y - 10);
      const lvl = save.upgrades[id];
      const max = UPGRADES[id].max;
      // level bar under the icon: one chunky segment per level
      const bw = 84;
      const seg = bw / max;
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(84 - bw / 2 - 4, y + 32, bw + 8, 20, 8);
      for (let k = 0; k < max; k++) {
        g.fillStyle(k < lvl ? PALETTE.gold : PALETTE.pipOff, 1).fillRoundedRect(84 - bw / 2 + k * seg + 1, y + 35, seg - 2, 14, 4);
      }
      const cost = upgradeCost(id, lvl);
      const b = this.buyBtns.get(id)!;
      const maxed = cost === null;
      b.setVisible(!maxed);
      this.maxLabels.get(id)!.setVisible(maxed);
      if (!maxed) {
        b.setLabel(String(cost));
        // affordable: bright and live; too dear: dimmed with the price still readable
        b.setEnabled(save.coins >= cost);
      }
    });
    const c = this.cosG;
    c.clear();
    COSMETICS.forEach((cos, i) => {
      const { x, y } = this.cosPos(i);
      const unlocked = save.best >= cos.wave;
      const worn = save.cosmetic === cos.id;
      c.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 56, y - 56, 112, 112, 24);
      c.fillStyle(worn ? PALETTE.gold : unlocked ? PALETTE.cream : PALETTE.pipOff, 1).fillRoundedRect(x - 49, y - 49, 98, 98, 20);
      // mini archer head + scarf preview
      c.fillStyle(PALETTE.ink, 1).fillCircle(x, y + 4, 30);
      c.fillStyle(unlocked ? PALETTE.skin : PALETTE.locked, 1).fillCircle(x, y + 4, 24);
      c.lineStyle(14, PALETTE.ink, 1).lineBetween(x - 28, y + 38, x + 28, y + 33);
      c.lineStyle(8, unlocked ? cos.scarf : PALETTE.locked, 1).lineBetween(x - 28, y + 38, x + 28, y + 33);
      if (cos.hat !== 'none') {
        c.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 28, y - 34, 56, 20, 9);
        c.fillStyle(unlocked ? cos.scarf : PALETTE.locked, 1).fillRoundedRect(x - 24, y - 31, 48, 14, 7);
      }
      if (!unlocked) c.fillStyle(PALETTE.ink, 0.55).fillRoundedRect(x - 49, y - 49, 98, 98, 20);
    });
    this.children.list.filter((o) => o.getData('cosLabel') === true).forEach((o) => o.destroy());
    COSMETICS.forEach((cos, i) => {
      const { x, y } = this.cosPos(i);
      const unlocked = save.best >= cos.wave;
      const txt = unlocked ? (save.cosmetic === cos.id ? this.t('shop.worn') : this.t(`cos.${cos.id}`)) : this.t('shop.unlock', { n: cos.wave });
      label(this, x, y + 76, txt, { size: 30, color: unlocked ? PALETTE.white : PALETTE.cream, wrap: 190 }).setStroke(cssColor(PALETTE.ink), 6).setData('cosLabel', true);
    });
  }

  private buy(id: UpgradeId): void {
    let ok = false;
    gameSave(this.oyun).update((d) => {
      ok = buyUpgrade(d, id);
    });
    if (ok) {
      this.oyun.audio.play('coin');
      this.oyun.platform.haptic('success');
      this.juice.burst(612, this.rowY(UPGRADE_IDS.indexOf(id)), { count: 12, color: PALETTE.gold, texture: 'oyun-star' });
      this.oyun.platform.track('upgrade_bought', { id });
    }
    this.refresh();
  }

  private wear(i: number): void {
    const cos = COSMETICS[i];
    if (!cos) return;
    const save = gameSave(this.oyun);
    if (save.data.best < cos.wave) {
      this.oyun.audio.playPreset(SFX.cancel);
      return;
    }
    save.update((d) => {
      d.cosmetic = cos.id;
    });
    this.oyun.audio.play('pop');
    this.refresh();
  }

  private back(): void {
    this.goTo(SCENES.game, {});
  }

  protected override testState() {
    const save = gameSave(this.oyun).data;
    return { coins: save.coins, upgrades: { ...save.upgrades }, cosmetic: save.cosmetic, from: this.from };
  }

  protected override testActions() {
    return {
      buy: (p: unknown) => this.buyBtns.get(p as UpgradeId)?.fire(),
      wear: (p: unknown) => this.wear(Number(p)),
      back: () => this.backBtn.fire(),
    };
  }
}
