import type Phaser from 'phaser';
import { PALETTE } from '../textures';
import { HelperBrain, helperTier } from './model';
import type { Particles } from './Particles';

/**
 * The assistant, drawn: a small miner beside the dig site. Driven only by HelperBrain moods; all
 * motion is computed by hand each frame (no tweens, no allocation).
 */
export class Helper {
  readonly brain = new HelperBrain();
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly lids: Phaser.GameObjects.Image;
  private readonly arm: Phaser.GameObjects.Container;
  private readonly tool: Phaser.GameObjects.Image;
  private readonly lamp: Phaser.GameObjects.Image;
  private readonly mark: Phaser.GameObjects.Text;
  private readonly zs: Phaser.GameObjects.Text[];
  private tier = -1;
  private clock = 0;
  private swingT = 9;
  private shown = false;
  private appear = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly facing: 1 | -1,
    private readonly dust: Particles | null,
    private readonly strikeAt: { x: number; y: number },
    depth = 40,
  ) {
    this.root = scene.add.container(x, y).setDepth(depth).setVisible(false);
    this.lamp = scene.add.image(0, -90, 'glow').setTint(0xfff3b0).setAlpha(0).setScale(0.6);
    this.body = scene.add.image(0, -35, 'helper-body');
    this.head = scene.add.image(0, -78, 'helper-head-1');
    this.lids = scene.add.image(0, -78, 'helper-eyelids').setVisible(false);
    this.tool = scene.add.image(18, 0, 'tool-1').setOrigin(0.12, 0.5);
    this.arm = scene.add.container(8, -44, [scene.add.image(0, 0, 'helper-arm').setOrigin(0.05, 0.5), this.tool]);
    this.mark = scene.add.text(14, -122, '!', { fontFamily: '"Nunito", sans-serif', fontSize: '40px', fontStyle: '800', color: '#ffd23f', stroke: '#24160e', strokeThickness: 7 }).setOrigin(0.5).setVisible(false);
    this.zs = [0, 1, 2].map((i) => scene.add.text(20, -110, 'z', { fontFamily: '"Nunito", sans-serif', fontSize: `${26 + i * 6}px`, fontStyle: '800', color: '#cfd8ff', stroke: '#24160e', strokeThickness: 5 }).setOrigin(0.5).setVisible(false));
    this.root.add([this.lamp, this.body, this.arm, this.head, this.lids, this.mark, ...this.zs]);
    this.root.setScale(facing, 1);
  }

  /** Assistant hit the block n times this frame. */
  hits(n: number): void {
    if (n > 0) this.brain.hits(n);
  }

  update(dt: number, level: number, napping: boolean): void {
    this.clock += dt;
    const strike = this.brain.update(dt, level, napping);
    const mood = this.brain.mood;
    const t = helperTier(level);
    if (t !== this.tier && t > 0) {
      this.tier = t;
      this.head.setTexture(`helper-head-${t}`);
      this.tool.setTexture(`tool-${t}`);
      this.lamp.setAlpha(t >= 3 ? 0.35 : 0);
    }
    if (mood === 'hidden') {
      this.root.setVisible(false);
      this.shown = false;
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.appear = 0;
      this.root.setVisible(true);
    }
    this.appear = Math.min(1, this.appear + dt * 3);
    const pop = this.appear < 1 ? 0.4 + 0.6 * Math.sin((this.appear * Math.PI) / 1.6) / Math.sin(Math.PI / 1.6) : 1;

    if (strike) {
      this.swingT = 0;
      if (this.dust) this.dust.emit(this.strikeAt.x, this.strikeAt.y, 3, { speed: [60, 160], angle: this.facing > 0 ? -2.5 : -0.6, spread: 1.2, gravity: 700, life: [0.25, 0.45], scale: [0.4, 0.8], tint: PALETTE.sand });
    }
    this.swingT += dt;

    let jump = 0;
    let armRot = 0.5 + Math.sin(this.clock * 2) * 0.08; // tool resting low
    let lean = 0;
    let squash = 1 + Math.sin(this.clock * 3) * 0.02;
    this.lids.setVisible(false);
    this.mark.setVisible(false);
    for (const z of this.zs) z.setVisible(false);

    if (mood === 'work' || this.swingT < 0.3) {
      const s = this.swingT;
      armRot = s < 0.08 ? -1.6 + (s / 0.08) * 2.4 : s < 0.3 ? 0.8 - ((s - 0.08) / 0.22) * 0.3 : 0.5;
      lean = s < 0.12 ? 0.12 : 0.04;
    }
    if (mood === 'found') {
      jump = Math.abs(Math.sin(this.clock * 9)) * 14;
      this.mark.setVisible(true).setText('!');
    } else if (mood === 'cheer') {
      jump = Math.abs(Math.sin(this.clock * 8)) * 22;
      armRot = -2.3 + Math.sin(this.clock * 16) * 0.3;
      this.mark.setVisible(true).setText('!!');
      squash = 1.04;
    } else if (mood === 'nap') {
      squash = 0.9 + Math.sin(this.clock * 1.6) * 0.03;
      lean = -0.12;
      armRot = 1.2;
      this.lids.setVisible(true);
      this.zs.forEach((z, i) => {
        const p = (this.clock * 0.5 + i / 3) % 1;
        z.setVisible(true).setPosition(18 + p * 26, -100 - p * 50).setAlpha(1 - p);
      });
    } else if (mood === 'wake') {
      squash = 1 + Math.sin(this.clock * 10) * 0.05;
      armRot = -2.6;
    }
    this.arm.setRotation(armRot);
    this.root.setPosition(this.x, this.y - jump);
    this.root.setRotation(lean * this.facing);
    this.root.setScale(this.facing * pop, squash * pop);
    if (this.tier >= 3) this.lamp.setAlpha(0.28 + Math.sin(this.clock * 3) * 0.08);
  }

  found(): void {
    this.brain.found();
  }

  cheer(): void {
    this.brain.cheer();
  }
}
