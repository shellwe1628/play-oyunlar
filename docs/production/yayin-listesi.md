# Yayın kontrol listesi (aşama 6 ve 7)

Bu liste yazıldı; mağaza ve portal hesapları olmadığı için **hiçbir mağazaya ya da portala gönderim denenmedi**.
Yerelde denenen: web derlemesi, debug test APK'sı (`npm run apk`) ve Google Play için imzalı release AAB'leri
(`npm run aab -- <slug>`, deneme anahtarıyla). Google Play'e yayın akışının tamamı ve sahibin yapacakları:
**`docs/production/play-yayin.md`**. Mağaza ve portal
kuralları sık değişir; "güncel kuralı kontrol et" yazan her yerde ilgili mağazanın ya da portalın şu anki
belgesine bakılır, buradan çıkarım yapılmaz.

Etiketler:

- **[AGENT]** bu depoda bir agent yapabilir.
- **[İNSAN: hesap]** bir geliştirici/mağaza/portal hesabı ya da ödeme/kimlik doğrulaması gerekir.
- **[İNSAN: Mac]** Xcode'lu bir Mac gerekir.
- **[İNSAN: karar]** bir yayın ya da hukuki karar.

Ön koşul: oyun aşama 5'i geçti (`npm run gate -- <slug>` yeşil, engelleyici bulgu yok) ve yayından hemen önce
mekaniğin mağaza kanıtı yeniden kontrol edildi (`hat.md` "Öldürme ve rafa kaldırma").

## 1. Web yumuşak lansman (aşama 6)

1. [AGENT] Üretim derlemesi: `npm run build -w games/<slug>` → `games/<slug>/dist/`. Yollar göreli (`base: './'`),
   aynı klasör portal iframe'inde ya da alt yolda çalışır.
2. [AGENT] CrazyGames derlemesi: `VITE_OYUN_PLATFORM=crazygames npm run build -w games/<slug>`. Bu, portal SDK'sını
   (`https://sdk.crazygames.com/crazygames-sdk-v3.js`) `index.html`'e ekler (`vite.config.ts`). CrazyGames
   bağdaştırıcısı SDK belgesindeki şekle bakılarak yazılmış doğrulanmamış bir taslaktır; ilk yüklemede
   `showInterstitial`, `showRewarded`, `gameplayStart/Stop` çağrılarının gerçekten çalıştığı elle denenmelidir.
3. [AGENT] Boyut bütçesi: kapı JS için <= 550 KB gzip, toplam <= 5 MB uygular. Portalın kendi yükleme sınırlarını
   güncel kuralda kontrol et.
4. [İNSAN: hesap] Portal geliştirici hesabı, oyunun gönderilmesi, portalın inceleme/QA sürecinin geçilmesi.
   Gereken dosya biçimi ve görsel (kapak/küçük resim) ölçüleri için güncel kuralı kontrol et.
5. [AGENT] Gönderim görselleri: kod ve Playwright ile üretilebilir (ekran görüntüsü `games/<slug>/tests/artifacts/`),
   ölçüler portalın güncel kuralına göre.
6. [İNSAN: karar] Lansmanı başlat, ölçüm süresini ve durdur/devam eşiklerini (`hat.md` aşama 8) önceden yaz.

Başka portallar (örn. Poki) için çekirdekte bağdaştırıcı yok; bu ancak ayrı bir çekirdek işiyle eklenir.

## 2. Capacitor paketi

Android için Google Play yolu hazır ve bu bölümün 1–3, 5, 6 ve 9. maddelerinin yerini alır: **`npm run aab -- <slug>`**
(`tools/aab.mjs`, ayarlar `store/apps.json`) her oyun için ayrı uygulama olarak imzalı release AAB üretir; GitHub
Actions **"Play'e yükle"** (`.github/workflows/play-yukle.yml`) kapıyı çalıştırıp AAB'yi Play'e yükler. Doğrulanmış
(bu makinede): üç oyunun AAB'leri derlendi, `bundletool validate` geçti, bildirim (paket, versionCode, hedef
SDK 36, min SDK 24, debuggable değil, şifresiz HTTP kapalı, yalnız INTERNET izni), imza ve içerik denetlendi.
Doğrulanmamış: `play-yukle.yml` ve `android.yml` hiç çalışmadı; hiçbir paket telefonda açılmadı; Play'e yükleme
denenmedi. Aşağıdaki maddeler oyun klasöründen elle Capacitor projesi kurma yolunu anlatır (iOS ve debug için).
`android/` ve `ios/` git-ignored: üret, commit'leme.

