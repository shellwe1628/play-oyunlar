import { iconButton, label, OyunScene, progressBar, type IconButton } from '@oyun/core';
import type Phaser from 'phaser';
import { gameSave } from '../save';
import { logbookProgress } from '../sim/progress';
import { logKey, STATION } from '../sim/station';
import { PALETTE } from '../textures';
import { drawTypeIcon } from './art';
import { drawBackdrop } from './Background';
import { drawRoomIcon } from './Feed';
import { SCENES } from './keys';
import { Chip } from './widgets';

/** Logbook: every (object, anomaly type) pair, found ones lit. Test actions: tab i, back. */
export class LogbookScene extends OyunScene {
  private tabs: Chip[] = [];
  private list!: Phaser.GameObjects.Container;
  private back!: IconButton;
  private tab = 0;

  constructor() {
    super(SCENES.logbook);
  }

  create(): void {
    const L = this.layout;
    drawBackdrop(this, null, false);
    const d = gameSave(this.oyun).data;
    const p = logbookProgress(d);
    this.back = iconButton(this, L.left + 64, L.top + 70, 'home', () => this.goTo(SCENES.menu));
    label(this, L.cx, L.top + 70, this.t('log.title'), { size: 56 });
    label(this, L.cx, L.top + 150, this.t('log.progress', { found: p.found, total: p.total, pct: p.percent }), { size: 40, color: PALETTE.lamp });
    progressBar(this, L.cx, L.top + 200, L.width - 120, 24, { color: PALETTE.teal, value: p.found / p.total });
    const tw = 150;
    this.tabs = STATION.map(
      (def, i) =>
        new Chip(
          this,
          L.cx + (i - 1.5) * (tw + 14),
          L.top + 290,
          { width: tw, height: 100, glyph: (g, x, y, s, c) => drawRoomIcon(g, def.style, x, y, s, c) },
          () => this.show(i),
        ),
    );
    this.list = this.add.container(0, 0);
    label(this, L.cx, L.bottom - 50, this.t('log.hint'), { size: 30, color: PALETTE.textDim, wrap: L.width - 80 });
    this.show(this.tab);
  }

  private show(i: number): void {
    this.tab = i;
    this.tabs.forEach((t, k) => t.setOn(k === i));
    this.list.removeAll(true);
    const L = this.layout;
    const have = new Set(gameSave(this.oyun).data.log);
    const cam = STATION[i]!;
    this.list.add(label(this, L.cx, L.top + 380, this.t(`cam.${cam.id}`), { size: 40, color: PALETTE.lamp }));
    const rows: { name: string; keys: { key: string; type: Parameters<typeof drawTypeIcon>[1] }[] }[] = cam.objects.map((o) => ({
      name: this.t(`obj.${cam.id}.${o.id}`),
      keys: o.types.map((t) => ({ key: logKey(cam.id, o.id, t), type: t })),
    }));
    rows.push({ name: this.t('log.intruders'), keys: cam.intruders.map((s) => ({ key: logKey(cam.id, s.id, 'intruder'), type: 'intruder' as const })) });
    const top = L.top + 440;
    const step = Math.min(58, (L.bottom - 110 - top) / rows.length);
    const g = this.add.graphics();
    this.list.add(g);
    rows.forEach((r, k) => {
      const y = top + k * step;
      if (k % 2 === 0) g.fillStyle(PALETTE.panel, 0.55).fillRoundedRect(40, y - step / 2 + 2, L.width - 80, step - 4, 10);
      this.list.add(label(this, 60, y, r.name, { size: 32 }).setOrigin(0, 0.5));
      r.keys.forEach((k2, j) => {
        const x = L.width - 70 - (r.keys.length - 1 - j) * 52;
        const found = have.has(k2.key);
        g.fillStyle(found ? PALETTE.teal : 0x000000, found ? 1 : 0.25).fillCircle(x, y, 22);
        drawTypeIcon(g, k2.type, x, y, 26, found ? PALETTE.night : PALETTE.lockedText);
      });
    });
    this.juice.pop(this.list, 1.02, 160);
  }

  protected override testState() {
    const p = logbookProgress(gameSave(this.oyun).data);
    return { tab: this.tab, ...p };
  }

  protected override testActions() {
    return { tab: (i: unknown) => this.tabs[Number(i)]?.fire(), back: () => this.back.fire() };
  }
}
