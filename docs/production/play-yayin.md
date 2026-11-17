# Google Play'e yayın: adım adım kılavuz

Bu belge, üç oyunu Google Play'de **üç ayrı uygulama** olarak yayımlamak için sahibin (geliştirici
olmayan biri) yapması gerekenleri sırasıyla anlatır. Teknik parça hazır: GitHub Actions'taki
**"Play'e yükle"** iş akışı oyunu derler, imzalar ve Play'e yükler.

> **Doğrulanmadı.** Bu iş akışı **hiç çalıştırılmadı**. Hazırlandığı ortamdan Google Play'e
> ulaşılamıyordu ve hiçbir anahtar yoktu. Yerelde denenen: imzalı paketlerin (AAB) derlenmesi
> (üç oyun da, deneme anahtarıyla; Google'ın `bundletool` aracı paketleri geçerli
> buldu), iş akışı dosyasının denetimi ve Google'a bağlanmayan her adımın kuru çalıştırması.
> Google'la konuşan hiçbir şey (giriş, yükleme, mağaza kaydı gönderimi) denenmedi. İlk
> çalıştırmada küçük düzeltmeler gerekebilir; bilinen hatalar aşağıda, "Sorun giderme"de.
>
> Play Console'un menü adları ve formları sık değişir. Bu belgede "Console'da ne görünüyorsa onu
> kontrol et" yazan her yerde ekrandaki güncel metne güvenin.

## Özet: kim, ne

| Uygulama | Paket adı (kalıcı, değişmez) | Ad (en-US) | Ad (tr-TR) | Oyun klasörü |
|---|---|---|---|---|
| 1 | `com.playoyunlar.fossilodds` | Fossil Odds | Fosil Şansı | `games/fosil` |
| 2 | `com.playoyunlar.sparkrise` | Sparkrise | Kıvılcım | `games/kivilcim` |
| 3 | `com.playoyunlar.noodlearchers` | Noodle Archers | Sallanan Okçular | `games/okcu` |

Varsayılan dil İngilizce (en-US), ikinci dil Türkçe (tr-TR). Ayarların tek kaynağı
`store/apps.json`; mağaza metinleri ve görselleri `store/<slug>/metadata/android/`.

Gizlilik politikası adresleri (GitHub Pages açıldıktan sonra, adım A6):

- https://shellwe1628.github.io/play-oyunlar/gizlilik/fosil/
- https://shellwe1628.github.io/play-oyunlar/gizlilik/kivilcim/
- https://shellwe1628.github.io/play-oyunlar/gizlilik/okcu/

---

## A. Bir kerelik hazırlık

Sıra önemli: A1 → A6, sonra B (Console formları), sonra C (iş akışını çalıştırmak).

### A0. Bu dosyalar `main` dalında olmalı

GitHub, elle tetiklenen iş akışlarını ve Pages sitesini yalnızca **varsayılan daldan** (`main`)
görür. Bu çalışmanın commit'leri `main`'e birleştirilmeden "Play'e yükle" Actions sekmesinde
çıkmaz ve gizlilik sayfaları yayımlanmaz.

### A1. Üç uygulamayı Play Console'da oluşturun

Her oyun için bir kez (play.google.com/console):

1. **Uygulama oluştur** (Create app).
2. Uygulama adı: yukarıdaki tablodaki **en-US adı** (Fossil Odds / Sparkrise / Noodle Archers).
   Türkçe adı sonra mağaza kaydında tr-TR dili için girilir (ya da iş akışı gönderir).
3. Varsayılan dil: **English (United States) – en-US**.
4. Uygulama mı oyun mu: **Oyun**. Ücretli mi ücretsiz mi: **Ücretsiz** (sonradan ücretliye çevrilemez).
5. Beyan kutularını (Geliştirici Program Politikaları, ABD ihracat yasaları) okuyup işaretleyin.

**Paket adı** Console'da uygulamayı oluştururken sorulmaz: ilk yüklenen paketten (AAB) alınır ve
o andan sonra **asla değiştirilemez**. Paket adları `store/apps.json` içinde sabit, tablodakiyle
aynı. Bir uygulamaya yanlış oyunu yüklememek için ilk yüklemede (adım C3) dosya adına bakın:
`fosil-release.aab` → Fossil Odds, `kivilcim-release.aab` → Sparkrise, `okcu-release.aab` → Noodle Archers.

### A2. Hizmet hesabı (service account) anahtarı

