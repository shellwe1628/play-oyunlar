// Shared vector backdrops for screenshot frames and feature graphics, drawn in the games' own
// style (flat fills, soft shapes, no outlines on scenery). Deterministic: same input, same SVG.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;

/** Sediment strata: wavy bands, pebbles and specks (Fossil Odds). */
function strata(look, w, h, seed) {
  const r = rng(seed);
  let s = '';
  const bands = 9;
  for (let i = bands; i >= 1; i--) {
    const y = (h * i) / bands - h / bands / 2;
    const amp = 10 + r() * 18;
    const ph = r() * Math.PI * 2;
    let d = `M0 ${h} L0 ${f(y)}`;
    for (let x = 0; x <= w; x += w / 24) d += ` L${f(x)} ${f(y + Math.sin(x / (w / 3.2) + ph) * amp)}`;
    d += ` L${w} ${h} Z`;
    const col = look.band[i % look.band.length];
    s += `<path d="${d}" fill="${col}" opacity="${0.18 + (i / bands) * 0.32}"/>`;
  }
  for (let i = 0; i < Math.round((w * h) / 9000); i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 2 + r() * (r() < 0.15 ? 14 : 5);
    s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rad * 1.3)}" ry="${f(rad)}" fill="${r() < 0.5 ? '#000' : '#fff'}" opacity="${f(0.05 + r() * 0.08)}"/>`;
  }
  return s;
}

/** Puffy flat clouds and far hills (Noodle Archers). */
function clouds(look, w, h, seed) {
  const r = rng(seed);
  let s = '';
  // far hills at the bottom
  const hill = (y, col, op) => {
    let d = `M0 ${h} L0 ${f(y)}`;
    const ph = r() * 6;
    for (let x = 0; x <= w; x += w / 30) d += ` L${f(x)} ${f(y - Math.abs(Math.sin(x / (w / 2.4) + ph)) * h * 0.06)}`;
    return `<path d="${d} L${w} ${h} Z" fill="${col}" opacity="${op}"/>`;
  };
  s += hill(h * 0.8, '#9fd8f0', 0.8) + hill(h * 0.88, '#7ac7a0', 0.9);
  const count = Math.max(4, Math.round((w * h) / 260000));
  for (let i = 0; i < count; i++) {
    const cx = r() * w;
    const cy = r() * h * 0.7;
    const k = (0.5 + r() * 0.9) * Math.min(w, h) / 900;
    const op = f(0.55 + r() * 0.35);
    s += `<g opacity="${op}" fill="#ffffff">`;
    s += `<rect x="${f(cx - 120 * k)}" y="${f(cy - 10 * k)}" width="${f(240 * k)}" height="${f(46 * k)}" rx="${f(23 * k)}"/>`;
    s += `<circle cx="${f(cx - 50 * k)}" cy="${f(cy)}" r="${f(48 * k)}"/><circle cx="${f(cx + 20 * k)}" cy="${f(cy - 20 * k)}" r="${f(62 * k)}"/><circle cx="${f(cx + 82 * k)}" cy="${f(cy + 6 * k)}" r="${f(40 * k)}"/>`;
    s += `</g>`;
  }
  return s;
}

/** Soft sparks on a dark field (generic; for games without their own pattern yet). */
function sparks(look, w, h, seed) {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < Math.round((w * h) / 12000); i++) {
    s += `<circle cx="${f(r() * w)}" cy="${f(r() * h)}" r="${f(1 + r() * 4)}" fill="${look.accent}" opacity="${f(0.1 + r() * 0.35)}"/>`;
  }
  return s;
}

const PATTERNS = { strata, clouds, sparks };

/** Full-bleed backdrop SVG: vertical gradient + pattern. */
export function backdrop(look, w, h, seed = 7) {
  const pat = PATTERNS[look.pattern] ?? sparks;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${look.bg[0]}"/><stop offset="1" stop-color="${look.bg[1]}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>${pat(look, w, h, seed)}</svg>`;
}
