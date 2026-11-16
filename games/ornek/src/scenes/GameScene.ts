import { createRng, iconButton, label, OyunScene, progressBar, type IconButton, type ProgressBar } from '@oyun/core';
import Phaser from 'phaser';
import { gameSave } from '../save';
import { applyRoundResult } from '../sim/progress';
import { createRound, DEFAULT_RULES, step, tap, type Round } from '../sim/round';
import { PALETTE } from '../textures';
import { drawBackdrop } from './Background';
import { SCENES } from './keys';

/**
 * The round. This scene only draws and forwards input: every rule lives in src/sim.
 * Test actions: tapTarget, tapAt {x,y}, pause.
 */
export class GameScene extends OyunScene {
  protected override autoPause = true;
  private round!: Round;
  private target!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private timer!: ProgressBar;
  private pauseButton!: IconButton;
  private finished = false;

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    const L = this.layout;
    const th = this.oyun.theme;
    this.finished = false;
    drawBackdrop(this, th.colors.background);

    // HUD inside the safe area.
    const hudY = L.top + 70;
    this.scoreText = label(this, L.left + 40, hudY, this.t('game.score', { n: 0 }), { size: 48 }).setOrigin(0, 0.5);
    this.pauseButton = iconButton(this, L.right - 70, hudY, 'pause', () => this.openPauseMenu());
    this.timer = progressBar(this, L.cx, hudY + 80, L.width - 80, 30, { color: th.colors.accent });
    this.comboText = label(this, L.cx, hudY + 140, '', { size: 36, color: th.colors.accent });

    // The playfield is everything below the HUD, inside the safe area.
    const top = hudY + 180;
    const arena = { x: L.left + 20, y: top, width: L.right - L.left - 40, height: L.bottom - top - 20 };
    this.round = createRound({ ...DEFAULT_RULES, arena }, createRng(this.oyun.rng.int(0, 2 ** 31 - 1)));

    this.target = this.add.image(this.round.target.x, this.round.target.y, 'target');
    this.syncTarget();
    this.juice.pop(this.target, 0.3, 300);

    const hint = label(this, L.cx, L.cy, this.t('game.hint'), { size: 56 });
    this.tweens.add({ targets: hint, alpha: 0, delay: 900, duration: 500, onComplete: () => hint.destroy() });

    // Taps on HUD buttons must not count as misses.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.onTap(p.worldX, p.worldY);
    });

    this.oyun.platform.gameplayStart();
    this.oyun.platform.track('round_start');
  }

  override update(_time: number, delta: number): void {
    if (this.finished) return;
    // Hit-stop aware, clamped so a long frame cannot tunnel the target.
    const dt = Math.min(this.juice.scaledDelta(delta), 50) / 1000;
    const { ended } = step(this.round, dt);
    this.syncTarget();
    this.timer.setValue(this.round.timeLeft / this.round.rules.duration);
    if (ended) this.finish();
  }

  /** The one input handler: pointer taps and the test hook both call it. */
  private onTap(x: number, y: number): void {
    if (this.finished) return;
    const result = tap(this.round, x, y);
    if (result.kind === 'hit') {
      const big = result.combo > 0 && result.combo % 5 === 0;
      this.oyun.audio.play('coin', { pitch: Math.min(result.combo, 12) });
      this.juice.feedback(big ? 'medium' : 'small', result.x, result.y, PALETTE.spark);
      this.juice.floatText(result.x, result.y - 40, `+${result.points}`, { color: this.oyun.theme.colors.primary });
      this.scoreText.setText(this.t('game.score', { n: this.round.score }));
      this.juice.pop(this.scoreText, 1.2);
      this.comboText.setText(result.combo >= 2 ? this.t('game.combo', { n: result.combo }) : '');
      if (result.combo >= 2) this.juice.pop(this.comboText, 1.3);
      this.syncTarget();
      this.juice.pop(this.target, 0.3, 260);
    } else if (result.kind === 'miss') {
      this.oyun.audio.play('hit', { volume: 0.5 });
      this.oyun.platform.haptic('error');
      this.juice.shake(0.25);
      this.juice.floatText(x, y, this.t('game.penalty', { s: result.penalty.toFixed(1) }), { color: PALETTE.miss, size: 40 });
      this.comboText.setText('');
    }
  }

  private syncTarget(): void {
    const t = this.round.target;
    this.target.setPosition(t.x, t.y);
    // The texture is drawn at the start radius; scale it to the current one.
    const s = t.radius / DEFAULT_RULES.startRadius;
    if (!this.tweens.isTweening(this.target)) this.target.setScale(s);
    this.target.setData('oyunRestScaleX', s).setData('oyunRestScaleY', s);
  }

  private finish(): void {
    this.finished = true;
    const r = this.round;
    this.oyun.platform.gameplayStop();
    this.oyun.platform.track('round_end', { score: r.score, hits: r.hits, misses: r.misses });
    let outcome = { best: 0, newBest: false };
    gameSave(this.oyun).update((d) => {
      outcome = applyRoundResult(d, r.score);
    });
    this.juice.shake(0.5);
    this.tweens.add({ targets: this.target, scale: 0, duration: 250, ease: 'Back.easeIn' });
    this.time.delayedCall(450, () =>
      this.goTo(SCENES.result, {
        score: r.score,
        best: outcome.best,
        newBest: outcome.newBest,
        lines: [this.t('result.stats', { hits: r.hits, combo: r.bestCombo })],
      }),
    );
  }

  protected override testState() {
    const t = this.round.target;
    return {
      score: this.round.score,
      timeLeft: Math.round(this.round.timeLeft * 100) / 100,
      combo: this.round.combo,
      over: this.round.over,
      target: { x: Math.round(t.x), y: Math.round(t.y), radius: t.radius },
    };
  }

  protected override testActions() {
    return {
      tapTarget: () => this.onTap(this.round.target.x, this.round.target.y),
      tapAt: (p: unknown) => {
        const { x, y } = p as { x: number; y: number };
        this.onTap(x, y);
      },
      pause: () => this.pauseButton.fire(),
    };
  }
}
