# Durum

Tarih: 2026-11-18 · Dal: `claude/charming-bardeen-la6n4e`

## Yayındaki üç oyun

İlk partideki üç oyundan yalnızca Fossil Odds beğenildi. Yavaş bulunan iki oyun
(Lantern Shift, Ink Tide) `archive/` altına kaldırıldı; yerlerine CrazyGames
tarzında iki hızlı oyun yapıldı. Üçü de görsel ve içerik turlarından geçti.

| Oyun | Klasör | Tür | İçerik | Birim testi |
|---|---|---|---|---|
| Fossil Odds (Fosil Şansı) | `games/fosil` | Koleksiyon / tıklama | 10 katman, seferler, 12 rütbe, günlük kazı, hedefler | 118 |
| Noodle Archers (Sallanan Okçular) | `games/okcu` | Ragdoll okçuluk | 4 bölüm × 7 aşama, patronlar, +20'ye kadar dövülen ve seviyesine göre parlayan yay, 12 rütbe | 131 |
| Sparkrise (Kıvılcım) | `games/kivilcim` | Tek dokunuş refleks | 4 dünyada 40 bölüm, elmasla alınan 22 iz, yıldızlar, 12 rütbe | 156 |

Ortak çekirdek (`packages/core`): 118 birim testi. `npm run gate` tüm oyunlarda
yeşil (son tam koşu `7b312f1` üzerinde).

Rütbe sistemleri kişiseldir: oyuncunun kendi ilerlemesinden hesaplanır, sunucu ve
sahte oyuncu yoktur. Çevrimiçi sıralama için Play Games Services gerekir; yapılmadı.

## Test APK'ları

- `npm run apk -- all` dört APK üretir: toplu paket ve oyun başına birer tane.
- `.github/workflows/test-apk.yml` bunları `test-latest` sürümüne yükler. Uygulama
  açılışta bu sürüme bakar, yenisi varsa bildirim gösterir, dokununca indirip kurar.
- Dal `main` ile birleşene kadar iş akışı elle tetiklenir.

## Google Play

Hazır olanlar: imzalı AAB üretimi (`npm run aab -- <slug>`), yükleme iş akışı
(`.github/workflows/play-yukle.yml`), üç oyunun TR ve EN mağaza metinleri, simgeleri,
tanıtım görselleri ve ekran görüntüleri (`store/`), gizlilik sayfaları
(`docs/gizlilik/`). Adımlar: `docs/production/play-yayin.md`.

Yükleme iş akışı hiç çalıştırılmadı. Hesap sahibinin yapması gerekenler: Play
Console'da üç uygulamayı oluşturmak, dört depo sırrını eklemek, GitHub Pages'i
açmak, Console formlarını doldurmak.

## Bilinen açıklar

- **Hiçbir oyun gerçek telefonda doğrulanmadı:** kare hızı, ses seviyeleri,
  titreşim, geri tuşu ve güncelleme akışının indirme, izin ve kurulum adımları.
- Reklam sağlayıcısı bağlı değil; test derlemelerinde ödüller anında verilir.
  Uygulama içi satın alma yok. Analitik olayları hiçbir yere gitmiyor.
- iOS için iş akışı yok.
- Mixamo MCP yalnızca kullanıcının kendi bilgisayarında çalışır ve 3B içindir;
  oyunların 2B, kodla çizilen görsellerinde kullanılmadı.
