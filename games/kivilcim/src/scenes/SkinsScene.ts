/**
 * Shop: the trail collection (tiers, prices, earned-only trails) and the spark shapes. The
 * selected item plays live on a zigzagging spark; buy, equip, or try a trail for one run.
 * Test actions: buy (select + buy/equip), select, try, tab, back.
 */
import { button, OyunScene, toast, touchHitSize, type Button, STORE_BUILD } from '@oyun/core';
import Phaser from 'phaser';
import { Backdrop } from '../render/Backdrop';
import { ensureCanvasArt } from '../render/canvasArt';
import { countUp, drawHalo, enter, isCalm, Motes, pressable, wipeIn, wipeTo } from '../render/menuFx';
import { ensureWorldArt } from '../render/worldArt';
import { hue, Trail } from '../render/Trail';
import { gameSave } from '../save';
import { ACHIEVEMENTS, RANKS } from '../sim/meta';
import { buySkin, equipSkin, type SkinKind } from '../sim/progress';
import { COLOR_SHIFT_STYLES, SHAPES, TIER_COLOR, TIERS, TRAILS } from '../sim/skins';
import { PALETTE, PALETTES } from '../textures';
import { bigText, fitText, IconTile } from '../ui';
import type { GameStart } from './GameScene';
import { SCENES } from './keys';

/** Registry key: a trail being tried for the next run only. */
export const TRIAL_KEY = 'trialTrail';

type Result = 'bought' | 'owned' | 'poor' | 'earned';

export class SkinsScene extends OyunScene {
  private backdrop!: Backdrop;
  private motes!: Motes;
  private back!: IconTile;
  private wallet!: Phaser.GameObjects.Text;
  private walletGem!: Phaser.GameObjects.Image;
  /** Gems the wallet text shows (it counts toward the real balance), -1 before the first draw. */
  private shownGems = -1;
  private stageFrame!: Phaser.GameObjects.Graphics;
  private stageTop = 0;
  private streaks: Phaser.GameObjects.Image[] = [];
  private ring!: Phaser.GameObjects.Image;
  private selGlow!: Phaser.GameObjects.Graphics;
  private onLabel!: Phaser.GameObjects.Text;
  private twinkles: Phaser.GameObjects.Image[] = [];
  private preview!: Phaser.GameObjects.Image;
  private previewGlow!: Phaser.GameObjects.Image;
  private trail!: Trail;
  private nameText!: Phaser.GameObjects.Text;
  private tierText!: Phaser.GameObjects.Text;
  private actBtn!: Button;
  private tryBtn!: Button;
  private grid!: Phaser.GameObjects.Container;
  private tabs: Phaser.GameObjects.Container[] = [];
  private tiles: { i: number; root: Phaser.GameObjects.Container; price: Phaser.GameObjects.Text; ring: Phaser.GameObjects.Graphics }[] = [];
  private kind: SkinKind = 'trail';
  private sel = 0;
  private t0 = 0;
  private px = 360;
  private py = 0;
  private pdir = 1;

  constructor() {
    super(SCENES.skins);
  }

