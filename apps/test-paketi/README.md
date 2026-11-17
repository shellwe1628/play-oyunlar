# Test paketi (tek APK, üç oyun)

Sahibin kendi telefonunda denemesi için **tek bir Android debug APK'sı**: açılışta bir seçici
ekran ("Play Oyunlar — Test"), her gerçek oyun için bir kart (Fener Nöbeti, Mürekkep Seli,
Fosil Şansı). Mağaza için değildir; debug anahtarıyla imzalanır, elle yüklenir.

- Uygulama: `com.playoyunlar.testpaketi`, adı "Play Oyunlar Test", yalnız dikey.
- Seçici ekran düz HTML/CSS/TS (`index.html`, `src/`); dil cihazdan: Türkçe, değilse İngilizce
  (`?lang=tr|en` ile zorlanabilir). Altta: test sürümü / simüle reklam notu, derleme tarihi, commit.
- Oyunlar `dist/<slug>/` altına göreli yolla derlenir; APK'nın içinde `assets/public/<slug>/`.

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

## APK'yı üretmek

```text
export ANDROID_HOME=/root/android-sdk
npm ci            # temiz kopyada
npm run apk       # → build/play-oyunlar-test.apk
```

`tools/apk.mjs` sırasıyla: ön kontrol (Node, JDK 21, SDK; yoksa okunur bir mesajla durur) →
seçici ekranı derler → her oyunu `VITE_OYUN_PLATFORM=web` ile `dist/<slug>/` içine derler →
web klasörünü denetler (göreli yollar, dış adres yok, web bağdaştırıcısı gömülü) →
`cap add android` (yalnız `android/` yoksa) + `cap sync android` → `android/` içini yamalar
(yön, ad, simge, açılış rengi, geri tuşu, kenardan kenara) → `gradlew assembleDebug --no-daemon`
→ APK'yı `build/` altına kopyalar, yolunu ve boyutunu yazar. İlk çalışma Gradle'ı indirir
(~2 dk), sonrakiler ~20 sn. `android/`, `dist/`, `build/` git'e girmez; her çalışmada yeniden
üretilir/yamalanır. `OYUN_GRADLE=/opt/gradle/bin/gradle` verilirse wrapper yerine o kullanılır.

Tarayıcı denetimi (APK'nın içindeki web klasörünü açıp Chromium ile oynar, ekran görüntüleri
`tests/artifacts/`):

```text
node apps/test-paketi/tests/web-check.mjs
```

## Telefona kurmak

1. `build/play-oyunlar-test.apk` dosyasını telefona gönderin (kablo, e-posta, Drive…).
2. Dosyaya dokunun; Android "bilinmeyen kaynaklardan yükleme" izni isterse, dosyayı açan
   uygulamaya (Dosyalar, Chrome…) bu izni verin, sonra Yükle. Play Protect uyarı verebilir
   ("Yine de yükle").
3. Alternatif: USB hata ayıklama açık telefonda `adb install -r build/play-oyunlar-test.apk`.

Kurulumda çalışma zamanı izni sorulmaz (yalnız normal `INTERNET` izni manifestte var; Capacitor
şablonunun parçası, oyunlar ağ kullanmaz). Android 7.0 (API 24) ve üstü.

**Kullanım:** kart → oyun. Telefonun **geri** tuşu/hareketi oyundan seçici ekrana döner,
seçici ekrandayken uygulamadan çıkar. Oyunların kendi "Menü/Çık" düğmeleri oyunun içinde kalır.
Bir turun ortasında geri dönmek, sekmeyi kapatmak gibidir: Fosil Şansı ilerlemeyi kaydeder,
Fener ve Mürekkep yarım kalan turu saymaz. Reklamlar simüledir: ödüllü reklam düğmeleri
(Fener "ikinci nefes", Fosil "2× şans" ve "çift toz", Mürekkep "ek Blot") reklam göstermeden
hemen ödül verir; geçiş reklamı hiç çıkmaz.

## Doğrulananlar / doğrulanmayanlar

Doğrulandı (bu makinede, 2026-11-17):
- `npm run apk` iki kez uçtan uca çalıştı (ikincisi hazır `android/` üzerinde); APK 5,3 MB.
- APK içeriği: `assets/public/index.html` + `fener/`, `murekkep/`, `fosil/` (her biri
  `index.html`, JS, CSS, Nunito fontları). `aapt dump badging`: paket, ad, minSdk 24,
  targetSdk 36, `screenOrientation=portrait`, `debuggable=true`; `apksigner verify`:
  "CN=Android Debug" ile v2 imzalı. Geri tuşu kodu dex içinde (`MainActivity$1`).