İş akışı Play'e bir "hizmet hesabı" adına bağlanır. Başka bir uygulamayı zaten
`r0adkll/upload-google-play` ile yüklediğiniz için **bir hizmet hesabınız var**; aynısını
kullanabilirsiniz.

**Anahtar dosyası (JSON):**

- Diğer depoda kullandığınız JSON dosyasının bir kopyası sizde duruyorsa onu kullanın. GitHub'a
  kaydedilmiş bir secret geri okunamaz; kopya yoksa aynı hizmet hesabına yeni anahtar üretin:
  1. console.cloud.google.com → Play ile kullandığınız proje → **IAM ve Yönetici → Hizmet hesapları**.
  2. Hesaba tıklayın → **Anahtarlar** → **Anahtar ekle → Yeni anahtar oluştur → JSON** → indirilen
     `.json` dosyasını saklayın. (Kuruluşunuzun ilkesi anahtar üretimini engelliyorsa Cloud
     Console bunu söyler.)
- Hiç hizmet hesabınız yoksa: Cloud Console'da bir proje seçin/oluşturun → **API'ler ve
  Hizmetler → Kitaplık** → "Google Play Android Developer API" → **Etkinleştir**; sonra yukarıdaki
  gibi hizmet hesabı oluşturup JSON anahtarı indirin.

**Hesaba üç uygulamaya erişim verin** (Play Console tarafı):

1. Play Console → **Kullanıcılar ve izinler** (Users and permissions).
2. Hizmet hesabı zaten listedeyse ona tıklayın; değilse **Yeni kullanıcı davet et** ve hizmet
   hesabının adresini (JSON dosyasındaki `client_email`, `...iam.gserviceaccount.com` ile biter) girin.
