# Okçu: silahlar, gelişim ve yeni ana menü (tasarım)

Tarih: 2026-11-20 · Oyun: Sallanan Okçular / Noodle Archers, yalnızca 3D sürüm (`apps/okcu-3d` +
paylaşılan simülasyon `games/okcu/src/sim`, `difficulty: 'hard'`). 2D sürüm kullanılmıyor; ona
dokunulmaz (yalnızca paylaşılan kodun derlenmesi ve testlerinin geçmesi gerekir).

## 1. Neden

Sahibinin sözleriyle: oyun "çok standart oynanıyor, bir yerden sonra bayıyor", oyuncuya
"gelişim yaptım, daha güçlüyüm hissi vermiyor". Bugün kalıcı gelişim dört küçük yükseltme
(can, altın, kart yenileme, başlangıç kartı) ve demircideki yay seviyesinden (+0…+25, şanslı
deneme) ibaret; tek silah yay, çeşitlilik yalnızca koşu içi kartlardan geliyor; görünümler
satın alınmıyor, dalga/koşu sayısıyla açılıyor.

Hedef: oyuncu (1) **farklı oynanan silahlar** toplayıp seçebilsin, (2) her yükseltmede
**güçlendiğini açıkça görsün ve hissetsin**, (3) bunların hepsine referans oyunlardaki gibi
(sekme çubuklu, kaynak çubuklu, ortada canlı sahne, kocaman Oyna) **yeni bir ana menüden**
ulaşsın.

## 2. Hedefler, hedef olmayanlar, kaçınılacaklar

**Hedefler**
- 6 silah, her biri gerçekten farklı oynanır (atış eğrisi, hız, isabet davranışı).
- Silah seviyeleri (garantili yükseltme), sandıklar, güç numarası, mağaza.
- Eski bölümlere dönen oyuncu farkı hisseder (düşmanlar belirgin biçimde daha çabuk düşer).
- Referans düzeninde yeni ana menü: üstte kaynak çubuğu, yanlarda sayaçlı/rozetli düğmeler,
  ortada canlı 3D sahne, büyük Oyna, altta 5 sekme.
- Daha geniş ve daha çeşitli haritalar (bölüm 7).
- Sonra aynı menü kalıbı Fosil ve Kıvılcım'a (bölüm 9).

**Hedef olmayanlar**
- Gerçek parayla satış yok: yalnızca oyun içi altın + isteğe bağlı ödüllü reklam (sahibinin kararı).
- Çok oyunculu / klan yok.
- Kıvılcım'a animasyon/efekt işi bu belgenin konusu değil (ayrı proje, sonra).

**Kaçınılacaklar (çalışsa bile başarısızlık sayılır)**
- Reklam izlemeden ilerlenemiyor hissi: reklam her zaman hızlandırıcı, asla zorunlu değil.
- Gerçekçi ateşli silah: "tüm yaşlar" hedef kitlesi ve çocuklara yönelik reklam ayarı var;
  tüfek yerine çizgi film tarzı fişek atar (bkz. 4).
- Bir silahın açıkça en iyi olup diğerlerini anlamsızlaştırması.
- Mevcut kayıtların bozulması ya da oyuncunun kazandıklarını kaybetmesi.
- Duvar: bir bölümün yalnızca saatlerce altın biriktirerek geçilebilmesi.

## 3. Kısıtlar

- Simülasyon saf ve deterministik kalır (tohumlu rng); tüm yeni davranış `games/okcu/src/sim`
  içinde, görüntü `apps/okcu-3d` içinde. Mevcut testler geçmeli; denge otomatik oyuncu
  (`aimbot.ts` `playRun`) koşularıyla ölçülür.
- Reklamlar: mevcut `ui.rewarded(placement)` yolu (AdMob ödüllü, çocuğa yönelik ayarlar).
  Yeni yerleşimler (placement adları) eklenir; başka reklam türü yok.
