# Test APK'ları (paket + oyun başına) ve uygulama içi güncelleme

Sahibin kendi telefonunda denemesi için **dört test uygulaması** (debug, elle kurulur, Google
Play için değil). Hepsi aynı betikten çıkar (`tools/apk.mjs`) ve hepsi **kendini GitHub'daki
test sürümünden günceller** (aşağıda "Güncellemeler").

| Uygulama (ad: en / tr) | Uygulama kimliği | Ne var |
|---|---|---|
| Play Oyunlar Test / Play Oyunlar Test | `com.playoyunlar.testpaketi` (eskisiyle aynı) | Seçici ekran + üç oyun: Kıvılcım, Sallanan Okçular, Fosil Şansı |
| Sparkrise (Test) / Kıvılcım (Test) | `com.playoyunlar.sparkrise.test` | Yalnız Kıvılcım |
| Noodle Archers (Test) / Sallanan Okçular (Test) | `com.playoyunlar.noodlearchers.test` | Yalnız Okçular |
| Fossil Odds (Test) / Fosil Şansı (Test) | `com.playoyunlar.fossilodds.test` | Yalnız Fosil |

Oyun başına test uygulamalarının kimliği Play kimliği + `.test`, adı "… (Test)": Play'den
kurulacak asıl oyunla yan yana durur, karışmaz; simgesi Play simgesiyle aynıdır
(`store/<slug>/icon/`). Paketin oyun listesi iki yerde: `src/games.ts` (kartlar) ve
`tools/apk.mjs` (`SLUGS`); ikisi aynı sırada tutulur. Oyun başına kimlikler ve adlar
`store/apps.json`'dan okunur.

İlk sürüm (2026-11-17 sabahı, versionCode 1) Fener Nöbeti, Mürekkep Seli ve Fosil Şansı'nı
içeriyordu; sahibi telefonda denedi, ilk ikisi `archive/` altına kaldırıldı.

- Yalnız dikey. Seçici ekran düz HTML/CSS/TS (`index.html`, `src/`); dil cihazdan: Türkçe,
  değilse İngilizce (`?lang=tr|en` ile zorlanabilir). Altta: test sürümü / simüle reklam notu,
  derleme tarihi, commit.
- Paket içinde oyunlar `assets/public/<slug>/` altında; oyun başına uygulamada oyun
  `assets/public/` kökünde. Her sayfada (seçici ve her oyun) `oyun-test-update.js` yüklü.

## Android SDK kurulumu (bu makinede yapılan, depo dışında)

JDK 21 gerekir. Yalnız derlemenin istediği paketler kuruldu (toplam ~490 MB):

```text
mkdir -p /root/android-sdk/cmdline-tools && cd /tmp
curl -fLO https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip
echo "e025545c62a8e64c7559119566a569fb1dec5f60  commandlinetools-linux-16111833_latest.zip" | sha1sum -c
unzip -q commandlinetools-linux-16111833_latest.zip && mv cmdline-tools /root/android-sdk/cmdline-tools/latest
rm commandlinetools-linux-16111833_latest.zip
export ANDROID_HOME=/root/android-sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME --install "platforms;android-36" "build-tools;35.0.0" "platform-tools"
```

Kurulanlar: cmdline-tools 23.0, platforms;android-36 (r2), build-tools 35.0.0 (AGP 8.13'ün
varsayılanı; `aapt`/`apksigner` de buradan), platform-tools 37.0.1 (`adb`). Bu sdkmanager ilk
çalışmada `~/.android/bin` ve `~/.android/cli` altına kendi aracını açar (~340 MB); derleme
için gerekmez, silinebilir (sdkmanager tekrar çalışınca yeniden açar). `~/.android/debug.keystore`
debug imzasıdır, silmeyin (silinirse yeni anahtar üretilir ve telefondaki eski APK'nın üzerine
kurulmaz; önce eskisini kaldırmak gerekir).

