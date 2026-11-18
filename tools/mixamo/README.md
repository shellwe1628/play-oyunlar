# Mixamo FBX → 2B kare dizisi

`fbx-kareler.mjs`, Mixamo'dan indirilen bir FBX animasyonunu saydam arka planlı tek bir PNG
şeridine ve yanında bir JSON dosyasına çevirir. Oyunlar 2B olduğu için FBX doğrudan
kullanılamaz; bu araç aradaki adımdır.

## Kullanım

Mixamo'dan **FBX, With Skin** olarak indirin (iskelet tek başına çizilemez), sonra depo kökünde:

```bash
node tools/mixamo/fbx-kareler.mjs indirilen/idle.fbx --ad idle
```

Çıktı: `games/okcu/public/anim/idle.png` ve `idle.json`.

| Seçenek | Varsayılan | Anlamı |
|---|---|---|
| `--ad` | (zorunlu) | Çıktı dosyalarının adı |
| `--cikti` | `games/okcu/public/anim` | Çıktı klasörü (depo köküne göre) |
| `--fps` | 12 | Saniyedeki kare sayısı |
| `--kare` | süre × fps | Kare sayısını doğrudan verir |
| `--boy` | 192 | Bir karenin piksel yüksekliği; genişlik animasyona göre hesaplanır |
| `--yon` | 90 | Karakterin dönüşü: 0 önden, 90 yandan (sağa bakar), -90 sola bakar |
| `--egim` | 0 | Kameranın yukarıdan bakış açısı (derece) |
| `--sutun` | 8 | Şeritteki sütun sayısı |
| `--yerinde` | 1 | 1: kök hareketi silinir (karakter yerinde kalır); 0: korunur |

JSON alanları: `frames`, `columns`, `rows`, `frameWidth`, `frameHeight`, `fps`, `duration`
(saniye) ve `groundFromBottom` (zemin çizgisinin karenin alt kenarından piksel uzaklığı).
Bütün kareler aynı çerçeveyi paylaşır, bu yüzden oynatırken karakter titremez.

Araç, depodaki Playwright'ın Chromium'unu kullanır. Başka bir Chromium için
`CHROMIUM_PATH` ortam değişkenini verin.

## Durum

Araç three.js'in örnek Mixamo dosyasıyla (`Samba Dancing.fbx`) denendi. Okçu oyununa henüz
hiçbir Mixamo animasyonu eklenmedi: animasyonlar ancak Adobe hesabıyla giriş yapılmış bir
bilgisayardan indirilebilir (bkz. `tools/mcp/README.md`).
