import { button, cssColor, label, OyunScene, type Button } from '@oyun/core';
import type Phaser from 'phaser';
import { THEMES } from '../anim/themes';
import { gameSave } from '../save';
import { CHAPTERS } from '../sim/chapters';
import { BOSS_KINDS } from '../sim/world';
import { FEATS, progressScore, RANKS, rankOf, SCORE, toNextRank } from '../sim/progress';
import { PALETTE } from '../textures';
import { drawBadge } from './gear';
import { fitButton } from './GameScene';
import { SCENES } from './keys';
import { drawThemeBack } from './worlds';

type Tab = 'ladder' | 'records' | 'feats';

/**
 * The personal rank ladder (score, its breakdown, every rank and what the next one needs),
 * the records board of the player's own bests with dates, and the achievements.
 * There are no other players: nothing here is invented. Test actions: tab <name>, back.
 */
export class RanksScene extends OyunScene {
  private tab: Tab = 'ladder';
  private ui!: Phaser.GameObjects.Container;
  private tabBtns = new Map<Tab, Button>();
  private badgeG!: Phaser.GameObjects.Graphics;
  private from: 'game' | 'result' = 'game';

  constructor() {
    super(SCENES.ranks);
  }

  init(data: { from?: 'game' | 'result'; tab?: Tab }): void {
    this.from = data?.from ?? 'game';
    this.tab = data?.tab ?? 'ladder';
  }

  create(): void {
    const L = this.layout;
    const th = THEMES[3]!;
    this.cameras.main.setBackgroundColor(th.skyTop);
    const bg = this.add.graphics();
    drawThemeBack(bg, th, 720, 1280);
    this.add.rectangle(L.cx, L.cy, 720, 2000, PALETTE.ink, 0.45);
    label(this, L.cx, L.top + 66, this.t('ranks.title'), { size: 58, color: PALETTE.cream }).setStroke(cssColor(PALETTE.ink), 14);
    this.tabBtns.clear();
    (['ladder', 'records', 'feats'] as const).forEach((t, i) => {
      const key = t === 'ladder' ? 'ranks.tabLadder' : t === 'records' ? 'ranks.tabRecords' : 'ranks.tabFeats';
      const b = fitButton(button(this, L.cx + (i - 1) * 222, L.top + 156, this.t(key), () => this.setTab(t), { width: 210, height: 84, fontSize: 34, variant: 'secondary' }), 210);
      this.tabBtns.set(t, b);
    });
    this.badgeG = this.add.graphics().setDepth(2);
    this.ui = this.add.container(0, 0);
    button(this, L.cx, L.bottom - 66, this.t('shop.back'), () => this.goTo(SCENES.game, {}), { width: 320, height: 92, variant: 'secondary', hotkey: 'ESC' });
    this.setTab(this.tab);
  }

  private setTab(t: Tab): void {
    this.tab = t;
    for (const [k, b] of this.tabBtns) b.setAlpha(k === t ? 1 : 0.55);
    this.ui.removeAll(true);
    if (t === 'ladder') this.buildLadder();
    else if (t === 'records') this.buildRecords();
    else this.buildFeats();
  }

  private text(x: number, y: number, s: string, size: number, color: number, origin = 0.5, wrap?: number): Phaser.GameObjects.Text {
    const tx = label(this, x, y, s, { size, color, ...(wrap ? { wrap, align: origin === 0 ? 'left' : 'center' } : {}) }).setOrigin(origin, 0.5).setStroke(cssColor(PALETTE.ink), Math.max(4, Math.round(size / 5)));
    this.ui.add(tx);
    return tx;
  }

  private buildLadder(): void {
    const L = this.layout;
    const save = gameSave(this.oyun).data;
    const s = progressScore(save);
    const r = rankOf(s.total);
    this.text(L.cx + 40, L.top + 256, this.t(`rank.${RANKS[r]!.id}`), 50, PALETTE.gold);
    this.text(L.cx + 40, L.top + 306, this.t('ranks.score', { n: s.total }), 34, PALETTE.cream);
    const need = toNextRank(s.total);
    this.text(L.cx, L.top + 350, need === null ? this.t('ranks.top') : this.t('ranks.next', { n: need, r: this.t(`rank.${RANKS[r + 1]!.id}`) }), 30, PALETTE.heal);
    // what the score is made of
    const parts: [string, number, number][] = [
      ['chapters', s.chapters, SCORE.chapter],
      ['bosses', s.bosses, SCORE.boss],
      ['bow', s.bow, SCORE.bow],
      ['wave', s.wave, SCORE.wave],
      ['feats', s.feats, SCORE.feat],
    ];
    const g = this.add.graphics();
    this.ui.add(g);
    parts.forEach(([k, pts, per], i) => {
      const y = L.top + 410 + i * 42;
      g.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(60, y - 18, 600, 36, 14);
      this.text(80, y, this.t(`ranks.part.${k}`, { k: per }), 28, PALETTE.cream, 0);
      this.text(640, y, String(pts), 30, PALETTE.gold, 1);
    });
    // the ladder: two columns of six
    const top = L.top + 650;
    const rowH = Math.min(88, (L.bottom - 140 - top) / Math.ceil(RANKS.length / 2));
    RANKS.forEach((rk, i) => {
      const col = Math.floor(i / Math.ceil(RANKS.length / 2));
      const row = i % Math.ceil(RANKS.length / 2);
      const x = 70 + col * 330;
      const y = top + row * rowH;
      const here = i === r;
      g.fillStyle(here ? PALETTE.gold : PALETTE.ink, here ? 0.35 : 0.5).fillRoundedRect(x - 40, y - rowH / 2 + 4, 310, rowH - 8, 16);
      this.text(x + 46, y - 12, this.t(`rank.${rk.id}`), 28, i <= r ? PALETTE.cream : PALETTE.locked, 0);
      this.text(x + 46, y + 18, this.t('ranks.at', { n: rk.at }), 24, i <= r ? PALETTE.gold : PALETTE.locked, 0);
    });
  }

