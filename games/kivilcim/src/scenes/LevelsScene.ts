/**
 * Level select: four worlds of ten, one world per page (tabs), cards in each level's colours
 * with stars and best %, the boss card crowned, star gates on worlds. Test actions: pick, world,
 * back.
 */
import { OyunScene, toast, touchHitSize } from '@oyun/core';
import Phaser from 'phaser';
import { Backdrop } from '../render/Backdrop';
import { ensureCanvasArt } from '../render/canvasArt';
import { countUp, drawHalo, enter, isCalm, Motes, pressable, wipeIn, wipeTo } from '../render/menuFx';
import { ensureWorldArt, MOTIFS } from '../render/worldArt';
import { gameSave } from '../save';
import { totalStars, worldStars, WORLD_STAR_REQ } from '../sim/meta';
import { levelInfo, WORLD_COUNT, WORLD_SIZE, worldOf } from '../sim/levels';
import { levelOpen, levelToPlay, worldUnlocked } from '../sim/progress';
import { PALETTE, PALETTES } from '../textures';
import { bigText, fitText, IconTile } from '../ui';
import type { GameStart } from './GameScene';
import { SCENES, UNLOCKED_KEY } from './keys';

const WORLD_COLORS = [0xff7a1a, 0x3ff6ff, 0x9dff3a, 0xc35bff] as const;

