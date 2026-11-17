import type Phaser from 'phaser';
import { at, TIERS } from '../sim/data';
import { cardLife } from './model';

/**
 * Idle life on a fossil card, by rarity: a slow sheen sweeping the face (rare, prized), motes
 * drifting up (legendary), a living glow breathing behind it (mythic, singular). The extras are
 * children of `card` (centred at 0,0), so they move and die with it; their tweens are killed on
 * destroy.
 */
export function addCardLife(scene: Phaser.Scene, card: Phaser.GameObjects.Container, tier: number, w: number, h: number, behindIndex = 0): void {
  const life = cardLife(tier);
  if (life === 'none') return;
  const color = at(TIERS, tier).color;
  const owned: Phaser.GameObjects.GameObject[] = [];
  if (life === 'glow') {
    const glow = scene.add.image(0, 0, 'glow').setTint(color).setScale((w * 1.9) / 128, (h * 1.5) / 128).setAlpha(0.4);
    card.addAt(glow, behindIndex);
    owned.push(glow);
    scene.tweens.add({ targets: glow, alpha: 0.85, scaleX: (w * 2.15) / 128, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  if (life === 'motes' || life === 'glow') {
    for (let i = 0; i < 6; i++) {
      const m = scene.add.image(-w / 2 + 16 + ((w - 32) * i) / 5, h / 2 - 20, 'oyun-dot').setTint(i % 2 ? 0xffffff : color).setScale(0.35).setAlpha(0);
      card.add(m);
      owned.push(m);
      scene.tweens.add({ targets: m, y: -h / 2 + 20, alpha: { from: 0.9, to: 0 }, duration: 2200 + i * 230, delay: i * 380, repeat: -1, ease: 'Sine.easeOut' });
    }
  }
  // every living card also gets the sheen; it fades in and out so it never shows beside the card
  const peak = life === 'sheen' ? 0.4 : 0.5;
  const sheen = scene.add.image(0, 0, 'sheen').setScale(0.7, (h * 0.86) / 420).setRotation(0.32).setAlpha(0);
  card.add(sheen);
  const sweep = scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 900,
    delay: 600,
    repeatDelay: life === 'sheen' ? 2600 : 1600,
    repeat: -1,
    onUpdate: (tw) => {
      const p = tw.getValue() ?? 0;
      sheen.setX(-w / 2 + 24 + (w - 48) * p);
      sheen.setAlpha(peak * Math.sin(Math.PI * p));
    },
  });
  card.once('destroy', () => {
    sweep.remove();
    for (const o of owned) scene.tweens.killTweensOf(o);
  });
}
