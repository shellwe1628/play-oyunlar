import { button, label, muteButton, type Button } from '../ui/widgets';
import { OyunScene } from './OyunScene';

/**
 * Menu shell: background, title, Play button, mute toggle. Subclass it and set `playScene`;
 * override the hooks to add art. Test action: `play`.
 */
export abstract class MenuScene extends OyunScene {
  /** Scene started by Play. */
  protected abstract readonly playScene: string;
  protected playButton!: Button;

  /** Title text. Default: the game title from createGame. */
  protected title(): string {
    return this.oyun.info.title;
  }

  /** Line under the title (e.g. best score). Default none. */
  protected subtitle(): string | null {
    return null;
  }

  /** Draw the background. Default: theme background colour. */
  protected drawBackground(): void {
    this.cameras.main.setBackgroundColor(this.oyun.theme.colors.background);
  }

  /** Extra decoration after the shell is built (logo, idle animation). */
  protected decorate(): void {
    /* optional */
  }

  /** Data passed to the play scene. */
  protected playData(): object | undefined {
    return undefined;
  }

  create(): void {
    const { cx, height, top, right } = this.layout;
    this.drawBackground();
    const title = label(this, cx, height * 0.3, this.title(), { size: 96, wrap: this.layout.width - 120 });
    this.juice.pop(title, 1.15, 400);
    const sub = this.subtitle();
    if (sub) label(this, cx, height * 0.3 + 110, sub, { size: 40, color: this.oyun.theme.colors.textDim });
    this.playButton = button(this, cx, height * 0.62, this.t('core.play'), () => this.play(), { hotkey: 'ENTER', width: 420, height: 128, fontSize: 56 });
    this.tweens.add({ targets: this.playButton, scale: 1.04, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    muteButton(this, right - 76, top + 76);
    this.decorate();
  }

  protected play(): void {
    this.oyun.audio.unlock();
    this.goTo(this.playScene, this.playData());
  }

  protected override testActions(): Record<string, (payload: unknown) => void> {
    return { play: () => this.playButton.fire() };
  }
}
