# App Store'a yayın: reddedilmeden geçmek için adım adım kontrol listesi

> **Güncel durum (20 Kasım 2026):** **Üç oyunda da AdMob ödüllü reklamlar var** (Fossil Odds, Sparkrise,
> Noodle Archers; düğmelerde "▶ REKLAM" etiketi). İstekler herkes için çocuklara yönelik; kişiselleştirme,
> IDFA ve ATT yok; Android'de AD_ID izni kaldırıldı. Bu yüzden aşağıdaki "Reklamlar eklenince (AdMob)"
> bölümü **üç oyun için de geçerlidir**: App Privacy "Data Not Collected" değil (yaklaşık konum, cihaz
> kimliği, ürün etkileşimi, tanılama: reklam/analiz/sahtekârlık önleme; izleme yok), yaş derecelendirmesinde
> "Advertising: Yes". Aşağıda "reklam yok" diyen eski satırlar bu nota göre okunmalı. İnceleme notuna şunu
> ekleyin: "Rewarded buttons marked ▶ AD show a Google AdMob rewarded ad only when tapped; requests are
> child-directed (no personalised ads, no tracking)." Gizlilik politikası ve sürüm notları güncel.


Bu belge üç oyunu (Fossil Odds / Fosil Şansı, Sparkrise / Kıvılcım, Noodle Archers / Sallanan
Okçular) Apple App Store'a **üç ayrı uygulama** olarak çıkarmak için sahibin yapacaklarını
sırasıyla anlatır. Google Play kılavuzunun (`play-yayin.md`) iOS karşılığıdır.

> **Durum (20 Kasım 2026).** Apple Developer hesabı **henüz yok**; hiçbir şey yüklenmedi.
> Hazır olanlar: iOS derleme aracı (`tools/ipa.mjs`, imzasız derleme denemesi `ios-dene.yml`),
> Game Center köprüsü, gizlilik bildirimi (`tools/ipa/PrivacyInfo.xcprivacy`), App Store
> görselleri (`store/<slug>/appstore/`), mağaza metinleri
> (`store/<slug>/appstore/metadata/`, fastlane `deliver` düzeni) ve iPhone'u da kapsayan gizlilik
> politikası. Apple'la konuşan hiçbir adım denenmedi. App Store Connect'in menü adları sık
> değişir: "ekranda ne yazıyorsa ona güven" kuralı burada da geçerli.

## Özet tablo