  create(): void {
    ensureCanvasArt(this);
    ensureWorldArt(this);
    const L = this.layout;
    this.t0 = 0;
    this.tiles = [];
    this.tabs = [];
    this.streaks = [];
    this.twinkles = [];
    this.shownGems = -1;
    this.backdrop = new Backdrop(this, PALETTES[2]!, L.width, L.height);
    this.motes = new Motes(this, L.width, L.height, PALETTES[2]!.edge);
    // Title fits between the back button and the wallet in every language.
    const title = fitText(bigText(this, L.cx, L.top + 76, this.t('skins.title'), 72), 2 * (L.right - 210 - L.cx));
    enter(this, title, { dy: -50, duration: 380, ease: 'Back.easeOut' });
    this.back = new IconTile(this, L.left + 70, L.top + 72, 'ic-back', null, () => wipeTo(this, SCENES.game, { phase: 'title' } satisfies GameStart), { radius: 46 });
    this.walletGem = this.add.image(L.right - 170, L.top + 74, 'gem').setScale(0.6);
    this.wallet = bigText(this, L.right - 110, L.top + 74, '', 44, PALETTE.gem);
    enter(this, this.wallet, { dx: 60, delay: 120 });
    enter(this, this.walletGem, { dx: 60, delay: 120 });

    // Live preview on its own stage: the spark zigzags in place, drawing the selected trail;
    // the trail stays inside the stage.
    const sx = L.cx - 300;
    const stage = this.add.graphics().setDepth(0);
    stage.fillStyle(PALETTE.ink, 0.55).fillRoundedRect(sx, L.top + 130, 600, 330, 40);
    // The frame wears the selected item's tier colour (redrawn on select, not per frame).
    this.stageFrame = this.add.graphics().setDepth(1.5);
    this.stageTop = L.top + 130;
    // Speed streaks falling through the stage: the preview spark is climbing.
    for (let i = 0; i < 7; i++) {
      const s = this.add
        .image(sx + 50 + i * 84, this.stageTop + 60 + ((i * 97) % 200), 'streak')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(0.5)
        .setScale(1, 0.5 + (i % 3) * 0.2)
        .setAlpha(0.1);
      this.streaks.push(s);
    }
    this.ring = this.add.image(L.cx, L.top + 190, 'ring-burst').setBlendMode(Phaser.BlendModes.ADD).setDepth(2).setVisible(false);
    // A soft light behind the selected tile.
    this.selGlow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    const mask = this.make.graphics({}, false).fillRect(sx + 8, L.top + 138, 584, 314);
    const pg = this.add.graphics().setDepth(1);
    pg.setMask(mask.createGeometryMask());
    this.trail = new Trail(pg);
    // Short enough to end inside the stage (the spark sits 270 px above its bottom edge).
    this.trail.length = 250;
    this.trail.boost = 1.35;
    this.previewGlow = this.add.image(L.cx, L.top + 190, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(1.6).setDepth(2);
    this.preview = this.add.image(L.cx, L.top + 190, 'spark-0').setScale(1.3).setDepth(2);
    this.trail.reset(this.px, 0);
    this.nameText = bigText(this, L.cx, L.top + 392, '', 44).setDepth(3);
    this.tierText = bigText(this, L.cx, L.top + 432, '', 28).setDepth(3);
    this.actBtn = button(this, L.cx - 140, L.top + 505, '', () => this.act(), { width: 260, height: 76, fontSize: 32 });
    this.tryBtn = button(this, L.cx + 140, L.top + 505, this.t('shop.try'), () => this.tryIt(), { width: 260, height: 76, fontSize: 30, variant: 'secondary' });
    this.actBtn.setDepth(3);
    this.tryBtn.setDepth(3);
    // An equipped item shows a gold tick instead of a greyed-out button.
    this.onLabel = bigText(this, L.cx, L.top + 505, `✓ ${this.t('skins.equipped')}`, 40, PALETTE.gold).setDepth(3).setVisible(false);
    fitText(this.onLabel, 520, 40);

    // Tabs.
    (['trail', 'shape'] as const).forEach((k, n) => {
      const x = L.cx + (n === 0 ? -130 : 130);
      const g = this.add.graphics();
      const label = bigText(this, 0, 0, this.t(k === 'trail' ? 'skins.trails' : 'skins.shapes'), 36);
      const tab = this.add.container(x, L.top + 588, [g, label]);
      tab.setData('g', g);
      const hit = touchHitSize(240, 70);
      tab.setSize(hit.width, hit.height).setInteractive({ useHandCursor: true });
      pressable(this, tab, () => this.showTab(k));
      enter(this, tab, { dy: 24, delay: 160 + n * 60, duration: 300, ease: 'Back.easeOut' });
      this.tabs.push(tab);
    });
    this.grid = this.add.container(0, 0);
    const d = gameSave(this.oyun).data;
    this.sel = d.skin.trail;
    this.showTab('trail');
    wipeIn(this);
  }

  /** A ring that opens from the preview spark (select, equip, buy). */
  private pulseRing(color: number, to = 1.1): void {
    if (isCalm(this)) return;
    this.tweens.killTweensOf(this.ring);
    this.ring.setVisible(true).setPosition(this.preview.x, this.preview.y).setScale(0.2).setAlpha(0.85).setTint(color);
    this.tweens.add({ targets: this.ring, scale: to, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => this.ring.setVisible(false) });
  }

  private tierColor(): number {
    return this.kind === 'trail' ? TIER_COLOR[TRAILS[this.sel]!.tier] : 0xffffff;
  }

  private showTab(kind: SkinKind): void {
    this.kind = kind;
    const L = this.layout;
    const d = gameSave(this.oyun).data;
    this.sel = kind === 'trail' ? d.skin.trail : d.skin.shape;
    this.tabs.forEach((tab, n) => {
      const on = (n === 0) === (kind === 'trail');
      const g = tab.getData('g') as Phaser.GameObjects.Graphics;
      g.clear();
      g.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(-120, -32 + 6, 240, 64, 30);
      g.fillStyle(on ? 0xff9a1f : PALETTE.ui, 1).fillRoundedRect(-120, -32, 240, 64, 30);
      if (on) g.fillStyle(PALETTE.gold, 1).fillRoundedRect(-120, -32, 240, 54, 27);
      g.fillStyle(0xffffff, on ? 0.3 : 0.08).fillRoundedRect(-108, -27, 216, 20, 10);
      g.lineStyle(4, 0xffffff, on ? 1 : 0.5).strokeRoundedRect(-120, -32, 240, 64, 30);
      (tab.list[1] as Phaser.GameObjects.Text).setAlpha(on ? 1 : 0.8);
    });
    this.grid.removeAll(true);
    this.tiles = [];
    this.twinkles = [];
    const list = kind === 'shape' ? SHAPES : TRAILS;
    const cols = 5;
    const cw = 126;
    const chh = 128;
    const top = L.top + 680;
    for (let i = 0; i < list.length; i++) {
      const x = L.cx + ((i % cols) - (cols - 1) / 2) * (cw + 8);
      const y = top + Math.floor(i / cols) * 124;
      const ring = this.add.graphics();
      const parts: Phaser.GameObjects.GameObject[] = [ring];
      if (kind === 'shape') parts.push(this.add.image(0, -14, `spark-${i}`).setScale(0.8));
      else {
        const t = TRAILS[i]!;
        const sw = this.add.graphics();
        const shift = COLOR_SHIFT_STYLES.includes(t.style) || t.style === 'rainbow';
        for (let k = 0; k < 6; k++) {
          const col = shift ? hue(k / 6) : Phaser.Display.Color.GetColor(...lerp3(t.head, t.tail, k / 5));
          sw.lineStyle(13 - k * 1.4, col, 1);
          sw.lineBetween(-34 + k * 12, (k % 2 ? 1 : -1) * 14 - 14, -22 + k * 12, (k % 2 ? -1 : 1) * 14 - 14);
        }
        parts.push(sw);
      }
      const price = bigText(this, 0, 40, '', 24);
      parts.push(price);
      const root = this.add.container(x, y, parts);
      const hit = touchHitSize(cw, chh);
      root.setSize(hit.width, hit.height).setInteractive({ useHandCursor: true });
      pressable(this, root, () => this.select(i));
      // The rarest trails twinkle in the grid.
      const tier = kind === 'trail' ? TIERS.indexOf(TRAILS[i]!.tier) : 0;
      if (tier >= 3) {
        const tw = this.add.image(44, -48, 'w-star4').setBlendMode(Phaser.BlendModes.ADD).setTint(TIER_COLOR[TRAILS[i]!.tier]).setScale(0.5);
        root.add(tw);
        this.twinkles.push(tw);
      }
      this.grid.add(root);
      this.tiles.push({ i, root, price, ring });
    }
    this.refresh();
    // Tiles pop in row by row (after refresh has set each one's rest scale).
    for (const t of this.tiles) enter(this, t.root, { dy: 30, scale: 0.6, delay: 120 + t.i * 16, duration: 260, ease: 'Back.easeOut' });
  }

  private ownedMask(): number {
    const d = gameSave(this.oyun).data;
    return this.kind === 'shape' ? d.skin.ownedShapes : d.skin.ownedTrails;
  }

  private refresh(): void {
    const d = gameSave(this.oyun).data;
    if (this.shownGems < 0) this.wallet.setText(`${d.gems}`);
    else if (this.shownGems !== d.gems) {
      countUp(this, this.wallet, this.shownGems, d.gems, (n) => `${n}`, 500);
      this.juice.pop(this.walletGem, 1.5);
    }
    this.shownGems = d.gems;
    const isTrail = this.kind === 'trail';
    const trailIdx = isTrail ? this.sel : d.skin.trail;
    const tr = TRAILS[trailIdx]!;
    this.preview.setTexture(`spark-${isTrail ? d.skin.shape : this.sel}`);
    this.trail.head0 = tr.head;
    this.trail.tail0 = tr.tail;
    this.trail.rainbow = false;
    this.trail.style = tr.style;
    this.trail.tier = TIERS.indexOf(tr.tier);
    this.previewGlow.setTint(tr.tail);
    const owned = (this.ownedMask() & (1 << this.sel)) !== 0;
    const on = (isTrail ? d.skin.trail : d.skin.shape) === this.sel;
    const name = isTrail ? this.t(`trail.${tr.id}` as 'trail.white') : this.t(`shape.${SHAPES[this.sel]!.id}` as 'shape.orb');
    fitText(this.nameText.setText(name), 540, 44);
    if (isTrail) {
      const tierCol = TIER_COLOR[tr.tier];
      let tier = this.t(`tier.${tr.tier}` as 'tier.common');
      if (tr.unlock && !owned) {
        const u = tr.unlock;
        tier += ' · ' + ('rank' in u ? this.t('shop.earnRank', { name: this.t(`rank.${RANKS[u.rank]!.id}` as 'rank.ember') }) : this.t('shop.earnAch', { name: this.t(`ach.${u.achievement}` as 'ach.first') }));
      }
      fitText(this.tierText.setText(tier).setColor(`#${tierCol.toString(16).padStart(6, '0')}`), 560, 28);
    } else this.tierText.setText('');
    const price = (isTrail ? TRAILS : SHAPES)[this.sel]!.price;
    const earned = isTrail && !!tr.unlock;
    this.actBtn.setLabel(on ? this.t('skins.equipped') : owned ? this.t('shop.equip') : earned ? '—' : this.t('shop.buy', { n: price }));
    this.actBtn.setEnabled(!on && (owned || (!earned && d.gems >= price)));
    this.actBtn.setVisible(!(earned && !owned) && !on);
    this.onLabel.setVisible(on);
    this.tryBtn.setVisible(isTrail && !owned);
    const frameCol = this.tierColor();
    const fx = this.layout.cx - 300;
    this.stageFrame.clear();
    this.stageFrame.lineStyle(14, frameCol, 0.18).strokeRoundedRect(fx, this.stageTop, 600, 330, 40);
    this.stageFrame.lineStyle(4, frameCol, 0.95).strokeRoundedRect(fx, this.stageTop, 600, 330, 40);
    this.stageFrame.lineStyle(1.5, 0xffffff, 0.7).strokeRoundedRect(fx + 2, this.stageTop + 2, 596, 326, 38);
    const trial = this.registry.get(TRIAL_KEY) as number | undefined;
    this.tryBtn.setLabel(trial === this.sel && isTrail ? '✓' : this.t('shop.try'));
    for (const t of this.tiles) {
      const own = (this.ownedMask() & (1 << t.i)) !== 0;
      const eq = (isTrail ? d.skin.trail : d.skin.shape) === t.i;
      const item = (isTrail ? TRAILS : SHAPES)[t.i]!;
      const tierCol = isTrail ? TIER_COLOR[TRAILS[t.i]!.tier] : 0xffffff;
      const isEarned = isTrail && !!TRAILS[t.i]!.unlock;
      t.price.setText(eq ? this.t('skins.equipped') : own ? '' : isEarned ? '★' : `◆${item.price}`).setColor(eq ? '#ffe14d' : item.price > d.gems && !own && !isEarned ? '#ffb3c0' : '#ffffff');
      fitText(t.price, 116, 24);
      t.ring.clear();
      t.ring.fillStyle(PALETTE.ink, 0.55).fillRoundedRect(-62, -58, 124, 124, 22);
      t.ring.fillStyle(own ? PALETTE.uiLight : PALETTE.ui, 1).fillRoundedRect(-62, -64, 124, 124, 22);
      t.ring.fillStyle(tierCol, 0.9).fillRoundedRect(-62, 42, 124, 18, { tl: 0, tr: 0, bl: 22, br: 22 });
      const s = t.i === this.sel;
      t.ring.fillStyle(0xffffff, own ? 0.14 : 0.06).fillRoundedRect(-54, -58, 108, 34, 14);
      t.ring.lineStyle(s ? 7 : eq ? 6 : 3, s ? 0xffffff : eq ? PALETTE.gold : tierCol, s || eq ? 1 : 0.7).strokeRoundedRect(-62, -64, 124, 124, 22);
      t.root.setData('rest', s ? 1 : 0.93);
      if (!this.tweens.isTweening(t.root)) t.root.setScale(s ? 1 : 0.93);
      if (s) {
        const rx = (t.root.getData('restX') as number | undefined) ?? t.root.x;
        const ry = (t.root.getData('restY') as number | undefined) ?? t.root.y;
        drawHalo(this.selGlow, 124, 124, 22, tierCol).setPosition(rx, ry - 2);
      }
    }
  }

  private select(i: number): void {
    this.sel = i;
    this.oyun.audio.play('tap');
    this.juice.pop(this.preview, 1.2);
    this.refresh();
    this.pulseRing(this.tierColor(), 0.9);
  }

  private act(): void {
    const r = this.apply(this.kind, this.sel);
    this.feedback(this.kind, this.sel, r);
  }

  private tryIt(): void {
    if (this.kind !== 'trail') return;
    this.registry.set(TRIAL_KEY, this.sel);
    this.oyun.audio.play('pop');
    toast(this, this.t('shop.trying'));
    this.refresh();
  }

  /** Select, then buy (or equip when owned). */
  private choose(kind: SkinKind, i: number): void {
    if (kind !== this.kind) this.showTab(kind);
    this.sel = i;
    const r = this.apply(kind, i);
    this.feedback(kind, i, r);
  }

  private feedback(kind: SkinKind, i: number, result: Result): void {
    const store = gameSave(this.oyun);
    const list = kind === 'shape' ? SHAPES : TRAILS;
    if (result === 'poor' || result === 'earned') {
      this.oyun.audio.play('hit', { volume: 0.4 });
      this.oyun.platform.haptic('error');
      if (result === 'poor') toast(this, this.t('skins.need', { n: list[i]!.price - store.data.gems }));
      const tile = this.tiles.find((t) => t.i === i);
      if (tile) this.juice.squash(tile.root, 0.2);
      this.refresh();
      return;
    }
    if (result === 'bought') {
      this.oyun.audio.play('win');
      this.juice.burst(this.preview.x, this.preview.y, { count: isCalm(this) ? 8 : 24, color: PALETTE.gold, texture: 'oyun-star' });
      this.oyun.platform.haptic('success');
      if (kind === 'trail' && this.registry.get(TRIAL_KEY) === i) this.registry.remove(TRIAL_KEY);
    } else this.oyun.audio.play('pop');
    this.juice.pop(this.preview, 1.3);
    this.refresh();
    this.pulseRing(result === 'bought' ? PALETTE.gold : this.tierColor(), result === 'bought' ? 1.35 : 1.1);
    const tile = this.tiles.find((t) => t.i === i);
    if (tile && !this.tweens.isTweening(tile.root)) this.juice.pop(tile.root, 1.18);
    this.juice.pop(this.onLabel, 1.25);
  }

  private apply(kind: SkinKind, i: number): Result {
    let result: Result = 'owned';
    gameSave(this.oyun).update((d) => {
      result = buySkin(d, kind, i);
      if (result === 'owned') equipSkin(d, kind, i);
    });
    return result;
  }

  override update(_t: number, delta: number): void {
    this.t0 += delta;
    const dt = delta / 1000;
    const v = 520;
    // Preview zigzag around the centre, scrolling in place.
    if (Math.abs(this.px - 360) > 110) this.pdir = this.px > 360 ? -1 : 1;
    const ox = this.px;
    const oy = this.py;
    this.px += this.pdir * v * dt;
    this.py += v * dt;
    this.trail.sample(ox, oy, Math.abs(this.px - 360) > 109);
    const L = this.layout;
    const pulse = Math.pow(1 - ((this.t0 / 520) % 1), 3);
    this.trail.pulse = pulse;
    this.trail.g.setPosition(L.cx - 360, L.top + 190 + this.py);
    this.trail.draw(this.px, this.py, 0.95);
    this.preview.setX(L.cx - 360 + this.px).setAngle(this.pdir * 30);
    const tr = TRAILS[this.kind === 'trail' ? this.sel : gameSave(this.oyun).data.skin.trail]!;
    if (COLOR_SHIFT_STYLES.includes(tr.style)) this.preview.setTint(hue((this.t0 / 1400) % 1));
    else this.preview.clearTint();
    this.previewGlow.setX(this.preview.x).setScale(1.5 + pulse * 0.3);
    this.backdrop.update(0.5, delta * 0.15, pulse, 380, dt);
    this.motes.update(dt, pulse);
    this.selGlow.setAlpha(Math.min(1, this.t0 / 700) * (0.65 + 0.35 * Math.sin(this.t0 / 260)));
    if (!isCalm(this)) {
      // Streaks fall through the stage and fade at both ends, so they never leave it.
      for (let i = 0; i < this.streaks.length; i++) {
        const s = this.streaks[i]!;
        let k = (s.y - this.stageTop - 50) / 230 + dt * (1.1 + (i % 3) * 0.35);
        if (k > 1) k -= 1;
        s.setY(this.stageTop + 50 + k * 230).setAlpha(0.2 * Math.sin(Math.PI * k));
      }
      for (let i = 0; i < this.twinkles.length; i++) {
        const tw = Math.max(0, Math.sin(this.t0 / 240 + i * 1.7));
        this.twinkles[i]!.setScale(0.25 + 0.4 * tw).setAlpha(0.35 + 0.65 * tw).setAngle(this.t0 * 0.05 + i * 30);
      }
    }
  }

  protected override testState() {

    if (STORE_BUILD) throw new Error('unreachable'); // store builds: no test hook
    const d = gameSave(this.oyun).data;
    return {
      wallet: d.gems,
      shape: d.skin.shape,
      trail: d.skin.trail,
      ownedShapes: d.skin.ownedShapes,
      ownedTrails: d.skin.ownedTrails,
      tab: this.kind,
      selected: this.sel,
      trial: (this.registry.get(TRIAL_KEY) as number | undefined) ?? -1,
      achievements: ACHIEVEMENTS.length,
    };
  }

  protected override testActions() {

    if (STORE_BUILD) throw new Error('unreachable'); // store builds: no test hook
    return {
      buy: (p: unknown) => {
        const o = p as { kind: SkinKind; i: number };
        this.choose(o.kind, o.i);
      },
      select: (p: unknown) => {
        const o = p as { kind: SkinKind; i: number };
        if (o.kind !== this.kind) this.showTab(o.kind);
        this.select(o.i);
      },
      try: () => this.tryIt(),
      tab: (p: unknown) => this.showTab(p === 'shape' ? 'shape' : 'trail'),
      back: () => this.back.fire(),
    };
  }
}

function lerp3(a: number, b: number, t: number): [number, number, number] {
  const ch = (s: number): number => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return [ch(16), ch(8), ch(0)];
}
