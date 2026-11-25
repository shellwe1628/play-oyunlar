import { getContext, iconButton, label, OyunScene, touchHitSize } from '@oyun/core';
import Phaser from 'phaser';
import { gameSave } from '../save';
import { CAMPAIGN, dailyLevel, dateKey, levelMap, type LevelDef } from '../sim/campaign';
import { isUnlocked, liveStreak } from '../sim/progress';
import { PALETTE } from '../textures';
import { cpuCanvasTexture } from '../view/inkmap';
import { drawDesk } from './Background';
import { formatTime } from './GameScene';
import { SCENES } from './keys';

/** A tappable card: fires on release inside, like core buttons. */
function card(scene: Phaser.Scene, x: number, y: number, w: number, h: number, onTap: () => void): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const hit = touchHitSize(w, h);
  c.setSize(hit.width, hit.height).setInteractive({ useHandCursor: true });
  let pressed = false;
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
    pressed = true;
    getContext(scene.game).audio.unlock();
    scene.tweens.add({ targets: c, scale: 0.96, duration: 70 });
  });
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
    if (pressed) scene.tweens.add({ targets: c, scale: 1, duration: 90 });
    pressed = false;
  });
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    if (!pressed) return;
    pressed = false;
    scene.tweens.add({ targets: c, scale: 1, duration: 120, ease: 'Back.easeOut' });
    onTap();
  });
  return c;
}

/**
 * Campaign sheet select (8 sheets, stars, locks) + the daily sheet card.
 * Test actions: sheet {index}, daily, back. Test state: stars, unlocked.
 */
export class MapSelectScene extends OyunScene {
  private taps: (() => void)[] = [];
  private dailyTap: () => void = () => undefined;
  private backButton!: ReturnType<typeof iconButton>;
  /** Thumbnail jobs, one per frame after the cards are up (generating sheets takes time). */
  private jobs: (() => void)[] = [];

  constructor() {
    super(SCENES.maps);
  }

