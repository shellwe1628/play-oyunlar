# Tanıtım videoları (dikey, 1080×1920)

Her oyun için Türkçe ve İngilizce birer tanıtım videosu (Shorts / Reels / TikTok / Play tanıtım
videosu biçimi) bu klasördeki betiklerle **gerçek oyundan** üretilir. Çıktı:

```text
store/<slug>/video/
  promo-tr.mp4  promo-en.mp4      1080×1920, 30 fps, H.264 high + AAC 48 kHz, ~30–35 sn, ≤ 30 MB
  promo-tr.png  promo-en.png      kapak karesi (1080×1920, kapanış kartı)
  README.md                       her vuruşta ne görünüyor, nasıl çekildi, kaynaklar
```

## Oyun değişince yeniden üret

```bash
node store/tools/video/make.mjs <okcu|kivilcim|fosil>            # iki dil: kayıt + kurgu + ses + kodlama
node store/tools/video/make.mjs okcu --locale en                  # tek dil
node store/tools/video/make.mjs okcu --steps record --only boss   # yalnızca bir klibi yeniden çek
node store/tools/video/make.mjs okcu --steps edit                 # kayıtlar dursun, yalnızca kurgu/ses/kodlama
node store/tools/video/check.mjs okcu                             # ffprobe + ses yüksekliği + kontak tabakası
```

`--fresh` kayıt (save) hazırlığını yeniden yapar (yoksa geçici klasördeki önbellek kullanılır;
oyunun kuralları değiştiyse mutlaka `--fresh`). Ham kareler işletim sisteminin geçici klasöründe
durur (`%TEMP%/oyun-video/<slug>/<tr|en>/<klip>/`), depoya girmez. Bir video ~2–3 dakikada
kurgulanır; bir dilin kaydı makineye göre 3–10 dakika.