- `web-check.mjs`: APK'dan çıkarılan web klasörü, 390×844 dokunmatik Chromium, sahte
  `window.Capacitor` ile: üç kart (tr + en), her kart oyununu alt klasörden açıyor, font
  yükleniyor, menüye ulaşılıyor, Play'e tek gerçek dokunuş menüden çıkarıyor ve sesi açıyor
  (AudioContext `running`), oyun sahnesine geçiliyor, geçmişte geri seçici ekrana dönüyor,
  Fosil kaydı diğer iki oyundan sonra duruyor; konsol hatası, başarısız istek ve dışarı giden
  istek yok.
- `npm run gate` yeşil (çekirdek + dört oyun).

Doğrulanamadı: **APK hiçbir telefonda ya da emülatörde çalıştırılmadı** (burada cihaz/emülatör
yok). Yani gerçek WebView'de açılış, geri tuşu davranışı, kenardan kenara görünüm ve güvenli
alan, dikey kilit, simge görünümü, ses ve dokunma tepkisi telefonda ilk kez görülecek.

## Kararlar

| Karar | Neden |
|---|---|
| Oyunlar `VITE_OYUN_PLATFORM=web` ile derlenir | Çekirdeğin zaten sunduğu en az müdahaleli yol: derleme anındaki seçim, Capacitor yerel kabuk algılamasından önce gelir (`packages/core/src/platform/detect.ts`; bunu sabitleyen birim testi eklendi). Capacitor bağdaştırıcısı reklamlara `'unavailable'` der; web bağdaştırıcısı ödüllüde `'granted'` döner, böylece ödüllü özellikler denenebilir. Normal web derlemeleri ve kapı değişmez (onlarda `forced: void 0`). Kaybedilen: titreşim (web bağdaştırıcısında no-op; Capacitor'da da `@capacitor/haptics` eklentisi olmadan çalışmıyordu). Arka plana alınca duraklatma (`visibilitychange`), güvenli alan ve kayıtlar iki bağdaştırıcıda aynı. |
| Geri tuşu `MainActivity` yamasıyla | Capacitor 8.6.2 Android çekirdeğinde (`BridgeActivity`) geri tuşu işlenmiyor (kaynakta `onBackPressed`/`canGoBack` yok; o iş `@capacitor/app` eklentisinde). Eklenti eklemek yerine `OnBackPressedCallback`: oyun sayfasındaysa WebView geçmişinde geri (yoksa seçiciyi yükle), seçicideyse `finish()`. |
| Kart = düz bağlantı (`./<slug>/index.html`) | Gerçek sayfa geçişi: her oyun kendi temiz sayfasında açılır, geçmişte seçici kalır. Ses ilk dokunuşta açılır (oyunlar bunu zaten yapıyor; seçicideki dokunuş sayılmaz ama oyundaki ilk dokunuş yeter, denendi). |
| Kayıt anahtarları değişmedi | Tek köken (`https://localhost`) paylaşılıyor ama tüm anahtarlar `oyun:<id>:…` (kayıt, `.bak`, `.corrupt`, ses ayarı); id'ler farklı. Çekirdeğin depolama sınaması `__oyun_probe__` yazıp hemen siler. Hiçbir kod `localStorage.clear()` çağırmıyor; seçici depolamaya dokunmuyor. |
| Kenardan kenara + güvenli alan | `EdgeToEdge.enable` (her Android sürümünde) + Capacitor'ın yerleşik `SystemBars` eklentisi (`insetsHandling: css`, `style: DARK` = koyu zemine açık simgeler). WebView ≥ 140'ta boşluklar `env(safe-area-inset-*)` olarak sayfaya geçer (her sayfa `viewport-fit=cover`); daha eski WebView'de eklenti görünümü çubukların içine sığdırır. Oyunlar ve seçici zaten `env()` okuyor. |
| Simge kodla üretilir | API 26+: vektör uyarlanabilir simge (+ tek renk/tema); API 24–25: `native/icon.mjs` ile üretilen PNG'ler. Açılış ekranı Capacitor logosu yerine düz lacivert. Depoda ikili dosya yok. |
| `versionCode` 1, `versionName test-<tarih>-<commit>` | Yeni test APK'sı eskisinin üzerine kurulur; Ayarlar → Uygulamalar'da hangi derleme olduğu görünür. |
| Gradle wrapper (8.14.3) varsayılan | Şablonun sabitlediği sürüm, her makinede aynı. `--no-daemon`: derlemeden sonra süreç kalmaz. |
| `INTERNET` izni bırakıldı | Capacitor şablonunun parçası, sorulmayan normal izin. Kaldırmanın WebView yerel sunucusuna etkisi cihazda denenemedi. Çevrimdışı çalışma web klasörü denetimiyle güvenceye alındı (dış adres yok, tüm yollar göreli). |
| `cleartext`/CSP ayarı yok | Varsayılan `https://localhost` şeması; düz HTTP isteği yok, `allowMixedContent: false`. Oyunlarda CSP yok, Capacitor'ın da gerektirdiği bir CSP yok. |
