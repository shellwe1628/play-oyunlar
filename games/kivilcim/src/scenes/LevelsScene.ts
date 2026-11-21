/**
 * Level select: four worlds of ten, one world per page (tabs), cards in each level's colours
 * with stars and best %, the boss card crowned, star gates on worlds. Test actions: pick, world,
 * back.
 */
import { OyunScene, toast, touchHitSize } from '@oyun/core';
import Phaser from 'phaser';
import { Backdrop } from '../render/Backdrop';
import { ensureCanvasArt } from '../render/canvasArt';
import { ensureWorldArt, MOTIFS } from '../render/worldArt';
import { gameSave } from '../save';
import { totalStars, worldStars, WORLD_STAR_REQ } from '../sim/meta';
import { levelInfo, WORLD_COUNT, WORLD_SIZE, worldOf } from '../sim/levels';
import { levelOpen, levelToPlay, worldUnlocked } from '../sim/progress';
import { PALETTE, PALETTES } from '../textures';
import { bigText, fitText, IconTile } from '../ui';
import type { GameStart } from './GameScene';
import { SCENES } from './keys';

const WORLD_COLORS = [0xff7a1a, 0x3ff6ff, 0x9dff3a, 0xc35bff] as const;

export class LevelsScene extends OyunScene {
  private backdrop!: Backdrop;
  private back!: IconTile;
  private cards: Phaser.GameObjects.Container[] = [];
  private previews: Phaser.GameObjects.TileSprite[] = [];
  private tabs: Phaser.GameObjects.Container[] = [];
  private page!: Phaser.GameObjects.Container;
  private gateText!: Phaser.GameObjects.Text;
  private worldTitle!: Phaser.GameObjects.Text;
  private world = 1;
  private t0 = 0;
  private lockedTaps = 0;

  constructor() {
    super(SCENES.levels);
  }