| | Fossil Odds | Sparkrise | Noodle Archers |
|---|---|---|---|
| Bundle ID (kalıcı) | `com.playoyunlar.fossilodds` | `com.playoyunlar.sparkrise` | `com.playoyunlar.noodlearchers` |
| Mağaza adı en-US | Fossil Odds: Dig & Collect | Sparkrise: Neon Zigzag | Noodle Archers: Ragdoll Bows |
| Mağaza adı tr | Fosil Şansı: Kaz ve Topla | Kıvılcım: Neon Zikzak | Sallanan Okçular: Ok ve Yay |
| Ana ekrandaki ad | Fossil Odds | Sparkrise | Noodle Archers |
| Kategori | Games → Casual | Games → Action (App Store'da Arcade alt kategorisi yok) | Games → Action |
| İkinci kategori | Entertainment | Entertainment | Entertainment |
| Sürüm | 1.0.0 | 1.0.0 | 1.0.0 |
| Game Center tabloları | `com.playoyunlar.fossilodds.score` | `com.playoyunlar.sparkrise.rank`, `com.playoyunlar.sparkrise.endless` | `com.playoyunlar.noodlearchers.wave` |
| Beklenen yaş sınırı | 4+ | 4+ | 9+ ya da 13+ (Apple hesaplar) |
| Gizlilik URL'si | https://oyunlar.carsihani.me/gizlilik/fosil/ | …/gizlilik/kivilcim/ | …/gizlilik/okcu/ |
| Destek URL'si | https://oyunlar.carsihani.me/gizlilik/ | aynı | aynı |

Ayarların tek kaynağı `store/apps.json` (`ios` bloğu). Metinler değişirse önce
`node store/tools/appstore-validate.mjs <slug>` çalıştır; hepsi PASS olmadan yükleme yapma.

---

## 0. Göndermeden önce mutlaka düzeltilecekler (engelleyiciler)

Bunlar bugün açık olan ve **reddedilme sebebi olabilecek** üç madde. Oyun kodu bu belgenin
kapsamı dışında, ama göndermeden önce kapanmalı:

1. **Destek sayfasında iletişim bilgisi yok (Kılavuz 1.5).** Apple, destek URL'sinde
   geliştiriciye ulaşmanın bir yolunu ister. `tools/gizlilik.mjs` içindeki `CONTACT` sabitine
   bir e-posta adresi yaz (ör. oyunlar için açılmış ayrı bir adres), `node tools/gizlilik.mjs`
   çalıştır, commit'le. O zaman her sayfanın "İletişim" bölümü bu adresi gösterir.
2. **Uygulamanın içinde gizlilik politikası bağlantısı yok (Kılavuz 5.1.1(i)).** Apple
   bağlantıyı hem App Store Connect'te hem de "uygulamanın içinde kolay erişilir bir yerde"
   ister. Oyunların ayarlar/hakkında ekranına (ya da online sıralama panelinin altına)
   `https://oyunlar.carsihani.me/gizlilik/<slug>/` açan bir "Gizlilik / Privacy" bağlantısı
   eklenmeli. Şu an kodda böyle bir bağlantı yok.
3. **Fossil Odds'ta "(reklam)" etiketi.** Çevrimdışı ödül penceresindeki düğme "Double dust (ad)"
   / "Tozu ikiye katla (reklam)" diyor, ama bu sürümde reklam gösterilmiyor. İnceleyici "reklam
   yazıyor, reklam çıkmıyor: eksik özellik" diyebilir (2.1). Reklamlar gelene kadar etiketten
   "(ad)/(reklam)" kalkmalı ya da inceleme notunda açıkça yazılmalı (aşağıdaki notta yazıyor).

---

## 1. Apple Developer Program üyeliği

1. **Apple Hesabı:** iki adımlı doğrulama açık bir Apple Hesabı (ör. iPhone'daki hesap). Adın ve
   soyadın kimlikteki gibi olmalı.
2. **Bireysel mi, kurum mu?**
   - **Bireysel (önerilen):** Şirket yoksa tek yol bu. App Store'da satıcı adı olarak **kendi
     adın soyadın** görünür ("SHELLWE" değil). Kimlik doğrulama iPhone'daki **Apple Developer**
     uygulamasından en hızlı yürür (kimlik fotoğrafı + yüz taraması). D-U-N-S gerekmez.
   - **Kurum:** Yalnızca tüzel kişiliği olan bir şirket (Ltd. Şti., A.Ş.) için. Şahıs şirketi
     ve "ticari unvan/DBA" kabul edilmez. Şirketin **D-U-N-S numarası** gerekir (Apple'ın D-U-N-S
     sorgu sayfasından ücretsiz alınır, 1-2 hafta sürebilir), şirket web sitesi ve şirketi
     bağlama yetkisi olan kişi. Satıcı adı şirket unvanı olur.
   - Play'deki hesap kişisel ("SHELLWE" görünen ad). Apple'da görünen ad seçilemez; bireyselde
     yasal ad çıkar. `copyright.txt` "2026 SHELLWE" kalabilir (telif satırı serbest metindir).
3. **Ücret:** yıllık üyelik (developer.apple.com'da güncel tutar; Türkiye'de TL ile
   faturalanabilir). Kartla Apple'ın kendi sayfasında sen ödersin.
4. **Sözleşmeler:** Üyelik onaylanınca App Store Connect → **Business** (İş) bölümünde **Free
   Apps Agreement** kendiliğinden geçerlidir. **Paid Apps Agreement + vergi + banka bilgisi
   şimdilik GEREKMEZ**: oyunlar ücretsiz ve uygulama içi satın alma yok. (AdMob geliri Google'dan
   gelir, Apple'ın ücretli uygulama sözleşmesini gerektirmez.) İleride ücretli uygulama ya da
   uygulama içi satın alma eklenirse: Paid Apps Agreement, vergi formları (Türkiye için W-8BEN
   ABD vergi formu + gerekirse yerel bilgiler) ve TL/USD alabilen bir banka hesabı (IBAN, SWIFT).
5. **AB tüccar durumu (DSA):** App Store Connect → Business → **Trader status** (Tüccar durumu).
   AB'de dağıtım için zorunlu beyan. Play'de "tüccar" beyan edildi; Apple'da da aynı beyan
   (tüccar) yapılırsa adres, telefon ve e-posta AB ürün sayfasında **herkese açık görünür**,
   Apple bunları doğrular. Tüccar değilsen "not a trader" seç. Bu beyan olmadan AB'de yayın
   yapılamaz.

## 2. App Store Connect API anahtarı (otomatik yükleme için)

Derleme ve yükleme `tools/ipa.mjs --upload` ile, anahtarlar ortamdan okunarak yapılır.

1. App Store Connect → **Users and Access** (Kullanıcılar ve Erişim) → **Integrations** →
   **App Store Connect API** → **Team Keys**. İlk seferde "Request Access" çıkar: yalnızca hesap
   sahibi (Account Holder) isteyebilir, hemen açılır.
2. **Generate API Key** → ad: `play-oyunlar-yukleme`, rol: **Admin**. (Yalnızca yükleme ve
   metin için **App Manager** yeter; ama Xcode'un otomatik imzalaması sertifika ve profil
   oluşturduğu için **Admin** daha az sorun çıkarır. İmza bir kez kurulduktan sonra App Manager'a
   düşürülebilir.)
3. Not al: **Key ID** (10 karakter), sayfanın üstündeki **Issuer ID** (UUID) ve
   `AuthKey_<KeyID>.p8` dosyasını **indir**. `.p8` yalnızca **bir kez** indirilebilir.
4. **Team ID:** developer.apple.com → Account → **Membership details** → Team ID (10 karakter).
5. Bunları GitHub sırrı olarak **yalnızca özel depo `shellwe1628/carsi-hani`** içine koy
   (Settings → Secrets and variables → Actions → New repository secret):

   | Sır adı | İçerik |
   |---|---|
   | `ASC_KEY_ID` | Key ID |
   | `ASC_ISSUER_ID` | Issuer ID |
   | `ASC_KEY_P8` | `.p8` dosyasının tüm metni (`-----BEGIN PRIVATE KEY-----` dahil) |
   | `APPLE_TEAM_ID` | Team ID |

   **Bu açık depoya (play-oyunlar) hiçbir anahtar, `.p8` ya da Team ID koyma; commit'leme.**
   `.p8` dosyasını bilgisayarda depo klasörlerinin dışında sakla ya da sır olarak girdikten
   sonra sil.
6. Yükleme iş akışı (carsi-hani'de, macOS koşucusunda; Play'deki `play-oyunlar-yukle.yml`'in
   ikizi, **henüz yazılmadı**): play-oyunlar'ı istenen `ref`'te çeker, `ASC_KEY_P8`'i geçici bir
   dosyaya yazar, `ASC_KEY_PATH` olarak verir ve `node tools/ipa.mjs <slug> --upload` çalıştırır.
   `tools/ipa.mjs` şu ortam değişkenlerini okur: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`,
   `ASC_KEY_PATH`.

## 3. Bundle ID'leri kaydet (Game Center yeteneğiyle)

developer.apple.com → **Certificates, Identifiers & Profiles** → **Identifiers** → **+** →
**App IDs** → **App** → Continue:

| Description | Bundle ID (Explicit) |
|---|---|
| Fossil Odds | `com.playoyunlar.fossilodds` |
| Sparkrise | `com.playoyunlar.sparkrise` |
| Noodle Archers | `com.playoyunlar.noodlearchers` |

- **Capabilities** listesinde **Game Center** işaretli olsun (açık App ID'lerde genelde
  varsayılan açıktır; kontrol et). Başka yetenek (Push, iCloud, Sign in with Apple…) **açma**.
- Bundle ID'ler Android paket adlarıyla aynı ve **kalıcıdır**; uygulama oluşturulduktan sonra
  değişmez.
- Sertifika ve provisioning profile elle gerekmez: Xcode otomatik imzalama API anahtarıyla
  kendisi oluşturur.

## 4. Üç uygulamayı App Store Connect'te oluştur

App Store Connect → **Apps** → **+** → **New App**:

| Alan | Fossil Odds | Sparkrise | Noodle Archers |
|---|---|---|---|
| Platforms | iOS | iOS | iOS |
| Name | Fossil Odds: Dig & Collect | Sparkrise: Neon Zigzag | Noodle Archers: Ragdoll Bows |
| Primary Language | English (U.S.) | English (U.S.) | English (U.S.) |
| Bundle ID | com.playoyunlar.fossilodds | com.playoyunlar.sparkrise | com.playoyunlar.noodlearchers |
| SKU (iç kod, kalıcı, görünmez) | `fossilodds-ios` | `sparkrise-ios` | `noodlearchers-ios` |
| User Access | Full Access | Full Access | Full Access |

- Ad başka bir uygulamada kullanılıyorsa Apple kabul etmez; o zaman `name.txt`'yi değiştirip
  doğrulayıcıyı yeniden çalıştır.
- Oluşturduktan sonra **App Information** → **Localizable Information** → dil ekle:
  **Turkish**. Türkçe ad/alt başlık `store/<slug>/appstore/metadata/tr/`'den.
- **App Information:** Category = Games, alt kategori (Casual / Arcade / Action), Secondary =
  Entertainment. **Content Rights:** "Does your app contain, show, or access third-party
  content?" → **No** (bütün içerik kendimizin; açık lisanslı yazı tipi üçüncü taraf içerik
  sayılmaz).
- **Pricing and Availability:** Price **Free (0)**. Ülkeler: hepsi, **Çin anakarası hariç**
  (Çin'de oyunlar için devlet onay numarası gerekir; olmadan gönderim reddedilir ya da orada
  yayımlanmaz). "Make this app available on Apple Silicon Mac / Vision Pro" seçeneklerini
  **kapat** (yalnızca iPhone için test edildi).
- **Age Rating**, **App Privacy**, **Game Center**: aşağıdaki bölümler.

## 5. Game Center tabloları (kimlikler tam olarak bunlar)

Uygulama sayfasında **Game Center** bölümü (menüde "Features"/"Services" altında olabilir) →
**Leaderboards** → **+** → **Classic Leaderboard**. **Leaderboard ID'leri `store/apps.json`
→ `ios.gameCenter.boards` ile birebir aynı olmalı**; bir kez kullanılan kimlik silinse bile
tekrar kullanılamaz, yazım hatasında oyunun skorları boşa gider.

| Oyun | Reference Name | Leaderboard ID | Score Format Type | Submission | Sort | en-US adı | tr adı | Sonek |
|---|---|---|---|---|---|---|---|---|
| Fossil Odds | Collection score | `com.playoyunlar.fossilodds.score` | Integer | Best Score | High to Low | Collection score | Koleksiyon puanı | yok |
| Sparkrise | Rank score | `com.playoyunlar.sparkrise.rank` | Integer | Best Score | High to Low | Rank score | Rütbe puanı | yok |
| Sparkrise | Endless height | `com.playoyunlar.sparkrise.endless` | Integer | Best Score | High to Low | Endless height | Sonsuz yükseklik | " m" (tekil ve çoğul) |
| Noodle Archers | Best wave | `com.playoyunlar.noodlearchers.wave` | Integer | Best Score | High to Low | Best wave | En iyi dalga | yok |

- Tür: **Classic** (tekrarlayan/recurring değil). Score Range boş bırakılabilir (isteğe bağlı;
  hileye karşı üst sınır koymak istersen gerçekçi bir üst değer yaz). Görsel isteğe bağlı.
- Her tabloya **iki yerelleştirme** ekle (English (U.S.), Turkish): ad + "Integer" biçimi
  (+ Sparkrise sonsuz için " m" soneki).
- **Önemli:** İlk sürümde tablolar **sürüme bağlanmalı**: sürüm sayfasında (iOS App 1.0.0)
  **Game Center** kutusunu işaretle ve tabloları ekle. Bağlanmazsa tablolar canlıda çalışmaz
  ve inceleyici online sıralamayı bozuk görür (2.1).
- Başarımlar (Achievements) yok; ekleme.

## 6. Yaş derecelendirmesi (Age Rating) cevapları

App Information → **Age Rating** → Edit. Apple'ın 2025'te yenilediği formda yaş sınırları 4+,
9+, 13+, 16+, 18+'dır; Apple cevaplardan hesaplar. Abartmak sorun değil, **eksik beyan
reddedilme sebebidir**. Üç oyun için ortak cevaplar:

| Soru | Cevap | Neden |
|---|---|---|
| Profanity or Crude Humor | None | küfür yok |
| Horror/Fear Themes | None | Sparkrise'ın neon gözlü patronu soyut bir şekil |
| Mature/Suggestive Themes, Sexual Content or Nudity, Graphic Sexual Content | None | |
| Alcohol, Tobacco, or Drug Use or References | None | |
| Medical or Treatment Information | None | |
| Realistic Violence, Prolonged Graphic or Sadistic Realistic Violence | None | |
| Guns or Other Weapons | None (Noodle Archers: aşağıya bak) | |
| Gambling (gerçek para) | No | gerçek para yok |
| Simulated Gambling | None | aşağıya bak |
| Contests | None / No | ödül veren yarışma yok |
| Unrestricted Web Access | No | uygulama web tarayıcısı açmaz |
| User-Generated Content, Messaging and Chat | No | oyunlarda sohbet ya da paylaşım yok; Game Center takma adları Apple'ın kendi ekranında görünür |
| Advertising (reklam içerir mi) | No | bu sürümde reklam yok (reklamlar gelince değişecek, son bölüm) |
| Parental Controls / Age Assurance | No | oyunun yaş sorusu yalnızca beyan; kimlik ya da yaş doğrulaması değil, sadece online sıralamayı kapatır |
| Made for Kids | **No** | Kids kategorisi seçilmeyecek, aşağıya bak |

**Noodle Archers:** **Cartoon or Fantasy Violence → Frequent/Intense** öner. Şiddet hafif
(kan yok, ragdoll karakterler adalardan düşüyor, komik), ama oyunun ana döngüsü insan biçimli
okçulara ok atmak, yani **sık**. Apple'ın formu sıklık ve yoğunluğu tek seçenekte birleştirir;
"Infrequent/Mild" seçmek eksik beyan sayılabilir. Sonuç büyük olasılıkla 9+ ya da 13+ çıkar;
ikisi de olur (online sıralama zaten 13+ için). Silah sorusu varsa: altı silah (yay, arbalet, mızrak, bumerang, sapan
ve "fişek atar" denen çizgi film havai fişek tüpü) fantastik/çizgi film tarzında, gerçekçi ateşli
silah yok; "Guns or Other Weapons" sorusunu formdaki açıklamaya göre cevapla, emin değilsen
"Infrequent/Mild" seç (yine üst sınırı yükseltir, sorun değil). Play'deki karşılığı PEGI 7 /
ESRB 10+ (fantastik şiddet).

**Fossil Odds ve "Simulated Gambling" = None, neden:** Apple'ın "simulated gambling" tanımı
kumarhane oyunlarının taklididir: slot makinesi, poker, rulet, zar, bahis; oyuncunun bir şeyi
ortaya koyup kaybedebildiği şans oyunları. Fossil Odds'ta:
- Bahis ya da ortaya konan bir şey yok: her kırılan blok **mutlaka** bir fosil verir; şans
  yalnızca hangi fosilin geldiğini belirler (koleksiyon oyunlarındaki nadirlik gibi).
- Oyun içi para (toz) şansa yatırılmaz, kaybedilmez; yalnızca geliştirmelere harcanır.
- Kumarhane mekaniği, kart, makara, çark yok. Gerçek parayla hiçbir şey satın alınamaz,
  çıkan hiçbir şey paraya ya da başka bir değere çevrilemez.
- Ekrandaki "1 in 1,000,000" yazıları olasılığı **şeffaf göstermek** içindir (hatta yazılı
  oranlar ve "şans serisi" kuralı oyunda anlatılır); bu bir şans oyunu değil, adil bilgi.

Bu yüzden **None**. İnceleme notuna da kısaca yazıldı. Sparkrise ve Fossil Odds'ta başka
"None" dışı cevap yok: **4+** beklenir.

## 7. Kids kategorisi: SEÇME

- **Made for Kids = No**, kategori Kids değil. Kids kategorisi (Kılavuz 1.3) üçüncü taraf
  analitik ve reklamı neredeyse tamamen yasaklar, dış bağlantılar ve satın almalar için ebeveyn
  kapısı ister. İleride AdMob gelecek; Kids'e girmek sonra çıkmayı da zorlaştırır.
- Oyunlar 4+/9+ olsa da bu "çocuklara yönelik" demek değildir; mağaza metinlerinde "çocuklar
  için" gibi ifadeler yok, böyle kalsın.

## 8. App Privacy (Uygulama Gizliliği) cevapları

App Store Connect → uygulama → **App Privacy** → Get Started:

- **Privacy Policy URL:** `https://oyunlar.carsihani.me/gizlilik/<slug>/` (her iki dilde de
  aynı sayfa, önce Türkçe sonra İngilizce).
- "Do you or your third-party partners collect data from this app?" → **No, we do not collect
  data from this app** → sonuç: **Data Not Collected**.

**Neden "Data Not Collected" (bu sürüm için):**
- Apple'ın tanımına göre "toplamak", veriyi cihazdan çıkarıp **senin ya da ortaklarının**
  isteği karşılamaktan daha uzun süre erişebileceği şekilde göndermektir. Oyunun sunucusu yok;
  kayıtlar cihazda (WebView local storage) kalır; analitik, reklam, çökme raporu SDK'sı yok.
- Online sıralama **Apple'ın kendi hizmeti Game Center**'dır (GameKit). Skor ve takma ad
  Apple'a gider, Apple saklar ve gösterir; geliştiricinin sunucusuna ya da üçüncü bir tarafa
  hiçbir şey gelmez. Apple'ın kendi topladığı veri, geliştiricinin "topladığı" veri sayılmaz.
- Doğum yılı sorusu: yıl hiçbir yere gitmez ve saklanmaz; cihazda yalnızca "13+ / değil"
  kategorisi kalır.
- Gizlilik bildirimi (`PrivacyInfo.xcprivacy`): izleme yok, toplanan veri türü yok, gerekçeli
  API yok; App Privacy cevabıyla tutarlı.
- **Dikkat:** Play'de Veri güvenliği formu "Kullanıcı kimlikleri + Diğer işlemler" diyor, çünkü
  Google Play Games oyun adına Google'a veri gönderiyor ve Google bunu geliştiricinin beyanı
  sayıyor. Apple'da Game Center Apple'ın kendisi olduğu için durum farklı. Formu doldururken
  Apple'ın ekrandaki güncel açıklamasını oku; "Apple'ın hizmetleri tarafından toplanan veri"
  için beyan isteniyorsa en temkinli seçenek: **User ID** + **Gameplay Content**, "Linked to
  the user", amaç **App Functionality**, izleme **No**.
- **ATT (App Tracking Transparency) sorusu gösterilmez**; izleme yok, reklam kimliği okunmaz.

## 9. Şifreleme (Export Compliance)

- `tools/ipa.mjs` Info.plist'e `ITSAppUsesNonExemptEncryption = NO` yazar ve derlemeden sonra
  kontrol eder. Bu yüzden App Store Connect her derlemede şifreleme sorusunu **sormaz**.
- Yine de sorulursa: "Does your app use encryption?" → yalnızca işletim sisteminin standart
  HTTPS'i (Game Center bağlantısı) → muaf: **None of the algorithms mentioned above** / "No".
  Fransa için ayrı şifreleme beyanı gerekmez.

## 10. Sürüm sayfası (iOS App 1.0.0)

Metinler `store/<slug>/appstore/metadata/<en-US|tr>/`; dosya → alan eşlemesi:

| Dosya | App Store Connect alanı | Sınır |
|---|---|---|
| `name.txt` | Name (App Information) | 30 |
| `subtitle.txt` | Subtitle | 30 |
| `keywords.txt` | Keywords (virgülle, boşluksuz) | 100 |
| `promotional_text.txt` | Promotional Text (onaysız değişebilir) | 170 |
| `description.txt` | Description | 4000 |
| `release_notes.txt` | What's New | 4000 |
| `support_url.txt` | Support URL | |
| `privacy_url.txt` | Privacy Policy URL (App Privacy) | |
| `../copyright.txt` | Copyright | |
| `../primary_category.txt`, `../primary_first_sub_category.txt`, `../secondary_category.txt` | Category | |

- **İlk sürümde "What's New" alanı yoktur**; `release_notes.txt` 1.0.1'den itibaren kullanılır.
  fastlane `deliver` ile yüklerken ilk sürümde `release_notes` atlanmalı (yoksa API "bu alan
  düzenlenemez" hatası verebilir).
- **Ekran görüntüleri:** `store/<slug>/appstore/screenshots/<en-US|tr>/1.png…8.png`, 1320×2868
  (iPhone 6.9" boyutu; Apple küçük iPhone'lar için kendisi ölçekler). iPad görüntüsü gerekmez
  (yalnızca iPhone). Uygulama önizleme videosu isteğe bağlı; yoksa koyma.
- **Build:** TestFlight'tan geçen derlemeyi seç (bölüm 11).
- **Game Center:** kutuyu işaretle, tabloları ekle (bölüm 5).
- **App Review Information:**
  - **Sign-in required: kapalı** (oyunda hesap yok; Game Center inceleyicinin kendi Apple
    hesabıyla çalışır, demo hesap gerekmez).
  - İletişim: ad, soyad, telefon (+90…), e-posta: inceleyici sorun olursa buraya yazar.
  - **Notes** (aşağıdaki metni oyuna göre kopyala).
- **Version Release:** "Manually release this version" seç; onaydan sonra sen yayımlarsın.

### İnceleme notu (Notes kutusuna yapıştır)

Fossil Odds için:

```
Thank you for reviewing Fossil Odds.

- The whole game is bundled in the app and plays offline. There are no accounts, no logins and no in-app purchases. Progress is saved on the device only.
- Optional online ranking uses Game Center: main menu > Ranks tab > globe button (top right). Before anything goes online the game asks once for the player's year of birth (a neutral list). Under 13: online ranking is switched off on that install and Game Center is never started. 13 or over: Game Center starts and shows Apple's own sign-in if the device is not signed in. Scores go only to Game Center. The rest of the game needs no sign-in. To see the age question again, delete and reinstall the app.
- Buttons marked as rewards (for example "Double dust (ad)" after time away, and the luck boost) give their reward straight away in this version: no ads are shown and there is no ad SDK in the app.
- The odds printed on fossils (for example "1 in 1,000,000") only show how rare a find is. Nothing is wagered or can be lost, every block always gives a fossil, and nothing can be bought with real money, so there is no simulated gambling.
```

Sparkrise için:

```
Thank you for reviewing Sparkrise.

- The whole game is bundled in the app and plays offline. There are no accounts, no logins and no in-app purchases. Progress is saved on the device only. Gems are earned in play and only unlock cosmetic trails.
- Controls: hold anywhere to fly right, let go to fly left. A tap after a crash restarts the level.
- Optional online ranking uses Game Center: Ranks screen > globe button (top right). Before anything goes online the game asks once for the player's year of birth (a neutral list). Under 13: online ranking is switched off on that install and Game Center is never started. 13 or over: Game Center starts and shows Apple's own sign-in if the device is not signed in. Scores go only to Game Center. The rest of the game needs no sign-in. To see the age question again, delete and reinstall the app.
- Buttons marked as rewards give their reward straight away in this version: no ads are shown and there is no ad SDK in the app.
```

Noodle Archers için:

```
Thank you for reviewing Noodle Archers.

- The whole game (3D, rendered with WebGL) is bundled in the app and plays offline. There are no accounts, no logins and no in-app purchases. Progress is saved on the device only. Coins are earned in play.
- Controls: drag anywhere to aim, release to shoot.
- Optional online ranking uses Game Center: Title screen > Ranks > globe button (top right). Before anything goes online the game asks once for the player's year of birth (a neutral list). Under 13: online ranking is switched off on that install and Game Center is never started. 13 or over: Game Center starts and shows Apple's own sign-in if the device is not signed in. Scores go only to Game Center. The rest of the game needs no sign-in. To see the age question again, delete and reinstall the app.
- Optional buttons marked "▶ AD" (one more card on the card pick; revive and double coins on the result screen; turning the wooden chest of the 4-hour timer into a silver one; extra coins in the Shop, at most 3 a day) play a Google AdMob rewarded ad only when tapped. There are no real-money purchases. Every ad request is child-directed (TFCD, TFUA, max rating G, non-personalised); no App Tracking Transparency prompt and no IDFA. There are no other ads.
- Violence is cartoon style: wobbly ragdoll archers are knocked off floating islands, with no blood.
```

> Göndermeden önce notlardaki yolu (main menu > Ranks tab > globe) gerçek derlemede bir kez
> izleyerek doğrula; menü değişmişse notu düzelt. Fossil'deki "(ad)" etiketi kaldırıldıysa o
> örneği nottan sil.

## 11. TestFlight: incelemeden önce kendi iPhone'unda dene

1. Derlemeyi yükle (`node tools/ipa.mjs <slug> --upload`, carsi-hani iş akışıyla). Önce
   `node store/tools/appstore-validate.mjs <slug>` ve `ios-dene.yml` (imzasız derleme) geçmeli.
2. App Store Connect → uygulama → **TestFlight** → derleme "Processing"den çıkınca **Internal
   Testing** grubu oluştur, kendini ekle (iç test Apple incelemesi gerektirmez, 100 kişiye kadar).
3. iPhone'a **TestFlight** uygulamasını kur, davetle oyunu indir. Kontrol listesi:
   - [ ] Uçak modunda açılıyor ve baştan sona oynanıyor (internet yok).
   - [ ] İlk açılış, ana menü, her ekran; çökme yok, boş/yarım ekran yok, "yakında" yazısı yok.
   - [ ] Çentik/Dynamic Island ve alttaki çizgi düğmeleri kapatmıyor; mümkünse küçük bir iPhone'da
         (SE) ve büyük bir iPhone'da (Pro Max) dene.
   - [ ] Uygulamayı kapat-aç: ilerleme duruyor. Arka plana at-geri gel: ses ve oyun düzgün.
   - [ ] Sessiz anahtarı ve ses ayarı.
   - [ ] Ödül düğmeleri ödülü hemen veriyor, reklam yok.
   - [ ] Online: yaş sorusunda 13'ten küçük bir yıl → online kapanıyor, Game Center açılmıyor.
         Uygulamayı silip yeniden kur → 13+ yıl → Game Center girişi → skor gönderiliyor → küre
         panelinde sıra görünüyor → Apple'ın tablo ekranı açılıyor.
   - [ ] Game Center'a giriş yapılmamış bir cihazda (ya da girişi iptal ederek) oyun kilitlenmiyor,
         panel "tekrar dene" mesajını gösteriyor.
   - [ ] Noodle Archers: eski bir iPhone'da 3D akıcı, ısınma/çökme yok.
4. Sorun yoksa sürüm sayfasında bu derlemeyi seç → **Add for Review** → **Submit**.
5. **Öneri:** Üç oyunu aynı gün göndermek yerine **önce birini** (ör. Sparkrise) gönder; onay
   gelince ötekileri. İlk reddin sebebi ötekilerde de düzeltilmiş olur.

## 12. Bu tür oyunlarda sık reddedilme sebepleri ve bizdeki durum

| Kılavuz | Sebep | Bizde |
|---|---|---|
| **2.1** App Completeness | Çökme, boş ekran, çalışmayan düğme, bağlanmamış Game Center tablosu, eksik demo bilgisi | TestFlight listesi (bölüm 11). Tabloları sürüme bağla (bölüm 5). Hesap yok, demo hesap gerekmez; online yolu notta. Fossil'deki "(ad)" etiketi için bölüm 0. |
| **2.3 / 2.3.7** Doğru metadata | Ekran görüntüleri oyunu göstermiyor; ad/alt başlıkta fiyat, "en iyi", "#1" | Görüntüler gerçek oyun karelerinden (`store/<slug>/appstore/screenshots`). Doğrulayıcı fiyat, "#1", "best game", "free" ve yer tutucuları yakalar. |
| **2.3.10** Başka platformdan söz | Metinde ya da uygulamada "Android", "Google Play", "Play Games" | App Store metinlerinde yok (doğrulayıcı "Android", "Google", "Play Store", "Google Play", "Play Games" arar). Oyun içinde online panel iOS'ta Game Center metnini gösterir (`signInTextGc`). Gizlilik sayfası iki platformu da anlatır: bu bir politika belgesi, sorun değil. |
| **4.2** Minimum işlevsellik (web sarmalayıcı) | Bir web sitesini uygulama gibi paketlemek | Bizimki bir site değil: oyunun bütün dosyaları uygulamanın içinde, internetsiz çalışır (`tools/ipa.mjs` paketi tarar, dış URL varsa derlemeyi durdurur); uzaktan kod indirilmez (2.5.2). Game Center yerel GameKit köprüsüyle (`GameCenterPlugin.swift`) Apple'ın kendi tablo ekranını açar. Tam ekran, dikey, durum çubuğu gizli; her oyunda onlarca bölüm/katman, rütbeler, rekorlar. **Titreşim (haptics):** oyun kodu titreşim çağırır ama iOS projesine `@capacitor/haptics` eklenmedi, yani şu an titreşim **yok**; eklenirse "yerel his" güçlenir (isteğe bağlı, oyun/araç işi). |
| **4.3** Spam / benzer uygulamalar | Aynı geliştiriciden aynı şablonla çok sayıda benzer uygulama | Üç oyun farklı tür (kazı-koleksiyon, tek dokunuş refleks, 3D okçuluk), farklı simge, görsel ve metin. Aynı oyunun kopya sürümlerini (ör. "Lite", farklı tema) ayrı uygulama olarak gönderme. Ortak motor sorun değil. |
| **5.1.1** Gizlilik | Uygulama içinde gizlilik bağlantısı yok; gereksiz veri istemek; yaş sorusunun amacı belirsiz | Politika URL'si hazır ve iPhone'u kapsıyor. **Uygulama içi bağlantı eksik (bölüm 0).** Doğum yılı saklanmaz, yalnızca 13+ kategorisi; amacı panelde ve politikada açık. Hesap olmadığı için hesap silme (5.1.1(v)) gerekmez. |
| **5.1.2** Veri kullanımı/izleme | İzleme izni olmadan reklam kimliği | Reklam kimliği okunmaz, ATT yok (reklamlar gelince değişir). |
| **3.1.1** Uygulama içi satın alma | Dijital içeriği Apple dışı ödemeyle satmak | Satın alma **yok**. Elmas/toz/altın yalnızca oynayarak kazanılır, gerçek parayla alınamaz. Metinlerde "shop"/"buy" yalnızca oyun içi parayla. |
| **1.5** Geliştirici bilgisi | Destek URL'sinde iletişim yok | **Bölüm 0, madde 1**: `CONTACT` doldurulmalı. |
| **2.3.6** Yaş derecesi | Eksik beyan (ör. şiddeti "None" demek) | Noodle Archers için çizgi film şiddeti "Frequent/Intense" (bölüm 6). |
| **Game Center** | Oyunu oynamak için girişe zorlamak | Giriş yalnızca isteğe bağlı online sıralama için; oyunun geri kalanı girişsiz. |

Reddedilirse: Resolution Center'daki mesajı oku, istenen düzeltmeyi yap ya da (yanlış anlama
varsa) nazikçe açıklayarak yanıtla; aynı derlemeyi açıklamayla yeniden gönderebilirsin.

---

## Reklamlar eklenince (AdMob)

Reklam SDK'sı eklendiği sürüm **göndermeden önce** şunlar değişmeli:

1. **App Privacy (Uygulama Gizliliği):** "Data Not Collected" artık doğru değil. AdMob en az
   şunları toplar: **Identifiers → Device ID** (IDFA, izin verilirse), **Usage Data → Product
   Interaction / Advertising Data**, **Diagnostics**, kaba **konum** (IP'den), amaç
   **Third-Party Advertising** (+ Analytics). Google'ın güncel "AdMob iOS veri beyanı" sayfasına
   bakarak doldur; izleme varsa "Used to Track You" bölümü de dolar.
2. **ATT kararı:** Kişiselleştirilmiş reklam (IDFA) istenirse `NSUserTrackingUsageDescription`
   metni + App Tracking Transparency izni zorunlu; izin istenmeden IDFA okunamaz. İstenmezse
   yalnızca kişiselleştirilmemiş reklam göster ve ATT sorma. Bu karar App Privacy'deki "tracking"
   cevabını belirler.
3. **SKAdNetwork:** Info.plist'e Google'ın ve kullanılan aracı ağların `SKAdNetworkItems`
   kimlikleri eklenmeli (`tools/ipa.mjs` yamaları). Privacy manifest'e AdMob SDK'sının kendi
   manifesti gelir; uygulamanınki (`NSPrivacyTracking`, `NSPrivacyTrackingDomains`) yeniden
   gözden geçirilmeli.
4. **Onay (UMP):** AB/BK/İsviçre için Google'ın User Messaging Platform onay formu (GDPR) ve ABD
   eyalet gizlilik mesajları; ATT ile birlikte doğru sırada gösterilmeli.
5. **Yaş derecelendirmesi:** "Advertising" sorusu **Yes** olur; reklam içeriği yaş sınırına
   uygun olmalı (AdMob'da içerik derecesi G/PG, hassas kategoriler kapalı). 4+/9+ oyunlarda
   yetişkin reklam çıkarsa reddedilme sebebi.
6. **Çocuk kitlesine dikkat:** Kids kategorisinde değiliz, ama oyunlar küçük yaşta oyunculara da
   hitap ediyor ve Play'de "tüm yaşlar" (Families) seçili. 13 yaş altı olabilecek oyunculara
   kişiselleştirilmiş reklam gösterme (AdMob'da "tag for child directed treatment"/"under age of
   consent" ayarları, oyunun yaş cevabını kullanarak); Apple'da da aynı temkinli davranış.
7. **Gizlilik politikası:** `tools/gizlilik.mjs` metni (Analitik ve reklam, Paylaşım, Değişiklikler
   bölümleri) güncellenip yayımlanmalı; Play'deki Veri güvenliği formu da birlikte değişir.
8. **Metinler ve inceleme notu:** "no ads are shown" cümleleri (`release_notes.txt`, inceleme
   notu, mağaza metinleri) kaldırılmalı; ödül düğmeleri gerçekten reklam göstermeli ve reklam
   yüklenemezse düğme anlaşılır biçimde davranmalı.
