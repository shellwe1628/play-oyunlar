/** Skins: eight spark shapes and eight trails, bought with gems. Test actions: buy, back. */
import { OyunScene, toast, touchHitSize } from '@oyun/core';
import Phaser from 'phaser';
import { Backdrop } from '../render/Backdrop';
import { ensureCanvasArt } from '../render/canvasArt';
import { Trail } from '../render/Trail';
import { gameSave } from '../save';
import { buySkin, equipSkin, type SkinKind } from '../sim/progress';
import { SHAPES, TRAILS } from '../sim/skins';
import { PALETTE, PALETTES } from '../textures';
import { bigText, fitText, IconTile } from '../ui';
import type { GameStart } from './GameScene';
import { SCENES } from './keys';

export class SkinsScene extends OyunScene {
  private backdrop!: Backdrop;
  private back!: IconTile;
  private wallet!: Phaser.GameObjects.Text;
  private preview!: Phaser.GameObjects.Image;
  private previewGlow!: Phaser.GameObjects.Image;
  private trail!: Trail;
  private tiles: { kind: SkinKind; i: number; root: Phaser.GameObjects.Container; price: Phaser.GameObjects.Text; ring: Phaser.GameObjects.Graphics }[] = [];
  private t0 = 0;
  private px = 360;
  private py = 0;
  private pdir = 1;

  constructor() {
    super(SCENES.skins);
  }

