# Oyun Üretim Sistemi — Tasarım Belgesi

Tarih: 2026-11-16 · Durum: yönetici kararıyla onaylı (kullanıcı tüm kararları devretti)

## 1. Niyet

CrazyGames'te talebi kanıtlanmış ama Play Store ve App Store'da karşılığı olmayan
ya da zayıf olan **mekanikleri** bulup, bunların etrafında **özgün** mobil oyunlar
üreten, tekrarlanabilir bir hat kurmak. Tek bir oyun değil, oyun çıkaran bir sistem.

Neden: mobil mağazalarda doğrudan rekabet pahalı; tarayıcı portalları ise hangi
mekaniğin tuttuğunu ücretsiz gösteren bir talep sinyali. Boşluğu veriyle bulup hızlı
ve ucuz üretmek, tek oyuna büyük bahis yapmaktan daha güvenli.

## 2. Hedefler, hedef olmayanlar, başarısızlık sayılacaklar

**Hedefler**
- Araştırmadan mağaza paketine kadar her aşaması tanımlı, kapıları otomatik
  denetlenen bir üretim hattı.
- Her oyunun aynı kod tabanından web (portal) + Android + iOS çıktısı vermesi.
- Yapım işlerinin alt agent'lara devredilebilmesi: her rolün görev tanımı ve hangi
  dil modeline verileceği yazılı.
- İlk partide oynanabilir dikey kesitler (vertical slice): çekirdek döngü, menü,
  kayıt, ses, his (juice), test.

**Hedef olmayanlar (şimdilik)**
- Mağazaya yükleme (hesap, imza anahtarı ve iOS için Mac gerekir; kullanıcıya ait).
- Çevrimiçi çok oyunculu, sunucu, hesap sistemi.
- Gerçek reklam entegrasyonu (reklam arayüzü hazır, sağlayıcı bağlanmadı) ve
  uygulama içi satın alma (arayüzü de henüz yok).

**Başarısızlık sayılacaklar**
- Var olan belirli bir oyunun kopyası (isim, karakter, görsel, seviye). Yalnızca
  mekanik/tür düzeyinde ilham alınır.
- Doğrulanmamış "boşluk" iddiasıyla oyun seçmek.
- Testi olmayan ya da tarayıcıda gerçekten oynatılmadan "bitti" denen oyun.

## 3. Yaklaşımlar

| Yaklaşım | Artı | Eksi |
|---|---|---|
| **A. Phaser 4 + TypeScript + Vite, mağaza için Capacitor** (seçilen) | Bu ortamda Playwright ile gerçekten oynatılıp doğrulanabilir; aynı derleme CrazyGames/Poki'ye de çıkar (mağaza öncesi ücretsiz talep testi); agent'lar TypeScript'te güçlü; 2D için performans yeterli | WebView içinde çalışır, yerel his biraz zayıf; iOS derlemesi Mac ister |
| B. Godot 4 | Yerel dışa aktarma, depoda çok Godot skili var | Motor ikilisi ve dışa aktarma şablonları bu ortamın ağ kurallarına takılıyor; agent'ın görsel doğrulaması zor; web çıktısı ağır (portal testi için kötü) |
| C. Unity | Mağaza ekosistemi en geniş | Bu ortamda çalıştırılamaz, lisans, agent'la doğrulanamaz |

Seçim A: sistemin asıl değeri "agent üretir, makine doğrular" döngüsü; bunu yalnızca
A bu ortamda uçtan uca sağlıyor. Web çıktısı ayrıca hattın 6. aşamasını (portalda
yumuşak lansman) mümkün kılıyor.

**Görsel ve ses varlıkları:** kodla çizilen vektör şekiller (Phaser Graphics → doku)
ve WebAudio ile sentezlenen sesler. Lisans riski sıfır, indirme yok, her oyuna
palet + şekil diliyle kimlik verilir. Yazı tipi: npm üzerinden OFL lisanslı font.
Ücretli üretken görsel araçları kullanıcı onayı olmadan kullanılmaz.

## 4. Üretim hattı

| # | Aşama | Çıktı | Kapı (geçme koşulu) |
|---|---|---|---|
| 0 | Sinyal | `tools/research/scrape.py` ile CrazyGames veri seti | Veri taze (≤ 30 gün) |
| 1 | Boşluk doğrulama | Mekanik başına mağaza kanıtı (`store.py`) | Rekabet YOK ya da ZAYIF, kanıtıyla |
| 2 | Konsept | `games/<slug>/GAME.md` (tek sayfa) + puan kartı | Puan ≥ 70/100 |
| 3 | Çekirdek döngü | `src/sim/` saf mantık + birim testleri | Testler yeşil, döngü 30 sn'de anlaşılır |
| 4 | Dikey kesit | Oynanabilir oyun: menü, oyun, sonuç, kayıt, ses, his | `npm run gate` yeşil |
| 5 | Bağımsız inceleme | Kodu yazmayan bir agent'ın incelemesi + oynanış testi | Engelleyici bulgu yok |
| 6 | Web yumuşak lansman | Portal derlemesi | İnsan kararı (hesap gerekir) |
| 7 | Mağaza paketi | Capacitor Android/iOS projesi | İnsan kararı (imza, Mac) |
| 8 | Canlı ölçüm | Tutunma/oturum verisi | Devam / durdur kararı |

Bu oturumda 0–5 uygulanır; 6–8 belgelenir.

### Puan kartı (aşama 2)

