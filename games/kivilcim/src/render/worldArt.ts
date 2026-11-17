/**
 * Baked art for the level worlds and the animated objects (Canvas 2D, white on transparent so
 * every layer can be tinted). Everything is baked once, when a scene first needs it — never
 * during a run.
 */
import type Phaser from 'phaser';

/** Motif of each level theme (palette index → world). */
export const MOTIFS = ['rays', 'circuit', 'aurora', 'rain', 'hex', 'tunnel', 'waves', 'grid', 'bokeh', 'embers'] as const;
export type Motif = (typeof MOTIFS)[number];

/** Deterministic cosmetic noise for baking (the same art every time). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const P = 256;

function pattern(c: CanvasRenderingContext2D, m: Motif): void {
  const r = lcg(MOTIFS.indexOf(m) * 977 + 13);
  c.strokeStyle = 'rgba(255,255,255,1)';
  c.fillStyle = 'rgba(255,255,255,1)';
  c.lineCap = 'round';
  switch (m) {
    case 'rays':
      // Sparse twinkles on a diagonal lattice.
      for (let i = 0; i < 14; i++) {
        const x = r() * P;
        const y = r() * P;
        c.globalAlpha = 0.4 + r() * 0.6;
        c.beginPath();
        c.arc(x, y, 1.5 + r() * 2.5, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'circuit': {
      // Right-angle traces with solder pads, tileable on a 32 px grid.
      c.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        let x = Math.floor(r() * 8) * 32 + 16;
        let y = Math.floor(r() * 8) * 32 + 16;
        c.globalAlpha = 0.5 + r() * 0.5;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          if (k % 2 === 0) y = (y + (1 + Math.floor(r() * 3)) * 32) % (P + 32);
          else x = (x + (r() < 0.5 ? -1 : 1) * 32 + P) % P;
          c.lineTo(x, y);
        }
        c.stroke();
        c.beginPath();
        c.arc(x, y, 5, 0, Math.PI * 2);
        c.stroke();
      }
      break;
    }
    case 'aurora':
      c.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        c.globalAlpha = 0.3 + 0.2 * k;
        c.beginPath();
        for (let x = 0; x <= P; x += 8) {
          const y = 32 + k * 64 + Math.sin((x / P) * Math.PI * 2 * 2 + k) * 14;
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      break;
    case 'rain':
      c.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        const x = r() * P;
        const y = r() * P;
        const len = 18 + r() * 40;
        c.globalAlpha = 0.25 + r() * 0.6;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + len);
        c.stroke();
      }
      break;
    case 'hex': {
      c.lineWidth = 2.5;
      c.globalAlpha = 0.8;
      const s = 32;
      const h = s * Math.sqrt(3);
      for (let row = -1; row < P / h + 1; row++) {
        for (let col = -1; col < P / (s * 3) + 1; col++) {
          const cx = col * s * 3 + (row % 2 ? s * 1.5 : 0);
          const cy = row * (h / 2);
          c.beginPath();
          for (let a = 0; a < 6; a++) {
            const ang = (a * Math.PI) / 3;
            const px = cx + Math.cos(ang) * s;
            const py = cy + Math.sin(ang) * s;
            if (a === 0) c.moveTo(px, py);
            else c.lineTo(px, py);
          }
          c.closePath();
          c.stroke();
        }
      }
      break;
    }
    case 'tunnel':
      for (let i = 0; i < 40; i++) {
        c.globalAlpha = 0.3 + r() * 0.7;
        const x = r() * P;
        const y = r() * P;
        const s2 = 1 + r() * 2;
        c.fillRect(x - s2, y - s2, s2 * 2, s2 * 2);
      }
      break;
    case 'waves':
      c.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        c.globalAlpha = 0.45 + 0.25 * k;
        c.beginPath();
        for (let x = 0; x <= P; x += 6) {
          const y = 42 + k * 86 + Math.sin((x / P) * Math.PI * 2 * 3) * 12;
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      break;
    case 'grid':
      c.lineWidth = 2;
      c.globalAlpha = 0.6;
      for (let x = 0; x < P; x += 64) {
        c.beginPath();
        c.moveTo(x + 1, 0);
        c.lineTo(x + 1, P);
        c.stroke();
      }
      for (let y = 0; y < P; y += 64) {
        c.beginPath();
        c.moveTo(0, y + 1);
        c.lineTo(P, y + 1);
        c.stroke();
      }
      c.globalAlpha = 1;
      for (let x = 0; x < P; x += 64) for (let y = 0; y < P; y += 64) c.fillRect(x - 2, y - 2, 6, 6);
      break;
    case 'bokeh':
      for (let i = 0; i < 9; i++) {
        const x = r() * P;
        const y = r() * P;
        const rad = 8 + r() * 22;
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.7)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.globalAlpha = 1;
        c.fillStyle = g;
        c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      break;
    case 'embers':
      c.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const x = r() * P;
        const y = r() * P;
        c.globalAlpha = 0.3 + r() * 0.5;
        c.beginPath();
        c.moveTo(x - 12, y + 8);
        c.lineTo(x, y - 4);
        c.lineTo(x + 12, y + 8);
        c.stroke();
      }
      break;
  }
  c.globalAlpha = 1;
}

export function ensureWorldArt(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists('wp-rays')) return;
  const make = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void => {
    const t = tx.createCanvas(key, w, h);
    if (!t) return;
    draw(t.context);
    t.refresh();
  };
  for (const m of MOTIFS) make(`wp-${m}`, P, P, (c) => pattern(c, m));

  // Sunburst fan (rays world).
  make('w-rays', 512, 512, (c) => {
    c.translate(256, 256);
    for (let i = 0; i < 16; i++) {
      c.rotate((Math.PI * 2) / 16);
      const g = c.createLinearGradient(0, 0, 0, -256);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-22, -256);
      c.lineTo(22, -256);
      c.closePath();
      c.fill();
    }
  });
  // Soft aurora ribbon.
  make('w-ribbon', 512, 160, (c) => {
    for (let x = 0; x < 512; x += 2) {
      const y = 80 + Math.sin((x / 512) * Math.PI * 2) * 34;
      const g = c.createLinearGradient(0, y - 60, 0, y + 30);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(x, y - 60, 2, 90);
    }
  });
  // Bubble ring, hex outline, four-point star, ember, light beam, glint.
  make('w-bubble', 48, 48, (c) => {
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(24, 24, 18, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath();
    c.arc(17, 16, 4, 0, Math.PI * 2);
    c.fill();
  });
  make('w-hex', 64, 64, (c) => {
    c.strokeStyle = 'rgba(255,255,255,1)';
    c.lineWidth = 4;
    c.beginPath();
    for (let a = 0; a < 6; a++) {
      const ang = (a * Math.PI) / 3;
      const px = 32 + Math.cos(ang) * 26;
      const py = 32 + Math.sin(ang) * 26;
      if (a === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.stroke();
  });
  make('w-star4', 48, 48, (c) => {
    c.fillStyle = 'rgba(255,255,255,1)';
    c.beginPath();
    c.moveTo(24, 0);
    c.lineTo(28, 20);
    c.lineTo(48, 24);
    c.lineTo(28, 28);
    c.lineTo(24, 48);
    c.lineTo(20, 28);
    c.lineTo(0, 24);
    c.lineTo(20, 20);
    c.closePath();
    c.fill();
  });
  make('w-ember', 24, 24, (c) => {
    const g = c.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 24, 24);
  });
  make('w-beam', 32, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 256);
    const v = c.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(0,0,0,1)');
    v.addColorStop(0.5, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = v;
    c.fillRect(0, 0, 32, 256);
  });
  // Spiky aura around a spike block (idle motion; drawn as light, not as hazard).
  make('block-aura', 160, 160, (c) => {
    c.translate(80, 80);
    for (let i = 0; i < 12; i++) {
      c.rotate((Math.PI * 2) / 12);
      const g = c.createLinearGradient(0, -40, 0, -78);
      g.addColorStop(0, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(-6, -40);
      c.lineTo(0, -78);
      c.lineTo(6, -40);
      c.closePath();
      c.fill();
    }
  });
  // Shatter pieces per spark shape.
  make('shard-sq', 14, 14, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 14, 14);
  });
  make('shard-plus', 18, 18, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(6, 0, 6, 18);
    c.fillRect(0, 6, 18, 6);
  });
  make('shard-arc', 24, 12, (c) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(12, 14, 10, Math.PI * 1.15, Math.PI * 1.85);
    c.stroke();
  });
  make('shard-streak', 40, 6, (c) => {
    const g = c.createLinearGradient(0, 0, 40, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g;
    c.fillRect(0, 0, 40, 6);
  });
  make('shard-hex', 16, 16, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    for (let a = 0; a < 6; a++) {
      const ang = (a * Math.PI) / 3;
      const px = 8 + Math.cos(ang) * 7;
      const py = 8 + Math.sin(ang) * 7;
      if (a === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
  });
  make('shard-diamond', 12, 20, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(6, 0);
    c.lineTo(12, 10);
    c.lineTo(6, 20);
    c.lineTo(0, 10);
    c.closePath();
    c.fill();
  });
}