- Kayıt: `SaveData`'ya eklenen alanlar aynı sürümde `repairSave` ile doldurulur; mevcut yay
  seviyesi yeni sisteme kayıpsız taşınır (bkz. 5.2).
- Sandıklar gerçek parayla alınamaz; yine de içerik olasılıkları sandık ekranında yazılı
  gösterilir (demircinin "şans yazıldığı gibi" ilkesiyle aynı).
- Telefon dikey, 360×640 … 1080×2400, güvenli alanlar; TR + EN metinler.
- Play/App Store mağaza görüntüleri (`store/okcu/listing.config.mjs`) yeni menüyle yeniden
  çekilir; mağaza botunun kullandığı test kimlikleri korunur ya da güncellenir.

## 4. Yaklaşımlar

| | Ne | Artı | Eksi |
|---|---|---|---|
| **A (seçildi)** | Her silah simülasyonda ayrı bir atış biçimi + kalıcı seviye/sandık/güç sistemi + sekmeli menü | "Standart oynanış" sorununu doğrudan çözer: yeni silah = yeni oyun | En büyük iş; her silah için denge |
| B | Tek yay; "silahlar" yalnızca görünüş + sayı farkı | Hızlı, az risk | Oynanış yine aynı; sıkıntı geri döner |
| (elendi) | Silahları koşu içi kartlara gömmek | — | Kalıcı gelişim hissi vermez, bugünkü sorunun kendisi |

Sahibi **A**'yı seçti.

## 5. Silahlar ve gelişim (simülasyon + kayıt)

### 5.1 Silah listesi

Oyuncu koşudan önce bir silah seçer (Silahlar sekmesi); koşu boyunca o silahla oynar. Atış
kontrolü aynı kalır (geri çek, bırak), değişen mermi davranışı ve tempo. Değerler başlangıç
önerisidir; son sayılar denge testleriyle oturtulur.

