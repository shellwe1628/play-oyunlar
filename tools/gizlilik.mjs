#!/usr/bin/env node
// Writes the privacy-policy site for GitHub Pages: docs/gizlilik/ (index + one page per app in
// store/apps.json, Turkish and English on each page). Pages serves the repository's docs/ folder
// (Settings → Pages → Deploy from a branch → main, /docs); docs/.nojekyll turns Jekyll off.
//   node tools/gizlilik.mjs
// The text states what the current builds do, checked against the code (2026-11-17): no
// accounts, no analytics sent anywhere, no ad SDK, progress and sound setting kept in the
// WebView's local storage on the device, Android backup and device transfer excluded
// (tools/aab.mjs), only the INTERNET permission (+ AndroidX's internal one), no network requests.
// If ads or analytics are added, change TEXT below, re-run, and update the Data safety form.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './template.mjs';

const EFFECTIVE = { tr: '17 Kasım 2026', en: '17 November 2026' };
const cfg = JSON.parse(readFileSync(join(ROOT, 'store', 'apps.json'), 'utf8'));
const OUT = join(ROOT, 'docs', 'gizlilik');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Section texts; `n` = the game's name in that language, `id` = its package name. HTML allowed. */
const TEXT = {
  tr: {
    lang: 'tr',
    heading: (n) => `${n}: gizlilik politikası`,
    effective: `Yürürlük tarihi: ${EFFECTIVE.tr}`,
    summary: 'Kısaca: bu oyun kişisel veri toplamaz, hiçbir yere veri göndermez ve kimseyle veri paylaşmaz.',
    sections: (n, id) => [
      ['Kapsam', `Bu politika Google Play'deki <b>${n}</b> Android uygulaması (<code>${id}</code>) için geçerlidir. "Geliştirici", uygulamanın Google Play sayfasında adı yazan geliştiricidir.`],
      ['Toplanan bilgiler', 'Hesap, kayıt ya da giriş yoktur. Uygulama adınızı, e-posta adresinizi, konumunuzu, kişilerinizi, fotoğraflarınızı, cihaz ya da reklam kimliğinizi istemez ve okumaz.'],
      [
        'Cihazınızda saklananlar',
        `Oyun ilerlemeniz ve ses ayarınız, uygulamanın kendi yerel depolamasında (WebView "local storage") <b>yalnızca cihazınızda</b> tutulur. Bu bilgiler cihazdan çıkmaz: uygulama, Android'in bulut yedeklemesini ve cihazdan cihaza aktarımını kendi verileri için kapatır, yani Google Drive yedeğine de yeni telefona aktarıma da girmez. Uygulamayı kaldırmak ya da Ayarlar &rarr; Uygulamalar &rarr; ${n} &rarr; Depolama &rarr; Verileri temizle, hepsini siler.`,
      ],
      [
        'İnternet ve izinler',
        'Oyunun bütün dosyaları uygulamanın içindedir; oyun internete hiçbir istek göndermez ve çevrimdışı çalışır. Uygulama yalnızca INTERNET iznini bildirir: bu izin, oyunu çalıştıran WebView kabuğunun (Capacitor) standart parçasıdır ve sizden onay istenmez. Bunun dışında yalnızca Android kütüphanelerinin eklediği, sadece uygulamanın kendisinin kullanabildiği bir iç izin vardır. Uygulama kamera, mikrofon, konum, depolama gibi hiçbir izin istemez.',
      ],
      ['Analitik ve reklam', 'Uygulamada analitik, reklam ya da izleme yazılımı (SDK) yoktur. Oyun içindeki "ödül" düğmeleri bu sürümde reklam göstermeden ödülü hemen verir.'],
      ['Paylaşım', 'Bilgi toplanmadığı için hiçbir bilgi üçüncü kişilerle paylaşılmaz ya da satılmaz.'],
      [
        'Google Play',
        "Uygulamayı Google Play'den indirip kullanırken Google, kendi gizlilik politikasına göre bazı bilgileri işleyebilir (örneğin indirme kaydı; cihazınızda bu paylaşım açıksa Android'in çökme raporları). Bu işlem uygulamanın değil Google'ın sorumluluğundadır; geliştirici bunları Google Play Console'da yalnızca toplu istatistik olarak görür.",
      ],
      ['Çocuklar', 'Uygulama çocuklar dahil hiç kimseden kişisel bilgi toplamaz.'],
      [
        'Değişiklikler',
        "Reklam ya da analitik eklenirse bu sayfa, o sürüm yayımlanmadan önce güncellenir: hangi sağlayıcının, hangi bilgileri (örneğin reklam kimliği, cihaz bilgisi, IP adresi), hangi amaçla işlediği, kiminle paylaşıldığı ve nasıl vazgeçebileceğiniz yazılır; Google Play'deki Veri güvenliği bölümü de buna göre değişir. Geçerli metin her zaman bu adrestedir; tarih en üsttedir.",
      ],
      ['İletişim', "Sorularınız için uygulamanın Google Play sayfasındaki <b>Uygulama desteği</b> bölümünde yazan geliştirici e-posta adresini kullanın."],
    ],
    other: 'English',
    back: 'Tüm oyunlar',
  },
  en: {
    lang: 'en',
    heading: (n) => `${n}: privacy policy`,
    effective: `Effective date: ${EFFECTIVE.en}`,
    summary: 'In short: this game collects no personal data, sends no data anywhere and shares no data with anyone.',
    sections: (n, id) => [
      ['Scope', `This policy applies to the Android app <b>${n}</b> (<code>${id}</code>) on Google Play. "The developer" is the developer named on the app's Google Play page.`],
      ['Information collected', 'There are no accounts, no sign-up and no sign-in. The app does not ask for or read your name, e-mail address, location, contacts, photos, device identifiers or advertising ID.'],
      [
        'What is stored on your device',
        `Your game progress and your sound setting are kept in the app's own local storage (the WebView's "local storage") <b>on your device only</b>. They never leave the device: the app turns off Android cloud backup and device-to-device transfer for its data, so they are neither copied to a Google Drive backup nor moved to a new phone. Uninstalling the app, or Settings &rarr; Apps &rarr; ${n} &rarr; Storage &rarr; Clear data, deletes all of it.`,
      ],
      [
        'Internet and permissions',
        'All of the game\'s files are inside the app; the game makes no requests to the internet and works offline. The app declares only the INTERNET permission, a standard part of the WebView shell (Capacitor) that runs the game, which Android grants without asking you. Besides that there is only an internal permission added by Android libraries that no app other than this one can use. The app asks for no permission such as camera, microphone, location or storage.',
      ],
      ['Analytics and ads', 'The app contains no analytics, advertising or tracking software (SDK). In this version the in-game "reward" buttons give their reward straight away without showing an ad.'],
      ['Sharing', 'As no information is collected, none is shared with or sold to third parties.'],
      [
        'Google Play',
        "When you download and use the app through Google Play, Google may process some information under its own privacy policy (for example the download record and, if this sharing is switched on on your device, Android crash reports). That processing is Google's, not the app's; the developer only sees it as aggregated statistics in Google Play Console.",
      ],
      ['Children', 'The app collects no personal information from anyone, children included.'],
      [
        'Changes',
        "If ads or analytics are added, this page will be updated before that version is released: it will name the provider, the information it processes (for example advertising ID, device information, IP address), why, with whom it is shared and how to opt out, and the Data safety section on Google Play will change accordingly. The current text is always at this address; its date is at the top.",
      ],
      ['Contact', 'For questions, use the developer e-mail address shown in the <b>App support</b> section of the app\'s Google Play page.'],
    ],
    other: 'Türkçe',
    back: 'All games',
  },
};

