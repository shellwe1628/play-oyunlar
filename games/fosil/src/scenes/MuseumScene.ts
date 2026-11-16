import { button, cssColor, label, OyunScene, panel, progressBar, type Button, type ProgressBar } from '@oyun/core';
import Phaser from 'phaser';
import { backgroundAware, session } from '../session';
import { SFX } from '../sfx';
import { GRADE_COLORS, GRADE_COUNT, LAYERS, TIERS, fossilPower, type Fossil, at } from '../sim/data';
import type { DigSim } from '../sim/dig';
import { layerFossils } from '../sim/loot';
import { fossilKey, PALETTE } from '../textures';
import type { PauseReason } from '@oyun/core/pure';
import { SCENES } from './keys';
import { big, fitText, fossilName, hitZone, mult, oddsText, rarityCard } from './ui';

const CARD_W = 322;

/**
 * The museum: one grid per layer with silhouettes for undiscovered fossils, the printed odds,
 * copies found, grade, and set progress with its bonus. Test actions: tab {layer}, open {index},
 * close, back.
 */
export class MuseumScene extends OyunScene {
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
    const L = this.layout;
    this.cameras.main.setBackgroundColor(PALETTE.cream);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.creamDark, 1).fillRect(0, 0, L.width, L.top + 112);
    for (let x = 0; x < L.width; x += 48) g.fillStyle(PALETTE.creamDark, 0.5).fillRect(x, L.top + 112, 24, 6);

    label(this, L.cx, L.top + 58, this.t('museum.title'), { size: 58, color: PALETTE.ink });
    const tabW = (L.right - L.left - 40) / 4;
    LAYERS.forEach((layer, i) => {
      const x = L.left + 20 + tabW * (i + 0.5);
      const y = L.top + 168;
      const bg = this.add.graphics({ x, y });
      const text = label(this, x, y, this.t(`layer.${layer.id}`), { size: 28, color: PALETTE.ink });
      fitText(text, tabW - 24);
      this.tabs.push({ bg, text });
      hitZone(this, x, y, tabW - 8, 84, () => this.selectTab(i));
    });

    this.setBar = progressBar(this, L.cx - 90, L.top + 256, 440, 34, { color: PALETTE.ochre, background: PALETTE.inkSoft });
    this.setText = label(this, L.right - 110, L.top + 256, '', { size: 34, color: PALETTE.ink });
    this.bonusText = label(this, L.cx, L.top + 304, '', { size: 28, color: PALETTE.inkSoft, wrap: L.width - 80 });

    this.grid = this.add.container(0, 0);
    this.backButton = button(this, L.cx, L.bottom - 70, this.t('museum.back'), () => this.goTo(SCENES.dig), { width: 380, height: 104, fontSize: 44 });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ses.flush());
    this.drawTabs();
    this.drawGrid(true);
  }

  override update(_t: number, delta: number): void {
      // Every find is saved at once and its reveal waits for the dig screen (nothing arrives silently).
    const ses = session(this.oyun);
    const r = this.sim.tick(Math.min(delta, 250) / 1000);
    if (r.finds.length) {
      for (const f of r.finds) ses.queueFind(f);
      this.drawGrid();
    }
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
    const tabW = (L.right - L.left - 40) / 4;
    this.tabs.forEach((t, i) => {
      const on = i === this.tab;
      const locked = i > this.sim.unlocked;
      t.bg.clear();
      t.bg.fillStyle(PALETTE.shadow, 0.18).fillRoundedRect(-tabW / 2 + 4, -36, tabW - 8, 80, 20);
      t.bg.fillStyle(on ? PALETTE.ochre : locked ? PALETTE.creamDark : 0xffffff, 1).fillRoundedRect(-tabW / 2 + 4, -40, tabW - 8, 80, 20);
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

    const locked = this.tab > this.sim.unlocked;
    const top = L.top + 336;
    const avail = L.bottom - 128 - top;
    const step = Math.min(150, avail / 6);
    const cardH = step - 12;
    fs.forEach((f, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = L.cx + (col === 0 ? -1 : 1) * (CARD_W / 2 + 8);
      const y = top + row * step + cardH / 2;
      this.grid.add(this.card(f, x, y, cardH, locked));
    });
    if (locked) {
      const msg = label(this, L.cx, top + 3 * step - 6, this.t('museum.locked', { n: big(this, at(LAYERS, this.tab).unlockPower) }), { size: 40, color: PALETTE.ink });
      msg.setStroke(cssColor(PALETTE.cream), 10);
      this.grid.add([this.add.image(L.cx, top + 3 * step - 80, 'lock').setScale(1.4), msg]);
    }
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
      const cnt = label(this, -CARD_W / 2 + 108, -h / 2 + 22, `×${big(this, n)}`, { size: 27, color: PALETTE.ink }).setOrigin(1, 0.5);
      cnt.setStroke(cssColor(PALETTE.cardFace), 6);
      c.add(cnt);
      const grades = this.sim.grades(f.id);
      for (let gi = 0; gi < GRADE_COUNT; gi++) {
        const px = -CARD_W / 2 + 24 + gi * 25;
        const on = (grades[gi] ?? 0) > 0;
        const pip = this.add.circle(px, h / 2 - 17, on ? 10 : 8, at(GRADE_COLORS, gi), on ? 1 : 0.3);
        pip.setStrokeStyle(2, PALETTE.ink, on ? 0.7 : 0.25);
        c.add(pip);
      }
    }
    const zone = this.add.zone(0, 0, CARD_W, h).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.openDetail(f));
    c.add(zone);
    c.setData('fossil', f.id);
    return c;
  }

  private openDetail(f: Fossil): void {
    if (this.detail || this.tab > this.sim.unlocked) return;
    const L = this.layout;
    const found = this.sim.discovered(f.id);
    const box = this.add.container(0, 0).setDepth(900);
    const shade = this.add.graphics();
    shade.fillStyle(PALETTE.ink, 0.93).fillRect(-20, -20, L.width + 40, L.height + 40);
    const closer = this.add.zone(L.cx, L.height / 2, L.width + 40, L.height + 40).setInteractive();
    closer.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.closeDetail());
    box.add([shade, closer]);
    const card = rarityCard(this, f, 420, 560).setPosition(L.cx, L.cy - 120);
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