| Ölçüt | Ağırlık |
|---|---|
| Tarayıcı talebi (oy, puan, yenilik) | 25 |
| Mağaza boşluğu (kanıt gücüyle) | 25 |
| Telefona uygunluk (tek el, 2–5 dk oturum) | 15 |
| Tek geliştirici/agent ile yapılabilirlik | 15 |
| Tutundurma kancası (ilerleme, günlük dönüş) | 10 |
| Kodla çizilen görsellerle iyi görünme | 10 |

### `npm run gate` (aşama 4 kapısı)

Sırayla: tip denetimi → lint → birim testleri → üretim derlemesi → paket boyutu
bütçesi → tarayıcı duman testi (Playwright: `?test=1&seed=1` ile açılır, konsol
hatası yok, betikli bir oturum sonuç ekranına ulaşır, telefon boyutunda ekran
görüntüsü alınır).

## 5. Roller ve model ataması

| Rol | Model | Neden |
|---|---|---|
| Yönetici: yön, seçim, tasarım, son doğrulama | Fable | En pahalı muhakeme; kod yazmaz |
| Analist: veri + mağaza doğrulama | Opus | Yargı gerektirir, yanlış "boşluk" pahalı |
| Tasarımcı: konsept (`GAME.md`) ve puan kartı | Fable (devredilirse Opus) | Seçim ve yön kararı |
| Mimar: ortak çekirdek | Opus | Hata tüm oyunlara yayılır |
| Yapımcı: oyun dikey kesiti | Opus | Tasarım yorumu + his ayarı |
| İnceleyici / oynanış testçisi | Sonnet | Belirli denetim listesi, bağımsız göz |
| Mekanik işler: çeviri tabloları, veri dönüşümü | Haiku | Ucuz, yargı gerektirmez |

Kural: kodu yazan agent kendi işini onaylamaz; inceleme her zaman ayrı agent'tır.
Görev tanımları `docs/production/roles/` altında, İngilizce (model okur);
kullanıcıya dönük belgeler Türkçe.

## 6. Teknik mimari

```
play-oyunlar/
  package.json              npm workspaces: packages/*, games/*
  packages/core/            @oyun/core — tüm oyunların paylaştığı çekirdek
  templates/game/           yeni oyun iskeleti
  games/<slug>/             her oyun ayrı Vite uygulaması
    GAME.md                 tek sayfalık tasarım
    src/sim/                saf mantık (Phaser içe aktarmaz), birim testli
    src/scenes/             Phaser sahneleri (yalnızca çizim ve girdi)
    tests/unit, tests/e2e
    capacitor.config.ts
  tools/new-game.mjs        şablondan oyun üretir
  tools/research/           scrape.py, q.py, store.py
  tools/gate.mjs            kalite kapısı
  docs/production/          hat, roller, puan kartı, yayın listesi
  docs/research/            araştırma raporu
```

**`@oyun/core` içeriği**
- `createGame(config)`: Phaser 4 oyunu; 720×1280 mantıksal dikey tuval (yatay
  oyunlar 1280×720), `Scale.FIT`, güvenli alan boşlukları.
- Sahne akışı: `BootScene` (dokuları kodla üretir) → oyunun kendi sahneleri.
  Ortak `MenuScene`/`ResultScene` kabukları.
- `save`: sürümlü kayıt, geçiş (migration) zinciri, bozuk kayıtta güvenli sıfırlama;
  depolama bağdaştırıcısı (web `localStorage`, ileride Capacitor Preferences).
- `rng`: tohumlu rastgele sayı (test tekrarlanabilirliği).
- `audio`: WebAudio sentezleyici, hazır efektler (dokunma, para, vuruş, kazanma,
  kaybetme), müzik/efekt ses yolları, ilk dokunuşta kilit açma, sessize alma kaydı.
- `juice`: sarsıntı (trauma), vuruş duraklaması, zıplama tween'i, uçan yazı.
- `ui`: düğme, panel, ilerleme çubuğu, bildirim; en az 88 px dokunma hedefi.
- `i18n`: `tr` ve `en` sözlükleri, cihaz diline göre seçim.
- `platform`: `Platform` arayüzü — reklam (geçiş, ödüllü), titreşim, analitik
  olayı, duraklat/devam. Bağdaştırıcılar: `web` (boş), `crazygames`, `capacitor`.
  Oyun kodu sağlayıcıyı bilmez.
- `testhook`: yalnızca `?test=1` ile `window.__OYUN__ = { state(), act(), ready }`.
  Duman testleri oyunu piksel tıklamadan, durum üzerinden sürer.

**Kural:** oyun kuralları `src/sim/` içinde saf TypeScript; sahneler sim'i çağırır,
kendisi kural içermez. Böylece mantık tarayıcısız test edilir.

## 7. Yapımcıya bırakılanlar

Kitaplık alt sürümleri, lint kuralları, dosya içi adlandırma, test betiklerinin
ayrıntısı, CI iş adımları. Kısıt: `npm ci && npm run gate` temiz bir kopyada yeşil
olmalı; Playwright için ortamdaki hazır Chromium kullanılmalı (yeniden indirilmez).

## 8. Bilinen sınırlar

- Android/iOS derlemesi bu ortamda doğrulanamaz (Android SDK ve Xcode yok).
  Capacitor yapılandırması ve CI iş akışı yazılır ama "doğrulanmadı" olarak
  işaretlenir.
- Mağaza boşluğu kanıtı ABD mağaza aramalarına dayanır; diğer ülkeler ayrı bakılmalı.
- CrazyGames'teki oy sayısı talep göstergesidir, gelir göstergesi değildir.
