# Mixamo MCP bağlantısı

Depo kökündeki `.mcp.json`, Claude Code'a `mixamo` adında bir MCP sunucusu tanıtır:
[V1xel/mixamo-mcp](https://github.com/V1xel/mixamo-mcp). Bu sunucu Mixamo sitesini bir
tarayıcıyla sürer: animasyon arar ve seçer, karakter dosyası (FBX / OBJ / ZIP) yükleyip
otomatik iskelet oluşturur, seçilen animasyonu FBX ya da Collada olarak indirir.

## Nerede çalışır, nerede çalışmaz

- **Kendi bilgisayarınızda çalışır.** İlk kullanımda görünür bir tarayıcı penceresi açılır ve
  Adobe hesabınızla Mixamo'ya giriş yapmanız gerekir; oturum sonra hatırlanır.
- **Bulut oturumlarında çalışmaz.** Orada ekran olmadığı için giriş yapılamaz, ayrıca Mixamo
  ve Adobe adresleri ağ kurallarının dışındadır. Bulut oturumunda `mixamo` sunucusu
  "bağlanamadı" olarak görünür; başka hiçbir şeyi etkilemez.

## Kurulum (bir kez, kendi bilgisayarınızda)

Gerekenler: Python 3.10 ya da üstü, Git.

```bash
bash tools/mcp/mixamo-kur.sh
```

Betik sunucuyu `tools/mcp/mixamo-mcp/` klasörüne indirir (bu klasör git'e girmez),
incelenen sürüme sabitler, Python bağımlılıklarını ve Playwright'ın Chromium'unu kurar.
Sonra Claude Code'u bu depoda yeniden başlatıp `mixamo` sunucusunu onaylayın.

Windows'ta `python` komutu yoksa `.mcp.json` içindeki `"command"` değerini `py` yapın;
macOS ve Linux'ta `python` yoksa `python3` yapın.

## Bilmeniz gerekenler

- **Bu depodaki oyunlar 2D'dir ve Mixamo'yu kullanmaz.** Mixamo 3D insan biçimli karakter
  animasyonu verir. Şu anki oyunların görselleri kodla çizilir; indirilen bir FBX dosyasını
  kullanacak bir yer yoktur. Bu bağlantı, ileride 3D bir oyun yapılırsa işe yarar.
- **Üçüncü taraf kod.** Sunucu tek kişinin yazdığı küçük bir projedir, lisans dosyası yoktur;
  bu yüzden kodu depoya kopyalanmadı, kurulum sırasında indirilir. 2026-11-17'de incelenen
  sürüm (`8bdb0a3`) yalnızca `mixamo.com` ile konuşuyor ve indirdiği dosyayı yalnızca
  istenen yola yazıyordu. Kurulum betiği o sürüme sabitlidir; yeni bir sürüme geçmeden önce
  koda yeniden bakılmalıdır.
- **Adobe hesabınızla otomasyon.** Araç, giriş yapmış tarayıcınızı sizin adınıza sürer.
  Mixamo'nun kullanım koşullarının otomatik araçlara izin verip vermediğini kontrol edin.
- **Mixamo içeriğinin lisansı.** İndirilen animasyonları bir oyunda kullanmadan önce
  Mixamo'nun güncel lisans koşullarını okuyun.
- Sunucu oturum bilgisini kendi klasöründeki `browser_profile/` içinde tutar. Bu klasör
  hesabınıza giriş anahtarı gibidir: kimseyle paylaşmayın, depoya eklemeyin.

## Kaldırmak

`.mcp.json` dosyasından `mixamo` girişini ve `tools/mcp/mixamo-mcp/` klasörünü silin.