| Silah | Nasıl oynanır | Güçlü | Zayıf | Açılış |
|---|---|---|---|---|
| **Yay** (var olan) | Bugünkü ok | Dengeli, kafa vuruşu | — | Başta |
| **Arbalet** | Çok hızlı, neredeyse düz uçan cıvata; yerçekimi az | Uzak ve hareketli hedef, rüzgârdan az etkilenir | Yeniden kurma yayın ~1,6 katı | Bölüm 1 bossu |
| **Mızrak** | Ağır, yavaş, kısa menzil; büyük itme (ragdoll uçar), 1 düşman deler | Kalkanlı/zırhlı düşman, uçurumdan düşürme | Menzil ve hız | Bölüm 2 bossu |
| **Bumerang** | Kavis çizip oyuncuya geri döner, gidiş+dönüşte vurur | Aynı hatta duran 2 düşman, örtü arkası | Tek vuruş hasarı düşük | Bölüm 3 bossu |
| **Sapan** | Çakıl; zemin/duvar/kalkandan 2 kez seker | Sekme açılarıyla örtü arkası | Hasar düşük, kafa çarpanı yok | Sandıktan parça (bölüm 2'den), en geç bölüm 5 bossu |
| **Fişek Atar** (tüfek yerine) | Karton tüp, renkli fişek; kısa süre düz gider sonra patlar (alan hasarı, konfeti) | Kalabalık, büyücü/şifacı grupları | En uzun yeniden kurma, yakın patlama oyuncuya zarar vermez ama zayıf | Bölüm 4 bossu |

- Bölüm 6 (gökyüzü) bossu: her silah için özel "göksel" görünüm (yalnızca görünüş) + Boss sandığı. *(kurucu kararı)*
- Koşu içi kartlar her silahla bir şey yapmalı: her kart için silah başına etki tablosu
  yazılır; anlamsız kalan kart o silahla teklif edilmez (kart havuzu silaha göre süzülür).
- Yeni silahlar mevcut `Arrow` havuzunu genişletir (yeni `kind` değerleri + silaha özel
  alanlar); ayrı bir mermi sistemi kurulmaz.
- Görüntü: her silahın kendi modeli/ çizimi, atış animasyonu (arbalet geri tepme, mızrak
  fırlatma kol hareketi, bumerang dönme izi, sapan lastiği, fişek dumanı ve konfeti).

### 5.2 Seviye ve güç

- Her silahın seviyesi var: **1 … 20**. Seviye atlatmak = **o silahın parçası + altın**,
  garantili (şans yok). Örn. 2. seviye 2 parça + 50 altın; maliyet seviyeyle büyür.
- Hasar çarpanı seviyeyle: **ortak silah eğrisi** `weaponDamage(seviye)`, seviye 1 = 1,00,
  seviye 20 = 2,30 (bugünkü yayın +25 tavanı). Eğri bugünkü `bowDamage`'ı +0…+25 aralığında
  20 seviyeye gerer; `hard`'daki `HARD_BOW_POW` üssü aynen uygulanır. Böylece bölüm 5–6'nın
  düşman canı (+25 yaya göre ayarlı, `HARD_LATE_*`) yeniden dengelenmez. *(kurucu kararı)*
  Her seviye ayrıca küçük bir silaha özel özellik açar (örn. 5'te arbalet +1 deler, 10'da
  bumerang dönüşte hızlanır) → seviyeler sadece sayı değil.
- **Demirci → yay**: bugünkü yay seviyesi, **hasarı eşit ya da büyük** olan en küçük yay
  seviyesine çevrilir (`weaponDamage(L) ≥ bowDamage(+N)`), yani kimse güç kaybetmez; +25 → 20.
  Şanslı demirci ve "ısı" kaldırılır. Demirciye harcanmış altın iade edilmez; taşınan seviye
  telafi sayılır. *(kurucu kararı)*
- **Güç numarası** = seçili silahın seviyesi, can yükseltmesi ve diğer kalıcı
  yükseltmelerden hesaplanan tek sayı. Menüde okçunun üstünde ve bölüm kartında görünür.
  Yükseltmede sayı sayarak büyür, okçu kısa bir güç pozu verir, silah parlar.
- **Önerilen güç**: her bölüm kartında "Önerilen güç N". Oyuncunun gücü yüksekse kart yeşil
  ("Kolay"), düşükse turuncu. Bu, eski bölüme dönünce güçlenmenin görünür kanıtı.
- **Rütbe puanı**: bugün yay seviyesi başına 80 puan. Yerine **en yüksek silah seviyesinin
  yay eşdeğeri** × 80 + açılmış her ek silah için küçük bir puan; taşınan kayıtta toplam
  puan asla düşmez (gerekirse taşıma anında bugünkü puan taban olarak saklanır).
  `forge5…forge25` başarımları "bir silahı 5/10/…/20. seviyeye çıkar"a dönüşür; kazanılmış
  olanlar kazanılmış kalır. *(kurucu kararı)*
- Zorluk: `hard` düşman canı bugün yay seviyesini izliyor; artık **seçili silahın seviyesini**
  izler, böylece herhangi bir silahı güçlendirmek eski bölümleri kolaylaştırır.

### 5.3 Sandıklar

- Türler: **Tahta, Gümüş, Altın, Boss**. İçerik: altın + 1–3 silah parçası (+ ileride
  görünüm). Her sandık ekranı olasılıkları yazar.
- Nereden:
  - Koşu sonu: ulaşılan dalgaya göre bir sandık (çoğunlukla tahta, ilerledikçe gümüş).
  - Boss: ilk yenişte Boss sandığı (o bölümün silahını açar).
  - **Ücretsiz reklam sandığı**: menünün yan düğmesinde, 4 saatte bir dolar (sayaçlı).
    Reklam izle → gümüş sandık. Reklamsız da 4 saatte bir tahta sandık açılabilir (reklam
    yalnızca sandığı yükseltir).
  - Günlük meydan okuma (bugün var olan, `dailyStreak`): hedefi tutturunca bugünkü altın ödülü
    yerine **altın sandık**. Yeni bir görev sistemi kurulmaz. *(kurucu kararı)*
- Sandık açılışı: sandık sallanır, kapak fırlar, parçalar tek tek kartlara uçar; yeni silah
  açılınca tam ekran tanıtım.

### 5.4 Mağaza

- **Günlük teklifler**: 3 slot, her gün yenilenir; altınla belirli silahın parçaları.
- **Sandıklar**: altınla gümüş/altın sandık.
- **Görünümler**: mevcut açılma koşulları kalır; ayrıca açılmamış bazı görünümler altınla
  alınabilir (koşulu karşılayana bedava açılır).
- **Ödüllü reklam teklifleri**: "Reklam izle: +X altın" günde en çok 3 kez; reklamsız alternatif
  her zaman var.
- Bugünkü 4 yükseltme (can, altın, yenileme, başlangıç) mağazaya değil **Silahlar sekmesindeki
  "Okçu" kartına** taşınır (karakter gelişimi tek yerde).

## 6. Yeni ana menü (Okçu)

```
┌─────────────────────────────────┐
│ [rütbe·güç 450] [🪙 1840 +] [⚙] │ üst çubuk (güvenli alan)
│ [🎁 3:12]                [📅 !] │ yan düğmeler: reklam sandığı sayacı, günlük
│                                 │
│   canlı 3D sahne: ada, okçu     │ seçili silahı tutan okçu, boşta animasyon;
│   seçili silahla poz verir      │ dokununca silahını gösterir
│                                 │
│   [‹ BÖLÜM 4 · Gece  önerilen 520 ›]  bölüm kartı (yeşil/turuncu)
│   [        OYNA        ]        │
├──────┬──────┬───────┬──────┬────┤
│Mağaza│Silah │  Ana  │Rütbe │Etk.│ alt sekmeler; ortadaki büyük ve vurgulu
└──────┴──────┴───────┴──────┴────┘
```

- Sekmeler: **Mağaza · Silahlar · Ana Sayfa · Rütbeler · Etkinlikler** (günlük meydan
  okuma + günlük seri + gelecekte etkinlikler). Sekmeler arası yatay kaydırma ve dokunma;
  rozetler (kırmızı "!" ve sayılar) alınabilir/yükseltilebilir bir şey olduğunda.
- **Silahlar sekmesi**: silah kartları ızgarası (seviye, parça çubuğu "7/10", kilitli olanlar
  silüet + nasıl açılır). Karta dokun → büyük silah görünümü, istatistikler, "Seç",
  "Yükselt". Üstte "Okçu" kartı: 4 kalıcı yükseltme + görünümler.
- Bugünkü sallanan tabela, bölüm seçici, Oyna ve "hazır" durumu korunur ama bu düzene
  yerleşir; az önce eklenen alt madalyon çubuğu sekme çubuğuna dönüşür.
- Hareket: sekme geçişlerinde kayma, düğmelerde basma/yaylanma, rozetlerde nabız, sandık
  sayacı dolunca parlama, yükseltmede güç sayısının sayması.

## 7. Daha geniş haritalar ve çeşitli oynanış

- Alan genişlemesi (`fieldSpan`) bugün bölüm 4'te başlıyor (1,15; bölüm 6 ve sonsuz 1,22).
  Yeni değerler: bölüm 1: 1,0 · 2: 1,05 · 3: 1,1 · 4: 1,15 · 5: 1,2 · 6: 1,25 · sonsuz: 1,3;
  kamera buna göre geri çekilir. Hiçbir bölüm bugünkünden dar olmaz. *(kurucu kararı)*
- Her bölüme o bölümde açılan silahı öne çıkaran sahne öğeleri:
  - zırhlı düşmanlar (mızrakla çok daha kolay), uzak hareketli adalar (arbalet),
    örtü arkasında hizalı düşmanlar (bumerang/sapan), kalabalık şifacı grupları (fişek).
  - Hiçbir aşama tek bir silah olmadan geçilemez olmamalı (yayla her şey hâlâ geçilebilir).
- Aşama değiştiricileri: alçak tavan (yüksek atış yok), sis (uzak düşman geç görünür),
  hareketli ana platform. Bölüm başına 1–2 aşamada, rastgele değil tasarımla.
- Sonsuz modda havuzlara yeni öğeler eklenir.

## 7b. Mevcut oyuncuların kaydı

- Yenilmiş her boss (`save.bosses[c] > 0`), o bölümün silahını **hemen açar**; eski bossları
  yeniden yenmek gerekmez. Geriye dönük Boss sandığı verilmez; bunun yerine güncellemede bir
  kez "Hoş geldin" altın sandığı. *(kurucu kararı)*
- Seçili silah: yay.

## 8. Denge ve doğrulama

- Otomatik oyuncu her silahı kullanabilmeli (`aimbot` silaha göre nişan alır).
- Ölçütler: yeni oyuncu (seviye 1 yay, yükseltme yok) bölüm 1'i dikkatli oyuncuyla geçer;
  aynı oyuncu seviye 10 silahla bölüm 1'i belirgin hızla (atış sayısı ≥ %40 az) geçer;
  hiçbir silahın bölüm 1–4 ortalama ilerlemesi diğerlerinin ortalamasından %25'ten fazla
  sapmaz.
- Ekonomi simülasyonu: ortalama koşu başına altın + sandık parçalarıyla, ödüllü reklam
  izlemeyen oyuncunun bir silahı 10. seviyeye çıkarması ~3–4 saatlik oyun; reklam izleyen
  ~%30 daha hızlı (reklam hızlandırır, kapı değildir).
- Kayıt taşıma testleri: eski kayıt (yay +N, altın, görünüm, rekorlar) yeni sisteme kayıpsız.

## 9. Fosil ve Kıvılcım'a aynı menü kalıbı (Okçu bittikten sonra)

Okçu menüsü beğenildikten sonra, her oyun için kendi dünyasında, aynı iskelet: üst kaynak
çubuğu, yan sayaçlı düğmeler, ortada canlı sahne, büyük Oyna, alt sekmeler. Sekmeler o
oyunun gerçek bölümlerinden oluşur (boş sekme yok):
- Fosil: Müze · Ana Sayfa · Rütbeler (+ varsa günlük).
- Kıvılcım: Görünümler (mağaza) · Bölümler · Ana Sayfa · Rütbeler · Günlük.
Bunlar kendi kısa tasarımlarıyla ayrı ayrı yapılır; bu belge Okçu'yu kapsar.

## 10. Sıra

1. Simülasyon: silah altyapısı + 5 yeni silah + kart uyumu + aimbot + denge testleri.
2. Kayıt + gelişim: seviyeler, parçalar, sandıklar, güç, taşıma.
3. Menü kabuğu + Silahlar, Mağaza, Etkinlikler sekmeleri + sandık açılışı.
4. Haritalar ve aşama öğeleri.
5. Mağaza görüntüleri, test APK, Play'e yükleme (incelemedeki sürümler bittikten sonra).

Ara sürüm yok: 1–4 bitene kadar Play'e bu işten parça gitmez (yarım silah sistemi, eski
menüde geçici seçici, özellik bayrakları kurulmaz). Arada sahibine test APK'ları verilir.
Ayrı acil düzeltmeler bu daldan bağımsız gönderilebilir. *(kurucu kararı)*

## 11. Kurucuya bırakılanlar

Tam sayılar (maliyet eğrileri, hasar, yeniden kurma süreleri, sandık olasılıkları), silah
modellerinin çizim ayrıntıları, kart–silah etki tablosunun içeriği, aşama öğelerinin hangi
aşamalara konduğu: hepsi bu belgedeki ilkelere ve 8'deki ölçütlere uyacak biçimde kurucunun
kararı.
