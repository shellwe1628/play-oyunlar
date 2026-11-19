# Sallanan Okçular / Noodle Archers — tanıtım videoları

`promo-tr.mp4`, `promo-en.mp4` (1080×1920, 30 fps, H.264 + AAC, 34 sn) ve kapak kareleri
`promo-tr.png`, `promo-en.png`. Yeniden üretmek: `node store/tools/video/make.mjs okcu`
(ayrıntılar: `store/tools/video/README.md`). Kurgu ve altyazılar: `store/tools/video/games/okcu.mjs`.

Görüntü yayımlanan **3D sürümden** (`apps/okcu-3d`), gerçek oyundan, kare kare çekildi.

## Vuruşlar

| Süre | Klip | Ne görünüyor | Nasıl çekildi |
|---|---|---|---|
| 0–1,5 sn | `aim` | Geri çekme, noktalı atış yayı | Gerçek dokunmatik sürükleme (CDP touch), hedef oyunun kendi aimbot'unun (`planShot`, CAREFUL) çözümü; Bölüm 1 |
| 1,5–4 | `aim` | Bırakış, kafadan vuruş, oyunun kendi ağır çekimi ve yakınlaşması, ragdoll düşüş | Aynı sürükleme; kafadan nakavt gelene kadar deneme tekrarlanır |
| 4–7 | `ragdoll` | Rakipler platformdan uçar, fıçı patlar ("KABUM!") | Betikli oyuncu (CAREFUL) Bölüm 1'in 5.–6. aşaması |
| 7–11 | `world0…3` | Dört dünya: çayır, kar, çöl, gece (1'er sn, flaş geçiş) | Bölüm seçiciyle (`game.startRun({chapter})`) her bölüm, 2. aşamada oynanır |
| 11–13,5 | `swing` | İplere asılı sallanan adalar | Çöl, 6. aşama (dalga 20) |
| 13,5–16,5 | `boss` | Patron, "ZAYIF NOKTA" vuruşu, patron nakavtı | Kar bölümü patronu (dalga 14), +14 yay |
| 16,5–18,5 | `bonus` | Bonus turu ("Elma yağmuru") | Patronun ardından gelen bonus turu, aynı oyun |
| 18,5–21 | `cards` | Kart seçimi ekranı, kartların gelişi | Aşama sonu kart seçimi (oyuncu 2,6 sn sonra seçer) |
| 21–24,5 | `forge` | Demircide +19 → +20, "BAŞARILI!", gökkuşağı parıltısı | +20'ye ulaşan denemeden hemen önceki kayıt; düğmeye gerçek tıklama; tohumlanmış zar oyunun kendisi |
| 24,5–27 | `glow` | +20 yay gökkuşağı parıltısıyla, can geliştirmelerinden gelen zırh | Gece bölümü, gerçek sürükleme |
| 27–29 | `ranks` | Rütbeler ekranı (merdiven, puan dökümü) | Başlıktaki Rütbeler düğmesine tıklama |
| 29–34 | kapanış | Simge, ad, **"Yakında: sıralama sistemi!" / "Leaderboards coming soon!"** | Yönetmen sayfası (kod) |

Kayıtlar: `store/okcu/career.mjs` — 2D oyunun kurallarıyla (aynı sim, `games/okcu/src/sim`)
CAREFUL betikli oyuncunun oynadığı bir kariyer; yay oyunun kendi `attemptForge`'u ile dövülür.
3D sürümün anahtarına (`oyun:okcu-3d:save`) sayfa açılmadan yazılır. Patron ve sonraki bölümler
yolunda belgelenmiş çekim yardımı `god` (oyuncunun canı = en yüksek = 1e6) kullanıldı; HUD can
çubuğu dolu görünür. Çekim derlemesinde tek bellek içi yama: `main.ts` zaten içe aktardığı oyun
işlevlerini test kancasına koyar (kaynak dosyalar değişmez).

## Kaynaklar

- Tüm müzik ve sesler kodla üretildi (OfflineAudioContext; çekirdeğin sentezleyicisi ve
  `games/okcu/src/sfx.ts` ön ayarları, oyundaki olay → ses eşlemesiyle). İndirilen ses yok.
- Grafikler oyunun kendisi; okçu karakteri Mixamo'nun "Erika Archer" karakteri ve animasyonları
  (`apps/okcu-3d/public/assets`, Mixamo lisans koşulları geçerli). Altyazılar Nunito (OFL).
- Simge: `store/okcu/icon/icon.svg`.

## Dürüstlük

Gösterilen her şey oyunda var. **Sıralama sistemi / liderlik tablosu oyunda henüz yok**;
videoda yalnızca kapanışta "Yakında" / "Coming soon" damgasıyla duyurulur, kürsüde isim ya da
puan yoktur. "En iyi", "#1", fiyat ya da yorum iddiası yok.
