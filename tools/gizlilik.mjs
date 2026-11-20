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
// 2026-11-20: the iPhone build (tools/ipa.mjs) is covered too: same bundle id as the package name,
// Game Center (tools/ipa/GameCenterPlugin.swift) instead of Play Games behind the same 13+ question,
// no permissions, no tracking; saves may be part of the user's own iCloud/computer device backup.
// If ads or analytics are added, change TEXT below, re-run, and update the Play Data safety form
// and the App Store Connect App Privacy answers.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './template.mjs';

const EFFECTIVE = { tr: '20 Kasım 2026', en: '20 November 2026' };
/** Developer contact e-mail shown on every page (App Store support URL needs a way to reach the
 *  developer). Empty: the pages point to the store pages' support sections instead. */
const CONTACT = '';
const cfg = JSON.parse(readFileSync(join(ROOT, 'store', 'apps.json'), 'utf8'));
const OUT = join(ROOT, 'docs', 'gizlilik');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Section texts; `n` = the game's name in that language, `id` = its package name / bundle id. HTML allowed. */
const TEXT = {
  tr: {
    lang: 'tr',
    heading: (n) => `${n}: gizlilik politikası`,
    effective: `Yürürlük tarihi: ${EFFECTIVE.tr}`,
    adsSummary: ' Ödüllü düğmeler yalnızca siz dokunduğunuzda, herkes için çocuklara yönelik ayarlarla (kişiselleştirme ve izleme olmadan) bir Google AdMob reklamı gösterir.',
    summary: 'Kısaca: oyunun kendisi kişisel veri toplamaz. İsteğe bağlı online sıralama yalnızca 13 yaş ve üstü oyuncular içindir; Android\'de Google Play Games, iPhone\'da Apple\'ın Game Center hizmeti üzerinden çalışır. O zaman en iyi skorlarınız Google Play Games profilinizle Google\'a ya da Game Center hesabınızla Apple\'a gönderilir.',
    sections: (n, id, ads) => [
      ['Kapsam', `Bu politika <b>${n}</b> oyununun Google Play'deki Android uygulaması ve App Store'daki iPhone uygulaması için geçerlidir (ikisinin de kimliği <code>${id}</code>). "Geliştirici", uygulamanın Google Play ya da App Store sayfasında adı yazan geliştiricidir.`],
      ['Toplanan bilgiler', 'Oyunun kendi hesabı ya da kaydı yoktur. Uygulama adınızı, e-posta adresinizi, konumunuzu, kişilerinizi, fotoğraflarınızı, cihaz kimliğinizi ya da reklam kimliğinizi (Android reklam kimliği, iOS reklam tanımlayıcısı) istemez ve okumaz. İstisnalar aşağıdaki isteğe bağlı online sıralama' + (ads ? ' ve ödüllü reklamlardır.' : 'dır.')],
      [
        'Online sıralama: yaş sorusu',
        'Rütbeler ekranındaki küre düğmesi isteğe bağlı online sıralamayı açar. İlk açılışta, internete bir şey gitmeden önce doğum yılınız bir kez sorulur. Doğum yılı saklanmaz; cihazda yalnızca cevabın kategorisi (13 yaş ve üstü ya da değil) tutulur. <b>13 yaşından küçükler için</b> online sıralama o kurulumda kalıcı olarak kapanır: Google Play Games ya da Game Center hiç başlatılmaz, giriş yapılmaz ve hiçbir skor gönderilmez. Online sıralamayı hiç açmazsanız da hiçbir şey gönderilmez.',
      ],
      [
        'Online sıralama: Android (Google Play Games)',
        `13 yaş ve üstü oyuncular için Android uygulaması Google Play Games Hizmetleri'ni başlatır; Google, Play Games profilinizle sizi otomatik olarak oturum açtırabilir ya da giriş ister. Giriş yapıldığında oyun, ${n} sıralama tablolarına en iyi skorlarınızı (rütbe ya da koleksiyon puanı, en iyi dalga, yükseklik gibi oyun sayıları) gönderir. Google bunları Play Games oyuncu kimliğiniz ve oyuncu adınızla birlikte saklar ve profil görünürlüğü ayarlarınıza göre diğer oyunculara sıralama tablolarında gösterir. Oyun Google'dan yalnızca oyuncu adınızı ve kendi sıra ve skorunuzu alır. Geliştirici, Play Console'da tablo kayıtlarını görebilir. Bu işlem Google'ın gizlilik politikasına tabidir; Play Games profilinizi ve etkinliğinizi Google Play Games uygulamasından ve Google Hesabınızdan yönetebilir ya da silebilirsiniz. Skorlar reklam için kullanılmaz.`,
      ],
      [
        'Online sıralama: iPhone (Game Center)',
        `13 yaş ve üstü oyuncular için iPhone uygulaması Apple'ın Game Center hizmetini başlatır; cihazda Game Center'a giriş yaptıysanız Apple sizi otomatik tanır, yapmadıysanız Apple'ın kendi giriş ekranı açılır. Giriş yapıldığında oyun, ${n} sıralama tablolarına en iyi skorlarınızı (yukarıdaki oyun sayıları) gönderir. Apple bunları Game Center hesabınız ve takma adınızla birlikte saklar ve Game Center ayarlarınıza göre diğer oyunculara sıralama tablolarında gösterir. Oyun Apple'dan yalnızca takma adınızı ve kendi sıra ve skorunuzu alır. Bu işlem Apple'ın gizlilik politikasına tabidir; Game Center'ı iPhone'un Ayarlar &rarr; Game Center bölümünden yönetebilir ya da kapatabilirsiniz. Skorlar reklam için kullanılmaz.`,
      ],
      [
        'Cihazınızda saklananlar',
        `Oyun ilerlemeniz ve ses ayarınız, uygulamanın kendi yerel depolamasında (WebView "local storage") <b>yalnızca cihazınızda</b> tutulur; uygulama bunları hiçbir sunucuya göndermez. Android'de uygulama, bulut yedeklemesini ve cihazdan cihaza aktarımı kendi verileri için kapatır, yani Google Drive yedeğine de yeni telefona aktarıma da girmez. iPhone'da bu veriler, açıksa cihazın kendi yedeğine (iCloud Yedekleme ya da bilgisayar yedeği) öteki uygulama verileriyle birlikte girebilir; bu yedek sizin Apple hesabınızda ya da bilgisayarınızdadır ve geliştirici ona erişemez. Uygulamayı kaldırmak hepsini siler; Android'de Ayarlar &rarr; Uygulamalar &rarr; ${n} &rarr; Depolama &rarr; Verileri temizle de siler.`,
      ],
      [
        'İnternet ve izinler',
        'Oyunun bütün dosyaları uygulamanın içindedir ve oyun çevrimdışı çalışır; oyunun kendisi internete istek göndermez. Yalnızca 13 yaş ve üstü oyuncularda Google Play Games kütüphanesi Google\'ın, Game Center Apple\'ın sunucularıyla konuşur (yukarıya bakın). Android uygulaması yalnızca INTERNET iznini bildirir: bu izin, oyunu çalıştıran WebView kabuğunun (Capacitor) standart parçasıdır ve sizden onay istenmez; bunun dışında yalnızca Android kütüphanelerinin eklediği, sadece uygulamanın kendisinin kullanabildiği bir iç izin vardır. ' + (ads ? 'Reklamlı oyunlarda Google’ın reklam kütüphanesi ayrıca ağ durumunu görme (ACCESS_NETWORK_STATE) gibi onay istemeyen birkaç teknik izin ekler; reklam kimliği izni (AD_ID) kaldırılmıştır. ' : '') + 'iPhone uygulaması hiçbir izin istemez. Uygulama kamera, mikrofon, konum, fotoğraflar, depolama gibi hiçbir izin istemez ve sizi başka uygulama ya da sitelerde izlemez.',
      ],
      ads
        ? [
            'Reklamlar (Google AdMob)',
            'Oyundaki ödüllü düğmeler (köşesinde <b>▶ REKLAM</b> yazar) yalnızca siz dokunduğunuzda Google AdMob’dan bir reklam gösterir; reklamı sonuna kadar izlerseniz ödülü alırsınız, kapatırsanız almazsınız. Oyunun başka hiçbir yerinde reklam yoktur. Uygulama, <b>bütün oyuncular için</b> reklam isteklerini çocuklara yönelik olarak işaretler (çocuklara yönelik işlem etiketi, rıza yaşının altında etiketi, en fazla "G" içerik düzeyi). Bu yüzden kişiselleştirilmiş reklam ya da yeniden hedefleme yapılmaz; uygulama Android reklam kimliğini (AD_ID izni kaldırılmıştır) ve iOS reklam tanımlayıcısını (IDFA) kullanmaz, izleme izni istemez ve sizi başka uygulama ya da sitelerde izlemez. Reklamı göstermek için Google; cihaz bilgisi (model, işletim sistemi sürümü, dil), IP adresi, uygulama bilgisi ve reklamla etkileşim (gösterim, dokunma) gibi bilgileri reklamı sunmak, ölçmek, sahtekârlığı önlemek ve hataları ayıklamak için işler. Bu işlem Google’ın gizlilik politikasına ve çocuklara yönelik reklam isteklerine ilişkin kurallarına tabidir. Geliştirici AdMob’da yalnızca toplu reklam istatistiklerini görür. Uygulamada analitik yazılımı yoktur.',
          ]
        : ['Analitik ve reklam', 'Uygulamada analitik, reklam ya da izleme yazılımı (SDK) yoktur. Oyun içindeki "ödül" düğmeleri bu sürümde reklam göstermeden ödülü hemen verir.'],
      ['Paylaşım', 'Hiçbir bilgi satılmaz. Online sıralamayı kullanan 13 yaş ve üstü oyuncuların skorları Android\'de Google Play Games\'e, iPhone\'da Game Center\'a gönderilir ve sıralama tablolarında diğer oyunculara görünür' + (ads ? '; ödüllü bir reklam açtığınızda yukarıdaki reklam bilgileri Google AdMob’a gider' : '') + '; bunun dışında hiçbir bilgi kimseyle paylaşılmaz.'],
      [
        'Google Play ve App Store',
        "Uygulamayı Google Play'den ya da App Store'dan indirip kullanırken Google ya da Apple, kendi gizlilik politikasına göre bazı bilgileri işleyebilir (örneğin indirme kaydı; cihazınızda bu paylaşım açıksa çökme raporları). Bu işlem uygulamanın değil mağazanın sorumluluğundadır; geliştirici bunları Google Play Console'da ya da App Store Connect'te yalnızca toplu istatistik olarak görür.",
      ],
      ['Çocuklar', (ads ? 'Reklamlar herkes için çocuklara yönelik ayarlarla istenir (yukarıya bakın); bunun dışında uygulama' : 'Uygulama') + ' çocuklardan hiçbir bilgi toplamaz ya da göndermez. Yaş sorusu 13 yaşından küçük bir oyuncu gösterirse online sıralama kapanır; Google Play Games ya da Game Center hiç başlatılmaz. Oyunun geri kalanı aynen çalışır.'],
      [
        'Değişiklikler',
        "Reklam ya da analitik eklenirse bu sayfa, o sürüm yayımlanmadan önce güncellenir: hangi sağlayıcının, hangi bilgileri (örneğin reklam kimliği, cihaz bilgisi, IP adresi), hangi amaçla işlediği, kiminle paylaşıldığı ve nasıl vazgeçebileceğiniz yazılır; Google Play'deki Veri güvenliği ve App Store'daki Uygulama Gizliliği bölümleri de buna göre değişir. Geçerli metin her zaman bu adrestedir; tarih en üsttedir.",
      ],
      [
        'İletişim',
        CONTACT
          ? `Sorularınız için: <a href="mailto:${CONTACT}">${CONTACT}</a>.`
          : 'Sorularınız için uygulamanın Google Play sayfasındaki <b>Uygulama desteği</b> bölümünde ya da App Store sayfasındaki geliştirici bilgisinde yazan iletişim yolunu kullanın.',
      ],
    ],
    other: 'English',
    back: 'Tüm oyunlar',
  },
  en: {
    lang: 'en',
    heading: (n) => `${n}: privacy policy`,
    effective: `Effective date: ${EFFECTIVE.en}`,
    adsSummary: ' The rewarded buttons show a Google AdMob ad only when you tap them, with child-directed settings for everyone (no personalisation, no tracking).',
    summary: 'In short: the game itself collects no personal data. The optional online ranking is only for players aged 13 and over and runs through Google Play Games on Android and Apple\'s Game Center on iPhone; then your best scores go to Google with your Google Play Games profile, or to Apple with your Game Center account.',
    sections: (n, id, ads) => [
      ['Scope', `This policy applies to <b>${n}</b>: the Android app on Google Play and the iPhone app on the App Store (both with the id <code>${id}</code>). "The developer" is the developer named on the app's Google Play or App Store page.`],
      ['Information collected', 'The game has no accounts or sign-up of its own. The app does not ask for or read your name, e-mail address, location, contacts, photos, device identifiers or advertising ID (the Android advertising ID or the iOS Identifier for Advertisers). The exceptions are the optional online ranking' + (ads ? ' and the rewarded ads below.' : ' below.')],
      [
        'Online ranking: the age question',
        'The globe button on the Ranks screen opens the optional online ranking. The first time, before anything goes online, it asks once for your year of birth. The year is not stored; only the answer\'s category (13 or over, or not) is kept on the device. <b>For players under 13</b> online ranking is switched off for good on that install: Google Play Games or Game Center is never started, there is no sign-in and no score is sent. If you never open online ranking, nothing is sent either.',
      ],
      [
        'Online ranking: Android (Google Play Games)',
        `For players aged 13 and over the Android app starts Google Play Games Services; Google may sign you in automatically with your Play Games profile or ask you to sign in. Once signed in, the game sends your best scores (game numbers such as the rank or collection score, best wave or height) to the ${n} leaderboards. Google stores them with your Play Games player ID and gamer name and shows them to other players on the leaderboards according to your profile visibility settings. The game receives from Google only your gamer name and your own rank and score. The developer can see leaderboard entries in Play Console. This processing is governed by Google's privacy policy; you can manage or delete your Play Games profile and activity in the Google Play Games app and your Google Account. Scores are not used for advertising.`,
      ],
      [
        'Online ranking: iPhone (Game Center)',
        `For players aged 13 and over the iPhone app starts Apple's Game Center; if you are already signed in to Game Center on the device, Apple recognises you automatically, otherwise Apple's own sign-in screen opens. Once signed in, the game sends your best scores (the game numbers above) to the ${n} leaderboards. Apple stores them with your Game Center account and nickname and shows them to other players on the leaderboards according to your Game Center settings. The game receives from Apple only your nickname and your own rank and score. This processing is governed by Apple's privacy policy; you can manage or turn off Game Center in the iPhone's Settings &rarr; Game Center. Scores are not used for advertising.`,
      ],
      [
        'What is stored on your device',
        `Your game progress and your sound setting are kept in the app's own local storage (the WebView's "local storage") <b>on your device only</b>; the app sends them to no server. On Android the app turns off cloud backup and device-to-device transfer for its data, so they are neither copied to a Google Drive backup nor moved to a new phone. On iPhone they may be included, with other apps' data, in the device's own backup (iCloud Backup or a computer backup) if you have that turned on; that backup lives in your Apple account or on your computer and the developer cannot access it. Uninstalling the app deletes all of it; on Android, Settings &rarr; Apps &rarr; ${n} &rarr; Storage &rarr; Clear data does too.`,
      ],
      [
        'Internet and permissions',
        'All of the game\'s files are inside the app and the game works offline; the game itself makes no requests to the internet. Only for players aged 13 and over does the Google Play Games library talk to Google\'s servers, or Game Center to Apple\'s (see above). The Android app declares only the INTERNET permission, a standard part of the WebView shell (Capacitor) that runs the game, which Android grants without asking you; besides that there is only an internal permission added by Android libraries that no app other than this one can use. ' + (ads ? 'In games with ads, Google’s ad library adds a few technical permissions that need no approval, such as viewing the network state (ACCESS_NETWORK_STATE); the advertising ID permission (AD_ID) is removed. ' : '') + 'The iPhone app asks for no permission. The app asks for no permission such as camera, microphone, location, photos or storage, and does not track you across other apps or websites.',
      ],
      ads
        ? [
            'Ads (Google AdMob)',
            'The game’s rewarded buttons (marked <b>▶ AD</b> in the corner) show an ad from Google AdMob only when you tap them; watch it to the end and you get the reward, close it early and you do not. There are no ads anywhere else in the game. The app marks its ad requests as child-directed <b>for every player</b> (tag for child-directed treatment, tag for users under the age of consent, maximum content rating "G"). So there are no personalised ads and no remarketing; the app does not use the Android advertising ID (the AD_ID permission is removed) or the iOS Identifier for Advertisers (IDFA), does not ask for tracking permission and does not track you across other apps or websites. To show an ad, Google processes information such as device information (model, operating system version, language), IP address, app information and ad interactions (impressions, taps) to serve and measure ads, prevent fraud and debug. This processing is governed by Google’s privacy policy and its rules for child-directed ad requests. The developer sees only aggregated ad statistics in AdMob. The app contains no analytics software.',
          ]
        : ['Analytics and ads', 'The app contains no analytics, advertising or tracking software (SDK). In this version the in-game "reward" buttons give their reward straight away without showing an ad.'],
      ['Sharing', 'No information is sold. The scores of players aged 13 and over who use the online ranking go to Google Play Games on Android or Game Center on iPhone and are visible to other players on the leaderboards' + (ads ? '; when you open a rewarded ad, the ad information above goes to Google AdMob' : '') + '; apart from that no information is shared with anyone.'],
      [
        'Google Play and the App Store',
        "When you download and use the app through Google Play or the App Store, Google or Apple may process some information under its own privacy policy (for example the download record and, if this sharing is switched on on your device, crash reports). That processing is the store's, not the app's; the developer only sees it as aggregated statistics in Google Play Console or App Store Connect.",
      ],
      ['Children', (ads ? 'Ads are requested with child-directed settings for everyone (see above); apart from that the app' : 'The app') + ' collects and sends no information from children. If the age question shows a player under 13, online ranking is switched off; Google Play Games or Game Center is never started. The rest of the game works as before.'],
      [
        'Changes',
        "If ads or analytics are added, this page will be updated before that version is released: it will name the provider, the information it processes (for example advertising ID, device information, IP address), why, with whom it is shared and how to opt out, and the Data safety section on Google Play and the App Privacy section on the App Store will change accordingly. The current text is always at this address; its date is at the top.",
      ],
      [
        'Contact',
        CONTACT
          ? `For questions: <a href="mailto:${CONTACT}">${CONTACT}</a>.`
          : 'For questions, use the contact shown in the <b>App support</b> section of the app\'s Google Play page or in the developer information on its App Store page.',
      ],
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
    const secs = T.sections(n, esc(app.applicationId), app.platform === 'capacitor' && Boolean(app.admob))
      .map(([h, p]) => `<h2>${h}</h2>\n<p>${p}</p>`)
      .join('\n');
    return `<section class="lang" id="${l}" lang="${l}">
<nav><a href="../">${T.back}</a><a href="#${l === 'tr' ? 'en' : 'tr'}">${T.other}</a></nav>
<h1>${T.heading(n)}</h1>
<p class="meta">${T.effective}</p>
<p class="summary">${T.summary}${app.platform === 'capacitor' && app.admob ? T.adsSummary : ''}</p>
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
<p class="summary" lang="tr">Kısaca: bu oyunlar kişisel veri toplamaz. Yalnızca 13 yaş ve üstü oyuncuların isteğe bağlı online sıralaması, en iyi skorları Android'de Google Play Games'e, iPhone'da Game Center'a gönderir. Bazı oyunlarda ödüllü düğmeler, siz dokunduğunuzda, çocuklara yönelik ayarlarla bir Google AdMob reklamı gösterir (her oyunun sayfasına bakın).</p>
<p class="summary" lang="en">In short: these games collect no personal data. Only the optional online ranking for players aged 13 and over sends best scores to Google Play Games on Android or Game Center on iPhone. In some games the rewarded buttons show a Google AdMob ad when you tap them, with child-directed settings (see each game's page).</p>`;
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
