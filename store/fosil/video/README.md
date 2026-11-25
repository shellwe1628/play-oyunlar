# Fosil Şansı / Fossil Odds — tanıtım videoları

`promo-tr.mp4`, `promo-en.mp4` (1080×1920, 30 fps, H.264 + AAC, 32,5 sn) ve kapak kareleri
`promo-tr.png`, `promo-en.png`. Yeniden üretmek: `node store/tools/video/make.mjs fosil`
(ayrıntılar: `store/tools/video/README.md`). Kurgu ve altyazılar: `store/tools/video/games/fosil.mjs`.

## Vuruşlar

| Süre | Klip | Ne görünüyor | Nasıl çekildi |
|---|---|---|---|
| 0–3 sn | `dig` | Kehribar Ormanı'nda kazı: kazma darbeleri, kırıntılar, çatlaklar, kırılan bloklar | Blok üzerine gerçek fare tıklamaları, saniyede ~6,5 |
| 3–5,5 | `dig` | Bulgular ve basılı şansları ("10'da 1 · şans ×10") | Aynı klibin en hareketli penceresi |
| 5,5–10 | `grand` | Magma Bacaları'nda 15.000'de 1 bulgu: kararma, yakınlaşma, kart dönüşü, konfeti | Listedeki kayıt: 1 in 10.000+ bulgudan hemen önce; bekleyiş test kancasıyla zaman geçmeden dokunur (listedeki çekim gibi), vuruş bulgunun dokunuşundan başlar |
| 10–13 | `vein` | Kömür Bataklığı sert damarı: basılı tut (şarj halkası), bırak, parçala | Gerçek fare basılı tutma 0,9 sn |
| 13–16 | `fever` | Kombo ateşi (ATEŞ ×2), zincirler | Gerçek tıklamalar, saniyede 7,5 |
| 16–19 | `boss` | İlk Denizler patron bloğu, evreler | Patron bloğuna kadar test kancasıyla, sonra gerçek tıklamalar |
| 19–21 | `travel` | Katmanlar arası iniş animasyonu | `travel` eylemi |
| 21–23,5 | `museum` | Müze, katman sekmeleri, raflar, silüetler (şansları basılı) | `tab` eylemi |
| 23,5–25,5 | `ranks` | Rütbeler, puan dökümü | Rütbeler sahnesi |
| 25,5–27,5 | `ranks` | Sefer onay ekranı: neyin kalıp neyin sıfırlandığı | `expedition` eylemi |
| 27,5–32,5 | kapanış | Simge, ad, **"Yakında: sıralama sistemi!" / "Leaderboards coming soon!"** | Yönetmen sayfası (kod) |

Kayıtlar mağaza listesinin kendi `stage()`'inden: pacing testinin "hızlı" oyuncusu oyunun saf
sim'inde (`src/sim/dig.ts`) on katmanı kazar. Ekranda görünen her durum oynanarak varılmış durumdur.

## Kaynaklar

- Müzik ve sesler kodla üretildi (OfflineAudioContext; çekirdeğin sentezleyicisi ve
  `games/fosil/src/sfx.ts` ön ayarları: kazı, çatlak, çan, uzun çan, darbe, ateş, gong).
  İndirilen ses yok. Grafikler oyunun kendisi; altyazılar Nunito (OFL). Simge: `store/fosil/icon/icon.svg`.

## Dürüstlük

Gösterilen her şey oyunda var ("milyonda bir": İlk Denizler ve Magma Bacaları tablolarında
1.000.000'da 1 fosil var; ekranda görünen bulgu 15.000'de 1). **Sıralama sistemi / liderlik
tablosu oyunda henüz yok** (Rütbeler ekranı da "başka oyuncu gösterilmez" der); yalnızca
kapanışta "Yakında" / "Coming soon" damgasıyla duyurulur, kürsüde isim ya da puan yoktur.
