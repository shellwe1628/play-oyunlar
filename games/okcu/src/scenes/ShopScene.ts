import { button, cssColor, label, OyunScene, touchHitSize, type Button } from '@oyun/core';
import Phaser from 'phaser';
import { THEMES } from '../anim/themes';
import { gameSave } from '../save';
import { buyUpgrade, COSMETICS, isUnlocked, UPGRADE_IDS, UPGRADES, upgradeCost, type UpgradeId } from '../sim/meta';
import { SFX } from '../sfx';
import { PALETTE } from '../textures';
import { drawHeadIcon } from './art';
import { bowDamage, bowTier } from '../sim/bow';
import { BOSS_KINDS } from '../sim/world';
import { bowItemGeom, drawBowItem, newBowGeom } from './gear';
import { BowAura } from './aura';
import { fitButton } from './GameScene';
import { drawCoin, drawUpgradeIcon } from './icons';
import { SCENES } from './keys';
import { Puppet } from './puppet';
import { drawThemeBack, drawThemeLedge, drawThemeNear } from './worlds';

type Tab = 'upgrades' | 'looks';

/**
 * Permanent upgrades (coins) and looks (milestones), on two tabs. The looks tab previews the
 * chosen cosmetic on a small animated archer. One tap away from the title and the result.
 * Test actions: buy <id>, wear <index>, tab <name>, back.
 */
export class ShopScene extends OyunScene {
  private from: 'game' | 'result' = 'game';
  private tab: Tab = 'upgrades';
  private buyBtns = new Map<UpgradeId, Button>();
  private coinText!: Phaser.GameObjects.Text;
  private rowG!: Phaser.GameObjects.Graphics;
  private backBtn!: Button;
  private maxLabels = new Map<UpgradeId, Phaser.GameObjects.Text>();
  private upgradeUi!: Phaser.GameObjects.Container;
  private looksUi!: Phaser.GameObjects.Container;
  private tabBtns = new Map<Tab, Button>();
  private tileG!: Phaser.GameObjects.Graphics;
  private puppet!: Puppet;
  private puppetG!: Phaser.GameObjects.Graphics;
  private previewName!: Phaser.GameObjects.Text;
  private previewNote!: Phaser.GameObjects.Text;
  private preview = 0;
  private bowName!: Phaser.GameObjects.Text;
  private bowNote!: Phaser.GameObjects.Text;
  private bowG!: Phaser.GameObjects.Graphics;
  private forgeBtn!: Button;
  private rowAura!: BowAura;
  private lookAura!: BowAura;
  private geom = newBowGeom();

  constructor() {
    super(SCENES.shop);
  }

  init(data: { from?: 'game' | 'result'; tab?: Tab }): void {
    this.from = data?.from ?? 'game';
    this.tab = data?.tab ?? 'upgrades';
  }

