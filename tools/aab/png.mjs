// Minimal PNG read/resize/write in pure Node (zlib only), for launcher icons in tools/aab.mjs.
// Reads 8-bit, non-interlaced PNGs of every colour type (grey, RGB, palette, grey+alpha, RGBA),
// which is what image editors and generators write by default. Anything else fails with a
// readable message instead of producing a wrong icon.
import { deflateSync, inflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

/** @returns {{ width: number, height: number, rgba: Uint8Array }} straight (not premultiplied) RGBA */
export function decodePng(buf, name = 'PNG') {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error(`${name}: not a PNG file`);
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
  }
  if (depth !== 8 || interlace !== 0) {
    throw new Error(`${name}: only 8-bit, non-interlaced PNGs are supported (this one: ${depth}-bit, interlace ${interlace}). Re-save it as an 8-bit PNG.`);
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`${name}: unknown PNG colour type ${type}`);
  if (type === 3 && !palette) throw new Error(`${name}: palette PNG without PLTE chunk`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`${name}: bad PNG filter ${f}`);
      out[i] = v & 0xff;
    }
    prev = out;
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let r;
    let g;
    let b;
    let a = 255;
    if (type === 0) {
      r = g = b = px[s];
      if (trns && trns.length >= 2 && trns.readUInt16BE(0) === px[s]) a = 0;
    } else if (type === 2) {
      [r, g, b] = [px[s], px[s + 1], px[s + 2]];
      if (trns && trns.length >= 6 && trns.readUInt16BE(0) === r && trns.readUInt16BE(2) === g && trns.readUInt16BE(4) === b) a = 0;
    } else if (type === 3) {
      const k = px[s];
      [r, g, b] = [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2]];
      if (trns && k < trns.length) a = trns[k];
    } else if (type === 4) {
      r = g = b = px[s];
      a = px[s + 1];
    } else {
      [r, g, b, a] = [px[s], px[s + 1], px[s + 2], px[s + 3]];
    }
    rgba.set([r, g, b, a], i * 4);
  }
  return { width, height, rgba };
}

/** Area-average resample (premultiplied, so transparent edges do not darken). */
export function resize(img, w, h) {
  const out = new Uint8Array(w * h * 4);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < w; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          const wgt = wx * wy;
          const i = (Math.min(yy, img.height - 1) * img.width + Math.min(xx, img.width - 1)) * 4;
          const al = img.rgba[i + 3] / 255;
          r += img.rgba[i] * al * wgt;
          g += img.rgba[i + 1] * al * wgt;
          b += img.rgba[i + 2] * al * wgt;
          a += al * wgt;
          area += wgt;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / area) * 255);
    }
  }
  return { width: w, height: h, rgba: out };
}

/** Draw `img` centred on a transparent `size`×`size` canvas at `inner`×`inner` px. */
export function inset(img, size, inner) {
  const scaled = resize(img, inner, inner);
  const out = new Uint8Array(size * size * 4);
  const o = Math.round((size - inner) / 2);
  for (let y = 0; y < inner; y++) out.set(scaled.rgba.subarray(y * inner * 4, (y + 1) * inner * 4), ((y + o) * size + o) * 4);
  return { width: size, height: size, rgba: out };
}

export function encodePng(img) {
  const { width, height, rgba } = img;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
