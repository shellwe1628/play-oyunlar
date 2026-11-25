#!/usr/bin/env node
// Writes the privacy-policy site for GitHub Pages: docs/gizlilik/ (index + one page per app in
// store/apps.json, Turkish and English on each page) and the support page docs/destek/ (the App
// Store "Support URL"). Pages serves the repository's docs/ folder (Settings → Pages → Deploy from
// a branch → main, /docs); docs/.nojekyll turns Jekyll off.
//   node tools/gizlilik.mjs
// The text states what the current builds do, checked against the code. History:
// 2026-11-17: no accounts, progress and sound setting kept in the WebView's local storage on the
//   device, Android backup and device transfer excluded (tools/aab.mjs), no requests of its own.
// 2026-11-20: optional online ranking through Google Play Games Services (packages/core/src/online)
//   and the iPhone build (tools/ipa.mjs) with Game Center (tools/ipa/GameCenterPlugin.swift).
// 2026-11-24: AdMob rewarded ads (tools/admob.mjs: child-directed for every player, no AD_ID, no
//   IDFA, the SDK's app set ID), the merged manifest's real permission list (tools/aab.mjs
//   verify), the age question on Android only (online.ts asksAge: Play Games is not started before
//   a 13+ answer, tools/aab/playgames.mjs removes its launch-time init provider), Game Center
//   without an age question, the developer's name, the support page.
// When a build changes what it collects or which services it talks to, change TEXT below, re-run,
// and update the Play Data safety form and the App Store Connect App Privacy answers.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './template.mjs';

const EFFECTIVE = { tr: '24 Kasım 2026', en: '24 November 2026' };
/** Developer contact e-mail shown on every page (the App Store support URL needs a way to reach the developer). */
const CONTACT = 'emirhancin28@gmail.com';
/** Who makes the games (App Store 1.5 / Play developer information). */
const DEVELOPER = 'Emirhan Cin';
const cfg = JSON.parse(readFileSync(join(ROOT, 'store', 'apps.json'), 'utf8'));
const OUT = join(ROOT, 'docs', 'gizlilik');
const SUPPORT = join(ROOT, 'docs', 'destek');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const names = (lang) => cfg.apps.map((a) => esc(a.title[lang === 'tr' ? 'tr-TR' : 'en-US']));
const listOf = (items, and) => `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}`;
const mail = `<a href="mailto:${CONTACT}">${CONTACT}</a>`;

