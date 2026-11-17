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

  constructor() {
    super(SCENES.shop);
  }

  init(data: { from?: 'game' | 'result' }): void {
    this.from = data?.from ?? 'game';
  }

  create(): void {
    const L = this.layout;
    this.cameras.main.setBackgroundColor(0x3fb4ff);
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
    UPGRADE_IDS.forEach((id, i) => {
      const y = L.top + 270 + i * 128;
      label(this, 168, y - 22, this.t(`up.${id}.name`), { size: 36, color: PALETTE.cream }).setOrigin(0, 0.5).setStroke(cssColor(PALETTE.ink), 8);
      label(this, 168, y + 22, this.t(`up.${id}.desc`), { size: 28, color: 0xffffff, wrap: 340, align: 'left' }).setOrigin(0, 0.5);
      const b = button(this, 600, y, '', () => this.buy(id), { width: 170, height: 92, fontSize: 34 });
      this.buyBtns.set(id, b);
    });
    label(this, L.cx, L.top + 930, this.t('shop.looks'), { size: 44, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 10);
    this.cosG = this.add.graphics();
    COSMETICS.forEach((c, i) => {
      const { x, y } = this.cosPos(i);
      const zone = this.add.zone(x, y, 100, 100);
      const hit = touchHitSize(100, 100);
      zone.setSize(hit.width, hit.height).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.wear(i));
      this.add.text(0, 0, '');
      void c;
    });
    this.backBtn = button(this, L.cx, L.bottom - 80, this.t('shop.back'), () => this.back(), { width: 360, height: 104, variant: 'secondary', hotkey: 'ESC' });
    this.refresh();
  }

  private cosPos(i: number): { x: number; y: number } {
    const L = this.layout;
    return { x: 85 + i * 110, y: L.top + 1030 };
  }

  private refresh(): void {
    const save = gameSave(this.oyun).data;
    this.coinText.setText(String(save.coins));
    const g = this.rowG;
    g.clear();
    UPGRADE_IDS.forEach((id, i) => {
      const L = this.layout;
      const y = L.top + 270 + i * 128;
      g.fillStyle(PALETTE.ink, 0.55).fillRoundedRect(24, y - 58, 672, 116, 24);
      g.fillStyle(0xfff3d6, 1).fillCircle(90, y - 4, 42);
      drawUpgradeIcon(g, id, 90, y - 4);
      const lvl = save.upgrades[id];
      const max = UPGRADES[id].max;
      // level pips under the icon
      const pw = Math.min(14, 76 / max);
      for (let k = 0; k < max; k++) {
        const px = 90 - ((max - 1) * pw) / 2 + k * pw;
        g.fillStyle(PALETTE.ink, 1).fillCircle(px, y + 50, pw / 2 + 1.5);
        g.fillStyle(k < lvl ? PALETTE.gold : 0x6b5a7a, 1).fillCircle(px, y + 50, pw / 2 - 1);
      }
      const cost = upgradeCost(id, lvl);
      const b = this.buyBtns.get(id)!;
      b.setLabel(cost === null ? this.t('shop.max') : String(cost));
      b.setEnabled(cost !== null && save.coins >= cost);
    });
    const c = this.cosG;
    c.clear();
    COSMETICS.forEach((cos, i) => {
      const { x, y } = this.cosPos(i);
      const unlocked = save.best >= cos.wave;
      const worn = save.cosmetic === cos.id;
      c.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 50, y - 50, 100, 100, 22);
      c.fillStyle(worn ? PALETTE.gold : unlocked ? 0xfff3d6 : 0x6b5a7a, 1).fillRoundedRect(x - 44, y - 44, 88, 88, 18);
      // mini archer head + scarf preview
      c.fillStyle(PALETTE.ink, 1).fillCircle(x, y + 4, 27);
      c.fillStyle(unlocked ? PALETTE.skin : 0x9a8aa8, 1).fillCircle(x, y + 4, 21);
      c.lineStyle(12, PALETTE.ink, 1).lineBetween(x - 24, y + 34, x + 24, y + 30);
      c.lineStyle(7, unlocked ? cos.scarf : 0x9a8aa8, 1).lineBetween(x - 24, y + 34, x + 24, y + 30);
      if (cos.hat !== 'none') {
        c.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 25, y - 30, 50, 18, 8);
        c.fillStyle(unlocked ? cos.scarf : 0x9a8aa8, 1).fillRoundedRect(x - 21, y - 27, 42, 12, 6);
      }
      if (!unlocked) {
        c.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(x - 44, y - 44, 88, 88, 18);
      }
    });
    this.children.list.filter((o) => o.getData('cosLabel') === true).forEach((o) => o.destroy());
    COSMETICS.forEach((cos, i) => {
      const { x, y } = this.cosPos(i);
      const unlocked = save.best >= cos.wave;
      const txt = unlocked ? (save.cosmetic === cos.id ? this.t('shop.worn') : this.t(`cos.${cos.id}`)) : this.t('shop.unlock', { n: cos.wave });
      label(this, x, y + 76, txt, { size: 22, color: 0xffffff, wrap: 108 }).setData('cosLabel', true);
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
      this.juice.burst(600, this.layout.top + 270 + UPGRADE_IDS.indexOf(id) * 128, { count: 12, color: PALETTE.gold, texture: 'oyun-star' });
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
