# Backlog: yapılmayan mekanikler

Kaynak: `docs/research/2026-11-16-crazygames-bosluk-raporu.md` (veri: `docs/research/data/crazygames-2026-11-16.jsonl`).
Buradaki her olgu o rapordan alınmıştır; yeni kanıt geldikçe satır eklenir. Puanlar raporun puan kartıyla
verilmiştir (geçme eşiği 70). Rakip sayıları ABD mağaza aramalarına ve ilk 8–20 sonuca dayanır.

İlk parti (yapıldı): anomali avı (`fener`, 80), sınır itmeli bölge savaşı (`murekkep`, 80), olasılık yazılı
koleksiyon tıklama oyunu (`fosil`, 74). Bunlar burada değildir.

Giriş biçimi (yeni girdi eklerken): mekanik · tarayıcı kanıtı · mağaza durumu · puan · neden yapılmadı ·
**geri getirecek kanıt**.

## Yedekler (eşiği geçti, ilk partiye seçilmedi)

| Mekanik | Tarayıcı kanıtı | Mağaza durumu | Puan | Neden yapılmadı | Ne geri getirir |
|---|---|---|---|---|---|
| Sürüyle düşman gruplarını çevreleyip yutma, koşular arası yükseltme | Liquid Swarm: 15,5 B oy, 9,2, 1,23 M oynanma (2026) | Analistler ayrıştı: çevreleme mekaniğinin rakibi yok, ama "kalabalık topla" türü doymuş (1,04 M değerlendirmeli rakip) | 70 | Puan eşikte; tür doymuşluğu riski çözülmemiş | Çevrelemeyi merkez alan bir tasarımın "kalabalık topla" oyunlarından açıkça ayrıştığı gösterilirse ve yeni mağaza aramalarında çevreleme mekaniğinde rakip çıkmazsa |
| Dikdörtgen bloğu devirerek deliğe düşürme | Bloxorz: 84,8 B oy, 8,8 (eski oyun) | ZAYIF: en büyük rakip 1 M+ indirme, 3,9 puan | 70 | Puan eşikte; talep verisi eski bir oyuna dayanıyor | Yeni çıkmış (2025–26) bir tarayıcı oyununda aynı mekaniğin yüksek oy alması ya da mağazada puanı yüksek bir rakibin hâlâ çıkmaması |

## Beklemede

| Mekanik | Tarayıcı kanıtı | Mağaza durumu | Puan | Neden yapılmadı | Ne geri getirir |
|---|---|---|---|---|---|
| Ev işi yarışı + rakibe tuzak kurma | House of Hazards: 404 B oy, 8,9, 15,7 M oynanma | YOK bulundu, güven orta | 68 | Eşiğin altında; oyun iyi bot yapay zekâsına bağlı | Botların rakip gibi hissettireceği bir tasarımın küçük ekiple yapılabilir olduğunun gösterilmesi (yapılabilirlik ve telefona uygunluk puanı yükselir) ve toplam puanın >= 70 olması |

## Elenenler (puan eşiğin altında)

| Mekanik | Tarayıcı kanıtı | Mağaza durumu | Puan | Neden elendi | Ne geri getirir |
|---|---|---|---|---|---|
| İki taraflı kule savunması | DualForce Idle: 2 451 oy, 9,3 | YOK | 62 | Talep çok küçük | Aynı mekanikte çok daha büyük oy sayısına ulaşan bir tarayıcı oyunu |
| Portal yerleştirme bulmacası | Portal Escape: 55 B oy, 9,0 | ZAYIF, güven düşük | 58 | Kontrol telefona uymuyor; boşluk kanıtı zayıf | Dokunmatikte rahat oynanan bir kontrol şeması bulunması ve mağaza aramalarının güveninin yükseltilmesi |
| Kaçan canavarı oynama | Toximass: 4,7 B oy, 9,2 | ZAYIF | 51 | Talep kanıtsız, kontrol riskli | Daha büyük talep kanıtı ve telefonda oynanabilir kontrol |

## Güçlü rakip yüzünden elenenler (seçme liste)

Bunlar puanlanmadı; mağazada güçlü rakip bulunduğu için doğrudan elendi. Yeniden açmak için rakibin artık güçlü
olmadığını gösteren yeni bir mağaza araması gerekir (rakip kaldırılmış, puanı çökmüş ya da indirmesi düşmüş).

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

Rapor ayrıca "incremental" etiketinin öne çıktığını (127 oyun, medyan puan 9,1) ama mağaza bağlantısı yokluğunun
kanıt olmadığını, çünkü bu alt türlerin çoğunun mağazada çoktan kopyalandığını belirtir; yeni bir incremental
fikri bu yüzden mağaza aramasıyla ayrıca doğrulanmadan açılmaz.

## Yeni girdi eklerken

Hat belgesindeki "Öldürme ve rafa kaldırma" kuralı geçerli: puan < 70 ya da güçlü rakip bulunduğunda mekanik buraya
yazılır; neden ve geri getirecek kanıt boş bırakılmaz. Kaynak (araştırma dosyası, tarih, kullanılan sorgular) girdinin
yanına not edilir.
