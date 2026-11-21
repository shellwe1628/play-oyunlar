/**
 * Ranks: a personal ladder (no other players, no leaderboard rows): the current badge, score and
 * what the next rank needs; tabs for the whole ladder with the score breakdown, the records board
 * (best per level with attempts and date, endless height, daily history) and the feats.
 * Test actions: tab, world, back.
 */
import { OyunScene, touchHitSize } from '@oyun/core';
import Phaser from 'phaser';
import { Backdrop } from '../render/Backdrop';
import { ensureBadges } from '../render/badges';
import { ensureCanvasArt } from '../render/canvasArt';
import { gameOnline, openOnline } from '../online';
import { gameSave } from '../save';
import { WORLD_COUNT, WORLD_SIZE } from '../sim/levels';
import { ACHIEVEMENTS, nextRank, progressScore, RANKS, rankOf, scoreParts, totalStars } from '../sim/meta';
import { PALETTE, PALETTES } from '../textures';
import { bigText, fitText, IconTile } from '../ui';
import type { GameStart } from './GameScene';
import { SCENES } from './keys';

type Tab = 'ladder' | 'records' | 'feats';

export class RanksScene extends OyunScene {
  private backdrop!: Backdrop;
  private back!: IconTile;
  private online!: IconTile;
  private page!: Phaser.GameObjects.Container;
  private tabs: Phaser.GameObjects.Container[] = [];
  private badge!: Phaser.GameObjects.Image;
  private tab: Tab = 'ladder';
  private recWorld = 1;
  private t0 = 0;

  constructor() {
    super(SCENES.ranks);
  }

  create(): void {
    ensureCanvasArt(this);
    ensureBadges(this);
    const L = this.layout;
    this.tabs = [];
    this.backdrop = new Backdrop(this, PALETTES[8]!, L.width, L.height);
    fitText(bigText(this, L.cx, L.top + 70, this.t('ranks.title'), 70), 2 * (L.right - 140 - L.cx));
    this.back = new IconTile(this, L.left + 70, L.top + 70, 'ic-back', null, () => this.scene.start(SCENES.game, { phase: 'title' } satisfies GameStart), { radius: 46 });
    // Online ranking (Google Play Games): the shared panel from @oyun/core/online.
    this.online = new IconTile(this, L.right - 70, L.top + 70, 'ic-globe', null, () => openOnline(this.oyun), { radius: 46 });
    void gameOnline(this.oyun).sync();

    // The current rank.
    const d = gameSave(this.oyun).data;
    const score = progressScore(d);
    const r = rankOf(score);
    const card = this.add.graphics();
    card.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(L.left + 24, L.top + 136, L.width - 48, 230, 36);
    card.lineStyle(5, RANKS[r]!.color, 1).strokeRoundedRect(L.left + 24, L.top + 136, L.width - 48, 230, 36);
    this.add.image(L.left + 150, L.top + 251, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(RANKS[r]!.color).setScale(2.2).setAlpha(0.7);
    this.badge = this.add.image(L.left + 150, L.top + 251, `badge-${r}`).setScale(1);
    const nx = L.left + 270;
    const name = bigText(this, nx, L.top + 196, this.t(`rank.${RANKS[r]!.id}` as 'rank.ember'), 56, RANKS[r]!.color).setOrigin(0, 0.5);
    fitText(name, L.right - nx - 40, 56);
    bigText(this, nx, L.top + 254, this.t('rank.score', { n: score }), 38).setOrigin(0, 0.5);
    const nxt = nextRank(score);
    const nextText = bigText(this, nx, L.top + 306, nxt ? this.t('rank.next', { name: this.t(`rank.${RANKS[nxt.rank]!.id}` as 'rank.ember'), n: nxt.need }) : this.t('rank.top'), 26, PALETTE.gold).setOrigin(0, 0.5);
    fitText(nextText, L.right - nx - 40, 26);
    // Progress to the next rank.
    const bw = L.right - nx - 50;
    const from = RANKS[r]!.min;
    const to = nxt ? RANKS[nxt.rank]!.min : from + 1;
    const frac = nxt ? (score - from) / (to - from) : 1;
    const bar = this.add.graphics();
    bar.fillStyle(0x000000, 0.45).fillRoundedRect(nx, L.top + 334, bw, 16, 8);
    bar.fillStyle(RANKS[r]!.color, 1).fillRoundedRect(nx, L.top + 334, Math.max(16, bw * frac), 16, 8);

    (['ladder', 'records', 'feats'] as const).forEach((k, n) => {
      const x = L.cx + (n - 1) * 216;
      const g = this.add.graphics();
      const label = bigText(this, 0, 0, this.t(k === 'ladder' ? 'ranks.ladder' : k === 'records' ? 'ranks.records' : 'ranks.achievements'), 32);
      fitText(label, 190, 32);
      const tab = this.add.container(x, L.top + 420, [g, label]);
      tab.setData('g', g);
      const hit = touchHitSize(200, 66);
      tab.setSize(hit.width, hit.height).setInteractive({ useHandCursor: true });
      tab.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.show(k));
      this.tabs.push(tab);
    });
    this.page = this.add.container(0, 0);
    this.show('ladder');
  }

