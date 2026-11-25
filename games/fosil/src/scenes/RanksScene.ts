import { button, cssColor, iconButton, label, OyunScene, panel, progressBar, toast, type Button, type IconButton, STORE_BUILD } from '@oyun/core';
import type { PauseReason } from '@oyun/core/pure';
import Phaser from 'phaser';
import { badgeKey } from '../art/badges';
import { calmShake, countTo, fillBar, Motes } from '../fx/Motion';
import { Particles } from '../fx/Particles';
import { gameOnline, openOnline } from '../online';
import { backgroundAware, session } from '../session';
import { SFX } from '../sfx';
import { ACHIEVEMENTS, at, EXPEDITION, FOSSIL_BY_ID, LAYERS, RANKS, TIERS } from '../sim/data';
import type { DigSim } from '../sim/dig';
import { fossilKey, PALETTE } from '../textures';
import { SCENES } from './keys';
import { duration, questText } from './progress';
import { big, fitText, fossilName, hitZone, lang, mult, oddsText } from './ui';

type Tab = 'ladder' | 'records' | 'goals';

/** Whole numbers as players read them: 1,000 / 1.000 (never 1.00K for a goal count). */
function count(scene: OyunScene, n: number): string {
  return n < 1e6 ? Math.floor(n).toLocaleString(lang(scene) === 'tr' ? 'tr-TR' : 'en-US') : big(scene, n);
}
const TABS: readonly Tab[] = ['ladder', 'records', 'goals'];

/**
 * Your own progress, never anyone else's: the rank ladder with the score breakdown, the records
 * board of your bests, the goals list, and the expedition. Test actions: tab {name}, expedition,
 * confirm, cancel, back, online, scroll {px}.
 */