/** Section texts; `n` = the game's name in that language, `id` = its package name / bundle id. HTML allowed. */
const TEXT = {
  tr: {
    lang: 'tr',
    heading: (n) => `${n}: gizlilik politikası`,
    effective: `Yürürlük tarihi: ${EFFECTIVE.tr}`,
    adsSummary: ' Ödüllü düğmeler yalnızca siz dokunduğunuzda, herkes için çocuklara yönelik ve kişiselleştirilmemiş ayarlarla bir Google AdMob reklamı gösterir; reklam kimliği kullanılmaz.',
    summary:
      'Kısaca: oyunun kendisi hesap açtırmaz ve kişisel veri toplamaz; ilerlemeniz yalnızca cihazınızda kalır. İsteğe bağlı online sıralama Android\'de Google Play Games üzerinden, yalnızca yaş sorusuna 13 yaş ve üstü cevabından sonra; iPhone\'da Apple\'ın Game Center hizmeti üzerinden çalışır. O zaman en iyi skorlarınız Google\'a ya da Apple\'a gönderilir.',
    sections: (n, id, ads) => [
      ['Kapsam ve geliştirici', `Bu politika <b>${n}</b> oyununun Google Play'deki Android uygulaması ve App Store'daki iPhone uygulaması için geçerlidir (ikisinin de kimliği <code>${id}</code>). Geliştirici: <b>${DEVELOPER}</b> (${listOf(names('tr'), 've')} oyunlarının geliştiricisi). İletişim: ${mail}.`],
      ['Toplanan bilgiler', 'Oyunun kendi hesabı ya da kaydı yoktur. Oyun adınızı, e-posta adresinizi, konumunuzu, kişilerinizi, fotoğraflarınızı ya da reklam kimliğinizi (Android reklam kimliği, iOS reklam tanımlayıcısı) istemez ve okumaz. İstisnalar aşağıdaki isteğe bağlı online sıralama' + (ads ? ' ve ödüllü reklamlardır.' : 'dır.')],
      [
        'Online sıralama: Android\'de yaş sorusu',
        'Rütbeler ekranındaki küre düğmesi isteğe bağlı online sıralamayı açar. Android\'de ilk açılışta, internete bir şey gitmeden önce doğum yılınız bir kez sorulur. Doğum yılı saklanmaz; cihazda yalnızca cevabın kategorisi (13 yaş ve üstü ya da değil) tutulur. Google Play Games, uygulama açılırken değil, ancak 13 yaş ve üstü cevabından sonra başlatılır. <b>13 yaşından küçükler için</b> online sıralama o kurulumda kalıcı olarak kapanır ve ekranda "Online sıralama 13 yaş ve üstü oyuncular içindir." yazar: Google Play Games hiç başlatılmaz, giriş yapılmaz ve hiçbir skor gönderilmez. Online sıralamayı hiç açmazsanız da hiçbir şey gönderilmez.',
      ],
      [
        'Online sıralama: Android (Google Play Games)',
        `13 yaş ve üstü cevabından sonra Android uygulaması Google Play Games Hizmetleri'ni başlatır; Google, Play Games profilinizle sizi otomatik olarak oturum açtırabilir ya da giriş ister. Giriş yapıldığında oyun, ${n} sıralama tablolarına en iyi skorlarınızı (rütbe ya da koleksiyon puanı, en iyi dalga, yükseklik gibi oyun sayıları) gönderir. Google bunları Play Games oyuncu kimliğiniz ve oyuncu adınızla birlikte saklar ve profil görünürlüğü ayarlarınıza göre diğer oyunculara sıralama tablolarında gösterir. Oyun Google'dan yalnızca oyuncu adınızı ve kendi sıra ve skorunuzu alır. Geliştirici, Play Console'da tablo kayıtlarını görebilir. Bu işlem Google'ın gizlilik politikasına tabidir; Play Games profilinizi ve etkinliğinizi Google Play Games uygulamasından ve Google Hesabınızdan yönetebilir ya da silebilirsiniz. Skorlar reklam için kullanılmaz.`,
      ],
      [
        'Online sıralama: iPhone (Game Center)',
        `iPhone uygulamasında online sıralama Apple'ın Game Center hizmetini kullanır ve ayrı bir yaş sorusu yoktur: Game Center Apple'ın kendi hizmetidir ve çocuklarınki dahil bütün Game Center hesaplarını Apple'ın kurallarına göre yönetir (örneğin ebeveynler Ekran Süresi ile Game Center'ı kısıtlayabilir). Oyun Game Center'ı yalnızca online sıralama panelinde Giriş yap'a dokunduğunuzda başlatır (bir kez giriş yaptıktan sonra sonraki açılışlarda da); cihazda Game Center'a giriş yaptıysanız Apple sizi tanır, yapmadıysanız Apple'ın kendi giriş ekranı açılır. Giriş yapıldığında oyun, ${n} sıralama tablolarına en iyi skorlarınızı (yukarıdaki oyun sayıları) gönderir. Apple bunları Game Center hesabınız ve takma adınızla birlikte saklar ve Game Center ayarlarınıza göre diğer oyunculara sıralama tablolarında gösterir. Oyun Apple'dan yalnızca takma adınızı ve kendi sıra ve skorunuzu alır. Bu işlem Apple'ın gizlilik politikasına tabidir; Game Center'ı iPhone'un Ayarlar &rarr; Game Center bölümünden yönetebilir ya da kapatabilirsiniz. Skorlar reklam için kullanılmaz.`,
      ],
      [
        'Cihazınızda saklananlar',
        `Oyun ilerlemeniz ve ses ayarınız, uygulamanın kendi yerel depolamasında (WebView "local storage") <b>yalnızca cihazınızda</b> tutulur; uygulama bunları hiçbir sunucuya göndermez. Android'de uygulama, bulut yedeklemesini ve cihazdan cihaza aktarımı kendi verileri için kapatır, yani Google Drive yedeğine de yeni telefona aktarıma da girmez. iPhone'da bu veriler, açıksa cihazın kendi yedeğine (iCloud Yedekleme ya da bilgisayar yedeği) öteki uygulama verileriyle birlikte girebilir; bu yedek sizin Apple hesabınızda ya da bilgisayarınızdadır ve geliştirici ona erişemez. Uygulamayı kaldırmak hepsini siler; Android'de Ayarlar &rarr; Uygulamalar &rarr; ${n} &rarr; Depolama &rarr; Verileri temizle de siler.`,
      ],
      [
        'İnternet ve izinler',
        'Oyunun bütün dosyaları uygulamanın içindedir ve oyun çevrimdışı çalışır; oyunun kendisi internete istek göndermez. İnternete yalnızca Google Play Games ya da Game Center (online sıralamayı kullanırsanız)' +
          (ads ? ' ve Google AdMob (ödüllü bir reklam açtığınızda)' : '') +
          ' bağlanır. ' +
          (ads
            ? 'Android uygulamasının bildirdiği izinlerin tamamı şunlardır: INTERNET ve ACCESS_NETWORK_STATE (internete bağlanmak ve bağlantı olup olmadığını görmek), WAKE_LOCK ve FOREGROUND_SERVICE (Google\'ın reklam kütüphanesinin kullandığı WorkManager bileşeninin eklediği teknik izinler), <code>com.android.vending.CHECK_LICENSE</code> (Google Play\'in uygulamanın Play\'den kurulduğunu denetlemesi) ve yalnızca uygulamanın kendisinin kullanabildiği iç izin <code>DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION</code>. Bunların hiçbiri sizden onay istemez; oyunun kendine ait bir arka plan hizmeti ya da bildirimi yoktur. Reklam kimliği izni (AD_ID) ve Privacy Sandbox reklam izinleri kaldırılmıştır. '
            : 'Android uygulaması INTERNET iznini (ve online sıralama için ağ durumunu görme iznini) bildirir; bunun dışında yalnızca uygulamanın kendisinin kullanabildiği bir iç izin vardır. Bunların hiçbiri sizden onay istemez. ') +
          'iPhone uygulaması hiçbir izin istemez. Uygulama kamera, mikrofon, konum, fotoğraflar, kişiler, depolama gibi hiçbir izin istemez ve sizi başka uygulama ya da sitelerde izlemez.',
      ],
      ads
        ? [
            'Reklamlar (Google AdMob)',
            'Oyundaki ödüllü düğmeler (köşesinde <b>▶ REKLAM</b> yazar) yalnızca siz dokunduğunuzda Google AdMob’dan bir reklam gösterir; reklamı sonuna kadar izlerseniz ödülü alırsınız, kapatırsanız almazsınız. Oyunun başka hiçbir yerinde reklam yoktur. Uygulama, <b>bütün oyuncular için</b> reklam isteklerini çocuklara yönelik olarak işaretler (çocuklara yönelik işlem etiketi, rıza yaşının altında etiketi, en fazla "G" içerik düzeyi). Bu yüzden reklamlar herkes için kişiselleştirilmemiştir ve yeniden hedefleme yapılmaz. Uygulama Android reklam kimliğini (AD_ID izni kaldırılmıştır) ve iOS reklam tanımlayıcısını (IDFA) kullanmaz, izleme izni istemez ve sizi başka uygulama ya da sitelerde izlemez. Android\'de Google\'ın reklam kütüphanesi, yalnızca aynı geliştiricinin uygulamalarıyla sınırlı bir tanımlayıcı olan <b>uygulama seti kimliğini</b> (app set ID) analiz ve sahtekârlığı önleme için kullanır. Reklamı göstermek için Google ayrıca cihaz bilgisi (model, işletim sistemi sürümü, dil), IP adresi (yaklaşık konum çıkarılabilir), uygulama bilgisi ve reklamla etkileşim (gösterim, dokunma) ile tanılama bilgilerini reklamı sunmak, ölçmek, sahtekârlığı önlemek ve hataları ayıklamak için işler; bu bilgiler aktarım sırasında şifrelenir. Bu işlem Google’ın gizlilik politikasına ve çocuklara yönelik reklam isteklerine ilişkin kurallarına tabidir. Geliştirici AdMob’da yalnızca toplu reklam istatistiklerini görür. Uygulamada ayrı bir analitik yazılımı yoktur.',
          ]
        : ['Analitik ve reklam', 'Uygulamada analitik, reklam ya da izleme yazılımı (SDK) yoktur. Oyun içindeki "ödül" düğmeleri bu sürümde reklam göstermeden ödülü hemen verir.'],
      ['Paylaşım', 'Hiçbir bilgi satılmaz. Online sıralamayı kullanan oyuncuların skorları Android\'de Google Play Games\'e, iPhone\'da Game Center\'a gönderilir ve sıralama tablolarında diğer oyunculara görünür' + (ads ? '; ödüllü bir reklam açtığınızda yukarıdaki reklam bilgileri Google AdMob’a gider' : '') + '; bunun dışında hiçbir bilgi kimseyle paylaşılmaz.'],
      [
        'Google Play ve App Store',
        "Uygulamayı Google Play'den ya da App Store'dan indirip kullanırken Google ya da Apple, kendi gizlilik politikasına göre bazı bilgileri işleyebilir (örneğin indirme kaydı; cihazınızda bu paylaşım açıksa çökme raporları). Bu işlem uygulamanın değil mağazanın sorumluluğundadır; geliştirici bunları Google Play Console'da ya da App Store Connect'te yalnızca toplu istatistik olarak görür.",
      ],
      [
        'Çocuklar',
        (ads ? 'Reklamlar herkes için çocuklara yönelik ve kişiselleştirilmemiş ayarlarla istenir (yukarıya bakın); bunun dışında uygulama' : 'Uygulama') +
          ' çocuklardan hiçbir bilgi toplamaz ya da göndermez. Android\'de yaş sorusu 13 yaşından küçük bir oyuncu gösterirse online sıralama kapanır ve Google Play Games hiç başlatılmaz. iPhone\'da Game Center, çocuk hesaplarını Apple\'ın kurallarına göre yönetir. Oyunun geri kalanı her durumda aynen çalışır.',
      ],
      [
        'Değişiklikler',
        'Bu politika, uygulamaların yeni bir sürümü farklı bilgiler işlediğinde ya da farklı bir hizmet kullandığında, o sürüm yayımlanmadan önce güncellenir; Google Play\'deki Veri güvenliği ve App Store\'daki Uygulama Gizliliği bölümleri de buna göre değişir. Geçerli metin her zaman bu adrestedir; yürürlük tarihi en üsttedir.',
      ],
      ['İletişim', `Geliştirici ${DEVELOPER}. Sorularınız ve gizlilikle ilgili talepleriniz için: ${mail}. Destek sayfası: <a href="../../destek/">oyunlar.carsihani.me/destek</a>.`],
    ],
    other: 'English',
    back: 'Tüm oyunlar',
  },
  en: {
    lang: 'en',
    heading: (n) => `${n}: privacy policy`,
    effective: `Effective date: ${EFFECTIVE.en}`,
    adsSummary: ' The rewarded buttons show a Google AdMob ad only when you tap them, with child-directed, non-personalised settings for everyone; no advertising ID is used.',
    summary:
      'In short: the game itself needs no account and collects no personal data; your progress stays on your device. The optional online ranking runs through Google Play Games on Android, only after a 13-or-over answer to the age question, and through Apple\'s Game Center on iPhone; then your best scores go to Google or to Apple.',
    sections: (n, id, ads) => [
      ['Scope and developer', `This policy applies to <b>${n}</b>: the Android app on Google Play and the iPhone app on the App Store (both with the id <code>${id}</code>). Developer: <b>${DEVELOPER}</b> (developer of ${listOf(names('en'), 'and')}). Contact: ${mail}.`],
      ['Information collected', 'The game has no accounts or sign-up of its own. The game does not ask for or read your name, e-mail address, location, contacts, photos or advertising ID (the Android advertising ID or the iOS Identifier for Advertisers). The exceptions are the optional online ranking' + (ads ? ' and the rewarded ads below.' : ' below.')],
      [
        'Online ranking: the age question on Android',
        'The globe button on the Ranks screen opens the optional online ranking. On Android, the first time, before anything goes online, it asks once for your year of birth. The year is not stored; only the answer\'s category (13 or over, or not) is kept on the device. Google Play Games is not started when the app opens, only after a 13-or-over answer. <b>For players under 13</b> online ranking is switched off for good on that install and the panel says "Online ranking is for players aged 13 and over.": Google Play Games is never started, there is no sign-in and no score is sent. If you never open online ranking, nothing is sent either.',
      ],
      [
        'Online ranking: Android (Google Play Games)',
        `After a 13-or-over answer the Android app starts Google Play Games Services; Google may sign you in automatically with your Play Games profile or ask you to sign in. Once signed in, the game sends your best scores (game numbers such as the rank or collection score, best wave or height) to the ${n} leaderboards. Google stores them with your Play Games player ID and gamer name and shows them to other players on the leaderboards according to your profile visibility settings. The game receives from Google only your gamer name and your own rank and score. The developer can see leaderboard entries in Play Console. This processing is governed by Google's privacy policy; you can manage or delete your Play Games profile and activity in the Google Play Games app and your Google Account. Scores are not used for advertising.`,
      ],
      [
        'Online ranking: iPhone (Game Center)',
        `On iPhone, online ranking uses Apple's Game Center and there is no separate age question: Game Center is Apple's own service and handles every Game Center account, children's included, under Apple's rules (for example, parents can restrict Game Center with Screen Time). The game starts Game Center only when you tap Sign in in the online ranking panel (and, once you have signed in, at later launches); if you are already signed in to Game Center on the device, Apple recognises you, otherwise Apple's own sign-in screen opens. Once signed in, the game sends your best scores (the game numbers above) to the ${n} leaderboards. Apple stores them with your Game Center account and nickname and shows them to other players on the leaderboards according to your Game Center settings. The game receives from Apple only your nickname and your own rank and score. This processing is governed by Apple's privacy policy; you can manage or turn off Game Center in the iPhone's Settings &rarr; Game Center. Scores are not used for advertising.`,
      ],
      [
        'What is stored on your device',
        `Your game progress and your sound setting are kept in the app's own local storage (the WebView's "local storage") <b>on your device only</b>; the app sends them to no server. On Android the app turns off cloud backup and device-to-device transfer for its data, so they are neither copied to a Google Drive backup nor moved to a new phone. On iPhone they may be included, with other apps' data, in the device's own backup (iCloud Backup or a computer backup) if you have that turned on; that backup lives in your Apple account or on your computer and the developer cannot access it. Uninstalling the app deletes all of it; on Android, Settings &rarr; Apps &rarr; ${n} &rarr; Storage &rarr; Clear data does too.`,
      ],
      [
        'Internet and permissions',
        'All of the game\'s files are inside the app and the game works offline; the game itself makes no requests to the internet. Only Google Play Games or Game Center (if you use online ranking)' +
          (ads ? ' and Google AdMob (when you open a rewarded ad)' : '') +
          ' go online. ' +
          (ads
            ? 'The Android app declares exactly these permissions: INTERNET and ACCESS_NETWORK_STATE (to go online and to see whether there is a connection), WAKE_LOCK and FOREGROUND_SERVICE (technical permissions added by the WorkManager component that Google\'s ad library uses), <code>com.android.vending.CHECK_LICENSE</code> (Google Play\'s check that the app was installed from Play) and the internal permission <code>DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION</code>, which no app other than this one can use. None of them needs your approval; the game runs no background service or notification of its own. The advertising ID permission (AD_ID) and the Privacy Sandbox ad permissions are removed. '
            : 'The Android app declares the INTERNET permission (and, for online ranking, the one to see the network state); besides that there is only an internal permission that no app other than this one can use. None of them needs your approval. ') +
          'The iPhone app asks for no permission. The app asks for no permission such as camera, microphone, location, photos, contacts or storage, and does not track you across other apps or websites.',
      ],
      ads
        ? [
            'Ads (Google AdMob)',
            'The game’s rewarded buttons (marked <b>▶ AD</b> in the corner) show an ad from Google AdMob only when you tap them; watch it to the end and you get the reward, close it early and you do not. There are no ads anywhere else in the game. The app marks its ad requests as child-directed <b>for every player</b> (tag for child-directed treatment, tag for users under the age of consent, maximum content rating "G"). So ads are non-personalised for everyone and there is no remarketing. The app does not use the Android advertising ID (the AD_ID permission is removed) or the iOS Identifier for Advertisers (IDFA), does not ask for tracking permission and does not track you across other apps or websites. On Android, Google’s ad library uses the <b>app set ID</b>, an identifier limited to apps from the same developer, for analytics and fraud prevention. To show an ad, Google also processes device information (model, operating system version, language), IP address (from which an approximate location can be derived), app information, ad interactions (impressions, taps) and diagnostics to serve and measure ads, prevent fraud and debug; this information is encrypted in transit. This processing is governed by Google’s privacy policy and its rules for child-directed ad requests. The developer sees only aggregated ad statistics in AdMob. The app contains no separate analytics software.',
          ]
        : ['Analytics and ads', 'The app contains no analytics, advertising or tracking software (SDK). In this version the in-game "reward" buttons give their reward straight away without showing an ad.'],
      ['Sharing', 'No information is sold. The scores of players who use online ranking go to Google Play Games on Android or Game Center on iPhone and are visible to other players on the leaderboards' + (ads ? '; when you open a rewarded ad, the ad information above goes to Google AdMob' : '') + '; apart from that no information is shared with anyone.'],
      [
        'Google Play and the App Store',
        "When you download and use the app through Google Play or the App Store, Google or Apple may process some information under its own privacy policy (for example the download record and, if this sharing is switched on on your device, crash reports). That processing is the store's, not the app's; the developer only sees it as aggregated statistics in Google Play Console or App Store Connect.",
      ],
      [
        'Children',
        (ads ? 'Ads are requested with child-directed, non-personalised settings for everyone (see above); apart from that the app' : 'The app') +
          ' collects and sends no information from children. On Android, if the age question shows a player under 13, online ranking is switched off and Google Play Games is never started. On iPhone, Game Center handles children\'s accounts under Apple\'s rules. The rest of the game works the same in every case.',
      ],
      [
        'Changes',
        "When a new version of the apps processes different information or uses a different service, this policy is updated before that version is released, and the Data safety section on Google Play and the App Privacy section on the App Store change accordingly. The current text is always at this address; its effective date is at the top.",
      ],
      ['Contact', `The developer is ${DEVELOPER}. For questions and privacy requests: ${mail}. Support page: <a href="../../destek/">oyunlar.carsihani.me/destek</a>.`],
    ],
    other: 'Türkçe',
    back: 'All games',
  },
};

