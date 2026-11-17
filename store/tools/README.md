# Mağaza listesi araçları (Google Play)

Her oyunun Play mağazası sayfasında görünen her şey — metinler, simge, tanıtım görseli (feature
graphic), telefon ekran görüntüleri ve Android uyarlanabilir (adaptive) simge katmanları — bu
klasördeki betiklerle üretilir. Çıktı fastlane'in Android düzenindedir:

```text
store/<slug>/
  listing.config.mjs                 çekimler, altyazılar, renkler, simge ve tanıtım ayarları
  icon/                              simge kaynakları (SVG) + adaptive katmanlar + README.md
  metadata/android/<en-US|tr-TR>/
    title.txt  short_description.txt  full_description.txt  changelogs/default.txt   (elle yazılır)
    images/icon.png  images/featureGraphic.png  images/phoneScreenshots/1.png … N.png (üretilir)
  .raw/<locale>/NN-<id>.png          ham 1440×2560 çekimler (git'e girmez, .gitignore)
```

## Oyun değişince her şeyi yeniden üret

```bash
node store/tools/all.mjs <slug>        # capture → compose → art → validate, sırayla
```

Tek tek adımlar:

| Komut | Ne yapar |
|---|---|
| `node store/tools/capture.mjs <slug> [--locale tr-TR] [--only id,id]` | Oyunu 2× çözünürlükte derler, oyunun kendi sim'iyle kayıt (save) hazırlar, her çekimi `?test=1` kancasıyla oynatır, ham görüntüyü `.raw/` içine yazar. |
| `node store/tools/compose.mjs <slug> [--locale …]` | Ham çekimleri 1080×1920 çerçeveye koyar: oyunun renginde arka plan, üstte o dilde altyazı. |
| `node store/tools/art.mjs <slug> [--only icon\|feature]` | Play simgesi (512), adaptive ön/arka/tek renk katmanlar (432), eski tip simge, SVG kaynaklar ve her dil için 1024×500 tanıtım görseli. |
| `node store/tools/validate.mjs <slug> [--text]` | Play kurallarını denetler (boyut, biçim, alfa, dosya boyutu, adet, metin uzunlukları, sıralama/fiyat iddiaları), tablo basar; hata varsa 1 ile çıkar. `--text` yalnızca metinler. |
| `node store/tools/new.mjs <slug>` | Yeni oyun için başlangıç `listing.config.mjs` ve boş metin dosyaları yazar. |

Gerekenler: depoda `npm install` yapılmış olmalı (Vite, Playwright, `@fontsource/nunito`);
Chromium Playwright ile gelir (`/opt/pw-browsers/chromium` yedek yol). `playwright install`
çalıştırmayın. Makine yavaşsa sorun değil: zaman sahte bir saatle (Playwright `page.clock`)
ilerletilir, her çekim aynı kareye düşer. Betikler açtıkları sunucu ve tarayıcıyı kapatır.

## Nasıl çalışır (değiştirirken bilin)

- **Gerçek oyun, net görüntü.** `lib/build.mjs` oyunu kendi `vite.config.ts`'iyle geçici bir
  klasöre derler; bellekte yalnızca çizim çözünürlüğünü 2 katına çıkaran bir yama uygular
  (kamera ×2 yakınlaştırma, yazılar ×2 çözünürlük). Oyun kuralları, yerleşim ve zamanlama
  aynıdır; `games/` ve `packages/` hiç değiştirilmez. Phaser veya core değişip yama noktası
  bulunamazsa derleme açık bir hata verir.
- **Siyah bant yok.** Görüntü 720×1280 mantıksal = 9:16 tam ekran alınır; çerçevede oyun
  yuvarlak köşeli bir kart olarak durur, kenarlar oyunun kendi renklerindeki arka plandır.
- **İlerleme gerçek kurallarla.** `stage()` kayıtları oyunun saf sim'iyle (`src/sim`) ve testlerin
  kullandığı betikli oyuncuyla üretir (ör. Fosil Şansı'nda pacing testinin "fast" oyuncusu); kayıt
  sayfa açılmadan `localStorage`'a yazılır. Ekranda görünen her durum oyunda oynayarak varılan bir
  durumdur.
- **Dil.** Her çekim `&lang=en` veya `&lang=tr` ile ayrı açılır; tr-TR görüntülerinde oyun Türkçe.
- **Yazı tipi.** Altyazı ve başlıklar oyunların kendi Nunito'su (OFL, `@fontsource/nunito`).
- **Simge ailesi.** Her oyun aynı çerçeveyi kullanır (oyunun renginde degrade, yumuşak parıltı,
  ince halka) ve tek bir kalın amblem (`lib/icons.mjs` → `EMBLEMS`): Fosil Şansı amonit,
  Sallanan Okçular yay ve ok, Kıvılcım zikzak izli kıvılcım.

## Çekimi değiştirmek

`store/<slug>/listing.config.mjs` → `shots`: her çekimin `id`'si, `save`'i (stage'den), iki dilde
`caption`'ı ve `run(g)` fonksiyonu vardır. `g.act(ad, veri)` oyunun test eylemini çağırır,
`g.run(ms, kare)` sahte saati ilerletir (her kare bir çizim), `g.until(fn)` koşul gerçekleşene
kadar ilerler, `g.data()` sahnenin `testState()`'ini döndürür. Sıra = ekran görüntüsü sırası
(önce ana eylem, sonra en heyecanlı an, gelişim, çeşitlilik, koleksiyon). 6–8 çekim olmalı.
Bir çekimi düzelttikten sonra: `capture.mjs <slug> --only <id>`, ardından `compose.mjs` ve
`validate.mjs`.

## Metinler

Metinleri elle düzenleyin (`metadata/android/<locale>/*.txt`, sonda satır sonu olmadan da olur).
Sınırlar: başlık 30, kısa açıklama 80, tam açıklama 4000, sürüm notu 500 karakter. Yalnızca
oyunda gerçekten olanı yazın (`games/<slug>/GAME.md` → "Built"); "en iyi", "#1", "ücretsiz",
ödül veya sahte yorum yok. Doğrulama: `node store/tools/validate.mjs <slug> --text`.
