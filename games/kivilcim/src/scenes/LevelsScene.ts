/** Level select: ten cards in each level's colours, best %, gems, locks. Test actions: pick, back. */
import { OyunScene, toast, touchHitSize } from '@oyun/core';
import Phaser from 'phaser';
import { Backdrop } from '../render/Backdrop';
import { ensureCanvasArt } from '../render/canvasArt';
import { gameSave } from '../save';
import { LEVEL_COUNT, levelInfo } from '../sim/levels';
import { PALETTE, PALETTES } from '../textures';
import { bigText, fitText, IconTile } from '../ui';
import type { GameStart } from './GameScene';
import { SCENES } from './keys';

export class LevelsScene extends OyunScene {
  private backdrop!: Backdrop;
  private back!: IconTile;
  private cards: Phaser.GameObjects.Container[] = [];
  private t0 = 0;
  private lockedTaps = 0;

  constructor() {
    super(SCENES.levels);
  }

  create(): void {
    ensureCanvasArt(this);
    const L = this.layout;
    this.cards = [];
    this.backdrop = new Backdrop(this, PALETTES[7]!, L.width, L.height);
    fitText(bigText(this, L.cx, L.top + 80, this.t('levels.title'), 76), 2 * (L.right - 210 - L.cx));
    this.back = new IconTile(this, L.left + 70, L.top + 76, 'ic-back', null, () => this.goHome(), { radius: 46 });
    const save = gameSave(this.oyun).data;
    bigText(this, L.right - 110, L.top + 78, `${save.gems}`, 44, PALETTE.gem);
    this.add.image(L.right - 170, L.top + 78, 'gem').setScale(0.6);

    const cw = 300;
    const ch = 176;
    const gapX = 30;
    const gapY = 26;
    const top = L.top + 190;
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const id = i + 1;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = L.cx + (col === 0 ? -1 : 1) * (cw / 2 + gapX / 2);
      const y = top + row * (ch + gapY) + ch / 2;
      const pal = PALETTES[levelInfo(id).theme]!;
      const rec = save.levels[i]!;
      const locked = id > save.unlocked;
      const g = this.add.graphics();
      g.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(-cw / 2, -ch / 2 + 8, cw, ch, 30);
      g.fillStyle(locked ? 0x5a4a7a : pal.top, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 30);
      g.fillStyle(locked ? 0x3e3260 : pal.bottom, 1).fillRoundedRect(-cw / 2, 0, cw, ch / 2, { tl: 0, tr: 0, bl: 30, br: 30 });
      g.lineStyle(6, locked ? 0x9a8ac0 : pal.edge, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 30);
      const parts: Phaser.GameObjects.GameObject[] = [g];
      parts.push(bigText(this, -cw / 2 + 64, -6, `${id}`, 84));
      if (locked) {
        parts.push(this.add.image(cw / 2 - 70, -6, 'ic-lock').setScale(0.9));
      } else {
        parts.push(bigText(this, cw / 2 - 72, -34, rec.done ? '100%' : this.t('levels.best', { n: rec.best }), 42, rec.done ? PALETTE.gold : PALETTE.white));
        for (let k = 0; k < 3; k++) {
          parts.push(this.add.image(cw / 2 - 122 + k * 46, 34, rec.gemMask & (1 << k) ? 'gem' : 'gem-empty').setScale(0.55));
        }
      }
      const card = this.add.container(x, y, parts);
      const hit = touchHitSize(cw, ch);
      card.setSize(hit.width, hit.height);
      card.setInteractive({ useHandCursor: true });
      card.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.pick(id));
      card.setData('id', id);
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: locked ? 0.75 : 1, delay: i * 30, duration: 260, ease: 'Back.easeOut' });
      this.cards.push(card);
    }
  }

  override update(_t: number, delta: number): void {
    this.t0 += delta;
    this.backdrop.update(0.5 + 0.5 * Math.sin(this.t0 / 3000), delta * 0.12, Math.pow(1 - ((this.t0 / 500) % 1), 3), 400, delta / 1000);
  }

  private pick(id: number): void {
    const unlocked = gameSave(this.oyun).data.unlocked;
    if (id > unlocked) {
      // Locked: shake the card and say what opens it.
      const card = this.cards[id - 1];
      if (card) {
        this.tweens.killTweensOf(card);
        card.setScale(1);
        this.tweens.add({ targets: card, x: card.x + 14, yoyo: true, repeat: 3, duration: 45 });
      }
      this.oyun.audio.play('hit', { volume: 0.4 });
      this.oyun.platform.haptic('error');
      toast(this, this.t('levels.locked', { n: unlocked }));
      this.lockedTaps++;
      return;
    }
    this.oyun.audio.play('tap');
    this.oyun.platform.haptic('light');
    this.scene.start(SCENES.game, { mode: 'level', level: id, phase: 'ready' } satisfies GameStart);
  }

  private goHome(): void {
    this.scene.start(SCENES.game, { phase: 'title' } satisfies GameStart);
  }

  protected override testState() {
    const save = gameSave(this.oyun).data;
    return { unlocked: save.unlocked, cards: this.cards.length, lockedTaps: this.lockedTaps };
  }

  protected override testActions() {
    return {
      pick: (p: unknown) => this.pick(Number(p)),
      back: () => this.back.fire(),
    };
  }
}