  create(): void {
    const L = this.layout;
    drawDesk(this);
    const save = gameSave(this.oyun).data;
    this.backButton = iconButton(this, L.left + 64, L.top + 64, 'home', () => this.goTo(SCENES.menu));
    label(this, L.cx, L.top + 64, this.t('maps.title'), { size: 60 });

    this.taps = [];
    this.jobs = [];
    const cw = 324;
    const ch = 196;
    const gapY = 16;
    const top = L.top + 150;
    CAMPAIGN.forEach((def, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = L.cx + (col === 0 ? -1 : 1) * (cw / 2 + 8);
      const y = top + ch / 2 + row * (ch + gapY);
      const open = isUnlocked(save, i);
      const tap = (): void => {
        if (!open) {
          this.oyun.audio.play('hit', { volume: 0.3 });
          return;
        }
        this.oyun.audio.play('tap');
        this.goTo(SCENES.game, { level: def.id });
      };
      this.taps.push(tap);
      const c = card(this, x, y, cw, ch, tap);
      this.drawSheetCard(c, def, i, cw, ch, open, save.stars[i] ?? 0, save.bestSeconds[i] ?? 0);
      this.juice.pop(c, 0.3, 200 + i * 30);
    });

    // Daily card.
    const today = dateKey(new Date());
    const daily = dailyLevel(today);
    const dy = top + 4 * (ch + gapY) + 84;
    const dw = cw * 2 + 16;
    const dh = 150;
    this.dailyTap = () => {
      this.oyun.audio.play('tap');
      this.goTo(SCENES.game, { level: 'daily', date: today });
    };
    const dc = card(this, L.cx, Math.min(dy, L.bottom - dh / 2 - 16), dw, dh, this.dailyTap);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.paperShadow, 0.5).fillRoundedRect(-dw / 2, -dh / 2 + 8, dw, dh, 22);
    g.fillStyle(PALETTE.inks[3]!, 1).fillRoundedRect(-dw / 2, -dh / 2, dw, dh, 22);
    g.fillStyle(PALETTE.shine, 0.14).fillRoundedRect(-dw / 2 + 10, -dh / 2 + 8, dw - 20, dh * 0.35, 16);
    dc.add(g);
    this.jobs.push(() => dc.addAt(this.thumbnail(levelMap(daily), -dw / 2 + 70, 0, 96, 126, true), 1));
    const best = save.dailyDate === today && save.dailyBest > 0 ? this.t('maps.dailyBest', { t: formatTime(save.dailyBest) }) : this.t('maps.dailyNone');
    dc.add(label(this, -dw / 2 + 140, -36, this.t('maps.daily', { date: today }), { size: 36, color: PALETTE.dailyInk }).setOrigin(0, 0.5));
    dc.add(label(this, -dw / 2 + 140, 8, best, { size: 30, color: PALETTE.dailyInkSoft }).setOrigin(0, 0.5));
    dc.add(label(this, -dw / 2 + 140, 46, this.t('maps.streak', { n: liveStreak(save, today) }), { size: 30, color: PALETTE.dailyInkSoft }).setOrigin(0, 0.5));
  }

  private drawSheetCard(c: Phaser.GameObjects.Container, def: LevelDef, i: number, w: number, h: number, open: boolean, stars: number, best: number): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE.paperShadow, 0.5).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 22);
    g.fillStyle(open ? PALETTE.deskLight : PALETTE.cardLocked, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    g.lineStyle(3, open ? PALETTE.cardEdge : PALETTE.cardEdgeLocked, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    c.add(g);
    this.jobs.push(() => c.addAt(this.thumbnail(levelMap(def), -w / 2 + 66, 0, 100, 150, open), 1));
    const tx = -w / 2 + 132;
    c.add(label(this, tx, -h / 2 + 40, this.t('maps.sheet', { n: i + 1 }), { size: 38, color: open ? PALETTE.text : PALETTE.textDim }).setOrigin(0, 0.5));
    if (!open) {
      c.add(this.add.image(tx + 34, -4, 'lock').setTint(PALETTE.textDim).setScale(0.7));
      c.add(label(this, tx, 58, this.t('maps.locked'), { size: 27, color: PALETTE.textDim, wrap: w - 140, align: 'left' }).setOrigin(0, 0.5));
      return;
    }
    c.add(label(this, tx, -h / 2 + 82, this.t('maps.rivals', { n: def.bots.length }), { size: 26, color: PALETTE.textDim }).setOrigin(0, 0.5));
    for (let s = 0; s < 3; s++) {
      c.add(
        this.add
          .image(tx + 24 + s * 56, 22, 'star')
          .setScale(0.72)
          .setTint(s < stars ? PALETTE.starOn : PALETTE.starOff),
      );
    }
    if (best > 0) c.add(label(this, tx, 72, this.t('maps.best', { t: formatTime(best) }), { size: 26, color: PALETTE.textDim }).setOrigin(0, 0.5));
  }

  override update(): void {
    this.jobs.shift()?.();
  }

  /** Small silhouette of a sheet with its start spots (as a canvas texture). */
  private thumbnail(map: ReturnType<typeof levelMap>, x: number, y: number, maxW: number, maxH: number, open: boolean): Phaser.GameObjects.Image {
    const key = `thumb-${map.id}`;
    if (!this.textures.exists(key)) {
      const tex = cpuCanvasTexture(this, key, map.width, map.height);
      const ctx = tex.getContext();
      const img = ctx.createImageData(map.width, map.height);
      for (let i = 0; i < map.land.length; i++) {
        if (!map.land[i]) continue;
        img.data[i * 4] = 0xf3;
        img.data[i * 4 + 1] = 0xec;
        img.data[i * 4 + 2] = 0xdd;
        img.data[i * 4 + 3] = 255;
      }
      // Starts are shuffled per match, so they are shown as neutral ink dots.
      map.starts.forEach((s) => {
        const col = PALETTE.grey;
        const sx = s % map.width;
        const sy = Math.floor(s / map.width);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const o = ((sy + dy) * map.width + sx + dx) * 4;
            img.data[o] = (col >> 16) & 255;
            img.data[o + 1] = (col >> 8) & 255;
            img.data[o + 2] = col & 255;
            img.data[o + 3] = 255;
          }
        }
      });
      ctx.putImageData(img, 0, 0);
      tex.refresh();
    }
    const scale = Math.min(maxW / map.width, maxH / map.height);
    return this.add.image(x, y, key).setScale(scale).setAlpha(open ? 1 : 0.35);
  }

  protected override testState() {
    const save = gameSave(this.oyun).data;
    return { stars: [...save.stars], unlocked: CAMPAIGN.map((_, i) => isUnlocked(save, i)) };
  }

  protected override testActions() {
    return {
      sheet: (p: unknown) => this.taps[(p as { index: number }).index]?.(),
      daily: () => this.dailyTap(),
      back: () => this.backButton.fire(),
    };
  }
}