export class RanksScene extends OyunScene {
  protected override autoPause = true;
  private sim!: DigSim;
  private tab: Tab = 'ladder';
  private body!: Phaser.GameObjects.Container;
  private tabs: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; id: Tab }[] = [];
  private backButton!: Button;
  private onlineButton!: IconButton;
  private expButton!: Button;
  private confirm: { box: Phaser.GameObjects.Container; go: Button; cancel: Button } | null = null;
  private scroll = { y: 0, max: 0, list: null as Phaser.GameObjects.Container | null, top: 0, bottom: 0 };
  private fx!: Particles;
  private bodyKey = '';
  private motes!: Motes;
  /** Counts, fills and pulses of the page on show: cancelled when the page is redrawn. */
  private bodyTweens: (Phaser.Tweens.Tween | null)[] = [];
  /** Score and bar fill the ladder card last showed (a live update continues from them). */
  private scoreShown = 0;
  private barShown = 0;

  constructor() {
    super(SCENES.ranks);
  }

  create(data?: { tab?: Tab }): void {
    const ses = session(this.oyun);
    this.sim = ses.sim;
    this.tab = data?.tab ?? 'ladder';
    this.tabs = [];
    this.confirm = null;
    this.bodyKey = '';
    this.scroll = { y: 0, max: 0, list: null, top: 0, bottom: 0 };
    this.fx = new Particles(this, 90, 990);
    this.bodyTweens = [];
    this.scoreShown = 0;
    this.barShown = 0;
    calmShake(this);
    const L = this.layout;
    this.cameras.main.setBackgroundColor(0x241812);
    // a lamp-lit trophy room: a warm pool of light in the middle, dark corners, gold dust in the air
    this.add.image(L.cx, L.top + 420, 'glow').setTint(0xd99a3e).setScale(9, 8).setAlpha(0.2);
    this.add.image(L.cx, L.height / 2, 'vignette').setDisplaySize(L.width + 8, L.height + 8).setTint(0x000000).setAlpha(0.55);
    this.motes = new Motes(this, { x: L.left + 10, y: L.top + 120, w: L.right - L.left - 20, h: L.bottom - L.top - 250, count: 12, colors: [PALETTE.ochreLight, 0xffffff], alpha: 0.5, texture: 'spark', scale: [0.2, 0.45], rise: -10, additive: true });
    const g = this.add.graphics();
    g.fillStyle(0x3a2618, 1).fillRect(0, 0, L.width, L.top + 112);
    label(this, L.cx, L.top + 58, this.t('ranks.title'), { size: 58, color: PALETTE.ochreLight });
    // Online ranking (Google Play Games): the shared panel from @oyun/core/online.
    this.onlineButton = iconButton(this, L.right - 64, L.top + 58, 'globe', () => openOnline(this.oyun), 88);
    void gameOnline(this.oyun).sync();
    const tabW = (L.right - L.left - 40) / TABS.length;
    TABS.forEach((id, i) => {
      const x = L.left + 20 + tabW * (i + 0.5);
      const y = L.top + 160;
      const bg = this.add.graphics({ x, y });
      const key = id === 'ladder' ? 'ranks.tabRank' : id === 'records' ? 'ranks.tabRecords' : 'ranks.tabGoals';
      const text = label(this, x, y, this.t(key), { size: 32, color: PALETTE.ink });
      fitText(text, tabW - 24);
      this.tabs.push({ bg, text, id });
      hitZone(this, x, y, tabW - 8, 76, () => this.selectTab(id));
    });
    this.body = this.add.container(0, 0);
    this.backButton = button(this, L.cx - 170, L.bottom - 70, this.t('museum.back'), () => this.goTo(SCENES.dig), { width: 300, height: 104, fontSize: 42, variant: 'secondary' });
    this.expButton = button(this, L.cx + 170, L.bottom - 70, this.t('exp.title'), () => this.openConfirm(), { width: 320, height: 104, fontSize: 38 });
    if (this.sim.canExpedition) this.tweens.add({ targets: this.expButton, scale: 1.05, yoyo: true, repeat: -1, duration: 650 });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.scroll.list || this.confirm) return;
      this.scrollBy(p.prevPosition.y - p.position.y);
    });
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.scrollBy(dy));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ses.flush());
    this.drawTabs();
    this.drawBody(true);
  }

  override update(_t: number, delta: number): void {
    const dt = Math.min(delta, 250) / 1000;
    this.fx.update(dt);
    this.motes.update(dt);
    if (this.confirm) return;
    // the dig goes on while you read: finds and events wait for the dig screen
    const ses = session(this.oyun);
    const r = this.sim.tick(dt);
    for (const f of r.finds) ses.queueFind(f);
    ses.queueEvents(r.events);
    if (r.finds.length || r.events.length) this.drawBody();
    ses.autosave();
  }

  protected override onPlatformPause(reason: PauseReason): void {
    if (backgroundAware(reason)) session(this.oyun).background();
    else session(this.oyun).flush();
    super.onPlatformPause(reason);
  }

  protected override onPlatformResume(reason: PauseReason): void {
    if (backgroundAware(reason)) session(this.oyun).foreground();
    super.onPlatformResume(reason);
  }

  private selectTab(id: Tab): void {
    if (this.confirm || id === this.tab) return;
    this.tab = id;
    this.oyun.audio.play('tap');
    this.drawTabs();
    this.drawBody(true);
  }

  private drawTabs(): void {
    const L = this.layout;
    const tabW = (L.right - L.left - 40) / TABS.length;
    for (const t of this.tabs) {
      const on = t.id === this.tab;
      t.bg.clear();
      t.bg.fillStyle(0x000000, 0.3).fillRoundedRect(-tabW / 2 + 4, -34, tabW - 8, 72, 20);
      t.bg.fillStyle(on ? PALETTE.ochre : PALETTE.dirtLight, 1).fillRoundedRect(-tabW / 2 + 4, -38, tabW - 8, 72, 20);
      t.text.setColor(cssColor(on ? PALETTE.ink : 0xffffff));
    }
    this.expButton.setAlpha(this.sim.canExpedition ? 1 : 0.6);
  }

  private drawBody(force = false): void {
    const key = `${this.tab}|${this.sim.score.total}|${this.sim.quests.length}|${this.sim.records.rare.length}`;
    if (!force && key === this.bodyKey) return;
    this.bodyKey = key;
    for (const tw of this.bodyTweens) tw?.remove();
    this.bodyTweens = [];
    this.body.removeAll(true);
    this.scroll.list = null;
    if (force) {
      this.scoreShown = 0;
      this.barShown = 0;
    }
    if (this.tab === 'ladder') this.drawLadder(force);
    else if (this.tab === 'records') this.drawRecords();
    else this.drawGoals(force);
    if (force) {
      // the page slides in, its parts one after another
      this.body.list.forEach((o, i) => {
        const t = o as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Alpha;
        if (typeof t.setAlpha !== 'function') return;
        const y = t.y;
        t.setAlpha(0).setY(y + 24);
        this.tweens.add({ targets: t, alpha: 1, y, delay: Math.min(400, i * 12), duration: 220, ease: 'Cubic.easeOut' });
      });
    }
  }

  // ------------------------------------------------------------------ ladder

  private drawLadder(fresh: boolean): void {
    const L = this.layout;
    const s = this.sim;
    const score = s.score;
    const rank = s.rank;
    const r = at(RANKS, rank);
    const next = RANKS[rank + 1];
    const top = L.top + 220;
    // your card: badge, name, score, progress to the next rank, and what the score is made of
    const card = panel(this, L.cx, top + 150, L.width - 40, 300, { color: PALETTE.dirtLight });
    this.body.add(card);
    // your badge sits in its own light and lands with a pop; the score counts up and the bar fills
    const motion = !this.oyun.reducedMotion;
    const halo = this.add.image(-L.width / 2 + 120, -60, 'glow').setTint(r.color).setScale(1.9).setAlpha(0.5);
    const badge = this.add.image(-L.width / 2 + 120, -60, badgeKey(this, rank)).setScale(0.95);
    card.add([halo, badge]);
    if (motion) {
      this.bodyTweens.push(this.tweens.add({ targets: halo, alpha: 0.8, scale: 2.2, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      if (fresh) {
        badge.setScale(0.3).setAngle(-25);
        this.bodyTweens.push(this.tweens.add({ targets: badge, scale: 0.95, angle: 0, delay: 120, duration: 420, ease: 'Back.easeOut' }));
      }
    }
    const name = label(this, -L.width / 2 + 220, -100, this.t(`rank.${r.id}`), { size: 40, color: r.color }).setOrigin(0, 0.5);
    fitText(name, L.width - 280);
    const sc = label(this, -L.width / 2 + 220, -52, this.t('ranks.score', { n: big(this, score.total) }), { size: 30, color: 0xffffff }).setOrigin(0, 0.5);
    fitText(sc, L.width - 280);
    card.add([name, sc]);
    const barW = L.width - 300;
    const bar = progressBar(this, -L.width / 2 + 220 + barW / 2, -10, barW, 26, { color: r.color });
    const lo = r.score;
    const fill = next ? (score.total - lo) / (next.score - lo) : 1;
    bar.setValue(Math.min(this.barShown, fill));
    card.add(bar);
    this.bodyTweens.push(
      fillBar(this, bar, fill, 520, fresh ? 160 : 0),
      countTo(this, Math.min(this.scoreShown, score.total), score.total, 520, (v) => {
        if (sc.active) fitText(sc.setText(this.t('ranks.score', { n: big(this, Math.round(v)) })), L.width - 280);
      }, 16, fresh ? 160 : 0),
    );
    this.scoreShown = score.total;
    this.barShown = fill;
    const nextText = label(this, -L.width / 2 + 220, 24, next ? this.t('ranks.next', { n: big(this, next.score - score.total), name: this.t(`rank.${next.id}`) }) : this.t('ranks.top'), { size: 24, color: PALETTE.sand }).setOrigin(0, 0.5);
    fitText(nextText, barW);
    card.add(nextText);
    const parts: [string, number][] = [
      ['score.species', score.species],
      ['score.grades', score.grades],
      ['score.sets', score.sets],
      ['score.depth', score.depth],
      ['score.relics', score.relics],
      ['score.expeditions', score.expeditions],
    ];
    parts.forEach(([k, v], i) => {
      const x = -L.width / 2 + 40 + (i % 2) * ((L.width - 80) / 2);
      const y = 66 + Math.floor(i / 2) * 30; // the third row stays inside the card
      const t = label(this, x, y, `${this.t(k)}  ${big(this, v)}`, { size: 24, color: 0xffffff }).setOrigin(0, 0.5);
      fitText(t, (L.width - 100) / 2);
      card.add(t);
    });

    // the whole ladder, lowest at the bottom, your rung marked
    const listTop = top + 318;
    const rowH = Math.min(56, (L.bottom - 172 - listTop) / RANKS.length);
    RANKS.forEach((rk, i) => {
      const y = listTop + (RANKS.length - 1 - i) * rowH + rowH / 2;
      const mine = i === rank;
      const reached = i <= rank;
      const g = this.add.graphics();
      g.fillStyle(mine ? rk.color : 0x000000, mine ? 0.35 : 0.2).fillRoundedRect(L.left + 20, y - rowH / 2 + 3, L.right - L.left - 40, rowH - 6, 14);
      if (mine) {
        g.lineStyle(4, rk.color, 1).strokeRoundedRect(L.left + 20, y - rowH / 2 + 3, L.right - L.left - 40, rowH - 6, 14);
        // your rung breathes, so the eye finds it in the ladder
        const lit = this.add.graphics();
        lit.fillStyle(rk.color, 0.22).fillRoundedRect(L.left + 20, y - rowH / 2 + 3, L.right - L.left - 40, rowH - 6, 14);
        this.body.add(lit);
        if (motion) this.bodyTweens.push(this.tweens.add({ targets: lit, alpha: 0.15, duration: 900, delay: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      }
      const icon = this.add.image(L.left + 60, y, badgeKey(this, i)).setScale((rowH - 8) / 160);
      if (!reached) icon.setAlpha(0.35);
      const n = label(this, L.left + 100, y, this.t(`rank.${rk.id}`), { size: Math.min(28, rowH * 0.5), color: reached ? 0xffffff : PALETTE.sand }).setOrigin(0, 0.5);
      fitText(n, L.width - 330);
      const pts = label(this, L.right - 40, y, big(this, rk.score), { size: Math.min(26, rowH * 0.46), color: reached ? rk.color : PALETTE.sand }).setOrigin(1, 0.5);
      this.body.add([g, icon, n, pts]);
      if (mine) {
        const you = label(this, L.right - 150, y, this.t('ranks.you'), { size: 22, color: PALETTE.ink }).setOrigin(1, 0.5);
        you.setBackgroundColor(cssColor(PALETTE.ochreLight)).setPadding(8, 2, 8, 2);
        this.body.add(you);
      }
    });
    const rule = label(this, L.cx, L.bottom - 148, this.t('ranks.rule'), { size: 20, color: PALETTE.sand, wrap: L.width - 60 });
    this.body.add(rule);
  }

  // ------------------------------------------------------------------ records

  private drawRecords(): void {
    const L = this.layout;
    const s = this.sim;
    let y = L.top + 230;
    const head = (key: 'rec.rare' | 'rec.sets' | 'rec.expedition'): void => {
      this.body.add(label(this, L.left + 30, y, this.t(key), { size: 34, color: PALETTE.ochreLight }).setOrigin(0, 0.5));
      y += 64;
    };
    const none = (): void => {
      this.body.add(label(this, L.left + 40, y, this.t('rec.none'), { size: 26, color: PALETTE.sand }).setOrigin(0, 0.5));
      y += 44;
    };
    head('rec.rare');
    const rare = s.records.rare;
    if (rare.length === 0) none();
    const dateFmt = new Intl.DateTimeFormat(lang(this) === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    for (const rec of rare) {
      const f = FOSSIL_BY_ID.get(rec.id);
      if (!f) continue;
      const tier = at(TIERS, f.tier);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.25).fillRoundedRect(L.left + 20, y - 34, L.right - L.left - 40, 68, 16);
      g.lineStyle(3, tier.color, 1).strokeRoundedRect(L.left + 20, y - 34, L.right - L.left - 40, 68, 16);
      const icon = this.add.image(L.left + 64, y, fossilKey(f.id)).setScale(0.34);
      const n = label(this, L.left + 110, y - 14, fossilName(this, f), { size: 26, color: 0xffffff }).setOrigin(0, 0.5);
      fitText(n, L.width - 360);
      const o = label(this, L.left + 110, y + 16, oddsText(this, f.odds), { size: 24, color: tier.color }).setOrigin(0, 0.5);
      const d = label(this, L.right - 36, y, rec.at > 0 ? dateFmt.format(new Date(rec.at)) : this.t('rec.noDate'), { size: 22, color: PALETTE.sand }).setOrigin(1, 0.5);
      this.body.add([g, icon, n, o, d]);
      y += 76;
    }
    y += 10;
    head('rec.sets');
    const sets = Object.entries(s.records.sets).sort((a, b) => a[1] - b[1]);
    if (sets.length === 0) none();
    for (const [layer, secs] of sets.slice(0, 5)) {
      const t = label(this, L.left + 40, y, `${this.t(`layer.${at(LAYERS, Number(layer)).id}`)} · ${duration(this, secs)}`, { size: 26, color: 0xffffff }).setOrigin(0, 0.5);
      fitText(t, L.width - 80);
      this.body.add(t);
      y += 40;
    }
    y += 10;
    head('rec.expedition');
    if (s.bestExpedition > 0) {
      this.body.add(label(this, L.left + 40, y, `${duration(this, s.bestExpedition)} · ${this.t('exp.badge', { n: s.expeditions + 1 })}`, { size: 26, color: 0xffffff }).setOrigin(0, 0.5));
      y += 40;
    } else none();
  }

  // ------------------------------------------------------------------ goals

  private drawGoals(fresh: boolean): void {
    const L = this.layout;
    const s = this.sim;
    const top = L.top + 210;
    const bottom = L.bottom - 140;
    const list = this.add.container(0, 0);
    // unfinished first (closest to done on top), then the earned ones
    const rows = [...ACHIEVEMENTS].sort((a, b) => {
      const da = s.quests.includes(a.id) ? 1 : 0;
      const db = s.quests.includes(b.id) ? 1 : 0;
      if (da !== db) return da - db;
      return s.questProgress(b) / b.target - s.questProgress(a) / a.target;
    });
    const rowH = 92;
    rows.forEach((a, i) => {
      const y = i * rowH + rowH / 2;
      const done = s.quests.includes(a.id);
      const g = this.add.graphics();
      g.fillStyle(done ? 0x2f5a2a : 0x000000, done ? 0.6 : 0.25).fillRoundedRect(L.left + 20, y - rowH / 2 + 5, L.right - L.left - 40, rowH - 10, 16);
      const t = label(this, L.left + 40, y - 16, questText(this, a), { size: 28, color: 0xffffff }).setOrigin(0, 0.5);
      fitText(t, L.width - 260);
      const reward = label(this, L.right - 40, y - 16, done ? this.t('quest.done') : this.t('quest.reward', { n: big(this, a.reward * s.blockDust(s.unlocked)) }), { size: 24, color: done ? 0x9fe08a : PALETTE.dust }).setOrigin(1, 0.5);
      const p = Math.min(a.target, s.questProgress(a));
      const bar = progressBar(this, L.left + 40 + (L.width - 260) / 2, y + 20, L.width - 260, 16, { color: done ? 0x9fe08a : PALETTE.ochre });
      // the rows on screen fill their bars one after another; the rest are simply set
      if (fresh && i < 11) {
        bar.setValue(0);
        this.bodyTweens.push(fillBar(this, bar, p / a.target, 420, 140 + i * 40));
      } else bar.setValue(p / a.target);
      const pt = label(this, L.right - 40, y + 20, `${count(this, p)}/${count(this, a.target)}`, { size: 22, color: PALETTE.sand }).setOrigin(1, 0.5);
      const row = this.add.container(0, 0, [g, t, reward, bar, pt]);
      row.setData('y', y);
      list.add(row);
    });
    this.body.add(list);
    this.scroll = { y: 0, max: Math.max(0, rows.length * rowH - (bottom - top)), list, top, bottom };
    this.scrollBy(0);
  }

  /** Rows move with the scroll; only rows wholly inside the window show (no masks needed). */
  private scrollBy(dy: number): void {
    const sc = this.scroll;
    if (!sc.list) return;
    sc.y = Phaser.Math.Clamp(sc.y + dy, 0, sc.max);
    for (const o of sc.list.list) {
      const row = o as Phaser.GameObjects.Container;
      const y = sc.top + (row.getData('y') as number) - sc.y;
      row.setY(y - (row.getData('y') as number));
      row.setVisible(y - 46 >= sc.top - 1 && y + 46 <= sc.bottom + 1);
    }
  }

  // ------------------------------------------------------------------ expedition

  private openConfirm(): void {
    if (this.confirm) return;
    if (!this.sim.canExpedition) {
      toast(this, this.t('exp.locked', { name: this.t(`layer.${at(LAYERS, EXPEDITION.needLayer).id}`) }), { position: Math.round(this.layout.bottom - 190) });
      return;
    }
    const L = this.layout;
    const s = this.sim;
    const box = this.add.container(0, 0).setDepth(950);
    const shade = this.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, 0x000000, 0.8).setInteractive();
    shade.setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 180 });
    const texts: Phaser.GameObjects.Text[] = [];
    const now = s.expeditionMult;
    const after = 1 + EXPEDITION.power * (s.expeditions + 1);
    const lines: [string, number, number][] = [
      [this.t('exp.title'), 52, PALETTE.ochreLight],
      [this.t('exp.keep'), 28, 0x9fe08a],
      [this.t('exp.reset'), 28, PALETTE.sand],
      [this.t('exp.gain', { a: mult(this, now), b: mult(this, after) }), 30, 0xffd23f],
      [this.t('exp.harder', { n: s.expeditions + 2, h: mult(this, 1 + EXPEDITION.hard * (s.expeditions + 1)) }), 28, 0xffffff],
    ];
    for (const [text, size, color] of lines) texts.push(label(this, 0, 0, text, { size, color, wrap: L.width - 140 }).setOrigin(0.5, 0));
    // the card grows with its text; the buttons sit under the last line
    const textH = texts.reduce((a, t) => a + t.height + 22, 0);
    const cardH = 50 + textH + 230;
    const cardY = L.cy - 20;
    const card = panel(this, L.cx, cardY, L.width - 60, cardH, { color: PALETTE.dirtLight });
    let y = -cardH / 2 + 50;
    for (const t of texts) {
      t.setY(y);
      card.add(t);
      y += t.height + 22;
    }
    const go = button(this, L.cx, cardY + y + 60, this.t('exp.go'), () => this.startExpedition(), { width: 460, height: 100 });
    const cancel = button(this, L.cx, cardY + y + 170, this.t('exp.cancel'), () => this.closeConfirm(), { width: 360, height: 88, fontSize: 34, variant: 'secondary' });
    box.add([shade, card, go, cancel]);
    this.juice.pop(card, 0.5, 300);
    this.oyun.audio.playPreset(SFX.flip);
    this.confirm = { box, go, cancel };
  }

  private closeConfirm(): void {
    const c = this.confirm;
    if (!c) return;
    this.confirm = null;
    // out of the way at once for input, then a quick fade
    for (const o of c.box.list) if (o.input) o.disableInteractive();
    this.tweens.add({ targets: c.box, alpha: 0, duration: 140, onComplete: () => c.box.destroy() });
  }

  /** The descent: the world drops away through every stratum, then a new, deeper Topsoil. */
  private startExpedition(): void {
    const s = this.sim;
    if (!s.expedition()) return;
    const ses = session(this.oyun);
    ses.queueEvents(s.lastEvents);
    ses.flush();
    this.oyun.platform.track('expedition', { count: s.expeditions, score: s.score.total });
    this.closeConfirm();
    const L = this.layout;
    const g = this.add.graphics().setDepth(1000);
    const h = L.height;
    LAYERS.forEach((layer, i) => {
      for (let k = 0; k < 3; k++) g.fillStyle(at(layer.bands, k + 1), 1).fillRect(-20, (i * 3 + k) * (h / 6), L.width + 40, h / 6 + 2);
    });
    g.setY(h);
    this.oyun.audio.playPreset(SFX.rankUp);
    this.oyun.platform.haptic('heavy');
    this.tweens.add({
      targets: g,
      y: -((LAYERS.length * 3) / 6) * h,
      duration: 1600,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, 0x120c08, 1).setDepth(999);
        const title = label(this, L.cx, L.cy, this.t('exp.started', { n: s.expeditions, s: s.expeditions + 1 }), { size: 52, color: 0xffd23f, wrap: L.width - 80 }).setDepth(1001);
        title.setStroke(cssColor(PALETTE.shadow), 10);
        this.juice.pop(title, 0.3, 400);
        for (let k = 0; k < 6; k++) this.fx.emit(L.left + 60 + k * 120, L.top + 60, 8, { texture: k % 2 ? 'spark' : 'chip', tint: [0xffd23f, 0xf0445f, 0x3d8bf0, 0x4fbf6a][k % 4], speed: [120, 380], angle: Math.PI / 2, spread: 1.6, gravity: 500, life: [1.6, 2.4], scale: [0.6, 1.1], spin: 8, fadeTail: 0.4 });
        this.oyun.platform.haptic('success');
        this.time.delayedCall(1600, () => this.goTo(SCENES.dig));
      },
    });
  }

  protected override testState() {

    if (STORE_BUILD) throw new Error('unreachable'); // store builds: no test hook
    const s = this.sim;
    return {
      tab: this.tab,
      score: s.score.total,
      rank: s.rank,
      rankId: at(RANKS, s.rank).id,
      ranks: RANKS.length,
      records: s.records.rare.length,
      goals: ACHIEVEMENTS.length,
      goalsDone: s.quests.length,
      canExpedition: s.canExpedition,
      confirm: this.confirm !== null,
      expeditions: s.expeditions,
      scroll: { y: Math.round(this.scroll.y), max: Math.round(this.scroll.max) },
      ui: {
        back: { x: Math.round(this.backButton.x), y: Math.round(this.backButton.y) },
        expedition: { x: Math.round(this.expButton.x), y: Math.round(this.expButton.y) },
      },
    };
  }

  protected override testActions() {

    if (STORE_BUILD) throw new Error('unreachable'); // store builds: no test hook
    return {
      tab: (p: unknown) => this.selectTab(TABS.includes(p as Tab) ? (p as Tab) : 'ladder'),
      expedition: () => this.expButton.fire(),
      confirm: () => this.confirm?.go.fire(),
      cancel: () => this.confirm?.cancel.fire(),
      back: () => this.backButton.fire(),
      online: () => this.onlineButton.fire(),
      scroll: (p: unknown) => this.scrollBy(typeof p === 'number' ? p : 200),
    };
  }
}
