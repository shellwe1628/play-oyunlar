/**
 * The descent / ascent between layers: a sheet of rushing strata covers the screen, the place
 * changes behind it, and the sheet runs on. Shared by the dig screen (arrows) and the depth map
 * (which covers the screen there and uncovers it on the dig screen). Presentation only.
 */
import type { OyunScene } from '@oyun/core';
import type Phaser from 'phaser';
import { at, LAYERS } from '../sim/data';
import { SFX } from '../sfx';
import { fitText, outlined } from '../scenes/ui';

const DEPTH = 1400;

/** Where the sheet sits: waiting off-screen, covering the screen, gone past it. */
const sheetY = (dir: 1 | -1, h: number): { start: number; covered: number; gone: number } => (dir > 0 ? { start: h, covered: -2 * h, gone: -3 * h } : { start: -3 * h, covered: 0, gone: h });

/** Three screens of strata: the bands of the layer you leave, then those of the one you reach. */
function strataSheet(scene: OyunScene, from: number, to: number, dir: 1 | -1): Phaser.GameObjects.Graphics {
  const L = scene.layout;
  const g = scene.add.graphics().setDepth(DEPTH).setScrollFactor(0);
  const a = at(LAYERS, from);
  const b = at(LAYERS, to);
  const h = L.height;
  for (let i = 0; i < 18; i++) {
    const src = i < 9 ? (dir > 0 ? a : b) : dir > 0 ? b : a;
    g.fillStyle(at(src.bands, i % src.bands.length), 1).fillRect(-20, i * (h / 6), L.width + 40, h / 6 + 2);
    g.fillStyle(0x000000, 0.15).fillRect(-20, i * (h / 6) + h / 6 - 10, L.width + 40, 10);
  }
  return g;
}

/**
 * First half: strata rush in from below (going down) or above (going up) until the screen is
 * covered, then `onCovered` runs. Returns the sheet for `uncover`.
 */
export function cover(scene: OyunScene, from: number, to: number, dir: 1 | -1, onCovered: (sheet: Phaser.GameObjects.Graphics) => void): Phaser.GameObjects.Graphics {
  const y = sheetY(dir, scene.layout.height);
  const g = strataSheet(scene, from, to, dir).setY(y.start);
  scene.oyun.audio.playPreset(SFX.flip, { pitch: dir > 0 ? -5 : 5 });
  scene.tweens.add({ targets: g, y: y.covered, duration: 260, ease: 'Cubic.easeIn', onComplete: () => onCovered(g) });
  return g;
}

/**
 * Second half: the name of the layer you reached pops, the sheet runs off, `onDone` runs. Pass
 * the sheet from `cover`, or null to start already covered (arriving from another scene).
 */
export function uncover(scene: OyunScene, sheet: Phaser.GameObjects.Graphics | null, from: number, to: number, dir: 1 | -1, onDone: () => void): void {
  const L = scene.layout;
  const y = sheetY(dir, L.height);
  const g = sheet ?? strataSheet(scene, from, to, dir).setY(y.covered);
  const name = outlined(scene, L.cx, L.cy, scene.t(`layer.${at(LAYERS, to).id}`), 64, 0xffffff, 12).setDepth(DEPTH + 1).setScrollFactor(0);
  fitText(name, L.width - 60);
  scene.juice.pop(name, 0.5, 240);
  scene.tweens.add({ targets: name, alpha: 0, y: L.cy - dir * 80, delay: 260, duration: 300, onComplete: () => name.destroy() });
  scene.tweens.add({
    targets: g,
    y: y.gone,
    duration: 280,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      g.destroy();
      onDone();
    },
  });
}