  private show(tab: Tab): void {
    this.tab = tab;
    const L = this.layout;
    const d = gameSave(this.oyun).data;
    this.tabs.forEach((t, n) => {
      const on = ['ladder', 'records', 'feats'][n] === tab;
      const g = t.getData('g') as Phaser.GameObjects.Graphics;
      g.clear();
      g.fillStyle(on ? PALETTE.gold : PALETTE.ui, 1).fillRoundedRect(-100, -30, 200, 60, 28);
      g.lineStyle(4, 0xffffff, on ? 1 : 0.5).strokeRoundedRect(-100, -30, 200, 60, 28);
      (t.list[1] as Phaser.GameObjects.Text).setColor(on ? '#2a1018' : '#ffffff');
    });
    this.page.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.page.add(o);
      return o;
    };
    const top = L.top + 486;
    if (tab === 'ladder') {
      const score = progressScore(d);
      const cur = rankOf(score);
      const colW = (L.width - 60) / 2;
      RANKS.forEach((rk, i) => {
        const col = Math.floor(i / 6);
        const row = i % 6;
        const x = L.left + 30 + col * colW;
        const y = top + 34 + row * 78;
        const reached = i <= cur;
        const g = add(this.add.graphics());
        g.fillStyle(i === cur ? rk.color : PALETTE.ink, i === cur ? 0.35 : 0.45).fillRoundedRect(x, y - 34, colW - 12, 68, 22);
        if (i === cur) g.lineStyle(4, rk.color, 1).strokeRoundedRect(x, y - 34, colW - 12, 68, 22);
        add(this.add.image(x + 40, y, `badge-${i}`).setScale(0.34).setAlpha(reached ? 1 : 0.45));
        const nm = add(bigText(this, x + 80, y - 12, this.t(`rank.${rk.id}` as 'rank.ember'), 28, reached ? rk.color : 0xb8a8d8).setOrigin(0, 0.5));
        fitText(nm, colW - 110, 28);
        add(bigText(this, x + 80, y + 18, this.t('rank.score', { n: rk.min }), 22, reached ? PALETTE.white : 0x9a8ac0).setOrigin(0, 0.5));
      });
      // What the score is made of.
      const p = scoreParts(d);
      const rows: [string, number][] = [
        [`${this.t('score.stars')} (${totalStars(d)} ★)`, p.stars],
        [this.t('score.levels'), p.levels],
        [this.t('score.endless'), p.endless],
        [this.t('score.daily'), p.daily],
        [this.t('score.collection'), p.collection],
        [this.t('score.achievements'), p.achievements],
      ];
      const by = top + 34 + 6 * 78 + 6;
      rows.forEach(([label, v], i) => {
        const x = L.left + 30 + (i % 2) * colW;
        const y = by + Math.floor(i / 2) * 40;
        const t = add(bigText(this, x + 8, y, label, 24, 0xd8c8ff).setOrigin(0, 0.5));
        fitText(t, colW - 100, 24);
        add(bigText(this, x + colW - 24, y, `${v}`, 26, PALETTE.gold).setOrigin(1, 0.5));
      });
      return;
    }
    if (tab === 'records') {
      // Endless and daily first, then the levels of one world.
      const eb = d.endlessBest > 0 ? `${d.endlessBest} m${d.endlessDate ? `  ·  ${d.endlessDate}` : ''}` : this.t('records.none');
      add(bigText(this, L.left + 40, top + 10, this.t('records.endless'), 28, 0xd8c8ff).setOrigin(0, 0.5));
      add(bigText(this, L.right - 40, top + 10, eb, 28, PALETTE.gold).setOrigin(1, 0.5));
      add(bigText(this, L.left + 40, top + 54, this.t('records.daily'), 28, 0xd8c8ff).setOrigin(0, 0.5));
      add(bigText(this, L.right - 40, top + 54, this.t('records.streak', { n: d.daily.bestStreak }), 26, PALETTE.gold).setOrigin(1, 0.5));
      const hist = d.daily.history.slice(-4);
      const hs = hist.length ? hist.map((h) => `${h.date.slice(5)} ${h.best} m`).join('   ') : this.t('records.none');
      fitText(add(bigText(this, L.cx, top + 94, hs, 24)), L.width - 70, 24);
      // World chips.
      for (let w = 1; w <= WORLD_COUNT; w++) {
        const x = L.cx + (w - 2.5) * 150;
        const g = add(this.add.graphics());
        const on = w === this.recWorld;
        g.fillStyle(on ? PALETTE.gold : PALETTE.ui, 1).fillRoundedRect(x - 66, top + 126, 132, 48, 22);
        const label = add(bigText(this, x, top + 150, this.t('world.n', { n: w }), 24, on ? 0x2a1018 : 0xffffff));
        fitText(label, 120, 24);
        const zone = add(this.add.zone(x, top + 150, 140, 60).setInteractive({ useHandCursor: true }));
        zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          this.recWorld = w;
          this.show('records');
        });
      }
      for (let i = 0; i < WORLD_SIZE; i++) {
        const id = (this.recWorld - 1) * WORLD_SIZE + i + 1;
        const rec = d.levels[id - 1]!;
        const y = top + 210 + i * 46;
        const g = add(this.add.graphics());
        g.fillStyle(PALETTE.ink, i % 2 ? 0.25 : 0.45).fillRoundedRect(L.left + 24, y - 21, L.width - 48, 42, 14);
        add(bigText(this, L.left + 44, y, `${id}`, 26, id % 10 === 0 ? PALETTE.gold : PALETTE.white).setOrigin(0, 0.5));
        const stars = '★'.repeat(((rec.stars & 1) > 0 ? 1 : 0) + ((rec.stars & 2) > 0 ? 1 : 0) + ((rec.stars & 4) > 0 ? 1 : 0));
        add(bigText(this, L.left + 100, y, rec.attempts ? this.t('levels.best', { n: rec.best }) : '—', 26, rec.done ? PALETTE.gold : PALETTE.white).setOrigin(0, 0.5));
        add(bigText(this, L.left + 200, y, stars, 24, PALETTE.gold).setOrigin(0, 0.5));
        add(bigText(this, L.left + 300, y, rec.attempts ? this.t('records.tries', { n: rec.attempts }) : '', 22, 0xd8c8ff).setOrigin(0, 0.5));
        add(bigText(this, L.right - 44, y, rec.bestDate, 22, 0xb8a8d8).setOrigin(1, 0.5));
      }
      return;
    }
    // Feats.
    const colW = (L.width - 60) / 2;
    ACHIEVEMENTS.forEach((a, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = L.left + 30 + col * colW;
      const y = top + 30 + row * 64;
      const got = (d.achievements & (1 << i)) !== 0;
      const g = add(this.add.graphics());
      g.fillStyle(got ? 0x2e8a5a : PALETTE.ink, got ? 0.55 : 0.45).fillRoundedRect(x, y - 28, colW - 12, 58, 18);
      const nm = add(bigText(this, x + 14, y - 10, `${got ? '✓ ' : ''}${this.t(`ach.${a.id}` as 'ach.first')}`, 24, got ? PALETTE.gold : PALETTE.white).setOrigin(0, 0.5));
      fitText(nm, colW - 100, 24);
      const ds = add(bigText(this, x + 14, y + 14, this.t(`achd.${a.id}` as 'achd.first'), 18, 0xd8c8ff).setOrigin(0, 0.5));
      fitText(ds, colW - 40, 18);
      add(bigText(this, x + colW - 26, y - 10, `+${a.gems}◆`, 22, PALETTE.gem).setOrigin(1, 0.5));
    });
  }

  override update(_t: number, delta: number): void {
    this.t0 += delta;
    const pulse = Math.pow(1 - ((this.t0 / 600) % 1), 3);
    this.badge.setScale(1 + pulse * 0.05).setAngle(Math.sin(this.t0 / 900) * 4);
    this.backdrop.update(0.5, delta * 0.1, pulse, 380, delta / 1000);
  }

  protected override testState() {
    const d = gameSave(this.oyun).data;
    const score = progressScore(d);
    return { tab: this.tab, score, rank: rankOf(score), parts: { ...scoreParts(d) }, recWorld: this.recWorld };
  }

  protected override testActions() {
    return {
      tab: (p: unknown) => this.show(p === 'records' ? 'records' : p === 'feats' ? 'feats' : 'ladder'),
      world: (p: unknown) => {
        this.recWorld = Math.min(WORLD_COUNT, Math.max(1, Number(p)));
        this.show('records');
      },
      back: () => this.back.fire(),
      online: () => this.online.fire(),
    };
  }
}
