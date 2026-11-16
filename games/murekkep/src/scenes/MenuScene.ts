import { MenuScene as MenuShell, button, type Button } from '@oyun/core';
import { gameSave } from '../save';
import { CAMPAIGN, dateKey } from '../sim/campaign';
import { generateMap } from '../sim/mapgen';
import { MatchSim, PERSONALITIES, type ColonySpec } from '../sim/match';
import { totalStars } from '../sim/progress';
import { PALETTE } from '../textures';
import { InkMap } from '../view/inkmap';
import { drawDesk } from './Background';
import { SCENES } from './keys';

/**
 * Menu shell + a live bot-vs-bot match bleeding across a sheet behind the title (attract mode,
 * cosmetic). Play → sheet select; Daily → today's sheet. Test actions: play, daily.
 */
let demoRuns = 0;

export class MenuScene extends MenuShell {
  protected readonly playScene = SCENES.maps;
  private demo: MatchSim | null = null;
  private demoView: InkMap | null = null;
  private acc = 0;
  private dailyButton!: Button;

  constructor() {
    super(SCENES.menu);
  }

  protected override drawBackground(): void {
    drawDesk(this);
    this.startDemo();
  }

  private startDemo(): void {
    const L = this.layout;
    // Cosmetic demo match on its own forked stream: how long the menu stays open never changes
    // the session rng a real match draws its seed from. Three fixed demo sheets (cached paper).
    const rng = this.oyun.rng.fork(`menu-demo-${demoRuns++}`);
    const sheet = demoRuns % 3;
    const map = generateMap(4001 + sheet, { width: 30, height: 42 }, 5, `menu-${sheet}`);
    const specs: ColonySpec[] = PERSONALITIES.concat(PERSONALITIES)
      .slice(0, 5)
      .map((p, i) => ({ kind: 'bot', personality: p, difficulty: 2 + (i % 2) }));
    this.demo = new MatchSim(map, rng.int(1, 1_000_000), specs);
    this.demoView = new InkMap(this, map, { x: L.left + 30, y: L.top + 40, width: L.right - L.left - 60, height: L.bottom - L.top - 80 }, specs.length, -5);
    this.demoView.fullRedraw(this.demo);
    this.demoView.paper.setAlpha(0.42);
    this.acc = 0;
  }

  protected override subtitle(): string {
    const stars = totalStars(gameSave(this.oyun).data);
    return stars > 0 ? this.t('menu.stars', { n: stars, total: CAMPAIGN.length * 3 }) : this.t('menu.tagline');
  }

  protected override decorate(): void {
    const { cx, height } = this.layout;
    this.dailyButton = button(this, cx, height * 0.62 + 160, this.t('menu.daily'), () => this.goTo(SCENES.game, { level: 'daily', date: dateKey(new Date()) }), {
      variant: 'secondary',
      width: 420,
      height: 104,
      fontSize: 42,
    });
    // Dark band behind the title so the live sheet never fights the text.
    const band = this.add.graphics().setDepth(-1);
    band.fillStyle(PALETTE.desk, 0.78).fillRoundedRect(40, height * 0.3 - 110, this.layout.width - 80, 290, 40);
  }

  override update(_time: number, delta: number): void {
    if (!this.demo || !this.demoView) return;
    this.acc += Math.min(delta, 100) / 1000;
    while (this.acc >= 0.05) {
      this.acc -= 0.05; // 2× speed
      this.demo.tick();
      this.demo.events.length = 0;
    }
    if (this.demo.phase !== 'playing') {
      this.demo = null;
      this.time.delayedCall(1500, () => {
        if (!this.scene.isActive()) return;
        this.demoView?.destroy();
        this.startDemo();
      });
      return;
    }
    this.demoView.sync(this.demo);
    for (const c of this.demo.colonies) if (c.alive) this.demoView.setInk(c.id, c.reserve / Math.max(1, this.demo.cap(c.id)));
    this.demoView.setLayersAlpha(0.6);
  }

  protected override testState() {
    return { stars: totalStars(gameSave(this.oyun).data) };
  }

  protected override testActions() {
    return { ...super.testActions(), daily: () => this.dailyButton.fire() };
  }
}