1. [AGENT] Web paketini Capacitor platformuyla derle: `VITE_OYUN_PLATFORM=capacitor npm run build -w games/<slug>`.
2. [AGENT] Android projesi (`games/<slug>/` içinde): `npx cap add android` sonra `npx cap sync android`.
3. [AGENT] Debug APK: GitHub Actions'ta "Android debug APK" iş akışı (elle tetiklenir, `game` girdisi = slug).
   Hiç çalışmadı; ilk çalıştırmada Gradle/SDK sürümü düzeltmeleri beklenir.
4. [İNSAN: Mac] iOS: `@capacitor/ios` şablonda yok (yalnızca `@capacitor/android`). Eklenmesi yeni bağımlılıktır:
   sürümü Capacitor çekirdeğiyle aynı (şablonda 8.6.2) sabitle ve `GAME.md`'ye yaz. Sonra Mac'te `npx cap add ios`,
   `npx cap sync ios`, Xcode'da derle. iOS için iş akışı yok.
5. [İNSAN: hesap] İmza: Android için yükleme anahtarı (keystore) ve release derlemesi (release derlemesi hiç
   denenmedi); iOS için Apple Developer hesabı, sertifika ve provisioning. Anahtarları depoya koyma.
6. [AGENT] Google Play kimlikleri `store/apps.json` içindedir (`com.playoyunlar.fossilodds`, `.sparkrise`,
   `.noodlearchers`) ve ilk yüklemeden sonra değişmez; `games/<slug>/oyun.config.json` içindeki eski `appId`
   (`com.oyunlar.<slug>`) yalnız oyun klasöründen elle kurulan projelerde kullanılır.
7. [AGENT] Kayıt: Capacitor WebView içinde de `localStorage` kullanılır; Preferences bağdaştırıcısı yok
   (`packages/core/README.md`). Cihazda kaydın uygulama kapanıp açılınca ve güncellemede durduğunu elle dene.
8. [AGENT] Titreşim için `@capacitor/haptics` native projeye eklenmeli (yeni bağımlılık; yoksa çağrılar sessizce boşa gider).
9. [AGENT] Uygulama simgesi ve açılış görseli: Capacitor varsayılanlarını bırakma (`npm run aab` bunu yapar: simge
   `store/<slug>/icon/` içinden, yoksa kodla üretilen yer tutucu; açılış düz renk). Kodla çizip üretilebilir; ikili
   dosya kuralı oyun kaynağı içindir, mağaza varlıkları bu sınırın dışındadır ama kaynağı (betik) depoda dursun.
   Gereken ölçüler için güncel kuralı kontrol et.

## 3. Mağaza kaydı varlıkları

Hepsi için gerekli ölçü, sayı ve biçimi her mağazanın güncel kuralından kontrol et.

- [AGENT] Uygulama adı, kısa ve uzun açıklama: Türkçe ve İngilizce. Başka bir oyunun adını, karakterini ya da
  görselini çağrıştırma (hattın temel kuralı: yalnızca mekanik düzeyinde ilham).
- [AGENT] Ekran görüntüleri: Playwright ile telefon boyutunda alınır (kapı 390×844, ölçek 2). Hangi cihaz sınıfları ve
  boyutlar zorunlu: güncel kuralı kontrol et.
- [AGENT] Simge, öne çıkarılmış grafik gibi tanıtım görselleri: ihtiyaç mağazaya göre değişir; kontrol et.
- [İNSAN: hesap] Mağaza hesabında kayıt oluşturma, kategori, fiyat/ülke seçimi, iletişim bilgileri.

## 4. Gizlilik, veri güvenliği, yaş derecesi

Bunlar hukuki beyanlardır: metni agent hazırlayabilir, **beyanı insan verir ve sorumluluğu insan taşır**.

- [AGENT] Gizlilik politikası taslağı: oyunun ne sakladığını açıkça yaz. Bugünkü durum (kodu okuyarak): kayıt yalnızca
  cihazda (`localStorage`), analitik hiçbir yere gönderilmiyor, reklam sağlayıcısı yok. Bir reklam ya da analitik
  SDK'sı eklenince bu cümleler ve aşağıdaki formlar değişir.
- [AGENT] Yapıldı: `docs/gizlilik/` (her oyun için Türkçe + İngilizce sayfa, `node tools/gizlilik.mjs` üretir).
- [İNSAN: hesap] GitHub Pages'i aç (Settings → Pages → Deploy from a branch → `main`, `/docs`); adresler
  `https://shellwe1628.github.io/play-oyunlar/gizlilik/<slug>/` (`play-yayin.md` A6).
- [İNSAN: hesap] Google Play formlarının bugünkü cevapları: `play-yayin.md` bölüm B.
- [İNSAN: hesap] Google Play "veri güvenliği" formu ve Apple "uygulama gizliliği" bildirimi: cevaplar gerçek SDK ve
  veri akışıyla tutarlı olmalı. Her ekleme (reklam, analitik, satın alma) sonrası yeniden gözden geçir.
