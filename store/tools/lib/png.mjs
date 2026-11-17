// Minimal PNG reader/writer (Node zlib only): 8-bit greyscale/RGB/RGBA/palette, non-interlaced.
import { deflateSync, inflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC = (() => {
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
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Header facts without decoding pixels. */
export function pngInfo(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) return null;
  const chunks = [];
  let o = 8;
  let ihdr = null;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    chunks.push(type);
    if (type === 'IHDR') ihdr = buf.subarray(o + 8, o + 8 + len);
    o += 12 + len;
    if (type === 'IEND') break;
  }
  const colorType = ihdr[9];
  const bitDepth = ihdr[8];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth,
    colorType,
    interlace: ihdr[12],
    hasAlphaChannel: colorType === 4 || colorType === 6 || chunks.includes('tRNS'),
    bitsPerPixel: channels * bitDepth,
  };
}

/** Decode to RGBA 8-bit. */
export function decodePng(buf) {
  const info = pngInfo(buf);
  if (!info) throw new Error('not a PNG');
  if (info.bitDepth !== 8 || info.interlace !== 0) throw new Error(`unsupported PNG (bit depth ${info.bitDepth}, interlace ${info.interlace})`);
  const idat = [];
  let palette = null;
  let trns = null;
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IDAT') idat.push(data);
    if (type === 'PLTE') palette = data;
    if (type === 'tRNS') trns = data;
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const { width: w, height: h, colorType } = info;
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const stride = w * bpp;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0;
      const b = y > 0 ? px[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[dst + x] = v & 0xff;
    }
  }
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, bl, al;
    if (colorType === 6) [r, g, bl, al] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
    else if (colorType === 2) [r, g, bl, al] = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2], 255];
    else if (colorType === 0) [r, g, bl, al] = [px[i], px[i], px[i], 255];
    else if (colorType === 4) [r, g, bl, al] = [px[i * 2], px[i * 2], px[i * 2], px[i * 2 + 1]];
    else {
      const k = px[i];
      [r, g, bl] = [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2]];
      al = trns && k < trns.length ? trns[k] : 255;
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = bl;
    out[i * 4 + 3] = al;
  }
  return { width: w, height: h, data: out };
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode RGBA pixels. alpha=false writes 24-bit RGB (no alpha channel at all). */
export function encodePng({ width, height, data }, { alpha = true } = {}) {
  const bpp = alpha ? 4 : 3;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    // filter 1 (sub) per row: smaller files for flat art and photos alike
    raw[y * (stride + 1)] = 1;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = y * (stride + 1) + 1 + x * bpp;
      for (let c = 0; c < bpp; c++) {
        const v = data[s + c];
        const left = x > 0 ? data[s - 4 + c] : 0;
        raw[d + c] = (v - left) & 0xff;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Box-filter downscale by area averaging (premultiplied alpha). */
export function resize(img, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < w; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          const k = wx * wy;
          const i = (yy * img.width + xx) * 4;
          const al = img.data[i + 3] / 255;
          r += img.data[i] * al * k;
          g += img.data[i + 1] * al * k;
          b += img.data[i + 2] * al * k;
          a += al * k;
          n += k;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return { width: w, height: h, data: out };
}

/** Alpha statistics. */
export function alphaStats(img) {
  let transparent = 0;
  let partial = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] === 0) transparent++;
    else if (img.data[i] < 255) partial++;
  }
  const n = img.width * img.height;
  return { transparent, partial, opaque: n - transparent - partial, n };
}
