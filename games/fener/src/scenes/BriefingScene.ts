import { button, label, OyunScene, panel, type Button } from '@oyun/core';
import Phaser from 'phaser';
import { gameSave } from '../save';
import { PALETTE } from '../textures';
import { drawTypeIcon } from './art';
import { drawBackdrop } from './Background';
import { drawRoomIcon } from './Feed';
import { SCENES, type ShiftData } from './keys';

/**
 * The three rules, shown before the first shift and from "How to play" on the menu.
 * One tap anywhere (or the button) dismisses it. Test action: ok.
 */
export class BriefingScene extends OyunScene {
  private next: ShiftData | null = null;
  private ok!: Button;
  private done = false;

  constructor() {
    super(SCENES.briefing);
  }

  init(data: { next?: ShiftData }): void {
    this.next = data.next ?? null;
  }

  create(): void {
    const L = this.layout;
    this.done = false;
    drawBackdrop(this, null, false);
    label(this, L.cx, L.top + 120, this.t('brief.title'), { size: 60, color: PALETTE.lamp });
    const card = panel(this, L.cx, L.cy - 40, 640, 760, { color: PALETTE.navy });
    const g = this.add.graphics();
    card.add(g);
    const rows: [string, (gx: number, gy: number) => void][] = [
      ['brief.1', (x, y) => drawRoomIcon(g, 'lamp', x, y, 56, PALETTE.lamp)],
      ['brief.2', (x, y) => drawTypeIcon(g, 'moved', x, y, 52, PALETTE.teal)],
      ['brief.3', (x, y) => {
        for (let i = 0; i < 4; i++) g.fillStyle(PALETTE.danger, 1).fillCircle(x - 27 + i * 18, y, 7);
      }],
    ];
    rows.forEach(([key, icon], i) => {
      const y = -240 + i * 240;
      icon(-250, y);
      card.add(label(this, 40, y, this.t(key), { size: 36, wrap: 470, align: 'left' }));
    });
    this.juice.pop(card, 1.05, 260);
    this.ok = button(this, L.cx, L.bottom - 150, this.t(this.next ? 'brief.go' : 'brief.ok'), () => this.dismiss(), { width: 460, hotkey: 'ENTER' });
    // One tap anywhere dismisses (after a short beat so the opening tap does not count).
    const shownAt = this.time.now;
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      // Touch-down is delivered inside the DOM event, outside the game step; a scene change
      // started there stalls its fade until the next input, so fire on the next step instead.
      if (over.length === 0 && this.time.now - shownAt > 350) this.time.delayedCall(0, () => this.ok.fire());
    });
  }

  private dismiss(): void {
    if (this.done) return;
    this.done = true;
    gameSave(this.oyun).update((d) => {
      d.briefed = true;
    });
    if (this.next) this.goTo(SCENES.game, this.next);
    else this.goTo(SCENES.menu);
  }

  protected override testState() {
    return { next: this.next ? { ...this.next } : null };
  }

  protected override testActions() {
    return { ok: () => this.ok.fire() };
  }
}
