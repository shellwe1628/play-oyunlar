import type Phaser from 'phaser';
import { STORE_BUILD } from '../store';
import type { JsonObject, JsonValue } from '../testhook';
import { stackRows } from '../ui/layout';
import { button, label, panel, type Button } from '../ui/widgets';
import { OyunScene } from './OyunScene';

export interface ResultData {
  score: number;
  best: number;
  newBest: boolean;
  /** true = win jingle, false = lose jingle. Default: newBest. */
  won?: boolean;
  /** Extra lines under the score (already translated). */
  lines?: string[];
}

/**
 * Result shell: score card with count-up, best line, new-best badge (the card's top row),
 * Replay and Menu buttons.
 * Subclass it and set `gameScene`; override `onReplay()` to show an interstitial first.
 * Test actions: `replay`, `menu`. Test state: { score, best, newBest, rects }.
 */
/** Score card geometry (card-local px). The card stays 580×560 so games can place things around it. */
const CARD = { width: 580, height: 560, padding: 26, gap: 12, textWidth: 520 } as const;
const BADGE = { height: 56 } as const;

export abstract class ResultScene extends OyunScene {
  protected abstract readonly gameScene: string;
  protected result: ResultData = { score: 0, best: 0, newBest: false };
  protected replayButton!: Button;
  protected menuButton!: Button;
  private cardRows: {
    card: Phaser.GameObjects.Container;
    rows: Record<string, Phaser.GameObjects.Text | Phaser.GameObjects.Container>;
    lines: Phaser.GameObjects.Text[];
  } | null = null;

  init(data: Partial<ResultData>): void {
    this.result = {
      score: data.score ?? 0,
      best: data.best ?? 0,
      newBest: data.newBest ?? false,
      ...(data.won !== undefined ? { won: data.won } : {}),
      ...(data.lines ? { lines: data.lines } : {}),
    };
  }

  /** Draw the background. Default: theme background colour. */
  protected drawBackground(): void {
    this.cameras.main.setBackgroundColor(this.oyun.theme.colors.background);
  }

  /**
   * Where the i-th action button goes: 0 = Replay, 1 = Menu, 2.. = your extra buttons.
   * Portrait stacks them under the card; landscape puts them right of the card.
   */
  protected buttonPosition(index: number): { x: number; y: number } {
    const { cx, cy, width, height } = this.layout;
    if (width > height) return { x: cx + 300, y: cy - 140 + index * 140 };
    return { x: cx, y: cy + 260 + index * 135 };
  }

  /** Centre of the score card. */
  protected cardPosition(): { x: number; y: number } {
    const { cx, cy, width, height } = this.layout;
    return width > height ? { x: cx - 280, y: cy } : { x: cx, y: cy - 140 };
  }

  create(): void {
    const r = this.result;
    const th = this.oyun.theme;
    this.drawBackground();
    const at = this.cardPosition();
    const card = panel(this, at.x, at.y, CARD.width, CARD.height);
    const fit = <T extends Phaser.GameObjects.Text>(t: T): T => {
      const k = Math.min(1, CARD.textWidth / Math.max(1, t.width));
      return t.setScale(k).setData('oyunRestScaleX', k).setData('oyunRestScaleY', k);
    };
    // Rows of the card, top to bottom: [new-best badge], caption, score, best, extra lines.
    // Texts wrap at the card's text width (a single over-long word is scaled down), then the
    // rows are measured and stacked by stackRows(), so no row can overlap another however long
    // the translated texts are; a tall stack shrinks the score number first.
    const badge = r.newBest ? this.newBestBadge() : null;
    const caption = fit(label(this, 0, 0, this.t('core.score'), { size: 48, color: th.colors.textDim, wrap: CARD.textWidth }));
    const scoreText = label(this, 0, 0, String(r.score), { size: 150, color: th.colors.primary });
    const scoreFit = Math.min(1, CARD.textWidth / Math.max(1, scoreText.width));
    const bestText = fit(label(this, 0, 0, this.t('core.best', { n: r.best }), { size: 40, wrap: CARD.textWidth }));
    const lineTexts = (r.lines ?? []).map((line) => fit(label(this, 0, 0, line, { size: 34, color: th.colors.textDim, wrap: CARD.textWidth })));
    const rows: Phaser.GameObjects.Components.Transform[] = [];
    const heights: number[] = [];
    const push = (o: Phaser.GameObjects.Components.Transform, h: number): void => {
      rows.push(o);
      heights.push(h);
    };
    if (badge) push(badge, BADGE.height);
    push(caption, caption.height * caption.scaleY);
    const scoreIndex = rows.length;
    push(scoreText, scoreText.height * scoreFit);
    push(bestText, bestText.height * bestText.scaleY);
    for (const t of lineTexts) push(t, t.height * t.scaleY);
    const pad = CARD.padding;
    const stack = stackRows(heights, { top: -CARD.height / 2 + pad, bottom: CARD.height / 2 - pad, gap: CARD.gap, flex: scoreIndex });
    rows.forEach((o, i) => {
      // Rest scale (pops return to it): fitted width × stack shrink (score: × flex shrink).
      const base = o === scoreText ? scoreFit * stack.flexScale : o.scaleX;
      const k = base * stack.scale;
      o.setPosition(0, stack.centers[i] ?? 0).setScale(k);
      (o as unknown as Phaser.GameObjects.GameObject).setData('oyunRestScaleX', k).setData('oyunRestScaleY', k);
    });
    scoreText.setText('0');
    card.add([caption, scoreText, bestText, ...lineTexts]);
    if (badge) card.add(badge);
    this.cardRows = { card, rows: { caption, score: scoreText, best: bestText, ...(badge ? { badge } : {}) }, lines: lineTexts };

    this.juice.pop(card, 1.1, 300);
    this.tweens.addCounter({
      from: 0,
      to: r.score,
      duration: Math.min(900, 200 + r.score * 40),
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => scoreText.setText(String(Math.round(tw.getValue() ?? r.score))),
      onComplete: () => {
        scoreText.setText(String(r.score));
        this.juice.pop(scoreText, 1.15);
        if (badge) {
          badge.setVisible(true);
          this.juice.pop(badge, 0.3, 320);
          this.juice.burst(at.x, at.y + scoreText.y, { count: 24, color: th.colors.primary, texture: 'oyun-star', distance: 260 });
        }
      },
    });
    this.oyun.audio.play((r.won ?? r.newBest) ? 'win' : 'lose');
    const b0 = this.buttonPosition(0);
    const b1 = this.buttonPosition(1);
    this.replayButton = button(this, b0.x, b0.y, this.t('core.replay'), () => this.onReplay(), { hotkey: 'ENTER', width: 440 });
    this.menuButton = button(this, b1.x, b1.y, this.t('core.menu'), () => this.onMenu(), { variant: 'secondary', width: 440 });
  }