  private buildRecords(): void {
    const L = this.layout;
    const rec = gameSave(this.oyun).data.records;
    const g = this.add.graphics();
    this.ui.add(g);
    const row = (y: number, left: string, right: string, date: string): void => {
      g.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(40, y - 21, 640, 42, 14);
      this.text(60, y, left, 28, PALETTE.cream, 0, 330);
      this.text(560, y, right, 28, right === this.t('rec.none') ? PALETTE.locked : PALETTE.gold, 1);
      this.text(668, y, date ? date.slice(5) : '', 22, PALETTE.locked, 1);
    };
    let y = L.top + 250;
    this.text(L.cx, y, this.t('rec.bestsTitle'), 34, PALETTE.heal);
    y += 52;
    for (let c = 0; c < CHAPTERS; c++) {
      const r = rec.chapter[c]!;
      row(y, this.t('rec.chapter', { c: this.t(`chapter.${c}`) }), r.n === 0 ? this.t('rec.none') : r.n > 7 ? this.t('rec.cleared') : this.t('rec.stage', { n: r.n }), r.date);
      y += 46; // six chapters: rows packed tighter
    }
    y += 16;
    this.text(L.cx, y, this.t('rec.bossTitle'), 34, PALETTE.heal);
    y += 52;
    for (let c = 0; c < CHAPTERS; c++) {
      const r = rec.bossTime[c]!;
      row(y, this.t('rec.boss', { b: this.t(`boss.${BOSS_KINDS[c]!}`) }), r.n === 0 ? this.t('rec.none') : this.t('rec.sec', { n: r.n }), r.date);
      y += 46; // six chapters: rows packed tighter
    }
    y += 16;
    this.text(L.cx, y, this.t('rec.moreTitle'), 34, PALETTE.heal);
    y += 52;
    for (const [key, r] of [
      ['rec.chain', rec.headChain],
      ['rec.streak', rec.streak],
      ['rec.kos', rec.runKos],
      ['rec.endless', rec.endless],
    ] as const) {
      if (y > L.bottom - 150) break;
      row(y, this.t(key), r.n === 0 ? this.t('rec.none') : String(r.n), r.date);
      y += 46; // six chapters: rows packed tighter
    }
  }

  private buildFeats(): void {
    const L = this.layout;
    const save = gameSave(this.oyun).data;
    const g = this.add.graphics();
    this.ui.add(g);
    this.text(L.cx, L.top + 246, this.t('ranks.featCount', { n: save.feats.length, m: FEATS.length, c: SCORE.feat }), 28, PALETTE.cream);
    const top = L.top + 300;
    const rows = Math.ceil(FEATS.length / 2);
    const rowH = Math.min(84, (L.bottom - 140 - top) / rows);
    FEATS.forEach((f, i) => {
      const col = i % 2;
      const r = Math.floor(i / 2);
      const x = 22 + col * 342;
      const y = top + r * rowH + rowH / 2;
      const on = save.feats.includes(f.id);
      g.fillStyle(on ? PALETTE.gold : PALETTE.ink, on ? 0.3 : 0.5).fillRoundedRect(x, y - rowH / 2 + 3, 334, rowH - 6, 14);
      // a star: gold when earned
      const sx = x + 30;
      g.fillStyle(PALETTE.ink, 1).fillCircle(sx, y, 18);
      g.fillStyle(on ? PALETTE.gold : PALETTE.pipOff, 1);
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
        g.fillTriangle(sx, y, sx + Math.cos(a - 0.35) * 6, y + Math.sin(a - 0.35) * 6, sx + Math.cos(a) * 14, y + Math.sin(a) * 14);
        g.fillTriangle(sx, y, sx + Math.cos(a + 0.35) * 6, y + Math.sin(a + 0.35) * 6, sx + Math.cos(a) * 14, y + Math.sin(a) * 14);
      }
      this.text(x + 56, y - 14, this.t(`feat.${f.id}.name`), 27, on ? PALETTE.cream : PALETTE.locked, 0, 268);
      this.text(x + 56, y + 16, `${this.t(`feat.${f.id}.desc`)} · +${f.coins}`, 22, on ? PALETTE.gold : PALETTE.locked, 0, 268);
    });
  }

  override update(time: number): void {
    const L = this.layout;
    const g = this.badgeG;
    g.clear();
    if (this.tab !== 'ladder') return;
    const save = gameSave(this.oyun).data;
    const r = rankOf(progressScore(save).total);
    const t = time / 1000;
    drawBadge(g, 150, L.top + 280, 52, r, t);
    const top = L.top + 650;
    const rowH = Math.min(88, (L.bottom - 140 - top) / Math.ceil(RANKS.length / 2));
    RANKS.forEach((_rk, i) => {
      const col = Math.floor(i / Math.ceil(RANKS.length / 2));
      const row = i % Math.ceil(RANKS.length / 2);
      drawBadge(g, 70 + col * 330, top + row * rowH, 24, i, t, i > r);
    });
  }

  protected override testState() {
    const save = gameSave(this.oyun).data;
    const s = progressScore(save);
    return { tab: this.tab, score: s.total, rank: RANKS[rankOf(s.total)]!.id, from: this.from, feats: save.feats.length };
  }

  protected override testActions() {
    return {
      tab: (p: unknown) => this.setTab((String(p) as Tab) || 'ladder'),
      back: () => this.goTo(SCENES.game, {}),
    };
  }
}
