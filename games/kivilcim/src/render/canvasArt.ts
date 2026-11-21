import type Phaser from 'phaser';

/**
 * Gradient textures drawn with the Canvas 2D API (Graphics-based TextureRecipes cannot do
 * gradients). Created once per game, on first use.
 */
export function ensureCanvasArt(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists('glow')) return;

  const make = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void => {
    const t = tx.createCanvas(key, w, h);
    if (!t) return;
    draw(t.context);
    t.refresh();
  };

  make('glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });

  // Vertical alpha gradient: opaque white at the top, clear at the bottom (tinted at runtime).
  make('bg-grad', 8, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 8, 512);
  });

  make('vignette', 180, 320, (c) => {
    const g = c.createRadialGradient(90, 170, 60, 90, 170, 210);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(10,0,30,0.55)');
    c.fillStyle = g;
    c.fillRect(0, 0, 180, 320);
  });

  make('streak', 8, 160, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(2, 0, 4, 160);
  });

  // Soft flash for full-screen hits (stretched).
  make('flash', 4, 4, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 4, 4);
  });

  // Backing for the HUD band: readable text over anything, hazards still visible (dimmed).
  // Dark sections: darkness with a soft hole of light (placed around the spark, stretched).
  make('dark-hole', 256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(6,2,18,0)');
    g.addColorStop(0.26, 'rgba(6,2,18,0)');
    g.addColorStop(0.52, 'rgba(6,2,18,0.95)');
    g.addColorStop(1, 'rgba(6,2,18,0.97)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });

  make('hud-shade', 4, 320, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 320);
    g.addColorStop(0, 'rgba(14,4,32,0.86)');
    g.addColorStop(0.62, 'rgba(14,4,32,0.6)');
    g.addColorStop(1, 'rgba(14,4,32,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 320);
  });

  // Rounded card used by menus.
  make('card', 128, 128, (c) => {
    c.fillStyle = 'rgba(255,255,255,1)';
    roundRect(c, 4, 4, 120, 120, 28);
    c.fill();
  });
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function css(color: number, alpha = 1): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
}