- [İNSAN: hesap] Yaş derecelendirme anketleri (Google Play ve App Store kendi anketini ister; güncel kuralı kontrol et).
  Reklam gösterilecekse reklam sağlayıcısının içerik/çocuk politikası da derecelendirmeyi etkileyebilir; kontrol et.
- [İNSAN: karar] Çocuklara yönelik olup olmadığı kararı, ilgili ek kuralları getirebilir; güncel kuralı kontrol et.

## 5. Reklam ve satın alma sağlayıcısı bağlama

Oyun kodu sağlayıcıyı bilmez; her şey `this.oyun.platform` arayüzünden geçer. Bugünkü durum:

| | web | crazygames | capacitor |
|---|---|---|---|
| geçiş reklamı | `'unavailable'` | SDK (doğrulanmamış taslak) | `'unavailable'` (sağlayıcı bağlı değil) |
| ödüllü reklam | `'granted'` (test için) | SDK (doğrulanmamış taslak) | `'unavailable'` |
| analitik (`track`) | boş | boş | boş |

1. **Arayüzde satın alma yok.** `Platform` (`packages/core/src/platform/types.ts`) geçiş/ödüllü reklam, titreşim,
   analitik, `gameplayStart/Stop` ve yaşam döngüsü sunar; uygulama içi satın alma yöntemi yoktur. Tasarım belgesi
   "arayüzü hazır" der, bu yalnızca reklam için doğrudur. Satın alma istenirse önce çekirdeğe bir yöntem eklenir
   (mimar işi, `hat.md` "Çekirdek değişikliği").
2. [AGENT, mimar] Sağlayıcıyı `packages/core/src/platform/capacitor.ts` bağdaştırıcısına bağla (SDK ya da Capacitor
   eklentisi). Oyun kodu ve `GAME.md` içindeki yerleşim yerleri değişmez. SDK yeni bağımlılıktır: paket, kesin sürüm
   ve neden `packages/core/README.md`'ye yazılır.
3. [AGENT] Kurallar (zaten çekirdeğin sözleşmesinde): geçiş reklamı yalnızca doğal aralarda; ödül yalnızca `'granted'`
   dönünce verilir; reklam sırasında oyun duraklar (yaşam döngüsü bunu çıkarır).
4. [İNSAN: hesap] Reklam ağı hesabı, uygulama ve reklam birimi kimlikleri, ödeme bilgileri. Anahtarları depoya koyma.
5. [İNSAN: hesap] Satın alma için mağaza hesabında ürün tanımları (Play Console, App Store Connect) ve test hesapları.
6. Gerçek reklam/satın alma gerçek cihazda denenir; sağlayıcının ve mağazanın sunduğu test modunu/kimliklerini kullan
   (güncel kuralı kontrol et).
7. Sağlayıcı eklendikten sonra bölüm 4'teki formları yeniden doldur.

## 6. Gerçek cihaz testi

Playwright'ın telefon boyutu emülasyonu gerçek cihaz yerine geçmez.

- [İNSAN: hesap] En az bir gerçek Android cihazda debug/release APK; (Mac varsa) bir gerçek iPhone'da derleme.
- Her cihazda bak: ilk açılış süresi; dokunma hedefleri parmakla rahat mı; güvenli alan (çentik, alt çubuk) içinde mi;
  yatay/dikey kilidi; arka plana atıp dönünce duraklama menüsü; ses ilk dokunuşta açılıyor mu, sessize alma kalıcı mı;
  kayıt uygulamayı kapatıp açınca duruyor mu; düşük pille/ısınmada kare hızı; Türkçe karakterler.
- [AGENT] Cihazdan gelen bulgular `playtester.md` biçimiyle yazılırsa yapımcıya aynen devredilebilir.
- Bulunan engelleyiciler düzeltilir, kapı ve aşama 5 yeniden çalışır.

## 7. Göndermeden önce son kontrol

- [ ] `npm run gate` (tüm oyunlar) yeşil.
- [ ] Aşama 5 raporlarında açık engelleyici yok.
- [ ] Mekaniğin mağaza kanıtı yeniden kontrol edildi (rakip çıkmadı).
- [ ] Gizlilik politikası yayında ve form cevapları gerçek veri akışıyla uyumlu.
- [ ] Gerçek cihazda tam bir oturum oynandı.
- [ ] Başka bir oyunun adı, karakteri, görseli, seviyesi kopyalanmadı.
- [ ] Anahtarlar ve hesap bilgileri depoda yok.