3. **Uygulama izinleri** sekmesinde **Uygulama ekle** → üç yeni uygulamayı seçin.
4. Her biri için en az şu izinleri açın (adlar Console'da biraz farklı olabilir, ekrandakine bakın):
   - Uygulama bilgilerini görüntüleme (salt okunur)
   - Test kanallarına sürüm yayınlama (Release apps to testing tracks)
   - Test kanallarını yönetme ve test kullanıcısı listelerini düzenleme
   - Mağaza kaydını, fiyatlandırmayı ve dağıtımı düzenleme (iş akışı mağaza metni/görseli
     gönderecekse gerekli)
   - Üretime yayınlama (yalnızca ileride üretime de iş akışıyla çıkacaksanız)
5. **Kullanıcıyı davet et / Değişiklikleri kaydet**.

İzinlerin etkili olması biraz zaman alabilir; ilk denemede "yetki yok" hatası çıkarsa bir süre
sonra tekrar deneyin.

### A3. Yükleme anahtarı (upload keystore) oluşturun

**Play App Signing ne demek:** Google, uygulamanın asıl imza anahtarını kendisi saklar ve
telefonlara giden paketleri o anahtarla imzalar. Sizin anahtarınız yalnızca bir **yükleme
anahtarıdır**: "bu paketi gerçekten ben yükledim" demeye yarar. Yeni uygulamalarda Play App
Signing zorunlu ve otomatiktir; ilk yüklemede Console sorarsa **Google tarafından oluşturulan
anahtarı kullan** seçeneğini kabul edin. İlk yüklenen paketin anahtarı, o uygulamanın kayıtlı
yükleme anahtarı olur.

Üç uygulama için **tek bir yükleme anahtarı** kullanıyoruz (Google buna izin verir; asıl imza
anahtarları her uygulamada ayrıdır). Anahtarı ve şifresini bir parola yöneticisinde ve
yedekte saklayın. Kaybederseniz uygulama kaybolmaz: Play Console → **Test ve sürüm → Uygulama
bütünlüğü** (App integrity) sayfasından yükleme anahtarı sıfırlama istenir.

**Anahtar dosyası asla depoya girmez, hiçbir genel loga yazılmaz.**

#### Yol 1: kendi bilgisayarınızda

`keytool` gerekir: Java (JDK) ya da Android Studio ile gelir (Android Studio'da
`<kurulum>/jbr/bin/keytool`). Bir terminalde:

```text
keytool -genkeypair -v -keystore play-upload.jks -storetype PKCS12 -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Program bir şifre sorar (iki kez; ekranda görünmez) ve ad/kuruluş gibi sorular sorar (adınızı
yazmanız yeterli, diğerlerini boş geçebilirsiniz), sonunda "evet" (`yes`) ister. Şifreyi
komutun içine yazmayın: komut geçmişine kaydolur. Bu yöntemde anahtar şifresi ile dosya şifresi
aynıdır.

Sonra dosyayı GitHub'a yapıştırılabilir metne (base64) çevirip panoya kopyalayın:

| Sistem | Komut |
|---|---|
| macOS | `base64 -i play-upload.jks \| pbcopy` |
| Windows (PowerShell) | `[Convert]::ToBase64String([IO.File]::ReadAllBytes("play-upload.jks")) \| Set-Clipboard` |
| Linux | `base64 -w0 play-upload.jks` (çıktıyı kopyalayın) |

#### Yol 2: hiçbir şey kurmadan (Google Cloud Shell)

Cloud Shell, Google hesabınıza bağlı, tarayıcıda açılan özel bir Linux terminalidir; içindekini
yalnızca siz görürsünüz (genel bir log değildir).

1. shell.cloud.google.com adresini açın (Play hesabınızın Google hesabıyla), terminal açılsın.
2. `keytool -help` yazın. Bir yardım metni çıkıyorsa `keytool` hazırdır (çıkmazsa Yol 1'i kullanın).
3. Yol 1'deki `keytool -genkeypair ...` komutunu aynen çalıştırın, soruları yanıtlayın.
4. `base64 -w0 play-upload.jks` → çıkan uzun tek satırı kopyalayın (GitHub secret'ı için).
5. Yedek için dosyayı indirin: terminalin üstündeki **⋮ (Diğer) → İndir** → `play-upload.jks`.
6. Sonra Cloud Shell'den silin: `rm play-upload.jks`.

### A4. GitHub depo secret'ları

GitHub → depo **shellwe1628/play-oyunlar** → **Settings → Secrets and variables → Actions →
New repository secret**. "Name" kutusuna adı **aynen**, "Secret" kutusuna değeri yapıştırın:

| Secret adı | İçeriği |
|---|---|
| `PLAY_SERVICE_ACCOUNT_JSON` | A2'deki `.json` dosyasının **tamamı** (dosyayı Not Defteri/TextEdit ile açın, hepsini kopyalayın, süslü parantezler dahil) |
| `PLAY_UPLOAD_KEYSTORE_BASE64` | A3'teki base64 metni (tek uzun satır) |
| `PLAY_UPLOAD_KEYSTORE_PASSWORD` | A3'te seçtiğiniz şifre |
| `PLAY_UPLOAD_KEY_ALIAS` | `upload` (A3'teki komutta `-alias` ne yazdıysa) |
| `PLAY_UPLOAD_KEY_PASSWORD` | **İsteğe bağlı.** Yalnızca anahtar şifresi dosya şifresinden farklıysa (A3'teki komutla oluşturduysanız ekleme) |

Depo **herkese açık**: iş akışı logları herkes tarafından görülebilir. İş akışı secret'ları
hiçbir adımda yazdırmaz, GitHub da değerlerini loglarda `***` ile gizler. Yine de secret
değerlerini hiçbir issue, yorum ya da commit'e yapıştırmayın.

### A5. (Bilgi) İş akışının yükleyeceği paket

`npm run aab -- <slug>` (`tools/aab.mjs`) her seferinde sıfırdan:

- oyunun web paketini derler ve denetler (bütün yollar göreli, internetten hiçbir şey çekmez);
- yalnız o oyun için bir Android projesi üretir: paket adı ve adlar `store/apps.json`'dan
  (telefon dili Türkçeyse simge altındaki ad Türkçe), yalnız dikey, kenardan kenara ekran,
  simge (aşağıda), düz renk açılış ekranı;
- **güvenlik ayarları:** hata ayıklanamaz (debuggable değil), şifresiz HTTP kapalı, Android
  yedeklemesi ve cihazdan cihaza aktarım kayıtlar için kapalı (kayıtlar yalnız telefonda kalır;
  gizlilik politikası buna dayanır), hedef API 36, en düşük Android 7.0 (API 24), tek izin
  `INTERNET` (+ AndroidX'in yalnız uygulamanın kendisinin kullanabildiği iç izni);
- `bundleRelease` ile imzalı AAB üretir, bildirim dosyasını, içeriği ve imzayı denetler →
  `build/<slug>-release.aab` (3,2–3,7 MB) ve `build/<slug>-release.json` (sürüm kodu, SHA-256'lar).

**Sürüm kodu (versionCode):** 1 Ocak 2026'dan (UTC) beri geçen dakika. Her derlemede büyür,
yerelde ya da GitHub'da derlenmesi fark etmez, üç uygulamada aynı kural; saklanacak sayaç yok.
Aynı uygulama aynı dakikada iki kez derlenirse Play ikincisini reddeder: bir dakika sonra tekrar
çalıştırın. **Sürüm adı:** `store/apps.json` → `versionName` + commit (ör. `0.1.0-fea694b`).
Yeni bir sürüm numarası için `versionName`'i değiştirin.

**Simge:** `store/<slug>/icon/` içinde PNG varsa ondan (adında `foreground` / `background` /
`monochrome` geçen katmanlar ya da tek kare simge, ör. 512×512); yoksa kodla üretilen yer tutucu
(oyunun renginde halka). Mağaza simgesi ile telefon simgesinin aynı olması için mağaza
kaydı hazırlanırken `store/<slug>/icon/` doldurulmalı.

**Geri tuşu:** oyun içinde ilk basış yalnızca "Çıkmak için geri tuşuna tekrar basın" uyarısı
gösterir; 2 saniye içinde ikinci basış uygulamayı **arka plana alır** (Ana ekran tuşu gibi):
oyun duraklar, koşu kaybolmaz, geri dönünce kaldığı yerdedir. Oyundan çıkmanın asıl yolu
oyunun kendi menü/duraklat düğmeleridir. (Tek dokunuşla uygulamayı kapatmak, yanlışlıkla
basınca yarım koşuyu sessizce öldürüyordu.) Uygulama arka plana gidince oyunlar kendi
duraklatma davranışını uygular: Kıvılcım duraklatma menüsünü açar ve koşu, oyuncunun sonraki
basışında devam eder; Okçular paraları ve en iyi dalgayı hemen kaydeder; Fosil kaydeder. İlk
basış (yalnız uyarı) oyunu durdurmaz. Bu davranış telefonda denenmedi.

**Reklam düğmeleri (önemli):** Bu dahili test paketleri, telefona elle kurduğunuz test APK'sı
gibi **web platform bağdaştırıcısıyla** derlenir (`store/apps.json` → `"platform": "web"`):
ödüllü düğmeler (Fosil "2× şans", "Tozu ikiye katla (reklam)"; Okçular "+1 kart", "canlan",
"çift para"; Kıvılcım "devam et", "Elmas ×2") reklam göstermeden **ödülü hemen verir**. Neden:
Capacitor bağdaştırıcısında bu düğmeler "reklam yok" cevabı alır ve kodu okuyunca görülen şu:
üç oyunda da düğme basınca hiçbir şey olmaz, hiçbir mesaj çıkmaz, sonra yeniden etkinleşir
(Fosil, Okçular kart düğmesi, Okçular sonuç ekranı, Kıvılcım). Test edenler bunu "bozuk düğme"
diye bildirir ve ödüllü akışlar hiç denenemez. Web bağdaştırıcısı bu akışları test ettirir.
Uygulamada reklam SDK'sı yoktur; gizlilik politikası ve formlardaki "reklam yok" cevabı bu
paket için doğrudur.

**Üretime (production) çıkmadan önce değişmesi gerekenler** (iş akışı, `web` bağdaştırıcılı bir
oyunu `production` kanalına göndermeyi reddeder):

1. Karar: reklam olacak mı? Olacaksa `packages/core/src/platform/capacitor.ts` gerçek bir reklam
   sağlayıcısına bağlanır (çekirdek işi, `yayin-listesi.md` bölüm 5) ve `store/apps.json`'da
   `platform` → `capacitor`. Olmayacaksa ödüllü düğmeler ya kaldırılır ya da "reklam yok" durumunda
   gizlenir/açıklama gösterir (oyun kodu değişikliği); Fosil'in "(reklam)" etiketi de düzeltilir.
2. Reklam eklenirse: gizlilik politikası (`node tools/gizlilik.mjs` içindeki metin), Veri
   güvenliği formu, reklam beyanı, gerekirse içerik derecelendirmesi ve hedef kitle yeniden
   doldurulur.
3. Gerçek telefonda tam bir oturum (bu paketler hiçbir cihazda çalıştırılmadı).
4. Hesabınıza uygulanıyorsa kapalı test şartı (D bölümü).

### A6. GitHub Pages'i açın (gizlilik politikası)

1. GitHub → depo → **Settings → Pages**.
2. **Build and deployment → Source: Deploy from a branch**.
3. **Branch: `main`**, klasör: **`/docs`** → **Save**.
4. Birkaç dakika sonra sayfanın üstünde site adresi görünür. Kontrol edin:
   https://shellwe1628.github.io/play-oyunlar/gizlilik/ (üç oyunun listesi) ve her oyunun sayfası
   (yukarıdaki adresler). Her sayfada önce Türkçe, sonra İngilizce metin var.

Not: Pages bütün `docs/` klasörünü yayımlar (depo zaten herkese açık olduğu için yeni bir şey
açılmaz). `docs/.nojekyll` dosyası GitHub'ın Jekyll işlemesini kapatır, dosyalar olduğu gibi
sunulur. Metni değiştirmek için `tools/gizlilik.mjs`'i düzenleyip `node tools/gizlilik.mjs`
çalıştırın; sayfaya e-posta adresi yazılmaz, iletişim için Play sayfasındaki adrese yönlendirir.

---

## B. Yalnızca Play Console'da yapılabilenler (her uygulama için)

Bunlar Google'ın API'si ya da bu iş akışıyla yapılamaz. Console'da her uygulamanın
**Gösterge tablosu** (Dashboard) "Uygulamanızı kurun" listesinde görünür; **İlke → Uygulama
içeriği** (Policy → App content) altında toplanır. Aşağıdaki cevaplar oyunların **bugünkü** haline
(web bağdaştırıcılı dahili test paketi) göre; bir şey değişirse (reklam, analitik, hesap, satın
alma) cevaplar da değişir. Sorular Console'da farklı sözcüklerle ya da farklı sırayla
çıkabilir: ekrandakini okuyun, anlamı aşağıdakiyle uyuşmuyorsa cevaplamadan önce sorun.

### B1. Gizlilik politikası
Adres: yukarıdaki oyuna özel adres (ör. `https://shellwe1628.github.io/play-oyunlar/gizlilik/okcu/`).
Önce A6'yı yapıp adresin açıldığını görün.

### B2. Uygulama erişimi (App access)
**Tüm işlevler özel erişim gerektirmeden kullanılabilir.** (Giriş, hesap, kod yok.)

### B3. Reklamlar (Ads)
**Hayır, uygulamam reklam içermiyor.** (Reklam SDK'sı yok; ödüllü düğmeler reklam göstermiyor.)
Reklam eklendiği gün bu cevap değişmelidir.

### B4. İçerik derecelendirmesi (Content rating, IARC anketi)
E-posta: Console hesabınızın adresi. Kategori: **Oyun** (Game). Cevaplar:

| Konu | Fosil Şansı | Kıvılcım | Sallanan Okçular |
|---|---|---|---|
| Şiddet | Hayır | Hayır | **Evet: çizgi film / fantastik şiddet.** Esnek uzuvlu, insan benzeri çizim okçular birbirine ok atıp platformdan düşürür; kan, yaralanma ayrıntısı, ölüm sahnesi yok. Ankette hangi seçenek bu tarife uyuyorsa onu seçin (gerçekçi değil, kan yok). |
| Korku, cinsellik, küfür, uyuşturucu/alkol/tütün | Hayır | Hayır | Hayır |
| Kumar / simüle kumar | Hayır (bloklardan rastgele fosil çıkar ve olasılığı yazar; para ya da puanla bahis yok, satın alma yok) | Hayır | Hayır |
| Kullanıcılar etkileşir / içerik paylaşır | Hayır | Hayır | Hayır |
| Konum paylaşımı | Hayır | Hayır | Hayır |
| Dijital satın alma | Hayır | Hayır | Hayır |
| Sınırsız internet / web tarayıcı | Hayır | Hayır | Hayır |

Sonuç yaş derecelerini IARC hesaplar; buradan tahmin edilmez.

### B5. Hedef kitle ve içerik (Target audience and content)
Bu bir karar ve sizin sorumluluğunuzda. **Öneri: 13 yaş ve üstü gruplar** (13–15, 16–17, 18+),
"Uygulama çocukların ilgisini çekebilir mi?" sorusunda dürüst cevap. 13 yaş altı seçilirse
Google'ın Aileler politikası devreye girer (ek şartlar; ileride reklam eklenirse yalnız onaylı
reklam SDK'ları). Oyunlar veri toplamadığı için bu bugün bir engel değil, ama ileriki reklam
kararını kısıtlar. Console'da her seçimin getirdiği şartlar yazar, onları okuyun.

### B6. Veri güvenliği (Data safety)
- "Uygulamanız gerekli kullanıcı veri türlerinden herhangi birini topluyor ya da paylaşıyor mu?"
  → **Hayır.** Gerekçe (kodla doğrulandı): hesap yok, analitik hiçbir yere gönderilmiyor, reklam
  SDK'sı yok, oyun internete istek göndermiyor; kayıt ve ses ayarı yalnız telefonda (Google'ın
  tanımında yalnız cihazda işlenen veri "toplanan" sayılmaz; Console'daki açıklamayı okuyun),
  yedekleme/aktarım kapalı.
- "Hayır" deyince şifreleme ve hesap silme soruları genelde çıkmaz; çıkarsa: hesap yok.
- Reklam kimliği (Advertising ID) sorusu çıkarsa: **Hayır, kullanmıyor** (manifestte `AD_ID`
  izni yok).

### B7. Diğer beyanlar
| Beyan | Cevap |
|---|---|
| Haber uygulaması mı (News apps) | Hayır |
| Sağlık uygulaması / sağlık özellikleri (Health) | Hayır, sağlık özelliği yok |
| Finansal özellikler (Financial features) | Uygulamada finansal özellik yok |
| Devlet uygulaması (Government apps) | Hayır |
| COVID-19 temaslı takip/durum | Hayır (soruluyorsa) |
| Hesap silme | Uygulamada hesap oluşturulamıyor |

Listede burada olmayan bir beyan görürseniz: oyunlarda hesap, satın alma, konum, kamera,
mikrofon, ağ isteği, reklam, analitik yok; buna göre cevaplayın, emin değilseniz sorun.

### B8. Kategori ve etiketler (Mağaza ayarları → Store settings)
- Uygulama türü: **Oyun**. Kategori önerisi: Fosil Şansı → **Casual** (boşta kazı/koleksiyon),
  Kıvılcım → **Arcade**, Sallanan Okçular → **Action** (ya da Arcade). Console'un listesinden seçin.
- Etiketler: Console'un sunduğu listeden en fazla izin verilen kadar, oyuna en yakın olanlar
  (ör. Fosil: koleksiyon/boşta; Okçular: okçuluk/fizik; Kıvılcım: refleks/tek dokunuş).
  Listede ne varsa onu kullanın.

### B9. İletişim bilgileri (Store listing contact details)
- E-posta: **Play Console hesabınızın e-posta adresi** (Console'da kendiniz girip onaylıyorsunuz;
  bu adres depoya hiçbir yerde yazılmadı, yazılmamalı).
- Web sitesi: isteğe bağlı (`https://shellwe1628.github.io/play-oyunlar/gizlilik/` verilebilir).
- Telefon: isteğe bağlı.

### B10. Mağaza kaydı (Main store listing)
Metinler ve görseller `store/<slug>/metadata/android/<dil>/` altında hazırlanıyor (başlık ≤ 30,
kısa açıklama ≤ 80, tam açıklama ≤ 4000 karakter; simge 512×512, öne çıkan grafik 1024×500,
en az 2 telefon ekran görüntüsü). Bunları iş akışı gönderebilir (C1'de "listing" kutusu) ya da
Console'a elle girebilirsiniz. tr-TR dilini Console'da **Çeviri ekle → Türkçe** ile eklemeniz
gerekebilir; iş akışı (fastlane) eksik dili kendisi eklemeye çalışır, bu denenmedi.

### B11. Fiyat ve ülkeler
Ücretsiz; dahili test için ülke seçimi gerekmez. Kapalı/açık test ve üretim için ülkeleri
**Test ve sürüm → ... → Ülkeler/bölgeler** altında seçin.

---

## C. İş akışını çalıştırmak

### C1. Başlatma
GitHub → depo → **Actions** → solda **Play'e yükle** → **Run workflow**:

| Girdi | Ne |
|---|---|
| game | `fosil`, `kivilcim`, `okcu` ya da `all` (üçü, ayrı ayrı) |
| track | `internal` (dahili test; varsayılan), `alpha` (kapalı test), `beta` (açık test), `production` (üretim; web bağdaştırıcısıyla reddedilir) |
| status | `draft` (varsayılan): sürüm Console'da taslak olarak bekler, siz **İncele ve yayınla** dersiniz. `completed`: hemen test edenlere çıkar. **Yeni uygulama, kurulumu bitene kadar yalnız `draft` kabul eder.** |
| listing | işaretlenirse `store/<slug>/metadata/android/` altındaki metinler ve görseller de gönderilir (eksik ya da sınırı aşan bir şey varsa yükleme yapılmadan durur ve neyin eksik olduğunu yazar) |

### C2. Ne olur, ne kadar sürer (tahmini 10–15 dk / oyun)
1. **Plan:** hangi oyunlar, kanal üretimse reddet.
2. **Secret denetimi:** eksik secret varsa adıyla söyler ve durur (değerler yazılmaz).
3. Kurulum (`npm ci`), Chromium, **kalite kapısı** (`npm run gate -- <slug>`: tip denetimi, lint,
   birim testleri, derleme, boyut bütçesi, tarayıcı duman testi). Kapı kırmızıysa yükleme olmaz.
4. Yükleme anahtarı çözülür, **imzalı AAB** derlenir (A5).
5. AAB **Artifacts** olarak saklanır (14 gün): çalıştırmanın sayfasında en altta
   `<slug>-aab-<sürüm kodu>`. Depo herkese açık olduğu için GitHub'a giriş yapmış herkes bu
   dosyayı indirebilir: içinde gizli bir şey yok (oyunun kendisi), ama yayımlanmamış bir sürüm.
6. Sürüm notları hazırlanır (her dil için; `store/<slug>/metadata/android/<dil>/changelogs/`
   içinden, yoksa `store/apps.json` → `releaseNotes`).
7. fastlane (2.241.2) ile Play'e yükleme. Özet sayfasında sürüm kodu, boyut, kullanılan yükleme
   sertifikasının SHA-256'sı (Console → Uygulama bütünlüğü'ndekiyle aynı olmalı).
8. Anahtar dosyaları silinir (her durumda).

`draft` ile çalıştırdıysanız: Console → **Test ve sürüm → Test → Dahili test** → taslak sürüm →
**İncele ve yayınla**.

### C3. İlk yükleme elle (bilinen sınır)
Yepyeni bir uygulamaya **ilk paket** Console'dan elle yüklenmeden Google'ın API'si yükleme
kabul etmeyebilir. İş akışı **"Package not found"**, **"applicationNotFound"** ya da benzeri bir
hatayla durursa:

1. Aynı çalıştırmanın sayfasında **Artifacts** → `<slug>-aab-<sürüm kodu>` indirin, zip'i açın,
   içindeki `<slug>-release.aab` dosyasını alın.
2. Doğru uygulamayı açtığınızdan emin olun (dosya adı ↔ tablo, A1).
3. Console → **Test ve sürüm → Test → Dahili test → Yeni sürüm oluştur**.
4. Play App Signing sorulursa Google'ın oluşturduğu anahtarı kabul edin (A3).
5. **Yükle** → AAB'yi seçin. Sürüm notlarını girin (ör. "Dahili test sürümü").
6. **Kaydet → İncele → Dahili teste yayınla**.

Bundan sonraki sürümler iş akışıyla yüklenir.

### C4. Sorun giderme (bilinen hatalar)
Yükleme adımı başarısız olursa iş akışı özet sayfasına da bu listeyi yazar.

| Hata metni (kabaca) | Anlamı / yapılacak |
|---|---|
| `Missing repository secret: ...` | Adı yazan secret eksik (A4). |
| `Bad secret: PLAY_SERVICE_ACCOUNT_JSON ...` | JSON dosyasının tamamı yapıştırılmamış. |
| `Bad secret: PLAY_UPLOAD_KEYSTORE_BASE64 ...` | base64 metni eksik/bozuk; A3'teki komutla yeniden üretin. |
| `keytool cannot open the upload keystore ...` | Şifre ya da alias yanlış. |
| `Package not found` / `applicationNotFound` | İlk yükleme elle (C3) ya da paket adı Console'daki uygulamayla eşleşmiyor. |
| `Only releases with status draft may be created on draft app` | Uygulama kurulumu bitmemiş: `status = draft` ile çalıştırın. |
| `The caller does not have permission` / 403 | Hizmet hesabının bu uygulamaya izni yok (A2) ya da izin henüz etkinleşmedi. |
| `Version code ... has already been used` | Aynı dakikada iki derleme; tekrar çalıştırın. |
| `signed with the wrong key` / yanlış sertifika | Secret'lardaki anahtar bu uygulamanın kayıtlı yükleme anahtarı değil (Console → Uygulama bütünlüğü'ndeki SHA-256 ile özet sayfasındakini karşılaştırın). |
| `Not for production` | `web` bağdaştırıcılı oyun üretime gönderilemez (A5, "Üretime çıkmadan önce"). |
| Kapı (Gate) kırmızı | Oyunda bir test kırık; yazılımcı düzeltmeli. Yükleme yapılmadı. |

---

## D. Üretime çıkış şartı (kapalı test)

Google, **yeni kişisel geliştirici hesaplarının** üretime çıkmadan önce belirli sayıda test
edenle belirli bir süre **kapalı test** yapmasını şart koşuyor. Sayılar ve hangi hesaplara
uygulandığı değişebildiği için burada yazılmadı: Console'da uygulamanın **Gösterge tablosu →
Üretime erişim** (ya da "Üretime başvur") bölümünde hesabınıza ne uygulandığı ve kalan gün/test
eden sayısı yazar. Kapalı test için iş akışında `track = alpha` seçilebilir (Console'daki
"Kapalı test – Alpha" kanalı); test edenleri o kanalın **Test edenler** sekmesine ekleyin.
Dahili test bu şartı karşılamaz.

## E. Dahili teste test eden eklemek

1. Console → uygulama → **Test ve sürüm → Test → Dahili test → Test edenler** sekmesi.
2. **E-posta listesi oluştur**: ad verin, test edenlerin **Google hesabı** e-postalarını ekleyin
   (en fazla 100 kişi), kaydedin, listeyi işaretleyin, **Değişiklikleri kaydet**.
3. Aynı sayfada **"Test edenler nasıl katılır" → Web'de katıl** bağlantısını kopyalayın
   (`https://play.google.com/apps/internaltest/...` biçiminde) ve test edenlere gönderin.
4. Test eden, listedeki Google hesabıyla bağlantıyı açar → **Test eden ol** → sayfadaki Play
   bağlantısıyla uygulamayı kurar. Sürüm yayına alındıktan sonra (draft ise C2'deki "İncele ve
   yayınla" adımı) dahili testte birkaç dakika içinde görünür.
5. Üç uygulama ayrı olduğu için her biri için ayrı bağlantı vardır; aynı e-posta listesi üçünde
   de seçilebilir.

Not: Telefona elle kurulmuş test APK'ları (`Play Oyunlar Test`, `com.playoyunlar.testpaketi`, ve
oyun başına `com.playoyunlar.<ad>.test`, adı "… (Test)") ayrı uygulamalardır; Play'den kurulan
oyunlarla çakışmaz, kayıtlar da ayrıdır. Kendilerini GitHub'daki `test-latest` sürümünden
günceller (`apps/test-paketi/README.md`). Bu güncelleyici, kurulum izni ve herkese açık test
anahtarı (`tools/test-imza/`) Play paketlerinde **yoktur**: `tools/aab.mjs` onları hiç kullanmaz ve
test anahtarıyla imzalamayı reddeder.

## F. Kararlar (kayıt)

| Karar | Neden |
|---|---|
| Ayarlar `store/apps.json`'da, oyun klasörlerine dokunulmuyor | Oyunlarda eski `com.oyunlar.<slug>` kimlikleri duruyor (`oyun.config.json`); yayın kimlikleri tek yerde, derleme anında uygulanıyor. |
| Capacitor projesi her derlemede `build/aab/<slug>/` altında sıfırdan | Yapılan her yama tekrarlanabilir; depoda üretilmiş dosya yok. |
| Tek yükleme anahtarı, üç uygulama | Daha az secret; asıl imza anahtarları Google'da ayrı. |
| versionCode = 2026-01-01'den beri dakika | Yerel ve CI derlemeleri karışsa da hep büyür; sayaç saklamak gerekmez. |
| fastlane `supply` (hem AAB hem mağaza kaydı) | Mağaza metni/görselleri için standart düzen (`metadata/android/<dil>/`) ve sürüm notlarını destekler; tek araç. RubyGems'ten sabit sürüm, üçüncü taraf GitHub Action'ı yok. |
| Varsayılan `draft` | Yeni uygulamalar kurulum bitene kadar yalnız taslağı kabul eder; ayrıca yayından önce Console'da son bir bakış. |
| Web bağdaştırıcısı (dahili test) | A5, "Reklam düğmeleri". |
| Geri tuşu: iki basış → arka plana | A5, "Geri tuşu". |
| Yedekleme ve cihaz aktarımı kapalı | Kayıtlar yalnız telefonda: gizlilik politikası ve Veri güvenliği cevabı basit ve doğru. Bedeli: telefon değişince ilerleme taşınmaz. Açılırsa politika ve form güncellenir. |
| Gizlilik sayfaları `docs/gizlilik/`, Pages "main /docs" | Ek iş akışı ya da izin gerektirmeyen en basit Pages kurulumu. |
