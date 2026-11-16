import type { JsonObject } from '../testhook';
import { button, label, panel, toast, type Button } from '../ui/widgets';
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
 * Result shell: score card with count-up, best line, new-best toast, Replay and Menu buttons.
 * Subclass it and set `gameScene`; override `onReplay()` to show an interstitial first.
 * Test actions: `replay`, `menu`. Test state: { score, best, newBest }.
 */
export abstract class ResultScene extends OyunScene {
  protected abstract readonly gameScene: string;
  protected result: ResultData = { score: 0, best: 0, newBest: false };
  protected replayButton!: Button;
  protected menuButton!: Button;

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
    const card = panel(this, at.x, at.y, 580, 560);
    card.add(label(this, 0, -190, this.t('core.score'), { size: 48, color: th.colors.textDim }));
    const scoreText = label(this, 0, -60, '0', { size: 150, color: th.colors.primary });
    card.add(scoreText);
    card.add(label(this, 0, 80, this.t('core.best', { n: r.best }), { size: 40 }));
    (r.lines ?? []).forEach((line, i) => card.add(label(this, 0, 150 + i * 50, line, { size: 34, color: th.colors.textDim })));
    this.juice.pop(card, 1.1, 300);
    this.tweens.addCounter({
      from: 0,
      to: r.score,
      duration: Math.min(900, 200 + r.score * 40),
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => scoreText.setText(String(Math.round(tw.getValue() ?? r.score))),
      onComplete: () => {
        scoreText.setText(String(r.score));
        this.juice.pop(scoreText, 1.3);
        if (r.newBest) {
          // Over the card's "Score" caption: keeps the score, best line and buttons readable and
          // stays clear of a title a game puts above the card.
          toast(this, this.t('core.newBest'), { color: th.colors.accent, position: at.y - 190 });
          this.juice.burst(at.x, at.y - 60, { count: 24, color: th.colors.primary, texture: 'oyun-star', distance: 260 });
        }
      },
    });
    this.oyun.audio.play((r.won ?? r.newBest) ? 'win' : 'lose');
    const b0 = this.buttonPosition(0);
    const b1 = this.buttonPosition(1);
    this.replayButton = button(this, b0.x, b0.y, this.t('core.replay'), () => this.onReplay(), { hotkey: 'ENTER', width: 440 });
    this.menuButton = button(this, b1.x, b1.y, this.t('core.menu'), () => this.onMenu(), { variant: 'secondary', width: 440 });
  }

  /** Default: restart the game scene. */
  protected onReplay(): void {
    this.goTo(this.gameScene);
  }

  protected onMenu(): void {
    this.goTo(this.oyun.info.menu);
  }

  protected override testState(): JsonObject {
    return { score: this.result.score, best: this.result.best, newBest: this.result.newBest };
  }

  protected override testActions(): Record<string, (payload: unknown) => void> {
    return { replay: () => this.replayButton.fire(), menu: () => this.menuButton.fire() };
  }
}