  create(): void {
    ensureCanvasArt(this);
    ensureWorldArt(this);
    const L = this.layout;
    this.cards = [];
    this.previews = [];
    this.tabs = [];
    this.backdrop = new Backdrop(this, PALETTES[7]!, L.width, L.height);
    fitText(bigText(this, L.cx, L.top + 70, this.t('levels.title'), 70), 2 * (L.right - 210 - L.cx));
    this.back = new IconTile(this, L.left + 70, L.top + 70, 'ic-back', null, () => this.goHome(), { radius: 46 });
    const save = gameSave(this.oyun).data;
    bigText(this, L.right - 110, L.top + 72, `${save.gems}`, 44, PALETTE.gem);
    this.add.image(L.right - 170, L.top + 72, 'gem').setScale(0.6);
    // Star total under the title.
    this.add.image(L.cx - 52, L.top + 138, 'star-on').setScale(0.8);
    bigText(this, L.cx + 18, L.top + 138, `${totalStars(save)}`, 38, PALETTE.gold);

    // World tabs.
    const tw = Math.min(160, (L.width - 60) / WORLD_COUNT);
    for (let w = 1; w <= WORLD_COUNT; w++) {
      const x = L.cx + (w - (WORLD_COUNT + 1) / 2) * tw;
      const g = this.add.graphics();
      const label = bigText(this, 0, -8, this.t('world.n', { n: w }), 28);
      fitText(label, tw - 18, 28);
      const stars = bigText(this, 0, 22, `★ ${worldStars(save, w)}/30`, 24, PALETTE.gold);
      const lock = this.add.image(tw / 2 - 26, -26, 'ic-lock').setScale(0.38).setVisible(!worldUnlocked(save, w));
      const tab = this.add.container(x, L.top + 210, [g, label, stars, lock]);
      tab.setData('g', g);
      const hit = touchHitSize(tw - 8, 80);
      tab.setSize(hit.width, hit.height).setInteractive({ useHandCursor: true });
      tab.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.showWorld(w));
      this.tabs.push(tab);
    }
    this.worldTitle = bigText(this, L.cx, L.top + 290, '', 40, PALETTE.white);
    this.gateText = bigText(this, L.cx, L.top + 330, '', 30, 0xffb3c0);
    this.page = this.add.container(0, 0);
    this.showWorld(worldOf(levelToPlay(save)));
  }

  private showWorld(w: number): void {
    this.world = w;
    const L = this.layout;
    const save = gameSave(this.oyun).data;
    this.oyun.audio.play('tap');
    this.tabs.forEach((tab, i) => {
      const g = tab.getData('g') as Phaser.GameObjects.Graphics;
      const tw = Math.min(160, (L.width - 60) / WORLD_COUNT);
      const on = i + 1 === w;
      g.clear();
      g.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(-tw / 2 + 4, -36 + 6, tw - 8, 76, 22);
      g.fillStyle(on ? WORLD_COLORS[i]! : PALETTE.ui, on ? 0.9 : 1).fillRoundedRect(-tw / 2 + 4, -36, tw - 8, 76, 22);
      g.lineStyle(on ? 6 : 3, 0xffffff, on ? 1 : 0.5).strokeRoundedRect(-tw / 2 + 4, -36, tw - 8, 76, 22);
      tab.setScale(on ? 1.05 : 1);
    });
    fitText(this.worldTitle.setText(`${this.t('world.n', { n: w })} · ${this.t(`world.${w}` as 'world.1')}`), L.width - 60, 40);
    const open = worldUnlocked(save, w);
    let gate = '';
    if (!open) {
      const boss = (w - 1) * WORLD_SIZE;
      gate = save.levels[boss - 1]?.done ? this.t('world.needStars', { n: WORLD_STAR_REQ[w - 1]!, m: totalStars(save) }) : this.t('world.needBoss', { n: boss });
    }
    fitText(this.gateText.setText(gate), L.width - 60, 30);

    this.page.removeAll(true);
    this.cards = [];
    this.previews = [];
    const cw = 300;
    const ch = 158;
    const gapX = 30;
    const gapY = 20;
    const top = L.top + 368;
    for (let i = 0; i < WORLD_SIZE; i++) {
      const id = (w - 1) * WORLD_SIZE + i + 1;
      const info = levelInfo(id);
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = L.cx + (col === 0 ? -1 : 1) * (cw / 2 + gapX / 2);
      const y = top + row * (ch + gapY) + ch / 2;
      const pal = PALETTES[info.theme]!;
      const rec = save.levels[id - 1]!;
      const locked = !levelOpen(save, id);
      // Each card is a little window into its level's world, alive even when locked (dimmed).
      const dim = (c: number): number => (locked ? Phaser.Display.Color.GetColor(((c >> 16) & 255) * 0.5, ((c >> 8) & 255) * 0.5, (c & 255) * 0.5) : c);
      const g = this.add.graphics();
      g.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(-cw / 2, -ch / 2 + 8, cw, ch, 30);
      g.fillStyle(dim(pal.top), 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 30);
      g.fillStyle(dim(pal.bottom), 1).fillRoundedRect(-cw / 2, 0, cw, ch / 2, { tl: 0, tr: 0, bl: 30, br: 30 });
      const motif = MOTIFS[info.theme % MOTIFS.length]!;
      const preview = this.add
        .tileSprite(0, 0, cw - 20, ch - 20, `wp-${motif}`)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(locked ? 0.22 : 0.45);
      this.previews.push(preview);
      const frame = this.add.graphics();
      frame.lineStyle(info.boss ? 9 : 6, info.boss ? PALETTE.gold : locked ? dim(pal.edge) : pal.edge, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 30);
      const parts: Phaser.GameObjects.GameObject[] = [g, preview, frame];
      parts.push(bigText(this, -cw / 2 + 64, -6, `${id}`, id >= 10 ? 70 : 80));
      if (info.boss) parts.push(this.add.image(-cw / 2 + 64, -62, 'ic-crown').setScale(0.55).setTint(PALETTE.gold));
      if (info.intro) parts.push(bigText(this, -cw / 2 + 64, 54, this.t('levels.new'), 22, PALETTE.gold));
      if (locked) {
        parts.push(this.add.image(cw / 2 - 70, -6, 'ic-lock').setScale(0.9));
      } else {
        parts.push(bigText(this, cw / 2 - 76, -30, rec.done ? '100%' : this.t('levels.best', { n: rec.best }), 40, rec.done ? PALETTE.gold : PALETTE.white));
        for (let k = 0; k < 3; k++) parts.push(this.add.image(cw / 2 - 124 + k * 46, 34, rec.stars & (1 << k) ? 'star-on' : 'star-off').setScale(0.8));
      }
      const card = this.add.container(x, y, parts);
      const hit = touchHitSize(cw, ch);
      card.setSize(hit.width, hit.height);
      card.setInteractive({ useHandCursor: true });
      card.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.pick(id));
      card.setData('id', id);
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: locked ? 0.85 : 1, delay: i * 25, duration: 240, ease: 'Back.easeOut' });
      this.page.add(card);
      this.cards.push(card);
    }
  }

  override update(_t: number, delta: number): void {
    this.t0 += delta;
    for (let i = 0; i < this.previews.length; i++) {
      const p = this.previews[i]!;
      p.tilePositionY -= delta * (0.04 + i * 0.006);
      p.tilePositionX += delta * 0.01 * (i % 2 ? 1 : -1);
    }
    this.backdrop.update(0.5 + 0.5 * Math.sin(this.t0 / 3000), delta * 0.12, Math.pow(1 - ((this.t0 / 500) % 1), 3), 400, delta / 1000);
  }

  private pick(id: number): void {
    const save = gameSave(this.oyun).data;
    if (!levelOpen(save, id)) {
      // Locked: shake the card and say what opens it.
      const card = this.cards.find((c) => c.getData('id') === id);
      if (card) {
        this.tweens.killTweensOf(card);
        card.setScale(1);
        this.tweens.add({ targets: card, x: card.x + 14, yoyo: true, repeat: 3, duration: 45 });
      }
      this.oyun.audio.play('hit', { volume: 0.4 });
      this.oyun.platform.haptic('error');
      const w = worldOf(id);
      const msg = !worldUnlocked(save, w) && save.levels[(w - 1) * WORLD_SIZE - 1]?.done ? this.t('world.needStars', { n: WORLD_STAR_REQ[w - 1]!, m: totalStars(save) }) : this.t('levels.locked', { n: Math.min(id - 1, save.unlocked) });
      toast(this, msg);
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
    return { unlocked: save.unlocked, cards: this.cards.length, lockedTaps: this.lockedTaps, world: this.world, stars: totalStars(save) };
  }

  protected override testActions() {
    return {
      pick: (p: unknown) => this.pick(Number(p)),
      world: (p: unknown) => this.showWorld(Math.min(WORLD_COUNT, Math.max(1, Number(p)))),
      back: () => this.back.fire(),
    };
  }
}
