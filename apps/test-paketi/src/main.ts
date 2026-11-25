import './style.css';
import { GAMES, pickLang, UI } from './games';

declare const __BUILD_DATE__: string;
declare const __BUILD_COMMIT__: string;

const lang = pickLang(navigator.languages, new URLSearchParams(location.search).get('lang'));
const other = lang === 'tr' ? 'en' : 'tr';
const ui = UI[lang];
document.documentElement.lang = lang;
document.title = ui.title;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const header = el('header', 'head');
header.append(el('h1', 'title', ui.title), el('p', 'lead', ui.choose));

const list = el('nav', 'cards');
for (const g of GAMES) {
  // A plain link: a real page navigation, so the WebView history holds the launcher and the
  // Android back button (see MainActivity patch in tools/apk.mjs) can return to it.
  const card = el('a', 'card');
  card.href = `./${g.slug}/index.html`;
  card.dataset.slug = g.slug;
  card.style.setProperty('--accent', g.accent);
  const mark = el('span', 'mark');
  mark.innerHTML = g.mark; // static, code-drawn SVG from games.ts
  const text = el('span', 'text');
  text.append(el('span', 'name', g.name[lang]), el('span', 'alt', g.name[other]), el('span', 'pitch', g.pitch[lang]));
  card.append(mark, text, el('span', 'go', '›'));
  list.append(card);
}

const footer = el('footer', 'foot');
footer.append(el('p', 'back', ui.back), el('p', 'build', `${ui.footer} · ${__BUILD_DATE__} · ${__BUILD_COMMIT__}`));

app.append(header, list, footer);