  create(): void {
    ensureCanvasArt(this);
    const L = this.layout;
    this.tiles = [];
    this.backdrop = new Backdrop(this, PALETTES[2]!, L.width, L.height);
    // Title fits between the back button and the wallet in every language.
    fitText(bigText(this, L.cx, L.top + 80, this.t('skins.title'), 76), 2 * (L.right - 210 - L.cx));
    this.back = new IconTile(this, L.left + 70, L.top + 76, 'ic-back', null, () => this.scene.start(SCENES.game, { phase: 'title' } satisfies GameStart), { radius: 46 });
    this.add.image(L.right - 170, L.top + 78, 'gem').setScale(0.6);
    this.wallet = bigText(this, L.right - 110, L.top + 78, '', 44, PALETTE.gem);

    // Live preview on its own stage: the spark zigzags in place, drawing a short trail that
    // never reaches the tile grid.
    const stage = this.add.graphics().setDepth(0);
    stage.fillStyle(PALETTE.ink, 0.42).fillRoundedRect(L.cx - 250, L.top + 168, 500, 210, 40);
    stage.lineStyle(4, 0xffffff, 0.35).strokeRoundedRect(L.cx - 250, L.top + 168, 500, 210, 40);
    const pg = this.add.graphics().setDepth(1);
    this.trail = new Trail(pg);
    this.trail.length = 90;
    this.previewGlow = this.add.image(L.cx, L.top + 270, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(1.6).setDepth(2);
    this.preview = this.add.image(L.cx, L.top + 270, 'spark-0').setScale(1.3).setDepth(2);
    this.trail.reset(this.px, 0);

    const section = (kind: SkinKind, y0: number): void => {
      bigText(this, L.left + 130, y0 - 64, this.t(kind === 'shape' ? 'skins.shapes' : 'skins.trails'), 44, PALETTE.gold).setOrigin(0, 0.5);
      const list = kind === 'shape' ? SHAPES : TRAILS;
      for (let i = 0; i < list.length; i++) {
        const x = L.cx + ((i % 4) - 1.5) * 156;
        const y = y0 + Math.floor(i / 4) * 170 + 50;
        const ring = this.add.graphics();
        const parts: Phaser.GameObjects.GameObject[] = [ring];
        if (kind === 'shape') parts.push(this.add.image(0, -12, `spark-${i}`).setScale(0.95));
        else {
          const t = TRAILS[i]!;
          const sw = this.add.graphics();
          for (let k = 0; k < 6; k++) {
            const col = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(t.head), Phaser.Display.Color.ValueToColor(t.tail), 5, k);
            sw.lineStyle(14 - k * 1.5, Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1);
            sw.lineBetween(-36 + k * 12, (k % 2 ? 1 : -1) * 16 - 12, -24 + k * 12, (k % 2 ? -1 : 1) * 16 - 12);
          }
          if (t.id === 'rainbow') {
            sw.clear();
            [0xff3d5a, 0xffa53b, 0xffe14d, 0x9dff3a, 0x3ff6ff, 0x9b4dff].forEach((c, k) => {
              sw.lineStyle(10, c, 1).lineBetween(-40 + k * 14, -28, -30 + k * 14, 4);
            });
          }
          parts.push(sw);
        }
        const price = bigText(this, 0, 52, '', 30);
        parts.push(price);
        const root = this.add.container(x, y, parts);
        const hit = touchHitSize(136, 150);
        root.setSize(hit.width, hit.height).setInteractive({ useHandCursor: true });
        root.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.choose(kind, i));
        this.tiles.push({ kind, i, root, price, ring });
      }
    };
    section('shape', L.top + 470);
    section('trail', L.top + 880);
    this.refresh();
  }

  private refresh(): void {
    const d = gameSave(this.oyun).data;
    this.wallet.setText(`${d.gems}`);
    this.preview.setTexture(`spark-${d.skin.shape}`);
    const tr = TRAILS[d.skin.trail]!;
    this.trail.head0 = tr.head;
    this.trail.tail0 = tr.tail;
    this.trail.rainbow = tr.id === 'rainbow';
    this.previewGlow.setTint(tr.tail);
    for (const t of this.tiles) {
      const list = t.kind === 'shape' ? SHAPES : TRAILS;
      const owned = (t.kind === 'shape' ? d.skin.ownedShapes : d.skin.ownedTrails) & (1 << t.i);
      const on = (t.kind === 'shape' ? d.skin.shape : d.skin.trail) === t.i;
      const price = list[t.i]!.price;
      t.price.setText(on ? this.t('skins.equipped') : owned ? '' : `◆ ${price}`).setColor(on ? '#ffe14d' : price > d.gems && !owned ? '#ffb3c0' : '#ffffff');
      t.ring.clear();
      t.ring.fillStyle(PALETTE.ink, 0.55).fillRoundedRect(-68, -66, 136, 150, 26);
      t.ring.fillStyle(owned ? PALETTE.uiLight : PALETTE.ui, 1).fillRoundedRect(-68, -72, 136, 150, 26);
      t.ring.lineStyle(on ? 8 : 4, on ? PALETTE.gold : 0xffffff, on ? 1 : 0.5).strokeRoundedRect(-68, -72, 136, 150, 26);
    }
  }

  private choose(kind: SkinKind, i: number): void {
    const store = gameSave(this.oyun);
    const list = kind === 'shape' ? SHAPES : TRAILS;
    const result = this.apply(kind, i);
    if (result === 'poor') {
      this.oyun.audio.play('hit', { volume: 0.4 });
      this.oyun.platform.haptic('error');
      toast(this, this.t('skins.need', { n: list[i]!.price - store.data.gems }));
      const tile = this.tiles.find((t) => t.kind === kind && t.i === i);
      if (tile) this.juice.squash(tile.root, 0.2);
      return;
    }
    if (result === 'bought') {
      this.oyun.audio.play('win');
      this.juice.burst(this.preview.x, this.preview.y, { count: 24, color: PALETTE.gold, texture: 'oyun-star' });
    } else this.oyun.audio.play('pop');
    this.juice.pop(this.preview, 1.3);
    this.refresh();
  }

  private apply(kind: SkinKind, i: number): 'bought' | 'owned' | 'poor' {
    let result: 'bought' | 'owned' | 'poor' = 'owned';
    gameSave(this.oyun).update((d) => {
      result = buySkin(d, kind, i);
      if (result === 'owned') equipSkin(d, kind, i);
    });
    return result;
  }

  override update(_t: number, delta: number): void {
    this.t0 += delta;
    const dt = delta / 1000;
    const v = 380;
    // Preview zigzag around the centre, scrolling in place.
    if (Math.abs(this.px - 360) > 70) this.pdir = this.px > 360 ? -1 : 1;
    const ox = this.px;
    const oy = this.py;
    this.px += this.pdir * v * dt;
    this.py += v * dt;
    this.trail.sample(ox, oy, Math.abs(this.px - 360) > 69);
    const L = this.layout;
    this.trail.g.setPosition(L.cx - 360 + 0, L.top + 270 + this.py);
    this.trail.draw(this.px, this.py, 0.9);
    this.preview.setX(L.cx - 360 + this.px).setAngle(this.pdir * 30);
    this.previewGlow.setX(this.preview.x);
    this.backdrop.update(0.5, delta * 0.15, Math.pow(1 - ((this.t0 / 520) % 1), 3), 380, dt);
  }

  protected override testState() {
    const d = gameSave(this.oyun).data;
    return { wallet: d.gems, shape: d.skin.shape, trail: d.skin.trail, ownedShapes: d.skin.ownedShapes, ownedTrails: d.skin.ownedTrails };
  }

  protected override testActions() {
    return {
      buy: (p: unknown) => {
        const o = p as { kind: SkinKind; i: number };
        this.choose(o.kind, o.i);
      },
      back: () => this.back.fire(),
    };
  }
}
