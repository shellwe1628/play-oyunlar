# İlk Parti Durumu

Tarih: 2026-11-16 · Dal: `claude/charming-bardeen-la6n4e`

Üç oyun hattın 0–5. aşamalarından geçti: dikey kesit oynanabilir, `npm run gate`
dört oyunda yeşil, her oyun bağımsız kod incelemesi ve oynanış testinden geçti,
bulunan engelleyiciler kapatıldı ve ayrı bir agent tarafından doğrulandı.
6–8. aşamalar (portal lansmanı, mağaza paketi, canlı ölçüm) başlamadı.

## Oyunlar

| Oyun | Klasör | Birim testi | Tarayıcı testi | İnceleme sonucu |
|---|---|---|---|---|
| Lantern Shift (Fener Nöbeti) | `games/fener` | 59 | 4 (ikisi yalnızca gerçek dokunmayla) | 1 engelleyici bulundu, kapatıldı, doğrulandı |
| Ink Tide (Mürekkep Seli) | `games/murekkep` | 71 | 2 (biri gerçek dokunma ve sürükleme) | Kodda engelleyici yok; zorluk ve öğretme yeniden yapıldı |
| Fossil Odds (Fosil Şansı) | `games/fosil` | 75 | 2 (biri yalnızca gerçek dokunmayla) | 3 engelleyici bulundu, kapatıldı, doğrulandı |

Ortak çekirdek (`packages/core`): 117 birim testi. İncelemelerin çekirdeğe kadar
izlediği dört kusur düzeltildi: duraklatma menüsünün oyunun altında çizilmesi,
bildirimlerin üst göstergeleri örtmesi, otomasyon altında oyun zamanının yavaş
akması, "yeni rekor" bildiriminin puan başlığını örtmesi.

## Doğrulamanın kanıtı

- **Lantern Shift:** bildirilemeyen anomali hatası için bağımsız tarama — 2.590
  nöbet, 108.387 dokunma denetimi, sıfır kaçak; 159 (kamera, nesne, tür)
  çiftinin tamamı görüldü. Günün nöbeti farklı oynayışlarda aynı çizelgeyi veriyor.
- **Fossil Odds:** katman başına 3.000.000 atışta 48 fosilin tamamı yazılı
  olasılığına uyuyor (en büyük sapma 2,52 σ). Dokunuş, parıltı, yardımcı ve
  çevrimdışı atışlarda gösterilen şans ile uygulanan şans arasında fark yok.
- **Ink Tide:** 96 maçta her adımda mürekkep korunumu; ~24.000 üretilmiş haritada
  kopuk kara ya da yersiz başlangıç yok; botlar oyuncuyla aynı kurallarla oynuyor.

## Bilinen açıklar

**Hiçbir oyun gerçek telefonda çalıştırılmadı.** Aşağıdakiler bu yüzden bilinmiyor:
kare hızı (bu ortam ekran kartı olmadan çiziyor), ses seviyeleri (sesleri kimse
dinlemedi), titreşim, 3× ekranlarda yazı netliği.

| Oyun | Açık |
|---|---|
| Lantern Shift | Zorluk yalnızca simüle oyuncuyla ayarlandı; 1. gece insanlar için kolay olabilir. 3–7. geceler insan gözüyle oynanmadı. |
| Ink Tide | 4. sayfada sert eşik: mürekkebini hiç biriktirmeyen oyuncu 1–3'ü %100, 4 ve sonrasını %0 kazanıyor. Sabırlı oyuncu 5. sayfada %65, 8. sayfada %42. 4–8. sayfalar ve Blot gücü insan tarafından oynanmadı. Kâğıt dokusunun telefondaki hesap süresi ölçülmedi. |
| Fossil Odds | Sıradan oyuncu 40 dakikada 4. katmana ulaşamıyor ve çoğu denemede 10.000'de 1 ya da daha nadir fosil görmüyor. Müze etiketleri çekirdeğin önerdiği boyutun altında (27–31 px, öneri 34). Birleştirme animasyonu ile bildirim aynı banda denk gelirse kısa süre üst üste binebilir. |
| Hepsi | Reklam sağlayıcısı bağlı değil; ödüllü reklam web'de her zaman "verildi" döner. Uygulama içi satın alma arayüzü yok. Analitik olayları hiçbir yere gitmiyor. Android derlemesi hiç yapılmadı, iOS için iş akışı yok. |

## Sıradaki adımlar

1. Üç oyunu gerçek bir Android telefonda açıp kare hızı, ses ve dokunma hissine
   bakmak (`npm run dev -w games/<slug>` ve aynı ağdan telefonla bağlanmak, ya da
   `android.yml` iş akışını ilk kez çalıştırmak).
2. Birkaç gerçek kişiye oynatıp ilk 5 dakikayı izlemek; özellikle Ink Tide'ın
   4. sayfası ve Lantern Shift'in 1. gecesi.
3. Web portalına yumuşak lansman (aşama 6): `docs/production/yayin-listesi.md`.
4. Yedekteki iki mekanik için aynı hattı çalıştırmak: `docs/production/backlog.md`.
