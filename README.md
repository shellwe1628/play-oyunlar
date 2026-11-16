# play-oyunlar

CrazyGames'te talebi görünen ama mobil mağazalarda karşılığı olmayan ya da zayıf olan
mekanikleri bulup, her biri için özgün, küçük bir mobil oyun üreten bir üretim hattı.
Oyunlar Phaser 4 + TypeScript + Vite ile yazılır; aynı kod tabanından web (portal)
derlemesi çıkar, Android/iOS için Capacitor sarmalayıcısı hazırdır (doğrulanmadı, aşağıya bak).
Görseller kodla çizilir, sesler WebAudio ile üretilir; indirilmiş varlık yoktur.

## Klasörler

| Yol | Ne |
|---|---|
| `packages/core/` | `@oyun/core`: tüm oyunların ortak çekirdeği (açılış, sahne kabukları, kayıt, ses, his, arayüz, dil, `platform` arayüzü, test kancası). Sözleşme: `packages/core/README.md` |
| `templates/game/` | Yeni oyun iskeleti (küçük, çalışan bir referans oyun) |
| `games/<slug>/` | Her oyun ayrı bir Vite uygulaması. `games/ornek` şablonun değiştirilmemiş çıktısıdır, elle düzenlenmez |
| `tools/` | `gate.mjs` (kalite kapısı), `new-game.mjs` (oyun üretir), `research/` (CrazyGames veri çekme ve mağaza arama) |
| `docs/superpowers/specs/` | Üretim sisteminin onaylı tasarım belgesi |
| `docs/research/` | Boşluk araştırma raporu ve veri anlık görüntüsü |
| `docs/production/` | İşletme belgeleri: `hat.md`, `backlog.md`, `yayin-listesi.md`, `concepts/`, `roles/` |
| `.github/workflows/` | `ci.yml` (her push'ta `npm run gate`), `android.yml` (elle tetiklenen debug APK, hiç çalışmadı) |

## Beş komut

Gereken: Node >= 22.12, Python 3 (yalnızca araştırma araçları için).

```text
npm ci                                              # kurulum
npm run dev -w games/<slug>                         # oyunu yerelde çalıştır (http://localhost:5173)
npm run gate -- <slug>                              # kalite kapısı: çekirdek + bu oyun (slug'sız: hepsi)
npm run new-game -- <slug> "<Başlık>" [portrait|landscape]   # yeni oyun iskeleti, npm install çalıştırır
cd tools/research && python3 scrape.py              # CrazyGames verisini yenile (~1,5 dk)
```

Kapının tarayıcı adımı Chromium ister. Bu ortamda hazır geliyor; başka makinede
`npx playwright install chromium` gerekebilir (CI bunu kendisi yapar).
`new-game` aynı anda tek kişi/agent tarafından çalıştırılmalı (`package-lock.json` değişir).

## Nerede ne var

- Üretim hattının aşamaları ve komutları: `docs/production/hat.md`
- Tasarım belgesi: `docs/superpowers/specs/2026-11-16-uretim-sistemi-design.md`
- Araştırma raporu: `docs/research/2026-11-16-crazygames-bosluk-raporu.md`
- Onaylı üç konsept: `docs/production/concepts/` (`fener`, `murekkep`, `fosil`); oyun klasörleri `games/` altında
- Rafa kalkan fikirler: `docs/production/backlog.md`
- Yayın kontrol listesi: `docs/production/yayin-listesi.md`
- Alt agent görev tanımları (İngilizce): `docs/production/roles/`

## Doğrulanmayanlar

- **Android ve iOS derlemeleri hiç çalıştırılmadı.** Bu ortamda Android SDK ve Xcode yok.
  `npx cap add android` ve `npx cap sync android` çalıştı; Gradle derlemesi ve `android.yml` hiç çalışmadı.
  iOS için iş akışı yok, Mac gerekir.
- **Reklam ve uygulama içi satın alma sağlayıcısı bağlı değil.** `platform` arayüzünde yalnızca
  geçiş ve ödüllü reklam var; Capacitor bağdaştırıcısı ikisi için de `'unavailable'` döner.
  Satın alma için arayüzde bir yöntem yok. CrazyGames bağdaştırıcısı belgeye bakılarak yazılmış, canlıda denenmemiş bir taslak.
- Mağaza boşluğu kanıtları yalnızca ABD mağaza aramalarına dayanır.
- Canlı ölçüm (tutunma, oturum) için henüz bir veri kaynağı yok: analitik olayları şu an hiçbir yere gitmiyor.
