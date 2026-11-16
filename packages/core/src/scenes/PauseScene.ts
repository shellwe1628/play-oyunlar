import { button, label, muteButton, panel, type Button } from '../ui/widgets';
import { OyunScene, PAUSE_SCENE } from './OyunScene';

/** Core pause menu, launched over a paused scene by `openPauseMenu()`. Actions: resume, quit. */
export class PauseScene extends OyunScene {
  private from = '';
  private resumeButton!: Button;
  private quitButton!: Button;

  constructor() {
    super(PAUSE_SCENE);
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? '';
  }

  create(): void {
    const { cx, cy, width, height } = this.layout;
    this.add.rectangle(0, 0, width, height, this.oyun.theme.colors.shadow, 0.72).setOrigin(0).setInteractive();
    // 600 px tall stack fits the 720 px landscape height too.
    const card = panel(this, cx, cy, 560, 600);
    card.add(label(this, 0, -215, this.t('core.paused'), { size: 64 }));
    this.juice.pop(card, 1.08);
    this.resumeButton = button(this, cx, cy - 55, this.t('core.resume'), () => this.resumeGame(), { hotkey: 'ESC' });
    this.quitButton = button(this, cx, cy + 85, this.t('core.quit'), () => this.quit(), { variant: 'secondary' });
    muteButton(this, cx, cy + 210);
    this.oyun.platform.gameplayStop();
  }

  protected override testActions(): Record<string, (payload: unknown) => void> {
    return { resume: () => this.resumeButton.fire(), quit: () => this.quitButton.fire() };
  }

  protected override testState() {
    return { from: this.from };
  }

  private resumeGame(): void {
    this.oyun.platform.gameplayStart();
    this.scene.resume(this.from);
    this.scene.stop();
  }

  private quit(): void {
    const menu = this.oyun.info.menu;
    this.scene.stop(this.from);
    this.scene.start(menu);
  }
}

