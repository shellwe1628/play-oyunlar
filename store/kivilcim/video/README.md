# Kıvılcım / Sparkrise — tanıtım videoları

`promo-tr.mp4`, `promo-en.mp4` (1080×1920, 30 fps, H.264 + AAC, 33 sn) ve kapak kareleri
`promo-tr.png`, `promo-en.png`. Yeniden üretmek: `node store/tools/video/make.mjs kivilcim`
(ayrıntılar: `store/tools/video/README.md`). Kurgu ve altyazılar: `store/tools/video/games/kivilcim.mjs`.

## Vuruşlar

| Süre | Klip | Ne görünüyor | Nasıl çekildi |
|---|---|---|---|
| 0–2,5 sn | `mirror` | Bölüm 34, ayna ikiz, prizma izi; "Bas: sağa uç" | Listenin `takeoff()`'u: çözücünün "rahat" çizgisi, oyunun gerçek bas/bırak yolu (`hold`), tik tik |
| 2,5–5 | `wind` | Bölüm 21, rüzgâr; "Bırak: sola dön" | Aynı yöntem |
| 5–7,5 | `spin` | Bölüm 16, pervaneler, elmaslar, akış | Aynı yöntem |
| 7,5–12,5 | `lasers`, `split`, `pistons`, `portals`, `dark` | 1'er sn: lazerler (13), ayrık yollar (11), pistonlar (23), portallar (31), karanlık bölüm (26) | Liste dışındaki bölümlerin çizgisi `store/kivilcim/career.mjs` `gemLine`/`replay` ile |
| 12,5–15,5 | `boss` | Bölüm 30, Fırtına Gözü patronu, can çubuğu, lazerler | Aynı yöntem |
| 15,5–18,5 | `death` | Gerçek çarpma: parmak kalkar ve kalkık kalır, kıvılcım duvara çarpar, parçalanma (ağır çekim), ölüm kartı, dokunuşla anında yeniden başlama | 60 kare/sn kayıt, kurguda 0,4× rampa |
| 18,5–21,5 | `finish` | Bölüm 20 patron finali: BİTİŞ, halka patlaması, konfeti, %100 | 60 kare/sn, yavaşlayan bitiş |
| 21,5–24 | `shop` | İz mağazası, canlı önizleme, üç iz | Mağaza sahnesinin test eylemleri (`select`) |
| 24–26 | `levels` | Bölüm seçimi, dört dünya, yıldızlar | `world` eylemi |
| 26–28 | `ranks` | Rütbeler, puan, rekorlar | Başlıktaki Rütbeler kutucuğu |
| 28–33 | kapanış | Simge, ad, **"Yakında: sıralama sistemi!" / "Leaderboards coming soon!"** | Yönetmen sayfası (kod) |

Kayıt (save) ve çizgiler mağaza listesinin kendi `stage()`'inden: insan modeli 40 bölümü sırayla
dener, her deneme kaydedilir, `settle()` yıldız/başarım/kazanılan izleri verir, izler `buySkin`
ile alınır. Ekranda görünen her durum oynanarak varılmış durumdur.

## Kaynaklar

- Müzik ve sesler kodla üretildi (OfflineAudioContext). Efektler çekirdeğin sentezleyicisi ile
  çalınan çekirdek ön ayarları (`coin`, `win`, `pop`) ve `GameScene.ts` içindeki ön ayarların
  veri kopyası (`store/tools/video/games/kivilcim.sfx.ts`: çarpma, kapı, bitiş halkası, kıl payı).
  İndirilen ses yok. Grafikler oyunun kendisi; altyazılar Nunito (OFL). Simge: `store/kivilcim/icon/icon.svg`.

## Dürüstlük

Gösterilen her şey oyunda var. **Sıralama sistemi / liderlik tablosu oyunda henüz yok**; yalnızca
kapanışta "Yakında" / "Coming soon" damgasıyla duyurulur, kürsüde isim ya da puan yoktur.
