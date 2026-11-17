import { button, cssColor, label, OyunScene, panel, progressBar, type Button, type ProgressBar } from '@oyun/core';
import Phaser from 'phaser';
import { backgroundAware, session } from '../session';
import { SFX } from '../sfx';
import { GRADE_COLORS, GRADE_COUNT, LAYERS, TIERS, fossilPower, type Fossil, at } from '../sim/data';
import type { DigSim } from '../sim/dig';
import { layerFossils } from '../sim/loot';
import { fossilKey, PALETTE } from '../textures';
import type { PauseReason } from '@oyun/core/pure';
import { addCardLife } from '../fx/CardLife';
import { Particles } from '../fx/Particles';
import { SCENES } from './keys';
import { big, fitText, fossilName, hitZone, mult, oddsText, rarityCard } from './ui';

const CARD_W = 322;
const TABS_PER_ROW = 5;
/** Presentation-only memory (not the game save): which set celebrations were already shown. */
const FX_KEY = 'oyun:fosil:fx-sets';

/**
 * The museum: one grid per layer with silhouettes for undiscovered fossils, the printed odds,
 * copies found, grade, and set progress with its bonus. Test actions: tab {layer}, open {index},
 * close, back.
 */
export class MuseumScene extends OyunScene {
  private confetti!: Particles;
  protected override autoPause = true;
  private sim!: DigSim;
  private tab = 0;
  private grid!: Phaser.GameObjects.Container;
  private tabs: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text }[] = [];
  private setBar!: ProgressBar;
  private setText!: Phaser.GameObjects.Text;
  private bonusText!: Phaser.GameObjects.Text;
  private detail: Phaser.GameObjects.Container | null = null;
  private backButton!: Button;
  private gridKey = '';

  constructor() {
    super(SCENES.museum);
  }

  create(): void {
    const ses = session(this.oyun);
    this.sim = ses.sim;
    this.tab = this.sim.layer;
    this.detail = null;
    this.tabs = [];
    this.gridKey = '';
    this.confetti = new Particles(this, 90, 950);
    const L = this.layout;
    this.cameras.main.setBackgroundColor(PALETTE.cream);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.creamDark, 1).fillRect(0, 0, L.width, L.top + 112);
    for (let x = 0; x < L.width; x += 48) g.fillStyle(PALETTE.creamDark, 0.5).fillRect(x, L.top + 112, 24, 6);

    label(this, L.cx, L.top + 58, this.t('museum.title'), { size: 58, color: PALETTE.ink });
    // ten layers: two rows of five tabs
    const tabW = (L.right - L.left - 40) / TABS_PER_ROW;
    LAYERS.forEach((layer, i) => {
      const x = L.left + 20 + tabW * ((i % TABS_PER_ROW) + 0.5);
      const y = L.top + 156 + Math.floor(i / TABS_PER_ROW) * 76;
      const bg = this.add.graphics({ x, y });
      const text = label(this, x, y, this.t(`layer.${layer.id}`), { size: 24, color: PALETTE.ink, wrap: tabW - 18 });
      text.setLineSpacing(-6);
      if (text.height > 58) text.setScale(58 / text.height);
      fitText(text, tabW - 18, 0.5);
      this.tabs.push({ bg, text });
      hitZone(this, x, y, tabW - 6, 72, () => this.selectTab(i));
    });

    this.setBar = progressBar(this, L.cx - 90, L.top + 310, 440, 34, { color: PALETTE.ochre, background: PALETTE.inkSoft });
    this.setText = label(this, L.right - 110, L.top + 310, '', { size: 34, color: PALETTE.ink });
    this.bonusText = label(this, L.cx, L.top + 354, '', { size: 28, color: PALETTE.inkSoft, wrap: L.width - 80 });

    this.grid = this.add.container(0, 0);
    this.backButton = button(this, L.cx, L.bottom - 70, this.t('museum.back'), () => this.goTo(SCENES.dig), { width: 380, height: 104, fontSize: 44 });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ses.flush());
    this.drawTabs();
    this.drawGrid(true);
  }

  /** Set completion gets its own celebration the first time you see the finished shelf. */
  private celebrated(layer: number): boolean {
    try {
      const raw = this.oyun.storage.getItem(FX_KEY);
      return raw !== null && (JSON.parse(raw) as number[]).includes(layer);
    } catch {
      return false;
    }
  }

  private celebrateSet(): void {
    const layer = this.tab;
    if (this.celebrated(layer)) return;
    try {
      const raw = this.oyun.storage.getItem(FX_KEY);
      const list = raw ? (JSON.parse(raw) as number[]) : [];
      this.oyun.storage.setItem(FX_KEY, JSON.stringify([...list, layer]));
    } catch {
      /* presentation-only memory: losing it just means celebrating again */
    }
    const L = this.layout;
    const cards = this.grid.list.filter((o): o is Phaser.GameObjects.Container => o instanceof Phaser.GameObjects.Container);
    cards.forEach((c, i) => {
      this.time.delayedCall(i * 70, () => {
        this.juice.pop(c, 1.12, 260);
        this.confetti.emit(c.x, c.y, 4, { texture: 'spark', tint: 0xffd23f, speed: [80, 200], life: [0.4, 0.7], scale: [0.5, 0.9] });
      });
    });
    this.time.delayedCall(cards.length * 70, () => {
      for (let k = 0; k < 6; k++) this.confetti.emit(L.left + 60 + k * 120, L.top + 120, 6, { texture: k % 2 ? 'spark' : 'chip', tint: [0xffd23f, 0xf0445f, 0x3d8bf0, 0x4fbf6a][k % 4], speed: [120, 380], angle: Math.PI / 2, spread: 1.6, gravity: 500, life: [1.6, 2.4], scale: [0.6, 1.1], spin: 8, fadeTail: 0.4 });
      const banner = label(this, L.cx, L.cy - 40, this.t('dig.setDone', { name: this.t(`layer.${at(LAYERS, layer).id}`) }), { size: 52, color: 0xffd23f, wrap: L.width - 80 }).setDepth(960);
      banner.setStroke(cssColor(PALETTE.ink), 12);
      this.juice.pop(banner, 0.3, 420);
      this.oyun.audio.playPreset(SFX.fanfare);
      this.oyun.platform.haptic('success');
      this.tweens.add({ targets: banner, alpha: 0, delay: 1800, duration: 400, onComplete: () => banner.destroy() });
    });
  }

  override update(_t: number, delta: number): void {
    this.confetti.update(Math.min(delta, 250) / 1000);
      // Every find is saved at once and its reveal waits for the dig screen (nothing arrives silently).
    const ses = session(this.oyun);
    const r = this.sim.tick(Math.min(delta, 250) / 1000);
    if (r.finds.length) {
      for (const f of r.finds) ses.queueFind(f);
      this.drawGrid();
    }
    ses.queueEvents(r.events);
    ses.autosave();
  }

  protected override onPlatformPause(reason: PauseReason): void {
    if (backgroundAware(reason)) session(this.oyun).background();
    else session(this.oyun).flush();
    super.onPlatformPause(reason);
  }

  protected override onPlatformResume(reason: PauseReason): void {
    if (backgroundAware(reason)) session(this.oyun).foreground();
    this.drawGrid();
    super.onPlatformResume(reason);
  }

  private selectTab(i: number): void {
    if (this.detail) return;
    if (i === this.tab) return;
    this.tab = i;
    this.oyun.audio.play('tap');
    this.drawTabs();
    this.drawGrid(true);
  }

  private drawTabs(): void {
    const L = this.layout;
    const tabW = (L.right - L.left - 40) / TABS_PER_ROW;
    this.tabs.forEach((t, i) => {
      const on = i === this.tab;
      const locked = this.lockedTab(i);
      const done = this.sim.setComplete(i);
      t.bg.clear();
      t.bg.fillStyle(PALETTE.shadow, 0.18).fillRoundedRect(-tabW / 2 + 3, -30, tabW - 6, 68, 18);
      t.bg.fillStyle(on ? PALETTE.ochre : locked ? PALETTE.creamDark : 0xffffff, 1).fillRoundedRect(-tabW / 2 + 3, -34, tabW - 6, 68, 18);
      if (done) t.bg.fillStyle(0xffd23f, 1).fillCircle(tabW / 2 - 12, -26, 9);
      t.text.setColor(cssColor(locked ? PALETTE.inkSoft : PALETTE.ink));
    });
  }

  private drawGrid(force = false): void {
    const fs = layerFossils(this.tab);
    const key = fs.map((f) => this.sim.grades(f.id).join('.')).join('|') + `|${this.tab}`;
    if (!force && key === this.gridKey) return;
    this.gridKey = key;
    this.grid.removeAll(true);
    const L = this.layout;
    const prog = this.sim.setProgress(this.tab);
    this.setBar.setValue(prog.found / prog.total);
    this.setText.setText(this.t('museum.set', { a: prog.found, b: prog.total }));
    const bonus = at(LAYERS, this.tab).setBonus;
    const bonusValue = bonus.kind === 'offlineCap' ? String(Math.round(bonus.value / 60)) : mult(this, bonus.value);
    const done = this.sim.setComplete(this.tab);
    this.bonusText.setText(`${this.t(`set.${bonus.kind}`, { n: bonusValue })}${done ? ` · ${this.t('set.earned')}` : ''}`);
    this.bonusText.setColor(cssColor(done ? 0x2f8a3c : PALETTE.inkSoft));

    const locked = this.lockedTab(this.tab);
    const top = L.top + 392;
    const avail = L.bottom - 128 - top;
    const step = Math.min(150, avail / 6);
    const cardH = step - 12;
    // the room: a back wall tinted by the layer, a wooden shelf under every row of display cases
    const room = this.add.graphics();
    const tint = at(at(LAYERS, this.tab).bands, 1);
    room.fillStyle(tint, 0.1).fillRect(0, top - 24, L.width, 6 * step + 30);
    for (let r = 0; r < 6; r++) {
      const sy = top + r * step + cardH + 2;
      room.fillStyle(0x000000, 0.12).fillRect(L.left + 14, sy + 12, L.right - L.left - 28, 6);
      room.fillStyle(0x8a5a35, 1).fillRect(L.left + 14, sy, L.right - L.left - 28, 12);
      room.fillStyle(0xb07a4a, 1).fillRect(L.left + 14, sy, L.right - L.left - 28, 4);
      room.fillStyle(0x6d4123, 1).fillTriangle(L.left + 40, sy + 12, L.left + 64, sy + 12, L.left + 40, sy + 30).fillTriangle(L.right - 40, sy + 12, L.right - 64, sy + 12, L.right - 40, sy + 30);
    }
    this.grid.add(room);
    // a spotlight on the rarest find of this layer
    const rarest = locked ? undefined : [...fs].reverse().find((f) => this.sim.discovered(f.id));
    const spotAt = rarest ? fs.indexOf(rarest) : -1;
    fs.forEach((f, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = L.cx + (col === 0 ? -1 : 1) * (CARD_W / 2 + 8);
      const y = top + row * step + cardH / 2;
      if (i === spotAt) {
        const beam = this.add.image(x, top - 40, 'ray').setOrigin(0.5, 0).setTint(0xfff3c0).setAlpha(0.32).setScale(3.2, (y - top + 80) / 360);
        this.grid.add(beam);
        this.tweens.add({ targets: beam, alpha: 0.18, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        beam.once('destroy', () => this.tweens.killTweensOf(beam));
      }
      this.grid.add(this.card(f, x, y, cardH, locked));
      if (i === spotAt) {
        const tag = label(this, x + CARD_W / 2 - 12, y - cardH / 2 - 2, this.t('museum.rarest'), { size: 22, color: PALETTE.ink }).setOrigin(1, 0.5);
        tag.setBackgroundColor('#ffd23f').setPadding(8, 2, 8, 2);
        this.grid.add(tag);
      }
    });
    if (done && !this.celebrated(this.tab)) this.time.delayedCall(350, () => this.celebrateSet());
    if (locked) {
      const msg = label(this, L.cx, top + 3 * step - 6, this.t('museum.locked', { n: big(this, this.sim.unlockPowerOf(this.tab)) }), { size: 40, color: PALETTE.ink });
      msg.setStroke(cssColor(PALETTE.cream), 10);
      this.grid.add([this.add.image(L.cx, top + 3 * step - 80, 'lock').setScale(1.4), msg]);
    }
  }

  /** A museum shelf is closed until its layer has been reached in any expedition. */
  private lockedTab(i: number): boolean {
    return i > Math.max(this.sim.unlocked, this.sim.deepest);
  }

  private card(f: Fossil, x: number, y: number, h: number, locked: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const tier = at(TIERS, f.tier);
    const found = this.sim.discovered(f.id);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.18).fillRoundedRect(-CARD_W / 2, -h / 2 + 6, CARD_W, h, 22);
    g.fillStyle(found ? PALETTE.cardFace : PALETTE.creamDark, 1).fillRoundedRect(-CARD_W / 2, -h / 2, CARD_W, h, 22);
    g.lineStyle(found ? 6 : 3, found ? tier.color : PALETTE.inkSoft, found ? 1 : 0.4).strokeRoundedRect(-CARD_W / 2, -h / 2, CARD_W, h, 22);
    g.fillStyle(tier.color, found ? 0.18 : 0.08).fillRoundedRect(-CARD_W / 2 + 8, -h / 2 + 8, 104, h - 16, 16);
    c.add(g);
    // icon column: fossil, copies badge, grade pips | text column: name (up to 2 lines), odds
    const img = this.add.image(-CARD_W / 2 + 60, -12, fossilKey(f.id)).setScale(Math.min(0.58, (h - 44) / 160));
    if (!found) img.setTint(PALETTE.silhouette).setTintMode(Phaser.TintModes.FILL).setAlpha(locked ? 0.25 : 0.55);
    c.add(img);
    const tx = -CARD_W / 2 + 120;
    const textW = CARD_W - 132;
    const name = label(this, tx, -h / 2 + 10, found ? fossilName(this, f) : this.t('museum.unknown'), { size: 28, color: PALETTE.ink, wrap: textW, align: 'left' }).setOrigin(0, 0);
    name.setLineSpacing(-8);
    const nameMax = h - 66; // leave the bottom row to the odds
    if (name.height > nameMax) name.setScale(nameMax / name.height);
    const odds = label(this, tx, h / 2 - 28, oddsText(this, f.odds), { size: 31, color: f.tier === 0 ? PALETTE.inkSoft : tier.color }).setOrigin(0, 0.5);
    odds.setStroke(cssColor(PALETTE.ink), f.tier >= 2 ? 2 : 0);
    fitText(odds, textW, 0.7);
    c.add([name, odds]);
    if (found) {
      const n = this.sim.count(f.id);
      if (n > 0) {
        const cnt = label(this, -CARD_W / 2 + 108, -h / 2 + 22, `×${big(this, n)}`, { size: 27, color: PALETTE.ink }).setOrigin(1, 0.5);
        cnt.setStroke(cssColor(PALETTE.cardFace), 6);
        c.add(cnt);
      }
      // pips: the best grade this species ever reached (kept through expeditions)
      const best = this.sim.bestGrade(f.id);
      for (let gi = 0; gi < GRADE_COUNT; gi++) {
        const px = -CARD_W / 2 + 24 + gi * 25;
        const on = gi <= best;
        const pip = this.add.circle(px, h / 2 - 17, on ? 10 : 8, at(GRADE_COLORS, gi), on ? 1 : 0.3);
        pip.setStrokeStyle(2, PALETTE.ink, on ? 0.7 : 0.25);
        c.add(pip);
      }
    }
    const zone = this.add.zone(0, 0, CARD_W, h).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.openDetail(f));
    c.add(zone);
    c.setData('fossil', f.id);
    if (found) {
      // a display case: glass glint across the top-left corner, and the card's idle life by rarity
      const glass = this.add.graphics();
      glass.fillStyle(0xffffff, 0.22).fillTriangle(-CARD_W / 2 + 10, -h / 2 + 10, -CARD_W / 2 + 70, -h / 2 + 10, -CARD_W / 2 + 10, -h / 2 + 50);
      c.addAt(glass, c.list.length - 1);
      addCardLife(this, c, f.tier, CARD_W, h);
    }
    return c;
  }

  private openDetail(f: Fossil): void {
    if (this.detail || this.lockedTab(this.tab)) return;
    const L = this.layout;
    const found = this.sim.discovered(f.id);
    const box = this.add.container(0, 0).setDepth(900);
    const shade = this.add.graphics();
    shade.fillStyle(PALETTE.ink, 0.93).fillRect(-20, -20, L.width + 40, L.height + 40);
    const closer = this.add.zone(L.cx, L.height / 2, L.width + 40, L.height + 40).setInteractive();
    closer.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.closeDetail());
    box.add([shade, closer]);
    const card = rarityCard(this, f, 420, 560).setPosition(L.cx, L.cy - 120);
    if (found) addCardLife(this, card, f.tier, 420, 560);
    if (!found) {
      const art = card.getData('art') as Phaser.GameObjects.Image;
      art.setTint(PALETTE.silhouette).setTintMode(Phaser.TintModes.FILL).setAlpha(0.6);
      const name = card.list.find((o) => o instanceof Phaser.GameObjects.Text && o.text === fossilName(this, f)) as Phaser.GameObjects.Text | undefined;
      name?.setText(this.t('museum.unknown'));
    }
    box.add(card);
    const [g0 = 0, g1 = 0, g2 = 0, g3 = 0] = this.sim.grades(f.id);
    const lines = [
      found ? this.t('museum.detailGrades', { a: g0, b: g1, c: g2, d: g3 }) : '',
      this.t('museum.power', { n: big(this, fossilPower(f, 0)) }),
      this.t('museum.fuseRule'),
      this.t('dig.luckRule'),
    ].filter(Boolean);
    const info = panel(this, L.cx, L.cy + 310, L.width - 60, 290, { color: PALETTE.dirtLight });
    box.add(info);
    let y = -122;
    for (const text of lines) {
      const t = label(this, 0, y, text, { size: 30, color: 0xffffff, wrap: L.width - 110 }).setOrigin(0.5, 0);
      info.add(t);
      y += t.height + 14;
    }
    this.juice.pop(card, 0.6, 260);
    this.oyun.audio.playPreset(SFX.flip);
    this.detail = box;
  }

  private closeDetail(): void {
    const d = this.detail;
    if (!d) return;
    this.detail = null;
    d.destroy();
  }

  protected override testState() {
    const fs = layerFossils(this.tab);
    return {
      tab: this.tab,
      unlocked: this.sim.unlocked,
      found: fs.filter((f) => this.sim.discovered(f.id)).length,
      cards: fs.map((f) => ({ id: f.id, odds: f.odds, found: this.sim.discovered(f.id), count: this.sim.count(f.id), grade: this.sim.topGrade(f.id) })),
      detail: this.detail !== null,
      ui: {
        cards: this.grid.list.filter((o): o is Phaser.GameObjects.Container => o instanceof Phaser.GameObjects.Container).map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })),
        back: { x: Math.round(this.backButton.x), y: Math.round(this.backButton.y) },
      },
    };
  }

  protected override testActions() {
    return {
      tab: (p: unknown) => this.selectTab(typeof p === 'number' ? p : 0),
      open: (p: unknown) => this.openDetail(at(layerFossils(this.tab), typeof p === 'number' ? p : 0)),
      close: () => this.closeDetail(),
      back: () => this.backButton.fire(),
    };
  }
}
