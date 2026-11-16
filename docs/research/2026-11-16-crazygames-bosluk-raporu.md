# CrazyGames → Mobil Mağaza Boşluk Raporu

Tarih: 2026-11-16 · Veri: `docs/research/data/crazygames-2026-11-16.jsonl`

## Özet

CrazyGames'in en çok oy alan oyunlarının çoğu zaten mobilde ya da mobil hitlerin
tarayıcı kopyası. Gerçek boşluk dar: üç analist ~154 mağaza araması yaptı, 38
mekaniği güçlü rakip yüzünden eledi. Kalan 15 mekanikten puanlamaya değer 9'u
aşağıda; ilk parti için üçü seçildi: **anomali avı**, **sınır itmeli bölge savaşı**, **olasılık yazılı
koleksiyon tıklama oyunu**.

## Yöntem

1. **Talep sinyali.** `tools/research/scrape.py` ile CrazyGames'in 201 etiket
   sayfası, "hot / new / updated" listeleri ve bunlardaki 1.636 oyunun ayrıntı
   sayfası okundu: oy sayısı (beğeni + beğenmeme), 10 üzerinden puan, etiketler,
   çıkış tarihi, çok oyunculu mu, sitenin listelediği mağaza bağlantıları.
2. **Aday süzme.** Tek kişilik, 2D yapılabilir, telefonda tek/iki başparmakla
   oynanabilir, puanı ≥ 8,9 olan mekanikler.
3. **Mağaza doğrulama.** `tools/research/store.py` ile ABD App Store (iTunes arama
   API'si: değerlendirme sayısı, puan, açıklama) ve ABD Google Play (indirme
   aralığı, puan) aramaları. Mekanik başına 2–4 farklı sorgu, artı tarayıcı
   oyununun kendi adı.
4. **Sınıflama.** YOK: gerçek karşılık bulunamadı. ZAYIF: karşılıklar var ama
   hepsi iOS'ta < 50 bin değerlendirme / Play'de < 1 M indirme, ya da puanı ≤ 4,0.
   DOYMUŞ: güçlü rakip var.

## Katalog bulguları

- 1.636 oyunun 600'ünde (%37) site bir mağaza bağlantısı listeliyor; 267'si
  "CrazyGames Original".
- En çok oy alan 20 oyunun çoğu çok oyunculu, 3D sürüş ya da nişancı; bunlar
  küçük ekip için uygun değil ve mobilde karşılıkları var.
- "incremental" etiketi öne çıkıyor: 127 oyun, medyan puan 9,1 (büyük etiketlerin
  en yükseği), %72'si 2024 sonrası, %76'sında mağaza bağlantısı yok. Ancak
  bağlantı yokluğu kanıt değil: halka çiftlik, biçme, fırlat-yükselt, ragdoll
  fabrikası gibi alt türler mağazada çoktan kopyalanmış.
- Mobil yayıncılar hızlı kopyalıyor. Tarayıcıda 2025'te çıkıp tutan fikirlerin
  birkaçının mağaza karşılığı 2026'da çıkmış.

## Ayakta kalan mekanikler ve puanları

Puan kartı: talep 25, boşluk 25, telefona uygunluk 15, yapılabilirlik 15,
tutundurma 10, kodla çizilen görsele uygunluk 10. Geçme eşiği 70.