/** The support page (docs/destek/): who makes the games, what they are, how to reach the developer. */
const SUPPORT_TEXT = {
  tr: {
    heading: 'Destek',
    who: `${listOf(names('tr'), 've')} oyunlarını <b>${DEVELOPER}</b> geliştiriyor.`,
    games: 'Oyunlar',
    blurb: {
      fosil: '13 katman kaz; bulduğun her fosil gerçek şansını gösterir.',
      kivilcim: 'Bas sağa, bırak sola: kıvılcımı neon bölümlerde yukarı taşı.',
      okcu: 'Sallanan okçularını yönet, rakipleri adalarından düşür, patronları yen.',
    },
    contact: 'İletişim',
    contactText: `Sorular, öneriler ve sorun bildirimleri için e-posta: ${mail}.`,
    report: 'Sorun bildirmek',
    reportStart: 'Bir sorunu bildirirken e-postanıza şunları yazarsanız sorunu bulmak çok kolaylaşır:',
    reportItems: [
      'hangi oyun olduğu,',
      'cihazınız (marka ve model) ve işletim sistemi sürümü,',
      'uygulama sürümü (mağazadaki uygulama sayfasında yazar),',
      'ne olduğu: ne yapıyordunuz, ne bekliyordunuz, ne oldu; varsa bir ekran görüntüsü.',
    ],
    privacy: 'Gizlilik politikaları',
    progress: 'Oyunların hesabı yoktur; ilerlemeniz yalnızca cihazınızda saklanır. Bu yüzden kaybolan bir ilerlemeyi geliştirici geri getiremez.',
  },
  en: {
    heading: 'Support',
    who: `${listOf(names('en'), 'and')} are made by <b>${DEVELOPER}</b>.`,
    games: 'The games',
    blurb: {
      fosil: 'Dig through 13 layers; every fossil you find shows its true odds.',
      kivilcim: 'Hold right, let go left: steer a spark up through neon levels.',
      okcu: 'Lead wobbly archers, knock rivals off their islands, beat the bosses.',
    },
    contact: 'Contact',
    contactText: `For questions, suggestions and problem reports, e-mail: ${mail}.`,
    report: 'Reporting a problem',
    reportStart: 'A problem is much easier to find when your e-mail says:',
    reportItems: [
      'which game it is,',
      'your device (make and model) and its operating system version,',
      'the app version (shown on the app\'s page in the store),',
      'what happened: what you were doing, what you expected, what happened instead; a screenshot if you have one.',
    ],
    privacy: 'Privacy policies',
    progress: 'The games have no accounts; your progress is stored only on your device, so the developer cannot restore lost progress.',
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
<p class="summary" lang="tr">Kısaca: oyunların kendisi hesap açtırmaz ve kişisel veri toplamaz; ilerleme yalnızca cihazda saklanır. İsteğe bağlı online sıralama en iyi skorları Android'de Google Play Games'e (yalnızca yaş sorusuna 13 yaş ve üstü cevabından sonra), iPhone'da Game Center'a gönderir. Ödüllü düğmeler, siz dokunduğunuzda, herkes için çocuklara yönelik ve kişiselleştirilmemiş ayarlarla bir Google AdMob reklamı gösterir; reklam kimliği kullanılmaz, AdMob reklamı göstermek için cihaz ve kullanım verisi işler (her oyunun sayfasına bakın).</p>
<p class="summary" lang="en">In short: the games themselves need no account and collect no personal data; progress stays on the device. The optional online ranking sends best scores to Google Play Games on Android (only after a 13-or-over answer to the age question) or to Game Center on iPhone. Rewarded buttons show a Google AdMob ad when you tap them, with child-directed, non-personalised settings for everyone; no advertising ID is used, and AdMob processes device and usage data to serve it (see each game's page).</p>
<h2>Geliştirici ve iletişim / Developer and contact</h2>
<p>${DEVELOPER}. Destek ve sorularınız için / For support and questions: ${mail} · <a href="../destek/">Destek / Support</a></p>`;
  return page('Gizlilik politikaları / Privacy policies', 'tr', body).replace('STYLE', 'stil.css');
}

function supportPage() {
  const parts = ['tr', 'en'].map((l) => {
    const S = SUPPORT_TEXT[l];
    const lang = l === 'tr' ? 'tr-TR' : 'en-US';
    const games = cfg.apps.map((a) => `<li><b>${esc(a.title[lang])}</b><small>${S.blurb[a.slug] ?? ''}</small></li>`).join('\n');
    const policies = cfg.apps.map((a) => `<li><a href="../gizlilik/${a.slug}/${l === 'en' ? '#en' : ''}">${esc(a.title[lang])}</a></li>`).join('\n');
    return `<section class="lang" id="${l}" lang="${l}">
<nav><a href="#${l === 'tr' ? 'en' : 'tr'}">${l === 'tr' ? 'English' : 'Türkçe'}</a></nav>
<h1>${S.heading}</h1>
<p>${S.who}</p>
<h2>${S.games}</h2>
<ul class="games">
${games}
</ul>
<h2>${S.contact}</h2>
<p class="summary">${S.contactText}</p>
<h2>${S.report}</h2>
<p>${S.reportStart}</p>
<ul>
${S.reportItems.map((i) => `<li>${i}</li>`).join('\n')}
</ul>
<p>${S.progress}</p>
<h2>${S.privacy}</h2>
<ul>
${policies}
</ul>
</section>`;
  });
  return page('Destek / Support', 'tr', parts.join('\n')).replace('STYLE', '../gizlilik/stil.css');
}

for (const app of cfg.apps) if (!SUPPORT_TEXT.tr.blurb[app.slug] || !SUPPORT_TEXT.en.blurb[app.slug]) throw new Error(`tools/gizlilik.mjs: no support blurb for ${app.slug}`);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'stil.css'), CSS);
writeFileSync(join(OUT, 'index.html'), indexPage());
for (const app of cfg.apps) {
  mkdirSync(join(OUT, app.slug), { recursive: true });
  writeFileSync(join(OUT, app.slug, 'index.html'), gamePage(app));
}
mkdirSync(SUPPORT, { recursive: true });
writeFileSync(join(SUPPORT, 'index.html'), supportPage());
writeFileSync(join(ROOT, 'docs', '.nojekyll'), '');
console.log(`wrote docs/gizlilik/ (index + ${cfg.apps.map((a) => a.slug).join(', ')}), docs/destek/ and docs/.nojekyll`);
for (const app of cfg.apps) console.log(`  ${cfg.privacyPolicyBase}${app.slug}/`);
console.log(`  ${cfg.privacyPolicyBase.replace(/gizlilik\/$/, 'destek/')}`);
