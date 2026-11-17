// Icon family: every game gets the same frame (full-bleed radial gradient in its palette, a soft
// glow, one faint ring) and ONE bold emblem with the games' fat ink outline and a white glint.
// Emblems are drawn centred on (0,0) and stay inside a radius of 195 units, so the same
// drawing serves the 512 Play icon and the 432 adaptive foreground (safe zone radius 132 px).

const f = (n) => Math.round(n * 100) / 100;

/** Golden ammonite: a logarithmic coil, ribs across the last two whorls (Fossil Odds). */
function ammonite(c) {
  const R = 184;
  const k = 0.56; // each whorl is this fraction of the next one
  const bb = -Math.log(k) / (2 * Math.PI);
  const end = 4.6 * Math.PI * 2;
  const rAt = (t) => R * Math.exp(bb * (t - end));
  const rot = Math.PI / 4 - end; // the aperture (widest point) faces down-right
  const shift = -0.14 * R; // centre the coil's bounding box on (0,0)
  const sx = Math.cos(Math.PI / 4) * shift;
  const sy = Math.sin(Math.PI / 4) * shift;
  const pt = (t, r = rAt(t)) => `${f(Math.cos(t + rot) * r + sx)} ${f(Math.sin(t + rot) * r + sy)}`;
  const path = (t0, t1, step = 0.04, rf = rAt) => {
    let d = '';
    for (let t = t0; t <= t1 + 1e-9; t += step) d += `${d ? 'L' : 'M'}${pt(t, rf(t))} `;
    return d;
  };
  // outline: the last whorl's outer edge, then the aperture lip back to the previous whorl
  // the lip bows outward a little, like a real aperture, instead of a straight radial cut
  const lipMid = (rAt(end) + rAt(end - 2 * Math.PI)) / 2;
  const outline = `${path(end - 2 * Math.PI, end)} Q${pt(end + 0.16, lipMid)} ${pt(end, rAt(end - 2 * Math.PI))} Z`;
  let ribs = '';
  for (let t = end - 2 * Math.PI + 0.1; t < end - 0.3; t += 0.27) ribs += `M${pt(t, rAt(t) - 13)} L${pt(t, rAt(t - 2 * Math.PI) + 10)} `;
  let ribs2 = '';
  for (let t = end - 4 * Math.PI + 0.15; t < end - 2 * Math.PI; t += 0.34) ribs2 += `M${pt(t, rAt(t) - 8)} L${pt(t, rAt(t - 2 * Math.PI) + 6)} `;
  const coil = path(end - 4.4 * Math.PI * 2 + 2 * Math.PI, end - 2 * Math.PI + 0.001);
  const [ex, ey] = pt(end - 4.4 * Math.PI * 2 + 2 * Math.PI).split(' ');
  return `
<defs><radialGradient id="shell" cx="0.36" cy="0.3" r="0.85"><stop offset="0" stop-color="${c.light}"/><stop offset="0.6" stop-color="${c.main}"/><stop offset="1" stop-color="${c.dark}"/></radialGradient></defs>
<path d="${outline}" fill="url(#shell)" stroke="${c.ink}" stroke-width="22" stroke-linejoin="round"/>
<path d="${ribs}" stroke="${c.ink}" stroke-width="10" stroke-linecap="round" fill="none"/>
<path d="${ribs2}" stroke="${c.ink}" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.85"/>
<path d="${coil}" stroke="${c.ink}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<circle cx="${ex}" cy="${ey}" r="9" fill="${c.ink}"/>
<path d="${path(end - 2 * Math.PI + 2.75, end - 2 * Math.PI + 3.6, 0.04, (t) => rAt(t) - 26)}" stroke="${c.glint}" stroke-width="14" stroke-linecap="round" fill="none" opacity="0.85"/>`;
}