| # | Mekanik | Tarayıcı kanıtı | Mağaza durumu | Puan | Karar |
|---|---|---|---|---|---|
| 1 | Sabit kamera görüntülerinde değişeni fark etme (anomali avı) | Seeing Things 18,4 B oy / 9,3; Pizza Anomalies 9,9 B / 9,3 (2026) | ZAYIF, güven yüksek: en büyük Play rakibi 500 B indirme ve 2,5 puan; iOS'ta en büyük 87 değerlendirme | 80 | **İlk parti** |
| 2 | Gerçek zamanlı sınır itmeli bölge savaşı, botlara karşı | FrontWars.io 342 B / 9,7 (2025); Openfront 473 B / 3,8; Kiomet 93 B / 9,0; World Conquest 11,6 B / 9,2 (tek kişilik) | ZAYIF, güven orta: Territorial.io 5 M+ ama 3,3 puan; diğerleri çok küçük | 80 | **İlk parti** |
| 3 | Her dokunuşta olasılığı üzerinde yazan koleksiyon parçası düşüren tıklama oyunu | Mine Clicker RNG 1,5 B / 9,2 (2026-09) | YOK/ZAYIF, güven orta: en büyük rakip 10 B+ indirme | 74 | **İlk parti** |
| 4 | Sürüyle düşman gruplarını çevreleyip yutma, koşular arası yükseltme | Liquid Swarm 15,5 B / 9,2, 1,23 M oynanma (2026) | Analistler ayrıştı: çevreleme mekaniğinin rakibi yok, ama "kalabalık topla" türü doymuş (1,04 M değerlendirmeli rakip) | 70 | Yedek |
| 5 | Dikdörtgen bloğu devirerek deliğe düşürme | Bloxorz 84,8 B / 8,8 (eski) | ZAYIF: en büyük 1 M+ / 3,9 | 70 | Yedek |
| 6 | Ev işi yarışı + rakibe tuzak kurma | House of Hazards 404 B / 8,9, 15,7 M oynanma | YOK bulundu, güven orta | 68 | Beklemede: iyi bot yapay zekâsına bağlı |
| 7 | İki taraflı kule savunması | DualForce Idle 2 451 oy / 9,3 | YOK, ama talep çok küçük | 62 | Elendi |
| 8 | Portal yerleştirme bulmacası | Portal Escape 55 B / 9,0 | ZAYIF, güven düşük; kontrol telefona uymuyor | 58 | Elendi |
| 9 | Kaçan canavarı oynama | Toximass 4,7 B / 9,2 | ZAYIF, talep kanıtsız, kontrol riskli | 51 | Elendi |

Seçim gerekçesi: ilk üçü hem eşiği geçiyor hem üç farklı kitleye bakıyor (gözlem
bulmacası, strateji, koleksiyon). Üçü de kodla çizilen şekillerle iyi görünür:
kamera sahneleri, renkli harita hücreleri, katman ve fosil kartları.

## Güçlü rakip yüzünden elenenler (seçme)

| Mekanik | Eleyen rakip |
|---|---|
| Popüler cevabı tahmin etme | Aynı oyunun mobil sürümü, 50 M+ indirme |
| Çıkartmayla oda süsleme | 60,9 B ve 309 B iOS değerlendirmeli iki oyun |
| Ragdoll fabrikası | 50 M+ indirme |
| Kazı incremental | 50 M+ indirme |
| Yol ağı tasarlama | 143 B iOS değerlendirmesi |
| Çağ ilerlemeli şerit savaşı | 56,8 B değerlendirme, 10 M+ indirme |
| Aynı cihazda parti dövüşü | 500 M+ indirme |
| Yol çizme, çöp adam dövüşü, tek dokunuş drift, olta atma | Her birinde 100 B+ değerlendirmeli rakip |
| Halka çiftlik, kum fiziği blokları, biçme incremental | 2025–26'da mağazada kopyaları çıkmış |

## Sınırlar

- Mağaza aramaları yalnızca ABD mağazası ve ilk 8–20 sonuçla sınırlı. Başka adla
  satılan bir rakip kaçmış olabilir.
- Play araması uygulama açıklaması döndürmüyor; oradaki eşleşmeler başlık ve
  indirme aralığına dayanıyor.
- Oy sayısı ilgi gösterir; tutunma ya da gelir göstermez.
- 3 numaralı mekaniğin tarayıcı talebi küçük (1,5 B oy). Seçilme nedeni boşluğun
  netliği ve yapım maliyetinin düşüklüğü; en riskli bahis bu.
- 2 numarada oy hacmi çok oyunculu oyunlardan geliyor; tek kişilik talebi yalnızca
  bir oyun gösteriyor. Yakın akraba "düğümler arası asker gönderme" türü doymuş
  (253 B değerlendirmeli rakip); oyun ondan açıkça farklı hissettirmeli.
- İlk web araması tabanlı pazar taraması (CrazyGames'e erişim açılmadan önce)
  başlık düzeyinde doğrulanamadı ve bu raporda kullanılmadı.