Gradle ve bağımlılıkları yalnız `services.gradle.org`, `dl.google.com` (Google Maven:
`https://dl.google.com/dl/android/maven2/`, Gradle'ın `google()` deposu) ve
`repo.maven.apache.org` (`mavenCentral()`) üzerinden iner; ek ayar gerekmedi.

## APK'ları üretmek

```text
export ANDROID_HOME=/root/android-sdk
npm ci                     # temiz kopyada
npm run apk                # paket → build/test-apk/play-oyunlar-test-<versionCode>.apk
npm run apk -- kivilcim    # tek oyun (kivilcim | okcu | fosil) → build/test-apk/<slug>-test-<versionCode>.apk
npm run apk -- all         # dördü
```

Her çalışma `build/test-apk/versions.json` da yazar (bu çalışmada derlenen uygulamalar; biçimi
aşağıda). `tools/apk.mjs` her uygulama için sırasıyla: ön kontrol (Node, JDK 21, SDK, test
anahtarı; yoksa okunur bir mesajla durur) → güncelleyici betiği bir kez derler
(`vite.updater.config.ts` → `oyun-test-update.js`) → web klasörü (paket: seçici + oyunlar alt
klasörlerde; tek oyun: oyun kökte; oyunlar `VITE_OYUN_PLATFORM=web` ile) → her `index.html`'e
`<script defer src="./oyun-test-update.js">` ekler → web klasörünü denetler (göreli yollar, dış
adres yok, web bağdaştırıcısı ve güncelleyici var) → Capacitor projesi
`build/test-apk/work/<anahtar>/` (yalnız yoksa `cap add`, her seferinde `cap sync`) → yamalar
(şablonun saklanan özgün kopyalarına uygulanır, her çalışmada aynı sonuç: kimlik, en/tr adları,
yön, simge, açılış rengi, geri tuşu, tam ekran (temalar + sürükleyici mod), güncelleme eklentisi + izin + FileProvider,
test anahtarıyla imza) → `gradlew assembleDebug --no-daemon` → APK denetimi (`aapt`: kimlik,
versionCode, en/tr adı, minSdk/targetSdk, izinler, sağlayıcı; `aapt2`: etkinlik teması ve temalarda
eylem çubuğu/başlık yok; dex'te eklenti sınıfları ve
sürüm adresi; web dosyaları ve her sayfada güncelleyici; `apksigner`: imza = test anahtarı) →
`build/test-apk/`. Dördü bu makinede ~3 dk. `build/` git'e girmez.
`OYUN_GRADLE=/opt/gradle/bin/gradle` verilirse wrapper yerine o kullanılır.

Tarayıcı denetimleri (APK'nın içindeki web klasörünü açar; ekran görüntüleri `tests/artifacts/`):

```text
node apps/test-paketi/tests/web-check.mjs      # seçici + üç oyun gerçek dokunuşla
node apps/test-paketi/tests/update-check.mjs   # güncelleme bandı, sahte yerel köprü + sahte sürüm sunucusu
npm run test -w @oyun/test-paketi              # güncelleme mantığının birim testleri (vitest)
```

## Telefona ilk kurulum (bir kez, elle)

Telefondaki şimdiki APK'larda güncelleyici yok; yenilerini **bir kez elle** kurmak gerekiyor.
Sonrası kendiliğinden ("Güncellemeler").

1. Telefonda tarayıcıyla
   `https://github.com/shellwe1628/play-oyunlar/releases/tag/test-latest` adresini açın
   (iş akışı en az bir kez çalıştıktan sonra var). Ya da `npm run apk -- all` çıktısını
   `build/test-apk/`'tan telefona gönderin.
2. **Play Oyunlar Test** (`play-oyunlar-test-….apk`): dokunup kurun; eskisinin **üzerine
   güncelleme olarak** kurulur (aynı kimlik, aynı imza), kayıtlar korunur. Kaldırmayın.
3. **Oyun başına test uygulamaları** (`kivilcim-test-…`, `okcu-test-…`, `fosil-test-…`): yeni
   uygulamalardır, istediğinizi kurun. İlk kayıtları boştur (paketteki kayıtlar onlara geçmez).
4. Daha önce elle kurulmuş, **Play kimlikli iki oyun APK'sını kaldırın** (Ayarlar → Uygulamalar →
   Fossil Odds / Sparkrise / Noodle Archers → Kaldır; `com.playoyunlar.fossilodds`, `.sparkrise`,
   `.noodlearchers`). Bunlar test anahtarıyla imzalı ve güncelleyicisiz; ileride Play'den
   kurulacak asıl sürümle aynı kimliği taşıdıkları için Play onları güncelleyemez ("imza
   uyuşmuyor"). Kaldırınca kayıtları da gider.
5. Android "bilinmeyen kaynaklardan yükleme" izni isterse, dosyayı açan uygulamaya (Chrome,
   Dosyalar…) verin. Play Protect uyarırsa "Yine de yükle". USB ile: `adb install -r <apk>`.

Kurulumda çalışma zamanı izni sorulmaz. Manifestteki izinler: `INTERNET` (Capacitor şablonu;
güncelleme denetimi için de kullanılır) ve `REQUEST_INSTALL_PACKAGES` (yalnız test
uygulamalarında: kendi güncellemesini Android kurucusuna verebilmek için; Android yine her
seferinde sorar). Android 7.0 (API 24) ve üstü, hedef API 36.

## Güncellemeler (her yeni sürümde telefonda olan)

Yeni sürüm, `main`'e oyunları/çekirdeği/seçiciyi/derleme betiklerini değiştiren bir push
geldiğinde ya da "Test APK'ları" iş akışı elle çalıştırıldığında GitHub'da derlenir ve
`test-latest` ön sürümüne konur (`.github/workflows/test-apk.yml`). Telefonda:

1. Test uygulaması **açılınca** ve **her öne gelişinde** (en çok 5 dakikada bir) sürümün
   `versions.json`'ını okur. Kendi kimliği için daha büyük bir versionCode varsa ekranda sarı bir
   bant çıkar: **"Yeni test sürümü var"** + değişikliğin tek satırı (commit başlığı) +
   **Güncelle** / **Sonra**. Dil cihazdan (tr/en). Ağ yoksa, sürüm okunamazsa ya da bozuksa
   hiçbir şey çıkmaz, oyun etkilenmez.
2. **Sonra**: bant uygulama yeniden başlatılana kadar çıkmaz (paket içinde sayfadan sayfaya
   geçince de).
3. **Güncelle**, ilk seferde: "Önce bir izin gerekiyor" açıklaması → **Ayarları aç** → Android'in
   "Bilinmeyen uygulamaları yükle" ekranı: **"Bu kaynaktan izin ver"**i açın, geri tuşuyla dönün.
   (Android 7'de bu adım yok; kurucunun kendisi sorar.) İzin verilmezse bant bunu söyler,
   "Tekrar dene" ile ayara yeniden gidilir.
4. İndirme: bantta yüzde ve çubuk (~5 MB). İnen dosyanın boyutu ve SHA-256'sı `versions.json`'la
   karşılaştırılır; tutmazsa kurulmaz, bant "denetimden geçmedi" der.
5. Android'in kendi ekranı açılır: **"Bu uygulamayı güncellemek istiyor musunuz?"** →
   **Güncelle**. Uygulama kapanıp yeni sürüm kurulur; Android "Uygulama yüklendi → Aç" der.
   Kayıtlar korunur (aynı kimlik, aynı imza).
6. Kurucudan geri çıkılırsa hiçbir şey değişmez; bant "Tekrar dene" gösterir (dosya önbellekte,
   yeniden inmez).

Hiçbir şey dokunmadan kurulmaz: Güncelle'ye dokunmak ve Android'in onayı her seferinde gerekir
(Android bunu atlatmaya izin vermez). Oyun sırasında bant oyun alanını kapatmaz (aşağıda
"Kararlar").

**Sürüm bilgisi** (`https://github.com/shellwe1628/play-oyunlar/releases/download/test-latest/versions.json`):

```json
{
  "schema": 1,
  "generatedAt": "2026-11-17T17:13:20.435Z",
  "commit": "abc1234",
  "apps": [
    {
      "applicationId": "com.playoyunlar.sparkrise.test",
      "versionCode": 461833,
      "versionName": "test-2026-11-17-abc1234",
      "file": "kivilcim-test-461833.apk",
      "size": 5076544,
      "sha256": "<64 küçük onaltılık>",
      "builtAt": "2026-11-17T17:13:20.435Z",
      "notes": "commit başlığı (tek satır)",
      "label": { "en": "Sparkrise (Test)", "tr": "Kıvılcım (Test)" }
    }
  ]
}
```

APK'lar aynı sürümde `<dosya>` adıyla durur:
`https://github.com/shellwe1628/play-oyunlar/releases/download/test-latest/<file>`. Yayınlarken
önce yeni APK'lar, sonra `versions.json` yüklenir, en son ne yeni ne bir önceki manifestte geçen
APK'lar silinir (`tools/test-apk/publish.sh`): denetim yaparken yayın sürse bile telefon yarım bir
duruma düşmez.

**Elle derlenen APK** da güncelleyicilidir ve aynı anahtarla imzalıdır: telefondaki bir GitHub
derlemesinin üzerine kurulur, sonraki GitHub derlemesi onu da günceller (versionCode = dakika).

## Doğrulananlar / doğrulanmayanlar

Doğrulandı (bu makinede, 2026-11-17):
- Güncelleme mantığı (manifest denetimi, sürüm karşılaştırma, bant durum makinesi, metinler,
  yerleşim, denetim aralığı) `tests/unit/` birim testleriyle (önce yazıldı, kırmızı görüldü).
- `npm run apk -- all` üç kez (ilk ikisi arka arkaya, versionCode 461833 → 461844 → 461877): dört APK, her biri betiğin kendi denetiminden geçti
  (kimlik, en/tr ad, versionCode, minSdk 24 / targetSdk 36, izinler: INTERNET +
  REQUEST_INSTALL_PACKAGES, `<id>.testupdate` sağlayıcısı, dex'te eklenti + sürüm adresi, her
  sayfada güncelleyici, imza = test anahtarı SHA-256 `bd03c5f1…fb8c64`). Yerel kod derlendi
  (Gradle `assembleDebug`); `lintDebug` (okcu test projesi): 0 hata, eklentiye dair tek uyarı `UsableSpace` (öneri).
- `tests/update-check.mjs` (APK'dan çıkarılan web klasörü, Chromium 390×844, sahte yerel köprü ve
  sahte sürüm sunucusu): bant yalnız daha yeni sürümde çıkıyor (eşit/eski sürüm, başka uygulamanın
  kaydı, bozuk manifest, HTTP 404 ve ağ yokken çıkmıyor, sayfa sorunsuz); en/tr metinler; Sonra
  oturum boyunca gizliyor; seçiciden oyuna geçince ikinci istek yok; ilerleme görünüyor; iki kez
  dokunmak ikinci indirme/kurulum başlatmıyor; kurucudan geri çıkma, izin reddi, SHA-256 uyuşmazlığı,
  yarıda kesilen indirme ve yeniden deneme; Kıvılcım koşusu sırasında bant yalnız alt boşlukta,
  oyun alanıyla çakışmıyor, banda dokunmak koşu başlatmıyor; 16:9 ekranda koşu sırasında beklemiyor,
  4 sn dokunuşsuzluktan sonra (koşu bitmişken) çıkıyor, oyuna dokununca gizleniyor.
- Play yolu değişmedi: `npm run aab -- okcu` (geçici anahtarla) başarılı; birleşik manifestte,
  paketin tüm dosyalarında (dex, kaynaklar, web) ve üretilen kaynaklarda güncelleyiciye,
  kurulum iznine, sağlayıcıya, sürüm adresine dair iz yok.
- `web-check.mjs` yeni paket APK'sıyla (seçici + üç oyun, gerçek dokunuş) geçti.

**Doğrulanamadı: hiçbir test APK'sı bir telefonda ya da emülatörde çalıştırılmadı.** Özellikle
yerel güncelleme yolu hiç çalışmadı: GitHub'dan indirme (yönlendirme, `HttpURLConnection`),
ilerleme olayları, "Bilinmeyen uygulamaları yükle" ekranı ve dönüşü, `FileProvider` + Android
kurucusuna teslim, kurucudan dönüş sonucu, güncellemeden sonra yeniden açılış. GitHub iş akışı
(`test-apk.yml`) da hiç çalışmadı. Telefonda ilk kez görülecek; sorun çıkarsa bant hata metnini
gösterir, APK her zaman sürüm sayfasından elle de kurulabilir.

## Kararlar

| Karar | Neden |
|---|---|
| Dört ayrı test uygulaması, tek betik | Paket eskisinin üzerine kurulsun diye kimliği aynı kaldı; oyun başına uygulamalar Play kimliği + `.test` ile ayrı, Play'den kurulacak asıl oyunla karışmaz. `tools/apk.mjs` hedef listesini `store/apps.json`'dan üretir; derleme, denetim, yamalar ortak. |
| Depoda herkese açık test anahtarı (`tools/test-imza/`) | Android güncellemeyi yalnız aynı imzayla kurar; bu makine ve GitHub aynı anahtarla imzalamalı, sahip secret ayarlamadan. Telefondaki paketi imzalayan debug anahtarının aynısı. Risk ve gizli anahtara geçiş: `tools/test-imza/README.md`. `tools/aab.mjs` bu anahtarı (kopyasını da) reddeder. |
| Güncelleme bandı oyun kodunu değiştirmeden | `oyun-test-update.js` derlenmiş her `index.html`'e eklenir; Shadow DOM, en üst katman; banda gelen dokunuşlar sayfaya geçmez (Kıvılcım `window`'u dinliyor). Oyunlar Phaser FIT ile 9:16 çiziyor: 9:16'dan uzun telefonlarda (bugünkü hepsi) tuvalin altında/üstünde boşluk var; bant oraya sığarsa **hemen ve koşu sırasında da** orada, oyun alanının tek pikselini kapatmadan durur. Sığmazsa (16:9 ekran) ekrana 4 sn dokunulmayınca üstte çıkar, oyuna dokununca gizlenir; Kıvılcım'da dokunuşsuz 4 sn'de koşu biter (denendi), yani bant koşuyu bölmez. Seçicide doğrudan üstte. İzin/indirme/kurulum adımlarında bant büyür ve yerinde kalır (oyuncu zaten bantla uğraşıyor). |
| Ağ işleri yerel eklentide (`native/TestUpdatePlugin.java`) | GitHub sürüm indirmeleri başka bir sunucuya yönlendirir ve CORS başlığı göndermez: WebView `fetch` okuyamaz. Capacitor'ın `CapacitorHttp`'si ilerleme vermez ve büyük dosyayı base64 olarak köprüden geçirir. Eklenti `HttpURLConnection` ile manifesti okur, APK'yı önbelleğe akıtırken SHA-256 hesaplar, ilerleme olayı yollar; adres yerel kodda sabit (JS yalnız dosya adı verir). Kurulum: kendi `UpdateFileProvider`'ı (yalnız `cache/updates/`), `ACTION_INSTALL_PACKAGE` + sonuç (geri çıkmayı görebilmek için; API 29'da kullanımdan kalktı ama çalışıyor), API 26+ için `canRequestPackageInstalls()` ve `ACTION_MANAGE_UNKNOWN_APP_SOURCES`. Kurulumdan hemen önce dosya yeniden özetlenir. |
| Saf mantık TypeScript'te | `src/update/manifest.ts`, `machine.ts`, `texts.ts`, `placement.ts`, `schedule.ts` DOM'suz ve birim testli; `ui.ts` yalnız bağlar, `native.ts` köprü. Telefon olmadan davranışın çoğu böyle kanıtlanıyor. |
| Denetim zamanı `sessionStorage`'da | Paketin sayfaları aynı kökende: seçiciden oyuna geçince yeniden istek yok, "Sonra" uygulama yeniden başlayana kadar geçerli; öne gelişte en çok 5 dk'da bir. |
| Bir önceki nesil APK'lar sürümde kalır | Eski manifesti okuyup indirmekte olan telefon yarıda kalmasın. |
| Oyunlar `VITE_OYUN_PLATFORM=web` ile derlenir | Çekirdeğin zaten sunduğu en az müdahaleli yol: derleme anındaki seçim, Capacitor yerel kabuk algılamasından önce gelir (`packages/core/src/platform/detect.ts`; bunu sabitleyen birim testi eklendi). Capacitor bağdaştırıcısı reklamlara `'unavailable'` der; web bağdaştırıcısı ödüllüde `'granted'` döner, böylece ödüllü özellikler denenebilir. Normal web derlemeleri ve kapı değişmez (onlarda `forced: void 0`). Kaybedilen: titreşim (web bağdaştırıcısında no-op; Capacitor'da da `@capacitor/haptics` eklentisi olmadan çalışmıyordu). Arka plana alınca duraklatma (`visibilitychange`), güvenli alan ve kayıtlar iki bağdaştırıcıda aynı. |
| Geri tuşu `MainActivity` yamasıyla | Capacitor 8.6.2 Android çekirdeğinde (`BridgeActivity`) geri tuşu işlenmiyor (kaynakta `onBackPressed`/`canGoBack` yok; o iş `@capacitor/app` eklentisinde). Eklenti eklemek yerine `OnBackPressedCallback`: oyun sayfasındaysa WebView geçmişinde geri (yoksa seçiciyi yükle), seçicideyse `finish()`. |
| Kart = düz bağlantı (`./<slug>/index.html`) | Gerçek sayfa geçişi: her oyun kendi temiz sayfasında açılır, geçmişte seçici kalır. Ses ilk dokunuşta açılır (oyunlar bunu zaten yapıyor; seçicideki dokunuş sayılmaz ama oyundaki ilk dokunuş yeter, denendi). |
| Kayıt anahtarları değişmedi | Tek köken (`https://localhost`) paylaşılıyor ama tüm anahtarlar `oyun:<id>:…` (kayıt, `.bak`, `.corrupt`, ses ayarı); id'ler farklı. Çekirdeğin depolama sınaması `__oyun_probe__` yazıp hemen siler. Hiçbir kod `localStorage.clear()` çağırmıyor; seçici depolamaya dokunmuyor. |
| Tam ekran (eylem çubuğu yok) | Şablonun açılış teması `Theme.SplashScreen` Android 12+'da platformun eylem çubuklu temasından (`Theme.DeviceDefault.DayNight`) türer; `EdgeToEdge.enable` pencereyi `super.onCreate`'ten önce, bu temayla kurduğu için üstte uygulama adlı koyu bir şerit çıkıyordu. Şimdi `tools/aab/theme.mjs` üç temadan da (`AppTheme`, `AppTheme.NoActionBar`, `AppTheme.NoActionBarLaunch`) çubuğu ve başlığı kaldırır (`postSplashScreenTheme` = `AppTheme.NoActionBar`), `MainActivity` her şeyden önce `setTheme(AppTheme_NoActionBar)` çağırır. Ayrıca kalıcı sürükleyici mod: durum ve gezinme çubukları gizli, kenardan kaydırınca bir an görünür (`BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`, `onResume` ve `onWindowFocusChanged`'de yeniden gizlenir), çentiğe kadar çizim (`shortEdges`). Play derlemesi (`tools/aab/`) aynı. |
| Kenardan kenara + güvenli alan | `EdgeToEdge.enable` (her Android sürümünde) + Capacitor'ın yerleşik `SystemBars` eklentisi (`insetsHandling: css`, `style: DARK` = kaydırınca görünen çubuklarda açık simgeler, `hidden: true` = eklenti açılışta çubukları geri göstermez). Çubuklar gizliyken boşluklarda yalnız çentik kalır, HUD ondan uzak durur. WebView ≥ 140'ta boşluklar `env(safe-area-inset-*)` olarak sayfaya geçer (her sayfa `viewport-fit=cover`); daha eski WebView'de eklenti görünümü çubukların içine sığdırır. Oyunlar ve seçici zaten `env()` okuyor. |
| Simge kodla üretilir | API 26+: vektör uyarlanabilir simge (+ tek renk/tema); API 24–25: `native/icon.mjs` ile üretilen PNG'ler. Açılış ekranı Capacitor logosu yerine düz lacivert. Depoda ikili dosya yok. |
| `versionCode` = 2026-01-01'den beri geçen dakika (UTC), `versionName test-<tarih>-<commit>` | Her yeni test APK'sı bir öncekinin üzerine güncelleme olarak kurulur (ilk APK versionCode 1'di); elle artırmayı unutmak mümkün değil. Ayarlar → Uygulamalar'da hangi derleme olduğu görünür. |
| Gerçek dokunuş denetimde CDP ile | Kıvılcım basılı tutmayı, Okçular sürüklemeyi ister; Playwright'ın dokunmatik API'si sürükleme bilmiyor. Oyunların kendi e2e testleri gibi `Input.dispatchTouchEvent`; `touchCancel` gönderilmez (Chrome konsol hatası yazar; Kıvılcım Phaser 4.2.1'in iptal edilemez `touchcancel`'da `preventDefault` çağırmasını kendi içinde düzeltiyor). |
| Gradle wrapper (8.14.3) varsayılan | Şablonun sabitlediği sürüm, her makinede aynı. `--no-daemon`: derlemeden sonra süreç kalmaz. |
| `INTERNET` izni bırakıldı | Capacitor şablonunun parçası, sorulmayan normal izin. Kaldırmanın WebView yerel sunucusuna etkisi cihazda denenemedi. Çevrimdışı çalışma web klasörü denetimiyle güvenceye alındı (dış adres yok, tüm yollar göreli). |
| `cleartext`/CSP ayarı yok | Varsayılan `https://localhost` şeması; düz HTTP isteği yok, `allowMixedContent: false`. Oyunlarda CSP yok, Capacitor'ın da gerektirdiği bir CSP yok. |
