import Phaser from 'phaser';
import { getContext } from '../context';
import { CORE_TEXTURES, type TextureRecipe } from '../textures';

export const BOOT_SCENE = 'boot';

/** Bakes core + game texture recipes into the texture cache, then starts the first scene. */
export class BootScene extends Phaser.Scene {
  constructor(private readonly recipes: readonly TextureRecipe[]) {
    super(BOOT_SCENE);
  }

  create(): void {
    const g = this.add.graphics();
    for (const r of [...CORE_TEXTURES, ...this.recipes]) {
      if (this.textures.exists(r.key)) throw new Error(`BootScene: duplicate texture key "${r.key}"`);
      g.clear();
      r.draw(g);
      g.generateTexture(r.key, r.width, r.height);
    }
    g.destroy();
    this.scene.start(getContext(this.game).info.start);
  }
}
