# Test imza anahtarı — HERKESE AÇIK, YALNIZ TEST İÇİN

`debug.keystore` **bilerek depoya konmuş, herkesin görebildiği** bir imza anahtarıdır. Yalnız
test APK'larını (`npm run apk`, `.github/workflows/test-apk.yml`) imzalar. **Google Play için
asla kullanılmaz, kullanılamaz.**

| | |
|---|---|
| Dosya | `tools/test-imza/debug.keystore` (PKCS12) |
| Takma ad (alias) | `androiddebugkey` |
| Parolalar | `android` (depo ve anahtar) |
| Sertifika | `CN=Android Debug, O=Android, C=US`, 2056'ya kadar geçerli |
| SHA-256 | `BD:03:C5:F1:66:FD:A1:A6:BD:14:71:C1:A7:87:BF:A8:43:80:E7:11:E3:2E:EE:60:92:05:F0:3A:E0:FB:8C:64` |

## Neden depoda?

Android bir güncellemeyi yalnız **kurulu uygulamayla aynı anahtarla imzalanmışsa** kurar. Test
APK'ları hem bu makinede hem GitHub Actions'ta derlenir; ikisinin de aynı anahtarla imzalaması
gerekir, sahibi hiçbir gizli bilgi (secret) ayarlamadan. Bu anahtar, sahibin telefonundaki
"Play Oyunlar Test" uygulamasını imzalayan debug anahtarının aynısıdır (bu makinenin
`~/.android/debug.keystore` dosyası), bu yüzden yeni test paketi eskisinin üzerine kurulur.

Android'in kendi debug anahtarı gibi bu da bir sır değildir: parolası `android`, herkes bilir.

## Riski

Anahtar herkese açık olduğu için **herkes bu anahtarla APK imzalayabilir**. Sonuçları:

- Birisi `com.playoyunlar.testpaketi` ya da `com.playoyunlar.*.test` kimlikli, bu anahtarla
  imzalı bir APK yapıp sahibine **elden** verirse, Android onu test uygulamasının güncellemesi
  sayar. Uygulamanın içindeki güncelleyici ise **yalnız** bu deponun `test-latest` sürümünden
  indirir (adres yerel kodda sabit) ve SHA-256'yı denetler; yani tehlike yalnız başka bir
  kaynaktan elle APK kurmakta. Test APK'larını yalnız uygulamanın kendisinden ya da bu deponun
  Releases sayfasından kurun.
- Test uygulamalarında kişisel veri yoktur (yalnız oyun kayıtları); izinleri: internet ve
  "uygulama yükleme" (yalnız kendi güncellemesi için).
- Bu anahtar **Play uygulamalarına hiçbir şey yapamaz**: Play kimlikleri
  (`com.playoyunlar.fossilodds`, `.sparkrise`, `.noodlearchers`) ayrı, gizli bir yükleme
  anahtarıyla imzalanır ve Google Play kendi uygulama imzalama anahtarını kullanır.

## Play yolunun bu anahtarı alamaması

- `tools/aab.mjs` imzayı yalnız ortam değişkenlerinden alır, depo içindeki anahtar dosyasını
  reddeder ve yükleme anahtarının SHA-256'sı bu anahtarınkiyle aynıysa (depo dışına kopyalanmış
  olsa bile) durur.
- `play-yukle.yml` anahtarı yalnız `PLAY_UPLOAD_KEYSTORE_BASE64` secret'ından çözer.
- `.gitignore` başka hiçbir `*.keystore` / `*.jks` / `*.p12` dosyasının depoya girmesine izin
  vermez (yalnız bu dosya istisna).

## Sonra gizli bir anahtara geçmek

1. Yeni anahtar üretin (depo dışında):
   `keytool -genkeypair -v -keystore test-yeni.p12 -storetype PKCS12 -alias test -keyalg RSA -keysize 2048 -validity 10000`
2. GitHub'da üç secret ekleyin: dosyanın base64'ü, parola, alias. `tools/apk.mjs`'i bu üç
   ortam değişkeninden okuyacak şekilde değiştirin (`tools/aab.mjs`'teki gibi), iş akışında
   secret'ı `$RUNNER_TEMP`'e çözün; yerelde aynı dosyayı kullanın.
3. **Telefondaki test uygulamalarını bir kez kaldırıp** yeni anahtarla imzalı APK'ları elle
   kurun: anahtar değişince Android güncellemeyi reddeder ("paket mevcut paketle çakışıyor").
   Test uygulamalarının kayıtları silinir.
4. Bu klasörü silin ve `.gitignore`'daki istisnayı kaldırın. Not: anahtar git geçmişinde kalır,
   o yüzden bir daha kullanılmamalı.
