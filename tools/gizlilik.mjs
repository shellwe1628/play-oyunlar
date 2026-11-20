#!/usr/bin/env node
// Writes the privacy-policy site for GitHub Pages: docs/gizlilik/ (index + one page per app in
// store/apps.json, Turkish and English on each page). Pages serves the repository's docs/ folder
// (Settings → Pages → Deploy from a branch → main, /docs); docs/.nojekyll turns Jekyll off.
//   node tools/gizlilik.mjs
// The text states what the current builds do, checked against the code (2026-11-17): no
// accounts, no analytics sent anywhere, no ad SDK, progress and sound setting kept in the
// WebView's local storage on the device, Android backup and device transfer excluded
// (tools/aab.mjs), only the INTERNET permission (+ AndroidX's internal one), no network requests
// of its own. 2026-11-20: optional online ranking through Google Play Games Services (Play builds
// with a playGames block), only after the neutral age question says 13+ (packages/core/src/online).
// If ads or analytics are added, change TEXT below, re-run, and update the Data safety form.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './template.mjs';

const EFFECTIVE = { tr: '20 Kasım 2026', en: '20 November 2026' };
const cfg = JSON.parse(readFileSync(join(ROOT, 'store', 'apps.json'), 'utf8'));
const OUT = join(ROOT, 'docs', 'gizlilik');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Section texts; `n` = the game's name in that language, `id` = its package name. HTML allowed. */
const TEXT = {
  tr: {
    lang: 'tr',
    heading: (n) => `${n}: gizlilik politikası`,
    effective: `Yürürlük tarihi: ${EFFECTIVE.tr}`,
    summary: 'Kısaca: oyunun kendisi kişisel veri toplamaz. İsteğe bağlı online sıralama yalnızca 13 yaş ve üstü oyuncular içindir ve Google Play Games üzerinden çalışır; o zaman en iyi skorlarınız Google Play Games profilinizle birlikte Google\'a gönderilir.',
    sections: (n, id) => [
      ['Kapsam', `Bu politika Google Play'deki <b>${n}</b> Android uygulaması (<code>${id}</code>) için geçerlidir. "Geliştirici", uygulamanın Google Play sayfasında adı yazan geliştiricidir.`],
      ['Toplanan bilgiler', 'Oyunun kendi hesabı ya da kaydı yoktur. Uygulama adınızı, e-posta adresinizi, konumunuzu, kişilerinizi, fotoğraflarınızı, cihaz ya da reklam kimliğinizi istemez ve okumaz. Tek istisna aşağıdaki isteğe bağlı online sıralamadır.'],
      [
        'Online sıralama (Google Play Games)',
        `Rütbeler ekranındaki küre düğmesi isteğe bağlı online sıralamayı açar. İlk açılışta, internete bir şey gitmeden önce doğum yılınız bir kez sorulur. Doğum yılı saklanmaz; cihazda yalnızca cevabın kategorisi (13 yaş ve üstü ya da değil) tutulur. <b>13 yaşından küçükler için</b> online sıralama o kurulumda kalıcı olarak kapanır: Google Play Games hiç başlatılmaz, giriş yapılmaz ve hiçbir skor gönderilmez. 13 yaş ve üstü oyuncular için oyun Google Play Games Hizmetleri'ni başlatır; Google, Play Games profilinizle sizi otomatik olarak oturum açtırabilir ya da giriş ister. Giriş yapıldığında oyun, ${n} sıralama tablolarına en iyi skorlarınızı (rütbe ya da koleksiyon puanı, en iyi dalga, yükseklik gibi oyun sayıları) gönderir. Google bunları Play Games oyuncu kimliğiniz ve oyuncu adınızla birlikte saklar ve profil görünürlüğü ayarlarınıza göre diğer oyunculara sıralama tablolarında gösterir. Oyun Google'dan yalnızca oyuncu adınızı ve kendi sıra ve skorunuzu alır. Geliştirici, Play Console'da tablo kayıtlarını görebilir. Bu işlem Google'ın gizlilik politikasına tabidir; Play Games profilinizi ve etkinliğinizi Google Play Games uygulamasından ve Google Hesabınızdan yönetebilir ya da silebilirsiniz. Skorlar reklam için kullanılmaz.`,
      ],
      [
        'Cihazınızda saklananlar',
        `Oyun ilerlemeniz ve ses ayarınız, uygulamanın kendi yerel depolamasında (WebView "local storage") <b>yalnızca cihazınızda</b> tutulur. Bu bilgiler cihazdan çıkmaz: uygulama, Android'in bulut yedeklemesini ve cihazdan cihaza aktarımını kendi verileri için kapatır, yani Google Drive yedeğine de yeni telefona aktarıma da girmez. Uygulamayı kaldırmak ya da Ayarlar &rarr; Uygulamalar &rarr; ${n} &rarr; Depolama &rarr; Verileri temizle, hepsini siler.`,
      ],
      [
        'İnternet ve izinler',
        'Oyunun bütün dosyaları uygulamanın içindedir ve oyun çevrimdışı çalışır; oyunun kendisi internete istek göndermez. Yalnızca 13 yaş ve üstü oyuncularda Google Play Games kütüphanesi Google\'ın sunucularıyla konuşur (yukarıya bakın). Uygulama yalnızca INTERNET iznini bildirir: bu izin, oyunu çalıştıran WebView kabuğunun (Capacitor) standart parçasıdır ve sizden onay istenmez. Bunun dışında yalnızca Android kütüphanelerinin eklediği, sadece uygulamanın kendisinin kullanabildiği bir iç izin vardır. Uygulama kamera, mikrofon, konum, depolama gibi hiçbir izin istemez.',
      ],
      ['Analitik ve reklam', 'Uygulamada analitik, reklam ya da izleme yazılımı (SDK) yoktur. Oyun içindeki "ödül" düğmeleri bu sürümde reklam göstermeden ödülü hemen verir.'],
      ['Paylaşım', 'Hiçbir bilgi satılmaz. Online sıralamayı kullanan 13 yaş ve üstü oyuncuların skorları Google Play Games\'e gönderilir ve sıralama tablolarında diğer oyunculara görünür; bunun dışında hiçbir bilgi kimseyle paylaşılmaz.'],
      [
        'Google Play',
        "Uygulamayı Google Play'den indirip kullanırken Google, kendi gizlilik politikasına göre bazı bilgileri işleyebilir (örneğin indirme kaydı; cihazınızda bu paylaşım açıksa Android'in çökme raporları). Bu işlem uygulamanın değil Google'ın sorumluluğundadır; geliştirici bunları Google Play Console'da yalnızca toplu istatistik olarak görür.",
      ],
      ['Çocuklar', 'Uygulama çocuklardan hiçbir bilgi toplamaz ya da göndermez. Yaş sorusu 13 yaşından küçük bir oyuncu gösterirse online sıralama kapanır ve Google Play Games hiç başlatılmaz; oyunun geri kalanı aynen çalışır.'],
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
    summary: 'In short: the game itself collects no personal data. The optional online ranking is only for players aged 13 and over and runs through Google Play Games; then your best scores go to Google with your Google Play Games profile.',
    sections: (n, id) => [
      ['Scope', `This policy applies to the Android app <b>${n}</b> (<code>${id}</code>) on Google Play. "The developer" is the developer named on the app's Google Play page.`],
      ['Information collected', 'The game has no accounts or sign-up of its own. The app does not ask for or read your name, e-mail address, location, contacts, photos, device identifiers or advertising ID. The one exception is the optional online ranking below.'],
      [
        'Online ranking (Google Play Games)',
        `The globe button on the Ranks screen opens the optional online ranking. The first time, before anything goes online, it asks once for your year of birth. The year is not stored; only the answer's category (13 or over, or not) is kept on the device. <b>For players under 13</b> online ranking is switched off for good on that install: Google Play Games is never started, there is no sign-in and no score is sent. For players aged 13 and over the game starts Google Play Games Services; Google may sign you in automatically with your Play Games profile or ask you to sign in. Once signed in, the game sends your best scores (game numbers such as the rank or collection score, best wave or height) to the ${n} leaderboards. Google stores them with your Play Games player ID and gamer name and shows them to other players on the leaderboards according to your profile visibility settings. The game receives from Google only your gamer name and your own rank and score. The developer can see leaderboard entries in Play Console. This processing is governed by Google's privacy policy; you can manage or delete your Play Games profile and activity in the Google Play Games app and your Google Account. Scores are not used for advertising.`,
      ],
      [
        'What is stored on your device',
        `Your game progress and your sound setting are kept in the app's own local storage (the WebView's "local storage") <b>on your device only</b>. They never leave the device: the app turns off Android cloud backup and device-to-device transfer for its data, so they are neither copied to a Google Drive backup nor moved to a new phone. Uninstalling the app, or Settings &rarr; Apps &rarr; ${n} &rarr; Storage &rarr; Clear data, deletes all of it.`,
      ],
      [
        'Internet and permissions',
        'All of the game\'s files are inside the app and the game works offline; the game itself makes no requests to the internet. Only for players aged 13 and over does the Google Play Games library talk to Google\'s servers (see above). The app declares only the INTERNET permission, a standard part of the WebView shell (Capacitor) that runs the game, which Android grants without asking you. Besides that there is only an internal permission added by Android libraries that no app other than this one can use. The app asks for no permission such as camera, microphone, location or storage.',
      ],
      ['Analytics and ads', 'The app contains no analytics, advertising or tracking software (SDK). In this version the in-game "reward" buttons give their reward straight away without showing an ad.'],
      ['Sharing', 'No information is sold. The scores of players aged 13 and over who use the online ranking go to Google Play Games and are visible to other players on the leaderboards; apart from that no information is shared with anyone.'],
      [
        'Google Play',
        "When you download and use the app through Google Play, Google may process some information under its own privacy policy (for example the download record and, if this sharing is switched on on your device, Android crash reports). That processing is Google's, not the app's; the developer only sees it as aggregated statistics in Google Play Console.",
      ],
      ['Children', 'The app collects and sends no information from children. If the age question shows a player under 13, online ranking is switched off and Google Play Games is never started; the rest of the game works as before.'],
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