  /** "New best!" pill, the card's top row (hidden until the count-up ends). */
  private newBestBadge(): Phaser.GameObjects.Container {
    const th = this.oyun.theme;
    const text = label(this, 0, 0, this.t('core.newBest'), { size: 34, color: th.colors.primaryText });
    const k = Math.min(1, (CARD.textWidth - 48) / Math.max(1, text.width));
    text.setScale(k);
    const w = text.width * k + 48;
    const g = this.add.graphics();
    g.fillStyle(th.colors.accent, 1).fillRoundedRect(-w / 2, -BADGE.height / 2, w, BADGE.height, BADGE.height / 2);
    const badge = this.add.container(0, 0, [g, text]).setSize(w, BADGE.height).setVisible(false);
    return badge;
  }

  /**
   * Screen rectangles of the card's rows and the buttons, logical px (for the smoke test's
   * "nothing overlaps" check). Measured at rest scale, so a pop in progress does not count.
   */
  protected resultRects(): Record<string, [number, number, number, number]> {
    const out: Record<string, [number, number, number, number]> = {};
    if (!this.cardRows) return out;
    const { card } = this.cardRows;
    const rect = (o: Phaser.GameObjects.Components.Transform & { width: number; height: number }): [number, number, number, number] => {
      const sx = (o as unknown as Phaser.GameObjects.GameObject).getData?.('oyunRestScaleX') as number | undefined;
      const k = sx ?? o.scaleX;
      const w = o.width * k;
      const h = o.height * k;
      const x = card.x + o.x - w / 2;
      const y = card.y + o.y - h / 2;
      return [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
    };
    for (const [name, o] of Object.entries(this.cardRows.rows)) out[name] = rect(o);
    this.cardRows.lines.forEach((t, i) => (out[`line${i}`] = rect(t)));
    const btn = (b: Button): [number, number, number, number] => [Math.round(b.x - b.width / 2), Math.round(b.y - b.height / 2), Math.round(b.width), Math.round(b.height)];
    out.replay = btn(this.replayButton);
    out.menu = btn(this.menuButton);
    return out;
  }

  /** Default: restart the game scene. */
  protected onReplay(): void {
    this.goTo(this.gameScene);
  }

  protected onMenu(): void {
    this.goTo(this.oyun.info.menu);
  }

  protected override testState(): JsonObject {

    if (STORE_BUILD) throw new Error('unreachable'); // store builds: no test hook
    const rects: Record<string, JsonValue> = this.resultRects();
    return { score: this.result.score, best: this.result.best, newBest: this.result.newBest, rects };
  }

  protected override testActions(): Record<string, (payload: unknown) => void> {

    if (STORE_BUILD) throw new Error('unreachable'); // store builds: no test hook
    return { replay: () => this.replayButton.fire(), menu: () => this.menuButton.fire() };
  }
}