const CSS = `:root {
  color-scheme: light dark;
  --bg: #f7f5f0; --fg: #1d1d22; --muted: #5d5d66; --card: #ffffff; --line: #e2ded4; --accent: #2f5fbf;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #15161b; --fg: #ececf1; --muted: #a3a3ad; --card: #1e2027; --line: #30323b; --accent: #8fb2ff; }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }
nav { display: flex; gap: 16px; flex-wrap: wrap; font-size: 15px; margin-bottom: 8px; }
a { color: var(--accent); }
h1 { font-size: 26px; line-height: 1.25; margin: 8px 0 4px; }
h2 { font-size: 18px; margin: 24px 0 4px; }
p { margin: 4px 0 12px; }
.meta { color: var(--muted); font-size: 15px; }
.summary { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; margin: 16px 0; }
section.lang { border-top: 1px solid var(--line); margin-top: 40px; padding-top: 8px; }
section.lang:first-of-type { border-top: 0; margin-top: 0; }
code { font-size: 15px; overflow-wrap: anywhere; }
ul.games { list-style: none; padding: 0; }
ul.games li { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; margin: 10px 0; }
ul.games small { color: var(--muted); display: block; overflow-wrap: anywhere; }
`;

const page = (title, lang, body) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="STYLE">
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

function gamePage(app) {
  const parts = ['tr', 'en'].map((l) => {
    const T = TEXT[l];
    const n = esc(app.title[l === 'tr' ? 'tr-TR' : 'en-US']);
    const secs = T.sections(n, esc(app.applicationId))
      .map(([h, p]) => `<h2>${h}</h2>\n<p>${p}</p>`)
      .join('\n');
    return `<section class="lang" id="${l}" lang="${l}">
<nav><a href="../">${T.back}</a><a href="#${l === 'tr' ? 'en' : 'tr'}">${T.other}</a></nav>
<h1>${T.heading(n)}</h1>
<p class="meta">${T.effective}</p>
<p class="summary">${T.summary}</p>
${secs}
</section>`;
  });
  const title = `${app.title['tr-TR']} / ${app.title['en-US']}: Gizlilik / Privacy`;
  return page(title, 'tr', parts.join('\n')).replace('STYLE', '../stil.css');
}