Gerekenler: `npm install` yapılmış depo (Vite, Playwright, `@fontsource/nunito`), ffmpeg
(PATH'te ya da winget'in `Gyan.FFmpeg` paketi; betik ikisini de bulur). Chromium gerçek GPU ile
açılır (Windows'ta ANGLE/D3D11); GPU yoksa yazılım çizimiyle de çalışır, yalnızca yavaştır.

## Nasıl çalışır

1. **Kayıt (`lib/record.mjs`, `games/<slug>.mjs` → `CLIPS`).** Oyun Playwright'ın sahte saatinde
   (`page.clock`) durdurulmuş açılır; her video karesi saatin 1/30 sn ilerletilmesidir ve her
   karede ekran görüntüsü alınır (JPEG). Makine yavaş olsa da her kare vardır ve iki çekim aynıdır.
   Ağır çekim malzemesi `density: 2` ile saniyede 60 kare çekilir. Saat yalnızca tam milisaniye
   adımlarla ilerler (Kıvılcım'ın dokunuş zamanlaması kesirli adımlarda kayıyordu).
   DOM animasyonları (3D okçunun arayüzü) gerçek saatle döndüğü için bir sürücü onları da sahte
   saate bağlar (`DOM_ANIMATION_DRIVER`). Her klibin `clip.json`'u karelerin oyun zamanını,
   adlandırılmış anları (`mark`: ör. `release`, `find`) ve oyunun ses olaylarını tutar.
   - **Sallanan Okçular** = yayımlanan 3D sürüm `apps/okcu-3d`. Kendi vite ayarıyla geçici klasöre
     derlenir; bellekte tek bir yama: `main.ts` zaten içe aktardığı oyun işlevlerini (aimbot
     `planShot` / `CAREFUL`, `canShoot`, `pickCard`, `unleash`, sürükleme sabitleri) test kancası
     `window.__okcu3d`'e de koyar. Kayıt `store/okcu/career.mjs` ile 2D oyunun kurallarıyla oynanan
     kariyerdir, `oyun:okcu-3d:save` anahtarına yazılır. Nişan vuruşları gerçek dokunmatik
     sürüklemedir (CDP touch); diğer atışları oyunun kendi betikli oyuncusu yapar; bölümlere
     bölüm seçiciyle (`game.startRun({chapter})`) gidilir, yol boyunca belgelenmiş çekim yardımı
     `god` (can = en yüksek = 1e6) oyuncuyu ayakta tutar.
   - **Kıvılcım** ve **Fosil Şansı**: mağaza araçlarının 2× çizim derlemesi ve `openGame`'i;
     kayıtlar ve uçuş çizgileri mağaza listesinin kendi `stage()`'inden (insan modeli / hızlı
     oyuncu). Kıvılcım uçuşları listenin `takeoff()`'u ile gerçek bas/bırak yolundan, tik tik;
     Fosil'de vuruşlar blok üzerine gerçek fare tıklamaları, sert damar gerçek basılı tutma.
2. **Kurgu (`lib/edit.mjs`, `games/<slug>.mjs` → `edit(lang)`).** Vuruş listesi: hangi klip,
   nereden (saniye, `[mark, kayma]` ya da `{auto:true}` = en hareketli pencere, `scoreEvent` ile),
   süre, hız rampası (`speed: [[t, hız], …]`), altyazı (`*kelime*` vurgulu), üst etiket,
   geçiş (`whip`, `punch`, `flash`, `zoom`). Süreler 0,5 sn'nin katıdır: müzik 120 BPM, kesmeler
   vuruşa düşer.
3. **Yönetmen sayfası (`lib/director.mjs`).** 1080×1920 bir HTML sayfası; `render(i)` i. kareyi
   saatsiz, belirlenimci kurar (klip karesi, Ken Burns itişi, geçişler, travma² sarsıntı,
   kelime kelime zıplayan altyazılar, kapanış kartı), Chromium ekran görüntüsü doğrudan ffmpeg'e
   akar. Önemli yazılar güvenli alanda: üst 220 px ve alt 300 px boş bırakılır.
4. **Ses (`lib/audio.mjs`).** Tümü kodla: Chromium'da `OfflineAudioContext`. Efektler çekirdeğin
   sentezleyicisi (`packages/core/src/audio/synth.ts` `createAudio`) ve oyunun kendi ön ayarları
   (`games/<slug>/src/sfx.ts`; Kıvılcım'ın `sfx.ts`'i yok, `GameScene.ts` içindeki ön ayarlar
   `games/kivilcim.sfx.ts`'e veri olarak kopyalandı) ile, kayıttaki oyun olaylarının video
   zamanında çalınır; geçişlere vınlama/darbe, kapanışa yükselen + darbe + `win`. Müzik oyuna göre
   küçük bir düzenleme (davul, bas, ped, arpej). İki iz ayrı ölçülür (EBU R128), karıştırılır,
   sıkıştırılır ve iki geçişli `loudnorm` ile **-14 LUFS**, gerçek tepe ≤ -1,5 dBTP yapılır.
5. **Kodlama (`lib/encode.mjs`).** libx264 high, yuv420p, 30 fps, CRF 19 + 5,2 Mb/s tavan,
   AAC 192 kb/s 48 kHz, `+faststart`.

## Kurallar

- Görünen her şey oyunda var ve oynanarak varılmış durumdur. "En iyi", "#1", fiyat, sahte yorum
  yok. Tek istisna: kapanıştaki **sıralama sistemi / liderlik tablosu**, açıkça "Yakında" /
  "Coming soon" damgasıyla; oyunlarda henüz yok. Kürsüde isim ya da puan yok.
- Altyazıyı değiştirmek: `games/<slug>.mjs` → `TXT`. Ardından `--steps edit` yeter.
- Bir klibi değiştirmek: `CLIPS` içindeki işlev, sonra `--steps record --only <id>` ve `--steps edit`.
- Bakmadan yayımlamayın: `check.mjs`'in kontak tabakasına ve geçiş karelerine bakın.