  create(): void {
    const L = this.layout;
    const th = THEMES[0]!;
    this.cameras.main.setBackgroundColor(th.skyTop);
    const bg = this.add.graphics();
    drawThemeBack(bg, th, 720, 1280);
    drawThemeNear(bg, th, 720, 1280);
    this.add.rectangle(L.cx, L.cy, 720, 1280, PALETTE.ink, 0.35);
    label(this, L.cx, L.top + 70, this.t('shop.title'), { size: 60, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 14);
    const cg = this.add.graphics();
    drawCoin(cg, L.cx - 50, L.top + 140, 20);
    this.coinText = label(this, L.cx - 20, L.top + 140, '', { size: 46, color: PALETTE.coin }).setOrigin(0, 0.5).setStroke(cssColor(PALETTE.ink), 10);
    this.tabBtns.clear();
    (['upgrades', 'looks'] as const).forEach((t, i) => {
      const b = button(this, L.cx + (i === 0 ? -160 : 160), L.top + 225, this.t(t === 'upgrades' ? 'shop.tabUpgrades' : 'shop.tabLooks'), () => this.setTab(t), { width: 300, height: 88, fontSize: 38, variant: 'secondary' });
      this.tabBtns.set(t, b);
    });

    // ---- upgrades tab
    this.upgradeUi = this.add.container(0, 0);
    this.rowG = this.add.graphics();
    this.upgradeUi.add(this.rowG);
    this.buyBtns.clear();
    this.maxLabels.clear();
    UPGRADE_IDS.forEach((id, i) => {
      const y = this.rowY(i);
      this.upgradeUi.add(label(this, 158, y - 24, this.t(`up.${id}.name`), { size: 36, color: PALETTE.cream }).setOrigin(0, 0.5).setStroke(cssColor(PALETTE.ink), 8));
      this.upgradeUi.add(label(this, 158, y + 20, this.t(`up.${id}.desc`), { size: 34, color: PALETTE.white, wrap: 380, align: 'left' }).setOrigin(0, 0.5));
      const b = button(this, 612, y, '', () => this.buy(id), { width: 150, height: 88, fontSize: 36 });
      this.buyBtns.set(id, b);
      const max = label(this, 612, y, this.t('shop.max'), { size: 36, color: PALETTE.heal }).setStroke(cssColor(PALETTE.ink), 8).setVisible(false);
      this.maxLabels.set(id, max);
      this.upgradeUi.add([b, max]);
    });
    // the bow is forged, not bought: its row leads to the forge
    const fy = this.rowY(UPGRADE_IDS.length);
    this.bowName = label(this, 158, fy - 24, '', { size: 36, color: PALETTE.gold }).setOrigin(0, 0.5).setStroke(cssColor(PALETTE.ink), 8);
    this.bowNote = label(this, 158, fy + 20, '', { size: 32, color: PALETTE.white }).setOrigin(0, 0.5);
    this.forgeBtn = fitButton(button(this, 612, fy, this.t('shop.forge'), () => this.goTo(SCENES.forge, { from: this.from === 'result' ? 'result' : 'game' }), { width: 150, height: 88, fontSize: 34 }), 150);
    this.bowG = this.add.graphics();
    this.upgradeUi.add([this.bowG, this.bowName, this.bowNote, this.forgeBtn]);
    this.rowAura = new BowAura(this, this.upgradeUi);

    // ---- looks tab: animated preview on a little ledge + a 4×3 grid
    this.looksUi = this.add.container(0, 0);
    const stand = this.add.graphics();
    const footY = L.top + 480;
    drawThemeLedge(stand, { x: L.cx - 110, y: footY, w: 220, h: 50 }, 3, th);
    this.looksUi.add(stand);
    this.puppet = new Puppet('player', L.cx, footY, 1, 1.3);
    this.puppet.setMood(0, true);
    this.puppetG = this.add.graphics();
    this.looksUi.add(this.puppetG);
    this.lookAura = new BowAura(this, this.looksUi, 1);
    this.previewName = label(this, L.cx, footY + 95, '', { size: 44, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 10);
    this.previewNote = label(this, L.cx, footY + 142, '', { size: 34, color: PALETTE.white }).setStroke(cssColor(PALETTE.ink), 8);
    this.tileG = this.add.graphics();
    this.looksUi.add([this.previewName, this.previewNote, this.tileG]);
    COSMETICS.forEach((_c, i) => {
      const { x, y } = this.tilePos(i);
      const hit = touchHitSize(118, 118);
      const zone = this.add.zone(x, y, hit.width, hit.height).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.wear(i));
      this.looksUi.add(zone);
    });
    const save = gameSave(this.oyun).data;
    this.preview = Math.max(0, COSMETICS.findIndex((c) => c.id === save.cosmetic));

    this.backBtn = button(this, L.cx, L.bottom - 70, this.t('shop.back'), () => this.back(), { width: 360, height: 100, variant: 'secondary', hotkey: 'ESC' });
    this.setTab(this.tab);
  }

  private tilePos(i: number): { x: number; y: number } {
    const L = this.layout;
    const col = i % 4;
    const row = Math.floor(i / 4);
    return { x: 135 + col * 150, y: L.bottom - 560 + row * 114 }; // four rows since chapters 5 and 6
  }

  /** Upgrade rows below the tabs. */
  private rowY(i: number): number {
    const L = this.layout;
    const top = L.top + 340;
    const bottom = L.bottom - 170;
    return top + i * Math.min(124, (bottom - top) / UPGRADE_IDS.length);
  }

  private setTab(t: Tab): void {
    this.tab = t;
    this.upgradeUi.setVisible(t === 'upgrades');
    this.looksUi.setVisible(t === 'looks');
    for (const [k, b] of this.tabBtns) b.setAlpha(k === t ? 1 : 0.55);
    // hidden buttons must not take taps
    for (const b of [...this.buyBtns.values(), this.forgeBtn]) {
      if (t === 'upgrades') b.setInteractive();
      else b.disableInteractive();
    }
    this.refresh();
  }

  override update(time: number, delta: number): void {
    const save = gameSave(this.oyun).data;
    if (this.tab === 'upgrades') {
      // the bow row's icon glows like the real thing
      const fy = this.rowY(UPGRADE_IDS.length);
      this.bowG.clear();
      this.bowG.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(20, fy - 56, 680, 112, 24);
      this.bowG.fillStyle(PALETTE.cream, 1).fillCircle(84, fy, 40);
      drawBowItem(this.bowG, 88, fy, 30, save.bow.level, time / 1000);
      this.rowAura.update(Math.min(delta, 100) / 1000, save.bow.level, bowItemGeom(88, fy, 30, this.geom), 0);
      return;
    }
    this.puppet.step(Math.min(delta, 100) / 1000);
    this.puppetG.clear();
    this.puppet.draw(this.puppetG, COSMETICS[this.preview]!, save.bow.level);
    this.lookAura.update(Math.min(delta, 100) / 1000, save.bow.level, this.puppet.bowGeom(this.geom), this.puppet.archer.draw);
  }

  private refresh(): void {
    const save = gameSave(this.oyun).data;
    this.coinText.setText(String(save.coins));
    this.bowName.setText(this.t('bow.name', { name: this.t(`bow.${bowTier(save.bow.level)}`), n: save.bow.level }));
    this.bowNote.setText(this.t('forge.dmg', { a: bowDamage(save.bow.level).toFixed(2), b: bowDamage(save.bow.level + 1).toFixed(2) }));
    const g = this.rowG;
    g.clear();
    UPGRADE_IDS.forEach((id, i) => {
      const y = this.rowY(i);
      g.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(20, y - 56, 680, 112, 24);
      g.fillStyle(PALETTE.cream, 1).fillCircle(84, y - 10, 36);
      drawUpgradeIcon(g, id, 84, y - 10);
      const lvl = save.upgrades[id];
      const max = UPGRADES[id].max;
      const bw = 84;
      const seg = bw / max;
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(84 - bw / 2 - 4, y + 32, bw + 8, 20, 8);
      for (let k = 0; k < max; k++) g.fillStyle(k < lvl ? PALETTE.gold : PALETTE.pipOff, 1).fillRoundedRect(84 - bw / 2 + k * seg + 1, y + 35, seg - 2, 14, 4);
      const cost = upgradeCost(id, lvl);
      const b = this.buyBtns.get(id)!;
      const maxed = cost === null;
      b.setVisible(!maxed);
      this.maxLabels.get(id)!.setVisible(maxed);
      if (!maxed) {
        b.setLabel(String(cost));
        b.setEnabled(save.coins >= cost);
      }
    });
    // looks
    const t = this.tileG;
    t.clear();
    COSMETICS.forEach((cos, i) => {
      const { x, y } = this.tilePos(i);
      const unlocked = isUnlocked(cos, save.best, save.runs, save.bosses);
      const worn = save.cosmetic === cos.id;
      const sel = i === this.preview;
      t.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 52, y - 52, 104, 104, 22);
      t.fillStyle(worn ? PALETTE.gold : sel ? PALETTE.cream : unlocked ? PALETTE.cardIcon : PALETTE.pipOff, 1).fillRoundedRect(x - 46, y - 46, 92, 92, 18);
      drawHeadIcon(t, x, y + 6, 26, cos, unlocked);
      if (!unlocked) {
        // padlock
        t.fillStyle(PALETTE.ink, 1).fillRoundedRect(x + 18, y + 18, 28, 24, 6);
        t.lineStyle(5, PALETTE.ink, 1).beginPath().arc(x + 32, y + 18, 9, Math.PI, 0, false).strokePath();
        t.fillStyle(PALETTE.coin, 1).fillCircle(x + 32, y + 29, 4);
      }
    });
    const cos = COSMETICS[this.preview]!;
    const unlocked = isUnlocked(cos, save.best, save.runs, save.bosses);
    this.previewName.setText(this.t(`cos.${cos.id}`));
    this.previewNote.setText(save.cosmetic === cos.id ? this.t('shop.worn') : unlocked ? '' : cos.boss !== undefined ? this.t('shop.boss', { b: this.t(`boss.${BOSS_KINDS[cos.boss]!}`) }) : cos.runs > 0 ? this.t('shop.runs', { n: cos.runs }) : this.t('shop.unlock', { n: cos.wave }));
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

  /** Tap a look: preview it on the archer; wear it if it is unlocked. */
  private wear(i: number): void {
    const cos = COSMETICS[i];
    if (!cos) return;
    this.preview = i;
    const save = gameSave(this.oyun);
    if (!isUnlocked(cos, save.data.best, save.data.runs, save.data.bosses)) {
      this.oyun.audio.playPreset(SFX.cancel);
      this.refresh();
      return;
    }
    save.update((d) => {
      d.cosmetic = cos.id;
    });
    this.oyun.audio.play('pop');
    this.puppet.setMood(1);
    this.time.delayedCall(900, () => this.puppet.setMood(0, true));
    this.refresh();
  }

  private back(): void {
    this.goTo(SCENES.game, {});
  }

  protected override testState() {
    const save = gameSave(this.oyun).data;
    return { coins: save.coins, upgrades: { ...save.upgrades }, cosmetic: save.cosmetic, from: this.from, tab: this.tab, preview: COSMETICS[this.preview]?.id ?? '' };
  }

  protected override testActions() {
    return {
      buy: (p: unknown) => this.buyBtns.get(p as UpgradeId)?.fire(),
      forge: () => this.forgeBtn.fire(),
      wear: (p: unknown) => this.wear(Number(p)),
      tab: (p: unknown) => this.tabBtns.get(p === 'looks' ? 'looks' : 'upgrades')?.fire(),
      back: () => this.backBtn.fire(),
    };
  }
}
