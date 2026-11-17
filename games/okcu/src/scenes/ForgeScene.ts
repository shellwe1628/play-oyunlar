import { button, cssColor, label, OyunScene, type Button } from '@oyun/core';
import type Phaser from 'phaser';
import { gameSave } from '../save';
import { attemptForge, BOW_MAX, bowCost, bowDamage, bowTier, forgeChance, HEAT_STEP, type ForgeResult } from '../sim/bow';
import { unlockFeats } from '../sim/progress';
import { SFX } from '../sfx';
import { PALETTE } from '../textures';
import { auraColor, drawBowItem } from './gear';
import { drawCoin } from './icons';
import { fitButton } from './GameScene';
import { SCENES } from './keys';

/**
 * The forge: the bow's enhancement level, damage, cost and exact success chance, the forge-heat
 * pity meter, and the attempt itself as a moment (build-up, three anvil strikes, payoff).
 * The roll is made and saved when the button is pressed; the animation only reveals it.
 * Test actions: forge, back. Test state: level, heat, chance, cost, coins, busy, last.
 */
export class ForgeScene extends OyunScene {
  private from: 'game' | 'result' | 'shop' = 'game';
  private bowG!: Phaser.GameObjects.Graphics;
  private hammer!: Phaser.GameObjects.Container;
  private heatG!: Phaser.GameObjects.Graphics;
  private nameText!: Phaser.GameObjects.Text;
  private dmgText!: Phaser.GameObjects.Text;
  private chanceText!: Phaser.GameObjects.Text;
  private heatText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private resultSub!: Phaser.GameObjects.Text;
  private forgeBtn!: Button;
  private backBtn!: Button;
  private busy = false;
  /** what the bow looks like now (the level shown lags the save until the payoff) */
  private shownLevel = 0;
  private shownHeat = 0;
  private flash = 0;
  private lift = 0;
  private shake = 0;
  private dim = 0;
  private clock = 0;
  private last: ForgeResult | null = null;
  private sparks: { x: number; y: number; vx: number; vy: number; life: number; c: number }[] = [];
  private fxG!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SCENES.forge);
  }

  init(data: { from?: 'game' | 'result' | 'shop' }): void {
    this.from = data?.from ?? 'game';
  }

  create(): void {
    const L = this.layout;
    const save = gameSave(this.oyun).data;
    this.busy = false;
    this.last = null;
    this.sparks = [];
    this.shownLevel = save.bow.level;
    this.shownHeat = save.bow.heat;
    this.cameras.main.setBackgroundColor(0x2a1622);
    const bg = this.add.graphics();
    // a warm smithy: dark stone walls, a glowing hearth behind the anvil
    for (let i = 0; i < 16; i++) bg.fillStyle(mix(0x1d1020, 0x5a2a1e, i / 15), 1).fillRect(0, (i * 1280) / 16 - 40, 720, 1280 / 16 + 2);
    for (let r = 0; r < 6; r++) bg.fillStyle(PALETTE.heat, 0.06 + r * 0.025).fillCircle(L.cx, L.cy + 140, 420 - r * 60);
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 5; col++) {
        const x = col * 170 + (row % 2) * 85 - 40;
        const y = 60 + row * 130;
        bg.lineStyle(3, 0x14080f, 0.5).strokeRoundedRect(x, y, 160, 120, 16);
      }
    }
    // the anvil
    const ay = L.cy + 230;
    bg.fillStyle(PALETTE.ink, 1).fillRoundedRect(L.cx - 190, ay - 40, 380, 90, 24);
    bg.fillStyle(0x5c6378, 1).fillRoundedRect(L.cx - 180, ay - 32, 360, 74, 18);
    bg.fillStyle(0x8a93ab, 1).fillRoundedRect(L.cx - 170, ay - 28, 340, 22, 10);
    bg.fillStyle(PALETTE.ink, 1).fillRect(L.cx - 70, ay + 40, 140, 90).fillRoundedRect(L.cx - 130, ay + 120, 260, 50, 14);
    bg.fillStyle(0x4a5064, 1).fillRect(L.cx - 60, ay + 46, 120, 78).fillRoundedRect(L.cx - 122, ay + 126, 244, 38, 10);
    label(this, L.cx, L.top + 70, this.t('forge.title'), { size: 60, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 14);
    const cg = this.add.graphics();
    drawCoin(cg, L.cx - 50, L.top + 140, 20);
    this.coinText = label(this, L.cx - 20, L.top + 140, '', { size: 46, color: PALETTE.coin }).setOrigin(0, 0.5).setStroke(cssColor(PALETTE.ink), 10);
    this.nameText = label(this, L.cx, L.top + 220, '', { size: 56, color: PALETTE.gold }).setStroke(cssColor(PALETTE.ink), 14);
    this.dmgText = label(this, L.cx, L.top + 282, '', { size: 34, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 8);
    this.bowG = this.add.graphics();
    this.fxG = this.add.graphics().setDepth(5);
    // the hammer, raised to the right of the anvil
    this.hammer = this.add.container(L.cx + 170, ay - 40).setDepth(4);
    const hg = this.add.graphics();
    hg.fillStyle(PALETTE.ink, 1).fillRoundedRect(-9, -180, 18, 190, 8);
    hg.fillStyle(PALETTE.shaft, 1).fillRoundedRect(-5, -176, 10, 182, 5);
    hg.fillStyle(PALETTE.ink, 1).fillRoundedRect(-52, -224, 104, 60, 14);
    hg.fillStyle(0x8a93ab, 1).fillRoundedRect(-46, -218, 92, 48, 10);
    hg.fillStyle(PALETTE.white, 0.4).fillRoundedRect(-40, -214, 50, 12, 6);
    this.hammer.add(hg);
    this.hammer.setAngle(35);
    this.chanceText = label(this, L.cx, ay + 210, '', { size: 46, color: PALETTE.heal }).setStroke(cssColor(PALETTE.ink), 12).setDepth(6);
    this.heatG = this.add.graphics().setDepth(6);
    this.heatText = label(this, L.cx, ay + 300, '', { size: 30, color: PALETTE.heat }).setStroke(cssColor(PALETTE.ink), 8).setDepth(6);
    this.resultText = label(this, L.cx, L.cy - 300, '', { size: 76, color: PALETTE.gold }).setStroke(cssColor(PALETTE.ink), 18).setDepth(10).setAlpha(0);
    this.resultSub = label(this, L.cx, L.cy - 230, '', { size: 34, color: PALETTE.cream, wrap: 620 }).setStroke(cssColor(PALETTE.ink), 8).setDepth(10).setAlpha(0);
    label(this, L.cx, L.bottom - 270, this.t('forge.rules'), { size: 26, color: PALETTE.cream, wrap: 640 }).setAlpha(0.85);
    this.forgeBtn = fitButton(button(this, L.cx, L.bottom - 180, '', () => this.forge(), { width: 440, height: 104, fontSize: 42 }), 440);
    this.backBtn = button(this, L.cx, L.bottom - 70, this.t('forge.back'), () => this.back(), { width: 300, height: 92, variant: 'secondary', hotkey: 'ESC' });
    this.refresh();
  }

  private refresh(): void {
    const save = gameSave(this.oyun).data;
    const L = this.shownLevel;
    this.coinText.setText(String(save.coins));
    this.nameText.setText(this.t('bow.name', { name: this.t(`bow.${bowTier(L)}`), n: L }));
    const cost = bowCost(save.bow.level);
    if (cost === null) {
      this.dmgText.setText(`×${bowDamage(L).toFixed(2)}`);
      this.chanceText.setText(this.t('forge.max'));
      this.forgeBtn.setLabel(this.t('forge.max'));
      this.forgeBtn.setEnabled(false);
    } else {
      this.dmgText.setText(this.t('forge.dmg', { a: bowDamage(save.bow.level).toFixed(2), b: bowDamage(save.bow.level + 1).toFixed(2) }));
      const ch = forgeChance(save.bow.level, save.bow.heat);
      this.chanceText.setText(ch >= 1 ? this.t('forge.sure') : this.t('forge.chance', { n: Math.round(ch * 100) }));
      this.chanceText.setColor(cssColor(ch >= 0.75 ? PALETTE.heal : ch >= 0.4 ? PALETTE.coin : PALETTE.powerHigh));
      this.forgeBtn.setLabel(this.t('forge.go', { n: cost }));
      fitButton(this.forgeBtn, 440);
      this.forgeBtn.setEnabled(!this.busy && save.coins >= cost);
    }
    this.heatText.setText(this.shownHeat > 0 ? this.t('forge.heat', { n: Math.round(this.shownHeat * 100) }) : '');
  }

  private forge(): void {
    if (this.busy) return;
    let res: ForgeResult | null = null;
    const save = gameSave(this.oyun);
    const before = save.data.bow.level;
    save.update((d) => {
      res = attemptForge(d.bow, d);
      if (res.ok && res.success) unlockFeats(d, null);
    });
    const r = res as ForgeResult | null;
    if (!r || !r.ok) {
      this.oyun.audio.playPreset(SFX.cancel);
      this.refresh();
      return;
    }
    this.last = r;
    this.busy = true;
    this.forgeBtn.setEnabled(false);
    this.backBtn.setEnabled(false);
    this.oyun.platform.track('forge', { level: before, success: r.success, chance: r.chance });
    const L = this.layout;
    const ay = L.cy + 230;
    // 1. build-up: the bow rises and glows, the hearth hums
    this.oyun.audio.playPreset(SFX.charge);
    this.tweens.add({ targets: this, lift: 1, duration: 450, ease: 'Sine.easeOut' });
    // 2. three strikes, each harder
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(480 + i * 300, () => {
        this.tweens.add({ targets: this.hammer, angle: -60, duration: 90, ease: 'Quad.easeIn', yoyo: true, hold: 40 });
        this.time.delayedCall(90, () => {
          this.oyun.audio.playPreset(SFX.anvil, { pitch: i * 2 });
          this.flash = 0.6 + i * 0.2;
          this.shake = 6 + i * 4;
          this.cameras.main.shake(80, 0.004 + i * 0.002);
          this.spray(L.cx, ay - 50, 16 + i * 8, i === 2 ? auraColor(before + 1, this.clock) : PALETTE.fireCore);
          this.oyun.platform.haptic(i === 2 ? 'heavy' : 'medium');
        });
      });
    }
    // 3. the payoff
    this.time.delayedCall(1450, () => (r.success ? this.success(before) : this.fail()));
  }

  private success(before: number): void {
    const save = gameSave(this.oyun).data;
    const L = this.layout;
    const newTier = bowTier(save.bow.level) !== bowTier(before);
    this.shownLevel = save.bow.level;
    this.shownHeat = 0;
    this.flash = 1.4;
    this.dim = 0;
    this.oyun.audio.playPreset(SFX.fanfare);
    this.oyun.platform.haptic('success');
    this.juice.feedback('large', L.cx, L.cy - 20, auraColor(save.bow.level, this.clock));
    this.spray(L.cx, L.cy - 20, newTier ? 70 : 40, auraColor(save.bow.level, this.clock));
    if (newTier) this.spray(L.cx, L.cy - 20, 40, PALETTE.gold);
    this.reveal(this.t('forge.success'), newTier ? `${this.t('forge.newTier')} ${this.t(`bow.${bowTier(save.bow.level)}`)}` : this.t('bow.name', { name: this.t(`bow.${bowTier(save.bow.level)}`), n: save.bow.level }), PALETTE.gold);
    this.juice.pop(this.nameText, 1.4, 400);
    this.done();
  }

  private fail(): void {
    const save = gameSave(this.oyun).data;
    const L = this.layout;
    this.dim = 1;
    this.oyun.audio.playPreset(SFX.sizzle);
    this.oyun.platform.haptic('error');
    // steam and a wobble; the heat meter rises (the next try is easier)
    for (let i = 0; i < 14; i++) this.sparks.push({ x: L.cx + (Math.random() - 0.5) * 200, y: L.cy, vx: (Math.random() - 0.5) * 60, vy: -80 - Math.random() * 120, life: 1.2, c: 0xdddddd });
    this.shake = 10;
    this.tweens.add({ targets: this, shownHeat: save.bow.heat, duration: 700, ease: 'Cubic.easeOut', onUpdate: () => this.refresh() });
    this.reveal(this.t('forge.fail'), this.t('forge.failSub', { n: Math.round(HEAT_STEP * 100) }), PALETTE.locked);
    this.done();
  }

  private done(): void {
    this.tweens.add({ targets: this, lift: 0, duration: 600, delay: 600, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this, dim: 0, duration: 900, delay: 900 });
    this.time.delayedCall(1100, () => {
      this.busy = false;
      this.backBtn.setEnabled(true);
      this.refresh();
    });
    this.refresh();
  }

  private reveal(text: string, sub: string, color: number): void {
    this.tweens.killTweensOf([this.resultText, this.resultSub]);
    this.resultText.setText(text).setColor(cssColor(color)).setAlpha(1).setScale(2.2);
    this.resultSub.setText(sub).setAlpha(0);
    this.tweens.add({ targets: this.resultText, scale: 1, duration: 280, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.resultSub, alpha: 1, duration: 250, delay: 200 });
    this.tweens.add({ targets: [this.resultText, this.resultSub], alpha: 0, delay: 2200, duration: 400 });
  }

  private spray(x: number, y: number, n: number, c: number): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const sp = 200 + Math.random() * 520;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.6, c });
    }
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000;
    this.clock += dt;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 30);
    const L = this.layout;
    const g = this.bowG;
    g.clear();
    const lv = this.shownLevel;
    const bx = L.cx + (Math.random() - 0.5) * this.shake;
    const by = L.cy - 10 - this.lift * 40 + Math.sin(this.clock * 1.6) * 8;
    // glow under the bow, brighter while it is worked
    const col = auraColor(lv, this.clock);
    g.fillStyle(lv >= 3 ? col : PALETTE.heat, 0.12 + this.lift * 0.25).fillCircle(bx, by, 150 + this.lift * 40);
    drawBowItem(g, bx, by, 150, lv, this.clock, this.flash);
    if (this.dim > 0) g.fillStyle(0x2a1622, 0.45 * this.dim).fillCircle(bx, by, 170);
    // heat meter: a bar of flames, full = sure success
    const h = this.heatG;
    h.clear();
    const save = gameSave(this.oyun).data;
    if (bowCost(save.bow.level) !== null && save.bow.level < BOW_MAX) {
      const hx = L.cx - 200;
      const hy = L.cy + 480;
      h.fillStyle(PALETTE.ink, 1).fillRoundedRect(hx - 6, hy - 18, 412, 36, 18);
      h.fillStyle(PALETTE.hpBack, 1).fillRoundedRect(hx, hy - 12, 400, 24, 12);
      const k = Math.min(1, this.shownHeat / Math.max(0.01, 1 - forgeChance(save.bow.level, 0) + 0.0001));
      if (this.shownHeat > 0) h.fillStyle(PALETTE.heat, 1).fillRoundedRect(hx, hy - 12, Math.max(24, 400 * k), 24, 12);
      for (let i = 0; i < 5; i++) {
        const fx = hx + 400 * k * ((i + 0.5) / 5);
        const fl = 6 + Math.sin(this.clock * 12 + i) * 3;
        if (this.shownHeat > 0) h.fillStyle(PALETTE.fireCore, 0.8).fillCircle(fx, hy - 14, fl);
      }
    }
    // sparks
    const f = this.fxG;
    f.clear();
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy += 900 * dt * (s.c === 0xdddddd ? -0.1 : 1);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      f.fillStyle(s.c, Math.min(1, s.life * 2)).fillCircle(s.x, s.y, s.c === 0xdddddd ? 14 * (1.4 - s.life) : 4);
    }
  }

  private back(): void {
    if (this.busy) return;
    this.goTo(this.from === 'shop' ? SCENES.shop : SCENES.game, {});
  }

  protected override testState() {
    const save = gameSave(this.oyun).data;
    const cost = bowCost(save.bow.level);
    return {
      level: save.bow.level,
      heat: save.bow.heat,
      chance: forgeChance(save.bow.level, save.bow.heat),
      cost: cost ?? -1,
      coins: save.coins,
      busy: this.busy,
      shown: this.shownLevel,
      last: this.last && this.last.ok ? (this.last.success ? 'success' : 'fail') : '',
    };
  }

  protected override testActions() {
    return {
      forge: () => this.forgeBtn.fire(),
      back: () => this.backBtn.fire(),
    };
  }
}

function mix(a: number, b: number, k: number): number {
  const m = (s: number) => Math.round(((a >> s) & 0xff) + (((b >> s) & 0xff) - ((a >> s) & 0xff)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
