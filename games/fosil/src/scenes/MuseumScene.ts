import { button, cssColor, label, OyunScene, panel, progressBar, type Button, type ProgressBar, STORE_BUILD } from '@oyun/core';
import Phaser from 'phaser';
import { backgroundAware, session } from '../session';
import { SFX } from '../sfx';
import { FOSSILS, GRADE_COLORS, GRADE_COUNT, LAYERS, TIERS, fossilPower, type Fossil, at } from '../sim/data';
import type { DigSim } from '../sim/dig';
import { layerFossils } from '../sim/loot';
import { fossilKey, PALETTE } from '../textures';
import type { PauseReason } from '@oyun/core/pure';
import { addCardLife } from '../fx/CardLife';
import { calmShake, countTo, fillBar, Motes } from '../fx/Motion';
import { Particles } from '../fx/Particles';
import { initSeen, markSeen } from '../fx/seen';
import { SCENES } from './keys';
import { big, fitText, fossilName, hitZone, mult, oddsText, rarityCard } from './ui';

const CARD_W = 322;
const TABS_PER_ROW = 5;
/** Thirteen layers: three rows of tabs (5 + 5 + 3). */
const TAB_ROWS = Math.ceil(LAYERS.length / TABS_PER_ROW);
const TAB_STEP = 64;
const TAB_H = 58;
/** Below the tabs: set bar, bonus line, then the shelves. */
const SET_Y = 150 + (TAB_ROWS - 1) * TAB_STEP + 70;
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
  private motes!: Motes;
  /** Species already looked at in the museum (stored), and the ones wearing a "New!" ribbon this visit. */
  private seen = new Set<string>();
  private fresh = new Set<string>();
  /** Ribbons that have already stamped on this visit (a redraw shows them without the stamp). */
  private stamped = new Set<string>();
  private setShown = 0;
  private setTweens: (Phaser.Tweens.Tween | null)[] = [];

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
    this.setShown = 0;
    this.setTweens = [];
    calmShake(this);
    this.confetti = new Particles(this, 90, 950);
    const found = FOSSILS.filter((f) => this.sim.discovered(f.id)).map((f) => f.id);
    this.seen = initSeen(this.oyun, found);
    this.fresh = new Set(found.filter((id) => !this.seen.has(id)));
    this.stamped = new Set();
    const L = this.layout;
    this.cameras.main.setBackgroundColor(PALETTE.cream);
    // the hall: daylight falls in from the top right, the corners stay a little darker
    this.add.image(L.cx, L.height / 2, 'vignette').setDisplaySize(L.width + 8, L.height + 8).setTint(0x8a6a44).setAlpha(0.28);
    for (const [bx, rot, a] of [[L.width * 0.82, 0.42, 0.5], [L.width * 0.5, 0.3, 0.32]] as const) {
      this.add.image(bx, L.top + 60, 'ray').setOrigin(0.5, 0).setRotation(rot).setScale(4.6, 3.4).setTint(0xffffff).setAlpha(a);
    }
    const g = this.add.graphics();
    g.fillStyle(PALETTE.creamDark, 1).fillRect(0, 0, L.width, L.top + 112);
    for (let x = 0; x < L.width; x += 48) g.fillStyle(PALETTE.creamDark, 0.5).fillRect(x, L.top + 112, 24, 6);

    label(this, L.cx, L.top + 58, this.t('museum.title'), { size: 58, color: PALETTE.ink });
    // thirteen layers: rows of five tabs
    const tabW = (L.right - L.left - 40) / TABS_PER_ROW;
    LAYERS.forEach((layer, i) => {
      const x = L.left + 20 + tabW * ((i % TABS_PER_ROW) + 0.5);
      const y = L.top + 150 + Math.floor(i / TABS_PER_ROW) * TAB_STEP;
      const bg = this.add.graphics({ x, y });
      // two-word names go on two lines (never broken inside a word), then shrink to fit
      const name = this.t(`layer.${layer.id}`).replace(' ', '\n');
      const text = label(this, x, y, name, { size: 24, color: PALETTE.ink });
      text.setLineSpacing(-6);
      text.setScale(Math.min(1, (TAB_H - 6) / text.height, (tabW - 18) / text.width));
      this.tabs.push({ bg, text });
      // tabs drop in one after another
      bg.setAlpha(0);
      text.setAlpha(0);
      this.tweens.add({ targets: [bg, text], alpha: 1, delay: 30 * i, duration: 180 });
      hitZone(this, x, y, tabW - 6, TAB_STEP, () => this.selectTab(i));
    });

    this.setBar = progressBar(this, L.cx - 90, L.top + SET_Y, 440, 34, { color: PALETTE.ochre, background: PALETTE.inkSoft });
    this.setText = label(this, L.right - 110, L.top + SET_Y, '', { size: 34, color: PALETTE.ink });
    this.bonusText = label(this, L.cx, L.top + SET_Y + 42, '', { size: 28, color: PALETTE.inkSoft, wrap: L.width - 80 });

    this.grid = this.add.container(0, 0);
    this.backButton = button(this, L.cx, L.bottom - 70, this.t('museum.back'), () => this.goTo(SCENES.dig), { width: 380, height: 104, fontSize: 44 });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ses.flush());
    this.drawTabs();
    this.drawGrid(true);
    // dust in the daylight, drifting up past the cases
    this.motes = new Motes(this, { x: L.left + 10, y: L.top + 130, w: L.right - L.left - 20, h: L.bottom - L.top - 260, count: 14, colors: [0xc9963e, 0xffffff, 0xb07a4a], alpha: 0.5, scale: [0.2, 0.5], rise: -12, depth: 5 });
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
    this.motes.update(Math.min(delta, 250) / 1000);
      // Every find is saved at once and its reveal waits for the dig screen (nothing arrives silently).
    const ses = session(this.oyun);
    const r = this.sim.tick(Math.min(delta, 250) / 1000);
    if (r.finds.length) {
      for (const f of r.finds) {
        ses.queueFind(f);
        if (f.isNew) this.fresh.add(f.fossil.id);
      }
      this.drawGrid();
      if (r.finds.some((f) => f.isNew)) this.drawTabs(false);
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

  /** A layer that holds species the player has not looked at yet (a dot on its tab). */
  private unseenIn(layer: number): boolean {
    return layerFossils(layer).some((f) => this.sim.discovered(f.id) && !this.seen.has(f.id));
  }

  private drawTabs(pop = true): void {
    const L = this.layout;
    const tabW = (L.right - L.left - 40) / TABS_PER_ROW;
    this.tabs.forEach((t, i) => {
      const on = i === this.tab;
      const locked = this.lockedTab(i);
      const done = this.sim.setComplete(i);
      t.bg.clear();
      t.bg.fillStyle(PALETTE.shadow, 0.18).fillRoundedRect(-tabW / 2 + 3, -TAB_H / 2 + 4, tabW - 6, TAB_H, 16);
      t.bg.fillStyle(on ? PALETTE.ochre : locked ? PALETTE.creamDark : 0xffffff, 1).fillRoundedRect(-tabW / 2 + 3, -TAB_H / 2, tabW - 6, TAB_H, 16);
      if (done) t.bg.fillStyle(0xffd23f, 1).fillCircle(tabW / 2 - 12, -TAB_H / 2 + 8, 8);
      // something new waits on this shelf
      if (!on && this.unseenIn(i)) {
        t.bg.fillStyle(0xffffff, 1).fillCircle(-tabW / 2 + 14, -TAB_H / 2 + 8, 10);
        t.bg.fillStyle(0xe2553a, 1).fillCircle(-tabW / 2 + 14, -TAB_H / 2 + 8, 7);
      }
      if (on && pop) this.juice.pop(t.text, 1.15, 200);
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
    // the set bar fills up and its count runs with it (from empty on a new shelf)
    if (force) {
      this.setBar.setValue(0);
      this.setShown = 0;
    }
    for (const tw of this.setTweens) tw?.remove();
    this.setTweens = [
      fillBar(this, this.setBar, prog.found / prog.total, 480, force ? 140 : 0),
      countTo(this, this.setShown, prog.found, 480, (v) => this.setText.setText(this.t('museum.set', { a: Math.round(v), b: prog.total })), prog.total, force ? 140 : 0),
    ];
    this.setShown = prog.found;
    const bonus = at(LAYERS, this.tab).setBonus;
    const bonusValue = bonus.kind === 'offlineCap' ? String(Math.round(bonus.value / 60)) : mult(this, bonus.value);
    const done = this.sim.setComplete(this.tab);
    this.bonusText.setText(`${this.t(`set.${bonus.kind}`, { n: bonusValue })}${done ? ` · ${this.t('set.earned')}` : ''}`);
    this.bonusText.setColor(cssColor(done ? 0x2f8a3c : PALETTE.inkSoft));

    const locked = this.lockedTab(this.tab);
    const top = L.top + SET_Y + 82;
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
      const card = this.card(f, x, y, cardH, locked);
      this.grid.add(card);
      if (force) {
        // cases slide up onto their shelves, left then right, row by row
        card.setAlpha(0).setY(y + 26);
        this.tweens.add({ targets: card, alpha: 1, y, delay: 25 * i, duration: 220, ease: 'Cubic.easeOut' });
      }
      if (!locked && this.fresh.has(f.id)) {
        this.ribbon(card, x, y, cardH, this.stamped.has(f.id) ? -1 : force ? 25 * i + 260 : 0);
        this.stamped.add(f.id);
      }
      if (i === spotAt) {
        const tag = label(this, x + CARD_W / 2 - 12, y - cardH / 2 - 2, this.t('museum.rarest'), { size: 22, color: PALETTE.ink }).setOrigin(1, 0.5);
        tag.setBackgroundColor('#ffd23f').setPadding(8, 2, 8, 2);
        this.grid.add(tag);
      }
    });
    // these have now been looked at: no ribbon on the next visit, no dot on the tab
    const shown = locked ? [] : fs.filter((f) => this.fresh.has(f.id)).map((f) => f.id);
    for (const id of shown) this.seen.add(id);
    markSeen(this.oyun, shown);
    if (done && !this.celebrated(this.tab)) this.time.delayedCall(350, () => this.celebrateSet());
    if (locked) {
      const msg = label(this, L.cx, top + 3 * step - 6, this.t('museum.locked', { n: big(this, this.sim.unlockPowerOf(this.tab)) }), { size: 40, color: PALETTE.ink });
      msg.setStroke(cssColor(PALETTE.cream), 10);
      this.grid.add([this.add.image(L.cx, top + 3 * step - 80, 'lock').setScale(1.4), msg]);
    }
  }

  /**
   * A "New!" ribbon on a case found since the last visit: it stamps on with a few sparks after
   * `delay` ms (once per visit; a negative delay just shows it).
   */
  private ribbon(card: Phaser.GameObjects.Container, x: number, y: number, h: number, delay: number): void {
    const tag = label(this, -CARD_W / 2 + 2, -h / 2 + 4, this.t('reveal.new'), { size: 22, color: 0xffffff }).setOrigin(0, 0.5).setAngle(-7);
    tag.setBackgroundColor('#e2553a').setPadding(8, 2, 8, 2);
    card.add(tag);
    if (this.oyun.reducedMotion || delay < 0) return;
    tag.setVisible(false);
    this.time.delayedCall(delay, () => {
      if (!tag.active) return;
      tag.setVisible(true);
      this.juice.pop(tag, 2.2, 240);
      this.confetti.emit(x - CARD_W / 2 + 40, y - h / 2 + 4, 7, { texture: 'spark', tint: 0xffd23f, speed: [90, 240], life: [0.35, 0.6], scale: [0.4, 0.9], drag: 2 });
    });
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
    // the case gives a little under the finger
    let pressing: Phaser.Tweens.Tween | null = null;
    const press = (to: number): void => {
      if (this.oyun.reducedMotion) return;
      pressing?.remove();
      pressing = this.tweens.add({ targets: c, scale: to, duration: 80, ease: 'Quad.easeOut' });
    };
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      if (!this.detail) press(0.96);
    });
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => press(1));
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      press(1);
      this.openDetail(f);
    });
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
    // rare pieces stand in their own light
    if (found && f.tier >= 2) {
      const rays = this.add.container(L.cx, L.cy - 120);
      for (let i = 0; i < 12; i++) rays.add(this.add.image(0, 0, 'ray').setOrigin(0.5, 0).setAngle(i * 30).setTint(at(TIERS, f.tier).color).setAlpha(0.55).setScale(1.2, 1.05));
      box.add(rays);
      if (!this.oyun.reducedMotion) this.tweens.add({ targets: rays, angle: 360, duration: 26000, repeat: -1 });
    }
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
    if (!this.oyun.reducedMotion) {
      // the room dims, the card pops forward, the notes slide up under it
      shade.setAlpha(0);
      this.tweens.add({ targets: shade, alpha: 1, duration: 180 });
      const iy = info.y;
      info.setAlpha(0).setY(iy + 46);
      this.tweens.add({ targets: info, alpha: 1, y: iy, delay: 90, duration: 240, ease: 'Cubic.easeOut' });
    }
    this.oyun.audio.playPreset(SFX.flip);
    this.detail = box;
  }

  private closeDetail(): void {
    const d = this.detail;
    if (!d) return;
    this.detail = null;
    // stop taking taps at once; the view itself fades away quickly
    for (const o of d.list) if (o.input) o.disableInteractive();
    this.tweens.add({
      targets: d,
      alpha: 0,
      duration: 130,
      onComplete: () => {
        for (const o of d.list) this.tweens.killTweensOf(o); // the slow spin of the rays
        d.destroy();
      },
    });
  }

  protected override testState() {

    if (STORE_BUILD) throw new Error('unreachable'); // store builds: no test hook
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

    if (STORE_BUILD) throw new Error('unreachable'); // store builds: no test hook
    return {
      tab: (p: unknown) => this.selectTab(typeof p === 'number' ? p : 0),
      open: (p: unknown) => this.openDetail(at(layerFossils(this.tab), typeof p === 'number' ? p : 0)),
      close: () => this.closeDetail(),
      back: () => this.backButton.fire(),
    };
  }
}