/** A drawn bow with its arrow pointing up-right (Noodle Archers). */
function bow(c) {
  return `
<g transform="rotate(135) scale(0.9)">
  <path d="M-6 -200 L70 0 L-6 200" stroke="${c.ink}" stroke-width="20" fill="none" stroke-linejoin="round"/>
  <path d="M-6 -200 L70 0 L-6 200" stroke="${c.string}" stroke-width="8" fill="none" stroke-linejoin="round"/>
  <path d="M-6 -200 Q-210 0 -6 200" stroke="${c.ink}" stroke-width="84" fill="none" stroke-linecap="round"/>
  <path d="M-6 -200 Q-210 0 -6 200" stroke="${c.main}" stroke-width="56" fill="none" stroke-linecap="round"/>
  <path d="M-30 -150 Q-120 -60 -112 10" stroke="${c.glint}" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.8"/>
  <rect x="-126" y="-34" width="44" height="68" rx="12" fill="${c.grip}" stroke="${c.ink}" stroke-width="10"/>
  <path d="M96 0 L-196 0" stroke="${c.ink}" stroke-width="40" stroke-linecap="round"/>
  <path d="M96 0 L-196 0" stroke="${c.shaft}" stroke-width="20" stroke-linecap="round"/>
  <path d="M56 -8 L108 -60 L140 -60 L100 -8 Z M56 8 L108 60 L140 60 L100 8 Z" fill="${c.feather}" stroke="${c.ink}" stroke-width="10" stroke-linejoin="round"/>
  <path d="M-176 -46 L-246 0 L-176 46 Z" fill="${c.tip}" stroke="${c.ink}" stroke-width="12" stroke-linejoin="round"/>
</g>`;
}

export const EMBLEMS = {
  ammonite: {
    draw: ammonite,
    colors: { ink: '#2b1a0e', main: '#e9a948', light: '#ffe2a0', dark: '#a8662a', glint: '#fff6dc' },
  },
  bow: {
    draw: bow,
    colors: { ink: '#2a1838', main: '#c9813f', glint: '#ffd9a8', string: '#ffffff', grip: '#ff4d5e', shaft: '#f3d9a8', feather: '#ff4d5e', tip: '#e8edf5' },
  },
};

function colorsFor(icon) {
  return { ...EMBLEMS[icon.emblem].colors, ...(icon.colors ?? {}) };
}

/** Emblem group at (cx,cy) with radius `r` (emblem space 195). mono: alpha-only version. */
export function emblemSvg(icon, cx, cy, r, { mono = false } = {}) {
  const e = EMBLEMS[icon.emblem];
  if (!e) throw new Error(`unknown emblem "${icon.emblem}" (store/tools/lib/icons.mjs)`);
  let c = colorsFor(icon);
  if (mono) c = Object.fromEntries(Object.entries(c).map(([k]) => [k, k === 'ink' ? '#ffffff' : 'rgba(255,255,255,0.42)']));
  let svg = e.draw(c);
  if (mono) svg = svg.replace(/url\(#shell\)/g, 'rgba(255,255,255,0.42)');
  return `<g transform="translate(${cx} ${cy}) scale(${f(r / 195)})">${svg}</g>`;
}

/** Frame: full-bleed gradient + glow + ring (size px square). */
export function frameSvg(icon, size, { ring = true } = {}) {
  const k = size / 512;
  return `<defs>
<radialGradient id="ibg" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="${icon.bg[0]}"/><stop offset="1" stop-color="${icon.bg[1]}"/></radialGradient>
<radialGradient id="iglow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${icon.glow}" stop-opacity="0.55"/><stop offset="0.6" stop-color="${icon.glow}" stop-opacity="0.18"/><stop offset="1" stop-color="${icon.glow}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${size}" height="${size}" fill="url(#ibg)"/>
<circle cx="${size / 2}" cy="${size / 2}" r="${f(240 * k)}" fill="url(#iglow)"/>
${ring ? `<circle cx="${size / 2}" cy="${size / 2}" r="${f(222 * k)}" fill="none" stroke="#ffffff" stroke-opacity="0.13" stroke-width="${f(10 * k)}"/>` : ''}`;
}

export function svgDoc(size, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${inner}</svg>`;
}

/** Every icon file as SVG source. */
export function iconSvgs(icon) {
  const play = svgDoc(512, frameSvg(icon, 512) + emblemSvg(icon, 256, 256, 176));
  const background = svgDoc(432, frameSvg(icon, 432, { ring: false }));
  const foreground = svgDoc(432, emblemSvg(icon, 216, 216, 128));
  const monochrome = svgDoc(432, emblemSvg(icon, 216, 216, 128, { mono: true }));
  // legacy (API < 26) launcher icon: the same art on a rounded-square plate, corners clear
  const legacy = svgDoc(
    512,
    `<defs><clipPath id="plate"><rect x="16" y="16" width="480" height="480" rx="96"/></clipPath></defs><g clip-path="url(#plate)">${frameSvg(icon, 512)}</g>${emblemSvg(icon, 256, 256, 168)}`,
  );
  return { play, background, foreground, monochrome, legacy };
}
