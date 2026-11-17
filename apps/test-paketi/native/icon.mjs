// Code-generated launcher icon for the test APK: three game-coloured dots on the launcher's
// night blue. No binary asset is stored in the repo: tools/apk.mjs writes these into android/.
//   - API 26+: adaptive icon from vector drawables (background colour + foreground + monochrome)
//   - API 24-25: PNGs rendered here (pure Node: zlib + CRC32, 4×4 supersampling)
import { deflateSync } from 'node:zlib';

export const ICON_BG = '#12142a';
/** [cx, cy, r, colour] in the 108×108 adaptive-icon space (safe zone 21..87). */
export const DOTS = [
  [42, 46, 10, '#ffd36b'], // fener
  [66, 46, 10, '#6f8ff0'], // murekkep
  [54, 66, 10, '#d99a3e'], // fosil
];

export function foregroundVector() {
  const circle = ([cx, cy, r, c]) =>
    `    <path android:fillColor="${c}" android:pathData="M${cx - r},${cy}a${r},${r} 0,1 1,${2 * r},0a${r},${r} 0,1 1,-${2 * r},0z"/>`;
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    '    android:width="108dp" android:height="108dp"',
    '    android:viewportWidth="108" android:viewportHeight="108">',
    ...DOTS.map(circle),
    '</vector>',
    '',
  ].join('\n');
}

export function adaptiveIconXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
    '    <background android:drawable="@color/ic_launcher_background"/>',
    '    <foreground android:drawable="@drawable/ic_launcher_foreground"/>',
    '    <monochrome android:drawable="@drawable/ic_launcher_foreground"/>',
    '</adaptive-icon>',
    '',
  ].join('\n');
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Legacy launcher icon, `size` px square. `round`: circle plate, else rounded square.
 * The 108-unit design is scaled so the plate fills the image (legacy icons have no mask).
 */
export function legacyIconPng(size, round) {
  const S = 4; // supersampling per axis
  const bg = hex(ICON_BG);
  const dots = DOTS.map(([cx, cy, r, c]) => ({ cx, cy, r, rgb: hex(c) }));
  // Plate covers 18..90 of the 108 space (72 units), scaled to the full image.
  const unit = size / 72;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = 18 + (x + (sx + 0.5) / S) / unit;
          const v = 18 + (y + (sy + 0.5) / S) / unit;
          if (!insidePlate(u, v, round)) continue;
          let col = bg;
          for (const d of dots) if ((u - d.cx) ** 2 + (v - d.cy) ** 2 <= d.r ** 2) col = d.rgb;
          r += col[0];
          g += col[1];
          b += col[2];
          a += 255;
        }
      }
      const n = S * S;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const cover = a / 255;
      raw[o] = cover ? Math.round(r / cover) : 0;
      raw[o + 1] = cover ? Math.round(g / cover) : 0;
      raw[o + 2] = cover ? Math.round(b / cover) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insidePlate(u, v, round) {
  const c = 54;
  const half = 35; // a little inside the 72-unit image so the edge is anti-aliased
  if (round) return (u - c) ** 2 + (v - c) ** 2 <= half ** 2;
  const rad = 14;
  const dx = Math.max(Math.abs(u - c) - (half - rad), 0);
  const dy = Math.max(Math.abs(v - c) - (half - rad), 0);
  return dx * dx + dy * dy <= rad * rad;
}

/** Legacy density buckets → icon size in px (48 dp). */
export const LEGACY_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