function indexPage() {
  const items = cfg.apps
    .map((a) => `<li><a href="${a.slug}/">${esc(a.title['tr-TR'])} / ${esc(a.title['en-US'])}</a><small>${esc(a.applicationId)}</small></li>`)
    .join('\n');
  const body = `<h1>Gizlilik politikaları / Privacy policies</h1>
<p class="meta">${TEXT.tr.effective} · ${TEXT.en.effective}</p>
<p>Her oyunun sayfası önce Türkçe, sonra İngilizce metni içerir. / Each game's page has the Turkish text first, then the English one.</p>
<ul class="games">
${items}
</ul>
<p class="summary" lang="tr">Kısaca: bu oyunlar kişisel veri toplamaz, hiçbir yere veri göndermez ve kimseyle veri paylaşmaz.</p>
<p class="summary" lang="en">In short: these games collect no personal data, send no data anywhere and share no data with anyone.</p>`;
  return page('Gizlilik politikaları / Privacy policies', 'tr', body).replace('STYLE', 'stil.css');
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'stil.css'), CSS);
writeFileSync(join(OUT, 'index.html'), indexPage());
for (const app of cfg.apps) {
  mkdirSync(join(OUT, app.slug), { recursive: true });
  writeFileSync(join(OUT, app.slug, 'index.html'), gamePage(app));
}
writeFileSync(join(ROOT, 'docs', '.nojekyll'), '');
console.log(`wrote docs/gizlilik/ (index + ${cfg.apps.map((a) => a.slug).join(', ')}) and docs/.nojekyll`);
for (const app of cfg.apps) console.log(`  ${cfg.privacyPolicyBase}${app.slug}/`);