export class LevelsScene extends OyunScene {
  private backdrop!: Backdrop;
  private motes!: Motes;
  private tabGlow!: Phaser.GameObjects.Image;
  private focusGlow: Phaser.GameObjects.Graphics | null = null;
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
    this.t0 = 0;
    this.cards = [];
    this.previews = [];
    this.tabs = [];
    this.backdrop = new Backdrop(this, PALETTES[7]!, L.width, L.height);
    this.motes = new Motes(this, L.width, L.height, PALETTES[7]!.edge);
    this.world = 0;
    this.focusGlow = null;
    const title = fitText(bigText(this, L.cx, L.top + 70, this.t('levels.title'), 70), 2 * (L.right - 210 - L.cx));
    enter(this, title, { dy: -50, duration: 380, ease: 'Back.easeOut' });
    this.back = new IconTile(this, L.left + 70, L.top + 70, 'ic-back', null, () => this.goHome(), { radius: 46 });
    const save = gameSave(this.oyun).data;
    const wallet = bigText(this, L.right - 110, L.top + 72, `${save.gems}`, 44, PALETTE.gem);
    const walletGem = this.add.image(L.right - 170, L.top + 72, 'gem').setScale(0.6);
    enter(this, wallet, { dx: 60, delay: 120 });
    enter(this, walletGem, { dx: 60, delay: 120 });
    // Star total under the title: the star spins in, the number counts up.
    const starIcon = this.add.image(L.cx - 52, L.top + 138, 'star-on').setScale(0.8);
    const starText = bigText(this, L.cx + 18, L.top + 138, `${totalStars(save)}`, 38, PALETTE.gold);
    enter(this, starIcon, { scale: 0.2, delay: 160, duration: 420, ease: 'Back.easeOut' });
    enter(this, starText, { dy: 12, delay: 160 });
    countUp(this, starText, 0, totalStars(save), (n) => `${n}`, 600, 200);
    if (!isCalm(this)) {
      starIcon.setAngle(-180);
      this.tweens.add({ targets: starIcon, angle: 0, delay: 160, duration: 520, ease: 'Cubic.easeOut' });
    }
    // The light under the active world tab (it slides from tab to tab).
    this.tabGlow = this.add.image(L.cx, L.top + 254, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(150, 40).setAlpha(0.9);

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
      pressable(this, tab, () => this.showWorld(w));
      this.tabs.push(tab);
    }
    this.worldTitle = bigText(this, L.cx, L.top + 290, '', 40, PALETTE.white);
    this.gateText = bigText(this, L.cx, L.top + 330, '', 30, 0xffb3c0);
    this.page = this.add.container(0, 0);
    this.showWorld(worldOf(levelToPlay(save)));
    // Tabs drop in one after another (after showWorld has sized the active one).
    this.tabs.forEach((tab, i) => enter(this, tab, { dy: -26, delay: 120 + i * 45, duration: 300, ease: 'Back.easeOut' }));
    wipeIn(this);
  }

  private showWorld(w: number): void {
    // Cards come in from the side the new world lies on (from below on the first visit).
    const dir = this.world === 0 ? 0 : Math.sign(w - this.world);
    const first = this.world === 0;
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
      tab.setData('rest', on ? 1.05 : 1);
      if (!this.tweens.isTweening(tab)) tab.setScale(on ? 1.05 : 1);
    });
    const tabX = this.tabs[w - 1]!.x;
    this.tabGlow.setTint(WORLD_COLORS[w - 1]);
    this.tweens.killTweensOf(this.tabGlow);
    if (first || isCalm(this)) this.tabGlow.setX(tabX);
    else this.tweens.add({ targets: this.tabGlow, x: tabX, duration: 260, ease: 'Back.easeOut' });
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
    this.focusGlow = null;
    const playNext = levelToPlay(save);
    const fresh = isCalm(this) ? -1 : ((this.registry.get(UNLOCKED_KEY) as number | undefined) ?? -1);
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
      // A level the last finish unlocked: its lock shakes, pops off and the card lights up (once).
      const unlocking = !locked && id === fresh && !rec.done;
      const reveal: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [];
      if (locked) {
        parts.push(this.add.image(cw / 2 - 70, -6, 'ic-lock').setScale(0.9));
      } else {
        const bestText = bigText(this, cw / 2 - 76, -30, rec.done ? '100%' : this.t('levels.best', { n: rec.best }), 40, rec.done ? PALETTE.gold : PALETTE.white);
        parts.push(bestText);
        reveal.push(bestText);
        for (let k = 0; k < 3; k++) {
          const lit = (rec.stars & (1 << k)) !== 0;
          const star = this.add.image(cw / 2 - 124 + k * 46, 34, lit ? 'star-on' : 'star-off').setScale(0.8);
          parts.push(star);
          reveal.push(star);
          // Earned stars pop in one after another once the card has landed.
          if (lit && !isCalm(this)) {
            star.setScale(0);
            this.tweens.add({ targets: star, scale: 0.8, delay: 200 + i * 28 + k * 70, duration: 300, ease: 'Back.easeOut' });
          }
        }
      }
      const card = this.add.container(x, y, parts);
      const hit = touchHitSize(cw, ch);
      card.setSize(hit.width, hit.height);
      card.setInteractive({ useHandCursor: true });
      pressable(this, card, () => this.pick(id));
      card.setData('id', id);
      card.setAlpha(locked ? 0.85 : 1);
      if (id === playNext && !locked) {
        // The level to play next wears a breathing halo, so the eye lands on it first.
        this.focusGlow = drawHalo(this.add.graphics({ x, y }).setBlendMode(Phaser.BlendModes.ADD), cw, ch, 30, pal.edge).setAlpha(0);
        this.page.add(this.focusGlow);
      }
      enter(this, card, { dx: dir * 90, dy: dir === 0 ? 50 : 0, scale: 0.8, delay: i * 28, duration: 300, ease: 'Back.easeOut' });
      this.page.add(card);
      this.cards.push(card);
      if (unlocking) {
        this.registry.remove(UNLOCKED_KEY);
        for (const o of reveal) o.setAlpha(0);
        const lock = this.add.image(cw / 2 - 70, -6, 'ic-lock').setScale(0.9);
        const ring = this.add.image(cw / 2 - 70, -6, 'ring-burst').setBlendMode(Phaser.BlendModes.ADD).setTint(pal.edge).setScale(0.1).setAlpha(0);
        card.add([ring, lock]);
        const at = 520 + i * 28;
        this.tweens.add({ targets: lock, angle: 14, yoyo: true, repeat: 3, delay: at, duration: 55, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: lock, scale: 1.9, alpha: 0, angle: -25, delay: at + 460, duration: 280, ease: 'Cubic.easeOut', onComplete: () => lock.destroy() });
        this.tweens.add({ targets: ring, scale: 0.9, alpha: 0, delay: at + 460, duration: 380, ease: 'Cubic.easeOut', onStart: () => ring.setAlpha(0.9), onComplete: () => ring.destroy() });
        this.tweens.add({ targets: reveal, alpha: 1, delay: at + 520, duration: 240 });
        this.time.delayedCall(at + 460, () => {
          if (!card.active) return;
          this.oyun.audio.play('coin', { pitch: 8 });
          this.oyun.platform.haptic('light');
          this.juice.burst(x + cw / 2 - 70, y - 6, { count: 10, color: PALETTE.gold, texture: 'oyun-star', distance: 110, duration: 420 });
        });
      }
    }
  }

  override update(_t: number, delta: number): void {
    this.t0 += delta;
    for (let i = 0; i < this.previews.length; i++) {
      const p = this.previews[i]!;
      p.tilePositionY -= delta * (0.04 + i * 0.006);
      p.tilePositionX += delta * 0.01 * (i % 2 ? 1 : -1);
    }
    const pulse = Math.pow(1 - ((this.t0 / 500) % 1), 3);
    this.backdrop.update(0.5 + 0.5 * Math.sin(this.t0 / 3000), delta * 0.12, pulse, 400, delta / 1000);
    this.motes.update(delta / 1000, pulse);
    this.tabGlow.setAlpha(0.65 + 0.3 * pulse);
    if (this.focusGlow) this.focusGlow.setAlpha(Math.min(1, this.t0 / 600) * (0.6 + 0.4 * Math.sin(this.t0 / 320)));
  }

  private pick(id: number): void {
    const save = gameSave(this.oyun).data;
    if (!levelOpen(save, id)) {
      // Locked: shake the card and say what opens it.
      const card = this.cards.find((c) => c.getData('id') === id);
      if (card) {
        this.tweens.killTweensOf(card);
        const restX = (card.getData('restX') as number | undefined) ?? card.x;
        card.setScale(1).setAlpha(0.85).setX(restX);
        this.tweens.add({ targets: card, x: restX + 14, yoyo: true, repeat: 3, duration: 45, onComplete: () => card.setX(restX) });
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
    wipeTo(this, SCENES.game, { mode: 'level', level: id, phase: 'ready' } satisfies GameStart);
  }

  private goHome(): void {
    wipeTo(this, SCENES.game, { phase: 'title' } satisfies GameStart);
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
