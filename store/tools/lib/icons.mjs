// Icon family: every game gets the same frame (full-bleed radial gradient in its palette, a soft
// glow, one faint ring) and ONE bold emblem with the games' fat ink outline and a white glint.
// Emblems are drawn centred on (0,0) and stay inside a radius of 195 units, so the same
// drawing serves the 512 Play icon and the 432 adaptive foreground (safe zone radius 132 px).

const f = (n) => Math.round(n * 100) / 100;

/** Golden ammonite: logarithmic coil, ribs on the outer whorl (Fossil Odds). */
function ammonite(c) {
  const R = 178;
  const turns = 2.35;
  const end = turns * Math.PI * 2;
  const r0 = 20;
  const b = Math.log(R / r0) / end;
  const rAt = (t) => r0 * Math.exp(b * t);
  const pt = (t, r = rAt(t)) => [f(Math.cos(t - end) * r), f(Math.sin(t - end) * r + 6)];
  let spiral = '';
  for (let t = 0; t <= end; t += 0.08) spiral += `${spiral ? 'L' : 'M'}${pt(t).join(' ')} `;
  let ribs = '';
  for (let t = end - 2 * Math.PI + 0.25; t < end - 0.05; t += 0.34) {
    const outer = rAt(t) - 8;
    const inner = rAt(t - 2 * Math.PI) + 10;
    ribs += `M${pt(t, outer).join(' ')} L${pt(t, inner).join(' ')} `;
  }
  const inner2 = rAt(end - 2 * Math.PI);
  return `
<defs><radialGradient id="shell" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="${c.light}"/><stop offset="0.65" stop-color="${c.main}"/><stop offset="1" stop-color="${c.dark}"/></radialGradient></defs>
<circle cx="0" cy="6" r="${R}" fill="url(#shell)" stroke="${c.ink}" stroke-width="20"/>
<circle cx="${f(Math.cos(-0.0) * 0)}" cy="6" r="${f(inner2 * 0.98)}" fill="${c.dark}" opacity="0.28"/>
<path d="${ribs}" stroke="${c.ink}" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.85"/>
<path d="${spiral}" stroke="${c.ink}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M-128 -70 A150 150 0 0 1 -40 -150" stroke="${c.glint}" stroke-width="16" stroke-linecap="round" fill="none" opacity="0.75"/>`;
}

/** A drawn bow with its arrow pointing up-right (Noodle Archers). */
function bow(c) {
  return `
<g transform="rotate(135) scale(0.86)">
  <path d="M-6 -205 L70 0 L-6 205" stroke="${c.ink}" stroke-width="14" fill="none" stroke-linejoin="round"/>
  <path d="M-6 -205 L70 0 L-6 205" stroke="${c.string}" stroke-width="6" fill="none" stroke-linejoin="round"/>
  <path d="M-6 -205 Q-200 0 -6 205" stroke="${c.ink}" stroke-width="62" fill="none" stroke-linecap="round"/>
  <path d="M-6 -205 Q-200 0 -6 205" stroke="${c.main}" stroke-width="38" fill="none" stroke-linecap="round"/>
  <path d="M-30 -150 Q-120 -60 -112 10" stroke="${c.glint}" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.8"/>
  <rect x="-112" y="-30" width="34" height="60" rx="10" fill="${c.grip}" stroke="${c.ink}" stroke-width="10"/>
  <path d="M96 0 L-196 0" stroke="${c.ink}" stroke-width="30" stroke-linecap="round"/>
  <path d="M96 0 L-196 0" stroke="${c.shaft}" stroke-width="14" stroke-linecap="round"/>
  <path d="M62 -6 L112 -50 L136 -50 L96 -6 Z M62 6 L112 50 L136 50 L96 6 Z" fill="${c.feather}" stroke="${c.ink}" stroke-width="10" stroke-linejoin="round"/>
  <path d="M-180 -36 L-238 0 L-180 36 Z" fill="${c.tip}" stroke="${c.ink}" stroke-width="12" stroke-linejoin="round"/>
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
